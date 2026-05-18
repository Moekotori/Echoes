import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, FolderPlus, ListFilter, Play, RotateCw, Search, Trash2, X } from 'lucide-react';
import type { DuplicateTrackIndexSummary, DuplicateTrackMember, EditableTrackTags, LibraryScanStatus, LibrarySort, LibraryTrack } from '../../shared/types/library';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { LibrarySourceSwitch } from '../components/library/LibrarySourceSwitch';
import { OsuTimingPanel } from '../components/library/OsuTimingPanel';
import { TrackList } from '../components/library/TrackList';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { likedChangedEvent, likedTracksChangedEvent } from '../hooks/useLikedMedia';
import {
  beginSongsStartupLoadDiagnostics,
  canUseSongsFirstPageSnapshot,
  clearSongsFirstPageSnapshot,
  createSongsFirstPageSnapshotQueryKey,
  finishSongsStartupSqliteLoadDiagnostics,
  readSongsFirstPageSnapshot,
  writeSongsFirstPageSnapshot,
  type SongsFirstPageSnapshot,
} from '../stores/songsFirstPageSnapshot';
import { isPlaybackCancellationError, usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { usePlaybackFollowCurrentTrack } from '../hooks/usePlaybackFollowCurrentTrack';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';
import { openArtistDetailForTrack } from '../utils/artistNavigation';
import { readStoredLibrarySourceMode, writeStoredLibrarySourceMode, type LibrarySourceMode } from '../utils/librarySourceMode';

const pageSize = 100;
const sortOptions: Array<{ value: LibrarySort; label: string }> = [
  { value: 'default', label: '默认排序' },
  { value: 'createdAsc', label: '创建时间 (正序)' },
  { value: 'createdDesc', label: '创建时间 (倒序)' },
  { value: 'titleAsc', label: '歌曲名 (A-Z)' },
  { value: 'titleDesc', label: '歌曲名 (Z-A)' },
  { value: 'durationAsc', label: '音乐时间 (短到长)' },
  { value: 'durationDesc', label: '音乐时间 (长到短)' },
  { value: 'fileModifiedAsc', label: '文件修改时间 (旧到新)' },
  { value: 'fileModifiedDesc', label: '文件修改时间 (新到旧)' },
  { value: 'qualityAsc', label: '歌曲质量/大小 (小到大)' },
  { value: 'qualityDesc', label: '歌曲质量/大小 (大到小)' },
  { value: 'frequent', label: '根据常听歌曲排序' },
  { value: 'random', label: '随机排序' },
  { value: 'artist', label: '按艺术家' },
  { value: 'album', label: '按专辑' },
  { value: 'recent', label: '最近更新' },
];

const songsSortStorageKey = 'echo-next.songs.sort';
const songsHideDuplicatesStorageKey = 'echo-next.songs.hide-duplicates';
const validSortValues = new Set<LibrarySort>(sortOptions.map((option) => option.value));
const scanPollIntervalMs = 500;
const showChromeNoticeEvent = 'app:show-chrome-notice';
const finishedScanStatuses = new Set<LibraryScanStatus['status']>(['completed', 'cancelled', 'failed']);
const scanPhaseLabels: Record<LibraryScanStatus['phase'], string> = {
  queued: '排队中',
  discovering: '发现音乐文件',
  checking_cache: '检查增量缓存',
  reading_metadata: '读取新增/变更歌曲',
  extracting_covers: '修复封面缓存',
  grouping_albums: '整理专辑',
  writing_database: '写入曲库',
  finished: '完成',
  failed: '失败',
  cancelled: '已取消',
};

const readStoredSort = (): LibrarySort => {
  try {
    const stored = window.localStorage.getItem(songsSortStorageKey);
    return stored && validSortValues.has(stored as LibrarySort) ? (stored as LibrarySort) : 'default';
  } catch {
    return 'default';
  }
};

const writeStoredSort = (sort: LibrarySort): void => {
  try {
    window.localStorage.setItem(songsSortStorageKey, sort);
  } catch {
    // Sort memory should not block the song list in restricted storage environments.
  }

  void window.echo?.app.setSettings({ songsSort: sort }).catch(() => undefined);
};

const readStoredHideDuplicates = (): boolean => {
  try {
    return window.localStorage.getItem(songsHideDuplicatesStorageKey) === 'true';
  } catch {
    return false;
  }
};

const writeStoredHideDuplicates = (hideDuplicates: boolean): void => {
  try {
    window.localStorage.setItem(songsHideDuplicatesStorageKey, hideDuplicates ? 'true' : 'false');
  } catch {
    // Duplicate visibility memory is only a startup hint.
  }
};

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids.filter(Boolean)));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const showChromeNotice = (message: string): void => {
  window.dispatchEvent(new CustomEvent(showChromeNoticeEvent, { detail: message }));
};

