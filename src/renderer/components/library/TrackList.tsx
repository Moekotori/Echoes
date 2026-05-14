import { memo, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LibraryTrack } from '../../../shared/types/library';
import { TrackRow } from './TrackRow';

type TrackListProps = {
  tracks: LibraryTrack[];
  currentTrackId: string | null;
  canLoadMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  onPlay?: (track: LibraryTrack) => void;
  onAddToQueue?: (track: LibraryTrack) => void;
  duplicateHiddenCounts?: Record<string, number>;
  onShowVersions?: (track: LibraryTrack) => void;
  likedTrackIds?: Record<string, boolean>;
  onToggleLiked?: (track: LibraryTrack) => void;
  onOpenTrackMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
};

const rowHeight = 76;
const loadAheadRows = 12;

export const TrackList = memo(({ tracks, currentTrackId, canLoadMore = false, totalCount, loadedCount = tracks.length, isLoadingMore = false, onEndReached, onPlay, onAddToQueue, duplicateHiddenCounts = {}, onShowVersions, likedTrackIds = {}, onToggleLiked, onOpenTrackMenu }: TrackListProps): JSX.Element => {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const loadRequestedRef = useRef(false);
  const virtualCount = Math.max(totalCount ?? tracks.length, tracks.length);
  const loadedBoundary = Math.min(loadedCount, tracks.length);
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  useEffect(() => {
    if (!isLoadingMore) {
      loadRequestedRef.current = false;
    }
  }, [canLoadMore, isLoadingMore, loadedBoundary]);

  const requestLoadMore = useCallback(
    (lastVisibleIndex: number): void => {
      if (!canLoadMore || isLoadingMore || !onEndReached || loadRequestedRef.current || loadedBoundary >= virtualCount) {
        return;
      }

      if (lastVisibleIndex >= Math.max(0, loadedBoundary - loadAheadRows)) {
        loadRequestedRef.current = true;
        onEndReached();
      }
    },
    [canLoadMore, isLoadingMore, loadedBoundary, onEndReached, virtualCount],
  );

  const virtualItems = rowVirtualizer.getVirtualItems();
  const renderedVirtualItems =
    virtualItems.length > 0
      ? virtualItems
      : Array.from({ length: Math.min(virtualCount, 20) }, (_, index) => ({
          index,
          key: `fallback-${index}`,
          start: index * rowHeight,
        }));
  const lastVirtualIndex = renderedVirtualItems.at(-1)?.index ?? -1;

  useEffect(() => {
    requestLoadMore(lastVirtualIndex);
  }, [lastVirtualIndex, requestLoadMore]);

  const handleScroll = (): void => {
    const scrollElement = scrollParentRef.current;

    if (!scrollElement || !canLoadMore || isLoadingMore || !onEndReached) {
      return;
    }

    const distanceToBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;

    if (distanceToBottom < 320) {
      if (loadRequestedRef.current) {
        return;
      }

      loadRequestedRef.current = true;
      onEndReached();
      return;
    }

    requestLoadMore(rowVirtualizer.getVirtualItems().at(-1)?.index ?? -1);
  };

  return (
    <section className="track-list-shell" aria-label="歌曲列表">
      <div
        className="track-list"
        ref={scrollParentRef}
        role="list"
        data-virtualized="true"
        data-estimated-row-height={String(rowHeight)}
        data-total-count={virtualCount}
        data-loaded-count={loadedBoundary}
        onScroll={handleScroll}
      >
        {virtualCount === 0 ? (
          <div className="track-empty-state">没有可显示的歌曲。导入音乐文件夹后，这里会显示曲库列表。</div>
        ) : (
          <div className="track-virtual-spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
            {renderedVirtualItems.map((virtualRow) => {
              const track = tracks[virtualRow.index];

              return (
                <div
                  className="track-virtual-row"
                  key={track?.id ?? `track-skeleton-${virtualRow.index}`}
                  data-index={virtualRow.index}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {track ? (
                    <TrackRow
                      isPlaying={track.id === currentTrackId}
                      duplicateHiddenCount={duplicateHiddenCounts[track.id] ?? 0}
                      liked={likedTrackIds[track.id] === true}
                      track={track}
                      onPlay={onPlay}
                      onAddToQueue={onAddToQueue}
                      onShowVersions={onShowVersions}
                      onToggleLiked={onToggleLiked}
                      onOpenMenu={onOpenTrackMenu}
                    />
                  ) : (
                    <div className="track-row track-row-skeleton" role="listitem" aria-label="Loading track" data-skeleton="true">
                      <span className="track-skeleton-cover" aria-hidden="true" />
                      <span className="track-skeleton-copy" aria-hidden="true">
                        <span />
                        <span />
                      </span>
                      <span className="track-skeleton-pill" aria-hidden="true" />
                      <span className="track-skeleton-pill" aria-hidden="true" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});

TrackList.displayName = 'TrackList';
