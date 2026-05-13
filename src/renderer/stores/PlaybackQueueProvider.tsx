import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AudioPlaybackState } from '../../shared/types/audio';
import type { LibraryTrack } from '../../shared/types/library';
import type { PlaybackStatus } from '../../shared/types/playback';

export type QueueSource =
  | { type: 'songs'; label: string; search?: string; sort?: string; hideDuplicates?: boolean }
  | { type: 'album'; label: string; albumId: string }
  | { type: 'artist'; label: string; artistId?: string }
  | { type: 'folder'; label: string; folderId: string; path: string; recursive: boolean }
  | { type: 'manual'; label: string };

export type QueueItem = {
  queueId: string;
  track: LibraryTrack;
  source: QueueSource;
  addedAt: string;
};

export type RepeatMode = 'off' | 'one' | 'all';

type ReplaceQueueOptions = {
  startTrackId?: string;
  source?: QueueSource;
};

type PlayTrackOptions = {
  source?: QueueSource;
  replaceQueueWith?: LibraryTrack[];
  forceNewQueueItem?: boolean;
};

type PlaybackQueueContextValue = {
  items: QueueItem[];
  tracks: LibraryTrack[];
  currentItem: QueueItem | null;
  currentQueueId: string | null;
  currentTrack: LibraryTrack | null;
  currentTrackId: string | null;
  lastPlayedTrack: LibraryTrack | null;
  history: QueueItem[];
  isShuffleEnabled: boolean;
  repeatMode: RepeatMode;
  canGoPrevious: boolean;
  canGoNext: boolean;
  replaceQueue: (tracks: LibraryTrack[], options?: ReplaceQueueOptions) => void;
  appendToQueue: (track: LibraryTrack, source?: QueueSource) => void;
  appendTracksToQueue: (tracks: LibraryTrack[], source?: QueueSource) => void;
  playTrackNext: (track: LibraryTrack, source?: QueueSource) => void;
  removeQueueItem: (queueId: string) => void;
  clearQueue: () => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  playQueueItem: (queueId: string) => Promise<PlaybackStatus>;
  playTrack: (track: LibraryTrack, options?: PlayTrackOptions) => Promise<PlaybackStatus>;
  playPrevious: () => Promise<PlaybackStatus | null>;
  playNext: () => Promise<PlaybackStatus | null>;
  setCurrentTrackId: (trackId: string | null) => void;
  syncPlaybackState: (state: AudioPlaybackState) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
};

type PlaybackHistorySession = {
  historyId: string;
  track: LibraryTrack;
  startedAtMs: number;
  lastResumedAtMs: number | null;
  playedSeconds: number;
  isPlaying: boolean;
  isFinishing: boolean;
};

const pausedSessionTimeoutMs = 30 * 60 * 1000;

const PlaybackQueueContext = createContext<PlaybackQueueContextValue | null>(null);

const manualSource: QueueSource = { type: 'manual', label: 'Manual queue' };

let queueIdCounter = 0;

const createQueueId = (trackId: string): string => {
  queueIdCounter += 1;
  return `${Date.now().toString(36)}-${queueIdCounter.toString(36)}-${trackId}`;
};

const createProbeFromTrack = (track: LibraryTrack) => ({
  durationSeconds: track.duration,
  fileSampleRate: track.sampleRate,
  channels: 2,
  codec: track.codec,
  bitDepth: track.bitDepth,
  bitrate: track.bitrate,
});

const createQueueItem = (track: LibraryTrack, source: QueueSource = manualSource): QueueItem => ({
  queueId: createQueueId(track.id),
  track,
  source,
  addedAt: new Date().toISOString(),
});

const findItemByQueueId = (items: QueueItem[], queueId: string | null): QueueItem | null =>
  queueId ? items.find((item) => item.queueId === queueId) ?? null : null;

const findCurrentIndex = (items: QueueItem[], currentQueueId: string | null, currentTrackId: string | null): number => {
  const queueIndex = currentQueueId ? items.findIndex((item) => item.queueId === currentQueueId) : -1;

  if (queueIndex >= 0) {
    return queueIndex;
  }

  return currentTrackId ? items.findIndex((item) => item.track.id === currentTrackId) : -1;
};

