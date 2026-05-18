import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { app } from 'electron';
import type {
  AppLocale,
  AppThemeMode,
  AppThemePresetOverride,
  AppThemePresetOverrides,
  AppThemeToneOverride,
  AppThemePreset,
  AppearancePreferences,
  AppSettings,
  LyricsBackgroundMode,
  LyricsMiniPlayerColorMode,
  RememberedAudioOutput,
  RememberedWindowSize,
  ReplayGainMode,
} from '../../shared/types/appSettings';
import type { LyricsProviderId } from '../../shared/types/lyrics';
import type { LibrarySort } from '../../shared/types/library';
import type { MvSettings, NetworkMvProviderId } from '../../shared/types/mv';
import {
  createDefaultGlobalShortcuts,
  globalShortcutActions,
  validateGlobalShortcutAccelerator,
  type GlobalShortcutSettings,
} from '../../shared/types/globalShortcuts';
import {
  channelBalanceMaxBalance,
  channelBalanceMaxGainDb,
  channelBalanceMinBalance,
  channelBalanceMinGainDb,
  type ChannelBalanceMonoMode,
  type ChannelBalanceState,
} from '../../shared/types/audio';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const wallpaperExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const defaultLyricsColor = '#314054';
const defaultLyricsMiniPlayerColor = '#232120';
const mvNetworkProviders: NetworkMvProviderId[] = ['bilibili', 'youtube'];
const lyricsProviders: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic', 'musixmatch', 'genius', 'manual'];
const defaultLyricsProviderOrder: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic'];
const appMemoryVersion = 2;
const locales: AppLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];
const appThemeModes: AppThemeMode[] = ['light', 'dark', 'system'];
const appThemePresets: AppThemePreset[] = [
  'classic',
  'echoTwilight',
  'sakuraMilk',
  'peachSoda',
  'mintCandy',
  'berryDream',
  'matchaCream',
  'lemonMochi',
  'cottonCloud',
  'melonCream',
  'seaSaltJelly',
  'caramelPudding',
  'neonCandy',
  'nyanCat',
  'wisteriaBubble',
  'strawberryCookie',
  'graphiteAurora',
  'amberNoir',
  'oceanStudio',
  'rosewoodVinyl',
  'darkSideMoon',
  'shibuyaNight',
  'kyotoKurenai',
  'ukiyoIndigo',
  'fujiSnow',
  'matsuriLantern',
  'ginzaNoir',
  'frostJazz',
];
const themeOverrideColorKeys: Array<keyof Pick<
  AppThemeToneOverride,
  'appBg' | 'appBg2' | 'appBg3' | 'panel' | 'panelSoft' | 'accent' | 'accentStrong' | 'secondary' | 'heading' | 'text' | 'muted' | 'border' | 'onAccent' | 'buttonText'
>> = ['appBg', 'appBg2', 'appBg3', 'panel', 'panelSoft', 'accent', 'accentStrong', 'secondary', 'heading', 'text', 'muted', 'border', 'onAccent', 'buttonText'];
const librarySorts: LibrarySort[] = [
  'default',
  'createdAsc',
  'createdDesc',
  'titleAsc',
  'titleDesc',
  'durationAsc',
  'durationDesc',
  'qualityAsc',
  'qualityDesc',
  'frequent',
  'random',
  'title',
  'artist',
  'album',
  'recent',
];

export const defaultAppearancePreferences: AppearancePreferences = {
  mainFontFamily: 'Outfit',
  mainFontFilePath: null,
  chineseFontFamily: 'Microsoft YaHei',
  chineseFontFilePath: null,
  baseFontSize: 14,
  lineHeight: 1.35,
  textDepth: 62,
};

const defaultRememberedAudioOutput: RememberedAudioOutput = {
  enabled: false,
  outputMode: 'shared',
  sharedBackend: 'auto',
  latencyProfile: 'balanced',
};
const lowLatencyMaxBufferSizeFrames = 2048;

const sanitizeRememberedBufferSizeFrames = (
  outputMode: RememberedAudioOutput['outputMode'],
  latencyProfile: RememberedAudioOutput['latencyProfile'],
  bufferSizeFrames: number,
): number | undefined => {
  if (!Number.isFinite(bufferSizeFrames) || bufferSizeFrames <= 0) {
    return undefined;
  }

  const rounded = Math.round(bufferSizeFrames);
  if (latencyProfile !== 'lowLatency' || rounded <= lowLatencyMaxBufferSizeFrames) {
    return rounded;
  }

  return outputMode === 'shared' ? undefined : lowLatencyMaxBufferSizeFrames;
};

const normalizeRememberedWindowSize = (value: unknown): RememberedWindowSize | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Partial<RememberedWindowSize>;
  const width = Number(input.width);
  const height = Number(input.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    width: Math.round(clamp(width, 360, 3840)),
    height: Math.round(clamp(height, 620, 2160)),
  };
};

export const getLyricsWallpaperDirectory = (): string => join(app.getPath('userData'), 'lyrics-wallpapers');
export const getAppWallpaperDirectory = (): string => join(app.getPath('userData'), 'app-wallpapers');

