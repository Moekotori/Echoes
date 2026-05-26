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
  RefreshCw,
  Shuffle,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  LibraryAlbum,
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
import { openAlbumDetailForTrack, requestAlbumDetailNavigation } from '../utils/albumNavigation';
import { openArtistDetailByName } from '../utils/artistNavigation';
import type { AppRouteId } from '../app/routes';

const recentPageSize = 8;
const recentPlayedAlbumHistoryPageSize = 12;
const randomQueuePageSize = 36;
const recentShelfPageSize = 4;
const recommendedAlbumPageSize = 7;
const homeNowTitleMarqueeMinChars = 34;
const homeNowTitleMarqueeOverflowPx = 12;
const weeklyHeatmapWeeks = 12;
const signalBarCount = 48;
const playbackHistoryChangedEvent = 'playback-history:changed';
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
  recentAddedAlbums: LibraryAlbum[];
  recommendedAlbums: LibraryAlbum[];
  summary: LibrarySummary;
  recentTracks: LibraryTrack[];
  recentHistory: PlaybackHistoryEntry[];
  recentPlayedAlbums: RecentPlayedAlbum[];
  historySummary: PlaybackHistorySummary | null;
  stats: PlaybackStatsDashboard | null;
};
type RecentPlayedAlbum = {
  album: LibraryAlbum;
  startedAt: string | null;
};

const HomeNowTitle = ({ title }: { title: string }): JSX.Element => {
  const titleRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const canScroll = title.trim().length >= homeNowTitleMarqueeMinChars;

  useEffect(() => {
    const element = titleRef.current;
    const innerElement = innerRef.current;
    if (!element || !innerElement || !canScroll) {
      setShouldScroll(false);
      return undefined;
    }

    let frameId: number | null = null;
    const updateOverflow = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const distance = Math.max(0, innerElement.scrollWidth - element.clientWidth);
        const nextShouldScroll = distance > homeNowTitleMarqueeOverflowPx;
        element.style.setProperty('--home-now-title-marquee-distance', `${distance + 26}px`);
        element.style.setProperty('--home-now-title-marquee-duration', `${Math.min(24, Math.max(10, distance / 18 + 8))}s`);
        setShouldScroll(nextShouldScroll);
      });
    };

    updateOverflow();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(element);
    resizeObserver?.observe(innerElement);
    window.addEventListener('resize', updateOverflow);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [canScroll, title]);

  return (
    <strong className="home-now-title" data-scroll={shouldScroll ? 'true' : undefined} ref={titleRef} title={title}>
      <span ref={innerRef}>{title}</span>
    </strong>
  );
};

const HomeNowMeta = ({
  onOpenAlbum,
  onOpenArtist,
  track,
}: {
  onOpenAlbum: (track: LibraryTrack) => void;
  onOpenArtist: (artistName: string) => void;
  track: LibraryTrack | null;
}): JSX.Element => {
  if (!track) {
    return <small className="home-now-meta">曲库准备好后会显示最近内容</small>;
  }

  const artistName = track.artist?.trim();
  const albumTitle = track.album?.trim();

  return (
    <small className="home-now-meta">
      {artistName ? (
        <button className="home-now-link" type="button" onClick={() => onOpenArtist(artistName)}>
          {artistName}
        </button>
      ) : (
        <span>未知艺术家</span>
      )}
      <span aria-hidden="true"> · </span>
      {albumTitle ? (
        <button className="home-now-link" type="button" onClick={() => onOpenAlbum(track)}>
          {albumTitle}
        </button>
      ) : (
        <span>未知专辑</span>
      )}
    </small>
  );
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
  recentAddedAlbums: [],
  recommendedAlbums: [],
  summary: emptySummary,
  recentTracks: [],
  recentHistory: [],
  recentPlayedAlbums: [],
  historySummary: null,
  stats: null,
};
let cachedHomePageData: HomePageData | null = null;
let cachedRecentPanelMode: RecentPanelMode = 'added';

