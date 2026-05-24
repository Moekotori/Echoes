import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Check, ChevronDown, Disc3, Download, Link, ListPlus, Loader2, Play, Radio, Search, UserRound } from 'lucide-react';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { DownloadJob, DownloadJobStatus } from '../../../shared/types/downloads';
import type { LibraryTrack } from '../../../shared/types/library';
import type {
  StreamingAlbum,
  StreamingAlbumDetail,
  StreamingAudioQuality,
  StreamingArtist,
  StreamingArtistDetail,
  StreamingMediaType,
  StreamingPlaylist,
  StreamingProviderDescriptor,
  StreamingProviderName,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { streamingStableKey } from '../../../shared/types/streaming';
import { useAnimatedBackNavigation } from '../../hooks/useAnimatedBackNavigation';
import { isPlaybackCancellationError, usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { getAppBridge, getDownloadsBridge, getStreamingBridge } from '../../utils/echoBridge';
import {
  readStreamingSearchMemory,
  updateStreamingSearchMemory,
  type StreamingQualityPreference,
} from './streamingSearchMemory';

const pageSize = 30;
const tabs: Array<{ key: StreamingMediaType; label: string }> = [
  { key: 'track', label: '单曲' },
  { key: 'album', label: '专辑' },
  { key: 'artist', label: '歌手' },
  { key: 'playlist', label: '歌单' },
];
type QualityPreference = StreamingQualityPreference;

const qualities: Array<{ key: QualityPreference; label: string; description: string }> = [
  { key: 'max', label: 'Max', description: '默认最高音质' },
  { key: 'high', label: '高音质', description: '320kbps 优先' },
  { key: 'standard', label: '标准', description: '兼容更好' },
  { key: 'lossless', label: '无损', description: '优先 FLAC' },
  { key: 'hires', label: 'Hi-Res', description: '平台可用时启用' },
];

const defaultCover = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#eaf1f8"/><circle cx="31" cy="32" r="12" fill="#9fb6cc"/><path d="M28 67c11-19 25-25 42-9" fill="none" stroke="#5f7f9d" stroke-width="8" stroke-linecap="round"/></svg>',
)}`;

const hiddenProviderTabs = new Set<StreamingProviderName>(['mock', 'm3u8']);
const providerPriority: StreamingProviderName[] = ['netease', 'qqmusic', 'soundcloud', 'spotify', 'bilibili'];
const unsupportedDownloadProviders = new Set<StreamingProviderName>(['spotify', 'bilibili']);
const qualitySwitchPlaybackStates = new Set(['loading', 'playing']);
const emptyTracks: StreamingTrack[] = [];
const emptyAlbums: StreamingAlbum[] = [];
const emptyArtists: StreamingArtist[] = [];
const emptyPlaylists: StreamingPlaylist[] = [];

const formatDuration = (duration: number | null): string => {
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const statusText = (provider: StreamingProviderDescriptor): string => {
  if (!provider.enabled) {
    return '未启用';
  }
  if (provider.requiresAccount && !provider.accountConnected) {
    return '未登录';
  }
  return provider.accountDisplayName ? `已登录 ${provider.accountDisplayName}` : '可用';
};

const qualityToPlaybackQuality = (quality: QualityPreference): StreamingAudioQuality =>
  quality === 'max' ? 'hires' : quality;

const downloadStatusLabels: Record<DownloadJobStatus, string> = {
  queued: '排队中',
  probing: '解析链接',
  downloading: '下载中',
  extracting_audio: '提取音频',
  importing: '导入曲库',
  binding_mv: '绑定 MV',
  completed: '下载成功',
  failed: '下载失败',
  cancelled: '已取消',
};

const streamingTrackWebUrl = (track: StreamingTrack): string | null => {
  switch (track.provider) {
    case 'netease':
      return `https://music.163.com/#/song?id=${encodeURIComponent(track.providerTrackId)}`;
    case 'qqmusic':
      return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(track.providerTrackId)}`;
    case 'spotify':
      return `https://open.spotify.com/track/${encodeURIComponent(track.providerTrackId)}`;
    case 'soundcloud':
      return track.providerTrackId.startsWith('http')
        ? track.providerTrackId
        : `https://soundcloud.com/search/sounds?q=${encodeURIComponent(track.title ? `${track.artist} ${track.title}` : track.providerTrackId)}`;
    case 'bilibili':
      return `https://www.bilibili.com/video/${encodeURIComponent(track.providerTrackId)}`;
    default:
      return null;
  }
};

const streamingPlaylistWebUrl = (playlist: StreamingPlaylist): string | null => {
  switch (playlist.provider) {
    case 'netease':
      return `https://music.163.com/#/playlist?id=${encodeURIComponent(playlist.providerPlaylistId)}`;
    case 'qqmusic':
      return `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(playlist.providerPlaylistId)}`;
    case 'spotify':
      return `https://open.spotify.com/playlist/${encodeURIComponent(playlist.providerPlaylistId)}`;
    case 'soundcloud':
      return playlist.providerPlaylistId.startsWith('http')
        ? playlist.providerPlaylistId
        : `https://soundcloud.com/search/sets?q=${encodeURIComponent(playlist.title)}`;
    default:
      return null;
  }
};

