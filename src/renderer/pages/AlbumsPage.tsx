import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Check, ChevronDown, Disc3, ListFilter, RefreshCw, Search } from 'lucide-react';
import type { EditableAlbumTags, LibraryAlbum, LibraryPlaylist, LibrarySort, LibraryTrack } from '../../shared/types/library';
import { AlbumContextMenu } from '../components/album/AlbumContextMenu';
import type { AlbumMenuAction } from '../components/album/AlbumContextMenu';
import { AlbumDetailView } from '../components/album/AlbumDetailView';
import { AlbumTagEditorDrawer } from '../components/album/AlbumTagEditorDrawer';
import { LibrarySourceSwitch } from '../components/library/LibrarySourceSwitch';
import { InfiniteScrollSentinel, readPageScrollTop, writePageScrollTop } from '../components/ui/InfiniteScrollSentinel';
import { likedAlbumsChangedEvent, likedChangedEvent } from '../hooks/useLikedMedia';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { albumDetailNavigationEvent, consumePendingAlbumDetailNavigation, type DetailReturnTarget } from '../utils/albumNavigation';
import { readStoredLibrarySourceMode, writeStoredLibrarySourceMode, type LibrarySourceMode } from '../utils/librarySourceMode';

const pageSize = 60;
const albumSortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'library.sort.default' },
  { value: 'titleAsc', labelKey: 'library.albums.sort.titleAsc' },
  { value: 'titleDesc', labelKey: 'library.albums.sort.titleDesc' },
  { value: 'artist', labelKey: 'library.albums.sort.artist' },
  { value: 'createdAsc', labelKey: 'library.sort.createdAsc' },
  { value: 'createdDesc', labelKey: 'library.sort.createdDesc' },
  { value: 'durationAsc', labelKey: 'library.sort.durationAsc' },
  { value: 'durationDesc', labelKey: 'library.sort.durationDesc' },
  { value: 'fileModifiedAsc', labelKey: 'library.sort.fileModifiedAsc' },
  { value: 'fileModifiedDesc', labelKey: 'library.sort.fileModifiedDesc' },
  { value: 'recent', labelKey: 'library.sort.recent' },
  { value: 'random', labelKey: 'library.sort.random' },
];

type AlbumMenuState = {
  album: LibraryAlbum;
  position: { x: number; y: number };
};

const readAlbumWallScrollTop = (element: Element | null): number => {
  const pageSurface = element?.closest('.page-surface') as HTMLElement | null;
  return Math.max(readPageScrollTop(element), pageSurface?.scrollTop ?? 0);
};

