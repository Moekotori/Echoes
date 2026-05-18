import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  Captions,
  Check,
  Clapperboard,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  Globe2,
  Headphones,
  History,
  Info,
  Keyboard,
  Link2,
  MessageSquare,
  Palette,
  Pause,
  Play,
  RotateCw,
  Search,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
  ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AudioDeviceInfo, AudioOutputMode, AudioOutputSettings, AudioSharedBackend, AudioStatus, PlaybackSpeedMode } from '../../shared/types/audio';
import type { AccountProvider, AccountStatus, YouTubeBrowser } from '../../shared/types/accounts';
import type { AppSettings, AppThemeMode, AppThemePreset, AppThemePresetOverrides, AppThemeToneOverride } from '../../shared/types/appSettings';
import type { MvSettings, NetworkMvProviderId } from '../../shared/types/mv';
import {
  createDefaultGlobalShortcuts,
  createRecommendedGlobalShortcuts,
  globalShortcutActions,
  validateGlobalShortcutAccelerator,
  type GlobalShortcutAction,
  type GlobalShortcutSettings,
} from '../../shared/types/globalShortcuts';
import type { CoverCacheMigrationResult } from '../../shared/types/coverCache';
import type { LastCrashSummary } from '../../shared/types/diagnostics';
import type { DiscordPresenceStatus } from '../../shared/types/discordPresence';
import type { DownloadSettings } from '../../shared/types/downloads';
import type { LastFmStatus } from '../../shared/types/lastfm';
import type { ArtistImageCacheSummary, ArtistImageJobStatus, BpmAnalysisJobStatus, ReplayGainAnalysisJobStatus, DuplicateTrackIndexSummary } from '../../shared/types/library';
import type { UpdateStatus } from '../../shared/types/updates';
import { EqPanel } from '../components/audio/EqPanel';
import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';
import { NetworkMetadataPanel } from '../components/library/NetworkMetadataPanel';
import { LyricsSettingsPanel } from '../components/lyrics/LyricsSettingsDrawer';
import { PlaybackStabilityDiagnosticsPanel } from '../components/player/PlaybackStabilityDiagnosticsPanel';
import { RemoteSourcesPanel } from '../components/settings/RemoteSourcesPanel';
import { StyledSelect } from '../components/ui/StyledSelect';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import {
  defaultAppearancePreferences,
  readAppearancePreferences,
  registerAppearanceFontFile,
  updateAppearancePreferences,
  type AppearancePreferences,
} from '../preferences/appearancePreferences';
import {
  applyThemeMode,
  defaultThemeMode,
  defaultThemePreset,
  normalizeThemeHexColor,
  normalizeThemePreset,
  normalizeThemePresetOverrides,
  readThemePreset,
  readThemePresetOverrides,
  updateThemePreferences,
  updateThemePresetOverrides,
} from '../preferences/themePreferences';
import { rememberLibraryScanStatus } from '../stores/libraryScanSession';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import {
  getAccountsBridge,
  getAppBridge,
  getAudioBridge,
  getDiagnosticsBridge,
  getDiscordPresenceBridge,
  getDownloadsBridge,
  getLastFmBridge,
  getLibraryBridge,
} from '../utils/echoBridge';

const isDevBuild = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

const normalizeAsioOutputChannelStart = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
};

const deviceMatchesAudioStatus = (device: AudioDeviceInfo, status: AudioStatus | null): boolean => {
  if (!status) {
    return false;
  }

  const modeMatches = status.outputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared';
  if (!modeMatches) {
    return false;
  }

  const identityMatches = status.outputDeviceId === device.id || status.outputDeviceName === device.name;
  if (!identityMatches || status.outputMode !== 'asio') {
    return identityMatches;
  }

  const deviceChannelStart = normalizeAsioOutputChannelStart(device.asioOutputChannelStart) ?? 0;
  const statusChannelStart = normalizeAsioOutputChannelStart(status.asioOutputChannelStart) ?? 0;
  return deviceChannelStart === statusChannelStart;
};

const playbackSpeedModes: Array<{ mode: PlaybackSpeedMode; label: string }> = [
  { mode: 'nightcore', label: 'Nightcore' },
  { mode: 'daycore', label: 'Daycore' },
  { mode: 'speed', label: '普通变速' },
];

const globalShortcutActionMeta: Array<{
  action: GlobalShortcutAction;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { action: 'playPause', titleKey: 'settings.shortcuts.action.playPause.title', descriptionKey: 'settings.shortcuts.action.playPause.description' },
  { action: 'previousTrack', titleKey: 'settings.shortcuts.action.previousTrack.title', descriptionKey: 'settings.shortcuts.action.previousTrack.description' },
  { action: 'nextTrack', titleKey: 'settings.shortcuts.action.nextTrack.title', descriptionKey: 'settings.shortcuts.action.nextTrack.description' },
  { action: 'stop', titleKey: 'settings.shortcuts.action.stop.title', descriptionKey: 'settings.shortcuts.action.stop.description' },
  { action: 'volumeUp', titleKey: 'settings.shortcuts.action.volumeUp.title', descriptionKey: 'settings.shortcuts.action.volumeUp.description' },
  { action: 'volumeDown', titleKey: 'settings.shortcuts.action.volumeDown.title', descriptionKey: 'settings.shortcuts.action.volumeDown.description' },
  { action: 'seekBackward', titleKey: 'settings.shortcuts.action.seekBackward.title', descriptionKey: 'settings.shortcuts.action.seekBackward.description' },
  { action: 'seekForward', titleKey: 'settings.shortcuts.action.seekForward.title', descriptionKey: 'settings.shortcuts.action.seekForward.description' },
  { action: 'showMainWindow', titleKey: 'settings.shortcuts.action.showMainWindow.title', descriptionKey: 'settings.shortcuts.action.showMainWindow.description' },
  { action: 'bossKey', titleKey: 'settings.shortcuts.action.bossKey.title', descriptionKey: 'settings.shortcuts.action.bossKey.description' },
  { action: 'speedUp', titleKey: 'settings.shortcuts.action.speedUp.title', descriptionKey: 'settings.shortcuts.action.speedUp.description' },
  { action: 'speedDown', titleKey: 'settings.shortcuts.action.speedDown.title', descriptionKey: 'settings.shortcuts.action.speedDown.description' },
  { action: 'openAudioSettings', titleKey: 'settings.shortcuts.action.openAudioSettings.title', descriptionKey: 'settings.shortcuts.action.openAudioSettings.description' },
  { action: 'openMvSettings', titleKey: 'settings.shortcuts.action.openMvSettings.title', descriptionKey: 'settings.shortcuts.action.openMvSettings.description' },
  { action: 'openLyricsSettings', titleKey: 'settings.shortcuts.action.openLyricsSettings.title', descriptionKey: 'settings.shortcuts.action.openLyricsSettings.description' },
];

const shortcutKeyAliases = new Map<string, string>([
  [' ', 'Space'],
  ['Spacebar', 'Space'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['Escape', 'Esc'],
  ['+', 'Plus'],
  ['Add', 'Plus'],
  ['NumpadAdd', 'Plus'],
  ['Subtract', '-'],
  ['NumpadSubtract', '-'],
  ['Multiply', '*'],
  ['NumpadMultiply', '*'],
  ['Divide', '/'],
  ['NumpadDivide', '/'],
  ['Decimal', '.'],
  ['NumpadDecimal', '.'],
  ['MediaPlayPause', 'MediaPlayPause'],
  ['MediaNextTrack', 'MediaNextTrack'],
  ['MediaPreviousTrack', 'MediaPreviousTrack'],
  ['MediaStop', 'MediaStop'],
]);

const normalizeShortcutEventKey = (event: KeyboardEvent): string | null => {
  const code = event.code;
  const aliasedCode = shortcutKeyAliases.get(code);
  if (aliasedCode) {
    return aliasedCode;
  }

  if (/^Key[A-Z]$/u.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/u.test(code)) {
    return code.slice(5);
  }

  if (/^Numpad[0-9]$/u.test(code)) {
    return code.slice(6);
  }

  const aliased = shortcutKeyAliases.get(event.key);
  if (aliased) {
    return aliased;
  }

  if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta') {
    return null;
  }

  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
};

const acceleratorFromKeyboardEvent = (event: KeyboardEvent): string | null => {
  const key = normalizeShortcutEventKey(event);
  if (!key) {
    return null;
  }

  const modifiers = [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    event.metaKey ? 'Command' : null,
  ].filter((item): item is string => Boolean(item));

  return [...modifiers, key].join('+');
};

const acceleratorFromMouseEvent = (event: MouseEvent): string | null => {
  switch (event.button) {
    case 1:
      return 'MouseButton3';
    case 3:
      return 'MouseButton4';
    case 4:
      return 'MouseButton5';
    default:
      return null;
  }
};

const formatAcceleratorForDisplay = (accelerator: string | null | undefined, emptyLabel: string): string =>
  accelerator ? accelerator.split('+').join(' + ') : emptyLabel;

const findDuplicateGlobalShortcutAction = (
  shortcuts: GlobalShortcutSettings,
  action: GlobalShortcutAction,
  accelerator: string,
): GlobalShortcutAction | null => {
  const normalized = accelerator.toLowerCase();
  return (
    globalShortcutActions.find(
      (candidate) => candidate !== action && shortcuts[candidate]?.accelerator?.toLowerCase() === normalized,
    ) ?? null
  );
};

const normalizeSharedBackend = (value: unknown): AudioSharedBackend =>
  value === 'windows' || value === 'directsound' ? value : 'auto';

const networkProviderLabels: Record<AppSettings['networkMetadataProviders'][number], string> = {
  'netease-cloud-music': '网易云音乐',
  'qq-music': 'QQ 音乐',
  musicbrainz: 'MusicBrainz',
  'cover-art-archive': 'Cover Art Archive',
  mock: 'Mock',
};
const visibleNetworkMetadataProviders: AppSettings['networkMetadataProviders'] = ['netease-cloud-music', 'qq-music', 'musicbrainz'];
const defaultNetworkMetadataProviders: AppSettings['networkMetadataProviders'] = ['netease-cloud-music', 'qq-music'];
const mvNetworkProviders: NetworkMvProviderId[] = ['bilibili', 'youtube'];
const mvProviderLabels: Record<NetworkMvProviderId, string> = {
  bilibili: 'Bilibili',
  youtube: 'YouTube',
};
const mvQualityCaps: MvSettings['maxQuality'][] = ['720p', '1080p', '1440p', '2160p', 'max'];
const mvImmersiveBackgroundDefaults = {
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
} satisfies Partial<MvSettings>;

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const formatMvPercent = (value: number | undefined, fallback: number): string => `${Math.round(value ?? fallback)}%`;
const formatMvThreshold = (threshold: number | undefined): string => `${Math.round((threshold ?? 0.7) * 100)}%`;
const mvThresholdFromPercent = (value: number): number => Math.max(30, Math.min(100, Math.round(value))) / 100;

const normalizeMvProviderOrder = (value: NetworkMvProviderId[] | undefined): NetworkMvProviderId[] => {
  const ordered = (value ?? mvNetworkProviders).filter((provider): provider is NetworkMvProviderId => mvNetworkProviders.includes(provider));
  const missing = mvNetworkProviders.filter((provider) => !ordered.includes(provider));
  return [...ordered, ...missing];
};

const appSettingsPatchFromMvSettingsPatch = (patch: Partial<MvSettings>): Partial<AppSettings> => {
  const appPatch: Partial<AppSettings> = {};

  if (hasOwn(patch, 'enabled')) {
    appPatch.mvEnabled = patch.enabled;
  }
  if (hasOwn(patch, 'enabledProviders') && patch.enabledProviders) {
    appPatch.mvEnabledProviders = patch.enabledProviders;
  }
  if (hasOwn(patch, 'providerOrder') && patch.providerOrder) {
    appPatch.mvProviderOrder = patch.providerOrder;
  }
  if (hasOwn(patch, 'autoSearch') && patch.autoSearch !== undefined) {
    appPatch.mvAutoSearch = patch.autoSearch;
  }
  if (hasOwn(patch, 'autoPreload')) {
    appPatch.mvAutoPreload = patch.autoPreload;
  }
  if (hasOwn(patch, 'autoApplyThreshold')) {
    appPatch.mvAutoApplyThreshold = patch.autoApplyThreshold;
  }
  if (hasOwn(patch, 'immersiveBackground')) {
    appPatch.mvImmersiveBackground = patch.immersiveBackground;
  }
  if (hasOwn(patch, 'immersiveBackgroundScalePercent')) {
    appPatch.mvImmersiveBackgroundScalePercent = patch.immersiveBackgroundScalePercent;
  }
  if (hasOwn(patch, 'immersiveBackgroundOffsetXPercent')) {
    appPatch.mvImmersiveBackgroundOffsetXPercent = patch.immersiveBackgroundOffsetXPercent;
  }
  if (hasOwn(patch, 'immersiveBackgroundOffsetYPercent')) {
    appPatch.mvImmersiveBackgroundOffsetYPercent = patch.immersiveBackgroundOffsetYPercent;
  }
  if (hasOwn(patch, 'immersiveBackgroundBlurPx')) {
    appPatch.mvImmersiveBackgroundBlurPx = patch.immersiveBackgroundBlurPx;
  }
  if (hasOwn(patch, 'immersiveBackgroundBrightnessPercent')) {
    appPatch.mvImmersiveBackgroundBrightnessPercent = patch.immersiveBackgroundBrightnessPercent;
  }
  if (hasOwn(patch, 'immersiveBackgroundOverlayOpacityPercent')) {
    appPatch.mvImmersiveBackgroundOverlayOpacityPercent = patch.immersiveBackgroundOverlayOpacityPercent;
  }
  if (hasOwn(patch, 'lyricsReadabilityEnhanced')) {
    appPatch.mvLyricsReadabilityEnhanced = patch.lyricsReadabilityEnhanced;
  }
  if (hasOwn(patch, 'restartAudioOnLoad')) {
    appPatch.mvRestartAudioOnLoad = patch.restartAudioOnLoad;
  }
  if (hasOwn(patch, 'replayAudioOnChange')) {
    appPatch.mvReplayAudioOnChange = patch.replayAudioOnChange;
  }
  if (hasOwn(patch, 'maxQuality') && patch.maxQuality) {
    appPatch.mvMaxQuality = patch.maxQuality;
  }
  if (hasOwn(patch, 'allow60fps') && patch.allow60fps !== undefined) {
    appPatch.mvAllow60fps = patch.allow60fps;
  }

  return appPatch;
};

const normalizeExternalAppSettingsPatch = (patch: Partial<AppSettings> | Partial<MvSettings>): Partial<AppSettings> => ({
  ...(patch as Partial<AppSettings>),
  ...appSettingsPatchFromMvSettingsPatch(patch as Partial<MvSettings>),
});

type SettingsNavKey = 'general' | 'playback' | 'shortcuts' | 'lyrics' | 'mv' | 'integrations' | 'remote' | 'eq' | 'appearance' | 'library' | 'about' | 'danger';

type SettingsNavItem = {
  key: SettingsNavKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
};

type SettingsSearchResult = {
  id: string;
  sectionKey: SettingsNavKey;
  title: string;
  description: string;
  targetId?: string;
  score: number;
};

type FontPickerTarget = 'main' | 'chinese';
type AlbumMergeStrategy = AppSettings['albumMergeStrategy'];
type AccountBusyAction = 'save' | 'check' | 'clear' | 'browser' | 'login';

type LocalFontData = {
  family: string;
};

type NavigatorWithLocalFonts = Navigator & {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
};

const fallbackFontFamilies = [
  'Outfit',
  'Inter',
  'Segoe UI',
  'Arial',
  'Helvetica Neue',
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'PingFang SC',
  'PingFang TC',
  'Noto Sans SC',
  'Noto Sans TC',
  'Source Han Sans SC',
  'Source Han Sans TC',
  'SimHei',
  'SimSun',
  'Hiragino Sans',
  'Yu Gothic',
  'Meiryo',
];

const accountProviderLabels: Record<AccountProvider, string> = {
  netease: '网易云音乐',
  qqmusic: 'QQ 音乐',
  bilibili: 'Bilibili',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  osu: 'osu!',
};

type ArtistImageProgress = ArtistImageJobStatus & {
  startedAt: number;
};

const emptyArtistImageSummary: ArtistImageCacheSummary = {
  total: 0,
  matched: 0,
  pending: 0,
  loading: 0,
  notFound: 0,
  error: 0,
  rateLimited: 0,
};

const accountLoginUrls: Record<AccountProvider, string> = {
  netease: 'https://music.163.com/',
  qqmusic: 'https://y.qq.com/',
  bilibili: 'https://www.bilibili.com/',
  youtube: 'https://www.youtube.com/',
  soundcloud: 'https://soundcloud.com/',
  spotify: 'https://accounts.spotify.com/',
  osu: 'https://osu.ppy.sh/',
};

const cookieAccountProviders: AccountProvider[] = ['netease', 'qqmusic', 'bilibili', 'soundcloud', 'osu'];
const youtubeBrowserOptions: Array<{ value: YouTubeBrowser; label: string }> = [
  { value: 'edge', label: 'Edge' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'none', label: '不使用' },
];

type SettingSectionProps = {
  id: SettingsNavKey;
  activeKey: SettingsNavKey;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
};

type SettingRowProps = {
  className?: string;
  id?: string;
  highlighted?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
};

const scheduleSettingsIdleTask = (callback: () => void): (() => void) => {
  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;
  const requestIdleCallback = window.requestIdleCallback;
  const cancelIdleCallback = window.cancelIdleCallback;

  const frameId = window.requestAnimationFrame(() => {
    if (cancelled) {
      return;
    }

    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(() => {
        if (!cancelled) {
          callback();
        }
      }, { timeout: 1200 });
      return;
    }

    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        callback();
      }
    }, 120);
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frameId);
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
};

const settingsNavItems: SettingsNavItem[] = [
  { key: 'general', labelKey: 'settings.nav.general.label', descriptionKey: 'settings.nav.general.description', icon: MessageSquare },
  { key: 'playback', labelKey: 'settings.nav.playback.label', descriptionKey: 'settings.nav.playback.description', icon: Zap },
  { key: 'shortcuts', labelKey: 'settings.nav.shortcuts.label', descriptionKey: 'settings.nav.shortcuts.description', icon: Keyboard },
  { key: 'lyrics', labelKey: 'route.lyricsSettings.label', descriptionKey: 'route.lyricsSettings.description', icon: Captions },
  { key: 'mv', labelKey: 'route.mvSettings.label', descriptionKey: 'route.mvSettings.description', icon: Clapperboard },
  { key: 'integrations', labelKey: 'settings.nav.integrations.label', descriptionKey: 'settings.nav.integrations.description', icon: Link2 },
  { key: 'remote', labelKey: 'settings.nav.remote.label', descriptionKey: 'settings.nav.remote.description', icon: Globe2 },
  { key: 'eq', labelKey: 'settings.nav.eq.label', descriptionKey: 'settings.nav.eq.description', icon: SlidersHorizontal },
  { key: 'appearance', labelKey: 'settings.nav.appearance.label', descriptionKey: 'settings.nav.appearance.description', icon: Palette },
  { key: 'library', labelKey: 'settings.nav.library.label', descriptionKey: 'settings.nav.library.description', icon: Download },
  { key: 'about', labelKey: 'settings.nav.about.label', descriptionKey: 'settings.nav.about.description', icon: Info },
  { key: 'danger', labelKey: 'settings.nav.danger.label', descriptionKey: 'settings.nav.danger.description', icon: Trash2 },
];

const settingsSearchAliases: Record<SettingsNavKey, string[]> = {
  general: ['general', 'language', 'locale', 'tray', 'window size', 'backup', 'settings backup', '通用', '语言', '简繁', '繁简', '托盘', '窗口尺寸', '备份'],
  playback: [
    'playback',
    'audio',
    'output',
    'device',
    'asio',
    'wasapi',
    'exclusive',
    'juce',
    'dsd',
    'dop',
    'soxr',
    'speed',
    'follow current',
    '播放',
    '音频',
    '输出',
    '设备',
    '独占',
    '采样率',
    '重启音频',
    '变速',
    '当前播放',
  ],
  shortcuts: ['shortcuts', 'hotkeys', 'keyboard', 'global shortcut', 'record shortcut', '快捷键', '热键', '键盘', '全局快捷键'],
  lyrics: [
    'lyrics',
    'lrc',
    'karaoke',
    'offset',
    'provider',
    'romaji',
    'translation',
    'translate',
    'translated lyrics',
    'bilingual lyrics',
    '歌词',
    '逐字',
    '偏移',
    '音译',
    '罗马音',
    '歌词源',
    '翻译',
    '译文',
    '中文翻译',
    '双语歌词',
    '歌詞',
    '翻譯',
    '譯文',
    '雙語歌詞',
  ],
  mv: ['mv', 'music video', 'video', 'bilibili', 'youtube', 'auto search', 'preload', 'quality', 'immersive', 'background'],
  integrations: [
    'integrations',
    'account',
    'login',
    'last.fm',
    'discord',
    'smtc',
    'youtube',
    'spotify',
    'bilibili',
    'netease',
    'qq music',
    '集成',
    '账号',
    '登录',
    '账户',
    '网易云',
    'QQ 音乐',
    '哔哩哔哩',
    '会员',
  ],
  remote: ['remote', 'webdav', 'subsonic', 'jellyfin', 'emby', 'navidrome', 'server', '远程', '网盘', '服务器', '媒体库', '云端'],
  eq: ['eq', 'equalizer', 'balance', 'preamp', 'channel', '均衡器', '均衡', '声道', '平衡', '预放大'],
  appearance: [
    'appearance',
    'theme',
    'dark',
    'light',
    'system',
    'wallpaper',
    'font',
    'density',
    'artist avatar',
    'artist image',
    'cover',
    'transparent',
    '外观',
    '主题',
    '深色',
    '浅色',
    '跟随系统',
    '壁纸',
    '字体',
    '密度',
    '艺术家头像',
    '艺术家封面',
    '封面',
    '透明',
    '背景',
  ],
  library: [
    'library',
    'folder',
    'scan',
    'cache',
    'download',
    'metadata',
    'duplicate',
    'bpm',
    'embedded tags',
    'artist images',
    '曲库',
    '资料库',
    '文件夹',
    '扫描',
    '缓存',
    '下载',
    '元数据',
    '重复歌曲',
    '内嵌标签',
    'BPM',
  ],
  about: ['about', 'version', 'update', 'diagnostics', 'crash', 'repository', '关于', '版本', '更新', '诊断', '崩溃', '仓库'],
  danger: ['danger', 'reset', 'clear cache', 'delete cache', 'restore defaults', '危险', '重置', '清空缓存', '恢复默认'],
};

const normalizeSettingsSearchText = (value: string): string => value.trim().toLocaleLowerCase();

const compactSettingsSearchText = (value: string): string => normalizeSettingsSearchText(value).replace(/\s+/gu, '');

const settingsSearchKeywordAliases: Record<string, string[]> = {
  status: ['state', 'connected', 'connection', 'presence', 'running', 'enabled', 'disabled', 'error', 'login', '健康', '状态', '狀態', '连接', '連線', '在线', '启用', '啟用'],
  状态: ['status', 'state', 'presence', 'connected', 'connection', 'running', 'enabled', 'disabled', 'error', '狀態', '连接', '在线', '启用'],
  狀態: ['status', 'state', 'presence', 'connected', 'connection', 'running', 'enabled', 'disabled', 'error', '状态', '連線', '在線', '啟用'],
  presence: ['discord', 'rich presence', 'status', '状态', '狀態'],
};

const expandSettingsSearchQuery = (query: string): string[] => {
  const normalized = normalizeSettingsSearchText(query);
  const compact = compactSettingsSearchText(query);
  const expansions = new Set([normalized, compact]);

  [normalized, compact].forEach((token) => {
    settingsSearchKeywordAliases[token]?.forEach((alias) => {
      expansions.add(normalizeSettingsSearchText(alias));
      expansions.add(compactSettingsSearchText(alias));
    });
  });

  return [...expansions].filter(Boolean);
};

const rankSettingsSearch = (query: string, terms: string[]): number => {
  const queries = expandSettingsSearchQuery(query);
  const normalizedTerms = terms.flatMap((term) => [normalizeSettingsSearchText(term), compactSettingsSearchText(term)]).filter(Boolean);

  let bestScore = 0;
  queries.forEach((candidateQuery, queryIndex) => {
    normalizedTerms.forEach((term, termIndex) => {
      if (!candidateQuery || !term) {
        return;
      }

      const aliasPenalty = queryIndex === 0 ? 0 : 8;
      const termPenalty = Math.min(termIndex, 8);
      if (term === candidateQuery) {
        bestScore = Math.max(bestScore, 120 - aliasPenalty - termPenalty);
      } else if (term.startsWith(candidateQuery)) {
        bestScore = Math.max(bestScore, 95 - aliasPenalty - termPenalty);
      } else if (term.includes(candidateQuery)) {
        bestScore = Math.max(bestScore, 75 - aliasPenalty - termPenalty);
      } else if (candidateQuery.length >= 2 && candidateQuery.includes(term)) {
        bestScore = Math.max(bestScore, 45 - aliasPenalty - termPenalty);
      }
    });
  });

  return bestScore;
};

const isSafeMarkdownHref = (href: string): boolean => {
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:|#|\/(?!\/))/iu.test(trimmed);
};

