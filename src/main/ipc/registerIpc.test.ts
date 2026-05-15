import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  handlers[channel] = handler;
});
const showOpenDialogMock = vi.fn();
const setAppSettingsMock = vi.fn((patch) => ({ coverCacheDir: patch.coverCacheDir ?? null, hideToTrayOnClose: false }));
const getLibraryServiceMock = vi.fn();
const ensureCoverCacheDirectoryMock = vi.fn();
const fromWebContentsMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
    getPath: () => 'D:\\Echo',
  },
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock('../app/appSettings', () => ({
  defaultSettings: {
    albumMergeStrategy: 'standard',
    artistWallAlbumArtwork: false,
    coverCacheDir: null,
    hideToTrayOnClose: false,
    appCustomWallpaperPath: null,
    appWallpaperScalePercent: 100,
    appWallpaperBlurPx: 0,
    appWallpaperBrightnessPercent: 100,
    appWallpaperUiOpacityPercent: 100,
    appWallpaperUnifiedOpacityEnabled: false,
    networkMetadataEnabled: false,
    networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
    channelBalance: {
      enabled: false,
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
      swapLeftRight: false,
      monoMode: 'off',
      invertLeft: false,
      invertRight: false,
      constantPower: true,
    },
    playerVolume: 1,
    playbackSpeed: 1,
    playbackSpeedMode: 'nightcore',
    scanPerformanceMode: 'balanced',
    duplicateTracksEnabled: false,
    duplicateTracksMode: 'strict',
    duplicateTracksAutoRebuildAfterScan: false,
    discordRichPresenceEnabled: false,
    lastFmEnabled: false,
    lastFmUsername: null,
    lastFmSessionKey: null,
    lastFmScrobbleEnabled: true,
    lastFmNowPlayingEnabled: true,
    lastFmMinScrobbleSeconds: 30,
    lastFmAuthToken: null,
    smtcEnabled: true,
  },
  getAppSettings: vi.fn(() => ({ coverCacheDir: null, hideToTrayOnClose: false })),
  getAppWallpaperDirectory: vi.fn(() => 'D:\\Echo\\app-wallpapers'),
  getLyricsWallpaperDirectory: vi.fn(() => 'D:\\Echo\\lyrics-wallpapers'),
  setAppSettings: setAppSettingsMock,
}));

vi.mock('../app/tray', () => ({
  destroyTray: vi.fn(),
  ensureTray: vi.fn(),
}));

vi.mock('../app/autoUpdater', () => ({
  checkForUpdates: vi.fn(),
  getUpdateStatus: vi.fn(() => ({
    state: 'idle',
    currentVersion: 'v0.0.0-test',
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    error: null,
    checkedAt: null,
  })),
  setAutoUpdateEnabled: vi.fn(),
}));

vi.mock('../library/CoverCacheManager', () => ({
  ensureCoverCacheDirectory: ensureCoverCacheDirectoryMock,
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: getLibraryServiceMock,
}));

vi.mock('./libraryIpc', () => ({
  registerLibraryIpc: vi.fn(),
}));

vi.mock('./lyricsIpc', () => ({
  registerLyricsIpc: vi.fn(),
}));

vi.mock('./mvIpc', () => ({
  registerMvIpc: vi.fn(),
}));

vi.mock('./playbackIpc', () => ({
  registerPlaybackIpc: vi.fn(),
}));

vi.mock('./audioIpc', () => ({
  registerAudioIpc: vi.fn(),
}));

vi.mock('./accountIpc', () => ({
  registerAccountIpc: vi.fn(),
}));

vi.mock('./diagnosticsIpc', () => ({
  registerDiagnosticsIpc: vi.fn(),
}));

vi.mock('./discordPresenceIpc', () => ({
  registerDiscordPresenceIpc: vi.fn(),
}));

vi.mock('./lastFmIpc', () => ({
  registerLastFmIpc: vi.fn(),
}));

