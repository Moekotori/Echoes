import type { AudioDsdOutputMode, AudioLatencyProfile, AudioOutputMode, AudioSharedBackend, ChannelBalanceState, PlaybackSpeedMode } from './audio';
import type { DuplicateTrackMode } from './library';
import type { LibrarySort } from './library';
import type { LyricsProviderId } from './lyrics';
import type { MvMaxQuality, MvSyncMode, NetworkMvProviderId } from './mv';
import type { GlobalShortcutSettings } from './globalShortcuts';
import type { HqPlayerSettings } from './hqplayer';

export type ScanPerformanceMode = 'low' | 'balanced' | 'performance';
export type LyricsBackgroundMode = 'theme' | 'cover' | 'customWallpaper';
export type LyricsMiniPlayerColorMode = 'default' | 'custom' | 'cover';
export type AppWallpaperMediaType = 'image' | 'video';
export type AppVideoWallpaperPauseMode = 'smart' | 'minimized' | 'never';
export type AppLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';
export type AppThemeMode = 'light' | 'dark' | 'system';
export type ReplayGainMode = 'off' | 'track' | 'album';
export type NetworkProxyMode = 'off' | 'system' | 'manual' | 'pac';
export type DataBackupIntervalDays = 3 | 7 | 30;

export type DesktopLyricsBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NetworkProxyTestResult = {
  ok: boolean;
  mode: NetworkProxyMode;
  message: string;
  resolvedProxy: string | null;
  status: number | null;
  elapsedMs: number;
};
export type AppThemePreset =
  | 'classic'
  | 'echoTwilight'
  | 'sakuraMilk'
  | 'peachSoda'
  | 'mintCandy'
  | 'berryDream'
  | 'matchaCream'
  | 'lemonMochi'
  | 'cottonCloud'
  | 'melonCream'
  | 'seaSaltJelly'
  | 'caramelPudding'
  | 'neonCandy'
  | 'nyanCat'
  | 'wisteriaBubble'
  | 'strawberryCookie'
  | 'graphiteAurora'
  | 'amberNoir'
  | 'oceanStudio'
  | 'rosewoodVinyl'
  | 'darkSideMoon'
  | 'shibuyaNight'
  | 'kyotoKurenai'
  | 'ukiyoIndigo'
  | 'fujiSnow'
  | 'matsuriLantern'
  | 'ginzaNoir'
  | 'frostJazz';

export type AppThemeToneOverride = {
  appBg?: string;
  appBg2?: string;
  appBg3?: string;
  panel?: string;
  panelSoft?: string;
  accent?: string;
  accentStrong?: string;
  secondary?: string;
  heading?: string;
  text?: string;
  muted?: string;
  border?: string;
  onAccent?: string;
  buttonText?: string;
  titlebar?: string;
  sidebar?: string;
  player?: string;
  field?: string;
  row?: string;
  rowHover?: string;
  rowActive?: string;
  chip?: string;
  focus?: string;
  danger?: string;
  success?: string;
  warning?: string;
  panelOpacityPercent?: number;
  glassPercent?: number;
  shadowPercent?: number;
  cornerRadiusPx?: number;
  panelBlurPx?: number;
  saturationPercent?: number;
  motionEnabled?: boolean;
  motionSpeedSeconds?: number;
  motionIntensityPercent?: number;
};

export type AppThemePresetOverride = {
  light?: AppThemeToneOverride;
  dark?: AppThemeToneOverride;
};

export type AppThemePresetOverrides = Partial<Record<AppThemePreset, AppThemePresetOverride>>;

export type AppThemeCustomTheme = {
  id: string;
  name: string;
  basePreset: AppThemePreset;
  light?: AppThemeToneOverride;
  dark?: AppThemeToneOverride;
  createdAt: string;
  updatedAt: string;
};

export type AppearancePreferences = {
  mainFontFamily: string;
  mainFontFilePath: string | null;
  chineseFontFamily: string;
  chineseFontFilePath: string | null;
  fallbackFontFamily: string;
  fallbackFontFilePath: string | null;
  baseFontSize: number;
  lineHeight: number;
  textDepth: number;
};

export type RememberedAudioOutput = {
  enabled: boolean;
  outputMode: AudioOutputMode;
  sharedBackend?: AudioSharedBackend;
  latencyProfile?: AudioLatencyProfile;
  deviceIndex?: number;
  deviceName?: string;
  asioOutputChannelStart?: number;
  bufferSizeFrames?: number;
};

export type RememberedWindowSize = {
  width: number;
  height: number;
};

