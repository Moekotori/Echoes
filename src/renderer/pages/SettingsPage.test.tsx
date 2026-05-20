// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import type { AppSettings } from '../../shared/types/appSettings';
import type { DownloadSettings } from '../../shared/types/downloads';
import { createDefaultGlobalShortcuts, createRecommendedGlobalShortcuts } from '../../shared/types/globalShortcuts';
import type { LibraryDatabaseProtectionStatus } from '../../shared/types/library';
import type { MvSettings } from '../../shared/types/mv';

const settings: AppSettings = {
  appearanceTheme: 'light',
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  artistWallAlbumFallbackForMissingAvatars: false,
  autoAccountCheckOnStartup: true,
  suppressAccountExpiryNotices: false,
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
  taskbarPlaybackControlsEnabled: false,
};

const getSettingsMock = vi.fn();
const setSettingsMock = vi.fn();
const resetSettingsMock = vi.fn();
const clearCacheMock = vi.fn();
const getDatabaseProtectionStatusMock = vi.fn();
const createDatabaseSnapshotMock = vi.fn();
const restoreDatabaseSnapshotMock = vi.fn();
const scrubQuarantinedDatabaseMock = vi.fn();
const openDataProtectionFolderMock = vi.fn();
const repairDatabaseMock = vi.fn();
const chooseLyricsWallpaperMock = vi.fn();
const chooseAppWallpaperMock = vi.fn();
const openExternalUrlMock = vi.fn();
const getDownloadSettingsMock = vi.fn();
const chooseDownloadOutputDirectoryMock = vi.fn();
const getCacheInventoryMock = vi.fn();
const audioGetStatusMock = vi.fn();
const audioListDevicesMock = vi.fn();
const audioSetOutputMock = vi.fn();
const audioResetEngineMock = vi.fn();
const audioForceRestartMock = vi.fn();
const audioRestartWindowsAudioServiceMock = vi.fn();
const validateGlobalShortcutMock = vi.fn();
const kickoffArtistImageBackfillMock = vi.fn();
const getArtistImageJobStatusMock = vi.fn();
const startReplayGainAnalysisMock = vi.fn();
const getReplayGainAnalysisStatusMock = vi.fn();
const openPluginDirectoryMock = vi.fn();
const createPluginExampleMock = vi.fn();

const downloadSettings: DownloadSettings = {
  audioStrategy: 'best_available',
  importToLibrary: true,
  bindMvAfterImport: true,
  outputDirectory: 'D:\\Downloads',
};

const healthyDatabaseProtectionStatus: LibraryDatabaseProtectionStatus = {
  status: 'ok',
  reason: 'none',
  dataProtectionPath: 'D:\\Echo\\data-protection',
  databasePath: 'D:\\Echo\\echo-library.sqlite',
  databaseSizeBytes: 4096,
  health: {
    status: 'ok',
    databasePath: 'D:\\Echo\\echo-library.sqlite',
    checkedAt: '2026-05-18T00:00:00.000Z',
  },
  snapshots: [
    {
      id: '2026-05-18T00-00-00-000Z-startup',
      path: 'D:\\Echo\\data-protection\\snapshots\\2026-05-18T00-00-00-000Z-startup',
      createdAt: '2026-05-18T00:00:00.000Z',
      reason: 'startup',
      copied: ['echo-library.sqlite'],
      skipped: ['echo-library.sqlite-wal', 'echo-library.sqlite-shm'],
      libraryHealth: {
        status: 'ok',
        databasePath: 'D:\\Echo\\data-protection\\snapshots\\2026-05-18T00-00-00-000Z-startup\\echo-library.sqlite',
        checkedAt: '2026-05-18T00:00:00.000Z',
      },
      libraryBackupMethod: 'sqlite-backup',
      databasePath: 'D:\\Echo\\data-protection\\snapshots\\2026-05-18T00-00-00-000Z-startup\\echo-library.sqlite',
      databaseSizeBytes: 4096,
    },
  ],
  latestHealthySnapshot: null,
  latestArchive: null,
  maintenanceEvents: [],
  canRestoreSnapshot: false,
  canScrubQuarantinedDatabase: false,
  hasRunningScan: false,
  recommendedAction: 'none',
};

healthyDatabaseProtectionStatus.latestHealthySnapshot = healthyDatabaseProtectionStatus.snapshots[0];
healthyDatabaseProtectionStatus.canRestoreSnapshot = true;

