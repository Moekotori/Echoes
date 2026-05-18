import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from './createDatabase';
import { checkDatabaseHealth, DatabaseHealthError } from './health';

describe('database health', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'echo-db-health-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('passes quick_check for a healthy SQLite database before migrations', () => {
    const databasePath = join(root, 'library.sqlite');
    const database = new Database(databasePath);
    database.exec('CREATE TABLE sample (id TEXT PRIMARY KEY)');
    database.close();

    expect(checkDatabaseHealth(databasePath).status).toBe('ok');
    const opened = createDatabase(databasePath);
    expect(opened.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tracks'").get()).toBeTruthy();
    opened.close();
  });

  it('does not run migrations when the database is malformed', () => {
    const databasePath = join(root, 'library.sqlite');
    writeFileSync(databasePath, 'not sqlite', 'utf8');

    expect(checkDatabaseHealth(databasePath).status).toBe('corrupt');
    expect(() => createDatabase(databasePath)).toThrow(DatabaseHealthError);
  });
});
