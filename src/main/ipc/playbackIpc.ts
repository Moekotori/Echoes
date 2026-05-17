import { dialog, ipcMain } from 'electron';
import { SUPPORTED_AUDIO_DIALOG_EXTENSIONS } from '../../shared/constants/audioExtensions';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { normalizeAudioOutputModeForPlatform, normalizeAudioSharedBackendForPlatform } from '../../shared/utils/audioPlatformCapabilities';
import type { AudioLatencyProfile, AudioOutputMode, AudioOutputSettings, AudioSharedBackend, AudioStatus, PlaybackSpeedMode } from '../../shared/types/audio';
import type {
  LocalFileResolveResult,
  PlaybackMediaStartRequest,
  PlaybackPrepareLocalFileRequest,
  PlaybackProbeHint,
  PlaybackStartRequest,
  PlaybackStatus,
} from '../../shared/types/playback';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, type StreamingAudioQuality, type StreamingProviderName } from '../../shared/types/streaming';
import { getAudioSession, type AudioErrorRecoveryHandler } from '../audio/AudioSession';
import { getPlaybackMemoryStore } from '../audio/PlaybackMemoryStore';
import { getCrashReportService } from '../diagnostics/CrashReportService';
import { syncSmtcStatus } from '../integrations/smtc/SmtcStatusSync';
import { getRemoteSourceService } from '../library/remote/RemoteSourceService';
import { resolveLocalAudioFiles } from '../app/localFileOpen';
import { getStreamingService } from '../streaming/StreamingService';
import { normalizePlaybackFilePath } from './playbackPath';

const outputModes = new Set<AudioOutputMode>(['shared', 'exclusive', 'asio']);
const sharedBackends = new Set<AudioSharedBackend>(['auto', 'windows', 'directsound']);
const latencyProfiles = new Set<AudioLatencyProfile>(['stable', 'balanced', 'lowLatency']);
const playbackSpeedModes = new Set<PlaybackSpeedMode>(['nightcore', 'daycore', 'speed']);
const streamingProviders = new Set<StreamingProviderName>(streamingProviderNames);
const preparedMediaTtlMs = 2 * 60 * 1000;
const maxExpiredUrlRecoveryAttempts = 1;

type PreparedMediaItem = {
  filePath: string;
  inputHeaders?: Record<string, string>;
  probe?: PlaybackProbeHint;
  durationSeconds: number | null;
};

type ActiveMediaPlayback = {
  key: string;
  request: PlaybackMediaStartRequest;
  recoveryAttempts: number;
  recoveryInFlight: boolean;
};

const preparedMediaCache = new Map<string, { expiresAt: number; prepared: PreparedMediaItem }>();
let activeMediaPlayback: ActiveMediaPlayback | null = null;
let audioErrorRecoveryRegistered = false;

