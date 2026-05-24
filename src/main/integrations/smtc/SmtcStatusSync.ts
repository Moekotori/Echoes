import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '../../../shared/constants/ipcChannels';
import type { AudioStatus } from '../../../shared/types/audio';
import type { SmtcCommand, SmtcDiagnosticEvent, SmtcDiagnostics, SmtcEnabledActions, SmtcPlaybackState, SmtcService, SmtcTrackMetadata } from './SmtcService';
import { getMainWindow } from '../../app/windowManager';
import { getAppSettings } from '../../app/appSettings';
import { getAudioSession } from '../../audio/AudioSession';
import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { getLibraryService } from '../../library/LibraryService';
import type { CoverVariant } from '../../library/libraryTypes';
import { disposeAndResetSmtcService, getSmtcService } from './getSmtcService';

type SmtcSyncState = {
  initialized: boolean;
  unsubscribeCommand: (() => void) | null;
  statusListener: ((status: AudioStatus) => void) | null;
  lastMetadataKey: string | null;
  lastMetadataAt: string | null;
  lastMetadataTrackId: string | null;
  lastMetadataTitle: string | null;
  lastMetadataArtist: string | null;
  lastPlaybackState: SmtcPlaybackState | null;
  lastPlaybackStateAt: string | null;
  lastTimelineSyncAt: number;
  lastTimelineAt: string | null;
  lastTimelinePositionSeconds: number | null;
  lastTimelineDurationSeconds: number | null;
  enabledActions: SmtcEnabledActions | null;
  lastCommand: SmtcCommand | null;
  lastCommandAt: string | null;
  lastError: SmtcDiagnosticEvent | null;
  recentErrors: SmtcDiagnosticEvent[];
};

const state: SmtcSyncState = {
  initialized: false,
  unsubscribeCommand: null,
  statusListener: null,
  lastMetadataKey: null,
  lastMetadataAt: null,
  lastMetadataTrackId: null,
  lastMetadataTitle: null,
  lastMetadataArtist: null,
  lastPlaybackState: null,
  lastPlaybackStateAt: null,
  lastTimelineSyncAt: 0,
  lastTimelineAt: null,
  lastTimelinePositionSeconds: null,
  lastTimelineDurationSeconds: null,
  enabledActions: null,
  lastCommand: null,
  lastCommandAt: null,
  lastError: null,
  recentErrors: [],
};

const smtcRecoveryWindowMs = 60_000;
const smtcMaxRecoveriesPerWindow = 2;
const smtcMaxRecentDiagnosticErrors = 8;
const smtcRecoveryAttempts: number[] = [];
let smtcRecoveryInFlight = false;

const recordSmtcDiagnosticError = (source: SmtcDiagnosticEvent['source'], message: string): void => {
  const event: SmtcDiagnosticEvent = {
    at: new Date().toISOString(),
    source,
    message,
  };
  state.lastError = event;
  state.recentErrors.push(event);
  if (state.recentErrors.length > smtcMaxRecentDiagnosticErrors) {
    state.recentErrors.splice(0, state.recentErrors.length - smtcMaxRecentDiagnosticErrors);
  }
};

const logWarn = (message: string, payload?: unknown): void => {
  getCrashReportService().getLogger()?.warn('main', message, payload);
  console.warn(message, payload ?? '');
};

const logInfo = (message: string, payload?: unknown): void => {
  getCrashReportService().getLogger()?.info('main', message, payload);
};

