import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Database,
  EyeOff,
  Globe2,
  GripVertical,
  Image as ImageIcon,
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
import type { LyricsProviderId, LyricsSource } from '../../../shared/types/lyrics';

type LyricsSettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

const drawerExitAnimationMs = 320;

type LyricsDrawerSettings = Pick<
  AppSettings,
  | 'lyricsNetworkEnabled'
  | 'lyricsAutoSearch'
  | 'lyricsAutoAcceptScore'
  | 'lyricsDefaultOffsetMs'
  | 'lyricsPreferredProvider'
  | 'lyricsEnabledProviders'
  | 'lyricsProviderOrder'
  | 'lyricsDeepSearchEnabled'
  | 'lyricsEnabled'
  | 'lyricsHeaderHidden'
  | 'lyricsEmptyStateHidden'
  | 'lyricsRomanizationEnabled'
  | 'lyricsFontSizePx'
  | 'lyricsColor'
  | 'lyricsBackgroundMode'
  | 'lyricsCustomWallpaperPath'
  | 'lyricsCoverOpacityPercent'
  | 'lyricsCoverBlurPx'
  | 'lyricsCoverBrightnessPercent'
  | 'lyricsBackgroundScalePercent'
>;

const fallbackSettings: LyricsDrawerSettings = {
  lyricsNetworkEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.7,
  lyricsDefaultOffsetMs: 0,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsFontSizePx: 36,
  lyricsColor: '#314054',
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
};

const colorSwatches = ['#314054', '#FFFFFF', '#F6D365', '#8FCFBD', '#A8C7FA', '#FF8A80'];
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

const dispatchSettingsChanged = (patch?: Partial<AppSettings>): void => {
  window.dispatchEvent(patch ? new CustomEvent('settings:changed', { detail: patch }) : new Event('settings:changed'));
};

const dispatchLyricsDisplaySettingsChanged = (patch: Partial<AppSettings>): void => {
  window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', { detail: patch }));
};

const dispatchLyricsAction = (action: 'search' | 'rematch', query?: string): void => {
  const eventName = action === 'search' ? 'lyrics:search-requested' : 'lyrics:rematch-requested';
  const normalizedQuery = query?.trim();
  window.dispatchEvent(normalizedQuery ? new CustomEvent(eventName, { detail: { query: normalizedQuery } }) : new Event(eventName));
};

const selectLyricsSettings = (settings: AppSettings): LyricsDrawerSettings => ({
  lyricsNetworkEnabled: settings.lyricsNetworkEnabled,
  lyricsAutoSearch: settings.lyricsAutoSearch,
  lyricsAutoAcceptScore: settings.lyricsAutoAcceptScore,
  lyricsDefaultOffsetMs: settings.lyricsDefaultOffsetMs,
  lyricsPreferredProvider: settings.lyricsPreferredProvider,
  lyricsEnabledProviders: settings.lyricsEnabledProviders?.length ? settings.lyricsEnabledProviders : defaultLyricsEnabledProviders,
  lyricsProviderOrder: settings.lyricsProviderOrder?.length ? settings.lyricsProviderOrder : defaultLyricsProviderOrder,
  lyricsDeepSearchEnabled: settings.lyricsDeepSearchEnabled !== false,
  lyricsEnabled: settings.lyricsEnabled,
  lyricsHeaderHidden: settings.lyricsHeaderHidden,
  lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden,
  lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled,
  lyricsFontSizePx: settings.lyricsFontSizePx,
  lyricsColor: settings.lyricsColor,
  lyricsBackgroundMode: settings.lyricsBackgroundMode,
  lyricsCustomWallpaperPath: settings.lyricsCustomWallpaperPath,
  lyricsCoverOpacityPercent: settings.lyricsCoverOpacityPercent,
  lyricsCoverBlurPx: settings.lyricsCoverBlurPx,
  lyricsCoverBrightnessPercent: settings.lyricsCoverBrightnessPercent,
  lyricsBackgroundScalePercent: settings.lyricsBackgroundScalePercent,
});

