import { memo, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LibraryTrack } from '../../../shared/types/library';
import { TrackRow } from './TrackRow';

type TrackListProps = {
  tracks: LibraryTrack[];
  currentTrackId: string | null;
  canLoadMore?: boolean;
  canLoadPrevious?: boolean;
  totalCount?: number;
  loadedCount?: number;
  loadedStartIndex?: number;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  onStartReached?: () => void;
  onPlay?: (track: LibraryTrack) => void;
  selectedTrackIds?: Record<string, boolean>;
  onToggleSelected?: (track: LibraryTrack) => void;
  onAddToQueue?: (track: LibraryTrack) => void;
  onAddToPlaylist?: (track: LibraryTrack) => void;
  onDownload?: (track: LibraryTrack) => void;
  onOpenArtist?: (track: LibraryTrack) => void;
  onOpenAlbum?: (track: LibraryTrack) => void;
  downloadingTrackIds?: Record<string, boolean>;
  downloadProgressByTrackId?: Record<string, number>;
  duplicateHiddenCounts?: Record<string, number>;
  onShowVersions?: (track: LibraryTrack) => void;
  likedTrackIds?: Record<string, boolean>;
  onToggleLiked?: (track: LibraryTrack) => void;
  onOpenTrackMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
  onVisibleTrackIdsChange?: (trackIds: string[]) => void;
  followCurrentTrack?: boolean;
  currentTrackIndex?: number | null;
};

const rowHeight = 76;
const loadAheadRows = 12;

export const TrackList = memo(({ tracks, currentTrackId, canLoadMore = false, canLoadPrevious = false, totalCount, loadedCount = tracks.length, loadedStartIndex = 0, isLoadingMore = false, onEndReached, onStartReached, onPlay, selectedTrackIds = {}, onToggleSelected, onAddToQueue, onAddToPlaylist, onDownload, onOpenArtist, onOpenAlbum, downloadingTrackIds = {}, downloadProgressByTrackId = {}, duplicateHiddenCounts = {}, onShowVersions, onOpenTrackMenu, onVisibleTrackIdsChange, followCurrentTrack = false, currentTrackIndex = null }: TrackListProps): JSX.Element => {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const loadRequestedRef = useRef(false);
  const loadPreviousRequestedRef = useRef(false);
  const visibleTrackIdsKeyRef = useRef('');
  const lastFollowScrollKeyRef = useRef('');
  const virtualCount = Math.max(totalCount ?? tracks.length, tracks.length);
  const safeLoadedStartIndex = Math.max(0, Math.min(loadedStartIndex, Math.max(0, virtualCount - tracks.length)));
  const loadedBoundary = Math.min(virtualCount, safeLoadedStartIndex + Math.min(loadedCount, tracks.length));
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  useEffect(() => {
    if (!isLoadingMore) {
      loadRequestedRef.current = false;
      loadPreviousRequestedRef.current = false;
    }
  }, [canLoadMore, canLoadPrevious, isLoadingMore, loadedBoundary, safeLoadedStartIndex]);

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

  const requestLoadPrevious = useCallback(
    (firstVisibleIndex: number): void => {
      if (!canLoadPrevious || isLoadingMore || !onStartReached || loadPreviousRequestedRef.current || safeLoadedStartIndex <= 0) {
        return;
      }

      const nearLoadedWindowStart =
        firstVisibleIndex >= Math.max(0, safeLoadedStartIndex - loadAheadRows) &&
        firstVisibleIndex <= safeLoadedStartIndex + loadAheadRows;

      if (nearLoadedWindowStart) {
        loadPreviousRequestedRef.current = true;
        onStartReached();
      }
    },
    [canLoadPrevious, isLoadingMore, onStartReached, safeLoadedStartIndex],
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
  const firstVirtualIndex = renderedVirtualItems[0]?.index ?? -1;

  useEffect(() => {
    requestLoadMore(lastVirtualIndex);
    requestLoadPrevious(firstVirtualIndex);
  }, [firstVirtualIndex, lastVirtualIndex, requestLoadMore, requestLoadPrevious]);

  useEffect(() => {
    if (!followCurrentTrack || !currentTrackId) {
      lastFollowScrollKeyRef.current = '';
      return;
    }

    const loadedCurrentTrackIndex = tracks.findIndex((track) => track.id === currentTrackId);
    const targetIndex = loadedCurrentTrackIndex >= 0 ? safeLoadedStartIndex + loadedCurrentTrackIndex : currentTrackIndex ?? -1;

    if (targetIndex < 0) {
      return;
    }

    const followScrollKey = `${currentTrackId}:${targetIndex}`;

    if (lastFollowScrollKeyRef.current === followScrollKey) {
      return;
    }

    lastFollowScrollKeyRef.current = followScrollKey;
    rowVirtualizer.scrollToIndex(targetIndex, { align: 'center', behavior: 'smooth' });
  }, [currentTrackId, currentTrackIndex, followCurrentTrack, rowVirtualizer, safeLoadedStartIndex, tracks]);

  useEffect(() => {
    if (!onVisibleTrackIdsChange) {
      return;
    }

    const visibleTrackIds = renderedVirtualItems
      .map((virtualRow) => tracks[virtualRow.index - safeLoadedStartIndex]?.id)
      .filter((trackId): trackId is string => Boolean(trackId));
    const visibleTrackIdsKey = visibleTrackIds.join('\0');

    if (visibleTrackIdsKeyRef.current === visibleTrackIdsKey) {
      return;
    }

    visibleTrackIdsKeyRef.current = visibleTrackIdsKey;
    onVisibleTrackIdsChange(visibleTrackIds);
  }, [onVisibleTrackIdsChange, renderedVirtualItems, safeLoadedStartIndex, tracks]);

  const handleScroll = (): void => {
    const scrollElement = scrollParentRef.current;

    if (!scrollElement || isLoadingMore) {
      return;
    }

    const distanceToBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;

    if (distanceToBottom < 320) {
      if (!canLoadMore || !onEndReached || loadRequestedRef.current) {
        return;
      }

      loadRequestedRef.current = true;
      onEndReached();
      return;
    }

    if (scrollElement.scrollTop < 320) {
      requestLoadPrevious(rowVirtualizer.getVirtualItems()[0]?.index ?? -1);
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
        data-loaded-count={Math.min(loadedCount, tracks.length)}
        data-loaded-start-index={safeLoadedStartIndex}
        onScroll={handleScroll}
      >
        {virtualCount === 0 ? (
          <div className="track-empty-state">没有可显示的歌曲。导入音乐文件夹后，这里会显示曲库列表。</div>
        ) : (
          <div className="track-virtual-spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
            {renderedVirtualItems.map((virtualRow) => {
              const track = tracks[virtualRow.index - safeLoadedStartIndex];

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
                      isSelected={selectedTrackIds[track.id] === true}
                      duplicateHiddenCount={duplicateHiddenCounts[track.id] ?? 0}
                      track={track}
                      onPlay={onPlay}
                      onToggleSelected={onToggleSelected}
                      onAddToQueue={onAddToQueue}
                      onAddToPlaylist={onAddToPlaylist}
                      onDownload={onDownload}
                      onOpenArtist={onOpenArtist}
                      onOpenAlbum={onOpenAlbum}
                      isDownloading={downloadingTrackIds[track.id] === true}
                      downloadProgress={downloadProgressByTrackId[track.id]}
                      onShowVersions={onShowVersions}
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
