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

const SQLITE_CORRUPTION_PATTERN =
  /database disk image is malformed|database disk image malformed|malformed database schema|SQLITE_CORRUPT|file is not a database/i;

const nowIso = (): string => new Date().toISOString();

export const isSqliteCorruptionMessage = (message: string): boolean => SQLITE_CORRUPTION_PATTERN.test(message);

const ok = (databasePath: string, message?: string): DatabaseHealthResult => ({
  status: 'ok',
  databasePath,
  checkedAt: nowIso(),
  ...(message ? { message } : {}),
});

const failed = (databasePath: string, error: unknown): DatabaseHealthResult => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: isSqliteCorruptionMessage(message) ? 'corrupt' : 'unreadable',
    databasePath,
    checkedAt: nowIso(),
    message,
  };
};

const readPragmaDetail = (database: Database.Database, pragma: 'quick_check' | 'integrity_check'): string => {
  const rows = database.prepare<[], { [key: string]: string }>(`PRAGMA ${pragma}`).all();
  return rows.map((row) => String(Object.values(row)[0] ?? '')).filter(Boolean).join('\n');
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
    const detail = readPragmaDetail(database, pragma);

    if (detail === 'ok') {
      return ok(databasePath);
    }

    if (mode === 'quick') {
      const integrityDetail = readPragmaDetail(database, 'integrity_check');
      if (integrityDetail === 'ok') {
        return ok(databasePath, 'quick_check was not confirmed by integrity_check');
      }

      return {
        status: 'corrupt',
        databasePath,
        checkedAt: nowIso(),
        message: 'quick_check failed; integrity_check confirmed corruption',
        detail: integrityDetail || detail,
      };
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
