import { memo, useCallback, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Heart, ListPlus, MoreHorizontal, Music2 } from 'lucide-react';
import type { LibraryTrack } from '../../../shared/types/library';

export type HifiTagKind = 'flac' | 'lossless' | 'depth' | 'rate' | 'bitrate' | 'bpm' | 'dsf' | 'hires';

export type HifiTag = {
  label: string;
  kind: HifiTagKind;
};

type TrackRowProps = {
  track: LibraryTrack;
  isPlaying: boolean;
  onPlay?: (track: LibraryTrack) => void;
  onAddToQueue?: (track: LibraryTrack) => void;
  onOpenMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
};

const formatDuration = (duration: number): string => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const tagsFromTrack = (track: LibraryTrack): HifiTag[] => {
  const tags: HifiTag[] = [];
  const codec = track.codec?.toUpperCase();

  if (codec) {
    tags.push({
      label: codec,
      kind: codec === 'FLAC' ? 'flac' : codec === 'DSF' || codec === 'DFF' ? 'dsf' : 'lossless',
    });
  }

  if (track.bitDepth && track.sampleRate) {
    tags.push({
      label: `${track.bitDepth}bit / ${track.sampleRate >= 1000 ? `${Math.round(track.sampleRate / 1000)}kHz` : `${track.sampleRate}Hz`}`,
      kind: track.sampleRate >= 88200 || track.bitDepth >= 24 ? 'hires' : 'depth',
    });
  } else if (track.sampleRate) {
    tags.push({
      label: `${Math.round(track.sampleRate / 1000)}kHz`,
      kind: 'rate',
    });
  }

  if (track.bitrate) {
    tags.push({
      label: `${Math.round(track.bitrate / 1000)}kbps`,
      kind: 'bitrate',
    });
  }

  return tags.slice(0, 4);
};

const tagClassNameByKind: Record<HifiTagKind, string> = {
  flac: 'tag-flac',
  lossless: 'tag-lossless',
  depth: 'tag-depth',
  rate: 'tag-depth',
  bitrate: 'tag-depth',
  bpm: 'tag-bpm',
  dsf: 'tag-flac',
  hires: 'tag-hires',
};

export const TrackRow = memo(
  ({ track, isPlaying, onPlay, onAddToQueue, onOpenMenu }: TrackRowProps): JSX.Element => {
    const tags = tagsFromTrack(track);
    const isUnavailable = track.unavailable === true;
    const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
    const shouldShowCover = Boolean(track.coverThumb && track.coverThumb !== failedCoverUrl);
    const handlePlay = useCallback((): void => {
      if (isUnavailable) {
        return;
      }

      onPlay?.(track);
    }, [isUnavailable, onPlay, track]);
    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlePlay();
        }
      },
      [handlePlay],
    );
    const stopActionPropagation = useCallback((event: MouseEvent): void => {
      event.stopPropagation();
    }, []);
    const handleContextMenu = useCallback(
      (event: MouseEvent<HTMLDivElement>): void => {
        if (!onOpenMenu) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onOpenMenu(track, { x: event.clientX, y: event.clientY });
      },
      [onOpenMenu, track],
    );
    const handleMoreClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenMenu?.(track, { x: rect.right - 12, y: rect.bottom + 8 });
      },
      [onOpenMenu, track],
    );
    const handleAddToQueue = useCallback(
      (event: MouseEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
        onAddToQueue?.(track);
      },
      [onAddToQueue, track],
    );
    const handleCoverError = useCallback((): void => {
      if (!track.coverThumb) {
        return;
      }

      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn('Failed to load track cover', {
          url: track.coverThumb,
          trackId: track.id,
        });
      }

      setFailedCoverUrl(track.coverThumb);
    }, [track.coverThumb, track.id]);

    return (
      <div
        className="track-row"
        data-clickable={Boolean(onPlay) && !isUnavailable}
        data-playing={isPlaying}
        data-unavailable={isUnavailable ? 'true' : undefined}
        role="listitem"
        tabIndex={onPlay && !isUnavailable ? 0 : undefined}
        onClick={handlePlay}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        <div className="track-cover" data-empty={!shouldShowCover} aria-hidden="true">
          {shouldShowCover ? (
            <img alt="" decoding="async" draggable={false} height={96} loading="lazy" src={track.coverThumb!} width={96} onError={handleCoverError} />
          ) : (
            <Music2 size={22} />
          )}
        </div>

        <div className="track-main">
          <div className="track-title-row">
            {isPlaying ? <span className="playing-dot" aria-hidden="true" /> : null}
            <strong className="track-title">{track.title}</strong>
            {isPlaying ? <span className="playing-pill">Playing</span> : null}
            {isUnavailable ? <span className="playing-pill unavailable-pill">Unavailable</span> : null}
          </div>
          <div className="track-subtitle">
            {track.artist} - {track.album}
          </div>
          <div className="tag-row track-tags" aria-label="Audio specifications">
            {tags.map((tag) => (
              <span className={`hifi-tag ${tagClassNameByKind[tag.kind]}`} key={`${track.id}-${tag.label}`}>
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        <div className="track-duration">{formatDuration(track.duration)}</div>

        <div className="track-actions" aria-label={`${track.title} actions`} onClick={stopActionPropagation} onDoubleClick={stopActionPropagation}>
          <button className="row-action" type="button" aria-label={`Like ${track.title}`} title="Like">
            <Heart size={16} />
          </button>
          <button className="row-action" type="button" aria-label={`Add to queue ${track.title}`} title="Add to queue" disabled={isUnavailable} onClick={handleAddToQueue}>
            <ListPlus size={16} />
          </button>
          <button className="row-action" type="button" aria-label={`More ${track.title}`} title="More" onClick={handleMoreClick}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.track === next.track &&
    previous.isPlaying === next.isPlaying &&
    previous.onPlay === next.onPlay &&
    previous.onAddToQueue === next.onAddToQueue &&
    previous.onOpenMenu === next.onOpenMenu,
);

TrackRow.displayName = 'TrackRow';
