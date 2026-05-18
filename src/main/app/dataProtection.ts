import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import {
  checkDatabaseHealth,
  checkpointWal,
  type DatabaseHealthResult,
} from '../database/health';

type DataProtectionReason = 'startup' | 'update-install';
type ProtectedEntryKind = 'file' | 'directory';

type ProtectedEntry = {
  name: string;
  kind: ProtectedEntryKind;
};

type SnapshotResult = {
  snapshotPath: string;
  copied: string[];
  skipped: string[];
  libraryHealth: DatabaseHealthResult;
  libraryBackupMethod: 'none' | 'sqlite-backup' | 'file-copy';
};

type RestoreResult = {
  restored: string[];
  skipped: string[];
};

type LegacyMigrationResult = {
  sourcePath: string | null;
  migrated: string[];
  skipped: string[];
};

export type LibraryRecoveryResult = {
  action: 'none' | 'restored' | 'quarantined' | 'failed';
  sourceSnapshotPath?: string;
  archivePath?: string;
  health: DatabaseHealthResult;
};

export type DataProtectionResult = {
  userDataPath: string;
  migration: LegacyMigrationResult;
  snapshot: SnapshotResult;
  restore: RestoreResult;
  libraryHealth: DatabaseHealthResult;
  recovery: LibraryRecoveryResult;
};

export class LibraryDatabaseUnavailableError extends Error {
  constructor(readonly recovery: LibraryRecoveryResult | null = lastDataProtectionResult?.recovery ?? null) {
    super(
      recovery?.action === 'quarantined' || recovery?.action === 'failed'
        ? '音乐库数据库需要修复。ECHO Next 已保留原始库文件,请导出诊断或重新扫描曲库。'
        : '音乐库数据库暂时不可用。请稍后重试或导出诊断。',
    );
    this.name = 'LibraryDatabaseUnavailableError';
  }
}

type UserDataScore = {
  path: string;
  score: number;
  protectedFiles: number;
  librarySize: number;
  hasSettings: boolean;
};

type ElectronPathName = Parameters<typeof app.getPath>[0];

type ElectronAppLike = {
  getName?: () => string;
  getPath: (name: ElectronPathName) => string;
  getVersion?: () => string;
  setPath?: (name: ElectronPathName, path: string) => void;
};

const protectedUserDataFolderName = 'ECHO NEXT';
const legacyUserDataFolderNames = ['echo-next', 'ECHO Next', 'ECHO'];
const dataProtectionDirectoryName = 'data-protection';
const snapshotDirectoryName = 'snapshots';
const corruptArchivesDirectoryName = 'corrupt-archives';
const manifestFileName = 'echo-data-protection.json';
const maxSnapshots = 5;
const libraryFileName = 'echo-library.sqlite';
const libraryWalFileName = `${libraryFileName}-wal`;
const libraryShmFileName = `${libraryFileName}-shm`;
const libraryEntryNames = new Set([libraryFileName, libraryWalFileName, libraryShmFileName]);

export const protectedDataEntries: ProtectedEntry[] = [
  { name: 'echo-settings.json', kind: 'file' },
  { name: 'echo-library.sqlite', kind: 'file' },
  { name: 'echo-library.sqlite-wal', kind: 'file' },
  { name: 'echo-library.sqlite-shm', kind: 'file' },
  { name: 'accounts.json', kind: 'file' },
  { name: 'echo-download-settings.json', kind: 'file' },
  { name: 'echo-playback-memory.json', kind: 'file' },
  { name: 'eq-presets.json', kind: 'file' },
  { name: 'app-wallpapers', kind: 'directory' },
  { name: 'lyrics-wallpapers', kind: 'directory' },
];

const timestampForPath = (date = new Date()): string => date.toISOString().replace(/[:.]/g, '-');

const safeReadJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const getProtectedUserDataPath = (electronApp: ElectronAppLike = app): string => {
  const appDataPath = electronApp.getPath('appData');
  return join(appDataPath, protectedUserDataFolderName);
};

export const initializeProtectedUserDataPath = (electronApp: ElectronAppLike = app): string => {
  const protectedUserDataPath = getProtectedUserDataPath(electronApp);
  mkdirSync(protectedUserDataPath, { recursive: true });

  if (electronApp.setPath && electronApp.getPath('userData') !== protectedUserDataPath) {
    electronApp.setPath('userData', protectedUserDataPath);
  }

  return protectedUserDataPath;
};

