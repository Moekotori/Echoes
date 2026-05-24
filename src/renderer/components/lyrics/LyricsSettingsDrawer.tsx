import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Captions,
  Check,
  Database,
  EyeOff,
  FolderOpen,
  Globe2,
  GripVertical,
  Image as ImageIcon,
  Lock,
  Monitor,
  Music2,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TimerReset,
  Trash2,
  Type,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { DesktopLyricsState, DesktopLyricsStylePatch } from '../../../shared/types/desktopLyrics';
import type { MvSettings } from '../../../shared/types/mv';
import type { LyricsProviderId, LyricsSearchCandidate, LyricsSource, TrackLyrics } from '../../../shared/types/lyrics';
import { registerAppearanceFontFile } from '../../preferences/appearancePreferences';

type LyricsSettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

type LyricsSettingsPanelProps = {
  className?: string;
  variant?: 'drawer' | 'settings';
};

type LocalFontData = {
  family: string;
};

type NavigatorWithLocalFonts = Navigator & {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
};

type LyricsFontPickerTarget = 'lyrics' | 'desktopLyrics';

const drawerExitAnimationMs = 320;

type LyricsDrawerSettings = Pick<
  AppSettings,
  | 'lyricsNetworkEnabled'
  | 'lyricsAutoSearch'
  | 'lyricsAutoAcceptScore'
  | 'lyricsDefaultOffsetMs'
  | 'lyricsGlobalSyncOffsetMs'
  | 'lyricsTimelineCorrectionEnabled'
  | 'lyricsOffsetControlsEnabled'
  | 'lyricsSmartAlignmentEnabled'
  | 'lyricsPreferredProvider'
  | 'lyricsEnabledProviders'
  | 'lyricsProviderOrder'
  | 'lyricsDeepSearchEnabled'
  | 'lyricsEnabled'
  | 'lyricsHeaderHidden'
  | 'lyricsMvAutoShowTrackInfoDisabled'
  | 'lyricsCandidatePanelAutoOpenEnabled'
  | 'lyricsEmptyStateHidden'
  | 'lyricsPlayerBarDrawerEnabled'
  | 'lyricsPlayerBarDrawerOpacityPercent'
  | 'lyricsPlayerBarDrawerColorMode'
  | 'lyricsPlayerBarDrawerColor'
  | 'lyricsRomanizationEnabled'
  | 'lyricsUtatenKanaEnabled'
  | 'lyricsTranslationEnabled'
  | 'lyricsWordHighlightEnabled'
  | 'lyricsWordHighlightClarityPercent'
  | 'lyricsFontSizePx'
  | 'lyricsSecondaryFontSizePx'
  | 'lyricsFontFamily'
  | 'lyricsFontFilePath'
  | 'lyricsLineSpacingPercent'
  | 'lyricsLineMaxChars'
  | 'lyricsContextOpacityPercent'
  | 'lyricsColor'
  | 'lyricsSmartReadableColorsEnabled'
  | 'lyricsHighResolutionNetworkCoverEnabled'
  | 'lyricsBackgroundMode'
  | 'lyricsCustomWallpaperPath'
  | 'lyricsCoverOpacityPercent'
  | 'lyricsCoverBlurPx'
  | 'lyricsCoverBrightnessPercent'
  | 'lyricsBackgroundScalePercent'
  | 'desktopLyricsFontFamily'
  | 'desktopLyricsFontFilePath'
>;

const fallbackSettings: LyricsDrawerSettings = {
  lyricsNetworkEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsTimelineCorrectionEnabled: true,
  lyricsOffsetControlsEnabled: false,
  lyricsSmartAlignmentEnabled: false,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsMvAutoShowTrackInfoDisabled: true,
  lyricsCandidatePanelAutoOpenEnabled: true,
  lyricsEmptyStateHidden: true,
  lyricsPlayerBarDrawerEnabled: false,
  lyricsPlayerBarDrawerOpacityPercent: 78,
  lyricsPlayerBarDrawerColorMode: 'default',
  lyricsPlayerBarDrawerColor: '#232120',
  lyricsRomanizationEnabled: true,
  lyricsUtatenKanaEnabled: false,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsWordHighlightClarityPercent: 70,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsFontFamily: 'Microsoft YaHei',
  lyricsFontFilePath: null,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsColor: '#314054',
  lyricsSmartReadableColorsEnabled: false,
  lyricsHighResolutionNetworkCoverEnabled: false,
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  desktopLyricsFontFamily: 'Outfit',
  desktopLyricsFontFilePath: null,
};

const colorSwatches = ['#314054', '#FFFFFF', '#F6D365', '#8FCFBD', '#A8C7FA', '#FF8A80'];
const fallbackLyricsFontFamilies = [
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
  'Segoe UI',
  'Arial',
  'Inter',
  'Outfit',
];
const defaultLyricsEnabledProviders: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic'];
const defaultLyricsProviderOrder: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic'];
type OnlineLyricsProviderId = Extract<LyricsProviderId, 'lrclib' | 'netease' | 'qqmusic'>;
const onlineLyricsProviderIds: OnlineLyricsProviderId[] = ['lrclib', 'netease', 'qqmusic'];
const isOnlineLyricsProvider = (provider: LyricsProviderId): provider is OnlineLyricsProviderId => onlineLyricsProviderIds.includes(provider as OnlineLyricsProviderId);
const lyricsSourceOptions = [
  { id: 'lrclib', label: 'LRCLIB', description: '开放歌词库' },
  { id: 'netease', label: '网易云音乐', description: '中文曲库补充' },
  { id: 'qqmusic', label: 'QQ 音乐', description: '中文曲库补充' },
] satisfies Array<{ id: LyricsProviderId; label: string; description: string }>;
const lyricsSourceOptionById = new Map(lyricsSourceOptions.map((source) => [source.id, source]));

const lyricsProviderLabels: Record<LyricsSource, string> = {
  none: '未应用歌词',
  local: '本地歌词',
  lrclib: 'LRCLIB',
  netease: '网易云音乐',
  qqmusic: 'QQ 音乐',
  musixmatch: 'Musixmatch',
  genius: 'Genius',
  manual: '手动歌词',
  cached: '缓存歌词',
};

const providerLabelFor = (provider: LyricsSource | null | undefined): string =>
  provider ? lyricsProviderLabels[provider] : '未应用歌词';

const dispatchSettingsChanged = (patch?: Partial<AppSettings> | Partial<MvSettings>): void => {
  window.dispatchEvent(patch ? new CustomEvent('settings:changed', { detail: patch }) : new Event('settings:changed'));
};

const dispatchLyricsDisplaySettingsChanged = (patch: Partial<AppSettings>): void => {
  window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', { detail: patch }));
};

const pickSavedLyricsPatch = (
  settings: LyricsDrawerSettings,
  patch: Partial<AppSettings>,
): Partial<AppSettings> => {
  const settingsRecord = settings as Record<string, unknown>;
  const patchRecord = patch as Record<string, unknown>;
  const savedPatch: Record<string, unknown> = {};

  for (const key of Object.keys(patchRecord)) {
    savedPatch[key] = Object.prototype.hasOwnProperty.call(settingsRecord, key)
      ? settingsRecord[key]
      : patchRecord[key];
  }

  return savedPatch as Partial<AppSettings>;
};

const patchValuesMatch = (left: Partial<AppSettings>, right: Partial<AppSettings>): boolean => {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);

  for (const key of keys) {
    const leftValue = leftRecord[key];
    const rightValue = rightRecord[key];
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      if (leftValue.length !== rightValue.length || leftValue.some((value, index) => value !== rightValue[index])) {
        return false;
      }
      continue;
    }

    if (!Object.is(leftValue, rightValue)) {
      return false;
    }
  }

  return true;
};

const dispatchLyricsAction = (action: 'search' | 'rematch', query?: string): void => {
  const eventName = action === 'search' ? 'lyrics:search-requested' : 'lyrics:rematch-requested';
  const normalizedQuery = query?.trim();
  window.dispatchEvent(normalizedQuery ? new CustomEvent(eventName, { detail: { query: normalizedQuery } }) : new Event(eventName));
};

