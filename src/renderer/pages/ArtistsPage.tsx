import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, UIEvent } from 'react';
import { ChevronDown, Play, RefreshCw, Search } from 'lucide-react';
import type { LibraryArtist, LibrarySort } from '../../shared/types/library';
import { ArtistDetailView } from '../components/artist/ArtistDetailView';
import { artistMark } from '../components/artist/artistVisual';

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
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);

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
      void loadArtists(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadArtists]);

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

  const handleArtistWallScroll = useCallback(
    (event: UIEvent<HTMLElement>): void => {
      if (isLoadingRef.current || !hasMore) {
        return;
      }

      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

      if (distanceToBottom < 360) {
        void loadArtists(page + 1, 'append');
      }
    },
    [hasMore, loadArtists, page],
  );

  const handleRefresh = useCallback((): void => {
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

  const handleArtistKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, artist: LibraryArtist): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedArtist(artist);
    }
  }, []);

  if (selectedArtist) {
    return <ArtistDetailView artist={selectedArtist} onBack={() => setSelectedArtist(null)} />;
  }

  return (
    <div className="artists-page">
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

      <section className="artist-wall" aria-label="Artist list" onScroll={handleArtistWallScroll}>
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
              onClick={() => setSelectedArtist(artist)}
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

      {error || isLoading ? (
        <div className="list-footer">
          <span>{error ?? 'Loading artists...'}</span>
        </div>
      ) : null}
    </div>
  );
};
