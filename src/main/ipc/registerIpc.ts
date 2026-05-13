import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AppSettings } from '../../shared/types/appSettings';
import type { CoverCacheMigrationResult, SetCoverCacheDirectoryRequest } from '../../shared/types/coverCache';
import type { FontFileAsset } from '../../preload/apiTypes';
import { defaultSettings, getAppSettings, setAppSettings } from '../app/appSettings';
import { destroyTray, ensureTray } from '../app/tray';
import { ensureCoverCacheDirectory } from '../library/CoverCacheManager';
import { getLibraryService } from '../library/LibraryService';
import { registerAudioIpc } from './audioIpc';
import { registerDiagnosticsIpc } from './diagnosticsIpc';
import { registerLibraryIpc } from './libraryIpc';
import { registerPlaybackIpc } from './playbackIpc';

const fontMimeTypes: Record<string, string> = {
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const requireFontPath = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('font path must be a non-empty string');
  }

  const fontPath = value.trim();
  const extension = extname(fontPath).toLowerCase();

  if (!fontMimeTypes[extension]) {
    throw new Error('selected file is not a supported font');
  }

  if (!existsSync(fontPath)) {
    throw new Error('selected font file does not exist');
  }

  return fontPath;
};

const toFontFamily = (fontPath: string): string => basename(fontPath, extname(fontPath)).replace(/[\r\n;]/g, '').trim() || 'Custom Font';

const loadFontFile = (fontPathInput: unknown): FontFileAsset => {
  const fontPath = requireFontPath(fontPathInput);
  const extension = extname(fontPath).toLowerCase();
  const content = readFileSync(fontPath);

  return {
    path: fontPath,
    family: toFontFamily(fontPath),
    dataUrl: `data:${fontMimeTypes[extension]};base64,${content.toString('base64')}`,
  };
};

const normalizeCoverCacheRequest = (value: unknown): SetCoverCacheDirectoryRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cover cache directory request must be an object');
  }

  const input = value as Record<string, unknown>;
  const directory =
    typeof input.directory === 'string' && input.directory.trim().length > 0 ? resolve(input.directory.trim()) : null;

  return {
    directory,
    migrate: input.migrate === true,
  };
};

export const registerIpc = (): void => {
  ipcMain.handle(IpcChannels.AppGetVersion, () => app.getVersion());
  ipcMain.handle(IpcChannels.AppWindowMinimize, (event: IpcMainInvokeEvent): void => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(IpcChannels.AppWindowToggleMaximize, (event: IpcMainInvokeEvent): void => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });
  ipcMain.handle(IpcChannels.AppWindowClose, (event: IpcMainInvokeEvent): void => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(IpcChannels.AppGetSettings, (): AppSettings => getAppSettings());
  ipcMain.handle(IpcChannels.AppSetSettings, (_event: IpcMainInvokeEvent, patch: Partial<AppSettings>): AppSettings => {
    const settingsPatch = { ...patch };
    delete settingsPatch.coverCacheDir;
    const settings = setAppSettings(settingsPatch);

    if (settings.hideToTrayOnClose) {
      ensureTray();
    } else {
      destroyTray();
    }

    return settings;
  });
  ipcMain.handle(IpcChannels.AppResetSettings, async (): Promise<AppSettings> => {
    const libraryService = getLibraryService();
    const defaultCoverCacheDir = libraryService.getDefaultCoverCacheDir();

    if (libraryService.hasRunningJobs()) {
      throw new Error('Cannot reset settings while a library scan is running.');
    }

    await ensureCoverCacheDirectory(defaultCoverCacheDir);
    libraryService.setCoverCacheDir(defaultCoverCacheDir);
    destroyTray();
    return setAppSettings({ ...defaultSettings });
  });
  ipcMain.handle(IpcChannels.AppChooseFontFile, async (): Promise<FontFileAsset | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose font file',
      properties: ['openFile'],
      filters: [{ name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });

    return result.canceled ? null : loadFontFile(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.AppLoadFontFile, (_event: IpcMainInvokeEvent, fontPath: unknown): FontFileAsset => loadFontFile(fontPath));
  ipcMain.handle(IpcChannels.AppChooseCacheDirectory, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择封面缓存目录',
      properties: ['openDirectory'],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IpcChannels.AppGetDefaultCacheDirectory, (): string => getLibraryService().getDefaultCoverCacheDir());
  ipcMain.handle(
    IpcChannels.AppSetCoverCacheDirectory,
    async (_event: IpcMainInvokeEvent, rawRequest: unknown): Promise<CoverCacheMigrationResult | null> => {
      const request = normalizeCoverCacheRequest(rawRequest);
      const libraryService = getLibraryService();

      if (libraryService.hasRunningJobs()) {
        throw new Error('Cannot change cover cache directory while a library scan is running.');
      }

      const nextDir = request.directory ?? libraryService.getDefaultCoverCacheDir();

      if (request.migrate) {
        const result = await libraryService.migrateCoverCacheDir(nextDir);

        if (result.errors.length > 0) {
          return result;
        }

        setAppSettings({ coverCacheDir: request.directory });
        libraryService.setCoverCacheDir(nextDir);
        return result;
      }

      await ensureCoverCacheDirectory(nextDir);
      setAppSettings({ coverCacheDir: request.directory });
      libraryService.setCoverCacheDir(nextDir);
      return null;
    },
  );

  registerDiagnosticsIpc();
  registerLibraryIpc();
  registerPlaybackIpc();
  registerAudioIpc();
};