export const LyricsSettingsDrawer = ({ isOpen, onClose }: LyricsSettingsDrawerProps): JSX.Element | null => {
  const [settings, setSettings] = useState<LyricsDrawerSettings | null>(null);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isMotionOpen, setIsMotionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [currentLyricsProviderLabel, setCurrentLyricsProviderLabel] = useState(providerLabelFor(null));
  const [draggingSourceId, setDraggingSourceId] = useState<LyricsProviderId | null>(null);
  const [isBackgroundControlsOpen, setIsBackgroundControlsOpen] = useState(true);
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState('');
  const saveRequestIdRef = useRef(0);
  const debouncedSaveRequestIdRef = useRef(0);
  const debouncedSaveTimerRef = useRef<number | null>(null);
  const pendingDebouncedSettingsRef = useRef<Partial<AppSettings>>({});

  const effectiveSettings = settings ?? fallbackSettings;
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
  const thresholdPercent = Math.round(effectiveSettings.lyricsAutoAcceptScore * 100);
  const offsetSeconds = useMemo(() => (effectiveSettings.lyricsDefaultOffsetMs / 1000).toFixed(1), [effectiveSettings.lyricsDefaultOffsetMs]);

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
        return;
      }

      const trackLyrics = await lyrics.getForTrack(trackId);
      setCurrentLyricsProviderLabel(providerLabelFor(trackLyrics?.provider));
    } catch {
      setCurrentLyricsProviderLabel(providerLabelFor(null));
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

  const refreshDrawerSummary = useCallback(async (): Promise<void> => {
    await Promise.all([loadSettings(), loadCurrentLyricsProvider()]);
  }, [loadCurrentLyricsProvider, loadSettings]);

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
    }

    setIsBusy(true);
    try {
      const nextSettings = await app.setSettings(patch);
      if (requestId === saveRequestIdRef.current) {
        const nextLyricsSettings = selectLyricsSettings(nextSettings);
        setSettings(nextLyricsSettings);
        setError(null);
        dispatchSettingsChanged(nextLyricsSettings);
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
        setSettings(nextLyricsSettings);
        setError(null);
        dispatchSettingsChanged(nextLyricsSettings);
      }
    } catch (settingsError) {
      if (requestId === debouncedSaveRequestIdRef.current) {
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        dispatchSettingsChanged();
      }
    }
  }, []);

  const patchSettingsDebounced = useCallback(
    (patch: Partial<AppSettings>): void => {
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
        dispatchSettingsChanged(nextLyricsSettings);
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
    if (isOpen) {
      void refreshDrawerSummary();
    }
  }, [isOpen, refreshDrawerSummary]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleCurrentLyricsProviderChanged = (event: Event): void => {
      const provider = (event as CustomEvent<{ provider?: LyricsSource | null }>).detail?.provider;
      setCurrentLyricsProviderLabel(providerLabelFor(provider));
    };

    window.addEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
    return () => window.removeEventListener('lyrics:current-provider-changed', handleCurrentLyricsProviderChanged);
  }, [isOpen]);

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
        <header className="audio-drawer-header">
          <div>
            <SlidersHorizontal size={18} />
            <h2>歌词设置</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label="关闭歌词设置" title="关闭歌词设置" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

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
                disabled={isBusy || !effectiveSettings.lyricsEnabled}
                placeholder="歌名 / 艺术家 / 关键词"
                aria-label="搜索歌词文本"
                onChange={(event) => setLyricsSearchQuery(event.currentTarget.value)}
              />
            </div>
            <button type="submit" disabled={isBusy || !effectiveSettings.lyricsEnabled}>
              Search
            </button>
          </form>

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy || !effectiveSettings.lyricsEnabled}
            onClick={() => dispatchLyricsAction('rematch')}
          >
            <RotateCcw size={15} />
            <span>
              <strong>重新匹配</strong>
              <small>清理当前缓存并重新查找</small>
            </span>
            <em>Match</em>
          </button>
        </section>

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

          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>隐藏歌曲信息</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsHeaderHidden}
              disabled={isBusy || !effectiveSettings.lyricsEnabled}
              onChange={(event) => void patchSettings({ lyricsHeaderHidden: event.currentTarget.checked })}
            />
          </label>
          <p>隐藏歌词页左上角封面、歌名和艺术家信息；底部播放栏仍会显示当前歌曲。</p>

          <label className="audio-toggle-row">
            <span>
              <EyeOff size={17} />
              <strong>隐藏纯音乐提示</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsEmptyStateHidden}
              disabled={isBusy || !effectiveSettings.lyricsEnabled}
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
              disabled={isBusy || !effectiveSettings.lyricsEnabled}
              onChange={(event) => void patchSettings({ lyricsRomanizationEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>优先使用歌词源提供的罗马音；没有时会为日文歌词本地生成。</p>

          <label className="lyrics-drawer-range">
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
              onChange={(event) => void patchSettings({ lyricsFontSizePx: Number(event.currentTarget.value) })}
            />
          </label>

          <div className="lyrics-color-panel">
            <div className="lyrics-color-panel__header">
              <span>
                <Palette size={15} />
                <strong>歌词颜色</strong>
              </span>
              <label className="lyrics-color-input" title="选择歌词颜色">
                <input
                  type="color"
                  value={effectiveSettings.lyricsColor}
                  disabled={isBusy}
                  onChange={(event) => void patchSettings({ lyricsColor: event.currentTarget.value })}
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
          </div>
        </section>

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <ImageIcon size={17} />
            <h3>歌词背景</h3>
          </div>

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

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <TimerReset size={17} />
            <h3>匹配与时间轴</h3>
          </div>

          <label className="lyrics-drawer-range">
            <span>
              <strong>自动接受阈值</strong>
              <em>{thresholdPercent}%</em>
            </span>
            <input
              type="range"
              min={50}
              max={70}
              step={1}
              value={thresholdPercent}
              onChange={(event) => void patchSettings({ lyricsAutoAcceptScore: Number(event.currentTarget.value) / 100 })}
            />
          </label>

          <label className="lyrics-drawer-range">
            <span>
              <strong>默认歌词偏移</strong>
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

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy}
            onClick={() => void patchSettings({ lyricsAutoAcceptScore: 0.7, lyricsDefaultOffsetMs: 0 })}
          >
            <RotateCcw size={15} />
            <span>
              <strong>恢复歌词默认值</strong>
              <small>阈值 70% / 偏移 0ms</small>
            </span>
            <em>Reset</em>
          </button>
        </section>

        {error ? <p className="audio-drawer-error">{error}</p> : null}
      </aside>
    </div>
  );
};
