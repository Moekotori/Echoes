import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AudioStatus } from '../../shared/types/audio';
import {
  Album,
  ChevronLeft,
  ChevronRight,
  Folder,
  History,
  Library,
  ListMusic,
  Music2,
  Play,
  Radio,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LibrarySummary,
  LibraryTrack,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  PlaybackStatsDashboard,
  PlaybackStatsDay,
} from '../../shared/types/library';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useSharedPlaybackStatus } from '../stores/playbackStatusStore';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';
import type { AppRouteId } from '../app/routes';

const recentPageSize = 8;
const historyPageSize = 6;
const recentShelfPageSize = 4;
const weeklyHeatmapWeeks = 12;
const signalBarCount = 48;
const visualActiveStates = new Set<AudioStatus['state']>(['loading', 'playing']);

type HomeRouteId = Extract<AppRouteId, 'albums' | 'artists' | 'folders' | 'history' | 'inbox' | 'liked' | 'playlists' | 'queue' | 'songs'>;
type RecentPanelMode = 'added' | 'played';
type MetricTileProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  routeId: HomeRouteId;
};
type HomePageData = {
  summary: LibrarySummary;
  recentTracks: LibraryTrack[];
  recentHistory: PlaybackHistoryEntry[];
  historySummary: PlaybackHistorySummary | null;
  stats: PlaybackStatsDashboard | null;
};

const emptySummary: LibrarySummary = {
  songCount: 0,
  albumCount: 0,
  artistCount: 0,
  folderCount: 0,
  totalDuration: 0,
  lastScanAt: null,
};
const emptyHomePageData: HomePageData = {
  summary: emptySummary,
  recentTracks: [],
  recentHistory: [],
  historySummary: null,
  stats: null,
};
let cachedHomePageData: HomePageData | null = null;

export const resetHomePageCacheForTest = (): void => {
  cachedHomePageData = null;
};

const formatCompactNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 1000 ? 1 : 0, notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
};

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0 分钟';
  }

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
};

const formatShortDate = (value: string | null): string => {
  if (!value) {
    return '还没有记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
};

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
};

const compareDay = (left: Date, right: Date): number => startOfDay(left).getTime() - startOfDay(right).getTime();

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (date: Date): string => `${date.getMonth() + 1}月`;

const clampSignal = (value: number): number => Math.max(0, Math.min(1, value));

const dbToSignalUnit = (db: number | null | undefined): number | null => {
  if (db === null || db === undefined || !Number.isFinite(db)) {
    return null;
  }

  return clampSignal(Math.pow(10, db / 24));
};

const hashSignalSeed = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const seededSignalNoise = (seed: string, index: number): number => {
  const hash = hashSignalSeed(`${seed}:${index}`);
  return (hash % 1000) / 1000;
};

const startOfThisWeekQuery = (): PlaybackHistoryQuery => {
  const start = startOfWeek(new Date());

  return { from: start.toISOString(), to: addDays(start, 7).toISOString() };
};

const weeklyHeatmapQuery = (): PlaybackHistoryQuery => {
  const currentWeekStart = startOfWeek(new Date());
  const from = addDays(currentWeekStart, -7 * (weeklyHeatmapWeeks - 1));

  return { from: from.toISOString(), to: addDays(currentWeekStart, 7).toISOString() };
};

const navigateHomeRoute = (routeId: HomeRouteId): void => {
  window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: routeId }));
};

