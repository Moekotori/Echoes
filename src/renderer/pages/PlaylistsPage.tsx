import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Download, FilePlus2, ImagePlus, Link, ListPlus, Loader2, MoreHorizontal, Music2, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, WifiOff, X } from 'lucide-react';
import type { DownloadJob, DownloadJobStatus } from '../../shared/types/downloads';
import type { LibraryPage, LibraryPlaylist, LibraryPlaylistItem, LibraryTrack, PlaylistExportFormat, PlaylistSortMode } from '../../shared/types/library';
import type { StreamingAudioQuality, StreamingProviderName } from '../../shared/types/streaming';
import { TrackList } from '../components/library/TrackList';
import { TrackContextMenu, type TrackMenuAction } from '../components/library/TrackContextMenu';
import { likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../hooks/useLikedMedia';
import { usePlaybackFollowCurrentTrack } from '../hooks/usePlaybackFollowCurrentTrack';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { resolvePlaylistForTrackAdd } from '../utils/appPrompt';
import { getDownloadsBridge, getStreamingBridge } from '../utils/echoBridge';

const pageSize = 100;
const playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }> = [
  { value: 'manual', label: '手动排序' },
  { value: 'addedDesc', label: '最近添加' },
  { value: 'titleAsc', label: '歌名 A-Z' },
  { value: 'titleDesc', label: '歌名 Z-A' },
  { value: 'artistAsc', label: '艺术家 A-Z' },
];
const playlistExportOptions: Array<{ value: PlaylistExportFormat; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'txt', label: 'TXT' },
  { value: 'm3u8', label: 'M3U8' },
  { value: 'csv', label: 'CSV' },
];
const streamingQualityOptions: Array<{ value: StreamingAudioQuality; label: string }> = [
  { value: 'hires', label: 'Hi-Res' },
  { value: 'lossless', label: 'Lossless' },
  { value: 'high', label: 'High' },
  { value: 'standard', label: 'Standard' },
];
const neteaseDailyRecommendSourcePlaylistId = 'daily-recommend';
const runningDownloadStatuses = new Set<DownloadJobStatus>(['queued', 'probing', 'downloading', 'extracting_audio', 'importing', 'binding_mv']);

const isLikedStreamingProvider = (provider: string | null | undefined): provider is Extract<StreamingProviderName, 'netease' | 'qqmusic'> =>
  provider === 'netease' || provider === 'qqmusic';

const streamingPlaylistUrl = (playlist: LibraryPlaylist): string | null => {
  if (!playlist.sourcePlaylistId) {
    return null;
  }

  if (playlist.sourceProvider === 'netease' && playlist.sourcePlaylistId === neteaseDailyRecommendSourcePlaylistId) {
    return null;
  }

  if (playlist.sourceProvider === 'netease') {
    return `https://music.163.com/#/playlist?id=${encodeURIComponent(playlist.sourcePlaylistId)}`;
  }

  if (playlist.sourceProvider === 'qqmusic') {
    return `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(playlist.sourcePlaylistId)}`;
  }

  if (playlist.sourceProvider === 'spotify') {
    return `https://open.spotify.com/playlist/${encodeURIComponent(playlist.sourcePlaylistId)}`;
  }

  return null;
};

const streamingTrackWebUrl = (track: LibraryTrack): string | null => {
  if (!track.providerTrackId) {
    return null;
  }

  if (track.provider === 'netease') {
    return `https://music.163.com/#/song?id=${encodeURIComponent(track.providerTrackId)}`;
  }

  if (track.provider === 'qqmusic') {
    return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(track.providerTrackId)}`;
  }

  if (track.provider === 'spotify') {
    return `https://open.spotify.com/track/${encodeURIComponent(track.providerTrackId)}`;
  }

  return null;
};

const streamingProviderFromTrack = (track: LibraryTrack): StreamingProviderName | null =>
  track.provider === 'netease' ||
  track.provider === 'qqmusic' ||
  track.provider === 'mock' ||
  track.provider === 'bilibili' ||
  track.provider === 'spotify'
    ? track.provider
    : null;

const emptyItemsPage = (): LibraryPage<LibraryPlaylistItem> => ({
  items: [],
  page: 1,
  pageSize,
  total: 0,
  hasMore: false,
});

const itemToTrack = (item: LibraryPlaylistItem, streamingQuality?: StreamingAudioQuality): LibraryTrack => {
  if (item.track && !item.unavailable) {
    return {
      ...item.track,
      playlistItemId: item.id,
      unavailable: false,
    };
  }

  if (item.mediaType === 'stream_track' && item.mediaId && item.sourceItemId && !item.unavailable) {
    return {
      id: item.mediaId,
      mediaType: 'streaming',
      path: item.mediaId,
      provider: item.sourceProvider,
      providerTrackId: item.sourceItemId,
      streamingQuality,
      stableKey: item.mediaId,
      title: item.titleSnapshot ?? 'Streaming track',
      artist: item.artistSnapshot ?? 'Unknown artist',
      album: item.albumSnapshot ?? '',
      albumArtist: item.artistSnapshot ?? '',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: item.durationSnapshot ?? 0,
      codec: null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      coverId: item.coverId,
      coverThumb: item.coverThumb,
      fieldSources: {
        title: item.sourceProvider,
        artist: item.sourceProvider,
        album: item.sourceProvider,
      },
      playlistItemId: item.id,
      unavailable: false,
    };
  }

  return {
    id: item.mediaId ?? item.id,
    path: '',
    title: item.titleSnapshot ?? 'Unavailable track',
    artist: item.artistSnapshot ?? 'Unknown artist',
    album: item.albumSnapshot ?? '',
    albumArtist: item.artistSnapshot ?? '',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: item.durationSnapshot ?? 0,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: item.coverId,
    coverThumb: item.coverThumb,
    fieldSources: {},
    playlistItemId: item.id,
    unavailable: true,
  };
};