vi.mock('../integrations/discord/getDiscordPresenceService', () => ({
  setDiscordPresenceEnabled: vi.fn(),
}));

vi.mock('../integrations/lastfm/getLastFmService', () => ({
  getLastFmService: () => ({
    disconnect: vi.fn(),
  }),
}));

const resetHandlers = (): void => {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
};

describe('app IPC cover cache directory', () => {
  beforeEach(async () => {
    resetHandlers();
    handleMock.mockClear();
    showOpenDialogMock.mockReset();
    setAppSettingsMock.mockClear();
    getLibraryServiceMock.mockReset();
    ensureCoverCacheDirectoryMock.mockReset();
    fromWebContentsMock.mockReset();
    const module = await import('./registerIpc');
    module.registerIpc();
  });

  it('rejects changing the cache directory while a scan is running', async () => {
    getLibraryServiceMock.mockReturnValue({
      hasRunningJobs: () => true,
      getDefaultCoverCacheDir: () => 'D:\\Echo\\cover-cache',
    });

    await expect(
      handlers[IpcChannels.AppSetCoverCacheDirectory]!(null, { directory: 'D:\\NewCache', migrate: true }),
    ).rejects.toThrow('Cannot change cover cache directory while a library scan is running.');
    expect(setAppSettingsMock).not.toHaveBeenCalled();
  });

  it('can restore the default cache directory without migration', async () => {
    const service = {
      hasRunningJobs: () => false,
      getDefaultCoverCacheDir: () => 'D:\\Echo\\cover-cache',
      setCoverCacheDir: vi.fn(),
    };
    getLibraryServiceMock.mockReturnValue(service);

    const result = await handlers[IpcChannels.AppSetCoverCacheDirectory]!(null, { directory: null, migrate: false });

    expect(result).toBeNull();
    expect(ensureCoverCacheDirectoryMock).toHaveBeenCalledWith('D:\\Echo\\cover-cache');
    expect(setAppSettingsMock).toHaveBeenCalledWith({ coverCacheDir: null });
    expect(service.setCoverCacheDir).toHaveBeenCalledWith('D:\\Echo\\cover-cache');
  });

  it('resets app settings and restores the default cover cache directory', async () => {
    const service = {
      hasRunningJobs: () => false,
      getDefaultCoverCacheDir: () => 'D:\\Echo\\cover-cache',
      setCoverCacheDir: vi.fn(),
    };
    getLibraryServiceMock.mockReturnValue(service);

    const result = (await handlers[IpcChannels.AppResetSettings]!()) as { coverCacheDir: string | null };

    expect(result.coverCacheDir).toBeNull();
    expect(ensureCoverCacheDirectoryMock).toHaveBeenCalledWith('D:\\Echo\\cover-cache');
    expect(setAppSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ coverCacheDir: null, hideToTrayOnClose: false }));
    expect(service.setCoverCacheDir).toHaveBeenCalledWith('D:\\Echo\\cover-cache');
  });

  it('uses an image-only picker for lyrics wallpaper selection', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await handlers[IpcChannels.AppChooseLyricsWallpaper]!();

    expect(result).toBeNull();
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        properties: ['openFile'],
      }),
    );
  });

  it('uses an image-only picker for app wallpaper selection', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await handlers[IpcChannels.AppChooseAppWallpaper]!();

    expect(result).toBeNull();
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        properties: ['openFile'],
      }),
    );
  });

  it('exits fullscreen when toggling maximize from F11 fullscreen mode', () => {
    const window = {
      isFullScreen: vi.fn(() => true),
      setFullScreen: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
    };
    fromWebContentsMock.mockReturnValue(window);

    handlers[IpcChannels.AppWindowToggleMaximize]!({ sender: {} });

    expect(window.setFullScreen).toHaveBeenCalledWith(false);
    expect(window.isMaximized).not.toHaveBeenCalled();
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.unmaximize).not.toHaveBeenCalled();
  });
});
