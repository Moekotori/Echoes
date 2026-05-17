// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import type { AppSettings } from '../../shared/types/appSettings';
import type { DownloadSettings } from '../../shared/types/downloads';
import { createDefaultGlobalShortcuts, createRecommendedGlobalShortcuts } from '../../shared/types/globalShortcuts';

const settings: AppSettings = {
  appearanceTheme: 'light',
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  artistWallAlbumFallbackForMissingAvatars: false,
  autoAccountCheckOnStartup: true,
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
  lyricsOffsetControlsEnabled: false,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsPlayerBarDrawerEnabled: false,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsContextOpacityPercent: 49,
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
  backgroundSpacePauseEnabled: false,
  globalShortcuts: createDefaultGlobalShortcuts(),
  playbackFollowCurrentTrack: false,
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
const openExternalUrlMock = vi.fn();
const getDownloadSettingsMock = vi.fn();
const chooseDownloadOutputDirectoryMock = vi.fn();
const audioGetStatusMock = vi.fn();
const audioListDevicesMock = vi.fn();
const audioSetOutputMock = vi.fn();
const audioResetEngineMock = vi.fn();
const audioForceRestartMock = vi.fn();
const audioRestartWindowsAudioServiceMock = vi.fn();
const validateGlobalShortcutMock = vi.fn();
const kickoffArtistImageBackfillMock = vi.fn();
const getArtistImageJobStatusMock = vi.fn();

const downloadSettings: DownloadSettings = {
  audioStrategy: 'best_available',
  importToLibrary: true,
  bindMvAfterImport: true,
  outputDirectory: 'D:\\Downloads',
};

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
    openExternalUrl: openExternalUrlMock,
    validateGlobalShortcut: validateGlobalShortcutMock,
    resetSettings: resetSettingsMock,
    setCoverCacheDirectory: vi.fn(),
    setSettings: setSettingsMock,
  }),
  getAudioBridge: () => ({
    getStatus: audioGetStatusMock,
    listDevices: audioListDevicesMock,
    setOutput: audioSetOutputMock,
    resetEngine: audioResetEngineMock,
    forceRestart: audioForceRestartMock,
    restartWindowsAudioService: audioRestartWindowsAudioServiceMock,
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
    openCrashReport: vi.fn().mockResolvedValue('D:\\Echo\\crash-report.md'),
    openAudioCrashReport: vi.fn().mockResolvedValue('D:\\Echo\\audio-crash-report.md'),
  }),
  getDownloadsBridge: () => ({
    getSettings: getDownloadSettingsMock,
    chooseOutputDirectory: chooseDownloadOutputDirectoryMock,
  }),
  getDiscordPresenceBridge: () => ({
    getStatus: vi.fn().mockResolvedValue({ available: true, connected: false, enabled: false, lastError: null }),
    setEnabled: vi.fn().mockResolvedValue({ available: true, connected: false, enabled: true, lastError: null }),
  }),
  getLastFmBridge: () => ({
    getStatus: vi.fn().mockResolvedValue({ activeTrack: null, authPending: false, connected: false, enabled: false, lastError: null, username: null }),
    setEnabled: vi.fn().mockResolvedValue({ activeTrack: null, authPending: false, connected: false, enabled: true, lastError: null, username: null }),
    startAuth: vi.fn(),
    completeAuth: vi.fn(),
    disconnect: vi.fn(),
  }),
  getLibraryBridge: () => ({
    clearCache: clearCacheMock,
    getArtistImageJobStatus: getArtistImageJobStatusMock,
    kickoffArtistImageBackfill: kickoffArtistImageBackfillMock,
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
  vi.clearAllMocks();
  getDownloadSettingsMock.mockResolvedValue(downloadSettings);
  chooseDownloadOutputDirectoryMock.mockResolvedValue({ ...downloadSettings, outputDirectory: 'E:\\Music Downloads' });
  audioGetStatusMock.mockResolvedValue(null);
  audioListDevicesMock.mockResolvedValue([]);
  audioSetOutputMock.mockResolvedValue(null);
  audioResetEngineMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  audioForceRestartMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  audioRestartWindowsAudioServiceMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  openExternalUrlMock.mockResolvedValue(undefined);
  validateGlobalShortcutMock.mockResolvedValue({
    accelerator: 'Ctrl+Alt+Space',
    available: true,
    reason: 'available',
    valid: true,
  });
  kickoffArtistImageBackfillMock.mockResolvedValue({
    paused: false,
    running: true,
    queued: 4,
    active: 1,
    lastQueued: { queued: 5, skipped: 2 },
    summary: {
      total: 5,
      matched: 0,
      pending: 4,
      loading: 1,
      notFound: 0,
      error: 0,
      rateLimited: 0,
    },
  });
  getArtistImageJobStatusMock.mockResolvedValue({
    paused: true,
    running: false,
    queued: 0,
    active: 0,
    lastQueued: { queued: 0, skipped: 0 },
    summary: {
      total: 0,
      matched: 0,
      pending: 0,
      loading: 0,
      notFound: 0,
      error: 0,
      rateLimited: 0,
    },
  });
  window.echo = {
    app: {
      getSettings: getSettingsMock,
      setSettings: setSettingsMock,
      chooseLyricsWallpaper: chooseLyricsWallpaperMock,
      chooseAppWallpaper: chooseAppWallpaperMock,
    },
  } as unknown as Window['echo'];
});

