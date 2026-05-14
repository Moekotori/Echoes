import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, Play, RefreshCw, Search } from 'lucide-react';
import type { LibraryArtist, LibrarySort } from '../../shared/types/library';
import { ArtistDetailView } from '../components/artist/ArtistDetailView';
import { artistMark } from '../components/artist/artistVisual';
import { InfiniteScrollSentinel, readPageScrollTop, writePageScrollTop } from '../components/ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../components/ui/MediaWallScrollSpacer';

const pageSize = 96;

const artistMeta = (artist: LibraryArtist): string => {
  const parts: string[] = [];

  if (artist.trackCount > 0) {
    parts.push(`${artist.trackCount} tracks`);
  }

  if (artist.albumCount > 0) {
    parts.push(`${artist.albumCount} albums`);
  }

  return parts.join(' / ') || 'No tracks';
};

export const ArtistsPage = (): JSX.Element => {
  const [artists, setArtists] = useState<LibraryArtist[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<LibraryArtist | null>(null);
  const [artistWallAlbumArtwork, setArtistWallAlbumArtwork] = useState(false);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pageScrollTopRef = useRef(0);
  const shouldRestorePageScrollRef = useRef(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const { wallRef: artistWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLElement>({
    itemCount: artists.length,
    totalCount: total,
    minColumnWidth: 128,
    columnGap: 22,
    rowGap: 30,
    estimatedItemHeight: 174,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadArtists = useCallback(
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

        if (!library?.getArtists) {
          setArtists([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read artists.');
          return;
        }

        const result = await library.getArtists({
          page: nextPage,
          pageSize,
          search,
          sort,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setArtists((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
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
    void loadArtists(1, 'replace');
  }, [loadArtists]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      writePageScrollTop(pageRootRef.current, 0);
      void loadArtists(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadArtists]);

  useLayoutEffect(() => {
    writePageScrollTop(pageRootRef.current, 0);
  }, [search, sort]);

  useLayoutEffect(() => {
    if (selectedArtist || !shouldRestorePageScrollRef.current) {
      return;
    }

    writePageScrollTop(pageRootRef.current, pageScrollTopRef.current);
    shouldRestorePageScrollRef.current = false;
  }, [selectedArtist]);

  useEffect(() => {
    const loadSettings = (): void => {
      const app = window.echo?.app;

      if (!app?.getSettings) {
        setArtistWallAlbumArtwork(false);
        return;
      }

      void app
        .getSettings()
        .then((settings) => setArtistWallAlbumArtwork(settings.artistWallAlbumArtwork === true))
        .catch(() => setArtistWallAlbumArtwork(false));
    };

    loadSettings();
    window.addEventListener('settings:changed', loadSettings);
    return () => window.removeEventListener('settings:changed', loadSettings);
  }, []);

  const handleLoadMoreArtists = useCallback((): void => {
    if (isLoadingRef.current || !hasMore) {
      return;
    }

    void loadArtists(page + 1, 'append');
  }, [hasMore, loadArtists, page]);

  const handleRefresh = useCallback((): void => {
    writePageScrollTop(pageRootRef.current, 0);
    void loadArtists(1, 'replace');
  }, [loadArtists]);

  const handleArtistCoverError = useCallback((artist: LibraryArtist): void => {
    if (!artist.coverThumb) {
      return;
    }

    setFailedCoverUrls((current) =>
      current[artist.id] === artist.coverThumb
        ? current
        : {
            ...current,
            [artist.id]: artist.coverThumb!,
          },
    );
  }, []);

  const openArtistDetail = useCallback((artist: LibraryArtist): void => {
    pageScrollTopRef.current = readPageScrollTop(pageRootRef.current);
    shouldRestorePageScrollRef.current = true;
    setSelectedArtist(artist);
  }, []);

  const handleArtistKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, artist: LibraryArtist): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openArtistDetail(artist);
    }
  }, [openArtistDetail]);

  if (selectedArtist) {
    return <ArtistDetailView artist={selectedArtist} onBack={() => setSelectedArtist(null)} />;
  }

  return (
    <div ref={pageRootRef} className="artists-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>Artists</h1>
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
            placeholder="Search artists"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label className="sort-button sort-select">
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="default">Default</option>
            <option value="titleAsc">Name A-Z</option>
            <option value="titleDesc">Name Z-A</option>
            <option value="frequent">Most Tracks</option>
            <option value="createdAsc">Created Oldest</option>
            <option value="createdDesc">Created Newest</option>
            <option value="random">Random</option>
          </select>
          <ChevronDown size={15} />
        </label>
      </div>

      <section ref={artistWallRef} className="artist-wall" aria-label="Artist list">
        {artists.map((artist) => {
          const shouldShowCover = Boolean(
            artistWallAlbumArtwork && artist.coverThumb && failedCoverUrls[artist.id] !== artist.coverThumb,
          );

          return (
            <article
              className="artist-card"
              data-cover={shouldShowCover}
              key={artist.id}
              role="button"
              tabIndex={0}
              onClick={() => openArtistDetail(artist)}
              onKeyDown={(event) => handleArtistKeyDown(event, artist)}
            >
              <div className="artist-avatar" data-cover={shouldShowCover} aria-hidden="true">
                {shouldShowCover ? (
                  <img
                    alt=""
                    decoding="async"
                    draggable={false}
                    height={320}
                    loading="lazy"
                    src={artist.coverThumb!}
                    width={320}
                    onError={() => handleArtistCoverError(artist)}
                  />
                ) : (
                  <span>{artistMark(artist.name)}</span>
                )}
              </div>
              <div className="artist-copy">
                <strong>{artist.name}</strong>
                <small>{artistMeta(artist)}</small>
              </div>
              <span className="artist-card-action" aria-hidden="true">
                <Play size={14} fill="currentColor" />
              </span>
            </article>
          );
        })}
      </section>
      <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMoreArtists} />

      {error || isLoading ? (
        <div className="list-footer">
          <span>{error ?? 'Loading artists...'}</span>
        </div>
      ) : null}
      <MediaWallScrollSpacer height={spacerHeight} />
    </div>
  );
};