export const AlbumsPage = (): JSX.Element => {
  const { t } = useI18n();
  const { appendTracksToQueue, playTrack, replaceQueue } = usePlaybackQueue();
  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const [sourceMode, setSourceModeState] = useState<LibrarySourceMode>(() => readStoredLibrarySourceMode());
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbum | null>(null);
  const [selectedAlbumReturnTo, setSelectedAlbumReturnTo] = useState<DetailReturnTarget | null>(null);
  const [albumMenu, setAlbumMenu] = useState<AlbumMenuState | null>(null);
  const [likedAlbumIds, setLikedAlbumIds] = useState<Record<string, boolean>>({});
  const [editingAlbum, setEditingAlbum] = useState<LibraryAlbum | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>({});
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pageScrollTopRef = useRef(0);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const shouldRestorePageScrollRef = useRef(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const tagEditorCloseTimerRef = useRef<number | null>(null);

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

    const handlePointerDown = (event: PointerEvent): void => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  const loadAlbums = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      if (mode === 'append' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const library = window.echo?.library;

        if (!library) {
          setAlbums([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(t('library.albums.error.desktopBridge'));
          return;
        }

        const result = await library.getAlbums({
          page: nextPage,
          pageSize,
          search,
          sort,
          sourceProvider: sourceMode,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setAlbums((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        if (mode === 'replace') {
          setFailedCoverUrls({});
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
    [search, sort, sourceMode, t],
  );

  const setSourceMode = useCallback((mode: LibrarySourceMode): void => {
    setSourceModeState(mode);
    writeStoredLibrarySourceMode(mode);
  }, []);

  useEffect(() => {
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      if (readAlbumWallScrollTop(pageRootRef.current) > 80) {
        return;
      }

      writePageScrollTop(pageRootRef.current, 0);
      void loadAlbums(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadAlbums]);

  useEffect(() => {
    if (albums.length === 0) {
      setLikedAlbumIds({});
      return undefined;
    }

    let isMounted = true;
    const ids = albums.map((album) => album.id);
    void window.echo?.library?.getLikedAlbumIds?.(ids)
      .then((result) => {
        if (isMounted) {
          setLikedAlbumIds(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLikedAlbumIds({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, [albums]);

  useLayoutEffect(() => {
    writePageScrollTop(pageRootRef.current, 0);
  }, [search, sort, sourceMode]);

  useLayoutEffect(() => {
    if (selectedAlbum || !shouldRestorePageScrollRef.current) {
      return;
    }

    writePageScrollTop(pageRootRef.current, pageScrollTopRef.current);
    shouldRestorePageScrollRef.current = false;
  }, [selectedAlbum]);

  const openAlbumDetail = useCallback((album: LibraryAlbum, returnTo: DetailReturnTarget | null = null): void => {
    pageScrollTopRef.current = readAlbumWallScrollTop(pageRootRef.current);
    shouldRestorePageScrollRef.current = !returnTo;
    setSelectedAlbumReturnTo(returnTo);
    setSelectedAlbum(album);
  }, []);

  useEffect(() => {
    const pendingRequest = consumePendingAlbumDetailNavigation();
    if (pendingRequest) {
      openAlbumDetail(pendingRequest.album, pendingRequest.returnTo ?? null);
    }

    const handleNavigateAlbumDetail = (event: Event): void => {
      const request = (event as CustomEvent<{ album?: LibraryAlbum; returnTo?: DetailReturnTarget }>).detail;
      if (request?.album) {
        consumePendingAlbumDetailNavigation();
        openAlbumDetail(request.album, request.returnTo ?? null);
      }
    };

    window.addEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
    return () => window.removeEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
  }, [openAlbumDetail]);

  const handleBackFromAlbumDetail = useCallback((): void => {
    if (selectedAlbumReturnTo === 'songs') {
      window.dispatchEvent(new Event('app:navigate:songs'));
      return;
    }

    setSelectedAlbumReturnTo(null);
    setSelectedAlbum(null);
  }, [selectedAlbumReturnTo]);

  const getAllAlbumTracks = useCallback(async (albumId: string): Promise<LibraryTrack[]> => {
    const library = window.echo?.library;

    if (!library) {
      throw new Error(t('library.albums.error.desktopBridge'));
    }

    const tracks: LibraryTrack[] = [];
    let nextPage = 1;
    const trackPageSize = 500;
    for (;;) {
      const result = await library.getAlbumTracks(albumId, { page: nextPage, pageSize: trackPageSize });
      tracks.push(...result.items);
      if (!result.hasMore) {
        return tracks;
      }
      nextPage += 1;
    }
  }, [t]);

  const playAlbum = useCallback(
    async (album: LibraryAlbum): Promise<void> => {
      const tracks = await getAllAlbumTracks(album.id);
      const firstTrack = tracks[0];
      if (!firstTrack) {
        setError('这张专辑没有可播放的歌曲。');
        return;
      }

      const source = { type: 'album' as const, label: album.title, albumId: album.id };
      replaceQueue(tracks, { startTrackId: firstTrack.id, source });
      await playTrack(firstTrack, { source });
    },
    [getAllAlbumTracks, playTrack, replaceQueue],
  );

  const closeTagEditor = useCallback((): void => {
    setIsTagEditorOpen(false);
    if (tagEditorCloseTimerRef.current !== null) {
      window.clearTimeout(tagEditorCloseTimerRef.current);
    }
    tagEditorCloseTimerRef.current = window.setTimeout(() => {
      setEditingAlbum(null);
      tagEditorCloseTimerRef.current = null;
    }, 280);
  }, []);

  const handleOpenAlbumMenu = useCallback((event: MouseEvent<HTMLElement>, album: LibraryAlbum): void => {
    event.preventDefault();
    event.stopPropagation();
    setAlbumMenu({ album, position: { x: event.clientX, y: event.clientY } });
  }, []);

  const handleAlbumMenuAction = useCallback(
    async (action: AlbumMenuAction, album: LibraryAlbum, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setAlbumMenu(null);

      if (!library) {
        setError(t('library.albums.error.desktopBridge'));
        return;
      }

      try {
        setError(null);

        if (album.mediaType === 'remote' && (action === 'edit-tags' || action === 'delete-album')) {
          setError('远程专辑暂不支持编辑标签或删除服务器文件。');
          return;
        }

        switch (action) {
          case 'play-album':
            await playAlbum(album);
            return;
          case 'add-to-queue':
            appendTracksToQueue(await getAllAlbumTracks(album.id), { type: 'album' as const, label: album.title, albumId: album.id });
            return;
          case 'add-to-playlist':
            {
              const playlist = playlistTarget;
              if (!playlist) {
                return;
              }

              const tracks = await getAllAlbumTracks(album.id);
              const localTrackIds: string[] = [];
              const streamingTracks: LibraryTrack[] = [];
              for (const track of tracks) {
                if (track.mediaType === 'streaming' && track.provider && track.providerTrackId) {
                  streamingTracks.push(track);
                } else {
                  localTrackIds.push(track.id);
                }
              }

              if (localTrackIds.length > 0) {
                if (library.addTracksToPlaylist) {
                  await library.addTracksToPlaylist(playlist.id, localTrackIds);
                } else {
                  await Promise.all(localTrackIds.map((trackId) => library.addTrackToPlaylist(playlist.id, trackId)));
                }
              }
              await Promise.all(streamingTracks.map((track) => library.addStreamingTrackToPlaylist(playlist.id, track)));
              window.dispatchEvent(new Event('library:playlists-changed'));
            }
            return;
          case 'toggle-liked':
            {
              const previous = likedAlbumIds[album.id] === true;
              setLikedAlbumIds((current) => ({ ...current, [album.id]: !previous }));
              const result = await library.toggleAlbumLiked(album.id);
              setLikedAlbumIds((current) => ({ ...current, [album.id]: result.liked }));
              window.dispatchEvent(new Event(likedAlbumsChangedEvent));
              window.dispatchEvent(new Event(likedChangedEvent));
            }
            return;
          case 'edit-tags':
            setTagEditorError(null);
            if (tagEditorCloseTimerRef.current !== null) {
              window.clearTimeout(tagEditorCloseTimerRef.current);
              tagEditorCloseTimerRef.current = null;
            }
            setIsTagEditorOpen(false);
            setEditingAlbum(album);
            window.requestAnimationFrame(() => setIsTagEditorOpen(true));
            return;
          case 'copy-info':
            await library.copyAlbumInfo(album.id);
            return;
          case 'copy-cover':
            if (!(await library.copyAlbumCover(album.id))) {
              setError('这张专辑没有可复制的封面。');
            }
            return;
          case 'save-cover':
            if (!(await library.saveAlbumCover(album.id))) {
              setError('没有保存专辑封面。');
            }
            return;
          case 'delete-album':
            if (!window.confirm(`删除专辑文件？\n${album.title}\n\n这会把 ${album.trackCount} 首歌曲移到系统回收站，并从媒体库移除。`)) {
              return;
            }
            await library.deleteAlbumFiles(album.id);
            setAlbums((current) => current.filter((item) => item.id !== album.id));
            window.dispatchEvent(new Event('library:changed'));
            return;
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendTracksToQueue, getAllAlbumTracks, likedAlbumIds, playAlbum, t],
  );

  const handleSaveAlbumTags = useCallback(
    async (
      album: LibraryAlbum,
      tags: EditableAlbumTags,
      coverPath: string | null,
      coverUrl: string | null,
      coverMimeType: string | null,
    ): Promise<void> => {
      const library = window.echo?.library;

      if (!library) {
        setTagEditorError(t('library.albums.error.desktopBridge'));
        return;
      }

      setIsSavingTags(true);
      setTagEditorError(null);

      try {
        const updatedAlbum = await library.updateAlbumTags({ albumId: album.id, tags, coverPath, coverUrl, coverMimeType });
        setAlbums((current) => current.map((item) => (item.id === album.id ? updatedAlbum : item)));
        window.dispatchEvent(new Event('library:changed'));
        closeTagEditor();
      } catch (saveError) {
        setTagEditorError(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor, t],
  );

  const handleLoadMoreAlbums = useCallback((): void => {
    if (isLoadingRef.current || !hasMore) {
      return;
    }

    void loadAlbums(page + 1, 'append');
  }, [hasMore, loadAlbums, page]);

  const handleRefresh = useCallback((): void => {
    writePageScrollTop(pageRootRef.current, 0);
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  const handleAlbumKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, album: LibraryAlbum): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAlbumDetail(album);
    }
  }, [openAlbumDetail]);

  const handleAlbumCoverError = useCallback((album: LibraryAlbum): void => {
    if (!album.coverThumb) {
      return;
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('Failed to load album cover', {
        url: album.coverThumb,
        albumId: album.id,
      });
    }

    setFailedCoverUrls((current) =>
      current[album.id] === album.coverThumb
        ? current
        : {
            ...current,
            [album.id]: album.coverThumb!,
          },
    );
  }, []);

  if (selectedAlbum) {
    return <AlbumDetailView album={selectedAlbum} onBack={handleBackFromAlbumDetail} />;
  }

  return (
    <div className="albums-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>{t('library.albums.title')}</h1>
          <span>{t('library.count.total', { count: total })}</span>
        </div>
        <button className="tool-button album-refresh" type="button" aria-label={t('library.action.refresh')} title={t('library.action.refresh')} onClick={handleRefresh}>
          <RefreshCw size={17} />
        </button>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={t('library.albums.searchPlaceholder')}
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
            <span className="sort-button-label">{t(albumSortOptions.find((option) => option.value === sort)?.labelKey ?? 'library.sort.default')}</span>
            <ChevronDown className="sort-button-chevron" size={15} aria-hidden="true" />
          </button>
          {isSortOpen ? (
            <div className="sort-menu" role="listbox" aria-label={t('library.albums.sort.aria')}>
              {albumSortOptions.map((option) => (
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
                  <span>{t(option.labelKey)}</span>
                  {sort === option.value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div ref={pageRootRef} className="media-wall-scroll-shell page-scroll-container">
        <section className="album-wall" aria-label={t('library.albums.listAria')}>
          {albums.map((album) => {
            const shouldShowCover = Boolean(album.coverThumb && failedCoverUrls[album.id] !== album.coverThumb);

            return (
              <article
                className="album-card"
                key={album.id}
                role="button"
                tabIndex={0}
                onClick={() => openAlbumDetail(album)}
                onContextMenu={(event) => handleOpenAlbumMenu(event, album)}
                onKeyDown={(event) => handleAlbumKeyDown(event, album)}
              >
                <div className="album-cover" data-empty={!shouldShowCover} aria-hidden="true">
                  {shouldShowCover ? (
                    <img
                      alt=""
                      decoding="async"
                      draggable={false}
                      height={320}
                      loading="lazy"
                      src={album.coverThumb!}
                      width={320}
                      onError={() => handleAlbumCoverError(album)}
                    />
                  ) : (
                    <Disc3 size={24} />
                  )}
                </div>
                <div className="album-copy">
                  <strong>{album.title}</strong>
                  <span>{album.albumArtist}</span>
                  <small>{t('library.albums.card.tracks', { count: album.trackCount })}</small>
                </div>
              </article>
            );
          })}
          {/* TODO: If 3000/10000 album smoke tests still show scroll jank, replace this paged wall with @tanstack/react-virtual grid virtualization. */}
        </section>
        <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMoreAlbums} />

        {error || isLoading ? (
          <div className="list-footer">
            <span>{error ?? t('library.albums.loading')}</span>
          </div>
        ) : null}
      </div>
      {albumMenu ? (
        <AlbumContextMenu
          album={albumMenu.album}
          position={albumMenu.position}
          liked={likedAlbumIds[albumMenu.album.id] === true}
          onAction={(action, album, playlist) => void handleAlbumMenuAction(action, album, playlist)}
          onClose={() => setAlbumMenu(null)}
        />
      ) : null}
      <AlbumTagEditorDrawer
        album={editingAlbum}
        isOpen={isTagEditorOpen}
        isSaving={isSavingTags}
        error={tagEditorError}
        onClose={closeTagEditor}
        onSave={(album, tags, coverPath, coverUrl, coverMimeType) => void handleSaveAlbumTags(album, tags, coverPath, coverUrl, coverMimeType)}
      />
    </div>
  );
};
