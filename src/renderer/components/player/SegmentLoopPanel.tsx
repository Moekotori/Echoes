import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ListRestart, Play, Save, Scissors, Trash2, X } from 'lucide-react';
import { formatTime } from './playerFormat';

type SegmentBookmark = {
  id: string;
  trackKey: string;
  title: string;
  artist: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  createdAt: string;
};

type SegmentBookmarkStore = Record<string, SegmentBookmark[]>;

type SegmentLoopPanelProps = {
  disabled: boolean;
  isPlaying: boolean;
  trackKey: string | null;
  title: string;
  artist: string;
  durationSeconds: number;
  positionSeconds: number;
  onSeek: (positionSeconds: number) => void;
};

const storageKey = 'echo-next:segment-bookmarks:v1';
const maxBookmarksPerTrack = 12;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isBookmark = (value: unknown): value is SegmentBookmark =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.trackKey === 'string' &&
  typeof value.title === 'string' &&
  typeof value.artist === 'string' &&
  typeof value.label === 'string' &&
  typeof value.startSeconds === 'number' &&
  typeof value.endSeconds === 'number' &&
  typeof value.createdAt === 'string' &&
  value.endSeconds > value.startSeconds;

const readStore = (): SegmentBookmarkStore => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter(isBookmark).slice(0, maxBookmarksPerTrack) : [],
      ]),
    );
  } catch {
    return {};
  }
};

const writeStore = (store: SegmentBookmarkStore): void => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(store));
  } catch {
    // Segment bookmarks are a convenience layer; playback controls must keep working.
  }
};

const clampPosition = (value: number, durationSeconds: number): number => {
  const upper = durationSeconds > 0 ? durationSeconds : Number.MAX_SAFE_INTEGER;
  return Math.min(upper, Math.max(0, value));
};

