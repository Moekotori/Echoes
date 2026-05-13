import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { app } from 'electron';
import type { AppSettings, LyricsBackgroundMode } from '../../shared/types/appSettings';
import type { LyricsProviderId } from '../../shared/types/lyrics';
import type { MvSettings, NetworkMvProviderId } from '../../shared/types/mv';
import {
  channelBalanceMaxBalance,
  channelBalanceMaxGainDb,
  channelBalanceMinBalance,
  channelBalanceMinGainDb,
  type ChannelBalanceMonoMode,
  type ChannelBalanceState,
} from '../../shared/types/audio';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const lyricsWallpaperExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const defaultLyricsColor = '#314054';
const mvNetworkProviders: NetworkMvProviderId[] = ['bilibili', 'youtube'];
const lyricsProviders: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic', 'musixmatch', 'genius', 'manual'];
const defaultLyricsProviderOrder: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic'];

export const getLyricsWallpaperDirectory = (): string => join(app.getPath('userData'), 'lyrics-wallpapers');

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
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  networkMetadataEnabled: false,
  networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: [...defaultLyricsProviderOrder],
  lyricsProviderOrder: [...defaultLyricsProviderOrder],
  lyricsProviderTimeoutMs: 4500,
  lyricsTotalMatchTimeoutMs: 6000,
  lyricsCoverAutoAcceptScore: 0.97,
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.7,
  lyricsDefaultOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsFontSizePx: 36,
  lyricsColor: defaultLyricsColor,
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvAutoPreload: true,
  mvRestartAudioOnLoad: false,
  mvMaxQuality: '1080p',
  mvAllow60fps: true,
  channelBalance: defaultChannelBalanceSettings,
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

const normalizeLyricsColor = (value: unknown): string => {
  if (typeof value !== 'string') {
    return defaultLyricsColor;
  }

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : defaultLyricsColor;
};

const normalizeLyricsBackgroundMode = (value: unknown): LyricsBackgroundMode =>
  value === 'cover' || value === 'customWallpaper' || value === 'theme' ? value : defaultSettings.lyricsBackgroundMode;

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

const normalizeLyricsWallpaperPath = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = resolve(value.trim());
  if (!normalized || !lyricsWallpaperExtensions.has(extname(normalized).toLowerCase())) {
    return null;
  }

  if (!isPathInsideDirectory(getLyricsWallpaperDirectory(), normalized) || !existsSync(normalized)) {
    return null;
  }

  return normalized;
};

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
  const lyricsFontSizePx = Number(settings.lyricsFontSizePx);
  const lyricsCoverOpacityPercent = Number(settings.lyricsCoverOpacityPercent);
  const lyricsCoverBlurPx = Number(settings.lyricsCoverBlurPx);
  const lyricsCoverBrightnessPercent = Number(settings.lyricsCoverBrightnessPercent);
  const lyricsBackgroundScalePercent = Number(settings.lyricsBackgroundScalePercent);
  const lyricsProviderTimeoutMs = Number(settings.lyricsProviderTimeoutMs);
  const lyricsTotalMatchTimeoutMs = Number(settings.lyricsTotalMatchTimeoutMs);
  const mvProviderOrder = normalizeMvProviderList(settings.mvProviderOrder, defaultSettings.mvProviderOrder);
  const lyricsEnabledProviders = normalizeLyricsProviderList(settings.lyricsEnabledProviders, defaultSettings.lyricsEnabledProviders ?? defaultLyricsProviderOrder);
  const lyricsProviderOrder = normalizeLyricsProviderList(
    settings.lyricsProviderOrder,
    Array.isArray(settings.lyricsEnabledProviders) ? settings.lyricsEnabledProviders : defaultSettings.lyricsProviderOrder,
  );

  return {
    albumMergeStrategy,
    artistWallAlbumArtwork: settings.artistWallAlbumArtwork === true,
    coverCacheDir: normalizeCoverCacheDir(settings.coverCacheDir),
    hideToTrayOnClose: settings.hideToTrayOnClose === true,
    networkMetadataEnabled: settings.networkMetadataEnabled === true,
    networkMetadataProviders: providers.length ? providers : defaultSettings.networkMetadataProviders,
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
      ? clamp(lyricsAutoAcceptScore, 0.5, 0.7)
      : defaultSettings.lyricsAutoAcceptScore,
    lyricsDefaultOffsetMs: Number.isFinite(lyricsDefaultOffsetMs)
      ? Math.round(clamp(lyricsDefaultOffsetMs, -10000, 10000))
      : defaultSettings.lyricsDefaultOffsetMs,
    lyricsEnabled: settings.lyricsEnabled !== false,
    lyricsHeaderHidden: settings.lyricsHeaderHidden === true,
    lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden !== false,
    lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled !== false,
    lyricsFontSizePx: Number.isFinite(lyricsFontSizePx)
      ? Math.round(clamp(lyricsFontSizePx, 22, 56))
      : defaultSettings.lyricsFontSizePx,
    lyricsColor: normalizeLyricsColor(settings.lyricsColor),
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
    mvEnabledProviders: normalizeMvProviderList(settings.mvEnabledProviders, defaultSettings.mvEnabledProviders),
    mvProviderOrder: [
      ...mvProviderOrder,
      ...mvNetworkProviders.filter((provider) => !mvProviderOrder.includes(provider)),
    ],
    mvAutoSearch: settings.mvAutoSearch !== false,
    mvAutoPreload: settings.mvAutoPreload !== false,
    mvRestartAudioOnLoad: settings.mvRestartAudioOnLoad === true,
    mvMaxQuality: normalizeMvMaxQuality(settings.mvMaxQuality),
    mvAllow60fps: settings.mvAllow60fps !== false,
    channelBalance: normalizeChannelBalanceSettings(settings.channelBalance),
    playerVolume: Number.isFinite(playerVolume) ? Math.max(0, Math.min(1, playerVolume)) : defaultSettings.playerVolume,
    playbackSpeed: Number.isFinite(playbackSpeed)
      ? Math.max(0.5, Math.min(2, playbackSpeed))
      : defaultSettings.playbackSpeed,
    playbackSpeedMode,
    scanPerformanceMode,
    duplicateTracksEnabled: settings.duplicateTracksEnabled === true,
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