const safeNumber = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const resolveCoverPath = (coverId: string | null): string | null => {
  if (!coverId) {
    return null;
  }

  const variants: CoverVariant[] = ['large', 'album', 'thumb'];

  for (const variant of variants) {
    try {
      const asset = getLibraryService().resolveCoverAsset(coverId, variant);
      if (asset?.filePath && existsSync(asset.filePath)) {
        return asset.filePath;
      }
    } catch (error) {
      logWarn('[SMTC] Failed to resolve cover asset', {
        coverId,
        variant,
        error: error instanceof Error ? error.message : String(error),
      });
      recordSmtcDiagnosticError('sync', `Failed to resolve cover asset: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  return null;
};

export const createSmtcMetadataFromStatus = (status: AudioStatus): SmtcTrackMetadata => {
  const track = status.currentTrackId
    ? (() => {
        try {
          return getLibraryService().getTrack(status.currentTrackId ?? '');
        } catch (error) {
          logWarn('[SMTC] Failed to load track metadata', {
            trackId: status.currentTrackId,
            error: error instanceof Error ? error.message : String(error),
          });
          recordSmtcDiagnosticError('sync', `Failed to load track metadata: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      })()
    : null;

  const fileTitle = status.currentFilePath ? basename(status.currentFilePath) : 'ECHO Next';
  const title = track?.title?.trim() || fileTitle;
  const artist = track?.artist?.trim() || track?.albumArtist?.trim() || (status.currentFilePath ? 'Local file' : 'ECHO Next');
  const album = track?.album?.trim() || null;
  const albumArtist = track?.albumArtist?.trim() || null;

  return {
    trackId: status.currentTrackId,
    title,
    artist,
    album,
    albumArtist,
    durationSeconds: safeNumber(status.durationSeconds || track?.duration || 0),
    positionSeconds: safeNumber(status.positionSeconds),
    coverPath: resolveCoverPath(track?.coverId ?? null),
    coverUrl: null,
  };
};

const metadataKeyForStatus = (status: AudioStatus): string => `${status.currentTrackId ?? ''}|${status.currentFilePath ?? ''}`;

const smtcPlaybackStateForStatus = (status: AudioStatus): SmtcPlaybackState =>
  status.state === 'loading' && (status.currentTrackId || status.currentFilePath) ? 'playing' : status.state;

export const bindSmtcCommandBridge = (
  service: SmtcService,
  getWindow: () => Pick<BrowserWindow, 'webContents' | 'isDestroyed'> | null = getMainWindow,
): (() => void) =>
  service.onCommand((command: SmtcCommand) => {
    state.lastCommand = command;
    state.lastCommandAt = new Date().toISOString();
    const window = getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(IpcChannels.SmtcCommand, command);
    getCrashReportService().getLogger()?.info('main', '[SMTC] command forwarded to renderer', { command });
  });

export const syncSmtcStatus = async (status: AudioStatus = getAudioSession().getStatus()): Promise<void> => {
  const service = getSmtcService();
  const metadataKey = metadataKeyForStatus(status);

  if (metadataKey !== state.lastMetadataKey) {
    state.lastMetadataKey = metadataKey;
    const metadata = createSmtcMetadataFromStatus(status);
    state.lastMetadataAt = new Date().toISOString();
    state.lastMetadataTrackId = metadata.trackId;
    state.lastMetadataTitle = metadata.title;
    state.lastMetadataArtist = metadata.artist;
    try {
      await service.setMetadata(metadata);
    } catch (error) {
      logWarn('[SMTC] Failed to sync metadata', { error: error instanceof Error ? error.message : String(error) });
      recordSmtcDiagnosticError('sync', `Failed to sync metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const playbackState = smtcPlaybackStateForStatus(status);
  if (playbackState !== state.lastPlaybackState) {
    state.lastPlaybackState = playbackState;
    state.lastPlaybackStateAt = new Date().toISOString();
    try {
      await service.setPlaybackState(playbackState);
    } catch (error) {
      logWarn('[SMTC] Failed to sync playback state', { error: error instanceof Error ? error.message : String(error) });
      recordSmtcDiagnosticError('sync', `Failed to sync playback state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const now = Date.now();
  if (now - state.lastTimelineSyncAt >= 1000 || status.state !== 'playing') {
    state.lastTimelineSyncAt = now;
    state.lastTimelineAt = new Date().toISOString();
    state.lastTimelinePositionSeconds = safeNumber(status.positionSeconds);
    state.lastTimelineDurationSeconds = safeNumber(status.durationSeconds);
    try {
      await service.setTimeline(status.positionSeconds, status.durationSeconds);
    } catch (error) {
      logWarn('[SMTC] Failed to sync timeline', { error: error instanceof Error ? error.message : String(error) });
      recordSmtcDiagnosticError('sync', `Failed to sync timeline: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export const initializeSmtcIntegration = async (): Promise<void> => {
  if (state.initialized) {
    return;
  }

  const service = getSmtcService();
  await service.initialize();
  state.enabledActions = { play: true, pause: true, previous: true, next: true, seek: true };
  await service.setEnabledActions(state.enabledActions);
  state.unsubscribeCommand = bindSmtcCommandBridge(service);
  state.statusListener = (status: AudioStatus) => {
    void syncSmtcStatus(status);
  };
  getAudioSession().on('status', state.statusListener);
  state.initialized = true;
  await syncSmtcStatus();
};

export const disposeSmtcIntegration = async (): Promise<void> => {
  if (!state.initialized) {
    return;
  }

  if (state.statusListener) {
    getAudioSession().off('status', state.statusListener);
  }
  state.unsubscribeCommand?.();
  await getSmtcService().dispose();
  state.initialized = false;
  state.unsubscribeCommand = null;
  state.statusListener = null;
  state.lastMetadataKey = null;
  state.lastMetadataAt = null;
  state.lastMetadataTrackId = null;
  state.lastMetadataTitle = null;
  state.lastMetadataArtist = null;
  state.lastPlaybackState = null;
  state.lastPlaybackStateAt = null;
  state.lastTimelineSyncAt = 0;
  state.lastTimelineAt = null;
  state.lastTimelinePositionSeconds = null;
  state.lastTimelineDurationSeconds = null;
  state.enabledActions = null;
  state.lastCommand = null;
  state.lastCommandAt = null;
  state.lastError = null;
  state.recentErrors = [];
};

const reserveSmtcRecoveryAttempt = (now = Date.now()): boolean => {
  while (smtcRecoveryAttempts.length > 0 && now - smtcRecoveryAttempts[0] > smtcRecoveryWindowMs) {
    smtcRecoveryAttempts.shift();
  }

  if (smtcRecoveryAttempts.length >= smtcMaxRecoveriesPerWindow) {
    return false;
  }

  smtcRecoveryAttempts.push(now);
  return true;
};

export const recoverSmtcIntegration = async (reason = 'runtime-recovery'): Promise<boolean> => {
  if (!state.initialized) {
    logWarn('[SMTC] recovery skipped because the integration is not initialized', { reason });
    recordSmtcDiagnosticError('recovery', `Recovery skipped because integration is not initialized: ${reason}`);
    return false;
  }

  if (smtcRecoveryInFlight) {
    logWarn('[SMTC] recovery skipped because another recovery is already running', { reason });
    recordSmtcDiagnosticError('recovery', `Recovery skipped because another recovery is already running: ${reason}`);
    return false;
  }

  if (!reserveSmtcRecoveryAttempt()) {
    logWarn('[SMTC] recovery skipped because the retry limit was reached', {
      reason,
      windowMs: smtcRecoveryWindowMs,
      maxAttempts: smtcMaxRecoveriesPerWindow,
    });
    recordSmtcDiagnosticError('recovery', `Recovery skipped because retry limit was reached: ${reason}`);
    return false;
  }

  smtcRecoveryInFlight = true;
  try {
    logInfo('[SMTC] attempting lightweight integration recovery', { reason });
    await disposeSmtcIntegration();
    await disposeAndResetSmtcService();
    await initializeSmtcIntegration();
    logInfo('[SMTC] lightweight integration recovery completed', { reason });
    return true;
  } catch (error) {
    logWarn('[SMTC] lightweight integration recovery failed', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    recordSmtcDiagnosticError('recovery', `Lightweight integration recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    smtcRecoveryInFlight = false;
  }
};

export const resetSmtcRecoveryStateForTests = (): void => {
  smtcRecoveryAttempts.length = 0;
  smtcRecoveryInFlight = false;
};

const isSmtcSettingEnabled = (): boolean => {
  try {
    return getAppSettings().smtcEnabled !== false;
  } catch {
    return true;
  }
};

const getRecoveryAttemptsInWindow = (now = Date.now()): number => {
  while (smtcRecoveryAttempts.length > 0 && now - smtcRecoveryAttempts[0] > smtcRecoveryWindowMs) {
    smtcRecoveryAttempts.shift();
  }

  return smtcRecoveryAttempts.length;
};

const combineDiagnosticErrors = (serviceDiagnostics: SmtcDiagnostics): SmtcDiagnosticEvent[] =>
  [...serviceDiagnostics.recentErrors, ...state.recentErrors]
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-smtcMaxRecentDiagnosticErrors);

const fallbackSmtcDiagnostics = (): SmtcDiagnostics => ({
  enabled: isSmtcSettingEnabled(),
  platform: process.platform,
  hostState: 'not-initialized',
  initialized: state.initialized,
  hostPath: null,
  lastMetadataAt: null,
  lastMetadataTrackId: null,
  lastMetadataTitle: null,
  lastMetadataArtist: null,
  lastPlaybackState: null,
  lastPlaybackStateAt: null,
  lastTimelineAt: null,
  lastTimelinePositionSeconds: null,
  lastTimelineDurationSeconds: null,
  enabledActions: null,
  lastCommand: null,
  lastCommandAt: null,
  lastError: null,
  recentErrors: [],
  recoveryInFlight: smtcRecoveryInFlight,
  recoveryAttemptsInWindow: getRecoveryAttemptsInWindow(),
});

export const getSmtcDiagnostics = (): SmtcDiagnostics => {
  const serviceDiagnostics = getSmtcService().getDiagnostics?.() ?? fallbackSmtcDiagnostics();
  const enabled = isSmtcSettingEnabled();
  const platform = process.platform;
  const hostState = !enabled
    ? 'disabled'
    : platform !== 'win32'
      ? 'unsupported'
      : serviceDiagnostics.hostState;
  const recentErrors = combineDiagnosticErrors(serviceDiagnostics);

  return {
    ...serviceDiagnostics,
    enabled,
    platform,
    hostState,
    initialized: state.initialized || serviceDiagnostics.initialized,
    lastMetadataAt: state.lastMetadataAt ?? serviceDiagnostics.lastMetadataAt,
    lastMetadataTrackId: state.lastMetadataTrackId ?? serviceDiagnostics.lastMetadataTrackId,
    lastMetadataTitle: state.lastMetadataTitle ?? serviceDiagnostics.lastMetadataTitle,
    lastMetadataArtist: state.lastMetadataArtist ?? serviceDiagnostics.lastMetadataArtist,
    lastPlaybackState: state.lastPlaybackState ?? serviceDiagnostics.lastPlaybackState,
    lastPlaybackStateAt: state.lastPlaybackStateAt ?? serviceDiagnostics.lastPlaybackStateAt,
    lastTimelineAt: state.lastTimelineAt ?? serviceDiagnostics.lastTimelineAt,
    lastTimelinePositionSeconds: state.lastTimelinePositionSeconds ?? serviceDiagnostics.lastTimelinePositionSeconds,
    lastTimelineDurationSeconds: state.lastTimelineDurationSeconds ?? serviceDiagnostics.lastTimelineDurationSeconds,
    enabledActions: state.enabledActions ?? serviceDiagnostics.enabledActions,
    lastCommand: state.lastCommand ?? serviceDiagnostics.lastCommand,
    lastCommandAt: state.lastCommandAt ?? serviceDiagnostics.lastCommandAt,
    lastError: recentErrors.at(-1) ?? state.lastError ?? serviceDiagnostics.lastError,
    recentErrors,
    recoveryInFlight: smtcRecoveryInFlight,
    recoveryAttemptsInWindow: getRecoveryAttemptsInWindow(),
  };
};