const getShuffleCandidates = (items: QueueItem[], activeItem: QueueItem | null, history: QueueItem[]): QueueItem[] => {
  const excludedQueueIds = new Set(history.map((item) => item.queueId));

  if (activeItem) {
    excludedQueueIds.add(activeItem.queueId);
  }

  return items.filter((item) => !excludedQueueIds.has(item.queueId));
};

const isLibraryRandomSource = (source: QueueSource | null | undefined): source is Extract<QueueSource, { type: 'songs' }> =>
  source?.type === 'songs';

const pickRandom = <Item,>(items: Item[]): Item | null => items[Math.floor(Math.random() * items.length)] ?? null;

const clampMoveIndex = (index: number, length: number): number => Math.max(0, Math.min(index, length - 1));

const isCompletedPlayback = (playedSeconds: number, durationSeconds: number): boolean =>
  durationSeconds > 0 ? playedSeconds >= 30 || playedSeconds >= durationSeconds * 0.5 : playedSeconds >= 30;

export const PlaybackQueueProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [items, setItemsState] = useState<QueueItem[]>([]);
  const [currentQueueId, setCurrentQueueIdState] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackIdState] = useState<string | null>(null);
  const [lastPlayedTrack, setLastPlayedTrackState] = useState<LibraryTrack | null>(null);
  const [history, setHistoryState] = useState<QueueItem[]>([]);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');

  const itemsRef = useRef(items);
  const currentQueueIdRef = useRef(currentQueueId);
  const currentTrackIdRef = useRef(currentTrackId);
  const lastPlayedTrackRef = useRef(lastPlayedTrack);
  const historyRef = useRef(history);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const playbackHistorySessionRef = useRef<PlaybackHistorySession | null>(null);
  const pausedSessionTimerRef = useRef<number | null>(null);

  const setItems = useCallback((nextItems: QueueItem[] | ((current: QueueItem[]) => QueueItem[])): void => {
    const resolved = typeof nextItems === 'function' ? nextItems(itemsRef.current) : nextItems;
    itemsRef.current = resolved;
    setItemsState(resolved);
  }, []);

  const setCurrentQueueId = useCallback((queueId: string | null): void => {
    currentQueueIdRef.current = queueId;
    setCurrentQueueIdState(queueId);
  }, []);

  const setCurrentTrackIdInternal = useCallback((trackId: string | null): void => {
    currentTrackIdRef.current = trackId;
    setCurrentTrackIdState(trackId);
  }, []);

  const setLastPlayedTrack = useCallback((track: LibraryTrack | null): void => {
    lastPlayedTrackRef.current = track;
    setLastPlayedTrackState(track);
  }, []);

  const setHistory = useCallback((nextHistory: QueueItem[] | ((current: QueueItem[]) => QueueItem[])): void => {
    const resolved = typeof nextHistory === 'function' ? nextHistory(historyRef.current) : nextHistory;
    historyRef.current = resolved;
    setHistoryState(resolved);
  }, []);

  const setRepeatModeInternal = useCallback((mode: RepeatMode): void => {
    repeatModeRef.current = mode;
    setRepeatMode(mode);
  }, []);

  const toggleShuffle = useCallback((): void => {
    const next = !isShuffleEnabledRef.current;
    isShuffleEnabledRef.current = next;
    setIsShuffleEnabled(next);
    if (next && repeatModeRef.current === 'all') {
      setRepeatModeInternal('off');
    }
  }, [setRepeatModeInternal]);

  const currentItem = useMemo(() => findItemByQueueId(items, currentQueueId), [currentQueueId, items]);
  const currentTrack = useMemo(() => {
    if (currentItem) {
      return currentItem.track;
    }

    const queuedTrack = currentTrackId ? items.find((item) => item.track.id === currentTrackId)?.track : null;

    return queuedTrack ?? (lastPlayedTrack?.id === currentTrackId ? lastPlayedTrack : null);
  }, [currentItem, currentTrackId, items, lastPlayedTrack]);

  const clearPausedSessionTimer = useCallback((): void => {
    if (pausedSessionTimerRef.current !== null) {
      window.clearTimeout(pausedSessionTimerRef.current);
      pausedSessionTimerRef.current = null;
    }
  }, []);

  const accumulatePlaybackSeconds = useCallback((session: PlaybackHistorySession, nowMs = Date.now()): number => {
    if (session.isPlaying && session.lastResumedAtMs !== null) {
      session.playedSeconds += Math.max(0, (nowMs - session.lastResumedAtMs) / 1000);
      session.lastResumedAtMs = nowMs;
    }

    return session.playedSeconds;
  }, []);

  const finishPlaybackHistorySession = useCallback(
    async (completedOverride?: boolean): Promise<void> => {
      const session = playbackHistorySessionRef.current;

      if (!session || session.isFinishing) {
        return;
      }

      clearPausedSessionTimer();
      session.isFinishing = true;
      const playedSeconds = accumulatePlaybackSeconds(session);
      const completed = completedOverride ?? isCompletedPlayback(playedSeconds, session.track.duration);
      playbackHistorySessionRef.current = null;

      try {
        await window.echo?.library?.finishPlaybackHistory?.({
          historyId: session.historyId,
          playedSeconds,
          completed,
        });
      } catch {
        // History writes should never interrupt playback controls.
      }
    },
    [accumulatePlaybackSeconds, clearPausedSessionTimer],
  );

  const startPlaybackHistorySession = useCallback(async (item: QueueItem): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.startPlaybackHistory) {
      return;
    }

    try {
      const result = await library.startPlaybackHistory({
        trackId: item.track.id,
        sourceType: item.source.type,
        sourceLabel: item.source.label,
        queueId: item.queueId,
      });
      const nowMs = Date.now();
      playbackHistorySessionRef.current = {
        historyId: result.historyId,
        track: item.track,
        startedAtMs: nowMs,
        lastResumedAtMs: nowMs,
        playedSeconds: 0,
        isPlaying: true,
        isFinishing: false,
      };
    } catch {
      playbackHistorySessionRef.current = null;
    }
  }, []);

  const syncPlaybackState = useCallback(
    (state: AudioPlaybackState): void => {
      const session = playbackHistorySessionRef.current;

      if (!session) {
        return;
      }

      if (state === 'playing') {
        clearPausedSessionTimer();
        if (!session.isPlaying) {
          session.isPlaying = true;
          session.lastResumedAtMs = Date.now();
        }
        return;
      }

      if (state === 'paused' || state === 'loading') {
        accumulatePlaybackSeconds(session);
        session.isPlaying = false;
        session.lastResumedAtMs = null;
        clearPausedSessionTimer();
        pausedSessionTimerRef.current = window.setTimeout(() => {
          void finishPlaybackHistorySession();
        }, pausedSessionTimeoutMs);
        return;
      }

      if (state === 'idle' || state === 'stopped' || state === 'ended' || state === 'error') {
        void finishPlaybackHistorySession(state === 'ended' ? true : undefined);
      }
    },
    [accumulatePlaybackSeconds, clearPausedSessionTimer, finishPlaybackHistorySession],
  );

  useEffect(() => {
    const flushCurrentSession = (): void => {
      void finishPlaybackHistorySession();
    };

    window.addEventListener('beforeunload', flushCurrentSession);
    return () => {
      window.removeEventListener('beforeunload', flushCurrentSession);
      flushCurrentSession();
    };
  }, [finishPlaybackHistorySession]);

  const playLocalTrack = useCallback(async (item: QueueItem): Promise<PlaybackStatus> => {
    const playback = window.echo?.playback;
    const track = item.track;

    if (!playback) {
      throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to play local files.');
    }

    await finishPlaybackHistorySession();
    const status = await playback.playLocalFile({
      filePath: track.path,
      trackId: track.id,
      probe: createProbeFromTrack(track),
    });
    void startPlaybackHistorySession(item);
    return status;
  }, [finishPlaybackHistorySession, startPlaybackHistorySession]);

  const autoSearchMv = useCallback((trackId: string): void => {
    const mvApi = window.echo?.mv;
    if (!mvApi?.getSelected) {
      return;
    }

    void (async () => {
      const settings = await mvApi.getSettings?.();
      const candidates = settings?.autoSearch && mvApi.searchNetworkCandidates ? await mvApi.searchNetworkCandidates(trackId) : [];
      window.dispatchEvent(new CustomEvent('mv:candidatesChanged', { detail: { trackId, candidates } }));
      await mvApi.getSelected(trackId);
      window.dispatchEvent(new CustomEvent('mv:changed', { detail: { trackId } }));
    })().catch(() => undefined);
  }, []);

  const commitPlayedItem = useCallback(
    (item: QueueItem, status: PlaybackStatus, options: { recordHistory?: boolean; previousItem?: QueueItem | null } = {}): void => {
      const previousItem = options.previousItem ?? findItemByQueueId(itemsRef.current, currentQueueIdRef.current);

      if (options.recordHistory !== false && previousItem && previousItem.queueId !== item.queueId) {
        setHistory((current) => [...current, previousItem]);
      }

      setLastPlayedTrack(item.track);
      setCurrentQueueId(item.queueId);
      setCurrentTrackIdInternal(status.currentTrackId ?? item.track.id);
      autoSearchMv(item.track.id);
    },
    [autoSearchMv, setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setLastPlayedTrack],
  );

  const replaceQueue = useCallback(
    (tracks: LibraryTrack[], options: ReplaceQueueOptions = {}): void => {
      const nextItems = tracks.map((track) => createQueueItem(track, options.source ?? manualSource));
      const startItem = options.startTrackId ? nextItems.find((item) => item.track.id === options.startTrackId) ?? null : null;

      setItems(nextItems);
      setHistory([]);
      setCurrentQueueId(startItem?.queueId ?? null);
      if (startItem) {
        setCurrentTrackIdInternal(startItem.track.id);
      }
    },
    [setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setItems],
  );

  const appendToQueue = useCallback(
    (track: LibraryTrack, source: QueueSource = manualSource): void => {
      setItems((current) => [...current, createQueueItem(track, source)]);
    },
    [setItems],
  );

  const appendTracksToQueue = useCallback(
    (tracks: LibraryTrack[], source: QueueSource = manualSource): void => {
      if (tracks.length === 0) {
        return;
      }

      setItems((current) => [...current, ...tracks.map((track) => createQueueItem(track, source))]);
    },
    [setItems],
  );

  const playTrackNext = useCallback(
    (track: LibraryTrack, source: QueueSource = manualSource): void => {
      setItems((current) => {
        const currentIndex = findCurrentIndex(current, currentQueueIdRef.current, currentTrackIdRef.current);
        const insertIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
        const nextItem = createQueueItem(track, source);
        return [...current.slice(0, insertIndex), nextItem, ...current.slice(insertIndex)];
      });
    },
    [setItems],
  );

  const removeQueueItem = useCallback(
    (queueId: string): void => {
      setItems((current) => current.filter((item) => item.queueId !== queueId));
      setHistory((current) => current.filter((item) => item.queueId !== queueId));

      if (currentQueueIdRef.current === queueId) {
        setCurrentQueueId(null);
      }
    },
    [setCurrentQueueId, setHistory, setItems],
  );

  const clearQueue = useCallback((): void => {
    setItems([]);
    setHistory([]);
    setCurrentQueueId(null);
  }, [setCurrentQueueId, setHistory, setItems]);

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number): void => {
      setItems((current) => {
        if (current.length === 0 || fromIndex < 0 || fromIndex >= current.length) {
          return current;
        }

        const next = [...current];
        const [movedItem] = next.splice(fromIndex, 1);
        next.splice(clampMoveIndex(toIndex, next.length + 1), 0, movedItem);
        return next;
      });
    },
    [setItems],
  );

  const playQueueItem = useCallback(
    async (queueId: string): Promise<PlaybackStatus> => {
      const item = findItemByQueueId(itemsRef.current, queueId);

      if (!item) {
        throw new Error('Queue item is no longer available.');
      }

      const status = await playLocalTrack(item);
      commitPlayedItem(item, status);
      return status;
    },
    [commitPlayedItem, playLocalTrack],
  );

  const fetchLibraryShuffleTarget = useCallback(
    async (source: Extract<QueueSource, { type: 'songs' }>, activeItem: QueueItem | null): Promise<QueueItem | null> => {
      const library = window.echo?.library;

      if (!library?.getTracks) {
        return null;
      }

      try {
        const excludedTrackIds = new Set<string>();
        if (activeItem) {
          excludedTrackIds.add(activeItem.track.id);
        }

        for (const item of historyRef.current) {
          excludedTrackIds.add(item.track.id);
        }

        const result = await library.getTracks({
          page: 1,
          pageSize: 50,
          search: source.search,
          sort: 'random',
          hideDuplicates: source.hideDuplicates,
          duplicateMode: 'strict',
        });
        const freshTrack = pickRandom(result.items.filter((track) => !excludedTrackIds.has(track.id))) ?? null;
        const fallbackTrack = result.items.find((track) => activeItem?.track.id !== track.id) ?? result.items[0] ?? null;
        const targetTrack = freshTrack ?? fallbackTrack;

        if (!targetTrack) {
          return null;
        }

        return itemsRef.current.find((item) => item.track.id === targetTrack.id) ?? createQueueItem(targetTrack, source);
      } catch {
        return null;
      }
    },
    [],
  );

  const playTrack = useCallback(
    async (track: LibraryTrack, options: PlayTrackOptions = {}): Promise<PlaybackStatus> => {
      const source = options.source ?? manualSource;
      const replacementTracks = options.replaceQueueWith;
      const previousItem = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);

      if (replacementTracks) {
        const contextTracks = replacementTracks.some((item) => item.id === track.id)
          ? replacementTracks
          : [track, ...replacementTracks];
        const nextItems = contextTracks.map((item) => createQueueItem(item, source));
        const itemToPlay = nextItems.find((item) => item.track.id === track.id) ?? nextItems[0] ?? createQueueItem(track, source);
        const status = await playLocalTrack(itemToPlay);

        setItems(nextItems);
        setHistory([]);
        commitPlayedItem(itemToPlay, status, { previousItem });
        return status;
      }

      const existingItem = options.forceNewQueueItem ? null : itemsRef.current.find((item) => item.track.id === track.id);
      const itemToPlay = existingItem ?? createQueueItem(track, source);
      const status = await playLocalTrack(itemToPlay);

      if (!existingItem) {
        setItems((current) => [...current, itemToPlay]);
      }

      commitPlayedItem(itemToPlay, status, { previousItem });
      return status;
    },
    [commitPlayedItem, playLocalTrack, setHistory, setItems],
  );

  const playPrevious = useCallback(async (): Promise<PlaybackStatus | null> => {
    const previousFromHistory = historyRef.current[historyRef.current.length - 1];

    if (previousFromHistory) {
      const status = await playLocalTrack(previousFromHistory);
      setHistory((current) => current.slice(0, -1));
      commitPlayedItem(previousFromHistory, status, { recordHistory: false });
      return status;
    }

    const current = itemsRef.current;
    if (current.length === 0) {
      return null;
    }

    const currentIndex = findCurrentIndex(current, currentQueueIdRef.current, currentTrackIdRef.current);
    const targetIndex =
      currentIndex > 0
        ? currentIndex - 1
        : repeatModeRef.current === 'all' && current.length > 1
          ? current.length - 1
          : -1;
    const target = targetIndex >= 0 ? current[targetIndex] : null;

    if (!target) {
      return null;
    }

    const status = await playLocalTrack(target);
    commitPlayedItem(target, status, { recordHistory: false });
    return status;
  }, [commitPlayedItem, playLocalTrack, setHistory]);

  const playNext = useCallback(async (): Promise<PlaybackStatus | null> => {
    const current = itemsRef.current;
    const activeRepeatMode = repeatModeRef.current;
    const activeCurrentQueueId = currentQueueIdRef.current;
    const currentIndex = findCurrentIndex(current, activeCurrentQueueId, currentTrackIdRef.current);
    const activeItem = currentIndex >= 0 ? current[currentIndex] : findItemByQueueId(current, activeCurrentQueueId);

    if (activeRepeatMode === 'one') {
      if (activeItem) {
        const status = await playLocalTrack(activeItem);
        commitPlayedItem(activeItem, status, { recordHistory: false });
        return status;
      }

      const fallbackTrack = lastPlayedTrackRef.current;
      return fallbackTrack ? playTrack(fallbackTrack) : null;
    }

    if (current.length === 0) {
      return null;
    }

    let target: QueueItem | null = null;

    if (isShuffleEnabledRef.current) {
      const source = activeItem?.source ?? null;

      if (isLibraryRandomSource(source)) {
        target = await fetchLibraryShuffleTarget(source, activeItem ?? null);
      }

      let candidates = target ? [] : getShuffleCandidates(current, activeItem ?? null, historyRef.current);

      if (candidates.length === 0 && activeRepeatMode === 'all') {
        candidates = activeItem ? current.filter((item) => item.queueId !== activeItem.queueId) : current;
      }

      target = target ?? pickRandom(candidates);

      if (!target && activeRepeatMode === 'all') {
        target = activeItem ?? current[0] ?? null;
      }
    } else if (currentIndex >= 0 && currentIndex < current.length - 1) {
      target = current[currentIndex + 1] ?? null;
    } else if (currentIndex < 0) {
      target = current[0] ?? null;
    } else if (activeRepeatMode === 'all') {
      target = current[0] ?? null;
    }

    if (!target) {
      return null;
    }

    const status = await playLocalTrack(target);
    if (!itemsRef.current.some((item) => item.queueId === target.queueId)) {
      setItems((items) => [...items, target]);
    }
    commitPlayedItem(target, status);
    return status;
  }, [commitPlayedItem, fetchLibraryShuffleTarget, playLocalTrack, playTrack, setItems]);

  const setCurrentTrackId = useCallback(
    (trackId: string | null): void => {
      setCurrentTrackIdInternal(trackId);

      if (!trackId) {
        setCurrentQueueId(null);
        return;
      }

      const activeItem = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
      if (activeItem?.track.id === trackId) {
        return;
      }

      setCurrentQueueId(itemsRef.current.find((item) => item.track.id === trackId)?.queueId ?? null);
    },
    [setCurrentQueueId, setCurrentTrackIdInternal],
  );

  const canGoPrevious = useMemo(() => {
    if (history.length > 0) {
      return true;
    }

    const currentIndex = findCurrentIndex(items, currentQueueId, currentTrackId);
    return currentIndex > 0 || (repeatMode === 'all' && items.length > 1);
  }, [currentQueueId, currentTrackId, history.length, items, repeatMode]);

  const canGoNext = useMemo(() => {
    if (repeatMode === 'one' && (currentItem || lastPlayedTrack)) {
      return true;
    }

    if (items.length === 0) {
      return false;
    }

    const currentIndex = findCurrentIndex(items, currentQueueId, currentTrackId);

    if (isShuffleEnabled) {
      const activeItem = currentIndex >= 0 ? items[currentIndex] : findItemByQueueId(items, currentQueueId);
      if (isLibraryRandomSource(activeItem?.source)) {
        return true;
      }
      return getShuffleCandidates(items, activeItem ?? null, history).length > 0 || repeatMode === 'all';
    }

    return currentIndex < 0 || currentIndex < items.length - 1 || repeatMode === 'all';
  }, [currentItem, currentQueueId, currentTrackId, isShuffleEnabled, items, lastPlayedTrack, repeatMode]);

  const value = useMemo<PlaybackQueueContextValue>(
    () => ({
      items,
      tracks: items.map((item) => item.track),
      currentItem,
      currentQueueId,
      currentTrack,
      currentTrackId,
      lastPlayedTrack,
      history,
      isShuffleEnabled,
      repeatMode,
      canGoPrevious,
      canGoNext,
      replaceQueue,
      appendToQueue,
      appendTracksToQueue,
      playTrackNext,
      removeQueueItem,
      clearQueue,
      moveQueueItem,
      playQueueItem,
      playTrack,
      playPrevious,
      playNext,
      setCurrentTrackId,
      syncPlaybackState,
      toggleShuffle,
      setRepeatMode: setRepeatModeInternal,
    }),
    [
      appendToQueue,
      appendTracksToQueue,
      canGoNext,
      canGoPrevious,
      clearQueue,
      currentItem,
      currentQueueId,
      currentTrack,
      currentTrackId,
      history,
      isShuffleEnabled,
      items,
      lastPlayedTrack,
      moveQueueItem,
      playNext,
      playPrevious,
      playQueueItem,
      playTrack,
      playTrackNext,
      removeQueueItem,
      repeatMode,
      replaceQueue,
      setCurrentTrackId,
      setRepeatModeInternal,
      syncPlaybackState,
      toggleShuffle,
    ],
  );

  return <PlaybackQueueContext.Provider value={value}>{children}</PlaybackQueueContext.Provider>;
};

export const usePlaybackQueue = (): PlaybackQueueContextValue => {
  const context = useContext(PlaybackQueueContext);

  if (!context) {
    throw new Error('usePlaybackQueue must be used inside PlaybackQueueProvider');
  }

  return context;
};
