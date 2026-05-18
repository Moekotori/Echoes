import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  ListPlus,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Shuffle,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  EditableTrackTags,
  LibraryFolderNode,
  LibraryFolderOverview,
  LibraryPage,
  LibraryPlaylist,
  LibraryScanStatus,
  LibrarySort,
  LibraryTrack,
} from '../../shared/types/library';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { OsuTimingPanel } from '../components/library/OsuTimingPanel';
import { TrackList } from '../components/library/TrackList';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { StyledSelect } from '../components/ui/StyledSelect';
import {
  forgetLibraryScanStatus,
  getLibraryScanStatuses,
  rememberLibraryScanStatus,
  subscribeLibraryScanStatuses,
  type ScanStatusByFolder,
} from '../stores/libraryScanSession';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useI18n } from '../i18n/I18nProvider';
import { resolvePlaylistForTrackAdd } from '../utils/appPrompt';
import { usePlaybackFollowCurrentTrack } from '../hooks/usePlaybackFollowCurrentTrack';
import type { TranslationKey } from '../i18n/locales';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';

type FolderTarget = {
  folderId: string;
  path: string;
  name: string;
  rootName: string;
  rootPath: string;
  trackCount: number;
  childFolderCount: number;
  totalDuration: number;
  totalSizeBytes: number;
  coverThumbs: string[];
};

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

const pageSize = 100;
const bulkPageSize = 500;
const maxBulkTracks = 1000;
const terminalStatuses = new Set<LibraryScanStatus['status']>(['completed', 'failed', 'cancelled']);
const runningStatuses = new Set<LibraryScanStatus['status']>(['queued', 'running']);

const sortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'folders.sort.title' },
  { value: 'artist', labelKey: 'folders.sort.artist' },
  { value: 'album', labelKey: 'folders.sort.album' },
  { value: 'recent', labelKey: 'folders.sort.recent' },
  { value: 'durationDesc', labelKey: 'folders.sort.duration' },
  { value: 'qualityDesc', labelKey: 'folders.sort.quality' },
  { value: 'random', labelKey: 'folders.sort.random' },
];

const targetKey = (folderId: string, path: string): string => `${folderId}::${path}`;

