import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Captions,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  Globe2,
  Headphones,
  Info,
  Link2,
  MessageSquare,
  Palette,
  RotateCw,
  Search,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AudioDeviceInfo, AudioOutputMode, AudioOutputSettings, AudioStatus, PlaybackSpeedMode } from '../../shared/types/audio';
import type { AccountProvider, AccountStatus, YouTubeBrowser } from '../../shared/types/accounts';
import type { AppSettings } from '../../shared/types/appSettings';
import type { CoverCacheMigrationResult } from '../../shared/types/coverCache';
import type { LastCrashSummary } from '../../shared/types/diagnostics';
import type { DiscordPresenceStatus } from '../../shared/types/discordPresence';
import type { LastFmStatus } from '../../shared/types/lastfm';
import type { DuplicateTrackIndexSummary } from '../../shared/types/library';
import { EqPanel } from '../components/audio/EqPanel';
import { LibraryDiagnosticsPanel } from '../components/library/LibraryDiagnosticsPanel';
import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';
import { NetworkMetadataPanel } from '../components/library/NetworkMetadataPanel';
import { LyricsSettingsPanel } from '../components/lyrics/LyricsSettingsDrawer';
import { PlaybackStabilityDiagnosticsPanel } from '../components/player/PlaybackStabilityDiagnosticsPanel';
import { RemoteSourcesPanel } from '../components/settings/RemoteSourcesPanel';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import {
  defaultAppearancePreferences,
  readAppearancePreferences,
  registerAppearanceFontFile,
  updateAppearancePreferences,
  type AppearancePreferences,
} from '../preferences/appearancePreferences';
import { rememberLibraryScanStatus } from '../stores/libraryScanSession';
import {
  getAccountsBridge,
  getAppBridge,
  getAudioBridge,
  getDiagnosticsBridge,
  getDiscordPresenceBridge,
  getLastFmBridge,
  getLibraryBridge,
} from '../utils/echoBridge';

const isDevBuild = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

const playbackSpeedModes: Array<{ mode: PlaybackSpeedMode; label: string }> = [
  { mode: 'nightcore', label: 'Nightcore' },
  { mode: 'daycore', label: 'Daycore' },
  { mode: 'speed', label: '普通变速' },
];

const networkProviderLabels: Record<AppSettings['networkMetadataProviders'][number], string> = {
  'netease-cloud-music': '网易云音乐',
  'qq-music': 'QQ 音乐',
  musicbrainz: 'MusicBrainz',
  'cover-art-archive': 'Cover Art Archive',
  mock: 'Mock',
};

type SettingsNavKey = 'general' | 'playback' | 'lyrics' | 'integrations' | 'remote' | 'eq' | 'appearance' | 'library' | 'about' | 'danger';

type SettingsNavItem = {
  key: SettingsNavKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
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
};

const accountLoginUrls: Record<AccountProvider, string> = {
  netease: 'https://music.163.com/',
  qqmusic: 'https://y.qq.com/',
  bilibili: 'https://www.bilibili.com/',
  youtube: 'https://www.youtube.com/',
  soundcloud: 'https://soundcloud.com/',
};

const cookieAccountProviders: AccountProvider[] = ['netease', 'qqmusic', 'bilibili', 'soundcloud'];
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
  title: string;
  description?: string;
  children: ReactNode;
};

const settingsNavItems: SettingsNavItem[] = [
  { key: 'general', labelKey: 'settings.nav.general.label', descriptionKey: 'settings.nav.general.description', icon: MessageSquare },
  { key: 'playback', labelKey: 'settings.nav.playback.label', descriptionKey: 'settings.nav.playback.description', icon: Zap },
  { key: 'lyrics', labelKey: 'route.lyricsSettings.label', descriptionKey: 'route.lyricsSettings.description', icon: Captions },
  { key: 'integrations', labelKey: 'settings.nav.integrations.label', descriptionKey: 'settings.nav.integrations.description', icon: Link2 },
  { key: 'remote', labelKey: 'settings.nav.remote.label', descriptionKey: 'settings.nav.remote.description', icon: Globe2 },
  { key: 'eq', labelKey: 'settings.nav.eq.label', descriptionKey: 'settings.nav.eq.description', icon: SlidersHorizontal },
  { key: 'appearance', labelKey: 'settings.nav.appearance.label', descriptionKey: 'settings.nav.appearance.description', icon: Palette },
  { key: 'library', labelKey: 'settings.nav.library.label', descriptionKey: 'settings.nav.library.description', icon: Download },
  { key: 'about', labelKey: 'settings.nav.about.label', descriptionKey: 'settings.nav.about.description', icon: Info },
  { key: 'danger', labelKey: 'settings.nav.danger.label', descriptionKey: 'settings.nav.danger.description', icon: Trash2 },
];

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
  { label: 'fileSampleRate', value: formatRate(status?.fileSampleRate ?? null) },
  { label: 'decoderOutputSampleRate', value: formatRate(status?.decoderOutputSampleRate ?? null) },
  { label: 'requestedOutputSampleRate', value: formatRate(status?.requestedOutputSampleRate ?? null) },
  { label: 'actualDeviceSampleRate', value: formatRate(status?.actualDeviceSampleRate ?? null) },
  { label: 'sharedDeviceSampleRate', value: formatRate(status?.sharedDeviceSampleRate ?? null) },
  { label: 'outputDeviceName', value: status?.outputDeviceName ?? 'n/a' },
  { label: 'resampling', value: formatBool(status?.resampling ?? false) },
  { label: 'bitPerfectCandidate', value: formatBool(status?.bitPerfectCandidate ?? false) },
  { label: 'bitPerfectDisabledReason', value: status?.bitPerfectDisabledReason ?? 'n/a' },
  { label: 'sampleRateMismatch', value: formatBool(status?.sampleRateMismatch ?? false) },
];