const isSupersededPlaybackRun = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('audio_session_run_cancelled');
};

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
    output.outputMode = normalizeAudioOutputModeForPlatform(input.outputMode as AudioOutputMode, process.platform);
  }

  if (typeof input.sharedBackend === 'string' && sharedBackends.has(input.sharedBackend as AudioSharedBackend)) {
    output.sharedBackend = normalizeAudioSharedBackendForPlatform(input.sharedBackend as AudioSharedBackend, process.platform);
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

  if (Object.prototype.hasOwnProperty.call(input, 'bufferSizeFrames')) {
    const bufferSizeFrames = optionalPositiveNumber(input.bufferSizeFrames);
    output.bufferSizeFrames = bufferSizeFrames ? Math.round(bufferSizeFrames) : null;
  }

  if (typeof input.useJuceOutput === 'boolean') {
    output.useJuceOutput = input.useJuceOutput;
  }

  if (typeof input.useJuceDecode === 'boolean') {
    output.useJuceDecode = input.useJuceDecode;
  }

  if (input.dsdOutputMode === 'dop' || input.dsdOutputMode === 'pcm') {
    output.dsdOutputMode = input.dsdOutputMode;
  }

  if (typeof input.asioNativeDsdExperimentalEnabled === 'boolean') {
    output.asioNativeDsdExperimentalEnabled = input.asioNativeDsdExperimentalEnabled;
  }

  if (typeof input.asioUnavailableFallbackEnabled === 'boolean') {
    output.asioUnavailableFallbackEnabled = input.asioUnavailableFallbackEnabled;
  }

  if (typeof input.soxrFallbackEnabled === 'boolean') {
    output.soxrFallbackEnabled = input.soxrFallbackEnabled;
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
  if (error && typeof error === 'object') {
    const kind = (error as { ffmpegErrorKind?: unknown }).ffmpegErrorKind;
    if (typeof kind === 'string') {
      return kind === 'http_expired_or_forbidden';
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return /kind="http_expired_or_forbidden"|\b(?:401|403|404)\b|expired|forbidden|unauthorized|server returned 4\d\d|http error\s*4\d\d/iu.test(message);
};

const createPreparedMediaKey = (request: PlaybackMediaStartRequest): string => {
  const item = request.item;
  if (item.mediaType === 'remote') {
    return JSON.stringify({
      mediaType: item.mediaType,
      trackId: item.trackId,
      sourceId: item.sourceId,
      stableKey: item.stableKey,
      remotePath: item.remotePath,
    });
  }

  if (item.mediaType === 'streaming') {
    return JSON.stringify({
      mediaType: item.mediaType,
      provider: item.provider,
      providerTrackId: item.providerTrackId,
      quality: item.quality,
      stableKey: item.stableKey,
    });
  }

  return JSON.stringify({ mediaType: item.mediaType, trackId: item.trackId, path: item.path });
};

const setActiveMediaPlayback = (request: PlaybackMediaStartRequest): void => {
  if (request.item.mediaType !== 'remote' && request.item.mediaType !== 'streaming') {
    activeMediaPlayback = null;
    return;
  }

  activeMediaPlayback = {
    key: createPreparedMediaKey(request),
    request,
    recoveryAttempts: 0,
    recoveryInFlight: false,
  };
};

const clearActiveMediaPlayback = (): void => {
  activeMediaPlayback = null;
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
    filePath: normalizePlaybackFilePath(requireText(input.filePath, 'filePath')),
    trackId: typeof input.trackId === 'string' && input.trackId.trim() ? input.trackId : undefined,
    startSeconds: optionalNonNegativeNumber(input.startSeconds),
    output: normalizeOutputSettings(input.output),
    probe: normalizeProbeHint(input.probe),
  };
};

const normalizePrepareLocalFileRequest = (value: unknown): PlaybackPrepareLocalFileRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('prepare local file request must be an object');
  }

  const input = value as Record<string, unknown>;

  return {
    filePath: normalizePlaybackFilePath(requireText(input.filePath, 'filePath')),
    trackId: typeof input.trackId === 'string' && input.trackId.trim() ? input.trackId : undefined,
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
    path: normalizePlaybackFilePath(requireText(input.path, 'path')),
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

const resolveMediaItemForPlayback = async (
  request: PlaybackMediaStartRequest,
  options: { forceRefresh?: boolean } = {},
): Promise<PreparedMediaItem> => {
  const key = createPreparedMediaKey(request);
  const cached = preparedMediaCache.get(key);
  const now = Date.now();
  if (!options.forceRefresh && cached && cached.expiresAt > now) {
    preparedMediaCache.delete(key);
    return cached.prepared;
  }

  if (cached && cached.expiresAt <= now) {
    preparedMediaCache.delete(key);
  }

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
    if (item.provider === 'spotify') {
      throw new Error('Spotify playback uses the official Web Playback SDK and must not enter the native audio session.');
    }

    const playbackRequest = {
      provider: item.provider,
      providerTrackId: item.providerTrackId,
      quality: item.quality,
    };

    if (options.forceRefresh) {
      getStreamingService().invalidatePlayback(playbackRequest);
    }

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
    return { filePath, inputHeaders: source.headers, probe, durationSeconds };
  } else {
    filePath = item.path;
  }

  return { filePath, probe, durationSeconds };
};

const prepareMediaItem = async (request: PlaybackMediaStartRequest): Promise<void> => {
  const key = createPreparedMediaKey(request);
  const prepared = await resolveMediaItemForPlayback(request, { forceRefresh: true });
  preparedMediaCache.set(key, {
    prepared,
    expiresAt: Date.now() + preparedMediaTtlMs,
  });
};

const normalizePathList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new Error('paths must be an array');
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(normalizePlaybackFilePath);
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

const reportPlaybackAudioError = (error: unknown, phase: string, details?: unknown): void => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const status = getAudioSession().getStatus();

  if (status.error === normalized.message) {
    return;
  }

  getCrashReportService().reportAudioError({
    message: normalized.message,
    stack: normalized.stack,
    phase,
    severity: 'fatal',
    details,
    audioStatus: status,
  });
};

const reportPlaybackAudioRecovery = (error: unknown, phase: string, details?: unknown): void => {
  const normalized = error instanceof Error ? error : new Error(String(error));

  getCrashReportService().reportAudioError({
    message: normalized.message,
    stack: normalized.stack,
    phase,
    severity: 'recoverable',
    recovered: true,
    details,
    audioStatus: getAudioSession().getStatus(),
  });
};

