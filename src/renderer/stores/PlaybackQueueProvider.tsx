import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AudioPlaybackState } from '../../shared/types/audio';
import type { ConnectReceiverStatus } from '../../shared/types/connect';
import type { LibraryTrack } from '../../shared/types/library';
import type { LocalFileResolveResult, PlaybackStatus } from '../../shared/types/playback';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, streamingStableKey } from '../../shared/types/streaming';
import type { StreamingProviderName } from '../../shared/types/streaming';
import { isSpotifyTrack, playSpotifyTrack } from '../integrations/spotify/spotifyPlayback';
import { beginPlaybackSwitchSnapshot, setPlaybackStatusSnapshot } from './playbackStatusStore';

const playbackCancellationErrorMessage = 'audio_session_run_cancelled';

export const isPlaybackCancellationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(playbackCancellationErrorMessage);
};

export type QueueSource =
  | { type: 'songs'; label: string; search?: string; sort?: string; hideDuplicates?: boolean }
  | { type: 'album'; label: string; albumId: string }
  | { type: 'artist'; label: string; artistId?: string }
  | { type: 'folder'; label: string; folderId: string; path: string; recursive: boolean }
  | { type: 'streaming'; label: string; provider: string }
  | { type: 'local-file'; label: string }
  | { type: 'manual'; label: string };

export type QueueItem = {
  queueId: string;
  track: LibraryTrack;
  source: QueueSource;
  addedAt: string;
};

export type RepeatMode = 'off' | 'one' | 'all';

type PlaybackModeMemory = {
  isShuffleEnabled: boolean;
  repeatMode: RepeatMode;
};

type PlaybackQueueMemory = {
  version: 1;
  items: QueueItem[];
  currentQueueId: string | null;
  currentTrackId: string | null;
  lastPlayedTrack: LibraryTrack | null;
  history: QueueItem[];
};

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
  removeTrackFromQueue: (trackId: string) => number;
  clearQueue: () => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  playQueueItem: (queueId: string) => Promise<PlaybackStatus>;
  playTrack: (track: LibraryTrack, options?: PlayTrackOptions) => Promise<PlaybackStatus>;
  openTemporaryLocalFiles: (paths: string[]) => Promise<LocalFileResolveResult>;
  playPrevious: () => Promise<PlaybackStatus | null>;
  playNext: () => Promise<PlaybackStatus | null>;
  setCurrentTrackId: (trackId: string | null) => void;
  updateCurrentTrackSnapshot: (
    patch: Partial<
      Pick<
        LibraryTrack,
        | 'duration'
        | 'coverThumb'
        | 'title'
        | 'artist'
        | 'album'
        | 'codec'
        | 'sampleRate'
        | 'bitDepth'
        | 'bitrate'
        | 'bpm'
        | 'bpmConfidence'
        | 'beatOffsetMs'
        | 'analysisStatus'
        | 'analysisUpdatedAt'
      >
    >,
  ) => void;
  updateTrackSnapshot: (
    trackId: string,
    patch: Partial<
      Pick<
        LibraryTrack,
        | 'duration'
        | 'coverThumb'
        | 'title'
        | 'artist'
        | 'album'
        | 'codec'
        | 'sampleRate'
        | 'bitDepth'
        | 'bitrate'
        | 'bpm'
        | 'bpmConfidence'
        | 'beatOffsetMs'
        | 'analysisStatus'
        | 'analysisUpdatedAt'
      >
    >,
  ) => void;
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

const playbackModeMemoryKey = 'echo-next:playback-mode';
const playbackQueueMemoryKey = 'echo-next:playback-queue';

const defaultPlaybackModeMemory: PlaybackModeMemory = {
  isShuffleEnabled: false,
  repeatMode: 'off',
};

const defaultPlaybackQueueMemory: PlaybackQueueMemory = {
  version: 1,
  items: [],
  currentQueueId: null,
  currentTrackId: null,
  lastPlayedTrack: null,
  history: [],
};

