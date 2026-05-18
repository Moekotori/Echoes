import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDataProtectionSnapshot,
  ensureDataProtection,
  getProtectedUserDataPath,
  initializeProtectedUserDataPath,
  migrateLegacyProtectedData,
  restoreMissingProtectedData,
  writeDataProtectionManifest,
} from './dataProtection';

vi.mock('electron', () => ({
  app: {
    getName: () => 'ECHO NEXT',
    getPath: (name: string) => (name === 'appData' ? tmpdir() : tmpdir()),
    getVersion: () => '26.5.16-test',
    setPath: vi.fn(),
  },
}));

const readText = (path: string): string => readFileSync(path, 'utf8');

const createHealthyLibrary = (path: string): void => {
  const database = new Database(path);
  database.exec('CREATE TABLE tracks (id TEXT PRIMARY KEY, title TEXT)');
  database.prepare('INSERT INTO tracks (id, title) VALUES (?, ?)').run('track-1', 'Song');
  database.close();
};

describe('dataProtection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'echo-data-protection-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('pins userData to a stable appData folder', () => {
    const calls: Array<[string, string]> = [];
    const fakeApp = {
      getPath: (name: string) => (name === 'appData' ? tempDir : join(tempDir, 'Wrong Product Name')),
      setPath: (name: string, value: string) => calls.push([name, value]),
    };

    expect(getProtectedUserDataPath(fakeApp)).toBe(join(tempDir, 'ECHO NEXT'));
    expect(initializeProtectedUserDataPath(fakeApp)).toBe(join(tempDir, 'ECHO NEXT'));
    expect(calls).toEqual([['userData', join(tempDir, 'ECHO NEXT')]]);
  });

  it('restores missing settings and library files from the latest snapshot without overwriting existing data', async () => {
    const settingsPath = join(tempDir, 'echo-settings.json');
    const libraryPath = join(tempDir, 'echo-library.sqlite');
    writeFileSync(settingsPath, '{"theme":"dark"}\n', 'utf8');
    writeFileSync(libraryPath, 'library-v1', 'utf8');

    const snapshot = await createDataProtectionSnapshot('startup', tempDir, new Date('2026-05-16T00:00:00.000Z'));
    expect(snapshot.copied).toEqual(expect.arrayContaining(['echo-settings.json', 'echo-library.sqlite']));

    writeFileSync(settingsPath, '{"theme":"light"}\n', 'utf8');
    rmSync(libraryPath);

    const restore = restoreMissingProtectedData(tempDir);

    expect(restore.restored).toEqual(['echo-library.sqlite']);
    expect(readText(settingsPath)).toBe('{"theme":"light"}\n');
    expect(readText(libraryPath)).toBe('library-v1');
  });

  it('migrates stronger legacy echo-next data over a fresh protected directory', async () => {
    const targetDir = join(tempDir, 'ECHO NEXT');
    const legacyDir = join(tempDir, 'echo-next');
    const targetLibraryPath = join(targetDir, 'echo-library.sqlite');
    const legacyLibraryPath = join(legacyDir, 'echo-library.sqlite');

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(targetDir, 'echo-settings.json'), '{"theme":"fresh"}\n', { encoding: 'utf8', flag: 'w' });
    writeFileSync(targetLibraryPath, Buffer.alloc(512 * 1024));
    writeFileSync(join(legacyDir, 'echo-settings.json'), '{"theme":"old"}\n', { encoding: 'utf8', flag: 'w' });
    writeFileSync(legacyLibraryPath, Buffer.alloc(2 * 1024 * 1024));

    const migration = await migrateLegacyProtectedData(targetDir, [legacyDir]);

    expect(migration.sourcePath).toBe(legacyDir);
    expect(migration.migrated).toEqual(expect.arrayContaining(['echo-settings.json', 'echo-library.sqlite']));
    expect(readText(join(targetDir, 'echo-settings.json'))).toBe('{"theme":"old"}\n');
    expect(readFileSync(targetLibraryPath).length).toBe(2 * 1024 * 1024);
    expect(existsSync(join(targetDir, 'data-protection', 'snapshots'))).toBe(true);
  });

  it('migrates legacy settings and account data even when the old library is small', async () => {
    const targetDir = join(tempDir, 'ECHO NEXT');
    const legacyDir = join(tempDir, 'echo-next');

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(targetDir, 'echo-settings.json'), '{"theme":"fresh"}\n', 'utf8');
    writeFileSync(join(targetDir, 'echo-library.sqlite'), Buffer.alloc(256 * 1024));
    writeFileSync(join(legacyDir, 'echo-settings.json'), '{"theme":"custom"}\n', 'utf8');
    writeFileSync(join(legacyDir, 'echo-library.sqlite'), Buffer.alloc(320 * 1024));
    writeFileSync(join(legacyDir, 'accounts.json'), '{"providers":["spotify"]}\n', 'utf8');
    writeFileSync(join(legacyDir, 'eq-presets.json'), '{"presets":["my-eq"]}\n', 'utf8');

    const migration = await migrateLegacyProtectedData(targetDir, [legacyDir]);

    expect(migration.sourcePath).toBe(legacyDir);
    expect(migration.migrated).toEqual(expect.arrayContaining(['echo-settings.json', 'accounts.json', 'eq-presets.json']));
    expect(readText(join(targetDir, 'echo-settings.json'))).toBe('{"theme":"custom"}\n');
    expect(readText(join(targetDir, 'accounts.json'))).toContain('spotify');
  });

  it('does not replace an actively used protected directory with weaker legacy data', async () => {
    const targetDir = join(tempDir, 'ECHO NEXT');
    const legacyDir = join(tempDir, 'echo-next');

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(targetDir, 'echo-settings.json'), '{"theme":"current"}\n', 'utf8');
    writeFileSync(join(targetDir, 'echo-library.sqlite'), Buffer.alloc(4 * 1024 * 1024));
    writeFileSync(join(targetDir, 'accounts.json'), '{"providers":["current"]}\n', 'utf8');
    writeFileSync(join(legacyDir, 'echo-settings.json'), '{"theme":"old"}\n', 'utf8');
    writeFileSync(join(legacyDir, 'echo-library.sqlite'), Buffer.alloc(256 * 1024));

    const migration = await migrateLegacyProtectedData(targetDir, [legacyDir]);

    expect(migration.sourcePath).toBeNull();
    expect(readText(join(targetDir, 'echo-settings.json'))).toBe('{"theme":"current"}\n');
    expect(readText(join(targetDir, 'accounts.json'))).toContain('current');
  });

  it('writes a manifest that lists protected user data entries', () => {
    writeDataProtectionManifest(tempDir);

    const manifestPath = join(tempDir, 'data-protection', 'echo-data-protection.json');
    const manifest = JSON.parse(readText(manifestPath)) as {
      protectedUserDataPath: string;
      protectedEntries: Array<{ name: string; path: string }>;
    };

    expect(existsSync(manifestPath)).toBe(true);
    expect(manifest.protectedUserDataPath).toBe(tempDir);
    expect(manifest.protectedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'echo-settings.json', path: settingsPathFor(tempDir, 'echo-settings.json') }),
        expect.objectContaining({ name: 'echo-library.sqlite', path: settingsPathFor(tempDir, 'echo-library.sqlite') }),
      ]),
    );
  });

  it('creates a SQLite-backed healthy snapshot manifest', async () => {
    createHealthyLibrary(join(tempDir, 'echo-library.sqlite'));

    const snapshot = await createDataProtectionSnapshot('startup', tempDir, new Date('2026-05-17T00:00:00.000Z'));
    const manifest = JSON.parse(readText(join(snapshot.snapshotPath, 'snapshot.json'))) as {
      libraryHealth: { status: string };
      libraryBackupMethod: string;
    };

    expect(snapshot.libraryHealth.status).toBe('ok');
    expect(snapshot.libraryBackupMethod).toBe('sqlite-backup');
    expect(manifest.libraryHealth.status).toBe('ok');
    expect(manifest.libraryBackupMethod).toBe('sqlite-backup');
  });

  it('archives a corrupt library and restores the latest healthy snapshot', async () => {
    createHealthyLibrary(join(tempDir, 'echo-library.sqlite'));
    const healthySnapshot = await createDataProtectionSnapshot('startup', tempDir, new Date('2026-05-17T00:00:00.000Z'));
    writeFileSync(join(tempDir, 'echo-library.sqlite'), 'not sqlite', 'utf8');

    const result = await ensureDataProtection('startup', tempDir);

    expect(result.recovery.action).toBe('restored');
    expect(result.recovery.sourceSnapshotPath).toBe(healthySnapshot.snapshotPath);
    expect(result.libraryHealth.status).toBe('ok');
    expect(existsSync(join(tempDir, 'data-protection', 'corrupt-archives'))).toBe(true);
  });

  it('skips corrupt snapshots and restores an older healthy snapshot', async () => {
    createHealthyLibrary(join(tempDir, 'echo-library.sqlite'));
    const healthySnapshot = await createDataProtectionSnapshot('startup', tempDir, new Date('2026-05-17T00:00:00.000Z'));
    writeFileSync(join(tempDir, 'echo-library.sqlite'), 'bad newer snapshot', 'utf8');
    const corruptSnapshot = await createDataProtectionSnapshot('startup', tempDir, new Date('2026-05-18T00:00:00.000Z'));
    writeFileSync(join(tempDir, 'echo-library.sqlite'), 'bad current database', 'utf8');

    const result = await ensureDataProtection('startup', tempDir);

    expect(result.recovery.action).toBe('restored');
    expect(result.recovery.sourceSnapshotPath).toBe(healthySnapshot.snapshotPath);
    expect(result.recovery.sourceSnapshotPath).not.toBe(corruptSnapshot.snapshotPath);
  });

  it('quarantines a corrupt library when no healthy snapshot exists', async () => {
    writeFileSync(join(tempDir, 'echo-library.sqlite'), 'bad current database', 'utf8');

    const result = await ensureDataProtection('startup', tempDir);

    expect(result.recovery.action).toBe('quarantined');
    expect(result.libraryHealth.status).not.toBe('ok');
    expect(readText(join(tempDir, 'echo-library.sqlite'))).toBe('bad current database');
  });
});

const settingsPathFor = (root: string, name: string): string => join(root, name);
