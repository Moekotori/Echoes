import { useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Disc3,
  FolderOpen,
  GripVertical,
  Heart,
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
import type { LibraryTrack } from '../../shared/types/library';
import type { QueueItem, RepeatMode } from '../stores/PlaybackQueueProvider';
import { useI18n } from '../i18n/I18nProvider';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

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

export const QueuePage = (): JSX.Element => {
  const { t } = useI18n();
  const queue = usePlaybackQueue();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isGeneratingRandomQueue, setIsGeneratingRandomQueue] = useState(false);
  const [draggedQueueId, setDraggedQueueId] = useState<string | null>(null);
  const [dropTargetQueueId, setDropTargetQueueId] = useState<string | null>(null);
  const queueListRef = useRef<HTMLDivElement | null>(null);
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
  const nowPlayingTags = qualityTags(nowPlaying);
  const sourceLabel = queue.currentItem?.source.label ?? t('queue.now.sourceFallback');
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => queueListRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });
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

    void runQueueAction(() => window.echo?.library?.openTrackInFolder(nowPlaying.id));
  }, [nowPlaying, runQueueAction]);

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
        pageSize: 100,
        sort: 'random',
      });

      if (result.items.length === 0) {
        setActionError(t('queue.error.noRandomTracks'));
        return;
      }

      queue.replaceQueue(result.items, {
        source: { type: 'manual', label: t('queue.randomSource') },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingRandomQueue(false);
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
          <button className="queue-icon-button" type="button" aria-label={t('queue.action.like')} title={t('queue.action.like')} disabled={!nowPlaying}>
            <Heart size={17} />
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
          <button className="queue-icon-button" type="button" aria-label={t('queue.action.more')} title={t('queue.action.more')} disabled={!nowPlaying}>
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
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) => handleDragOver(event, item)}
                      onDragStart={(event) => handleDragStart(event, item)}
                      onDrop={(event) => handleDrop(event, item)}
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
                      <div className="queue-row-actions">
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
    </div>
  );
};

const ListMusicFallback = (): JSX.Element => (
  <span className="queue-empty-icon" aria-hidden="true">
    <Music2 size={24} />
  </span>
);