const formatDuration = (durationSeconds: number | null): string => {
  if (!durationSeconds) {
    return '--:--';
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatScore = (score: number): string => `${Math.round(score * 100)}%`;
const thresholdFromPercent = (value: string): number => Math.max(30, Math.min(100, Math.round(Number(value)))) / 100;
const sanitizeFontFamily = (value: string): string => value.replace(/[\r\n;]/g, '').trim();

const LyricsFontPickerModal = ({
  currentFont,
  fonts,
  isBusy,
  onChooseFile,
  onClose,
  onSelect,
  query,
  setQuery,
}: {
  currentFont: string;
  fonts: string[];
  isBusy: boolean;
  onChooseFile: () => void;
  onClose: () => void;
  onSelect: (fontFamily: string) => void;
  query: string;
  setQuery: (query: string) => void;
}): JSX.Element => {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFonts = normalizedQuery ? fonts.filter((font) => font.toLowerCase().includes(normalizedQuery)) : fonts;

  return (
    <div className="settings-modal-backdrop lyrics-font-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-font-modal lyrics-font-modal"
        role="dialog"
        aria-modal="true"
        aria-label="选择歌词字体"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-font-modal-header">
          <h3>选择歌词字体</h3>
          <button className="settings-icon-button" type="button" onClick={onClose} aria-label="关闭歌词字体选择">
            <X size={15} />
          </button>
        </header>
        <label className="settings-font-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="搜索已安装字体" />
        </label>
        <button className="settings-font-file-button" type="button" disabled={isBusy} onClick={onChooseFile}>
          <FolderOpen size={15} aria-hidden="true" />
          从文件选择字体
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
              <em>歌词字体预览 Aa 你好</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

const riskLabel = (risk: LyricsSearchCandidate['risk']): string => {
  if (risk === 'low') return '精准匹配';
  if (risk === 'medium') return '可能匹配';
  return '需要确认';
};

const sourceFilterKey = (candidate: LyricsSearchCandidate): string => `${candidate.provider}:${candidate.sourceLabel}`;
const searchableLyricsProviderIds: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic'];
const searchableLyricsProviderSet = new Set<string>(searchableLyricsProviderIds);

const mergeLyricsCandidates = (
  current: LyricsSearchCandidate[],
  next: LyricsSearchCandidate[],
): LyricsSearchCandidate[] => {
  const merged = new Map<string, LyricsSearchCandidate>();
  for (const candidate of [...current, ...next]) {
    const key = `${candidate.provider}:${candidate.providerLyricsId ?? candidate.id}`;
    const existing = merged.get(key);
    if (!existing || candidate.score > existing.score) {
      merged.set(key, candidate);
    }
  }

  return Array.from(merged.values()).sort((left, right) => right.score - left.score);
};

const dispatchLyricsCandidateApplied = (trackId: string, lyrics: TrackLyrics): void => {
  window.dispatchEvent(new CustomEvent('lyrics:candidate-applied', { detail: { trackId, lyrics } }));
};

const selectLyricsSettings = (settings: AppSettings): LyricsDrawerSettings => ({
  lyricsNetworkEnabled: settings.lyricsNetworkEnabled,
  lyricsAutoSearch: settings.lyricsAutoSearch,
  lyricsAutoAcceptScore: settings.lyricsAutoAcceptScore,
  lyricsDefaultOffsetMs: settings.lyricsDefaultOffsetMs,
  lyricsGlobalSyncOffsetMs: settings.lyricsGlobalSyncOffsetMs,
  lyricsTimelineCorrectionEnabled: settings.lyricsTimelineCorrectionEnabled !== false,
  lyricsOffsetControlsEnabled: settings.lyricsOffsetControlsEnabled === true,
  lyricsSmartAlignmentEnabled: settings.lyricsSmartAlignmentEnabled === true,
  lyricsPreferredProvider: settings.lyricsPreferredProvider,
  lyricsEnabledProviders: settings.lyricsEnabledProviders?.length ? settings.lyricsEnabledProviders : defaultLyricsEnabledProviders,
  lyricsProviderOrder: settings.lyricsProviderOrder?.length ? settings.lyricsProviderOrder : defaultLyricsProviderOrder,
  lyricsDeepSearchEnabled: settings.lyricsDeepSearchEnabled !== false,
  lyricsEnabled: settings.lyricsEnabled,
  lyricsHeaderHidden: settings.lyricsHeaderHidden,
  lyricsMvAutoShowTrackInfoDisabled: settings.lyricsMvAutoShowTrackInfoDisabled !== false,
  lyricsCandidatePanelAutoOpenEnabled: settings.lyricsCandidatePanelAutoOpenEnabled !== false,
  lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden,
  lyricsPlayerBarDrawerEnabled: settings.lyricsPlayerBarDrawerEnabled === true,
  lyricsPlayerBarDrawerOpacityPercent: settings.lyricsPlayerBarDrawerOpacityPercent ?? fallbackSettings.lyricsPlayerBarDrawerOpacityPercent,
  lyricsPlayerBarDrawerColorMode: settings.lyricsPlayerBarDrawerColorMode ?? fallbackSettings.lyricsPlayerBarDrawerColorMode,
  lyricsPlayerBarDrawerColor: settings.lyricsPlayerBarDrawerColor ?? fallbackSettings.lyricsPlayerBarDrawerColor,
  lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled,
  lyricsUtatenKanaEnabled: settings.lyricsUtatenKanaEnabled === true,
  lyricsTranslationEnabled: settings.lyricsTranslationEnabled,
  lyricsWordHighlightEnabled: settings.lyricsWordHighlightEnabled !== false,
  lyricsWordHighlightClarityPercent: settings.lyricsWordHighlightClarityPercent ?? fallbackSettings.lyricsWordHighlightClarityPercent,
  lyricsFontSizePx: settings.lyricsFontSizePx,
  lyricsSecondaryFontSizePx: settings.lyricsSecondaryFontSizePx ?? fallbackSettings.lyricsSecondaryFontSizePx,
  lyricsFontFamily: settings.lyricsFontFamily ?? fallbackSettings.lyricsFontFamily,
  lyricsFontFilePath: settings.lyricsFontFilePath ?? fallbackSettings.lyricsFontFilePath,
  lyricsLineSpacingPercent: settings.lyricsLineSpacingPercent ?? fallbackSettings.lyricsLineSpacingPercent,
  lyricsLineMaxChars: settings.lyricsLineMaxChars ?? fallbackSettings.lyricsLineMaxChars,
  lyricsContextOpacityPercent: settings.lyricsContextOpacityPercent ?? fallbackSettings.lyricsContextOpacityPercent,
  lyricsColor: settings.lyricsColor,
  lyricsSmartReadableColorsEnabled: settings.lyricsSmartReadableColorsEnabled === true,
  lyricsHighResolutionNetworkCoverEnabled: settings.lyricsHighResolutionNetworkCoverEnabled === true,
  lyricsBackgroundMode: settings.lyricsBackgroundMode,
  lyricsCustomWallpaperPath: settings.lyricsCustomWallpaperPath,
  lyricsCoverOpacityPercent: settings.lyricsCoverOpacityPercent,
  lyricsCoverBlurPx: settings.lyricsCoverBlurPx,
  lyricsCoverBrightnessPercent: settings.lyricsCoverBrightnessPercent,
  lyricsBackgroundScalePercent: settings.lyricsBackgroundScalePercent,
  desktopLyricsFontFamily: settings.desktopLyricsFontFamily ?? fallbackSettings.desktopLyricsFontFamily,
  desktopLyricsFontFilePath: settings.desktopLyricsFontFilePath ?? fallbackSettings.desktopLyricsFontFilePath,
});

export const LyricsSettingsPanel = ({ className, variant = 'drawer' }: LyricsSettingsPanelProps): JSX.Element => {
  const [settings, setSettings] = useState<LyricsDrawerSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [currentLyricsProviderLabel, setCurrentLyricsProviderLabel] = useState(providerLabelFor(null));
  const [draggingSourceId, setDraggingSourceId] = useState<LyricsProviderId | null>(null);
  const [isLyricsStyleControlsOpen, setIsLyricsStyleControlsOpen] = useState(true);
  const [fontFamilies, setFontFamilies] = useState<string[]>(fallbackLyricsFontFamilies);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const [fontPickerTarget, setFontPickerTarget] = useState<LyricsFontPickerTarget>('lyrics');
  const [fontPickerQuery, setFontPickerQuery] = useState('');
  const [isBackgroundControlsOpen, setIsBackgroundControlsOpen] = useState(true);
  const [lyricsReadabilityEnhanced, setLyricsReadabilityEnhanced] = useState(false);
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState('');
  const [lyricsCandidates, setLyricsCandidates] = useState<LyricsSearchCandidate[]>([]);
  const [activeLyricsCandidateSource, setActiveLyricsCandidateSource] = useState('all');
  const [lyricsCandidateStatus, setLyricsCandidateStatus] = useState<string | null>(null);
  const [isLyricsCandidateLoading, setIsLyricsCandidateLoading] = useState(false);
  const [desktopLyricsState, setDesktopLyricsState] = useState<DesktopLyricsState | null>(null);
  const [isDesktopLyricsBusy, setIsDesktopLyricsBusy] = useState(false);
  const [applyingLyricsCandidateId, setApplyingLyricsCandidateId] = useState<string | null>(null);
  const [isMarkingInstrumental, setIsMarkingInstrumental] = useState(false);
  const [currentLyricsKind, setCurrentLyricsKind] = useState<TrackLyrics['kind'] | null>(null);
  const saveRequestIdRef = useRef(0);
  const debouncedSaveRequestIdRef = useRef(0);
  const debouncedSaveTimerRef = useRef<number | null>(null);
  const pendingDebouncedSettingsRef = useRef<Partial<AppSettings>>({});

  const effectiveSettings = settings ?? fallbackSettings;
  // Settings should expose every persistent lyrics preference; only current-track tools stay drawer-only.
  const showCurrentTrackTools = variant === 'drawer';
  const showPersistentControls = variant === 'drawer' || variant === 'settings';
  const lyricsContextOpacityPercent = effectiveSettings.lyricsContextOpacityPercent ?? fallbackSettings.lyricsContextOpacityPercent;
  const lyricsLineMaxChars = effectiveSettings.lyricsLineMaxChars ?? fallbackSettings.lyricsLineMaxChars ?? 0;
  const lyricsFontFamily = effectiveSettings.lyricsFontFamily ?? fallbackSettings.lyricsFontFamily ?? 'Microsoft YaHei';
  const desktopLyricsFontFamily =
    desktopLyricsState?.settings.desktopLyricsFontFamily ??
    effectiveSettings.desktopLyricsFontFamily ??
    fallbackSettings.desktopLyricsFontFamily ??
    'Outfit';
  const desktopLyricsFontFilePath =
    desktopLyricsState?.settings.desktopLyricsFontFilePath ??
    effectiveSettings.desktopLyricsFontFilePath ??
    fallbackSettings.desktopLyricsFontFilePath ??
    null;
  const wordHighlightClarityPercent = effectiveSettings.lyricsWordHighlightClarityPercent ?? fallbackSettings.lyricsWordHighlightClarityPercent ?? 70;
  const wordHighlightClarityLabel =
    wordHighlightClarityPercent === fallbackSettings.lyricsWordHighlightClarityPercent ? '正常' : `${wordHighlightClarityPercent}%`;
  const enabledProviderSet = new Set(effectiveSettings.lyricsEnabledProviders ?? defaultLyricsEnabledProviders);
  const orderedLyricsSourceOptions = useMemo(() => {
    const orderedIds = [
      ...effectiveSettings.lyricsProviderOrder.filter(isOnlineLyricsProvider),
      ...onlineLyricsProviderIds.filter((provider) => !effectiveSettings.lyricsProviderOrder.includes(provider)),
    ];

    return orderedIds
      .map((provider) => lyricsSourceOptionById.get(provider))
      .filter((source): source is (typeof lyricsSourceOptions)[number] => Boolean(source));
  }, [effectiveSettings.lyricsProviderOrder]);
  const orderedOnlineProviderIds = useMemo<LyricsProviderId[]>(() => orderedLyricsSourceOptions.map((source) => source.id), [orderedLyricsSourceOptions]);
  const activeSearchProviders = useMemo<LyricsProviderId[]>(() => {
    const enabled = effectiveSettings.lyricsEnabledProviders?.length
      ? effectiveSettings.lyricsEnabledProviders
      : defaultLyricsEnabledProviders;
    const order = effectiveSettings.lyricsProviderOrder?.length
      ? effectiveSettings.lyricsProviderOrder
      : defaultLyricsProviderOrder;
    const ordered = [
      ...order.filter((provider) => enabled.includes(provider)),
      ...enabled.filter((provider) => !order.includes(provider)),
    ];

    return ordered.filter(
      (provider): provider is LyricsProviderId =>
        searchableLyricsProviderSet.has(provider) &&
        (provider === 'local' || effectiveSettings.lyricsNetworkEnabled),
    );
  }, [effectiveSettings.lyricsEnabledProviders, effectiveSettings.lyricsNetworkEnabled, effectiveSettings.lyricsProviderOrder]);
  const thresholdPercent = Math.round(effectiveSettings.lyricsAutoAcceptScore * 100);
  const miniPlayerOpacityPercent = effectiveSettings.lyricsPlayerBarDrawerOpacityPercent ?? fallbackSettings.lyricsPlayerBarDrawerOpacityPercent;
  const miniPlayerColor = effectiveSettings.lyricsPlayerBarDrawerColor ?? fallbackSettings.lyricsPlayerBarDrawerColor ?? '#232120';
  const hasDesktopLyricsBridge = Boolean(window.echo?.desktopLyrics);
  const desktopLyricsVisible = desktopLyricsState?.visible === true;
  const desktopLyricsLocked = desktopLyricsState?.locked === true;
  const offsetSeconds = useMemo(() => (effectiveSettings.lyricsDefaultOffsetMs / 1000).toFixed(1), [effectiveSettings.lyricsDefaultOffsetMs]);
  const isSecondaryLyricsSizeOpen = effectiveSettings.lyricsRomanizationEnabled || effectiveSettings.lyricsTranslationEnabled;
  const globalSyncOffsetSeconds = useMemo(
    () => (effectiveSettings.lyricsGlobalSyncOffsetMs / 1000).toFixed(2),
    [effectiveSettings.lyricsGlobalSyncOffsetMs],
  );
  const lyricsCandidateSourceOptions = useMemo(() => {
    const order = new Map<LyricsSearchCandidate['provider'], number>([
      ['local', 0],
      ['lrclib', 1],
      ['netease', 2],
      ['qqmusic', 3],
      ['musixmatch', 4],
      ['genius', 5],
      ['manual', 6],
    ]);
    const sourceMap = new Map<string, { key: string; label: string; count: number; order: number }>();

    for (const candidate of lyricsCandidates) {
      const key = sourceFilterKey(candidate);
      const existing = sourceMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        sourceMap.set(key, {
          key,
          label: candidate.sourceLabel,
          count: 1,
          order: order.get(candidate.provider) ?? 99,
        });
      }
    }

    return [
      { key: 'all', label: '全部来源', count: lyricsCandidates.length, order: -1 },
      ...Array.from(sourceMap.values()).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    ];
  }, [lyricsCandidates]);
  const visibleLyricsCandidates = useMemo(
    () =>
      activeLyricsCandidateSource === 'all'
        ? lyricsCandidates
        : lyricsCandidates.filter((candidate) => sourceFilterKey(candidate) === activeLyricsCandidateSource),
    [activeLyricsCandidateSource, lyricsCandidates],
  );

  useEffect(() => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setDesktopLyricsState(null);
      return undefined;
    }

    let disposed = false;
    void desktopLyrics.getState()
      .then((state) => {
        if (!disposed) {
          setDesktopLyricsState(state);
        }
      })
      .catch(() => undefined);

    const unsubscribe = desktopLyrics.onStateChanged?.((state) => {
      setDesktopLyricsState(state);
    }) ?? (() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!showPersistentControls || (!isLyricsStyleControlsOpen && !isFontPickerOpen)) {
      return undefined;
    }

    const queryLocalFonts = (navigator as NavigatorWithLocalFonts).queryLocalFonts;

    if (!queryLocalFonts) {
      return undefined;
    }

    let cancelled = false;
    void queryLocalFonts()
      .then((fonts) => {
        if (cancelled) {
          return;
        }

        const families = Array.from(
          new Set([
            ...fallbackLyricsFontFamilies,
            ...fonts.map((font) => sanitizeFontFamily(font.family)).filter(Boolean),
          ]),
        ).sort((a, b) => a.localeCompare(b));
        setFontFamilies(families);
      })
      .catch(() => setFontFamilies(fallbackLyricsFontFamilies));

    return () => {
      cancelled = true;
    };
  }, [isFontPickerOpen, isLyricsStyleControlsOpen, showPersistentControls]);

  const loadCurrentLyricsProvider = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;
    const audio = window.echo?.audio;
    const lyrics = window.echo?.lyrics;
    if (!lyrics || (!playback && !audio)) {
      setCurrentLyricsProviderLabel(providerLabelFor(null));
      return;
    }

    try {
      const [playbackStatus, audioStatus] = await Promise.all([
        playback?.getStatus().catch(() => null) ?? Promise.resolve(null),
        audio?.getStatus().catch(() => null) ?? Promise.resolve(null),
      ]);
      const trackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
      if (!trackId) {
        setCurrentLyricsProviderLabel('未播放歌曲');
        setCurrentLyricsKind(null);
        return;
      }

      const trackLyrics = await lyrics.getForTrack(trackId);
      setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics?.provider));
      setCurrentLyricsKind(trackLyrics?.kind ?? null);
    } catch {
      setCurrentLyricsProviderLabel(providerLabelFor(null));
      setCurrentLyricsKind(null);
    }
  }, []);

  const loadSettings = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    if (!app) {
      setError('Desktop bridge unavailable');
      setSettings(fallbackSettings);
      return;
    }

    try {
      setError(null);
      const nextSettings = await app.getSettings();
      setSettings(selectLyricsSettings(nextSettings));
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    }
  }, []);

  const loadMvSettings = useCallback(async (): Promise<void> => {
    try {
      const mvSettings = await window.echo?.mv?.getSettings?.();
      setLyricsReadabilityEnhanced(mvSettings?.lyricsReadabilityEnhanced === true);
    } catch {
      setLyricsReadabilityEnhanced(false);
    }
  }, []);

  const refreshDrawerSummary = useCallback(async (): Promise<void> => {
    await Promise.all([loadSettings(), loadCurrentLyricsProvider(), loadMvSettings()]);
  }, [loadCurrentLyricsProvider, loadMvSettings, loadSettings]);

  const resolveCurrentTrackId = useCallback(async (): Promise<string | null> => {
    const playback = window.echo?.playback;
    const audio = window.echo?.audio;
    const [playbackStatus, audioStatus] = await Promise.all([
      playback?.getStatus().catch(() => null) ?? Promise.resolve(null),
      audio?.getStatus().catch(() => null) ?? Promise.resolve(null),
    ]);

    return playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  }, []);

  const patchSettings = useCallback(async (patch: Partial<AppSettings>, optimistic = true): Promise<void> => {
    const app = window.echo?.app;
    if (!app) {
      setError('Desktop bridge unavailable');
      return;
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    if (optimistic) {
      setSettings((current) => ({ ...(current ?? fallbackSettings), ...(patch as Partial<LyricsDrawerSettings>) }));
      dispatchSettingsChanged(patch);
      dispatchLyricsDisplaySettingsChanged(patch);
    }

    setIsBusy(true);
    try {
      const nextSettings = await app.setSettings(patch);
      if (requestId === saveRequestIdRef.current) {
        const nextLyricsSettings = selectLyricsSettings(nextSettings);
        const savedPatch = pickSavedLyricsPatch(nextLyricsSettings, patch);
        setSettings(nextLyricsSettings);
        setError(null);
        if (!optimistic || !patchValuesMatch(patch, savedPatch)) {
          dispatchSettingsChanged(savedPatch);
          dispatchLyricsDisplaySettingsChanged(savedPatch);
        }
      }
    } catch (settingsError) {
      if (requestId === saveRequestIdRef.current) {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        dispatchSettingsChanged();
      }
    } finally {
      if (requestId === saveRequestIdRef.current) {
        setIsBusy(false);
      }
    }
  }, []);

  const flushDebouncedSettings = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    const patch = pendingDebouncedSettingsRef.current;
    pendingDebouncedSettingsRef.current = {};
    debouncedSaveTimerRef.current = null;

    if (!app || Object.keys(patch).length === 0) {
      return;
    }

    const requestId = debouncedSaveRequestIdRef.current + 1;
    debouncedSaveRequestIdRef.current = requestId;

    try {
      const nextSettings = await app.setSettings(patch);
      if (requestId === debouncedSaveRequestIdRef.current) {
        const nextLyricsSettings = selectLyricsSettings(nextSettings);
        const savedPatch = pickSavedLyricsPatch(nextLyricsSettings, patch);
        setSettings(nextLyricsSettings);
        setError(null);
        dispatchSettingsChanged(savedPatch);
        if (!patchValuesMatch(patch, savedPatch)) {
          dispatchLyricsDisplaySettingsChanged(savedPatch);
        }
      }
    } catch (settingsError) {
      if (requestId === debouncedSaveRequestIdRef.current) {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        dispatchSettingsChanged();
      }
    }
  }, []);

  const patchSettingsDebounced = useCallback(
    (patch: Partial<AppSettings>, options: { broadcastSettings?: boolean } = {}): void => {
      const app = window.echo?.app;
      if (!app) {
        setError('Desktop bridge unavailable');
        return;
      }

      pendingDebouncedSettingsRef.current = {
        ...pendingDebouncedSettingsRef.current,
        ...patch,
      };
      setSettings((current) => ({ ...(current ?? fallbackSettings), ...(patch as Partial<LyricsDrawerSettings>) }));
      if (options.broadcastSettings) {
        dispatchSettingsChanged(patch);
      }
      dispatchLyricsDisplaySettingsChanged(patch);

      if (debouncedSaveTimerRef.current !== null) {
        window.clearTimeout(debouncedSaveTimerRef.current);
      }

      debouncedSaveTimerRef.current = window.setTimeout(() => {
        void flushDebouncedSettings();
      }, 240);
    },
    [flushDebouncedSettings],
  );

  const toggleLyricsHeaderHidden = useCallback(
    (hidden: boolean): void => {
      void patchSettings({ lyricsHeaderHidden: hidden });
    },
    [patchSettings],
  );

  const toggleMvAutoShowTrackInfoDisabled = useCallback((): void => {
    const nextDisabled = !effectiveSettings.lyricsMvAutoShowTrackInfoDisabled;
    if (!nextDisabled) {
      void patchSettings({ lyricsMvAutoShowTrackInfoDisabled: false });
      return;
    }

    void (async (): Promise<void> => {
      let isMvEnabled = true;
      try {
        const mvSettings = await window.echo?.mv?.getSettings?.();
        isMvEnabled = mvSettings?.enabled !== false;
      } catch {
        isMvEnabled = true;
      }

      await patchSettings({
        lyricsMvAutoShowTrackInfoDisabled: true,
        lyricsHeaderHidden: isMvEnabled,
      });
    })();
  }, [effectiveSettings.lyricsMvAutoShowTrackInfoDisabled, patchSettings]);

  const toggleLyricsReadabilityEnhanced = useCallback((): void => {
    const mv = window.echo?.mv;
    if (!mv?.setSettings) {
      setError('Desktop bridge unavailable');
      return;
    }

    const nextValue = !lyricsReadabilityEnhanced;
    const patch: Partial<MvSettings> = { lyricsReadabilityEnhanced: nextValue };
    setLyricsReadabilityEnhanced(nextValue);
    dispatchSettingsChanged(patch);

    void mv
      .setSettings(patch)
      .then((nextSettings) => {
        const savedValue = nextSettings.lyricsReadabilityEnhanced === true;
        setLyricsReadabilityEnhanced(savedValue);
        dispatchSettingsChanged({ lyricsReadabilityEnhanced: savedValue });
        setError(null);
      })
      .catch((settingsError) => {
        setLyricsReadabilityEnhanced(!nextValue);
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        dispatchSettingsChanged();
      });
  }, [lyricsReadabilityEnhanced]);

  const patchDesktopLyricsStyle = useCallback((patch: DesktopLyricsStylePatch): void => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setError('Desktop lyrics bridge unavailable');
      return;
    }

    setIsDesktopLyricsBusy(true);
    setSettings((current) => ({ ...(current ?? fallbackSettings), ...(patch as Partial<LyricsDrawerSettings>) }));
    setDesktopLyricsState((current) =>
      current
        ? {
            ...current,
            settings: {
              ...current.settings,
              ...patch,
            },
          }
        : current,
    );

    void desktopLyrics.setStyle(patch)
      .then((state) => {
        setDesktopLyricsState(state);
        setSettings((current) => ({
          ...(current ?? fallbackSettings),
          desktopLyricsFontFamily: state.settings.desktopLyricsFontFamily ?? fallbackSettings.desktopLyricsFontFamily,
          desktopLyricsFontFilePath: state.settings.desktopLyricsFontFilePath ?? fallbackSettings.desktopLyricsFontFilePath,
        }));
        setError(null);
      })
      .catch((desktopLyricsError) => {
        setError(desktopLyricsError instanceof Error ? desktopLyricsError.message : String(desktopLyricsError));
      })
      .finally(() => setIsDesktopLyricsBusy(false));
  }, []);

  const setDesktopLyricsVisible = useCallback((visible: boolean): void => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setError('Desktop lyrics bridge unavailable');
      return;
    }

    setIsDesktopLyricsBusy(true);
    void (visible ? desktopLyrics.show() : desktopLyrics.hide())
      .then((state) => {
        setDesktopLyricsState(state);
        setError(null);
      })
      .catch((desktopLyricsError) => {
        setError(desktopLyricsError instanceof Error ? desktopLyricsError.message : String(desktopLyricsError));
      })
      .finally(() => setIsDesktopLyricsBusy(false));
  }, []);

  const setDesktopLyricsLocked = useCallback((locked: boolean): void => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setError('Desktop lyrics bridge unavailable');
      return;
    }

    setIsDesktopLyricsBusy(true);
    void desktopLyrics.setLocked(locked)
      .then((state) => {
        setDesktopLyricsState(state);
        setError(null);
      })
      .catch((desktopLyricsError) => {
        setError(desktopLyricsError instanceof Error ? desktopLyricsError.message : String(desktopLyricsError));
      })
      .finally(() => setIsDesktopLyricsBusy(false));
  }, []);

  const resetDesktopLyricsPosition = useCallback((): void => {
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      setError('Desktop lyrics bridge unavailable');
      return;
    }

    setIsDesktopLyricsBusy(true);
    void desktopLyrics.resetBounds()
      .then((state) => {
        setDesktopLyricsState(state);
        setError(null);
      })
      .catch((desktopLyricsError) => {
        setError(desktopLyricsError instanceof Error ? desktopLyricsError.message : String(desktopLyricsError));
      })
      .finally(() => setIsDesktopLyricsBusy(false));
  }, []);

  useEffect(() => {
    return () => {
      if (debouncedSaveTimerRef.current !== null) {
        window.clearTimeout(debouncedSaveTimerRef.current);
        debouncedSaveTimerRef.current = null;
      }

      const patch = pendingDebouncedSettingsRef.current;
      pendingDebouncedSettingsRef.current = {};
      if (Object.keys(patch).length > 0) {
        const savePromise = window.echo?.app?.setSettings?.(patch);
        void savePromise?.catch(() => undefined);
      }
    };
  }, []);

  const openFontPicker = useCallback((target: LyricsFontPickerTarget): void => {
    setFontPickerTarget(target);
    setFontPickerQuery('');
    setIsFontPickerOpen(true);
  }, []);

  const applySelectedFontFamily = useCallback((value: string): void => {
    const fontFamily = sanitizeFontFamily(value);
    const currentFontFamily = fontPickerTarget === 'desktopLyrics' ? desktopLyricsFontFamily : lyricsFontFamily;
    if (!fontFamily || fontFamily === currentFontFamily) {
      setIsFontPickerOpen(false);
      return;
    }

    setFontFamilies((current) => Array.from(new Set([...current, fontFamily])).sort((a, b) => a.localeCompare(b)));
    setIsFontPickerOpen(false);
    if (fontPickerTarget === 'desktopLyrics') {
      patchDesktopLyricsStyle({ desktopLyricsFontFamily: fontFamily, desktopLyricsFontFilePath: null });
      return;
    }

    void patchSettings({ lyricsFontFamily: fontFamily, lyricsFontFilePath: null });
  }, [desktopLyricsFontFamily, fontPickerTarget, lyricsFontFamily, patchDesktopLyricsStyle, patchSettings]);

  const chooseFontFileForTarget = useCallback(async (target: LyricsFontPickerTarget): Promise<void> => {
    const app = window.echo?.app;
    if (!app?.chooseFontFile) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsBusy(true);
    try {
      const fontFile = await app.chooseFontFile();
      if (!fontFile) {
        return;
      }

      const fontFamily = await registerAppearanceFontFile(target, fontFile);
      setFontFamilies((current) => Array.from(new Set([...current, fontFamily])).sort((a, b) => a.localeCompare(b)));
      setIsFontPickerOpen(false);
      if (target === 'desktopLyrics') {
        patchDesktopLyricsStyle({
          desktopLyricsFontFamily: fontFamily,
          desktopLyricsFontFilePath: fontFile.path,
        });
      } else {
        await patchSettings({ lyricsFontFamily: fontFamily, lyricsFontFilePath: fontFile.path });
      }
    } catch (fontError) {
      setError(fontError instanceof Error ? fontError.message : String(fontError));
    } finally {
      setIsBusy(false);
    }
  }, [patchDesktopLyricsStyle, patchSettings]);

  const chooseWallpaper = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    if (!app?.chooseLyricsWallpaper) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsBusy(true);
    try {
      const wallpaperPath = await app.chooseLyricsWallpaper();
      if (wallpaperPath) {
        const nextSettings = await app.setSettings({
          lyricsBackgroundMode: 'customWallpaper',
          lyricsCustomWallpaperPath: wallpaperPath,
        });
        const nextLyricsSettings = selectLyricsSettings(nextSettings);
        setSettings(nextLyricsSettings);
        dispatchSettingsChanged({
          lyricsBackgroundMode: nextLyricsSettings.lyricsBackgroundMode,
          lyricsCustomWallpaperPath: nextLyricsSettings.lyricsCustomWallpaperPath,
        });
        dispatchLyricsDisplaySettingsChanged({
          lyricsBackgroundMode: nextLyricsSettings.lyricsBackgroundMode,
          lyricsCustomWallpaperPath: nextLyricsSettings.lyricsCustomWallpaperPath,
        });
      }
      setError(null);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const patchLyricsProviderOrder = useCallback((onlineOrder: LyricsProviderId[]): void => {
    void patchSettings({ lyricsProviderOrder: ['local', ...onlineOrder] });
  }, [patchSettings]);

  const moveLyricsSource = useCallback((sourceId: LyricsProviderId, targetId: LyricsProviderId): void => {
    if (sourceId === targetId) {
      return;
    }

    const nextOrder = [...orderedOnlineProviderIds];
    const sourceIndex = nextOrder.indexOf(sourceId);
    const targetIndex = nextOrder.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const [source] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, source);
    patchLyricsProviderOrder(nextOrder);
  }, [orderedOnlineProviderIds, patchLyricsProviderOrder]);

  const searchLyricsCandidates = useCallback(
    async (searchText?: string): Promise<void> => {
      if (!effectiveSettings.lyricsEnabled) {
        setLyricsCandidateStatus(null);
        return;
      }

      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi?.searchCandidates) {
        setError('Desktop bridge unavailable');
        return;
      }

      setIsLyricsCandidateLoading(true);
      setLyricsCandidateStatus('正在搜索歌词候选...');
      setLyricsCandidates([]);
      setActiveLyricsCandidateSource('all');

      try {
        const currentTrackId = await resolveCurrentTrackId();
        if (!currentTrackId) {
          setLyricsCandidateStatus('没有正在播放的歌曲');
          return;
        }

        let collectedCandidates: LyricsSearchCandidate[] = [];
        const providers: LyricsProviderId[] = activeSearchProviders.length ? activeSearchProviders : ['local'];
        const normalizedSearchText = searchText?.trim();
        await Promise.allSettled(
          providers.map(async (provider) => {
            const providerCandidates = normalizedSearchText
              ? await lyricsApi.searchCandidates(currentTrackId, normalizedSearchText, provider)
              : await lyricsApi.searchCandidates(currentTrackId, undefined, provider);
            collectedCandidates = mergeLyricsCandidates(collectedCandidates, providerCandidates);
            setLyricsCandidates(collectedCandidates);
            setActiveLyricsCandidateSource('all');
            if (collectedCandidates.length > 0) {
              setLyricsCandidateStatus(null);
            }
          }),
        );

        setLyricsCandidates(collectedCandidates);
        setActiveLyricsCandidateSource('all');
        setLyricsCandidateStatus(collectedCandidates.length ? null : '未找到歌词候选');
        setError(null);
      } catch (candidateError) {
        setLyricsCandidateStatus('未找到歌词候选');
        setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
      } finally {
        setIsLyricsCandidateLoading(false);
      }
    },
    [activeSearchProviders, effectiveSettings.lyricsEnabled, resolveCurrentTrackId],
  );

  const rematchLyricsCandidates = useCallback(async (): Promise<void> => {
    if (!effectiveSettings.lyricsEnabled) {
      setLyricsCandidateStatus(null);
      return;
    }

    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.searchCandidates) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsLyricsCandidateLoading(true);
    setLyricsCandidateStatus('正在重新匹配歌词...');
    setLyricsCandidates([]);
    setActiveLyricsCandidateSource('all');

    try {
      const currentTrackId = await resolveCurrentTrackId();
      if (!currentTrackId) {
        setLyricsCandidateStatus('没有正在播放的歌曲');
        return;
      }

      await lyricsApi.clearCache?.(currentTrackId);
      let collectedCandidates: LyricsSearchCandidate[] = [];
      const providers: LyricsProviderId[] = activeSearchProviders.length ? activeSearchProviders : ['local'];
      await Promise.allSettled(
        providers.map(async (provider) => {
          const providerCandidates = await lyricsApi.searchCandidates(currentTrackId, undefined, provider);
          collectedCandidates = mergeLyricsCandidates(collectedCandidates, providerCandidates);
          setLyricsCandidates(collectedCandidates);
          setActiveLyricsCandidateSource('all');
          if (collectedCandidates.length > 0) {
            setLyricsCandidateStatus(null);
          }
        }),
      );

      setLyricsCandidates(collectedCandidates);
      setActiveLyricsCandidateSource('all');
      setLyricsCandidateStatus(collectedCandidates.length ? null : '未找到歌词候选');
      setError(null);
    } catch (candidateError) {
      setLyricsCandidateStatus('未找到歌词候选');
      setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
    } finally {
      setIsLyricsCandidateLoading(false);
    }
  }, [activeSearchProviders, effectiveSettings.lyricsEnabled, resolveCurrentTrackId]);

  const applyLyricsCandidate = useCallback(
    async (candidateId: string): Promise<void> => {
      if (!effectiveSettings.lyricsEnabled) {
        setLyricsCandidateStatus(null);
        return;
      }

      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi?.applyCandidate) {
        setError('Desktop bridge unavailable');
        return;
      }

      setApplyingLyricsCandidateId(candidateId);
      try {
        const currentTrackId = await resolveCurrentTrackId();
        if (!currentTrackId) {
          setLyricsCandidateStatus('没有正在播放的歌曲');
          return;
        }

        const trackLyrics = await lyricsApi.applyCandidate(currentTrackId, candidateId);
        setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics.provider));
        setCurrentLyricsKind(trackLyrics.kind);
        setLyricsCandidates([]);
        setActiveLyricsCandidateSource('all');
        setLyricsCandidateStatus('已应用歌词');
        setError(null);
        dispatchLyricsCandidateApplied(currentTrackId, trackLyrics);
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : String(applyError));
      } finally {
        setApplyingLyricsCandidateId(null);
      }
    },
    [effectiveSettings.lyricsEnabled, resolveCurrentTrackId],
  );

  const markCurrentTrackInstrumental = useCallback(async (): Promise<void> => {
    if (!effectiveSettings.lyricsEnabled) {
      setLyricsCandidateStatus(null);
      return;
    }

    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi?.markInstrumental) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsMarkingInstrumental(true);
    try {
      const currentTrackId = await resolveCurrentTrackId();
      if (!currentTrackId) {
        setLyricsCandidateStatus('没有正在播放的歌曲');
        return;
      }

      const trackLyrics = await lyricsApi.markInstrumental(currentTrackId);
      setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics.provider));
      setCurrentLyricsKind(trackLyrics.kind);
      setLyricsCandidates([]);
      setActiveLyricsCandidateSource('all');
      setLyricsCandidateStatus('已标记为纯音乐');
      setError(null);
      dispatchLyricsCandidateApplied(currentTrackId, trackLyrics);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : String(markError));
    } finally {
      setIsMarkingInstrumental(false);
    }
  }, [effectiveSettings.lyricsEnabled, resolveCurrentTrackId]);

  useEffect(() => {
    void refreshDrawerSummary();
  }, [refreshDrawerSummary]);

  useEffect(() => {
    const handleCurrentLyricsProviderChanged = (event: Event): void => {
      const provider = (event as CustomEvent<{ provider?: LyricsSource | null }>).detail?.provider;
      setCurrentLyricsProviderLabel(providerLabelFor(provider));
    };

    window.addEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
    return () => window.removeEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
  }, []);

  return (
    <div className={`lyrics-settings-panel ${className ?? ''}`.trim()}>
      {showCurrentTrackTools ? (
        <button className="audio-engine-meter lyrics-engine-meter" type="button" disabled={isBusy} onClick={() => void refreshDrawerSummary()}>
          <div className="audio-engine-meter__top">
            <span className="audio-engine-meter__icon">
              <Captions size={17} />
            </span>
            <div>
            <span>Lyrics Engine</span>
              <strong>{currentLyricsProviderLabel}</strong>
            </div>
            <RefreshCw size={15} />
          </div>
          <div className="audio-engine-meter__grid">
            <span>
              <em>Provider</em>
              <strong>{currentLyricsProviderLabel}</strong>
            </span>
            <span>
              <em>Auto match</em>
              <strong>{effectiveSettings.lyricsAutoSearch ? 'On' : 'Off'}</strong>
            </span>
            <span>
              <em>Threshold</em>
              <strong>{thresholdPercent}%</strong>
            </span>
          </div>
        </button>
      ) : null}

      {showCurrentTrackTools ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Search size={17} />
            <h3>当前歌曲</h3>
          </div>

          <form
            className="audio-device-pill lyrics-search-pill"
            onSubmit={(event) => {
              event.preventDefault();
              dispatchLyricsAction('search', lyricsSearchQuery);
              void searchLyricsCandidates(lyricsSearchQuery);
            }}
          >
            <Search size={15} />
            <span>
              <strong>搜索歌词</strong>
              <small>留空则使用当前歌曲信息</small>
            </span>
            <div className="lyrics-search-pill__field">
              <input
                type="search"
                value={lyricsSearchQuery}
                disabled={isBusy || isLyricsCandidateLoading || !effectiveSettings.lyricsEnabled}
                placeholder="歌名 / 艺术家 / 关键词"
                aria-label="搜索歌词文本"
                onChange={(event) => setLyricsSearchQuery(event.currentTarget.value)}
              />
            </div>
            <button type="submit" disabled={isBusy || isLyricsCandidateLoading || !effectiveSettings.lyricsEnabled}>
              Search
            </button>
          </form>

          {(lyricsCandidateStatus || lyricsCandidates.length > 0) ? (
            <div className="lyrics-drawer-candidates" aria-label="歌词搜索结果">
              {lyricsCandidateStatus ? <p className="lyrics-match-status">{lyricsCandidateStatus}</p> : null}
              {lyricsCandidates.length > 0 ? (
                <>
                  <div className="lyrics-source-filters" aria-label="歌词来源筛选">
                    {lyricsCandidateSourceOptions.map((option) => (
                      <button
                        type="button"
                        key={option.key}
                        data-active={activeLyricsCandidateSource === option.key}
                        onClick={() => setActiveLyricsCandidateSource(option.key)}
                      >
                        {option.label}
                        <small>{option.count}</small>
                      </button>
                    ))}
                  </div>
                  <div className="lyrics-candidate-list">
                    {visibleLyricsCandidates.map((candidate) => (
                      <button
                        className="lyrics-candidate"
                        type="button"
                        key={candidate.id}
                        disabled={Boolean(applyingLyricsCandidateId)}
                        onClick={() => void applyLyricsCandidate(candidate.id)}
                      >
                        <span>
                          <strong>{candidate.title}</strong>
                          <em>
                            {candidate.artist}
                            {candidate.album ? ` / ${candidate.album}` : ''} / {formatDuration(candidate.durationSeconds)}
                          </em>
                        </span>
                        <span className="lyrics-candidate-badges">
                          <small className={`lyrics-risk-badge lyrics-risk-badge--${candidate.risk ?? 'high'}`}>
                            {riskLabel(candidate.risk)}
                          </small>
                          <small>
                            {candidate.hasSynced
                              ? 'Synced'
                              : candidate.hasPlain
                                ? 'Plain'
                                : candidate.instrumental
                                  ? 'Instrumental'
                                  : 'Lyrics'}
                          </small>
                          <small>{candidate.sourceLabel}</small>
                          <small>{formatScore(candidate.score)}</small>
                          {applyingLyricsCandidateId === candidate.id ? <small>应用中</small> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy || isLyricsCandidateLoading || !effectiveSettings.lyricsEnabled}
            onClick={() => {
              dispatchLyricsAction('rematch');
              void rematchLyricsCandidates();
            }}
          >
            <RotateCcw size={15} />
            <span>
              <strong>重新匹配</strong>
              <small>清理当前缓存并重新查找</small>
            </span>
            <em>Match</em>
          </button>

          <button
            className="audio-device-pill"
            type="button"
            disabled={
              isBusy ||
              isLyricsCandidateLoading ||
              isMarkingInstrumental ||
              !effectiveSettings.lyricsEnabled ||
              currentLyricsKind === 'instrumental'
            }
            onClick={() => void markCurrentTrackInstrumental()}
          >
            <Music2 size={15} />
            <span>
              <strong>{currentLyricsKind === 'instrumental' ? '已标记为纯音乐' : '标记为纯音乐'}</strong>
              <small>记忆当前歌曲并停止自动歌词匹配</small>
            </span>
            <em>Music</em>
          </button>
        </section>
      ) : null}

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Captions size={17} />
            <h3>歌词显示</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>启用歌词</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>关闭后歌词页不会加载、搜索或匹配歌词。</p>

          {showPersistentControls ? (
            <>
              <label className="audio-toggle-row">
                <span>
                  <Monitor size={17} />
                  <strong>桌面歌词</strong>
                </span>
                <input
                  type="checkbox"
                  checked={desktopLyricsVisible}
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onChange={(event) => setDesktopLyricsVisible(event.currentTarget.checked)}
                />
              </label>
              <p>开启后用独立透明窗口在桌面置顶显示当前歌词。</p>

              <div className="lyrics-font-panel lyrics-desktop-font-panel">
                <div className="lyrics-color-panel__header">
                  <span>
                    <Type size={15} />
                    <strong>桌面歌词字体</strong>
                  </span>
                  <em title={desktopLyricsFontFilePath ?? undefined}>
                    {desktopLyricsFontFilePath ? '自定义字体' : '系统字体'}
                  </em>
                </div>
                <button
                  className="lyrics-font-picker-button"
                  type="button"
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onClick={() => openFontPicker('desktopLyrics')}
                >
                  <span style={{ fontFamily: `"${desktopLyricsFontFamily}", "Outfit", var(--echo-font-family)` }}>
                    {desktopLyricsFontFamily}
                  </span>
                  <em>默认 Outfit，可换系统字体</em>
                </button>
                <div className="lyrics-font-actions">
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={() => openFontPicker('desktopLyrics')}
                  >
                    <Check size={15} />
                    <span>
                      <strong>应用系统字体</strong>
                      <small>只影响桌面歌词</small>
                    </span>
                    <em>Fonts</em>
                  </button>
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={() => void chooseFontFileForTarget('desktopLyrics')}
                  >
                    <Upload size={15} />
                    <span>
                      <strong>导入桌面歌词字体</strong>
                      <small>TTF / OTF / WOFF / WOFF2</small>
                    </span>
                    <em>Choose</em>
                  </button>
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={() => {
                      setIsFontPickerOpen(false);
                      patchDesktopLyricsStyle({
                        desktopLyricsFontFamily: fallbackSettings.desktopLyricsFontFamily,
                        desktopLyricsFontFilePath: fallbackSettings.desktopLyricsFontFilePath,
                      });
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>
                      <strong>恢复桌面歌词默认字体</strong>
                      <small>{fallbackSettings.desktopLyricsFontFamily}</small>
                    </span>
                    <em>Reset</em>
                  </button>
                </div>
              </div>

              {desktopLyricsVisible ? (
                <>
                  <label className="audio-toggle-row">
                    <span>
                      <Lock size={17} />
                      <strong>锁定桌面歌词</strong>
                    </span>
                    <input
                      type="checkbox"
                      checked={desktopLyricsLocked}
                      disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                      onChange={(event) => setDesktopLyricsLocked(event.currentTarget.checked)}
                    />
                  </label>
                  <p>锁定后鼠标会穿透桌面歌词，避免挡住桌面操作；回到这里可解锁。</p>
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={resetDesktopLyricsPosition}
                  >
                    <RotateCcw size={15} />
                    <span>
                      <strong>重置桌面歌词位置</strong>
                      <small>移回屏幕下方中央</small>
                    </span>
                    <em>Reset</em>
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {showPersistentControls ? (
          <label className="mv-threshold-control lyrics-match-threshold-control">
            <span className="mv-threshold-copy">
              <strong>歌词匹配度设置</strong>
              <em>在线结果达到 {thresholdPercent}% 才会自动应用</em>
            </span>
            <span className="mv-threshold-slider">
              <input
                type="range"
                min="30"
                max="100"
                step="1"
                value={thresholdPercent}
                aria-label="歌词匹配度设置"
                disabled={isBusy}
                onChange={(event) => patchSettingsDebounced({ lyricsAutoAcceptScore: thresholdFromPercent(event.currentTarget.value) })}
              />
              <strong>{thresholdPercent}%</strong>
            </span>
          </label>
          ) : null}

          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>隐藏歌曲信息</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsHeaderHidden}
              disabled={isBusy}
              onChange={(event) => toggleLyricsHeaderHidden(event.currentTarget.checked)}
            />
          </label>
          {effectiveSettings.lyricsHeaderHidden ? (
            <label className="audio-toggle-row">
              <span>
                <EyeOff size={17} />
                <strong>关闭MV自动显示歌曲信息</strong>
              </span>
              <input
                type="checkbox"
                checked={effectiveSettings.lyricsMvAutoShowTrackInfoDisabled}
                disabled={isBusy}
                onChange={toggleMvAutoShowTrackInfoDisabled}
              />
            </label>
          ) : null}
          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>自动弹出歌词选择栏</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsCandidatePanelAutoOpenEnabled !== false}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsCandidatePanelAutoOpenEnabled: event.currentTarget.checked })}
            />
          </label>
          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>迷你底栏</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsPlayerBarDrawerEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsPlayerBarDrawerEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>开启后歌词页会隐藏默认底部播放栏，改用贴在底部中央的小号控制条。</p>
          <p>默认关闭；适合想保留歌词沉浸感、但仍要快速切歌和拖动进度时使用。</p>

          {effectiveSettings.lyricsPlayerBarDrawerEnabled ? (
            <div className="audio-drawer-mini-grid lyrics-mini-player-options">
              <label className="lyrics-drawer-range">
                <span>
                  <strong>
                    <EyeOff size={15} />
                    底栏透明度
                  </strong>
                  <em>{miniPlayerOpacityPercent}%</em>
                </span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={1}
                  value={miniPlayerOpacityPercent}
                  disabled={isBusy}
                  onChange={(event) =>
                    patchSettingsDebounced(
                      { lyricsPlayerBarDrawerOpacityPercent: Number(event.currentTarget.value) },
                      { broadcastSettings: true },
                    )
                  }
                />
              </label>

              <div className="lyrics-color-panel lyrics-mini-player-color-panel">
                <div className="lyrics-color-panel__header">
                  <span>
                    <Palette size={15} />
                    <strong>底栏颜色</strong>
                  </span>
                  <em>
                    {effectiveSettings.lyricsPlayerBarDrawerColorMode === 'cover'
                      ? '跟随封面'
                      : effectiveSettings.lyricsPlayerBarDrawerColorMode === 'custom'
                        ? miniPlayerColor
                        : '默认深色'}
                  </em>
                </div>
                <div className="lyrics-background-segmented lyrics-mini-player-color-modes" aria-label="迷你底栏颜色模式">
                  {[
                    ['default', '默认深色'],
                    ['custom', '自定义'],
                    ['cover', '跟随封面'],
                  ].map(([mode, label]) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={effectiveSettings.lyricsPlayerBarDrawerColorMode === mode}
                      disabled={isBusy}
                      onClick={() => void patchSettings({ lyricsPlayerBarDrawerColorMode: mode as AppSettings['lyricsPlayerBarDrawerColorMode'] })}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {effectiveSettings.lyricsPlayerBarDrawerColorMode === 'custom' ? (
                  <>
                    <div className="lyrics-color-panel__header lyrics-mini-player-custom-color">
                      <span>
                        <Palette size={15} />
                        <strong>自定义颜色</strong>
                      </span>
                      <label className="lyrics-color-input" title="选择底栏颜色">
                        <input
                          type="color"
                          value={miniPlayerColor}
                          disabled={isBusy}
                          onChange={(event) => void patchSettings({ lyricsPlayerBarDrawerColor: event.currentTarget.value })}
                        />
                        <em>{miniPlayerColor}</em>
                      </label>
                    </div>
                    <div className="lyrics-color-swatches" aria-label="迷你底栏颜色调色盘">
                      {colorSwatches.map((color) => (
                        <button
                          className="lyrics-color-swatch"
                          type="button"
                          key={color}
                          style={{ backgroundColor: color }}
                          aria-label={`使用底栏颜色 ${color}`}
                          aria-pressed={miniPlayerColor.toUpperCase() === color}
                          disabled={isBusy}
                          onClick={() => void patchSettings({ lyricsPlayerBarDrawerColor: color })}
                        >
                          {miniPlayerColor.toUpperCase() === color ? <Check size={13} /> : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {effectiveSettings.lyricsPlayerBarDrawerColorMode === 'cover' ? (
                  <p>会从当前歌曲封面提取颜色，并自动压暗成适合按钮阅读的玻璃色。</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>隐藏纯音乐提示</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsEmptyStateHidden}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsEmptyStateHidden: event.currentTarget.checked })}
            />
          </label>
          <p>隐藏歌词页中央的“纯音乐，请欣赏”和“暂无歌词”提示，默认开启。</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>显示罗马音</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsRomanizationEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsRomanizationEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>优先使用歌词源提供的罗马音；没有时会为日文歌词本地生成。</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>优先 UtaTen 假名注音</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsUtatenKanaEnabled === true}
              disabled={isBusy || !effectiveSettings.lyricsRomanizationEnabled || !effectiveSettings.lyricsNetworkEnabled}
              onChange={(event) => void patchSettings({ lyricsUtatenKanaEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>默认关闭；开启后日文歌词会尝试用 UtaTen 的ふりがな替代罗马音显示，匹配不到会自动回退。</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>显示中文翻译</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsTranslationEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsTranslationEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>优先显示歌词源提供的中文翻译；没有翻译时不显示额外文本。</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>逐字歌词高亮</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsWordHighlightEnabled !== false}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsWordHighlightEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>仅在歌词文件含真实逐字时间戳时启用；否则保持整行高亮。</p>

          {showPersistentControls ? (
          <>
          <label className="lyrics-drawer-range">
            <span>
              <strong>
                <SlidersHorizontal size={15} />
                逐字高亮清晰度
              </strong>
              <em>{wordHighlightClarityLabel}</em>
            </span>
            <input
              type="range"
              min={40}
              max={100}
              step={1}
              value={wordHighlightClarityPercent}
              disabled={isBusy || effectiveSettings.lyricsWordHighlightEnabled === false}
              onChange={(event) => patchSettingsDebounced({ lyricsWordHighlightClarityPercent: Number(event.currentTarget.value) })}
            />
          </label>
          <p>默认“正常”；调高会让当前词未唱到的部分更完整，调低会更有逐字推进感。</p>
          </>
          ) : null}

          {showPersistentControls ? (
          <>
          <label className="audio-toggle-row lyrics-style-toggle">
            <span>
              <Type size={17} />
              <strong>显示歌词样式设置</strong>
            </span>
            <input type="checkbox" checked={isLyricsStyleControlsOpen} onChange={(event) => setIsLyricsStyleControlsOpen(event.currentTarget.checked)} />
          </label>
          <p>包含辅助字号、歌词字号、歌词行距、上下文透明度和歌词颜色。</p>
          </>
          ) : null}

          {showPersistentControls ? (
          <div className="lyrics-font-panel" hidden={!isLyricsStyleControlsOpen}>
            <div className="lyrics-color-panel__header">
              <span>
                <Type size={15} />
                <strong>歌词字体</strong>
              </span>
              <em title={effectiveSettings.lyricsFontFilePath ?? undefined}>
                {effectiveSettings.lyricsFontFilePath ? '自定义字体' : '系统字体'}
              </em>
            </div>
            <button
              className="lyrics-font-picker-button"
              type="button"
              disabled={isBusy}
              onClick={() => openFontPicker('lyrics')}
            >
              <span style={{ fontFamily: `"${lyricsFontFamily}", var(--echo-font-family)` }}>{lyricsFontFamily}</span>
              <em>选择已安装字体</em>
            </button>
            <div className="lyrics-font-actions">
              <button
                className="audio-device-pill"
                type="button"
                disabled={isBusy}
                onClick={() => openFontPicker('lyrics')}
              >
                <Check size={15} />
                <span>
                  <strong>应用系统字体</strong>
                  <small>只影响歌词页和歌词行</small>
                </span>
                <em>Fonts</em>
              </button>
              <button className="audio-device-pill" type="button" disabled={isBusy} onClick={() => void chooseFontFileForTarget('lyrics')}>
                <Upload size={15} />
                <span>
                  <strong>导入字体文件</strong>
                  <small>TTF / OTF / WOFF / WOFF2</small>
                </span>
                <em>Choose</em>
              </button>
              <button
                className="audio-device-pill"
                type="button"
                disabled={isBusy}
                onClick={() => {
                  const fallbackFontFamily = fallbackSettings.lyricsFontFamily ?? 'Microsoft YaHei';
                  setIsFontPickerOpen(false);
                  void patchSettings({
                    lyricsFontFamily: fallbackFontFamily,
                    lyricsFontFilePath: fallbackSettings.lyricsFontFilePath,
                  });
                }}
              >
                <RotateCcw size={15} />
                <span>
                  <strong>恢复默认歌词字体</strong>
                  <small>{fallbackSettings.lyricsFontFamily}</small>
                </span>
                <em>Reset</em>
              </button>
            </div>
          </div>
          ) : null}

          {showPersistentControls && isSecondaryLyricsSizeOpen ? (
            <label className="lyrics-drawer-range lyrics-secondary-size-range" hidden={!isLyricsStyleControlsOpen}>
              <span>
                <strong>
                  <Type size={15} />
                  辅歌词字号
                </strong>
                <em>{effectiveSettings.lyricsSecondaryFontSizePx}px</em>
              </span>
              <input
                type="range"
                min={12}
                max={32}
                step={1}
                value={effectiveSettings.lyricsSecondaryFontSizePx}
                onChange={(event) => patchSettingsDebounced({ lyricsSecondaryFontSizePx: Number(event.currentTarget.value) })}
              />
            </label>
          ) : null}

          {showPersistentControls ? (
          <label className="lyrics-drawer-range" hidden={!isLyricsStyleControlsOpen}>
            <span>
              <strong>
                <Type size={15} />
                歌词字号
              </strong>
              <em>{effectiveSettings.lyricsFontSizePx}px</em>
            </span>
            <input
              type="range"
              min={22}
              max={56}
              step={1}
              value={effectiveSettings.lyricsFontSizePx}
              onChange={(event) => patchSettingsDebounced({ lyricsFontSizePx: Number(event.currentTarget.value) })}
            />
          </label>
          ) : null}

          {showPersistentControls ? (
          <label className="lyrics-drawer-range" hidden={!isLyricsStyleControlsOpen}>
            <span>
              <strong>
                <SlidersHorizontal size={15} />
                歌词行距
              </strong>
              <em>{effectiveSettings.lyricsLineSpacingPercent}%</em>
            </span>
            <input
              type="range"
              min={60}
              max={150}
              step={1}
              value={effectiveSettings.lyricsLineSpacingPercent}
              onChange={(event) => patchSettingsDebounced({ lyricsLineSpacingPercent: Number(event.currentTarget.value) })}
            />
          </label>
          ) : null}

          {showPersistentControls ? (
          <label className="lyrics-drawer-range" hidden={!isLyricsStyleControlsOpen}>
            <span>
              <strong>
                <Type size={15} />
                每行字数
              </strong>
              <em>{lyricsLineMaxChars > 0 ? `${lyricsLineMaxChars}字` : '自动'}</em>
            </span>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={lyricsLineMaxChars}
              onChange={(event) => patchSettingsDebounced({ lyricsLineMaxChars: Number(event.currentTarget.value) })}
            />
          </label>
          ) : null}

          {showPersistentControls ? (
          <label className="lyrics-drawer-range" hidden={!isLyricsStyleControlsOpen}>
            <span>
              <strong>
                <EyeOff size={15} />
                上下文透明度
              </strong>
              <em>{lyricsContextOpacityPercent}%</em>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={lyricsContextOpacityPercent}
              onChange={(event) => patchSettingsDebounced({ lyricsContextOpacityPercent: Number(event.currentTarget.value) })}
            />
          </label>
          ) : null}

          {showPersistentControls ? (
          <div className="lyrics-color-panel" hidden={!isLyricsStyleControlsOpen}>
            <div className="lyrics-color-panel__header">
              <span>
                <Palette size={15} />
                <strong>歌词颜色</strong>
              </span>
              <label className="lyrics-color-input" title="选择歌词颜色">
                <input
                  type="color"
                  value={effectiveSettings.lyricsColor}
                  onChange={(event) => patchSettingsDebounced({ lyricsColor: event.currentTarget.value })}
                />
                <em>{effectiveSettings.lyricsColor}</em>
              </label>
            </div>
            <div className="lyrics-color-swatches" aria-label="歌词颜色调色盘">
              {colorSwatches.map((color) => (
                <button
                  className="lyrics-color-swatch"
                  type="button"
                  key={color}
                  style={{ backgroundColor: color }}
                  aria-label={`使用颜色 ${color}`}
                  aria-pressed={effectiveSettings.lyricsColor.toUpperCase() === color}
                  disabled={isBusy}
                  onClick={() => void patchSettings({ lyricsColor: color })}
                >
                  {effectiveSettings.lyricsColor.toUpperCase() === color ? <Check size={13} /> : null}
                </button>
              ))}
              <button
                className="lyrics-color-reset"
                type="button"
                disabled={isBusy}
                onClick={() => void patchSettings({ lyricsColor: fallbackSettings.lyricsColor })}
              >
                <RotateCcw size={14} />
                重置
              </button>
            </div>
            <div
              className="lyrics-color-preview"
              style={{ '--lyrics-preview-color': effectiveSettings.lyricsColor } as CSSProperties}
            >
              <span>Lyrics preview</span>
              <small>Secondary lyric line</small>
            </div>
          </div>
          ) : null}
        </section>

        {showPersistentControls ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <ImageIcon size={17} />
            <h3>歌词背景</h3>
          </div>

          <label className="audio-toggle-row lyrics-smart-readable-toggle">
            <span>
              <EyeOff size={17} />
              <strong>智能可读颜色</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsSmartReadableColorsEnabled === true}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsSmartReadableColorsEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>根据封面、壁纸或 MV 画面自动选择高对比文字色，并按需增加轻遮罩、描边和阴影。关闭时继续使用手动歌词颜色。</p>

          <label className="audio-toggle-row lyrics-readability-toggle">
            <span>
              <EyeOff size={17} />
              <strong>歌词可读性增强</strong>
            </span>
            <input type="checkbox" checked={lyricsReadabilityEnhanced} onChange={toggleLyricsReadabilityEnhanced} />
          </label>
          <p>为沉浸式 MV 背景上的歌词增加描边和投影；不用展开沉浸式 MV 背景设置也可以常驻开关。</p>

          <label className="audio-toggle-row lyrics-background-toggle">
            <span>
              <ImageIcon size={17} />
              <strong>显示歌词背景设置</strong>
            </span>
            <input type="checkbox" checked={isBackgroundControlsOpen} onChange={(event) => setIsBackgroundControlsOpen(event.currentTarget.checked)} />
          </label>

          <div className="lyrics-background-controls" hidden={!isBackgroundControlsOpen}>
          <div className="lyrics-background-segmented" aria-label="歌词背景模式">
            {[
              ['theme', '跟随主题'],
              ['cover', '跟随封面'],
              ['customWallpaper', '自定义壁纸'],
            ].map(([mode, label]) => (
              <button
                type="button"
                key={mode}
                aria-pressed={effectiveSettings.lyricsBackgroundMode === mode}
                disabled={isBusy}
                onClick={() => {
                  if (mode === 'customWallpaper' && !effectiveSettings.lyricsCustomWallpaperPath) {
                    void chooseWallpaper();
                    return;
                  }

                  void patchSettings({ lyricsBackgroundMode: mode as AppSettings['lyricsBackgroundMode'] });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p>封面模式会使用当前歌曲封面；自定义壁纸会保存到应用数据目录。</p>

          <label className="audio-toggle-row lyrics-background-network-cover-toggle">
            <span>
              <ImageIcon size={17} />
              <strong>请求网络元数据的高清封面</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsHighResolutionNetworkCoverEnabled === true}
              disabled={isBusy || effectiveSettings.lyricsBackgroundMode !== 'cover'}
              onChange={(event) => void patchSettings({ lyricsHighResolutionNetworkCoverEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>仅在跟随封面时临时请求高清封面作为歌词背景；关闭时只使用本地封面兜底。</p>

          <div className="lyrics-cover-tuning">
            <p>跟随封面和自定义壁纸都会使用这里的透明度、模糊度和亮度。</p>
            <label className="lyrics-drawer-range">
              <span>
                <strong>背景放大</strong>
                <em>{effectiveSettings.lyricsBackgroundScalePercent}%</em>
              </span>
              <input
                type="range"
                min={70}
                max={180}
                step={1}
                value={effectiveSettings.lyricsBackgroundScalePercent}
                onChange={(event) => patchSettingsDebounced({ lyricsBackgroundScalePercent: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="lyrics-drawer-range">
              <span>
                <strong>背景透明度</strong>
                <em>{effectiveSettings.lyricsCoverOpacityPercent}%</em>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={effectiveSettings.lyricsCoverOpacityPercent}
                onChange={(event) => patchSettingsDebounced({ lyricsCoverOpacityPercent: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="lyrics-drawer-range">
              <span>
                <strong>背景模糊度</strong>
                <em>{effectiveSettings.lyricsCoverBlurPx}px</em>
              </span>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={effectiveSettings.lyricsCoverBlurPx}
                onChange={(event) => patchSettingsDebounced({ lyricsCoverBlurPx: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="lyrics-drawer-range">
              <span>
                <strong>背景亮度</strong>
                <em>{effectiveSettings.lyricsCoverBrightnessPercent}%</em>
              </span>
              <input
                type="range"
                min={40}
                max={140}
                step={1}
                value={effectiveSettings.lyricsCoverBrightnessPercent}
                onChange={(event) => patchSettingsDebounced({ lyricsCoverBrightnessPercent: Number(event.currentTarget.value) })}
              />
            </label>
          </div>

          <div className="lyrics-wallpaper-actions">
            <button className="audio-device-pill" type="button" disabled={isBusy} onClick={() => void chooseWallpaper()}>
              <Upload size={15} />
              <span>
                <strong>选择自定义壁纸</strong>
                <small>{effectiveSettings.lyricsCustomWallpaperPath ? '已保存到应用壁纸目录' : 'JPG / PNG / WEBP'}</small>
              </span>
              <em>Choose</em>
            </button>
            {effectiveSettings.lyricsCustomWallpaperPath ? (
              <button
                className="audio-device-pill"
                type="button"
                disabled={isBusy}
                onClick={() => void patchSettings({ lyricsBackgroundMode: 'theme', lyricsCustomWallpaperPath: null })}
              >
                <Trash2 size={15} />
                <span>
                  <strong>清除自定义壁纸</strong>
                  <small>恢复为跟随主题</small>
                </span>
                <em>Clear</em>
              </button>
            ) : null}
          </div>
          {effectiveSettings.lyricsCustomWallpaperPath ? (
            <p className="lyrics-wallpaper-path" title={effectiveSettings.lyricsCustomWallpaperPath}>
              {effectiveSettings.lyricsCustomWallpaperPath}
            </p>
          ) : null}
          </div>
        </section>
        ) : null}

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Globe2 size={17} />
            <h3>在线匹配</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Globe2 size={17} />
              <strong>启用在线歌词匹配</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsNetworkEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsNetworkEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>仅发送标题、艺术家、专辑和时长用于匹配。</p>

          <label className="audio-toggle-row">
            <span>
              <Zap size={17} />
              <strong>深度优先搜索</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsDeepSearchEnabled}
              disabled={isBusy || !effectiveSettings.lyricsNetworkEnabled}
              onChange={(event) => void patchSettings({ lyricsDeepSearchEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>开启后多个在线平台会并发搜索，并按下方优先级与匹配分数返回最快的最优解。</p>

          {showPersistentControls ? (
          <div className="lyrics-source-panel">
            <span>
              <Globe2 size={15} />
              <strong>歌词源</strong>
            </span>
            <div className="lyrics-source-grid" aria-label="歌词源">
              {orderedLyricsSourceOptions.map((source) => (
                <label
                  className="lyrics-source-option"
                  data-enabled={enabledProviderSet.has(source.id)}
                  data-dragging={draggingSourceId === source.id}
                  draggable={!isBusy}
                  key={source.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', source.id);
                    setDraggingSourceId(source.id);
                  }}
                  onDragOver={(event) => {
                    if (draggingSourceId && draggingSourceId !== source.id) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = (event.dataTransfer.getData('text/plain') || draggingSourceId) as LyricsProviderId | null;
                    if (draggedId) {
                      moveLyricsSource(draggedId, source.id);
                    }
                    setDraggingSourceId(null);
                  }}
                  onDragEnd={() => setDraggingSourceId(null)}
                >
                  <span className="lyrics-source-drag-handle" aria-hidden="true">
                    <GripVertical size={15} />
                  </span>
                  <input
                    type="checkbox"
                    checked={enabledProviderSet.has(source.id)}
                    disabled={isBusy}
                    onChange={(event) => {
                      const current = new Set(effectiveSettings.lyricsEnabledProviders ?? defaultLyricsEnabledProviders);
                      if (event.currentTarget.checked) {
                        current.add(source.id);
                      } else {
                        current.delete(source.id);
                      }

                      current.add('local');
                      const nextProviders: LyricsProviderId[] = ['local', ...orderedOnlineProviderIds.filter((provider) => current.has(provider))];
                      void patchSettings({ lyricsEnabledProviders: nextProviders });
                    }}
                  />
                  <span>
                    <strong>{source.label}</strong>
                    <small>{source.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <p>本地歌词会一直优先；未勾选的在线源不会参与自动匹配或重新匹配。</p>
          </div>
          ) : null}

          <label className="audio-toggle-row">
            <span>
              <Database size={17} />
              <strong>自动匹配歌词</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsAutoSearch}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsAutoSearch: event.currentTarget.checked })}
            />
          </label>
          <p>本地歌词始终优先；在线结果达到阈值才会自动应用。</p>
        </section>

        {showPersistentControls ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <TimerReset size={17} />
            <h3>匹配与延迟</h3>
          </div>

          <label className="lyrics-drawer-range">
            <span>
              <strong>新歌词默认延迟</strong>
              <em>{offsetSeconds}s</em>
            </span>
            <input
              type="range"
              min={-10000}
              max={10000}
              step={500}
              value={effectiveSettings.lyricsDefaultOffsetMs}
              onChange={(event) => void patchSettings({ lyricsDefaultOffsetMs: Number(event.currentTarget.value) })}
            />
          </label>

          <label className="lyrics-drawer-range">
            <span>
              <strong>全局延迟</strong>
              <em>{globalSyncOffsetSeconds}s</em>
            </span>
            <input
              type="range"
              min={-1000}
              max={1000}
              step={25}
              value={effectiveSettings.lyricsGlobalSyncOffsetMs}
              onChange={(event) => void patchSettings({ lyricsGlobalSyncOffsetMs: Number(event.currentTarget.value) })}
            />
          </label>

          <label className="audio-toggle-row">
            <span>
              <TimerReset size={17} />
              <strong>应用歌词时间轴校准</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsTimelineCorrectionEnabled !== false}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsTimelineCorrectionEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>全局延迟会影响所有歌曲；本歌曲延迟请在歌词页校准条里调整，会跟随当前歌曲单独记忆。</p>

          <label className="audio-toggle-row">
            <span>
              <TimerReset size={17} />
              <strong>显示本歌曲延迟校准</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsOffsetControlsEnabled === true}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsOffsetControlsEnabled: event.currentTarget.checked })}
            />
          </label>

          <label className="audio-toggle-row">
            <span>
              <TimerReset size={17} />
              <strong>智能歌词校准</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsSmartAlignmentEnabled === true}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsSmartAlignmentEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>开启后歌词页会显示智能校准入口；只给出建议，不会自动保存。</p>

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy}
            onClick={() => void patchSettings({ lyricsAutoAcceptScore: 0.5, lyricsDefaultOffsetMs: 0, lyricsGlobalSyncOffsetMs: 0 })}
          >
            <RotateCcw size={15} />
            <span>
              <strong>恢复歌词默认值</strong>
              <small>匹配阈值 50% / 延迟 0ms</small>
            </span>
            <em>Reset</em>
          </button>
        </section>
        ) : null}

        {isFontPickerOpen ? (
          <LyricsFontPickerModal
            currentFont={fontPickerTarget === 'desktopLyrics' ? desktopLyricsFontFamily : lyricsFontFamily}
            fonts={fontFamilies}
            isBusy={isBusy}
            onChooseFile={() => void chooseFontFileForTarget(fontPickerTarget)}
            onClose={() => setIsFontPickerOpen(false)}
            onSelect={applySelectedFontFamily}
            query={fontPickerQuery}
            setQuery={setFontPickerQuery}
          />
        ) : null}

        {error ? <p className="audio-drawer-error">{error}</p> : null}
    </div>
  );
};

export const LyricsSettingsDrawer = ({ isOpen, onClose }: LyricsSettingsDrawerProps): JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isMotionOpen, setIsMotionOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsMotionOpen(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setIsMotionOpen(false);
    if (!shouldRender) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShouldRender(false), drawerExitAnimationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="audio-drawer-root lyrics-settings-drawer-root no-drag" role="presentation" data-open={isMotionOpen}>
      <button className="audio-drawer-scrim" type="button" aria-label="关闭歌词设置" onClick={onClose} />
      <aside className="audio-drawer lyrics-settings-drawer" aria-label="歌词设置">
        <div className="audio-drawer-scroll">
          <header className="audio-drawer-header">
          <div>
            <SlidersHorizontal size={18} />
            <h2>歌词设置</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label="关闭歌词设置" title="关闭歌词设置" onClick={onClose}>
            <X size={20} />
          </button>
          </header>
          <LyricsSettingsPanel />
        </div>
      </aside>
    </div>
  );
};
