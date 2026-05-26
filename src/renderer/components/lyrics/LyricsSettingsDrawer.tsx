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
  Languages,
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
import { translateFallback, useOptionalI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';

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
  | 'desktopLyricsRomanizationEnabled'
  | 'desktopLyricsTranslationEnabled'
>;

const fallbackSettings: LyricsDrawerSettings = {
  lyricsNetworkEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsTimelineCorrectionEnabled: true,
  lyricsOffsetControlsEnabled: false,
  lyricsSmartAlignmentEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'],
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
  desktopLyricsFontFamily: 'Microsoft YaHei',
  desktopLyricsFontFilePath: null,
  desktopLyricsRomanizationEnabled: true,
  desktopLyricsTranslationEnabled: true,
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
const defaultLyricsEnabledProviders: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'];
const defaultLyricsProviderOrder: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'];
type OnlineLyricsProviderId = Extract<LyricsProviderId, 'lrclib' | 'netease' | 'qqmusic' | 'kugou' | 'kuwo'>;
const onlineLyricsProviderIds: OnlineLyricsProviderId[] = ['lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'];
const isOnlineLyricsProvider = (provider: LyricsProviderId): provider is OnlineLyricsProviderId => onlineLyricsProviderIds.includes(provider as OnlineLyricsProviderId);
const lyricsSourceOptions = [
  { id: 'lrclib', labelKey: 'lyricsSettings.provider.lrclib', descriptionKey: 'lyricsSettings.provider.lrclibDescription' },
  { id: 'netease', labelKey: 'lyricsSettings.provider.netease', descriptionKey: 'lyricsSettings.provider.chineseCatalogDescription' },
  { id: 'qqmusic', labelKey: 'lyricsSettings.provider.qqmusic', descriptionKey: 'lyricsSettings.provider.chineseCatalogDescription' },
  { id: 'kugou', labelKey: 'lyricsSettings.provider.kugou', descriptionKey: 'lyricsSettings.provider.chineseCatalogDescription' },
  { id: 'kuwo', labelKey: 'lyricsSettings.provider.kuwo', descriptionKey: 'lyricsSettings.provider.chineseCatalogDescription' },
] satisfies Array<{ id: LyricsProviderId; labelKey: TranslationKey; descriptionKey: TranslationKey }>;
const lyricsSourceOptionById = new Map(lyricsSourceOptions.map((source) => [source.id, source]));

const lyricsProviderLabelKeys: Record<LyricsSource, TranslationKey> = {
  none: 'lyricsSettings.provider.none',
  local: 'lyricsSettings.provider.local',
  lrclib: 'lyricsSettings.provider.lrclib',
  netease: 'lyricsSettings.provider.netease',
  qqmusic: 'lyricsSettings.provider.qqmusic',
  kugou: 'lyricsSettings.provider.kugou',
  kuwo: 'lyricsSettings.provider.kuwo',
  musixmatch: 'lyricsSettings.provider.musixmatch',
  genius: 'lyricsSettings.provider.genius',
  manual: 'lyricsSettings.provider.manual',
  cached: 'lyricsSettings.provider.cached',
};

const providerLabelFor = (
  provider: LyricsSource | null | undefined,
  t: (key: TranslationKey, options?: Record<string, string | number>) => string = translateFallback,
): string => t(provider ? lyricsProviderLabelKeys[provider] : 'lyricsSettings.provider.none');

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
  const t = useOptionalI18n()?.t ?? translateFallback;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFonts = normalizedQuery ? fonts.filter((font) => font.toLowerCase().includes(normalizedQuery)) : fonts;

  return (
    <div className="settings-modal-backdrop lyrics-font-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-font-modal lyrics-font-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('lyricsSettings.fontPicker.aria')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-font-modal-header">
          <h3>{t('lyricsSettings.fontPicker.title')}</h3>
          <button className="settings-icon-button" type="button" onClick={onClose} aria-label={t('lyricsSettings.fontPicker.close')}>
            <X size={15} />
          </button>
        </header>
        <label className="settings-font-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder={t('lyricsSettings.fontPicker.searchPlaceholder')} />
        </label>
        <button className="settings-font-file-button" type="button" disabled={isBusy} onClick={onChooseFile}>
          <FolderOpen size={15} aria-hidden="true" />
          {t('lyricsSettings.fontPicker.chooseFile')}
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
              <em>{t('lyricsSettings.fontPicker.preview')}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

const riskLabel = (
  risk: LyricsSearchCandidate['risk'],
  t: (key: TranslationKey, options?: Record<string, string | number>) => string = translateFallback,
): string => {
  if (risk === 'low') return t('lyricsSettings.candidate.risk.low');
  if (risk === 'medium') return t('lyricsSettings.candidate.risk.medium');
  return t('lyricsSettings.candidate.risk.high');
};

const sourceFilterKey = (candidate: LyricsSearchCandidate): string => `${candidate.provider}:${candidate.sourceLabel}`;
const searchableLyricsProviderIds: LyricsProviderId[] = ['local', 'lrclib', 'netease', 'qqmusic', 'kugou', 'kuwo'];
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
  lyricsSmartAlignmentEnabled: settings.lyricsSmartAlignmentEnabled !== false,
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
  desktopLyricsRomanizationEnabled: settings.desktopLyricsRomanizationEnabled ?? fallbackSettings.desktopLyricsRomanizationEnabled,
  desktopLyricsTranslationEnabled: settings.desktopLyricsTranslationEnabled ?? fallbackSettings.desktopLyricsTranslationEnabled,
});

export const LyricsSettingsPanel = ({ className, variant = 'drawer' }: LyricsSettingsPanelProps): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const [settings, setSettings] = useState<LyricsDrawerSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [currentLyricsProviderLabel, setCurrentLyricsProviderLabel] = useState(providerLabelFor(null, t));
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
    'Microsoft YaHei';
  const desktopLyricsFontFilePath =
    desktopLyricsState?.settings.desktopLyricsFontFilePath ??
    effectiveSettings.desktopLyricsFontFilePath ??
    fallbackSettings.desktopLyricsFontFilePath ??
    null;
  const desktopLyricsRomanizationEnabled =
    desktopLyricsState?.settings.desktopLyricsRomanizationEnabled ??
    effectiveSettings.desktopLyricsRomanizationEnabled ??
    fallbackSettings.desktopLyricsRomanizationEnabled;
  const desktopLyricsTranslationEnabled =
    desktopLyricsState?.settings.desktopLyricsTranslationEnabled ??
    effectiveSettings.desktopLyricsTranslationEnabled ??
    fallbackSettings.desktopLyricsTranslationEnabled;
  const wordHighlightClarityPercent = effectiveSettings.lyricsWordHighlightClarityPercent ?? fallbackSettings.lyricsWordHighlightClarityPercent ?? 70;
  const wordHighlightClarityLabel =
    wordHighlightClarityPercent === fallbackSettings.lyricsWordHighlightClarityPercent ? t('lyricsSettings.status.normal') : `${wordHighlightClarityPercent}%`;
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
      ['kugou', 4],
      ['kuwo', 5],
      ['musixmatch', 6],
      ['genius', 7],
      ['manual', 8],
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
      { key: 'all', label: t('lyricsSettings.candidate.allSources'), count: lyricsCandidates.length, order: -1 },
      ...Array.from(sourceMap.values()).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    ];
  }, [lyricsCandidates, t]);
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
      setCurrentLyricsProviderLabel(providerLabelFor(null, t));
      return;
    }

    try {
      const [playbackStatus, audioStatus] = await Promise.all([
        playback?.getStatus().catch(() => null) ?? Promise.resolve(null),
        audio?.getStatus().catch(() => null) ?? Promise.resolve(null),
      ]);
      const trackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
      if (!trackId) {
        setCurrentLyricsProviderLabel(t('lyricsSettings.status.noPlayingTrack'));
        setCurrentLyricsKind(null);
        return;
      }

      const trackLyrics = await lyrics.getForTrack(trackId);
      setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics?.provider, t));
      setCurrentLyricsKind(trackLyrics?.kind ?? null);
    } catch {
      setCurrentLyricsProviderLabel(providerLabelFor(null, t));
      setCurrentLyricsKind(null);
    }
  }, [t]);

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
      setLyricsCandidateStatus(t('lyricsSettings.status.searchingCandidates'));
      setLyricsCandidates([]);
      setActiveLyricsCandidateSource('all');

      try {
        const currentTrackId = await resolveCurrentTrackId();
        if (!currentTrackId) {
          setLyricsCandidateStatus(t('lyricsSettings.status.noPlayingTrack'));
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
        setLyricsCandidateStatus(collectedCandidates.length ? null : t('lyricsSettings.status.noCandidates'));
        setError(null);
      } catch (candidateError) {
        setLyricsCandidateStatus(t('lyricsSettings.status.noCandidates'));
        setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
      } finally {
        setIsLyricsCandidateLoading(false);
      }
    },
    [activeSearchProviders, effectiveSettings.lyricsEnabled, resolveCurrentTrackId, t],
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
    setLyricsCandidateStatus(t('lyricsSettings.status.rematchingCandidates'));
    setLyricsCandidates([]);
    setActiveLyricsCandidateSource('all');

    try {
      const currentTrackId = await resolveCurrentTrackId();
      if (!currentTrackId) {
        setLyricsCandidateStatus(t('lyricsSettings.status.noPlayingTrack'));
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
      setLyricsCandidateStatus(collectedCandidates.length ? null : t('lyricsSettings.status.noCandidates'));
      setError(null);
    } catch (candidateError) {
      setLyricsCandidateStatus(t('lyricsSettings.status.noCandidates'));
      setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
    } finally {
      setIsLyricsCandidateLoading(false);
    }
  }, [activeSearchProviders, effectiveSettings.lyricsEnabled, resolveCurrentTrackId, t]);

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
          setLyricsCandidateStatus(t('lyricsSettings.status.noPlayingTrack'));
          return;
        }

        const trackLyrics = await lyricsApi.applyCandidate(currentTrackId, candidateId);
        setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics.provider, t));
        setCurrentLyricsKind(trackLyrics.kind);
        setLyricsCandidates([]);
        setActiveLyricsCandidateSource('all');
        setLyricsCandidateStatus(t('lyricsSettings.status.applied'));
        setError(null);
        dispatchLyricsCandidateApplied(currentTrackId, trackLyrics);
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : String(applyError));
      } finally {
        setApplyingLyricsCandidateId(null);
      }
    },
    [effectiveSettings.lyricsEnabled, resolveCurrentTrackId, t],
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
        setLyricsCandidateStatus(t('lyricsSettings.status.noPlayingTrack'));
        return;
      }

      const trackLyrics = await lyricsApi.markInstrumental(currentTrackId);
      setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics.provider, t));
      setCurrentLyricsKind(trackLyrics.kind);
      setLyricsCandidates([]);
      setActiveLyricsCandidateSource('all');
      setLyricsCandidateStatus(t('lyricsSettings.status.markedInstrumental'));
      setError(null);
      dispatchLyricsCandidateApplied(currentTrackId, trackLyrics);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : String(markError));
    } finally {
      setIsMarkingInstrumental(false);
    }
  }, [effectiveSettings.lyricsEnabled, resolveCurrentTrackId, t]);

  useEffect(() => {
    void refreshDrawerSummary();
  }, [refreshDrawerSummary]);

  useEffect(() => {
    const handleCurrentLyricsProviderChanged = (event: Event): void => {
      const provider = (event as CustomEvent<{ provider?: LyricsSource | null }>).detail?.provider;
      setCurrentLyricsProviderLabel(providerLabelFor(provider, t));
    };

    window.addEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
    return () => window.removeEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
  }, [t]);

  return (
    <div className={`lyrics-settings-panel ${className ?? ''}`.trim()}>
      {showCurrentTrackTools ? (
        <button className="audio-engine-meter lyrics-engine-meter" type="button" disabled={isBusy} onClick={() => void refreshDrawerSummary()}>
          <div className="audio-engine-meter__top">
            <span className="audio-engine-meter__icon">
              <Captions size={17} />
            </span>
            <div>
            <span>{t('lyricsSettings.engine.title')}</span>
              <strong>{currentLyricsProviderLabel}</strong>
            </div>
            <RefreshCw size={15} />
          </div>
          <div className="audio-engine-meter__grid">
            <span>
              <em>{t('lyricsSettings.engine.provider')}</em>
              <strong>{currentLyricsProviderLabel}</strong>
            </span>
            <span>
              <em>{t('lyricsSettings.engine.autoMatch')}</em>
              <strong>{effectiveSettings.lyricsAutoSearch ? t('lyricsSettings.status.on') : t('lyricsSettings.status.off')}</strong>
            </span>
            <span>
              <em>{t('lyricsSettings.engine.threshold')}</em>
              <strong>{thresholdPercent}%</strong>
            </span>
          </div>
        </button>
      ) : null}

      {showCurrentTrackTools ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Search size={17} />
            <h3>{t('lyricsSettings.currentTrack.title')}</h3>
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
              <strong>{t('lyricsSettings.currentTrack.searchLyrics')}</strong>
              <small>{t('lyricsSettings.currentTrack.searchHint')}</small>
            </span>
            <div className="lyrics-search-pill__field">
              <input
                type="search"
                value={lyricsSearchQuery}
                disabled={isBusy || isLyricsCandidateLoading || !effectiveSettings.lyricsEnabled}
                placeholder={t('lyricsSettings.currentTrack.searchPlaceholder')}
                aria-label={t('lyricsSettings.currentTrack.searchInput')}
                onChange={(event) => setLyricsSearchQuery(event.currentTarget.value)}
              />
            </div>
            <button type="submit" disabled={isBusy || isLyricsCandidateLoading || !effectiveSettings.lyricsEnabled}>
              {t('lyricsSettings.action.search')}
            </button>
          </form>

          {(lyricsCandidateStatus || lyricsCandidates.length > 0) ? (
            <div className="lyrics-drawer-candidates" aria-label={t('lyricsSettings.candidate.results')}>
              {lyricsCandidateStatus ? <p className="lyrics-match-status">{lyricsCandidateStatus}</p> : null}
              {lyricsCandidates.length > 0 ? (
                <>
                  <div className="lyrics-source-filters" aria-label={t('lyricsSettings.candidate.sourceFilters')}>
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
                            {riskLabel(candidate.risk, t)}
                          </small>
                          <small>
                            {candidate.hasSynced
                              ? t('lyricsSettings.candidate.type.synced')
                              : candidate.hasPlain
                                ? t('lyricsSettings.candidate.type.plain')
                                : candidate.instrumental
                                  ? t('lyricsSettings.candidate.type.instrumental')
                                  : t('lyricsSettings.candidate.type.lyrics')}
                          </small>
                          <small>{candidate.sourceLabel}</small>
                          <small>{formatScore(candidate.score)}</small>
                          {applyingLyricsCandidateId === candidate.id ? <small>{t('lyricsSettings.status.applying')}</small> : null}
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
              <strong>{t('lyricsSettings.currentTrack.rematch')}</strong>
              <small>{t('lyricsSettings.currentTrack.rematchHint')}</small>
            </span>
            <em>{t('lyricsSettings.action.match')}</em>
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
              <strong>{currentLyricsKind === 'instrumental' ? t('lyricsSettings.currentTrack.instrumentalMarked') : t('lyricsSettings.currentTrack.markInstrumental')}</strong>
              <small>{t('lyricsSettings.currentTrack.markInstrumentalHint')}</small>
            </span>
            <em>{t('lyricsSettings.action.music')}</em>
          </button>
        </section>
      ) : null}

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Captions size={17} />
            <h3>{t('lyricsSettings.display.title')}</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>{t('lyricsSettings.display.enableLyrics')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.enableLyricsDescription')}</p>

          {showPersistentControls ? (
            <>
              <label className="audio-toggle-row">
                <span>
                  <Monitor size={17} />
                  <strong>{t('lyricsSettings.display.desktopLyrics')}</strong>
                </span>
                <input
                  type="checkbox"
                  checked={desktopLyricsVisible}
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onChange={(event) => setDesktopLyricsVisible(event.currentTarget.checked)}
                />
              </label>
              <p>{t('lyricsSettings.display.desktopLyricsDescription')}</p>

              <div className="lyrics-font-panel lyrics-desktop-font-panel">
                <div className="lyrics-color-panel__header">
                  <span>
                    <Type size={15} />
                    <strong>{t('lyricsSettings.display.desktopFont')}</strong>
                  </span>
                  <em title={desktopLyricsFontFilePath ?? undefined}>
                    {desktopLyricsFontFilePath ? t('lyricsSettings.font.custom') : t('lyricsSettings.font.system')}
                  </em>
                </div>
                <button
                  className="lyrics-font-picker-button"
                  type="button"
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onClick={() => openFontPicker('desktopLyrics')}
                >
                  <span style={{ fontFamily: `"${desktopLyricsFontFamily}", "Microsoft YaHei", var(--echo-font-family)` }}>
                    {desktopLyricsFontFamily}
                  </span>
                  <em>{t('lyricsSettings.display.defaultMicrosoftYahei')}</em>
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
                      <strong>{t('lyricsSettings.font.applySystem')}</strong>
                      <small>{t('lyricsSettings.font.desktopOnly')}</small>
                    </span>
                    <em>{t('lyricsSettings.action.fonts')}</em>
                  </button>
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={() => void chooseFontFileForTarget('desktopLyrics')}
                  >
                    <Upload size={15} />
                    <span>
                      <strong>{t('lyricsSettings.font.importDesktop')}</strong>
                      <small>TTF / OTF / WOFF / WOFF2</small>
                    </span>
                    <em>{t('lyricsSettings.action.choose')}</em>
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
                      <strong>{t('lyricsSettings.font.restoreDesktopDefault')}</strong>
                      <small>{fallbackSettings.desktopLyricsFontFamily}</small>
                    </span>
                    <em>{t('lyricsSettings.action.reset')}</em>
                  </button>
                </div>
              </div>

              <label className="audio-toggle-row">
                <span>
                  <Languages size={17} />
                  <strong>{t('lyricsSettings.display.desktopRomanization')}</strong>
                </span>
                <input
                  type="checkbox"
                  checked={desktopLyricsRomanizationEnabled}
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onChange={(event) => patchDesktopLyricsStyle({ desktopLyricsRomanizationEnabled: event.currentTarget.checked })}
                />
              </label>
              <label className="audio-toggle-row">
                <span>
                  <Languages size={17} />
                  <strong>{t('lyricsSettings.display.desktopTranslation')}</strong>
                </span>
                <input
                  type="checkbox"
                  checked={desktopLyricsTranslationEnabled}
                  disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                  onChange={(event) => patchDesktopLyricsStyle({ desktopLyricsTranslationEnabled: event.currentTarget.checked })}
                />
              </label>

              {desktopLyricsVisible ? (
                <>
                  <label className="audio-toggle-row">
                    <span>
                      <Lock size={17} />
                      <strong>{t('lyricsSettings.display.lockDesktopLyrics')}</strong>
                    </span>
                    <input
                      type="checkbox"
                      checked={desktopLyricsLocked}
                      disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                      onChange={(event) => setDesktopLyricsLocked(event.currentTarget.checked)}
                    />
                  </label>
                  <p>{t('lyricsSettings.display.lockDesktopLyricsDescription')}</p>
                  <button
                    className="audio-device-pill"
                    type="button"
                    disabled={isBusy || isDesktopLyricsBusy || !hasDesktopLyricsBridge}
                    onClick={resetDesktopLyricsPosition}
                  >
                    <RotateCcw size={15} />
                    <span>
                      <strong>{t('lyricsSettings.display.resetDesktopPosition')}</strong>
                      <small>{t('lyricsSettings.display.resetDesktopPositionHint')}</small>
                    </span>
                    <em>{t('lyricsSettings.action.reset')}</em>
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {showPersistentControls ? (
          <label className="mv-threshold-control lyrics-match-threshold-control">
            <span className="mv-threshold-copy">
              <strong>{t('lyricsSettings.display.matchThreshold')}</strong>
              <em>{t('lyricsSettings.display.matchThresholdDescription', { threshold: thresholdPercent })}</em>
            </span>
            <span className="mv-threshold-slider">
              <input
                type="range"
                min="30"
                max="100"
                step="1"
                value={thresholdPercent}
                aria-label={t('lyricsSettings.display.matchThreshold')}
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
              <strong>{t('lyricsSettings.display.hideTrackInfo')}</strong>
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
                <strong>{t('lyricsSettings.display.disableMvTrackInfoAutoShow')}</strong>
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
              <strong>{t('lyricsSettings.display.autoOpenCandidatePanel')}</strong>
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
              <strong>{t('lyricsSettings.display.miniPlayer')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsPlayerBarDrawerEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsPlayerBarDrawerEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.miniPlayerDescription')}</p>
          <p>{t('lyricsSettings.display.miniPlayerHint')}</p>

          {effectiveSettings.lyricsPlayerBarDrawerEnabled ? (
            <div className="audio-drawer-mini-grid lyrics-mini-player-options">
              <label className="lyrics-drawer-range">
                <span>
                  <strong>
                    <EyeOff size={15} />
                    {t('lyricsSettings.display.miniPlayerOpacity')}
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
                    <strong>{t('lyricsSettings.display.miniPlayerColor')}</strong>
                  </span>
                  <em>
                    {effectiveSettings.lyricsPlayerBarDrawerColorMode === 'cover'
                      ? t('lyricsSettings.background.mode.cover')
                      : effectiveSettings.lyricsPlayerBarDrawerColorMode === 'custom'
                        ? miniPlayerColor
                        : t('lyricsSettings.display.miniPlayerDefaultDark')}
                  </em>
                </div>
                <div className="lyrics-background-segmented lyrics-mini-player-color-modes" aria-label={t('lyricsSettings.display.miniPlayerColorMode')}>
                  {[
                    ['default', t('lyricsSettings.display.miniPlayerDefaultDark')],
                    ['custom', t('lyricsSettings.font.custom')],
                    ['cover', t('lyricsSettings.background.mode.cover')],
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
                        <strong>{t('lyricsSettings.display.customColor')}</strong>
                      </span>
                      <label className="lyrics-color-input" title={t('lyricsSettings.display.chooseMiniPlayerColor')}>
                        <input
                          type="color"
                          value={miniPlayerColor}
                          disabled={isBusy}
                          onChange={(event) => void patchSettings({ lyricsPlayerBarDrawerColor: event.currentTarget.value })}
                        />
                        <em>{miniPlayerColor}</em>
                      </label>
                    </div>
                    <div className="lyrics-color-swatches" aria-label={t('lyricsSettings.display.miniPlayerPalette')}>
                      {colorSwatches.map((color) => (
                        <button
                          className="lyrics-color-swatch"
                          type="button"
                          key={color}
                          style={{ backgroundColor: color }}
                          aria-label={t('lyricsSettings.display.useMiniPlayerColor', { color })}
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
                  <p>{t('lyricsSettings.display.coverMiniPlayerHint')}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>{t('lyricsSettings.display.hideEmptyState')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsEmptyStateHidden}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsEmptyStateHidden: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.hideEmptyStateDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>{t('lyricsSettings.display.showRomanization')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsRomanizationEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsRomanizationEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.showRomanizationDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>{t('lyricsSettings.display.preferUtatenKana')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsUtatenKanaEnabled === true}
              disabled={isBusy || !effectiveSettings.lyricsRomanizationEnabled || !effectiveSettings.lyricsNetworkEnabled}
              onChange={(event) => void patchSettings({ lyricsUtatenKanaEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.preferUtatenKanaDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <Captions size={17} />
              <strong>{t('lyricsSettings.display.showTranslation')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsTranslationEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsTranslationEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.display.showTranslationDescription')}</p>

          <div className="lyrics-word-highlight-settings">
            <label className="audio-toggle-row lyrics-word-highlight-toggle">
              <span>
                <Captions size={17} />
                <strong>{t('lyricsSettings.wordHighlight.title')}</strong>
              </span>
              <input
                type="checkbox"
                checked={effectiveSettings.lyricsWordHighlightEnabled !== false}
                disabled={isBusy}
                onChange={(event) => void patchSettings({ lyricsWordHighlightEnabled: event.currentTarget.checked })}
              />
            </label>
            {showPersistentControls ? (
              <label className="lyrics-drawer-range lyrics-word-clarity-range">
                <span>
                  <strong>
                    <SlidersHorizontal size={15} />
                    {t('lyricsSettings.wordHighlight.clarity')}
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
            ) : null}
          </div>
          <div className="lyrics-word-highlight-notes">
            <p>{t('lyricsSettings.wordHighlight.description')}</p>
            {showPersistentControls ? <p>{t('lyricsSettings.wordHighlight.clarityDescription')}</p> : null}
          </div>

          {showPersistentControls ? (
          <>
          <label className="audio-toggle-row lyrics-style-toggle">
            <span>
              <Type size={17} />
              <strong>{t('lyricsSettings.style.showControls')}</strong>
            </span>
            <input type="checkbox" checked={isLyricsStyleControlsOpen} onChange={(event) => setIsLyricsStyleControlsOpen(event.currentTarget.checked)} />
          </label>
          <p>{t('lyricsSettings.style.showControlsDescription')}</p>
          </>
          ) : null}

          {showPersistentControls ? (
          <div className="lyrics-font-panel" hidden={!isLyricsStyleControlsOpen}>
            <div className="lyrics-color-panel__header">
              <span>
                <Type size={15} />
                <strong>{t('lyricsSettings.style.lyricsFont')}</strong>
              </span>
              <em title={effectiveSettings.lyricsFontFilePath ?? undefined}>
                {effectiveSettings.lyricsFontFilePath ? t('lyricsSettings.font.custom') : t('lyricsSettings.font.system')}
              </em>
            </div>
            <button
              className="lyrics-font-picker-button"
              type="button"
              disabled={isBusy}
              onClick={() => openFontPicker('lyrics')}
            >
              <span style={{ fontFamily: `"${lyricsFontFamily}", var(--echo-font-family)` }}>{lyricsFontFamily}</span>
              <em>{t('lyricsSettings.font.chooseInstalled')}</em>
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
                  <strong>{t('lyricsSettings.font.applySystem')}</strong>
                  <small>{t('lyricsSettings.font.lyricsOnly')}</small>
                </span>
                <em>{t('lyricsSettings.action.fonts')}</em>
              </button>
              <button className="audio-device-pill" type="button" disabled={isBusy} onClick={() => void chooseFontFileForTarget('lyrics')}>
                <Upload size={15} />
                <span>
                  <strong>{t('lyricsSettings.font.importFile')}</strong>
                  <small>TTF / OTF / WOFF / WOFF2</small>
                </span>
                <em>{t('lyricsSettings.action.choose')}</em>
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
                  <strong>{t('lyricsSettings.font.restoreLyricsDefault')}</strong>
                  <small>{fallbackSettings.lyricsFontFamily}</small>
                </span>
                <em>{t('lyricsSettings.action.reset')}</em>
              </button>
            </div>
          </div>
          ) : null}

          {showPersistentControls ? (
            <div className="lyrics-style-range-grid" hidden={!isLyricsStyleControlsOpen}>
          {isSecondaryLyricsSizeOpen ? (
            <label className="lyrics-drawer-range lyrics-secondary-size-range">
              <span>
                <strong>
                  <Type size={15} />
                  {t('lyricsSettings.style.secondaryFontSize')}
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

          <label className="lyrics-drawer-range">
            <span>
              <strong>
                <Type size={15} />
                {t('lyricsSettings.style.fontSize')}
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
          <label className="lyrics-drawer-range">
            <span>
              <strong>
                <SlidersHorizontal size={15} />
                {t('lyricsSettings.style.lineSpacing')}
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
          <label className="lyrics-drawer-range">
            <span>
              <strong>
                <Type size={15} />
                {t('lyricsSettings.style.lineMaxChars')}
              </strong>
              <em>{lyricsLineMaxChars > 0 ? t('lyricsSettings.style.lineMaxCharsValue', { count: lyricsLineMaxChars }) : t('lyricsSettings.status.auto')}</em>
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
          <label className="lyrics-drawer-range">
            <span>
              <strong>
                <EyeOff size={15} />
                {t('lyricsSettings.style.contextOpacity')}
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
            </div>
          ) : null}

          {showPersistentControls ? (
          <div className="lyrics-color-panel" hidden={!isLyricsStyleControlsOpen}>
            <div className="lyrics-color-panel__header">
              <span>
                <Palette size={15} />
                <strong>{t('lyricsSettings.style.lyricsColor')}</strong>
              </span>
              <label className="lyrics-color-input" title={t('lyricsSettings.style.chooseLyricsColor')}>
                <input
                  type="color"
                  value={effectiveSettings.lyricsColor}
                  onChange={(event) => patchSettingsDebounced({ lyricsColor: event.currentTarget.value })}
                />
                <em>{effectiveSettings.lyricsColor}</em>
              </label>
            </div>
            <div className="lyrics-color-swatches" aria-label={t('lyricsSettings.style.lyricsColorPalette')}>
              {colorSwatches.map((color) => (
                <button
                  className="lyrics-color-swatch"
                  type="button"
                  key={color}
                  style={{ backgroundColor: color }}
                  aria-label={t('lyricsSettings.style.useColor', { color })}
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
                {t('lyricsSettings.action.reset')}
              </button>
            </div>
            <div
              className="lyrics-color-preview"
              style={{ '--lyrics-preview-color': effectiveSettings.lyricsColor } as CSSProperties}
            >
              <span>{t('lyricsSettings.preview.primary')}</span>
              <small>{t('lyricsSettings.preview.secondary')}</small>
            </div>
          </div>
          ) : null}
        </section>

        {showPersistentControls ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <ImageIcon size={17} />
            <h3>{t('lyricsSettings.background.title')}</h3>
          </div>

          <label className="audio-toggle-row lyrics-smart-readable-toggle">
            <span>
              <EyeOff size={17} />
              <strong>{t('lyricsSettings.background.smartReadable')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsSmartReadableColorsEnabled === true}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsSmartReadableColorsEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.background.smartReadableDescription')}</p>

          <label className="audio-toggle-row lyrics-readability-toggle">
            <span>
              <EyeOff size={17} />
              <strong>{t('lyricsSettings.background.readability')}</strong>
            </span>
            <input type="checkbox" checked={lyricsReadabilityEnhanced} onChange={toggleLyricsReadabilityEnhanced} />
          </label>
          <p>{t('lyricsSettings.background.readabilityDescription')}</p>

          <label className="audio-toggle-row lyrics-background-toggle">
            <span>
              <ImageIcon size={17} />
              <strong>{t('lyricsSettings.background.showControls')}</strong>
            </span>
            <input type="checkbox" checked={isBackgroundControlsOpen} onChange={(event) => setIsBackgroundControlsOpen(event.currentTarget.checked)} />
          </label>

          <div className="lyrics-background-controls" hidden={!isBackgroundControlsOpen}>
          <div className="lyrics-background-segmented" aria-label={t('lyricsSettings.background.modeAria')}>
            {[
              ['theme', t('lyricsSettings.background.mode.theme')],
              ['cover', t('lyricsSettings.background.mode.cover')],
              ['customWallpaper', t('lyricsSettings.background.mode.customWallpaper')],
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
          <p>{t('lyricsSettings.background.modeDescription')}</p>

          <label className="audio-toggle-row lyrics-background-network-cover-toggle">
            <span>
              <ImageIcon size={17} />
              <strong>{t('lyricsSettings.background.highResolutionCover')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsHighResolutionNetworkCoverEnabled === true}
              disabled={isBusy || effectiveSettings.lyricsBackgroundMode !== 'cover'}
              onChange={(event) => void patchSettings({ lyricsHighResolutionNetworkCoverEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.background.highResolutionCoverDescription')}</p>

          <div className="lyrics-cover-tuning">
            <p>{t('lyricsSettings.background.tuningDescription')}</p>
            <label className="lyrics-drawer-range">
              <span>
                <strong>{t('lyricsSettings.background.scale')}</strong>
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
                <strong>{t('lyricsSettings.background.opacity')}</strong>
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
                <strong>{t('lyricsSettings.background.blur')}</strong>
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
                <strong>{t('lyricsSettings.background.brightness')}</strong>
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
                <strong>{t('lyricsSettings.background.chooseWallpaper')}</strong>
                <small>{effectiveSettings.lyricsCustomWallpaperPath ? t('lyricsSettings.background.wallpaperSaved') : 'JPG / PNG / WEBP'}</small>
              </span>
              <em>{t('lyricsSettings.action.choose')}</em>
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
                  <strong>{t('lyricsSettings.background.clearWallpaper')}</strong>
                  <small>{t('lyricsSettings.background.clearWallpaperHint')}</small>
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
            <h3>{t('lyricsSettings.online.title')}</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Globe2 size={17} />
              <strong>{t('lyricsSettings.online.enable')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsNetworkEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsNetworkEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.online.enableDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <Zap size={17} />
              <strong>{t('lyricsSettings.online.deepSearch')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsDeepSearchEnabled}
              disabled={isBusy || !effectiveSettings.lyricsNetworkEnabled}
              onChange={(event) => void patchSettings({ lyricsDeepSearchEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.online.deepSearchDescription')}</p>

          {showPersistentControls ? (
          <div className="lyrics-source-panel">
            <span>
              <Globe2 size={15} />
              <strong>{t('lyricsSettings.online.sources')}</strong>
            </span>
            <div className="lyrics-source-grid" aria-label={t('lyricsSettings.online.sources')}>
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
                    <strong>{t(source.labelKey)}</strong>
                    <small>{t(source.descriptionKey)}</small>
                  </span>
                </label>
              ))}
            </div>
            <p>{t('lyricsSettings.online.sourcesDescription')}</p>
          </div>
          ) : null}

          <label className="audio-toggle-row">
            <span>
              <Database size={17} />
              <strong>{t('lyricsSettings.online.autoSearch')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsAutoSearch}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsAutoSearch: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.online.autoSearchDescription')}</p>
        </section>

        {showPersistentControls ? (
        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <TimerReset size={17} />
            <h3>{t('lyricsSettings.timing.title')}</h3>
          </div>

          <div className="lyrics-delay-range-grid">
          <label className="lyrics-drawer-range">
            <span>
              <strong>{t('lyricsSettings.timing.defaultOffset')}</strong>
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
              <strong>{t('lyricsSettings.timing.globalOffset')}</strong>
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
          </div>

          <label className="audio-toggle-row">
            <span>
              <TimerReset size={17} />
              <strong>{t('lyricsSettings.timing.timelineCorrection')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsTimelineCorrectionEnabled !== false}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsTimelineCorrectionEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.timing.timelineCorrectionDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <TimerReset size={17} />
              <strong>{t('lyricsSettings.timing.showPerTrackOffset')}</strong>
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
              <strong>{t('lyricsSettings.timing.smartAlignment')}</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsSmartAlignmentEnabled === true}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsSmartAlignmentEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>{t('lyricsSettings.timing.smartAlignmentDescription')}</p>

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy}
            onClick={() => void patchSettings({ lyricsAutoAcceptScore: 0.5, lyricsDefaultOffsetMs: 0, lyricsGlobalSyncOffsetMs: 0 })}
          >
            <RotateCcw size={15} />
            <span>
              <strong>{t('lyricsSettings.timing.restoreDefaults')}</strong>
              <small>{t('lyricsSettings.timing.restoreDefaultsHint')}</small>
            </span>
            <em>{t('lyricsSettings.action.reset')}</em>
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
  const t = useOptionalI18n()?.t ?? translateFallback;
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
      <button className="audio-drawer-scrim" type="button" aria-label={t('lyricsSettings.drawer.close')} onClick={onClose} />
      <aside className="audio-drawer lyrics-settings-drawer" aria-label={t('lyricsSettings.drawer.aria')}>
        <div className="audio-drawer-scroll">
          <header className="audio-drawer-header">
          <div>
            <SlidersHorizontal size={18} />
            <h2>{t('lyricsSettings.drawer.title')}</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label={t('lyricsSettings.drawer.close')} title={t('lyricsSettings.drawer.close')} onClick={onClose}>
            <X size={20} />
          </button>
          </header>
          <LyricsSettingsPanel />
        </div>
      </aside>
    </div>
  );
};