const isPathInsideDirectory = (directory: string, filePath: string): boolean => {
  const relativePath = relative(resolve(directory), resolve(filePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
};

export const defaultChannelBalanceSettings: ChannelBalanceState = {
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
};

export const defaultSettings: AppSettings = {
  appMemoryVersion,
  locale: 'zh-CN',
  appearanceTheme: 'dark',
  appearanceThemePreset: 'classic',
  appearanceThemePresetOverrides: {},
  appearancePreferences: { ...defaultAppearancePreferences },
  songsSort: 'default',
  rememberedAudioOutput: { ...defaultRememberedAudioOutput },
  hiddenAudioDeviceKeys: [],
  audioUseJuceOutput: true,
  audioUseJuceDecode: false,
  audioDsdOutputMode: 'pcm',
  audioAsioNativeDsdExperimentalEnabled: false,
  audioAsioUnavailableFallbackEnabled: false,
  audioSoxrFallbackEnabled: true,
  audioReleaseExclusiveOnPauseExperimentalEnabled: false,
  albumMergeStrategy: 'standard',
  chineseCrossScriptSearchEnabled: true,
  artistWallAlbumArtwork: false,
  artistWallAlbumFallbackForMissingAvatars: false,
  autoFetchArtistImages: false,
  artistImageFetchPaused: false,
  autoUpdateEnabled: true,
  autoAccountCheckOnStartup: true,
  spotifyAutoLaunchOfficialPlayer: true,
  playlistBackupsEnabled: true,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  rememberWindowSizeEnabled: true,
  rememberedWindowSize: null,
  appCustomWallpaperPath: null,
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperVisualProtectionEnabled: true,
  appWallpaperUnifiedOpacityEnabled: false,
  networkMetadataEnabled: false,
  networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  audioAnalysisEnabled: true,
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: [...defaultLyricsProviderOrder],
  lyricsProviderOrder: [...defaultLyricsProviderOrder],
  lyricsProviderTimeoutMs: 4500,
  lyricsTotalMatchTimeoutMs: 6000,
  lyricsCoverAutoAcceptScore: 0.97,
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsOffsetControlsEnabled: false,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsMvAutoShowTrackInfoDisabled: true,
  lyricsCandidatePanelAutoOpenEnabled: true,
  lyricsEmptyStateHidden: true,
  lyricsPlayerBarDrawerEnabled: false,
  lyricsPlayerBarDrawerOpacityPercent: 78,
  lyricsPlayerBarDrawerColorMode: 'default',
  lyricsPlayerBarDrawerColor: defaultLyricsMiniPlayerColor,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsColor: defaultLyricsColor,
  lyricsSmartReadableColorsEnabled: false,
  lyricsHighResolutionNetworkCoverEnabled: false,
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabled: true,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvAutoPreload: true,
  mvAutoApplyThreshold: 0.7,
  mvImmersiveBackground: true,
  mvImmersiveBackgroundScalePercent: 115,
  mvImmersiveBackgroundOffsetXPercent: 50,
  mvImmersiveBackgroundOffsetYPercent: 50,
  mvImmersiveBackgroundBlurPx: 0,
  mvImmersiveBackgroundBrightnessPercent: 100,
  mvImmersiveBackgroundOverlayOpacityPercent: 0,
  mvLyricsReadabilityEnhanced: false,
  mvRestartAudioOnLoad: false,
  mvReplayAudioOnChange: true,
  mvMaxQuality: 'max',
  mvAllow60fps: true,
  channelBalance: defaultChannelBalanceSettings,
  playerVolume: 1,
  replayGainEnabled: false,
  replayGainMode: 'track',
  replayGainTargetLufs: -18,
  replayGainPreampDb: 0,
  replayGainPreventClipping: true,
  replayGainAnalyzeOnPlay: true,
  replayGainAnalyzeMissingOnScanOptIn: false,
  replayGainAnalyzeMissingOnScan: false,
  backgroundSpacePauseEnabled: false,
  globalShortcuts: createDefaultGlobalShortcuts(),
  playbackFollowCurrentTrack: false,
  playbackSpeed: 1,
  playbackSpeedMode: 'nightcore',
  scanPerformanceMode: 'balanced',
  duplicateTracksEnabled: true,
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

let cachedSettings: AppSettings | null = null;

const getSettingsPath = (): string => join(app.getPath('userData'), 'echo-settings.json');

const normalizeCoverCacheDir = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? resolve(trimmed) : null;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeRequiredText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.replace(/[\r\n;]/g, '').trim();
  return normalized || fallback;
};

const normalizeFontPath = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/[\r\n]/g, '').trim();
  return normalized || null;
};

const normalizeLocale = (value: unknown): AppLocale =>
  locales.includes(value as AppLocale) ? (value as AppLocale) : 'zh-CN';

const normalizeAppearanceTheme = (value: unknown): AppThemeMode =>
  appThemeModes.includes(value as AppThemeMode) ? (value as AppThemeMode) : defaultSettings.appearanceTheme;

const normalizeAppearanceThemePreset = (value: unknown): AppThemePreset =>
  appThemePresets.includes(value as AppThemePreset) ? (value as AppThemePreset) : defaultSettings.appearanceThemePreset ?? 'classic';

const normalizeThemeHexColorSetting = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : undefined;
};

const normalizeThemeOverridePercent = (value: unknown, min: number, max: number): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(clamp(numeric, min, max)) : undefined;
};

