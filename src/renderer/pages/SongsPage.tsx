import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, FolderPlus, RotateCw, Search, Trash2 } from 'lucide-react';
import type { EditableTrackTags, LibrarySort, LibraryTrack } from '../../shared/types/library';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { TrackList } from '../components/library/TrackList';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

const pageSize = 100;
const sortOptions: Array<{ value: LibrarySort; label: string }> = [
  { value: 'default', label: '默认排序' },
  { value: 'createdAsc', label: '创建时间 (正序)' },
  { value: 'createdDesc', label: '创建时间 (倒序)' },
  { value: 'titleAsc', label: '歌曲名 (A-Z)' },
  { value: 'titleDesc', label: '歌曲名 (Z-A)' },
  { value: 'durationAsc', label: '音乐时间 (短到长)' },
  { value: 'durationDesc', label: '音乐时间 (长到短)' },
  { value: 'qualityAsc', label: '歌曲质量/大小 (小到大)' },
  { value: 'qualityDesc', label: '歌曲质量/大小 (大到小)' },
  { value: 'frequent', label: '根据常听歌曲排序' },
  { value: 'random', label: '随机排序' },
  { value: 'artist', label: '按艺术家' },
  { value: 'album', label: '按专辑' },
  { value: 'recent', label: '最近更新' },
];

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

export const SongsPage = (): JSX.Element => {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanningMissing, setIsScanningMissing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const requestIdRef = useRef(0);
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const { currentTrackId, playTrack, appendToQueue, playTrackNext, items: queueItems, removeQueueItem } = usePlaybackQueue();
  const queueSource = useMemo(
    () => ({ type: 'songs' as const, label: '歌曲列表', search: search || undefined, sort }),
    [search, sort],
  );

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
    async (nextPage: number, mode: 'replace' | 'append') => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);
      setStatusMessage(null);

      try {
        const library = window.echo?.library;

        if (!library) {
          setTracks([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read the library.');
          return;
        }

        const result = await library.getTracks({
          page: nextPage,
          pageSize,
          search,
          sort,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setTracks((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
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
    [search, sort],
  );

  useEffect(() => {
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      void loadTracks(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadTracks]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoading && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, isLoading, loadTracks, page]);

  const handleImportFolder = (): void => {
    window.dispatchEvent(new Event('app:navigate:import-folder'));
  };

  const handleScanMissingTracks = async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to scan the library.');
      return;
    }

    setIsScanningMissing(true);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await library.pruneMissingTracks();
      await loadTracks(1, 'replace');
      window.dispatchEvent(new Event('library:changed'));
      setStatusMessage(
        result.removedCount > 0
          ? `已扫描 ${result.scannedCount} 首，移除 ${result.removedCount} 首失效歌曲。`
          : `已扫描 ${result.scannedCount} 首，没有发现失效歌曲。`,
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setIsScanningMissing(false);
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
      setPage(1);
      setTotal(0);
      setHasMore(false);
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
        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [playTrack, queueSource, tracks],
  );

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleAddTrackToQueue = useCallback(
    (track: LibraryTrack): void => {
      appendToQueue(track, queueSource);
    },
    [appendToQueue, queueSource],
  );

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'edit-tags') {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to use file actions.');
        return;
      }

      try {
        setError(null);

        switch (action) {
          case 'play-next':
            playTrackNext(track, queueSource);
            return;
          case 'add-to-queue':
            appendToQueue(track, queueSource);
            return;
          case 'remove-from-queue':
            {
              const queuedItem = queueItems.find((item) => item.track.id === track.id);
              if (queuedItem) {
                removeQueueItem(queuedItem.queueId);
              }
            }
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
          case 'go-to-album':
            setSearchInput(track.album);
            setSort('album');
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
            window.dispatchEvent(new Event('library:changed'));
            return;
          case 'add-to-playlist':
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
          default:
            setError('歌单功能还在接入中。');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendToQueue, playTrackNext, queueItems, queueSource, removeQueueItem],
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
            aria-label="扫描失效歌曲"
            title="扫描失效歌曲"
            onClick={() => void handleScanMissingTracks()}
            disabled={isScanningMissing}
          >
            <RotateCw className={isScanningMissing ? 'spinning-icon' : undefined} size={17} />
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

        <div className="sort-select" ref={sortMenuRef}>
          <button
            className="sort-button"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            onClick={() => setIsSortOpen((current) => !current)}
          >
            <span>{sortOptions.find((option) => option.value === sort)?.label ?? '默认排序'}</span>
            <ChevronDown size={15} />
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

      <TrackList
        tracks={tracks}
        currentTrackId={currentTrackId}
        canLoadMore={hasMore && !isLoading}
        onEndReached={handleLoadMore}
        onAddToQueue={handleAddTrackToQueue}
        onOpenTrackMenu={handleOpenTrackMenu}
        onPlay={handlePlayTrack}
      />

      {error || statusMessage || isLoading || isScanningMissing || isClearing ? (
        <div className="list-footer">
          <span>{error ?? statusMessage ?? (isScanningMissing ? '正在扫描失效歌曲...' : isClearing ? '正在清空列表...' : '正在读取曲库...')}</span>
        </div>
      ) : null}

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
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
      />
    </div>
  );
};