const parseMarkdownInline = (text: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let textBuffer = '';

  const flushText = (): void => {
    if (textBuffer) {
      nodes.push(textBuffer);
      textBuffer = '';
    }
  };

  while (cursor < text.length) {
    if (text.startsWith('`', cursor)) {
      const end = text.indexOf('`', cursor + 1);
      if (end > cursor + 1) {
        flushText();
        nodes.push(<code key={`${keyPrefix}-code-${cursor}`}>{text.slice(cursor + 1, end)}</code>);
        cursor = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', cursor)) {
      const end = text.indexOf('**', cursor + 2);
      if (end > cursor + 2) {
        flushText();
        nodes.push(<strong key={`${keyPrefix}-strong-${cursor}`}>{parseMarkdownInline(text.slice(cursor + 2, end), `${keyPrefix}-strong-${cursor}`)}</strong>);
        cursor = end + 2;
        continue;
      }
    }

    if (text[cursor] === '[') {
      const labelEnd = text.indexOf(']', cursor + 1);
      const hrefStart = labelEnd >= 0 && text[labelEnd + 1] === '(' ? labelEnd + 2 : -1;
      const hrefEnd = hrefStart >= 0 ? text.indexOf(')', hrefStart) : -1;

      if (labelEnd > cursor + 1 && hrefStart >= 0 && hrefEnd > hrefStart) {
        const label = text.slice(cursor + 1, labelEnd);
        const href = text.slice(hrefStart, hrefEnd).trim();
        flushText();
        nodes.push(
          isSafeMarkdownHref(href) ? (
            <a key={`${keyPrefix}-link-${cursor}`} href={href} target="_blank" rel="noreferrer">
              {parseMarkdownInline(label, `${keyPrefix}-link-${cursor}`)}
            </a>
          ) : (
            <span key={`${keyPrefix}-link-${cursor}`}>{parseMarkdownInline(label, `${keyPrefix}-link-${cursor}`)}</span>
          ),
        );
        cursor = hrefEnd + 1;
        continue;
      }
    }

    textBuffer += text[cursor];
    cursor += 1;
  }

  flushText();
  return nodes;
};

const ReleaseNotesMarkdown = ({ markdown }: { markdown: string }): JSX.Element => {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  const pushParagraph = (paragraphLines: string[], key: string): void => {
    const paragraph = paragraphLines.join(' ').trim();
    if (paragraph) {
      blocks.push(<p key={key}>{parseMarkdownInline(paragraph, key)}</p>);
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      const blockKey = `code-${index}`;
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(
        <pre key={blockKey}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/u.exec(trimmed);
    if (headingMatch) {
      const headingLevel = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      const headingKey = `heading-${index}`;
      blocks.push(
        headingLevel === 1 ? (
          <h3 key={headingKey}>{parseMarkdownInline(headingText, headingKey)}</h3>
        ) : headingLevel === 2 ? (
          <h4 key={headingKey}>{parseMarkdownInline(headingText, headingKey)}</h4>
        ) : (
          <h5 key={headingKey}>{parseMarkdownInline(headingText, headingKey)}</h5>
        ),
      );
      index += 1;
      continue;
    }

    const listMatch = /^(\s*)([-*+]|\d+\.)\s+(.+)$/u.exec(line);
    if (listMatch) {
      const ordered = /\d+\./u.test(listMatch[2]);
      const items: ReactNode[] = [];
      const listKey = `list-${index}`;
      while (index < lines.length) {
        const itemMatch = /^(\s*)([-*+]|\d+\.)\s+(.+)$/u.exec(lines[index]);
        if (!itemMatch || /\d+\./u.test(itemMatch[2]) !== ordered) {
          break;
        }
        items.push(<li key={`${listKey}-item-${index}`}>{parseMarkdownInline(itemMatch[3].trim(), `${listKey}-item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={listKey}>{items}</ol> : <ul key={listKey}>{items}</ul>);
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const quoteKey = `quote-${index}`;
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/u, ''));
        index += 1;
      }
      blocks.push(<blockquote key={quoteKey}>{parseMarkdownInline(quoteLines.join(' '), quoteKey)}</blockquote>);
      continue;
    }

    const paragraphLines = [line.trim()];
    const paragraphKey = `paragraph-${index}`;
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('```') &&
      !/^(#{1,3})\s+(.+)$/u.test(lines[index].trim()) &&
      !/^(\s*)([-*+]|\d+\.)\s+(.+)$/u.test(lines[index]) &&
      !lines[index].trim().startsWith('>')
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    pushParagraph(paragraphLines, paragraphKey);
  }

  return <div className="settings-update-markdown">{blocks}</div>;
};

const formatRate = (value: number | null): string => {
  if (!value) {
    return 'n/a';
  }

  return `${value} Hz`;
};

const statusRows = (
  status: AudioStatus | null,
  formatBool: (value: boolean) => string,
): Array<{ label: string; value: string }> => [
  { label: 'state', value: status?.state ?? 'loading' },
  { label: 'outputMode', value: status?.outputMode ?? 'shared' },
  { label: 'outputBackend', value: status?.outputBackend ?? 'n/a' },
  { label: 'activeOutputBackendImpl', value: status?.activeOutputBackendImpl ?? 'n/a' },
  { label: 'useJuceOutputRequested', value: formatBool(status?.useJuceOutputRequested ?? false) },
  { label: 'activeDecodeBackendImpl', value: status?.activeDecodeBackendImpl ?? 'n/a' },
  { label: 'useJuceDecodeRequested', value: formatBool(status?.useJuceDecodeRequested ?? false) },
  { label: 'dsdOutputModeRequested', value: status?.dsdOutputModeRequested ?? 'pcm' },
  { label: 'activeDsdOutputMode', value: status?.activeDsdOutputMode ?? 'n/a' },
  { label: 'dsdNativeSampleRate', value: formatRate(status?.dsdNativeSampleRate ?? null) },
  { label: 'dsdTransportSampleRate', value: formatRate(status?.dsdTransportSampleRate ?? null) },
  { label: 'fileSampleRate', value: formatRate(status?.fileSampleRate ?? null) },
  { label: 'decoderOutputSampleRate', value: formatRate(status?.decoderOutputSampleRate ?? null) },
  { label: 'requestedOutputSampleRate', value: formatRate(status?.requestedOutputSampleRate ?? null) },
  { label: 'actualDeviceSampleRate', value: formatRate(status?.actualDeviceSampleRate ?? null) },
  { label: 'sharedDeviceSampleRate', value: formatRate(status?.sharedDeviceSampleRate ?? null) },
  { label: 'outputDeviceName', value: status?.outputDeviceName ?? 'n/a' },
  { label: 'resampling', value: formatBool(status?.resampling ?? false) },
  { label: 'ffmpegSource', value: status?.ffmpegSource ?? 'n/a' },
  { label: 'ffmpegVersion', value: status?.ffmpegVersion ?? 'n/a' },
  { label: 'soxrAvailable', value: formatBool(status?.soxrAvailable ?? false) },
  { label: 'resamplerEngine', value: status?.resamplerEngine ?? 'default' },
  { label: 'resamplerFallbackActive', value: formatBool(status?.resamplerFallbackActive ?? false) },
  { label: 'bitPerfectCandidate', value: formatBool(status?.bitPerfectCandidate ?? false) },
  { label: 'bitPerfectDisabledReason', value: status?.bitPerfectDisabledReason ?? 'n/a' },
  { label: 'sampleRateMismatch', value: formatBool(status?.sampleRateMismatch ?? false) },
];

const themeModeOptions: Array<{ mode: AppThemeMode; labelKey: TranslationKey }> = [
  { mode: 'light', labelKey: 'settings.appearance.theme.light' },
  { mode: 'dark', labelKey: 'settings.appearance.theme.dark' },
  { mode: 'system', labelKey: 'settings.appearance.theme.followSystem' },
];

const themePresetOptions: Array<{
  preset: AppThemePreset;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  preview: string;
  swatches: string[];
}> = [
  {
    preset: 'classic',
    labelKey: 'settings.appearance.themePreset.classic',
    descriptionKey: 'settings.appearance.themePreset.classic.description',
    preview: 'linear-gradient(135deg, #f8fbfd 0%, #eef3f7 52%, #dfe8f2 100%)',
    swatches: ['#eef3f7', '#2f6da8', '#101318'],
  },
  {
    preset: 'echoTwilight',
    labelKey: 'settings.appearance.themePreset.echoTwilight',
    descriptionKey: 'settings.appearance.themePreset.echoTwilight.description',
    preview: 'linear-gradient(135deg, #fff4ef 0%, #f3d7cf 48%, #efe5f2 100%)',
    swatches: ['#fff4ef', '#df6b5f', '#8ccfc8'],
  },
  {
    preset: 'sakuraMilk',
    labelKey: 'settings.appearance.themePreset.sakuraMilk',
    descriptionKey: 'settings.appearance.themePreset.sakuraMilk.description',
    preview: 'linear-gradient(135deg, #fff6f9 0%, #f7d9e7 48%, #f0eefc 100%)',
    swatches: ['#fff6f9', '#cf5d7d', '#7fc8d6'],
  },
  {
    preset: 'peachSoda',
    labelKey: 'settings.appearance.themePreset.peachSoda',
    descriptionKey: 'settings.appearance.themePreset.peachSoda.description',
    preview: 'linear-gradient(135deg, #fff2e8 0%, #ffd6bd 44%, #d7f4ee 100%)',
    swatches: ['#fff2e8', '#d96d4c', '#5eb9ad'],
  },
  {
    preset: 'mintCandy',
    labelKey: 'settings.appearance.themePreset.mintCandy',
    descriptionKey: 'settings.appearance.themePreset.mintCandy.description',
    preview: 'linear-gradient(135deg, #f6fff8 0%, #d7f2df 46%, #ffe5ec 100%)',
    swatches: ['#f6fff8', '#3f9274', '#dd6e86'],
  },
  {
    preset: 'berryDream',
    labelKey: 'settings.appearance.themePreset.berryDream',
    descriptionKey: 'settings.appearance.themePreset.berryDream.description',
    preview: 'linear-gradient(135deg, #f8f5ff 0%, #e2d9fb 46%, #ffddec 100%)',
    swatches: ['#f8f5ff', '#7657b8', '#cf5f95'],
  },
  {
    preset: 'matchaCream',
    labelKey: 'settings.appearance.themePreset.matchaCream',
    descriptionKey: 'settings.appearance.themePreset.matchaCream.description',
    preview: 'linear-gradient(135deg, #fbfaeb 0%, #e1edc9 48%, #f6d9d7 100%)',
    swatches: ['#fbfaeb', '#6e8f49', '#c8757a'],
  },
  {
    preset: 'lemonMochi',
    labelKey: 'settings.appearance.themePreset.lemonMochi',
    descriptionKey: 'settings.appearance.themePreset.lemonMochi.description',
    preview: 'linear-gradient(135deg, #fffbe6 0%, #f6e7ad 48%, #eaf4fb 100%)',
    swatches: ['#fffbe6', '#c99a26', '#86bdd4'],
  },
  {
    preset: 'cottonCloud',
    labelKey: 'settings.appearance.themePreset.cottonCloud',
    descriptionKey: 'settings.appearance.themePreset.cottonCloud.description',
    preview: 'linear-gradient(135deg, #f8fbff 0%, #dfe9ff 48%, #ffe5f0 100%)',
    swatches: ['#f8fbff', '#6c88d8', '#dc6f9b'],
  },
  {
    preset: 'melonCream',
    labelKey: 'settings.appearance.themePreset.melonCream',
    descriptionKey: 'settings.appearance.themePreset.melonCream.description',
    preview: 'linear-gradient(135deg, #f8fff0 0%, #dff0c9 48%, #ffe2d8 100%)',
    swatches: ['#f8fff0', '#6ca344', '#db7b62'],
  },
  {
    preset: 'seaSaltJelly',
    labelKey: 'settings.appearance.themePreset.seaSaltJelly',
    descriptionKey: 'settings.appearance.themePreset.seaSaltJelly.description',
    preview: 'linear-gradient(135deg, #f1fffb 0%, #cfeeea 48%, #ffe3dd 100%)',
    swatches: ['#f1fffb', '#3c9a92', '#d66d5e'],
  },
  {
    preset: 'caramelPudding',
    labelKey: 'settings.appearance.themePreset.caramelPudding',
    descriptionKey: 'settings.appearance.themePreset.caramelPudding.description',
    preview: 'linear-gradient(135deg, #fff7e8 0%, #f5d29b 46%, #ffdce6 100%)',
    swatches: ['#fff7e8', '#b7772f', '#d56f86'],
  },
  {
    preset: 'neonCandy',
    labelKey: 'settings.appearance.themePreset.neonCandy',
    descriptionKey: 'settings.appearance.themePreset.neonCandy.description',
    preview: 'linear-gradient(135deg, #f6f7ff 0%, #e7dcff 45%, #d8fff7 100%)',
    swatches: ['#f6f7ff', '#8b5cf6', '#ff6fb1'],
  },
  {
    preset: 'wisteriaBubble',
    labelKey: 'settings.appearance.themePreset.wisteriaBubble',
    descriptionKey: 'settings.appearance.themePreset.wisteriaBubble.description',
    preview: 'linear-gradient(135deg, #fbf7ff 0%, #e8d9ff 46%, #dcfff4 100%)',
    swatches: ['#fbf7ff', '#8f6ed5', '#67cdb3'],
  },
  {
    preset: 'strawberryCookie',
    labelKey: 'settings.appearance.themePreset.strawberryCookie',
    descriptionKey: 'settings.appearance.themePreset.strawberryCookie.description',
    preview: 'linear-gradient(135deg, #fff8f0 0%, #f7dcc6 46%, #ffe3ee 100%)',
    swatches: ['#fff8f0', '#d75a72', '#c5924f'],
  },
  {
    preset: 'graphiteAurora',
    labelKey: 'settings.appearance.themePreset.graphiteAurora',
    descriptionKey: 'settings.appearance.themePreset.graphiteAurora.description',
    preview: 'linear-gradient(135deg, #f5f7f8 0%, #dfe6e8 48%, #d8f3ec 100%)',
    swatches: ['#f5f7f8', '#2f7f73', '#496a9f'],
  },
  {
    preset: 'amberNoir',
    labelKey: 'settings.appearance.themePreset.amberNoir',
    descriptionKey: 'settings.appearance.themePreset.amberNoir.description',
    preview: 'linear-gradient(135deg, #fbf7ee 0%, #ead9bb 48%, #f3e7d4 100%)',
    swatches: ['#fbf7ee', '#9a6a24', '#37302b'],
  },
  {
    preset: 'oceanStudio',
    labelKey: 'settings.appearance.themePreset.oceanStudio',
    descriptionKey: 'settings.appearance.themePreset.oceanStudio.description',
    preview: 'linear-gradient(135deg, #f4f8fb 0%, #d8e8ef 48%, #dce3f2 100%)',
    swatches: ['#f4f8fb', '#2f7390', '#596b9a'],
  },
  {
    preset: 'rosewoodVinyl',
    labelKey: 'settings.appearance.themePreset.rosewoodVinyl',
    descriptionKey: 'settings.appearance.themePreset.rosewoodVinyl.description',
    preview: 'linear-gradient(135deg, #fbf3ee 0%, #ead3c7 48%, #f0dfe7 100%)',
    swatches: ['#fbf3ee', '#8f4d48', '#6d4f2c'],
  },
  {
    preset: 'darkSideMoon',
    labelKey: 'settings.appearance.themePreset.darkSideMoon',
    descriptionKey: 'settings.appearance.themePreset.darkSideMoon.description',
    preview: 'linear-gradient(135deg, #020203 0%, #101217 44%, #20242d 55%, #ed2f3b 56%, #f58f20 63%, #f6d93b 70%, #44c765 77%, #26a8ed 84%, #8d63c7 100%)',
    swatches: ['#020203', '#f4f6f8', '#ed2f3b', '#f6d93b', '#26a8ed'],
  },
  {
    preset: 'shibuyaNight',
    labelKey: 'settings.appearance.themePreset.shibuyaNight',
    descriptionKey: 'settings.appearance.themePreset.shibuyaNight.description',
    preview: 'linear-gradient(135deg, #1b0d2b 0%, #3a185e 46%, #073449 100%)',
    swatches: ['#1b0d2b', '#ff3b9d', '#23d0ee'],
  },
  {
    preset: 'kyotoKurenai',
    labelKey: 'settings.appearance.themePreset.kyotoKurenai',
    descriptionKey: 'settings.appearance.themePreset.kyotoKurenai.description',
    preview: 'linear-gradient(135deg, #fff1df 0%, #e8b99b 48%, #f7d989 100%)',
    swatches: ['#fff1df', '#a92f26', '#c08a1e'],
  },
  {
    preset: 'ukiyoIndigo',
    labelKey: 'settings.appearance.themePreset.ukiyoIndigo',
    descriptionKey: 'settings.appearance.themePreset.ukiyoIndigo.description',
    preview: 'linear-gradient(135deg, #eaf1ed 0%, #9fbccb 48%, #d8c094 100%)',
    swatches: ['#eaf1ed', '#174f7f', '#b06d1f'],
  },
  {
    preset: 'fujiSnow',
    labelKey: 'settings.appearance.themePreset.fujiSnow',
    descriptionKey: 'settings.appearance.themePreset.fujiSnow.description',
    preview: 'linear-gradient(135deg, #edf8ff 0%, #badcff 48%, #f5d1e6 100%)',
    swatches: ['#edf8ff', '#246fc8', '#c74786'],
  },
  {
    preset: 'matsuriLantern',
    labelKey: 'settings.appearance.themePreset.matsuriLantern',
    descriptionKey: 'settings.appearance.themePreset.matsuriLantern.description',
    preview: 'linear-gradient(135deg, #fff0d8 0%, #efae67 48%, #ffd35f 100%)',
    swatches: ['#fff0d8', '#c23c28', '#d88409'],
  },
  {
    preset: 'ginzaNoir',
    labelKey: 'settings.appearance.themePreset.ginzaNoir',
    descriptionKey: 'settings.appearance.themePreset.ginzaNoir.description',
    preview: 'linear-gradient(135deg, #090a0d 0%, #111219 48%, #1b1712 100%)',
    swatches: ['#090a0d', '#d6b158', '#66a8d4'],
  },
  {
    preset: 'frostJazz',
    labelKey: 'settings.appearance.themePreset.frostJazz',
    descriptionKey: 'settings.appearance.themePreset.frostJazz.description',
    preview: 'linear-gradient(135deg, #eaf2fb 0%, #aac2df 48%, #d4c0dc 100%)',
    swatches: ['#eaf2fb', '#245f9e', '#7f3e70'],
  },
];

type ThemeTone = 'light' | 'dark';
type ThemeColorField = keyof Pick<
  AppThemeToneOverride,
  'appBg' | 'appBg2' | 'appBg3' | 'panel' | 'panelSoft' | 'accent' | 'accentStrong' | 'secondary' | 'heading' | 'text' | 'muted' | 'border' | 'onAccent' | 'buttonText'
>;
type ThemePercentField = keyof Pick<AppThemeToneOverride, 'panelOpacityPercent' | 'glassPercent' | 'shadowPercent'>;
type ThemeEditorDefaults = Required<Pick<AppThemeToneOverride, ThemeColorField | ThemePercentField>>;
type ThemeExportPayload = {
  exportedAt: string;
  overrides: AppThemePresetOverrides;
  preset: AppThemePreset;
  schema: 'echo-next.theme-preset';
  version: 1;
};

const themeEditorDefaults: Record<AppThemePreset, Record<ThemeTone, ThemeEditorDefaults>> = {
  classic: {
    light: {
      appBg: '#f8fbfd',
      appBg2: '#eef3f7',
      appBg3: '#dfe8f2',
      panel: '#ffffff',
      panelSoft: '#eff5fc',
      accent: '#2f6da8',
      accentStrong: '#164b7d',
      secondary: '#42b3a8',
      heading: '#1c2735',
      text: '#32455d',
      muted: '#65758a',
      border: '#283e58',
      onAccent: '#ffffff',
      buttonText: '#32455d',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#101318',
      appBg2: '#151a22',
      appBg3: '#111827',
      panel: '#1c222b',
      panelSoft: '#161b23',
      accent: '#75b7ff',
      accentStrong: '#cce6ff',
      secondary: '#7dd7cb',
      heading: '#f8fbff',
      text: '#d8e0ea',
      muted: '#a8b5c4',
      border: '#647c96',
      onAccent: '#0f1720',
      buttonText: '#d8e0ea',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  echoTwilight: {
    light: {
      appBg: '#fff4ef',
      appBg2: '#f3d7cf',
      appBg3: '#efe5f2',
      panel: '#fffcf9',
      panelSoft: '#fbe9e4',
      accent: '#df6b5f',
      accentStrong: '#a83e37',
      secondary: '#8ccfc8',
      heading: '#352321',
      text: '#4f3833',
      muted: '#765d57',
      border: '#b87065',
      onAccent: '#ffffff',
      buttonText: '#4f3833',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#151012',
      appBg2: '#211719',
      appBg3: '#171320',
      panel: '#271e21',
      panelSoft: '#1f181b',
      accent: '#e2776d',
      accentStrong: '#ffd0ca',
      secondary: '#8fd4ce',
      heading: '#fff7f4',
      text: '#f3e3de',
      muted: '#d2b9b2',
      border: '#df8479',
      onAccent: '#2b1513',
      buttonText: '#f3e3de',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  sakuraMilk: {
    light: {
      appBg: '#fff6f9',
      appBg2: '#f7d9e7',
      appBg3: '#f0eefc',
      panel: '#fffdfe',
      panelSoft: '#fce8f0',
      accent: '#cf5d7d',
      accentStrong: '#9a3157',
      secondary: '#7fc8d6',
      heading: '#361f29',
      text: '#55333f',
      muted: '#765b66',
      border: '#b05d7c',
      onAccent: '#ffffff',
      buttonText: '#55333f',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#151015',
      appBg2: '#231722',
      appBg3: '#171627',
      panel: '#271e26',
      panelSoft: '#201820',
      accent: '#e17599',
      accentStrong: '#ffd0df',
      secondary: '#8acdda',
      heading: '#fff6fb',
      text: '#f4e2ea',
      muted: '#d4b7c3',
      border: '#da7797',
      onAccent: '#2c131d',
      buttonText: '#f4e2ea',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  peachSoda: {
    light: {
      appBg: '#fff2e8',
      appBg2: '#ffd6bd',
      appBg3: '#d7f4ee',
      panel: '#fffdf9',
      panelSoft: '#faeadc',
      accent: '#d96d4c',
      accentStrong: '#9c3e26',
      secondary: '#5eb9ad',
      heading: '#33231d',
      text: '#50392f',
      muted: '#745d54',
      border: '#b3684c',
      onAccent: '#ffffff',
      buttonText: '#50392f',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#15110f',
      appBg2: '#241915',
      appBg3: '#10201f',
      panel: '#271f1b',
      panelSoft: '#201916',
      accent: '#e27b58',
      accentStrong: '#ffd2c1',
      secondary: '#78c9be',
      heading: '#fff5ef',
      text: '#f4e3d8',
      muted: '#d2b8ac',
      border: '#da7e56',
      onAccent: '#2c1710',
      buttonText: '#f4e3d8',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  mintCandy: {
    light: {
      appBg: '#f6fff8',
      appBg2: '#d7f2df',
      appBg3: '#ffe5ec',
      panel: '#fdfffa',
      panelSoft: '#e6f5e6',
      accent: '#3f9274',
      accentStrong: '#27664f',
      secondary: '#dd6e86',
      heading: '#1f3029',
      text: '#33493e',
      muted: '#556f63',
      border: '#5c896f',
      onAccent: '#ffffff',
      buttonText: '#33493e',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#101512',
      appBg2: '#17231c',
      appBg3: '#23151b',
      panel: '#1d2721',
      panelSoft: '#17201b',
      accent: '#6bc09b',
      accentStrong: '#c3f5df',
      secondary: '#e28aa0',
      heading: '#f5fff8',
      text: '#e0f0e7',
      muted: '#b7d0c3',
      border: '#61b991',
      onAccent: '#10261c',
      buttonText: '#e0f0e7',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  berryDream: {
    light: {
      appBg: '#f8f5ff',
      appBg2: '#e2d9fb',
      appBg3: '#ffddec',
      panel: '#fffdff',
      panelSoft: '#efe8fa',
      accent: '#7657b8',
      accentStrong: '#563995',
      secondary: '#cf5f95',
      heading: '#2d2440',
      text: '#45395b',
      muted: '#655878',
      border: '#725ba6',
      onAccent: '#ffffff',
      buttonText: '#45395b',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#11101a',
      appBg2: '#1b1730',
      appBg3: '#241421',
      panel: '#201d2e',
      panelSoft: '#1a1726',
      accent: '#9a79dd',
      accentStrong: '#ddd0ff',
      secondary: '#e48ab5',
      heading: '#fbf8ff',
      text: '#e9e4f7',
      muted: '#c4badd',
      border: '#9277d4',
      onAccent: '#1d1233',
      buttonText: '#e9e4f7',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  matchaCream: {
    light: {
      appBg: '#fbfaeb',
      appBg2: '#e1edc9',
      appBg3: '#f6d9d7',
      panel: '#fffef6',
      panelSoft: '#ecefd4',
      accent: '#6e8f49',
      accentStrong: '#4d6b2f',
      secondary: '#c8757a',
      heading: '#2b301d',
      text: '#42452d',
      muted: '#62664a',
      border: '#7c8e4f',
      onAccent: '#ffffff',
      buttonText: '#42452d',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#12140e',
      appBg2: '#1d2215',
      appBg3: '#241716',
      panel: '#22261c',
      panelSoft: '#1c2017',
      accent: '#95b766',
      accentStrong: '#e5f5bd',
      secondary: '#dd8d91',
      heading: '#fbffe9',
      text: '#e8eddb',
      muted: '#c6d0ad',
      border: '#8ba658',
      onAccent: '#1d250f',
      buttonText: '#e8eddb',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  lemonMochi: {
    light: {
      appBg: '#fffbe6',
      appBg2: '#f6e7ad',
      appBg3: '#eaf4fb',
      panel: '#fffef5',
      panelSoft: '#f7eecb',
      accent: '#c99a26',
      accentStrong: '#8a6113',
      secondary: '#86bdd4',
      heading: '#332a10',
      text: '#4c3f1c',
      muted: '#706133',
      border: '#b28d37',
      onAccent: '#241800',
      buttonText: '#4c3f1c',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#15140f',
      appBg2: '#221f13',
      appBg3: '#111b23',
      panel: '#262319',
      panelSoft: '#201d15',
      accent: '#d5aa3a',
      accentStrong: '#ffe59a',
      secondary: '#8bc8df',
      heading: '#fff9df',
      text: '#f5eed2',
      muted: '#d5c99a',
      border: '#cfa93f',
      onAccent: '#2a1d05',
      buttonText: '#f5eed2',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  cottonCloud: {
    light: {
      appBg: '#f8fbff',
      appBg2: '#dfe9ff',
      appBg3: '#ffe5f0',
      panel: '#fdfeff',
      panelSoft: '#e7eefd',
      accent: '#6c88d8',
      accentStrong: '#3f5fb5',
      secondary: '#dc6f9b',
      heading: '#20283c',
      text: '#3a435c',
      muted: '#5c6680',
      border: '#6980bc',
      onAccent: '#ffffff',
      buttonText: '#3a435c',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#10131d',
      appBg2: '#171d31',
      appBg3: '#241521',
      panel: '#1d2231',
      panelSoft: '#171c2a',
      accent: '#8ba5f0',
      accentStrong: '#dae3ff',
      secondary: '#e58db3',
      heading: '#fbfdff',
      text: '#e8eefc',
      muted: '#c2cce8',
      border: '#7e96e4',
      onAccent: '#11192c',
      buttonText: '#e8eefc',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  melonCream: {
    light: {
      appBg: '#f8fff0',
      appBg2: '#dff0c9',
      appBg3: '#ffe2d8',
      panel: '#fdfff8',
      panelSoft: '#e7f1d8',
      accent: '#6ca344',
      accentStrong: '#47752a',
      secondary: '#db7b62',
      heading: '#213218',
      text: '#354827',
      muted: '#596f45',
      border: '#6d9348',
      onAccent: '#ffffff',
      buttonText: '#354827',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#10160f',
      appBg2: '#172415',
      appBg3: '#251814',
      panel: '#1d281c',
      panelSoft: '#172116',
      accent: '#8cc76a',
      accentStrong: '#d8f6bf',
      secondary: '#e18d78',
      heading: '#f8ffe9',
      text: '#e8f3dc',
      muted: '#c3d8ad',
      border: '#7bb852',
      onAccent: '#14270e',
      buttonText: '#e8f3dc',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  seaSaltJelly: {
    light: {
      appBg: '#f1fffb',
      appBg2: '#cfeeea',
      appBg3: '#ffe3dd',
      panel: '#fafffd',
      panelSoft: '#dbf1ee',
      accent: '#3c9a92',
      accentStrong: '#226f68',
      secondary: '#d66d5e',
      heading: '#183633',
      text: '#2b4d49',
      muted: '#4f716d',
      border: '#48948d',
      onAccent: '#ffffff',
      buttonText: '#2b4d49',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#0f1718',
      appBg2: '#152525',
      appBg3: '#241714',
      panel: '#1a292a',
      panelSoft: '#152223',
      accent: '#67c9c0',
      accentStrong: '#c2f5ef',
      secondary: '#e28b7d',
      heading: '#f2fffc',
      text: '#dcf1ee',
      muted: '#b1d8d2',
      border: '#50bdb5',
      onAccent: '#0d2826',
      buttonText: '#dcf1ee',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  caramelPudding: {
    light: {
      appBg: '#fff7e8',
      appBg2: '#f5d29b',
      appBg3: '#ffdce6',
      panel: '#fffaf0',
      panelSoft: '#f4dfb8',
      accent: '#b7772f',
      accentStrong: '#7f4b18',
      secondary: '#d56f86',
      heading: '#3a2511',
      text: '#5a3a20',
      muted: '#7a5940',
      border: '#b98245',
      onAccent: '#ffffff',
      buttonText: '#5a3a20',
      panelOpacityPercent: 74,
      glassPercent: 16,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#18110b',
      appBg2: '#2a1b10',
      appBg3: '#2a1019',
      panel: '#2b1c12',
      panelSoft: '#21160f',
      accent: '#e0a45c',
      accentStrong: '#ffd79a',
      secondary: '#f18aa7',
      heading: '#fff3db',
      text: '#f1d8b7',
      muted: '#d5b58a',
      border: '#d68f45',
      onAccent: '#29170a',
      buttonText: '#f1d8b7',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  neonCandy: {
    light: {
      appBg: '#f6f7ff',
      appBg2: '#e7dcff',
      appBg3: '#d8fff7',
      panel: '#ffffff',
      panelSoft: '#efe9ff',
      accent: '#8b5cf6',
      accentStrong: '#5b39b4',
      secondary: '#ff6fb1',
      heading: '#241a3f',
      text: '#46385f',
      muted: '#6a5a82',
      border: '#9275e8',
      onAccent: '#ffffff',
      buttonText: '#46385f',
      panelOpacityPercent: 72,
      glassPercent: 20,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#101021',
      appBg2: '#1b1640',
      appBg3: '#102b2b',
      panel: '#1f1b39',
      panelSoft: '#16162b',
      accent: '#a989ff',
      accentStrong: '#e1d7ff',
      secondary: '#ff84be',
      heading: '#f7f2ff',
      text: '#e7dcff',
      muted: '#c4b5e8',
      border: '#9b7cff',
      onAccent: '#181033',
      buttonText: '#e7dcff',
      panelOpacityPercent: 86,
      glassPercent: 24,
      shadowPercent: 100,
    },
  },
  wisteriaBubble: {
    light: {
      appBg: '#fbf7ff',
      appBg2: '#e8d9ff',
      appBg3: '#dcfff4',
      panel: '#fffaff',
      panelSoft: '#eee2ff',
      accent: '#8f6ed5',
      accentStrong: '#6043a6',
      secondary: '#67cdb3',
      heading: '#2c2144',
      text: '#4c3c68',
      muted: '#6f5f8c',
      border: '#9c82df',
      onAccent: '#ffffff',
      buttonText: '#4c3c68',
      panelOpacityPercent: 72,
      glassPercent: 18,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#13101d',
      appBg2: '#211a36',
      appBg3: '#10251f',
      panel: '#211a32',
      panelSoft: '#171423',
      accent: '#b99cff',
      accentStrong: '#eee6ff',
      secondary: '#7be0c5',
      heading: '#fbf7ff',
      text: '#e7dcfb',
      muted: '#c9b9e8',
      border: '#a88aff',
      onAccent: '#1c1230',
      buttonText: '#e7dcfb',
      panelOpacityPercent: 86,
      glassPercent: 24,
      shadowPercent: 100,
    },
  },
  strawberryCookie: {
    light: {
      appBg: '#fff8f0',
      appBg2: '#f7dcc6',
      appBg3: '#ffe3ee',
      panel: '#fffaf4',
      panelSoft: '#f4dfcf',
      accent: '#d75a72',
      accentStrong: '#9f3449',
      secondary: '#c5924f',
      heading: '#3b211c',
      text: '#5b3a32',
      muted: '#7c5d52',
      border: '#c9798a',
      onAccent: '#ffffff',
      buttonText: '#5b3a32',
      panelOpacityPercent: 74,
      glassPercent: 16,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#19100f',
      appBg2: '#2a1915',
      appBg3: '#291018',
      panel: '#2b1b18',
      panelSoft: '#211412',
      accent: '#f08aa0',
      accentStrong: '#ffd0da',
      secondary: '#e0b66c',
      heading: '#fff0e8',
      text: '#f1d2c9',
      muted: '#d9b2a4',
      border: '#e18196',
      onAccent: '#321017',
      buttonText: '#f1d2c9',
      panelOpacityPercent: 86,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  graphiteAurora: {
    light: {
      appBg: '#f5f7f8',
      appBg2: '#dfe6e8',
      appBg3: '#d8f3ec',
      panel: '#fbfcfc',
      panelSoft: '#e8eef0',
      accent: '#2f7f73',
      accentStrong: '#1f5d55',
      secondary: '#496a9f',
      heading: '#1f292b',
      text: '#3f5053',
      muted: '#637174',
      border: '#7a9698',
      onAccent: '#ffffff',
      buttonText: '#3f5053',
      panelOpacityPercent: 76,
      glassPercent: 18,
      shadowPercent: 80,
    },
    dark: {
      appBg: '#101416',
      appBg2: '#182123',
      appBg3: '#10241f',
      panel: '#20292b',
      panelSoft: '#171f21',
      accent: '#5ec4b5',
      accentStrong: '#b2efe6',
      secondary: '#86a8e7',
      heading: '#edf6f5',
      text: '#d4e3e1',
      muted: '#a8bcba',
      border: '#5fb4aa',
      onAccent: '#0b2824',
      buttonText: '#d4e3e1',
      panelOpacityPercent: 88,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  amberNoir: {
    light: {
      appBg: '#fbf7ee',
      appBg2: '#ead9bb',
      appBg3: '#f3e7d4',
      panel: '#fffaf1',
      panelSoft: '#efe1c9',
      accent: '#9a6a24',
      accentStrong: '#624015',
      secondary: '#6a4b3a',
      heading: '#33291e',
      text: '#584737',
      muted: '#7a6a59',
      border: '#b99662',
      onAccent: '#ffffff',
      buttonText: '#584737',
      panelOpacityPercent: 76,
      glassPercent: 14,
      shadowPercent: 90,
    },
    dark: {
      appBg: '#11100e',
      appBg2: '#211a12',
      appBg3: '#2a2118',
      panel: '#2a241c',
      panelSoft: '#1d1914',
      accent: '#d4a64c',
      accentStrong: '#f5d78f',
      secondary: '#b88763',
      heading: '#fff3d8',
      text: '#ead9bd',
      muted: '#c3ad8d',
      border: '#c89a4b',
      onAccent: '#221405',
      buttonText: '#ead9bd',
      panelOpacityPercent: 88,
      glassPercent: 20,
      shadowPercent: 100,
    },
  },
  oceanStudio: {
    light: {
      appBg: '#f4f8fb',
      appBg2: '#d8e8ef',
      appBg3: '#dce3f2',
      panel: '#fbfdff',
      panelSoft: '#e5eef4',
      accent: '#2f7390',
      accentStrong: '#1d526a',
      secondary: '#596b9a',
      heading: '#202d3a',
      text: '#415363',
      muted: '#607486',
      border: '#7da3b7',
      onAccent: '#ffffff',
      buttonText: '#415363',
      panelOpacityPercent: 78,
      glassPercent: 20,
      shadowPercent: 80,
    },
    dark: {
      appBg: '#0f151b',
      appBg2: '#132332',
      appBg3: '#17203a',
      panel: '#1e2a34',
      panelSoft: '#16212b',
      accent: '#68b4d4',
      accentStrong: '#c2eaff',
      secondary: '#9aa7e8',
      heading: '#edf7ff',
      text: '#d4e5ef',
      muted: '#a9bfce',
      border: '#6cb1cf',
      onAccent: '#0c2531',
      buttonText: '#d4e5ef',
      panelOpacityPercent: 88,
      glassPercent: 24,
      shadowPercent: 100,
    },
  },
  rosewoodVinyl: {
    light: {
      appBg: '#fbf3ee',
      appBg2: '#ead3c7',
      appBg3: '#f0dfe7',
      panel: '#fff8f4',
      panelSoft: '#efdcd3',
      accent: '#8f4d48',
      accentStrong: '#66312d',
      secondary: '#8b6a3e',
      heading: '#35211f',
      text: '#5c4240',
      muted: '#7e6662',
      border: '#b27a73',
      onAccent: '#ffffff',
      buttonText: '#5c4240',
      panelOpacityPercent: 76,
      glassPercent: 16,
      shadowPercent: 90,
    },
    dark: {
      appBg: '#140f10',
      appBg2: '#251717',
      appBg3: '#201821',
      panel: '#2a1d1d',
      panelSoft: '#1e1516',
      accent: '#d4827b',
      accentStrong: '#f3b8ae',
      secondary: '#d2a45c',
      heading: '#fff0eb',
      text: '#ebd1cb',
      muted: '#c7aaa3',
      border: '#d18279',
      onAccent: '#2f1210',
      buttonText: '#ebd1cb',
      panelOpacityPercent: 88,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  darkSideMoon: {
    light: {
      appBg: '#050506',
      appBg2: '#111217',
      appBg3: '#08090c',
      panel: '#141519',
      panelSoft: '#0c0d10',
      accent: '#f4f6f8',
      accentStrong: '#ffffff',
      secondary: '#f6d93b',
      heading: '#ffffff',
      text: '#e8eaee',
      muted: '#b6bbc5',
      border: '#c9d1db',
      onAccent: '#08090d',
      buttonText: '#e8eaee',
      panelOpacityPercent: 88,
      glassPercent: 24,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#020203',
      appBg2: '#08090d',
      appBg3: '#11131a',
      panel: '#101116',
      panelSoft: '#08090c',
      accent: '#f6f7fb',
      accentStrong: '#ffffff',
      secondary: '#26a8ed',
      heading: '#ffffff',
      text: '#eceef4',
      muted: '#b8bfcc',
      border: '#e3e7ed',
      onAccent: '#050509',
      buttonText: '#eceef4',
      panelOpacityPercent: 92,
      glassPercent: 28,
      shadowPercent: 100,
    },
  },
  shibuyaNight: {
    light: {
      appBg: '#1b0d2b',
      appBg2: '#3a185e',
      appBg3: '#073449',
      panel: '#2a1f3a',
      panelSoft: '#1d142d',
      accent: '#ff3b9d',
      accentStrong: '#ffd4ee',
      secondary: '#23d0ee',
      heading: '#fff6ff',
      text: '#f1e8ff',
      muted: '#cdbde8',
      border: '#da3796',
      onAccent: '#26001a',
      buttonText: '#f1e8ff',
      panelOpacityPercent: 90,
      glassPercent: 30,
      shadowPercent: 100,
    },
    dark: {
      appBg: '#070411',
      appBg2: '#120824',
      appBg3: '#061a24',
      panel: '#170f26',
      panelSoft: '#10091c',
      accent: '#ff2f98',
      accentStrong: '#ffd3ed',
      secondary: '#18d5f4',
      heading: '#fff4ff',
      text: '#f0e5ff',
      muted: '#c7b5e4',
      border: '#f03aa4',
      onAccent: '#240018',
      buttonText: '#f0e5ff',
      panelOpacityPercent: 92,
      glassPercent: 30,
      shadowPercent: 100,
    },
  },
  kyotoKurenai: {
    light: {
      appBg: '#fff1df',
      appBg2: '#e8b99b',
      appBg3: '#f7d989',
      panel: '#fff8ed',
      panelSoft: '#f0d5b7',
      accent: '#a92f26',
      accentStrong: '#6e1d17',
      secondary: '#c08a1e',
      heading: '#30170f',
      text: '#543124',
      muted: '#755040',
      border: '#a64d36',
      onAccent: '#ffffff',
      buttonText: '#543124',
      panelOpacityPercent: 76,
      glassPercent: 16,
      shadowPercent: 90,
    },
    dark: {
      appBg: '#120807',
      appBg2: '#27100d',
      appBg3: '#241806',
      panel: '#2a1914',
      panelSoft: '#1d100d',
      accent: '#ff5f4a',
      accentStrong: '#ffd2c4',
      secondary: '#e3b23c',
      heading: '#fff4e8',
      text: '#f4d8c6',
      muted: '#d5b39b',
      border: '#e6644f',
      onAccent: '#310b06',
      buttonText: '#f4d8c6',
      panelOpacityPercent: 88,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  ukiyoIndigo: {
    light: {
      appBg: '#eaf1ed',
      appBg2: '#9fbccb',
      appBg3: '#d8c094',
      panel: '#fbfbf3',
      panelSoft: '#d6e1df',
      accent: '#174f7f',
      accentStrong: '#0d3659',
      secondary: '#b06d1f',
      heading: '#10283a',
      text: '#314655',
      muted: '#536b78',
      border: '#4f7893',
      onAccent: '#ffffff',
      buttonText: '#314655',
      panelOpacityPercent: 78,
      glassPercent: 18,
      shadowPercent: 82,
    },
    dark: {
      appBg: '#07101a',
      appBg2: '#0a2540',
      appBg3: '#211d15',
      panel: '#172b40',
      panelSoft: '#0d1d2e',
      accent: '#4aa6dd',
      accentStrong: '#c5e7ff',
      secondary: '#d59b43',
      heading: '#edf8ff',
      text: '#d8e8f4',
      muted: '#abc1d1',
      border: '#5eb3e2',
      onAccent: '#041b2f',
      buttonText: '#d8e8f4',
      panelOpacityPercent: 88,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  fujiSnow: {
    light: {
      appBg: '#edf8ff',
      appBg2: '#badcff',
      appBg3: '#f5d1e6',
      panel: '#fbfdff',
      panelSoft: '#d8ecff',
      accent: '#246fc8',
      accentStrong: '#174b90',
      secondary: '#c74786',
      heading: '#12233d',
      text: '#344860',
      muted: '#536983',
      border: '#5b89d0',
      onAccent: '#ffffff',
      buttonText: '#344860',
      panelOpacityPercent: 76,
      glassPercent: 20,
      shadowPercent: 82,
    },
    dark: {
      appBg: '#08111f',
      appBg2: '#10244a',
      appBg3: '#2a1430',
      panel: '#182438',
      panelSoft: '#0f192b',
      accent: '#6b9beb',
      accentStrong: '#d7e7ff',
      secondary: '#f07db7',
      heading: '#f8fbff',
      text: '#e2ecff',
      muted: '#b7c9e6',
      border: '#6b9beb',
      onAccent: '#071936',
      buttonText: '#e2ecff',
      panelOpacityPercent: 88,
      glassPercent: 24,
      shadowPercent: 100,
    },
  },
  matsuriLantern: {
    light: {
      appBg: '#fff0d8',
      appBg2: '#efae67',
      appBg3: '#ffd35f',
      panel: '#fff7e9',
      panelSoft: '#f2d4a7',
      accent: '#c23c28',
      accentStrong: '#842116',
      secondary: '#d88409',
      heading: '#35180d',
      text: '#553323',
      muted: '#77513d',
      border: '#b75a2f',
      onAccent: '#ffffff',
      buttonText: '#553323',
      panelOpacityPercent: 76,
      glassPercent: 16,
      shadowPercent: 94,
    },
    dark: {
      appBg: '#120706',
      appBg2: '#2d100b',
      appBg3: '#2a1a05',
      panel: '#311c15',
      panelSoft: '#21100c',
      accent: '#ff5a3c',
      accentStrong: '#ffd0bf',
      secondary: '#ffb72e',
      heading: '#fff1e2',
      text: '#f5d5c2',
      muted: '#d8ad91',
      border: '#f67c48',
      onAccent: '#340c05',
      buttonText: '#f5d5c2',
      panelOpacityPercent: 88,
      glassPercent: 22,
      shadowPercent: 100,
    },
  },
  ginzaNoir: {
    light: {
      appBg: '#ebe5da',
      appBg2: '#c7bca8',
      appBg3: '#c2cbd5',
      panel: '#faf7ef',
      panelSoft: '#e0d8c7',
      accent: '#72530e',
      accentStrong: '#4a3507',
      secondary: '#2f668e',
      heading: '#1c1c1d',
      text: '#413b33',
      muted: '#665d50',
      border: '#8a7650',
      onAccent: '#ffffff',
      buttonText: '#413b33',
      panelOpacityPercent: 78,
      glassPercent: 20,
      shadowPercent: 86,
    },
    dark: {
      appBg: '#090a0d',
      appBg2: '#111219',
      appBg3: '#1b1712',
      panel: '#1d1d24',
      panelSoft: '#111218',
      accent: '#d6b158',
      accentStrong: '#ffe1a0',
      secondary: '#66a8d4',
      heading: '#fff5e5',
      text: '#e8dfce',
      muted: '#c2b5a1',
      border: '#d6b158',
      onAccent: '#1f1604',
      buttonText: '#e8dfce',
      panelOpacityPercent: 92,
      glassPercent: 30,
      shadowPercent: 100,
    },
  },
  frostJazz: {
    light: {
      appBg: '#eaf2fb',
      appBg2: '#aac2df',
      appBg3: '#d4c0dc',
      panel: '#fbfdff',
      panelSoft: '#d9e5f2',
      accent: '#245f9e',
      accentStrong: '#163f70',
      secondary: '#7f3e70',
      heading: '#142234',
      text: '#34495f',
      muted: '#546a80',
      border: '#5c7da9',
      onAccent: '#ffffff',
      buttonText: '#34495f',
      panelOpacityPercent: 78,
      glassPercent: 20,
      shadowPercent: 82,
    },
    dark: {
      appBg: '#080d15',
      appBg2: '#101b2c',
      appBg3: '#201426',
      panel: '#182434',
      panelSoft: '#0e1724',
      accent: '#5c8fd3',
      accentStrong: '#d1e4ff',
      secondary: '#c06a9e',
      heading: '#f5f9ff',
      text: '#deebfb',
      muted: '#b1c4dc',
      border: '#5c8fd3',
      onAccent: '#07182d',
      buttonText: '#deebfb',
      panelOpacityPercent: 88,
      glassPercent: 24,
      shadowPercent: 100,
    },
  },
};

const coreThemeColorFields: Array<{ field: ThemeColorField; labelKey: TranslationKey; descriptionKey: TranslationKey }> = [
  { field: 'appBg', labelKey: 'settings.appearance.themeCustom.field.appBg', descriptionKey: 'settings.appearance.themeCustom.field.appBg.description' },
  { field: 'accent', labelKey: 'settings.appearance.themeCustom.field.accent', descriptionKey: 'settings.appearance.themeCustom.field.accent.description' },
  { field: 'accentStrong', labelKey: 'settings.appearance.themeCustom.field.accentStrong', descriptionKey: 'settings.appearance.themeCustom.field.accentStrong.description' },
  { field: 'secondary', labelKey: 'settings.appearance.themeCustom.field.secondary', descriptionKey: 'settings.appearance.themeCustom.field.secondary.description' },
  { field: 'heading', labelKey: 'settings.appearance.themeCustom.field.heading', descriptionKey: 'settings.appearance.themeCustom.field.heading.description' },
  { field: 'muted', labelKey: 'settings.appearance.themeCustom.field.muted', descriptionKey: 'settings.appearance.themeCustom.field.muted.description' },
  { field: 'panel', labelKey: 'settings.appearance.themeCustom.field.panel', descriptionKey: 'settings.appearance.themeCustom.field.panel.description' },
];

const gradientThemeColorFields: Array<{ field: ThemeColorField; labelKey: TranslationKey; descriptionKey: TranslationKey }> = [
  { field: 'appBg2', labelKey: 'settings.appearance.themeCustom.field.appBg2', descriptionKey: 'settings.appearance.themeCustom.field.appBg2.description' },
  { field: 'appBg3', labelKey: 'settings.appearance.themeCustom.field.appBg3', descriptionKey: 'settings.appearance.themeCustom.field.appBg3.description' },
];

const advancedThemeColorFields: Array<{ field: ThemeColorField; labelKey: TranslationKey; descriptionKey: TranslationKey }> = [
  { field: 'panelSoft', labelKey: 'settings.appearance.themeCustom.field.panelSoft', descriptionKey: 'settings.appearance.themeCustom.field.panelSoft.description' },
  { field: 'text', labelKey: 'settings.appearance.themeCustom.field.text', descriptionKey: 'settings.appearance.themeCustom.field.text.description' },
  { field: 'border', labelKey: 'settings.appearance.themeCustom.field.border', descriptionKey: 'settings.appearance.themeCustom.field.border.description' },
  { field: 'onAccent', labelKey: 'settings.appearance.themeCustom.field.onAccent', descriptionKey: 'settings.appearance.themeCustom.field.onAccent.description' },
  { field: 'buttonText', labelKey: 'settings.appearance.themeCustom.field.buttonText', descriptionKey: 'settings.appearance.themeCustom.field.buttonText.description' },
];

const percentThemeFields: Array<{ field: ThemePercentField; labelKey: TranslationKey; descriptionKey: TranslationKey; min: number; max: number }> = [
  { field: 'panelOpacityPercent', labelKey: 'settings.appearance.themeCustom.field.panelOpacity', descriptionKey: 'settings.appearance.themeCustom.field.panelOpacity.description', min: 40, max: 100 },
  { field: 'glassPercent', labelKey: 'settings.appearance.themeCustom.field.glass', descriptionKey: 'settings.appearance.themeCustom.field.glass.description', min: 0, max: 80 },
  { field: 'shadowPercent', labelKey: 'settings.appearance.themeCustom.field.shadow', descriptionKey: 'settings.appearance.themeCustom.field.shadow.description', min: 0, max: 100 },
];

const hexToRgb = (value: string): { r: number; g: number; b: number } | null => {
  const color = normalizeThemeHexColor(value);
  if (!color) {
    return null;
  }

  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
};

const getRelativeLuminance = (value: string): number => {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return 0;
  }

  const channel = (component: number): number => {
    const normalized = component / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return channel(rgb.r) * 0.2126 + channel(rgb.g) * 0.7152 + channel(rgb.b) * 0.0722;
};

const getContrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const bestReadableColor = (background: string): string => (getContrastRatio('#ffffff', background) >= getContrastRatio('#241a17', background) ? '#ffffff' : '#241a17');

const mergeThemeToneValues = (preset: AppThemePreset, tone: ThemeTone, draft: AppThemeToneOverride): ThemeEditorDefaults => ({
  ...themeEditorDefaults[preset][tone],
  ...draft,
});

const buildThemePresetOverrides = (
  current: AppThemePresetOverrides,
  preset: AppThemePreset,
  tone: ThemeTone,
  draft: AppThemeToneOverride | null,
): AppThemePresetOverrides => {
  const next: AppThemePresetOverrides = { ...current };
  const currentPresetOverride = { ...(next[preset] ?? {}) };

  if (!draft || Object.keys(draft).length === 0) {
    delete currentPresetOverride[tone];
  } else {
    currentPresetOverride[tone] = draft;
  }

  if (currentPresetOverride.light || currentPresetOverride.dark) {
    next[preset] = currentPresetOverride;
  } else {
    delete next[preset];
  }

  return next;
};

const isThemeExportPayload = (value: unknown): value is Partial<ThemeExportPayload> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readThemeExportPreset = (value: unknown): AppThemePreset | null => {
  if (!themePresetOptions.some((option) => option.preset === value)) {
    return null;
  }
  return normalizeThemePreset(value);
};

const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const getThemeContrastWarnings = (values: ThemeEditorDefaults): string[] => {
  const warnings: string[] = [];

  if (getContrastRatio(values.text, values.appBg) < 4.5) {
    warnings.push('body');
  }
  if (getContrastRatio(values.heading, values.appBg) < 4.5) {
    warnings.push('heading');
  }
  if (getContrastRatio(values.buttonText, values.panel) < 4.5) {
    warnings.push('button');
  }
  if (getContrastRatio(values.onAccent, values.accent) < 3) {
    warnings.push('accent');
  }

  return warnings;
};

const getUpdateStateLabel = (state: UpdateStatus['state']): string => {
  switch (state) {
    case 'checking':
      return '正在检查';
    case 'available':
      return '发现新版本';
    case 'downloading':
      return '下载中';
    case 'downloaded':
      return '下载完成，正在安装';
    case 'not-available':
      return '已是最新';
    case 'error':
      return '检查失败';
    case 'disabled':
      return '已关闭';
    default:
      return '待检查';
  }
};

const formatUpdateBytes = (bytes: number | null | undefined): string => {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return 'n/a';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

const SettingSection = ({ id, activeKey, icon: Icon, title, children }: SettingSectionProps): JSX.Element => {
  const isActive = activeKey === id;

  return (
    <section className="settings-section" id={`settings-sec-${id}`} data-visible={isActive}>
      <div className="section-title">
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {isActive ? children : null}
    </section>
  );
};

const SettingRow = ({ className, highlighted, id, title, description, children }: SettingRowProps): JSX.Element => (
  <div className={`setting-row ${className ?? ''}`.trim()} id={id} data-search-highlight={highlighted ? 'true' : undefined}>
    <div className="setting-info">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    {children}
  </div>
);

const ChipButton = ({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: string;
  onClick?: () => void;
}): JSX.Element => (
  <button className={`list-filter-chip ${active ? 'active' : ''}`} type="button" aria-pressed={active} onClick={onClick}>
    {children}
    {active ? <Check size={13} /> : null}
  </button>
);

const StatusText = ({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: 'neutral' | 'good' | 'muted';
}): JSX.Element => <span className={`settings-status-text settings-status-text--${tone}`}>{children}</span>;

const ToggleButton = ({
  active,
  disabled,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element => (
  <button className={`toggle-btn ${active ? 'active' : ''}`} type="button" aria-pressed={active} disabled={disabled} onClick={onClick}>
    <span />
  </button>
);

const getAccountStatusLabel = (status: AccountStatus | undefined): string => {
  if (!status) {
    return '检查中';
  }

  if (status.connected && status.error) {
    return '登录失效';
  }

  return status.connected ? '已登录' : '未登录';
};

const getAccountBadgeClass = (status: AccountStatus | undefined): string => {
  if (!status || !status.connected) {
    return 'list-filter-chip';
  }

  return status.error ? 'list-filter-chip settings-account-badge-error active' : 'list-filter-chip active';
};

const AccountCookieCard = ({
  busyAction,
  cookieValue,
  error,
  message,
  onChangeCookie,
  onCheck,
  onClear,
  onOpenLogin,
  onSave,
  provider,
  status,
}: {
  busyAction?: AccountBusyAction;
  cookieValue: string;
  error?: string | null;
  message?: string | null;
  onChangeCookie: (value: string) => void;
  onCheck: () => void;
  onClear: () => void;
  onOpenLogin: () => void;
  onSave: () => void;
  provider: AccountProvider;
  status?: AccountStatus;
}): JSX.Element => (
  <article className="settings-account-row" aria-label={accountProviderLabels[provider]}>
    <div className="settings-account-summary">
      <span className={getAccountBadgeClass(status)}>{getAccountStatusLabel(status)}</span>
      <div>
        <h3>{accountProviderLabels[provider]}</h3>
        <p>{provider === 'bilibili' ? '用于 MV 解析和高清画质。' : '歌词、元数据和下载接入预留。'}</p>
      </div>
    </div>
    <label className="settings-account-cookie-field">
      <input
        type="password"
        value={cookieValue}
        placeholder="粘贴 Cookie 后保存"
        onChange={(event) => onChangeCookie(event.target.value)}
        autoComplete="off"
      />
    </label>
    <div className="settings-account-actions">
      <button className="settings-action-button" type="button" disabled={busyAction === 'save' || cookieValue.trim().length === 0} onClick={onSave}>
        <Save size={15} />
        {busyAction === 'save' ? '保存中...' : '手动保存'}
      </button>
      <button className="settings-action-button" type="button" disabled={busyAction === 'check'} onClick={onCheck}>
        {busyAction === 'check' ? '检查中...' : '检查'}
      </button>
      <button className="settings-action-button settings-account-login-button" type="button" disabled={busyAction === 'login'} onClick={onOpenLogin}>
        <ExternalLink size={15} />
        {busyAction === 'login' ? '等待登录...' : '登录并同步'}
      </button>
      <button className="settings-danger-button" type="button" disabled={busyAction === 'clear'} onClick={onClear}>
        {busyAction === 'clear' ? '退出中...' : '退出'}
      </button>
    </div>
    <div className="settings-account-meta">
      <span>推荐点击“登录并同步”；手动粘贴 Cookie 作为备用方式。</span>
      <span>登录 {status?.lastLoginAt ?? 'n/a'} · 检查 {status?.lastCheckedAt ?? 'n/a'}</span>
    </div>
    {provider === 'soundcloud' ? <p className="settings-inline-note settings-account-note">SoundCloud 流播放使用这里保存的登录 Cookie，不需要 Artist Pro 或开发者 API。</p> : null}
    {provider === 'osu' ? <p className="settings-inline-note settings-account-note">osu! 谱面下载会优先使用这里保存的登录 Cookie；官方失败时会自动尝试 Sayobot、Catboy 和 NeriNyan 镜像。</p> : null}
    {message ? <p className="settings-inline-note settings-account-note">{message}</p> : null}
    {error ? <p className="settings-inline-error settings-account-note">{error}</p> : null}
  </article>
);

const YouTubeAccountCard = ({
  browser,
  busyAction,
  error,
  message,
  onBrowserChange,
  onCheck,
  onClear,
  onOpenLogin,
  status,
}: {
  browser: YouTubeBrowser;
  busyAction?: AccountBusyAction;
  error?: string | null;
  message?: string | null;
  onBrowserChange: (browser: YouTubeBrowser) => void;
  onCheck: () => void;
  onClear: () => void;
  onOpenLogin: () => void;
  status?: AccountStatus;
}): JSX.Element => (
  <article className="settings-account-row" aria-label="YouTube">
    <div className="settings-account-summary">
      <span className={getAccountBadgeClass(status)}>{getAccountStatusLabel(status)}</span>
      <div>
        <h3>YouTube</h3>
        <p>沿用系统浏览器登录逻辑，供后续解析/下载使用。</p>
      </div>
    </div>
    <label className="settings-select-field settings-account-browser-field">
      <span>浏览器</span>
      <select value={browser} onChange={(event) => onBrowserChange(event.target.value as YouTubeBrowser)} disabled={busyAction === 'browser'}>
        {youtubeBrowserOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
    <div className="settings-account-actions">
      <button className="settings-action-button" type="button" disabled={busyAction === 'check'} onClick={onCheck}>
        {busyAction === 'check' ? '检查中...' : '检查'}
      </button>
      <button className="settings-action-button settings-account-login-button" type="button" disabled={busyAction === 'login'} onClick={onOpenLogin}>
        <ExternalLink size={15} />
        {busyAction === 'login' ? '等待登录...' : '登录并同步'}
      </button>
      <button className="settings-danger-button" type="button" disabled={busyAction === 'clear'} onClick={onClear}>
        {busyAction === 'clear' ? '退出中...' : '退出'}
      </button>
    </div>
    <div className="settings-account-meta">
      <span>{status?.displayName ?? '选择浏览器后会保存系统浏览器登录状态。'}</span>
      <span>检查 {status?.lastCheckedAt ?? 'n/a'}</span>
    </div>
    {message ? <p className="settings-inline-note settings-account-note">{message}</p> : null}
    {error ? <p className="settings-inline-error settings-account-note">{error}</p> : null}
  </article>
);

const SpotifyAccountCard = ({
  busyAction,
  error,
  message,
  onCheck,
  onClear,
  onOpenLogin,
  status,
}: {
  busyAction?: AccountBusyAction;
  error?: string | null;
  message?: string | null;
  onCheck: () => void;
  onClear: () => void;
  onOpenLogin: () => void;
  status?: AccountStatus;
}): JSX.Element => (
  <article className="settings-account-row" aria-label="Spotify">
    <div className="settings-account-summary">
      <span className={getAccountBadgeClass(status)}>{getAccountStatusLabel(status)}</span>
      <div>
        <h3>Spotify</h3>
        <p>官方播放器接入，需要 Premium；请在 Spotify Dashboard 注册 http://127.0.0.1:43879/spotify/callback。</p>
      </div>
    </div>
    <div className="settings-account-actions">
      <button className="settings-action-button" type="button" disabled={busyAction === 'check'} onClick={onCheck}>
        {busyAction === 'check' ? '检查中...' : '检查'}
      </button>
      <button className="settings-action-button settings-account-login-button" type="button" disabled={busyAction === 'login'} onClick={onOpenLogin}>
        <ExternalLink size={15} />
        {busyAction === 'login' ? '等待授权...' : '登录 Spotify'}
      </button>
      <button className="settings-danger-button" type="button" disabled={busyAction === 'clear'} onClick={onClear}>
        {busyAction === 'clear' ? '退出中...' : '退出'}
      </button>
    </div>
    <div className="settings-account-meta">
      <span>{status?.displayName ?? status?.username ?? '使用 OAuth PKCE 授权，不保存 Client Secret；下载功能不适用于 Spotify。'}</span>
      <span>登录 {status?.lastLoginAt ?? 'n/a'} · 检查 {status?.lastCheckedAt ?? 'n/a'}</span>
    </div>
    {message ? <p className="settings-inline-note settings-account-note">{message}</p> : null}
    {error ? <p className="settings-inline-error settings-account-note">{error}</p> : null}
  </article>
);

const NumberRangeField = ({
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}): JSX.Element => (
  <label className="settings-range-field">
    <input min={min} max={max} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <span>
      {value}
      {suffix}
    </span>
  </label>
);

const FontPickerModal = ({
  currentFont,
  fonts,
  onClose,
  onChooseFile,
  onSelect,
  query,
  setQuery,
  title,
}: {
  currentFont: string;
  fonts: string[];
  onClose: () => void;
  onChooseFile: () => void;
  onSelect: (fontFamily: string) => void;
  query: string;
  setQuery: (query: string) => void;
  title: string;
}): JSX.Element => {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFonts = normalizedQuery ? fonts.filter((font) => font.toLowerCase().includes(normalizedQuery)) : fonts;

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-font-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-font-modal-header">
          <h3>{title}</h3>
          <button className="settings-icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>
        <label className="settings-font-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
        </label>
        <button className="settings-font-file-button" type="button" onClick={onChooseFile}>
          <FolderOpen size={15} aria-hidden="true" />
          从资源管理器选择
        </button>
        <div className="settings-font-list">
          {filteredFonts.map((font) => (
            <button
              className={`settings-font-option ${font === currentFont ? 'active' : ''}`}
              key={font}
              type="button"
              style={{ fontFamily: `"${font}", var(--echo-font-family)` }}
              onClick={() => onSelect(font)}
            >
              <span>{font}</span>
              <em>Echo font preview Aa 你好</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export const SettingsPage = (): JSX.Element => {
  const { locale, localeOptions, setLocale, t } = useI18n();
  const playbackQueue = usePlaybackQueue();
  const settingsScrollShellRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsNavKey>('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [highlightedSettingId, setHighlightedSettingId] = useState<string | null>(null);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputMode, setOutputMode] = useState<AudioOutputMode>('shared');
  const [sharedBackend, setSharedBackend] = useState<AudioSharedBackend>('auto');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [appearancePreferences, setAppearancePreferences] = useState<AppearancePreferences>(() => readAppearancePreferences());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [selectedThemePreset, setSelectedThemePreset] = useState<AppThemePreset>(() => readThemePreset());
  const [themeCustomTone, setThemeCustomTone] = useState<ThemeTone>('light');
  const [themeCustomDraft, setThemeCustomDraft] = useState<AppThemeToneOverride>({});
  const [themeCustomAdvancedOpen, setThemeCustomAdvancedOpen] = useState(false);
  const [themeCustomMessage, setThemeCustomMessage] = useState<string | null>(null);
  const wallpaperPersistTimerRef = useRef<number | null>(null);
  const [discordPresenceStatus, setDiscordPresenceStatus] = useState<DiscordPresenceStatus | null>(null);
  const [lastFmStatus, setLastFmStatus] = useState<LastFmStatus | null>(null);
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([]);
  const [accountCookies, setAccountCookies] = useState<Record<AccountProvider, string>>({
    netease: '',
    qqmusic: '',
    bilibili: '',
    youtube: '',
    soundcloud: '',
    spotify: '',
    osu: '',
  });
  const [accountBusy, setAccountBusy] = useState<Partial<Record<AccountProvider, AccountBusyAction>>>({});
  const [accountErrors, setAccountErrors] = useState<Partial<Record<AccountProvider, string | null>>>({});
  const [accountMessages, setAccountMessages] = useState<Partial<Record<AccountProvider, string | null>>>({});
  const [youtubeBrowser, setYoutubeBrowser] = useState<YouTubeBrowser>('none');
  const [lastFmAuthToken, setLastFmAuthToken] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [lastCrashSummary, setLastCrashSummary] = useState<LastCrashSummary | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [defaultCacheDirectory, setDefaultCacheDirectory] = useState<string | null>(null);
  const [pendingCacheDirectory, setPendingCacheDirectory] = useState<string | null | undefined>(undefined);
  const [cacheDirectoryBusy, setCacheDirectoryBusy] = useState(false);
  const [cacheDirectoryResult, setCacheDirectoryResult] = useState<CoverCacheMigrationResult | null>(null);
  const [cacheDirectoryMessage, setCacheDirectoryMessage] = useState<string | null>(null);
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings | null>(null);
  const [downloadDirectoryBusy, setDownloadDirectoryBusy] = useState(false);
  const [downloadDirectoryMessage, setDownloadDirectoryMessage] = useState<string | null>(null);
  const [pendingAlbumMergeStrategy, setPendingAlbumMergeStrategy] = useState<AlbumMergeStrategy | null>(null);
  const [albumGroupingBusy, setAlbumGroupingBusy] = useState(false);
  const [albumGroupingMessage, setAlbumGroupingMessage] = useState<string | null>(null);
  const [libraryScanBusy, setLibraryScanBusy] = useState(false);
  const [libraryScanMessage, setLibraryScanMessage] = useState<string | null>(null);
  const [artistImageBusyAction, setArtistImageBusyAction] = useState<'refresh' | 'clear' | null>(null);
  const [artistImageMessage, setArtistImageMessage] = useState<string | null>(null);
  const [artistImageProgress, setArtistImageProgress] = useState<ArtistImageProgress | null>(null);
  const [embeddedTagRescanBusy, setEmbeddedTagRescanBusy] = useState<'all' | 'missing-cover' | null>(null);
  const [embeddedTagRescanMessage, setEmbeddedTagRescanMessage] = useState<string | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateTrackIndexSummary | null>(null);
  const [duplicateBusyAction, setDuplicateBusyAction] = useState<'toggle' | 'analyze' | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [bpmAnalysisJob, setBpmAnalysisJob] = useState<BpmAnalysisJobStatus | null>(null);
  const [bpmAnalysisBusy, setBpmAnalysisBusy] = useState(false);
  const [bpmAnalysisMessage, setBpmAnalysisMessage] = useState<string | null>(null);
  const [replayGainAnalysisJob, setReplayGainAnalysisJob] = useState<ReplayGainAnalysisJobStatus | null>(null);
  const [replayGainAnalysisBusy, setReplayGainAnalysisBusy] = useState(false);
  const [replayGainAnalysisMessage, setReplayGainAnalysisMessage] = useState<string | null>(null);
  const [audioResetBusy, setAudioResetBusy] = useState(false);
  const [windowsAudioRestartBusy, setWindowsAudioRestartBusy] = useState(false);
  const [audioResetMessage, setAudioResetMessage] = useState<string | null>(null);
  const [recordingShortcutAction, setRecordingShortcutAction] = useState<GlobalShortcutAction | null>(null);
  const [shortcutMessages, setShortcutMessages] = useState<Partial<Record<GlobalShortcutAction, string | null>>>({});
  const [fontFamilies, setFontFamilies] = useState<string[]>(fallbackFontFamilies);
  const [fontPickerTarget, setFontPickerTarget] = useState<FontPickerTarget | null>(null);
  const [fontPickerQuery, setFontPickerQuery] = useState('');
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerMessage, setDangerMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingsSearchEntries = useMemo(() => {
    const sectionEntries: Array<{
      id: string;
      sectionKey: SettingsNavKey;
      targetId?: string;
      title: string;
      description: string;
      terms: string[];
    }> = settingsNavItems.map((item) => {
      const title = t(item.labelKey);
      const description = t(item.descriptionKey);
      return {
        id: `section-${item.key}`,
        sectionKey: item.key,
        title,
        description,
        terms: [title, description, ...(settingsSearchAliases[item.key] ?? [])],
      };
    });

    const rowEntries: Array<{
      id: string;
      sectionKey: SettingsNavKey;
      targetId: string;
      title: string;
      description: string;
      terms: string[];
    }> = [
      {
        id: 'row-discord-presence',
        sectionKey: 'integrations',
        targetId: 'settings-row-discord-presence',
        title: t('settings.integrations.discord.title'),
        description: t('settings.integrations.discord.description'),
        terms: [
          t('settings.integrations.discord.title'),
          t('settings.integrations.discord.description'),
          t('settings.integrations.discord.action.refresh'),
          'discord',
          'discord status',
          'discord presence',
          'discord rich presence',
          'rich presence',
          'presence',
          'status',
          'state',
          'connected',
          'connection',
          'playing status',
          '状态',
          '狀態',
          'discord 状态',
          'discord 狀態',
          '播放状态',
          '連線狀態',
          '连接状态',
        ],
      },
      {
        id: 'row-smtc',
        sectionKey: 'integrations',
        targetId: 'settings-row-smtc',
        title: t('settings.integrations.smtc.title'),
        description: t('settings.integrations.smtc.description'),
        terms: [t('settings.integrations.smtc.title'), t('settings.integrations.smtc.description'), 'smtc', 'media session', 'system media controls', '系统媒体控制', '狀態列', '状态栏'],
      },
      {
        id: 'row-lastfm',
        sectionKey: 'integrations',
        targetId: 'settings-row-lastfm',
        title: t('settings.integrations.lastfm.title'),
        description: t('settings.integrations.lastfm.description'),
        terms: [t('settings.integrations.lastfm.title'), t('settings.integrations.lastfm.description'), 'last.fm', 'lastfm', 'scrobble', 'status', '状态', '账号状态', 'login status'],
      },
      {
        id: 'row-account-startup-refresh',
        sectionKey: 'integrations',
        targetId: 'settings-row-account-startup-refresh',
        title: '启动时刷新账号登录状态',
        description: '仅检查以前登录过的账号，从未登录过的平台会保持静默。',
        terms: ['启动时刷新账号登录状态', '账号状态', '登录状态', 'account status', 'login status', 'startup account refresh', 'youtube', 'bilibili', 'spotify', '状态'],
      },
      {
        id: 'row-audio-status',
        sectionKey: 'playback',
        targetId: 'settings-row-audio-status',
        title: t('settings.playback.audioStatus.title'),
        description: t('audioDrawer.note.engine'),
        terms: [t('settings.playback.audioStatus.title'), t('audioDrawer.note.engine'), 'audio status', 'engine status', '状态', '音频状态', '采样率', 'dac', 'wasapi', 'asio', 'juce'],
      },
      {
        id: 'row-automix',
        sectionKey: 'playback',
        targetId: 'settings-row-automix',
        title: t('settings.playback.automix.title'),
        description: t('settings.playback.automix.description'),
        terms: [
          t('settings.playback.automix.title'),
          t('settings.playback.automix.description'),
          'automix',
          'smart crossfade',
          'crossfade',
          'gapless',
          'spotify',
          'apple music',
          '智能过渡',
          '连续播放',
        ],
      },
      {
        id: 'row-output-device',
        sectionKey: 'playback',
        targetId: 'settings-row-output-device',
        title: t('settings.playback.outputDevice.title'),
        description: t('settings.playback.outputDevice.description'),
        terms: [t('settings.playback.outputDevice.title'), t('settings.playback.outputDevice.description'), 'output', 'device', 'dac', 'asio', 'wasapi', 'exclusive', '输出设备'],
      },
      {
        id: 'row-theme',
        sectionKey: 'appearance',
        targetId: 'settings-row-theme',
        title: t('settings.appearance.theme.title'),
        description: t('settings.appearance.theme.description'),
        terms: [t('settings.appearance.theme.title'), t('settings.appearance.theme.description'), 'theme', 'dark', 'light', 'system', '主题', '深色', '浅色'],
      },
      {
        id: 'row-wallpaper',
        sectionKey: 'appearance',
        targetId: 'settings-row-wallpaper',
        title: '自定义壁纸',
        description: '保存原图文件，不压缩、不转码；默认完整显示不裁切。',
        terms: ['自定义壁纸', '保存原图文件，不压缩、不转码；默认完整显示不裁切。', 'wallpaper', 'background', 'opacity', 'blur', '壁纸', '背景', '透明度'],
      },
      {
        id: 'row-library-folders',
        sectionKey: 'library',
        targetId: 'settings-row-library-folders',
        title: '曲库文件夹',
        description: '管理本地音乐来源和扫描入口。',
        terms: ['曲库文件夹', '管理本地音乐来源和扫描入口。', 'library folders', 'scan', 'folder', '曲库', '文件夹', '扫描'],
      },
      {
        id: 'row-artist-wall-artwork',
        sectionKey: 'library',
        targetId: 'settings-row-artist-wall-artwork',
        title: '艺术家墙封面',
        description: '用艺术家的一张专辑封面替代字母占位。',
        terms: ['艺术家墙封面', '用艺术家的一张专辑封面替代字母占位。', 'artist wall', 'album artwork', 'artist cover', '艺术家', '封面'],
      },
      {
        id: 'row-artist-avatars',
        sectionKey: 'library',
        targetId: 'settings-row-artist-avatars',
        title: t('settings.appearance.artistAvatars.title'),
        description: t('settings.appearance.artistAvatars.description'),
        terms: [
          t('settings.appearance.artistAvatars.title'),
          t('settings.appearance.artistAvatars.description'),
          t('settings.appearance.artistAvatars.toggle'),
          'artist avatars',
          'artist images',
          'avatar cache',
          '歌手头像',
          '艺术家头像',
          '头像缓存',
        ],
      },
      {
        id: 'row-diagnostics',
        sectionKey: 'about',
        targetId: 'settings-row-diagnostics',
        title: 'Diagnostics / 崩溃报告',
        description: '报错默认生成轻量 Markdown 报告；日志目录仍保留在本地，不会自动上传。',
        terms: ['Diagnostics / 崩溃报告', 'Markdown 报告', 'diagnostics', 'crash', 'logs', 'status', '诊断', '崩溃', '日志', '状态'],
      },
    ];

    return [...rowEntries, ...sectionEntries];
  }, [t]);

  const settingsSearchResults = useMemo<SettingsSearchResult[]>(() => {
    const query = normalizeSettingsSearchText(settingsQuery);

    if (!query) {
      return [];
    }

    const results: SettingsSearchResult[] = [];
    settingsSearchEntries.forEach((entry) => {
      const score = rankSettingsSearch(query, entry.terms);
      if (score <= 0) {
        return;
      }

      results.push({
        id: entry.id,
        sectionKey: entry.sectionKey,
        targetId: entry.targetId,
        title: entry.title,
        description: entry.description,
        score,
      });
    });

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, locale));
  }, [locale, settingsQuery, settingsSearchEntries]);

  const visibleNavItems = useMemo(() => {
    const query = normalizeSettingsSearchText(settingsQuery);

    if (!query) {
      return settingsNavItems;
    }

    const resultKeys = new Set(settingsSearchResults.map((item) => item.sectionKey));
    return settingsNavItems.filter((item) => resultKeys.has(item.key));
  }, [settingsQuery, settingsSearchResults]);

  const compatibleDevices = useMemo(
    () => devices.filter((device) => (outputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')),
    [devices, outputMode],
  );
  const statusSelectedDevice = useMemo(
    () => devices.find((device) => deviceMatchesAudioStatus(device, status)) ?? null,
    [devices, status],
  );
  const outputDeviceOptions = useMemo(
    () =>
      compatibleDevices.length === 0
        ? [{ value: '', label: t('settings.playback.outputDevice.empty'), disabled: true }]
        : compatibleDevices.map((device) => ({
            value: device.id,
            label: `${device.index} - ${device.name}`,
          })),
    [compatibleDevices, t],
  );
  const globalShortcuts = useMemo(
    () => appSettings?.globalShortcuts ?? createDefaultGlobalShortcuts(),
    [appSettings?.globalShortcuts],
  );

  const accountStatusByProvider = useMemo(
    () => Object.fromEntries(accountStatuses.map((item) => [item.provider, item])) as Partial<Record<AccountProvider, AccountStatus>>,
    [accountStatuses],
  );

  const refreshStatus = useCallback(async () => {
    try {
      const audio = getAudioBridge();

      if (!audio) {
        setStatus(null);
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to inspect audio settings.');
        return;
      }

      setStatus(await audio.getStatus());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const audio = getAudioBridge();

      if (!audio) {
        setDevices([]);
        return;
      }

      const nextDevices = await audio.listDevices();
      setDevices(nextDevices);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setDevices([]);
    }
  }, []);

  const refreshDiscordPresenceStatus = useCallback(async () => {
    try {
      const discordPresence = getDiscordPresenceBridge();

      if (!discordPresence) {
        setDiscordPresenceStatus(null);
        return;
      }

      setDiscordPresenceStatus(await discordPresence.getStatus());
    } catch {
      setDiscordPresenceStatus(null);
    }
  }, []);

  const refreshLastFmStatus = useCallback(async () => {
    try {
      const lastfm = getLastFmBridge();

      if (!lastfm) {
        setLastFmStatus(null);
        return;
      }

      setLastFmStatus(await lastfm.getStatus());
    } catch {
      setLastFmStatus(null);
    }
  }, []);

  const refreshAccountStatuses = useCallback(async () => {
    try {
      const accounts = getAccountsBridge();

      if (!accounts) {
        setAccountStatuses([]);
        return;
      }

      setAccountStatuses(await accounts.getStatuses());
      setAccountErrors({});
      setAccountMessages({});
    } catch (accountError) {
      setAccountErrors((current) => ({
        ...current,
        netease: accountError instanceof Error ? accountError.message : String(accountError),
      }));
    }
  }, []);

  const refreshDuplicateSummary = useCallback(async () => {
    try {
      const library = getLibraryBridge();

      if (!library) {
        setDuplicateSummary(null);
        return;
      }

      setDuplicateSummary(await library.getDuplicateIndexSummary('strict'));
    } catch {
      setDuplicateSummary(null);
    }
  }, []);

  useEffect(() => {
    const app = getAppBridge();
    void app?.getSettings().then((settings) => {
      setAppSettings(settings);
      setSelectedThemePreset(settings.appearanceThemePreset ?? defaultThemePreset);
      updateThemePreferences(
        settings.appearanceTheme ?? defaultThemeMode,
        settings.appearanceThemePreset ?? defaultThemePreset,
        settings.appearanceThemePresetOverrides ?? {},
      );
      setThemeCustomDraft(settings.appearanceThemePresetOverrides?.[settings.appearanceThemePreset ?? defaultThemePreset]?.light ?? {});
      if (settings.appearancePreferences) {
        setAppearancePreferences(updateAppearancePreferences(settings.appearancePreferences));
      }
      setSharedBackend(settings.rememberedAudioOutput?.sharedBackend ?? 'auto');
    }).catch(() => undefined);
    void app?.getVersion().then(setAppVersion).catch(() => undefined);
    void app?.getUpdateStatus?.().then(setUpdateStatus).catch(() => undefined);
    const unsubscribeUpdateStatus = app?.onUpdateStatus?.((status) => {
      setUpdateStatus(status);
      if (status.state === 'downloading' || status.state === 'downloaded') {
        setUpdateBusy(false);
      }
    });

    return () => {
      unsubscribeUpdateStatus?.();
    };
  }, []);

  useEffect(() => {
    if (activeSection !== 'playback' && activeSection !== 'eq') {
      return undefined;
    }

    const cancelInitialRefresh = scheduleSettingsIdleTask(() => {
      void refreshStatus();
      if (activeSection === 'playback') {
        void refreshDevices();
      }
    });
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    return () => {
      cancelInitialRefresh();
      window.clearInterval(timer);
    };
  }, [activeSection, refreshDevices, refreshStatus]);

  useEffect(() => {
    if (activeSection !== 'integrations') {
      return undefined;
    }

    return scheduleSettingsIdleTask(() => {
      void refreshDiscordPresenceStatus();
      void refreshLastFmStatus();
      void refreshAccountStatuses();
    });
  }, [activeSection, refreshAccountStatuses, refreshDiscordPresenceStatus, refreshLastFmStatus]);

  useEffect(() => {
    if (activeSection !== 'library') {
      return undefined;
    }

    return scheduleSettingsIdleTask(() => {
      const app = getAppBridge();
      const downloads = getDownloadsBridge();
      void app?.getDefaultCacheDirectory().then(setDefaultCacheDirectory).catch(() => undefined);
      void downloads?.getSettings().then(setDownloadSettings).catch(() => undefined);
      void refreshDuplicateSummary();
    });
  }, [activeSection, refreshDuplicateSummary]);

  useEffect(() => {
    if (activeSection !== 'about') {
      return undefined;
    }

    return scheduleSettingsIdleTask(() => {
      void getDiagnosticsBridge()?.getLastCrashSummary().then(setLastCrashSummary).catch(() => undefined);
    });
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'library') {
      return undefined;
    }

    const library = getLibraryBridge();
    if (!library?.getArtistImageJobStatus) {
      return undefined;
    }

    let disposed = false;
    let timer: number | null = null;

    const refreshSummary = async (): Promise<void> => {
      try {
        const status = await library.getArtistImageJobStatus();
        if (disposed) {
          return;
        }

        setArtistImageProgress((current) => ({
          ...status,
          startedAt: current?.startedAt ?? Date.now(),
        }));
      } catch {
        if (!disposed && timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    };

    void refreshSummary();
    timer = window.setInterval(() => {
      void refreshSummary();
    }, 750);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'appearance') {
      setSelectedThemePreset(readThemePreset());
    }
  }, [activeSection]);

  const savedThemePresetOverrides = useMemo<AppThemePresetOverrides>(
    () => appSettings?.appearanceThemePresetOverrides ?? readThemePresetOverrides(),
    [appSettings?.appearanceThemePresetOverrides],
  );

  useEffect(() => {
    setThemeCustomDraft(savedThemePresetOverrides[selectedThemePreset]?.[themeCustomTone] ?? {});
    setThemeCustomMessage(null);
  }, [savedThemePresetOverrides, selectedThemePreset, themeCustomTone]);

  useEffect(() => {
    if (activeSection !== 'appearance') {
      return;
    }

    const previewOverrides = buildThemePresetOverrides(savedThemePresetOverrides, selectedThemePreset, themeCustomTone, themeCustomDraft);
    applyThemeMode(appSettings?.appearanceTheme ?? defaultThemeMode, selectedThemePreset, previewOverrides);
  }, [activeSection, appSettings?.appearanceTheme, savedThemePresetOverrides, selectedThemePreset, themeCustomDraft, themeCustomTone]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings> | Partial<MvSettings>>).detail;
      if (!patch || typeof patch !== 'object') {
        return;
      }
      const appPatch = normalizeExternalAppSettingsPatch(patch);

      setAppSettings((current) => {
        const nextSettings = current ? { ...current, ...appPatch } : current;
        if (appPatch.appearanceTheme || appPatch.appearanceThemePreset) {
          setSelectedThemePreset(nextSettings?.appearanceThemePreset ?? appPatch.appearanceThemePreset ?? defaultThemePreset);
          updateThemePreferences(
            nextSettings?.appearanceTheme ?? appPatch.appearanceTheme ?? defaultThemeMode,
            nextSettings?.appearanceThemePreset ?? appPatch.appearanceThemePreset ?? defaultThemePreset,
            nextSettings?.appearanceThemePresetOverrides ?? appPatch.appearanceThemePresetOverrides ?? {},
          );
        }
        if (appPatch.appearanceThemePresetOverrides) {
          updateThemePresetOverrides(
            nextSettings?.appearanceThemePresetOverrides ?? appPatch.appearanceThemePresetOverrides,
            nextSettings?.appearanceTheme ?? defaultThemeMode,
            nextSettings?.appearanceThemePreset ?? defaultThemePreset,
          );
        }
        return nextSettings;
      });
      if (appPatch.appearancePreferences) {
        setAppearancePreferences(updateAppearancePreferences(appPatch.appearancePreferences));
      }
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, []);

  useEffect(
    () => () => {
      if (wallpaperPersistTimerRef.current !== null) {
        window.clearTimeout(wallpaperPersistTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setOutputMode(status?.outputMode ?? 'shared');
    if (status?.sharedBackend || status?.outputBackend === 'directsound-shared') {
      setSharedBackend(status.outputBackend === 'directsound-shared' ? 'directsound' : normalizeSharedBackend(status.sharedBackend));
    }
  }, [status?.outputBackend, status?.outputMode, status?.sharedBackend]);

  useEffect(() => {
    if (statusSelectedDevice) {
      setSelectedDeviceId(statusSelectedDevice.id);
    }
  }, [statusSelectedDevice]);

  useEffect(() => {
    if (appSettings?.albumMergeStrategy) {
      setPendingAlbumMergeStrategy(appSettings.albumMergeStrategy);
    }
  }, [appSettings?.albumMergeStrategy]);

  useEffect(() => {
    const displayName = accountStatusByProvider.youtube?.displayName?.toLowerCase() ?? '';
    const savedBrowser = youtubeBrowserOptions.find((option) => option.value !== 'none' && displayName.includes(option.value))?.value;
    if (savedBrowser) {
      setYoutubeBrowser(savedBrowser);
    }
  }, [accountStatusByProvider.youtube?.displayName]);

  useEffect(() => {
    if (statusSelectedDevice && compatibleDevices.some((device) => device.id === statusSelectedDevice.id)) {
      return;
    }

    if (compatibleDevices.length === 0) {
      setSelectedDeviceId('');
      return;
    }

    if (!compatibleDevices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(compatibleDevices.find((device) => device.isDefault)?.id ?? compatibleDevices[0].id);
    }
  }, [compatibleDevices, selectedDeviceId, statusSelectedDevice]);

  useEffect(() => {
    if (activeSection !== 'appearance') {
      return undefined;
    }

    const queryLocalFonts = (navigator as NavigatorWithLocalFonts).queryLocalFonts;

    if (!queryLocalFonts) {
      return undefined;
    }

    return scheduleSettingsIdleTask(() => {
      void queryLocalFonts()
        .then((fonts) => {
          const families = Array.from(new Set([...fallbackFontFamilies, ...fonts.map((font) => font.family).filter(Boolean)])).sort((a, b) =>
            a.localeCompare(b),
          );
          setFontFamilies(families);
        })
        .catch(() => {
          setFontFamilies(fallbackFontFamilies);
        });
    });
  }, [activeSection]);

  const applyOutputSettings = useCallback(
    async (nextOutputMode = outputMode, nextDeviceId = selectedDeviceId, nextSharedBackend = sharedBackend) => {
      const nextDevice =
        devices.find((device) => device.id === nextDeviceId && (nextOutputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')) ?? null;
      const normalizedSharedBackend = nextOutputMode === 'shared' ? normalizeSharedBackend(nextSharedBackend) : 'auto';
      const output: AudioOutputSettings = {
        outputMode: nextOutputMode,
        sharedBackend: normalizedSharedBackend,
        latencyProfile: 'lowLatency',
        useJuceOutput: appSettings?.audioUseJuceOutput !== false,
        useJuceDecode: appSettings?.audioUseJuceDecode === true,
        dsdOutputMode: appSettings?.audioDsdOutputMode === 'dop' ? 'dop' : 'pcm',
        asioNativeDsdExperimentalEnabled: appSettings?.audioAsioNativeDsdExperimentalEnabled === true,
        asioUnavailableFallbackEnabled: appSettings?.audioAsioUnavailableFallbackEnabled === true,
        soxrFallbackEnabled: appSettings?.audioSoxrFallbackEnabled !== false,
      };

      if (nextDevice) {
        if (normalizedSharedBackend !== 'directsound') {
          output.deviceIndex = nextDevice.index;
        }
        output.deviceName = nextDevice.name;
      }

      const audio = getAudioBridge();

      if (!audio) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
        return;
      }

      setStatus(await audio.setOutput(output));
    },
    [
      appSettings?.audioAsioUnavailableFallbackEnabled,
      appSettings?.audioAsioNativeDsdExperimentalEnabled,
      appSettings?.audioSoxrFallbackEnabled,
      appSettings?.audioDsdOutputMode,
      appSettings?.audioUseJuceDecode,
      appSettings?.audioUseJuceOutput,
      devices,
      outputMode,
      selectedDeviceId,
      sharedBackend,
    ],
  );

  const jumpToSettingsSection = (key: SettingsNavKey, options: { clearSearch?: boolean; targetId?: string } = {}): void => {
    setActiveSection(key);
    if (options.clearSearch) {
      setSettingsQuery('');
    }
    setHighlightedSettingId(options.targetId ?? null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (options.targetId) {
          document.getElementById(options.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        const scrollShell = settingsScrollShellRef.current;
        if (!scrollShell) {
          document.getElementById(`settings-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }

        if (typeof scrollShell.scrollTo === 'function') {
          scrollShell.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } else {
          scrollShell.scrollTop = 0;
          scrollShell.scrollLeft = 0;
        }
      });
    });
  };

  const handleNavClick = (key: SettingsNavKey): void => {
    jumpToSettingsSection(key);
  };

  const handleSettingsSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || settingsSearchResults.length === 0) {
      return;
    }

    event.preventDefault();
    jumpToSettingsSection(settingsSearchResults[0].sectionKey, { clearSearch: true, targetId: settingsSearchResults[0].targetId });
  };

  const handleOutputModeChange = (nextMode: AudioOutputMode): void => {
    setOutputMode(nextMode);
    const nextDevices = devices.filter((device) => (nextMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared'));
    const nextDeviceId = nextDevices.find((device) => device.isDefault)?.id ?? nextDevices[0]?.id ?? '';
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(nextMode, nextDeviceId, nextMode === 'shared' ? sharedBackend : 'auto');
  };

  const handleDeviceChange = (nextDeviceId: string): void => {
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(outputMode, nextDeviceId);
  };

  const handleSharedBackendChange = (nextSharedBackend: AudioSharedBackend): void => {
    setOutputMode('shared');
    setSharedBackend(nextSharedBackend);
    void applyOutputSettings('shared', selectedDeviceId, nextSharedBackend);
  };

  const handleJuceOutputToggle = async (): Promise<void> => {
    const nextUseJuceOutput = !(appSettings?.audioUseJuceOutput ?? true);
    patchAppSettings({ audioUseJuceOutput: nextUseJuceOutput });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ useJuceOutput: nextUseJuceOutput }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleJuceDecodeToggle = async (): Promise<void> => {
    const nextUseJuceDecode = !(appSettings?.audioUseJuceDecode ?? false);
    patchAppSettings({ audioUseJuceDecode: nextUseJuceDecode });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ useJuceDecode: nextUseJuceDecode }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleDsdDopToggle = async (): Promise<void> => {
    const nextDsdOutputMode = appSettings?.audioDsdOutputMode === 'dop' ? 'pcm' : 'dop';
    patchAppSettings({ audioDsdOutputMode: nextDsdOutputMode });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ dsdOutputMode: nextDsdOutputMode }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleAsioNativeDsdExperimentalToggle = async (): Promise<void> => {
    const nextEnabled = !(appSettings?.audioAsioNativeDsdExperimentalEnabled ?? false);
    patchAppSettings({ audioAsioNativeDsdExperimentalEnabled: nextEnabled });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ asioNativeDsdExperimentalEnabled: nextEnabled }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleAsioUnavailableFallbackToggle = async (): Promise<void> => {
    const nextEnabled = !(appSettings?.audioAsioUnavailableFallbackEnabled ?? false);
    patchAppSettings({ audioAsioUnavailableFallbackEnabled: nextEnabled });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ asioUnavailableFallbackEnabled: nextEnabled }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleSoxrFallbackToggle = async (): Promise<void> => {
    const nextEnabled = !(appSettings?.audioSoxrFallbackEnabled ?? true);
    patchAppSettings({ audioSoxrFallbackEnabled: nextEnabled });

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
      return;
    }

    try {
      setStatus(await audio.setOutput({ soxrFallbackEnabled: nextEnabled }));
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : String(audioError));
    }
  };

  const handleAudioEngineReset = async (): Promise<void> => {
    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to reset the audio engine.');
      return;
    }

    setAudioResetBusy(true);
    setAudioResetMessage(null);
    try {
      const nextStatus = await audio.forceRestart('settings-audio-force-restart');
      setStatus(nextStatus);
      setError(null);
      setAudioResetMessage(t('settings.playback.troubleshooting.softDone'));
      void refreshDevices();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setAudioResetBusy(false);
    }
  };

  const handleWindowsAudioServiceRestart = async (): Promise<void> => {
    if (!window.confirm(t('settings.playback.troubleshooting.hardConfirm'))) {
      return;
    }

    const audio = getAudioBridge();
    if (!audio) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to restart Windows audio service.');
      return;
    }

    setWindowsAudioRestartBusy(true);
    setAudioResetMessage(null);
    try {
      const nextStatus = await audio.restartWindowsAudioService();
      setStatus(nextStatus);
      setError(null);
      setAudioResetMessage(t('settings.playback.troubleshooting.hardDone'));
      void refreshDevices();
    } catch (restartError) {
      setError(restartError instanceof Error ? restartError.message : String(restartError));
    } finally {
      setWindowsAudioRestartBusy(false);
    }
  };

  const handleAppearanceChange = (nextPreferences: AppearancePreferences): void => {
    setAppearancePreferences(updateAppearancePreferences(nextPreferences));
  };

  const handleAppearanceReset = (): void => {
    handleAppearanceChange(defaultAppearancePreferences);
  };

  const handleThemeModeChange = (appearanceTheme: AppThemeMode): void => {
    updateThemePreferences(appearanceTheme, selectedThemePreset, savedThemePresetOverrides, { animate: true });
    setAppSettings((current) => (current ? { ...current, appearanceTheme } : current));
    patchAppSettings({ appearanceTheme });
  };

  const handleThemePresetChange = (appearanceThemePreset: AppThemePreset): void => {
    updateThemePreferences(appSettings?.appearanceTheme ?? defaultThemeMode, appearanceThemePreset, savedThemePresetOverrides, { animate: true });
    setSelectedThemePreset(appearanceThemePreset);
    setAppSettings((current) => (current ? { ...current, appearanceThemePreset } : current));
    patchAppSettings({ appearanceThemePreset });
  };

  const themeCustomValues = mergeThemeToneValues(selectedThemePreset, themeCustomTone, themeCustomDraft);
  const themeCustomWarnings = getThemeContrastWarnings(themeCustomValues);
  const selectedThemePresetOption = themePresetOptions.find((option) => option.preset === selectedThemePreset) ?? themePresetOptions[0];
  const themeCustomGradientPreview = `linear-gradient(135deg, ${themeCustomValues.appBg} 0%, ${themeCustomValues.appBg2} 52%, ${themeCustomValues.appBg3} 100%)`;

  const updateThemeCustomColor = (field: ThemeColorField, value: string): void => {
    const color = normalizeThemeHexColor(value);
    if (!color) {
      setThemeCustomMessage(t('settings.appearance.themeCustom.message.invalidColor'));
      return;
    }

    setThemeCustomMessage(null);
    setThemeCustomDraft((current) => {
      const next = { ...current };
      if (color === themeEditorDefaults[selectedThemePreset][themeCustomTone][field]) {
        delete next[field];
      } else {
        next[field] = color;
      }
      return next;
    });
  };

  const updateThemeCustomPercent = (field: ThemePercentField, value: number): void => {
    const spec = percentThemeFields.find((option) => option.field === field);
    if (!spec) {
      return;
    }

    const normalized = Math.round(Math.min(spec.max, Math.max(spec.min, value)));
    setThemeCustomMessage(null);
    setThemeCustomDraft((current) => {
      const next = { ...current };
      if (normalized === themeEditorDefaults[selectedThemePreset][themeCustomTone][field]) {
        delete next[field];
      } else {
        next[field] = normalized;
      }
      return next;
    });
  };

  const handleThemeCustomAutoFix = (): void => {
    const backgroundText = bestReadableColor(themeCustomValues.appBg);
    const panelText = bestReadableColor(themeCustomValues.panel);
    const accentText = bestReadableColor(themeCustomValues.accent);
    const darkBackground = getRelativeLuminance(themeCustomValues.appBg) < 0.42;

    setThemeCustomDraft((current) => ({
      ...current,
      heading: backgroundText,
      text: backgroundText,
      muted: darkBackground ? '#c7d1d8' : '#61564d',
      buttonText: panelText,
      onAccent: accentText,
    }));
    setThemeCustomMessage(t('settings.appearance.themeCustom.message.fixed'));
  };

  const handleThemeCustomSave = (): void => {
    if (themeCustomWarnings.length > 0) {
      setThemeCustomMessage(t('settings.appearance.themeCustom.message.lowContrast'));
      return;
    }

    const nextOverrides = buildThemePresetOverrides(savedThemePresetOverrides, selectedThemePreset, themeCustomTone, themeCustomDraft);
    updateThemePresetOverrides(nextOverrides, appSettings?.appearanceTheme ?? defaultThemeMode, selectedThemePreset, { animate: true });
    setAppSettings((current) => (current ? { ...current, appearanceThemePresetOverrides: nextOverrides } : current));
    patchAppSettings({ appearanceThemePreset: selectedThemePreset, appearanceThemePresetOverrides: nextOverrides });
    setThemeCustomMessage(t('settings.appearance.themeCustom.message.saved'));
  };

  const handleThemeCustomReset = (): void => {
    const nextOverrides = buildThemePresetOverrides(savedThemePresetOverrides, selectedThemePreset, themeCustomTone, null);
    setThemeCustomDraft({});
    updateThemePresetOverrides(nextOverrides, appSettings?.appearanceTheme ?? defaultThemeMode, selectedThemePreset, { animate: true });
    setAppSettings((current) => (current ? { ...current, appearanceThemePresetOverrides: nextOverrides } : current));
    patchAppSettings({ appearanceThemePreset: selectedThemePreset, appearanceThemePresetOverrides: nextOverrides });
    setThemeCustomMessage(t('settings.appearance.themeCustom.message.reset'));
  };

  const handleThemeCustomExport = (): void => {
    const currentOverrides = buildThemePresetOverrides(savedThemePresetOverrides, selectedThemePreset, themeCustomTone, themeCustomDraft);
    const presetOverride = currentOverrides[selectedThemePreset];
    const payload: ThemeExportPayload = {
      exportedAt: new Date().toISOString(),
      overrides: presetOverride ? { [selectedThemePreset]: presetOverride } : {},
      preset: selectedThemePreset,
      schema: 'echo-next.theme-preset',
      version: 1,
    };
    downloadTextFile(`echo-theme-${selectedThemePreset}.echo-theme.json`, `${JSON.stringify(payload, null, 2)}\n`);
    setThemeCustomMessage(t('settings.appearance.themeCustom.message.exported'));
  };

  const handleThemeCustomImport = (): void => {
    const input = document.createElement('input');
    input.accept = '.json,.echo-theme.json,application/json';
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      void file
        .text()
        .then((content) => {
          const parsed = JSON.parse(content) as unknown;
          if (!isThemeExportPayload(parsed)) {
            throw new Error('Invalid theme payload');
          }

          const importedPreset = readThemeExportPreset(parsed.preset);
          if (!importedPreset) {
            throw new Error('Invalid theme preset');
          }

          const normalizedOverrides = normalizeThemePresetOverrides(parsed.overrides);
          const importedOverride = normalizedOverrides[importedPreset];
          const nextOverrides: AppThemePresetOverrides = { ...savedThemePresetOverrides };
          if (importedOverride) {
            nextOverrides[importedPreset] = importedOverride;
          } else {
            delete nextOverrides[importedPreset];
          }

          setSelectedThemePreset(importedPreset);
          setThemeCustomDraft(nextOverrides[importedPreset]?.[themeCustomTone] ?? {});
          updateThemePreferences(appSettings?.appearanceTheme ?? defaultThemeMode, importedPreset, nextOverrides, { animate: true });
          setAppSettings((current) =>
            current
              ? {
                  ...current,
                  appearanceThemePreset: importedPreset,
                  appearanceThemePresetOverrides: nextOverrides,
                }
              : current,
          );
          patchAppSettings({ appearanceThemePreset: importedPreset, appearanceThemePresetOverrides: nextOverrides });
          setThemeCustomMessage(t('settings.appearance.themeCustom.message.imported'));
        })
        .catch(() => setThemeCustomMessage(t('settings.appearance.themeCustom.message.importFailed')));
    };
    input.click();
  };

  const dispatchSettingsChanged = useCallback((patch: Partial<AppSettings> | Partial<MvSettings>): void => {
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: patch }));
  }, []);

  const patchAppSettings = useCallback((patch: Partial<AppSettings>, options: { announce?: boolean; mvSettingsPatch?: Partial<MvSettings> } = {}): void => {
    const app = getAppBridge();

    if (!app) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to save app settings.');
      return;
    }

    void app
      .setSettings(patch)
      .then((settings) => {
        setAppSettings(settings);
        if (options.announce !== false) {
          dispatchSettingsChanged(options.mvSettingsPatch ? { ...settings, ...options.mvSettingsPatch } : settings);
        }
      })
      .catch((settingsError) => {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
      });
  }, [dispatchSettingsChanged]);

  const mvQualityLabels = useMemo<Record<MvSettings['maxQuality'], string>>(
    () => ({
      '720p': '720p',
      '1080p': '1080p',
      '1440p': '1440p',
      '2160p': '4K',
      max: t('mvSettings.quality.max'),
    }),
    [t],
  );
  const mvProviderOrder = useMemo(() => normalizeMvProviderOrder(appSettings?.mvProviderOrder), [appSettings?.mvProviderOrder]);
  const mvEnabledProviders = useMemo(() => new Set(appSettings?.mvEnabledProviders ?? mvNetworkProviders), [appSettings?.mvEnabledProviders]);

  const patchMvSettings = useCallback(
    (patch: Partial<MvSettings>): void => {
      patchAppSettings(appSettingsPatchFromMvSettingsPatch(patch), { mvSettingsPatch: patch });
    },
    [patchAppSettings],
  );

  const handleMvProviderToggle = useCallback(
    (provider: NetworkMvProviderId): void => {
      const current = appSettings?.mvEnabledProviders ?? mvNetworkProviders;
      const next = current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider];
      patchMvSettings({ enabledProviders: next });
    },
    [appSettings?.mvEnabledProviders, patchMvSettings],
  );

  const handleMvProviderMove = useCallback(
    (provider: NetworkMvProviderId, direction: -1 | 1): void => {
      const current = normalizeMvProviderOrder(appSettings?.mvProviderOrder);
      const index = current.indexOf(provider);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) {
        return;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) {
        return;
      }
      next.splice(targetIndex, 0, item);
      patchMvSettings({ providerOrder: next });
    },
    [appSettings?.mvProviderOrder, patchMvSettings],
  );

  const handleCheckForUpdates = async (): Promise<void> => {
    const app = getAppBridge();

    if (!app?.checkForUpdates) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to check for updates.');
      return;
    }

    setUpdateBusy(true);
    try {
      setUpdateStatus(await app.checkForUpdates());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleOpenRepository = async (): Promise<void> => {
    const app = getAppBridge();

    if (!app?.openRepository) {
      window.open('https://github.com/moekotori/echo', '_blank', 'noopener,noreferrer');
      return;
    }

    await app.openRepository();
  };

  const handleOpenExternalUrl = async (url: string): Promise<void> => {
    const app = getAppBridge();

    if (!app?.openExternalUrl) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    await app.openExternalUrl(url);
  };

  const previewAndPersistAppWallpaperSettings = (patch: Partial<AppSettings>): void => {
    setAppSettings((current) => (current ? { ...current, ...patch } : current));
    dispatchSettingsChanged(patch);

    if (wallpaperPersistTimerRef.current !== null) {
      window.clearTimeout(wallpaperPersistTimerRef.current);
    }

    wallpaperPersistTimerRef.current = window.setTimeout(() => {
      wallpaperPersistTimerRef.current = null;
      patchAppSettings(patch, { announce: false });
    }, 220);
  };

  const handleAppWallpaperChoose = async (): Promise<void> => {
    const app = getAppBridge();

    if (!app?.chooseAppWallpaper) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to choose app wallpaper.');
      return;
    }

    try {
      const wallpaperPath = await app.chooseAppWallpaper();
      if (!wallpaperPath) {
        return;
      }

      patchAppSettings({ appCustomWallpaperPath: wallpaperPath });
      setError(null);
    } catch (wallpaperError) {
      setError(wallpaperError instanceof Error ? wallpaperError.message : String(wallpaperError));
    }
  };

  const handleAppWallpaperClear = (): void => {
    patchAppSettings({ appCustomWallpaperPath: null });
  };

  const handleDiscordPresenceToggle = async (): Promise<void> => {
    const discordPresence = getDiscordPresenceBridge();

    if (!discordPresence) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change Discord Rich Presence.');
      return;
    }

    try {
      setError(null);
      const nextEnabled = !(discordPresenceStatus?.enabled ?? appSettings?.discordRichPresenceEnabled ?? false);
      const nextStatus = await discordPresence.setEnabled(nextEnabled);
      setDiscordPresenceStatus(nextStatus);
      setAppSettings((current) => (current ? { ...current, discordRichPresenceEnabled: nextStatus.enabled } : current));
    } catch (presenceError) {
      setError(presenceError instanceof Error ? presenceError.message : String(presenceError));
    }
  };

  const handleLastFmToggle = async (): Promise<void> => {
    const lastfm = getLastFmBridge();

    if (!lastfm) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change Last.fm settings.');
      return;
    }

    try {
      setError(null);
      const nextEnabled = !(lastFmStatus?.enabled ?? appSettings?.lastFmEnabled ?? false);
      const nextStatus = await lastfm.setEnabled(nextEnabled);
      setLastFmStatus(nextStatus);
      setAppSettings((current) => (current ? { ...current, lastFmEnabled: nextStatus.enabled } : current));
    } catch (lastFmError) {
      setError(lastFmError instanceof Error ? lastFmError.message : String(lastFmError));
    }
  };

  const handleLastFmNowPlayingToggle = async (): Promise<void> => {
    const lastfm = getLastFmBridge();

    if (!lastfm) {
      return;
    }

    const nextStatus = await lastfm.setNowPlayingEnabled(!(lastFmStatus?.nowPlayingEnabled ?? true));
    setLastFmStatus(nextStatus);
  };

  const handleLastFmScrobbleToggle = async (): Promise<void> => {
    const lastfm = getLastFmBridge();

    if (!lastfm) {
      return;
    }

    const nextStatus = await lastfm.setScrobbleEnabled(!(lastFmStatus?.scrobbleEnabled ?? true));
    setLastFmStatus(nextStatus);
  };

  const handleLastFmConnect = async (): Promise<void> => {
    const lastfm = getLastFmBridge();

    if (!lastfm) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to connect Last.fm.');
      return;
    }

    try {
      setError(null);
      const result = await lastfm.createAuthToken();
      if (!result.ok || !result.token) {
        setError(result.error ?? 'Unable to start Last.fm authorization.');
        return;
      }

      setLastFmAuthToken(result.token);
      await lastfm.openAuthUrl(result.token);
      void refreshLastFmStatus();
    } catch (lastFmError) {
      setError(lastFmError instanceof Error ? lastFmError.message : String(lastFmError));
    }
  };

  const handleLastFmCompleteAuth = async (): Promise<void> => {
    const lastfm = getLastFmBridge();
    const token = lastFmAuthToken ?? appSettings?.lastFmAuthToken ?? '';

    if (!lastfm) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to complete Last.fm authorization.');
      return;
    }

    if (!token && !lastFmStatus?.authPending) {
      setError('Start Last.fm authorization first, then click complete after allowing access in the browser.');
      return;
    }

    try {
      setError(null);
      const nextStatus = await lastfm.completeAuth(token);
      setLastFmStatus(nextStatus);
      setLastFmAuthToken(null);
      setAppSettings((current) =>
        current
          ? {
              ...current,
              lastFmEnabled: nextStatus.enabled,
              lastFmUsername: nextStatus.username,
              lastFmAuthToken: null,
            }
          : current,
      );
      if (!nextStatus.connected) {
        setError(nextStatus.lastError ?? 'Last.fm authorization did not complete. Click Connect Last.fm again, allow access, then click Complete authorization.');
      }
    } catch (lastFmError) {
      setError(lastFmError instanceof Error ? lastFmError.message : String(lastFmError));
    }
  };

  const handleLastFmDisconnect = async (): Promise<void> => {
    const lastfm = getLastFmBridge();

    if (!lastfm) {
      return;
    }

    const nextStatus = await lastfm.disconnect();
    setLastFmStatus(nextStatus);
    setLastFmAuthToken(null);
    setAppSettings((current) =>
      current
        ? {
            ...current,
            lastFmUsername: null,
            lastFmSessionKey: null,
            lastFmAuthToken: null,
          }
        : current,
    );
  };

  const setAccountBusyFor = (provider: AccountProvider, action: AccountBusyAction | null): void => {
    setAccountBusy((current) => ({ ...current, [provider]: action ?? undefined }));
  };

  const updateAccountStatus = (status: AccountStatus): void => {
    setAccountStatuses((current) => {
      const withoutProvider = current.filter((item) => item.provider !== status.provider);
      return [...withoutProvider, status];
    });
  };

  const handleAccountSaveCookie = async (provider: AccountProvider): Promise<void> => {
    const accounts = getAccountsBridge();
    const cookie = accountCookies[provider].trim();

    if (!accounts) {
      setAccountErrors((current) => ({ ...current, [provider]: 'Desktop bridge unavailable. Open ECHO Next in Electron to save accounts.' }));
      return;
    }

    if (!cookie) {
      setAccountErrors((current) => ({ ...current, [provider]: '请先粘贴 Cookie。网页登录不会自动同步到 ECHO Next。' }));
      return;
    }

    try {
      setAccountBusyFor(provider, 'save');
      setAccountErrors((current) => ({ ...current, [provider]: null }));
      setAccountMessages((current) => ({ ...current, [provider]: null }));
      const status = await accounts.saveCookie(provider, cookie);
      updateAccountStatus(status);
      setAccountCookies((current) => ({ ...current, [provider]: '' }));
      setAccountMessages((current) => ({ ...current, [provider]: 'Cookie 已保存，账号状态已更新。' }));
    } catch (accountError) {
      setAccountErrors((current) => ({ ...current, [provider]: accountError instanceof Error ? accountError.message : String(accountError) }));
    } finally {
      setAccountBusyFor(provider, null);
    }
  };

  const handleAccountCheck = async (provider: AccountProvider): Promise<void> => {
    const accounts = getAccountsBridge();

    if (!accounts) {
      return;
    }

    if (provider !== 'spotify' && !accountStatusByProvider[provider]?.connected && accountCookies[provider].trim().length === 0) {
      setAccountErrors((current) => ({ ...current, [provider]: '尚未保存 Cookie。请先打开登录页，在网页登录后复制 Cookie 并保存。' }));
      return;
    }

    try {
      setAccountBusyFor(provider, 'check');
      setAccountErrors((current) => ({ ...current, [provider]: null }));
      setAccountMessages((current) => ({ ...current, [provider]: null }));
      updateAccountStatus(await accounts.check(provider));
    } catch (accountError) {
      setAccountErrors((current) => ({ ...current, [provider]: accountError instanceof Error ? accountError.message : String(accountError) }));
    } finally {
      setAccountBusyFor(provider, null);
    }
  };

  const handleAccountClear = async (provider: AccountProvider): Promise<void> => {
    const accounts = getAccountsBridge();

    if (!accounts) {
      return;
    }

    try {
      setAccountBusyFor(provider, 'clear');
      setAccountErrors((current) => ({ ...current, [provider]: null }));
      setAccountMessages((current) => ({ ...current, [provider]: null }));
      updateAccountStatus(await accounts.clear(provider));
      if (provider === 'youtube') {
        setYoutubeBrowser('none');
      }
    } catch (accountError) {
      setAccountErrors((current) => ({ ...current, [provider]: accountError instanceof Error ? accountError.message : String(accountError) }));
    } finally {
      setAccountBusyFor(provider, null);
    }
  };

  const handleYouTubeBrowserChange = async (browser: YouTubeBrowser): Promise<void> => {
    const accounts = getAccountsBridge();
    setYoutubeBrowser(browser);

    if (!accounts) {
      return;
    }

    try {
      setAccountBusyFor('youtube', 'browser');
      setAccountErrors((current) => ({ ...current, youtube: null }));
      setAccountMessages((current) => ({ ...current, youtube: browser === 'none' ? null : `${browser} 浏览器登录状态已保存。` }));
      updateAccountStatus(await accounts.setYouTubeBrowser(browser));
    } catch (accountError) {
      setAccountErrors((current) => ({ ...current, youtube: accountError instanceof Error ? accountError.message : String(accountError) }));
    } finally {
      setAccountBusyFor('youtube', null);
    }
  };

  const handleAccountOpenLogin = async (provider: AccountProvider): Promise<void> => {
    const accounts = getAccountsBridge();

    if (!accounts) {
      setAccountErrors((current) => ({ ...current, [provider]: 'Desktop bridge unavailable. Open ECHO Next in Electron to sign in.' }));
      return;
    }

    if (typeof accounts.startLogin !== 'function') {
      window.open(accountLoginUrls[provider], '_blank', 'noopener,noreferrer');
      setAccountErrors((current) => ({
        ...current,
        [provider]: '当前桌面桥接还是旧版本，自动同步登录不可用。请重启 ECHO Next 后再点“登录并同步”。',
      }));
      setAccountMessages((current) => ({
        ...current,
        [provider]: '已先打开网页登录页；重启 ECHO 后会启用自动同步登录窗口。',
      }));
      return;
    }

    try {
      setAccountBusyFor(provider, 'login');
      setAccountErrors((current) => ({ ...current, [provider]: null }));
      setAccountMessages((current) => ({ ...current, [provider]: '登录窗口已打开。登录完成后关闭窗口，ECHO 会自动同步。' }));
      const result = await accounts.startLogin(provider);
      updateAccountStatus(result.status);
      setAccountMessages((current) => ({ ...current, [provider]: result.message }));
      if (!result.saved) {
        setAccountErrors((current) => ({ ...current, [provider]: result.message }));
      }
    } catch (accountError) {
      setAccountErrors((current) => ({ ...current, [provider]: accountError instanceof Error ? accountError.message : String(accountError) }));
    } finally {
      setAccountBusyFor(provider, null);
    }
  };

  const handleDiagnosticsExport = async (): Promise<void> => {
    try {
      const diagnostics = getDiagnosticsBridge();

      if (!diagnostics) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to export diagnostics.');
        return;
      }

      setDiagnosticsBusy(true);
      setDiagnosticsMessage(null);
      const exportedPath = await diagnostics.exportDiagnostics();
      setDiagnosticsMessage(`Markdown 报告已导出：${exportedPath}`);
    } catch (diagnosticsError) {
      setDiagnosticsMessage(diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError));
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const handleDiagnosticsOpenFolder = async (): Promise<void> => {
    try {
      const diagnostics = getDiagnosticsBridge();

      if (!diagnostics) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to open diagnostics.');
        return;
      }

      await diagnostics.openDiagnosticsFolder();
    } catch (diagnosticsError) {
      setDiagnosticsMessage(diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError));
    }
  };

  const handleDiagnosticsOpenCrashReport = async (): Promise<void> => {
    try {
      const diagnostics = getDiagnosticsBridge();

      if (!diagnostics) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to view crash reports.');
        return;
      }

      const openedPath = await diagnostics.openCrashReport();
      setDiagnosticsMessage(`崩溃报告：${openedPath}`);
    } catch (diagnosticsError) {
      setDiagnosticsMessage(diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError));
    }
  };

  const handleDiagnosticsOpenAudioCrashReport = async (): Promise<void> => {
    try {
      const diagnostics = getDiagnosticsBridge();

      if (!diagnostics) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to view audio crash reports.');
        return;
      }

      const openedPath = await diagnostics.openAudioCrashReport();
      setDiagnosticsMessage(`音频报告：${openedPath}`);
    } catch (diagnosticsError) {
      setDiagnosticsMessage(diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError));
    }
  };

  const handleDiagnosticsClearSummary = async (): Promise<void> => {
    try {
      const diagnostics = getDiagnosticsBridge();

      if (!diagnostics) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to clear diagnostics.');
        return;
      }

      await diagnostics.clearLastCrashSummary();
      setLastCrashSummary(null);
      setDiagnosticsMessage('已清除上次异常退出提示。');
    } catch (diagnosticsError) {
      setDiagnosticsMessage(diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError));
    }
  };

  const currentCacheDirectory = appSettings?.coverCacheDir ?? defaultCacheDirectory ?? '';
  const currentCacheDirectoryLabel = appSettings?.coverCacheDir
    ? appSettings.coverCacheDir
    : defaultCacheDirectory
      ? `默认：${defaultCacheDirectory}`
      : '默认目录读取中';
  const pendingResolvedCacheDirectory =
    pendingCacheDirectory === undefined ? null : pendingCacheDirectory ?? defaultCacheDirectory;
  const currentDownloadDirectoryLabel = downloadSettings?.outputDirectory ?? '尚未选择下载文件夹';
  const updateDownloadPercent = Math.max(0, Math.min(100, Math.round(updateStatus?.downloadPercent ?? 0)));
  const showUpdateDownloadProgress = updateStatus?.state === 'downloading' || updateStatus?.state === 'downloaded';
  const updateDownloadSizeLabel =
    updateStatus?.transferredBytes && updateStatus.totalBytes
      ? `${formatUpdateBytes(updateStatus.transferredBytes)} / ${formatUpdateBytes(updateStatus.totalBytes)}`
      : formatUpdateBytes(updateStatus?.totalBytes);
  const updateDownloadSpeedLabel = updateStatus?.bytesPerSecond ? `${formatUpdateBytes(updateStatus.bytesPerSecond)}/s` : 'n/a';
  const artistImageHasSummary = Boolean(artistImageProgress);
  const artistImageSummary = artistImageProgress?.summary ?? emptyArtistImageSummary;
  const artistImageQueuedTotal = artistImageProgress?.lastQueued.queued ?? 0;
  const artistImageRuntimeActive = (artistImageProgress?.queued ?? 0) + (artistImageProgress?.active ?? 0);
  const artistImageFailed = artistImageSummary.error + artistImageSummary.rateLimited;
  const artistImageTerminalTotal = artistImageSummary.matched + artistImageSummary.notFound + artistImageFailed;
  const artistImagePersistedActive = artistImageSummary.pending + artistImageSummary.loading;
  const artistImageActive = artistImageHasSummary ? Math.max(artistImageRuntimeActive, artistImagePersistedActive) : artistImageQueuedTotal;
  const artistImageProgressTotal = Math.max(
    artistImageSummary.total,
    artistImageTerminalTotal + artistImageActive,
    artistImageQueuedTotal,
    1,
  );
  const artistImageProgressDone =
    !artistImageHasSummary
      ? 0
      : Math.max(0, Math.min(artistImageProgressTotal, artistImageTerminalTotal));
  const artistImageProgressPercent =
    artistImageProgressTotal > 0 ? Math.max(0, Math.min(100, Math.round((artistImageProgressDone / artistImageProgressTotal) * 100))) : 0;
  const artistImagePaused = artistImageProgress?.paused ?? appSettings?.artistImageFetchPaused ?? false;
  const artistImageStatusLabel = !appSettings?.autoFetchArtistImages
    ? '未启用'
    : artistImagePaused
      ? '已暂停'
      : artistImageProgress?.running
        ? '运行中'
        : '空闲';

  const handleDownloadDirectoryChoose = async (): Promise<void> => {
    try {
      const downloads = getDownloadsBridge();

      if (!downloads) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to choose a download directory.');
        return;
      }

      setDownloadDirectoryBusy(true);
      setDownloadDirectoryMessage(null);
      setError(null);
      const settings = await downloads.chooseOutputDirectory();

      if (!settings) {
        return;
      }

      setDownloadSettings(settings);
      setDownloadDirectoryMessage('下载路径已更新。');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setDownloadDirectoryBusy(false);
    }
  };

  const handleCacheDirectoryChoose = async (): Promise<void> => {
    try {
      const app = getAppBridge();

      if (!app) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to choose a cache directory.');
        return;
      }

      const directory = await app.chooseCacheDirectory();
      if (!directory) {
        return;
      }

      setPendingCacheDirectory(directory);
      setCacheDirectoryResult(null);
      setCacheDirectoryMessage(null);
      setError(null);
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  };

  const handleCacheDirectoryApply = async (migrate: boolean): Promise<void> => {
    if (pendingCacheDirectory === undefined) {
      return;
    }

    try {
      const app = getAppBridge();

      if (!app) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to change the cache directory.');
        return;
      }

      setCacheDirectoryBusy(true);
      setCacheDirectoryResult(null);
      setCacheDirectoryMessage(null);
      const result = await app.setCoverCacheDirectory({
        directory: pendingCacheDirectory,
        migrate,
      });
      setCacheDirectoryResult(result);

      if (result?.errors.length) {
        setCacheDirectoryMessage('迁移未完成，缓存目录没有切换。请查看错误摘要后重试。');
        return;
      }

      const settings = await app.getSettings();
      setAppSettings(settings);
      setPendingCacheDirectory(undefined);
      setCacheDirectoryMessage(migrate ? '缓存目录已切换，封面缓存路径已更新。' : '缓存目录已切换，后续扫描会按需重新生成封面缓存。');
      window.dispatchEvent(new Event('library:changed'));
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    } finally {
      setCacheDirectoryBusy(false);
    }
  };

  const handleCloseToTrayToggle = (): void => {
    const nextHideToTrayOnClose = !(appSettings?.hideToTrayOnClose ?? false);
    patchAppSettings({ hideToTrayOnClose: nextHideToTrayOnClose });
  };

  const handleArtistWallAlbumArtworkToggle = (): void => {
    const nextArtistWallAlbumArtwork = !(appSettings?.artistWallAlbumArtwork ?? false);
    const app = getAppBridge();

    if (!app) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to save app settings.');
      return;
    }

    void app
      .setSettings({ artistWallAlbumArtwork: nextArtistWallAlbumArtwork })
      .then((settings) => {
        setAppSettings(settings);
        window.dispatchEvent(new Event('settings:changed'));
      })
      .catch((settingsError) => {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
      });
  };

  const setShortcutMessage = useCallback((action: GlobalShortcutAction, message: string | null): void => {
    setShortcutMessages((current) => ({ ...current, [action]: message }));
  }, []);

  const patchGlobalShortcuts = useCallback((nextShortcuts: GlobalShortcutSettings): void => {
    patchAppSettings({ globalShortcuts: nextShortcuts });
  }, [patchAppSettings]);

  const patchGlobalShortcut = useCallback((action: GlobalShortcutAction, patch: Partial<GlobalShortcutSettings[GlobalShortcutAction]>): void => {
    patchGlobalShortcuts({
      ...globalShortcuts,
      [action]: {
        ...globalShortcuts[action],
        ...patch,
      },
    });
  }, [globalShortcuts, patchGlobalShortcuts]);

  const validateShortcutBeforeEnable = async (action: GlobalShortcutAction, accelerator: string | null): Promise<string | null> => {
    if (!accelerator) {
      return t('settings.shortcuts.message.empty');
    }

    const validation = validateGlobalShortcutAccelerator(accelerator);
    if (!validation.valid || !validation.accelerator) {
      return t(validation.reason === 'unsafe' ? 'settings.shortcuts.message.unsafe' : 'settings.shortcuts.message.invalid');
    }

    const duplicateAction = findDuplicateGlobalShortcutAction(globalShortcuts, action, validation.accelerator);
    if (duplicateAction) {
      return t('settings.shortcuts.message.duplicate');
    }

    const bridgeValidation = await getAppBridge()?.validateGlobalShortcut?.(validation.accelerator);
    if (bridgeValidation && (!bridgeValidation.valid || !bridgeValidation.available)) {
      return t(bridgeValidation.reason === 'unavailable' ? 'settings.shortcuts.message.unavailable' : 'settings.shortcuts.message.invalid');
    }

    return null;
  };

  const handleShortcutToggle = async (action: GlobalShortcutAction): Promise<void> => {
    const binding = globalShortcuts[action];
    if (binding.enabled) {
      setShortcutMessage(action, null);
      patchGlobalShortcut(action, { enabled: false });
      return;
    }

    const message = await validateShortcutBeforeEnable(action, binding.accelerator);
    if (message) {
      setShortcutMessage(action, message);
      patchGlobalShortcut(action, { enabled: false });
      return;
    }

    setShortcutMessage(action, null);
    patchGlobalShortcut(action, { enabled: true });
  };

  const handleShortcutClear = (action: GlobalShortcutAction): void => {
    setShortcutMessage(action, null);
    patchGlobalShortcut(action, { enabled: false, accelerator: null });
  };

  const handleShortcutRecommendedReset = (): void => {
    setRecordingShortcutAction(null);
    setShortcutMessages({});
    patchGlobalShortcuts(createRecommendedGlobalShortcuts());
  };

  const commitRecordedShortcut = useCallback(
    (action: GlobalShortcutAction, rawAccelerator: string | null): void => {
      const validation = validateGlobalShortcutAccelerator(rawAccelerator);
      if (!validation.valid || !validation.accelerator) {
        setShortcutMessage(action, t(validation.reason === 'unsafe' ? 'settings.shortcuts.message.unsafe' : 'settings.shortcuts.message.invalid'));
        return;
      }

      const duplicateAction = findDuplicateGlobalShortcutAction(globalShortcuts, action, validation.accelerator);
      if (duplicateAction) {
        setShortcutMessage(action, t('settings.shortcuts.message.duplicate'));
        return;
      }

      setShortcutMessage(action, null);
      patchGlobalShortcut(action, {
        accelerator: validation.accelerator,
        enabled: false,
      });
      setRecordingShortcutAction(null);
    },
    [globalShortcuts, patchGlobalShortcut, setShortcutMessage, t],
  );

  useEffect(() => {
    if (!recordingShortcutAction) {
      return undefined;
    }

    const handleShortcutKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecordingShortcutAction(null);
        return;
      }

      commitRecordedShortcut(recordingShortcutAction, acceleratorFromKeyboardEvent(event));
    };

    const handleShortcutMouseEvent = (event: MouseEvent): void => {
      const rawAccelerator = acceleratorFromMouseEvent(event);
      if (!rawAccelerator) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      commitRecordedShortcut(recordingShortcutAction, rawAccelerator);
    };

    const handleShortcutContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    window.addEventListener('mousedown', handleShortcutMouseEvent, true);
    window.addEventListener('mouseup', handleShortcutMouseEvent, true);
    window.addEventListener('auxclick', handleShortcutMouseEvent, true);
    window.addEventListener('contextmenu', handleShortcutContextMenu, true);
    return () => {
      window.removeEventListener('keydown', handleShortcutKeyDown, true);
      window.removeEventListener('mousedown', handleShortcutMouseEvent, true);
      window.removeEventListener('mouseup', handleShortcutMouseEvent, true);
      window.removeEventListener('auxclick', handleShortcutMouseEvent, true);
      window.removeEventListener('contextmenu', handleShortcutContextMenu, true);
    };
  }, [commitRecordedShortcut, recordingShortcutAction]);

  const handleAutoFetchArtistImagesToggle = async (): Promise<void> => {
    const app = getAppBridge();

    if (!app) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to save app settings.');
      return;
    }

    const nextAutoFetch = !(appSettings?.autoFetchArtistImages ?? false);
    const patch: Partial<AppSettings> = nextAutoFetch
      ? { autoFetchArtistImages: true, artistImageFetchPaused: false }
      : { autoFetchArtistImages: false };

    try {
      setArtistImageBusyAction(nextAutoFetch ? 'refresh' : null);
      setArtistImageMessage(null);
      const settings = await app.setSettings(patch);
      setAppSettings(settings);
      dispatchSettingsChanged(settings);

      const library = getLibraryBridge();
      if (nextAutoFetch) {
        if (!library?.kickoffArtistImageBackfill) {
          setError(t('settings.appearance.artistAvatars.message.desktopBridgeRefresh'));
          return;
        }

        const status = await library.kickoffArtistImageBackfill({ force: false, limit: 500 });
        setArtistImageProgress({ ...status, startedAt: Date.now() });
        setArtistImageMessage(
          t('settings.appearance.artistAvatars.message.queued', {
            queued: status.lastQueued.queued,
            skipped: status.lastQueued.skipped,
          }),
        );
        return;
      }

      const status = await library?.getArtistImageJobStatus?.();
      setArtistImageProgress(status ? { ...status, startedAt: Date.now() } : null);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setArtistImageBusyAction(null);
    }
  };

  const handleArtistWallAlbumFallbackForMissingAvatarsToggle = (): void => {
    patchAppSettings({
      artistWallAlbumFallbackForMissingAvatars: !(appSettings?.artistWallAlbumFallbackForMissingAvatars ?? false),
    });
  };

  const handleRefreshMissingArtistImages = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library?.kickoffArtistImageBackfill) {
      setError(t('settings.appearance.artistAvatars.message.desktopBridgeRefresh'));
      return;
    }

    try {
      setArtistImageBusyAction('refresh');
      setArtistImageMessage(null);
      const status = await library.kickoffArtistImageBackfill({ force: true, limit: 500 });
      setArtistImageMessage(
        !appSettings?.autoFetchArtistImages
          ? t('settings.appearance.artistAvatars.message.enableFirst')
          : t('settings.appearance.artistAvatars.message.queued', { queued: status.lastQueued.queued, skipped: status.lastQueued.skipped }),
      );
      setArtistImageProgress({ ...status, startedAt: Date.now() });
    } catch (artistImageError) {
      setError(artistImageError instanceof Error ? artistImageError.message : String(artistImageError));
    } finally {
      setArtistImageBusyAction(null);
    }
  };

  const handleArtistImagePauseToggle = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library?.setArtistImageJobsPaused) {
      setError(t('settings.appearance.artistAvatars.message.desktopBridgeRefresh'));
      return;
    }

    try {
      const nextPaused = !(artistImageProgress?.paused ?? appSettings?.artistImageFetchPaused ?? false);
      const status = await library.setArtistImageJobsPaused(nextPaused);
      setAppSettings((current) => (current ? { ...current, artistImageFetchPaused: nextPaused } : current));
      setArtistImageProgress({ ...status, startedAt: Date.now() });
      setArtistImageMessage(nextPaused ? '已暂停歌手头像后台获取。' : '已继续歌手头像后台获取。');
    } catch (artistImageError) {
      setError(artistImageError instanceof Error ? artistImageError.message : String(artistImageError));
    }
  };

  const handleClearArtistImageCache = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library?.clearArtistImageCache) {
      setError(t('settings.appearance.artistAvatars.message.desktopBridgeClear'));
      return;
    }

    try {
      setArtistImageBusyAction('clear');
      setArtistImageMessage(null);
      const result = await library.clearArtistImageCache();
      setArtistImageMessage(
        t('settings.appearance.artistAvatars.message.cleared', { removedRows: result.removedRows, deletedFiles: result.deletedFiles }),
      );
      const status = await library.getArtistImageJobStatus?.();
      setArtistImageProgress(status ? { ...status, startedAt: Date.now() } : null);
      window.dispatchEvent(new Event('library:changed'));
    } catch (artistImageError) {
      setError(artistImageError instanceof Error ? artistImageError.message : String(artistImageError));
    } finally {
      setArtistImageBusyAction(null);
    }
  };

  const handleAlbumMergeStrategyApply = async (): Promise<void> => {
    const nextStrategy = pendingAlbumMergeStrategy ?? appSettings?.albumMergeStrategy ?? 'standard';
    const app = getAppBridge();
    const library = getLibraryBridge();

    if (!app || !library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to refresh album grouping.');
      return;
    }

    try {
      setAlbumGroupingBusy(true);
      setAlbumGroupingMessage(null);
      setError(null);
      const beforeSummary = await library.getSummary();
      const settings = await app.setSettings({ albumMergeStrategy: nextStrategy });
      setAppSettings(settings);
      const afterSummary = await library.refreshAlbumGrouping();
      const albumDelta = beforeSummary.albumCount - afterSummary.albumCount;
      const changeText =
        albumDelta > 0
          ? `减少 ${albumDelta} 张`
          : albumDelta < 0
            ? `增加 ${Math.abs(albumDelta)} 张`
            : '数量未变化';
      setAlbumGroupingMessage(`专辑分组已更新：${beforeSummary.albumCount} 张 -> ${afterSummary.albumCount} 张，${changeText}。`);
      window.dispatchEvent(new Event('library:changed'));
    } catch (albumGroupingError) {
      setAlbumGroupingMessage(null);
      setError(albumGroupingError instanceof Error ? albumGroupingError.message : String(albumGroupingError));
    } finally {
      setAlbumGroupingBusy(false);
    }
  };

  const handleScanLibraryFolders = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to scan library folders.');
      return;
    }

    try {
      setLibraryScanBusy(true);
      setLibraryScanMessage(null);
      setError(null);
      const folders = await library.getFolders();

      if (folders.length === 0) {
        setLibraryScanMessage('还没有导入曲库文件夹。');
        return;
      }

      const scans = await Promise.all(folders.map((folder) => library.scanFolder(folder.id)));
      scans.forEach(rememberLibraryScanStatus);
      setLibraryScanMessage(`已开始扫描 ${scans.length} 个曲库文件夹。`);
    } catch (scanError) {
      setLibraryScanMessage(null);
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setLibraryScanBusy(false);
    }
  };

  const handleRescanEmbeddedTags = async (scope: 'all' | 'missing-cover'): Promise<void> => {
    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to rescan embedded tags.');
      return;
    }

    try {
      setEmbeddedTagRescanBusy(scope);
      setEmbeddedTagRescanMessage(null);
      setError(null);
      const scans = await library.rescanEmbeddedTags(
        scope === 'all' ? 'embedded-tags-all' : 'embedded-tags-missing-cover',
      );
      scans.forEach(rememberLibraryScanStatus);
      if (scans.length === 0) {
        setEmbeddedTagRescanMessage('还没有导入曲库文件夹。');
        return;
      }

      setEmbeddedTagRescanMessage(
        scope === 'all'
          ? `已开始重扫 ${scans.length} 个曲库文件夹的全部嵌入标签，扫到后会自动应用。`
          : `已开始重扫 ${scans.length} 个曲库文件夹中缺失封面的歌曲，扫到嵌入标签/封面后会自动应用。`,
      );
      window.dispatchEvent(new Event('library:changed'));
    } catch (scanError) {
      setEmbeddedTagRescanMessage(null);
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setEmbeddedTagRescanBusy(null);
    }
  };

  const handleDuplicateVisibilityToggle = async (): Promise<void> => {
    const app = getAppBridge();
    const library = getLibraryBridge();
    const nextEnabled = !(appSettings?.duplicateTracksEnabled ?? false);

    if (!app || !library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to change duplicate track settings.');
      return;
    }

    try {
      setDuplicateBusyAction('toggle');
      setDuplicateMessage(null);
      setError(null);
      const [settings, summary] = await Promise.all([
        app.setSettings({
          duplicateTracksEnabled: nextEnabled,
          duplicateTracksMode: 'strict',
        }),
        library.getDuplicateIndexSummary('strict'),
      ]);

      setAppSettings(settings);
      setDuplicateSummary(summary);
      if (nextEnabled) {
        setDuplicateMessage(
          summary.duplicateGroups > 0
            ? `已开启隐藏重复歌曲，当前隐藏 ${summary.hiddenTracks} 首。`
            : '已开启隐藏重复歌曲。还没有分析结果，请先分析重复歌曲。',
        );
      } else {
        setDuplicateMessage('已关闭隐藏重复歌曲。');
      }
      window.dispatchEvent(new Event('settings:changed'));
      window.dispatchEvent(new Event('library:changed'));
    } catch (duplicateError) {
      setDuplicateMessage(null);
      setError(duplicateError instanceof Error ? duplicateError.message : String(duplicateError));
    } finally {
      setDuplicateBusyAction(null);
    }
  };

  const handleAnalyzeDuplicateTracks = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to analyze duplicate tracks.');
      return;
    }

    try {
      setDuplicateBusyAction('analyze');
      setDuplicateMessage(null);
      setError(null);
      const summary = await library.refreshDuplicateTracks('strict');
      setDuplicateSummary(summary);
      setDuplicateMessage(`发现 ${summary.duplicateGroups} 组重复歌曲，当前可隐藏 ${summary.hiddenTracks} 首。`);
      window.dispatchEvent(new Event('library:changed'));
    } catch (duplicateError) {
      setDuplicateMessage(null);
      setError(duplicateError instanceof Error ? duplicateError.message : String(duplicateError));
    } finally {
      setDuplicateBusyAction(null);
    }
  };

  const pollBpmAnalysisJob = async (jobId: string): Promise<void> => {
    const library = getLibraryBridge();
    if (!library) {
      return;
    }

    for (;;) {
      const status = await library.getBpmAnalysisStatus(jobId);
      setBpmAnalysisJob(status);
      setBpmAnalysisMessage(
        status.status === 'completed'
          ? `BPM 分析完成：${status.updatedTracks}/${status.totalTracks} 首已更新`
          : `BPM 分析中：${status.processedTracks}/${status.totalTracks}`,
      );

      if (status.status === 'completed' || status.status === 'failed') {
        setBpmAnalysisBusy(false);
        window.dispatchEvent(new Event('library:changed'));
        return;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    }
  };

  const handleStartBpmAnalysis = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to analyze BPM.');
      return;
    }

    try {
      setBpmAnalysisBusy(true);
      setBpmAnalysisMessage(null);
      setError(null);
      const job = await library.startBpmAnalysis({ limit: 500 });
      setBpmAnalysisJob(job);
      setBpmAnalysisMessage(job.totalTracks > 0 ? `BPM 分析已开始：0/${job.totalTracks}` : '没有需要分析的歌曲');
      if (job.totalTracks === 0) {
        setBpmAnalysisBusy(false);
        return;
      }
      void pollBpmAnalysisJob(job.id).catch((analysisError) => {
        setBpmAnalysisBusy(false);
        setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
      });
    } catch (analysisError) {
      setBpmAnalysisBusy(false);
      setBpmAnalysisMessage(null);
      setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
    }
  };

  const pollReplayGainAnalysisJob = async (jobId: string): Promise<void> => {
    const library = getLibraryBridge();
    if (!library) {
      return;
    }

    for (;;) {
      const status = await library.getReplayGainAnalysisStatus(jobId);
      setReplayGainAnalysisJob(status);
      setReplayGainAnalysisMessage(
        status.status === 'completed'
          ? `ReplayGain 分析完成：${status.updatedTracks}/${status.totalTracks} 首已更新`
          : `ReplayGain 分析中：${status.processedTracks}/${status.totalTracks}`,
      );

      if (status.status === 'completed' || status.status === 'failed') {
        setReplayGainAnalysisBusy(false);
        window.dispatchEvent(new Event('library:changed'));
        return;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    }
  };

  const handleStartReplayGainAnalysis = async (): Promise<void> => {
    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to analyze ReplayGain.');
      return;
    }

    try {
      setReplayGainAnalysisBusy(true);
      setReplayGainAnalysisMessage(null);
      setError(null);
      const job = await library.startReplayGainAnalysis({ limit: 500 });
      setReplayGainAnalysisJob(job);
      setReplayGainAnalysisMessage(job.totalTracks > 0 ? `ReplayGain 分析已开始：0/${job.totalTracks}` : '没有需要分析响度的歌曲');
      if (job.totalTracks === 0) {
        setReplayGainAnalysisBusy(false);
        return;
      }
      void pollReplayGainAnalysisJob(job.id).catch((analysisError) => {
        setReplayGainAnalysisBusy(false);
        setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
      });
    } catch (analysisError) {
      setReplayGainAnalysisBusy(false);
      setReplayGainAnalysisMessage(null);
      setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
    }
  };

  const toggleNetworkProvider = (provider: AppSettings['networkMetadataProviders'][number]): void => {
    const current = (appSettings?.networkMetadataProviders ?? defaultNetworkMetadataProviders).filter((item) =>
      visibleNetworkMetadataProviders.includes(item),
    );
    const next = current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider];
    patchAppSettings({ networkMetadataProviders: next.length ? next : defaultNetworkMetadataProviders });
  };

  const handlePlaybackSpeedModeChange = (playbackSpeedMode: PlaybackSpeedMode): void => {
    const playbackSpeed = appSettings?.playbackSpeed ?? status?.playbackRate ?? 1;
    const audio = getAudioBridge();
    patchAppSettings({ playbackSpeedMode });

    if (!audio) {
      return;
    }

    void audio
      .setOutput({ playbackRate: playbackSpeed, playbackSpeedMode })
      .then(setStatus)
      .catch((speedError) => {
        setError(speedError instanceof Error ? speedError.message : String(speedError));
      });
  };

  const handleClearLibraryCache = async (): Promise<void> => {
    if (!window.confirm('清空曲库缓存？这会移除曲库索引、扫描缓存和封面缓存，不会删除你的音乐文件。')) {
      return;
    }

    const library = getLibraryBridge();

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to clear the library cache.');
      return;
    }

    try {
      setDangerBusy(true);
      setDangerMessage(null);
      setError(null);
      const result = await library.clearCache();
      setDangerMessage(
        `曲库缓存已清空：移除 ${result.removedCount}/${result.scannedCount} 首索引，删除 ${result.deletedCoverCacheFiles} 个封面缓存文件。`,
      );
      window.dispatchEvent(new Event('library:changed'));
    } catch (clearError) {
      setDangerMessage(null);
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setDangerBusy(false);
    }
  };

  const handleResetDefaultSettings = async (): Promise<void> => {
    if (!window.confirm('恢复默认设置？这会重置应用偏好、封面缓存目录和外观偏好，不会删除音乐文件或曲库文件夹。')) {
      return;
    }

    const app = getAppBridge();

    if (!app) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to reset settings.');
      return;
    }

    try {
      setDangerBusy(true);
      setDangerMessage(null);
      setError(null);
      const settings = await app.resetSettings();
      setAppSettings(settings);
      handleAppearanceChange(defaultAppearancePreferences);
      setPendingCacheDirectory(undefined);
      setCacheDirectoryResult(null);
      setCacheDirectoryMessage(null);
      setPendingAlbumMergeStrategy(settings.albumMergeStrategy);
      setDefaultCacheDirectory(await app.getDefaultCacheDirectory());
      setDangerMessage('默认设置已恢复。');
      window.dispatchEvent(new Event('settings:changed'));
      window.dispatchEvent(new Event('library:changed'));
    } catch (resetError) {
      setDangerMessage(null);
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setDangerBusy(false);
    }
  };

  const handleFontPickerOpen = (target: FontPickerTarget): void => {
    setFontPickerTarget(target);
    setFontPickerQuery('');
  };

  const handleFontSelect = (fontFamily: string): void => {
    if (fontPickerTarget === 'main') {
      handleAppearanceChange({ ...appearancePreferences, mainFontFamily: fontFamily, mainFontFilePath: null });
    }

    if (fontPickerTarget === 'chinese') {
      handleAppearanceChange({ ...appearancePreferences, chineseFontFamily: fontFamily, chineseFontFilePath: null });
    }

    setFontPickerTarget(null);
  };

  const handleFontFileChoose = async (): Promise<void> => {
    const target = fontPickerTarget;

    if (!target) {
      return;
    }

    try {
      const app = getAppBridge();

      if (!app) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to choose local font files.');
        return;
      }

      const fontFile = await app.chooseFontFile();

      if (!fontFile) {
        return;
      }

      const fontFamily = await registerAppearanceFontFile(target, fontFile);
      setFontFamilies((current) => Array.from(new Set([...current, fontFamily])).sort((a, b) => a.localeCompare(b)));

      if (target === 'main') {
        handleAppearanceChange({ ...appearancePreferences, mainFontFamily: fontFamily, mainFontFilePath: fontFile.path });
      }

      if (target === 'chinese') {
        handleAppearanceChange({ ...appearancePreferences, chineseFontFamily: fontFamily, chineseFontFilePath: fontFile.path });
      }

      setFontPickerTarget(null);
      setError(null);
    } catch (fontError) {
      setError(fontError instanceof Error ? fontError.message : String(fontError));
    }
  };

  const activeNavItems = visibleNavItems.length ? visibleNavItems : settingsNavItems;
  const formatBool = (value: boolean): string => (value ? t('common.yes') : t('common.no'));
  const activeFontValue = fontPickerTarget === 'chinese' ? appearancePreferences.chineseFontFamily : appearancePreferences.mainFontFamily;
  const formatLastFmTimestamp = (value: string | null | undefined): string => {
    if (!value) {
      return t('settings.integrations.lastfm.never');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return t('settings.integrations.lastfm.never');
    }

    return new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  const discordPresenceLabel = !discordPresenceStatus?.enabled
    ? 'Disabled'
    : discordPresenceStatus.connected
      ? 'Connected'
      : discordPresenceStatus.lastError
        ? `Error: ${discordPresenceStatus.lastError}`
        : discordPresenceStatus.available
          ? 'Enabled'
          : 'Discord not running';
  const lastFmLabel = !lastFmStatus?.enabled
    ? t('common.disabled')
    : lastFmStatus.connected
      ? t('settings.integrations.lastfm.status.connected', { username: lastFmStatus.username ?? '' }).trim()
      : lastFmStatus.authPending
        ? t('settings.integrations.lastfm.status.pending')
      : lastFmStatus.lastError
        ? t('settings.integrations.lastfm.status.error', { error: lastFmStatus.lastError })
        : t('settings.integrations.lastfm.status.notConnected');
  const lastFmActiveLabel = lastFmStatus?.activeTrack
    ? t('settings.integrations.lastfm.activeProgress', {
        artist: lastFmStatus.activeTrack.artist,
        title: lastFmStatus.activeTrack.title,
        played: lastFmStatus.activeTrack.playedSeconds,
        threshold: lastFmStatus.activeTrack.thresholdSeconds,
      })
    : t('settings.integrations.lastfm.noActiveTrack');

  return (
    <div className="settings-page no-drag">
      <header className="settings-header">
        <h1>{t('route.settings.label')}</h1>
        <label className="settings-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
            onKeyDown={handleSettingsSearchKeyDown}
            placeholder={t('settings.header.searchPlaceholder')}
          />
          {settingsQuery.trim() ? (
            <div className="settings-search-results" role="listbox" aria-label={t('settings.header.searchPlaceholder')}>
              {settingsSearchResults.length ? (
                settingsSearchResults.slice(0, 6).map((result, index) => (
                  <button
                    className="settings-search-result"
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={index === 0}
                    onClick={() => jumpToSettingsSection(result.sectionKey, { clearSearch: true, targetId: result.targetId })}
                  >
                    <span>{result.title}</span>
                    <small>{result.description}</small>
                  </button>
                ))
              ) : (
                <p className="settings-search-empty">没有匹配的设置</p>
              )}
            </div>
          ) : null}
        </label>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label={t('route.settings.label')}>
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            const isDanger = item.key === 'danger';

            return (
              <button
                className={`settings-nav-item ${isActive ? 'active' : ''} ${isDanger ? 'is-danger' : ''}`}
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
              >
                <Icon size={17} />
                <span className="settings-nav-copy">
                  <span className="settings-nav-label">{t(item.labelKey)}</span>
                  <span className="settings-nav-desc">{t(item.descriptionKey)}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-scroll-shell" ref={settingsScrollShellRef}>
          <div className="settings-content">
            <SettingSection activeKey={activeSection} icon={MessageSquare} id="general" title={t('settings.nav.general.label')}>
              <SettingRow title={t('settings.general.language.title')} description={t('settings.general.language.description')}>
                <div className="settings-chip-row">
                  {localeOptions.map((option) => (
                    <ChipButton active={locale === option.locale} key={option.locale} onClick={() => setLocale(option.locale)}>
                      {option.label}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.general.closeToTray')}>
                <ToggleButton
                  active={appSettings?.hideToTrayOnClose ?? false}
                  disabled={!appSettings}
                  onClick={handleCloseToTrayToggle}
                />
              </SettingRow>
              <SettingRow title="记住窗口尺寸" description="开启后会记住你上次拖拽后的窗口宽高，下次启动自动恢复。">
                <ToggleButton
                  active={appSettings?.rememberWindowSizeEnabled ?? true}
                  disabled={!appSettings}
                  onClick={() =>
                    patchAppSettings({
                      rememberWindowSizeEnabled: !(appSettings?.rememberWindowSizeEnabled ?? true),
                    })
                  }
                />
              </SettingRow>
              <SettingRow title="简繁互搜" description="开启后，输入繁体可以搜到简体结果，输入简体也可以搜到繁体结果。">
                <ToggleButton
                  active={appSettings?.chineseCrossScriptSearchEnabled ?? true}
                  disabled={!appSettings}
                  onClick={() =>
                    patchAppSettings({
                      chineseCrossScriptSearchEnabled: !(appSettings?.chineseCrossScriptSearchEnabled ?? true),
                    })
                  }
                />
              </SettingRow>
              <SettingRow title={t('settings.general.backup.title')} description={t('settings.general.backup.description')}>
                <div className="settings-chip-row">
                  <button className="settings-action-button" type="button">
                    <Download size={15} />
                    {t('settings.general.backup.export')}
                  </button>
                  <button className="settings-action-button" type="button">
                    {t('settings.general.backup.import')}
                  </button>
                </div>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Zap} id="playback" title={t('settings.nav.playback.label')}>
              <SettingRow title={t('settings.playback.outputMode.title')} description={t('settings.playback.outputMode.description')}>
                <div className="settings-chip-row">
                  {(['shared', 'exclusive', 'asio'] as AudioOutputMode[]).map((mode) => (
                    <ChipButton active={outputMode === mode} key={mode} onClick={() => handleOutputModeChange(mode)}>
                      {mode}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.playback.sharedBackend.title')} description={t('settings.playback.sharedBackend.description')}>
                <div className="settings-chip-row">
                  {([
                    ['auto', t('settings.playback.sharedBackend.wasapi')],
                    ['directsound', t('settings.playback.sharedBackend.directSound')],
                  ] as Array<[AudioSharedBackend, string]>).map(([backend, label]) => (
                    <ChipButton active={outputMode === 'shared' && sharedBackend === backend} key={backend} onClick={() => handleSharedBackendChange(backend)}>
                      {label}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                id="settings-row-output-device"
                highlighted={highlightedSettingId === 'settings-row-output-device'}
                title={t('settings.playback.outputDevice.title')}
                description={t('settings.playback.outputDevice.description')}
              >
                <StyledSelect
                  className="settings-select-control"
                  value={selectedDeviceId}
                  options={outputDeviceOptions}
                  onChange={handleDeviceChange}
                  ariaLabel={t('settings.playback.outputDevice.title')}
                  disabled={compatibleDevices.length === 0}
                  showFilterIcon={false}
                />
              </SettingRow>
              <SettingRow title={t('settings.playback.troubleshooting.title')} description={t('settings.playback.troubleshooting.description')}>
                <div className="settings-chip-row">
                  <button
                    className="settings-action-button"
                    type="button"
                    disabled={audioResetBusy || windowsAudioRestartBusy}
                    onClick={() => void handleAudioEngineReset()}
                  >
                    <RotateCw size={15} />
                    {audioResetBusy ? t('settings.playback.troubleshooting.softBusy') : t('settings.playback.troubleshooting.softAction')}
                  </button>
                  <button
                    className="settings-action-button"
                    type="button"
                    disabled={audioResetBusy || windowsAudioRestartBusy}
                    onClick={() => void handleWindowsAudioServiceRestart()}
                  >
                    <ShieldAlert size={15} />
                    {windowsAudioRestartBusy ? t('settings.playback.troubleshooting.hardBusy') : t('settings.playback.troubleshooting.hardAction')}
                  </button>
                  {audioResetMessage ? <StatusText tone="good">{audioResetMessage}</StatusText> : null}
                </div>
              </SettingRow>
              <SettingRow title="JUCE 主输出" description="默认开启。FFmpeg 继续负责解码，JUCE 接管输出；失败时自动回退到兼容输出。">
                <ToggleButton
                  active={appSettings?.audioUseJuceOutput ?? true}
                  disabled={!appSettings}
                  onClick={() => void handleJuceOutputToggle()}
                />
              </SettingRow>
              <SettingRow title="JUCE 解码试验" description="默认关闭。本地 WAV/FLAC/MP3 在无需重采样时尝试 JUCE 解码；MP3 走 Windows Media，不承诺比 FFmpeg 更 HiFi；失败会自动回退 FFmpeg。">
                <ToggleButton
                  active={appSettings?.audioUseJuceDecode ?? false}
                  disabled={!appSettings}
                  onClick={() => void handleJuceDecodeToggle()}
                />
              </SettingRow>
              <SettingRow title="DSD DoP 直出试验" description="默认关闭。本地 DSF 在独占或 ASIO 下尝试 DoP 直出；失败会自动回退 FFmpeg PCM，最终以 DAC 显示为准。">
                <ToggleButton
                  active={appSettings?.audioDsdOutputMode === 'dop'}
                  disabled={!appSettings}
                  onClick={() => void handleDsdDopToggle()}
                />
              </SettingRow>
              <SettingRow title="ASIO 原生 DSD 实验" description="默认关闭。仅在 ASIO + 本地 DSF + DoP 开启且无 EQ/音量/变速/DSP 时尝试；失败会退回现有 DoP/PCM。">
                <ToggleButton
                  active={appSettings?.audioAsioNativeDsdExperimentalEnabled === true}
                  disabled={!appSettings}
                  onClick={() => void handleAsioNativeDsdExperimentalToggle()}
                />
              </SettingRow>
              <SettingRow title={t('audioDrawer.guard.asioUnavailable.title')} description={t('audioDrawer.guard.asioUnavailable.description')}>
                <ToggleButton
                  active={appSettings?.audioAsioUnavailableFallbackEnabled ?? false}
                  disabled={!appSettings}
                  onClick={() => void handleAsioUnavailableFallbackToggle()}
                />
              </SettingRow>
              <SettingRow title={t('audioDrawer.guard.soxrFallback.title')} description={t('audioDrawer.guard.soxrFallback.description')}>
                <ToggleButton
                  active={appSettings?.audioSoxrFallbackEnabled ?? true}
                  disabled={!appSettings}
                  onClick={() => void handleSoxrFallbackToggle()}
                />
              </SettingRow>
              <SettingRow title={t('settings.playback.speedMode.title')} description={t('settings.playback.speedMode.description')}>
                <div className="settings-chip-row">
                  {playbackSpeedModes.map((item) => (
                    <ChipButton
                      active={(appSettings?.playbackSpeedMode ?? status?.playbackSpeedMode ?? 'nightcore') === item.mode}
                      key={item.mode}
                      onClick={() => handlePlaybackSpeedModeChange(item.mode)}
                    >
                      {item.label}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                id="settings-row-automix"
                highlighted={highlightedSettingId === 'settings-row-automix'}
                title={t('settings.playback.automix.title')}
                description={t('settings.playback.automix.description')}
              >
                <div className="settings-chip-row">
                  {status?.automix?.active && status.automix.transitionMode ? (
                    <StatusText tone="good">
                      {`${status.automix.engine ?? 'fallback'} / ${status.automix.transitionMode} / ${
                        status.automix.overlapSeconds?.toFixed(1) ?? '?'
                      }s / tempo ${status.automix.tempoRatio?.toFixed(3) ?? '1.000'}`}
                    </StatusText>
                  ) : null}
                  <ToggleButton active={playbackQueue.automixEnabled} onClick={() => playbackQueue.setAutomixEnabled(!playbackQueue.automixEnabled)} />
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="ReplayGain 响度标准化"
                description="读取已有 ReplayGain/R128 标签；缺失时只分析并写入 ECHO 数据库，不修改你的音乐文件。"
              >
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>启用 ReplayGain</span>
                      <ToggleButton
                        active={appSettings?.replayGainEnabled ?? false}
                        disabled={!appSettings}
                        onClick={() => patchAppSettings({ replayGainEnabled: !(appSettings?.replayGainEnabled ?? false) })}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>防削波</span>
                      <ToggleButton
                        active={appSettings?.replayGainPreventClipping ?? true}
                        disabled={!appSettings}
                        onClick={() => patchAppSettings({ replayGainPreventClipping: !(appSettings?.replayGainPreventClipping ?? true) })}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>扫描后分析缺失响度</span>
                      <ToggleButton
                        active={appSettings?.replayGainAnalyzeMissingOnScan ?? false}
                        disabled={!appSettings}
                        onClick={() => {
                          const nextAnalyzeOnScan = !(appSettings?.replayGainAnalyzeMissingOnScan ?? false);
                          patchAppSettings({
                            replayGainAnalyzeMissingOnScan: nextAnalyzeOnScan,
                            replayGainAnalyzeMissingOnScanOptIn: nextAnalyzeOnScan,
                          });
                        }}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>播放时分析缺失响度</span>
                      <ToggleButton
                        active={appSettings?.replayGainAnalyzeOnPlay ?? true}
                        disabled={!appSettings}
                        onClick={() => patchAppSettings({ replayGainAnalyzeOnPlay: !(appSettings?.replayGainAnalyzeOnPlay ?? true) })}
                      />
                    </div>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={replayGainAnalysisBusy}
                      onClick={() => void handleStartReplayGainAnalysis()}
                    >
                      <RotateCw className={replayGainAnalysisBusy ? 'spinning-icon' : undefined} size={15} />
                      {replayGainAnalysisBusy ? '分析中...' : '分析缺失响度'}
                    </button>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left">
                    {(['track', 'album', 'off'] as const).map((mode) => (
                      <ChipButton
                        active={(appSettings?.replayGainMode ?? 'track') === mode}
                        key={mode}
                        onClick={() => patchAppSettings({ replayGainMode: mode })}
                      >
                        {mode === 'track' ? 'Track' : mode === 'album' ? 'Album' : 'Off'}
                      </ChipButton>
                    ))}
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <em>目标响度</em>
                      <strong>{appSettings?.replayGainTargetLufs ?? -18} LUFS</strong>
                    </span>
                    <span>
                      <em>前级增益</em>
                      <strong>{appSettings?.replayGainPreampDb ?? 0} dB</strong>
                    </span>
                    <span>
                      <em>播放应用</em>
                      <strong>{status?.replayGainAppliedDb ? `${status.replayGainAppliedDb} dB` : '0 dB'}</strong>
                    </span>
                    <span>
                      <em>进度</em>
                      <strong>{replayGainAnalysisJob ? `${replayGainAnalysisJob.processedTracks}/${replayGainAnalysisJob.totalTracks}` : '尚未运行'}</strong>
                    </span>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <label className="settings-number-field">
                      <span>目标 LUFS</span>
                      <input
                        type="number"
                        min={-24}
                        max={-12}
                        step={0.5}
                        value={appSettings?.replayGainTargetLufs ?? -18}
                        onChange={(event) => patchAppSettings({ replayGainTargetLufs: Number(event.currentTarget.value) })}
                      />
                    </label>
                    <label className="settings-number-field">
                      <span>Preamp dB</span>
                      <input
                        type="number"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={appSettings?.replayGainPreampDb ?? 0}
                        onChange={(event) => patchAppSettings({ replayGainPreampDb: Number(event.currentTarget.value) })}
                      />
                    </label>
                  </div>
                  {replayGainAnalysisMessage ? <p className="settings-inline-note">{replayGainAnalysisMessage}</p> : null}
                  {replayGainAnalysisJob?.errorCount ? <p className="settings-inline-error">ReplayGain 分析错误 {replayGainAnalysisJob.errorCount} 个，已跳过问题文件。</p> : null}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.playback.wireless.title')} description={t('settings.playback.wireless.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.playback.followCurrent.title')} description={t('settings.playback.followCurrent.description')}>
                <ToggleButton
                  active={appSettings?.playbackFollowCurrentTrack ?? false}
                  disabled={!appSettings}
                  onClick={() => patchAppSettings({ playbackFollowCurrentTrack: !(appSettings?.playbackFollowCurrentTrack ?? false) })}
                />
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--audio-status"
                id="settings-row-audio-status"
                highlighted={highlightedSettingId === 'settings-row-audio-status'}
                title={t('settings.playback.audioStatus.title')}
                description={t('settings.playback.audioStatus.description')}
              >
                <div className="settings-status-grid settings-status-grid--audio">
                  {statusRows(status, formatBool).map((row) => (
                    <span key={row.label}>
                      <em>{row.label}</em>
                      <strong>{row.value}</strong>
                    </span>
                  ))}
                </div>
              </SettingRow>
              {error ? <p className="settings-inline-error">{error}</p> : null}
              {status?.warnings.length ? (
                <p className="settings-inline-error">warnings: {status.warnings.join(', ')}</p>
              ) : null}
              <PlaybackStabilityDiagnosticsPanel />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Keyboard} id="shortcuts" title={t('settings.nav.shortcuts.label')}>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title={t('settings.shortcuts.title')}
                description={t('settings.shortcuts.description')}
              >
                <div className="settings-shortcut-toolbar">
                  <button className="settings-action-button" type="button" disabled={!appSettings} onClick={handleShortcutRecommendedReset}>
                    {t('settings.shortcuts.action.restoreRecommended')}
                  </button>
                  <p className="settings-inline-note">{t('settings.shortcuts.note')}</p>
                </div>
              </SettingRow>
              {globalShortcutActionMeta.map((item) => {
                const binding = globalShortcuts[item.action];
                const isRecording = recordingShortcutAction === item.action;
                const message = shortcutMessages[item.action] ?? null;

                return (
                  <SettingRow
                    className="setting-row--shortcut"
                    key={item.action}
                    title={t(item.titleKey)}
                    description={t(item.descriptionKey)}
                  >
                    <div className="settings-shortcut-control">
                      <button
                        className={`settings-shortcut-key ${isRecording ? 'is-recording' : ''}`}
                        type="button"
                        disabled={!appSettings}
                        onClick={() => setRecordingShortcutAction(item.action)}
                      >
                        {isRecording
                          ? t('settings.shortcuts.recording')
                          : formatAcceleratorForDisplay(binding.accelerator, t('settings.shortcuts.empty'))}
                      </button>
                      <div className="settings-chip-row settings-chip-row--actions">
                        <button
                          className="settings-action-button"
                          type="button"
                          disabled={!appSettings}
                          onClick={() => setRecordingShortcutAction(item.action)}
                        >
                          {t('settings.shortcuts.action.record')}
                        </button>
                        <button
                          className="settings-action-button"
                          type="button"
                          disabled={!appSettings || !binding.accelerator}
                          onClick={() => handleShortcutClear(item.action)}
                        >
                          {t('settings.shortcuts.action.clear')}
                        </button>
                        <ToggleButton
                          active={binding.enabled}
                          disabled={!appSettings || !binding.accelerator}
                          onClick={() => void handleShortcutToggle(item.action)}
                        />
                      </div>
                      {message ? <p className="settings-inline-error">{message}</p> : null}
                    </div>
                  </SettingRow>
                );
              })}
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Captions} id="lyrics" title={t('route.lyricsSettings.label')}>
              <LyricsSettingsPanel className="settings-lyrics-panel" variant="settings" />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Clapperboard} id="mv" title={t('route.mvSettings.label')}>
              <SettingRow title={t('route.mvSettings.label')} description={t('route.mvSettings.description')}>
                <div className="settings-chip-row">
                  <StatusText tone={(appSettings?.mvEnabled ?? true) ? 'good' : 'muted'}>
                    {(appSettings?.mvEnabled ?? true) ? t('mvSettings.status.on') : t('mvSettings.status.off')}
                  </StatusText>
                  <ToggleButton
                    active={appSettings?.mvEnabled ?? true}
                    disabled={!appSettings}
                    onClick={() => patchMvSettings({ enabled: !(appSettings?.mvEnabled ?? true) })}
                  />
                </div>
              </SettingRow>
              <SettingRow title={t('mvSettings.network.maxQuality')} description={t('mvSettings.aria.maxQuality', { quality: mvQualityLabels[appSettings?.mvMaxQuality ?? 'max'] })}>
                <div className="settings-chip-row">
                  {mvQualityCaps.map((quality) => (
                    <ChipButton
                      active={(appSettings?.mvMaxQuality ?? 'max') === quality}
                      key={quality}
                      onClick={() => patchMvSettings({ maxQuality: quality })}
                    >
                      {mvQualityLabels[quality]}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title={t('mvSettings.network.title')}
                description={t('mvSettings.network.autoApplyThresholdDescription', { threshold: formatMvThreshold(appSettings?.mvAutoApplyThreshold) })}
              >
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>{t('mvSettings.network.autoApply')}</span>
                      <ToggleButton
                        active={appSettings?.mvAutoSearch ?? true}
                        disabled={!appSettings}
                        onClick={() => patchMvSettings({ autoSearch: !(appSettings?.mvAutoSearch ?? true) })}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>{t('mvSettings.network.autoPreload')}</span>
                      <ToggleButton
                        active={appSettings?.mvAutoPreload ?? true}
                        disabled={!appSettings}
                        onClick={() => patchMvSettings({ autoPreload: !(appSettings?.mvAutoPreload ?? true) })}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>{t('mvSettings.network.restartAudioOnLoad')}</span>
                      <ToggleButton
                        active={appSettings?.mvRestartAudioOnLoad === true}
                        disabled={!appSettings}
                        onClick={() => patchMvSettings({ restartAudioOnLoad: !(appSettings?.mvRestartAudioOnLoad === true) })}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>{t('mvSettings.network.replayAudioOnChange')}</span>
                      <ToggleButton
                        active={appSettings?.mvReplayAudioOnChange !== false}
                        disabled={!appSettings}
                        onClick={() => patchMvSettings({ replayAudioOnChange: !(appSettings?.mvReplayAudioOnChange !== false) })}
                      />
                    </div>
                  </div>
                  <div className="settings-wallpaper-control">
                    <span>{t('mvSettings.network.autoApplyThreshold')}</span>
                    <NumberRangeField
                      min={30}
                      max={100}
                      step={1}
                      suffix="%"
                      value={Math.round((appSettings?.mvAutoApplyThreshold ?? 0.7) * 100)}
                      onChange={(value) => patchMvSettings({ autoApplyThreshold: mvThresholdFromPercent(value) })}
                    />
                  </div>
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    {mvProviderOrder.map((provider, index) => (
                      <div className="settings-inline-toggle" key={provider}>
                        <span>{`${index + 1}. ${mvProviderLabels[provider]}`}</span>
                        <ToggleButton
                          active={mvEnabledProviders.has(provider)}
                          disabled={!appSettings}
                          onClick={() => handleMvProviderToggle(provider)}
                        />
                        <button
                          className="settings-icon-button"
                          type="button"
                          aria-label={`Move ${mvProviderLabels[provider]} up`}
                          disabled={!appSettings || index === 0}
                          onClick={() => handleMvProviderMove(provider, -1)}
                        >
                          <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button
                          className="settings-icon-button"
                          type="button"
                          aria-label={`Move ${mvProviderLabels[provider]} down`}
                          disabled={!appSettings || index === mvProviderOrder.length - 1}
                          onClick={() => handleMvProviderMove(provider, 1)}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title={t('mvSettings.immersive.title')}
                description={t('mvSettings.immersive.description')}
              >
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>{t('mvSettings.immersive.title')}</span>
                      <ToggleButton
                        active={appSettings?.mvImmersiveBackground !== false}
                        disabled={!appSettings}
                        onClick={() => patchMvSettings({ immersiveBackground: !(appSettings?.mvImmersiveBackground !== false) })}
                      />
                    </div>
                    <button className="settings-action-button" type="button" disabled={!appSettings} onClick={() => patchMvSettings(mvImmersiveBackgroundDefaults)}>
                      <RotateCw size={15} />
                      {t('mvSettings.immersive.reset')}
                    </button>
                  </div>
                  <div className="settings-wallpaper-control">
                    <span>{t('mvSettings.immersive.zoom')}</span>
                    <NumberRangeField
                      min={100}
                      max={220}
                      step={1}
                      suffix="%"
                      value={appSettings?.mvImmersiveBackgroundScalePercent ?? 115}
                      onChange={(value) => patchMvSettings({ immersiveBackgroundScalePercent: value })}
                    />
                  </div>
                  <div className="settings-wallpaper-control">
                    <span>{t('mvSettings.immersive.blur')}</span>
                    <NumberRangeField
                      min={0}
                      max={32}
                      step={1}
                      suffix="px"
                      value={appSettings?.mvImmersiveBackgroundBlurPx ?? 0}
                      onChange={(value) => patchMvSettings({ immersiveBackgroundBlurPx: value })}
                    />
                  </div>
                  <div className="settings-wallpaper-control">
                    <span>{t('mvSettings.immersive.brightness')}</span>
                    <NumberRangeField
                      min={60}
                      max={140}
                      step={1}
                      suffix="%"
                      value={appSettings?.mvImmersiveBackgroundBrightnessPercent ?? 100}
                      onChange={(value) => patchMvSettings({ immersiveBackgroundBrightnessPercent: value })}
                    />
                  </div>
                  <div className="settings-wallpaper-control">
                    <span>{t('mvSettings.immersive.overlay')}</span>
                    <NumberRangeField
                      min={0}
                      max={100}
                      step={1}
                      suffix="%"
                      value={appSettings?.mvImmersiveBackgroundOverlayOpacityPercent ?? 0}
                      onChange={(value) => patchMvSettings({ immersiveBackgroundOverlayOpacityPercent: value })}
                    />
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <em>{t('mvSettings.immersive.zoom')}</em>
                      <strong>{formatMvPercent(appSettings?.mvImmersiveBackgroundScalePercent, 115)}</strong>
                    </span>
                    <span>
                      <em>{t('mvSettings.immersive.blur')}</em>
                      <strong>{appSettings?.mvImmersiveBackgroundBlurPx ?? 0}px</strong>
                    </span>
                    <span>
                      <em>{t('mvSettings.immersive.brightness')}</em>
                      <strong>{formatMvPercent(appSettings?.mvImmersiveBackgroundBrightnessPercent, 100)}</strong>
                    </span>
                    <span>
                      <em>{t('mvSettings.immersive.overlay')}</em>
                      <strong>{formatMvPercent(appSettings?.mvImmersiveBackgroundOverlayOpacityPercent, 0)}</strong>
                    </span>
                  </div>
                </div>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Link2} id="integrations" title={t('settings.nav.integrations.label')}>
              <SettingRow
                id="settings-row-discord-presence"
                highlighted={highlightedSettingId === 'settings-row-discord-presence'}
                title={t('settings.integrations.discord.title')}
                description={t('settings.integrations.discord.description')}
              >
                <div className="settings-chip-row">
                  <StatusText tone={discordPresenceStatus?.enabled ? 'good' : 'muted'}>{discordPresenceLabel}</StatusText>
                  <button className="settings-action-button" type="button" onClick={() => void refreshDiscordPresenceStatus()}>
                    {t('settings.integrations.discord.action.refresh')}
                  </button>
                  <ToggleButton
                    active={discordPresenceStatus?.enabled ?? appSettings?.discordRichPresenceEnabled ?? false}
                    disabled={!appSettings}
                    onClick={() => void handleDiscordPresenceToggle()}
                  />
                </div>
              </SettingRow>
              <SettingRow
                id="settings-row-smtc"
                highlighted={highlightedSettingId === 'settings-row-smtc'}
                title={t('settings.integrations.smtc.title')}
                description={t('settings.integrations.smtc.description')}
              >
                <ToggleButton
                  active={appSettings?.smtcEnabled ?? true}
                  disabled={!appSettings}
                  onClick={() => patchAppSettings({ smtcEnabled: !(appSettings?.smtcEnabled ?? true) })}
                />
              </SettingRow>
              <SettingRow
                id="settings-row-lastfm"
                highlighted={highlightedSettingId === 'settings-row-lastfm'}
                title={t('settings.integrations.lastfm.title')}
                description={t('settings.integrations.lastfm.description')}
              >
                <div className="settings-chip-row">
                  <StatusText tone={lastFmStatus?.enabled ? 'good' : 'muted'}>{lastFmLabel}</StatusText>
                  <ToggleButton active={lastFmStatus?.enabled ?? appSettings?.lastFmEnabled ?? false} disabled={!appSettings} onClick={() => void handleLastFmToggle()} />
                </div>
              </SettingRow>
              <SettingRow className="setting-row--full" title={t('settings.integrations.lastfm.connection.title')} description={t('settings.integrations.lastfm.connection.description')}>
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left">
                    <button className="settings-action-button" type="button" onClick={() => void handleLastFmConnect()}>
                      {t('settings.integrations.lastfm.action.connect')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleLastFmCompleteAuth()}>
                      {t('settings.integrations.lastfm.action.completeAuth')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void refreshLastFmStatus()}>
                      {t('settings.integrations.lastfm.action.refresh')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleLastFmDisconnect()} disabled={!lastFmStatus?.connected}>
                      {t('settings.integrations.lastfm.action.disconnect')}
                    </button>
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <em>{t('settings.integrations.lastfm.lastNowPlaying')}</em>
                      <strong>{formatLastFmTimestamp(lastFmStatus?.lastNowPlayingAt)}</strong>
                    </span>
                    <span>
                      <em>{t('settings.integrations.lastfm.lastScrobble')}</em>
                      <strong>{formatLastFmTimestamp(lastFmStatus?.lastScrobbleAt)}</strong>
                    </span>
                    <span>
                      <em>{t('settings.integrations.lastfm.activeTrack')}</em>
                      <strong title={lastFmActiveLabel}>{lastFmActiveLabel}</strong>
                    </span>
                    <span>
                      <em>{t('settings.integrations.lastfm.statusLabel')}</em>
                      <strong>{lastFmLabel}</strong>
                    </span>
                  </div>
                </div>
              </SettingRow>
              <SettingRow title={t('settings.integrations.lastfm.nowPlaying.title')} description={t('settings.integrations.lastfm.nowPlaying.description')}>
                <ToggleButton active={lastFmStatus?.nowPlayingEnabled ?? true} disabled={!lastFmStatus} onClick={() => void handleLastFmNowPlayingToggle()} />
              </SettingRow>
              <SettingRow title={t('settings.integrations.lastfm.scrobbling.title')} description={t('settings.integrations.lastfm.scrobbling.description')}>
                <ToggleButton active={lastFmStatus?.scrobbleEnabled ?? true} disabled={!lastFmStatus} onClick={() => void handleLastFmScrobbleToggle()} />
              </SettingRow>
              <SettingRow
                id="settings-row-account-startup-refresh"
                highlighted={highlightedSettingId === 'settings-row-account-startup-refresh'}
                title="启动时刷新账号登录状态"
                description="仅检查以前登录过的账号，从未登录过的平台会保持静默。"
              >
                <ToggleButton
                  active={appSettings?.autoAccountCheckOnStartup ?? true}
                  disabled={!appSettings}
                  onClick={() => patchAppSettings({ autoAccountCheckOnStartup: !(appSettings?.autoAccountCheckOnStartup ?? true) })}
                />
              </SettingRow>
              <SettingRow title="Spotify 自动启动官方播放器" description="播放 Spotify 时，如果 ECHO 内置 SDK 因 DRM 不可用，会自动打开 Spotify 桌面端或网页版并接管 Connect 设备。">
                <ToggleButton
                  active={appSettings?.spotifyAutoLaunchOfficialPlayer ?? true}
                  disabled={!appSettings}
                  onClick={() => patchAppSettings({ spotifyAutoLaunchOfficialPlayer: !(appSettings?.spotifyAutoLaunchOfficialPlayer ?? true) })}
                />
              </SettingRow>
              <div className="settings-account-panel">
                <header className="settings-account-panel-header">
                  <div>
                    <h3>账号登录</h3>
                    <p>保存平台登录状态，供后续歌词、元数据、MV、下载和流媒体接入使用。</p>
                  </div>
                  <button className="settings-action-button" type="button" onClick={() => void refreshAccountStatuses()}>
                    刷新全部
                  </button>
                </header>
                <div className="settings-account-list">
                  {cookieAccountProviders.map((provider) => (
                    <AccountCookieCard
                      key={provider}
                      provider={provider}
                      status={accountStatusByProvider[provider]}
                      cookieValue={accountCookies[provider]}
                      busyAction={accountBusy[provider]}
                      error={accountErrors[provider]}
                      message={accountMessages[provider]}
                      onChangeCookie={(value) => setAccountCookies((current) => ({ ...current, [provider]: value }))}
                      onSave={() => void handleAccountSaveCookie(provider)}
                      onCheck={() => void handleAccountCheck(provider)}
                      onOpenLogin={() => void handleAccountOpenLogin(provider)}
                      onClear={() => void handleAccountClear(provider)}
                    />
                  ))}
                  <YouTubeAccountCard
                    status={accountStatusByProvider.youtube}
                    browser={youtubeBrowser}
                    busyAction={accountBusy.youtube}
                    error={accountErrors.youtube}
                    message={accountMessages.youtube}
                    onBrowserChange={(browser) => void handleYouTubeBrowserChange(browser)}
                    onCheck={() => void handleAccountCheck('youtube')}
                    onOpenLogin={() => void handleAccountOpenLogin('youtube')}
                    onClear={() => void handleAccountClear('youtube')}
                  />
                  <SpotifyAccountCard
                    status={accountStatusByProvider.spotify}
                    busyAction={accountBusy.spotify}
                    error={accountErrors.spotify}
                    message={accountMessages.spotify}
                    onCheck={() => void handleAccountCheck('spotify')}
                    onOpenLogin={() => void handleAccountOpenLogin('spotify')}
                    onClear={() => void handleAccountClear('spotify')}
                  />
                </div>
              </div>
              <SettingRow title={t('settings.integrations.mobile.title')} description={t('settings.integrations.mobile.description')}>
                <ToggleButton />
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Globe2} id="remote" title={t('settings.nav.remote.label')}>
              <RemoteSourcesPanel />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={SlidersHorizontal} id="eq" title={t('settings.nav.eq.label')}>
              <EqPanel audioStatus={status} onAudioStatusRefresh={refreshStatus} />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Palette} id="appearance" title={t('settings.nav.appearance.label')}>
              <SettingRow
                id="settings-row-theme"
                highlighted={highlightedSettingId === 'settings-row-theme'}
                title={t('settings.appearance.theme.title')}
                description={t('settings.appearance.theme.description')}
              >
                <div className="settings-chip-row">
                  {themeModeOptions.map((option) => (
                    <ChipButton
                      active={(appSettings?.appearanceTheme ?? defaultThemeMode) === option.mode}
                      key={option.mode}
                      onClick={() => handleThemeModeChange(option.mode)}
                    >
                      {t(option.labelKey)}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--theme-presets"
                title={t('settings.appearance.themePreset.title')}
                description={t('settings.appearance.themePreset.description')}
              >
                <div className="settings-theme-preset-grid">
                  {themePresetOptions.map((option) => {
                    const activePreset = selectedThemePreset;
                    const isActive = activePreset === option.preset;

                    return (
                      <button
                        aria-pressed={isActive}
                        className={`settings-theme-preset-card${isActive ? ' active' : ''}`}
                        key={option.preset}
                        onClick={() => handleThemePresetChange(option.preset)}
                        title={t(option.descriptionKey)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="settings-theme-preset-preview"
                          style={{ background: option.preview } as CSSProperties}
                        >
                          {isActive ? <Check size={16} /> : null}
                        </span>
                        <span className="settings-theme-preset-copy">
                          <strong>{t(option.labelKey)}</strong>
                          <em>{t(option.descriptionKey)}</em>
                        </span>
                        <span aria-hidden="true" className="settings-theme-preset-swatches">
                          {option.swatches.map((swatch) => (
                            <span key={swatch} style={{ background: swatch } as CSSProperties} />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--theme-custom"
                title={t('settings.appearance.themeCustom.title')}
                description={t('settings.appearance.themeCustom.description')}
              >
                <div className="settings-theme-custom-panel">
                  <div className="settings-theme-custom-header">
                    <div className="settings-theme-custom-heading">
                      <span>{t('settings.appearance.themeCustom.preview.title')}</span>
                      <strong>{t(selectedThemePresetOption.labelKey)}</strong>
                      <em>{t('settings.appearance.themeCustom.preview.description')}</em>
                    </div>
                    <div className="settings-theme-custom-toolbar">
                      <div className="settings-chip-row settings-chip-row--left">
                        <ChipButton active={themeCustomTone === 'light'} onClick={() => setThemeCustomTone('light')}>
                          {t('settings.appearance.theme.light')}
                        </ChipButton>
                        <ChipButton active={themeCustomTone === 'dark'} onClick={() => setThemeCustomTone('dark')}>
                          {t('settings.appearance.theme.dark')}
                        </ChipButton>
                      </div>
                      <div className="settings-theme-custom-preview" aria-hidden="true" style={{ background: themeCustomGradientPreview }}>
                        <span style={{ background: themeCustomValues.accent }} />
                        <span style={{ background: themeCustomValues.accentStrong }} />
                        <span style={{ background: themeCustomValues.secondary }} />
                        <strong style={{ background: themeCustomValues.accent, color: themeCustomValues.onAccent }}>Aa</strong>
                      </div>
                    </div>
                  </div>

                  <div className="settings-theme-custom-section">
                    <div className="settings-theme-custom-section-title">
                      <strong>{t('settings.appearance.themeCustom.group.core')}</strong>
                      <span>{t('settings.appearance.themeCustom.group.core.description')}</span>
                    </div>
                    <div className="settings-theme-custom-card-grid">
                      {coreThemeColorFields.map((option) => (
                        <label className="settings-theme-custom-color-card" key={option.field}>
                          <span className="settings-theme-custom-color-copy">
                            <strong>{t(option.labelKey)}</strong>
                            <em>{t(option.descriptionKey)}</em>
                          </span>
                          <span className="settings-theme-custom-color-control">
                            <code>{themeCustomValues[option.field].toUpperCase()}</code>
                            <input
                              aria-label={t(option.labelKey)}
                              type="color"
                              value={themeCustomValues[option.field]}
                              onChange={(event) => updateThemeCustomColor(option.field, event.currentTarget.value)}
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="settings-theme-custom-section settings-theme-custom-section--gradient">
                    <div className="settings-theme-custom-section-title">
                      <strong>{t('settings.appearance.themeCustom.group.gradient')}</strong>
                      <span>{t('settings.appearance.themeCustom.group.gradient.description')}</span>
                    </div>
                    <div className="settings-theme-custom-gradient-card" style={{ background: themeCustomGradientPreview }}>
                      {gradientThemeColorFields.map((option) => (
                        <label className="settings-theme-custom-color-card settings-theme-custom-color-card--compact" key={option.field}>
                          <span className="settings-theme-custom-color-copy">
                            <strong>{t(option.labelKey)}</strong>
                            <em>{t(option.descriptionKey)}</em>
                          </span>
                          <span className="settings-theme-custom-color-control">
                            <code>{themeCustomValues[option.field].toUpperCase()}</code>
                            <input
                              aria-label={t(option.labelKey)}
                              type="color"
                              value={themeCustomValues[option.field]}
                              onChange={(event) => updateThemeCustomColor(option.field, event.currentTarget.value)}
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="settings-theme-custom-sliders">
                    {percentThemeFields.map((option) => (
                      <label className="settings-theme-custom-slider" key={option.field}>
                        <span>
                          <em>
                            <strong>{t(option.labelKey)}</strong>
                            {t(option.descriptionKey)}
                          </em>
                          <strong>{themeCustomValues[option.field]}%</strong>
                        </span>
                        <input
                          aria-label={t(option.labelKey)}
                          min={option.min}
                          max={option.max}
                          type="range"
                          value={themeCustomValues[option.field]}
                          onChange={(event) => updateThemeCustomPercent(option.field, Number(event.currentTarget.value))}
                        />
                      </label>
                    ))}
                  </div>

                  <button className="settings-theme-custom-advanced-toggle" type="button" onClick={() => setThemeCustomAdvancedOpen((current) => !current)}>
                    <SlidersHorizontal size={15} />
                    {themeCustomAdvancedOpen ? t('settings.appearance.themeCustom.advanced.hide') : t('settings.appearance.themeCustom.advanced.show')}
                  </button>

                  {themeCustomAdvancedOpen ? (
                    <div className="settings-theme-custom-section">
                      <div className="settings-theme-custom-section-title">
                        <strong>{t('settings.appearance.themeCustom.group.advanced')}</strong>
                        <span>{t('settings.appearance.themeCustom.group.advanced.description')}</span>
                      </div>
                      <div className="settings-theme-custom-card-grid settings-theme-custom-card-grid--advanced">
                        {advancedThemeColorFields.map((option) => (
                          <label className="settings-theme-custom-color-card" key={option.field}>
                            <span className="settings-theme-custom-color-copy">
                              <strong>{t(option.labelKey)}</strong>
                              <em>{t(option.descriptionKey)}</em>
                            </span>
                            <span className="settings-theme-custom-color-control">
                              <code>{themeCustomValues[option.field].toUpperCase()}</code>
                              <input
                                aria-label={t(option.labelKey)}
                                type="color"
                                value={themeCustomValues[option.field]}
                                onChange={(event) => updateThemeCustomColor(option.field, event.currentTarget.value)}
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {themeCustomWarnings.length > 0 ? (
                    <p className="settings-theme-custom-warning">{t('settings.appearance.themeCustom.message.lowContrast')}</p>
                  ) : null}
                  {themeCustomMessage ? <p className="settings-theme-custom-message">{themeCustomMessage}</p> : null}

                  <div className="settings-theme-custom-actions">
                    <button className="settings-action-button" type="button" onClick={handleThemeCustomAutoFix}>
                      <Palette size={15} />
                      {t('settings.appearance.themeCustom.action.autoFix')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={handleThemeCustomSave} disabled={themeCustomWarnings.length > 0}>
                      <Save size={15} />
                      {t('settings.appearance.themeCustom.action.save')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={handleThemeCustomExport}>
                      <Download size={15} />
                      {t('settings.appearance.themeCustom.action.export')}
                    </button>
                    <button className="settings-action-button" type="button" onClick={handleThemeCustomImport}>
                      <FolderOpen size={15} />
                      {t('settings.appearance.themeCustom.action.import')}
                    </button>
                    <button className="settings-danger-button" type="button" onClick={handleThemeCustomReset}>
                      <RotateCw size={15} />
                      {t('settings.appearance.themeCustom.action.reset')}
                    </button>
                  </div>
                </div>
              </SettingRow>
              <SettingRow title={t('settings.appearance.density.title')} description={t('settings.appearance.density.description')}>
                <div className="settings-chip-row">
                  <ChipButton active>{t('settings.appearance.density.compact')}</ChipButton>
                  <ChipButton>{t('settings.appearance.density.standard')}</ChipButton>
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                id="settings-row-wallpaper"
                highlighted={highlightedSettingId === 'settings-row-wallpaper'}
                title="自定义壁纸"
                description="保存原图文件，不压缩、不转码；默认完整显示不裁切。"
              >
                {appSettings?.appCustomWallpaperPath ? (
                  <div className="settings-cache-panel settings-cache-panel--app-wallpaper">
                    <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                      <button className="settings-action-button" type="button" disabled={!appSettings} onClick={() => void handleAppWallpaperChoose()}>
                        <FolderOpen size={15} />
                        选择壁纸
                      </button>
                      <button className="settings-danger-button" type="button" onClick={handleAppWallpaperClear}>
                        <Trash2 size={15} />
                        清除壁纸
                      </button>
                    </div>
                    <p className="settings-wallpaper-path" title={appSettings.appCustomWallpaperPath}>
                      {appSettings.appCustomWallpaperPath}
                    </p>
                    <div className="settings-wallpaper-controls">
                        <div className="settings-wallpaper-control">
                          <span>壁纸缩放</span>
                          <NumberRangeField
                            min={100}
                            max={220}
                            step={1}
                            suffix="%"
                            value={appSettings.appWallpaperScalePercent ?? 100}
                            onChange={(appWallpaperScalePercent) => previewAndPersistAppWallpaperSettings({ appWallpaperScalePercent })}
                          />
                        </div>
                        <div className="settings-wallpaper-control">
                          <span>壁纸模糊度</span>
                          <NumberRangeField
                            min={0}
                            max={40}
                            step={1}
                            suffix="px"
                            value={appSettings.appWallpaperBlurPx ?? 0}
                            onChange={(appWallpaperBlurPx) => previewAndPersistAppWallpaperSettings({ appWallpaperBlurPx })}
                          />
                        </div>
                        <div className="settings-wallpaper-control">
                          <span>壁纸亮度</span>
                          <NumberRangeField
                            min={40}
                            max={140}
                            step={1}
                            suffix="%"
                            value={appSettings.appWallpaperBrightnessPercent ?? 100}
                            onChange={(appWallpaperBrightnessPercent) => previewAndPersistAppWallpaperSettings({ appWallpaperBrightnessPercent })}
                          />
                        </div>
                        <div className="settings-wallpaper-control">
                          <span>UI 透明度</span>
                          <NumberRangeField
                            min={0}
                            max={100}
                            step={1}
                            suffix="%"
                            value={appSettings.appWallpaperUiOpacityPercent ?? 100}
                            onChange={(appWallpaperUiOpacityPercent) => previewAndPersistAppWallpaperSettings({ appWallpaperUiOpacityPercent })}
                          />
                        </div>
                        <div className="settings-wallpaper-control settings-wallpaper-control--toggle">
                          <span>可视化保护</span>
                          <ToggleButton
                            active={appSettings.appWallpaperVisualProtectionEnabled !== false}
                            onClick={() =>
                              previewAndPersistAppWallpaperSettings({
                                appWallpaperVisualProtectionEnabled: !(appSettings.appWallpaperVisualProtectionEnabled !== false),
                              })
                            }
                          />
                        </div>
                        <div className="settings-wallpaper-control settings-wallpaper-control--toggle">
                          <span>统一透明度</span>
                          <ToggleButton
                            active={appSettings.appWallpaperUnifiedOpacityEnabled ?? false}
                            onClick={() =>
                              previewAndPersistAppWallpaperSettings({
                                appWallpaperUnifiedOpacityEnabled: !(appSettings.appWallpaperUnifiedOpacityEnabled ?? false),
                              })
                            }
                          />
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions settings-wallpaper-empty-actions">
                    <button className="settings-action-button" type="button" disabled={!appSettings} onClick={() => void handleAppWallpaperChoose()}>
                      <FolderOpen size={15} />
                      选择壁纸
                    </button>
                  </div>
                )}
              </SettingRow>
              <SettingRow title={t('settings.appearance.font.main.title')} description={t('settings.appearance.font.main.description')}>
                <button className="settings-font-picker-button" type="button" onClick={() => handleFontPickerOpen('main')}>
                  <span style={{ fontFamily: `"${appearancePreferences.mainFontFamily}", var(--echo-font-family)` }}>{appearancePreferences.mainFontFamily}</span>
                  <em>{t('settings.appearance.font.choose')}</em>
                </button>
              </SettingRow>
              <SettingRow title={t('settings.appearance.font.chinese.title')} description={t('settings.appearance.font.chinese.description')}>
                <button className="settings-font-picker-button" type="button" onClick={() => handleFontPickerOpen('chinese')}>
                  <span style={{ fontFamily: `"${appearancePreferences.chineseFontFamily}", var(--echo-font-family)` }}>
                    {appearancePreferences.chineseFontFamily}
                  </span>
                  <em>{t('settings.appearance.font.choose')}</em>
                </button>
              </SettingRow>
              <SettingRow title={t('settings.appearance.fontSize.title')} description={t('settings.appearance.fontSize.description')}>
                <NumberRangeField
                  min={12}
                  max={18}
                  step={1}
                  suffix="px"
                  value={appearancePreferences.baseFontSize}
                  onChange={(baseFontSize) => handleAppearanceChange({ ...appearancePreferences, baseFontSize })}
                />
              </SettingRow>
              <SettingRow title={t('settings.appearance.lineHeight.title')} description={t('settings.appearance.lineHeight.description')}>
                <NumberRangeField
                  min={1.1}
                  max={1.8}
                  step={0.05}
                  suffix=""
                  value={appearancePreferences.lineHeight}
                  onChange={(lineHeight) => handleAppearanceChange({ ...appearancePreferences, lineHeight })}
                />
              </SettingRow>
              <SettingRow title={t('settings.appearance.textDepth.title')} description={t('settings.appearance.textDepth.description')}>
                <NumberRangeField
                  min={35}
                  max={100}
                  step={1}
                  suffix="%"
                  value={appearancePreferences.textDepth}
                  onChange={(textDepth) => handleAppearanceChange({ ...appearancePreferences, textDepth })}
                />
              </SettingRow>
              <SettingRow title={t('settings.appearance.reset.title')} description={t('settings.appearance.reset.description')}>
                <button className="settings-action-button" type="button" onClick={handleAppearanceReset}>
                  {t('settings.appearance.reset.action')}
                </button>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Download} id="library" title={t('settings.nav.library.label')}>
              <div id="settings-row-library-folders" data-search-highlight={highlightedSettingId === 'settings-row-library-folders' ? 'true' : undefined}>
                <LibraryFoldersPanel />
              </div>
              <SettingRow
                id="settings-row-artist-wall-artwork"
                highlighted={highlightedSettingId === 'settings-row-artist-wall-artwork'}
                title="艺术家墙封面"
                description="用艺术家的一张专辑封面替代字母占位。"
              >
                <ToggleButton active={appSettings?.artistWallAlbumArtwork ?? false} disabled={!appSettings} onClick={handleArtistWallAlbumArtworkToggle} />
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                id="settings-row-artist-avatars"
                highlighted={highlightedSettingId === 'settings-row-artist-avatars'}
                title={t('settings.appearance.artistAvatars.title')}
                description={t('settings.appearance.artistAvatars.description')}
              >
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>{t('settings.appearance.artistAvatars.toggle')}</span>
                      <ToggleButton
                        active={appSettings?.autoFetchArtistImages ?? false}
                        disabled={!appSettings || artistImageBusyAction !== null}
                        onClick={handleAutoFetchArtistImagesToggle}
                      />
                    </div>
                    <div className="settings-inline-toggle">
                      <span>{t('settings.appearance.artistAvatars.fallback')}</span>
                      <ToggleButton
                        active={appSettings?.artistWallAlbumFallbackForMissingAvatars ?? false}
                        disabled={!appSettings}
                        onClick={handleArtistWallAlbumFallbackForMissingAvatarsToggle}
                      />
                    </div>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={!appSettings?.autoFetchArtistImages || artistImageBusyAction !== null}
                      onClick={() => void handleRefreshMissingArtistImages()}
                    >
                      <RotateCw className={artistImageBusyAction === 'refresh' ? 'spinning-icon' : undefined} size={15} />
                      {artistImageBusyAction === 'refresh'
                        ? t('settings.appearance.artistAvatars.action.queueing')
                        : t('settings.appearance.artistAvatars.action.refreshMissing')}
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={!appSettings?.autoFetchArtistImages || artistImageBusyAction !== null}
                      onClick={() => void handleArtistImagePauseToggle()}
                    >
                      {artistImagePaused ? <Play size={15} /> : <Pause size={15} />}
                      {artistImagePaused ? '继续获取' : '暂停获取'}
                    </button>
                    <button
                      className="settings-danger-button"
                      type="button"
                      disabled={artistImageBusyAction !== null}
                      onClick={() => void handleClearArtistImageCache()}
                    >
                      <Trash2 size={15} />
                      {t('settings.appearance.artistAvatars.action.clear')}
                    </button>
                  </div>
                  {artistImageMessage ? <p className="settings-inline-note">{artistImageMessage}</p> : null}
                  {artistImageProgress ? (
                    <div className="settings-update-progress settings-artist-image-progress" role="status" aria-live="polite">
                      <div className="settings-update-progress-label">
                        <strong>头像获取进度 · {artistImageStatusLabel}</strong>
                        <span>
                          {artistImageProgressDone} / {artistImageProgressTotal}
                        </span>
                      </div>
                      <div
                        className="settings-update-progress-track"
                        role="progressbar"
                        aria-label="头像获取进度"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={artistImageProgressPercent}
                      >
                        <span style={{ width: `${artistImageProgressPercent}%` }} />
                      </div>
                      <div className="settings-update-progress-meta">
                        <span>
                          处理中 {artistImageActive} · 待处理 {artistImageSummary.pending} · 已缓存 {artistImageSummary.matched} · 未找到 {artistImageSummary.notFound} · 失败 {artistImageFailed}
                        </span>
                        <span>跳过 {artistImageProgress.lastQueued.skipped}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="下载路径"
                description="选择下载音频保存目录，下载页会同步使用这个位置。"
              >
                <div className="settings-cache-panel settings-cache-panel--download">
                  <div className="settings-cache-path">
                    <em>当前下载文件夹</em>
                    <strong title={currentDownloadDirectoryLabel}>{currentDownloadDirectoryLabel}</strong>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left">
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleDownloadDirectoryChoose()}
                      disabled={downloadDirectoryBusy}
                    >
                      <FolderOpen size={15} />
                      {downloadSettings?.outputDirectory ? '更换文件夹' : '选择文件夹'}
                    </button>
                  </div>
                  {downloadDirectoryMessage ? <p className="settings-inline-note">{downloadDirectoryMessage}</p> : null}
                </div>
              </SettingRow>
              <SettingRow
                title="歌单自动备份"
                description="开启后，刷新、清空或删除歌单前会先在系统下载文件夹保存一份 JSON 备份。"
              >
                <div className="settings-inline-toggle">
                  <span>{appSettings?.playlistBackupsEnabled === false ? '已关闭' : '已开启'}</span>
                  <ToggleButton
                    active={appSettings?.playlistBackupsEnabled ?? true}
                    disabled={!appSettings}
                    onClick={() => patchAppSettings({ playlistBackupsEnabled: !(appSettings?.playlistBackupsEnabled ?? true) })}
                  />
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="重复歌曲"
                description="在歌曲列表中隐藏低音质重复版本，不会删除文件。"
              >
                <div className="settings-cache-panel settings-cache-panel--duplicates">
                  <div className="settings-status-grid">
                    <span>
                      <em>隐藏状态</em>
                      <strong>{appSettings?.duplicateTracksEnabled ? `已开启，隐藏 ${duplicateSummary?.hiddenTracks ?? 0} 首` : '未开启'}</strong>
                    </span>
                    <span>
                      <em>分析结果</em>
                      <strong>{duplicateSummary ? `${duplicateSummary.duplicateGroups} 组 / ${duplicateSummary.duplicateMembers} 首候选` : '尚未读取'}</strong>
                    </span>
                    <span>
                      <em>更新时间</em>
                      <strong>{duplicateSummary?.updatedAt ? new Date(duplicateSummary.updatedAt).toLocaleString() : '尚未分析'}</strong>
                    </span>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>隐藏重复歌曲</span>
                      <ToggleButton
                        active={appSettings?.duplicateTracksEnabled ?? false}
                        disabled={!appSettings || duplicateBusyAction !== null}
                        onClick={() => void handleDuplicateVisibilityToggle()}
                      />
                    </div>
                    <button className="settings-action-button" type="button" disabled={duplicateBusyAction !== null} onClick={() => void handleAnalyzeDuplicateTracks()}>
                      <RotateCw className={duplicateBusyAction === 'analyze' ? 'spinning-icon' : undefined} size={15} />
                      {duplicateBusyAction === 'analyze' ? '分析中...' : '分析重复歌曲'}
                    </button>
                  </div>
                  {appSettings?.duplicateTracksEnabled ? <p className="settings-inline-note">当前已隐藏 {duplicateSummary?.hiddenTracks ?? 0} 首重复歌曲。</p> : null}
                  {duplicateMessage ? <p className="settings-inline-note">{duplicateMessage}</p> : null}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="专辑合并策略"
                description="选择专辑列表如何把歌曲整理成专辑，不会改变歌曲 artist 显示或元数据。"
              >
                <div className="settings-cache-panel settings-cache-panel--album">
                  <div className="settings-chip-row settings-chip-row--left">
                    <ChipButton
                      active={(pendingAlbumMergeStrategy ?? appSettings?.albumMergeStrategy ?? 'standard') === 'standard'}
                      onClick={() => setPendingAlbumMergeStrategy('standard')}
                    >
                      标准模式（推荐）
                    </ChipButton>
                    <ChipButton
                      active={(pendingAlbumMergeStrategy ?? appSettings?.albumMergeStrategy ?? 'standard') === 'sameTitleAndCover'}
                      onClick={() => setPendingAlbumMergeStrategy('sameTitleAndCover')}
                    >
                      宽松合并
                    </ChipButton>
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <em>标准模式（推荐）</em>
                      <strong>优先使用 Album Artist；缺失时按文件夹 + 专辑名分组，最不容易误合并。</strong>
                    </span>
                    <span>
                      <em>宽松合并</em>
                      <strong>专辑名匹配度 95% 以上直接合并；否则封面一致且专辑名匹配度 90% 以上时合并。</strong>
                    </span>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleAlbumMergeStrategyApply()}
                      disabled={!appSettings || albumGroupingBusy}
                    >
                      {albumGroupingBusy ? '重新整理中...' : '应用并重新整理专辑'}
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleScanLibraryFolders()}
                      disabled={libraryScanBusy}
                    >
                      <RotateCw className={libraryScanBusy ? 'spinning-icon' : undefined} size={15} />
                      {libraryScanBusy ? '扫描中...' : '扫描曲库'}
                    </button>
                  </div>
                  {albumGroupingMessage ? <p className="settings-inline-note">{albumGroupingMessage}</p> : null}
                  {libraryScanMessage ? <p className="settings-inline-note">{libraryScanMessage}</p> : null}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="嵌入标签重扫"
                description="重新读取音频文件里的内嵌标题、艺人、专辑、音轨号和封面；读取到后直接应用到曲库。"
              >
                <div className="settings-cache-panel settings-cache-panel--embedded-tags">
                  <div className="settings-status-grid">
                    <span>
                      <em>全部重扫</em>
                      <strong>无视旧缓存，逐首重新读取嵌入标签</strong>
                    </span>
                    <span>
                      <em>缺失封面</em>
                      <strong>只重扫没有封面或只有默认封面的歌曲</strong>
                    </span>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={embeddedTagRescanBusy !== null}
                      onClick={() => void handleRescanEmbeddedTags('all')}
                    >
                      <RotateCw className={embeddedTagRescanBusy === 'all' ? 'spinning-icon' : undefined} size={15} />
                      {embeddedTagRescanBusy === 'all' ? '启动中...' : '重扫所有嵌入标签'}
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={embeddedTagRescanBusy !== null}
                      onClick={() => void handleRescanEmbeddedTags('missing-cover')}
                    >
                      <RotateCw className={embeddedTagRescanBusy === 'missing-cover' ? 'spinning-icon' : undefined} size={15} />
                      {embeddedTagRescanBusy === 'missing-cover' ? '启动中...' : '重扫缺失封面的歌曲'}
                    </button>
                  </div>
                  {embeddedTagRescanMessage ? <p className="settings-inline-note">{embeddedTagRescanMessage}</p> : null}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="封面缓存目录"
                description="迁移只会复制缓存，不会移动或删除你的音乐文件。"
              >
                <div className="settings-cache-panel settings-cache-panel--cover">
                  <div className="settings-cache-path">
                    <em>当前缓存目录</em>
                    <strong title={currentCacheDirectoryLabel}>{currentCacheDirectoryLabel}</strong>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left">
                    <button className="settings-action-button" type="button" onClick={() => void handleCacheDirectoryChoose()} disabled={cacheDirectoryBusy}>
                      <FolderOpen size={15} />
                      选择目录
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => {
                        setPendingCacheDirectory(null);
                        setCacheDirectoryResult(null);
                        setCacheDirectoryMessage(null);
                      }}
                      disabled={cacheDirectoryBusy || !defaultCacheDirectory}
                    >
                      恢复默认
                    </button>
                  </div>
                  {pendingCacheDirectory !== undefined ? (
                    <div className="settings-cache-confirm">
                      <span>
                        <em>当前</em>
                        <strong title={currentCacheDirectory}>{currentCacheDirectory || '读取中'}</strong>
                      </span>
                      <span>
                        <em>新目录</em>
                        <strong title={pendingResolvedCacheDirectory ?? ''}>{pendingResolvedCacheDirectory ?? '默认目录读取中'}</strong>
                      </span>
                      <p>迁移会复制封面缓存并更新数据库路径，不会删除旧缓存目录。</p>
                      <div className="settings-chip-row settings-chip-row--left">
                        <button
                          className="settings-action-button"
                          type="button"
                          onClick={() => void handleCacheDirectoryApply(true)}
                          disabled={cacheDirectoryBusy || !pendingResolvedCacheDirectory}
                        >
                          迁移到新目录
                        </button>
                        <button
                          className="settings-action-button"
                          type="button"
                          onClick={() => void handleCacheDirectoryApply(false)}
                          disabled={cacheDirectoryBusy || !pendingResolvedCacheDirectory}
                        >
                          仅切换不迁移
                        </button>
                        <button
                          className="settings-action-button"
                          type="button"
                          onClick={() => setPendingCacheDirectory(undefined)}
                          disabled={cacheDirectoryBusy}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {cacheDirectoryMessage ? <p className="settings-inline-note">{cacheDirectoryMessage}</p> : null}
                  {cacheDirectoryResult ? (
                    <div className="settings-cache-result">
                      <span>
                        <em>复制</em>
                        <strong>{cacheDirectoryResult.copiedFiles}</strong>
                      </span>
                      <span>
                        <em>跳过</em>
                        <strong>{cacheDirectoryResult.skippedFiles}</strong>
                      </span>
                      <span>
                        <em>更新记录</em>
                        <strong>{cacheDirectoryResult.updatedCoverRows}</strong>
                      </span>
                      {cacheDirectoryResult.warnings.length ? (
                        <p>警告：{cacheDirectoryResult.warnings.slice(0, 3).join('；')}</p>
                      ) : null}
                      {cacheDirectoryResult.errors.length ? (
                        <p className="settings-inline-error">错误：{cacheDirectoryResult.errors.slice(0, 3).join('；')}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </SettingRow>
              <SettingRow
                title="扫描性能"
                description="选择 ECHO Next 在曲库扫描时并行读取的文件数量。"
              >
                <div className="settings-chip-row">
                  {[
                    ['low', '低占用'],
                    ['balanced', '均衡'],
                    ['performance', '高性能'],
                  ].map(([mode, label]) => (
                    <ChipButton
                      active={(appSettings?.scanPerformanceMode ?? 'balanced') === mode}
                      key={mode}
                      onClick={() => patchAppSettings({ scanPerformanceMode: mode as AppSettings['scanPerformanceMode'] })}
                    >
                      {label}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="BPM / Offset 分析"
                description="默认开启。开启后只会在播放当前歌曲时低优先级分析缺失 BPM，并把检测到的 BPM 写入歌曲标签；手动按钮仍可一次性补齐缺失 BPM。"
              >
                <div className="settings-cache-panel">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>启用 BPM 分析</span>
                      <ToggleButton
                        active={appSettings?.audioAnalysisEnabled ?? false}
                        disabled={!appSettings || bpmAnalysisBusy}
                        onClick={() => patchAppSettings({ audioAnalysisEnabled: !(appSettings?.audioAnalysisEnabled ?? false) })}
                      />
                    </div>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={!appSettings?.audioAnalysisEnabled || bpmAnalysisBusy}
                      onClick={() => void handleStartBpmAnalysis()}
                    >
                      <RotateCw className={bpmAnalysisBusy ? 'spinning-icon' : undefined} size={15} />
                      {bpmAnalysisBusy ? '分析中...' : '分析缺失 BPM'}
                    </button>
                  </div>
                  <div className="settings-status-grid">
                    <span>
                      <em>状态</em>
                      <strong>{appSettings?.audioAnalysisEnabled ? '已开启' : '已关闭'}</strong>
                    </span>
                    <span>
                      <em>进度</em>
                      <strong>{bpmAnalysisJob ? `${bpmAnalysisJob.processedTracks}/${bpmAnalysisJob.totalTracks}` : '尚未运行'}</strong>
                    </span>
                    <span>
                      <em>已更新</em>
                      <strong>{bpmAnalysisJob?.updatedTracks ?? 0}</strong>
                    </span>
                  </div>
                  {bpmAnalysisMessage ? <p className="settings-inline-note">{bpmAnalysisMessage}</p> : null}
                  {bpmAnalysisJob?.errorCount ? <p className="settings-inline-error">分析错误 {bpmAnalysisJob.errorCount} 个，已跳过问题文件。</p> : null}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.library.network.title')} description={t('settings.library.network.description')}>
                <button
                  className={`toggle-btn ${appSettings?.networkMetadataEnabled ? 'active' : ''}`}
                  type="button"
                  aria-pressed={appSettings?.networkMetadataEnabled ?? false}
                  onClick={() => patchAppSettings({ networkMetadataEnabled: !(appSettings?.networkMetadataEnabled ?? false) })}
                >
                  <span />
                </button>
              </SettingRow>
              <SettingRow title={t('settings.library.networkSources.title')} description={t('settings.library.networkSources.description')}>
                <div className="settings-chip-row">
                  {visibleNetworkMetadataProviders.map((provider) => (
                    <ChipButton
                      active={(appSettings?.networkMetadataProviders ?? defaultNetworkMetadataProviders).includes(provider)}
                      key={provider}
                      onClick={() => toggleNetworkProvider(provider)}
                    >
                      {networkProviderLabels[provider]}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <NetworkMetadataPanel networkMetadataEnabled={appSettings?.networkMetadataEnabled ?? false} />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Info} id="about" title={t('settings.nav.about.label')}>
              <SettingRow title="版本号" description="当前安装的 ECHO Next 版本。">
                <StatusText tone={appVersion ? 'neutral' : 'muted'}>{appVersion ?? t('common.checking')}</StatusText>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="自动更新"
                description="启动后自动检查 GitHub Release，下载完成后自动重启安装。"
              >
                <div className="settings-cache-panel settings-cache-panel--updates">
                  <div className="settings-status-grid settings-status-grid--updates">
                    <span>
                      <em>当前版本</em>
                      <strong>{appVersion ?? updateStatus?.currentVersion ?? t('common.checking')}</strong>
                    </span>
                    <span>
                      <em>最新版本</em>
                      <strong>{updateStatus?.latestVersion ?? 'n/a'}</strong>
                    </span>
                    <span>
                      <em>状态</em>
                      <strong>{getUpdateStateLabel(updateStatus?.state ?? (appSettings?.autoUpdateEnabled === false ? 'disabled' : 'idle'))}</strong>
                    </span>
                    <span>
                      <em>上次检查</em>
                      <strong>{updateStatus?.checkedAt ? new Date(updateStatus.checkedAt).toLocaleString() : 'n/a'}</strong>
                    </span>
                  </div>
                  {showUpdateDownloadProgress ? (
                    <div className="settings-update-progress" role="status" aria-live="polite">
                      <div className="settings-update-progress-label">
                        <span>{updateStatus?.state === 'downloaded' ? '下载完成，准备安装' : '正在下载更新'}</span>
                        <strong>{updateDownloadPercent}%</strong>
                      </div>
                      <div
                        aria-label={`OTA 更新下载进度 ${updateDownloadPercent}%`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={updateDownloadPercent}
                        className="settings-update-progress-track"
                        role="progressbar"
                      >
                        <span style={{ width: `${updateDownloadPercent}%` }} />
                      </div>
                      <div className="settings-update-progress-meta">
                        <span>{updateDownloadSizeLabel}</span>
                        <span>{updateDownloadSpeedLabel}</span>
                      </div>
                    </div>
                  ) : null}
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <div className="settings-inline-toggle">
                      <span>自动检查更新</span>
                      <ToggleButton
                        active={appSettings?.autoUpdateEnabled ?? true}
                        disabled={!appSettings}
                        onClick={() => patchAppSettings({ autoUpdateEnabled: !(appSettings?.autoUpdateEnabled ?? true) })}
                      />
                    </div>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={updateBusy || appSettings?.autoUpdateEnabled === false}
                      onClick={() => void handleCheckForUpdates()}
                    >
                      <RotateCw className={updateBusy ? 'spinning-icon' : undefined} size={15} />
                      {updateBusy ? '检查中...' : '检查更新'}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleOpenRepository()}>
                      <Github size={15} />
                      ECHO NEXT
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleOpenExternalUrl('https://github.com/moekotori/echo/releases')}
                    >
                      <History size={15} />
                      查看历史更新日志
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleOpenExternalUrl('https://qm.qq.com/q/KrJE8PIqSQ')}
                    >
                      <ExternalLink size={15} />
                      加入 QQ 群聊
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => void handleOpenExternalUrl('https://discord.gg/g7v4WMRq3K')}
                    >
                      <ExternalLink size={15} />
                      加入 Discord
                    </button>
                  </div>
                  {updateStatus?.releaseNotes ? (
                    <div className="settings-update-notes">
                      <em>更新日志</em>
                      <ReleaseNotesMarkdown markdown={updateStatus.releaseNotes} />
                    </div>
                  ) : (
                    <p className="settings-inline-note">更新日志会在 GitHub Release 返回 release notes 后显示。</p>
                  )}
                  {updateStatus?.error ? <p className="settings-inline-error">{updateStatus.error}</p> : null}
                </div>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                id="settings-row-diagnostics"
                highlighted={highlightedSettingId === 'settings-row-diagnostics'}
                title="Diagnostics / 崩溃报告"
                description="报错默认生成轻量 Markdown 报告；日志目录仍保留在本地，不会自动上传。"
              >
                <div className="settings-cache-panel settings-cache-panel--diagnostics">
                  <div className="settings-status-grid">
                    <span>
                      <em>上次异常退出</em>
                      <strong>{lastCrashSummary ? '检测到' : '未检测到'}</strong>
                    </span>
                    <span>
                      <em>Session</em>
                      <strong>{lastCrashSummary?.sessionId ?? 'n/a'}</strong>
                    </span>
                    <span>
                      <em>Started</em>
                      <strong>{lastCrashSummary?.startedAt ?? 'n/a'}</strong>
                    </span>
                    <span>
                      <em>Detected</em>
                      <strong>{lastCrashSummary?.detectedAt ?? 'n/a'}</strong>
                    </span>
                  </div>
                  <div className="settings-chip-row settings-chip-row--left">
                    <button className="settings-action-button" type="button" disabled={diagnosticsBusy} onClick={() => void handleDiagnosticsExport()}>
                      <Download size={15} />
                      {diagnosticsBusy ? '导出中...' : '导出 Markdown'}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleDiagnosticsOpenFolder()}>
                      <FolderOpen size={15} />
                      打开日志目录
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleDiagnosticsOpenCrashReport()}>
                      <FileText size={15} />
                      打开崩溃报告
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleDiagnosticsOpenAudioCrashReport()}>
                      <Headphones size={15} />
                      打开音频报告
                    </button>
                    <button
                      className="settings-action-button"
                      type="button"
                      disabled={!lastCrashSummary}
                      onClick={() => void handleDiagnosticsClearSummary()}
                    >
                      清除上次异常提示
                    </button>
                  </div>
                  {diagnosticsMessage ? <p className="settings-inline-note">{diagnosticsMessage}</p> : null}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.about.devMode.title')} description={t('settings.about.devMode.description')}>
                <StatusText>{isDevBuild ? t('common.dev') : t('common.build')}</StatusText>
              </SettingRow>
              <SettingRow title={t('settings.about.nativeSqlite.title')} description={t('settings.about.nativeSqlite.description')}>
                <StatusText tone="good">{t('common.ready')}</StatusText>
              </SettingRow>
              <SettingRow title={t('settings.about.audioHost.title')} description={t('settings.about.audioHost.description')}>
                <StatusText tone={status?.host ? 'neutral' : 'muted'}>{status?.host ?? t('common.checking')}</StatusText>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Trash2} id="danger" title={t('settings.nav.danger.label')}>
              <SettingRow title={t('settings.danger.clearCache.title')} description={t('settings.danger.clearCache.description')}>
                <button className="settings-danger-button" type="button" disabled={dangerBusy} onClick={() => void handleClearLibraryCache()}>
                  {dangerBusy ? '处理中...' : '清空曲库缓存'}
                </button>
              </SettingRow>
              <SettingRow title="恢复默认设置" description="重置应用偏好、封面缓存目录和外观偏好；不会删除音乐文件或曲库文件夹。">
                <button className="settings-danger-button" type="button" disabled={dangerBusy} onClick={() => void handleResetDefaultSettings()}>
                  {dangerBusy ? '处理中...' : '恢复默认设置'}
                </button>
              </SettingRow>
              {dangerMessage ? <p className="settings-inline-note">{dangerMessage}</p> : null}
            </SettingSection>

            <details className="settings-section settings-section--devices settings-collapsible-section" data-visible={activeSection === 'playback'}>
              <summary className="section-title settings-collapsible-summary">
                <Headphones size={18} />
                <h2>{t('settings.devices.title')}</h2>
                <ChevronDown size={17} />
              </summary>
              {devices.length === 0 ? (
                <p className="settings-inline-note">{t('settings.devices.empty')}</p>
              ) : (
                <div className="audio-device-table">
                  <div className="audio-device-row audio-device-row--head">
                    <span>name</span>
                    <span>index</span>
                    <span>sampleRate</span>
                    <span>sharedDeviceSampleRate</span>
                    <span>outputMode</span>
                  </div>
                  {devices.map((device) => (
                    <div className="audio-device-row" key={device.id}>
                      <strong>{device.name}</strong>
                      <span>{device.index}</span>
                      <span>{formatRate(device.sampleRate)}</span>
                      <span>{formatRate(device.sharedDeviceSampleRate)}</span>
                      <span>{device.outputMode}</span>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </div>
        </div>
      </div>
      {fontPickerTarget ? (
        <FontPickerModal
          currentFont={activeFontValue}
          fonts={fontFamilies}
          onClose={() => setFontPickerTarget(null)}
          onChooseFile={() => void handleFontFileChoose()}
          onSelect={handleFontSelect}
          query={fontPickerQuery}
          setQuery={setFontPickerQuery}
          title={fontPickerTarget === 'chinese' ? t('settings.appearance.font.chinese.title') : t('settings.appearance.font.main.title')}
        />
      ) : null}
    </div>
  );
};
