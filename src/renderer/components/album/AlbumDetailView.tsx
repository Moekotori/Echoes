import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Disc3, Heart, MoreHorizontal, Play } from 'lucide-react';
import type { LibraryAlbum, LibraryTrack } from '../../../shared/types/library';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { AlbumTrackList } from './AlbumTrackList';

type AlbumDetailViewProps = {
  album: LibraryAlbum;
  onBack: () => void;
};

const formatDuration = (duration: number): string | null => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const totalMinutes = Math.round(duration / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours} hr ${minutes} min` : `${totalMinutes} min`;
};

const formatSampleRate = (sampleRate: number | null): string | null => {
  if (!sampleRate) {
    return null;
  }

  if (sampleRate >= 1000) {
    const khz = sampleRate / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)}kHz`;
  }

  return `${sampleRate}Hz`;
};

const formatBitrate = (bitrate: number | null): string | null => {
  if (!bitrate || !Number.isFinite(bitrate)) {
    return null;
  }

  return bitrate >= 1000000 ? `${(bitrate / 1000000).toFixed(1)}Mbps` : `${Math.round(bitrate / 1000)}kbps`;
};

const formatTechnicalSummary = (track: LibraryTrack | null): string | null => {
  if (!track) {
    return null;
  }

  return [
    track.codec?.toUpperCase() ?? null,
    track.bitDepth ? `${track.bitDepth}bit` : null,
    formatSampleRate(track.sampleRate),
  ]
    .filter(Boolean)
    .join(' / ') || null;
};

const uniqueValues = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));

const formatTrackCount = (count: number): string => `${count} ${count === 1 ? 'track' : 'tracks'}`;

