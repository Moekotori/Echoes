import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../../shared/types/appSettings';
import {
  channelBalanceMaxBalance,
  channelBalanceMaxGainDb,
  channelBalanceMinBalance,
  channelBalanceMinGainDb,
  type ChannelBalanceMonoMode,
  type ChannelBalanceState,
} from '../../shared/types/audio';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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
  channelBalance: defaultChannelBalanceSettings,
  playerVolume: 1,
  playbackSpeed: 1,
  playbackSpeedMode: 'nightcore',
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

  return {
    albumMergeStrategy,
    artistWallAlbumArtwork: settings.artistWallAlbumArtwork === true,
    coverCacheDir: normalizeCoverCacheDir(settings.coverCacheDir),
    hideToTrayOnClose: settings.hideToTrayOnClose === true,
    networkMetadataEnabled: settings.networkMetadataEnabled === true,
    networkMetadataProviders: providers.length ? providers : defaultSettings.networkMetadataProviders,
    channelBalance: normalizeChannelBalanceSettings(settings.channelBalance),
    playerVolume: Number.isFinite(playerVolume) ? Math.max(0, Math.min(1, playerVolume)) : defaultSettings.playerVolume,
    playbackSpeed: Number.isFinite(playbackSpeed)
      ? Math.max(0.5, Math.min(2, playbackSpeed))
      : defaultSettings.playbackSpeed,
    playbackSpeedMode,
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
