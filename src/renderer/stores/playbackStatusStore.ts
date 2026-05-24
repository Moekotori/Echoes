import { useSyncExternalStore } from 'react';
import type { AudioPlaybackState, AudioStatus } from '../../shared/types/audio';
import { hqPlayerConnectDeviceId, type ConnectSessionStatus } from '../../shared/types/connect';
import type { PlaybackStatus } from '../../shared/types/playback';

type PlaybackVisualIntent = {
  type: 'track-switch';
  state: 'playing';
  currentTrackId: string | null;
  filePath: string | null;
  startedAtMs: number;
};

type PlaybackStatusSnapshot = {
  audioStatus: AudioStatus | null;
  playbackStatus: PlaybackStatus | null;
  playbackVisualIntent: PlaybackVisualIntent | null;
  error: string | null;
  version: number;
};

const idlePollingStates = new Set(['paused', 'stopped', 'idle', 'error']);
const activePollingIntervalMs = 500;
const idlePollingIntervalMs = 2000;
const nonActionableAudioStatusErrorPatterns = [
  /\beq_control_(?:closed|disconnected)\b/u,
  /\beq_control_sync_skipped\b/u,
  /\baudio_session_run_cancelled\b/u,
];

let snapshot: PlaybackStatusSnapshot = {
  audioStatus: null,
  playbackStatus: null,
  playbackVisualIntent: null,
  error: null,
  version: 0,
};

const listeners = new Set<() => void>();

let pollTimer: number | null = null;
let unsubscribeAudioStatus: (() => void) | undefined;
let unsubscribeConnectStatus: (() => void) | undefined;
let activeHqPlayerConnectStatus: ConnectSessionStatus | null = null;
let refreshRequestId = 0;

const getSnapshot = (): PlaybackStatusSnapshot => snapshot;

const emitChange = (): void => {
  snapshot = { ...snapshot, version: snapshot.version + 1 };
  for (const listener of listeners) {
    listener();
  }
};

const playbackMatchesIntent = (status: AudioStatus | PlaybackStatus, intent: PlaybackVisualIntent): boolean =>
  Boolean(intent.currentTrackId && status.currentTrackId === intent.currentTrackId) ||
  Boolean(intent.filePath && ('currentFilePath' in status ? status.currentFilePath : status.filePath) === intent.filePath);

const playbackHasIdentity = (status: AudioStatus | PlaybackStatus): boolean =>
  Boolean(status.currentTrackId || ('currentFilePath' in status ? status.currentFilePath : status.filePath));

const isSpotifyPlaybackStatus = (status: PlaybackStatus | null | undefined): boolean =>
  typeof status?.filePath === 'string' && status.filePath.startsWith('streaming:spotify:');

const isStaleStatusForVisualIntent = (status: AudioStatus | PlaybackStatus, intent: PlaybackVisualIntent | null): boolean =>
  Boolean(intent && playbackHasIdentity(status) && !playbackMatchesIntent(status, intent));

const getAuthoritativeState = (): AudioPlaybackState => snapshot.audioStatus?.state ?? snapshot.playbackStatus?.state ?? 'idle';

const getActionableAudioStatusError = (error: string | null | undefined): string | null => {
  if (!error) {
    return null;
  }

  return nonActionableAudioStatusErrorPatterns.some((pattern) => pattern.test(error)) ? null : error;
};

const shouldIgnoreAudioStatusPatch = (audioStatus: AudioStatus): boolean =>
  audioStatus.state === 'error' && Boolean(audioStatus.error) && !getActionableAudioStatusError(audioStatus.error);

const connectStateToPlaybackState = (status: ConnectSessionStatus): AudioPlaybackState => {
  switch (status.state) {
    case 'playing':
      return 'playing';
    case 'paused':
      return 'paused';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    case 'idle':
      return 'idle';
    default:
      return 'loading';
  }
};

const isHqPlayerConnectStatus = (status: ConnectSessionStatus | null | undefined): status is ConnectSessionStatus =>
  status?.protocol === 'hqplayer' && status.deviceId === hqPlayerConnectDeviceId;

const shouldTreatHqPlayerAsActivePlayback = (status: ConnectSessionStatus | null | undefined): boolean =>
  isHqPlayerConnectStatus(status) && ['connecting', 'ready', 'playing', 'paused'].includes(status.state);