const normalizeThemeToneOverride = (value: unknown): AppThemeToneOverride | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Partial<AppThemeToneOverride>;
  const output: AppThemeToneOverride = {};

  for (const key of themeOverrideColorKeys) {
    const color = normalizeThemeHexColorSetting(input[key]);
    if (color) {
      (output as Record<string, string>)[key] = color;
    }
  }

  const panelOpacityPercent = normalizeThemeOverridePercent(input.panelOpacityPercent, 40, 100);
  const glassPercent = normalizeThemeOverridePercent(input.glassPercent, 0, 80);
  const shadowPercent = normalizeThemeOverridePercent(input.shadowPercent, 0, 100);

  if (panelOpacityPercent !== undefined) {
    output.panelOpacityPercent = panelOpacityPercent;
  }
  if (glassPercent !== undefined) {
    output.glassPercent = glassPercent;
  }
  if (shadowPercent !== undefined) {
    output.shadowPercent = shadowPercent;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

const normalizeThemePresetOverride = (value: unknown): AppThemePresetOverride | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Partial<AppThemePresetOverride>;
  const light = normalizeThemeToneOverride(input.light);
  const dark = normalizeThemeToneOverride(input.dark);
  const output: AppThemePresetOverride = {};

  if (light) {
    output.light = light;
  }
  if (dark) {
    output.dark = dark;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

const normalizeThemePresetOverrides = (value: unknown): AppThemePresetOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Partial<Record<string, unknown>>;
  const output: AppThemePresetOverrides = {};

  for (const preset of appThemePresets) {
    const override = normalizeThemePresetOverride(input[preset]);
    if (override) {
      output[preset] = override;
    }
  }

  return output;
};

const normalizeSongsSort = (value: unknown): LibrarySort =>
  librarySorts.includes(value as LibrarySort) ? (value as LibrarySort) : 'default';

const normalizeReplayGainMode = (value: unknown): ReplayGainMode =>
  value === 'track' || value === 'album' || value === 'off' ? value : 'track';

const normalizeAppearancePreferences = (value: unknown): AppearancePreferences => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultAppearancePreferences };
  }

  const input = value as Partial<AppearancePreferences>;
  const baseFontSize = Number(input.baseFontSize);
  const lineHeight = Number(input.lineHeight);
  const textDepth = Number(input.textDepth);

  return {
    mainFontFamily: normalizeRequiredText(input.mainFontFamily, defaultAppearancePreferences.mainFontFamily),
    mainFontFilePath: normalizeFontPath(input.mainFontFilePath),
    chineseFontFamily: normalizeRequiredText(input.chineseFontFamily, defaultAppearancePreferences.chineseFontFamily),
    chineseFontFilePath: normalizeFontPath(input.chineseFontFilePath),
    baseFontSize: Number.isFinite(baseFontSize)
      ? clamp(baseFontSize, 12, 18)
      : defaultAppearancePreferences.baseFontSize,
    lineHeight: Number.isFinite(lineHeight)
      ? clamp(lineHeight, 1.1, 1.8)
      : defaultAppearancePreferences.lineHeight,
    textDepth: Number.isFinite(textDepth)
      ? clamp(textDepth, 35, 100)
      : defaultAppearancePreferences.textDepth,
  };
};

const normalizeRememberedAudioOutput = (value: unknown): RememberedAudioOutput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultRememberedAudioOutput };
  }

  const input = value as Partial<RememberedAudioOutput>;
  const outputMode = input.outputMode === 'exclusive' || input.outputMode === 'asio' ? input.outputMode : 'shared';
  const sharedBackend =
    input.sharedBackend === 'directsound' || input.sharedBackend === 'windows'
      ? input.sharedBackend
      : defaultRememberedAudioOutput.sharedBackend;
  const latencyProfile =
    input.latencyProfile === 'stable' || input.latencyProfile === 'balanced' || input.latencyProfile === 'lowLatency'
      ? input.latencyProfile
      : defaultRememberedAudioOutput.latencyProfile;
  const deviceIndex = Number(input.deviceIndex);
  const deviceName = normalizeOptionalText(input.deviceName) ?? undefined;
  const asioOutputChannelStart = Number(input.asioOutputChannelStart);
  const bufferSizeFrames = Number(input.bufferSizeFrames);
  const normalized: RememberedAudioOutput = {
    enabled: input.enabled === true,
    outputMode,
    sharedBackend,
    latencyProfile,
    deviceIndex: Number.isInteger(deviceIndex) ? deviceIndex : undefined,
    deviceName,
    asioOutputChannelStart: outputMode === 'asio' && Number.isInteger(asioOutputChannelStart) && asioOutputChannelStart >= 0
      ? Math.round(asioOutputChannelStart)
      : undefined,
  };

  const normalizedBufferSizeFrames = sanitizeRememberedBufferSizeFrames(outputMode, latencyProfile, bufferSizeFrames);
  if (normalizedBufferSizeFrames !== undefined) {
    normalized.bufferSizeFrames = normalizedBufferSizeFrames;
  }

  return normalized;
};

const normalizeHiddenAudioDeviceKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((key): key is string => typeof key === 'string' && key.trim().length > 0)));
};

