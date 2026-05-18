import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

export type DatabaseHealthStatus = 'ok' | 'corrupt' | 'unreadable';

export type DatabaseHealthResult = {
  status: DatabaseHealthStatus;
  databasePath: string;
  checkedAt: string;
  message?: string;
  detail?: string;
};

export class DatabaseHealthError extends Error {
  constructor(readonly health: DatabaseHealthResult) {
    super(health.message ?? `Database health check failed: ${health.status}`);
    this.name = 'DatabaseHealthError';
  }
}

const SQLITE_CORRUPTION_PATTERN = /database disk image is malformed|database disk image malformed|SQLITE_CORRUPT|file is not a database/i;

const nowIso = (): string => new Date().toISOString();

const ok = (databasePath: string, message?: string): DatabaseHealthResult => ({
  status: 'ok',
  databasePath,
  checkedAt: nowIso(),
  ...(message ? { message } : {}),
});

const failed = (databasePath: string, error: unknown): DatabaseHealthResult => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: SQLITE_CORRUPTION_PATTERN.test(message) ? 'corrupt' : 'unreadable',
    databasePath,
    checkedAt: nowIso(),
    message,
  };
};

export const isDatabaseHealthy = (health: DatabaseHealthResult): boolean => health.status === 'ok';

export const checkDatabaseHealth = (
  databasePath: string,
  mode: 'quick' | 'integrity' = 'quick',
): DatabaseHealthResult => {
  if (databasePath === ':memory:') {
    return ok(databasePath, 'in-memory database');
  }

  if (!existsSync(databasePath)) {
    return ok(databasePath, 'database does not exist yet');
  }

  let database: Database.Database | null = null;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    const pragma = mode === 'integrity' ? 'integrity_check' : 'quick_check';
    const rows = database.prepare<[], { [key: string]: string }>(`PRAGMA ${pragma}`).all();
    const detail = rows.map((row) => String(Object.values(row)[0] ?? '')).filter(Boolean).join('\n');

    if (detail === 'ok') {
      return ok(databasePath);
    }

    return {
      status: 'corrupt',
      databasePath,
      checkedAt: nowIso(),
      message: `${pragma} failed`,
      detail,
    };
  } catch (error) {
    return failed(databasePath, error);
  } finally {
    try {
      database?.close();
    } catch {
      // Ignore close failures while reporting the original health result.
    }
  }
};

export const assertDatabaseHealthy = (databasePath: string): void => {
  const health = checkDatabaseHealth(databasePath, 'quick');
  if (!isDatabaseHealthy(health)) {
    throw new DatabaseHealthError(health);
  }
};

export const checkpointWal = (databasePath: string): DatabaseHealthResult => {
  if (databasePath === ':memory:' || !existsSync(databasePath)) {
    return ok(databasePath, 'database does not exist yet');
  }

  let database: Database.Database | null = null;
  try {
    database = new Database(databasePath, { fileMustExist: true });
    database.pragma('wal_checkpoint(TRUNCATE)');
    return ok(databasePath);
  } catch (error) {
    return failed(databasePath, error);
  } finally {
    try {
      database?.close();
    } catch {
      // Ignore close failures while reporting the checkpoint result.
    }
  }
};
