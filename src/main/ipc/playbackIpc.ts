import { dialog, ipcMain } from 'electron';
import { SUPPORTED_AUDIO_DIALOG_EXTENSIONS } from '../../shared/constants/audioExtensions';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AudioOutputMode, AudioOutputSettings, PlaybackSpeedMode } from '../../shared/types/audio';
import type { PlaybackProbeHint, PlaybackStartRequest, PlaybackStatus } from '../../shared/types/playback';
import { getAudioSession } from '../audio/AudioSession';
import { getPlaybackMemoryStore } from '../audio/PlaybackMemoryStore';
import { syncSmtcStatus } from '../integrations/smtc/SmtcStatusSync';

const outputModes = new Set<AudioOutputMode>(['shared', 'exclusive', 'asio']);
const playbackSpeedModes = new Set<PlaybackSpeedMode>(['nightcore', 'daycore', 'speed']);

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
};

const optionalPositiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
};

const optionalNonNegativeNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
};

const normalizeOutputSettings = (value: unknown): AudioOutputSettings | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const output: AudioOutputSettings = {};

  if (typeof input.outputMode === 'string' && outputModes.has(input.outputMode as AudioOutputMode)) {
    output.outputMode = input.outputMode as AudioOutputMode;
  }

  if (typeof input.deviceIndex === 'number' && Number.isInteger(input.deviceIndex)) {
    output.deviceIndex = input.deviceIndex;
  }

  if (typeof input.deviceName === 'string' && input.deviceName.trim()) {
    output.deviceName = input.deviceName;
  }

  const requestedOutputSampleRate = optionalPositiveNumber(input.requestedOutputSampleRate);
  if (requestedOutputSampleRate) {
    output.requestedOutputSampleRate = Math.round(requestedOutputSampleRate);
  }

  if (typeof input.volume === 'number' && Number.isFinite(input.volume)) {
    output.volume = Math.max(0, Math.min(1, input.volume));
  }

  if (typeof input.playbackRate === 'number' && Number.isFinite(input.playbackRate)) {
    output.playbackRate = Math.max(0.5, Math.min(2, input.playbackRate));
  }

  if (typeof input.playbackSpeedMode === 'string' && playbackSpeedModes.has(input.playbackSpeedMode as PlaybackSpeedMode)) {
    output.playbackSpeedMode = input.playbackSpeedMode as PlaybackSpeedMode;
  }

  return output;
};

const optionalText = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }

  return typeof value === 'string' && value.trim() ? value : undefined;
};

const normalizeProbeHint = (value: unknown): PlaybackProbeHint | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const output: PlaybackProbeHint = {};
  const durationSeconds = optionalNonNegativeNumber(input.durationSeconds);
  const fileSampleRate = input.fileSampleRate === null ? null : optionalPositiveNumber(input.fileSampleRate);
  const channels = optionalPositiveNumber(input.channels);
  const bitDepth = input.bitDepth === null ? null : optionalPositiveNumber(input.bitDepth);
  const bitrate = input.bitrate === null ? null : optionalPositiveNumber(input.bitrate);
  const codec = optionalText(input.codec);

  if (durationSeconds !== undefined) {
    output.durationSeconds = durationSeconds;
  }

  if (fileSampleRate !== undefined) {
    output.fileSampleRate = fileSampleRate === null ? null : Math.round(fileSampleRate);
  }

  if (channels !== undefined) {
    output.channels = Math.max(1, Math.min(8, Math.round(channels)));
  }

  if (codec !== undefined) {
    output.codec = codec;
  }

  if (bitDepth !== undefined) {
    output.bitDepth = bitDepth === null ? null : Math.round(bitDepth);
  }

  if (bitrate !== undefined) {
    output.bitrate = bitrate === null ? null : Math.round(bitrate);
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

const normalizePlayRequest = (value: unknown): PlaybackStartRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('playback request must be an object');
  }

  const input = value as Record<string, unknown>;

  return {
    filePath: requireText(input.filePath, 'filePath'),
    trackId: typeof input.trackId === 'string' && input.trackId.trim() ? input.trackId : undefined,
    startSeconds: optionalNonNegativeNumber(input.startSeconds),
    output: normalizeOutputSettings(input.output),
    probe: normalizeProbeHint(input.probe),
  };
};

const toPlaybackStatus = (): PlaybackStatus => {
  const status = getAudioSession().getStatus();

  return {
    state: status.state,
    currentTrackId: status.currentTrackId,
    positionMs: Math.round(status.positionSeconds * 1000),
    durationMs: Math.round(status.durationSeconds * 1000),
    filePath: status.currentFilePath,
  };
};

let playbackMemoryRegistered = false;
let lastPlaybackMemorySaveAt = 0;
const playbackMemorySaveIntervalMs = 5000;

export const savePlaybackMemoryNow = (): void => {
  getPlaybackMemoryStore().save(getAudioSession().getStatus());
};

const registerPlaybackMemoryPersistence = (): void => {
  if (playbackMemoryRegistered) {
    return;
  }

  playbackMemoryRegistered = true;
  const storedMemory = getPlaybackMemoryStore().load();
  if (storedMemory) {
    getAudioSession().restorePlaybackMemory(storedMemory);
  }

  getAudioSession().on('status', () => {
    const now = Date.now();
    if (now - lastPlaybackMemorySaveAt < playbackMemorySaveIntervalMs) {
      return;
    }

    lastPlaybackMemorySaveAt = now;
    savePlaybackMemoryNow();
  });
};

export const registerPlaybackIpc = (): void => {
  registerPlaybackMemoryPersistence();
  ipcMain.handle(IpcChannels.PlaybackGetStatus, (): PlaybackStatus => toPlaybackStatus());
  ipcMain.handle(IpcChannels.PlaybackPlayLocalFile, async (_event, request: unknown): Promise<PlaybackStatus> => {
    await getAudioSession().playLocalFile(normalizePlayRequest(request));
    savePlaybackMemoryNow();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackPlay, async (): Promise<PlaybackStatus> => {
    await getAudioSession().play();
    savePlaybackMemoryNow();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackPause, (): PlaybackStatus => {
    getAudioSession().pause();
    savePlaybackMemoryNow();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackStop, (): PlaybackStatus => {
    getAudioSession().stop();
    getPlaybackMemoryStore().clear();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackSeek, async (_event, positionSeconds: unknown): Promise<PlaybackStatus> => {
    await getAudioSession().seek(optionalNonNegativeNumber(positionSeconds) ?? 0);
    savePlaybackMemoryNow();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackOpenLocalAudioFile, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Open local audio file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio files',
          extensions: SUPPORTED_AUDIO_DIALOG_EXTENSIONS,
        },
      ],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
};
