import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AppSettings } from '../../shared/types/appSettings';
import type { CoverCacheMigrationResult, SetCoverCacheDirectoryRequest } from '../../shared/types/coverCache';
import type { UpdateStatus } from '../../shared/types/updates';
import type { FontFileAsset } from '../../preload/apiTypes';
import { defaultSettings, getAppSettings, getAppWallpaperDirectory, getLyricsWallpaperDirectory, setAppSettings } from '../app/appSettings';
import { checkForUpdates, getUpdateStatus, setAutoUpdateEnabled } from '../app/autoUpdater';
import { refreshBackgroundSpaceRegistration, validateGlobalShortcut } from '../app/backgroundPlaybackShortcuts';
import { destroyTray, ensureTray } from '../app/tray';
import { ensureCoverCacheDirectory } from '../library/CoverCacheManager';
import { getLibraryService } from '../library/LibraryService';
import { setDiscordPresenceEnabled } from '../integrations/discord/getDiscordPresenceService';
import { getLastFmService } from '../integrations/lastfm/getLastFmService';
import { registerAudioIpc } from './audioIpc';
import { registerAccountIpc } from './accountIpc';
import { registerDiagnosticsIpc } from './diagnosticsIpc';
import { registerDiscordPresenceIpc } from './discordPresenceIpc';
import { registerDownloadsIpc } from './downloadsIpc';
import { registerLastFmIpc } from './lastFmIpc';
import { registerLibraryIpc } from './libraryIpc';
import { registerLyricsIpc } from './lyricsIpc';
import { registerMvIpc } from './mvIpc';
import { registerPlaybackIpc } from './playbackIpc';
import { registerRemoteSourcesIpc } from './remoteSourcesIpc';
import { registerStreamingIpc } from './streamingIpc';

const fontMimeTypes: Record<string, string> = {
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const wallpaperExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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

const requireWallpaperPath = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('wallpaper path must be a non-empty string');
  }

  const wallpaperPath = resolve(value.trim());
  const extension = extname(wallpaperPath).toLowerCase();

  if (!wallpaperExtensions.has(extension)) {
    throw new Error('selected file is not a supported image');
  }

  if (!existsSync(wallpaperPath)) {
    throw new Error('selected wallpaper file does not exist');
  }

  return wallpaperPath;
};

const copyWallpaper = (wallpaperPathInput: unknown, wallpaperDirectory: string): string => {
  const wallpaperPath = requireWallpaperPath(wallpaperPathInput);
  const extension = extname(wallpaperPath).toLowerCase();
  const targetPath = resolve(wallpaperDirectory, `${randomUUID()}${extension}`);

  mkdirSync(wallpaperDirectory, { recursive: true });
  copyFileSync(wallpaperPath, targetPath);
  return targetPath;
};

const copyLyricsWallpaper = (wallpaperPathInput: unknown): string => copyWallpaper(wallpaperPathInput, getLyricsWallpaperDirectory());

const copyAppWallpaper = (wallpaperPathInput: unknown): string => copyWallpaper(wallpaperPathInput, getAppWallpaperDirectory());

const requireExternalHttpUrl = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('external URL must be a non-empty string');
  }

  const url = new URL(value.trim());

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('external URL must use http or https');
  }

  return url.toString();
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
  ipcMain.handle(IpcChannels.AppGetVersion, () => `v${app.getVersion()}`);
  ipcMain.handle(IpcChannels.AppWindowMinimize, (event: IpcMainInvokeEvent): void => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(IpcChannels.AppWindowToggleMaximize, (event: IpcMainInvokeEvent): void => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return;
    }

    if (window.isFullScreen()) {
      window.setFullScreen(false);
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
    let settings = setAppSettings(settingsPatch);

    if (settings.hideToTrayOnClose) {
      ensureTray();
    } else {
      destroyTray();
    }

    if (typeof settingsPatch.autoUpdateEnabled === 'boolean') {
      const autoUpdateEnabled = settings.autoUpdateEnabled !== false;
      setAutoUpdateEnabled(autoUpdateEnabled);
      if (autoUpdateEnabled) {
        void checkForUpdates();
      }
    }

    if (typeof settingsPatch.backgroundSpacePauseEnabled === 'boolean' || settingsPatch.globalShortcuts) {
      settings = refreshBackgroundSpaceRegistration() ?? settings;
    }

    if (typeof settingsPatch.autoFetchArtistImages === 'boolean' || typeof settingsPatch.artistImageFetchPaused === 'boolean') {
      getLibraryService().syncArtistImageBackfillState();
    }

    return settings;
  });
  ipcMain.handle(IpcChannels.AppValidateGlobalShortcut, (_event: IpcMainInvokeEvent, accelerator: unknown) =>
    validateGlobalShortcut(accelerator),
  );
  ipcMain.handle(IpcChannels.AppResetSettings, async (): Promise<AppSettings> => {
    const libraryService = getLibraryService();
    const defaultCoverCacheDir = libraryService.getDefaultCoverCacheDir();

    if (libraryService.hasRunningJobs()) {
      throw new Error('Cannot reset settings while a library scan is running.');
    }

    await ensureCoverCacheDirectory(defaultCoverCacheDir);
    libraryService.setCoverCacheDir(defaultCoverCacheDir);
    destroyTray();
    const settings = setAppSettings({ ...defaultSettings });
    refreshBackgroundSpaceRegistration();
    await setDiscordPresenceEnabled(settings.discordRichPresenceEnabled);
    getLastFmService().disconnect();
    return settings;
  });
  ipcMain.handle(IpcChannels.AppChooseFontFile, async (): Promise<FontFileAsset | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose font file',
      properties: ['openFile'],
      filters: [{ name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });

    return result.canceled ? null : loadFontFile(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.AppChooseLyricsWallpaper, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose lyrics wallpaper',
      properties: ['openFile'],
      filters: [{ name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });

    return result.canceled || !result.filePaths[0] ? null : copyLyricsWallpaper(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.AppChooseAppWallpaper, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose app wallpaper',
      properties: ['openFile'],
      filters: [{ name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });

    return result.canceled || !result.filePaths[0] ? null : copyAppWallpaper(result.filePaths[0]);
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
  ipcMain.handle(IpcChannels.AppGetUpdateStatus, (): UpdateStatus => getUpdateStatus());
  ipcMain.handle(IpcChannels.AppCheckForUpdates, (): Promise<UpdateStatus> => checkForUpdates());
  ipcMain.handle(IpcChannels.AppOpenRepository, async (): Promise<void> => {
    await shell.openExternal('https://github.com/moekotori/echo');
  });
  ipcMain.handle(IpcChannels.AppOpenExternalUrl, async (_event: IpcMainInvokeEvent, rawUrl: unknown): Promise<void> => {
    await shell.openExternal(requireExternalHttpUrl(rawUrl));
  });
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
  registerAccountIpc();
  registerDiscordPresenceIpc();
  registerDownloadsIpc();
  registerLastFmIpc();
  registerLibraryIpc();
  registerLyricsIpc();
  registerMvIpc();
  registerRemoteSourcesIpc();
  registerStreamingIpc();
  registerPlaybackIpc();
  registerAudioIpc();
};
