import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { assertDatabaseHealthy } from './health';

export type EchoDatabase = Database.Database;

export const createDatabase = (databasePath: string): EchoDatabase => {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
    assertDatabaseHealthy(databasePath);
  }

  const database = new Database(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  runMigrations(database);

  return database;
};
