import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AudioOutputSettings, AudioPlaybackState, AudioStatus, PlaybackSpeedMode } from '../../shared/types/audio';
import type { AppSettings } from '../../shared/types/appSettings';
import type { AirPlayReceiverStatus, ConnectReceiverStatus, ConnectSessionStatus } from '../../shared/types/connect';
import { hqPlayerConnectDeviceId } from '../../shared/types/connect';
import type { LibraryTrack } from '../../shared/types/library';
import type {
  LocalFileResolveResult,
  PlaybackStatus,
  PersistedPlaybackRepeatMode,
  PersistedPlaybackSessionResume,
  PersistedPlaybackSessionV1,
  PersistedQueueItem,
  PersistedQueueSource,
} from '../../shared/types/playback';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import type { ReplayGainTrackData } from '../../shared/utils/replayGain';
import { streamingProviderNames, streamingStableKey } from '../../shared/types/streaming';
import type { StreamingProviderName } from '../../shared/types/streaming';
import { isSpotifyTrack, pauseSpotifyPlayback, playSpotifyTrack } from '../integrations/spotify/spotifyPlayback';
import { beginPlaybackSwitchSnapshot, setPlaybackStatusSnapshot } from './playbackStatusStore';

const playbackCancellationErrorMessage = 'audio_session_run_cancelled';
const activePlaybackStates = new Set<AudioStatus['state']>(['loading', 'playing', 'paused']);
const clampPlaybackRate = (value: number): number => Math.max(0.5, Math.min(2, value));
const normalizePlaybackSpeedMode = (value: unknown): PlaybackSpeedMode | null =>
  value === 'daycore' || value === 'speed' || value === 'nightcore' ? value : null;

const createPlaybackSpeedOutput = (
  playbackRate: unknown,
  playbackSpeedMode: unknown,
  fallbackMode: PlaybackSpeedMode | null = null,
): Pick<AudioOutputSettings, 'playbackRate' | 'playbackSpeedMode'> | null => {
  const rate = Number(playbackRate);
  if (!Number.isFinite(rate)) {
    return null;
  }

  return {
    playbackRate: clampPlaybackRate(rate),
    playbackSpeedMode: normalizePlaybackSpeedMode(playbackSpeedMode) ?? fallbackMode ?? 'nightcore',
  };
};

const resolvePlaybackSpeedOutput = async (): Promise<Pick<AudioOutputSettings, 'playbackRate' | 'playbackSpeedMode'> | undefined> => {
  const [settings, status] = await Promise.all([
    window.echo?.app?.getSettings?.().catch(() => null) ?? Promise.resolve(null),
    window.echo?.audio?.getStatus?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  const settingsOutput = createPlaybackSpeedOutput(settings?.playbackSpeed, settings?.playbackSpeedMode);
  const statusOutput = createPlaybackSpeedOutput(status?.playbackRate, status?.playbackSpeedMode, settingsOutput?.playbackSpeedMode ?? null);

  if (status && activePlaybackStates.has(status.state) && statusOutput) {
    return statusOutput;
  }

  return settingsOutput ?? statusOutput ?? undefined;
};

export const isPlaybackCancellationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(playbackCancellationErrorMessage);
};

export type QueueSource = PersistedQueueSource;

export type QueueItem = PersistedQueueItem;

const playbackStateFromConnectStatus = (status: ConnectSessionStatus): AudioPlaybackState => {
  switch (status.state) {
    case 'playing':
      return 'playing';
    case 'paused':
      return 'paused';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'loading';
  }
};

const playbackStatusFromConnectStatus = (status: ConnectSessionStatus, item: QueueItem): PlaybackStatus => ({
  state: playbackStateFromConnectStatus(status),
  currentTrackId: status.currentTrackId ?? item.track.id,
  positionMs: Math.round(Math.max(0, status.positionSeconds) * 1000),
  durationMs: Math.round(Math.max(0, status.durationSeconds || item.track.duration) * 1000),
  filePath: item.track.path,
});

export type RepeatMode = PersistedPlaybackRepeatMode;

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
  resume: PersistedPlaybackSessionResume | null;
};

type HydratedPlaybackSession = PlaybackQueueMemory & {
  mode: PlaybackModeMemory;
  automixEnabled: boolean;
};

type ReplaceQueueOptions = {
  startTrackId?: string;
  source?: QueueSource;
};

type PlayTrackOptions = {
  source?: QueueSource;
  replaceQueueWith?: LibraryTrack[];
  forceNewQueueItem?: boolean;
  routeToConnectOutput?: boolean;
  startSeconds?: number;
  forceRefresh?: boolean;
};

type PlayNextOptions = {
  autoAdvance?: boolean;
};

type PlayLocalTrackOptions = {
  routeToConnectOutput?: boolean;
  startSeconds?: number;
  forceRefresh?: boolean;
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
  automixEnabled: boolean;
  gaplessPlaybackEnabled: boolean;
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
  playNext: (options?: PlayNextOptions) => Promise<PlaybackStatus | null>;
  setAutomixEnabled: (enabled: boolean) => void;
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
const automixEnabledMemoryKey = 'echo-next:automix-enabled';
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
  resume: null,
};

const defaultHydratedPlaybackSession: HydratedPlaybackSession = {
  ...defaultPlaybackQueueMemory,
  mode: defaultPlaybackModeMemory,
  automixEnabled: false,
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

const readAutomixEnabledMemory = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(automixEnabledMemoryKey) === 'true';
  } catch {
    return false;
  }
};

