import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Disc3,
  FolderOpen,
  GripVertical,
  Heart,
  History,
  MinusCircle,
  MoreHorizontal,
  Music2,
  Play,
  Repeat1,
  Repeat2,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type { EditableTrackTags, LibraryPlaylist, LibraryTrack, PlaybackHistoryEntry } from '../../shared/types/library';
import { likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../hooks/useLikedMedia';
import { usePlaybackFollowCurrentTrack } from '../hooks/usePlaybackFollowCurrentTrack';
import type { QueueItem, RepeatMode } from '../stores/PlaybackQueueProvider';
import { useI18n } from '../i18n/I18nProvider';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';
import { resolvePlaylistForTrackAdd } from '../utils/appPrompt';
import { OsuTimingPanel } from '../components/library/OsuTimingPanel';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';

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
  return sampleRate >= 1000 ? `${Number.isInteger(khz) ? khz : khz.toFixed(1)}kHz` : `${sampleRate}Hz`;
};

const formatBitrate = (bitrate: number | null): string | null => {
  if (!bitrate || !Number.isFinite(bitrate)) {
    return null;
  }

  return bitrate >= 1000000 ? `${(bitrate / 1000000).toFixed(1)}Mbps` : `${Math.round(bitrate / 1000)}kbps`;
};

const qualityTags = (track: LibraryTrack | null): string[] =>
  track
    ? [
        track.codec?.toUpperCase() ?? null,
        track.bitDepth ? `${track.bitDepth}bit` : null,
        formatSampleRate(track.sampleRate),
        formatBitrate(track.bitrate),
      ].filter((tag): tag is string => Boolean(tag))
    : [];

const trackFromHistory = (entry: PlaybackHistoryEntry): LibraryTrack => ({
  id: entry.stableKey ?? entry.trackId ?? entry.id,
  mediaType: entry.mediaType,
  path: entry.mediaType === 'streaming' ? entry.stableKey ?? entry.trackPath : entry.trackPath,
  provider: entry.provider,
  providerTrackId: entry.providerTrackId,
  stableKey: entry.stableKey,
  title: entry.title,
  artist: entry.artist,
  album: entry.album,
  albumArtist: entry.albumArtist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: entry.durationSnapshot ?? entry.durationSeconds,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: entry.coverId,
  coverThumb: entry.coverSnapshot ?? entry.coverThumb,
  fieldSources: {},
});

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