const summarizeScanJobs = (statuses: LibraryScanStatus[]): string => {
  const active = statuses.find((status) => !finishedScanStatuses.has(status.status)) ?? statuses[statuses.length - 1];
  const processedFiles = statuses.reduce((sum, status) => sum + status.processedFiles, 0);
  const totalFiles = statuses.reduce((sum, status) => sum + status.totalFiles, 0);
  const addedTracks = statuses.reduce((sum, status) => sum + status.addedTracks, 0);
  const updatedTracks = statuses.reduce((sum, status) => sum + status.updatedTracks, 0);
  const skippedFiles = statuses.reduce((sum, status) => sum + status.skippedFiles, 0);
  const phase = active ? scanPhaseLabels[active.phase] : '增量扫描';
  const progress = totalFiles > 0 ? `${processedFiles}/${totalFiles}` : `${processedFiles}`;

  return `正在${phase}... ${progress} 个文件，新增 ${addedTracks}，更新 ${updatedTracks}，跳过 ${skippedFiles}`;
};

type InitialSongsState = {
  hideDuplicates: boolean;
  snapshot: SongsFirstPageSnapshot | null;
  sort: LibrarySort;
  sourceMode: LibrarySourceMode;
};

const readInitialSongsState = (): InitialSongsState => {
  const sort = readStoredSort();
  const hideDuplicates = readStoredHideDuplicates();
  const sourceMode = readStoredLibrarySourceMode();
  const query = {
    pageSize,
    search: '',
    sort,
    sourceProvider: sourceMode,
    hideDuplicates,
    duplicateMode: 'strict' as const,
  };
  const queryKey = createSongsFirstPageSnapshotQueryKey(query);

  return {
    hideDuplicates,
    sourceMode,
    sort,
    snapshot: canUseSongsFirstPageSnapshot(query) ? readSongsFirstPageSnapshot(queryKey) : null,
  };
};

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