const writeAutomixEnabledMemory = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(automixEnabledMemoryKey, enabled ? 'true' : 'false');
  } catch {
    // Automix is optional; storage failures should not block playback.
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
      resume: null,
    };
  } catch {
    return defaultPlaybackQueueMemory;
  }
};

const writePlaybackQueueMemory = (memory: PlaybackQueueMemory): void => {
  try {
    const legacyMemory = {
      version: memory.version,
      items: memory.items,
      currentQueueId: memory.currentQueueId,
      currentTrackId: memory.currentTrackId,
      lastPlayedTrack: memory.lastPlayedTrack,
      history: memory.history,
    };
    window.localStorage.setItem(playbackQueueMemoryKey, JSON.stringify(legacyMemory));
  } catch {
    // Queue state is a convenience snapshot; playback should continue if storage is full or unavailable.
  }
};

const hasPlaybackSessionPersistence = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.echo?.playback?.getQueueSession === 'function' &&
  typeof window.echo.playback.saveQueueSession === 'function';

const shouldUseLegacyPlaybackStorage = (): boolean => !hasPlaybackSessionPersistence();

const clearLegacyPlaybackMemory = (): void => {
  try {
    window.localStorage.removeItem(playbackQueueMemoryKey);
    window.localStorage.removeItem(playbackModeMemoryKey);
    window.localStorage.removeItem(automixEnabledMemoryKey);
  } catch {
    // Legacy migration cleanup is best-effort.
  }
};

const readLegacyPlaybackSession = (): HydratedPlaybackSession => ({
  ...readPlaybackQueueMemory(),
  mode: readPlaybackModeMemory(),
  automixEnabled: readAutomixEnabledMemory(),
});

const hasLegacyPlaybackSession = (session: HydratedPlaybackSession): boolean =>
  session.items.length > 0 ||
  session.history.length > 0 ||
  Boolean(session.currentTrackId) ||
  Boolean(session.lastPlayedTrack) ||
  session.mode.isShuffleEnabled ||
  session.mode.repeatMode !== 'off' ||
  session.automixEnabled;

const isResumeMemory = (
  value: unknown,
  items: QueueItem[],
): value is PersistedPlaybackSessionResume => {
  if (!isRecord(value) || typeof value.filePath !== 'string') {
    return false;
  }

  const queueId = typeof value.queueId === 'string' ? value.queueId : null;
  const trackId = typeof value.trackId === 'string' ? value.trackId : null;

  return items.some((item) =>
    (queueId && item.queueId === queueId) ||
    (trackId && item.track.id === trackId) ||
    item.track.path === value.filePath,
  );
};

const playbackSessionFromPersisted = (session: PersistedPlaybackSessionV1 | null): HydratedPlaybackSession => {
  if (!session) {
    return defaultHydratedPlaybackSession;
  }

  const items = Array.isArray(session.items) ? session.items.filter(isQueueItemSnapshot) : [];
  const queueIds = new Set(items.map((item) => item.queueId));
  const currentQueueId = session.currentQueueId && queueIds.has(session.currentQueueId) ? session.currentQueueId : null;
  const currentTrackId =
    typeof session.currentTrackId === 'string'
      ? session.currentTrackId
      : currentQueueId
        ? items.find((item) => item.queueId === currentQueueId)?.track.id ?? null
        : null;
  const history = Array.isArray(session.history)
    ? session.history.filter((item): item is QueueItem => isQueueItemSnapshot(item) && queueIds.has(item.queueId))
    : [];

  return {
    version: 1,
    items,
    currentQueueId,
    currentTrackId,
    lastPlayedTrack: isLibraryTrackSnapshot(session.lastPlayedTrack) ? session.lastPlayedTrack : null,
    history,
    resume: isResumeMemory(session.resume, items) ? session.resume : null,
    mode: {
      isShuffleEnabled: session.mode?.isShuffleEnabled === true,
      repeatMode: isRepeatMode(session.mode?.repeatMode) ? session.mode.repeatMode : 'off',
    },
    automixEnabled: session.mode?.automixEnabled === true,
  };
};

const createPersistedSessionSnapshot = (session: HydratedPlaybackSession): PersistedPlaybackSessionV1 => ({
  version: 1,
  items: session.items,
  currentQueueId: session.currentQueueId,
  currentTrackId: session.currentTrackId,
  lastPlayedTrack: session.lastPlayedTrack,
  history: session.history,
  mode: {
    isShuffleEnabled: session.mode.isShuffleEnabled,
    repeatMode: session.mode.repeatMode,
    automixEnabled: session.automixEnabled,
  },
  resume: isResumeMemory(session.resume, session.items) ? session.resume : null,
  updatedAt: new Date().toISOString(),
});

const isStreamingProviderName = (provider: string | null | undefined): provider is StreamingProviderName =>
  streamingProviderNames.includes(provider as StreamingProviderName);

const replayGainFromTrack = (track: LibraryTrack): ReplayGainTrackData | null => {
  const replayGain: ReplayGainTrackData = {
    trackGainDb: track.replayGainTrackGainDb ?? null,
    albumGainDb: track.replayGainAlbumGainDb ?? null,
    trackPeak: track.replayGainTrackPeak ?? null,
    albumPeak: track.replayGainAlbumPeak ?? null,
    integratedLufs: track.replayGainIntegratedLufs ?? null,
  };
  return Object.values(replayGain).some((value) => typeof value === 'number' && Number.isFinite(value)) ? replayGain : null;
};

