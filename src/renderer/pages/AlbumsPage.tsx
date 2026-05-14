import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, Disc3, RefreshCw, Search } from 'lucide-react';
import type { LibraryAlbum, LibrarySort } from '../../shared/types/library';
import { AlbumDetailView } from '../components/album/AlbumDetailView';
import { InfiniteScrollSentinel, readPageScrollTop, writePageScrollTop } from '../components/ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../components/ui/MediaWallScrollSpacer';

const pageSize = 60;

export const AlbumsPage = (): JSX.Element => {
  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbum | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>({});
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pageScrollTopRef = useRef(0);
  const shouldRestorePageScrollRef = useRef(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const { wallRef: albumWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLElement>({
    itemCount: albums.length,
    totalCount: total,
    minColumnWidth: 164,
    columnGap: 14,
    rowGap: 14,
    estimatedItemHeight: 214,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

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
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read albums.');
          return;
        }

        const result = await library.getAlbums({
          page: nextPage,
          pageSize,
          search,
          sort,
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
    [search, sort],
  );

  useEffect(() => {
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      writePageScrollTop(pageRootRef.current, 0);
      void loadAlbums(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadAlbums]);

  useLayoutEffect(() => {
    writePageScrollTop(pageRootRef.current, 0);
  }, [search, sort]);

  useLayoutEffect(() => {
    if (selectedAlbum || !shouldRestorePageScrollRef.current) {
      return;
    }

    writePageScrollTop(pageRootRef.current, pageScrollTopRef.current);
    shouldRestorePageScrollRef.current = false;
  }, [selectedAlbum]);

  const openAlbumDetail = useCallback((album: LibraryAlbum): void => {
    pageScrollTopRef.current = readPageScrollTop(pageRootRef.current);
    shouldRestorePageScrollRef.current = true;
    setSelectedAlbum(album);
  }, []);

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
    return <AlbumDetailView album={selectedAlbum} onBack={() => setSelectedAlbum(null)} />;
  }

  return (
    <div ref={pageRootRef} className="albums-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>Albums</h1>
          <span>{total} total</span>
        </div>
        <button className="tool-button album-refresh" type="button" aria-label="Refresh" title="Refresh" onClick={handleRefresh}>
          <RefreshCw size={17} />
        </button>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search albums / artists"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label className="sort-button sort-select">
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="default">Default</option>
            <option value="titleAsc">Title A-Z</option>
            <option value="titleDesc">Title Z-A</option>
            <option value="artist">Artist</option>
            <option value="createdAsc">Created Oldest</option>
            <option value="createdDesc">Created Newest</option>
            <option value="durationAsc">Duration Shortest</option>
            <option value="durationDesc">Duration Longest</option>
            <option value="recent">Recent</option>
            <option value="random">Random</option>
          </select>
          <ChevronDown size={15} />
        </label>
      </div>

      <section ref={albumWallRef} className="album-wall" aria-label="Album list">
        {albums.map((album) => {
          const shouldShowCover = Boolean(album.coverThumb && failedCoverUrls[album.id] !== album.coverThumb);

          return (
            <article
              className="album-card"
              key={album.id}
              role="button"
              tabIndex={0}
              onClick={() => openAlbumDetail(album)}
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
                <small>{album.trackCount} tracks</small>
              </div>
            </article>
          );
        })}
        {/* TODO: If 3000/10000 album smoke tests still show scroll jank, replace this paged wall with @tanstack/react-virtual grid virtualization. */}
      </section>
      <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMoreAlbums} />

      {error || isLoading ? (
        <div className="list-footer">
          <span>{error ?? 'Loading albums...'}</span>
        </div>
      ) : null}
      <MediaWallScrollSpacer height={spacerHeight} />
    </div>
  );
};
