import type { EchoApi } from '../../../preload/apiTypes';
import type { ImportPathClassification, LibraryFolder, LibraryScanStatus } from '../../../shared/types/library';

export type DroppedImportResult = {
  addedFolderCount: number;
  scannedAudioFolderCount: number;
  importedFileCount: number;
  ignoredCount: number;
  missingCount: number;
  failedCount: number;
  importedFolderPaths: string[];
};

type LibraryImportBridge = Pick<EchoApi['library'], 'addFolder' | 'classifyImportPaths' | 'importAudioFiles' | 'scanFolder'>;

type HandleDroppedImportOptions = {
  onScanStatus?: (status: LibraryScanStatus) => void;
};

const uniquePaths = (paths: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    const trimmed = path.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
};

export const dirnameFromImportPath = (filePath: string): string => {
  const normalized = filePath.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));

  if (separatorIndex <= 0) {
    return '';
  }

  return normalized.slice(0, separatorIndex);
};

const importAndScanFolder = async (
  library: LibraryImportBridge,
  folderPath: string,
  options: HandleDroppedImportOptions,
): Promise<LibraryFolder | null> => {
  try {
    const folder = await library.addFolder(folderPath);
    const scanStatus = await library.scanFolder(folder.id);
    options.onScanStatus?.(scanStatus);
    return folder;
  } catch (error) {
    console.error('Failed to import dropped path', folderPath, error);
    return null;
  }
};

export const summarizeDroppedImport = (result: DroppedImportResult): string => {
  const parts: string[] = [];

  if (result.addedFolderCount > 0) {
    parts.push(`已添加 ${result.addedFolderCount} 个文件夹`);
  }

  if (result.scannedAudioFolderCount > 0) {
    parts.push(`已扫描 ${result.scannedAudioFolderCount} 个音乐文件所在文件夹`);
  }

  if (result.importedFileCount > 0) {
    parts.push(`已导入 ${result.importedFileCount} 个文件`);
  }

  if (result.ignoredCount > 0) {
    parts.push(`忽略 ${result.ignoredCount} 个不支持文件`);
  }

  if (result.missingCount > 0) {
    parts.push(`跳过 ${result.missingCount} 个不可访问路径`);
  }

  if (result.failedCount > 0) {
    parts.push(`${result.failedCount} 个路径导入失败`);
  }

  return parts.length > 0 ? parts.join('，') : '未找到可导入的音乐文件或文件夹';
};

export const handleDroppedImportPaths = async (
  paths: string[],
  library: LibraryImportBridge,
  options: HandleDroppedImportOptions = {},
): Promise<DroppedImportResult> => {
  const classification: ImportPathClassification = await library.classifyImportPaths(uniquePaths(paths));
  const folderPaths = uniquePaths(classification.folders);
  const audioFolderPaths = uniquePaths(classification.audioFiles.map(dirnameFromImportPath).filter(Boolean));
  const result: DroppedImportResult = {
    addedFolderCount: 0,
    scannedAudioFolderCount: 0,
    importedFileCount: 0,
    ignoredCount: classification.unsupportedFiles.length,
    missingCount: classification.missingPaths.length,
    failedCount: 0,
    importedFolderPaths: [],
  };

  for (const folderPath of folderPaths) {
    const folder = await importAndScanFolder(library, folderPath, options);
    if (folder) {
      result.addedFolderCount += 1;
      result.importedFolderPaths.push(folder.path);
    } else {
      result.failedCount += 1;
    }
  }

  for (const folderPath of audioFolderPaths) {
    const folder = await importAndScanFolder(library, folderPath, options);
    if (folder) {
      result.scannedAudioFolderCount += 1;
      result.importedFolderPaths.push(folder.path);
    } else {
      result.failedCount += 1;
    }
  }

  if (classification.osuArchives.length > 0) {
    try {
      const imported = await library.importAudioFiles(classification.osuArchives);
      result.importedFileCount += imported.importedCount;
      result.failedCount += imported.failedCount;
    } catch (error) {
      console.error('Failed to import dropped osu archives', error);
      result.failedCount += classification.osuArchives.length;
    }
  }

  if (result.addedFolderCount > 0 || result.scannedAudioFolderCount > 0 || result.importedFileCount > 0) {
    window.dispatchEvent(new Event('library:changed'));
  }

  return result;
};