const formatAlbumDuration = (tracks: StreamingTrack[]): string | null => {
  const totalSeconds = tracks.reduce((total, track) => total + (track.duration ?? 0), 0);
  if (totalSeconds <= 0) {
    return null;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${totalMinutes} min`;
};

const formatTrackCount = (count: number | null): string => `${count ?? 0} ${(count ?? 0) === 1 ? 'track' : 'tracks'}`;

const safeStreamingArtistName = (artist: Pick<StreamingArtist, 'name' | 'providerArtistId'>): string => {
  const name = typeof artist.name === 'string' ? artist.name.trim() : '';
  const fallback = typeof artist.providerArtistId === 'string' ? artist.providerArtistId.trim() : '';
  return name || fallback || 'Unknown Artist';
};

const isUsefulStreamingArtistName = (value: string | null | undefined, providerArtistId: string): value is string => {
  const candidate = value?.trim();
  if (!candidate || candidate === 'Unknown Artist') {
    return false;
  }

  return candidate.normalize('NFKC').toLocaleLowerCase() !== providerArtistId.trim().normalize('NFKC').toLocaleLowerCase();
};

const safeStreamingArtistDetailName = (artist: StreamingArtist | StreamingArtistDetail): string => {
  const providerArtistId = typeof artist.providerArtistId === 'string' ? artist.providerArtistId.trim() : '';
  if (isUsefulStreamingArtistName(artist.name, providerArtistId)) {
    return artist.name.trim();
  }

  const detail = artist as Partial<StreamingArtistDetail>;
  const topTracks = Array.isArray(detail.topTracks) ? detail.topTracks : [];
  const albums = Array.isArray(detail.albums) ? detail.albums : [];
  const matchingTrackArtist = topTracks
    .flatMap((track) => streamingTrackArtists(track))
    .find((trackArtist) => trackArtist.providerArtistId === providerArtistId);
  const candidates = [
    matchingTrackArtist?.name,
    ...albums.map((album) => album.artist),
    ...topTracks.flatMap((track) => streamingTrackArtists(track).map((trackArtist) => trackArtist.name)),
    ...topTracks.map((track) => track.artist),
  ];
  const inferredName = candidates.find((candidate): candidate is string => isUsefulStreamingArtistName(candidate, providerArtistId));
  return inferredName ?? safeStreamingArtistName(artist);
};

const streamingArtistInitial = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

const streamingTrackArtists = (track: StreamingTrack): StreamingTrack['artists'] =>
  Array.isArray(track.artists) ? track.artists : [];

const streamingTrackToLibraryTrack = (track: StreamingTrack, quality: QualityPreference): LibraryTrack => ({
  id: track.stableKey || streamingStableKey(track.provider, track.providerTrackId),
  mediaType: 'streaming',
  path: track.stableKey,
  provider: track.provider,
  providerTrackId: track.providerTrackId,
  streamingQuality: qualityToPlaybackQuality(quality),
  stableKey: track.stableKey,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist ?? track.artist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: track.duration ?? 0,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: track.coverThumb ?? defaultCover,
  fieldSources: {
    title: track.provider,
    artist: track.provider,
    album: track.provider,
  },
  unavailable: !track.playable,
});

export const StreamingSearchPage = (): JSX.Element => {
  const queue = usePlaybackQueue();
  const initialMemory = readStreamingSearchMemory();
  const [providers, setProviders] = useState<StreamingProviderDescriptor[]>([]);
  const [provider, setProvider] = useState<StreamingProviderName>(initialMemory.provider);
  const [quality, setQuality] = useState<QualityPreference>(initialMemory.quality);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [streamingDownloadActionsEnabled, setStreamingDownloadActionsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<StreamingMediaType>(initialMemory.activeTab);
  const [input, setInput] = useState(initialMemory.input);
  const [query, setQuery] = useState(initialMemory.query);
  const [result, setResult] = useState<StreamingSearchResult | null>(initialMemory.result);
  const [selectedAlbum, setSelectedAlbum] = useState<StreamingAlbum | null>(null);
  const [selectedAlbumDetail, setSelectedAlbumDetail] = useState<StreamingAlbumDetail | null>(null);
  const [isAlbumDetailLoading, setIsAlbumDetailLoading] = useState(false);
  const [albumDetailError, setAlbumDetailError] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<StreamingArtist | null>(null);
  const [selectedArtistDetail, setSelectedArtistDetail] = useState<StreamingArtistDetail | null>(null);
  const [isArtistDetailLoading, setIsArtistDetailLoading] = useState(false);
  const [artistDetailError, setArtistDetailError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [importingPlaylistKey, setImportingPlaylistKey] = useState<string | null>(null);
  const [resolvingTrackKey, setResolvingTrackKey] = useState<string | null>(null);
  const [queuedTrackKey, setQueuedTrackKey] = useState<string | null>(null);
  const [downloadingTrackKey, setDownloadingTrackKey] = useState<string | null>(null);
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);
  const [downloadJobIdsByTrackKey, setDownloadJobIdsByTrackKey] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>(initialMemory.failedCoverUrls);
  const { isReturning: isAlbumReturning, returnBack: returnFromAlbum } = useAnimatedBackNavigation(() => setSelectedAlbum(null), Boolean(selectedAlbum));
  const { isReturning: isArtistReturning, returnBack: returnFromArtist } = useAnimatedBackNavigation(() => setSelectedArtist(null), Boolean(selectedArtist) && !selectedAlbum);
  const requestIdRef = useRef(0);
  const playActionIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const notifiedDownloadJobIdsRef = useRef<Set<string>>(new Set());

  const providerOptions = useMemo(
    () => {
      const visibleProviders = providers.filter((item) => !hiddenProviderTabs.has(item.name));
      return visibleProviders.length > 0
        ? visibleProviders
        : [{
            name: 'netease' as const,
            displayName: 'NetEase Cloud Music',
            enabled: true,
            supportsSearch: true,
            supportsLyrics: true,
            supportsMv: true,
            requiresAccount: false,
          }];
    },
    [providers],
  );
  const currentProvider = providerOptions.find((item) => item.name === provider) ?? providerOptions[0];
  const currentQuality = qualities.find((item) => item.key === quality) ?? qualities[0];
  const source = useMemo(() => ({ type: 'streaming' as const, label: `Streaming / ${currentProvider?.displayName ?? provider}`, provider }), [currentProvider?.displayName, provider]);
  const tracks = result?.tracks ?? emptyTracks;
  const albums = result?.albums ?? emptyAlbums;
  const artists = result?.artists ?? emptyArtists;
  const playlists = result?.playlists ?? emptyPlaylists;
  const resultCount = activeTab === 'album' ? albums.length : activeTab === 'artist' ? artists.length : activeTab === 'playlist' ? playlists.length : tracks.length;
  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? '结果';
  const resultSummary = query
    ? isLoading && resultCount === 0
      ? '正在搜索'
      : `${resultCount} 项结果`
    : '准备搜索';
  const searchStateMessage =
    isLoading && resultCount === 0
      ? '正在搜索...'
      : !isLoading && query && resultCount === 0 && !error
        ? `没有找到匹配的${activeTab === 'album' ? '专辑' : activeTab === 'artist' ? '歌手' : activeTab === 'playlist' ? '歌单' : '流媒体歌曲'}。`
        : !query && activeTab !== 'playlist'
          ? '输入关键词开始搜索。播放时才会解析真实地址，队列不会保存临时 URL。'
          : null;
  const currentStableKey = queue.currentTrack?.mediaType === 'streaming' ? queue.currentTrack.stableKey ?? queue.currentTrack.id : null;
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 86,
    overscan: 8,
  });

  useEffect(() => {
    if (activeTab === 'mv') {
      setActiveTab('track');
    }
  }, [activeTab]);

  useEffect(() => {
    updateStreamingSearchMemory({
      provider,
      quality,
      activeTab,
      input,
      query,
      result,
      failedCoverUrls,
    });
  }, [activeTab, failedCoverUrls, input, provider, quality, query, result]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return undefined;
    }

    const memory = readStreamingSearchMemory();
    if (memory.scrollTop > 0) {
      element.scrollTop = memory.scrollTop;
    }

    const handleScroll = (): void => {
      updateStreamingSearchMemory({ scrollTop: element.scrollTop });
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [tracks.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const app = getAppBridge();
    const applySettings = (settings: Partial<AppSettings> | null | undefined): void => {
      if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'streamingDownloadActionsEnabled')) {
        return;
      }

      setStreamingDownloadActionsEnabled(settings.streamingDownloadActionsEnabled === true);
    };

    void app?.getSettings?.().then(applySettings).catch(() => undefined);

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
        applySettings(event.detail as Partial<AppSettings>);
        return;
      }

      void app?.getSettings?.().then(applySettings).catch(() => undefined);
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, []);

  useEffect(() => {
    const streaming = getStreamingBridge();
    if (!streaming?.getProviders) {
      return;
    }

    void streaming
      .getProviders()
      .then((items) => {
        setProviders(items);
        const visibleItems = items.filter((item) => !hiddenProviderTabs.has(item.name));
        const currentEnabled = visibleItems.some((item) => item.name === provider && item.enabled);
        if (!currentEnabled) {
          setProvider(providerPriority.find((name) => visibleItems.some((item) => item.name === name && item.enabled)) ?? visibleItems.find((item) => item.enabled)?.name ?? 'netease');
        }
      })
      .catch(() => undefined);
  }, [provider]);

  const runSearch = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      const streaming = getStreamingBridge();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setActionError(null);
      setActionMessage(null);
      if (!streaming) {
        setResult(null);
        setError('桌面桥接不可用，请在 ECHO Next 客户端中使用流媒体。');
        return;
      }

      if (!query) {
        setResult(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextResult = await streaming.search({
          provider,
          query,
          mediaTypes: [activeTab],
          page: nextPage,
          pageSize,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setResult((current) =>
          mode === 'append' && current
            ? {
                ...nextResult,
                tracks: [...current.tracks, ...nextResult.tracks],
                albums: [...current.albums, ...nextResult.albums],
                artists: [...current.artists, ...nextResult.artists],
                playlists: [...current.playlists, ...nextResult.playlists],
                mvs: [...current.mvs, ...nextResult.mvs],
              }
            : nextResult,
        );
      } catch (searchError) {
        if (requestIdRef.current === requestId) {
          setError(searchError instanceof Error ? searchError.message : '流媒体服务暂时不可用');
          setResult(null);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [activeTab, provider, query],
  );

  useEffect(() => {
    void runSearch(1, 'replace');
  }, [runSearch]);

  useEffect(() => {
    setFailedCoverUrls({});
  }, [provider, query]);

  useEffect(() => {
    if (!selectedAlbum) {
      setSelectedAlbumDetail(null);
      setAlbumDetailError(null);
      setIsAlbumDetailLoading(false);
      return undefined;
    }

    const streaming = getStreamingBridge();
    if (!streaming?.getAlbum) {
      setSelectedAlbumDetail(null);
      setAlbumDetailError('Desktop bridge unavailable. Open ECHO Next in Electron to read streaming albums.');
      setIsAlbumDetailLoading(false);
      return undefined;
    }

    let isMounted = true;
    setSelectedAlbumDetail(null);
    setAlbumDetailError(null);
    setIsAlbumDetailLoading(true);

    void streaming
      .getAlbum({
        provider: selectedAlbum.provider,
        providerAlbumId: selectedAlbum.providerAlbumId,
      })
      .then((detail) => {
        if (isMounted) {
          setSelectedAlbumDetail(detail);
        }
      })
      .catch((detailError) => {
        if (isMounted) {
          setAlbumDetailError(detailError instanceof Error ? detailError.message : String(detailError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAlbumDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAlbum]);

  useEffect(() => {
    if (!selectedArtist) {
      setSelectedArtistDetail(null);
      setArtistDetailError(null);
      setIsArtistDetailLoading(false);
      return undefined;
    }

    const streaming = getStreamingBridge();
    if (!streaming?.getArtist) {
      setSelectedArtistDetail(null);
      setArtistDetailError('Desktop bridge unavailable. Open ECHO Next in Electron to read streaming artists.');
      setIsArtistDetailLoading(false);
      return undefined;
    }

    let isMounted = true;
    setSelectedArtistDetail(null);
    setArtistDetailError(null);
    setIsArtistDetailLoading(true);

    void streaming
      .getArtist({
        provider: selectedArtist.provider,
        providerArtistId: selectedArtist.providerArtistId,
      })
      .then((detail) => {
        if (isMounted) {
          setSelectedArtistDetail(detail);
        }
      })
      .catch((detailError) => {
        if (isMounted) {
          setArtistDetailError(detailError instanceof Error ? detailError.message : String(detailError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsArtistDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedArtist]);

  useEffect(() => {
    const downloads = getDownloadsBridge();
    if (!downloads?.onJobsUpdated) {
      return undefined;
    }

    return downloads.onJobsUpdated((nextJobs) => {
      setDownloadJobs(nextJobs);
      const trackedEntries = Object.entries(downloadJobIdsByTrackKey);
      for (const job of nextJobs) {
        if (job.status !== 'completed' || notifiedDownloadJobIdsRef.current.has(job.id)) {
          continue;
        }

        const matchedTrackKey = trackedEntries.find(([, jobId]) => jobId === job.id)?.[0];
        if (matchedTrackKey) {
          notifiedDownloadJobIdsRef.current.add(job.id);
          const matchedTrack = tracks.find((track) => track.stableKey === matchedTrackKey);
          setActionError(null);
          setActionMessage(`下载成功：${job.title ?? matchedTrack?.title ?? job.sourceUrl}`);
          break;
        }
      }
    });
  }, [downloadJobIdsByTrackKey, tracks]);

  const handleCoverError = useCallback((stableKey: string, coverUrl: string): void => {
    if (coverUrl === defaultCover) {
      return;
    }

    setFailedCoverUrls((current) => (current[stableKey] === coverUrl ? current : { ...current, [stableKey]: coverUrl }));
  }, []);

  const handleQualityChange = useCallback(
    (nextQuality: QualityPreference): void => {
      setQuality(nextQuality);
      setQualityMenuOpen(false);

      const currentTrack = queue.currentTrack;
      const playbackQuality = qualityToPlaybackQuality(nextQuality);
      if (
        !currentTrack ||
        currentTrack.mediaType !== 'streaming' ||
        currentTrack.provider !== provider ||
        currentTrack.streamingQuality === playbackQuality
      ) {
        return;
      }

      const playback = window.echo?.playback;
      if (!playback?.getStatus) {
        return;
      }

      void (async () => {
        const status = await playback.getStatus();
        if (
          status.currentTrackId !== currentTrack.id ||
          !qualitySwitchPlaybackStates.has(status.state)
        ) {
          return;
        }

        await queue.playTrack(
          { ...currentTrack, streamingQuality: playbackQuality },
          {
            source,
            startSeconds: Math.max(0, status.positionMs / 1000),
            forceRefresh: true,
          },
        );
        setActionError(null);
        setActionMessage(`已切换音质：${qualities.find((item) => item.key === nextQuality)?.label ?? playbackQuality}`);
      })().catch((qualityError) => {
        if (isPlaybackCancellationError(qualityError)) {
          return;
        }

        setActionError(qualityError instanceof Error ? qualityError.message : '切换音质失败');
        setActionMessage(null);
      });
    },
    [provider, queue, source],
  );

  const handlePlay = useCallback(
    async (track: StreamingTrack): Promise<void> => {
      if (resolvingTrackKey === track.stableKey) {
        return;
      }

      if (!track.playable) {
      setActionError(track.unavailableReason ?? '这首歌暂时不可播放');
        setActionMessage(null);
        return;
      }

      setActionError(null);
      setActionMessage(null);
      const playActionId = playActionIdRef.current + 1;
      playActionIdRef.current = playActionId;
      setResolvingTrackKey(track.stableKey);
      try {
        await queue.playTrack(streamingTrackToLibraryTrack(track, quality), {
          source,
          forceNewQueueItem: true,
        });
      } catch (playError) {
        if (isPlaybackCancellationError(playError) || playActionIdRef.current !== playActionId) {
          return;
        }

        setActionError(playError instanceof Error ? playError.message : '流媒体服务暂时不可用');
      } finally {
        if (playActionIdRef.current === playActionId) {
          setResolvingTrackKey(null);
        }
      }
    },
    [quality, queue, resolvingTrackKey, source],
  );

  const handleAddToQueue = useCallback(
    (track: StreamingTrack): void => {
      if (!track.playable) {
        setActionError(track.unavailableReason ?? '这首歌暂时不可播放');
        setActionMessage(null);
        return;
      }

      setActionError(null);
      setActionMessage('已加入队列');
      queue.appendToQueue(streamingTrackToLibraryTrack(track, quality), source);
      setQueuedTrackKey(track.stableKey);
      window.setTimeout(() => setQueuedTrackKey((current) => (current === track.stableKey ? null : current)), 1400);
    },
    [quality, queue, source],
  );

  const handleDownload = useCallback(async (track: StreamingTrack): Promise<void> => {
    if (unsupportedDownloadProviders.has(track.provider)) {
      setActionError('这个平台在 ECHO Next 中仅支持流播放，不提供下载任务。');
      setActionMessage(null);
      return;
    }

    const sourceUrl = streamingTrackWebUrl(track);
    if (!sourceUrl) {
      setActionError('这个平台暂不支持从流媒体结果直接下载。');
      setActionMessage(null);
      return;
    }

    const downloads = getDownloadsBridge();
    if (!downloads?.createUrlJob) {
      setActionError('桌面下载服务不可用。');
      setActionMessage(null);
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setDownloadingTrackKey(track.stableKey);
    try {
      const streaming = getStreamingBridge();
      if (!streaming?.resolvePlayback) {
        throw new Error('桌面桥接不可用，无法解析流媒体下载地址。');
      }
      const source = await streaming.resolvePlayback({
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        quality: qualityToPlaybackQuality(quality),
      });
      const job = await downloads.createUrlJob(source.url, {
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist ?? track.artist,
        coverUrl: track.coverUrl ?? track.coverThumb ?? null,
        webpageUrl: sourceUrl,
        bindMvAfterImport: false,
        requestHeaders: source.headers,
        directAudio: true,
        directAudioMimeType: source.mimeType,
        directAudioExtension: source.codec,
        streamingProvider: track.provider,
        streamingProviderTrackId: track.providerTrackId,
        streamingStableKey: track.stableKey,
        downloadAuthorizationToken: source.downloadAuthorizationToken,
      });
      setDownloadJobs((current) => (current.some((item) => item.id === job.id) ? current : [job, ...current]));
      setDownloadJobIdsByTrackKey((current) => ({ ...current, [track.stableKey]: job.id }));
      setActionMessage(`已加入下载队列：${track.title}`);
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : '添加下载任务失败');
      setActionMessage(null);
    } finally {
      setDownloadingTrackKey((current) => (current === track.stableKey ? null : current));
    }
  }, [quality]);

  const handleImportPlaylist = useCallback(async (): Promise<void> => {
    const streaming = getStreamingBridge();
    const url = playlistUrl.trim();
    if (!url || isImportingPlaylist) {
      return;
    }

    if (!streaming?.importPlaylistFromUrl) {
      setActionError('桌面桥接不可用，请在 ECHO Next 客户端窗口中添加流媒体歌单。');
      setActionMessage(null);
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsImportingPlaylist(true);
    try {
      const imported = await streaming.importPlaylistFromUrl(url);
      setPlaylistUrl('');
      setActionMessage(`已添加歌单：${imported.playlistName}，共 ${imported.importedCount} 首。可在播放列表页播放。`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (importError) {
      setActionError(importError instanceof Error ? importError.message : '添加流媒体歌单失败');
      setActionMessage(null);
    } finally {
      setIsImportingPlaylist(false);
    }
  }, [isImportingPlaylist, playlistUrl]);

  const handleImportStreamingPlaylist = useCallback(async (playlist: StreamingPlaylist): Promise<void> => {
    const streaming = getStreamingBridge();
    const playlistWebUrl = streamingPlaylistWebUrl(playlist);
    if (!playlistWebUrl || importingPlaylistKey) {
      return;
    }

    if (!streaming?.importPlaylistFromUrl) {
      setActionError('桌面桥接不可用，请在 ECHO Next 客户端窗口中添加流媒体歌单。');
      setActionMessage(null);
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setImportingPlaylistKey(playlist.id);
    try {
      const imported = await streaming.importPlaylistFromUrl(playlistWebUrl);
      setActionMessage(`已添加歌单：${imported.playlistName}，共 ${imported.importedCount} 首。可在播放列表页播放。`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (importError) {
      setActionError(importError instanceof Error ? importError.message : '添加流媒体歌单失败');
      setActionMessage(null);
    } finally {
      setImportingPlaylistKey((current) => (current === playlist.id ? null : current));
    }
  }, [importingPlaylistKey]);

  const handleOpenAlbum = useCallback((album: StreamingAlbum): void => {
    setSelectedAlbum(album);
    setActionError(null);
    setActionMessage(null);
  }, []);

  const handleAlbumKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, album: StreamingAlbum): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenAlbum(album);
    }
  }, [handleOpenAlbum]);

  const handleOpenArtist = useCallback((artist: StreamingArtist): void => {
    setSelectedArtist(artist);
    setActionError(null);
    setActionMessage(null);
  }, []);

  const handleArtistKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, artist: StreamingArtist): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenArtist(artist);
    }
  }, [handleOpenArtist]);

  const handleOpenTrackArtist = useCallback((artistRef: StreamingTrack['artists'][number]): void => {
    handleOpenArtist({
      id: artistRef.id,
      provider: artistRef.provider,
      providerArtistId: artistRef.providerArtistId,
      name: artistRef.name,
      avatarUrl: null,
      coverUrl: null,
    });
  }, [handleOpenArtist]);

  const handleOpenTrackAlbum = useCallback((track: StreamingTrack): void => {
    if (!track.albumId) {
      return;
    }

    handleOpenAlbum({
      id: streamingStableKey(track.provider, `album:${track.albumId}`),
      provider: track.provider,
      providerAlbumId: track.albumId,
      title: track.album,
      artist: track.albumArtist ?? track.artist,
      artists: track.artists,
      coverUrl: track.coverUrl,
      coverThumb: track.coverThumb,
      releaseDate: null,
      trackCount: null,
    });
  }, [handleOpenAlbum]);

  const handlePlayAlbum = useCallback(async (): Promise<void> => {
    const detail = selectedAlbumDetail;
    const firstTrack = detail?.tracks.find((track) => track.playable) ?? null;
    if (!detail || !firstTrack) {
      setAlbumDetailError('这张流媒体专辑暂时没有可播放的歌曲。');
      return;
    }

    const detailSource = { type: 'streaming' as const, label: `${detail.title} / ${detail.provider}`, provider: detail.provider };
    const playableTracks = detail.tracks.filter((track) => track.playable).map((track) => streamingTrackToLibraryTrack(track, quality));
    const firstPlayable = playableTracks[0];
    if (!firstPlayable) {
      setAlbumDetailError('这张流媒体专辑暂时没有可播放的歌曲。');
      return;
    }

    try {
      setAlbumDetailError(null);
      await queue.playTrack(firstPlayable, {
        replaceQueueWith: playableTracks,
        source: detailSource,
      });
    } catch (playError) {
      if (isPlaybackCancellationError(playError)) {
        return;
      }

      setAlbumDetailError(playError instanceof Error ? playError.message : String(playError));
    }
  }, [quality, queue, selectedAlbumDetail]);

  const renderStreamingAlbumDetail = (): JSX.Element | null => {
    const album = selectedAlbumDetail ?? selectedAlbum;
    if (!album) {
      return null;
    }

    const detailTracks = selectedAlbumDetail?.tracks ?? [];
    const coverSrc = selectedAlbumDetail?.coverThumb ?? selectedAlbum?.coverThumb ?? defaultCover;
    const duration = formatAlbumDuration(detailTracks);
    const albumMetadata = [
      album.releaseDate,
      formatTrackCount(selectedAlbumDetail?.tracks.length ?? album.trackCount),
      duration,
      album.provider,
    ].filter((item): item is string => Boolean(item));
    const firstTrack = detailTracks[0] ?? null;
    const qualitySummary = firstTrack?.qualities.join(' / ') || 'Reading signal';
    const currentDetailStableKey = queue.currentTrack?.mediaType === 'streaming' ? queue.currentTrack.stableKey ?? queue.currentTrack.id : null;

    return (
      <div className={`album-detail-page ${isAlbumReturning ? 'is-returning' : ''}`}>
        <button className="album-back-button" type="button" onClick={returnFromAlbum}>
          <ArrowLeft size={17} />
          Streaming
        </button>

        <section className="album-detail-hero" aria-label={`${album.title} streaming album details`}>
          <div className="album-detail-cover" data-empty={!coverSrc || coverSrc === defaultCover}>
            {coverSrc ? <img alt="" decoding="async" draggable={false} height={320} src={coverSrc} width={320} /> : <Disc3 size={58} />}
          </div>

          <div className="album-detail-console">
            <div className="album-detail-copy">
              <span className="album-detail-kicker">Streaming Album</span>
              <h1>{album.title}</h1>
              <p>{album.artist}</p>

              <div className="album-detail-meta" aria-label="Streaming album metadata">
                {albumMetadata.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="album-detail-actions">
              <button className="album-primary-action" type="button" disabled={isAlbumDetailLoading || detailTracks.length === 0} onClick={() => void handlePlayAlbum()}>
                {isAlbumDetailLoading ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} fill="currentColor" />}
                {isAlbumDetailLoading ? 'Reading album' : 'Play Now'}
              </button>
            </div>

            {albumDetailError ? <p className="album-detail-error">{albumDetailError}</p> : null}
          </div>

          <aside className="album-detail-facts" aria-label="Streaming album info">
            <div className="album-fact">
              <span>Provider</span>
              <strong>{album.provider}</strong>
            </div>
            <div className="album-fact">
              <span>Tracks</span>
              <strong>{formatTrackCount(selectedAlbumDetail?.tracks.length ?? album.trackCount)}</strong>
            </div>
            <div className="album-fact">
              <span>Released</span>
              <strong>{album.releaseDate ?? 'Unknown'}</strong>
            </div>
            <div className="album-fact">
              <span>Quality</span>
              <strong>{qualitySummary}</strong>
            </div>
          </aside>
        </section>

        <section className="album-detail-track-console" aria-label={`${album.title} streaming track console`}>
          <header className="album-detail-tabs" aria-label="Streaming album sections">
            <button className="album-detail-tab" type="button" aria-current="page">
              Tracks
            </button>
          </header>

          {isAlbumDetailLoading && detailTracks.length === 0 ? <div className="streaming-state">正在读取专辑...</div> : null}
          {!isAlbumDetailLoading && detailTracks.length === 0 && !albumDetailError ? <div className="streaming-state">这张专辑没有可显示的歌曲。</div> : null}
          {detailTracks.length > 0 ? (
            <div className="streaming-album-track-list">
              {detailTracks.map((track) => {
                const isPlaying = currentDetailStableKey === track.stableKey;
                const isResolving = resolvingTrackKey === track.stableKey;
                const isQueued = queuedTrackKey === track.stableKey;
                const disabled = !track.playable || Boolean(resolvingTrackKey);
                const rawCoverSrc = track.coverThumb ?? coverSrc ?? defaultCover;
                const trackCoverSrc = failedCoverUrls[track.stableKey] === rawCoverSrc ? defaultCover : rawCoverSrc;

                return (
                  <article className="streaming-row" data-playing={isPlaying} data-unavailable={!track.playable} key={track.stableKey} onDoubleClick={() => void handlePlay(track)}>
                    <div className="streaming-cover" data-empty={trackCoverSrc === defaultCover}>
                      <img
                        src={trackCoverSrc}
                        alt=""
                        decoding="async"
                        draggable={false}
                        height={56}
                        loading="lazy"
                        width={56}
                        onError={() => handleCoverError(track.stableKey, trackCoverSrc)}
                      />
                    </div>
                    <div className="streaming-main">
                      <div className="streaming-title-line">
                        {isPlaying ? <span className="playing-dot" /> : null}
                        <strong>{track.title}</strong>
                        {isPlaying ? <em>正在播放</em> : null}
                      </div>
                      {renderTrackCredits(track)}
                      <small>{track.playable ? `${track.provider} · ${track.qualities.join(' / ') || 'standard'}` : (track.unavailableReason ?? '这首歌暂时不可播放')}</small>
                    </div>
                    <span className="streaming-duration">{formatDuration(track.duration)}</span>
                    <div className="streaming-actions" onDoubleClick={(event) => event.stopPropagation()}>
                      <button type="button" title="播放" onClick={() => void handlePlay(track)} disabled={disabled}>
                        {isResolving ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} />}
                      </button>
                      <button type="button" title="加入队列" onClick={() => handleAddToQueue(track)} disabled={!track.playable}>
                        {isQueued ? <Check size={16} /> : <ListPlus size={16} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    );
  };

  const handlePlayArtist = useCallback(async (): Promise<void> => {
    const detail = selectedArtistDetail;
    const topTracks = Array.isArray(detail?.topTracks) ? detail.topTracks : [];
    const playableTracks = topTracks.filter((track) => track.playable).map((track) => streamingTrackToLibraryTrack(track, quality));
    const firstTrack = playableTracks[0];
    if (!detail || !firstTrack) {
      setArtistDetailError('这个流媒体歌手暂时没有可播放的歌曲。');
      return;
    }

    try {
      setArtistDetailError(null);
      const detailName = safeStreamingArtistDetailName(detail);
      await queue.playTrack(firstTrack, {
        replaceQueueWith: playableTracks,
        source: { type: 'streaming' as const, label: `${detailName} / ${detail.provider}`, provider: detail.provider },
      });
    } catch (playError) {
      if (isPlaybackCancellationError(playError)) {
        return;
      }

      setArtistDetailError(playError instanceof Error ? playError.message : String(playError));
    }
  }, [quality, queue, selectedArtistDetail]);

  const handleQueueArtist = useCallback((): void => {
    if (!selectedArtistDetail) {
      return;
    }

    const artistSource = {
      type: 'streaming' as const,
      label: `${safeStreamingArtistDetailName(selectedArtistDetail)} / ${selectedArtistDetail.provider}`,
      provider: selectedArtistDetail.provider,
    };
    const topTracks = Array.isArray(selectedArtistDetail.topTracks) ? selectedArtistDetail.topTracks : [];
    topTracks
      .filter((track) => track.playable)
      .forEach((track) => queue.appendToQueue(streamingTrackToLibraryTrack(track, quality), artistSource));
  }, [quality, queue, selectedArtistDetail]);

  const renderStreamingArtistDetail = (): JSX.Element | null => {
    const artist = selectedArtistDetail ?? selectedArtist;
    if (!artist) {
      return null;
    }

    const artistName = safeStreamingArtistDetailName(artist);
    const artistProvider = artist.provider ?? provider;
    const topTracks = Array.isArray(selectedArtistDetail?.topTracks) ? selectedArtistDetail.topTracks : [];
    const artistAlbums = Array.isArray(selectedArtistDetail?.albums) ? selectedArtistDetail.albums : [];
    const heroImageUrl = artist.coverUrl ?? artist.avatarUrl ?? null;
    const currentDetailStableKey = queue.currentTrack?.mediaType === 'streaming' ? queue.currentTrack.stableKey ?? queue.currentTrack.id : null;
    const canPlay = topTracks.some((track) => track.playable);

    return (
      <div className={`artist-detail-page ${isArtistReturning ? 'is-returning' : ''}`}>
        <button className="artist-detail-back" type="button" onClick={returnFromArtist}>
          <ArrowLeft size={17} />
          Streaming
        </button>

        <section className="artist-hero" aria-label={`${artistName} streaming artist details`}>
          <div className="artist-hero-avatar" data-cover={Boolean(heroImageUrl)} aria-hidden="true">
            {heroImageUrl ? <img alt="" decoding="async" draggable={false} height={512} loading="lazy" src={heroImageUrl} width={512} /> : <span>{streamingArtistInitial(artistName)}</span>}
          </div>

          <div className="artist-hero-copy">
            <span className="artist-detail-kicker">Streaming Artist</span>
            <h1>{artistName}</h1>
            <div className="artist-hero-meta" aria-label="Streaming artist metadata">
              <span>{artistProvider}</span>
              <span>{formatTrackCount(topTracks.length)}</span>
              <span>{artistAlbums.length} albums</span>
            </div>
            <p>Streaming catalog from {artistProvider}.</p>

            <div className="artist-hero-actions">
              <button className="artist-primary-action" type="button" disabled={isArtistDetailLoading || !canPlay} onClick={() => void handlePlayArtist()}>
                {isArtistDetailLoading ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} fill="currentColor" />}
                {isArtistDetailLoading ? 'Reading Artist' : 'Play Artist'}
              </button>
              <button className="artist-secondary-action" type="button" disabled={!canPlay} onClick={handleQueueArtist}>
                <ListPlus size={16} />
                Add to Queue
              </button>
            </div>

            {artistDetailError ? <p className="artist-detail-error">{artistDetailError}</p> : null}
          </div>
        </section>

        <section className="artist-detail-section" aria-label={`${artistName} streaming top tracks`}>
          <div className="artist-section-heading">
            <div>
              <span>Top Tracks</span>
              <h2>Songs</h2>
            </div>
          </div>
          {isArtistDetailLoading && topTracks.length === 0 ? <div className="streaming-state">正在读取歌手...</div> : null}
          {!isArtistDetailLoading && topTracks.length === 0 && !artistDetailError ? <div className="streaming-state">这个歌手没有可显示的歌曲。</div> : null}
          {topTracks.length > 0 ? (
            <div className="streaming-album-track-list">
              {topTracks.map((track) => {
                const isPlaying = currentDetailStableKey === track.stableKey;
                const isResolving = resolvingTrackKey === track.stableKey;
                const isQueued = queuedTrackKey === track.stableKey;
                const disabled = !track.playable || Boolean(resolvingTrackKey);
                const rawCoverSrc = track.coverThumb ?? defaultCover;
                const trackCoverSrc = failedCoverUrls[track.stableKey] === rawCoverSrc ? defaultCover : rawCoverSrc;

                return (
                  <article className="streaming-row" data-playing={isPlaying} data-unavailable={!track.playable} key={track.stableKey} onDoubleClick={() => void handlePlay(track)}>
                    <div className="streaming-cover" data-empty={trackCoverSrc === defaultCover}>
                      <img src={trackCoverSrc} alt="" decoding="async" draggable={false} height={56} loading="lazy" width={56} onError={() => handleCoverError(track.stableKey, trackCoverSrc)} />
                    </div>
                    <div className="streaming-main">
                      <div className="streaming-title-line">
                        {isPlaying ? <span className="playing-dot" /> : null}
                        <strong>{track.title}</strong>
                        {isPlaying ? <em>正在播放</em> : null}
                      </div>
                      {renderTrackCredits(track)}
                      <small>{track.playable ? `${track.provider} · ${track.album}` : (track.unavailableReason ?? '这首歌暂时不可播放')}</small>
                    </div>
                    <span className="streaming-duration">{formatDuration(track.duration)}</span>
                    <div className="streaming-actions" onDoubleClick={(event) => event.stopPropagation()}>
                      <button type="button" title="播放" onClick={() => void handlePlay(track)} disabled={disabled}>
                        {isResolving ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} />}
                      </button>
                      <button type="button" title="加入队列" onClick={() => handleAddToQueue(track)} disabled={!track.playable}>
                        {isQueued ? <Check size={16} /> : <ListPlus size={16} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        {artistAlbums.length > 0 ? (
          <section className="artist-detail-section" aria-label={`${artistName} streaming albums`}>
            <div className="artist-section-heading">
              <div>
                <span>Albums</span>
                <h2>Discography</h2>
              </div>
            </div>
            <div className="streaming-discovery-list">
              {artistAlbums.map(renderAlbumCard)}
            </div>
          </section>
        ) : null}
      </div>
    );
  };

  const renderTrackCredits = (track: StreamingTrack): JSX.Element => {
    const artists = streamingTrackArtists(track);
    const displayArtists = artists.length > 0 ? artists : null;
    const canOpenAlbum = Boolean(track.albumId);

    return (
      <span className="streaming-credit-links">
        {displayArtists
          ? displayArtists.map((artist, index) => (
              <span className="streaming-credit-part" key={artist.id}>
                {index > 0 ? <span className="streaming-credit-separator">,</span> : null}
                <button
                  type="button"
                  className="streaming-inline-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenTrackArtist(artist);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  {artist.name}
                </button>
              </span>
            ))
          : <span>{track.artist}</span>}
        <span className="streaming-credit-separator">/</span>
        {canOpenAlbum ? (
          <button
            type="button"
            className="streaming-inline-link"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenTrackAlbum(track);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {track.album}
          </button>
        ) : (
          <span>{track.album}</span>
        )}
      </span>
    );
  };

  const renderAlbumCard = (album: StreamingAlbum): JSX.Element => {
    const rawCoverSrc = album.coverThumb ?? defaultCover;
    const coverSrc = failedCoverUrls[album.id] === rawCoverSrc ? defaultCover : rawCoverSrc;

    return (
      <article
        key={album.id}
        className="streaming-discovery-card"
        role="button"
        tabIndex={0}
        onClick={() => handleOpenAlbum(album)}
        onKeyDown={(event) => handleAlbumKeyDown(event, album)}
      >
        <div className="streaming-cover" data-empty={coverSrc === defaultCover}>
          <img
            src={coverSrc}
            alt=""
            decoding="async"
            draggable={false}
            height={56}
            loading="lazy"
            width={56}
            onError={() => handleCoverError(album.id, coverSrc)}
          />
        </div>
        <div className="streaming-main">
          <div className="streaming-title-line">
            <Disc3 size={15} />
            <strong>{album.title}</strong>
          </div>
          <span>{album.artist}</span>
          <small>
            {album.provider} · {album.trackCount ? `${album.trackCount} 首` : '曲目数未知'}
            {album.releaseDate ? ` · ${album.releaseDate}` : ''}
          </small>
        </div>
      </article>
    );
  };

  const renderArtistCard = (artist: StreamingArtist): JSX.Element => {
    const rawCoverSrc = artist.avatarUrl ?? artist.coverUrl ?? defaultCover;
    const coverSrc = failedCoverUrls[artist.id] === rawCoverSrc ? defaultCover : rawCoverSrc;

    return (
      <article
        key={artist.id}
        className="streaming-discovery-card"
        role="button"
        tabIndex={0}
        onClick={() => handleOpenArtist(artist)}
        onKeyDown={(event) => handleArtistKeyDown(event, artist)}
      >
        <div className="streaming-cover streaming-cover--avatar" data-empty={coverSrc === defaultCover}>
          <img
            src={coverSrc}
            alt=""
            decoding="async"
            draggable={false}
            height={56}
            loading="lazy"
            width={56}
            onError={() => handleCoverError(artist.id, coverSrc)}
          />
        </div>
        <div className="streaming-main">
          <div className="streaming-title-line">
            <UserRound size={15} />
            <strong>{artist.name}</strong>
          </div>
          <span>{artist.provider}</span>
          <small>歌手 ID · {artist.providerArtistId}</small>
        </div>
      </article>
    );
  };

  const renderPlaylistCard = (playlist: StreamingPlaylist): JSX.Element => {
    const rawCoverSrc = playlist.coverThumb ?? defaultCover;
    const coverSrc = failedCoverUrls[playlist.id] === rawCoverSrc ? defaultCover : rawCoverSrc;
    const isImporting = importingPlaylistKey === playlist.id;

    return (
      <article key={playlist.id} className="streaming-discovery-card streaming-playlist-card">
        <div className="streaming-cover" data-empty={coverSrc === defaultCover}>
          <img
            src={coverSrc}
            alt=""
            decoding="async"
            draggable={false}
            height={56}
            loading="lazy"
            width={56}
            onError={() => handleCoverError(playlist.id, coverSrc)}
          />
        </div>
        <div className="streaming-main">
          <div className="streaming-title-line">
            <ListPlus size={15} />
            <strong>{playlist.title}</strong>
          </div>
          <span>{playlist.creator ?? playlist.provider}</span>
          <small>
            {playlist.provider} · {formatTrackCount(playlist.trackCount)}
          </small>
        </div>
        <button type="button" className="streaming-playlist-add" disabled={Boolean(importingPlaylistKey)} onClick={() => void handleImportStreamingPlaylist(playlist)}>
          {isImporting ? <Loader2 className="spinning-icon" size={15} /> : <ListPlus size={15} />}
          <span>{isImporting ? '添加中' : '添加歌单'}</span>
        </button>
      </article>
    );
  };

  if (selectedAlbum) {
    return renderStreamingAlbumDetail() ?? <div className="streaming-page streaming-hub" />;
  }

  if (selectedArtist) {
    return renderStreamingArtistDetail() ?? <div className="streaming-page streaming-hub" />;
  }

  return (
    <div className="streaming-page streaming-hub">
      <header className="streaming-hero">
        <div className="streaming-hero-copy">
          <span className="streaming-kicker">
            <Radio size={16} />
            Streaming
          </span>
          <h1>流媒体音乐</h1>
          <p>搜索在线曲库，播放前临时解析音频地址。</p>
        </div>
        <div className="streaming-hero-meter" aria-label="当前流媒体状态">
          <span>当前来源</span>
          <strong>{currentProvider?.displayName ?? provider}</strong>
          <small>{activeTabLabel} · {resultSummary}</small>
        </div>
      </header>

      <section className="streaming-command-panel">
        <label className="search-box streaming-search-box">
          <Search size={19} />
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="搜索歌曲、歌手、专辑" />
        </label>
        <div className="streaming-provider-tabs" aria-label="流媒体平台">
          {providerOptions.map((item) => (
            <button key={item.name} type="button" data-active={item.name === provider} disabled={!item.enabled} onClick={() => setProvider(item.name)}>
              <span>{item.displayName}</span>
              <small>{statusText(item)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="streaming-toolbar">
        <nav className="streaming-result-tabs" aria-label="结果类型">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" data-active={tab.key === activeTab} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="streaming-quality-select">
          <button type="button" aria-expanded={qualityMenuOpen} onClick={() => setQualityMenuOpen((open) => !open)}>
            <span>音质</span>
            <strong>{currentQuality.label}</strong>
            <ChevronDown size={15} />
          </button>
          {qualityMenuOpen ? (
            <div className="streaming-quality-menu" role="listbox" aria-label="音质">
              {qualities.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={item.key === quality}
                  onClick={() => handleQualityChange(item.key)}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {item.key === quality ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="streaming-state-stack">
        {error ? <div className="streaming-state streaming-state--error">{error}</div> : null}
        {actionError ? <div className="streaming-state streaming-state--error">{actionError}</div> : null}
        {actionMessage ? <div className="streaming-state streaming-state--success">{actionMessage}</div> : null}
      </div>

      <div className="streaming-results-shell">
        {searchStateMessage ? (
          <div className="streaming-results-empty">{searchStateMessage}</div>
        ) : activeTab === 'playlist' ? (
          <div className="streaming-playlist-panel">
            <form
              className="streaming-playlist-import"
              onSubmit={(event) => {
                event.preventDefault();
                void handleImportPlaylist();
              }}
            >
              <div className="streaming-playlist-import-copy">
                <span>
                  <Link size={18} />
                  添加流媒体歌单
                </span>
                <p>粘贴网易云音乐或 QQ 音乐歌单链接，导入后会保存到本地播放列表，重开软件也不会消失。</p>
              </div>
              <label>
                <Link size={18} />
                <input
                  value={playlistUrl}
                  onChange={(event) => setPlaylistUrl(event.target.value)}
                  placeholder="粘贴歌单链接，例如 https://music.163.com/#/playlist?id=..."
                  disabled={isImportingPlaylist}
                />
              </label>
              <button type="submit" disabled={!playlistUrl.trim() || isImportingPlaylist}>
                {isImportingPlaylist ? <Loader2 className="spinning-icon" size={16} /> : <ListPlus size={16} />}
                <span>{isImportingPlaylist ? '正在添加' : '添加歌单'}</span>
              </button>
            </form>
            {playlists.length > 0 ? (
              <div className="streaming-discovery-list" aria-label="歌单搜索结果">
                {playlists.map(renderPlaylistCard)}
              </div>
            ) : null}
          </div>
        ) : activeTab === 'album' ? (
          <div className="streaming-discovery-list" aria-label="专辑搜索结果">
            {albums.map(renderAlbumCard)}
          </div>
        ) : activeTab === 'artist' ? (
          <div className="streaming-discovery-list" aria-label="歌手搜索结果">
            {artists.map(renderArtistCard)}
          </div>
        ) : (
          <div ref={listRef} className="streaming-results" aria-busy={isLoading}>
            <div className="streaming-virtual-spacer" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const track = tracks[virtualItem.index];
                const isPlaying = currentStableKey === track.stableKey;
                const isResolving = resolvingTrackKey === track.stableKey;
                const isQueued = queuedTrackKey === track.stableKey;
                const downloadJobId = downloadJobIdsByTrackKey[track.stableKey];
                const downloadJob = downloadJobId ? downloadJobs.find((job) => job.id === downloadJobId) : null;
                const isDownloading =
                  downloadingTrackKey === track.stableKey ||
                  downloadJob?.status === 'queued' ||
                  downloadJob?.status === 'probing' ||
                  downloadJob?.status === 'downloading' ||
                  downloadJob?.status === 'extracting_audio' ||
                  downloadJob?.status === 'importing' ||
                  downloadJob?.status === 'binding_mv';
                const disabled = !track.playable || Boolean(resolvingTrackKey);
                const downloadProgress = downloadJob ? Math.max(0, Math.min(100, downloadJob.progress)) : 0;
                const rawCoverSrc = track.coverThumb ?? defaultCover;
                const coverSrc = failedCoverUrls[track.stableKey] === rawCoverSrc ? defaultCover : rawCoverSrc;

                return (
                  <div
                    key={track.stableKey}
                    ref={virtualizer.measureElement}
                    className="streaming-virtual-row"
                    data-index={virtualItem.index}
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <article className="streaming-row" data-playing={isPlaying} data-unavailable={!track.playable} onDoubleClick={() => void handlePlay(track)}>
                      <div className="streaming-cover" data-empty={coverSrc === defaultCover}>
                        <img
                          src={coverSrc}
                          alt=""
                          decoding="async"
                          draggable={false}
                          height={56}
                          loading="lazy"
                          width={56}
                          onError={() => handleCoverError(track.stableKey, coverSrc)}
                        />
                      </div>
                      <div className="streaming-main">
                        <div className="streaming-title-line">
                          {isPlaying ? <span className="playing-dot" /> : null}
                          <strong>{track.title}</strong>
                          {isPlaying ? <em>正在播放</em> : null}
                        </div>
                        {renderTrackCredits(track)}
                        <small>{track.playable ? `${track.provider} · ${track.qualities.join(' / ') || 'standard'}` : (track.unavailableReason ?? '这首歌暂时不可播放')}</small>
                      </div>
                      <span className="streaming-duration">{formatDuration(track.duration)}</span>
                      <div className="streaming-actions" onDoubleClick={(event) => event.stopPropagation()}>
                        <button type="button" title="播放" onClick={() => void handlePlay(track)} disabled={disabled}>
                          {isResolving ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} />}
                        </button>
                        <button type="button" title="加入队列" onClick={() => handleAddToQueue(track)} disabled={!track.playable}>
                          {isQueued ? <Check size={16} /> : <ListPlus size={16} />}
                        </button>
                        {streamingDownloadActionsEnabled && !unsupportedDownloadProviders.has(track.provider) ? (
                          <button type="button" title="下载" onClick={() => void handleDownload(track)} disabled={isDownloading}>
                            {isDownloading ? <Loader2 className="spinning-icon" size={16} /> : <Download size={16} />}
                          </button>
                        ) : null}
                      </div>
                      {isResolving ? <div className="streaming-resolving">正在解析播放地址...</div> : null}
                      {downloadJob ? (
                        <div className="streaming-download-progress" data-status={downloadJob.status}>
                          <div
                            className="streaming-download-progress-track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(downloadProgress)}
                            aria-label="下载进度"
                          >
                            <span style={{ width: `${downloadProgress}%` }} />
                          </div>
                          <small>
                            {downloadStatusLabels[downloadJob.status]} · {Math.round(downloadProgress)}%
                          </small>
                          {downloadJob.status === 'failed' && downloadJob.error ? <small>{downloadJob.error}</small> : null}
                        </div>
                      ) : null}
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {activeTab !== 'playlist' && result?.hasMore ? (
        <button className="streaming-load-more" type="button" onClick={() => void runSearch((result.page ?? 1) + 1, 'append')} disabled={isLoading}>
          {isLoading ? '加载中...' : '加载更多'}
        </button>
      ) : null}
    </div>
  );
};