const createBookmarkId = (): string => {
  if (typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `segment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const SegmentLoopPanel = ({
  disabled,
  isPlaying,
  trackKey,
  title,
  artist,
  durationSeconds,
  positionSeconds,
  onSeek,
}: SegmentLoopPanelProps): JSX.Element => {
  const [startSeconds, setStartSeconds] = useState<number | null>(null);
  const [endSeconds, setEndSeconds] = useState<number | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [bookmarks, setBookmarks] = useState<SegmentBookmark[]>([]);
  const lastLoopAtMsRef = useRef(Number.NEGATIVE_INFINITY);
  const canUseSegments = Boolean(trackKey) && !disabled && durationSeconds > 0;
  const hasValidSegment = startSeconds !== null && endSeconds !== null && endSeconds > startSeconds + 0.5;
  const safePositionSeconds = clampPosition(positionSeconds, durationSeconds);

  useEffect(() => {
    if (!trackKey) {
      setBookmarks([]);
      setStartSeconds(null);
      setEndSeconds(null);
      setLoopEnabled(false);
      return;
    }

    setBookmarks(readStore()[trackKey] ?? []);
    setStartSeconds(null);
    setEndSeconds(null);
    setLoopEnabled(false);
  }, [trackKey]);

  useEffect(() => {
    if (!loopEnabled || !hasValidSegment || !isPlaying || !canUseSegments || startSeconds === null || endSeconds === null) {
      return;
    }

    const now = performance.now();
    if (safePositionSeconds >= endSeconds - 0.12 && now - lastLoopAtMsRef.current > 650) {
      lastLoopAtMsRef.current = now;
      onSeek(startSeconds);
    }
  }, [canUseSegments, endSeconds, hasValidSegment, isPlaying, loopEnabled, onSeek, safePositionSeconds, startSeconds]);

  const currentSegmentLabel = useMemo(() => {
    if (startSeconds === null && endSeconds === null) {
      return '未设置';
    }

    return `${startSeconds === null ? '--:--' : formatTime(startSeconds)} - ${endSeconds === null ? '--:--' : formatTime(endSeconds)}`;
  }, [endSeconds, startSeconds]);

  const updateBookmarks = useCallback(
    (nextBookmarks: SegmentBookmark[]): void => {
      if (!trackKey) {
        return;
      }

      const store = readStore();
      store[trackKey] = nextBookmarks.slice(0, maxBookmarksPerTrack);
      writeStore(store);
      setBookmarks(store[trackKey]);
    },
    [trackKey],
  );

  const setPointA = useCallback((): void => {
    const nextStart = clampPosition(safePositionSeconds, durationSeconds);
    setStartSeconds(nextStart);
    setLoopEnabled(false);
    if (endSeconds !== null && endSeconds <= nextStart + 0.5) {
      setEndSeconds(null);
    }
  }, [durationSeconds, endSeconds, safePositionSeconds]);

  const setPointB = useCallback((): void => {
    const nextEnd = clampPosition(safePositionSeconds, durationSeconds);
    setEndSeconds(nextEnd);
    setLoopEnabled(false);
    if (startSeconds !== null && nextEnd <= startSeconds + 0.5) {
      setStartSeconds(null);
    }
  }, [durationSeconds, safePositionSeconds, startSeconds]);

  const clearSegment = useCallback((): void => {
    setStartSeconds(null);
    setEndSeconds(null);
    setLoopEnabled(false);
  }, []);

  const saveSegment = useCallback((): void => {
    if (!trackKey || !hasValidSegment || startSeconds === null || endSeconds === null) {
      return;
    }

    const roundedStart = Math.round(startSeconds * 10) / 10;
    const roundedEnd = Math.round(endSeconds * 10) / 10;
    const bookmark: SegmentBookmark = {
      id: createBookmarkId(),
      trackKey,
      title,
      artist,
      label: `${formatTime(roundedStart)} - ${formatTime(roundedEnd)}`,
      startSeconds: roundedStart,
      endSeconds: roundedEnd,
      createdAt: new Date().toISOString(),
    };
    const withoutDuplicate = bookmarks.filter(
      (item) => Math.abs(item.startSeconds - roundedStart) > 0.2 || Math.abs(item.endSeconds - roundedEnd) > 0.2,
    );
    updateBookmarks([bookmark, ...withoutDuplicate]);
  }, [artist, bookmarks, endSeconds, hasValidSegment, startSeconds, title, trackKey, updateBookmarks]);

  const activateBookmark = useCallback(
    (bookmark: SegmentBookmark): void => {
      setStartSeconds(bookmark.startSeconds);
      setEndSeconds(bookmark.endSeconds);
      setLoopEnabled(true);
      onSeek(bookmark.startSeconds);
    },
    [onSeek],
  );

  const removeBookmark = useCallback(
    (bookmarkId: string): void => {
      updateBookmarks(bookmarks.filter((bookmark) => bookmark.id !== bookmarkId));
    },
    [bookmarks, updateBookmarks],
  );

  return (
    <div className="segment-loop-panel" data-active={loopEnabled && hasValidSegment ? 'true' : undefined} aria-label="A-B 循环和片段书签">
      <div className="segment-loop-panel__controls">
        <span className="segment-loop-panel__label">
          <Scissors size={13} />
          A-B
        </span>
        <span className="segment-loop-panel__range">{currentSegmentLabel}</span>
        <button type="button" disabled={!canUseSegments} onClick={setPointA} title="把当前位置设为 A 点">
          A
        </button>
        <button type="button" disabled={!canUseSegments} onClick={setPointB} title="把当前位置设为 B 点">
          B
        </button>
        <button
          className={loopEnabled && hasValidSegment ? 'is-active' : ''}
          type="button"
          disabled={!canUseSegments || !hasValidSegment}
          aria-label="切换 A-B 循环"
          aria-pressed={loopEnabled && hasValidSegment}
          onClick={() => setLoopEnabled((value) => !value)}
          title="开启或关闭 A-B 循环"
        >
          <ListRestart size={13} />
        </button>
        <button type="button" disabled={!canUseSegments || !hasValidSegment} aria-label="保存当前片段书签" onClick={saveSegment} title="保存当前片段书签">
          <Save size={13} />
        </button>
        <button type="button" disabled={startSeconds === null && endSeconds === null} aria-label="清除当前 A-B 点" onClick={clearSegment} title="清除当前 A-B 点">
          <X size={13} />
        </button>
      </div>
      {bookmarks.length > 0 ? (
        <div className="segment-loop-bookmarks" aria-label="当前曲目的片段书签">
          {bookmarks.map((bookmark) => (
            <span className="segment-loop-bookmark" key={bookmark.id}>
              <button type="button" aria-label={`循环片段 ${bookmark.label}`} title={`循环 ${bookmark.label}`} onClick={() => activateBookmark(bookmark)}>
                <Play size={12} fill="currentColor" />
                {bookmark.label}
              </button>
              <button type="button" aria-label={`删除片段书签 ${bookmark.label}`} title="删除片段书签" onClick={() => removeBookmark(bookmark.id)}>
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="segment-loop-bookmarks segment-loop-bookmarks--empty">
          <Bookmark size={12} />
          <span>保存片段后会显示在这里</span>
        </div>
      )}
    </div>
  );
};