const playbackStatus = {
  host: 'ready',
  state: 'stopped',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: 'wasapi-shared',
  activeOutputBackendImpl: 'juce',
  outputMode: 'shared',
  sharedBackend: 'auto',
  useJuceOutputRequested: true,
  useJuceDecodeRequested: false,
  activeDecodeBackendImpl: null,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: null,
  currentTrackId: null,
  durationSeconds: 0,
  positionSeconds: 0,
  channels: null,
  codec: null,
  bitDepth: null,
  bitrate: null,
  fileSampleRate: null,
  decoderOutputSampleRate: null,
  requestedOutputSampleRate: null,
  actualDeviceSampleRate: null,
  sharedDeviceSampleRate: null,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: null,
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
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
    getCacheInventory: getCacheInventoryMock,
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
    exportDiagnostics: vi.fn().mockResolvedValue('D:\\Echo\\diagnostics.md'),
    getLastCrashSummary: vi.fn().mockResolvedValue(null),
    openDiagnosticsFolder: vi.fn(),
    openCrashReport: vi.fn().mockResolvedValue('D:\\Echo\\crash-report.md'),
    openAudioCrashReport: vi.fn().mockResolvedValue('D:\\Echo\\audio-crash-report.md'),
  }),
  getDownloadsBridge: () => ({
    getSettings: getDownloadSettingsMock,
    chooseOutputDirectory: chooseDownloadOutputDirectoryMock,
  }),
  getPluginsBridge: () => ({
    openDirectory: openPluginDirectoryMock,
    createExample: createPluginExampleMock,
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
    getDatabaseProtectionStatus: getDatabaseProtectionStatusMock,
    createDatabaseSnapshot: createDatabaseSnapshotMock,
    restoreDatabaseSnapshot: restoreDatabaseSnapshotMock,
    scrubQuarantinedDatabase: scrubQuarantinedDatabaseMock,
    openDataProtectionFolder: openDataProtectionFolderMock,
    repairDatabase: repairDatabaseMock,
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
    startReplayGainAnalysis: startReplayGainAnalysisMock,
    getReplayGainAnalysisStatus: getReplayGainAnalysisStatusMock,
  }),
}));

vi.mock('../components/audio/EqPanel', () => ({
  EqPanel: () => <div />,
}));

vi.mock('../components/library/LibraryFoldersPanel', () => ({
  LibraryFoldersPanel: () => <div />,
}));

vi.mock('../components/library/LibraryDiagnosticsPanel', () => ({
  LibraryDiagnosticsPanel: () => <div />,
}));

vi.mock('../components/library/LibraryHealthReportPanel', () => ({
  LibraryHealthReportPanel: () => <div />,
}));

vi.mock('../components/library/LibraryQualityPanel', () => ({
  LibraryQualityPanel: () => <div />,
}));

vi.mock('../components/library/NetworkMetadataPanel', () => ({
  NetworkMetadataPanel: () => <div />,
}));