const toPlayableTrack = (track: LibraryTrack): PlayableTrack => {
  const replayGain = replayGainFromTrack(track);
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
      replayGain,
      playable: track.unavailable !== true,
      unavailableReason: track.unavailable ? 'This streaming track is unavailable.' : null,
    };
  }

  if (track.mediaType === 'remote') {
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
      replayGain,
    };
  }

  return {
    mediaType: 'local',
    trackId: track.id,
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    coverThumb: track.coverThumb,
    replayGain,
  };
};

const shouldReplaceExistingQueueTrack = (existingTrack: LibraryTrack, requestedTrack: LibraryTrack): boolean =>
  existingTrack.mediaType === 'streaming' &&
  requestedTrack.mediaType === 'streaming' &&
  (
    existingTrack.streamingQuality !== requestedTrack.streamingQuality ||
    existingTrack.provider !== requestedTrack.provider ||
    existingTrack.providerTrackId !== requestedTrack.providerTrackId
  );

const manualSource: QueueSource = { type: 'manual', label: 'Manual queue' };

const receiverTrackIdPrefix = 'dlna-receiver:';
const airPlayReceiverTrackIdPrefix = 'airplay-receiver:';

const isActiveReceiverStatus = (status: ConnectReceiverStatus): boolean =>
  Boolean(status.currentUri && ['ready', 'loading', 'playing', 'paused'].includes(status.state));

const isActiveAirPlayReceiverStatus = (status: AirPlayReceiverStatus): boolean =>
  Boolean(status.metadata && ['ready', 'playing', 'paused'].includes(status.state));

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

const airPlayStatusToPlaybackState = (status: AirPlayReceiverStatus): AudioPlaybackState => {
  switch (status.state) {
    case 'playing':
    case 'paused':
    case 'stopped':
    case 'error':
      return status.state;
    case 'ready':
    case 'starting':
      return 'loading';
    default:
      return 'stopped';
  }
};

const hashSnapshotText = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const receiverSnapshotIdentity = (metadata: { title?: string | null; artist?: string | null; album?: string | null } | null, durationSeconds: number): string =>
  hashSnapshotText([
    metadata?.title?.trim().toLocaleLowerCase() ?? '',
    metadata?.artist?.trim().toLocaleLowerCase() ?? '',
    metadata?.album?.trim().toLocaleLowerCase() ?? '',
    durationSeconds > 0 ? Math.round(durationSeconds).toString() : '',
  ].join('|'));

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

