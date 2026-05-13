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

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
    getPath: () => 'D:\\Echo',
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
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
    smtcEnabled: true,
  },
  getAppSettings: vi.fn(() => ({ coverCacheDir: null, hideToTrayOnClose: false })),
  setAppSettings: setAppSettingsMock,
}));

vi.mock('../app/tray', () => ({
  destroyTray: vi.fn(),
  ensureTray: vi.fn(),
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

vi.mock('./playbackIpc', () => ({
  registerPlaybackIpc: vi.fn(),
}));

vi.mock('./audioIpc', () => ({
  registerAudioIpc: vi.fn(),
}));

vi.mock('./diagnosticsIpc', () => ({
  registerDiagnosticsIpc: vi.fn(),
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
});