const getDataProtectionPath = (userDataPath: string): string => join(userDataPath, dataProtectionDirectoryName);
const getSnapshotsPath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), snapshotDirectoryName);
const getCorruptArchivesPath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), corruptArchivesDirectoryName);
const getLegacyUserDataPaths = (electronApp: ElectronAppLike = app): string[] => {
  const appDataPath = electronApp.getPath('appData');
  const protectedPath = getProtectedUserDataPath(electronApp).toLocaleLowerCase();

  return legacyUserDataFolderNames
    .map((folderName) => join(appDataPath, folderName))
    .filter((legacyPath, index, paths) => legacyPath.toLocaleLowerCase() !== protectedPath && paths.indexOf(legacyPath) === index);
};

const copyProtectedEntry = (sourcePath: string, targetPath: string, kind: ProtectedEntryKind): void => {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (kind === 'directory') {
    cpSync(sourcePath, targetPath, { recursive: true, force: true, errorOnExist: false });
  } else {
    copyFileSync(sourcePath, targetPath);
  }
};

const listSnapshotPaths = (userDataPath: string): string[] => {
  const snapshotsPath = getSnapshotsPath(userDataPath);
  if (!existsSync(snapshotsPath)) {
    return [];
  }

  return readdirSync(snapshotsPath)
    .map((entry) => join(snapshotsPath, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
};

const pruneOldSnapshots = (userDataPath: string): void => {
  for (const snapshotPath of listSnapshotPaths(userDataPath).slice(maxSnapshots)) {
    rmSync(snapshotPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
};

const libraryPathFor = (rootPath: string): string => join(rootPath, libraryFileName);
const libraryWalPathFor = (rootPath: string): string => join(rootPath, libraryWalFileName);
const libraryShmPathFor = (rootPath: string): string => join(rootPath, libraryShmFileName);

const copyLibraryTriplet = (sourceRoot: string, targetRoot: string): string[] => {
  const copied: string[] = [];
  for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
    const sourcePath = join(sourceRoot, name);
    if (!existsSync(sourcePath)) {
      continue;
    }
    try {
      copyProtectedEntry(sourcePath, join(targetRoot, name), 'file');
      copied.push(name);
    } catch {
      // A failed archive/snapshot copy should not block the rest of startup.
    }
  }
  return copied;
};

const removeLibraryTriplet = (rootPath: string): void => {
  for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
    rmSync(join(rootPath, name), { force: true, maxRetries: 3, retryDelay: 50 });
  }
};

const sqliteBackup = async (sourcePath: string, targetPath: string): Promise<void> => {
  mkdirSync(dirname(targetPath), { recursive: true });
  rmSync(targetPath, { force: true, maxRetries: 3, retryDelay: 50 });
  const database = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await database.backup(targetPath);
  } finally {
    database.close();
  }
};

const readSnapshotManifest = (snapshotPath: string): { libraryHealth?: DatabaseHealthResult } | null =>
  safeReadJson<{ libraryHealth?: DatabaseHealthResult }>(join(snapshotPath, 'snapshot.json'));

const snapshotHasHealthyLibrary = (snapshotPath: string): boolean => {
  if (!existsSync(libraryPathFor(snapshotPath))) {
    return false;
  }

  const manifestHealth = readSnapshotManifest(snapshotPath)?.libraryHealth;
  if (manifestHealth && manifestHealth.status !== 'ok') {
    return false;
  }

  return checkDatabaseHealth(libraryPathFor(snapshotPath)).status === 'ok';
};

const findHealthyLibrarySnapshot = (userDataPath: string): string | null =>
  listSnapshotPaths(userDataPath).find(snapshotHasHealthyLibrary) ?? null;

const archiveLibraryTriplet = (userDataPath: string, reason: string, date = new Date()): string | null => {
  if (!existsSync(libraryPathFor(userDataPath)) && !existsSync(libraryWalPathFor(userDataPath)) && !existsSync(libraryShmPathFor(userDataPath))) {
    return null;
  }

  const archivePath = join(getCorruptArchivesPath(userDataPath), `${timestampForPath(date)}-${reason}`);
  mkdirSync(archivePath, { recursive: true });
  const copied = copyLibraryTriplet(userDataPath, archivePath);
  writeFileSync(
    join(archivePath, 'archive.json'),
    `${JSON.stringify({ formatVersion: 1, reason, createdAt: date.toISOString(), copied }, null, 2)}\n`,
    'utf8',
  );
  return archivePath;
};

const fileSize = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const directoryEntryCount = (path: string): number => {
  try {
    return statSync(path).isDirectory() ? readdirSync(path).length : 0;
  } catch {
    return 0;
  }
};

const scoreUserDataPath = (userDataPath: string): UserDataScore => {
  const librarySize = fileSize(join(userDataPath, 'echo-library.sqlite'));
  const hasSettings = existsSync(join(userDataPath, 'echo-settings.json'));
  let protectedFiles = 0;
  let score = Math.min(50, Math.floor(librarySize / (512 * 1024)));

  for (const entry of protectedDataEntries) {
    const entryPath = join(userDataPath, entry.name);
    if (!existsSync(entryPath)) {
      continue;
    }

    protectedFiles += 1;
    score += entry.kind === 'directory' ? Math.min(4, directoryEntryCount(entryPath)) : 4;
  }

  if (librarySize > 0 && librarySize < 1024 * 1024) {
    score += 3;
  }

  return { path: userDataPath, score, protectedFiles, librarySize, hasSettings };
};

const shouldMigrateLegacyUserData = (source: UserDataScore, target: UserDataScore): boolean => {
  if (source.protectedFiles === 0 || (!source.hasSettings && source.librarySize === 0)) {
    return false;
  }

  const targetLooksFresh =
    target.protectedFiles === 0 ||
    (target.librarySize > 0 && target.librarySize < 1024 * 1024 && target.score <= 16) ||
    (target.hasSettings && target.librarySize === 0 && target.score <= 8);

  if (targetLooksFresh && source.score > target.score) {
    return true;
  }

  const sourceHasMuchLargerLibrary = source.librarySize > 0 && (target.librarySize === 0 || source.librarySize > Math.max(1024 * 1024, target.librarySize * 2));
  return sourceHasMuchLargerLibrary && source.score >= target.score;
};

const findBestLegacyUserDataPath = (targetUserDataPath: string, legacyUserDataPaths = getLegacyUserDataPaths()): string | null => {
  const target = scoreUserDataPath(targetUserDataPath);
  const candidates = legacyUserDataPaths
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => scoreUserDataPath(candidate))
    .filter((candidate) => candidate.protectedFiles > 0)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  if (!best || !shouldMigrateLegacyUserData(best, target)) {
    return null;
  }

  return best.path;
};

