import { dialog, ipcMain } from 'electron';
import { SUPPORTED_AUDIO_DIALOG_EXTENSIONS } from '../../shared/constants/audioExtensions';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AudioLatencyProfile, AudioOutputMode, AudioOutputSettings, PlaybackSpeedMode } from '../../shared/types/audio';
import type { LocalFileResolveResult, PlaybackMediaStartRequest, PlaybackProbeHint, PlaybackStartRequest, PlaybackStatus } from '../../shared/types/playback';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, type StreamingAudioQuality, type StreamingProviderName } from '../../shared/types/streaming';
import { getAudioSession } from '../audio/AudioSession';
import { getPlaybackMemoryStore } from '../audio/PlaybackMemoryStore';
import { syncSmtcStatus } from '../integrations/smtc/SmtcStatusSync';
import { getRemoteSourceService } from '../library/remote/RemoteSourceService';
import { resolveLocalAudioFiles } from '../app/localFileOpen';
import { getStreamingService } from '../streaming/StreamingService';

const outputModes = new Set<AudioOutputMode>(['shared', 'exclusive', 'asio']);
const latencyProfiles = new Set<AudioLatencyProfile>(['stable', 'balanced', 'lowLatency']);
const playbackSpeedModes = new Set<PlaybackSpeedMode>(['nightcore', 'daycore', 'speed']);
const streamingProviders = new Set<StreamingProviderName>(streamingProviderNames);

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

  if (typeof input.latencyProfile === 'string' && latencyProfiles.has(input.latencyProfile as AudioLatencyProfile)) {
    output.latencyProfile = input.latencyProfile as AudioLatencyProfile;
  }

  const bufferSizeFrames = optionalPositiveNumber(input.bufferSizeFrames);
  if (bufferSizeFrames) {
    output.bufferSizeFrames = Math.round(bufferSizeFrames);
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

const isStreamingProviderName = (value: string | null): value is StreamingProviderName =>
  Boolean(value && streamingProviders.has(value as StreamingProviderName));

const optionalStreamingQuality = (value: unknown): StreamingAudioQuality | undefined =>
  value === 'standard' || value === 'high' || value === 'lossless' || value === 'hires' ? value : undefined;

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value);

const isLikelyExpiredUrlError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /403|404|expired|forbidden|unauthorized|invalid data|server returned|http error/iu.test(message);
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

const normalizeMediaItem = (value: unknown): PlayableTrack => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('media item must be an object');
  }

  const input = value as Record<string, unknown>;
  const mediaType = input.mediaType === 'remote' || input.mediaType === 'streaming' ? input.mediaType : 'local';
  const provider = optionalText(input.provider) ?? null;
  const base = {
    trackId: requireText(input.trackId, 'trackId'),
    title: typeof input.title === 'string' ? input.title : '',
    artist: typeof input.artist === 'string' ? input.artist : '',
    album: typeof input.album === 'string' ? input.album : '',
    albumArtist: typeof input.albumArtist === 'string' ? input.albumArtist : null,
    duration: typeof input.duration === 'number' && Number.isFinite(input.duration) ? input.duration : null,
    coverThumb: optionalText(input.coverThumb) ?? null,
  };

  if (mediaType === 'remote') {
    return {
      ...base,
      mediaType,
      sourceId: optionalText(input.sourceId) ?? null,
      stableKey: optionalText(input.stableKey) ?? null,
      remotePath: optionalText(input.remotePath) ?? null,
    };
  }

  if (mediaType === 'streaming') {
    if (!isStreamingProviderName(provider)) {
      throw new Error('streaming provider is required for playback');
    }

    return {
      ...base,
      mediaType,
      provider,
      providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
      quality: optionalStreamingQuality(input.quality),
      stableKey: requireText(input.stableKey, 'stableKey'),
      playable: input.playable !== false,
      unavailableReason: optionalText(input.unavailableReason) ?? null,
    };
  }

  return {
    ...base,
    mediaType: 'local',
    path: requireText(input.path, 'path'),
  };
};

const normalizeMediaPlayRequest = (value: unknown): PlaybackMediaStartRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('playback media request must be an object');
  }

  const input = value as Record<string, unknown>;
  return {
    item: normalizeMediaItem(input.item),
    startSeconds: optionalNonNegativeNumber(input.startSeconds),
    output: normalizeOutputSettings(input.output),
  };
};

