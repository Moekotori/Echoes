// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import type { AppSettings } from '../../shared/types/appSettings';

const settings: AppSettings = {
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
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.7,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsPlayerBarDrawerEnabled: false,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsFontSizePx: 36,
  lyricsColor: '#314054',
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvMaxQuality: '1080p',
  mvAllow60fps: true,
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
};

const getSettingsMock = vi.fn();
const setSettingsMock = vi.fn();
const resetSettingsMock = vi.fn();
const clearCacheMock = vi.fn();
const chooseLyricsWallpaperMock = vi.fn();
const chooseAppWallpaperMock = vi.fn();

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    localeOptions: [{ label: '简体中文', value: 'zh-CN' }],
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock('../utils/echoBridge', () => ({
  getAppBridge: () => ({
    chooseCacheDirectory: vi.fn(),
    getDefaultCacheDirectory: vi.fn().mockResolvedValue('D:\\Cache'),
    getSettings: getSettingsMock,
    getVersion: vi.fn().mockResolvedValue('1.0.1'),
    chooseAppWallpaper: chooseAppWallpaperMock,
    resetSettings: resetSettingsMock,
    setCoverCacheDirectory: vi.fn(),
    setSettings: setSettingsMock,
  }),
  getAudioBridge: () => ({
    getStatus: vi.fn().mockResolvedValue(null),
    listDevices: vi.fn().mockResolvedValue([]),
    setOutput: vi.fn().mockResolvedValue(null),
  }),
  getAccountsBridge: () => ({
    getStatuses: vi.fn().mockResolvedValue([]),
    saveCookie: vi.fn(),
    startLogin: vi.fn(),
    clear: vi.fn(),
    check: vi.fn(),
    setYouTubeBrowser: vi.fn(),
  }),
  getDiagnosticsBridge: () => ({
    clearLastCrashSummary: vi.fn(),
    exportDiagnostics: vi.fn().mockResolvedValue('D:\\Echo\\diagnostics.zip'),
    getLastCrashSummary: vi.fn().mockResolvedValue(null),
    openDiagnosticsFolder: vi.fn(),
  }),
  getLibraryBridge: () => ({
    clearCache: clearCacheMock,
    getDuplicateIndexSummary: vi.fn().mockResolvedValue({
      mode: 'strict',
      totalTracksScanned: 0,
      duplicateGroups: 0,
      duplicateMembers: 0,
      hiddenTracks: 0,
      updatedAt: '',
    }),
    getSummary: vi.fn().mockResolvedValue({ songCount: 0, albumCount: 0, artistCount: 0, folderCount: 0, totalDuration: 0, lastScanAt: null }),
    refreshDuplicateTracks: vi.fn().mockResolvedValue({
      mode: 'strict',
      totalTracksScanned: 0,
      duplicateGroups: 0,
      duplicateMembers: 0,
      hiddenTracks: 0,
      updatedAt: '',
    }),
    refreshAlbumGrouping: vi.fn().mockResolvedValue({ songCount: 0, albumCount: 0, artistCount: 0, folderCount: 0, totalDuration: 0, lastScanAt: null }),
  }),
}));

vi.mock('../components/audio/EqPanel', () => ({
  EqPanel: () => <div />,
}));

vi.mock('../components/library/LibraryDiagnosticsPanel', () => ({
  LibraryDiagnosticsPanel: () => <div />,
}));

vi.mock('../components/library/LibraryFoldersPanel', () => ({
  LibraryFoldersPanel: () => <div />,
}));

vi.mock('../components/library/NetworkMetadataPanel', () => ({
  NetworkMetadataPanel: () => <div />,
}));

vi.mock('../components/settings/RemoteSourcesPanel', () => ({
  RemoteSourcesPanel: () => <div />,
}));

beforeEach(() => {
  window.echo = {
    app: {
      getSettings: getSettingsMock,
      setSettings: setSettingsMock,
      chooseLyricsWallpaper: chooseLyricsWallpaperMock,
      chooseAppWallpaper: chooseAppWallpaperMock,
    },
  } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { echo?: Window['echo'] }).echo;
});

describe('SettingsPage', () => {
  it('saves the artist wall album artwork setting and announces settings changes', async () => {
    const settingsChanged = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, artistWallAlbumArtwork: true });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    window.addEventListener('settings:changed', settingsChanged);

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.appearance.label')[0]);
    const row = screen.getByText('艺术家墙封面').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ artistWallAlbumArtwork: true }));
    expect(settingsChanged).toHaveBeenCalledTimes(1);

    window.removeEventListener('settings:changed', settingsChanged);
  });

  it('saves the lyrics player bar drawer setting from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, lyricsPlayerBarDrawerEnabled: true });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('route.lyricsSettings.label')[0]);
    expect(screen.queryByText('Lyrics Engine')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(await screen.findByRole('checkbox', { name: /底栏抽屉/ }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));
  });

  it('shows app wallpaper controls only after choosing a custom wallpaper', async () => {
    const wallpaperPath = 'D:\\Echo\\app-wallpapers\\wallpaper.png';
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    chooseAppWallpaperMock.mockResolvedValue(wallpaperPath);
    setSettingsMock.mockResolvedValue({ ...settings, appCustomWallpaperPath: wallpaperPath });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.appearance.label')[0]);
    expect(screen.queryByText('壁纸缩放')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /选择壁纸/ }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ appCustomWallpaperPath: wallpaperPath }));
    expect(await screen.findByText('壁纸缩放')).toBeTruthy();
    expect(screen.getByText('壁纸模糊度')).toBeTruthy();
    expect(screen.getByText('壁纸亮度')).toBeTruthy();
    expect(screen.getByText('UI 透明度')).toBeTruthy();
    expect(screen.getByText('统一透明度')).toBeTruthy();
  });
});