const isRepeatMode = (value: unknown): value is RepeatMode => value === 'off' || value === 'one' || value === 'all';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const deferQueueBackgroundTask = (callback: () => void): (() => void) => {
  let cancelled = false;
  let timeoutId: number | null = null;
  const requestIdleCallback = window.requestIdleCallback;
  const cancelIdleCallback = window.cancelIdleCallback;
  let idleId: number | null = null;

  if (typeof requestIdleCallback === 'function') {
    idleId = requestIdleCallback(() => {
      if (!cancelled) {
        callback();
      }
    }, { timeout: 1200 });
  } else {
    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        callback();
      }
    }, 160);
  }

  return () => {
    cancelled = true;
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
};

const isLibraryTrackSnapshot = (value: unknown): value is LibraryTrack =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.path === 'string' &&
  typeof value.title === 'string' &&
  typeof value.artist === 'string' &&
  typeof value.album === 'string' &&
  typeof value.albumArtist === 'string' &&
  typeof value.duration === 'number' &&
  isRecord(value.fieldSources);

const isQueueSource = (value: unknown): value is QueueSource =>
  isRecord(value) &&
  typeof value.type === 'string' &&
  typeof value.label === 'string' &&
  ['songs', 'album', 'artist', 'folder', 'streaming', 'local-file', 'manual'].includes(value.type);

const isQueueItemSnapshot = (value: unknown): value is QueueItem =>
  isRecord(value) &&
  typeof value.queueId === 'string' &&
  typeof value.addedAt === 'string' &&
  isQueueSource(value.source) &&
  isLibraryTrackSnapshot(value.track);

const readPlaybackModeMemory = (): PlaybackModeMemory => {
  if (typeof window === 'undefined') {
    return defaultPlaybackModeMemory;
  }

  try {
    const raw = window.localStorage.getItem(playbackModeMemoryKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<PlaybackModeMemory>) : {};

    return {
      isShuffleEnabled: parsed.isShuffleEnabled === true,
      repeatMode: isRepeatMode(parsed.repeatMode) ? parsed.repeatMode : 'off',
    };
  } catch {
    return defaultPlaybackModeMemory;
  }
};

const writePlaybackModeMemory = (memory: PlaybackModeMemory): void => {
  try {
    window.localStorage.setItem(playbackModeMemoryKey, JSON.stringify(memory));
  } catch {
    // Playback controls should keep working even when browser storage is unavailable.
  }
};

const readPlaybackQueueMemory = (): PlaybackQueueMemory => {
  if (typeof window === 'undefined') {
    return defaultPlaybackQueueMemory;
  }

  try {
    const raw = window.localStorage.getItem(playbackQueueMemoryKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<PlaybackQueueMemory>) : {};
    const items = Array.isArray(parsed.items) ? parsed.items.filter(isQueueItemSnapshot) : [];
    const queueIds = new Set(items.map((item) => item.queueId));
    const currentQueueId = typeof parsed.currentQueueId === 'string' && queueIds.has(parsed.currentQueueId) ? parsed.currentQueueId : null;
    const currentTrackId = typeof parsed.currentTrackId === 'string' ? parsed.currentTrackId : currentQueueId ? items.find((item) => item.queueId === currentQueueId)?.track.id ?? null : null;
    const lastPlayedTrack = isLibraryTrackSnapshot(parsed.lastPlayedTrack) ? parsed.lastPlayedTrack : null;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((item): item is QueueItem => isQueueItemSnapshot(item) && queueIds.has(item.queueId))
      : [];

    return {
      version: 1,
      items,
      currentQueueId,
      currentTrackId,
      lastPlayedTrack,
      history,
    };
  } catch {
    return defaultPlaybackQueueMemory;
  }
};

const writePlaybackQueueMemory = (memory: PlaybackQueueMemory): void => {
  try {
    window.localStorage.setItem(playbackQueueMemoryKey, JSON.stringify(memory));
  } catch {
    // Queue state is a convenience snapshot; playback should continue if storage is full or unavailable.
  }
};

const isStreamingProviderName = (provider: string | null | undefined): provider is StreamingProviderName =>
  streamingProviderNames.includes(provider as StreamingProviderName);