const clampRecoveryPositionSeconds = (status: AudioStatus): number => {
  const positionSeconds = Number.isFinite(status.positionSeconds) ? Math.max(0, status.positionSeconds) : 0;
  const durationSeconds = Number.isFinite(status.durationSeconds) && status.durationSeconds > 0 ? status.durationSeconds : Number.POSITIVE_INFINITY;

  return Math.min(positionSeconds, durationSeconds);
};

const recoverActiveMediaPlaybackFromExpiredUrl = async (
  active: ActiveMediaPlayback,
  error: Error,
  status: AudioStatus,
): Promise<void> => {
  const { key, request } = active;
  let playbackStartAttempted = false;

  try {
    preparedMediaCache.delete(key);
    const prepared = await resolveMediaItemForPlayback(request, { forceRefresh: true });
    if (activeMediaPlayback !== active || activeMediaPlayback.key !== key) {
      return;
    }

    const startSeconds = clampRecoveryPositionSeconds(status);
    playbackStartAttempted = true;
    await getAudioSession().playLocalFile({
      filePath: prepared.filePath,
      inputHeaders: prepared.inputHeaders,
      trackId: request.item.trackId,
      startSeconds,
      output: request.output,
      probe: prepared.probe,
    });
    savePlaybackMemoryNow();
    const recoveredStatus = toPlaybackStatus();
    if (request.item.mediaType === 'remote' && recoveredStatus.durationMs > 0) {
      getRemoteSourceService().backfillDuration(request.item.trackId, recoveredStatus.durationMs / 1000);
      getRemoteSourceService().setPlaybackActive(true);
    }
    void syncSmtcStatus();
    reportPlaybackAudioRecovery(error, 'play-media-item-expired-url-retry', {
      recovered: true,
      mediaType: request.item.mediaType,
      trackId: request.item.trackId,
      provider: request.item.mediaType === 'streaming' ? request.item.provider : undefined,
      providerTrackId: request.item.mediaType === 'streaming' ? request.item.providerTrackId : undefined,
      startSeconds,
      attempt: active.recoveryAttempts,
    });
  } catch (retryError) {
    if (!playbackStartAttempted && !isSupersededPlaybackRun(retryError)) {
      clearActiveMediaPlayback();
      reportPlaybackAudioError(retryError, 'play-media-item-expired-url-refresh', {
        request,
        originalError: error.message,
      });
      getAudioSession().stop();
    }
  } finally {
    if (activeMediaPlayback === active && activeMediaPlayback.key === key) {
      activeMediaPlayback.recoveryInFlight = false;
    }
  }
};

const beginActiveMediaExpiredUrlRecovery: AudioErrorRecoveryHandler = (error, status) => {
  const active = activeMediaPlayback;
  if (!active || active.recoveryInFlight || active.recoveryAttempts >= maxExpiredUrlRecoveryAttempts) {
    return false;
  }

  if ((active.request.item.mediaType !== 'streaming' && active.request.item.mediaType !== 'remote') || !isLikelyExpiredUrlError(error)) {
    return false;
  }

  active.recoveryAttempts += 1;
  active.recoveryInFlight = true;
  void recoverActiveMediaPlaybackFromExpiredUrl(active, error, status);
  return true;
};