export type AppSettings = {
  appMemoryVersion?: number;
  onboardingCompleted?: boolean;
  locale?: AppLocale;
  appearanceTheme: AppThemeMode;
  appearanceThemePreset?: AppThemePreset;
  appearanceThemePresetOverrides?: AppThemePresetOverrides;
  appearanceCustomThemes?: AppThemeCustomTheme[];
  appearanceThemeCustomId?: string | null;
  appearancePreferences?: AppearancePreferences;
  songsSort?: LibrarySort;
  rememberedAudioOutput?: RememberedAudioOutput;
  hiddenAudioDeviceKeys?: string[];
  audioUseJuceOutput?: boolean;
  audioUseJuceDecode?: boolean;
  audioDsdOutputMode?: AudioDsdOutputMode;
  audioAsioNativeDsdExperimentalEnabled?: boolean;
  audioAsioUnavailableFallbackEnabled?: boolean;
  audioSoxrFallbackEnabled?: boolean;
  audioReleaseExclusiveOnPauseExperimentalEnabled?: boolean;
  audioIssueDiagnosticsWindowEnabled?: boolean;
  albumMergeStrategy: 'standard' | 'sameTitleAndCover';
  chineseCrossScriptSearchEnabled?: boolean;
  artistWallAlbumArtwork: boolean;
  artistWallAlbumFallbackForMissingAvatars?: boolean;
  autoFetchArtistImages?: boolean;
  artistImageFetchPaused?: boolean;
  liveLibraryUpdatesEnabled?: boolean;
  liveLibraryAutoHideDeletedEnabled?: boolean;
  safeModeEnabled?: boolean;
  autoUpdateEnabled?: boolean;
  autoAccountCheckOnStartup?: boolean;
  suppressAccountExpiryNotices?: boolean;
  spotifyAutoLaunchOfficialPlayer?: boolean;
  connectAutoStartReceiversEnabled?: boolean;
  hqPlayer?: HqPlayerSettings;
  playlistBackupsEnabled?: boolean;
  autoDataBackupEnabled?: boolean;
  autoDataBackupDirectory?: string | null;
  autoDataBackupIntervalDays?: DataBackupIntervalDays;
  autoDataBackupLastRunAt?: string | null;
  autoDataBackupLastPath?: string | null;
  autoDataBackupLastError?: string | null;
  coverCacheDir: string | null;
  hideToTrayOnClose: boolean;
  rememberWindowSizeEnabled?: boolean;
  rememberedWindowSize?: RememberedWindowSize | null;
  appCustomWallpaperPath: string | null;
  appWallpaperMediaType?: AppWallpaperMediaType;
  appWallpaperScalePercent: number;
  appWallpaperBlurPx: number;
  appWallpaperBrightnessPercent: number;
  appWallpaperUiOpacityPercent: number;
  appWallpaperVisualProtectionEnabled?: boolean;
  appWallpaperUnifiedOpacityEnabled: boolean;
  appVideoWallpaperPauseMode?: AppVideoWallpaperPauseMode;
  networkProxyMode?: NetworkProxyMode;
  networkProxyUrl?: string | null;
  networkProxyBypassRules?: string | null;
  networkProxyPacUrl?: string | null;
  networkMetadataEnabled: boolean;
  networkMetadataProviders: Array<'mock' | 'musicbrainz' | 'cover-art-archive' | 'netease-cloud-music' | 'qq-music'>;
  onlineArtistInfoBandsintownAppId?: string | null;
  onlineArtistInfoTicketmasterApiKey?: string | null;
  onlineArtistInfoSeatGeekClientId?: string | null;
  onlineArtistInfoRegion?: string | null;
  audioAnalysisEnabled?: boolean;
  lyricsNetworkEnabled: boolean;
  lyricsPreferredProvider: 'lrclib';
  lyricsEnabledProviders?: LyricsProviderId[];
  lyricsProviderOrder: LyricsProviderId[];
  lyricsProviderTimeoutMs?: number;
  lyricsTotalMatchTimeoutMs?: number;
  lyricsCoverAutoAcceptScore?: number;
  lyricsDeepSearchEnabled: boolean;
  lyricsAutoSearch: boolean;
  lyricsAutoAcceptScore: number;
  lyricsDefaultOffsetMs: number;
  lyricsGlobalSyncOffsetMs: number;
  lyricsTimelineCorrectionEnabled?: boolean;
  lyricsOffsetControlsEnabled?: boolean;
  lyricsSmartAlignmentEnabled?: boolean;
  lyricsEnabled: boolean;
  lyricsHeaderHidden: boolean;
  lyricsMvAutoShowTrackInfoDisabled?: boolean;
  lyricsCandidatePanelAutoOpenEnabled?: boolean;
  lyricsEmptyStateHidden: boolean;
  lyricsPlayerBarDrawerEnabled?: boolean;
  lyricsPlayerBarDrawerOpacityPercent?: number;
  lyricsPlayerBarDrawerColorMode?: LyricsMiniPlayerColorMode;
  lyricsPlayerBarDrawerColor?: string;
  lyricsRomanizationEnabled: boolean;
  lyricsUtatenKanaEnabled?: boolean;
  lyricsTranslationEnabled: boolean;
  lyricsWordHighlightEnabled?: boolean;
  lyricsWordHighlightClarityPercent?: number;
  lyricsFontSizePx: number;
  lyricsSecondaryFontSizePx?: number;
  lyricsFontFamily?: string;
  lyricsFontFilePath?: string | null;
  lyricsLineSpacingPercent?: number;
  lyricsLineMaxChars?: number;
  lyricsContextOpacityPercent?: number;
  lyricsColor: string;
  lyricsSmartReadableColorsEnabled?: boolean;
  lyricsHighResolutionNetworkCoverEnabled?: boolean;
  lyricsBackgroundMode: LyricsBackgroundMode;
  lyricsCustomWallpaperPath: string | null;
  lyricsCoverOpacityPercent: number;
  lyricsCoverBlurPx: number;
  lyricsCoverBrightnessPercent: number;
  lyricsBackgroundScalePercent: number;
  desktopLyricsEnabled?: boolean;
  desktopLyricsLocked?: boolean;
  desktopLyricsFontSizePx?: number;
  desktopLyricsScalePercent?: number;
  desktopLyricsColor?: string;
  desktopLyricsStrokeColor?: string;
  desktopLyricsOpacityPercent?: number;
  desktopLyricsBounds?: DesktopLyricsBounds | null;
  mvEnabled?: boolean;
  mvEnabledProviders: NetworkMvProviderId[];
  mvProviderOrder: NetworkMvProviderId[];
  mvAutoSearch: boolean;
  mvAutoPreload?: boolean;
  mvAutoApplyThreshold?: number;
  mvPreferHighestViewCount?: boolean;
  mvImmersiveBackground?: boolean;
  mvImmersiveBackgroundScalePercent?: number;
  mvImmersiveBackgroundOffsetXPercent?: number;
  mvImmersiveBackgroundOffsetYPercent?: number;
  mvImmersiveBackgroundBlurPx?: number;
  mvImmersiveBackgroundBrightnessPercent?: number;
  mvImmersiveBackgroundOverlayOpacityPercent?: number;
  mvLyricsReadabilityEnhanced?: boolean;
  mvRestartAudioOnLoad?: boolean;
  mvSyncMode?: MvSyncMode;
  mvReplayAudioOnChange?: boolean;
  mvMaxQuality: MvMaxQuality;
  mvAllow60fps: boolean;
  channelBalance: ChannelBalanceState;
  playerVolume: number;
  gaplessPlaybackEnabled?: boolean;
  replayGainEnabled?: boolean;
  replayGainMode?: ReplayGainMode;
  replayGainTargetLufs?: number;
  replayGainPreampDb?: number;
  replayGainPreventClipping?: boolean;
  replayGainAnalyzeOnPlay?: boolean;
  replayGainAnalyzeMissingOnScanOptIn?: boolean;
  replayGainAnalyzeMissingOnScan?: boolean;
  backgroundSpacePauseEnabled?: boolean;
  globalShortcuts?: GlobalShortcutSettings;
  playbackSpeed: number;
  playbackSpeedMode: PlaybackSpeedMode;
  scanPerformanceMode: ScanPerformanceMode;
  duplicateTracksEnabled: boolean;
  duplicateTracksMode: DuplicateTrackMode;
  duplicateTracksAutoRebuildAfterScan: boolean;
  discordRichPresenceEnabled: boolean;
  lastFmEnabled: boolean;
  lastFmUsername: string | null;
  lastFmSessionKey: string | null;
  lastFmScrobbleEnabled: boolean;
  lastFmNowPlayingEnabled: boolean;
  lastFmMinScrobbleSeconds: number;
  lastFmAuthToken: string | null;
  smtcEnabled: boolean;
  taskbarPlaybackControlsEnabled: boolean;
};
