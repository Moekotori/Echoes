import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ListPlus, Play, Shuffle } from 'lucide-react';
import type { LibraryAlbum, LibraryArtist, LibraryTrack } from '../../../shared/types/library';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { AlbumDetailView } from '../album/AlbumDetailView';
import { readPageScrollTop, writePageScrollTop } from '../ui/InfiniteScrollSentinel';
import { ArtistAlbumGrid } from './ArtistAlbumGrid';
import { ArtistTrackList } from './ArtistTrackList';
import { artistMark } from './artistVisual';

type ArtistDetailViewProps = {
  artist: LibraryArtist;
  onBack: () => void;
};

const formatCount = (count: number, singular: string): string => `${count} ${count === 1 ? singular : `${singular}s`}`;

const formatDuration = (tracks: LibraryTrack[]): string => {
  const totalSeconds = tracks.reduce((total, track) => total + (Number.isFinite(track.duration) ? track.duration : 0), 0);

  if (totalSeconds <= 0) {
    return 'Reading length';
  }

  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} hr ${rest} min loaded` : `${minutes} min loaded`;
};

export const ArtistDetailView = ({ artist, onBack }: ArtistDetailViewProps): JSX.Element => {
  const { appendToQueue, currentTrackId, playTrack, playTrackNext, replaceQueue } = usePlaybackQueue();
  const [verifiedArtist, setVerifiedArtist] = useState<LibraryArtist | null>(artist);
  const [isVerifyingArtist, setIsVerifyingArtist] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [loadedTracks, setLoadedTracks] = useState<LibraryTrack[]>([]);
  const [loadedTrackTotal, setLoadedTrackTotal] = useState(artist.trackCount);
  const [areTracksLoading, setAreTracksLoading] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<LibraryAlbum | null>(null);
  const detailRootRef = useRef<HTMLDivElement | null>(null);
  const detailScrollTopRef = useRef(0);
  const shouldRestoreDetailScrollRef = useRef(false);
  const source = useMemo(() => ({ type: 'artist' as const, label: artist.name, artistId: artist.id }), [artist.id, artist.name]);
  const displayArtist = verifiedArtist ?? artist;

  useEffect(() => {
    let isCancelled = false;

    const verifyArtist = async (): Promise<void> => {
      const library = window.echo?.library;

      if (!library?.getArtist) {
        setVerifyError('Desktop bridge unavailable. Open ECHO Next in Electron to read this artist.');
        return;
      }

      setIsVerifyingArtist(true);
      setVerifyError(null);

      try {
        const result = await library.getArtist(artist.id);

        if (!isCancelled) {
          setVerifiedArtist(result);
        }
      } catch (error) {
        if (!isCancelled) {
          setVerifyError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!isCancelled) {
          setIsVerifyingArtist(false);
        }
      }
    };

    void verifyArtist();

    return () => {
      isCancelled = true;
    };
  }, [artist.id]);

  useEffect(() => {
    setSelectedAlbum(null);
  }, [artist.id]);

  useLayoutEffect(() => {
    if (selectedAlbum || !shouldRestoreDetailScrollRef.current) {
      return;
    }

    writePageScrollTop(detailRootRef.current, detailScrollTopRef.current);
    shouldRestoreDetailScrollRef.current = false;
  }, [selectedAlbum]);

  const handleLoadedTracksChange = useCallback((tracks: LibraryTrack[], total: number, isLoading: boolean): void => {
    setLoadedTracks(tracks);
    setLoadedTrackTotal(total);
    setAreTracksLoading(isLoading);
  }, []);

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      try {
        setPlayError(null);
        const contextTracks = loadedTracks.length > 0 ? loadedTracks : [track];
        await playTrack(track, {
          replaceQueueWith: contextTracks,
          source,
        });
      } catch (error) {
        setPlayError(error instanceof Error ? error.message : String(error));
      }
    },
    [loadedTracks, playTrack, source],
  );

  const handlePlayArtist = useCallback(async (): Promise<void> => {
    const firstTrack = loadedTracks[0];

    if (!firstTrack) {
      return;
    }

    try {
      setPlayError(null);
      replaceQueue(loadedTracks, { startTrackId: firstTrack.id, source });
      await playTrack(firstTrack, { source });
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : String(error));
    }
  }, [loadedTracks, playTrack, replaceQueue, source]);

  const handleShuffleArtist = useCallback(async (): Promise<void> => {
    if (loadedTracks.length === 0) {
      return;
    }

    const startTrack = loadedTracks[Math.floor(Math.random() * loadedTracks.length)];

    try {
      setPlayError(null);
      replaceQueue(loadedTracks, { startTrackId: startTrack.id, source });
      await playTrack(startTrack, { source });
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : String(error));
    }
  }, [loadedTracks, playTrack, replaceQueue, source]);

  const handleQueueArtist = useCallback((): void => {
    loadedTracks.forEach((track) => appendToQueue(track, source));
  }, [appendToQueue, loadedTracks, source]);

  const handleAppendTrack = useCallback((track: LibraryTrack): void => appendToQueue(track, source), [appendToQueue, source]);
  const handlePlayTrackNext = useCallback((track: LibraryTrack): void => playTrackNext(track, source), [playTrackNext, source]);
  const handleSelectAlbum = useCallback((album: LibraryAlbum): void => {
    detailScrollTopRef.current = readPageScrollTop(detailRootRef.current);
    shouldRestoreDetailScrollRef.current = true;
    setSelectedAlbum(album);
  }, []);
  const canPlay = loadedTracks.length > 0;

  if (selectedAlbum) {
    return <AlbumDetailView album={selectedAlbum} onBack={() => setSelectedAlbum(null)} />;
  }

  if (!isVerifyingArtist && !verifiedArtist) {
    return (
      <div className="artist-detail-page">
        <button className="artist-detail-back" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          Artists
        </button>
        <section className="artist-detail-missing">
          <h1>艺术家不存在或已从曲库移除。</h1>
          <p>Return to Artists and refresh the library to see the latest catalog.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="artist-detail-page" ref={detailRootRef}>
      <button className="artist-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        Artists
      </button>

      <section className="artist-hero" aria-label={`${displayArtist.name} artist details`}>
        <div className="artist-hero-avatar" aria-hidden="true">
          <span>{artistMark(displayArtist.name)}</span>
        </div>

        <div className="artist-hero-copy">
          <span className="artist-detail-kicker">Artist</span>
          <h1>{displayArtist.name}</h1>
          <div className="artist-hero-meta" aria-label="Artist metadata">
            <span>{formatCount(displayArtist.trackCount, 'track')}</span>
            <span>{formatCount(displayArtist.albumCount, 'album')}</span>
            <span>{loadedTracks.length > 0 ? `${loadedTracks.length}/${loadedTrackTotal} loaded` : 'Collected locally'}</span>
          </div>
          <p>Collected from your local library.</p>

          <div className="artist-hero-actions">
            <button className="artist-primary-action" type="button" disabled={!canPlay || areTracksLoading} onClick={() => void handlePlayArtist()}>
              <Play size={16} fill="currentColor" />
              {areTracksLoading && !canPlay ? 'Reading Artist' : 'Play Artist'}
            </button>
            <button className="artist-secondary-action" type="button" disabled={!canPlay} onClick={() => void handleShuffleArtist()}>
              <Shuffle size={16} />
              Shuffle
            </button>
            <button className="artist-secondary-action" type="button" disabled={!canPlay} onClick={handleQueueArtist}>
              <ListPlus size={16} />
              Add to Queue
            </button>
          </div>

          {playError || verifyError ? <p className="artist-detail-error">{playError ?? verifyError}</p> : null}
        </div>
      </section>

      <section className="artist-stat-grid" aria-label="Artist overview">
        <div>
          <span>Tracks</span>
          <strong>{formatCount(displayArtist.trackCount, 'track')}</strong>
        </div>
        <div>
          <span>Albums</span>
          <strong>{formatCount(displayArtist.albumCount, 'album')}</strong>
        </div>
        <div>
          <span>Loaded Queue</span>
          <strong>{loadedTracks.length > 0 ? formatDuration(loadedTracks) : 'Ready soon'}</strong>
        </div>
      </section>

      <ArtistAlbumGrid artistId={displayArtist.id} artistName={displayArtist.name} onAlbumSelect={handleSelectAlbum} />

      <ArtistTrackList
        artistId={displayArtist.id}
        artistName={displayArtist.name}
        currentTrackId={currentTrackId}
        onAppendToQueue={handleAppendTrack}
        onLoadedTracksChange={handleLoadedTracksChange}
        onOpenAlbum={handleSelectAlbum}
        onPlayNext={handlePlayTrackNext}
        onPlayTrack={handlePlayTrack}
      />
    </div>
  );
};