const homeArtworkUrl = (
  source: { coverId?: string | null; coverThumb?: string | null; coverSnapshot?: string | null },
  variant: 'album' | 'thumb' = 'album',
): string | null => {
  const fallback = source.coverThumb ?? source.coverSnapshot ?? null;
  if (source.coverId) {
    return `echo-cover://${variant}/${encodeURIComponent(source.coverId)}`;
  }

  return fallback?.replace(/^echo-cover:\/\/(?:thumb|album|large|original)\//u, `echo-cover://${variant}/`) ?? fallback;
};

const trackFromHistory = (entry: PlaybackHistoryEntry): LibraryTrack => ({
  id: entry.stableKey ?? entry.trackId ?? entry.id,
  mediaType: entry.mediaType,
  path: entry.mediaType === 'streaming' ? entry.stableKey ?? entry.trackPath : entry.trackPath,
  provider: entry.provider,
  providerTrackId: entry.providerTrackId,
  stableKey: entry.stableKey,
  title: entry.title,
  artist: entry.artist,
  album: entry.album,
  albumArtist: entry.albumArtist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: entry.durationSeconds,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: entry.coverId,
  coverThumb: entry.coverThumb ?? entry.coverSnapshot,
  fieldSources: {},
});

const Artwork = ({ coverThumb, title, size = 92 }: { coverThumb: string | null; title: string; size?: number }): JSX.Element => (
  <div className="home-artwork" data-empty={!coverThumb} style={{ '--home-artwork-size': `${size}px` } as CSSProperties}>
    {coverThumb ? <img alt="" src={coverThumb} /> : <Music2 size={Math.max(22, Math.round(size * 0.28))} />}
    <span className="sr-only">{title}</span>
  </div>
);

const MetricTile = ({ icon: Icon, label, value, detail, routeId }: MetricTileProps): JSX.Element => (
  <button className="home-metric-tile" type="button" aria-label={`打开${label}`} onClick={() => navigateHomeRoute(routeId)}>
    <Icon size={19} />
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  </button>
);

const SectionHeader = ({ title, actionLabel, routeId }: { title: string; actionLabel?: string; routeId?: HomeRouteId }): JSX.Element => (
  <header className="home-section-header">
    <h2>{title}</h2>
    {routeId && actionLabel ? (
      <button type="button" onClick={() => navigateHomeRoute(routeId)}>
        {actionLabel}
      </button>
    ) : null}
  </header>
);

const SignalVisualizer = ({ seed, status }: { seed: string; status: AudioStatus | null }): JSX.Element => {
  const audioLevels = status?.audioLevels ?? null;
  const isActive = visualActiveStates.has(status?.state ?? 'idle');
  const peakUnit = dbToSignalUnit(audioLevels?.estimatedOutputPeakDb ?? audioLevels?.inputPeakDb);
  const rmsUnit = dbToSignalUnit(audioLevels?.estimatedOutputRmsDb ?? audioLevels?.inputRmsDb);
  const peak = peakUnit ?? 0;
  const rms = rmsUnit ?? 0;
  const meterReady = Boolean(audioLevels);
  const signalSeed = seed;
  const energy = meterReady ? clampSignal(peak * 0.7 + rms * 0.64) : 0;
  const crest = meterReady ? clampSignal(Math.max(0, peak - rms) * 2.7 + peak * 0.18) : 0;
  const bars = Array.from({ length: signalBarCount }, (_, index) => {
    const coarse = seededSignalNoise(signalSeed, index);
    const fine = seededSignalNoise(signalSeed, index + 101);
    const transient = seededSignalNoise(`${signalSeed}:hit`, Math.floor(index / 2));
    const edgeDrop = Math.sin((index / Math.max(1, signalBarCount - 1)) * Math.PI);
    const hit = Math.max(0, (transient - 0.5) / 0.5);
    const jaggedProfile = 0.12 + coarse * 0.5 + fine * 0.24 + hit * crest * 0.62;
    const meterHeight = 3 + Math.round((energy * (0.14 + jaggedProfile) + edgeDrop * rms * 0.16 + hit * crest * 0.46) * 92);
    const idleHeight = 3 + Math.round((0.03 + coarse * 0.05) * 34);
    const height = meterReady && isActive ? meterHeight : idleHeight;
    const motion = meterReady && isActive ? 0.18 + coarse * 0.22 + crest * 0.28 + hit * 0.28 : 0.04 + coarse * 0.05;
    const minScale = Math.max(0.36, 1 - motion * 0.72);
    const maxScale = Math.min(1.18, 1 + motion * 0.44);
    const midScale = minScale + (maxScale - minScale) * (0.34 + fine * 0.22);

    return {
      delay: `${-(index % 17) * (0.045 + fine * 0.028)}s`,
      duration: `${420 + Math.round(coarse * 520)}ms`,
      height: `${Math.max(4, Math.min(96, height))}%`,
      maxScale: maxScale.toFixed(3),
      midScale: midScale.toFixed(3),
      minScale: minScale.toFixed(3),
      opacity: String(meterReady && isActive ? 0.42 + Math.min(0.5, energy * 0.34 + crest * 0.24 + hit * 0.18 + coarse * 0.1) : 0.12 + coarse * 0.08),
    };
  });

  return (
    <div className="home-signal-visualizer" data-active={isActive} data-meter-ready={meterReady} aria-label="音频可视化">
      <div className="home-signal-bars" aria-hidden="true">
        {bars.map((bar, index) => (
          <i
            key={index}
            style={
              {
                '--home-signal-delay': bar.delay,
                '--home-signal-duration': bar.duration,
                '--home-signal-height': bar.height,
                '--home-signal-max-scale': bar.maxScale,
                '--home-signal-mid-scale': bar.midScale,
                '--home-signal-min-scale': bar.minScale,
                '--home-signal-opacity': bar.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
};

const WeeklyHeatmap = ({ days }: { days: PlaybackStatsDay[] }): JSX.Element => {
  const today = startOfDay(new Date());
  const currentWeekStart = startOfWeek(today);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeklyHeatmapWeeks - 1));
  const gridEnd = addDays(currentWeekStart, 6);
  const activityByDate = new Map(days.map((day) => [day.date, day]));
  const cells: Array<{
    date: Date;
    dateKey: string;
    isFuture: boolean;
    playCount: number;
    playedSeconds: number;
  }> = [];

  for (let day = firstWeekStart; compareDay(day, gridEnd) <= 0; day = addDays(day, 1)) {
    const date = startOfDay(day);
    const dateKey = formatDateKey(date);
    const activity = activityByDate.get(dateKey);
    cells.push({
      date,
      dateKey,
      isFuture: compareDay(date, today) > 0,
      playCount: activity?.playCount ?? 0,
      playedSeconds: activity?.playedSeconds ?? 0,
    });
  }

  const weeks = Array.from({ length: weeklyHeatmapWeeks }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const maxCount = Math.max(...cells.map((day) => day.playCount), 1);
  const monthStarts = weeks.reduce<Array<{ label: string; month: number; span: number; week: number; year: number }>>((labels, week, weekIndex) => {
    const firstDay = week[0]?.date;

    if (!firstDay) {
      return labels;
    }

    const lastLabel = labels.at(-1);
    if (!lastLabel || firstDay.getMonth() !== lastLabel.month || firstDay.getFullYear() !== lastLabel.year) {
      labels.push({
        label: formatMonthLabel(firstDay),
        month: firstDay.getMonth(),
        span: 1,
        week: weekIndex,
        year: firstDay.getFullYear(),
      });
      return labels;
    }

    lastLabel.span += 1;
    return labels;
  }, []);
  const activeWeeks = weeks.filter((week) => week.some((day) => !day.isFuture && day.playCount > 0)).length;
  const getLevel = (count: number): number => {
    if (count <= 0) {
      return 0;
    }

    const ratio = count / maxCount;
    if (ratio >= 0.8) {
      return 4;
    }
    if (ratio >= 0.55) {
      return 3;
    }
    if (ratio >= 0.25) {
      return 2;
    }
    return 1;
  };

  return (
    <div className="home-week-heatmap">
      <div className="home-week-months" style={{ gridTemplateColumns: `24px repeat(${weeklyHeatmapWeeks}, var(--home-week-cell))` }}>
        {monthStarts.map((month) => (
          <span key={`${month.year}-${month.month}`} style={{ gridColumn: `${month.week + 2} / span ${month.span}` }}>
            {month.label}
          </span>
        ))}
      </div>
      <div className="home-week-grid-shell">
        <div className="home-weekdays" aria-hidden="true">
          <span>一</span>
          <span />
          <span>三</span>
          <span />
          <span>五</span>
          <span />
          <span />
        </div>
        <div
          className="home-week-grid"
          style={{ gridTemplateColumns: `repeat(${weeklyHeatmapWeeks}, var(--home-week-cell))` }}
          aria-label={`近 ${weeklyHeatmapWeeks} 周播放热力图`}
        >
          {cells.map((day) => (
            <span
              className="home-week-cell"
              data-future={day.isFuture ? 'true' : undefined}
              data-level={day.isFuture ? 0 : getLevel(day.playCount)}
              key={day.dateKey}
              title={`${day.dateKey} · ${day.playCount} 次 · ${formatDuration(day.playedSeconds)}`}
              aria-label={`${day.dateKey}，${day.playCount} 次播放`}
            />
          ))}
        </div>
      </div>
      <div className="home-week-legend" aria-hidden="true">
        <span>{activeWeeks} 周活跃</span>
        <i data-level={0} />
        <i data-level={1} />
        <i data-level={2} />
        <i data-level={3} />
        <i data-level={4} />
      </div>
    </div>
  );
};

export const HomePage = (): JSX.Element => {
  const queue = usePlaybackQueue();
  const playbackStatusSnapshot = useSharedPlaybackStatus();
  const initialHomeData = cachedHomePageData ?? emptyHomePageData;
  const [summary, setSummary] = useState<LibrarySummary>(initialHomeData.summary);
  const [recentTracks, setRecentTracks] = useState<LibraryTrack[]>(initialHomeData.recentTracks);
  const [recentHistory, setRecentHistory] = useState<PlaybackHistoryEntry[]>(initialHomeData.recentHistory);
  const [historySummary, setHistorySummary] = useState<PlaybackHistorySummary | null>(initialHomeData.historySummary);
  const [stats, setStats] = useState<PlaybackStatsDashboard | null>(initialHomeData.stats);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentPanelMode, setRecentPanelMode] = useState<RecentPanelMode>('added');
  const [recentShelfPage, setRecentShelfPage] = useState(0);
  const requestIdRef = useRef(0);
  const pulseRequestIdRef = useRef(0);

  const focusTrack = queue.currentTrack ?? queue.lastPlayedTrack ?? recentTracks[0] ?? (recentHistory[0] ? trackFromHistory(recentHistory[0]) : null);
  const audioStatus = playbackStatusSnapshot.audioStatus;
  const topArtist = stats?.topArtists[0]?.artist ?? focusTrack?.artist ?? 'ECHO';

  const playTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      try {
        await queue.playTrack(track, {
          replaceQueueWith: recentTracks.length > 0 ? recentTracks.filter((candidate) => !candidate.unavailable) : undefined,
          source: { type: 'manual', label: 'ECHO Home' },
        });
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [queue, recentTracks],
  );

  const openTrackAlbum = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      const album = await openAlbumDetailForTrack(track);
      if (!album) {
        setError(`未找到专辑：${track.album || 'Unknown Album'}`);
      }
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    }
  }, []);

  const loadLibraryPulse = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = pulseRequestIdRef.current + 1;
    pulseRequestIdRef.current = requestId;

    if (!library?.getSummary || !library.getTracks) {
      return;
    }

    try {
      const [nextSummary, tracksPage] = await Promise.all([
        library.getSummary(),
        library.getTracks({ page: 1, pageSize: recentPageSize, sort: 'recent' }),
      ]);

      if (pulseRequestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        ...(cachedHomePageData ?? emptyHomePageData),
        summary: nextSummary,
        recentTracks: tracksPage.items,
      };
      setSummary(nextSummary);
      setRecentTracks(tracksPage.items);
    } catch (loadError) {
      if (pulseRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    }
  }, []);

  const loadHome = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    if (!library?.getSummary || !library.getTracks || !library.getPlaybackHistory || !library.getPlaybackHistorySummary) {
      setSummary(emptySummary);
      setRecentTracks([]);
      setRecentHistory([]);
      setHistorySummary(null);
      setStats(null);
      setError('桌面曲库桥接不可用。请在 ECHO Next 桌面端查看主页。');
      setIsLoading(false);
      return;
    }

    const weekQuery = startOfThisWeekQuery();
    const heatmapQuery = weeklyHeatmapQuery();

    try {
      const [nextSummary, tracksPage, historyPage, nextHistorySummary, nextStats] = await Promise.all([
        library.getSummary(),
        library.getTracks({ page: 1, pageSize: recentPageSize, sort: 'recent' }),
        library.getPlaybackHistory({ page: 1, pageSize: historyPageSize }),
        library.getPlaybackHistorySummary(weekQuery),
        library.getPlaybackStatsDashboard?.(heatmapQuery) ?? Promise.resolve(null),
      ]);

      if (requestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        summary: nextSummary,
        recentTracks: tracksPage.items,
        recentHistory: historyPage.items,
        historySummary: nextHistorySummary,
        stats: nextStats,
      };
      setSummary(nextSummary);
      setRecentTracks(tracksPage.items);
      setRecentHistory(historyPage.items);
      setHistorySummary(nextHistorySummary);
      setStats(nextStats);
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (cachedHomePageData === null) {
      void loadHome();
    }
  }, [loadHome]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      void loadLibraryPulse();
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadLibraryPulse]);

  useEffect(() => {
    setRecentShelfPage(0);
  }, [recentPanelMode]);

  useEffect(() => {
    const itemCount = recentPanelMode === 'added' ? recentTracks.length : recentHistory.length;
    const lastPage = Math.max(0, Math.ceil(itemCount / recentShelfPageSize) - 1);
    setRecentShelfPage((currentPage) => Math.min(currentPage, lastPage));
  }, [recentPanelMode, recentHistory.length, recentTracks.length]);

  const pulseTiles = useMemo<MetricTileProps[]>(
    () => [
      { icon: Music2, label: '歌曲', value: formatCompactNumber(summary.songCount), detail: `总时长 ${formatDuration(summary.totalDuration)}`, routeId: 'songs' },
      { icon: Album, label: '专辑', value: formatCompactNumber(summary.albumCount), detail: '按作品聚合', routeId: 'albums' },
      { icon: UserRound, label: '艺术家', value: formatCompactNumber(summary.artistCount), detail: topArtist, routeId: 'artists' },
      { icon: Folder, label: '文件夹', value: formatCompactNumber(summary.folderCount), detail: `最近扫描 ${formatShortDate(summary.lastScanAt)}`, routeId: 'folders' },
    ],
    [summary, topArtist],
  );

  const weeklyPlayCount = historySummary?.rangeCount ?? stats?.totals.playCount ?? 0;
  const weeklyDuration = historySummary?.rangePlayedSeconds ?? stats?.totals.playedSeconds ?? 0;
  const hasWeeklyActivity = weeklyPlayCount > 0 || weeklyDuration > 0 || (stats?.dailyActivity.some((day) => day.playCount > 0 || day.playedSeconds > 0) ?? false);
  const recentActionRouteId: HomeRouteId = recentPanelMode === 'added' ? 'songs' : 'history';
  const recentActionLabel = recentPanelMode === 'added' ? '更多歌曲' : '完整历史';
  const activeRecentItemCount = recentPanelMode === 'added' ? recentTracks.length : recentHistory.length;
  const recentTotalPages = Math.max(1, Math.ceil(activeRecentItemCount / recentShelfPageSize));
  const recentPageStart = recentShelfPage * recentShelfPageSize;
  const visibleRecentTracks = recentTracks.slice(recentPageStart, recentPageStart + recentShelfPageSize);
  const visibleRecentHistory = recentHistory.slice(recentPageStart, recentPageStart + recentShelfPageSize);

  return (
    <div className="home-page">
      <section className="home-hero" aria-label="今日回声">
        <div className="home-hero-copy">
          <span className="home-signal-label">
            <Radio size={15} />
            今日回声
          </span>
          <h1>让你的曲库先醒过来。</h1>
          <p>
            {focusTrack
              ? `接上 ${focusTrack.artist || '未知艺术家'} 的「${focusTrack.title}」，或者从最近入库里挑一张封面开始。`
              : '导入音乐后，这里会变成你的曲库入口、最近播放和本周聆听脉冲。'}
          </p>
          <div className="home-hero-actions">
            <button className="home-primary-action" type="button" disabled={!focusTrack} onClick={() => focusTrack && void playTrack(focusTrack)}>
              <Play size={17} fill="currentColor" />
              继续播放
            </button>
            <button className="home-secondary-action" type="button" onClick={() => navigateHomeRoute('queue')}>
              <ListMusic size={17} />
              查看队列
            </button>
          </div>
        </div>

        <div className="home-now-card" data-empty={!focusTrack}>
          <div className="home-now-artwork-stack">
            <Artwork coverThumb={focusTrack ? homeArtworkUrl(focusTrack, 'album') : null} title={focusTrack?.title ?? '暂无播放'} size={132} />
          </div>
          <div className="home-now-copy">
            <span>{queue.currentTrack ? '正在播放' : '最近信号'}</span>
            <strong>{focusTrack?.title ?? '暂无播放'}</strong>
            <small>{focusTrack ? `${focusTrack.artist || '未知艺术家'} · ${focusTrack.album || '未知专辑'}` : '曲库准备好后会显示最近内容'}</small>
          </div>
          <SignalVisualizer seed={audioStatus?.currentTrackId ?? focusTrack?.id ?? focusTrack?.path ?? focusTrack?.title ?? 'idle'} status={audioStatus} />
        </div>
      </section>

      <section className="home-pulse" aria-label="曲库统计">
        <div className="home-metric-grid">
          {pulseTiles.map((tile) => (
            <MetricTile key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      <section className="home-content-grid">
        <div className="home-panel home-recent-panel" data-mode={recentPanelMode}>
          <header className="home-section-header home-recent-header">
            <div className="home-recent-title-row">
              <h2>最近活动</h2>
              <div className="home-segmented-control" role="tablist" aria-label="最近内容">
                <button type="button" role="tab" aria-selected={recentPanelMode === 'played'} data-active={recentPanelMode === 'played'} onClick={() => setRecentPanelMode('played')}>
                  已播放
                </button>
                <button type="button" role="tab" aria-selected={recentPanelMode === 'added'} data-active={recentPanelMode === 'added'} onClick={() => setRecentPanelMode('added')}>
                  添加于
                </button>
              </div>
            </div>
            <div className="home-activity-actions">
              <button
                className="home-shelf-arrow"
                type="button"
                aria-label="上一页"
                disabled={recentShelfPage <= 0}
                onClick={() => setRecentShelfPage((page) => Math.max(0, page - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="home-shelf-arrow"
                type="button"
                aria-label="下一页"
                disabled={recentShelfPage >= recentTotalPages - 1}
                onClick={() => setRecentShelfPage((page) => Math.min(recentTotalPages - 1, page + 1))}
              >
                <ChevronRight size={15} />
              </button>
              <button type="button" onClick={() => navigateHomeRoute(recentActionRouteId)}>
                {recentActionLabel}
              </button>
            </div>
          </header>

          {recentPanelMode === 'added' ? (
            recentTracks.length > 0 ? (
              <div className="home-cover-rail">
                {visibleRecentTracks.map((track) => (
                  <button className="home-cover-card" key={track.id} type="button" onClick={() => void openTrackAlbum(track)}>
                    <Artwork coverThumb={homeArtworkUrl(track, 'album')} title={track.title} size={176} />
                    <strong>{track.title}</strong>
                    <span>{track.artist || '未知艺术家'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="home-empty-panel">
                <Library size={24} />
                <strong>还没有最近入库</strong>
                <span>导入文件夹后，这里会显示最新进入曲库的封面。</span>
              </div>
            )
          ) : recentHistory.length > 0 ? (
            <div className="home-cover-rail home-played-rail">
              {visibleRecentHistory.map((entry) => (
                <button className="home-cover-card" key={entry.id} type="button" onClick={() => void openTrackAlbum(trackFromHistory(entry))}>
                  <Artwork coverThumb={homeArtworkUrl(entry, 'album')} title={entry.title} size={156} />
                  <strong>{entry.title}</strong>
                  <span>{entry.artist || '未知艺术家'} · {formatShortDate(entry.startedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="home-empty-panel">
              <History size={24} />
              <strong>还没有最近播放</strong>
              <span>开始播放后，这里会出现最近听过的封面。</span>
            </div>
          )}
        </div>

        <div className="home-panel home-week-panel" data-empty={!hasWeeklyActivity}>
          <SectionHeader title="本周回声" actionLabel="播放历史" routeId="history" />
          <div className="home-week-summary">
            <div className="home-week-stat">
              <span>本周播放</span>
              <strong>{formatCompactNumber(weeklyPlayCount)}</strong>
              <small>次</small>
            </div>
            <div className="home-week-stat">
              <span>聆听时长</span>
              <strong>{formatDuration(weeklyDuration)}</strong>
            </div>
          </div>
          <WeeklyHeatmap days={stats?.dailyActivity ?? []} />
          {!hasWeeklyActivity ? (
            <p className="home-week-hint">播放后，格子会按每周节奏被点亮。</p>
          ) : null}
        </div>
      </section>

      {error || isLoading ? (
        <p className="home-status-line" role={error ? 'alert' : 'status'}>
          {error ?? '正在整理主页...'}
        </p>
      ) : null}
    </div>
  );
};