const registerExpiredUrlRecovery = (): void => {
  if (audioErrorRecoveryRegistered) {
    return;
  }

  audioErrorRecoveryRegistered = true;
  const session = getAudioSession() as ReturnType<typeof getAudioSession> & {
    setAudioErrorRecoveryHandler?: (handler: AudioErrorRecoveryHandler | null) => void;
  };
  session.setAudioErrorRecoveryHandler?.(beginActiveMediaExpiredUrlRecovery);
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
  registerExpiredUrlRecovery();
  ipcMain.handle(IpcChannels.PlaybackGetStatus, (): PlaybackStatus => toPlaybackStatus());
  ipcMain.handle(IpcChannels.PlaybackPlayLocalFile, async (_event, request: unknown): Promise<PlaybackStatus> => {
    clearActiveMediaPlayback();
    try {
      await getAudioSession().playLocalFile(normalizePlayRequest(request));
      savePlaybackMemoryNow();
      void syncSmtcStatus();
      return toPlaybackStatus();
    } catch (error) {
      if (!isSupersededPlaybackRun(error)) {
        reportPlaybackAudioError(error, 'play-local-file-ipc', { request });
      }
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.PlaybackPrepareMediaItem, async (_event, rawRequest: unknown): Promise<void> => {
    try {
      await prepareMediaItem(normalizeMediaPlayRequest(rawRequest));
    } catch (error) {
      console.warn(`[playback] prepareMediaItem failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  ipcMain.handle(IpcChannels.PlaybackPrepareLocalFile, async (_event, rawRequest: unknown): Promise<void> => {
    try {
      await getAudioSession().prepareLocalFile(normalizePrepareLocalFileRequest(rawRequest));
    } catch (error) {
      console.warn(`[playback] prepareLocalFile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  ipcMain.handle(IpcChannels.PlaybackPlayMediaItem, async (_event, rawRequest: unknown): Promise<PlaybackStatus> => {
    let request: PlaybackMediaStartRequest;
    try {
      request = normalizeMediaPlayRequest(rawRequest);
    } catch (error) {
      reportPlaybackAudioError(error, 'play-media-item-ipc', { request: rawRequest });
      throw error;
    }

    const item = request.item;
    clearActiveMediaPlayback();
    if (item.mediaType === 'streaming' && item.provider === 'spotify') {
      throw new Error('Spotify playback uses the official Web Playback SDK and must not enter the native audio session.');
    }

    try {
      let prepared = await resolveMediaItemForPlayback(request);

      await getAudioSession().playLocalFile({
        filePath: prepared.filePath,
        inputHeaders: prepared.inputHeaders,
        trackId: item.trackId,
        startSeconds: request.startSeconds,
        output: request.output,
        probe: prepared.probe,
      });
      savePlaybackMemoryNow();
      const status = toPlaybackStatus();
      if (item.mediaType === 'remote' && status.durationMs > 0) {
        getRemoteSourceService().backfillDuration(item.trackId, status.durationMs / 1000);
      }
      if (item.mediaType === 'remote') {
        getRemoteSourceService().setPlaybackActive(true);
      }
      setActiveMediaPlayback(request);
      void syncSmtcStatus();
      return status;
    } catch (error) {
      if ((item.mediaType !== 'streaming' && item.mediaType !== 'remote') || !isLikelyExpiredUrlError(error)) {
        if (!isSupersededPlaybackRun(error)) {
          reportPlaybackAudioError(error, 'play-media-item-ipc', { request: rawRequest });
        }
        throw error;
      }

      preparedMediaCache.delete(createPreparedMediaKey(request));
      try {
        const prepared = await resolveMediaItemForPlayback(request, { forceRefresh: true });
        await getAudioSession().playLocalFile({
          filePath: prepared.filePath,
          inputHeaders: prepared.inputHeaders,
          trackId: item.trackId,
          startSeconds: request.startSeconds,
          output: request.output,
          probe: prepared.probe,
        });
        savePlaybackMemoryNow();
        const status = toPlaybackStatus();
        if (item.mediaType === 'remote' && status.durationMs > 0) {
          getRemoteSourceService().backfillDuration(item.trackId, status.durationMs / 1000);
        }
        if (item.mediaType === 'remote') {
          getRemoteSourceService().setPlaybackActive(true);
        }
        setActiveMediaPlayback(request);
        void syncSmtcStatus();
        return status;
      } catch (retryError) {
        if (!isSupersededPlaybackRun(retryError)) {
          reportPlaybackAudioError(retryError, 'play-media-item-retry-ipc', { request: rawRequest });
        }
        throw retryError;
      }
    }
  });
  ipcMain.handle(IpcChannels.PlaybackPlay, async (): Promise<PlaybackStatus> => {
    try {
      await getAudioSession().play();
      savePlaybackMemoryNow();
      void syncSmtcStatus();
      return toPlaybackStatus();
    } catch (error) {
      if (error instanceof Error && beginActiveMediaExpiredUrlRecovery(error, getAudioSession().getStatus())) {
        return toPlaybackStatus();
      }

      reportPlaybackAudioError(error, 'playback-resume-ipc');
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.PlaybackPause, (): PlaybackStatus => {
    getAudioSession().pause();
    savePlaybackMemoryNow();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackStop, (): PlaybackStatus => {
    clearActiveMediaPlayback();
    getAudioSession().stop();
    getRemoteSourceService().setPlaybackActive(false);
    getPlaybackMemoryStore().clear();
    void syncSmtcStatus();
    return toPlaybackStatus();
  });
  ipcMain.handle(IpcChannels.PlaybackSeek, async (_event, positionSeconds: unknown): Promise<PlaybackStatus> => {
    try {
      await getAudioSession().seek(optionalNonNegativeNumber(positionSeconds) ?? 0);
      savePlaybackMemoryNow();
      void syncSmtcStatus();
      return toPlaybackStatus();
    } catch (error) {
      reportPlaybackAudioError(error, 'playback-seek-ipc', { positionSeconds });
      throw error;
    }
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
