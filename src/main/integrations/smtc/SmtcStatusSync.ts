import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '../../../shared/constants/ipcChannels';
import type { AudioStatus } from '../../../shared/types/audio';
import type { SmtcCommand, SmtcPlaybackState, SmtcService, SmtcTrackMetadata } from './SmtcService';
import { getMainWindow } from '../../app/windowManager';
import { getAudioSession } from '../../audio/AudioSession';
import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { getLibraryService } from '../../library/LibraryService';
import type { CoverVariant } from '../../library/libraryTypes';
import { getSmtcService } from './getSmtcService';

type SmtcSyncState = {
  initialized: boolean;
  unsubscribeCommand: (() => void) | null;
  statusListener: ((status: AudioStatus) => void) | null;
  lastMetadataKey: string | null;
  lastPlaybackState: SmtcPlaybackState | null;
  lastTimelineSyncAt: number;
};

const state: SmtcSyncState = {
  initialized: false,
  unsubscribeCommand: null,
  statusListener: null,
  lastMetadataKey: null,
  lastPlaybackState: null,
  lastTimelineSyncAt: 0,
};

const logWarn = (message: string, payload?: unknown): void => {
  getCrashReportService().getLogger()?.warn('main', message, payload);
  console.warn(message, payload ?? '');
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

export const bindSmtcCommandBridge = (
  service: SmtcService,
  getWindow: () => Pick<BrowserWindow, 'webContents' | 'isDestroyed'> | null = getMainWindow,
): (() => void) =>
  service.onCommand((command: SmtcCommand) => {
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
    try {
      await service.setMetadata(createSmtcMetadataFromStatus(status));
    } catch (error) {
      logWarn('[SMTC] Failed to sync metadata', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (status.state !== state.lastPlaybackState) {
    state.lastPlaybackState = status.state;
    try {
      await service.setPlaybackState(status.state);
    } catch (error) {
      logWarn('[SMTC] Failed to sync playback state', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const now = Date.now();
  if (now - state.lastTimelineSyncAt >= 1000 || status.state !== 'playing') {
    state.lastTimelineSyncAt = now;
    try {
      await service.setTimeline(status.positionSeconds, status.durationSeconds);
    } catch (error) {
      logWarn('[SMTC] Failed to sync timeline', { error: error instanceof Error ? error.message : String(error) });
    }
  }
};

export const initializeSmtcIntegration = async (): Promise<void> => {
  if (state.initialized) {
    return;
  }

  const service = getSmtcService();
  await service.initialize();
  await service.setEnabledActions({ play: true, pause: true, previous: true, next: true, seek: false });
  state.unsubscribeCommand = bindSmtcCommandBridge(service);
  state.statusListener = (status: AudioStatus) => {
    void syncSmtcStatus(status);
  };
  getAudioSession().on('status', state.statusListener);
  state.initialized = true;
  await syncSmtcStatus();
};

export const disposeSmtcIntegration = (): void => {
  if (!state.initialized) {
    return;
  }

  if (state.statusListener) {
    getAudioSession().off('status', state.statusListener);
  }
  state.unsubscribeCommand?.();
  getSmtcService().dispose();
  state.initialized = false;
  state.unsubscribeCommand = null;
  state.statusListener = null;
  state.lastMetadataKey = null;
  state.lastPlaybackState = null;
  state.lastTimelineSyncAt = 0;
};