export const QueuePage = (): JSX.Element => {
  const { t } = useI18n();
  const queue = usePlaybackQueue();
  const followCurrentTrack = usePlaybackFollowCurrentTrack();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isGeneratingRandomQueue, setIsGeneratingRandomQueue] = useState(false);
  const [isGeneratingHistoryQueue, setIsGeneratingHistoryQueue] = useState(false);
  const [draggedQueueId, setDraggedQueueId] = useState<string | null>(null);
  const [dropTargetQueueId, setDropTargetQueueId] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [osuTimingTrack, setOsuTimingTrack] = useState<LibraryTrack | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const currentIndex = useMemo(
    () => (queue.currentQueueId ? queue.items.findIndex((item) => item.queueId === queue.currentQueueId) : -1),
    [queue.currentQueueId, queue.items],
  );
  const rows = useMemo(() => {
    if (queue.items.length === 0) {
      return [];
    }

    return currentIndex >= 0 ? queue.items.slice(currentIndex) : queue.items;
  }, [currentIndex, queue.items]);
  const upNextCount = currentIndex >= 0 ? Math.max(0, queue.items.length - currentIndex - 1) : queue.items.length;
  const nowPlaying = queue.currentTrack;
  const queueTrackIds = useMemo(() => queue.items.filter((item) => !item.track.isTemporary).map((item) => item.track.id), [queue.items]);
  const likedTrackIds = useLikedTrackIds(queueTrackIds);
  const isNowPlayingTemporary = nowPlaying?.isTemporary === true;
  const isNowPlayingLiked = nowPlaying && !isNowPlayingTemporary ? likedTrackIds[nowPlaying.id] === true : false;
  const nowPlayingTags = qualityTags(nowPlaying);
  const sourceLabel = queue.currentItem?.source.label ?? t('queue.now.sourceFallback');
  const queueMenuSource = useMemo(() => ({ type: 'manual' as const, label: t('queue.header.title') }), [t]);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => queueListRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

  useEffect(() => {
    if (!followCurrentTrack || !queue.currentQueueId || currentIndex < 0) {
      return;
    }

    rowVirtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' });
  }, [currentIndex, followCurrentTrack, queue.currentQueueId, rowVirtualizer]);
  const repeatLabels: Record<RepeatMode, string> = useMemo(
    () => ({
      off: t('queue.repeat.off'),
      one: t('queue.repeat.one'),
      all: t('queue.repeat.all'),
    }),
    [t],
  );

  const runQueueAction = useCallback(async (action: () => Promise<unknown> | unknown): Promise<void> => {
    try {
      setActionError(null);
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleOpenCurrentFolder = useCallback((): void => {
    if (!nowPlaying) {
      return;
    }

    void runQueueAction(() =>
      nowPlaying.isTemporary
        ? window.echo?.library?.openPathInFolder?.(nowPlaying.path)
        : window.echo?.library?.openTrackInFolder(nowPlaying.id),
    );
  }, [nowPlaying, runQueueAction]);

  const handleToggleNowPlayingLiked = useCallback((): void => {
    if (!nowPlaying || nowPlaying.isTemporary) {
      return;
    }

    void runQueueAction(async () => {
      await window.echo?.library?.toggleTrackLiked(nowPlaying.id);
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    });
  }, [nowPlaying, runQueueAction]);

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, track: LibraryTrack): void => {
      event.preventDefault();
      event.stopPropagation();
      handleOpenTrackMenu(track, { x: event.clientX, y: event.clientY });
    },
    [handleOpenTrackMenu],
  );

  const handleNowPlayingMoreClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      if (!nowPlaying) {
        return;
      }

      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      handleOpenTrackMenu(nowPlaying, { x: rect.right - 12, y: rect.bottom + 8 });
    },
    [handleOpenTrackMenu, nowPlaying],
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
        queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
        window.dispatchEvent(new Event('library:changed'));
        closeTagEditor();
      } catch (saveError) {
        setTagEditorError(saveError instanceof Error ? saveError.message : String(saveError));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor, queue],
  );

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'open-osu-timing' && action !== 'reload-embedded-tags') {
        setActionError('Desktop bridge unavailable. Open ECHO Next in Electron to use file actions.');
        return;
      }

      try {
        setActionError(null);

        if (
          (track.mediaType === 'remote' || track.isTemporary) &&
          (action === 'edit-tags' ||
            action === 'reload-embedded-tags' ||
            action === 'open-osu-timing' ||
            action === 'copy-path' ||
            action === 'open-system' ||
            action === 'copy-cover' ||
            action === 'save-cover' ||
            action === 'delete-song')
        ) {
          setActionError('This queued item does not support library file actions.');
          return;
        }

        switch (action) {
          case 'play-next':
            queue.playTrackNext(track, queueMenuSource);
            return;
          case 'add-to-queue':
            queue.appendToQueue(track, queueMenuSource);
            return;
          case 'toggle-liked':
            if (track.isTemporary) {
              setActionError('Temporary local files cannot be liked until they are imported.');
              return;
            }
            await library?.toggleTrackLiked(track.id);
            window.dispatchEvent(new Event(likedTracksChangedEvent));
            window.dispatchEvent(new Event(likedChangedEvent));
            return;
          case 'remove-from-queue':
            queue.removeTrackFromQueue(track.id);
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
              queue.updateTrackSnapshot(result.track.id, result.track);
              if (editingTrack?.id === result.track.id) {
                setEditingTrack(result.track);
              }
              setActionError(null);
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'go-to-album':
            if (!(await openAlbumDetailForTrack(track))) {
              setActionError(`Album not found: ${track.album || 'Unknown Album'}`);
            }
            return;
          case 'show-in-folder':
            if (track.isTemporary) {
              await library?.openPathInFolder?.(track.path);
              return;
            }
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
              setActionError('This track does not have cover art to copy.');
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setActionError('No cover art was saved for this track.');
            }
            return;
          case 'delete-song':
            if (!window.confirm(`Delete the music file?\n${track.title}`)) {
              return;
            }
            await library?.deleteTrackFile(track.id);
            queue.removeTrackFromQueue(track.id);
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
            }
            return;
          default:
            setActionError('This track action is not available yet.');
        }
      } catch (actionError) {
        setActionError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [editingTrack, queue, queueMenuSource],
  );

  const handlePlayItemNext = useCallback(
    (item: QueueItem): void => {
      const fromIndex = queue.items.findIndex((queuedItem) => queuedItem.queueId === item.queueId);
      const activeIndex = queue.currentQueueId ? queue.items.findIndex((queuedItem) => queuedItem.queueId === queue.currentQueueId) : -1;

      if (fromIndex < 0 || fromIndex === activeIndex) {
        return;
      }

      queue.moveQueueItem(fromIndex, activeIndex >= 0 ? (fromIndex < activeIndex ? activeIndex : activeIndex + 1) : 0);
    },
    [queue],
  );

  const handleGenerateRandomQueue = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setActionError(t('queue.error.desktopBridge'));
      return;
    }

    setIsGeneratingRandomQueue(true);
    setActionError(null);

    try {
      const result = await library.getTracks({
        page: 1,
        pageSize: 500,
        sort: 'random',
      });

      if (result.items.length === 0) {
        setActionError(t('queue.error.noRandomTracks'));
        return;
      }

      queue.replaceQueue(result.items, {
        source: { type: 'manual', label: t('queue.randomSource') },
      });
      queue.setRepeatMode('off');
      if (queue.isShuffleEnabled) {
        queue.toggleShuffle();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingRandomQueue(false);
    }
  }, [queue, t]);

  const handleGenerateHistoryQueue = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setActionError(t('queue.error.desktopBridge'));
      return;
    }

    setIsGeneratingHistoryQueue(true);
    setActionError(null);

    try {
      const result = await library.getPlaybackHistory({
        page: 1,
        pageSize: 500,
      });
      const tracks = result.items.map(trackFromHistory);

      if (tracks.length === 0) {
        setActionError(t('queue.error.noHistoryTracks'));
        return;
      }

      queue.replaceQueue(tracks, {
        source: { type: 'manual', label: t('queue.historySource') },
      });
      queue.setRepeatMode('off');
      if (queue.isShuffleEnabled) {
        queue.toggleShuffle();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingHistoryQueue(false);
    }
  }, [queue, t]);

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>, item: QueueItem): void => {
    setDraggedQueueId(item.queueId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.queueId);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, item: QueueItem): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetQueueId(item.queueId);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetItem: QueueItem): void => {
      event.preventDefault();
      const sourceQueueId = draggedQueueId ?? event.dataTransfer.getData('text/plain');

      setDraggedQueueId(null);
      setDropTargetQueueId(null);

      if (!sourceQueueId || sourceQueueId === targetItem.queueId) {
        return;
      }

      const fromIndex = queue.items.findIndex((item) => item.queueId === sourceQueueId);
      const toIndex = queue.items.findIndex((item) => item.queueId === targetItem.queueId);

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return;
      }

      queue.moveQueueItem(fromIndex, toIndex);
    },
    [draggedQueueId, queue],
  );

  const handleDragEnd = useCallback((): void => {
    setDraggedQueueId(null);
    setDropTargetQueueId(null);
  }, []);

  return (
    <div className="queue-page">
      <header className="queue-page-header">
        <div>
          <span className="queue-kicker">{t('queue.header.kicker')}</span>
          <h1>{t('queue.header.title')}</h1>
        </div>
        <span className="queue-count">{t('queue.count', { count: queue.items.length })}</span>
      </header>

      <section className="queue-now-card" aria-label={t('queue.now.kicker')}>
        <div className="queue-now-cover" data-empty={!nowPlaying?.coverThumb}>
          {nowPlaying?.coverThumb ? <img alt="" src={nowPlaying.coverThumb} /> : <Disc3 size={54} />}
        </div>

        <div className="queue-now-main">
          <span className="queue-kicker">{t('queue.now.kicker')}</span>
          <h2>{nowPlaying?.title ?? t('queue.now.emptyTitle')}</h2>
          <p>{nowPlaying ? `${nowPlaying.artist || t('queue.unknownArtist')} - ${nowPlaying.album || t('queue.unknownAlbum')}` : t('queue.now.emptyDescription')}</p>

          <div className="queue-quality-row" aria-label={t('queue.now.quality')}>
            {nowPlayingTags.length > 0 ? nowPlayingTags.map((tag) => <span key={tag}>{tag}</span>) : <span>{t('queue.now.waitingAudio')}</span>}
          </div>

          <div className="queue-now-meta">
            <span>{nowPlaying ? formatDuration(nowPlaying.duration) : '--:--'}</span>
            <span>{sourceLabel}</span>
          </div>
        </div>

        <div className="queue-now-actions" aria-label={t('queue.now.actions')}>
          <button
            className={`queue-icon-button ${isNowPlayingLiked ? 'is-liked' : ''}`}
            type="button"
            aria-label={t('queue.action.like')}
            aria-pressed={isNowPlayingLiked}
            title={t('queue.action.like')}
            disabled={!nowPlaying || isNowPlayingTemporary}
            onClick={handleToggleNowPlayingLiked}
          >
            <Heart size={17} fill={isNowPlayingLiked ? 'currentColor' : 'none'} />
          </button>
          <button
            className="queue-icon-button"
            type="button"
            aria-label={t('queue.action.openFolder')}
            title={t('queue.action.openFolder')}
            disabled={!nowPlaying}
            onClick={handleOpenCurrentFolder}
          >
            <FolderOpen size={17} />
          </button>
          <button
            className="queue-icon-button"
            type="button"
            aria-label={t('queue.action.more')}
            title={t('queue.action.more')}
            disabled={!nowPlaying}
            onClick={handleNowPlayingMoreClick}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </section>

      <section className="queue-toolbar" aria-label={t('queue.tools')}>
        <button className={`queue-tool-button ${queue.isShuffleEnabled ? 'is-active' : ''}`} type="button" aria-pressed={queue.isShuffleEnabled} onClick={queue.toggleShuffle}>
          <Shuffle size={16} />
          {t('queue.action.shuffle')}
        </button>
        <button className="queue-tool-button" type="button" disabled={isGeneratingRandomQueue} onClick={() => void handleGenerateRandomQueue()}>
          <Shuffle size={16} />
          {isGeneratingRandomQueue ? t('queue.action.generatingRandom') : t('queue.action.generateRandom')}
        </button>
        <button className="queue-tool-button" type="button" disabled={isGeneratingHistoryQueue} onClick={() => void handleGenerateHistoryQueue()}>
          <History size={16} />
          {isGeneratingHistoryQueue ? t('queue.action.generatingHistory') : t('queue.action.generateFromHistory')}
        </button>
        <div className="queue-repeat-group" aria-label={t('queue.repeat.mode')}>
          {(['off', 'one', 'all'] as RepeatMode[]).map((mode) => (
            <button
              className={queue.repeatMode === mode ? 'is-active' : ''}
              key={mode}
              type="button"
              aria-pressed={queue.repeatMode === mode}
              onClick={() => queue.setRepeatMode(mode)}
            >
              {mode === 'off' ? <MinusCircle size={15} /> : mode === 'one' ? <Repeat1 size={15} /> : <Repeat2 size={15} />}
              {repeatLabels[mode]}
            </button>
          ))}
        </div>
        <button className="queue-tool-button danger" type="button" disabled={queue.items.length === 0} onClick={queue.clearQueue}>
          <Trash2 size={16} />
          {t('queue.action.clear')}
        </button>
      </section>

      <section className="queue-list-section" aria-label={t('queue.upNext.kicker')}>
        <div className="queue-section-heading">
          <div>
            <span className="queue-kicker">{t('queue.upNext.kicker')}</span>
            <h2>{t('queue.upNext.title')}</h2>
          </div>
          <span>{t('queue.upNext.waitingCount', { count: upNextCount })}</span>
        </div>

        {rows.length > 0 ? (
          <div className="queue-list" ref={queueListRef} role="list" data-virtualized="true">
            <div className="queue-virtual-spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = rows[virtualRow.index];
                const isCurrent = item.queueId === queue.currentQueueId;
                const rowQualityTags = qualityTags(item.track);
                return (
                  <div
                    className="queue-virtual-row"
                    key={item.queueId}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div
                      className="queue-row"
                      data-current={isCurrent}
                      data-dragging={draggedQueueId === item.queueId}
                      data-drop-target={dropTargetQueueId === item.queueId && draggedQueueId !== item.queueId}
                      draggable
                      role="listitem"
                      onContextMenu={(event) => handleTrackContextMenu(event, item.track)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) => handleDragOver(event, item)}
                      onDragStart={(event) => handleDragStart(event, item)}
                      onDrop={(event) => handleDrop(event, item)}
                      onDoubleClick={() => void runQueueAction(() => queue.playQueueItem(item.queueId))}
                    >
                      <span className="queue-drag-handle" aria-label={t('queue.action.dragLabel', { title: item.track.title })} title={t('queue.action.dragTitle')}>
                        <GripVertical size={17} />
                      </span>
                      <div className="queue-row-cover" data-empty={!item.track.coverThumb}>
                        {item.track.coverThumb ? <img alt="" src={item.track.coverThumb} /> : <Music2 size={19} />}
                      </div>
                      <div className="queue-row-copy">
                        <strong>{item.track.title}</strong>
                        <span>{item.track.artist || item.track.albumArtist || t('queue.unknownArtist')}</span>
                      </div>
                      <div className="queue-row-quality" aria-label={t('queue.now.quality')}>
                        {rowQualityTags.length > 0 ? rowQualityTags.map((tag) => <span key={`${item.queueId}-${tag}`}>{tag}</span>) : <span>{t('queue.quality.unknown')}</span>}
                      </div>
                      <span className="queue-row-source">{item.source.label}</span>
                      <span className="queue-row-duration">{formatDuration(item.track.duration)}</span>
                      <div className="queue-row-actions" onDoubleClick={(event) => event.stopPropagation()}>
                        <button
                          className="queue-icon-button"
                          type="button"
                          aria-label={t('queue.action.play', { title: item.track.title })}
                          title={t('queue.action.play', { title: item.track.title })}
                          onClick={() => void runQueueAction(() => queue.playQueueItem(item.queueId))}
                        >
                          <Play size={16} fill="currentColor" />
                        </button>
                        <button
                          className="queue-icon-button"
                          type="button"
                          aria-label={t('queue.action.playNext', { title: item.track.title })}
                          title={t('queue.action.playNext', { title: item.track.title })}
                          disabled={isCurrent}
                          onClick={() => handlePlayItemNext(item)}
                        >
                          <Shuffle size={15} />
                        </button>
                        <button
                          className="queue-icon-button danger"
                          type="button"
                          aria-label={t('queue.action.remove', { title: item.track.title })}
                          title={t('queue.action.remove', { title: item.track.title })}
                          onClick={() => queue.removeQueueItem(item.queueId)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="queue-empty-state">
            <ListMusicFallback />
            <strong>{t('queue.empty.title')}</strong>
            <span>{t('queue.empty.description')}</span>
          </div>
        )}

        {actionError ? <p className="queue-error">{actionError}</p> : null}
      </section>

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          liked={!trackMenu.track.isTemporary && likedTrackIds[trackMenu.track.id] === true}
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
          queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
          window.dispatchEvent(new Event('library:changed'));
        }}
      />

      <OsuTimingPanel
        track={osuTimingTrack}
        isOpen={Boolean(osuTimingTrack)}
        onClose={() => setOsuTimingTrack(null)}
        onTrackUpdated={(updatedTrack) => {
          setOsuTimingTrack(updatedTrack);
          queue.updateTrackSnapshot(updatedTrack.id, updatedTrack);
        }}
      />
    </div>
  );
};

const ListMusicFallback = (): JSX.Element => (
  <span className="queue-empty-icon" aria-hidden="true">
    <Music2 size={24} />
  </span>
);