const createAirPlayTrackSnapshot = (status: AirPlayReceiverStatus): LibraryTrack | null => {
  if (!status.metadata) {
    return null;
  }

  const sourceId = status.currentSourceId ?? `${airPlayReceiverTrackIdPrefix}${status.updatedAt}`;
  const duration = status.durationSeconds || status.metadata.durationSeconds || 0;
  const snapshotId = `${sourceId}:${receiverSnapshotIdentity(status.metadata, duration)}`;
  const path = sourceId;
  return {
    id: snapshotId,
    mediaType: 'remote',
    isTemporary: true,
    path,
    sourceId: null,
    remotePath: path,
    stableKey: path,
    title: status.metadata.title,
    artist: status.metadata.artist,
    album: status.metadata.album ?? '',
    albumArtist: status.metadata.albumArtist ?? status.metadata.artist,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: null,
    coverThumb: status.artworkUrl || status.metadata.coverHttpUrl || null,
    fieldSources: {
      title: 'airplay',
      artist: 'airplay',
      album: 'airplay',
      albumArtist: 'airplay',
      cover: 'airplay',
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
  bpm: track.bpm,
  bpmConfidence: track.bpmConfidence,
  beatOffsetMs: track.beatOffsetMs,
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

const isSongsRandomSortSource = (source: QueueSource | null | undefined): source is Extract<QueueSource, { type: 'songs' }> =>
  source?.type === 'songs' && source.sort === 'random';

const pickRandom = <Item,>(items: Item[]): Item | null => items[Math.floor(Math.random() * items.length)] ?? null;

const clampMoveIndex = (index: number, length: number): number => Math.max(0, Math.min(index, length - 1));

const isCompletedPlayback = (playedSeconds: number, durationSeconds: number): boolean =>
  durationSeconds > 0 ? playedSeconds >= 30 || playedSeconds >= durationSeconds * 0.5 : playedSeconds >= 30;

export const PlaybackQueueProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const initialSession = useMemo(
    () => (shouldUseLegacyPlaybackStorage() ? readLegacyPlaybackSession() : defaultHydratedPlaybackSession),
    [],
  );
  const [sessionHydrated, setSessionHydrated] = useState(shouldUseLegacyPlaybackStorage);
  const [items, setItemsState] = useState<QueueItem[]>(initialSession.items);
  const [currentQueueId, setCurrentQueueIdState] = useState<string | null>(initialSession.currentQueueId);
  const [currentTrackId, setCurrentTrackIdState] = useState<string | null>(initialSession.currentTrackId);
  const [lastPlayedTrack, setLastPlayedTrackState] = useState<LibraryTrack | null>(initialSession.lastPlayedTrack);
  const [history, setHistoryState] = useState<QueueItem[]>(initialSession.history);
  const [resumeMemory, setResumeMemoryState] = useState<PersistedPlaybackSessionResume | null>(initialSession.resume);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(initialSession.mode.isShuffleEnabled);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialSession.mode.repeatMode);
  const [automixEnabled, setAutomixEnabledState] = useState(initialSession.automixEnabled);
  const [gaplessPlaybackEnabled, setGaplessPlaybackEnabledState] = useState(false);

  const itemsRef = useRef(items);
  const currentQueueIdRef = useRef(currentQueueId);
  const currentTrackIdRef = useRef(currentTrackId);
  const lastPlayedTrackRef = useRef(lastPlayedTrack);
  const historyRef = useRef(history);
  const resumeMemoryRef = useRef(resumeMemory);
  const repeatModeRef = useRef(repeatMode);
  const automixEnabledRef = useRef(automixEnabled);
  const gaplessPlaybackEnabledRef = useRef(gaplessPlaybackEnabled);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const playbackHistorySessionRef = useRef<PlaybackHistorySession | null>(null);
  const pausedSessionTimerRef = useRef<number | null>(null);
  const playRequestTokenRef = useRef(0);
  const rearmAutomixRef = useRef<(() => Promise<void>) | null>(null);
  const playbackStatusTokensRef = useRef<WeakMap<PlaybackStatus, number>>(new WeakMap());
  const playbackStatusPreviousItemRef = useRef<WeakMap<PlaybackStatus, QueueItem | null>>(new WeakMap());
  const cancelLocalPrepareRef = useRef<(() => void) | null>(null);
  const sessionHydratedRef = useRef(sessionHydrated);

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

  const setResumeMemory = useCallback((resume: PersistedPlaybackSessionResume | null): void => {
    resumeMemoryRef.current = resume;
    setResumeMemoryState(resume);
  }, []);

  const setRepeatModeInternal = useCallback((mode: RepeatMode): void => {
    repeatModeRef.current = mode;
    setRepeatMode(mode);
    if (shouldUseLegacyPlaybackStorage()) {
      writePlaybackModeMemory({
        isShuffleEnabled: isShuffleEnabledRef.current,
        repeatMode: mode,
      });
    }
  }, []);

  const toggleShuffle = useCallback((): void => {
    const next = !isShuffleEnabledRef.current;
    isShuffleEnabledRef.current = next;
    setIsShuffleEnabled(next);
    if (next && repeatModeRef.current === 'all') {
      setRepeatModeInternal('off');
    } else if (shouldUseLegacyPlaybackStorage()) {
      writePlaybackModeMemory({
        isShuffleEnabled: next,
        repeatMode: repeatModeRef.current,
      });
    }
  }, [setRepeatModeInternal]);

  const setAutomixEnabled = useCallback((enabled: boolean): void => {
    automixEnabledRef.current = enabled;
    setAutomixEnabledState(enabled);
    if (shouldUseLegacyPlaybackStorage()) {
      writeAutomixEnabledMemory(enabled);
    }
    if (enabled) {
      void rearmAutomixRef.current?.();
    }
  }, []);

  const applyHydratedPlaybackSession = useCallback(
    (session: HydratedPlaybackSession): void => {
      setItems(session.items);
      setHistory(session.history);
      setCurrentQueueId(session.currentQueueId);
      setCurrentTrackIdInternal(session.currentTrackId);
      setLastPlayedTrack(session.lastPlayedTrack);
      setResumeMemory(session.resume);
      isShuffleEnabledRef.current = session.mode.isShuffleEnabled;
      setIsShuffleEnabled(session.mode.isShuffleEnabled);
      repeatModeRef.current = session.mode.repeatMode;
      setRepeatMode(session.mode.repeatMode);
      automixEnabledRef.current = session.automixEnabled;
      setAutomixEnabledState(session.automixEnabled);
    },
    [setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setItems, setLastPlayedTrack, setResumeMemory],
  );

  const createCurrentPersistedSession = useCallback((): PersistedPlaybackSessionV1 =>
    createPersistedSessionSnapshot({
      version: 1,
      items: itemsRef.current,
      currentQueueId: currentQueueIdRef.current,
      currentTrackId: currentTrackIdRef.current,
      lastPlayedTrack: lastPlayedTrackRef.current,
      history: historyRef.current,
      resume: resumeMemoryRef.current,
      mode: {
        isShuffleEnabled: isShuffleEnabledRef.current,
        repeatMode: repeatModeRef.current,
      },
      automixEnabled: automixEnabledRef.current,
    }), []);

  const persistPlaybackSessionNow = useCallback(async (): Promise<void> => {
    if (!sessionHydratedRef.current) {
      return;
    }

    const snapshot = createCurrentPersistedSession();
    const playback = window.echo?.playback;
    if (playback?.saveQueueSession) {
      try {
        const saved = await playback.saveQueueSession(snapshot);
        const savedResume = playbackSessionFromPersisted(saved).resume;
        if (resumeMemoryRef.current && !savedResume) {
          setResumeMemory(null);
        }
      } catch {
        // Persistence failures should not interrupt playback controls.
      }
      return;
    }

    writePlaybackQueueMemory(snapshot);
    writePlaybackModeMemory(snapshot.mode);
    writeAutomixEnabledMemory(snapshot.mode.automixEnabled);
  }, [createCurrentPersistedSession, setResumeMemory]);

  const applyPlaybackSettings = useCallback((settings: Partial<AppSettings> | null | undefined): void => {
    const enabled = settings?.gaplessPlaybackEnabled === true;
    gaplessPlaybackEnabledRef.current = enabled;
    setGaplessPlaybackEnabledState(enabled);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.echo?.app?.getSettings?.()
      .then((settings) => {
        if (!cancelled) {
          applyPlaybackSettings(settings);
        }
      })
      .catch(() => undefined);

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'gaplessPlaybackEnabled' in event.detail) {
        applyPlaybackSettings(event.detail as Partial<AppSettings>);
        return;
      }

      void window.echo?.app?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            applyPlaybackSettings(settings);
          }
        })
        .catch(() => undefined);
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, [applyPlaybackSettings]);

  useEffect(() => {
    sessionHydratedRef.current = sessionHydrated;
  }, [sessionHydrated]);

  useEffect(() => {
    const playback = window.echo?.playback;
    if (!playback?.getQueueSession || !playback.saveQueueSession) {
      sessionHydratedRef.current = true;
      setSessionHydrated(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const persistedSession = await playback.getQueueSession?.().catch(() => null);
      if (cancelled) {
        return;
      }

      if (persistedSession) {
        applyHydratedPlaybackSession(playbackSessionFromPersisted(persistedSession));
      } else {
        const legacySession = readLegacyPlaybackSession();
        if (hasLegacyPlaybackSession(legacySession)) {
          applyHydratedPlaybackSession(legacySession);
          await playback.saveQueueSession?.(createPersistedSessionSnapshot(legacySession)).catch(() => null);
          clearLegacyPlaybackMemory();
        }
      }

      if (!cancelled) {
        sessionHydratedRef.current = true;
        setSessionHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyHydratedPlaybackSession]);

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistPlaybackSessionNow();
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [automixEnabled, currentQueueId, currentTrackId, history, items, lastPlayedTrack, persistPlaybackSessionNow, repeatMode, resumeMemory, sessionHydrated, isShuffleEnabled]);

  useEffect(() => {
    const flush = (): void => {
      void persistPlaybackSessionNow();
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persistPlaybackSessionNow]);

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

  useEffect(() => {
    const unsubscribe = window.echo?.connect?.onAirPlayReceiverStatus?.((status) => {
      if (status.enabled && isActiveAirPlayReceiverStatus(status)) {
        const airPlayTrack = createAirPlayTrackSnapshot(status);
        if (!airPlayTrack) {
          return;
        }
        if (currentQueueIdRef.current !== null) {
          setCurrentQueueId(null);
        }
        if (!isSameReceiverTrackSnapshot(lastPlayedTrackRef.current, airPlayTrack)) {
          setLastPlayedTrack(airPlayTrack);
        }
        if (currentTrackIdRef.current !== airPlayTrack.id) {
          setCurrentTrackIdInternal(airPlayTrack.id);
        }
        setPlaybackStatusSnapshot({
          playbackStatus: {
            state: airPlayStatusToPlaybackState(status),
            currentTrackId: airPlayTrack.id,
            positionMs: Math.round(status.positionSeconds * 1000),
            durationMs: Math.round((status.durationSeconds || airPlayTrack.duration) * 1000),
            filePath: airPlayTrack.path,
          },
          error: status.error,
        });
        return;
      }

      if (currentTrackIdRef.current?.startsWith(airPlayReceiverTrackIdPrefix)) {
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

  const createAutomixOptions = useCallback((item: QueueItem): {
    enabled: boolean;
    maxTransitionSeconds: number;
    beatAlignEnabled: boolean;
    nextItem: PlayableTrack | null;
    nextProbe?: ReturnType<typeof createProbeFromTrack>;
    upcomingItems?: PlayableTrack[];
    upcomingProbes?: ReturnType<typeof createProbeFromTrack>[];
  } | undefined => {
    if (!automixEnabledRef.current || repeatModeRef.current === 'one' || isShuffleEnabledRef.current) {
      return undefined;
    }

    const current = itemsRef.current;
    const index = current.findIndex((candidate) => candidate.queueId === item.queueId);
    const next =
      index >= 0 && index < current.length - 1
        ? current[index + 1]
        : index === current.length - 1 && repeatModeRef.current === 'all' && current.length > 1
          ? current[0]
          : null;
    if (!next || isSpotifyTrack(item.track) || isSpotifyTrack(next.track)) {
      return undefined;
    }
    const upcoming = current
      .slice(index + 2)
      .filter((candidate) => !isSpotifyTrack(candidate.track))
      .slice(0, 3);

    return {
      enabled: true,
      maxTransitionSeconds: 12,
      beatAlignEnabled: true,
      nextItem: toPlayableTrack(next.track),
      nextProbe: createProbeFromTrack(next.track),
      upcomingItems: upcoming.map((candidate) => toPlayableTrack(candidate.track)),
      upcomingProbes: upcoming.map((candidate) => createProbeFromTrack(candidate.track)),
    };
  }, []);

  const createGaplessOptions = useCallback((item: QueueItem): {
    enabled: boolean;
    nextItem: PlayableTrack | null;
    nextProbe?: ReturnType<typeof createProbeFromTrack>;
    upcomingItems?: PlayableTrack[];
    upcomingProbes?: ReturnType<typeof createProbeFromTrack>[];
  } | undefined => {
    if (!gaplessPlaybackEnabledRef.current || automixEnabledRef.current || repeatModeRef.current === 'one' || isShuffleEnabledRef.current) {
      return undefined;
    }

    const current = itemsRef.current;
    const index = current.findIndex((candidate) => candidate.queueId === item.queueId);
    const next =
      index >= 0 && index < current.length - 1
        ? current[index + 1]
        : index === current.length - 1 && repeatModeRef.current === 'all' && current.length > 1
          ? current[0]
          : null;
    if (!next || isSpotifyTrack(item.track) || isSpotifyTrack(next.track)) {
      return undefined;
    }

    const upcoming = current
      .slice(index + 2)
      .filter((candidate) => !isSpotifyTrack(candidate.track))
      .slice(0, 3);

    return {
      enabled: true,
      nextItem: toPlayableTrack(next.track),
      nextProbe: createProbeFromTrack(next.track),
      upcomingItems: upcoming.map((candidate) => toPlayableTrack(candidate.track)),
      upcomingProbes: upcoming.map((candidate) => createProbeFromTrack(candidate.track)),
    };
  }, []);

  const rearmAutomixForCurrentPlayback = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;
    if (!playback) {
      return;
    }

    const item = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
    if (!item || isSpotifyTrack(item.track)) {
      return;
    }

    const automix = createAutomixOptions(item);
    if (!automix) {
      return;
    }

    const audioStatus = await window.echo?.audio?.getStatus?.().catch(() => null);
    const playbackStatus = await playback.getStatus?.().catch(() => null);
    const statusTrackId = audioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? null;
    if (statusTrackId && statusTrackId !== item.track.id) {
      return;
    }

    const state = audioStatus?.state ?? playbackStatus?.state ?? null;
    if (state !== 'playing') {
      return;
    }

    const positionSeconds = Math.max(
      0,
      audioStatus?.positionSeconds ?? (typeof playbackStatus?.positionMs === 'number' ? playbackStatus.positionMs / 1000 : 0),
    );
    if (item.track.duration > 0 && positionSeconds >= item.track.duration - 3) {
      return;
    }

    const output = await resolvePlaybackSpeedOutput();
    const requestToken = playRequestTokenRef.current + 1;
    playRequestTokenRef.current = requestToken;
    const rawStatus = await (
      (item.track.mediaType === 'remote' || item.track.mediaType === 'streaming') && playback.playMediaItem
        ? playback.playMediaItem({
            item: toPlayableTrack(item.track),
            startSeconds: positionSeconds,
            output,
            automix,
          })
        : playback.playLocalFile({
            filePath: item.track.path,
            trackId: item.track.id,
            startSeconds: positionSeconds,
            output,
            probe: createProbeFromTrack(item.track),
            automix,
          })
    );

    if (playRequestTokenRef.current !== requestToken) {
      return;
    }

    setPlaybackStatusSnapshot({
      playbackStatus: playbackStatusForItem(rawStatus, item),
      error: null,
    });
  }, [createAutomixOptions]);

  useEffect(() => {
    rearmAutomixRef.current = rearmAutomixForCurrentPlayback;
    return () => {
      if (rearmAutomixRef.current === rearmAutomixForCurrentPlayback) {
        rearmAutomixRef.current = null;
      }
    };
  }, [rearmAutomixForCurrentPlayback]);

  const getResumeStartSecondsForItem = useCallback((item: QueueItem): number | undefined => {
    const resume = resumeMemoryRef.current;
    if (!resume) {
      return undefined;
    }

    const matches =
      (resume.queueId !== null && resume.queueId === item.queueId) ||
      (resume.trackId !== null && resume.trackId === item.track.id) ||
      resume.filePath === item.track.path;

    if (!matches) {
      return undefined;
    }

    const positionSeconds = Math.max(0, resume.positionMs / 1000);
    const durationSeconds = resume.durationMs > 0 ? resume.durationMs / 1000 : item.track.duration;
    if (positionSeconds < 1 || (durationSeconds > 0 && positionSeconds >= durationSeconds - 1)) {
      return undefined;
    }

    return positionSeconds;
  }, []);

  const isHqPlayerConnectOutputActive = useCallback(async (): Promise<boolean> => {
    const connect = window.echo?.connect;
    if (!connect?.getStatus) {
      return false;
    }

    const status = await connect.getStatus().catch(() => null);
    return status?.protocol === 'hqplayer' && status.deviceId === hqPlayerConnectDeviceId;
  }, []);

  const playConnectOutputTrack = useCallback(async (item: QueueItem, requestToken: number, startSeconds = 0): Promise<PlaybackStatus | null> => {
    const connect = window.echo?.connect;
    if (!connect?.getStatus || !connect.connect) {
      return null;
    }

    const status = await connect.getStatus().catch(() => null);
    if (playRequestTokenRef.current !== requestToken) {
      throw new Error(playbackCancellationErrorMessage);
    }

    if (status?.protocol !== 'hqplayer' || status.deviceId !== hqPlayerConnectDeviceId) {
      return null;
    }

    const nextStatus = await connect.connect({
      deviceId: status.deviceId,
      track: item.track,
      filePath: item.track.path,
      positionSeconds: startSeconds,
    });
    return playbackStatusFromConnectStatus(nextStatus, item);
  }, []);

  const playLocalTrack = useCallback(async (item: QueueItem, options: PlayLocalTrackOptions = {}): Promise<PlaybackStatus> => {
    const playback = window.echo?.playback;
    const track = item.track;
    const requestToken = playRequestTokenRef.current + 1;
    playRequestTokenRef.current = requestToken;

    const previousItem = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
    const shouldPausePreviousSpotify = Boolean(previousItem && isSpotifyTrack(previousItem.track) && !isSpotifyTrack(track));
    const requestedStartSeconds =
      typeof options.startSeconds === 'number' && Number.isFinite(options.startSeconds)
        ? Math.max(0, options.startSeconds)
        : undefined;
    const resumeStartSeconds = requestedStartSeconds ?? getResumeStartSecondsForItem(item);
    const automix = createAutomixOptions(item);
    const gapless = automix ? undefined : createGaplessOptions(item);
    void finishPlaybackHistorySession();
    setCurrentQueueId(item.queueId);
    setCurrentTrackIdInternal(item.track.id);
    setLastPlayedTrack(item.track);
    beginPlaybackSwitchSnapshot({
      state: 'loading',
      currentTrackId: item.track.id,
      positionMs: Math.round((resumeStartSeconds ?? 0) * 1000),
      durationMs: Math.round(Math.max(0, item.track.duration) * 1000),
      filePath: track.path,
    });
    const rawStatus = await (async () => {
      try {
        if (shouldPausePreviousSpotify && previousItem) {
          await pauseSpotifyPlayback(previousItem.track).catch(() => undefined);
        }

        const connectOutputStatus = options.routeToConnectOutput === true
          ? await playConnectOutputTrack(item, requestToken, resumeStartSeconds ?? 0)
          : null;
        if (connectOutputStatus) {
          return connectOutputStatus;
        }

        const output = await resolvePlaybackSpeedOutput();
        if (playRequestTokenRef.current !== requestToken) {
          throw new Error(playbackCancellationErrorMessage);
        }
        return isSpotifyTrack(track)
          ? await (async () => {
              await playback?.stop?.().catch(() => undefined);
              return playSpotifyTrack(track, resumeStartSeconds ?? 0);
            })()
          : await (() => {
              if (!playback) {
                throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to play local files.');
              }

              return (track.mediaType === 'remote' || track.mediaType === 'streaming') && playback.playMediaItem
                ? playback.playMediaItem({
                    item: toPlayableTrack(track),
                    startSeconds: resumeStartSeconds,
                    output,
                    automix,
                    gapless,
                    forceRefresh: options.forceRefresh === true,
                  })
                : playback.playLocalFile({
                    filePath: track.path,
                    trackId: track.id,
                    startSeconds: resumeStartSeconds,
                    output,
                    probe: createProbeFromTrack(track),
                    replayGain: replayGainFromTrack(track),
                    automix,
                    gapless,
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
    if (resumeStartSeconds !== undefined) {
      setResumeMemory(null);
    }
    const status = playbackStatusForItem(rawStatus, item);
    playbackStatusTokensRef.current.set(status, requestToken);
    playbackStatusPreviousItemRef.current.set(status, previousItem);
    if (playRequestTokenRef.current === requestToken) {
      void startPlaybackHistorySession(item);
    }
    return status;
  }, [createAutomixOptions, createGaplessOptions, finishPlaybackHistorySession, getResumeStartSecondsForItem, playConnectOutputTrack, setCurrentQueueId, setCurrentTrackIdInternal, setLastPlayedTrack, setResumeMemory, startPlaybackHistorySession]);

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
        replayGain: replayGainFromTrack(next.track),
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
      void persistPlaybackSessionNow();
    },
    [autoSearchMv, persistPlaybackSessionNow, prepareNextMediaItem, setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setLastPlayedTrack],
  );

  useEffect(() => {
    const unsubscribe = window.echo?.playback?.onAutomixAdvance?.((event) => {
      const next = itemsRef.current.find((candidate) => candidate.track.id === event.toTrackId) ?? null;
      if (!next) {
        return;
      }

      const previous = findItemByQueueId(itemsRef.current, currentQueueIdRef.current);
      if (previous && previous.queueId !== next.queueId) {
        setHistory((current) => [...current, previous]);
      }

      void finishPlaybackHistorySession(true);
      setCurrentQueueId(next.queueId);
      setCurrentTrackIdInternal(next.track.id);
      setLastPlayedTrack(next.track);
      void startPlaybackHistorySession(next);
      prepareNextMediaItem(next);
      void persistPlaybackSessionNow();
    });

    return () => {
      unsubscribe?.();
    };
  }, [finishPlaybackHistorySession, persistPlaybackSessionNow, prepareNextMediaItem, setCurrentQueueId, setCurrentTrackIdInternal, setHistory, setLastPlayedTrack, startPlaybackHistorySession]);

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

      const status = await playLocalTrack(item, { routeToConnectOutput: true });
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
          showDuplicatesOnly: source.showDuplicatesOnly,
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

  const fetchLibraryRandomQueueRefresh = useCallback(
    async (source: Extract<QueueSource, { type: 'songs' }>, activeItem: QueueItem | null, pageSize: number): Promise<QueueItem[]> => {
      const library = window.echo?.library;

      if (!library?.getTracks) {
        return [];
      }

      try {
        const result = await library.getTracks({
          page: 1,
          pageSize: Math.max(2, pageSize),
          search: source.search,
          sort: 'random',
          hideDuplicates: source.hideDuplicates,
          showDuplicatesOnly: source.showDuplicatesOnly,
          duplicateMode: 'strict',
        });
        const activeTrackId = activeItem?.track.id ?? null;

        return result.items
          .filter((track) => track.id !== activeTrackId)
          .map((track) => createQueueItem(track, source));
      } catch {
        return [];
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
        const status = await playLocalTrack(itemToPlay, {
          routeToConnectOutput: options.routeToConnectOutput !== false,
          startSeconds: options.startSeconds,
          forceRefresh: options.forceRefresh,
        });

        setItems(nextItems);
        setHistory([]);
        commitPlayedItem(itemToPlay, status, { previousItem });
        return status;
      }

      const existingItem = options.forceNewQueueItem ? null : itemsRef.current.find((item) => item.track.id === track.id);
      const itemToPlay =
        existingItem && shouldReplaceExistingQueueTrack(existingItem.track, track)
          ? { ...existingItem, track: { ...existingItem.track, ...track } }
          : existingItem ?? createQueueItem(track, source);
      const status = await playLocalTrack(itemToPlay, {
        routeToConnectOutput: options.routeToConnectOutput !== false,
        startSeconds: options.startSeconds,
        forceRefresh: options.forceRefresh,
      });

      if (existingItem && itemToPlay !== existingItem) {
        setItems((current) => current.map((item) => (item.queueId === existingItem.queueId ? itemToPlay : item)));
      } else if (!existingItem) {
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
      const status = await playLocalTrack(firstItem, { routeToConnectOutput: true });

      setItems((current) => [...current, ...nextItems]);
      commitPlayedItem(firstItem, status, { previousItem });

      return result;
    },
    [commitPlayedItem, playLocalTrack, setItems],
  );

  const playPrevious = useCallback(async (): Promise<PlaybackStatus | null> => {
    const previousFromHistory = historyRef.current[historyRef.current.length - 1];

    if (previousFromHistory) {
      const status = await playLocalTrack(previousFromHistory, { routeToConnectOutput: true });
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

    const status = await playLocalTrack(target, { routeToConnectOutput: true });
    commitPlayedItem(target, status, { recordHistory: false });
    return status;
  }, [commitPlayedItem, playLocalTrack, setHistory]);

  const playNext = useCallback(async (options: PlayNextOptions = {}): Promise<PlaybackStatus | null> => {
    const current = itemsRef.current;
    const activeRepeatMode = repeatModeRef.current;
    const activeCurrentQueueId = currentQueueIdRef.current;
    const currentIndex = findCurrentIndex(current, activeCurrentQueueId, currentTrackIdRef.current);
    const activeItem = currentIndex >= 0 ? current[currentIndex] : findItemByQueueId(current, activeCurrentQueueId);
    const routeToConnectOutput = options.autoAdvance !== true || (await isHqPlayerConnectOutputActive());

    const repeatCurrentItem = async (): Promise<PlaybackStatus | null> => {
      if (activeItem) {
        const status = await playLocalTrack(activeItem, { routeToConnectOutput });
        commitPlayedItem(activeItem, status, { recordHistory: false });
        return status;
      }

      const fallbackTrack = lastPlayedTrackRef.current;
      return fallbackTrack ? playTrack(fallbackTrack, { routeToConnectOutput }) : null;
    };

    if (activeRepeatMode === 'one' && options.autoAdvance === true) {
      return repeatCurrentItem();
    }

    if (current.length === 0) {
      return activeRepeatMode === 'one' ? repeatCurrentItem() : null;
    }

    const navigationRepeatMode = activeRepeatMode === 'one' ? 'off' : activeRepeatMode;
    let target: QueueItem | null = null;
    let refreshedRandomQueue: QueueItem[] | null = null;

    if (isShuffleEnabledRef.current) {
      const source = activeItem?.source ?? null;
      let candidates = getShuffleCandidates(current, activeItem ?? null, historyRef.current);

      target = pickRandom(candidates);

      if (!target && isLibraryRandomSource(source)) {
        target = await fetchLibraryShuffleTarget(source, activeItem ?? null);
      }

      if (!target && isSongsRandomSortSource(source)) {
        refreshedRandomQueue = await fetchLibraryRandomQueueRefresh(source, activeItem ?? null, current.length || 100);
        target = refreshedRandomQueue[0] ?? null;
      }

      if (!target && navigationRepeatMode === 'all') {
        candidates = activeItem ? current.filter((item) => item.queueId !== activeItem.queueId) : current;
        target = pickRandom(candidates);
      }

      if (!target && navigationRepeatMode === 'all') {
        target = activeItem ?? current[0] ?? null;
      }
    } else if (currentIndex >= 0 && currentIndex < current.length - 1) {
      target = current[currentIndex + 1] ?? null;
    } else if (currentIndex < 0) {
      target = current[0] ?? null;
    } else if (isSongsRandomSortSource(activeItem?.source)) {
      refreshedRandomQueue = await fetchLibraryRandomQueueRefresh(activeItem.source, activeItem, current.length || 100);
      target = refreshedRandomQueue[0] ?? null;
    } else if (navigationRepeatMode === 'all') {
      target = current[0] ?? null;
    }

    if (!target) {
      return activeRepeatMode === 'one' ? repeatCurrentItem() : null;
    }

    if (refreshedRandomQueue) {
      setItems(refreshedRandomQueue);
      setHistory([]);
    }

    const status = await playLocalTrack(target, { routeToConnectOutput });
    if (!itemsRef.current.some((item) => item.queueId === target.queueId)) {
      setItems((items) => [...items, target]);
    }
    commitPlayedItem(target, status);
    return status;
  }, [commitPlayedItem, fetchLibraryRandomQueueRefresh, fetchLibraryShuffleTarget, isHqPlayerConnectOutputActive, playLocalTrack, playTrack, setHistory, setItems]);

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

    const activeItem = currentIndex >= 0 ? items[currentIndex] : findItemByQueueId(items, currentQueueId);
    if (currentIndex >= items.length - 1 && isSongsRandomSortSource(activeItem?.source)) {
      return true;
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
      automixEnabled,
      gaplessPlaybackEnabled,
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
      setAutomixEnabled,
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
      automixEnabled,
      gaplessPlaybackEnabled,
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
      setAutomixEnabled,
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
