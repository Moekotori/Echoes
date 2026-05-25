import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, CalendarDays, Clock3, Disc3, ListX, Music2, Play, Plus, Radio, Search, Trash2, Trophy } from 'lucide-react';
import type {
  LibraryTrack,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  PlaybackStatsArtist,
  PlaybackStatsBreakdownItem,
  PlaybackStatsDashboard,
  PlaybackStatsDay,
  PlaybackStatsTrack,
} from '../../shared/types/library';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

const pageSize = 50;

type HistoryFilter = 'all' | 'today' | 'week' | 'month' | 'completed';

const filterLabels: Record<HistoryFilter, string> = {
  all: '全部',
  today: '今天',
  week: '本周',
  month: '本月',
  completed: '只看完整播放',
};

const filterSummaryLabels: Record<HistoryFilter, { count: string; duration: string; tracks: string; latest: string; group: string }> = {
  all: {
    count: '总播放',
    duration: '总时长',
    tracks: '历史曲目',
    latest: '最近播放时间',
    group: '按播放次数排序',
  },
  today: {
    count: '今日播放',
    duration: '今日时长',
    tracks: '今日曲目',
    latest: '今日最近播放',
    group: '今日按播放次数排序',
  },
  week: {
    count: '本周播放',
    duration: '本周时长',
    tracks: '本周曲目',
    latest: '本周最近播放',
    group: '本周按播放次数排序',
  },
  month: {
    count: '本月播放',
    duration: '本月时长',
    tracks: '本月曲目',
    latest: '本月最近播放',
    group: '本月按播放次数排序',
  },
  completed: {
    count: '完整播放',
    duration: '完整播放时长',
    tracks: '完整播放曲目',
    latest: '最近完整播放',
    group: '按完整播放次数排序',
  },
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

const compareDay = (left: Date, right: Date): number =>
  startOfDay(left).getTime() - startOfDay(right).getTime();

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
};

const historyFilterRange = (filter: HistoryFilter): Pick<PlaybackHistoryQuery, 'from' | 'to' | 'completedOnly'> => {
  const now = new Date();
  const today = startOfDay(now);

  if (filter === 'today') {
    return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
  }

  if (filter === 'week') {
    const week = startOfWeek(today);
    return { from: week.toISOString(), to: addDays(week, 7).toISOString() };
  }

  if (filter === 'month') {
    const month = new Date(today);
    month.setDate(1);
    const nextMonth = new Date(month);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return { from: month.toISOString(), to: nextMonth.toISOString() };
  }

  if (filter === 'completed') {
    return { completedOnly: true };
  }

  return {};
};

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--';
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const formatLongDuration = (seconds: number): string => {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
};

const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const formatPlayCount = (count: number): string => {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 0));
  return `播放 ${safeCount.toLocaleString()} 次`;
};

const formatCompactCount = (count: number): string => Math.max(0, Math.round(count)).toLocaleString();

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '暂无';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

const formatDayLabel = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(parsed);
};

const formatMonthLabel = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);

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
  duration: entry.durationSnapshot ?? entry.durationSeconds,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: entry.coverId,
  coverThumb: entry.coverSnapshot ?? entry.coverThumb,
  fieldSources: {},
});