const clickSettingsNav = (labelPattern: string): void => {
  const nav = screen.getByRole('navigation', { name: 'route.settings.label' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(labelPattern) }));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
  delete (window as { echo?: Window['echo'] }).echo;
});

describe('SettingsPage', () => {
  it('jumps from global settings search to a matching section', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    const searchInput = screen.getByPlaceholderText('settings.header.searchPlaceholder') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '外观' } });
    fireEvent.click(screen.getByRole('option', { name: /settings\.nav\.appearance\.label/ }));

    expect(searchInput.value).toBe('');
    expect(screen.getByText('settings.appearance.theme.title')).toBeTruthy();
  });

  it('opens the first global settings search result with Enter', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    const searchInput = screen.getByPlaceholderText('settings.header.searchPlaceholder') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '壁纸' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(searchInput.value).toBe('');
    expect(screen.getByText('settings.appearance.theme.title')).toBeTruthy();
  });

  it('opens community links through the desktop external-url bridge', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.about\\.label');
    fireEvent.click(screen.getByRole('button', { name: /查看历史更新日志/ }));
    fireEvent.click(screen.getByRole('button', { name: /加入 QQ 群聊/ }));
    fireEvent.click(screen.getByRole('button', { name: /加入 Discord/ }));

    await waitFor(() => expect(openExternalUrlMock).toHaveBeenCalledWith('https://github.com/moekotori/echo/releases'));
    expect(openExternalUrlMock).toHaveBeenCalledWith('https://qm.qq.com/q/KrJE8PIqSQ');
    expect(openExternalUrlMock).toHaveBeenCalledWith('https://discord.gg/g7v4WMRq3K');
  });

  it('finds status aliases and jumps to the exact Discord presence row', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    const searchInput = screen.getByPlaceholderText('settings.header.searchPlaceholder') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '状态' } });
    fireEvent.click(screen.getByRole('option', { name: /settings\.integrations\.discord\.title/ }));

    expect(searchInput.value).toBe('');
    const row = screen.getByText('settings.integrations.discord.title').closest('.setting-row') as HTMLElement;
    expect(row.id).toBe('settings-row-discord-presence');
    expect(row.getAttribute('data-search-highlight')).toBe('true');
  });

  it('saves the dark theme from Settings and marks the selected chip', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.appearance\\.label');
    const darkButton = screen.getByRole('button', { name: /settings\.appearance\.theme\.dark/ });
    fireEvent.click(darkButton);

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ appearanceTheme: 'dark' }));
    expect(darkButton.className).toContain('active');
    expect(document.documentElement.dataset.themeMode).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('saves the system theme from Settings and marks the selected chip', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.appearance\\.label');
    const systemButton = screen.getByRole('button', { name: /settings\.appearance\.theme\.followSystem/ });
    fireEvent.click(systemButton);

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ appearanceTheme: 'system' }));
    expect(systemButton.className).toContain('active');
    expect(document.documentElement.dataset.themeMode).toBe('system');
  });

  it('saves the artist wall album artwork setting and announces settings changes', async () => {
    const settingsChanged = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, artistWallAlbumArtwork: true });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDownloadSettingsMock.mockResolvedValue(downloadSettings);
    chooseDownloadOutputDirectoryMock.mockResolvedValue({ ...downloadSettings, outputDirectory: 'E:\\Music Downloads' });
    window.addEventListener('settings:changed', settingsChanged);

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.library\\.label');
    const row = screen.getByRole('heading', { name: /艺术家墙封面/ }).closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ artistWallAlbumArtwork: true }));
    expect(settingsChanged).toHaveBeenCalledTimes(1);

    window.removeEventListener('settings:changed', settingsChanged);
  });

  it('saves the missing artist avatar album fallback setting', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDownloadSettingsMock.mockResolvedValue(downloadSettings);

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.library\\.label');
    const row = screen.getByRole('heading', { name: 'settings.appearance.artistAvatars.title' }).closest('.setting-row') as HTMLElement;
    const fallbackToggle = within(
      within(row).getByText('settings.appearance.artistAvatars.fallback').closest('.settings-inline-toggle') as HTMLElement,
    ).getByRole('button');
    fireEvent.click(fallbackToggle);

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ artistWallAlbumFallbackForMissingAvatars: true }));
  });

  it('starts missing artist avatar fetching immediately when automatic fetching is enabled', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue({ ...settings, autoFetchArtistImages: false, artistImageFetchPaused: true });
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.library\\.label');
    const row = screen.getByRole('heading', { name: 'settings.appearance.artistAvatars.title' }).closest('.setting-row') as HTMLElement;
    const autoFetchToggle = within(
      within(row).getByText('settings.appearance.artistAvatars.toggle').closest('.settings-inline-toggle') as HTMLElement,
    ).getByRole('button');
    fireEvent.click(autoFetchToggle);

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        autoFetchArtistImages: true,
        artistImageFetchPaused: false,
      }),
    );
    expect(kickoffArtistImageBackfillMock).toHaveBeenCalledWith({ force: true, limit: 500 });
    expect(await screen.findByText('settings.appearance.artistAvatars.message.queued')).toBeTruthy();
  });

  it('chooses the download folder from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDownloadSettingsMock.mockResolvedValue(downloadSettings);
    chooseDownloadOutputDirectoryMock.mockResolvedValue({ ...downloadSettings, outputDirectory: 'E:\\Music Downloads' });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.library\\.label');
    expect(await screen.findByText('D:\\Downloads')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '更换文件夹' }));

    await waitFor(() => expect(chooseDownloadOutputDirectoryMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('E:\\Music Downloads')).toBeTruthy();
    expect(screen.getByText('下载路径已更新。')).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('checkbox', { name: /底栏抽屉/ }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));
  });

  it('saves the follow current playback setting from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, playbackFollowCurrentTrack: true });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);
    const row = screen.getByText('settings.playback.followCurrent.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ playbackFollowCurrentTrack: true }));
  });

  it('does not start audio device/status work when first entering Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    expect(audioGetStatusMock).not.toHaveBeenCalled();
    expect(audioListDevicesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);

    await waitFor(() => expect(audioGetStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(audioListDevicesMock).toHaveBeenCalled());
  });

  it('records and enables a global playback shortcut from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    const row = screen.getByText('settings.shortcuts.action.playPause.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent.keyDown(window, { code: 'Space', key: ' ', ctrlKey: true, altKey: true });

    const expectedShortcuts = {
      ...createDefaultGlobalShortcuts(),
      playPause: { enabled: false, accelerator: 'Ctrl+Alt+Space' },
    };
    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ globalShortcuts: expectedShortcuts }));

    setSettingsMock.mockClear();
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({
      ...settings,
      globalShortcuts: expectedShortcuts,
      ...patch,
    }));
    fireEvent.click(within(row).getByRole('button', { pressed: false }));

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...expectedShortcuts,
          playPause: { enabled: true, accelerator: 'Ctrl+Alt+Space' },
        },
      }),
    );
  });

  it('records a single-key global shortcut from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    const row = screen.getByText('settings.shortcuts.action.previousTrack.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent.keyDown(window, { code: 'F13', key: 'F13' });

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...createDefaultGlobalShortcuts(),
          previousTrack: { enabled: false, accelerator: 'F13' },
        },
      }),
    );
  });

  it('records a mouse side button global shortcut from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    const row = screen.getByText('settings.shortcuts.action.nextTrack.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent.mouseDown(window, { button: 3 });

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...createDefaultGlobalShortcuts(),
          nextTrack: { enabled: false, accelerator: 'MouseButton4' },
        },
      }),
    );
  });

  it('records mouse side buttons from auxclick events and exposes playback speed shortcuts', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    expect(screen.getByText('settings.shortcuts.action.speedUp.title')).toBeTruthy();
    expect(screen.getByText('settings.shortcuts.action.speedDown.title')).toBeTruthy();

    const row = screen.getByText('settings.shortcuts.action.speedUp.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent(window, new MouseEvent('auxclick', { button: 4, bubbles: true, cancelable: true }));

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...createDefaultGlobalShortcuts(),
          speedUp: { enabled: false, accelerator: 'MouseButton5' },
        },
      }),
    );
  });

  it('records the plus key as a valid global shortcut token', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    const row = screen.getByText('settings.shortcuts.action.speedUp.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent.keyDown(window, { code: 'Equal', key: '+', ctrlKey: true, altKey: true, shiftKey: true });

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...createDefaultGlobalShortcuts(),
          speedUp: { enabled: false, accelerator: 'Ctrl+Alt+Shift+Plus' },
        },
      }),
    );
  });

  it('records browser navigation keys without rewriting them to mouse buttons', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    const row = screen.getByText('settings.shortcuts.action.previousTrack.title').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'settings.shortcuts.action.record' }));
    fireEvent.keyDown(window, { code: 'BrowserBack', key: 'BrowserBack' });

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        globalShortcuts: {
          ...createDefaultGlobalShortcuts(),
          previousTrack: { enabled: false, accelerator: 'BrowserBack' },
        },
      }),
    );
  });

  it('restores recommended global shortcuts without enabling them', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.shortcuts.label')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'settings.shortcuts.action.restoreRecommended' }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ globalShortcuts: createRecommendedGlobalShortcuts() }));
  });

  it('resets the audio engine from playback settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);
    const resetButton = await screen.findByRole('button', { name: 'settings.playback.troubleshooting.softAction' });
    fireEvent.click(resetButton);

    await waitFor(() => expect(audioForceRestartMock).toHaveBeenCalledWith('settings-audio-force-restart'));
    expect(await screen.findByText('settings.playback.troubleshooting.softDone')).toBeTruthy();
  });

  it('confirms before restarting the Windows audio service from playback settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);
    const restartButton = await screen.findByRole('button', { name: 'settings.playback.troubleshooting.hardAction' });
    fireEvent.click(restartButton);

    expect(confirmSpy).toHaveBeenCalledWith('settings.playback.troubleshooting.hardConfirm');
    await waitFor(() => expect(audioRestartWindowsAudioServiceMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('settings.playback.troubleshooting.hardDone')).toBeTruthy();
  });

  it('saves the startup account check setting from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, autoAccountCheckOnStartup: false });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.integrations.label')[0]);
    const row = screen.getByText('启动时刷新账号登录状态').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ autoAccountCheckOnStartup: false }));
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
    clickSettingsNav('settings\\.nav\\.appearance\\.label');
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