export const PlaylistsPage = (): JSX.Element => {
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState<LibraryPage<LibraryPlaylistItem>>(emptyItemsPage());
  const [isLoading, setIsLoading] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistSearchInput, setPlaylistSearchInput] = useState('');
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylistForm, setShowNewPlaylistForm] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [isImportingPlaylistFile, setIsImportingPlaylistFile] = useState(false);
  const [isAddingLocalFiles, setIsAddingLocalFiles] = useState(false);
  const [isRefreshingStreamingPlaylist, setIsRefreshingStreamingPlaylist] = useState(false);
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);
  const [downloadJobIdsByTrackId, setDownloadJobIdsByTrackId] = useState<Record<string, string>>({});
  const [streamingQuality, setStreamingQuality] = useState<StreamingAudioQuality>('hires');
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<{ track: LibraryTrack; position: { x: number; y: number } } | null>(null);
  const requestIdRef = useRef(0);
  const notifiedDownloadJobIdsRef = useRef<Set<string>>(new Set());
  const newPlaylistInputRef = useRef<HTMLInputElement>(null);
  const qualityMenuRef = useRef<HTMLDivElement | null>(null);
  const playlistMenuRef = useRef<HTMLDivElement | null>(null);
  const { currentTrackId, playTrack, appendToQueue, appendTracksToQueue, playTrackNext, removeTrackFromQueue } = usePlaybackQueue();
  const followCurrentTrack = usePlaybackFollowCurrentTrack();
  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? playlists[0] ?? null,
    [playlists, selectedPlaylistId],
  );
  const isSelectedPlaylistNeteaseDailyRecommend =
    selectedPlaylist?.sourceProvider === 'netease' && selectedPlaylist.sourcePlaylistId === neteaseDailyRecommendSourcePlaylistId;
  const isSelectedPlaylistProtected = selectedPlaylist?.kind === 'system';
  const isSelectedPlaylistRemote = Boolean(selectedPlaylist && selectedPlaylist.sourceProvider !== 'local');
  const selectedStreamingPlaylistUrl = selectedPlaylist ? streamingPlaylistUrl(selectedPlaylist) : null;
  const currentStreamingQuality = streamingQualityOptions.find((option) => option.value === streamingQuality) ?? streamingQualityOptions[0];
  const displayTracks = useMemo(
    () => itemsPage.items.map((item) => itemToTrack(item, isSelectedPlaylistRemote ? streamingQuality : undefined)),
    [isSelectedPlaylistRemote, itemsPage.items, streamingQuality],
  );
  const playableTracks = useMemo(() => displayTracks.filter((track) => !track.unavailable), [displayTracks]);
  const likedTrackIds = useLikedTrackIds(playableTracks.map((track) => track.id));
  const downloadingTrackIds = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const track of displayTracks) {
      const jobId = downloadJobIdsByTrackId[track.id];
      const job = jobId ? downloadJobs.find((item) => item.id === jobId) : null;
      result[track.id] = downloadingTrackId === track.id || (job ? runningDownloadStatuses.has(job.status) : false);
    }
    return result;
  }, [displayTracks, downloadJobIdsByTrackId, downloadJobs, downloadingTrackId]);
  const downloadProgressByTrackId = useMemo(() => {
    const result: Record<string, number> = {};
    for (const track of displayTracks) {
      const jobId = downloadJobIdsByTrackId[track.id];
      const job = jobId ? downloadJobs.find((item) => item.id === jobId) : null;
      if (downloadingTrackId === track.id && !job) {
        result[track.id] = 0;
      } else if (job) {
        result[track.id] = Math.max(0, Math.min(100, job.progress));
      }
    }
    return result;
  }, [displayTracks, downloadJobIdsByTrackId, downloadJobs, downloadingTrackId]);
  const queueSource = useMemo(
    () => ({ type: 'manual' as const, label: selectedPlaylist ? `Playlist: ${selectedPlaylist.name}` : 'Playlist' }),
    [selectedPlaylist],
  );

  const loadPlaylists = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to use playlists.');
      return;
    }

    try {
      const result = await library.getPlaylists();
      setPlaylists(result);
      setSelectedPlaylistId((current) => current ?? result[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  const loadItems = useCallback(async (playlistId: string, nextPage = 1, mode: 'replace' | 'append' = 'replace', searchText = playlistSearch): Promise<void> => {
    const library = window.echo?.library;
    if (!library) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await library.getPlaylistItems(playlistId, { page: nextPage, pageSize, search: searchText });
      if (requestIdRef.current !== requestId) {
        return;
      }

      setItemsPage((current) => (mode === 'append' ? { ...result, items: [...current.items, ...result.items] } : result));
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [playlistSearch]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    const handleChanged = (): void => {
      void loadPlaylists();
    };

    window.addEventListener('library:playlists-changed', handleChanged);
    return () => window.removeEventListener('library:playlists-changed', handleChanged);
  }, [loadPlaylists]);

  useEffect(() => {
    if (selectedPlaylist) {
      void loadItems(selectedPlaylist.id);
    } else {
      setItemsPage(emptyItemsPage());
    }
  }, [loadItems, selectedPlaylist]);

  useEffect(() => {
    const downloads = getDownloadsBridge();
    if (!downloads?.onJobsUpdated) {
      return undefined;
    }

    return downloads.onJobsUpdated((nextJobs) => {
      setDownloadJobs(nextJobs);
      const trackedEntries = Object.entries(downloadJobIdsByTrackId);
      for (const job of nextJobs) {
        if (job.status !== 'completed' || notifiedDownloadJobIdsRef.current.has(job.id)) {
          continue;
        }

        const matchedTrackId = trackedEntries.find(([, jobId]) => jobId === job.id)?.[0];
        if (matchedTrackId) {
          notifiedDownloadJobIdsRef.current.add(job.id);
          const matchedTrack = displayTracks.find((track) => track.id === matchedTrackId);
          setError(null);
          setStatusMessage(`下载完成：${job.title ?? matchedTrack?.title ?? job.sourceUrl}`);
          break;
        }
      }
    });
  }, [displayTracks, downloadJobIdsByTrackId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPlaylistSearch(playlistSearchInput.trim());
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [playlistSearchInput]);

  useEffect(() => {
    if (showNewPlaylistForm) {
      window.setTimeout(() => newPlaylistInputRef.current?.focus(), 0);
    }
  }, [showNewPlaylistForm]);

  useEffect(() => {
    if (!qualityMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!qualityMenuRef.current?.contains(event.target as Node)) {
        setQualityMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setQualityMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [qualityMenuOpen]);

  useEffect(() => {
    if (!playlistMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!playlistMenuRef.current?.contains(event.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPlaylistMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playlistMenuOpen]);

  const refreshSelected = useCallback(async (): Promise<void> => {
    await loadPlaylists();
    if (selectedPlaylist) {
      await loadItems(selectedPlaylist.id);
    }
  }, [loadItems, loadPlaylists, selectedPlaylist]);

  const handleRefreshStreamingPlaylist = async (): Promise<void> => {
    if (isSelectedPlaylistNeteaseDailyRecommend) {
      await handleRefreshNeteaseDailyRecommend();
      return;
    }

    const streaming = window.echo?.streaming;
    if (!streaming?.importPlaylistFromUrl || !selectedPlaylist || !selectedStreamingPlaylistUrl) {
      await refreshSelected();
      return;
    }

    setIsRefreshingStreamingPlaylist(true);
    setError(null);
    setStatusMessage('正在刷新网络歌单...');
    try {
      const result = await streaming.importPlaylistFromUrl(selectedStreamingPlaylistUrl);
      await loadPlaylists();
      setSelectedPlaylistId(result.playlistId);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(result.playlistId, 1, 'replace', '');
      setStatusMessage(`已刷新歌单：${result.playlistName}，共 ${result.importedCount} 首`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setStatusMessage(null);
    } finally {
      setIsRefreshingStreamingPlaylist(false);
    }
  };

  const handleRefreshNeteaseDailyRecommend = async (): Promise<void> => {
    const streaming = window.echo?.streaming;
    if (!streaming?.refreshNeteaseDailyRecommend) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to refresh NetEase daily recommendations.');
      return;
    }

    setIsRefreshingStreamingPlaylist(true);
    setError(null);
    setStatusMessage('正在刷新网易云每日推荐...');
    try {
      const result = await streaming.refreshNeteaseDailyRecommend();
      await loadPlaylists();
      setSelectedPlaylistId(result.playlistId);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(result.playlistId, 1, 'replace', '');
      setStatusMessage(`已刷新每日推荐：${result.importedCount} 首`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setStatusMessage(null);
    } finally {
      setIsRefreshingStreamingPlaylist(false);
    }
  };

  const handleCreatePlaylist = async (nameInput?: string): Promise<void> => {
    const library = window.echo?.library;
    const name = nameInput ?? window.prompt('新建本地歌单名称');
    if (!library || !name?.trim()) {
      return;
    }

    try {
      const playlist = await library.createPlaylist({ name });
      await loadPlaylists();
      setSelectedPlaylistId(playlist.id);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      setNewPlaylistName('');
      setShowNewPlaylistForm(false);
      setStatusMessage('本地歌单已创建');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  };

  const handleShowNewPlaylistForm = (): void => {
    setShowNewPlaylistForm(true);
  };

  const handleDeletePlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist || !window.confirm(`删除歌单 "${selectedPlaylist.name}"?`)) {
      return;
    }

    try {
      await library.deletePlaylist(selectedPlaylist.id);
      setSelectedPlaylistId(null);
      await loadPlaylists();
      setStatusMessage('歌单已删除');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const handleRenamePlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    const name = window.prompt('重命名歌单', selectedPlaylist.name);
    if (!name?.trim() || name.trim() === selectedPlaylist.name) {
      return;
    }

    try {
      setPlaylistMenuOpen(false);
      const updated = await library.updatePlaylist({ playlistId: selectedPlaylist.id, name: name.trim() });
      await loadPlaylists();
      setSelectedPlaylistId(updated.id);
      setStatusMessage('歌单已重命名');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    }
  };

  const handleUpdatePlaylistSort = async (sortMode: PlaylistSortMode): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    if (sortMode === selectedPlaylist.sortMode) {
      setPlaylistMenuOpen(false);
      return;
    }

    try {
      setPlaylistMenuOpen(false);
      const updated = await library.updatePlaylist({ playlistId: selectedPlaylist.id, sortMode });
      await loadPlaylists();
      setSelectedPlaylistId(updated.id);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(updated.id, 1, 'replace', '');
      setStatusMessage('排序方式已更新');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (sortError) {
      setError(sortError instanceof Error ? sortError.message : String(sortError));
    }
  };

  const handleExportPlaylist = async (format: PlaylistExportFormat): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.exportPlaylist || !selectedPlaylist) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to export playlists.');
      return;
    }

    try {
      setPlaylistMenuOpen(false);
      const exportedPath = await library.exportPlaylist({ playlistId: selectedPlaylist.id, format });
      if (exportedPath) {
        setStatusMessage(`歌单已导出：${exportedPath}`);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  };

  const handlePlayAll = async (): Promise<void> => {
    if (playableTracks.length === 0) {
      setError('这个歌单没有可播放的本地歌曲。');
      return;
    }

    try {
      await playTrack(playableTracks[0], {
        replaceQueueWith: playableTracks,
        source: queueSource,
      });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAddAllToQueue = (): void => {
    appendTracksToQueue(playableTracks, queueSource);
    setStatusMessage(`已添加 ${playableTracks.length} 首可用歌曲到队列`);
  };

  const handleDownloadTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      const provider = streamingProviderFromTrack(track);
      if (track.mediaType !== 'streaming' || !provider || !track.providerTrackId) {
        setError('只有网络歌单中的流媒体歌曲可以直接下载。');
        setStatusMessage(null);
        return;
      }

      if (provider === 'spotify') {
        setError('Spotify 由官方播放器播放，下载功能不适用于 Spotify。');
        setStatusMessage(null);
        return;
      }

      const webpageUrl = streamingTrackWebUrl(track);
      if (!webpageUrl) {
        setError('这个平台暂不支持从网络歌单直接下载。');
        setStatusMessage(null);
        return;
      }

      const downloads = getDownloadsBridge();
      if (!downloads?.createUrlJob) {
        setError('桌面下载服务不可用。');
        setStatusMessage(null);
        return;
      }

      const streaming = getStreamingBridge();
      if (!streaming?.resolvePlayback) {
        setError('桌面流媒体服务不可用，无法解析下载地址。');
        setStatusMessage(null);
        return;
      }

      setDownloadingTrackId(track.id);
      setError(null);
      setStatusMessage(null);
      try {
        const [source, detailTrack] = await Promise.all([
          streaming.resolvePlayback({
            provider,
            providerTrackId: track.providerTrackId,
            quality: track.streamingQuality ?? streamingQuality,
          }),
          streaming.getTrack
            ? streaming.getTrack({ provider, providerTrackId: track.providerTrackId }).catch(() => null)
            : Promise.resolve(null),
        ]);
        const job = await downloads.createUrlJob(source.url, {
          title: detailTrack?.title ?? track.title,
          artist: detailTrack?.artist ?? track.artist,
          album: detailTrack?.album ?? track.album,
          albumArtist: (detailTrack?.albumArtist ?? track.albumArtist) || track.artist,
          coverUrl: detailTrack?.coverUrl ?? detailTrack?.coverThumb ?? track.coverThumb,
          webpageUrl,
          bindMvAfterImport: false,
          requestHeaders: source.headers,
          directAudio: true,
          directAudioMimeType: source.mimeType,
          directAudioExtension: source.codec,
          streamingProvider: provider,
          streamingProviderTrackId: track.providerTrackId,
          streamingStableKey: track.stableKey ?? undefined,
        });
        setDownloadJobs((current) => (current.some((item) => item.id === job.id) ? current : [job, ...current]));
        setDownloadJobIdsByTrackId((current) => ({ ...current, [track.id]: job.id }));
        setStatusMessage(`已加入下载队列：${track.title}`);
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : '添加下载任务失败');
        setStatusMessage(null);
      } finally {
        setDownloadingTrackId((current) => (current === track.id ? null : current));
      }
    },
    [streamingQuality],
  );

  const handleImportStreamingPlaylist = async (): Promise<void> => {
    const streaming = window.echo?.streaming;
    const url = playlistUrl.trim();
    if (!streaming?.importPlaylistFromUrl || !url) {
      return;
    }

    setIsImportingPlaylist(true);
    setError(null);
    setStatusMessage('正在添加流媒体歌单...');
    try {
      const result = await streaming.importPlaylistFromUrl(url);
      setPlaylistUrl('');
      await loadPlaylists();
      setSelectedPlaylistId(result.playlistId);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(result.playlistId, 1, 'replace', '');
      setStatusMessage(`已添加歌单：${result.playlistName}，共 ${result.importedCount} 首`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
      setStatusMessage(null);
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  const handleImportPlaylistFile = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library?.importPlaylistFile) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to import playlist files.');
      setStatusMessage(null);
      return;
    }

    setIsImportingPlaylistFile(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await library.importPlaylistFile();
      if (!result) {
        return;
      }

      await loadPlaylists();
      setSelectedPlaylistId(result.playlistId);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(result.playlistId, 1, 'replace', '');
      setStatusMessage(`已导入歌单：${result.playlistName}，共 ${result.importedCount} 首`);
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
      setStatusMessage(null);
    } finally {
      setIsImportingPlaylistFile(false);
    }
  };

  const handleAddLocalFilesToPlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    const playback = window.echo?.playback;
    if (!library?.addLocalAudioFilesToPlaylist || !playback || !selectedPlaylist) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to add local songs.');
      setStatusMessage(null);
      return;
    }

    if (isSelectedPlaylistProtected || isSelectedPlaylistRemote) {
      setError('只能向本地手动歌单添加本地歌曲。');
      setStatusMessage(null);
      return;
    }

    setIsAddingLocalFiles(true);
    setError(null);
    setStatusMessage(null);
    try {
      const filePaths = playback.openLocalAudioFiles
        ? await playback.openLocalAudioFiles()
        : await playback.openLocalAudioFile().then((path) => (path ? [path] : null));

      if (!filePaths?.length) {
        return;
      }

      setStatusMessage('正在添加本地歌曲...');
      const result = await library.addLocalAudioFilesToPlaylist(selectedPlaylist.id, filePaths);
      await loadPlaylists();
      setSelectedPlaylistId(selectedPlaylist.id);
      setPlaylistSearchInput('');
      setPlaylistSearch('');
      await loadItems(selectedPlaylist.id, 1, 'replace', '');
      window.dispatchEvent(new Event('library:changed'));
      window.dispatchEvent(new Event('library:playlists-changed'));

      if (result.addedCount > 0) {
        const skippedSuffix = result.skippedCount || result.failedCount ? `，跳过 ${result.skippedCount + result.failedCount} 个文件` : '';
        setStatusMessage(`已添加 ${result.addedCount} 首本地歌曲${skippedSuffix}`);
      } else {
        setStatusMessage('没有可添加的本地歌曲。');
      }
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
      setStatusMessage(null);
    } finally {
      setIsAddingLocalFiles(false);
    }
  };

  const handleChoosePlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    try {
      const selection = await library.chooseTrackCover();
      if (!selection) {
        return;
      }

      await library.updatePlaylist({ playlistId: selectedPlaylist.id, coverPath: selection.path });
      await refreshSelected();
      setStatusMessage('歌单封面已更新');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleClearPlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    try {
      await library.updatePlaylist({ playlistId: selectedPlaylist.id, coverId: null });
      await refreshSelected();
      setStatusMessage('已恢复为第一首歌的专辑封面');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleLoadMore = (): void => {
    if (selectedPlaylist && itemsPage.hasMore && !isLoading) {
      void loadItems(selectedPlaylist.id, itemsPage.page + 1, 'append');
    }
  };

  const handleTrackPlay = async (track: LibraryTrack): Promise<void> => {
    const item = itemsPage.items.find((candidate) => candidate.id === track.playlistItemId);
    const playableTrack = item ? itemToTrack(item, isSelectedPlaylistRemote ? streamingQuality : undefined) : null;
    if (!playableTrack || playableTrack.unavailable) {
      return;
    }

    try {
      await playTrack(playableTrack, {
        replaceQueueWith: playableTracks,
        source: queueSource,
      });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAddTrackToQueue = (track: LibraryTrack): void => {
    const item = itemsPage.items.find((candidate) => candidate.id === track.playlistItemId);
    const playableTrack = item ? itemToTrack(item, isSelectedPlaylistRemote ? streamingQuality : undefined) : null;
    if (playableTrack && !playableTrack.unavailable) {
      appendToQueue(playableTrack, queueSource);
    }
  };

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    if (isSelectedPlaylistRemote) {
      return;
    }

    if (!track.unavailable) {
      setTrackMenu({ track, position });
    }
  }, [isSelectedPlaylistRemote]);

  const handleToggleLiked = useCallback(async (track: LibraryTrack): Promise<void> => {
    const library = window.echo?.library;
    if (!library || track.unavailable) {
      return;
    }

    try {
      setError(null);
      if (track.mediaType === 'streaming' && isLikedStreamingProvider(track.provider) && track.providerTrackId) {
        const streaming = window.echo?.streaming;
        if (!streaming?.setTrackLiked) {
          throw new Error('Streaming liked tracks are unavailable.');
        }

        await streaming.setTrackLiked({
          provider: track.provider,
          providerTrackId: track.providerTrackId,
          liked: likedTrackIds[track.id] !== true,
        });
      } else {
        await library.toggleTrackLiked(track.id);
      }
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : String(likeError));
    }
  }, [likedTrackIds]);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (track.unavailable) {
        return;
      }

      try {
        setError(null);

        if (
          track.mediaType === 'remote' &&
          (action === 'reload-embedded-tags' ||
            action === 'open-osu-timing' ||
            action === 'show-in-folder' ||
            action === 'copy-path' ||
            action === 'open-system' ||
            action === 'delete-song')
        ) {
          setError('远程歌曲暂不支持本地文件操作。');
          return;
        }

        switch (action) {
          case 'play-next':
            playTrackNext(track, queueSource);
            return;
          case 'add-to-queue':
            appendToQueue(track, queueSource);
            setStatusMessage(`已添加到队列：${track.title}`);
            return;
          case 'toggle-liked':
            await handleToggleLiked(track);
            return;
          case 'remove-from-queue':
            {
              const removedCount = removeTrackFromQueue(track.id);
              setStatusMessage(
                removedCount > 0
                  ? `已从播放队列移除：${track.title}`
                  : `播放队列里没有这首歌：${track.title}`,
              );
            }
            return;
          case 'reload-embedded-tags':
            {
              if (!library || track.mediaType === 'streaming' || track.mediaType === 'remote' || track.isTemporary) {
                setError('这首歌不支持重新加载嵌入标签。');
                return;
              }

              const result = await library.loadEmbeddedTrackTags(track.id);
              setItemsPage((current) => ({
                ...current,
                items: current.items.map((item) =>
                  item.track?.id === result.track.id
                    ? {
                        ...item,
                        track: result.track,
                        titleSnapshot: result.track.title,
                        artistSnapshot: result.track.artist,
                        albumSnapshot: result.track.album,
                        durationSnapshot: result.track.duration,
                        coverId: result.track.coverId,
                        coverThumb: result.track.coverThumb,
                      }
                    : item,
                ),
              }));
              setStatusMessage(`已从内嵌标签重新加载：${result.track.title}`);
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'show-in-folder':
            await library?.openTrackInFolder(track.id);
            return;
          case 'copy-path':
            await library?.copyTrackPath(track.id);
            return;
          case 'open-system':
            await library?.openTrackWithSystem(track.id);
            return;
          case 'add-to-playlist':
            {
              if (!library) {
                setError('Desktop bridge unavailable. Open ECHO Next in Electron to use playlists.');
                return;
              }

              const playlist = playlistTarget ?? (await resolvePlaylistForTrackAdd(library));
              if (!playlist) {
                return;
              }

              if (track.mediaType === 'streaming' && track.provider && track.providerTrackId) {
                await library.addStreamingTrackToPlaylist(playlist.id, track);
              } else {
                await library.addTrackToPlaylist(playlist.id, track.id);
              }
              window.dispatchEvent(new Event('library:playlists-changed'));
              setStatusMessage(`已加入歌单：${playlist.name}`);
            }
            return;
          default:
            setError('这个歌单操作还没有接入。');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendToQueue, handleToggleLiked, playTrackNext, queueSource, removeTrackFromQueue],
  );

  return (
    <div className="playlists-page">
      <aside className="playlist-sidebar" aria-label="Playlists">
        <div className="playlist-sidebar-header">
          <h1>Playlists</h1>
          <button className="tool-button" type="button" aria-label="导入 M3U/M3U8 歌单" title="导入 M3U/M3U8 歌单" disabled={isImportingPlaylistFile} onClick={() => void handleImportPlaylistFile()}>
            {isImportingPlaylistFile ? <Loader2 className="spinning-icon" size={17} /> : <Upload size={17} />}
          </button>
          <button className="tool-button" type="button" aria-label="新建本地歌单" title="新建本地歌单" onClick={handleShowNewPlaylistForm}>
            <Plus size={17} />
          </button>
        </div>

        {showNewPlaylistForm ? (
          <form
            className="playlist-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreatePlaylist(newPlaylistName);
            }}
          >
            <input
              ref={newPlaylistInputRef}
              value={newPlaylistName}
              aria-label="本地歌单名称"
              placeholder="新建本地歌单"
              onChange={(event) => setNewPlaylistName(event.target.value)}
            />
            <button className="secondary-action" type="submit" disabled={!newPlaylistName.trim()}>
              <Plus size={15} />
              <span>创建</span>
            </button>
            <button
              className="tool-button"
              type="button"
              aria-label="取消新建"
              title="取消新建"
              onClick={() => {
                setShowNewPlaylistForm(false);
                setNewPlaylistName('');
              }}
            >
              <X size={15} />
            </button>
          </form>
        ) : null}

        <button
          className="playlist-daily-recommend"
          type="button"
          disabled={isRefreshingStreamingPlaylist}
          onClick={() => void handleRefreshNeteaseDailyRecommend()}
        >
          {isRefreshingStreamingPlaylist ? <Loader2 className="spinning-icon" size={16} /> : <CalendarDays size={16} />}
          <span>
            <strong>每日推荐</strong>
            <small>网易云账号推荐</small>
          </span>
        </button>

        <div className="playlist-list">
          {playlists.map((playlist) => (
            <button
              className="playlist-list-item"
              data-active={playlist.id === selectedPlaylist?.id ? 'true' : undefined}
              key={playlist.id}
              type="button"
              onClick={() => setSelectedPlaylistId(playlist.id)}
            >
              <span>
                <strong>
                  <span>{playlist.name}</span>
                  {playlist.sourceProvider !== 'local' ? <em>网络歌单</em> : null}
                </strong>
                <small>{playlist.itemCount} tracks</small>
              </span>
            </button>
          ))}
          {playlists.length === 0 ? <p className="playlist-empty">还没有本地歌单。</p> : null}
        </div>

        <form
          className="streaming-section playlist-import-box"
          onSubmit={(event) => {
            event.preventDefault();
            void handleImportStreamingPlaylist();
          }}
        >
          <h2>添加流媒体歌单</h2>
          <label>
            <Link size={14} />
            <input
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              placeholder="粘贴网易云 / QQ 音乐歌单链接"
              disabled={isImportingPlaylist}
            />
          </label>
          <button className="secondary-action" type="submit" disabled={!playlistUrl.trim() || isImportingPlaylist}>
            {isImportingPlaylist ? <Loader2 className="spinning-icon" size={15} /> : <Plus size={15} />}
            <span>{isImportingPlaylist ? '添加中' : '添加歌单'}</span>
          </button>
        </form>

        <div className="streaming-section">
          <h2>流媒体歌单</h2>
          <div>
            <span><WifiOff size={14} /> 网易云音乐</span>
            <em>未连接</em>
          </div>
          <div>
            <span><WifiOff size={14} /> QQ 音乐</span>
            <em>未连接</em>
          </div>
        </div>
      </aside>

      <section className="playlist-detail">
        {selectedPlaylist ? (
          <>
            <header className="playlist-detail-header">
              <div className="playlist-cover" data-empty={!selectedPlaylist.coverThumb}>
                {selectedPlaylist.coverThumb ? <img alt="" src={selectedPlaylist.coverThumb} /> : <Music2 size={34} />}
                <button
                  className="playlist-cover-button"
                  type="button"
                  aria-label="自定义歌单封面"
                  title="自定义歌单封面"
                  onClick={() => void handleChoosePlaylistCover()}
                >
                  <ImagePlus size={17} />
                </button>
                {selectedPlaylist.coverId ? (
                  <button
                    className="playlist-cover-reset"
                    type="button"
                    aria-label="使用第一首歌封面"
                    title="使用第一首歌封面"
                    onClick={() => void handleClearPlaylistCover()}
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
              </div>
              <div className="playlist-detail-copy">
                <h2>{selectedPlaylist.name}</h2>
                <p>{selectedPlaylist.description || 'Manual local playlist'}</p>
                <small>{itemsPage.total} tracks · {playlistSortOptions.find((option) => option.value === selectedPlaylist.sortMode)?.label ?? '手动排序'}</small>
              </div>
              <div className="playlist-actions">
                <form
                  className="playlist-search"
                  role="search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setPlaylistSearch(playlistSearchInput.trim());
                  }}
                >
                  <Search size={15} />
                  <input
                    aria-label="搜索歌单歌曲"
                    placeholder="搜索歌单歌曲"
                    value={playlistSearchInput}
                    onChange={(event) => setPlaylistSearchInput(event.target.value)}
                  />
                  {playlistSearchInput ? (
                    <button
                      type="button"
                      aria-label="清除搜索"
                      title="清除搜索"
                      onClick={() => {
                        setPlaylistSearchInput('');
                        setPlaylistSearch('');
                      }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </form>
                {isSelectedPlaylistRemote ? (
                  <div className="playlist-quality-control" ref={qualityMenuRef} title="Streaming quality">
                    <SlidersHorizontal size={15} />
                    <span>音质</span>
                    <button
                      type="button"
                      aria-label="Streaming quality"
                      aria-haspopup="listbox"
                      aria-expanded={qualityMenuOpen}
                      onClick={() => setQualityMenuOpen((open) => !open)}
                    >
                      <strong>{currentStreamingQuality.label}</strong>
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    {qualityMenuOpen ? (
                      <div className="playlist-quality-menu" role="listbox" aria-label="Streaming quality">
                        {streamingQualityOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={option.value === streamingQuality}
                            onClick={() => {
                              setStreamingQuality(option.value);
                              setQualityMenuOpen(false);
                            }}
                          >
                            <span>{option.label}</span>
                            {option.value === streamingQuality ? <Check size={14} /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button className="primary-action" type="button" disabled={playableTracks.length === 0} onClick={() => void handlePlayAll()}>
                  <Play size={16} />
                  <span>播放全部</span>
                </button>
                <button className="secondary-action" type="button" disabled={playableTracks.length === 0} onClick={handleAddAllToQueue}>
                  <ListPlus size={16} />
                  <span>添加到队列</span>
                </button>
                {!isSelectedPlaylistProtected && !isSelectedPlaylistRemote ? (
                  <button className="secondary-action" type="button" disabled={isAddingLocalFiles} onClick={() => void handleAddLocalFilesToPlaylist()}>
                    {isAddingLocalFiles ? <Loader2 className="spinning-icon" size={16} /> : <FilePlus2 size={16} />}
                    <span>{isAddingLocalFiles ? '添加中' : '添加本地歌曲'}</span>
                  </button>
                ) : null}
                <button className="secondary-action" type="button" onClick={() => void handleChoosePlaylistCover()}>
                  <ImagePlus size={16} />
                  <span>更换封面</span>
                </button>
                {selectedStreamingPlaylistUrl || isSelectedPlaylistNeteaseDailyRecommend ? (
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={isRefreshingStreamingPlaylist}
                    onClick={() => void handleRefreshStreamingPlaylist()}
                  >
                    {isRefreshingStreamingPlaylist ? <Loader2 className="spinning-icon" size={16} /> : <RefreshCw size={16} />}
                    <span>{isSelectedPlaylistNeteaseDailyRecommend ? '刷新推荐' : '刷新歌单'}</span>
                  </button>
                ) : null}
                {selectedPlaylist.coverId ? (
                  <button className="tool-button" type="button" aria-label="恢复默认封面" title="恢复默认封面" onClick={() => void handleClearPlaylistCover()}>
                    <RotateCcw size={17} />
                  </button>
                ) : null}
                <div className="playlist-menu-wrap" ref={playlistMenuRef}>
                  <button
                    className="tool-button"
                    type="button"
                    aria-label="更多歌单操作"
                    aria-haspopup="menu"
                    aria-expanded={playlistMenuOpen}
                    title="更多歌单操作"
                    onClick={() => setPlaylistMenuOpen((current) => !current)}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {playlistMenuOpen ? (
                    <div className="playlist-action-menu" role="menu" aria-label="歌单操作">
                      {!isSelectedPlaylistProtected ? (
                        <button className="playlist-action-menu-item" type="button" role="menuitem" onClick={() => void handleRenamePlaylist()}>
                          <Pencil size={14} />
                          <span>重命名歌单</span>
                        </button>
                      ) : null}
                      <div className="playlist-action-menu-section" role="presentation">
                        <span>排序方式</span>
                        {playlistSortOptions.map((option) => (
                          <button
                            className="playlist-action-menu-item playlist-action-menu-item--checkable"
                            type="button"
                            role="menuitemradio"
                            aria-checked={selectedPlaylist.sortMode === option.value}
                            key={option.value}
                            onClick={() => void handleUpdatePlaylistSort(option.value)}
                          >
                            <span>{option.label}</span>
                            {selectedPlaylist.sortMode === option.value ? <Check size={14} /> : null}
                          </button>
                        ))}
                      </div>
                      <div className="playlist-action-menu-section" role="presentation">
                        <span>导出歌单</span>
                        {playlistExportOptions.map((option) => (
                          <button
                            className="playlist-action-menu-item"
                            type="button"
                            role="menuitem"
                            key={option.value}
                            onClick={() => void handleExportPlaylist(option.value)}
                          >
                            <Download size={14} />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {!isSelectedPlaylistProtected ? (
                  <button className="tool-button danger" type="button" aria-label="删除歌单" title="删除歌单" onClick={() => void handleDeletePlaylist()}>
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </div>
            </header>

            <TrackList
              tracks={displayTracks}
              currentTrackId={currentTrackId}
              canLoadMore={itemsPage.hasMore && !isLoading}
              onEndReached={handleLoadMore}
              onAddToQueue={handleAddTrackToQueue}
              onDownload={isSelectedPlaylistRemote && selectedPlaylist?.sourceProvider !== 'spotify' ? handleDownloadTrack : undefined}
              downloadingTrackIds={downloadingTrackIds}
              downloadProgressByTrackId={downloadProgressByTrackId}
              likedTrackIds={likedTrackIds}
              onToggleLiked={(track) => void handleToggleLiked(track)}
              onOpenTrackMenu={handleOpenTrackMenu}
              onPlay={handleTrackPlay}
              followCurrentTrack={followCurrentTrack}
            />
          </>
        ) : (
          <div className="playlist-start">
            <Music2 size={36} />
            <strong>创建第一个本地歌单</strong>
            <button className="primary-action" type="button" onClick={() => void handleCreatePlaylist()}>
              <Plus size={16} />
              <span>新建歌单</span>
            </button>
          </div>
        )}

        {error || statusMessage || isLoading ? (
          <div className="list-footer">
            <span>{error ?? statusMessage ?? '正在读取歌单...'}</span>
            {selectedPlaylist && !isLoading ? (
              <button
                className="text-action"
                type="button"
                disabled={isRefreshingStreamingPlaylist}
                onClick={() =>
                  void (selectedStreamingPlaylistUrl || isSelectedPlaylistNeteaseDailyRecommend ? handleRefreshStreamingPlaylist() : refreshSelected())
                }
              >
                刷新
              </button>
            ) : null}
          </div>
        ) : null}

        {trackMenu && !isSelectedPlaylistRemote ? (
          <TrackContextMenu
            track={trackMenu.track}
            position={trackMenu.position}
            liked={likedTrackIds[trackMenu.track.id] === true}
            onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
            onClose={() => setTrackMenu(null)}
          />
        ) : null}
      </section>
    </div>
  );
};