export const AlbumDetailView = ({ album, onBack }: AlbumDetailViewProps): JSX.Element => {
  const { currentTrackId, playTrack, replaceQueue } = usePlaybackQueue();
  const [firstTrack, setFirstTrack] = useState<LibraryTrack | null>(null);
  const [loadedTracks, setLoadedTracks] = useState<LibraryTrack[]>([]);
  const [loadedTotal, setLoadedTotal] = useState(0);
  const [isLoadingFirstTrack, setIsLoadingFirstTrack] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [coverLarge, setCoverLarge] = useState<string | null>(null);
  const [failedLargeCover, setFailedLargeCover] = useState(false);
  const [failedThumbCover, setFailedThumbCover] = useState(false);
  const duration = formatDuration(album.duration);
  const formatSummary = formatTechnicalSummary(firstTrack);
  const albumMetadata = useMemo(
    () =>
      [
        album.year ? String(album.year) : null,
        formatTrackCount(album.trackCount),
        duration,
        formatSummary,
      ].filter((item): item is string => Boolean(item)),
    [album.trackCount, album.year, duration, formatSummary],
  );
  const signalItems = useMemo(
    () =>
      firstTrack
        ? [
            firstTrack.codec?.toUpperCase() ?? null,
            firstTrack.bitDepth ? `${firstTrack.bitDepth}bit` : null,
            formatSampleRate(firstTrack.sampleRate),
            formatBitrate(firstTrack.bitrate),
          ].filter((item): item is string => Boolean(item))
        : [],
    [firstTrack],
  );
  const textureItems = useMemo(() => {
    const genres = uniqueValues(loadedTracks.map((track) => track.genre)).slice(0, 3);
    const discs = new Set(loadedTracks.map((track) => track.discNo).filter((discNo): discNo is number => Boolean(discNo && discNo > 0)));

    return [
      ...genres,
      discs.size > 1 ? `${discs.size} discs` : null,
      loadedTotal > loadedTracks.length ? `${loadedTracks.length} loaded` : null,
    ].filter((item): item is string => Boolean(item));
  }, [loadedTotal, loadedTracks]);
  const albumFacts = useMemo(
    () => [
      { label: 'Format', value: signalItems.join(' / ') || 'Reading signal' },
      { label: 'Genre', value: textureItems[0] ?? 'Unknown genre' },
      { label: 'Released', value: album.year ? String(album.year) : 'Unknown year' },
      { label: 'Library', value: `${loadedTotal > 0 ? `${loadedTracks.length}/${loadedTotal}` : formatTrackCount(album.trackCount)} ready` },
    ],
    [album.trackCount, album.year, loadedTotal, loadedTracks.length, signalItems, textureItems],
  );
  const albumSource = useMemo(
    () => ({ type: 'album' as const, label: album.title, albumId: album.id }),
    [album.id, album.title],
  );
  const detailCoverSrc = coverLarge && !failedLargeCover ? coverLarge : failedThumbCover ? null : album.coverThumb;

  useEffect(() => {
    let isMounted = true;

    setCoverLarge(null);
    setFailedLargeCover(false);
    setFailedThumbCover(false);

    window.echo.library
      .getAlbum(album.id)
      .then((detail) => {
        if (isMounted) {
          setCoverLarge(detail?.coverLarge ?? null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCoverLarge(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [album.id]);

  const handleFirstTrackChange = useCallback((track: LibraryTrack | null, isLoading: boolean): void => {
    setFirstTrack(track);
    setIsLoadingFirstTrack(isLoading);
  }, []);

  const handleLoadedTracksChange = useCallback((tracks: LibraryTrack[], total: number, isLoading: boolean): void => {
    setLoadedTracks(tracks);
    setLoadedTotal(total);
    setFirstTrack(tracks[0] ?? null);
    setIsLoadingFirstTrack(isLoading && tracks.length === 0);
  }, []);

  const withAlbumCoverFallback = useCallback(
    (track: LibraryTrack): LibraryTrack => (track.coverThumb || !album.coverThumb ? track : { ...track, coverThumb: album.coverThumb }),
    [album.coverThumb],
  );

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      try {
        setPlayError(null);
        const playableTracks = (loadedTracks.length > 0 ? loadedTracks : [track]).map(withAlbumCoverFallback);
        await playTrack(withAlbumCoverFallback(track), {
          replaceQueueWith: playableTracks,
          source: albumSource,
        });
      } catch (error) {
        setPlayError(error instanceof Error ? error.message : String(error));
      }
    },
    [albumSource, loadedTracks, playTrack, withAlbumCoverFallback],
  );

  const handlePlayNow = useCallback((): void => {
    if (firstTrack) {
      // TODO: load the complete album queue through LibraryService once that API can fetch all album tracks at once.
      const playableTracks = loadedTracks.length > 0 ? loadedTracks.map(withAlbumCoverFallback) : [withAlbumCoverFallback(firstTrack)];
      const firstPlayableTrack = playableTracks[0] ?? firstTrack;
      replaceQueue(playableTracks, { startTrackId: firstPlayableTrack.id, source: albumSource });
      void playTrack(firstPlayableTrack, { source: albumSource });
    }
  }, [albumSource, firstTrack, loadedTracks, playTrack, replaceQueue, withAlbumCoverFallback]);

  const handleDetailCoverError = useCallback((): void => {
    if (coverLarge && !failedLargeCover) {
      setFailedLargeCover(true);
      return;
    }

    setFailedThumbCover(true);
  }, [coverLarge, failedLargeCover]);

  return (
    <div className="album-detail-page">
      <button className="album-back-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        Albums
      </button>

      <section className="album-detail-hero" aria-label={`${album.title} album details`}>
        <div className="album-detail-cover" data-empty={!detailCoverSrc}>
          {detailCoverSrc ? (
            <img alt="" decoding="async" draggable={false} height={320} src={detailCoverSrc} width={320} onError={handleDetailCoverError} />
          ) : (
            <Disc3 size={58} />
          )}
        </div>

        <div className="album-detail-console">
          <div className="album-detail-copy">
            <span className="album-detail-kicker">Album</span>
            <h1>{album.title}</h1>
            <p>{album.albumArtist}</p>

            <div className="album-detail-meta" aria-label="Album metadata">
              {albumMetadata.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="album-detail-actions">
            <button className="album-primary-action" type="button" disabled={!firstTrack || isLoadingFirstTrack} onClick={handlePlayNow}>
              <Play size={16} fill="currentColor" />
              {isLoadingFirstTrack ? 'Reading album' : 'Play Now'}
            </button>
            <button className="album-icon-action" type="button" aria-label="Like album" title="Like album">
              <Heart size={16} />
            </button>
            <button className="album-icon-action" type="button" aria-label="More album actions" title="More album actions">
              <MoreHorizontal size={17} />
            </button>
          </div>

          {playError ? <p className="album-detail-error">{playError}</p> : null}
        </div>

        <aside className="album-detail-facts" aria-label="Album info">
          {albumFacts.map((fact) => (
            <div className="album-fact" key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </aside>
      </section>

      <section className="album-detail-track-console" aria-label={`${album.title} track console`}>
        <header className="album-detail-tabs" aria-label="Album sections">
          <button className="album-detail-tab" type="button" aria-current="page">
            Tracks
          </button>
          <button className="album-detail-tab" type="button">
            Credits
          </button>
          <button className="album-detail-tab" type="button">
            Related
          </button>
        </header>
        <AlbumTrackList
          albumId={album.id}
          currentTrackId={currentTrackId}
          summary={{
            duration: duration ?? 'Unknown length',
            signal: formatSummary ?? 'Reading signal',
            totalLabel: loadedTotal > 0 ? formatTrackCount(loadedTotal) : formatTrackCount(album.trackCount),
          }}
          onFirstTrackChange={handleFirstTrackChange}
          onLoadedTracksChange={handleLoadedTracksChange}
          onPlayTrack={handlePlayTrack}
        />
      </section>
    </div>
  );
};