const SettingSection = ({ id, activeKey, icon: Icon, title, children }: SettingSectionProps): JSX.Element => (
  <section className="settings-section" id={`settings-sec-${id}`} data-visible={activeKey === id}>
    <div className="section-title">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
    {children}
  </section>
);

const SettingRow = ({ className, title, description, children }: SettingRowProps): JSX.Element => (
  <div className={`setting-row ${className ?? ''}`.trim()}>
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
    {provider === 'soundcloud' ? <p className="settings-inline-note settings-account-note">Cookie 检查第一阶段暂为 TODO，保存后只记录配置状态。</p> : null}
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
  const [activeSection, setActiveSection] = useState<SettingsNavKey>('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputMode, setOutputMode] = useState<AudioOutputMode>('shared');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [appearancePreferences, setAppearancePreferences] = useState<AppearancePreferences>(() => readAppearancePreferences());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
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
  });
  const [accountBusy, setAccountBusy] = useState<Partial<Record<AccountProvider, AccountBusyAction>>>({});
  const [accountErrors, setAccountErrors] = useState<Partial<Record<AccountProvider, string | null>>>({});
  const [accountMessages, setAccountMessages] = useState<Partial<Record<AccountProvider, string | null>>>({});
  const [youtubeBrowser, setYoutubeBrowser] = useState<YouTubeBrowser>('none');
  const [lastFmAuthToken, setLastFmAuthToken] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [lastCrashSummary, setLastCrashSummary] = useState<LastCrashSummary | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [defaultCacheDirectory, setDefaultCacheDirectory] = useState<string | null>(null);
  const [pendingCacheDirectory, setPendingCacheDirectory] = useState<string | null | undefined>(undefined);
  const [cacheDirectoryBusy, setCacheDirectoryBusy] = useState(false);
  const [cacheDirectoryResult, setCacheDirectoryResult] = useState<CoverCacheMigrationResult | null>(null);
  const [cacheDirectoryMessage, setCacheDirectoryMessage] = useState<string | null>(null);
  const [pendingAlbumMergeStrategy, setPendingAlbumMergeStrategy] = useState<AlbumMergeStrategy | null>(null);
  const [albumGroupingBusy, setAlbumGroupingBusy] = useState(false);
  const [albumGroupingMessage, setAlbumGroupingMessage] = useState<string | null>(null);
  const [libraryScanBusy, setLibraryScanBusy] = useState(false);
  const [libraryScanMessage, setLibraryScanMessage] = useState<string | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateTrackIndexSummary | null>(null);
  const [duplicateBusyAction, setDuplicateBusyAction] = useState<'toggle' | 'analyze' | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [fontFamilies, setFontFamilies] = useState<string[]>(fallbackFontFamilies);
  const [fontPickerTarget, setFontPickerTarget] = useState<FontPickerTarget | null>(null);
  const [fontPickerQuery, setFontPickerQuery] = useState('');
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerMessage, setDangerMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleNavItems = useMemo(() => {
    const query = settingsQuery.trim().toLowerCase();

    if (!query) {
      return settingsNavItems;
    }

    return settingsNavItems.filter((item) => `${t(item.labelKey)} ${t(item.descriptionKey)}`.toLowerCase().includes(query));
  }, [settingsQuery, t]);

  const compatibleDevices = useMemo(
    () => devices.filter((device) => (outputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')),
    [devices, outputMode],
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
    void refreshStatus();
    void refreshDevices();
    void refreshDiscordPresenceStatus();
    void refreshLastFmStatus();
    void refreshAccountStatuses();
    void refreshDuplicateSummary();
    const app = getAppBridge();
    const diagnostics = getDiagnosticsBridge();
    void app?.getSettings().then(setAppSettings).catch(() => undefined);
    void app?.getVersion().then(setAppVersion).catch(() => undefined);
    void app?.getDefaultCacheDirectory().then(setDefaultCacheDirectory).catch(() => undefined);
    void diagnostics?.getLastCrashSummary().then(setLastCrashSummary).catch(() => undefined);
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshAccountStatuses, refreshDevices, refreshDiscordPresenceStatus, refreshDuplicateSummary, refreshLastFmStatus, refreshStatus]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>>).detail;
      if (!patch || typeof patch !== 'object') {
        return;
      }

      setAppSettings((current) => (current ? { ...current, ...patch } : current));
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
  }, [status?.outputMode]);

  useEffect(() => {
    if (status?.outputDeviceId && devices.some((device) => device.id === status.outputDeviceId)) {
      setSelectedDeviceId(status.outputDeviceId);
    }
  }, [devices, status?.outputDeviceId]);

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
    if (compatibleDevices.length === 0) {
      setSelectedDeviceId('');
      return;
    }

    if (!compatibleDevices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(compatibleDevices.find((device) => device.isDefault)?.id ?? compatibleDevices[0].id);
    }
  }, [compatibleDevices, selectedDeviceId]);

  useEffect(() => {
    const queryLocalFonts = (navigator as NavigatorWithLocalFonts).queryLocalFonts;

    if (!queryLocalFonts) {
      return;
    }

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
  }, []);

  const applyOutputSettings = useCallback(
    async (nextOutputMode = outputMode, nextDeviceId = selectedDeviceId) => {
      const nextDevice =
        devices.find((device) => device.id === nextDeviceId && (nextOutputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')) ?? null;
      const output: AudioOutputSettings = {
        outputMode: nextOutputMode,
        latencyProfile: 'balanced',
      };

      if (nextDevice) {
        output.deviceIndex = nextDevice.index;
        output.deviceName = nextDevice.name;
      }

      const audio = getAudioBridge();

      if (!audio) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to change audio output.');
        return;
      }

      setStatus(await audio.setOutput(output));
    },
    [devices, outputMode, selectedDeviceId],
  );

  const handleNavClick = (key: SettingsNavKey): void => {
    setActiveSection(key);
    document.getElementById(`settings-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOutputModeChange = (nextMode: AudioOutputMode): void => {
    setOutputMode(nextMode);
    const nextDevices = devices.filter((device) => (nextMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared'));
    const nextDeviceId = nextDevices.find((device) => device.isDefault)?.id ?? nextDevices[0]?.id ?? '';
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(nextMode, nextDeviceId);
  };

  const handleDeviceChange = (nextDeviceId: string): void => {
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(outputMode, nextDeviceId);
  };

  const handleAppearanceChange = (nextPreferences: AppearancePreferences): void => {
    setAppearancePreferences(updateAppearancePreferences(nextPreferences));
  };

  const handleAppearanceReset = (): void => {
    handleAppearanceChange(defaultAppearancePreferences);
  };

  const dispatchSettingsChanged = (patch: Partial<AppSettings>): void => {
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: patch }));
  };

  const patchAppSettings = (patch: Partial<AppSettings>, options: { announce?: boolean } = {}): void => {
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
          dispatchSettingsChanged(settings);
        }
      })
      .catch((settingsError) => {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
      });
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

    if (!accountStatusByProvider[provider]?.connected && accountCookies[provider].trim().length === 0) {
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
      setDiagnosticsMessage(`诊断包已导出：${exportedPath}`);
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

  const toggleNetworkProvider = (provider: AppSettings['networkMetadataProviders'][number]): void => {
    const current = appSettings?.networkMetadataProviders ?? ['mock'];
    const next = current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider];
    patchAppSettings({ networkMetadataProviders: next.length ? next : ['mock'] });
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
            placeholder={t('settings.header.searchPlaceholder')}
          />
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

        <div className="settings-scroll-shell">
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
              <SettingRow title={t('settings.playback.outputDevice.title')} description={t('settings.playback.outputDevice.description')}>
                <label className="settings-select-field">
                  <select value={selectedDeviceId} onChange={(event) => handleDeviceChange(event.target.value)} disabled={compatibleDevices.length === 0}>
                    {compatibleDevices.length === 0 ? (
                      <option value="">{t('settings.playback.outputDevice.empty')}</option>
                    ) : (
                      compatibleDevices.map((device) => (
                        <option value={device.id} key={device.id}>
                          {device.index} - {device.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
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
              <SettingRow title={t('settings.playback.wireless.title')} description={t('settings.playback.wireless.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.playback.followCurrent.title')} description={t('settings.playback.followCurrent.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--audio-status"
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

            <SettingSection activeKey={activeSection} icon={Captions} id="lyrics" title={t('route.lyricsSettings.label')}>
              <LyricsSettingsPanel className="settings-lyrics-panel" variant="settings" />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Link2} id="integrations" title={t('settings.nav.integrations.label')}>
              <SettingRow title={t('settings.integrations.discord.title')} description={t('settings.integrations.discord.description')}>
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
              <SettingRow title={t('settings.integrations.smtc.title')} description={t('settings.integrations.smtc.description')}>
                <ToggleButton
                  active={appSettings?.smtcEnabled ?? true}
                  disabled={!appSettings}
                  onClick={() => patchAppSettings({ smtcEnabled: !(appSettings?.smtcEnabled ?? true) })}
                />
              </SettingRow>
              <SettingRow title={t('settings.integrations.lastfm.title')} description={t('settings.integrations.lastfm.description')}>
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
              <SettingRow title={t('settings.appearance.theme.title')} description={t('settings.appearance.theme.description')}>
                <div className="settings-chip-row">
                  <ChipButton active>{t('settings.appearance.theme.light')}</ChipButton>
                  <ChipButton>{t('settings.appearance.theme.dark')}</ChipButton>
                  <ChipButton>{t('settings.appearance.theme.followSystem')}</ChipButton>
                </div>
              </SettingRow>
              <SettingRow title={t('settings.appearance.density.title')} description={t('settings.appearance.density.description')}>
                <div className="settings-chip-row">
                  <ChipButton active>{t('settings.appearance.density.compact')}</ChipButton>
                  <ChipButton>{t('settings.appearance.density.standard')}</ChipButton>
                </div>
              </SettingRow>
              <SettingRow title="艺术家墙封面" description="用艺术家的一张专辑封面替代字母占位。">
                <ToggleButton active={appSettings?.artistWallAlbumArtwork ?? false} disabled={!appSettings} onClick={handleArtistWallAlbumArtworkToggle} />
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="自定义壁纸"
                description="保存原图文件，不压缩、不转码；默认完整显示不裁切。"
              >
                <div className="settings-cache-panel settings-cache-panel--app-wallpaper">
                  <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
                    <button className="settings-action-button" type="button" disabled={!appSettings} onClick={() => void handleAppWallpaperChoose()}>
                      <FolderOpen size={15} />
                      选择壁纸
                    </button>
                    {appSettings?.appCustomWallpaperPath ? (
                      <button className="settings-danger-button" type="button" onClick={handleAppWallpaperClear}>
                        <Trash2 size={15} />
                        清除壁纸
                      </button>
                    ) : null}
                  </div>
                  {appSettings?.appCustomWallpaperPath ? (
                    <>
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
                    </>
                  ) : null}
                </div>
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
              <LibraryFoldersPanel />
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
                      <strong>专辑名一致且封面一致时合并，适合合集、角色曲、手游专辑、Vocaloid 合集。</strong>
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
                title="Scan performance"
                description="Choose how many files ECHO Next reads in parallel during library scans."
              >
                <div className="settings-chip-row">
                  {[
                    ['low', 'Low impact'],
                    ['balanced', 'Balanced'],
                    ['performance', 'Performance'],
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
                  {(['netease-cloud-music', 'qq-music', 'musicbrainz', 'cover-art-archive', 'mock'] as AppSettings['networkMetadataProviders']).map((provider) => (
                    <ChipButton
                      active={(appSettings?.networkMetadataProviders ?? ['mock']).includes(provider)}
                      key={provider}
                      onClick={() => toggleNetworkProvider(provider)}
                    >
                      {networkProviderLabels[provider]}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <NetworkMetadataPanel />
              {isDevBuild ? <LibraryDiagnosticsPanel /> : null}
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Info} id="about" title={t('settings.nav.about.label')}>
              <SettingRow title="版本号" description="当前安装的 ECHO Next 版本。">
                <StatusText tone={appVersion ? 'neutral' : 'muted'}>{appVersion ?? t('common.checking')}</StatusText>
              </SettingRow>
              <SettingRow
                className="setting-row--full setting-row--compact-panel"
                title="Diagnostics / 崩溃报告"
                description="本地生成诊断包用于排查闪退、白屏、扫描失败和播放异常；不会自动上传。"
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
                      {diagnosticsBusy ? '导出中...' : '导出诊断包'}
                    </button>
                    <button className="settings-action-button" type="button" onClick={() => void handleDiagnosticsOpenFolder()}>
                      <FolderOpen size={15} />
                      打开日志目录
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

            <section className="settings-section settings-section--devices" data-visible={activeSection === 'playback'}>
              <div className="section-title">
                <Headphones size={18} />
                <h2>{t('settings.devices.title')}</h2>
              </div>
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
            </section>
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