export const resetHomePageCacheForTest = (): void => {
  cachedHomePageData = null;
  cachedRecentPanelMode = 'added';
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

const ArtistLeaderboard = ({
  artists,
  onOpenArtist,
}: {
  artists: PlaybackStatsDashboard['topArtists'];
  onOpenArtist: (artistName: string) => void;
}): JSX.Element => {
  const visibleArtists = artists
    .filter((artist) => artist.artist.trim().length > 0)
    .slice(0, 8);
  const maxPlayCount = Math.max(...visibleArtists.map((artist) => artist.playCount), 1);

  if (visibleArtists.length === 0) {
    return (
      <div className="home-artist-rank-empty" role="status">
        <UserRound size={18} />
        <span>
          <strong>还没有艺人排行</strong>
          <small>播放更多音乐后，这里会形成你的高频艺人榜。</small>
        </span>
      </div>
    );
  }

  return (
    <ol className="home-artist-leaderboard" aria-label="艺人排行榜">
      {visibleArtists.map((artist, index) => {
        const artistName = artist.artist.trim();
        const score = Math.max(0.08, artist.playCount / maxPlayCount);
        const completionRate = artist.playCount > 0 ? Math.round((artist.completedCount / artist.playCount) * 100) : 0;

        return (
          <li className="home-artist-rank-item" key={`${artistName}-${index}`}>
            <button
              className="home-artist-rank-row"
              data-rank-lead={index === 0 ? 'true' : undefined}
              style={{ '--home-artist-score': score } as CSSProperties}
              type="button"
              onClick={() => onOpenArtist(artistName)}
            >
              <span className="home-artist-rank-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="home-artist-rank-main">
                <strong>{artistName}</strong>
                <span className="home-artist-rank-meta">
                  <span>{formatCompactNumber(artist.playCount)} 次</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(artist.playedSeconds)}</span>
                </span>
              </span>
              <span className="home-artist-rank-chip">{completionRate}% 完播</span>
              <span className="home-artist-rank-meter" aria-hidden="true">
                <i />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
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

const hashStableString = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

type LibraryBridge = NonNullable<NonNullable<Window['echo']>['library']>;

const loadRecommendedAlbums = async (library: LibraryBridge, albumCount: number, sort: 'default' | 'random' = 'default'): Promise<LibraryAlbum[]> => {
  if (!library.getAlbums || albumCount <= 0) {
    return [];
  }

  try {
    const result = await library.getAlbums({
      page: 1,
      pageSize: recommendedAlbumPageSize,
      sort,
    });
    return Array.from(new Map(result.items.map((album) => [album.id, album])).values());
  } catch {
    return [];
  }
};

const loadRecentAddedAlbums = async (library: LibraryBridge, albumCount: number): Promise<LibraryAlbum[]> => {
  if (!library.getAlbums || albumCount <= 0) {
    return [];
  }

  try {
    const result = await library.getAlbums({
      page: 1,
      pageSize: recentPageSize,
      sort: 'recent',
    });
    return Array.from(new Map(result.items.map((album) => [album.id, album])).values());
  } catch {
    return [];
  }
};

const loadRecentPlayedAlbums = async (library: LibraryBridge, entries: PlaybackHistoryEntry[]): Promise<RecentPlayedAlbum[]> => {
  if (!library.getAlbumForTrack || entries.length === 0) {
    return [];
  }

  const resolvedAlbums = await Promise.all(
    entries.map(async (entry): Promise<RecentPlayedAlbum | null> => {
      if (!entry.trackId) {
        return null;
      }

      try {
        const album = await library.getAlbumForTrack(entry.trackId);
        return album ? { album, startedAt: entry.startedAt } : null;
      } catch {
        return null;
      }
    }),
  );

  const seenAlbumIds = new Set<string>();
  const albums: RecentPlayedAlbum[] = [];
  for (const item of resolvedAlbums) {
    if (!item || seenAlbumIds.has(item.album.id)) {
      continue;
    }

    seenAlbumIds.add(item.album.id);
    albums.push(item);
  }

  return albums;
};

const dbToSignalUnit = (db: number | null | undefined): number | null => {
  if (db === null || db === undefined || !Number.isFinite(db)) {
    return null;
  }

  return clampSignal(Math.pow(10, db / 24));
};

const hashSignalSeed = (seed: string): number => {
  return hashStableString(seed);
};

const seededSignalNoise = (seed: string, index: number): number => {
  const hash = hashSignalSeed(`${seed}:${index}`);
  return (hash % 1000) / 1000;
};

const signalBand = (position: number, center: number, width: number): number => {
  const distance = (position - center) / width;
  return Math.exp(-(distance * distance));
};

const sanitizeVisualSpectrum = (spectrum: number[] | undefined): number[] => {
  if (!Array.isArray(spectrum) || spectrum.length === 0) {
    return [];
  }

  return spectrum.map((value) => (Number.isFinite(value) ? clampSignal(value) : 0));
};

const visualSpectrumAt = (spectrum: number[], position: number): number => {
  if (spectrum.length === 0) {
    return 0;
  }

  const scaled = clampSignal(position) * (spectrum.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(spectrum.length - 1, leftIndex + 1);
  const mix = scaled - leftIndex;
  return spectrum[leftIndex] * (1 - mix) + spectrum[rightIndex] * mix;
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
  variant: 'album' | 'large' | 'thumb' = 'album',
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

const SectionHeader = ({
  title,
  action,
  actionLabel,
  routeId,
}: {
  title: string;
  action?: JSX.Element;
  actionLabel?: string;
  routeId?: HomeRouteId;
}): JSX.Element => (
  <header className="home-section-header">
    <h2>{title}</h2>
    {action ??
    (routeId && actionLabel ? (
      <button type="button" onClick={() => navigateHomeRoute(routeId)}>
        {actionLabel}
      </button>
    ) : null)}
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
  const visualSpectrum = sanitizeVisualSpectrum(audioLevels?.visualSpectrum);
  const visualSpectrumPeak = Math.max(0, ...visualSpectrum);
  const visualTelemetryState = audioLevels?.visualTelemetryState;
  const telemetryIsPriming = visualTelemetryState === 'priming';
  const trustedPcmSpectrum =
    visualSpectrum.length > 0 && (visualTelemetryState === 'pcm' || telemetryIsPriming || (visualTelemetryState === undefined && visualSpectrumPeak > 0.001));
  const visualEnergy = clampSignal(audioLevels?.visualEnergy ?? 0);
  const visualTransient = clampSignal(audioLevels?.visualTransient ?? 0);
  const positionSeconds = status?.positionSeconds ?? 0;
  const meterIsSilent = isActive && meterReady && visualSpectrumPeak <= 0.003 && visualEnergy <= 0.025 && peak <= 0.026 && rms <= 0.02;
  const meterIsPriming = telemetryIsPriming || (meterIsSilent && positionSeconds < 1.2);
  const flatActiveMeter = meterIsSilent && !meterIsPriming;
  const energy = meterIsPriming
    ? telemetryIsPriming
      ? clampSignal(visualEnergy * 0.66 + rms * 0.05)
      : 0.06
    : flatActiveMeter
      ? 0.1
      : meterReady
        ? trustedPcmSpectrum
          ? clampSignal(visualEnergy * 0.86 + peak * 0.16 + rms * 0.14)
          : clampSignal(peak * 0.44 + rms * 0.42)
        : 0;
  const crest = meterIsPriming
    ? telemetryIsPriming
      ? clampSignal(visualTransient * 0.35 + peak * 0.04)
      : 0.04
    : flatActiveMeter
      ? 0.06
      : meterReady
        ? trustedPcmSpectrum
          ? clampSignal(visualTransient * 0.86 + Math.max(0, peak - rms) * 1.8 + peak * 0.08)
          : clampSignal(Math.max(0, peak - rms) * 2.1 + peak * 0.12)
        : 0;
  const hasVisualSpectrum = trustedPcmSpectrum && !flatActiveMeter && visualSpectrumPeak > 0.001;
  const timeSlice = Math.floor(positionSeconds * 12);
  const bars = Array.from({ length: signalBarCount }, (_, index) => {
    const position = index / Math.max(1, signalBarCount - 1);
    const coarse = seededSignalNoise(signalSeed, index);
    const fine = seededSignalNoise(signalSeed, index + 101);
    const transient = seededSignalNoise(`${signalSeed}:hit:${timeSlice}`, Math.floor(index / 2));
    const bassBand = signalBand(position, 0.14 + seededSignalNoise(signalSeed, 701) * 0.08, 0.18);
    const vocalBand = signalBand(position, 0.45 + seededSignalNoise(signalSeed, 702) * 0.14, 0.26);
    const airBand = signalBand(position, 0.78 + seededSignalNoise(signalSeed, 703) * 0.08, 0.16);
    const edgeDrop = Math.sin(position * Math.PI);
    const fallbackHit = Math.max(0, (transient - 0.58) / 0.42);
    const comb =
      0.92 +
      Math.sin(position * Math.PI * (4.4 + coarse * 2.8) + fine * Math.PI) * 0.15 +
      Math.sin(position * Math.PI * (10.5 + fine * 4.2)) * 0.08;
    const fallbackProfile = clampSignal(
      bassBand * (0.55 + rms * 0.36) +
        vocalBand * (0.34 + energy * 0.34) +
        airBand * (0.2 + crest * 0.52) +
        edgeDrop * 0.22 +
        (coarse - 0.5) * 0.16 +
        (fine - 0.5) * 0.1,
    );
    const visualSpectrumValue = hasVisualSpectrum ? Math.pow(visualSpectrumAt(visualSpectrum, position), 0.68) : 0;
    const spectrumContour = hasVisualSpectrum
      ? clampSignal(
          visualSpectrumValue * 0.84 +
            Math.pow(visualSpectrumAt(visualSpectrum, Math.max(0, position - 0.035)), 0.72) * 0.08 +
            Math.pow(visualSpectrumAt(visualSpectrum, Math.min(1, position + 0.035)), 0.72) * 0.08,
        )
      : 0;
    const spectralProfile = hasVisualSpectrum
      ? clampSignal(spectrumContour * (1.04 + energy * 0.22) + edgeDrop * (0.018 + visualTransient * 0.035))
      : fallbackProfile;
    const meterHeight = hasVisualSpectrum
      ? 4 + (0.035 + spectralProfile * (0.66 + energy * 0.58) + energy * 0.12 + visualTransient * edgeDrop * 0.18) * 86
      : 4 + (energy * (0.16 + spectralProfile * comb) + rms * edgeDrop * 0.1 + fallbackHit * crest * 0.38) * 86;
    const idleHeight = 3 + (0.03 + coarse * 0.05) * 34;
    const height = meterReady && isActive ? meterHeight : idleHeight;
    const motion = hasVisualSpectrum
      ? 0.032 + spectrumContour * 0.09 + visualTransient * 0.18 + crest * 0.05
      : meterReady && isActive
        ? 0.08 + spectralProfile * 0.12 + crest * 0.18 + fallbackHit * 0.18
        : 0.04 + coarse * 0.05;
    const minScale = Math.max(0.32, 1 - motion * (0.66 + fine * 0.24));
    const maxScale = Math.min(1.18, 1 + motion * 0.44);
    const midScale = minScale + (maxScale - minScale) * (0.28 + fine * 0.24);
    const fallScale = minScale + (maxScale - minScale) * (0.48 + coarse * 0.18);

    const targetHeight = Math.max(4, Math.min(96, height));
    const targetScale = targetHeight / 100;
    const targetOpacity =
      meterReady && isActive
        ? 0.5 + Math.min(0.42, energy * 0.25 + spectralProfile * 0.2 + (hasVisualSpectrum ? 0 : fallbackHit * 0.13))
        : 0.12 + coarse * 0.08;
    const requestedMotion = hasVisualSpectrum
      ? targetScale * (0.045 + spectrumContour * 0.11) + visualTransient * 0.04 + energy * 0.012 + crest * 0.012
      : targetScale * (0.1 + spectralProfile * 0.18) + energy * 0.02 + crest * 0.024 + fallbackHit * 0.012;
    const liveMotion =
      meterReady && isActive
        ? meterIsPriming
          ? Math.min(0.045, targetScale * 0.5)
          : Math.min(0.24, targetScale * 0.68, Math.max(flatActiveMeter ? 0.055 : 0.024, requestedMotion))
        : 0;

    return {
      delay: `${hasVisualSpectrum ? -(index % 12) * 0.018 : -(index % 23) * (0.026 + fine * 0.018)}s`,
      duration: `${hasVisualSpectrum ? 980 + Math.round((0.5 + edgeDrop * 0.5) * 260) : 980 + Math.round((coarse * 0.48 + fine * 0.16) * 620)}ms`,
      fallScale: fallScale.toFixed(3),
      height: `${targetHeight.toFixed(2)}%`,
      maxScale: maxScale.toFixed(3),
      midScale: midScale.toFixed(3),
      minScale: minScale.toFixed(3),
      motion: liveMotion.toFixed(4),
      opacity: targetOpacity.toFixed(3),
      targetHeight,
      targetOpacity,
      targetScale,
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
                '--home-signal-fall-scale': bar.fallScale,
                '--home-signal-height': bar.height,
                '--home-signal-max-scale': bar.maxScale,
                '--home-signal-mid-scale': bar.midScale,
                '--home-signal-min-scale': bar.minScale,
                '--home-signal-motion': bar.motion,
                '--home-signal-opacity': bar.opacity,
                '--home-signal-scale': bar.targetScale.toFixed(4),
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
  const [recentAddedAlbums, setRecentAddedAlbums] = useState<LibraryAlbum[]>(initialHomeData.recentAddedAlbums);
  const [recommendedAlbums, setRecommendedAlbums] = useState<LibraryAlbum[]>(initialHomeData.recommendedAlbums);
  const [summary, setSummary] = useState<LibrarySummary>(initialHomeData.summary);
  const [recentTracks, setRecentTracks] = useState<LibraryTrack[]>(initialHomeData.recentTracks);
  const [recentHistory, setRecentHistory] = useState<PlaybackHistoryEntry[]>(initialHomeData.recentHistory);
  const [recentPlayedAlbums, setRecentPlayedAlbums] = useState<RecentPlayedAlbum[]>(initialHomeData.recentPlayedAlbums);
  const [historySummary, setHistorySummary] = useState<PlaybackHistorySummary | null>(initialHomeData.historySummary);
  const [stats, setStats] = useState<PlaybackStatsDashboard | null>(initialHomeData.stats);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingRandomQueue, setIsGeneratingRandomQueue] = useState(false);
  const [isRefreshingRecommendations, setIsRefreshingRecommendations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentPanelMode, setRecentPanelMode] = useState<RecentPanelMode>(cachedRecentPanelMode);
  const [recentShelfPage, setRecentShelfPage] = useState(0);
  const requestIdRef = useRef(0);
  const pulseRequestIdRef = useRef(0);
  const playbackPulseRequestIdRef = useRef(0);
  const currentPlayedAlbumRequestIdRef = useRef(0);
  const recommendationRequestIdRef = useRef(0);

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

  const generateRandomQueue = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.getTracks) {
      setError('桌面曲库桥接不可用。请在 ECHO Next 桌面端生成随机队列。');
      return;
    }

    try {
      setError(null);
      setIsGeneratingRandomQueue(true);
      const result = await library.getTracks({ page: 1, pageSize: randomQueuePageSize, sort: 'random', randomWindow: true });
      const randomTracks = result.items.filter((track) => !track.unavailable);

      if (randomTracks.length === 0) {
        setError('曲库里还没有可加入队列的歌曲。');
        return;
      }

      const currentTrack = queue.currentTrack;
      const queueTracks = currentTrack
        ? [currentTrack, ...randomTracks.filter((track) => track.id !== currentTrack.id)]
        : randomTracks;

      queue.replaceQueue(queueTracks, {
        startTrackId: currentTrack?.id,
        source: { type: 'songs', label: '随机队列', sort: 'random' },
      });
      navigateHomeRoute('queue');
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setIsGeneratingRandomQueue(false);
    }
  }, [queue]);

  const openTrackAlbum = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      const album = await openAlbumDetailForTrack(track, { returnTo: 'home' });
      if (!album) {
        setError(`未找到专辑：${track.album || 'Unknown Album'}`);
      }
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    }
  }, []);

  const openTrackArtist = useCallback(async (artistName: string): Promise<void> => {
    try {
      setError(null);
      const artist = await openArtistDetailByName(artistName, { returnTo: 'home' });
      if (!artist) {
        setError(`未找到艺术家：${artistName || 'Unknown Artist'}`);
      }
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : String(navigationError));
    }
  }, []);

  const openRecommendedAlbum = useCallback((album: LibraryAlbum): void => {
    requestAlbumDetailNavigation(album, { returnTo: 'home' });
  }, []);

  const changeRecentPanelMode = useCallback((mode: RecentPanelMode): void => {
    cachedRecentPanelMode = mode;
    setRecentPanelMode(mode);
  }, []);

  const refreshRecommendedAlbums = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = recommendationRequestIdRef.current + 1;
    recommendationRequestIdRef.current = requestId;

    if (!library?.getAlbums) {
      setError('桌面曲库桥接不可用。请在 ECHO Next 桌面端刷新推荐。');
      return;
    }

    try {
      setError(null);
      setIsRefreshingRecommendations(true);
      const nextRecommendedAlbums = await loadRecommendedAlbums(library, summary.albumCount, 'random');

      if (recommendationRequestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        ...(cachedHomePageData ?? emptyHomePageData),
        recommendedAlbums: nextRecommendedAlbums,
      };
      setRecommendedAlbums(nextRecommendedAlbums);
    } catch (loadError) {
      if (recommendationRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (recommendationRequestIdRef.current === requestId) {
        setIsRefreshingRecommendations(false);
      }
    }
  }, [summary.albumCount]);

  const pushRecentPlayedAlbum = useCallback((item: RecentPlayedAlbum): void => {
    setRecentPlayedAlbums((current) => {
      const nextRecentPlayedAlbums = [item, ...current.filter((candidate) => candidate.album.id !== item.album.id)].slice(
        0,
        recentPlayedAlbumHistoryPageSize,
      );

      cachedHomePageData = {
        ...(cachedHomePageData ?? emptyHomePageData),
        recentPlayedAlbums: nextRecentPlayedAlbums,
      };

      return nextRecentPlayedAlbums;
    });
  }, []);

  const loadPlaybackPulse = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const requestId = playbackPulseRequestIdRef.current + 1;
    playbackPulseRequestIdRef.current = requestId;

    if (!library?.getPlaybackHistory || !library.getPlaybackHistorySummary) {
      return;
    }

    const weekQuery = startOfThisWeekQuery();
    const heatmapQuery = weeklyHeatmapQuery();

    try {
      const [historyPage, nextHistorySummary, nextStats] = await Promise.all([
        library.getPlaybackHistory({ page: 1, pageSize: recentPlayedAlbumHistoryPageSize, sort: 'recent' }),
        library.getPlaybackHistorySummary(weekQuery),
        library.getPlaybackStatsDashboard?.(heatmapQuery) ?? Promise.resolve(null),
      ]);
      const nextRecentPlayedAlbums = await loadRecentPlayedAlbums(library, historyPage.items);

      if (playbackPulseRequestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        ...(cachedHomePageData ?? emptyHomePageData),
        recentHistory: historyPage.items,
        recentPlayedAlbums: nextRecentPlayedAlbums,
        historySummary: nextHistorySummary,
        stats: nextStats,
      };
      setRecentHistory(historyPage.items);
      setRecentPlayedAlbums(nextRecentPlayedAlbums);
      setHistorySummary(nextHistorySummary);
      setStats(nextStats);
    } catch (loadError) {
      if (playbackPulseRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
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
      const nextRecentAddedAlbums = await loadRecentAddedAlbums(library, nextSummary.albumCount);
      const nextRecommendedAlbums = await loadRecommendedAlbums(library, nextSummary.albumCount);

      if (pulseRequestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        ...(cachedHomePageData ?? emptyHomePageData),
        recentAddedAlbums: nextRecentAddedAlbums,
        recommendedAlbums: nextRecommendedAlbums,
        summary: nextSummary,
        recentTracks: tracksPage.items,
      };
      setRecentAddedAlbums(nextRecentAddedAlbums);
      setRecommendedAlbums(nextRecommendedAlbums);
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
      setRecentAddedAlbums([]);
      setRecommendedAlbums([]);
      setRecentTracks([]);
      setRecentHistory([]);
      setRecentPlayedAlbums([]);
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
        library.getPlaybackHistory({ page: 1, pageSize: recentPlayedAlbumHistoryPageSize, sort: 'recent' }),
        library.getPlaybackHistorySummary(weekQuery),
        library.getPlaybackStatsDashboard?.(heatmapQuery) ?? Promise.resolve(null),
      ]);
      const nextRecommendedAlbums = await loadRecommendedAlbums(library, nextSummary.albumCount);
      const nextRecentAddedAlbums = await loadRecentAddedAlbums(library, nextSummary.albumCount);
      const nextRecentPlayedAlbums = await loadRecentPlayedAlbums(library, historyPage.items);

      if (requestIdRef.current !== requestId) {
        return;
      }

      cachedHomePageData = {
        recentAddedAlbums: nextRecentAddedAlbums,
        recommendedAlbums: nextRecommendedAlbums,
        summary: nextSummary,
        recentTracks: tracksPage.items,
        recentHistory: historyPage.items,
        recentPlayedAlbums: nextRecentPlayedAlbums,
        historySummary: nextHistorySummary,
        stats: nextStats,
      };
      setRecentAddedAlbums(nextRecentAddedAlbums);
      setRecommendedAlbums(nextRecommendedAlbums);
      setSummary(nextSummary);
      setRecentTracks(tracksPage.items);
      setRecentHistory(historyPage.items);
      setRecentPlayedAlbums(nextRecentPlayedAlbums);
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
    const handlePlaybackHistoryChanged = (): void => {
      void loadPlaybackPulse();
    };

    window.addEventListener(playbackHistoryChangedEvent, handlePlaybackHistoryChanged);
    return () => window.removeEventListener(playbackHistoryChangedEvent, handlePlaybackHistoryChanged);
  }, [loadPlaybackPulse]);

  useEffect(() => {
    const track = queue.currentTrack;
    const library = window.echo?.library;
    const requestId = currentPlayedAlbumRequestIdRef.current + 1;
    currentPlayedAlbumRequestIdRef.current = requestId;

    if (!track) {
      return;
    }

    const fallbackAlbum: LibraryAlbum = {
      id: `current:${track.stableKey ?? track.id ?? track.path}`,
      mediaType: track.mediaType === 'remote' ? 'remote' : 'local',
      albumKey: `current:${track.stableKey ?? track.id ?? track.path}`,
      title: track.album || track.title,
      albumArtist: track.albumArtist || track.artist,
      year: track.year,
      trackCount: 1,
      duration: track.duration,
      coverId: track.coverId,
      coverThumb: track.coverThumb,
    };

    const startedAt = new Date().toISOString();

    if (!library?.getAlbumForTrack || track.isTemporary) {
      pushRecentPlayedAlbum({ album: fallbackAlbum, startedAt });
      return;
    }

    void library
      .getAlbumForTrack(track.id)
      .then((album) => {
        if (currentPlayedAlbumRequestIdRef.current !== requestId) {
          return;
        }

        pushRecentPlayedAlbum({ album: album ?? fallbackAlbum, startedAt });
      })
      .catch(() => {
        if (currentPlayedAlbumRequestIdRef.current === requestId) {
          pushRecentPlayedAlbum({ album: fallbackAlbum, startedAt });
        }
      });
  }, [pushRecentPlayedAlbum, queue.currentTrack, recentHistory]);

  useEffect(() => {
    setRecentShelfPage(0);
  }, [recentPanelMode]);

  useEffect(() => {
    const itemCount = recentPanelMode === 'added' ? recentAddedAlbums.length : recentPlayedAlbums.length;
    const lastPage = Math.max(0, Math.ceil(itemCount / recentShelfPageSize) - 1);
    setRecentShelfPage((currentPage) => Math.min(currentPage, lastPage));
  }, [recentAddedAlbums.length, recentPanelMode, recentPlayedAlbums.length]);

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
  const activeRecentItemCount = recentPanelMode === 'added' ? recentAddedAlbums.length : recentPlayedAlbums.length;
  const recentTotalPages = Math.max(1, Math.ceil(activeRecentItemCount / recentShelfPageSize));
  const recentPageStart = recentShelfPage * recentShelfPageSize;
  const visibleRecentAddedAlbums = recentAddedAlbums.slice(recentPageStart, recentPageStart + recentShelfPageSize);
  const visibleRecentPlayedAlbums = recentPlayedAlbums.slice(recentPageStart, recentPageStart + recentShelfPageSize);

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
            <button className="home-secondary-action" type="button" disabled={summary.songCount <= 0 || isGeneratingRandomQueue} onClick={() => void generateRandomQueue()}>
              <Shuffle size={17} />
              {isGeneratingRandomQueue ? '生成中' : '生成随机队列'}
            </button>
          </div>
        </div>

        <div className="home-now-card" data-empty={!focusTrack}>
          <div className="home-now-artwork-stack">
            <Artwork coverThumb={focusTrack ? homeArtworkUrl(focusTrack, 'album') : null} title={focusTrack?.title ?? '暂无播放'} size={132} />
          </div>
          <div className="home-now-copy">
            <span>{queue.currentTrack ? '正在播放' : '最近信号'}</span>
            <HomeNowTitle title={focusTrack?.title ?? '暂无播放'} />
            <HomeNowMeta track={focusTrack} onOpenAlbum={(track) => void openTrackAlbum(track)} onOpenArtist={(artistName) => void openTrackArtist(artistName)} />
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
                <button type="button" role="tab" aria-selected={recentPanelMode === 'played'} data-active={recentPanelMode === 'played'} onClick={() => changeRecentPanelMode('played')}>
                  已播放
                </button>
                <button type="button" role="tab" aria-selected={recentPanelMode === 'added'} data-active={recentPanelMode === 'added'} onClick={() => changeRecentPanelMode('added')}>
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
            </div>
          </header>

          {recentPanelMode === 'added' ? (
            recentAddedAlbums.length > 0 ? (
              <div className="home-cover-rail">
                {visibleRecentAddedAlbums.map((album) => (
                  <button className="home-cover-card" key={album.id} type="button" onClick={() => openRecommendedAlbum(album)}>
                    <Artwork coverThumb={homeArtworkUrl(album, 'large')} title={album.title} size={176} />
                    <strong>{album.title}</strong>
                    <span>{album.albumArtist || '未知艺术家'} · {album.trackCount} 首</span>
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
          ) : recentPlayedAlbums.length > 0 ? (
            <div className="home-cover-rail home-played-rail">
              {visibleRecentPlayedAlbums.map((item) => (
                <button className="home-cover-card" key={item.album.id} type="button" onClick={() => openRecommendedAlbum(item.album)}>
                  <Artwork coverThumb={homeArtworkUrl(item.album, 'large')} title={item.album.title} size={156} />
                  <strong>{item.album.title}</strong>
                  <span>{item.album.albumArtist || '未知艺术家'} · {formatShortDate(item.startedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
              <div className="home-empty-panel">
                <History size={24} />
                <strong>还没有最近播放</strong>
                <span>开始播放后，这里会出现最近听过的专辑。</span>
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

      <section className="home-panel home-recommend-panel" data-empty={recommendedAlbums.length === 0}>
        <SectionHeader
          title="为你推荐"
          action={
            <button type="button" disabled={isRefreshingRecommendations || summary.albumCount <= 0} onClick={() => void refreshRecommendedAlbums()}>
              <RefreshCw size={15} />
              {isRefreshingRecommendations ? '刷新中' : '刷新'}
            </button>
          }
        />
        {recommendedAlbums.length > 0 ? (
          <div className="home-cover-rail home-recommend-rail">
            {recommendedAlbums.map((album) => (
              <button className="home-cover-card" key={album.id} type="button" onClick={() => openRecommendedAlbum(album)}>
                <Artwork coverThumb={homeArtworkUrl(album, 'large')} title={album.title} size={176} />
                <strong>{album.title}</strong>
                <span>
                  {album.albumArtist || '未知艺术家'} · {album.trackCount} 首
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty-panel home-empty-panel--compact">
            <Album size={24} />
            <strong>还没有可推荐专辑</strong>
            <span>导入专辑后，这里会直接铺满你的专辑。</span>
          </div>
        )}
      </section>

      <section className="home-panel home-artist-rank-panel" data-empty={(stats?.topArtists.length ?? 0) === 0}>
        <SectionHeader title="艺人排行榜" />
        <ArtistLeaderboard artists={stats?.topArtists ?? []} onOpenArtist={(artistName) => void openTrackArtist(artistName)} />
      </section>

      {error || isLoading ? (
        <p className="home-status-line" role={error ? 'alert' : 'status'}>
          {error ?? '正在整理主页...'}
        </p>
      ) : null}
    </div>
  );
};
