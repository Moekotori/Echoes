import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { AppCacheInventory, AppCacheInventoryItem, AppCacheKind } from '../../shared/types/coverCache';
import { getAppSettings } from './appSettings';
import { LibraryDatabaseUnavailableError } from './dataProtection';
import { getLibraryService } from '../library/LibraryService';

export type CachePathStats = {
  sizeBytes: number;
  fileCount: number;
  lastError: string | null;
};

const emptyCacheStats = (): CachePathStats => ({
  sizeBytes: 0,
  fileCount: 0,
  lastError: null,
});

export const readCachePathStats = (targetPath: string): CachePathStats => {
  if (!existsSync(targetPath)) {
    return emptyCacheStats();
  }

  try {
    const stat = statSync(targetPath);
    if (stat.isFile()) {
      return {
        sizeBytes: stat.size,
        fileCount: 1,
        lastError: null,
      };
    }

    if (!stat.isDirectory()) {
      return emptyCacheStats();
    }

    let sizeBytes = 0;
    let fileCount = 0;
    let lastError: string | null = null;
    const walk = (directory: string): void => {
      let entries;
      try {
        entries = readdirSync(directory, { withFileTypes: true });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        return;
      }

      for (const entry of entries) {
        const entryPath = join(directory, entry.name);
        try {
          if (entry.isDirectory()) {
            walk(entryPath);
            continue;
          }
          if (!entry.isFile()) {
            continue;
          }
          const entryStat = statSync(entryPath);
          sizeBytes += entryStat.size;
          fileCount += 1;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    };

    walk(targetPath);
    return {
      sizeBytes,
      fileCount,
      lastError,
    };
  } catch (error) {
    return {
      sizeBytes: 0,
      fileCount: 0,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
};

const createCacheInventoryItem = (
  kind: AppCacheKind,
  label: string,
  targetPath: string,
  movable: boolean,
  reason: string,
): AppCacheInventoryItem => {
  const stats = readCachePathStats(targetPath);
  return {
    kind,
    label,
    path: targetPath,
    sizeBytes: stats.sizeBytes,
    fileCount: stats.fileCount,
    movable,
    reason,
    lastError: stats.lastError,
  };
};

export const getAppCacheInventory = (userDataPath: string): AppCacheInventory => {
  let databasePath = join(userDataPath, 'echo-library.sqlite');
  const configuredCoverCacheDir = getAppSettings().coverCacheDir;
  let coverCacheDir = typeof configuredCoverCacheDir === 'string' && configuredCoverCacheDir.trim()
    ? resolve(configuredCoverCacheDir.trim())
    : resolve(join(dirname(databasePath), 'cover-cache'));
  try {
    const libraryService = getLibraryService();
    const diagnostics = libraryService.getDiagnostics();
    databasePath = diagnostics.databasePath ?? databasePath;
    coverCacheDir = libraryService.getCoverCacheDir();
  } catch (error) {
    if (!(error instanceof LibraryDatabaseUnavailableError)) {
      throw error;
    }
  }
  const databaseDirectory = dirname(databasePath);
  const items = [
    createCacheInventoryItem('cover', '封面缓存', coverCacheDir, true, '可通过缓存目录迁移'),
    createCacheInventoryItem('artist-image', '艺人图缓存', join(databaseDirectory, 'artist-images'), false, '第一阶段只盘点，不迁移艺人图目录'),
    createCacheInventoryItem('smtc-cover', 'SMTC 封面缓存', join(userDataPath, 'smtc-covers'), false, '运行时可重新生成，第一阶段不迁移'),
    createCacheInventoryItem('download', '下载任务缓存', join(userDataPath, 'echo-download-jobs.json'), false, '下载记录保存在 userData，第一阶段不迁移'),
    createCacheInventoryItem('lyrics-mv', '歌词/MV 记录', databasePath, false, '歌词与 MV 记录在曲库数据库内，第一阶段不移动主数据库'),
  ];

  return {
    items,
    totalSizeBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
    generatedAt: new Date().toISOString(),
  };
};