const normalizePathList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new Error('paths must be an array');
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const showOpenLocalAudioFiles = async (properties: Electron.OpenDialogOptions['properties']): Promise<string[] | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Open local audio file',
    properties,
    filters: [
      {
        name: 'Audio files',
        extensions: SUPPORTED_AUDIO_DIALOG_EXTENSIONS,
      },
    ],
  });

  return result.canceled ? null : result.filePaths;
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
  ipcMain.handle(IpcChannels.PlaybackPlayMediaItem, async (_event, rawRequest: unknown): Promise<PlaybackStatus> => {
    const request = normalizeMediaPlayRequest(rawRequest);
    const item = request.item;
    let durationSeconds = item.duration && item.duration > 0 ? item.duration : null;
    if (item.mediaType === 'remote' && !durationSeconds) {
      getRemoteSourceService().setPlaybackActive(true);
      const refreshed = await getRemoteSourceService().refreshTrackMetadata(item.trackId);
      durationSeconds = refreshed?.duration && refreshed.duration > 0 ? refreshed.duration : null;
    }

    let filePath: string;
    let probe: PlaybackProbeHint | undefined = durationSeconds ? { durationSeconds } : undefined;

    if (item.mediaType === 'remote') {
      filePath = (
        await getRemoteSourceService().createStreamUrl({
          trackId: item.trackId,
          sourceId: item.sourceId ?? undefined,
          remotePath: item.remotePath ?? undefined,
          stableKey: item.stableKey ?? undefined,
        })
      ).url;
    } else if (item.mediaType === 'streaming') {
      const playbackRequest = {
        provider: item.provider,
        providerTrackId: item.providerTrackId,
        quality: item.quality,
      };

      const source = await getStreamingService().resolvePlayback(playbackRequest);

      if (source.requiresProxy) {
        throw new Error('This streaming source requires the streaming proxy adapter, which is not enabled yet.');
      }

      filePath = source.url;
      probe =
        durationSeconds || isHttpUrl(source.url)
          ? {
              durationSeconds: durationSeconds ?? undefined,
              fileSampleRate: source.sampleRate,
              channels: 2,
              codec: source.codec,
              bitDepth: source.bitDepth,
              bitrate: source.bitrate,
            }
          : undefined;
    } else {
      filePath = item.path;
    }

    try {
      await getAudioSession().playLocalFile({
        filePath,
        trackId: item.trackId,
        startSeconds: request.startSeconds,
        output: request.output,
        probe,
      });
    } catch (error) {
      if (item.mediaType !== 'streaming' || !isLikelyExpiredUrlError(error)) {
        throw error;
      }

      const playbackRequest = {
        provider: item.provider,
        providerTrackId: item.providerTrackId,
        quality: item.quality,
      };
      getStreamingService().invalidatePlayback(playbackRequest);
      const refreshedSource = await getStreamingService().resolvePlayback(playbackRequest);
      await getAudioSession().playLocalFile({
        filePath: refreshedSource.url,
        trackId: item.trackId,
        startSeconds: request.startSeconds,
        output: request.output,
        probe:
          durationSeconds || isHttpUrl(refreshedSource.url)
            ? {
                durationSeconds: durationSeconds ?? undefined,
                fileSampleRate: refreshedSource.sampleRate,
                channels: 2,
                codec: refreshedSource.codec,
                bitDepth: refreshedSource.bitDepth,
                bitrate: refreshedSource.bitrate,
              }
            : undefined,
      });
    }
    savePlaybackMemoryNow();
    const status = toPlaybackStatus();
    if (item.mediaType === 'remote' && status.durationMs > 0) {
      getRemoteSourceService().backfillDuration(item.trackId, status.durationMs / 1000);
    }
    if (item.mediaType === 'remote') {
      getRemoteSourceService().setPlaybackActive(true);
    }
    void syncSmtcStatus();
    return status;
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
    getRemoteSourceService().setPlaybackActive(false);
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
    const filePaths = await showOpenLocalAudioFiles(['openFile']);

    return filePaths?.[0] ?? null;
  });
  ipcMain.handle(IpcChannels.PlaybackOpenLocalAudioFiles, async (): Promise<string[] | null> => {
    const filePaths = await showOpenLocalAudioFiles(['openFile', 'multiSelections']);

    return filePaths && filePaths.length > 0 ? filePaths : null;
  });
  ipcMain.handle(IpcChannels.PlaybackResolveLocalAudioFiles, (_event, paths: unknown): Promise<LocalFileResolveResult> => {
    return resolveLocalAudioFiles(normalizePathList(paths));
  });
};