const playbackStatusFromConnectStatus = (status: ConnectSessionStatus): PlaybackStatus => ({
  state: connectStateToPlaybackState(status),
  currentTrackId: status.currentTrackId,
  positionMs: Math.round(Math.max(0, status.positionSeconds) * 1000),
  durationMs: Math.round(Math.max(0, status.durationSeconds || status.metadata?.durationSeconds || 0) * 1000),
  filePath: null,
});

const applyConnectStatus = (connectStatus: ConnectSessionStatus): PlaybackStatusSnapshot => {
  activeHqPlayerConnectStatus = shouldTreatHqPlayerAsActivePlayback(connectStatus) ? connectStatus : null;

  if (!isHqPlayerConnectStatus(connectStatus)) {
    return snapshot;
  }

  if (!shouldTreatHqPlayerAsActivePlayback(connectStatus) && connectStatus.state !== 'stopped' && connectStatus.state !== 'error') {
    return snapshot;
  }

  return setPlaybackStatusSnapshot({
    audioStatus: null,
    playbackStatus: playbackStatusFromConnectStatus(connectStatus),
    error: connectStatus.error,
  });
};

const shouldClearVisualIntentForPatch = (
  patch: Partial<Omit<PlaybackStatusSnapshot, 'version'>>,
  shouldApplyPlaybackStatus: boolean,
  shouldApplyAudioStatus: boolean,
): boolean => {
  const intent = snapshot.playbackVisualIntent;
  if (!intent) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'error') && patch.error) {
    return true;
  }

  if (shouldApplyPlaybackStatus && patch.playbackStatus && patch.playbackStatus.state !== 'loading') {
    return true;
  }

  if (shouldApplyAudioStatus && patch.audioStatus && playbackMatchesIntent(patch.audioStatus, intent) && patch.audioStatus.state !== 'loading') {
    return true;
  }

  return false;
};

export const setPlaybackStatusSnapshot = (patch: Partial<Omit<PlaybackStatusSnapshot, 'version'>>): PlaybackStatusSnapshot => {
  const hasPlaybackStatusPatch = Object.prototype.hasOwnProperty.call(patch, 'playbackStatus');
  const hasAudioStatusPatch = Object.prototype.hasOwnProperty.call(patch, 'audioStatus');
  const nativeRefreshOverSpotify =
    isSpotifyPlaybackStatus(snapshot.playbackStatus) &&
    hasPlaybackStatusPatch &&
    hasAudioStatusPatch &&
    !isSpotifyPlaybackStatus(patch.playbackStatus);
  const nativeAudioOverSpotify =
    isSpotifyPlaybackStatus(snapshot.playbackStatus) &&
    hasAudioStatusPatch &&
    !hasPlaybackStatusPatch;
  const shouldApplyPlaybackStatus =
    !nativeRefreshOverSpotify && (!patch.playbackStatus || !isStaleStatusForVisualIntent(patch.playbackStatus, snapshot.playbackVisualIntent));
  const shouldApplyAudioStatus =
    !nativeRefreshOverSpotify &&
    !nativeAudioOverSpotify &&
    (!patch.audioStatus || !isStaleStatusForVisualIntent(patch.audioStatus, snapshot.playbackVisualIntent));

  if (hasPlaybackStatusPatch) {
    refreshRequestId += 1;
  }

  if (shouldClearVisualIntentForPatch(patch, shouldApplyPlaybackStatus, shouldApplyAudioStatus)) {
    snapshot.playbackVisualIntent = null;
  }

  if (shouldApplyAudioStatus && Object.prototype.hasOwnProperty.call(patch, 'audioStatus')) {
    snapshot.audioStatus = patch.audioStatus ?? null;
  }

  if (shouldApplyPlaybackStatus && hasPlaybackStatusPatch) {
    snapshot.playbackStatus = patch.playbackStatus ?? null;
    if (isSpotifyPlaybackStatus(snapshot.playbackStatus) && !hasAudioStatusPatch) {
      snapshot.audioStatus = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
    snapshot.error = patch.error ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'playbackVisualIntent')) {
    snapshot.playbackVisualIntent = patch.playbackVisualIntent ?? null;
  }

  emitChange();
  schedulePolling();
  return snapshot;
};

export const beginPlaybackSwitchSnapshot = (playbackStatus: PlaybackStatus): PlaybackStatusSnapshot => {
  const wasPlaying = getAuthoritativeState() === 'playing';

  return setPlaybackStatusSnapshot({
    audioStatus: null,
    playbackStatus,
    playbackVisualIntent: wasPlaying
      ? {
          type: 'track-switch',
          state: 'playing',
          currentTrackId: playbackStatus.currentTrackId,
          filePath: playbackStatus.filePath,
          startedAtMs: Date.now(),
        }
      : null,
    error: null,
  });
};