const formatDuration = (seconds: number, t: (key: TranslationKey, options?: Record<string, string | number>) => string): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return t('folders.duration.minutes', { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? t('folders.duration.hoursMinutes', { hours, minutes: rest }) : t('folders.duration.hours', { count: hours });
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
};

const statusLabel = (status: LibraryScanStatus['status'], t: (key: TranslationKey) => string): string => {
  switch (status) {
    case 'queued':
      return t('folders.status.queued');
    case 'running':
      return t('folders.status.running');
    case 'completed':
      return t('folders.status.completed');
    case 'cancelled':
      return t('folders.status.cancelled');
    case 'failed':
      return t('folders.status.failed');
    default:
      return status;
  }
};

const phaseLabel = (phase: LibraryScanStatus['phase'], t: (key: TranslationKey) => string): string => {
  switch (phase) {
    case 'discovering':
      return t('folders.phase.discovering');
    case 'checking_cache':
      return t('folders.phase.checkingCache');
    case 'reading_metadata':
      return t('folders.phase.readingMetadata');
    case 'extracting_covers':
      return t('folders.phase.extractingCovers');
    case 'grouping_albums':
      return t('folders.phase.groupingAlbums');
    case 'writing_database':
      return t('folders.phase.writingDatabase');
    case 'finished':
      return t('folders.phase.finished');
    default:
      return phase;
  }
};

const formatFolderError = (error: unknown, t: (key: TranslationKey) => string): string => {
  const message = error instanceof Error ? error.message : String(error);
  const upper = message.toUpperCase();

  if (upper.includes('ENOENT')) {
    return t('folders.error.pathMissing');
  }

  if (upper.includes('ENOTDIR')) {
    return t('folders.error.notFolder');
  }

  if (upper.includes('EACCES') || upper.includes('EPERM')) {
    return t('folders.error.permission');
  }

  return message || t('folders.error.actionFailed');
};

const overviewToTarget = (overview: LibraryFolderOverview): FolderTarget => ({
  folderId: overview.id,
  path: overview.path,
  name: overview.name,
  rootName: overview.name,
  rootPath: overview.path,
  trackCount: overview.trackCount,
  childFolderCount: overview.childFolderCount,
  totalDuration: overview.totalDuration,
  totalSizeBytes: overview.totalSizeBytes,
  coverThumbs: overview.coverThumbs,
});

const nodeToTarget = (node: LibraryFolderNode, root: LibraryFolderOverview): FolderTarget => ({
  folderId: node.folderId,
  path: node.path,
  name: node.name,
  rootName: root.name,
  rootPath: root.path,
  trackCount: node.trackCount,
  childFolderCount: node.childFolderCount,
  totalDuration: node.totalDuration,
  totalSizeBytes: node.totalSizeBytes,
  coverThumbs: node.coverThumbs,
});

export const FoldersPage = (): JSX.Element => {
  const { t } = useI18n();
  const [overviews, setOverviews] = useState<LibraryFolderOverview[]>([]);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, LibraryFolderNode[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingChildren, setLoadingChildren] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<FolderTarget | null>(null);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const localizedSortOptions = useMemo(
    () => sortOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
    [t],
  );
  const [recursive, setRecursive] = useState(true);
  const [folderPath, setFolderPath] = useState('');
  const [scanStatuses, setScanStatuses] = useState<ScanStatusByFolder>(getLibraryScanStatuses);
  const [isLoadingOverviews, setIsLoadingOverviews] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [osuTimingTrack, setOsuTimingTrack] = useState<LibraryTrack | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const trackRequestIdRef = useRef(0);
  const bulkRequestIdRef = useRef(0);
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const { currentTrackId, playTrack, appendToQueue, appendTracksToQueue, playTrackNext, removeTrackFromQueue } = usePlaybackQueue();
  const followCurrentTrack = usePlaybackFollowCurrentTrack();

  const selectedOverview = useMemo(
    () => (selected ? overviews.find((overview) => overview.id === selected.folderId) ?? null : null),
    [overviews, selected],
  );
  const selectedScan = selected ? scanStatuses[selected.folderId] ?? selectedOverview?.recentScan ?? null : null;
  const isSelectedScanning = selectedScan ? runningStatuses.has(selectedScan.status) : false;
  const folderSource = useMemo(
    () =>
      selected
        ? {
            type: 'folder' as const,
            label: recursive ? t('folders.queueSource.recursive', { name: selected.name }) : selected.name,
            folderId: selected.folderId,
            path: selected.path,
            recursive,
          }
        : null,
    [recursive, selected, t],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => subscribeLibraryScanStatuses(setScanStatuses), []);

  const refreshOverviews = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.getFolderOverviews) {
      setOverviews([]);
      setSelected(null);
      setError(t('folders.error.desktopManage'));
      return;
    }

    setIsLoadingOverviews(true);
    setError(null);

    try {
      const nextOverviews = await library.getFolderOverviews();
      setOverviews(nextOverviews);
      setSelected((current) => {
        if (current && nextOverviews.some((overview) => overview.id === current.folderId)) {
          const root = nextOverviews.find((overview) => overview.id === current.folderId)!;
          return current.path === root.path ? overviewToTarget(root) : current;
        }

        return nextOverviews[0] ? overviewToTarget(nextOverviews[0]) : null;
      });
    } catch (refreshError) {
      setError(formatFolderError(refreshError, t));
    } finally {
      setIsLoadingOverviews(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverviews();
  }, [refreshOverviews]);

  const loadChildren = useCallback(
    async (folderId: string, parentPath: string, force = false): Promise<void> => {
      const library = window.echo?.library;
      const key = targetKey(folderId, parentPath);

      if (!library?.getFolderChildren || (!force && childrenByParent[key])) {
        return;
      }

      setLoadingChildren((current) => ({ ...current, [key]: true }));
      setError(null);

      try {
        const children = await library.getFolderChildren({ folderId, parentPath });
        setChildrenByParent((current) => ({ ...current, [key]: children }));
      } catch (childrenError) {
        setError(formatFolderError(childrenError, t));
      } finally {
        setLoadingChildren((current) => ({ ...current, [key]: false }));
      }
    },
    [childrenByParent],
  );

  const toggleExpanded = useCallback(
    (folderId: string, path: string): void => {
      const key = targetKey(folderId, path);
      const willExpand = !expanded[key];
      setExpanded((current) => ({ ...current, [key]: willExpand }));

      if (willExpand) {
        void loadChildren(folderId, path);
      }
    },
    [expanded, loadChildren],
  );

  const loadTracks = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      const library = window.echo?.library;
      const target = selected;

      if (!target || !library?.getFolderTracks) {
        setTracks([]);
        setPage(1);
        setHasMore(false);
        return;
      }

      const requestId = trackRequestIdRef.current + 1;
      trackRequestIdRef.current = requestId;
      setIsLoadingTracks(true);
      setError(null);

      try {
        const result = await library.getFolderTracks({
          folderId: target.folderId,
          path: target.path,
          recursive,
          page: nextPage,
          pageSize,
          search,
          sort,
        });

        if (trackRequestIdRef.current !== requestId) {
          return;
        }

        setTracks((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (tracksError) {
        if (trackRequestIdRef.current === requestId) {
          setError(formatFolderError(tracksError, t));
        }
      } finally {
        if (trackRequestIdRef.current === requestId) {
          setIsLoadingTracks(false);
        }
      }
    },
    [recursive, search, selected, sort],
  );

  useEffect(() => {
    bulkRequestIdRef.current += 1;
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    const activeJobIds = Object.values(scanStatuses)
      .filter((status) => runningStatuses.has(status.status))
      .map((status) => status.id)
      .sort();

    if (activeJobIds.length === 0) {
      return undefined;
    }

    const pollActiveJobs = (): void => {
      const library = window.echo?.library;
      if (!library?.getScanStatus) {
        return;
      }

      for (const jobId of activeJobIds) {
        void library.getScanStatus(jobId).then((status) => rememberLibraryScanStatus(status));
      }
    };

    pollActiveJobs();
    const timer = window.setInterval(pollActiveJobs, 1000);
    return () => window.clearInterval(timer);
  }, [scanStatuses]);

  useEffect(() => {
    if (Object.values(scanStatuses).some((status) => terminalStatuses.has(status.status))) {
      void refreshOverviews();
    }
  }, [refreshOverviews, scanStatuses]);

  const fetchBulkTracks = useCallback(
    async (sortMode: LibrarySort): Promise<{ items: LibraryTrack[]; total: number }> => {
      const library = window.echo?.library;
      const target = selected;

      if (!target || !library?.getFolderTracks) {
        return { items: [], total: 0 };
      }

      const requestId = bulkRequestIdRef.current + 1;
      bulkRequestIdRef.current = requestId;
      const items: LibraryTrack[] = [];
      let nextPage = 1;
      let totalTracks = 0;
      let result: LibraryPage<LibraryTrack> | null = null;

      do {
        result = await library.getFolderTracks({
          folderId: target.folderId,
          path: target.path,
          recursive,
          page: nextPage,
          pageSize: bulkPageSize,
          search,
          sort: sortMode,
        });

        if (bulkRequestIdRef.current !== requestId) {
          return { items: [], total: 0 };
        }

        totalTracks = result.total;
        items.push(...result.items);
        nextPage += 1;
      } while (result.hasMore && items.length < maxBulkTracks);

      return { items: items.slice(0, maxBulkTracks), total: totalTracks };
    },
    [recursive, search, selected],
  );

  const runBulkAction = useCallback(
    async (action: 'play' | 'shuffle' | 'append'): Promise<void> => {
      if (!selected || !folderSource) {
        return;
      }

      setIsBulkLoading(true);
      setError(null);
      setMessage(null);

      try {
        const result = await fetchBulkTracks(action === 'shuffle' ? 'random' : sort);
        if (result.items.length === 0) {
          setMessage(t('folders.message.noPlayableTracks'));
          return;
        }

        if (action === 'append') {
          appendTracksToQueue(result.items, folderSource);
        } else {
          await playTrack(result.items[0], {
            replaceQueueWith: result.items,
            source: folderSource,
          });
        }

        setMessage(
          result.total > result.items.length
            ? t('folders.message.loadedPartial', { loaded: result.items.length, total: result.total })
            : t(action === 'append' ? 'folders.message.queuedTracks' : 'folders.message.loadedTracks', { count: result.items.length }),
        );
      } catch (bulkError) {
        setError(formatFolderError(bulkError, t));
      } finally {
        setIsBulkLoading(false);
      }
    },
    [appendTracksToQueue, fetchBulkTracks, folderSource, playTrack, selected, sort, t],
  );

  const handleChooseFolder = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError(t('folders.error.desktopImport'));
      return;
    }

    try {
      const chosenPath = await library.chooseFolder();
      if (!chosenPath) {
        return;
      }

      setFolderPath(chosenPath);
      const folder = await library.addFolder(chosenPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      setMessage(t('folders.message.folderAddedScanStarted'));
      await refreshOverviews();
      window.dispatchEvent(new Event('library:changed'));
    } catch (chooseError) {
      setError(formatFolderError(chooseError, t));
    }
  }, [refreshOverviews, t]);

  const handleAddPath = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const normalizedPath = folderPath.trim();

    if (!normalizedPath || !library) {
      return;
    }

    try {
      const folder = await library.addFolder(normalizedPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      setMessage(t('folders.message.folderAddedScanStarted'));
      await refreshOverviews();
      window.dispatchEvent(new Event('library:changed'));
    } catch (addError) {
      setError(formatFolderError(addError, t));
    }
  }, [folderPath, refreshOverviews, t]);

  const handleScanSelected = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !library?.scanFolder) {
      return;
    }

    const current = getLibraryScanStatuses()[selected.folderId];
    if (current && runningStatuses.has(current.status)) {
      setMessage(t('folders.message.alreadyScanning'));
      return;
    }

    try {
      rememberLibraryScanStatus(await library.scanFolder(selected.folderId));
      setMessage(t('folders.message.scanStarted'));
    } catch (scanError) {
      setError(formatFolderError(scanError, t));
    }
  }, [selected, t]);

  const handleCancelScan = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selectedScan || !library?.cancelScan || !runningStatuses.has(selectedScan.status)) {
      return;
    }

    try {
      rememberLibraryScanStatus(await library.cancelScan(selectedScan.id));
      setMessage(t('folders.message.scanCancelled'));
    } catch (cancelError) {
      setError(formatFolderError(cancelError, t));
    }
  }, [selectedScan, t]);

  const handleRemoveRoot = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !selectedOverview || !library?.removeFolder) {
      return;
    }

    if (!window.confirm(t('folders.confirm.removeRoot', { name: selectedOverview.name }))) {
      return;
    }

    try {
      await library.removeFolder(selectedOverview.id);
      forgetLibraryScanStatus(selectedOverview.id);
      setChildrenByParent({});
      setExpanded({});
      setSelected(null);
      setMessage(t('folders.message.folderRemoved'));
      await refreshOverviews();
      window.dispatchEvent(new Event('library:changed'));
    } catch (removeError) {
      setError(formatFolderError(removeError, t));
    }
  }, [refreshOverviews, selected, selectedOverview, t]);

  const handleOpenSelectedPath = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !library?.openLibraryFolderPath) {
      return;
    }

    try {
      await library.openLibraryFolderPath({ folderId: selected.folderId, path: selected.path });
    } catch (openError) {
      setError(formatFolderError(openError, t));
    }
  }, [selected, t]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingTracks && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, isLoadingTracks, loadTracks, page]);

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      if (!folderSource) {
        return;
      }

      try {
        await playTrack(track, {
          replaceQueueWith: tracks,
          source: folderSource,
        });
      } catch (playError) {
        setError(formatFolderError(playError, t));
      }
    },
    [folderSource, playTrack, t, tracks],
  );

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'edit-tags' && action !== 'reload-embedded-tags' && action !== 'open-osu-timing') {
        setError(t('folders.error.desktopFileActions'));
        return;
      }

      try {
        setError(null);
        setMessage(null);

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
            if (folderSource) {
              playTrackNext(track, folderSource);
            }
            return;
          case 'add-to-queue':
            if (folderSource) {
              appendToQueue(track, folderSource);
            }
            return;
          case 'toggle-liked':
            await library?.toggleTrackLiked(track.id);
            window.dispatchEvent(new Event('liked:tracks-changed'));
            window.dispatchEvent(new Event('liked:changed'));
            return;
          case 'remove-from-queue':
            {
              const removedCount = removeTrackFromQueue(track.id);
              setMessage(
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
              setMessage(`已从内嵌标签重新加载：${result.track.title}`);
              void refreshOverviews();
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'go-to-album':
            if (!(await openAlbumDetailForTrack(track))) {
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
              setError(t('folders.error.noCoverToCopy'));
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setError(t('folders.error.noCoverSaved'));
            }
            return;
          case 'delete-song':
            if (!window.confirm(t('folders.confirm.deleteTrack', { title: track.title }))) {
              return;
            }
            await library?.deleteTrackFile(track.id);
            setTracks((current) => current.filter((item) => item.id !== track.id));
            void refreshOverviews();
            window.dispatchEvent(new Event('library:changed'));
            return;
          case 'add-to-playlist':
            {
              const playlist = playlistTarget ?? (await resolvePlaylistForTrackAdd(library!));
              if (!playlist) {
                return;
              }

              await library!.addTrackToPlaylist(playlist.id, track.id);
              window.dispatchEvent(new Event('library:playlists-changed'));
              setMessage(t('folders.message.addedToPlaylist', { name: playlist.name }));
            }
            return;
          default:
            setError(t('folders.error.trackActionUnavailable'));
        }
      } catch (actionError) {
        setError(formatFolderError(actionError, t));
      }
    },
    [appendToQueue, editingTrack, folderSource, playTrackNext, refreshOverviews, removeTrackFromQueue, t],
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

      if (!library?.updateTrackTags) {
        setTagEditorError(t('folders.error.desktopEditTags'));
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
        setTagEditorError(formatFolderError(saveError, t));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor, t],
  );

  const renderChildNodes = (folderId: string, parentPath: string): JSX.Element | null => {
    const key = targetKey(folderId, parentPath);
    const children = childrenByParent[key] ?? [];
    const root = overviews.find((overview) => overview.id === folderId);

    if (!expanded[key]) {
      return null;
    }

    if (loadingChildren[key]) {
      return <div className="folder-tree-loading">{t('common.loading')}</div>;
    }

    if (!root || children.length === 0) {
      return null;
    }

    return (
      <div className="folder-tree-children">
        {children.map((node) => {
          const nodeKey = targetKey(node.folderId, node.path);
          const isSelected = selected?.folderId === node.folderId && selected.path === node.path;
          return (
            <div className="folder-tree-node-group" key={nodeKey}>
              <button
                className="folder-tree-node"
                data-active={isSelected}
                style={{ paddingLeft: 10 + node.depth * 14 }}
                type="button"
                onClick={() => setSelected(nodeToTarget(node, root))}
              >
                <span
                  className="folder-expand-hit"
                  data-hidden={node.childFolderCount === 0}
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(node.folderId, node.path);
                  }}
                >
                  <ChevronRight size={14} data-open={expanded[nodeKey]} />
                </span>
                {expanded[nodeKey] ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{node.name}</span>
                <em>{node.trackCount}</em>
              </button>
              {renderChildNodes(node.folderId, node.path)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="folders-workbench">
      <aside className="folders-sidebar">
        <div className="folders-pane-header">
          <div>
            <span className="panel-kicker">{t('folders.sidebar.kicker')}</span>
            <h1>{t('folders.sidebar.title')}</h1>
          </div>
          <button className="tool-button" type="button" aria-label={t('folders.action.refresh')} title={t('folders.action.refresh')} onClick={() => void refreshOverviews()}>
            <RefreshCw className={isLoadingOverviews ? 'spinning-icon' : undefined} size={17} />
          </button>
        </div>

        <div className="folders-root-list">
          {overviews.length === 0 ? (
            <p className="folders-empty">{t('folders.empty.roots')}</p>
          ) : (
            overviews.map((overview) => {
              const rootKey = targetKey(overview.id, overview.path);
              const isSelected = selected?.folderId === overview.id && selected.path === overview.path;
              const scan = scanStatuses[overview.id] ?? overview.recentScan;
              return (
                <div className="folder-root-group" key={overview.id}>
                  <button className="folder-root-button" data-active={isSelected} type="button" onClick={() => setSelected(overviewToTarget(overview))}>
                    <span
                      className="folder-expand-hit"
                      data-hidden={overview.childFolderCount === 0}
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(overview.id, overview.path);
                      }}
                    >
                      <ChevronRight size={15} data-open={expanded[rootKey]} />
                    </span>
                    <FolderOpen size={17} />
                    <span>
                      <strong>{overview.name}</strong>
                      <small>{scan ? statusLabel(scan.status, t) : t('folders.count.tracks', { count: overview.trackCount })}</small>
                    </span>
                    <em>{overview.childFolderCount}</em>
                  </button>
                  {renderChildNodes(overview.id, overview.path)}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="folders-main">
        <header className="folder-detail-header">
          <div className="folder-cover-stack" aria-hidden="true">
            {(selected?.coverThumbs ?? []).slice(0, 4).map((cover, index) => (
              <img alt="" key={cover} src={cover} style={{ '--cover-index': index } as CSSProperties} />
            ))}
            {selected?.coverThumbs.length ? null : <FolderOpen size={34} />}
          </div>
          <div className="folder-detail-title">
            <span>
              {selected
                ? `${selected.rootName} / ${selected.path === selected.rootPath ? t('folders.detail.root') : t('folders.detail.subfolder')}`
                : t('folders.detail.libraryFolders')}
            </span>
            <h2>{selected?.name ?? t('folders.detail.selectFolder')}</h2>
            <p>{selected?.path ?? t('folders.detail.importHint')}</p>
          </div>
          <div className="folder-detail-actions">
            <button className="primary-action" type="button" disabled={!selected || isBulkLoading} onClick={() => void runBulkAction('play')}>
              <Play size={16} fill="currentColor" />
              {t('folders.action.play')}
            </button>
            <button className="secondary-action" type="button" disabled={!selected || isBulkLoading} onClick={() => void runBulkAction('shuffle')}>
              <Shuffle size={16} />
              {t('folders.action.random')}
            </button>
            <button className="secondary-action" type="button" disabled={!selected || isBulkLoading} onClick={() => void runBulkAction('append')}>
              <ListPlus size={16} />
              {t('folders.action.queue')}
            </button>
          </div>
        </header>

        <section className="folder-metrics" aria-label={t('folders.metrics.label')}>
          <span>
            <strong>{selected?.trackCount ?? 0}</strong>
            {t('folders.metrics.tracks')}
          </span>
          <span>
            <strong>{formatDuration(selected?.totalDuration ?? 0, t)}</strong>
            {t('folders.metrics.duration')}
          </span>
          <span>
            <strong>{formatBytes(selected?.totalSizeBytes ?? 0)}</strong>
            {t('folders.metrics.size')}
          </span>
          <span>
            <strong>{selected?.childFolderCount ?? 0}</strong>
            {t('folders.metrics.subfolders')}
          </span>
        </section>

        <section className="folder-track-toolbar" aria-label={t('folders.filters.label')}>
          <label className="search-box">
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder={t('folders.filters.searchPlaceholder')} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </label>
          <label className="folder-toggle">
            <input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} />
            <span>{t('folders.filters.includeSubfolders')}</span>
          </label>
          <StyledSelect
            className="folder-sort-control"
            value={sort}
            options={localizedSortOptions}
            onChange={setSort}
            ariaLabel={t('folders.filters.label')}
          />
        </section>

        <TrackList
          tracks={tracks}
          currentTrackId={currentTrackId}
          canLoadMore={hasMore && !isLoadingTracks}
          onAddToQueue={(track) => folderSource && appendToQueue(track, folderSource)}
          onEndReached={handleLoadMore}
          onOpenTrackMenu={handleOpenTrackMenu}
          onPlay={(track) => void handlePlayTrack(track)}
          followCurrentTrack={followCurrentTrack}
        />

        {error || message || isLoadingTracks || isBulkLoading ? (
          <div className="folders-status-line">
            <span>{error ?? message ?? (isBulkLoading ? t('folders.statusLine.preparingQueue') : t('folders.statusLine.loadingTracks'))}</span>
          </div>
        ) : null}
      </main>

      <aside className="folders-actions-panel">
        <section>
          <div className="folders-panel-heading">
            <span className="panel-kicker">{t('folders.panel.import')}</span>
            <h2>{t('folders.panel.addFolder')}</h2>
          </div>
          <div className="folder-import-box">
            <input type="text" placeholder="D:\\Music" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} />
            <button type="button" onClick={() => void handleChooseFolder()}>
              <FolderPlus size={16} />
              {t('folders.action.browse')}
            </button>
            <button type="button" disabled={!folderPath.trim()} onClick={() => void handleAddPath()}>
              <RotateCw size={16} />
              {t('folders.action.addScan')}
            </button>
          </div>
        </section>

        <section>
          <div className="folders-panel-heading">
            <span className="panel-kicker">{t('folders.panel.manage')}</span>
            <h2>{t('folders.panel.selectedRoot')}</h2>
          </div>
          <div className="folder-action-grid">
            <button type="button" disabled={!selected} onClick={() => void handleOpenSelectedPath()}>
              <FolderOpen size={16} />
              {t('folders.action.open')}
            </button>
            <button type="button" disabled={!selected || isSelectedScanning} onClick={() => void handleScanSelected()}>
              <RotateCw size={16} />
              {t('folders.action.scan')}
            </button>
            <button type="button" disabled={!isSelectedScanning} onClick={() => void handleCancelScan()}>
              <XCircle size={16} />
              {t('folders.action.cancel')}
            </button>
            <button className="danger" type="button" disabled={!selectedOverview} onClick={() => void handleRemoveRoot()}>
              <Trash2 size={16} />
              {t('folders.action.remove')}
            </button>
          </div>
        </section>

        <section>
          <div className="folders-panel-heading">
            <span className="panel-kicker">{t('folders.panel.scan')}</span>
            <h2>{t('folders.panel.status')}</h2>
          </div>
          {selectedScan ? (
            <div className="folder-scan-card" data-running={runningStatuses.has(selectedScan.status)}>
              <strong>{statusLabel(selectedScan.status, t)}</strong>
              <span>{phaseLabel(selectedScan.phase, t)}</span>
              <em>
                {t('folders.scan.progress', {
                  processed: selectedScan.processedFiles,
                  total: selectedScan.totalFiles,
                  errors: selectedScan.errorCount,
                })}
              </em>
              {selectedScan.errors.length > 0 ? <p>{selectedScan.errors[0]}</p> : null}
            </div>
          ) : (
            <p className="folders-empty">{t('folders.empty.noScan')}</p>
          )}
        </section>
      </aside>

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
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
    </div>
  );
};
