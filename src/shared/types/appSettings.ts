import type { AudioDsdOutputMode, AudioLatencyProfile, AudioOutputMode, AudioSharedBackend, ChannelBalanceState, PlaybackSpeedMode } from './audio';
import type { DuplicateTrackMode } from './library';
import type { LibrarySort } from './library';
import type { LyricsProviderId } from './lyrics';
import type { MvMaxQuality, NetworkMvProviderId } from './mv';
import type { GlobalShortcutSettings } from './globalShortcuts';

export type ScanPerformanceMode = 'low' | 'balanced' | 'performance';
export type LyricsBackgroundMode = 'theme' | 'cover' | 'customWallpaper';
export type LyricsMiniPlayerColorMode = 'default' | 'custom' | 'cover';
export type AppLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';
export type AppThemeMode = 'light' | 'dark' | 'system';
export type ReplayGainMode = 'off' | 'track' | 'album';
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
  panelOpacityPercent?: number;
  glassPercent?: number;
  shadowPercent?: number;
};

export type AppThemePresetOverride = {
  light?: AppThemeToneOverride;
  dark?: AppThemeToneOverride;
};

export type AppThemePresetOverrides = Partial<Record<AppThemePreset, AppThemePresetOverride>>;

export type AppearancePreferences = {
  mainFontFamily: string;
  mainFontFilePath: string | null;
  chineseFontFamily: string;
  chineseFontFilePath: string | null;
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
  locale?: AppLocale;
  appearanceTheme: AppThemeMode;
  appearanceThemePreset?: AppThemePreset;
  appearanceThemePresetOverrides?: AppThemePresetOverrides;
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
  albumMergeStrategy: 'standard' | 'sameTitleAndCover';
  chineseCrossScriptSearchEnabled?: boolean;
  artistWallAlbumArtwork: boolean;
  artistWallAlbumFallbackForMissingAvatars?: boolean;
  autoFetchArtistImages?: boolean;
  artistImageFetchPaused?: boolean;
  autoUpdateEnabled?: boolean;
  autoAccountCheckOnStartup?: boolean;
  spotifyAutoLaunchOfficialPlayer?: boolean;
  playlistBackupsEnabled?: boolean;
  coverCacheDir: string | null;
  hideToTrayOnClose: boolean;
  rememberWindowSizeEnabled?: boolean;
  rememberedWindowSize?: RememberedWindowSize | null;
  appCustomWallpaperPath: string | null;
  appWallpaperScalePercent: number;
  appWallpaperBlurPx: number;
  appWallpaperBrightnessPercent: number;
  appWallpaperUiOpacityPercent: number;
  appWallpaperVisualProtectionEnabled?: boolean;
  appWallpaperUnifiedOpacityEnabled: boolean;
  networkMetadataEnabled: boolean;
  networkMetadataProviders: Array<'mock' | 'musicbrainz' | 'cover-art-archive' | 'netease-cloud-music' | 'qq-music'>;
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
  lyricsOffsetControlsEnabled?: boolean;
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
  lyricsTranslationEnabled: boolean;
  lyricsWordHighlightEnabled?: boolean;
  lyricsFontSizePx: number;
  lyricsSecondaryFontSizePx?: number;
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
  mvEnabled?: boolean;
  mvEnabledProviders: NetworkMvProviderId[];
  mvProviderOrder: NetworkMvProviderId[];
  mvAutoSearch: boolean;
  mvAutoPreload?: boolean;
  mvAutoApplyThreshold?: number;
  mvImmersiveBackground?: boolean;
  mvImmersiveBackgroundScalePercent?: number;
  mvImmersiveBackgroundOffsetXPercent?: number;
  mvImmersiveBackgroundOffsetYPercent?: number;
  mvImmersiveBackgroundBlurPx?: number;
  mvImmersiveBackgroundBrightnessPercent?: number;
  mvImmersiveBackgroundOverlayOpacityPercent?: number;
  mvLyricsReadabilityEnhanced?: boolean;
  mvRestartAudioOnLoad?: boolean;
  mvReplayAudioOnChange?: boolean;
  mvMaxQuality: MvMaxQuality;
  mvAllow60fps: boolean;
  channelBalance: ChannelBalanceState;
  playerVolume: number;
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
  playbackFollowCurrentTrack?: boolean;
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
};