export const SongsPage = (): JSX.Element => {
  const initialSongsStateRef = useRef<InitialSongsState | null>(null);
  if (!initialSongsStateRef.current) {
    initialSongsStateRef.current = readInitialSongsState();
  }

  const initialSongsState = initialSongsStateRef.current;
  const initialSnapshot = initialSongsState.snapshot;
  const [tracks, setTracks] = useState<LibraryTrack[]>(() => initialSnapshot?.items ?? []);
  const [loadedStartIndex, setLoadedStartIndex] = useState(0);
  const [locatedCurrentTrackIndex, setLocatedCurrentTrackIndex] = useState<number | null>(null);
  const [total, setTotal] = useState(() => initialSnapshot?.total ?? 0);
  const [hasMore, setHasMore] = useState(() => (initialSnapshot ? initialSnapshot.items.length < initialSnapshot.total : false));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>(() => initialSongsState.sort);
  const [sourceMode, setSourceModeState] = useState<LibrarySourceMode>(() => initialSongsState.sourceMode);
  const [isLoading, setIsLoading] = useState(false);
  const [isMaintainingLibrary, setIsMaintainingLibrary] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(() => initialSongsState.hideDuplicates);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateTrackIndexSummary | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [duplicateHiddenCounts, setDuplicateHiddenCounts] = useState<Record<string, number>>({});
  const [likedTrackIds, setLikedTrackIds] = useState<Record<string, boolean>>({});
  const [visibleTrackIds, setVisibleTrackIds] = useState<string[]>([]);
  const followCurrentTrack = usePlaybackFollowCurrentTrack();
  const [likedRefreshVersion, setLikedRefreshVersion] = useState(0);
  const [versionMembers, setVersionMembers] = useState<DuplicateTrackMember[]>([]);
  const [versionTrack, setVersionTrack] = useState<LibraryTrack | null>(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [osuTimingTrack, setOsuTimingTrack] = useState<LibraryTrack | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const requestIdRef = useRef(0);
  const locateRequestIdRef = useRef(0);
  const likedRequestIdRef = useRef(0);
  const duplicateRequestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const likedTrackIdsRef = useRef<Record<string, boolean>>({});
  const duplicateHiddenCountsRef = useRef<Record<string, number>>({});
  const ignoreNextLibraryChangedRef = useRef(false);
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const lastAnnouncedPageNoticeRef = useRef<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const { currentTrackId, playTrack, appendToQueue, playTrackNext, removeTrackFromQueue } = usePlaybackQueue();
  const visibleTrackIdsKey = useMemo(() => visibleTrackIds.join('\0'), [visibleTrackIds]);
  const loadedTrackIdsKey = useMemo(() => uniqueIds(tracks.map((track) => track.id)).join('\0'), [tracks]);
  const queueSource = useMemo(
    () => ({ type: 'songs' as const, label: sourceMode === 'remote' ? '网盘歌曲' : '歌曲列表', search: search || undefined, sort, hideDuplicates }),
    [hideDuplicates, search, sort, sourceMode],
  );
  const currentTrackLoadedIndex = useMemo(
    () => (currentTrackId ? tracks.findIndex((track) => track.id === currentTrackId) : -1),
    [currentTrackId, tracks],
  );
  const currentTrackAbsoluteIndex = currentTrackLoadedIndex >= 0 ? loadedStartIndex + currentTrackLoadedIndex : locatedCurrentTrackIndex;
  const mergeLikedTrackIds = useCallback((patch: Record<string, boolean>): void => {
    setLikedTrackIds((current) => {
      const next = { ...current, ...patch };
      likedTrackIdsRef.current = next;
      return next;
    });
  }, []);
  const mergeDuplicateHiddenCounts = useCallback((patch: Record<string, number>): void => {
    setDuplicateHiddenCounts((current) => {
      const next = { ...current, ...patch };
      duplicateHiddenCountsRef.current = next;
      return next;
    });
  }, []);
  const clearListMetadataCache = useCallback((): void => {
    likedTrackIdsRef.current = {};
    duplicateHiddenCountsRef.current = {};
    setLikedTrackIds({});
    setDuplicateHiddenCounts({});
  }, []);

  const setSourceMode = useCallback((mode: LibrarySourceMode): void => {
    setSourceModeState(mode);
    writeStoredLibrarySourceMode(mode);
    clearSongsFirstPageSnapshot();
  }, []);

  useEffect(() => {
    beginSongsStartupLoadDiagnostics({
      source: initialSnapshot ? 'renderer-snapshot' : 'sqlite',
      itemCount: initialSnapshot?.items.length ?? 0,
      total: initialSnapshot?.total ?? 0,
    });
  }, [initialSnapshot]);

  useEffect(() => {
    let isMounted = true;
    const appBridge = window.echo?.app;

    if (!appBridge) {
      return () => {
        isMounted = false;
      };
    }

    void appBridge
      .getSettings()
      .then((settings) => {
        if (!isMounted) {
          return;
        }

        const localSort = readStoredSort();
        const nextSort = (settings.appMemoryVersion ?? 0) < 1 && localSort !== 'default' ? localSort : (settings.songsSort ?? 'default');

        if (validSortValues.has(nextSort)) {
          setSort(nextSort);
          writeStoredSort(nextSort);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!isSortOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  const loadTracks = useCallback(
    async (nextPage: number, mode: 'replace' | 'append' | 'prepend') => {
      if (mode !== 'replace' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      setStatusMessage(null);
      if (mode === 'replace') {
        setListVersion((current) => current + 1);
        setVisibleTrackIds([]);
        setLoadedStartIndex(0);
        setLocatedCurrentTrackIndex(null);
      }

      try {
        const library = window.echo?.library;

        if (!library) {
          setTracks([]);
          setLoadedStartIndex(0);
          setLocatedCurrentTrackIndex(null);
          setTotal(0);
          setHasMore(false);
          clearListMetadataCache();
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read the library.');
          return;
        }

        const query = {
          page: nextPage,
          pageSize,
          search,
          sort,
          sourceProvider: sourceMode,
          hideDuplicates,
          duplicateMode: 'strict',
        } as const;
        const queryKey = createSongsFirstPageSnapshotQueryKey(query);
        const shouldUseFirstPageSnapshot = mode === 'replace' && nextPage === 1 && canUseSongsFirstPageSnapshot(query);
        const queryStartedAt = performance.now();
        const result = await library.getTracks(query);
        const queryMs = performance.now() - queryStartedAt;

        if (requestIdRef.current !== requestId) {
          return;
        }

        const nextLoadedStartIndex = (result.page - 1) * result.pageSize;
        setTracks((current) => {
          if (mode === 'append') {
            return [...current, ...result.items];
          }

          if (mode === 'prepend') {
            return [...result.items, ...current];
          }

          return result.items;
        });
        if (mode !== 'append') {
          setLoadedStartIndex(nextLoadedStartIndex);
        }
        setTotal(result.total);
        if (mode !== 'prepend') {
          setHasMore(result.hasMore);
        }
        if (shouldUseFirstPageSnapshot) {
          finishSongsStartupSqliteLoadDiagnostics({
            sqliteQueryMs: queryMs,
            itemCount: result.items.length,
            total: result.total,
          });
          writeSongsFirstPageSnapshot(queryKey, result);
        }
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (requestIdRef.current === requestId) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [clearListMetadataCache, hideDuplicates, search, sort, sourceMode],
  );

  useEffect(() => {
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    writeStoredSort(sort);
  }, [sort]);

  const loadDuplicateSettings = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    const library = window.echo?.library;

    if (!app || !library) {
      return;
    }

    try {
      const [settings, summary] = await Promise.all([app.getSettings(), library.getDuplicateIndexSummary('strict')]);
      writeStoredHideDuplicates(settings.duplicateTracksEnabled);
      setHideDuplicates(settings.duplicateTracksEnabled);
      setDuplicateSummary(summary);

      if (settings.duplicateTracksEnabled && summary.duplicateGroups === 0) {
        setDuplicateMessage('需要先分析重复歌曲');
      }
    } catch {
      // Duplicate controls are optional around the core song list.
    }
  }, []);

  useEffect(() => {
    void loadDuplicateSettings();
  }, [loadDuplicateSettings]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      if (ignoreNextLibraryChangedRef.current) {
        ignoreNextLibraryChangedRef.current = false;
        clearSongsFirstPageSnapshot();
        return;
      }

      clearSongsFirstPageSnapshot();
      clearListMetadataCache();
      void loadTracks(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [clearListMetadataCache, loadTracks]);

  useEffect(() => {
    const handleSettingsChanged = (): void => {
      void loadDuplicateSettings();
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, [loadDuplicateSettings]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoading && hasMore) {
      const nextPage = Math.floor((loadedStartIndex + tracks.length) / pageSize) + 1;
      void loadTracks(nextPage, 'append');
    }
  }, [hasMore, isLoading, loadTracks, loadedStartIndex, tracks.length]);

  const handleLoadPrevious = useCallback((): void => {
    if (!isLoading && loadedStartIndex > 0) {
      const previousPage = Math.max(1, Math.floor(loadedStartIndex / pageSize));
      void loadTracks(previousPage, 'prepend');
    }
  }, [isLoading, loadTracks, loadedStartIndex]);

  useEffect(() => {
    if (!followCurrentTrack || !currentTrackId) {
      locateRequestIdRef.current += 1;
      setLocatedCurrentTrackIndex(null);
      return;
    }

    if (currentTrackLoadedIndex >= 0) {
      locateRequestIdRef.current += 1;
      setLocatedCurrentTrackIndex(loadedStartIndex + currentTrackLoadedIndex);
      return;
    }

    if (sort === 'random') {
      locateRequestIdRef.current += 1;
      setStatusMessage('随机排序没有稳定位置，当前播放歌曲只能在已加载列表内定位。');
      return;
    }

    const library = window.echo?.library;
    if (!library?.locateTrackInTracks) {
      return;
    }

    const requestId = locateRequestIdRef.current + 1;
    locateRequestIdRef.current = requestId;
    setStatusMessage('正在定位当前播放歌曲...');

    void library
      .locateTrackInTracks(currentTrackId, {
        pageSize,
        search,
        sort,
        sourceProvider: sourceMode,
        hideDuplicates,
        duplicateMode: 'strict',
      })
      .then((result) => {
        if (locateRequestIdRef.current !== requestId) {
          return;
        }

        if (!result.found) {
          setLocatedCurrentTrackIndex(null);
          if (result.reason === 'filtered') {
            setStatusMessage('当前播放歌曲不在当前搜索或隐藏重复歌曲结果中。');
          } else if (result.reason === 'unsupported-sort') {
            setStatusMessage('随机排序没有稳定位置，当前播放歌曲只能在已加载列表内定位。');
          } else {
            setStatusMessage('当前播放歌曲不在歌曲库列表中。');
          }
          return;
        }

        requestIdRef.current += 1;
        isLoadingRef.current = false;
        setIsLoading(false);
        clearListMetadataCache();
        setListVersion((current) => current + 1);
        setVisibleTrackIds([]);
        setTracks(result.items);
        setLoadedStartIndex((result.page - 1) * result.pageSize);
        setLocatedCurrentTrackIndex(result.index);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setError(null);
        setStatusMessage(null);
      })
      .catch((locateError) => {
        if (locateRequestIdRef.current === requestId) {
          setLocatedCurrentTrackIndex(null);
          setStatusMessage(null);
          setError(locateError instanceof Error ? locateError.message : String(locateError));
        }
      });
  }, [
    clearListMetadataCache,
    currentTrackId,
    currentTrackLoadedIndex,
    followCurrentTrack,
    hideDuplicates,
    loadedStartIndex,
    search,
    sourceMode,
    sort,
  ]);

  const handleImportFolder = (): void => {
    window.dispatchEvent(new Event('app:navigate:import-folder'));
  };

  const handleOpenTrackArtist = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      const artist = await openArtistDetailForTrack(track, { returnTo: 'songs' });
      if (!artist) {
        setError(`未找到艺术家：${track.artist || 'Unknown Artist'}`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleOpenTrackAlbum = useCallback(async (track: LibraryTrack): Promise<void> => {
    try {
      setError(null);
      const album = await openAlbumDetailForTrack(track, { returnTo: 'songs' });
      if (!album) {
        setError(`未找到专辑：${track.album || 'Unknown Album'}`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleMaintainLibrary = async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to maintain the library.');
      return;
    }

    setIsMaintainingLibrary(true);
    setError(null);
    setStatusMessage('正在扫描失效歌曲和 5 秒及以下短音频...');

    try {
      const cleanup = library.pruneInvalidTracks
        ? await library.pruneInvalidTracks()
        : {
            ...(await library.pruneMissingTracks()),
            missingRemovedCount: 0,
            shortRemovedCount: 0,
            shortDurationThresholdSeconds: 5,
          };
      const folders: Awaited<ReturnType<typeof library.getFolders>> = [];
      const activeFolders = folders.filter((folder) => folder.status === 'active');
      const scanJobs = await Promise.all(activeFolders.map((folder) => library.scanFolder(folder.id)));

      if (scanJobs.length > 0) {
        let statuses = scanJobs;
        setStatusMessage(summarizeScanJobs(statuses));

        while (statuses.some((status) => !finishedScanStatuses.has(status.status))) {
          await sleep(scanPollIntervalMs);
          statuses = await Promise.all(statuses.map((status) => library.getScanStatus(status.id)));
          setStatusMessage(summarizeScanJobs(statuses));
        }

        const failedJob = statuses.find((status) => status.status === 'failed');
        if (failedJob) {
          throw new Error(`增量扫描失败：${failedJob.errors[0] ?? 'unknown error'}`);
        }
      }
      await loadTracks(1, 'replace');
      window.dispatchEvent(new Event('library:changed'));
      setStatusMessage(
        `维护完成：检查 ${cleanup.scannedCount} 首，移除失效 ${cleanup.missingRemovedCount} 首，移除 ${cleanup.shortDurationThresholdSeconds} 秒及以下短音频 ${cleanup.shortRemovedCount} 首，增量扫描 ${scanJobs.length} 个文件夹。`,
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setIsMaintainingLibrary(false);
    }
  };

  const handleClearTracks = async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to clear the library list.');
      return;
    }

    if (!window.confirm(`清空歌曲列表？\n这会从列表移除 ${total} 首歌曲，不会删除本地音乐文件。`)) {
      return;
    }

    setIsClearing(true);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await library.clearTracks();
      setTracks([]);
      setLoadedStartIndex(0);
      setLocatedCurrentTrackIndex(null);
      setTotal(0);
      setHasMore(false);
      setVisibleTrackIds([]);
      clearListMetadataCache();
      window.dispatchEvent(new Event('library:changed'));
      setStatusMessage(`已清空 ${result.removedCount} 首歌曲。`);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setIsClearing(false);
    }
  };

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      const playback = window.echo?.playback;

      if (!playback) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to play local files.');
        return;
      }

      try {
        setError(null);
        await playTrack(track, {
          replaceQueueWith: tracks,
          source: queueSource,
        });
      } catch (playError) {
        if (isPlaybackCancellationError(playError)) {
          return;
        }

        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [playTrack, queueSource, tracks],
  );

  useEffect(() => {
    duplicateHiddenCountsRef.current = {};
    setDuplicateHiddenCounts({});
  }, [duplicateSummary?.updatedAt]);

  useEffect(() => {
    const loadVisibleDuplicateBadges = async (): Promise<void> => {
      const library = window.echo?.library;
      const trackIds = uniqueIds(visibleTrackIds);
      const missingTrackIds = trackIds.filter((trackId) => duplicateHiddenCountsRef.current[trackId] === undefined);

      if (missingTrackIds.length === 0) {
        return;
      }

      if (!library?.getDuplicateHiddenCounts) {
        mergeDuplicateHiddenCounts(Object.fromEntries(missingTrackIds.map((trackId) => [trackId, 0])));
        return;
      }

      const requestId = duplicateRequestIdRef.current + 1;
      duplicateRequestIdRef.current = requestId;

      try {
        const result = await library.getDuplicateHiddenCounts(missingTrackIds, 'strict');
        if (duplicateRequestIdRef.current !== requestId) {
          return;
        }

        mergeDuplicateHiddenCounts(
          Object.fromEntries(missingTrackIds.map((trackId) => [trackId, Math.max(0, Number(result[trackId] ?? 0))])),
        );
      } catch {
        if (duplicateRequestIdRef.current === requestId) {
          mergeDuplicateHiddenCounts(Object.fromEntries(missingTrackIds.map((trackId) => [trackId, 0])));
        }
      }
    };

    void loadVisibleDuplicateBadges();
  }, [mergeDuplicateHiddenCounts, visibleTrackIds, visibleTrackIdsKey]);

  useEffect(() => {
    const loadLoadedTrackLikedStates = async (): Promise<void> => {
      const library = window.echo?.library;
      const trackIds = loadedTrackIdsKey ? loadedTrackIdsKey.split('\0') : [];
      const missingTrackIds = trackIds.filter((trackId) => likedTrackIdsRef.current[trackId] === undefined);

      if (missingTrackIds.length === 0) {
        return;
      }

      if (!library?.getLikedTrackIds) {
        mergeLikedTrackIds(Object.fromEntries(missingTrackIds.map((trackId) => [trackId, false])));
        return;
      }

      const requestId = likedRequestIdRef.current + 1;
      likedRequestIdRef.current = requestId;

      try {
        const result = await library.getLikedTrackIds(missingTrackIds);
        if (likedRequestIdRef.current !== requestId) {
          return;
        }

        mergeLikedTrackIds(Object.fromEntries(missingTrackIds.map((trackId) => [trackId, result[trackId] === true])));
      } catch {
        if (likedRequestIdRef.current === requestId) {
          mergeLikedTrackIds(Object.fromEntries(missingTrackIds.map((trackId) => [trackId, false])));
        }
      }
    };

    void loadLoadedTrackLikedStates();
  }, [likedRefreshVersion, loadedTrackIdsKey, mergeLikedTrackIds]);

  useEffect(() => {
    const handleLikedTracksChanged = (): void => {
      likedTrackIdsRef.current = {};
      setLikedTrackIds({});
      setLikedRefreshVersion((current) => current + 1);
    };

    window.addEventListener(likedTracksChangedEvent, handleLikedTracksChanged);
    return () => window.removeEventListener(likedTracksChangedEvent, handleLikedTracksChanged);
  }, []);

  const handleShowVersions = useCallback(async (track: LibraryTrack): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to inspect duplicate versions.');
      return;
    }

    setVersionTrack(track);
    setVersionsBusy(true);
    setError(null);

    try {
      setVersionMembers(await library.getDuplicateTrackVersions(track.id));
    } catch (versionsError) {
      setVersionMembers([]);
      setError(versionsError instanceof Error ? versionsError.message : String(versionsError));
    } finally {
      setVersionsBusy(false);
    }
  }, []);

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleAddTrackToQueue = useCallback(
    (track: LibraryTrack): void => {
      appendToQueue(track, queueSource);
    },
    [appendToQueue, queueSource],
  );

  const handleAddTrackToPlaylist = useCallback(async (track: LibraryTrack): Promise<void> => {
    const library = window.echo?.library;
    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to use playlists.');
      return;
    }

    try {
      setError(null);
      const playlists = (await library.getPlaylists()).filter((playlist) => playlist.sourceProvider === 'local' && playlist.kind !== 'system');
      let playlist: (typeof playlists)[number] | null = playlists[0] ?? null;
      if (playlists.length > 1) {
        const names = playlists.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
        const choice = window.prompt(`选择歌单编号：\n${names}`, '1');
        const index = Number(choice) - 1;
        playlist = Number.isInteger(index) ? playlists[index] ?? null : null;
      }

      if (!playlist) {
        const name = window.prompt('还没有本地歌单，输入名称创建后添加：');
        if (!name?.trim()) {
          return;
        }
        playlist = await library.createPlaylist({ name });
      }

      if (!playlist) {
        return;
      }

      await library.addTrackToPlaylist(playlist.id, track.id);
      window.dispatchEvent(new Event('library:playlists-changed'));
      setStatusMessage(`已加入歌单：${playlist.name}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }, []);

  const resolveTrackLikedBeforeToggle = useCallback(async (trackId: string): Promise<boolean> => {
    const cached = likedTrackIdsRef.current[trackId];
    if (cached !== undefined) {
      return cached === true;
    }

    const result = await window.echo?.library?.getLikedTrackIds?.([trackId]);
    const liked = result?.[trackId] === true;
    mergeLikedTrackIds({ [trackId]: liked });
    return liked;
  }, [mergeLikedTrackIds]);

  const handleToggleLiked = useCallback(async (track: LibraryTrack): Promise<void> => {
    const hadCachedLikedState = likedTrackIdsRef.current[track.id] !== undefined;
    const previousLiked = await resolveTrackLikedBeforeToggle(track.id);

    if (!hadCachedLikedState && previousLiked) {
      return;
    }

    mergeLikedTrackIds({ [track.id]: !previousLiked });

    try {
      setError(null);
      const result = await window.echo?.library?.toggleTrackLiked(track.id);
      mergeLikedTrackIds({ [track.id]: result?.liked === true });
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      mergeLikedTrackIds({ [track.id]: previousLiked });
      setError(likeError instanceof Error ? likeError.message : String(likeError));
    }
  }, [mergeLikedTrackIds, resolveTrackLikedBeforeToggle]);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'edit-tags' && action !== 'reload-embedded-tags' && action !== 'open-osu-timing') {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to use file actions.');
        return;
      }

      try {
        setError(null);

        if (
          track.mediaType === 'remote' &&
          (action === 'edit-tags' ||
            action === 'reload-embedded-tags' ||
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
          case 'open-osu-timing':
            setOsuTimingTrack(track);
            return;
          case 'edit-tags':
            setTagEditorError(null);
            if (tagEditorCloseTimerRef.current !== null) {
              window.clearTimeout(tagEditorCloseTimerRef.current);
              tagEditorCloseTimerRef.current = null;
            }
            setIsTagEditorOpen(false);
            setEditingTrack(track);
            window.requestAnimationFrame(() => setIsTagEditorOpen(true));
            return;
          case 'reload-embedded-tags':
            {
              const result = await library!.loadEmbeddedTrackTags(track.id);
              setTracks((current) => current.map((item) => (item.id === result.track.id ? result.track : item)));
              if (editingTrack?.id === result.track.id) {
                setEditingTrack(result.track);
              }
              setStatusMessage(`已从内嵌标签重新加载：${result.track.title}`);
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'go-to-album':
            if (!(await openAlbumDetailForTrack(track, { returnTo: 'songs' }))) {
              setError(`Album not found: ${track.album || 'Unknown Album'}`);
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
          case 'copy-name-artist':
            await library?.copyTrackNameArtist(track.id);
            return;
          case 'copy-cover':
            if (!(await library?.copyTrackCover(track.id))) {
              setError('这首歌没有可复制的歌曲卡片图片。');
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setError('没有保存歌曲卡片图片。');
            }
            return;
          case 'delete-song':
            if (!window.confirm(`删除歌曲文件？\n${track.title}`)) {
              return;
            }
            await library?.deleteTrackFile(track.id);
            setTracks((current) => current.filter((item) => item.id !== track.id));
            setTotal((current) => Math.max(0, current - 1));
            setHasMore((current) => current || tracks.length - 1 < total - 1);
            ignoreNextLibraryChangedRef.current = true;
            window.dispatchEvent(new Event('library:changed'));
            return;
          case 'add-to-playlist':
            await handleAddTrackToPlaylist(track);
            return;
            /*
            {
              const playlists = await library!.getPlaylists();
              let playlist: (typeof playlists)[number] | null = playlists[0] ?? null;
              if (playlists.length > 1) {
                const names = playlists.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
                const choice = window.prompt(`选择歌单编号：\n${names}`, '1');
                const index = Number(choice) - 1;
                playlist = Number.isInteger(index) ? playlists[index] ?? null : null;
              }

              if (!playlist) {
                const name = window.prompt('还没有歌单，输入名称创建后添加：');
                if (!name?.trim()) {
                  return;
                }
                playlist = await library!.createPlaylist({ name });
              }

              if (!playlist) {
                return;
              }

              await library!.addTrackToPlaylist(playlist.id, track.id);
              window.dispatchEvent(new Event('library:playlists-changed'));
              setStatusMessage(`已加入歌单：${playlist.name}`);
            }
            return;
            */
          default:
            setError('歌单功能还在接入中。');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendToQueue, editingTrack, handleAddTrackToPlaylist, handleToggleLiked, playTrackNext, queueSource, removeTrackFromQueue, total, tracks.length],
  );

  const closeTagEditor = useCallback((): void => {
    setIsTagEditorOpen(false);
    if (tagEditorCloseTimerRef.current !== null) {
      window.clearTimeout(tagEditorCloseTimerRef.current);
    }
    tagEditorCloseTimerRef.current = window.setTimeout(() => {
      setEditingTrack(null);
      tagEditorCloseTimerRef.current = null;
    }, 280);
  }, []);

  const handleSaveTags = useCallback(
    async (
      track: LibraryTrack,
      tags: EditableTrackTags,
      coverPath: string | null,
      coverUrl: string | null,
      coverMimeType: string | null,
    ): Promise<void> => {
      const library = window.echo?.library;

      if (!library) {
        setTagEditorError('Desktop bridge unavailable. Open ECHO Next in Electron to edit embedded tags.');
        return;
      }

      setIsSavingTags(true);
      setTagEditorError(null);

      try {
        const updatedTrack = await library.updateTrackTags({ trackId: track.id, tags, coverPath, coverUrl, coverMimeType });
        setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
        window.dispatchEvent(new Event('library:changed'));
        closeTagEditor();
      } catch (saveError) {
        setTagEditorError(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor],
  );

  const showIndexLoading = isLoading && tracks.length === 0;
  const pageNoticeMessage =
    error ??
    statusMessage ??
    duplicateMessage ??
    (isMaintainingLibrary ? '正在维护曲库...' : isClearing ? '正在清空列表...' : showIndexLoading ? '正在读取本地索引...' : null);

  useEffect(() => {
    if (pageNoticeMessage && pageNoticeMessage !== lastAnnouncedPageNoticeRef.current) {
      lastAnnouncedPageNoticeRef.current = pageNoticeMessage;
      showChromeNotice(pageNoticeMessage);
    }
  }, [pageNoticeMessage]);

  return (
    <div className="songs-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>歌曲</h1>
          <span>{total} 首</span>
        </div>

        <div className="songs-tools" aria-label="歌曲工具">
          <button className="tool-button" type="button" aria-label="导入文件夹" title="导入文件夹" onClick={handleImportFolder}>
            <FolderPlus size={17} />
          </button>
          <button
            className="tool-button"
            type="button"
            aria-label="扫描失效歌曲、短音频并增量扫描"
            title="扫描失效歌曲、移除 5 秒及以下短音频，并增量扫描新增歌曲"
            onClick={() => void handleMaintainLibrary()}
            disabled={isMaintainingLibrary}
          >
            <RotateCw className={isMaintainingLibrary ? 'spinning-icon' : undefined} size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="下载" title="下载">
            <Download size={17} />
          </button>
          <button
            className="tool-button danger"
            type="button"
            aria-label="清空列表"
            title="清空列表"
            onClick={() => void handleClearTracks()}
            disabled={isClearing || total === 0}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索曲目 / 艺人 / 专辑..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <LibrarySourceSwitch value={sourceMode} onChange={setSourceMode} />

        <div className="sort-select" ref={sortMenuRef}>
          <button
            className="sort-button"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            onClick={() => setIsSortOpen((current) => !current)}
          >
            <ListFilter className="sort-button-icon" size={16} aria-hidden="true" />
            <span className="sort-button-label">{sortOptions.find((option) => option.value === sort)?.label ?? '默认排序'}</span>
            <ChevronDown className="sort-button-chevron" size={15} aria-hidden="true" />
          </button>
          {isSortOpen ? (
            <div className="sort-menu" role="listbox" aria-label="歌曲排序">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  className="sort-option"
                  type="button"
                  role="option"
                  aria-selected={sort === option.value}
                  onClick={() => {
                    setSort(option.value);
                    setIsSortOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {sort === option.value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {total === 0 && !isLoading ? (
        <div className="songs-import-hint">
          <FolderPlus size={17} aria-hidden="true" />
          <span>也可以直接把音乐文件或文件夹拖入窗口。支持 MP3, FLAC, WAV, ALAC, AAC, OPUS, OGG, APE, WV, DSF, DFF, CUE 等格式，更多格式会自动识别。</span>
        </div>
      ) : null}

      <TrackList
        key={listVersion}
        tracks={tracks}
        currentTrackId={currentTrackId}
        canLoadMore={hasMore && !isLoading}
        canLoadPrevious={loadedStartIndex > 0 && !isLoading}
        totalCount={total}
        loadedCount={tracks.length}
        loadedStartIndex={loadedStartIndex}
        isLoadingMore={isLoading}
        onEndReached={handleLoadMore}
        onStartReached={handleLoadPrevious}
        onAddToQueue={handleAddTrackToQueue}
        onAddToPlaylist={(track) => void handleAddTrackToPlaylist(track)}
        onOpenArtist={(track) => void handleOpenTrackArtist(track)}
        onOpenAlbum={(track) => void handleOpenTrackAlbum(track)}
        duplicateHiddenCounts={duplicateHiddenCounts}
        onShowVersions={(track) => void handleShowVersions(track)}
        likedTrackIds={likedTrackIds}
        onToggleLiked={(track) => void handleToggleLiked(track)}
        onOpenTrackMenu={handleOpenTrackMenu}
        onVisibleTrackIdsChange={setVisibleTrackIds}
        onPlay={handlePlayTrack}
        followCurrentTrack={followCurrentTrack}
        currentTrackIndex={currentTrackAbsoluteIndex}
      />

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          liked={likedTrackIds[trackMenu.track.id] === true}
          onAction={(action, track) => void handleTrackMenuAction(action, track)}
          onClose={() => setTrackMenu(null)}
        />
      ) : null}

      <TrackTagEditorDrawer
        track={editingTrack}
        isOpen={isTagEditorOpen}
        isSaving={isSavingTags}
        error={tagEditorError}
        onClose={closeTagEditor}
        onSave={(track, tags, coverPath, coverUrl, coverMimeType) => void handleSaveTags(track, tags, coverPath, coverUrl, coverMimeType)}
        onTrackUpdated={(updatedTrack) => {
          setEditingTrack(updatedTrack);
          setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
          window.dispatchEvent(new Event('library:changed'));
        }}
      />

      <OsuTimingPanel
        track={osuTimingTrack}
        isOpen={Boolean(osuTimingTrack)}
        onClose={() => setOsuTimingTrack(null)}
        onTrackUpdated={(updatedTrack) => {
          setOsuTimingTrack(updatedTrack);
          setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
        }}
      />

      {versionTrack ? (
        <div
          className="duplicate-version-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="重复歌曲版本"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setVersionTrack(null);
            }
          }}
        >
          <section className="duplicate-version-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Duplicate Track Merge View</span>
                <h2>{versionTrack.title}</h2>
                <p>{duplicateSummary ? `${duplicateSummary.duplicateGroups} 组 / 隐藏 ${duplicateSummary.hiddenTracks} 首` : 'strict 模式'}</p>
              </div>
              <button className="row-action" type="button" aria-label="关闭版本面板" onClick={() => setVersionTrack(null)}>
                <X size={17} />
              </button>
            </header>
            {versionsBusy ? <p className="duplicate-version-empty">读取版本中...</p> : null}
            {!versionsBusy && versionMembers.length === 0 ? <p className="duplicate-version-empty">没有找到隐藏版本。需要先分析重复歌曲。</p> : null}
            <div className="duplicate-version-list">
              {versionMembers.map((member) => (
                <article className="duplicate-version-row" key={member.track.id}>
                  <div>
                    <strong>{member.track.title}</strong>
                    <span>{member.track.artist} - {member.track.album}</span>
                    <small title={member.track.path}>{member.track.path}</small>
                  </div>
                  <div className="duplicate-version-specs">
                    <span>{member.track.codec ?? 'unknown'}</span>
                    <span>{member.track.bitDepth ? `${member.track.bitDepth}bit` : '--'}</span>
                    <span>{member.track.sampleRate ? `${Math.round(member.track.sampleRate / 1000)}kHz` : '--'}</span>
                    <span>{member.track.bitrate ? `${Math.round(member.track.bitrate / 1000)}kbps` : '--'}</span>
                    <span>{Math.round(member.track.duration)}s</span>
                  </div>
                  <div className="duplicate-version-rank">
                    <span>score {Math.round(member.qualityScore)}</span>
                    <strong>#{member.rank}</strong>
                    {member.hidden ? <em>hidden</em> : <em>当前显示版本</em>}
                  </div>
                  <button className="row-action" type="button" title="播放这个版本" onClick={() => void handlePlayTrack(member.track)}>
                    <Play size={16} />
                  </button>
                </article>
              ))}
            </div>
            <p className="duplicate-version-todo">TODO: 手动指定代表版本。</p>
          </section>
        </div>
      ) : null}
    </div>
  );
};