export const getVisualPlaybackState = (
  statusSnapshot: Pick<PlaybackStatusSnapshot, 'audioStatus' | 'playbackStatus' | 'playbackVisualIntent'>,
): AudioPlaybackState => statusSnapshot.playbackVisualIntent?.state ?? statusSnapshot.audioStatus?.state ?? statusSnapshot.playbackStatus?.state ?? 'idle';

export const refreshPlaybackStatus = async (): Promise<PlaybackStatusSnapshot> => {
  const echo = window.echo;

  if (!echo) {
    return setPlaybackStatusSnapshot({ error: 'Desktop bridge unavailable' });
  }

  const requestId = refreshRequestId + 1;
  refreshRequestId = requestId;

  try {
    const [playbackStatus, audioStatus, connectStatus] = await Promise.all([
      echo.playback.getStatus(),
      echo.audio.getStatus(),
      echo.connect?.getStatus?.().catch(() => null) ?? Promise.resolve(null),
    ]);

    if (refreshRequestId !== requestId) {
      return snapshot;
    }

    if (connectStatus && isHqPlayerConnectStatus(connectStatus)) {
      return applyConnectStatus(connectStatus);
    }

    return setPlaybackStatusSnapshot({
      audioStatus: shouldIgnoreAudioStatusPatch(audioStatus) ? null : audioStatus,
      playbackStatus,
      error: getActionableAudioStatusError(audioStatus.error),
    });
  } catch (error) {
    if (refreshRequestId !== requestId) {
      return snapshot;
    }

    return setPlaybackStatusSnapshot({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const clearPolling = (): void => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
};

function getPollingIntervalMs(): number {
  const state = snapshot.playbackStatus?.state ?? snapshot.audioStatus?.state ?? 'idle';
  return document.visibilityState === 'hidden' || idlePollingStates.has(state) ? idlePollingIntervalMs : activePollingIntervalMs;
}

function shouldPollStatus(): boolean {
  const state = snapshot.playbackStatus?.state ?? snapshot.audioStatus?.state ?? 'idle';
  return document.visibilityState === 'hidden' || idlePollingStates.has(state) || !unsubscribeAudioStatus;
}

function schedulePolling(): void {
  if (listeners.size === 0) {
    return;
  }

  clearPolling();
  if (!shouldPollStatus()) {
    return;
  }

  pollTimer = window.setInterval(() => {
    void refreshPlaybackStatus();
  }, getPollingIntervalMs());
}

const handleVisibilityChange = (): void => {
  schedulePolling();
  if (document.visibilityState !== 'hidden') {
    void refreshPlaybackStatus();
  }
};

const ensureStarted = (): void => {
  if (listeners.size !== 1) {
    return;
  }

  unsubscribeAudioStatus = window.echo?.audio?.onStatus?.((audioStatus) => {
    if (shouldTreatHqPlayerAsActivePlayback(activeHqPlayerConnectStatus)) {
      return;
    }

    refreshRequestId += 1;
    setPlaybackStatusSnapshot({
      audioStatus: shouldIgnoreAudioStatusPatch(audioStatus) ? null : audioStatus,
      error: getActionableAudioStatusError(audioStatus.error),
    });
  });
  unsubscribeConnectStatus = window.echo?.connect?.onStatus?.((connectStatus) => {
    if (!isHqPlayerConnectStatus(connectStatus)) {
      activeHqPlayerConnectStatus = null;
      return;
    }

    refreshRequestId += 1;
    applyConnectStatus(connectStatus);
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refreshPlaybackStatus();
  schedulePolling();
};

const stopIfUnused = (): void => {
  if (listeners.size > 0) {
    return;
  }

  clearPolling();
  unsubscribeAudioStatus?.();
  unsubscribeAudioStatus = undefined;
  unsubscribeConnectStatus?.();
  unsubscribeConnectStatus = undefined;
  activeHqPlayerConnectStatus = null;
  snapshot = {
    audioStatus: null,
    playbackStatus: null,
    playbackVisualIntent: null,
    error: null,
    version: snapshot.version + 1,
  };
  document.removeEventListener('visibilitychange', handleVisibilityChange);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  ensureStarted();

  return () => {
    listeners.delete(listener);
    stopIfUnused();
  };
};

export const useSharedPlaybackStatus = (): PlaybackStatusSnapshot => {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
