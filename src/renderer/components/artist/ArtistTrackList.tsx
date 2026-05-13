import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Disc3, ListPlus, MoreHorizontal, Play, SkipForward } from 'lucide-react';
import type { EditableTrackTags, LibraryAlbum, LibraryPage, LibraryTrack } from '../../../shared/types/library';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { TrackContextMenu } from '../library/TrackContextMenu';
import type { TrackMenuAction } from '../library/TrackContextMenu';
import { TrackTagEditorDrawer } from '../library/TrackTagEditorDrawer';

type ArtistTrackListProps = {
  artistId: string;
  currentTrackId: string | null;
  onAppendToQueue: (track: LibraryTrack) => void;
  onLoadedTracksChange?: (tracks: LibraryTrack[], total: number, isLoading: boolean) => void;
  onOpenAlbum: (album: LibraryAlbum) => void;
  onPlayNext: (track: LibraryTrack) => void;
  onPlayTrack: (track: LibraryTrack) => void | Promise<void>;
};

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

const pageSize = 50;

const formatDuration = (duration: number): string => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatSampleRate = (sampleRate: number | null): string | null => {
  if (!sampleRate) {
    return null;
  }

  const khz = sampleRate / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)}kHz`;
};

const technicalTags = (track: LibraryTrack): string[] =>
  [track.codec?.toUpperCase() ?? null, track.bitDepth ? `${track.bitDepth}bit` : null, formatSampleRate(track.sampleRate)].filter(
    (tag): tag is string => Boolean(tag),
  );

export const ArtistTrackList = ({
  artistId,
  currentTrackId,
  onAppendToQueue,
  onLoadedTracksChange,
  onOpenAlbum,
  onPlayNext,
  onPlayTrack,
}: ArtistTrackListProps): JSX.Element => {
  const { items: queueItems, removeQueueItem } = usePlaybackQueue();
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const tagEditorCloseTimerRef = useRef<number | null>(null);

  const loadTracks = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      if (mode === 'append' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      setStatusMessage(null);

      try {
        const library = window.echo?.library;

        if (!library?.getArtistTracks) {
          setTracks([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read artist tracks.');
          return;
        }

        const result: LibraryPage<LibraryTrack> = await library.getArtistTracks(artistId, {
          page: nextPage,
          pageSize,
          sort: 'default',
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
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [artistId],
  );

  useEffect(() => {
    setTracks([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    onLoadedTracksChange?.(tracks, total, isLoading);
  }, [isLoading, onLoadedTracksChange, total, tracks]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingRef.current && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, loadTracks, page]);

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>, track: LibraryTrack): void => {
      event.preventDefault();
      event.stopPropagation();
      handleOpenTrackMenu(track, { x: event.clientX, y: event.clientY });
    },
    [handleOpenTrackMenu],
  );

  const handleMoreClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, track: LibraryTrack): void => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      handleOpenTrackMenu(track, { x: rect.right - 12, y: rect.bottom + 8 });
    },
    [handleOpenTrackMenu],
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

  const handleGoToAlbum = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      const library = window.echo?.library;

      if (!library?.getArtistAlbums) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to locate this album.');
        return;
      }

      const result = await library.getArtistAlbums(artistId, {
        page: 1,
        pageSize: 1000,
        sort: 'default',
      });
      const trackAlbum = track.album.trim().toLocaleLowerCase();
      const album = result.items.find((item) => item.title.trim().toLocaleLowerCase() === trackAlbum);

      if (album) {
        onOpenAlbum(album);
        return;
      }

      setStatusMessage(`Album not found in this artist view: ${track.album || 'Unknown Album'}`);
    },
    [artistId, onOpenAlbum],
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
        setStatusMessage(null);

        switch (action) {
          case 'play-next':
            onPlayNext(track);
            return;
          case 'add-to-queue':
            onAppendToQueue(track);
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
            await handleGoToAlbum(track);
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
              setError('This track does not have cover art to copy.');
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setError('No cover art was saved for this track.');
            }
            return;
          case 'delete-song':
            if (!window.confirm(`Delete the music file?\n${track.title}`)) {
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
                const choice = window.prompt(`Choose playlist number:\n${names}`, '1');
                const index = Number(choice) - 1;
                playlist = Number.isInteger(index) ? playlists[index] ?? null : null;
              }

              if (!playlist) {
                const name = window.prompt('No playlists yet. Enter a name to create one:');
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
              setStatusMessage(`Added to playlist: ${playlist.name}`);
            }
            return;
          default:
            setError('This track action is not available yet.');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [handleGoToAlbum, onAppendToQueue, onPlayNext, queueItems, removeQueueItem],
  );

  return (
    <section className="artist-section artist-track-section" aria-label="Songs by artist">
      <header>
        <div>
          <span>Songs</span>
          <h2>Songs by Artist</h2>
        </div>
        <small>{tracks.length === total ? `${total} tracks` : `${tracks.length} of ${total} tracks`}</small>
      </header>

      <div className="artist-track-list" role="list">
        {tracks.length > 0 ? (
          <div className="artist-track-header" aria-hidden="true">
            <span>Title</span>
            <span>Album</span>
            <span>Signal</span>
            <span>Time</span>
            <span>Actions</span>
          </div>
        ) : null}

        {tracks.map((track) => {
          const isPlaying = track.id === currentTrackId;
          const tags = technicalTags(track);

          return (
            <div
              className="artist-track-row"
              data-playing={isPlaying}
              key={track.id}
              role="listitem"
              onContextMenu={(event) => handleTrackContextMenu(event, track)}
            >
              <button className="artist-track-main" type="button" onClick={() => void onPlayTrack(track)}>
                <span className="artist-track-cover" data-empty={!track.coverThumb} aria-hidden="true">
                  {track.coverThumb ? (
                    <img alt="" decoding="async" draggable={false} height={48} loading="lazy" src={track.coverThumb} width={48} />
                  ) : (
                    <Disc3 size={17} />
                  )}
                  <Play className="artist-track-play" size={13} fill="currentColor" aria-hidden="true" />
                </span>
                <span className="artist-track-copy">
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
              <span className="artist-track-album">{track.album || 'Unknown Album'}</span>
              <span className="artist-track-tags" aria-label="Track format">
                {tags.length > 0 ? tags.map((tag) => <em key={`${track.id}-${tag}`}>{tag}</em>) : <em>Local</em>}
              </span>
              <span className="artist-track-duration">{formatDuration(track.duration)}</span>
              <span className="artist-track-actions">
                <button type="button" aria-label={`Play ${track.title} next`} title="Play next" onClick={() => onPlayNext(track)}>
                  <SkipForward size={15} />
                </button>
                <button type="button" aria-label={`Add ${track.title} to queue`} title="Add to queue" onClick={() => onAppendToQueue(track)}>
                  <ListPlus size={15} />
                </button>
                <button type="button" aria-label={`More actions for ${track.title}`} title="More" onClick={(event) => handleMoreClick(event, track)}>
                  <MoreHorizontal size={15} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <button className="artist-load-more" type="button" disabled={isLoading} onClick={handleLoadMore}>
          {isLoading ? 'Loading...' : 'Load more songs'}
        </button>
      ) : null}
      {error ? <p className="artist-detail-error">{error}</p> : null}
      {statusMessage ? <p className="artist-detail-status">{statusMessage}</p> : null}
      {!isLoading && tracks.length === 0 && !error ? <p className="artist-detail-empty">No songs are grouped under this artist yet.</p> : null}
      {isLoading && tracks.length === 0 ? <p className="artist-detail-loading">Loading songs...</p> : null}

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
    </section>
  );
};