const toPlayableTrack = (track: LibraryTrack): PlayableTrack => {
  if (track.mediaType === 'streaming') {
    const provider = isStreamingProviderName(track.provider) ? track.provider : 'mock';
    const providerTrackId = track.providerTrackId ?? track.id;
    const stableKey = track.stableKey ?? streamingStableKey(provider, providerTrackId);

    return {
      mediaType: 'streaming',
      trackId: track.id,
      provider,
      providerTrackId,
      quality: track.streamingQuality,
      stableKey,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
      playable: track.unavailable !== true,
      unavailableReason: track.unavailable ? 'This streaming track is unavailable.' : null,
    };
  }

  return {
    mediaType: 'remote',
    trackId: track.id,
    sourceId: track.sourceId ?? null,
    stableKey: track.stableKey ?? null,
    remotePath: track.remotePath ?? null,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    coverThumb: track.coverThumb,
  };
};

const manualSource: QueueSource = { type: 'manual', label: 'Manual queue' };

const receiverTrackIdPrefix = 'dlna-receiver:';

const isActiveReceiverStatus = (status: ConnectReceiverStatus): boolean =>
  Boolean(status.currentUri && ['ready', 'loading', 'playing', 'paused'].includes(status.state));

const receiverStatusToPlaybackState = (status: ConnectReceiverStatus): AudioPlaybackState => {
  switch (status.state) {
    case 'loading':
    case 'playing':
    case 'paused':
    case 'stopped':
    case 'error':
      return status.state;
    default:
      return 'stopped';
  }
};

const createReceiverTrackSnapshot = (status: ConnectReceiverStatus): LibraryTrack | null => {
  if (!status.currentUri || !status.metadata) {
    return null;
  }

  return {
    id: `${receiverTrackIdPrefix}${status.currentUri}`,
    mediaType: 'remote',
    isTemporary: true,
    path: status.currentUri,
    sourceId: null,
    remotePath: status.currentUri,
    stableKey: status.currentUri,
    title: status.metadata.title,
    artist: status.metadata.artist,
    album: status.metadata.album ?? '',
    albumArtist: status.metadata.albumArtist ?? status.metadata.artist,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: status.durationSeconds || status.metadata.durationSeconds || 0,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: null,
    coverThumb: status.metadata.coverHttpUrl || null,
    fieldSources: {
      title: 'dlna',
      artist: 'dlna',
      album: 'dlna',
      albumArtist: 'dlna',
      cover: 'dlna',
    },
  };
};

const isSameReceiverTrackSnapshot = (left: LibraryTrack | null, right: LibraryTrack): boolean =>
  Boolean(
    left &&
      left.id === right.id &&
      left.path === right.path &&
      left.title === right.title &&
      left.artist === right.artist &&
      left.album === right.album &&
      left.albumArtist === right.albumArtist &&
      left.duration === right.duration &&
      left.coverThumb === right.coverThumb,
  );

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

const statusForPlaybackFailure = (track: LibraryTrack): PlaybackStatus => ({
  state: 'error',
  currentTrackId: track.id,
  positionMs: 0,
  durationMs: Math.round(Math.max(0, track.duration) * 1000),
  filePath: track.stableKey ?? track.path,
});