const normalizeGlobalShortcuts = (value: unknown): GlobalShortcutSettings => {
  const shortcuts = createDefaultGlobalShortcuts();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return shortcuts;
  }

  const input = value as Partial<Record<keyof GlobalShortcutSettings, Partial<GlobalShortcutSettings[keyof GlobalShortcutSettings]>>>;
  const usedAccelerators = new Set<string>();

  for (const action of globalShortcutActions) {
    const binding = input[action];
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      continue;
    }

    const validation = validateGlobalShortcutAccelerator(binding.accelerator);
    if (!validation.valid || !validation.accelerator) {
      shortcuts[action] = { enabled: false, accelerator: null };
      continue;
    }

    const accelerator = validation.accelerator;
    const acceleratorKey = accelerator.toLowerCase();
    if (usedAccelerators.has(acceleratorKey)) {
      shortcuts[action] = { enabled: false, accelerator: null };
      continue;
    }

    usedAccelerators.add(acceleratorKey);
    shortcuts[action] = {
      enabled: binding.enabled === true,
      accelerator,
    };
  }

  return shortcuts;
};

const normalizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
};

const normalizeLyricsColor = (value: unknown): string => normalizeHexColor(value, defaultLyricsColor);

const normalizeLyricsBackgroundMode = (value: unknown): LyricsBackgroundMode =>
  value === 'cover' || value === 'customWallpaper' || value === 'theme' ? value : defaultSettings.lyricsBackgroundMode;

const normalizeLyricsMiniPlayerColorMode = (value: unknown): LyricsMiniPlayerColorMode =>
  value === 'custom' || value === 'cover' || value === 'default' ? value : defaultSettings.lyricsPlayerBarDrawerColorMode ?? 'default';

const normalizeMvProviderList = (value: unknown, fallback: NetworkMvProviderId[]): NetworkMvProviderId[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const providers = value.filter((provider): provider is NetworkMvProviderId =>
    mvNetworkProviders.includes(provider as NetworkMvProviderId),
  );
  return [...new Set(providers)];
};

const normalizeLyricsProviderList = (value: unknown, fallback: LyricsProviderId[]): LyricsProviderId[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const providers = value.filter((provider): provider is LyricsProviderId => lyricsProviders.includes(provider as LyricsProviderId));
  return [...new Set(providers)];
};

const normalizeMvMaxQuality = (value: unknown): MvSettings['maxQuality'] =>
  value === '720p' || value === '1080p' || value === '1440p' || value === '2160p' || value === 'max' ? value : defaultSettings.mvMaxQuality;

const normalizeWallpaperPath = (value: unknown, directory: string): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = resolve(value.trim());
  if (!normalized || !wallpaperExtensions.has(extname(normalized).toLowerCase())) {
    return null;
  }

  if (!isPathInsideDirectory(directory, normalized) || !existsSync(normalized)) {
    return null;
  }

  return normalized;
};

const normalizeLyricsWallpaperPath = (value: unknown): string | null => normalizeWallpaperPath(value, getLyricsWallpaperDirectory());

const normalizeAppWallpaperPath = (value: unknown): string | null => normalizeWallpaperPath(value, getAppWallpaperDirectory());

export const normalizeChannelBalanceSettings = (value: unknown): ChannelBalanceState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultChannelBalanceSettings };
  }

  const input = value as Partial<ChannelBalanceState>;
  const balance = Number(input.balance);
  const leftGainDb = Number(input.leftGainDb);
  const rightGainDb = Number(input.rightGainDb);
  const monoMode: ChannelBalanceMonoMode =
    input.monoMode === 'sum' || input.monoMode === 'left' || input.monoMode === 'right' || input.monoMode === 'off'
      ? input.monoMode
      : defaultChannelBalanceSettings.monoMode;

  return {
    enabled: input.enabled === true,
    balance: Number.isFinite(balance) ? clamp(balance, channelBalanceMinBalance, channelBalanceMaxBalance) : 0,
    leftGainDb: Number.isFinite(leftGainDb) ? clamp(leftGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb) : 0,
    rightGainDb: Number.isFinite(rightGainDb) ? clamp(rightGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb) : 0,
    swapLeftRight: input.swapLeftRight === true,
    monoMode,
    invertLeft: input.invertLeft === true,
    invertRight: input.invertRight === true,
    constantPower: input.constantPower !== false,
  };
};