export const migrateLegacyProtectedData = async (
  targetUserDataPath = app.getPath('userData'),
  legacyUserDataPaths = getLegacyUserDataPaths(),
): Promise<LegacyMigrationResult> => {
  const sourcePath = findBestLegacyUserDataPath(targetUserDataPath, legacyUserDataPaths);
  const migrated: string[] = [];
  const skipped: string[] = [];

  if (!sourcePath) {
    return { sourcePath: null, migrated, skipped: protectedDataEntries.map((entry) => entry.name) };
  }

  await createDataProtectionSnapshot('startup', targetUserDataPath);

  for (const entry of protectedDataEntries) {
    const sourceEntryPath = join(sourcePath, entry.name);
    if (!existsSync(sourceEntryPath)) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(sourceEntryPath, join(targetUserDataPath, entry.name), entry.kind);
      migrated.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  return { sourcePath, migrated, skipped };
};

export const createDataProtectionSnapshot = async (
  reason: DataProtectionReason,
  userDataPath = app.getPath('userData'),
  date = new Date(),
): Promise<SnapshotResult> => {
  const snapshotsPath = getSnapshotsPath(userDataPath);
  const snapshotPath = join(snapshotsPath, `${timestampForPath(date)}-${reason}`);
  const copied: string[] = [];
  const skipped: string[] = [];
  let libraryBackupMethod: SnapshotResult['libraryBackupMethod'] = 'none';
  let libraryHealth = checkDatabaseHealth(libraryPathFor(userDataPath));

  mkdirSync(snapshotPath, { recursive: true });

  if (existsSync(libraryPathFor(userDataPath))) {
    const snapshotLibraryPath = libraryPathFor(snapshotPath);
    if (libraryHealth.status === 'ok') {
      try {
        await sqliteBackup(libraryPathFor(userDataPath), snapshotLibraryPath);
        const snapshotHealth = checkDatabaseHealth(snapshotLibraryPath);
        if (snapshotHealth.status === 'ok') {
          copied.push(libraryFileName);
          skipped.push(libraryWalFileName, libraryShmFileName);
          libraryBackupMethod = 'sqlite-backup';
          libraryHealth = snapshotHealth;
        } else {
          rmSync(snapshotLibraryPath, { force: true, maxRetries: 3, retryDelay: 50 });
          libraryHealth = snapshotHealth;
        }
      } catch {
        rmSync(snapshotLibraryPath, { force: true, maxRetries: 3, retryDelay: 50 });
      }
    }

    if (libraryBackupMethod !== 'sqlite-backup') {
      const copiedLibraryEntries = copyLibraryTriplet(userDataPath, snapshotPath);
      copied.push(...copiedLibraryEntries);
      for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
        if (!copiedLibraryEntries.includes(name)) {
          skipped.push(name);
        }
      }
      libraryBackupMethod = copiedLibraryEntries.length > 0 ? 'file-copy' : 'none';
      libraryHealth = checkDatabaseHealth(libraryPathFor(snapshotPath));
    }
  } else {
    skipped.push(libraryFileName, libraryWalFileName, libraryShmFileName);
  }

  for (const entry of protectedDataEntries) {
    if (libraryEntryNames.has(entry.name)) {
      continue;
    }

    const sourcePath = join(userDataPath, entry.name);
    if (!existsSync(sourcePath)) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(sourcePath, join(snapshotPath, entry.name), entry.kind);
      copied.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  writeFileSync(
    join(snapshotPath, 'snapshot.json'),
    `${JSON.stringify(
      {
        formatVersion: 1,
        reason,
        createdAt: date.toISOString(),
        copied,
        skipped,
        libraryHealth,
        libraryBackupMethod,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  pruneOldSnapshots(userDataPath);

  return { snapshotPath, copied, skipped, libraryHealth, libraryBackupMethod };
};

export const restoreMissingProtectedData = (userDataPath = app.getPath('userData')): RestoreResult => {
  const restored: string[] = [];
  const skipped: string[] = [];
  const snapshotPaths = listSnapshotPaths(userDataPath);

  for (const entry of protectedDataEntries) {
    const targetPath = join(userDataPath, entry.name);
    if (existsSync(targetPath)) {
      skipped.push(entry.name);
      continue;
    }

    const snapshotPath = snapshotPaths.find((candidate) => existsSync(join(candidate, entry.name)));
    if (!snapshotPath) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(join(snapshotPath, entry.name), targetPath, entry.kind);
      restored.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  return { restored, skipped };
};

export const writeDataProtectionManifest = (userDataPath = app.getPath('userData')): void => {
  const protectionPath = getDataProtectionPath(userDataPath);
  const existing = safeReadJson<{ firstProtectedAt?: string }>(join(protectionPath, manifestFileName));
  const now = new Date().toISOString();

  mkdirSync(protectionPath, { recursive: true });
  writeFileSync(
    join(protectionPath, manifestFileName),
    `${JSON.stringify(
      {
        formatVersion: 1,
        appName: typeof app.getName === 'function' ? app.getName() : 'ECHO NEXT',
        appVersion: typeof app.getVersion === 'function' ? app.getVersion() : null,
        protectedUserDataPath: userDataPath,
        protectedEntries: protectedDataEntries.map((entry) => ({ ...entry, path: join(userDataPath, entry.name) })),
        firstProtectedAt: existing?.firstProtectedAt ?? now,
        lastVerifiedAt: now,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
};

const restoreLibraryFromSnapshot = (userDataPath: string, snapshotPath: string): void => {
  removeLibraryTriplet(userDataPath);
  copyProtectedEntry(libraryPathFor(snapshotPath), libraryPathFor(userDataPath), 'file');
  if (existsSync(libraryWalPathFor(snapshotPath))) {
    copyProtectedEntry(libraryWalPathFor(snapshotPath), libraryWalPathFor(userDataPath), 'file');
  }
  if (existsSync(libraryShmPathFor(snapshotPath))) {
    copyProtectedEntry(libraryShmPathFor(snapshotPath), libraryShmPathFor(userDataPath), 'file');
  }
};

const recoverLibraryFromSnapshots = (userDataPath: string, currentHealth: DatabaseHealthResult): LibraryRecoveryResult => {
  if (currentHealth.status === 'ok') {
    return { action: 'none', health: currentHealth };
  }

  const archivePath = archiveLibraryTriplet(userDataPath, 'startup-corrupt-library') ?? undefined;
  const snapshotPath = findHealthyLibrarySnapshot(userDataPath);

  if (!snapshotPath) {
    return { action: 'quarantined', archivePath, health: currentHealth };
  }

  try {
    restoreLibraryFromSnapshot(userDataPath, snapshotPath);
    const restoredHealth = checkDatabaseHealth(libraryPathFor(userDataPath));
    if (restoredHealth.status === 'ok') {
      return { action: 'restored', archivePath, sourceSnapshotPath: snapshotPath, health: restoredHealth };
    }
    return { action: 'failed', archivePath, sourceSnapshotPath: snapshotPath, health: restoredHealth };
  } catch (error) {
    return {
      action: 'failed',
      archivePath,
      sourceSnapshotPath: snapshotPath,
      health: {
        status: 'unreadable',
        databasePath: libraryPathFor(userDataPath),
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

let lastDataProtectionResult: DataProtectionResult | null = null;

export const getLastDataProtectionResult = (): DataProtectionResult | null => lastDataProtectionResult;

export const isProtectedLibraryAvailable = (): boolean => !lastDataProtectionResult || lastDataProtectionResult.libraryHealth.status === 'ok';

export const assertProtectedLibraryAvailable = (): void => {
  if (!isProtectedLibraryAvailable()) {
    throw new LibraryDatabaseUnavailableError(lastDataProtectionResult?.recovery ?? null);
  }
};

export const ensureDataProtection = async (
  reason: DataProtectionReason = 'startup',
  explicitUserDataPath?: string,
): Promise<DataProtectionResult> => {
  const userDataPath = explicitUserDataPath ?? initializeProtectedUserDataPath();
  try {
    const migration = await migrateLegacyProtectedData(userDataPath);
    const restore = restoreMissingProtectedData(userDataPath);
    writeDataProtectionManifest(userDataPath);
    const initialHealth = checkDatabaseHealth(libraryPathFor(userDataPath));
    const recovery = recoverLibraryFromSnapshots(userDataPath, initialHealth);
    const libraryHealth = recovery.action === 'restored' ? recovery.health : checkDatabaseHealth(libraryPathFor(userDataPath));
    const snapshot = await createDataProtectionSnapshot(reason, userDataPath);

    if (migration.migrated.length > 0) {
      console.info(`[data-protection] migrated protected data from ${migration.sourcePath}: ${migration.migrated.map((entry) => basename(entry)).join(', ')}`);
    }

    if (restore.restored.length > 0) {
      console.info(`[data-protection] restored protected data: ${restore.restored.map((entry) => basename(entry)).join(', ')}`);
    }

    if (recovery.action === 'restored') {
      console.info(`[data-protection] restored library database from snapshot ${recovery.sourceSnapshotPath}`);
    } else if (recovery.action === 'quarantined' || recovery.action === 'failed') {
      console.warn(`[data-protection] library database recovery ${recovery.action}: ${recovery.health.message ?? recovery.health.status}`);
    }

    lastDataProtectionResult = { userDataPath, migration, snapshot, restore, libraryHealth, recovery };
    return lastDataProtectionResult;
  } catch (error) {
    const health: DatabaseHealthResult = {
      status: 'unreadable',
      databasePath: libraryPathFor(userDataPath),
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    const recovery: LibraryRecoveryResult = { action: 'failed', health };
    const emptySnapshot: SnapshotResult = {
      snapshotPath: '',
      copied: [],
      skipped: protectedDataEntries.map((entry) => entry.name),
      libraryHealth: health,
      libraryBackupMethod: 'none',
    };
    lastDataProtectionResult = {
      userDataPath,
      migration: { sourcePath: null, migrated: [], skipped: protectedDataEntries.map((entry) => entry.name) },
      restore: { restored: [], skipped: protectedDataEntries.map((entry) => entry.name) },
      snapshot: emptySnapshot,
      libraryHealth: health,
      recovery,
    };
    console.warn(`[data-protection] startup protection failed: ${health.message ?? health.status}`);
    return lastDataProtectionResult;
  }
};

export const checkpointProtectedLibrary = (userDataPath = app.getPath('userData')): DatabaseHealthResult =>
  checkpointWal(libraryPathFor(userDataPath));
