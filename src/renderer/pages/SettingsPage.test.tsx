// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import type { AppSettings } from '../../shared/types/appSettings';

const settings: AppSettings = {
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
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
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
