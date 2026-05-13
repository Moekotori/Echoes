import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Disc3 } from 'lucide-react';
import type { LibraryAlbum, LibraryPage } from '../../../shared/types/library';

type ArtistAlbumGridProps = {
  artistId: string;
  artistName: string;
  onAlbumSelect: (album: LibraryAlbum) => void;
};

const pageSize = 12;

export const ArtistAlbumGrid = ({ artistId, artistName, onAlbumSelect }: ArtistAlbumGridProps): JSX.Element => {
  const [albums, setAlbums] = useState<LibraryAlbum[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>({});
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);

  const loadAlbums = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
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

        if (!library?.getArtistAlbums) {
          setAlbums([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read artist albums.');
          return;
        }

        const result: LibraryPage<LibraryAlbum> = await library.getArtistAlbums(artistId, {
          page: nextPage,
          pageSize,
          sort: 'recent',
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
    [artistId],
  );

  useEffect(() => {
    setAlbums([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    void loadAlbums(1, 'replace');
  }, [loadAlbums]);

  const handleCoverError = useCallback((album: LibraryAlbum): void => {
    if (!album.coverThumb) {
      return;
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

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingRef.current && hasMore) {
      void loadAlbums(page + 1, 'append');
    }
  }, [hasMore, loadAlbums, page]);

  const handleAlbumKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, album: LibraryAlbum): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onAlbumSelect(album);
      }
    },
    [onAlbumSelect],
  );

  if (!isLoading && albums.length === 0 && !error) {
    return (
      <section className="artist-section artist-section-muted" aria-label={`${artistName} albums`}>
        <header>
          <div>
            <span>Albums</span>
            <h2>Albums by {artistName}</h2>
          </div>
        </header>
        <p className="artist-detail-empty">No albums are grouped under this artist yet.</p>
      </section>
    );
  }

  return (
    <section className="artist-section" aria-label={`${artistName} albums`}>
      <header>
        <div>
          <span>Albums</span>
          <h2>Albums by {artistName}</h2>
        </div>
        <small>{albums.length === total ? `${total} albums` : `${albums.length} of ${total} albums`}</small>
      </header>

      <div className="artist-album-strip">
        {albums.map((album) => {
          const shouldShowCover = Boolean(album.coverThumb && failedCoverUrls[album.id] !== album.coverThumb);

          return (
            <article
              className="artist-album-card"
              key={album.id}
              role="button"
              tabIndex={0}
              onClick={() => onAlbumSelect(album)}
              onKeyDown={(event) => handleAlbumKeyDown(event, album)}
            >
              <div className="artist-album-cover" data-empty={!shouldShowCover} aria-hidden="true">
                {shouldShowCover ? (
                  <img
                    alt=""
                    decoding="async"
                    draggable={false}
                    height={320}
                    loading="lazy"
                    src={album.coverThumb!}
                    width={320}
                    onError={() => handleCoverError(album)}
                  />
                ) : (
                  <Disc3 size={24} />
                )}
              </div>
              <div className="artist-album-copy">
                <strong>{album.title}</strong>
                <span>{[album.year ? String(album.year) : null, `${album.trackCount} tracks`].filter(Boolean).join(' / ')}</span>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore ? (
        <button className="artist-load-more" type="button" disabled={isLoading} onClick={handleLoadMore}>
          {isLoading ? 'Loading...' : 'Load more albums'}
        </button>
      ) : null}
      {error ? <p className="artist-detail-error">{error}</p> : null}
    </section>
  );
};