export const HistoryPage = (): JSX.Element => {
  const queue = usePlaybackQueue();
  const [items, setItems] = useState<PlaybackHistoryEntry[]>([]);
  const [summary, setSummary] = useState<PlaybackHistorySummary | null>(null);
  const [stats, setStats] = useState<PlaybackStatsDashboard | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadHistory = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      const library = window.echo?.library;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      if (!library) {
        setItems([]);
        setSummary(null);
        setStats(null);
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to read playback history.');
        setIsLoading(false);
        return;
      }

      try {
        const rangeQuery = historyFilterRange(filter);
        const historyQuery = {
          page: nextPage,
          pageSize,
          search,
          ...rangeQuery,
        };
        const [historyResult, nextSummary, nextStats] = await Promise.all([
          library.getPlaybackHistory(historyQuery),
          library.getPlaybackHistorySummary(historyQuery),
          library.getPlaybackStatsDashboard?.(historyQuery) ?? Promise.resolve(null),
        ]);

        if (requestIdRef.current !== requestId) {
          return;
        }

        setItems((current) => (mode === 'append' ? [...current, ...historyResult.items] : historyResult.items));
        setPage(historyResult.page);
        setTotal(historyResult.total);
        setHasMore(historyResult.hasMore);
        setSummary(nextSummary);
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
    },
    [filter, search],
  );

  useEffect(() => {
    void loadHistory(1, 'replace');
  }, [loadHistory]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasMore) {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isLoading) {
        void loadHistory(page + 1, 'append');
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadHistory, page]);

  const summaryLabels = filterSummaryLabels[filter];
  const groupedItems = useMemo(() => (items.length > 0 ? [[filterSummaryLabels[filter].group, items] as const] : []), [filter, items]);

  const handleDeleteEntry = useCallback(
    async (entry: PlaybackHistoryEntry): Promise<void> => {
      try {
        await window.echo?.library?.deletePlaybackHistoryEntry(entry.id);
        setItems((current) => current.filter((item) => item.id !== entry.id));
        setTotal((current) => Math.max(0, current - 1));
        setSummary(await window.echo?.library?.getPlaybackHistorySummary?.({ search, ...historyFilterRange(filter) }) ?? null);
        setStats(await window.echo?.library?.getPlaybackStatsDashboard?.({ search, ...historyFilterRange(filter) }) ?? null);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      }
    },
    [filter, search],
  );

  const handleClearHistory = useCallback(async (): Promise<void> => {
    if (!window.confirm('清空播放历史？这不会删除你的音乐文件，也不会清空曲库。')) {
      return;
    }

    try {
      await window.echo?.library?.clearPlaybackHistory();
      setItems([]);
      setPage(1);
      setTotal(0);
      setHasMore(false);
      setSummary(await window.echo?.library?.getPlaybackHistorySummary?.({ search, ...historyFilterRange(filter) }) ?? null);
      setStats(await window.echo?.library?.getPlaybackStatsDashboard?.({ search, ...historyFilterRange(filter) }) ?? null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    }
  }, [filter, search]);

  const handlePlay = useCallback(
    async (entry: PlaybackHistoryEntry): Promise<void> => {
      try {
        await queue.playTrack(trackFromHistory(entry), {
          forceNewQueueItem: true,
          source: { type: 'manual', label: '播放历史' },
        });
        setItems((current) =>
          current
            .map((item) => (item.id === entry.id ? { ...item, playCount: item.playCount + 1, startedAt: new Date().toISOString() } : item))
            .sort((left, right) => right.playCount - left.playCount || Date.parse(right.startedAt) - Date.parse(left.startedAt)),
        );
        setSummary(await window.echo?.library?.getPlaybackHistorySummary?.({ search, ...historyFilterRange(filter) }) ?? null);
        setStats(await window.echo?.library?.getPlaybackStatsDashboard?.({ search, ...historyFilterRange(filter) }) ?? null);
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [filter, queue, search],
  );

  const handleAddToQueue = useCallback(
    (entry: PlaybackHistoryEntry): void => {
      queue.appendToQueue(trackFromHistory(entry), { type: 'manual', label: '播放历史' });
    },
    [queue],
  );

  return (
    <div className="history-page">
      <header className="history-header">
        <div>
          <span className="section-kicker">最近播放记录</span>
          <h1>历史</h1>
        </div>
        <button className="history-danger-button" type="button" disabled={total === 0} onClick={() => void handleClearHistory()}>
          <ListX size={16} />
          清空历史
        </button>
      </header>

      <section className="history-toolbar" aria-label="历史筛选">
        <label className="history-search">
          <Search size={17} />
          <input type="search" placeholder="搜索标题、艺术家、专辑或路径" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <div className="history-filter-tabs">
          {(Object.keys(filterLabels) as HistoryFilter[]).map((value) => (
            <button key={value} className={filter === value ? 'active' : ''} type="button" onClick={() => setFilter(value)}>
              {filterLabels[value]}
            </button>
          ))}
        </div>
      </section>

      <section className="history-summary-grid" aria-label="历史概览">
        <HistoryMetric icon={<CalendarDays size={18} />} label={summaryLabels.count} value={`${summary?.rangeCount ?? 0} 次`} />
        <HistoryMetric icon={<Clock3 size={18} />} label={summaryLabels.duration} value={formatLongDuration(summary?.rangePlayedSeconds ?? 0)} />
        <HistoryMetric icon={<Music2 size={18} />} label={summaryLabels.tracks} value={`${total.toLocaleString()} 首`} />
        <HistoryMetric icon={<Clock3 size={18} />} label={summaryLabels.latest} value={formatDate(summary?.rangeLatestPlayedAt ?? null)} />
      </section>

      <PlaybackStatsDashboardView stats={stats} />

      <section className="history-list-section" aria-label="播放历史列表">
        {groupedItems.length > 0 ? (
          groupedItems.map(([label, entries]) => (
            <div className="history-day-group" key={label}>
              <h2>{label}</h2>
              <div className="history-list" role="list">
                {entries.map((entry) => (
                  <article
                    className="history-row"
                    key={entry.id}
                    role="listitem"
                    title="双击播放"
                    onDoubleClick={() => void handlePlay(entry)}
                  >
                    <div className="history-cover" data-empty={!entry.coverThumb}>
                      {entry.coverThumb ? <img alt="" src={entry.coverThumb} /> : <Music2 size={20} />}
                    </div>
                    <div className="history-copy">
                      <strong>{entry.title}</strong>
                      <span>{entry.artist || 'Unknown artist'} - {entry.album || 'Unknown album'}</span>
                    </div>
                    <span className="history-time">{formatTime(entry.startedAt)}</span>
                    <span className="history-duration">{formatDuration(entry.playedSeconds)} / {formatDuration(entry.durationSeconds)}</span>
                    <span className="history-play-count">{formatPlayCount(entry.playCount)}</span>
                    <span className="history-source">{entry.sourceLabel ? `来自 ${entry.sourceLabel}` : '来源未知'}</span>
                    <div className="history-actions">
                      <button type="button" aria-label={`播放 ${entry.title}`} title="播放" onClick={() => void handlePlay(entry)}>
                        <Play size={15} fill="currentColor" />
                      </button>
                      <button type="button" aria-label={`加入队列 ${entry.title}`} title="加入队列" onClick={() => handleAddToQueue(entry)}>
                        <Plus size={15} />
                      </button>
                      <button className="danger" type="button" aria-label={`从历史移除 ${entry.title}`} title="从历史移除" onClick={() => void handleDeleteEntry(entry)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="history-empty">
            <Music2 size={28} />
            <strong>还没有播放历史。</strong>
            <span>播放一首歌后，这里会记录你的最近收听。</span>
          </div>
        )}
      </section>

      {hasMore ? (
        <div className="history-load-more-sentinel" ref={loadMoreRef}>
          <button className="history-load-more" type="button" disabled={isLoading} onClick={() => void loadHistory(page + 1, 'append')}>
            {isLoading ? '正在加载...' : '加载更多'}
          </button>
        </div>
      ) : null}

      {error || isLoading ? <p className="history-footer">{error ?? '正在读取播放历史...'}</p> : null}
    </div>
  );
};

const HistoryMetric = ({ icon, label, value }: { icon: JSX.Element; label: string; value: string }): JSX.Element => (
  <div className="history-metric">
    {icon}
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const PlaybackStatsDashboardView = ({ stats }: { stats: PlaybackStatsDashboard | null }): JSX.Element | null => {
  if (!stats || stats.totals.playCount <= 0) {
    return null;
  }

  return (
    <section className="history-stats-dashboard" aria-label="播放统计仪表盘">
      <header className="history-stats-header">
        <div>
          <span className="section-kicker">Listening analytics</span>
          <h2>播放统计仪表盘</h2>
        </div>
        <span>{`生成于 ${formatDate(stats.generatedAt)}`}</span>
      </header>

      <div className="history-stats-hero">
        <HistoryMetric icon={<BarChart3 size={18} />} label="统计播放" value={`${formatCompactCount(stats.totals.playCount)} 次`} />
        <HistoryMetric icon={<Trophy size={18} />} label="完整播放" value={`${formatCompactCount(stats.totals.completedCount)} 次`} />
        <HistoryMetric icon={<Clock3 size={18} />} label="累计时长" value={formatLongDuration(stats.totals.playedSeconds)} />
        <HistoryMetric icon={<Disc3 size={18} />} label="曲目 / 艺人" value={`${stats.totals.uniqueTracks} / ${stats.totals.uniqueArtists}`} />
      </div>

      <div className="history-stats-panels">
        <StatsPanel title="最常听曲目" icon={<Music2 size={16} />}>
          <TopTrackList tracks={stats.topTracks} />
        </StatsPanel>
        <StatsPanel title="最常听艺人" icon={<Radio size={16} />}>
          <TopArtistList artists={stats.topArtists} />
        </StatsPanel>
        <StatsPanel title="音质使用" icon={<Trophy size={16} />}>
          <BreakdownBars items={stats.qualityBreakdown} />
        </StatsPanel>
        <StatsPanel title="格式分布" icon={<Disc3 size={16} />}>
          <BreakdownBars items={stats.formatBreakdown} />
        </StatsPanel>
      </div>

      <StatsPanel className="history-stats-activity-panel" title="近一年播放墙" icon={<CalendarDays size={16} />}>
        <DailyActivityWall days={stats.dailyActivity} />
      </StatsPanel>
    </section>
  );
};

const StatsPanel = ({
  children,
  className,
  icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  icon: JSX.Element;
  title: string;
}): JSX.Element => (
  <section className={`history-stats-panel ${className ?? ''}`.trim()}>
    <header>
      {icon}
      <h3>{title}</h3>
    </header>
    {children}
  </section>
);

const TopTrackList = ({ tracks }: { tracks: PlaybackStatsTrack[] }): JSX.Element => {
  if (tracks.length === 0) {
    return <p className="history-stats-empty">暂无曲目统计</p>;
  }

  return (
    <div className="history-stats-list">
      {tracks.slice(0, 5).map((track, index) => (
        <article className="history-stats-track" key={track.id}>
          <span>{index + 1}</span>
          <div className="history-stats-cover" data-empty={!track.coverThumb}>
            {track.coverThumb ? <img alt="" src={track.coverThumb} /> : <Music2 size={16} />}
          </div>
          <div>
            <strong>{track.title}</strong>
            <small>{track.artist || 'Unknown artist'}</small>
          </div>
          <em>{`${track.playCount} 次`}</em>
        </article>
      ))}
    </div>
  );
};

const TopArtistList = ({ artists }: { artists: PlaybackStatsArtist[] }): JSX.Element => {
  if (artists.length === 0) {
    return <p className="history-stats-empty">暂无艺人统计</p>;
  }

  const maxCount = Math.max(...artists.map((artist) => artist.playCount), 1);
  return (
    <div className="history-stats-bars">
      {artists.slice(0, 6).map((artist) => (
        <div className="history-stats-bar-row" key={artist.artist}>
          <span>{artist.artist || 'Unknown artist'}</span>
          <div className="history-stats-bar-track">
            <i style={{ width: `${Math.max(6, (artist.playCount / maxCount) * 100)}%` }} />
          </div>
          <em>{artist.playCount}</em>
        </div>
      ))}
    </div>
  );
};

const BreakdownBars = ({ items }: { items: PlaybackStatsBreakdownItem[] }): JSX.Element => {
  if (items.length === 0) {
    return <p className="history-stats-empty">暂无分布数据</p>;
  }

  const maxCount = Math.max(...items.map((item) => item.playCount), 1);
  return (
    <div className="history-stats-bars">
      {items.slice(0, 6).map((item) => (
        <div className="history-stats-bar-row" key={item.id}>
          <span>{item.label}</span>
          <div className="history-stats-bar-track">
            <i style={{ width: `${Math.max(6, (item.playCount / maxCount) * 100)}%` }} />
          </div>
          <em>{item.playCount}</em>
        </div>
      ))}
    </div>
  );
};

const DailyActivityWall = ({ days }: { days: PlaybackStatsDay[] }): JSX.Element => {
  if (days.length === 0) {
    return <p className="history-stats-empty">暂无近期播放</p>;
  }

  const today = startOfDay(new Date());
  const firstDay = addDays(today, -370);
  const gridStart = startOfWeek(firstDay);
  const gridEnd = addDays(startOfWeek(today), 6);
  const activityByDate = new Map(days.map((day) => [day.date, day]));
  const cells: Array<{
    date: Date;
    dateKey: string;
    isOutside: boolean;
    playCount: number;
    playedSeconds: number;
  }> = [];

  for (let day = gridStart; compareDay(day, gridEnd) <= 0; day = addDays(day, 1)) {
    const date = startOfDay(day);
    const dateKey = formatDateKey(date);
    const activity = activityByDate.get(dateKey);
    cells.push({
      date,
      dateKey,
      isOutside: compareDay(date, firstDay) < 0 || compareDay(date, today) > 0,
      playCount: activity?.playCount ?? 0,
      playedSeconds: activity?.playedSeconds ?? 0,
    });
  }

  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const monthStarts = weeks.reduce<Array<{ label: string; month: number; week: number; year: number }>>((labels, week, weekIndex) => {
    const visibleDay = week.find((cell) => !cell.isOutside);

    if (!visibleDay) {
      return labels;
    }

    const lastLabel = labels.at(-1);
    if (!lastLabel || visibleDay.date.getMonth() !== lastLabel.month || visibleDay.date.getFullYear() !== lastLabel.year) {
      labels.push({
        label: formatMonthLabel(visibleDay.date),
        month: visibleDay.date.getMonth(),
        week: weekIndex,
        year: visibleDay.date.getFullYear(),
      });
    }

    return labels;
  }, []);
  const monthLabels = monthStarts.map((label, index) => ({
    ...label,
    span: Math.max(1, (monthStarts[index + 1]?.week ?? weeks.length) - label.week),
  }));
  const maxCount = Math.max(...cells.map((day) => day.playCount), 1);
  const totalCount = cells.reduce((sum, day) => (day.isOutside ? sum : sum + day.playCount), 0);
  const visibleCells = cells.filter((day) => !day.isOutside);
  const activeCells = visibleCells.filter((day) => day.playCount > 0);
  const peakDay = activeCells.reduce<(typeof activeCells)[number] | null>(
    (best, day) => (!best || day.playCount > best.playCount ? day : best),
    null,
  );
  const longestStreak = visibleCells.reduce(
    (streak, day) => {
      const current = day.playCount > 0 ? streak.current + 1 : 0;
      return {
        current,
        longest: Math.max(streak.longest, current),
      };
    },
    { current: 0, longest: 0 },
  ).longest;
  const insightItems = [
    {
      label: '最热一天',
      value: peakDay ? `${formatDayLabel(peakDay.dateKey)} · ${formatCompactCount(peakDay.playCount)} 次` : '暂无',
    },
    {
      label: '最长连续',
      value: `${longestStreak} 天`,
    },
    {
      label: '活跃天数',
      value: `${activeCells.length} / ${visibleCells.length}`,
    },
    {
      label: '活跃日均',
      value: `${activeCells.length > 0 ? Math.round(totalCount / activeCells.length) : 0} 次`,
    },
  ];
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
    <div className="history-activity-wall">
      <div className="history-activity-summary">
        <strong>{`${formatCompactCount(totalCount)} 次播放`}</strong>
        <span>近一年</span>
      </div>
      <div className="history-activity-body">
        <div className="history-activity-scroll">
          <div className="history-activity-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--history-activity-cell))` }}>
            {monthLabels.map((month) => (
              <span key={`${month.label}-${month.week}`} style={{ gridColumn: `${month.week + 1} / span ${month.span}` }}>
                {month.label}
              </span>
            ))}
          </div>
          <div className="history-activity-grid-shell">
            <div className="history-activity-weekdays" aria-hidden="true">
              <span>一</span>
              <span />
              <span>三</span>
              <span />
              <span>五</span>
              <span />
              <span />
            </div>
            <div className="history-activity-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--history-activity-cell))` }}>
              {cells.map((day) => (
                <span
                  aria-label={`${formatDayLabel(day.dateKey)}，${day.playCount} 次播放`}
                  className="history-activity-cell"
                  data-level={day.isOutside ? 0 : getLevel(day.playCount)}
                  data-outside={day.isOutside ? 'true' : undefined}
                  key={day.dateKey}
                  title={`${day.dateKey} · ${day.playCount} 次 · ${formatLongDuration(day.playedSeconds)}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="history-activity-insights" aria-label="年度播放摘要">
          {insightItems.map((item) => (
            <div className="history-activity-insight" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="history-activity-legend" aria-hidden="true">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i data-level={level} key={level} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
};