const playbackStatusForItem = (status: PlaybackStatus, item: QueueItem): PlaybackStatus => {
  if (status.currentTrackId === item.track.id) {
    return status;
  }

  return {
    ...status,
    currentTrackId: item.track.id,
    durationMs: status.durationMs > 0 ? status.durationMs : Math.round(Math.max(0, item.track.duration) * 1000),
  };
};

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
  const initialPlaybackMode = useMemo(() => readPlaybackModeMemory(), []);
  const initialPlaybackQueue = useMemo(() => readPlaybackQueueMemory(), []);
  const [items, setItemsState] = useState<QueueItem[]>(initialPlaybackQueue.items);
  const [currentQueueId, setCurrentQueueIdState] = useState<string | null>(initialPlaybackQueue.currentQueueId);
  const [currentTrackId, setCurrentTrackIdState] = useState<string | null>(initialPlaybackQueue.currentTrackId);
  const [lastPlayedTrack, setLastPlayedTrackState] = useState<LibraryTrack | null>(initialPlaybackQueue.lastPlayedTrack);
  const [history, setHistoryState] = useState<QueueItem[]>(initialPlaybackQueue.history);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(initialPlaybackMode.isShuffleEnabled);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialPlaybackMode.repeatMode);

  const itemsRef = useRef(items);
  const currentQueueIdRef = useRef(currentQueueId);
  const currentTrackIdRef = useRef(currentTrackId);
  const lastPlayedTrackRef = useRef(lastPlayedTrack);
  const historyRef = useRef(history);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const playbackHistorySessionRef = useRef<PlaybackHistorySession | null>(null);
  const pausedSessionTimerRef = useRef<number | null>(null);
  const playRequestTokenRef = useRef(0);
  const playbackStatusTokensRef = useRef<WeakMap<PlaybackStatus, number>>(new WeakMap());
  const playbackStatusPreviousItemRef = useRef<WeakMap<PlaybackStatus, QueueItem | null>>(new WeakMap());
  const cancelLocalPrepareRef = useRef<(() => void) | null>(null);

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
    writePlaybackModeMemory({
      isShuffleEnabled: isShuffleEnabledRef.current,
      repeatMode: mode,
    });
  }, []);

  const toggleShuffle = useCallback((): void => {
    const next = !isShuffleEnabledRef.current;
    isShuffleEnabledRef.current = next;
    setIsShuffleEnabled(next);
    if (next && repeatModeRef.current === 'all') {
      setRepeatModeInternal('off');
    } else {
      writePlaybackModeMemory({
        isShuffleEnabled: next,
        repeatMode: repeatModeRef.current,
      });
    }
  }, [setRepeatModeInternal]);

  useEffect(() => {
    writePlaybackQueueMemory({
      version: 1,
      items,
      currentQueueId,
      currentTrackId,
      lastPlayedTrack,
      history,
    });
  }, [currentQueueId, currentTrackId, history, items, lastPlayedTrack]);

  useEffect(() => {
    const unsubscribe = window.echo?.connect?.onReceiverStatus?.((status) => {
      if (status.enabled && isActiveReceiverStatus(status)) {
        const receiverTrack = createReceiverTrackSnapshot(status);
        if (!receiverTrack) {
          return;
        }
        if (currentQueueIdRef.current !== null) {
          setCurrentQueueId(null);
        }
        if (!isSameReceiverTrackSnapshot(lastPlayedTrackRef.current, receiverTrack)) {
          setLastPlayedTrack(receiverTrack);
        }
        if (currentTrackIdRef.current !== receiverTrack.id) {
          setCurrentTrackIdInternal(receiverTrack.id);
        }
        setPlaybackStatusSnapshot({
          playbackStatus: {
            state: receiverStatusToPlaybackState(status),
            currentTrackId: receiverTrack.id,
            positionMs: Math.round(status.positionSeconds * 1000),
            durationMs: Math.round((status.durationSeconds || receiverTrack.duration) * 1000),
            filePath: receiverTrack.path,
          },
          error: status.error,
        });
        return;
      }

      if (currentTrackIdRef.current?.startsWith(receiverTrackIdPrefix)) {
        setCurrentQueueId(null);
        setCurrentTrackIdInternal(null);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [setCurrentQueueId, setCurrentTrackIdInternal, setLastPlayedTrack]);

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
          durationSeconds: session.track.duration > 0 ? session.track.duration : undefined,
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
      const isStreamingTrack = item.track.mediaType === 'streaming';
      const result = await library.startPlaybackHistory(
        isStreamingTrack
          ? {
              trackId: null,
              mediaType: 'streaming',
              provider: item.track.provider,
              providerTrackId: item.track.providerTrackId,
              stableKey: item.track.stableKey,
              trackPath: item.track.stableKey ?? item.track.id,
              title: item.track.title,
              artist: item.track.artist,
              album: item.track.album,
              albumArtist: item.track.albumArtist,
              coverId: item.track.coverId,
              coverSnapshot: item.track.coverThumb,
              durationSeconds: item.track.duration,
              sourceType: 'streaming',
              sourceLabel: item.source.label,
              queueId: item.queueId,
            }
          : item.track.isTemporary
          ? {
              trackId: null,
              trackPath: item.track.path,
              title: item.track.title,
              artist: item.track.artist,
              album: item.track.album,
              albumArtist: item.track.albumArtist,
              coverId: item.track.coverId,
              durationSeconds: item.track.duration,
              sourceType: item.source.type,
              sourceLabel: item.source.label,
              queueId: item.queueId,
            }
          : {
              trackId: item.track.id,
              mediaType: item.track.mediaType,
              sourceId: item.track.sourceId,
              stableKey: item.track.stableKey,
              remotePath: item.track.remotePath,
              sourceType: item.source.type,
              sourceLabel: item.source.label,
              queueId: item.queueId,
            },
      );
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

  useEffect(() => () => {
    cancelLocalPrepareRef.current?.();
    cancelLocalPrepareRef.current = null;
  }, []);

  const playLocalTrack = useCallback(async (item: QueueItem): Promise<PlaybackStatus> => {
    const playback = window.echo?.playback;
    const track = item.track;
    const requestToken = playRequestTokenRef.current + 1;
    playRequestTokenRef.current = requestToken;

    const previousItem = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
    void finishPlaybackHistorySession();
    setCurrentQueueId(item.queueId);
    setCurrentTrackIdInternal(item.track.id);
    setLastPlayedTrack(item.track);
    beginPlaybackSwitchSnapshot({
      state: 'loading',
      currentTrackId: item.track.id,
      positionMs: 0,
      durationMs: Math.round(Math.max(0, item.track.duration) * 1000),
      filePath: track.path,
    });
    const rawStatus = await (async () => {
      try {
        return isSpotifyTrack(track)
          ? await (async () => {
              await playback?.stop?.().catch(() => undefined);
              return playSpotifyTrack(track);
            })()
          : await (() => {
              if (!playback) {
                throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to play local files.');
              }

              return (track.mediaType === 'remote' || track.mediaType === 'streaming') && playback.playMediaItem
                ? playback.playMediaItem({
                    item: toPlayableTrack(track),
                  })
                : playback.playLocalFile({
                    filePath: track.path,
                    trackId: track.id,
                    probe: createProbeFromTrack(track),
                  });
            })();
      } catch (error) {
        if (playRequestTokenRef.current !== requestToken) {
          throw new Error(playbackCancellationErrorMessage);
        }

        setPlaybackStatusSnapshot({
          playbackStatus: statusForPlaybackFailure(item.track),
          error: error instanceof Error ? error.message : String(error),
          playbackVisualIntent: null,
        });
        throw error;
      }
    })();
    const status = playbackStatusForItem(rawStatus, item);
    playbackStatusTokensRef.current.set(status, requestToken);
    playbackStatusPreviousItemRef.current.set(status, previousItem);
    if (playRequestTokenRef.current === requestToken) {
      void startPlaybackHistorySession(item);
    }
    return status;
  }, [finishPlaybackHistorySession, setCurrentQueueId, setCurrentTrackIdInternal, setLastPlayedTrack, startPlaybackHistorySession]);

  const autoSearchMv = useCallback((trackId: string): void => {
    const mvApi = window.echo?.mv;
    if (!mvApi?.getSelected) {
      return;
    }

    deferQueueBackgroundTask(() => {
      void (async () => {
        const settings = await mvApi.getSettings?.();
        const candidates = settings?.enabled !== false && settings?.autoSearch && mvApi.searchNetworkCandidates ? await mvApi.searchNetworkCandidates(trackId) : [];
        window.dispatchEvent(new CustomEvent('mv:candidatesChanged', { detail: { trackId, candidates } }));
        await mvApi.getSelected(trackId);
        window.dispatchEvent(new CustomEvent('mv:changed', { detail: { trackId } }));
      })().catch(() => undefined);
    });
  }, []);

  const prepareNextMediaItem = useCallback((item: QueueItem): void => {
    const playback = window.echo?.playback;
    cancelLocalPrepareRef.current?.();
    cancelLocalPrepareRef.current = null;

    if (!playback?.prepareMediaItem && !playback?.prepareLocalFile) {
      return;
    }

    const current = itemsRef.current;
    const index = current.findIndex((candidate) => candidate.queueId === item.queueId);
    const next = index >= 0 && index < current.length - 1 ? current[index + 1] : null;
    if (!next) {
      return;
    }

    if (isSpotifyTrack(next.track)) {
      return;
    }

    if (next.track.mediaType === 'remote' || next.track.mediaType === 'streaming') {
      if (playback.prepareMediaItem) {
        void playback.prepareMediaItem({ item: toPlayableTrack(next.track) }).catch(() => undefined);
      }
      return;
    }

    if (!playback.prepareLocalFile) {
      return;
    }

    const expectedCurrentQueueId = item.queueId;
    const expectedNextQueueId = next.queueId;
    cancelLocalPrepareRef.current = deferQueueBackgroundTask(() => {
      const latestItems = itemsRef.current;
      const latestIndex = latestItems.findIndex((candidate) => candidate.queueId === expectedCurrentQueueId);
      const stillCurrent = currentQueueIdRef.current === expectedCurrentQueueId;
      const stillNext = latestIndex >= 0 && latestItems[latestIndex + 1]?.queueId === expectedNextQueueId;

      if (!stillCurrent || !stillNext) {
        return;
      }

      void playback.prepareLocalFile({
        filePath: next.track.path,
        trackId: next.track.id,
        probe: createProbeFromTrack(next.track),
      }).catch(() => undefined);
    });
  }, []);

  const commitPlayedItem = useCallback(
    (item: QueueItem, status: PlaybackStatus, options: { recordHistory?: boolean; previousItem?: QueueItem | null } = {}): void => {
      const requestToken = playbackStatusTokensRef.current.get(status);
      if (requestToken && requestToken !== playRequestTokenRef.current) {
        return;
      }

      const previousItem =
        options.previousItem ??
        playbackStatusPreviousItemRef.current.get(status) ??
        findItemByQueueId(itemsRef.current, currentQueueIdRef.current);

      if (options.recordHistory !== false && previousItem && previousItem.queueId !== item.queueId) {
        setHistory((current) => [...current, previousItem]);
      }

      setLastPlayedTrack(item.track);
      setCurrentQueueId(item.queueId);
      setCurrentTrackIdInternal(status.currentTrackId ?? item.track.id);
      setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
      if (item.track.mediaType !== 'streaming') {
        autoSearchMv(item.track.id);
      }
      prepareNextMediaItem(item);
    },
    [autoSearchMv, prepareNextMediaItem, setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setLastPlayedTrack],
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

  const removeTrackFromQueue = useCallback(
    (trackId: string): number => {
      const queuedCount = itemsRef.current.filter((item) => item.track.id === trackId).length;
      if (queuedCount === 0) {
        return 0;
      }

      const wasCurrentTrack = findItemByQueueId(itemsRef.current, currentQueueIdRef.current)?.track.id === trackId;
      setItems((current) => current.filter((item) => item.track.id !== trackId));
      setHistory((current) => current.filter((item) => item.track.id !== trackId));

      if (wasCurrentTrack) {
        setCurrentQueueId(null);
      }

      return queuedCount;
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
          pageSize: 500,
          search: source.search,
          sort: 'random',
          hideDuplicates: source.hideDuplicates,
          duplicateMode: 'strict',
        });
        const freshTrack = pickRandom(result.items.filter((track) => !excludedTrackIds.has(track.id))) ?? null;

        if (!freshTrack) {
          return null;
        }

        return itemsRef.current.find((item) => item.track.id === freshTrack.id) ?? createQueueItem(freshTrack, source);
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

  const openTemporaryLocalFiles = useCallback(
    async (paths: string[]): Promise<LocalFileResolveResult> => {
      const playback = window.echo?.playback;

      if (!playback?.resolveLocalAudioFiles) {
        throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to open local files.');
      }

      const result = await playback.resolveLocalAudioFiles(paths);
      if (result.tracks.length === 0) {
        return result;
      }

      const source: QueueSource = { type: 'local-file', label: 'Local files' };
      const nextItems = result.tracks.map((track) => createQueueItem(track, source));
      const firstItem = nextItems[0];
      const previousItem = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
      const status = await playLocalTrack(firstItem);

      setItems((current) => [...current, ...nextItems]);
      commitPlayedItem(firstItem, status, { previousItem });

      return result;
    },
    [commitPlayedItem, playLocalTrack, setItems],
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
      let candidates = getShuffleCandidates(current, activeItem ?? null, historyRef.current);

      target = pickRandom(candidates);

      if (!target && isLibraryRandomSource(source)) {
        target = await fetchLibraryShuffleTarget(source, activeItem ?? null);
      }

      if (!target && activeRepeatMode === 'all') {
        candidates = activeItem ? current.filter((item) => item.queueId !== activeItem.queueId) : current;
        target = pickRandom(candidates);
      }

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

  const updateCurrentTrackSnapshot = useCallback(
    (
      patch: Partial<
        Pick<
          LibraryTrack,
          | 'duration'
          | 'coverThumb'
          | 'title'
          | 'artist'
          | 'album'
          | 'codec'
          | 'sampleRate'
          | 'bitDepth'
          | 'bitrate'
          | 'bpm'
          | 'bpmConfidence'
          | 'beatOffsetMs'
          | 'analysisStatus'
          | 'analysisUpdatedAt'
        >
      >,
    ): void => {
      const queueId = currentQueueIdRef.current;
      const trackId = currentTrackIdRef.current;
      setItems((current) =>
        current.map((item) =>
          (queueId && item.queueId === queueId) || (!queueId && trackId && item.track.id === trackId)
            ? { ...item, track: { ...item.track, ...patch } }
            : item,
        ),
      );
      if (lastPlayedTrackRef.current && trackId && lastPlayedTrackRef.current.id === trackId) {
        setLastPlayedTrack({ ...lastPlayedTrackRef.current, ...patch });
      }
      if (playbackHistorySessionRef.current && trackId && playbackHistorySessionRef.current.track.id === trackId) {
        playbackHistorySessionRef.current.track = {
          ...playbackHistorySessionRef.current.track,
          ...patch,
        };
      }
    },
    [setItems, setLastPlayedTrack],
  );

  const updateTrackSnapshot = useCallback(
    (
      trackId: string,
      patch: Partial<
        Pick<
          LibraryTrack,
          | 'duration'
          | 'coverThumb'
          | 'title'
          | 'artist'
          | 'album'
          | 'codec'
          | 'sampleRate'
          | 'bitDepth'
          | 'bitrate'
          | 'bpm'
          | 'bpmConfidence'
          | 'beatOffsetMs'
          | 'analysisStatus'
          | 'analysisUpdatedAt'
        >
      >,
    ): void => {
      setItems((current) =>
        current.map((item) => (item.track.id === trackId ? { ...item, track: { ...item.track, ...patch } } : item)),
      );
      if (lastPlayedTrackRef.current?.id === trackId) {
        setLastPlayedTrack({ ...lastPlayedTrackRef.current, ...patch });
      }
      if (playbackHistorySessionRef.current?.track.id === trackId) {
        playbackHistorySessionRef.current.track = {
          ...playbackHistorySessionRef.current.track,
          ...patch,
        };
      }
    },
    [setItems, setLastPlayedTrack],
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
  }, [currentItem, currentQueueId, currentTrackId, history, isShuffleEnabled, items, lastPlayedTrack, repeatMode]);

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
      removeTrackFromQueue,
      clearQueue,
      moveQueueItem,
      playQueueItem,
      playTrack,
      openTemporaryLocalFiles,
      playPrevious,
      playNext,
      setCurrentTrackId,
      updateCurrentTrackSnapshot,
      updateTrackSnapshot,
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
      openTemporaryLocalFiles,
      playTrackNext,
      removeQueueItem,
      removeTrackFromQueue,
      repeatMode,
      replaceQueue,
      setCurrentTrackId,
      updateCurrentTrackSnapshot,
      updateTrackSnapshot,
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