export const normalizeSettings = (value: unknown): AppSettings => {
  if (!value || typeof value !== 'object') {
    return { ...defaultSettings };
  }

  const settings = value as Partial<AppSettings>;
  const normalizedAppMemoryVersion = Number(settings.appMemoryVersion);
  const sourceAppMemoryVersion = Number.isFinite(normalizedAppMemoryVersion)
    ? Math.max(0, Math.round(normalizedAppMemoryVersion))
    : 0;
  const playerVolume = Number(settings.playerVolume);
  const playbackSpeed = Number(settings.playbackSpeed);
  const albumMergeStrategy =
    settings.albumMergeStrategy === 'sameTitleAndCover' || settings.albumMergeStrategy === 'standard'
      ? settings.albumMergeStrategy
      : defaultSettings.albumMergeStrategy;
  const playbackSpeedMode =
    settings.playbackSpeedMode === 'daycore' || settings.playbackSpeedMode === 'speed'
      ? settings.playbackSpeedMode
      : defaultSettings.playbackSpeedMode;
  const scanPerformanceMode =
    settings.scanPerformanceMode === 'low' ||
    settings.scanPerformanceMode === 'balanced' ||
    settings.scanPerformanceMode === 'performance'
      ? settings.scanPerformanceMode
      : defaultSettings.scanPerformanceMode;
  const duplicateTracksMode = settings.duplicateTracksMode === 'strict' ? settings.duplicateTracksMode : defaultSettings.duplicateTracksMode;
  const appWallpaperScalePercent = Number(settings.appWallpaperScalePercent);
  const appWallpaperBlurPx = Number(settings.appWallpaperBlurPx);
  const appWallpaperBrightnessPercent = Number(settings.appWallpaperBrightnessPercent);
  const appWallpaperUiOpacityPercent = Number(settings.appWallpaperUiOpacityPercent);
  const providers = Array.isArray(settings.networkMetadataProviders)
    ? settings.networkMetadataProviders.filter(
        (provider): provider is AppSettings['networkMetadataProviders'][number] =>
          provider === 'mock' ||
          provider === 'musicbrainz' ||
          provider === 'cover-art-archive' ||
          provider === 'netease-cloud-music' ||
          provider === 'qq-music',
      )
    : defaultSettings.networkMetadataProviders;
  const lyricsAutoAcceptScore = Number(settings.lyricsAutoAcceptScore);
  const lyricsCoverAutoAcceptScore = Number(settings.lyricsCoverAutoAcceptScore);
  const lyricsDefaultOffsetMs = Number(settings.lyricsDefaultOffsetMs);
  const lyricsGlobalSyncOffsetMs = Number(settings.lyricsGlobalSyncOffsetMs);
  const lyricsFontSizePx = Number(settings.lyricsFontSizePx);
  const lyricsSecondaryFontSizePx = Number(settings.lyricsSecondaryFontSizePx);
  const lyricsLineSpacingPercent = Number(settings.lyricsLineSpacingPercent);
  const lyricsLineMaxChars = Number(settings.lyricsLineMaxChars);
  const lyricsContextOpacityPercent = Number(settings.lyricsContextOpacityPercent);
  const lyricsPlayerBarDrawerOpacityPercent = Number(settings.lyricsPlayerBarDrawerOpacityPercent);
  const lyricsCoverOpacityPercent = Number(settings.lyricsCoverOpacityPercent);
  const lyricsCoverBlurPx = Number(settings.lyricsCoverBlurPx);
  const lyricsCoverBrightnessPercent = Number(settings.lyricsCoverBrightnessPercent);
  const lyricsBackgroundScalePercent = Number(settings.lyricsBackgroundScalePercent);
  const lyricsProviderTimeoutMs = Number(settings.lyricsProviderTimeoutMs);
  const lyricsTotalMatchTimeoutMs = Number(settings.lyricsTotalMatchTimeoutMs);
  const mvProviderOrder = normalizeMvProviderList(settings.mvProviderOrder, defaultSettings.mvProviderOrder);
  const mvAutoApplyThreshold = Number(settings.mvAutoApplyThreshold);
  const mvImmersiveBackgroundScalePercent = Number(settings.mvImmersiveBackgroundScalePercent);
  const mvImmersiveBackgroundOffsetXPercent = Number(settings.mvImmersiveBackgroundOffsetXPercent);
  const mvImmersiveBackgroundOffsetYPercent = Number(settings.mvImmersiveBackgroundOffsetYPercent);
  const mvImmersiveBackgroundBlurPx = Number(settings.mvImmersiveBackgroundBlurPx);
  const mvImmersiveBackgroundBrightnessPercent = Number(settings.mvImmersiveBackgroundBrightnessPercent);
  const mvImmersiveBackgroundOverlayOpacityPercent = Number(settings.mvImmersiveBackgroundOverlayOpacityPercent);
  const lyricsEnabledProviders = normalizeLyricsProviderList(settings.lyricsEnabledProviders, defaultSettings.lyricsEnabledProviders ?? defaultLyricsProviderOrder);
  const lyricsProviderOrder = normalizeLyricsProviderList(
    settings.lyricsProviderOrder,
    Array.isArray(settings.lyricsEnabledProviders) ? settings.lyricsEnabledProviders : defaultSettings.lyricsProviderOrder,
  );
  const replayGainTargetLufs = Number(settings.replayGainTargetLufs);
  const replayGainPreampDb = Number(settings.replayGainPreampDb);

  return {
    appMemoryVersion,
    locale: normalizeLocale(settings.locale),
    appearanceTheme: normalizeAppearanceTheme(settings.appearanceTheme),
    appearanceThemePreset: normalizeAppearanceThemePreset(settings.appearanceThemePreset),
    appearanceThemePresetOverrides: normalizeThemePresetOverrides(settings.appearanceThemePresetOverrides),
    appearancePreferences: normalizeAppearancePreferences(settings.appearancePreferences),
    songsSort: normalizeSongsSort(settings.songsSort),
    rememberedAudioOutput: normalizeRememberedAudioOutput(settings.rememberedAudioOutput),
    hiddenAudioDeviceKeys: normalizeHiddenAudioDeviceKeys(settings.hiddenAudioDeviceKeys),
    audioUseJuceOutput: sourceAppMemoryVersion < appMemoryVersion ? true : settings.audioUseJuceOutput !== false,
    audioUseJuceDecode: settings.audioUseJuceDecode === true,
    audioDsdOutputMode: settings.audioDsdOutputMode === 'dop' ? 'dop' : 'pcm',
    audioAsioNativeDsdExperimentalEnabled: settings.audioAsioNativeDsdExperimentalEnabled === true,
    audioAsioUnavailableFallbackEnabled: settings.audioAsioUnavailableFallbackEnabled === true,
    audioSoxrFallbackEnabled: settings.audioSoxrFallbackEnabled !== false,
    audioReleaseExclusiveOnPauseExperimentalEnabled: settings.audioReleaseExclusiveOnPauseExperimentalEnabled === true,
    albumMergeStrategy,
    chineseCrossScriptSearchEnabled: settings.chineseCrossScriptSearchEnabled !== false,
    artistWallAlbumArtwork: settings.artistWallAlbumArtwork === true,
    artistWallAlbumFallbackForMissingAvatars: settings.artistWallAlbumFallbackForMissingAvatars === true,
    autoFetchArtistImages: settings.autoFetchArtistImages === true,
    artistImageFetchPaused: settings.artistImageFetchPaused === true,
    autoUpdateEnabled: settings.autoUpdateEnabled !== false,
    autoAccountCheckOnStartup: settings.autoAccountCheckOnStartup !== false,
    spotifyAutoLaunchOfficialPlayer: settings.spotifyAutoLaunchOfficialPlayer !== false,
    playlistBackupsEnabled: settings.playlistBackupsEnabled !== false,
    coverCacheDir: normalizeCoverCacheDir(settings.coverCacheDir),
    hideToTrayOnClose: settings.hideToTrayOnClose === true,
    rememberWindowSizeEnabled: settings.rememberWindowSizeEnabled !== false,
    rememberedWindowSize: normalizeRememberedWindowSize(settings.rememberedWindowSize),
    appCustomWallpaperPath: normalizeAppWallpaperPath(settings.appCustomWallpaperPath),
    appWallpaperScalePercent: Number.isFinite(appWallpaperScalePercent)
      ? Math.round(clamp(appWallpaperScalePercent, 100, 220))
      : defaultSettings.appWallpaperScalePercent,
    appWallpaperBlurPx: Number.isFinite(appWallpaperBlurPx)
      ? Math.round(clamp(appWallpaperBlurPx, 0, 40))
      : defaultSettings.appWallpaperBlurPx,
    appWallpaperBrightnessPercent: Number.isFinite(appWallpaperBrightnessPercent)
      ? Math.round(clamp(appWallpaperBrightnessPercent, 40, 140))
      : defaultSettings.appWallpaperBrightnessPercent,
    appWallpaperUiOpacityPercent: Number.isFinite(appWallpaperUiOpacityPercent)
      ? Math.round(clamp(appWallpaperUiOpacityPercent, 0, 100))
      : defaultSettings.appWallpaperUiOpacityPercent,
    appWallpaperVisualProtectionEnabled: settings.appWallpaperVisualProtectionEnabled !== false,
    appWallpaperUnifiedOpacityEnabled: settings.appWallpaperUnifiedOpacityEnabled === true,
    networkMetadataEnabled: settings.networkMetadataEnabled === true,
    networkMetadataProviders: providers.length ? providers : defaultSettings.networkMetadataProviders,
    audioAnalysisEnabled: settings.audioAnalysisEnabled !== false,
    lyricsNetworkEnabled: settings.lyricsNetworkEnabled !== false,
    lyricsPreferredProvider: 'lrclib',
    lyricsEnabledProviders: lyricsEnabledProviders.length ? lyricsEnabledProviders : (defaultSettings.lyricsEnabledProviders ?? ['local', 'lrclib', 'netease', 'qqmusic']),
    lyricsProviderOrder: [
      ...lyricsProviderOrder,
      ...defaultLyricsProviderOrder.filter((provider) => !lyricsProviderOrder.includes(provider)),
    ],
    lyricsProviderTimeoutMs: Number.isFinite(lyricsProviderTimeoutMs)
      ? Math.round(clamp(lyricsProviderTimeoutMs, 1000, 10000))
      : defaultSettings.lyricsProviderTimeoutMs,
    lyricsTotalMatchTimeoutMs: Number.isFinite(lyricsTotalMatchTimeoutMs)
      ? Math.round(clamp(lyricsTotalMatchTimeoutMs, 1500, 15000))
      : defaultSettings.lyricsTotalMatchTimeoutMs,
    lyricsCoverAutoAcceptScore: Number.isFinite(lyricsCoverAutoAcceptScore)
      ? clamp(lyricsCoverAutoAcceptScore, 0.5, 1)
      : defaultSettings.lyricsCoverAutoAcceptScore,
    lyricsDeepSearchEnabled: settings.lyricsDeepSearchEnabled !== false,
    lyricsAutoSearch: settings.lyricsAutoSearch !== false,
    lyricsAutoAcceptScore: Number.isFinite(lyricsAutoAcceptScore)
      ? clamp(lyricsAutoAcceptScore, 0.3, 1)
      : defaultSettings.lyricsAutoAcceptScore,
    lyricsDefaultOffsetMs: Number.isFinite(lyricsDefaultOffsetMs)
      ? Math.round(clamp(lyricsDefaultOffsetMs, -10000, 10000))
      : defaultSettings.lyricsDefaultOffsetMs,
    lyricsGlobalSyncOffsetMs: Number.isFinite(lyricsGlobalSyncOffsetMs)
      ? Math.round(clamp(lyricsGlobalSyncOffsetMs, -1000, 1000))
      : defaultSettings.lyricsGlobalSyncOffsetMs,
    lyricsOffsetControlsEnabled: settings.lyricsOffsetControlsEnabled === true,
    lyricsEnabled: settings.lyricsEnabled !== false,
    lyricsHeaderHidden: settings.lyricsHeaderHidden === true,
    lyricsMvAutoShowTrackInfoDisabled: settings.lyricsMvAutoShowTrackInfoDisabled !== false,
    lyricsCandidatePanelAutoOpenEnabled: settings.lyricsCandidatePanelAutoOpenEnabled !== false,
    lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden !== false,
    lyricsPlayerBarDrawerEnabled: settings.lyricsPlayerBarDrawerEnabled === true,
    lyricsPlayerBarDrawerOpacityPercent: Number.isFinite(lyricsPlayerBarDrawerOpacityPercent)
      ? Math.round(clamp(lyricsPlayerBarDrawerOpacityPercent, 20, 100))
      : defaultSettings.lyricsPlayerBarDrawerOpacityPercent,
    lyricsPlayerBarDrawerColorMode: normalizeLyricsMiniPlayerColorMode(settings.lyricsPlayerBarDrawerColorMode),
    lyricsPlayerBarDrawerColor: normalizeHexColor(settings.lyricsPlayerBarDrawerColor, defaultLyricsMiniPlayerColor),
    lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled !== false,
    lyricsTranslationEnabled: settings.lyricsTranslationEnabled !== false,
    lyricsWordHighlightEnabled: settings.lyricsWordHighlightEnabled !== false,
    lyricsFontSizePx: Number.isFinite(lyricsFontSizePx)
      ? Math.round(clamp(lyricsFontSizePx, 22, 56))
      : defaultSettings.lyricsFontSizePx,
    lyricsSecondaryFontSizePx: Number.isFinite(lyricsSecondaryFontSizePx)
      ? Math.round(clamp(lyricsSecondaryFontSizePx, 12, 32))
      : defaultSettings.lyricsSecondaryFontSizePx,
    lyricsLineSpacingPercent: Number.isFinite(lyricsLineSpacingPercent)
      ? Math.round(clamp(lyricsLineSpacingPercent, 60, 150))
      : defaultSettings.lyricsLineSpacingPercent,
    lyricsLineMaxChars: Number.isFinite(lyricsLineMaxChars)
      ? Math.round(clamp(lyricsLineMaxChars, 0, 80))
      : defaultSettings.lyricsLineMaxChars,
    lyricsContextOpacityPercent: Number.isFinite(lyricsContextOpacityPercent)
      ? Math.round(clamp(lyricsContextOpacityPercent, 0, 100))
      : defaultSettings.lyricsContextOpacityPercent,
    lyricsColor: normalizeLyricsColor(settings.lyricsColor),
    lyricsSmartReadableColorsEnabled: settings.lyricsSmartReadableColorsEnabled === true,
    lyricsHighResolutionNetworkCoverEnabled: settings.lyricsHighResolutionNetworkCoverEnabled === true,
    lyricsBackgroundMode: normalizeLyricsBackgroundMode(settings.lyricsBackgroundMode),
    lyricsCustomWallpaperPath: normalizeLyricsWallpaperPath(settings.lyricsCustomWallpaperPath),
    lyricsCoverOpacityPercent: Number.isFinite(lyricsCoverOpacityPercent)
      ? Math.round(clamp(lyricsCoverOpacityPercent, 0, 100))
      : defaultSettings.lyricsCoverOpacityPercent,
    lyricsCoverBlurPx: Number.isFinite(lyricsCoverBlurPx)
      ? Math.round(clamp(lyricsCoverBlurPx, 0, 60))
      : defaultSettings.lyricsCoverBlurPx,
    lyricsCoverBrightnessPercent: Number.isFinite(lyricsCoverBrightnessPercent)
      ? Math.round(clamp(lyricsCoverBrightnessPercent, 40, 140))
      : defaultSettings.lyricsCoverBrightnessPercent,
    lyricsBackgroundScalePercent: Number.isFinite(lyricsBackgroundScalePercent)
      ? Math.round(clamp(lyricsBackgroundScalePercent, 70, 180))
      : defaultSettings.lyricsBackgroundScalePercent,
    mvEnabled: settings.mvEnabled !== false,
    mvEnabledProviders: normalizeMvProviderList(settings.mvEnabledProviders, defaultSettings.mvEnabledProviders),
    mvProviderOrder: [
      ...mvProviderOrder,
      ...mvNetworkProviders.filter((provider) => !mvProviderOrder.includes(provider)),
    ],
    mvAutoSearch: settings.mvAutoSearch !== false,
    mvAutoPreload: settings.mvAutoPreload !== false,
    mvAutoApplyThreshold: Number.isFinite(mvAutoApplyThreshold)
      ? clamp(mvAutoApplyThreshold, 0.3, 1)
      : defaultSettings.mvAutoApplyThreshold,
    mvImmersiveBackground: settings.mvImmersiveBackground !== false,
    mvImmersiveBackgroundScalePercent: Number.isFinite(mvImmersiveBackgroundScalePercent)
      ? Math.round(clamp(mvImmersiveBackgroundScalePercent, 100, 220))
      : defaultSettings.mvImmersiveBackgroundScalePercent,
    mvImmersiveBackgroundOffsetXPercent: Number.isFinite(mvImmersiveBackgroundOffsetXPercent)
      ? Math.round(clamp(mvImmersiveBackgroundOffsetXPercent, 0, 100))
      : defaultSettings.mvImmersiveBackgroundOffsetXPercent,
    mvImmersiveBackgroundOffsetYPercent: Number.isFinite(mvImmersiveBackgroundOffsetYPercent)
      ? Math.round(clamp(mvImmersiveBackgroundOffsetYPercent, 0, 100))
      : defaultSettings.mvImmersiveBackgroundOffsetYPercent,
    mvImmersiveBackgroundBlurPx: Number.isFinite(mvImmersiveBackgroundBlurPx)
      ? Math.round(clamp(mvImmersiveBackgroundBlurPx, 0, 32))
      : defaultSettings.mvImmersiveBackgroundBlurPx,
    mvImmersiveBackgroundBrightnessPercent: Number.isFinite(mvImmersiveBackgroundBrightnessPercent)
      ? Math.round(clamp(mvImmersiveBackgroundBrightnessPercent, 60, 140))
      : defaultSettings.mvImmersiveBackgroundBrightnessPercent,
    mvImmersiveBackgroundOverlayOpacityPercent: Number.isFinite(mvImmersiveBackgroundOverlayOpacityPercent)
      ? Math.round(clamp(mvImmersiveBackgroundOverlayOpacityPercent, 0, 100))
      : defaultSettings.mvImmersiveBackgroundOverlayOpacityPercent,
    mvLyricsReadabilityEnhanced: settings.mvLyricsReadabilityEnhanced === true,
    mvRestartAudioOnLoad: settings.mvRestartAudioOnLoad === true,
    mvReplayAudioOnChange: settings.mvReplayAudioOnChange !== false,
    mvMaxQuality: normalizeMvMaxQuality(settings.mvMaxQuality),
    mvAllow60fps: settings.mvAllow60fps !== false,
    channelBalance: normalizeChannelBalanceSettings(settings.channelBalance),
    playerVolume: Number.isFinite(playerVolume) ? Math.max(0, Math.min(1, playerVolume)) : defaultSettings.playerVolume,
    replayGainEnabled: settings.replayGainEnabled === true,
    replayGainMode: normalizeReplayGainMode(settings.replayGainMode),
    replayGainTargetLufs: Number.isFinite(replayGainTargetLufs)
      ? Math.round(clamp(replayGainTargetLufs, -24, -12) * 10) / 10
      : defaultSettings.replayGainTargetLufs,
    replayGainPreampDb: Number.isFinite(replayGainPreampDb)
      ? Math.round(clamp(replayGainPreampDb, -12, 12) * 10) / 10
      : defaultSettings.replayGainPreampDb,
    replayGainPreventClipping: settings.replayGainPreventClipping !== false,
    replayGainAnalyzeOnPlay: settings.replayGainAnalyzeOnPlay !== false,
    replayGainAnalyzeMissingOnScanOptIn: settings.replayGainAnalyzeMissingOnScanOptIn === true,
    replayGainAnalyzeMissingOnScan:
      settings.replayGainAnalyzeMissingOnScanOptIn === true && settings.replayGainAnalyzeMissingOnScan === true,
    backgroundSpacePauseEnabled: false,
    globalShortcuts: normalizeGlobalShortcuts(settings.globalShortcuts),
    playbackFollowCurrentTrack: settings.playbackFollowCurrentTrack === true,
    playbackSpeed: Number.isFinite(playbackSpeed)
      ? Math.max(0.5, Math.min(2, playbackSpeed))
      : defaultSettings.playbackSpeed,
    playbackSpeedMode,
    scanPerformanceMode,
    duplicateTracksEnabled: settings.duplicateTracksEnabled !== false,
    duplicateTracksMode,
    duplicateTracksAutoRebuildAfterScan: settings.duplicateTracksAutoRebuildAfterScan === true,
    discordRichPresenceEnabled: settings.discordRichPresenceEnabled === true,
    lastFmEnabled: settings.lastFmEnabled === true,
    lastFmUsername: normalizeOptionalText(settings.lastFmUsername),
    lastFmSessionKey: normalizeOptionalText(settings.lastFmSessionKey),
    lastFmScrobbleEnabled: settings.lastFmScrobbleEnabled !== false,
    lastFmNowPlayingEnabled: settings.lastFmNowPlayingEnabled !== false,
    lastFmMinScrobbleSeconds:
      typeof settings.lastFmMinScrobbleSeconds === 'number' &&
      Number.isFinite(settings.lastFmMinScrobbleSeconds) &&
      settings.lastFmMinScrobbleSeconds > 0
        ? Math.max(1, Math.min(240, Math.round(settings.lastFmMinScrobbleSeconds)))
        : defaultSettings.lastFmMinScrobbleSeconds,
    lastFmAuthToken: normalizeOptionalText(settings.lastFmAuthToken),
    smtcEnabled: settings.smtcEnabled !== false,
  };
};

export const getAppSettings = (): AppSettings => {
  if (cachedSettings) {
    return cachedSettings;
  }

  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    cachedSettings = { ...defaultSettings };
    return cachedSettings;
  }

  try {
    cachedSettings = normalizeSettings(JSON.parse(readFileSync(settingsPath, 'utf8')));
  } catch {
    cachedSettings = { ...defaultSettings };
  }

  return cachedSettings;
};

export const setAppSettings = (patch: Partial<AppSettings>): AppSettings => {
  const nextSettings = normalizeSettings({ ...getAppSettings(), ...patch });
  const settingsPath = getSettingsPath();

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
  cachedSettings = nextSettings;

  return nextSettings;
};