vi.mock('../components/settings/RemoteSourcesPanel', () => ({
  RemoteSourcesPanel: () => <div />,
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => ({
    automixEnabled: false,
    setAutomixEnabled: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getDownloadSettingsMock.mockResolvedValue(downloadSettings);
  chooseDownloadOutputDirectoryMock.mockResolvedValue({ ...downloadSettings, outputDirectory: 'E:\\Music Downloads' });
  getCacheInventoryMock.mockResolvedValue({
    generatedAt: '2026-05-20T00:00:00.000Z',
    totalSizeBytes: 0,
    items: [],
  });
  getDatabaseProtectionStatusMock.mockResolvedValue(healthyDatabaseProtectionStatus);
  createDatabaseSnapshotMock.mockResolvedValue(healthyDatabaseProtectionStatus);
  restoreDatabaseSnapshotMock.mockResolvedValue({
    databasePath: healthyDatabaseProtectionStatus.databasePath,
    archivePath: 'D:\\Echo\\data-protection\\corrupt-archives\\old',
    restoredSnapshot: healthyDatabaseProtectionStatus.snapshots[0],
    restoredDatabaseFiles: ['echo-library.sqlite'],
    health: healthyDatabaseProtectionStatus.health,
  });
  scrubQuarantinedDatabaseMock.mockResolvedValue({
    databasePath: healthyDatabaseProtectionStatus.databasePath,
    sourceArchivePath: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned',
    scrubbedDatabasePath: 'D:\\Echo\\data-protection\\scrubbed-libraries\\metadata-scrub\\echo-library.sqlite',
    archivePath: null,
    replacedDatabaseFiles: [],
    scrubbedRows: 1,
    health: healthyDatabaseProtectionStatus.health,
    poisonReportBefore: {
      status: 'poisoned',
      reason: 'poisoned_metadata',
      checkedAt: '2026-05-18T00:00:00.000Z',
      databasePath: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned\\echo-library.sqlite',
      suspectCounts: { 'tracks.title': 1 },
      maxFieldLengths: { 'tracks.title': 1000000 },
    },
    poisonReportAfter: {
      status: 'ok',
      reason: 'none',
      checkedAt: '2026-05-18T00:00:01.000Z',
      databasePath: 'D:\\Echo\\data-protection\\scrubbed-libraries\\metadata-scrub\\echo-library.sqlite',
      suspectCounts: {},
      maxFieldLengths: {},
    },
  });
  repairDatabaseMock.mockResolvedValue({
    databasePath: healthyDatabaseProtectionStatus.databasePath,
    archivePath: 'D:\\Echo\\data-protection\\corrupt-archives\\bad',
    removedDatabaseFiles: ['echo-library.sqlite'],
    readyForRescan: true,
  });
  openDataProtectionFolderMock.mockResolvedValue(undefined);
  audioGetStatusMock.mockResolvedValue(null);
  audioListDevicesMock.mockResolvedValue([]);
  audioSetOutputMock.mockResolvedValue(null);
  audioResetEngineMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  audioForceRestartMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  audioRestartWindowsAudioServiceMock.mockResolvedValue({ state: 'stopped', warnings: [] });
  openExternalUrlMock.mockResolvedValue(undefined);
  openPluginDirectoryMock.mockResolvedValue(undefined);
  createPluginExampleMock.mockResolvedValue({ pluginId: 'echo.playback-panel', directory: 'D:\\Echo\\plugins\\echo.playback-panel' });
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
  startReplayGainAnalysisMock.mockResolvedValue({
    id: 'replay-gain-job',
    status: 'completed',
    totalTracks: 0,
    processedTracks: 0,
    updatedTracks: 0,
    errorCount: 0,
  });
  getReplayGainAnalysisStatusMock.mockResolvedValue({
    id: 'replay-gain-job',
    status: 'completed',
    totalTracks: 0,
    processedTracks: 0,
    updatedTracks: 0,
    errorCount: 0,
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
  window.sessionStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
  delete document.documentElement.dataset.themePreset;
  delete document.documentElement.dataset.themeCustom;
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

  it('finds the plugin settings entry and highlights the stable plugin row', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    const searchInput = screen.getByPlaceholderText('settings.header.searchPlaceholder') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'manifest' } });
    fireEvent.click(screen.getByRole('option', { name: /本地插件/ }));

    expect(searchInput.value).toBe('');
    const row = screen.getByText('本地插件').closest('.setting-row') as HTMLElement;
    expect(row.id).toBe('settings-row-plugins');
    expect(row.getAttribute('data-search-highlight')).toBe('true');
  });

  it('offers plugin actions from settings without duplicating the full manager', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const navigatePlugins = vi.fn();
    window.addEventListener('app:navigate:plugins', navigatePlugins);
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.plugins\\.label');
    fireEvent.click(screen.getByRole('button', { name: /打开插件页/ }));
    fireEvent.click(screen.getByRole('button', { name: /打开插件目录/ }));
    fireEvent.click(screen.getByRole('button', { name: /新建示例插件/ }));
    fireEvent.click(screen.getByRole('button', { name: /查看插件文档/ }));

    expect(navigatePlugins).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(openPluginDirectoryMock).toHaveBeenCalledTimes(1));
    expect(createPluginExampleMock).toHaveBeenCalledWith('playback-panel');
    expect(openExternalUrlMock).toHaveBeenCalledWith('https://github.com/moekotori/echo/blob/main/docs/ECHO_NEXT_PLUGINS.md');
    window.removeEventListener('app:navigate:plugins', navigatePlugins);
  });

  it('documents the v1 plugin manifest, permissions, API, examples, and security boundaries', () => {
    const documentText = readFileSync(join(process.cwd(), 'docs', 'ECHO_NEXT_PLUGINS.md'), 'utf8');

    expect(documentText).toContain('echo.plugin.json');
    expect(documentText).toContain('## 权限');
    expect(documentText).toContain('## 公开 API');
    expect(documentText).toContain('## 示例模板');
    expect(documentText).toContain('## 安全边界');
  });

  it('finds lyrics settings when searching for translation', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    const searchInput = screen.getByPlaceholderText('settings.header.searchPlaceholder') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '翻译' } });
    fireEvent.click(screen.getByRole('option', { name: /route\.lyricsSettings\.label/ }));

    expect(searchInput.value).toBe('');
    expect(screen.getByText('显示中文翻译')).toBeTruthy();
  });

  it('shows database protection health in danger settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');

    await waitFor(() => expect(getDatabaseProtectionStatusMock).toHaveBeenCalled());
    expect(screen.getByText('曲库数据库安全')).toBeTruthy();
    expect(screen.getAllByText('健康').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /恢复最近健康快照/ })).toBeTruthy();
  });

  it('shows recovery steps for corrupt status and ignores wrong restore confirmation word', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDatabaseProtectionStatusMock.mockResolvedValue({
      ...healthyDatabaseProtectionStatus,
      health: {
        ...healthyDatabaseProtectionStatus.health,
        status: 'corrupt',
        message: 'database disk image is malformed',
      },
      recommendedAction: 'restore-snapshot',
    });
    vi.spyOn(window, 'prompt').mockReturnValue('取消');

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');
    await screen.findByText('疑似损坏');

    fireEvent.click(screen.getByRole('button', { name: /恢复最近健康快照/ }));

    expect(restoreDatabaseSnapshotMock).not.toHaveBeenCalled();
    expect(screen.getByText('确认词不匹配，已取消。')).toBeTruthy();
  });

  it('shows disaster recovery when no healthy snapshot can be restored', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDatabaseProtectionStatusMock.mockResolvedValue({
      ...healthyDatabaseProtectionStatus,
      health: {
        ...healthyDatabaseProtectionStatus.health,
        status: 'corrupt',
        message: 'database disk image is malformed',
      },
      latestHealthySnapshot: null,
      canRestoreSnapshot: false,
      recommendedAction: 'rebuild-empty-database',
      unrecoverableReason: '当前数据库不可用，且没有可恢复的健康快照。',
    });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');

    await screen.findByText('疑似损坏');
    expect(screen.getByText(/数据库无法从健康快照恢复/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /归档坏库并重建空库/ })).toBeTruthy();
  });

  it('repairs a quarantined poisoned library through the scrub action', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDatabaseProtectionStatusMock.mockResolvedValueOnce({
      ...healthyDatabaseProtectionStatus,
      status: 'quarantined',
      reason: 'poisoned_metadata',
      archivePath: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned',
      latestArchive: {
        id: 'poisoned',
        path: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned',
        createdAt: '2026-05-20T00:00:00.000Z',
        reason: 'startup-poisoned-library',
        copied: ['echo-library.sqlite'],
        databasePath: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned\\echo-library.sqlite',
        databaseSizeBytes: 4096,
      },
      poisonReport: {
        status: 'poisoned',
        reason: 'poisoned_metadata',
        checkedAt: '2026-05-20T00:00:00.000Z',
        databasePath: 'D:\\Echo\\data-protection\\corrupt-archives\\poisoned\\echo-library.sqlite',
        suspectCounts: { 'tracks.title': 1 },
        maxFieldLengths: { 'tracks.title': 1000000 },
      },
      canScrubQuarantinedDatabase: true,
      recommendedAction: 'scrub-quarantined-database',
    }).mockResolvedValueOnce(healthyDatabaseProtectionStatus);
    vi.spyOn(window, 'prompt').mockReturnValue('修复隔离曲库');

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');
    fireEvent.click(await screen.findByRole('button', { name: /修复隔离库副本/ }));

    await waitFor(() => expect(scrubQuarantinedDatabaseMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/已修复隔离曲库副本并恢复/)).toBeTruthy();
  });

  it('does not rebuild an unrecoverable database when the confirmation word is wrong', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    getDatabaseProtectionStatusMock.mockResolvedValue({
      ...healthyDatabaseProtectionStatus,
      health: {
        ...healthyDatabaseProtectionStatus.health,
        status: 'corrupt',
      },
      latestHealthySnapshot: null,
      canRestoreSnapshot: false,
      recommendedAction: 'rebuild-empty-database',
      unrecoverableReason: '当前数据库不可用，且没有可恢复的健康快照。',
    });
    vi.spyOn(window, 'prompt').mockReturnValue('取消');

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');
    fireEvent.click(await screen.findByRole('button', { name: /归档坏库并重建空库/ }));

    expect(repairDatabaseMock).not.toHaveBeenCalled();
    expect(screen.getByText('确认词不匹配，已取消。')).toBeTruthy();
  });

  it('rebuilds an unrecoverable database after the exact confirmation word', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    const unrecoverableStatus: LibraryDatabaseProtectionStatus = {
      ...healthyDatabaseProtectionStatus,
      health: {
        ...healthyDatabaseProtectionStatus.health,
        status: 'corrupt',
      },
      latestHealthySnapshot: null,
      canRestoreSnapshot: false,
      recommendedAction: 'rebuild-empty-database',
      unrecoverableReason: '当前数据库不可用，且没有可恢复的健康快照。',
    };
    getDatabaseProtectionStatusMock.mockResolvedValueOnce(unrecoverableStatus).mockResolvedValueOnce({
      ...healthyDatabaseProtectionStatus,
      latestHealthySnapshot: null,
      canRestoreSnapshot: false,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('重建空库');

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.danger\\.label');
    fireEvent.click(await screen.findByRole('button', { name: /归档坏库并重建空库/ }));

    await waitFor(() => expect(repairDatabaseMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getDatabaseProtectionStatusMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/已归档坏库并重建为空库/)).toBeTruthy();
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
    const darkButton = screen.getAllByRole('button', { name: /settings\.appearance\.theme\.dark/ })[0];
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

  it('saves The Dark Side of the Moon theme preset from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.appearance\\.label');
    const presetButton = screen.getByText('settings.appearance.themePreset.darkSideMoon').closest('button') as HTMLButtonElement;
    fireEvent.click(presetButton);

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ appearanceThemePreset: 'darkSideMoon' }));
    expect(presetButton.className).toContain('active');
    expect(document.documentElement.dataset.themePreset).toBe('darkSideMoon');
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
    expect(kickoffArtistImageBackfillMock).toHaveBeenCalledWith({ force: false, limit: 500 });
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
    fireEvent.click(await screen.findByRole('checkbox', { name: /迷你底栏/ }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));
  });

  it('saves synced MV settings from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('route.mvSettings.label')[0]);

    const autoSearchToggle = screen.getByText('mvSettings.network.autoApply').closest('.settings-inline-toggle') as HTMLElement;
    fireEvent.click(within(autoSearchToggle).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ mvAutoSearch: false }));

    fireEvent.click(screen.getByRole('button', { name: '4K' }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ mvMaxQuality: '2160p' }));
  });

  it('maps MV drawer settings events into the Settings page state', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('route.mvSettings.label')[0]);
    const autoSearchToggle = screen.getByText('mvSettings.network.autoApply').closest('.settings-inline-toggle') as HTMLElement;
    expect(within(autoSearchToggle).getByRole('button').getAttribute('aria-pressed')).toBe('true');

    window.dispatchEvent(
      new CustomEvent('settings:changed', {
        detail: { autoSearch: false, maxQuality: '2160p' } satisfies Partial<MvSettings>,
      }),
    );

    await waitFor(() => expect(within(autoSearchToggle).getByRole('button').getAttribute('aria-pressed')).toBe('false'));
    expect(screen.getByRole('button', { name: '4K' }).className).toContain('active');
  });

  it('shows volume balancing controls and starts missing loudness analysis', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue({
      ...settings,
      gaplessPlaybackEnabled: false,
      replayGainEnabled: false,
      replayGainMode: 'track',
      replayGainTargetLufs: -18,
      replayGainPreampDb: 0,
      replayGainPreventClipping: true,
      replayGainAnalyzeOnPlay: true,
      replayGainAnalyzeMissingOnScan: false,
    });
    setSettingsMock.mockImplementation(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    startReplayGainAnalysisMock.mockResolvedValue({
      id: 'replay-gain-job',
      status: 'running',
      totalTracks: 2,
      processedTracks: 0,
      updatedTracks: 0,
      errorCount: 0,
    });
    getReplayGainAnalysisStatusMock.mockResolvedValue({
      id: 'replay-gain-job',
      status: 'completed',
      totalTracks: 2,
      processedTracks: 2,
      updatedTracks: 2,
      errorCount: 0,
    });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);

    const gaplessRow = screen.getByText('真无缝播放').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(gaplessRow).getByRole('button'));

    const row = screen.getByText('音量自动平衡').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByText('未开启').closest('.settings-inline-toggle')?.querySelector('button') as HTMLButtonElement);
    fireEvent.click(within(row).getByRole('button', { name: '高级' }));
    fireEvent.click(within(row).getByText('播放时分析').closest('.settings-inline-toggle')?.querySelector('button') as HTMLButtonElement);
    fireEvent.click(within(row).getByRole('button', { name: '专辑' }));
    fireEvent.click(within(row).getByRole('button', { name: '分析缺失音量' }));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ gaplessPlaybackEnabled: true }));
    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ replayGainEnabled: true }));
    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ replayGainAnalyzeOnPlay: false }));
    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ replayGainMode: 'album' }));
    await waitFor(() => expect(startReplayGainAnalysisMock).toHaveBeenCalledWith({ limit: 500 }));
    expect(await within(row).findByText('2/2')).toBeTruthy();
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

  it('syncs the playback output select from the active device name when the host has no device id', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });
    audioGetStatusMock.mockResolvedValue({
      ...playbackStatus,
      outputDeviceName: 'USB DAC B',
    });
    audioListDevicesMock.mockResolvedValue([
      {
        id: 'shared-a',
        index: 0,
        name: 'USB DAC A',
        outputMode: 'shared',
        sampleRate: 48000,
        sharedDeviceSampleRate: 48000,
        isDefault: true,
      },
      {
        id: 'shared-b',
        index: 1,
        name: 'USB DAC B',
        outputMode: 'shared',
        sampleRate: 96000,
        sharedDeviceSampleRate: 96000,
        isDefault: false,
      },
    ]);

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.playback.label')[0]);

    expect(await screen.findByText('1 - USB DAC B')).toBeTruthy();
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

  it('saves the account expiry notice suppression setting from Settings', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    setSettingsMock.mockResolvedValue({ ...settings, suppressAccountExpiryNotices: true });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    fireEvent.click(screen.getAllByText('settings.nav.integrations.label')[0]);
    const row = screen.getByText('关闭账号失效通知').closest('.setting-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(setSettingsMock).toHaveBeenCalledWith({ suppressAccountExpiryNotices: true }));
  });

  it('shows app wallpaper controls only after choosing a custom background', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /选择背景/ }));

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        appCustomWallpaperPath: wallpaperPath,
        appWallpaperMediaType: 'image',
      }),
    );
    expect(await screen.findByText('壁纸缩放')).toBeTruthy();
    expect(screen.getByText('壁纸模糊度')).toBeTruthy();
    expect(screen.getByText('壁纸亮度')).toBeTruthy();
    expect(screen.getByText('UI 透明度')).toBeTruthy();
    expect(screen.getByText('统一透明度')).toBeTruthy();
  });

  it('shows video wallpaper performance mode after choosing a local video background', async () => {
    const wallpaperPath = 'D:\\Echo\\app-wallpapers\\motion.mp4';
    Element.prototype.scrollIntoView = vi.fn();
    getSettingsMock.mockResolvedValue(settings);
    chooseAppWallpaperMock.mockResolvedValue(wallpaperPath);
    setSettingsMock.mockResolvedValue({
      ...settings,
      appCustomWallpaperPath: wallpaperPath,
      appWallpaperMediaType: 'video',
      appVideoWallpaperPauseMode: 'smart',
    });
    resetSettingsMock.mockResolvedValue(settings);
    clearCacheMock.mockResolvedValue({ scannedCount: 0, removedCount: 0, deletedCoverCacheFiles: 0, freedCoverCacheBytes: 0 });

    render(<SettingsPage />);

    await screen.findByText('route.settings.label');
    clickSettingsNav('settings\\.nav\\.appearance\\.label');
    fireEvent.click(screen.getByRole('button', { name: /选择背景/ }));

    await waitFor(() =>
      expect(setSettingsMock).toHaveBeenCalledWith({
        appCustomWallpaperPath: wallpaperPath,
        appWallpaperMediaType: 'video',
      }),
    );
    expect(await screen.findByText('视频壁纸 · 静音循环')).toBeTruthy();
    expect(screen.getByRole('button', { name: /智能暂停/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /最小化暂停/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /始终播放/ })).toBeTruthy();
  });
});
