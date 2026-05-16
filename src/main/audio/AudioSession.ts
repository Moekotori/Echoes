import { EventEmitter } from 'node:events';
import { Transform } from 'node:stream';
import { performance } from 'node:perf_hooks';
import type { Writable } from 'node:stream';
import { DeviceService, type DeviceListOptions } from './DeviceService';
import { DecoderPipeline } from './DecoderPipeline';
import { getEqBridge } from './EqBridge';
import { PcmLevelMeterTransform, createAudioLevelTelemetry, type PcmLevelSnapshot } from './AudioLevelMeter';
import { NativeOutputBridge, isNativeOutputBridgeAvailable } from './NativeOutputBridge';
import { PlaybackClock } from './PlaybackClock';
import { resolveDsdPcmOutputSampleRate, shouldProbeDsdNativeSampleRate } from './DsdProbe';
import type {
  AudioDeviceInfo,
  AudioDiagnostics,
  AudioLatencyProfile,
  AudioOutputMode,
  AudioOutputSettings,
  AudioPlaybackState,
  AudioProbeResult,
  AudioResamplerEngine,
  AudioSharedBackend,
  AudioSessionPrepareLocalFileRequest,
  AudioSessionPlayRequest,
  AudioStatus,
  DecoderRun,
  FfmpegToolchainDiagnostics,
  NativeHostNotificationEvent,
  NativeBridgeReadyResult,
  NativeOutputTelemetry,
  NativeOutputStartOptions,
  SampleRatePlan,
} from './audioTypes';
import type { PlaybackSpeedMode, SharedStabilityTier } from '../../shared/types/audio';
import type { PlaybackMemory } from './PlaybackMemoryStore';
import type { AudioCrashReportPayload } from '../diagnostics/CrashReportService';

type DecoderPipelineLike = Pick<DecoderPipeline, 'probeLocalFile' | 'decodeLocalFile'> & {
  getToolchainInfo?: () => FfmpegToolchainDiagnostics;
};
type DeviceServiceLike = Pick<DeviceService, 'listDevices'> & Partial<Pick<DeviceService, 'listDevicesAsync' | 'refresh' | 'openAsioControlPanel'>>;
type OutputBridgeLike = {
  writable: Writable | null;
  start: (options: NativeOutputStartOptions) => Promise<NativeBridgeReadyResult>;
  stop: () => void;
  stopGracefully?: (reason?: string, timeoutMs?: number, waitForExit?: boolean) => Promise<void>;
  canReuseFor?: (options: NativeOutputStartOptions) => boolean;
  beginSession?: (options?: { startSeconds?: number; playbackRate?: number; durationSeconds?: number }) => number;
  createSessionWritable?: (sessionId?: number) => Writable;
  endSession?: (sessionId?: number) => void;
  setVolume?: (volume: number) => void;
  getPositionSeconds: () => number;
  getPositionStalenessMs?: () => number | null;
  resetOutputClock?: (startSeconds?: number, playbackRate?: number) => void;
  on: (event: 'position' | 'ended' | 'error' | 'device-event', listener: (...args: unknown[]) => void) => OutputBridgeLike;
  off?: (event: 'position' | 'ended' | 'error' | 'device-event', listener: (...args: unknown[]) => void) => OutputBridgeLike;
  removeListener?: (event: 'position' | 'ended' | 'error' | 'device-event', listener: (...args: unknown[]) => void) => OutputBridgeLike;
};

type BridgeStartResult = {
  bridge: OutputBridgeLike;
  plan: SampleRatePlan;
  ready: NativeBridgeReadyResult;
  hostReused: boolean;
  hostRestartReason: string | null;
};

type PreparedLocalPlaybackItem = {
  filePath: string;
  trackId?: string;
  probe?: AudioSessionPrepareLocalFileRequest['probe'];
  preparedAt: number;
  expiresAt: number;
  outputMode?: AudioOutputMode;
  requestedOutputSampleRate?: number | null;
  decoderOutputSampleRate?: number | null;
  warnings?: string[];
};

type LocalPrepareContext = {
  key: string;
  outputSettings: AudioOutputSettings;
  device: AudioDeviceInfo | null;
};

type BridgeEventListeners = {
  position: (frames: unknown, telemetry?: unknown) => void;
  ended: () => void;
  error: (error: unknown) => void;
  deviceEvent: (event: unknown) => void;
};

type PreparedLocalProbeUse = {
  probe: AudioSessionPrepareLocalFileRequest['probe'];
  ageMs: number;
};

export type AudioSessionDependencies = {
  decoder?: DecoderPipelineLike;
  deviceService?: DeviceServiceLike;
  createBridge?: () => OutputBridgeLike;
  isNativeHostAvailable?: () => boolean;
  reportAudioError?: (payload: AudioCrashReportPayload) => void;
  logger?: (message: string) => void;
  watchdogIntervalMs?: number;
  watchdogStallChecks?: number;
  watchdogMaxRecoveriesPerTrack?: number;
  watchdogRecoveryWindowMs?: number;
  disableWatchdogTimer?: boolean;
};

const fallbackSampleRate = 44100;
const fallbackSharedMixSampleRate = 48000;
const preparedLocalPlaybackTtlMs = 2 * 60 * 1000;
const preparedLocalPlaybackMaxItems = 50;
const defaultWatchdogIntervalMs = 2000;
const defaultWatchdogStallChecks = 3;
const defaultWatchdogMaxRecoveriesPerTrack = 3;
const defaultWatchdogRecoveryWindowMs = 5 * 60 * 1000;
const watchdogPositionEpsilonSeconds = 0.05;
const nativeUnderrunWindowMs = 15_000;
const nativeUnderrunCallbackThreshold = 3;
const nativeUnderrunFramesThresholdMs = 100;
const nativeTelemetryStatusIntervalMs = 1000;
const levelMeterStatusIntervalMs = 1000;
const sharedStabilityMemoryTtlMs = 5 * 60 * 1000;
const asioFailedStartGracefulStopTimeoutMs = 1_000;
const asioUnavailableCooldownMs = 30_000;
const nativeHostNotificationEvents = new Set<NativeHostNotificationEvent['event']>([
  'default_device_changed',
  'device_state_changed',
  'device_removed',
  'audio_session_disconnected',
]);
const inactiveDeviceReasons = new Set(['disabled', 'not_present', 'unplugged', 'removed']);

const isNativeHostNotificationEvent = (event: unknown): event is NativeHostNotificationEvent => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return false;
  }

  const name = (event as { event?: unknown }).event;
  return typeof name === 'string' && nativeHostNotificationEvents.has(name as NativeHostNotificationEvent['event']);
};
const sharedReplacementGracefulStopTimeoutMs = 250;
const minReliableAsioSampleRate = 44_100;

const sharedStabilityProfiles: Record<
  SharedStabilityTier,
  Pick<NativeOutputStartOptions, 'bufferSizeFrames' | 'fifoCapacityMs' | 'startupPrebufferMs' | 'startupPrebufferTimeoutMs'>
> = {
  standard: {
    bufferSizeFrames: 2048,
    fifoCapacityMs: 420,
    startupPrebufferMs: 120,
    startupPrebufferTimeoutMs: 450,
  },
  recovery: {
    bufferSizeFrames: 4096,
    fifoCapacityMs: 750,
    startupPrebufferMs: 180,
    startupPrebufferTimeoutMs: 600,
  },
  emergency: {
    bufferSizeFrames: 8192,
    fifoCapacityMs: 1200,
    startupPrebufferMs: 240,
    startupPrebufferTimeoutMs: 800,
  },
};

const stableSharedProfile: Pick<
  NativeOutputStartOptions,
  'bufferSizeFrames' | 'fifoCapacityMs' | 'startupPrebufferMs' | 'startupPrebufferTimeoutMs'
> = {
  bufferSizeFrames: 8192,
  fifoCapacityMs: 1500,
  startupPrebufferMs: 250,
  startupPrebufferTimeoutMs: 600,
};

const directSoundSharedProfile: Pick<
  NativeOutputStartOptions,
  'bufferSizeFrames' | 'fifoCapacityMs' | 'startupPrebufferMs' | 'startupPrebufferTimeoutMs'
> = {
  bufferSizeFrames: 256,
  fifoCapacityMs: 120,
  startupPrebufferMs: 0,
  startupPrebufferTimeoutMs: 0,
};

const latencyProfiles: Record<AudioLatencyProfile, Pick<NativeOutputStartOptions, 'bufferSizeFrames'>> = {
  lowLatency: {
    bufferSizeFrames: 256,
  },
  balanced: {
    bufferSizeFrames: 2048,
  },
  stable: {
    bufferSizeFrames: 8192,
  },
};

const lowLatencyMaxBufferSizeFrames = 2048;
const lowLatencyBufferClampedWarning = `low_latency_buffer_clamped:${lowLatencyMaxBufferSizeFrames}`;
const lowLatencyBufferIgnoredWarning = 'low_latency_buffer_ignored';
const exclusiveLowLatencyMinimumBufferMs = 8;
const exclusiveLowLatencyBufferStepFrames = 128;

const defaultLatencyProfileForMode = (outputMode: AudioOutputMode): AudioLatencyProfile =>
  outputMode === 'asio' ? 'lowLatency' : 'balanced';

const defaultLogger = (message: string): void => {
  console.warn(message);
};

const defaultAudioErrorReporter = (payload: AudioCrashReportPayload): void => {
  void import('../diagnostics/CrashReportService')
    .then(({ getCrashReportService }) => {
      getCrashReportService().reportAudioError(payload);
    })
    .catch(() => undefined);
};

const normalizePositiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null;
};

const normalizeResetReason = (reason: string): string => {
  const normalized = reason.trim().replace(/[\r\n]+/gu, ' ').slice(0, 96);

  return normalized || 'force-restart';
};

const isHttpPlaybackUrl = (value: string): boolean => /^https?:\/\//iu.test(value.trim());

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const resolveBufferSizeFrames = (
  settings: AudioOutputSettings | undefined,
  fallback: number | null | undefined,
): number | undefined => {
  if (!settings || !hasOwn(settings, 'bufferSizeFrames')) {
    return fallback ?? undefined;
  }

  return normalizePositiveInteger(settings.bufferSizeFrames) ?? undefined;
};

const sanitizeLowLatencyBuffer = (
  outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
  bufferSizeFrames: number | undefined,
): { bufferSizeFrames: number | undefined; warning: string | null } => {
  if (latencyProfile !== 'lowLatency' || bufferSizeFrames === undefined || bufferSizeFrames <= lowLatencyMaxBufferSizeFrames) {
    return { bufferSizeFrames, warning: null };
  }

  if (outputMode === 'shared') {
    return { bufferSizeFrames: undefined, warning: lowLatencyBufferIgnoredWarning };
  }

  return { bufferSizeFrames: lowLatencyMaxBufferSizeFrames, warning: lowLatencyBufferClampedWarning };
};

const isWritableUsable = (writable: Writable | null): writable is Writable =>
  Boolean(writable && !writable.destroyed && !writable.writableEnded);

const normalizeOutputMode = (value: unknown): AudioOutputMode => {
  return value === 'exclusive' || value === 'asio' ? value : 'shared';
};

const normalizeSharedBackend = (value: unknown): AudioSharedBackend => {
  return value === 'windows' || value === 'directsound' ? value : 'auto';
};

const isResidentOutputMode = (value: unknown): boolean => {
  const mode = normalizeOutputMode(value);
  return mode === 'exclusive' || mode === 'asio';
};

const normalizeLatencyProfile = (value: unknown): AudioLatencyProfile => {
  return value === 'stable' || value === 'lowLatency' ? value : 'balanced';
};

const resolveSupportedLatencyProfile = (
  _outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
): AudioLatencyProfile => {
  return latencyProfile;
};

const resolveLatencyProfile = (
  nextOutputMode: AudioOutputMode,
  requestedLatencyProfile: unknown,
  previousOutputMode: AudioOutputMode,
  previousLatencyProfile: AudioLatencyProfile,
  outputModeWasRequested: boolean,
): AudioLatencyProfile => {
  if (requestedLatencyProfile !== undefined) {
    return resolveSupportedLatencyProfile(nextOutputMode, normalizeLatencyProfile(requestedLatencyProfile));
  }

  if (outputModeWasRequested && nextOutputMode !== previousOutputMode) {
    return defaultLatencyProfileForMode(nextOutputMode);
  }

  return resolveSupportedLatencyProfile(nextOutputMode, previousLatencyProfile ?? defaultLatencyProfileForMode(nextOutputMode));
};

const roundUpToExclusiveLowLatencyStep = (frames: number): number =>
  Math.ceil(frames / exclusiveLowLatencyBufferStepFrames) * exclusiveLowLatencyBufferStepFrames;

const getLatencyProfileBufferSizeFrames = (
  outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
  requestedOutputSampleRate: number,
): number => {
  const baseBufferSizeFrames = latencyProfiles[latencyProfile].bufferSizeFrames ?? 2048;

  if (outputMode !== 'exclusive' || latencyProfile !== 'lowLatency') {
    return baseBufferSizeFrames;
  }

  const sampleRate = normalizePositiveInteger(requestedOutputSampleRate) ?? 48000;
  const minimumFrames = Math.ceil((sampleRate * exclusiveLowLatencyMinimumBufferMs) / 1000);
  return Math.max(baseBufferSizeFrames, roundUpToExclusiveLowLatencyStep(minimumFrames));
};

const normalizePlaybackRate = (value: unknown): number => {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
};

const normalizePlaybackSpeedMode = (value: unknown): PlaybackSpeedMode => {
  return value === 'daycore' || value === 'speed' ? value : 'nightcore';
};

const hasExplicitDeviceSelection = (settings: AudioOutputSettings): boolean => {
  return Number.isInteger(Number(settings.deviceIndex)) || Boolean(settings.deviceName);
};

const createSharedFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
  ...settings,
  outputMode: 'shared',
  sharedBackend: 'windows',
  requestedOutputSampleRate: undefined,
  useJuceOutput: false,
});

const createSafeSharedFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
  ...settings,
  outputMode: 'shared',
  sharedBackend: 'windows',
  deviceIndex: undefined,
  deviceName: undefined,
  requestedOutputSampleRate: undefined,
  latencyProfile: 'stable',
  bufferSizeFrames: undefined,
  useJuceOutput: false,
});

const shouldUseJuceOutputForHost = (
  outputMode: AudioOutputMode,
  sharedBackend: AudioSharedBackend,
  requested: boolean,
): boolean => {
  if (!requested) {
    return false;
  }

  if (outputMode === 'asio') {
    return false;
  }

  return !(outputMode === 'shared' && sharedBackend === 'directsound');
};

const outputDeviceStartRefusedPatterns = [
  /Couldn't open the output device/iu,
  /Device didn't start correctly/iu,
  /timeout_waiting_for_ready/iu,
];

const deviceInitializeTimeoutPatterns = [
  /\bdevice_initialize_timeout\b/u,
];

const isDeviceInitializeTimeoutError = (error: Error): boolean =>
  deviceInitializeTimeoutPatterns.some((pattern) => pattern.test(error.message));

const isOutputDeviceStartRefused = (error: Error): boolean =>
  outputDeviceStartRefusedPatterns.some((pattern) => pattern.test(error.message)) ||
  isDeviceInitializeTimeoutError(error);

const asioUnavailablePatterns = [
  /No device found/iu,
  /ASE_NotPresent/iu,
  /failed to open output device/iu,
];

const isAsioDeviceUnavailableError = (error: Error): boolean =>
  asioUnavailablePatterns.some((pattern) => pattern.test(error.message));

const isEqControlDisconnectError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return /\beq_control_(?:closed|disconnected)\b/u.test(message);
};

const numericReadyField = (ready: NativeBridgeReadyResult, field: string): number | null => {
  const value = ready.device[field];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
};

const getReadyOutputSampleRate = (ready: NativeBridgeReadyResult): number | null =>
  normalizePositiveInteger(ready.actualDeviceSampleRate) ??
  normalizePositiveInteger(ready.device.sampleRate) ??
  normalizePositiveInteger(ready.device.hardwareSampleRate);

const createProbeFromHint = (filePath: string, hint: AudioSessionPlayRequest['probe']): AudioProbeResult | null => {
  if (!hint) {
    return null;
  }

  return {
    filePath,
    durationSeconds: Math.max(0, Number(hint.durationSeconds ?? 0)),
    fileSampleRate: normalizePositiveInteger(hint.fileSampleRate),
    channels: Math.max(1, Math.min(8, normalizePositiveInteger(hint.channels) ?? 2)),
    codec: typeof hint.codec === 'string' && hint.codec.trim() ? hint.codec : null,
    bitDepth: normalizePositiveInteger(hint.bitDepth),
    bitrate: normalizePositiveInteger(hint.bitrate),
  };
};

const createStreamProbeFromHint = (filePath: string, hint: AudioSessionPlayRequest['probe']): AudioProbeResult => ({
  filePath,
  durationSeconds: Math.max(0, Number(hint?.durationSeconds ?? 0)),
  fileSampleRate: normalizePositiveInteger(hint?.fileSampleRate),
  channels: Math.max(1, Math.min(8, normalizePositiveInteger(hint?.channels) ?? 2)),
  codec: typeof hint?.codec === 'string' && hint.codec.trim() ? hint.codec : null,
  bitDepth: normalizePositiveInteger(hint?.bitDepth),
  bitrate: normalizePositiveInteger(hint?.bitrate),
});

const createProbeHint = (probe: AudioProbeResult): AudioSessionPlayRequest['probe'] => ({
  durationSeconds: probe.durationSeconds,
  fileSampleRate: probe.fileSampleRate,
  channels: probe.channels,
  codec: probe.codec,
  bitDepth: probe.bitDepth,
  bitrate: probe.bitrate,
});

const isProbeHintCompleteEnough = (probe: AudioSessionPrepareLocalFileRequest['probe'] | undefined): boolean =>
  Boolean(
    probe &&
      typeof probe.durationSeconds === 'number' &&
      Number.isFinite(probe.durationSeconds) &&
      probe.durationSeconds > 0 &&
      Object.prototype.hasOwnProperty.call(probe, 'fileSampleRate') &&
      (probe.fileSampleRate === null ||
        (typeof probe.fileSampleRate === 'number' && Number.isFinite(probe.fileSampleRate) && probe.fileSampleRate > 0)) &&
      typeof probe.channels === 'number' &&
      Number.isFinite(probe.channels) &&
      probe.channels > 0,
  );

const mergeProbeHints = (
  primary: AudioSessionPrepareLocalFileRequest['probe'] | undefined,
  fallback: AudioSessionPrepareLocalFileRequest['probe'] | undefined,
): AudioSessionPrepareLocalFileRequest['probe'] | undefined => {
  const merged = { ...(fallback ?? {}), ...(primary ?? {}) };

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const redactUrlSecrets = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.search) {
      url.search = '?redacted';
    }

    return url.toString();
  } catch {
    return value;
  }
};

const createDeviceFromOutputSettings = (settings: AudioOutputSettings): AudioDeviceInfo | null => {
  if (!hasExplicitDeviceSelection(settings)) {
    return null;
  }

  const outputMode = normalizeOutputMode(settings.outputMode);
  const outputModeKey = outputMode === 'asio' ? 'asio' : 'shared';
  const deviceIndex = Number.isInteger(Number(settings.deviceIndex)) ? Number(settings.deviceIndex) : -1;

  return {
    id: deviceIndex >= 0 ? `${outputModeKey}:${deviceIndex}` : `${outputModeKey}:${settings.deviceName ?? 'selected'}`,
    index: deviceIndex,
    name: settings.deviceName ?? 'Selected output',
    outputMode: outputModeKey,
    sampleRate: normalizePositiveInteger(settings.requestedOutputSampleRate),
    sharedDeviceSampleRate: null,
    isDefault: false,
    asioOutputChannelStart: outputModeKey === 'asio' && Number.isInteger(Number(settings.asioOutputChannelStart))
      ? Math.max(0, Number(settings.asioOutputChannelStart))
      : undefined,
  };
};

const defaultStatus = (nativeHostAvailable: boolean): AudioStatus => ({
  host: nativeHostAvailable ? 'not-initialized' : 'unavailable',
  state: 'idle',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: null,
  activeOutputBackendImpl: null,
  outputMode: 'shared',
  sharedBackend: 'auto',
  useJuceOutputRequested: false,
  latencyProfile: 'lowLatency',
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: null,
  currentTrackId: null,
  durationSeconds: 0,
  positionSeconds: 0,
  channels: null,
  codec: null,
  bitDepth: null,
  bitrate: null,
  fileSampleRate: null,
  decoderOutputSampleRate: null,
  requestedOutputSampleRate: null,
  actualDeviceSampleRate: null,
  sharedDeviceSampleRate: null,
  resampling: false,
  ffmpegPath: null,
  ffmpegSource: null,
  ffmpegVersion: null,
  ffmpegHealthy: false,
  soxrAvailable: false,
  resamplerEngine: 'default',
  resamplerFallbackActive: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: 'Flat',
  clippingRisk: false,
  audioLevels: {
    inputPeakDb: null,
    inputRmsDb: null,
    estimatedOutputPeakDb: null,
    estimatedOutputRmsDb: null,
    headroomDb: null,
    clipCount: 0,
    lastClipAt: null,
    meterSource: 'pre_native_estimated_post_dsp',
  },
  bitPerfectDisabledReason: null,
  sharedStabilityTier: null,
  nativeDeviceBufferFrames: null,
  nativeRequestedBufferFrames: null,
  nativeActualBufferFrames: null,
  nativeOutputLatencyMs: null,
  nativePositionStalenessMs: null,
  nativeFifoCapacityFrames: null,
  nativeStartupPrebufferFrames: null,
  nativeBufferedFrames: null,
  nativeBufferedMs: null,
  nativeUnderrunCallbacks: 0,
  nativeUnderrunFrames: 0,
  lastSharedStabilityRecoveryAt: null,
  warnings: [],
  error: null,
});

class PcmVolumeTransform extends Transform {
  private gain: number;
  private remainder = Buffer.alloc(0);

  constructor(volume: number) {
    super();
    this.gain = Math.max(0, Math.min(1, volume));
  }

  setVolume(volume: number): void {
    this.gain = Math.max(0, Math.min(1, volume));
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    if (this.gain === 1) {
      callback(null, chunk);
      return;
    }

    const input = this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    const output = Buffer.from(input);
    const sampleBytes = 4;
    const completeSampleBytes = output.length - (output.length % sampleBytes);
    this.remainder = completeSampleBytes < output.length ? Buffer.from(output.subarray(completeSampleBytes)) : Buffer.alloc(0);

    for (let offset = 0; offset < completeSampleBytes; offset += sampleBytes) {
      output.writeFloatLE(output.readFloatLE(offset) * this.gain, offset);
    }

    callback(null, output.subarray(0, completeSampleBytes));
  }

  override _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    const tail = this.remainder;
    this.remainder = Buffer.alloc(0);
    callback(null, tail);
  }
}

class PcmPlaybackRateTransform extends Transform {
  private readonly frameBytes: number;
  private readonly playbackRate: number;
  private remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private frameCursor = 0;

  constructor(channels: number, playbackRate: number) {
    super();
    this.frameBytes = Math.max(1, Math.round(channels)) * 4;
    this.playbackRate = normalizePlaybackRate(playbackRate);
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    if (Math.abs(this.playbackRate - 1) < 1e-6) {
      callback(null, chunk);
      return;
    }

    const input = this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    const completeBytes = input.length - (input.length % this.frameBytes);
    const frameCount = completeBytes / this.frameBytes;

    if (frameCount <= 0) {
      this.remainder = input;
      callback();
      return;
    }

    const estimatedFrames = Math.max(1, Math.ceil((frameCount - Math.floor(this.frameCursor)) / this.playbackRate) + 2);
    const output = Buffer.allocUnsafe(estimatedFrames * this.frameBytes);
    let outputFrames = 0;

    while (Math.floor(this.frameCursor) < frameCount) {
      const sourceFrame = Math.floor(this.frameCursor);
      input.copy(
        output,
        outputFrames * this.frameBytes,
        sourceFrame * this.frameBytes,
        (sourceFrame + 1) * this.frameBytes,
      );
      outputFrames += 1;
      this.frameCursor += this.playbackRate;
    }

    const consumedFrames = Math.min(frameCount, Math.floor(this.frameCursor));
    this.frameCursor -= consumedFrames;
    this.remainder =
      consumedFrames * this.frameBytes < input.length
        ? Buffer.from(input.subarray(consumedFrames * this.frameBytes))
        : Buffer.alloc(0);

    callback(null, output.subarray(0, outputFrames * this.frameBytes));
  }

  override _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    this.remainder = Buffer.alloc(0);
    callback();
  }
}

export class AudioSession extends EventEmitter {
  private readonly decoder: DecoderPipelineLike;
  private readonly deviceService: DeviceServiceLike;
  private readonly createBridge: () => OutputBridgeLike;
  private readonly isNativeHostAvailable: () => boolean;
  private readonly reportAudioError: (payload: AudioCrashReportPayload) => void;
  private readonly logger: (message: string) => void;
  private readonly clock = new PlaybackClock();
  private outputSettings: Required<Pick<AudioOutputSettings, 'outputMode' | 'latencyProfile' | 'volume' | 'playbackRate' | 'playbackSpeedMode'>> &
    Omit<AudioOutputSettings, 'outputMode' | 'latencyProfile' | 'volume' | 'playbackRate' | 'playbackSpeedMode'> = {
    outputMode: 'shared',
    latencyProfile: 'balanced',
    sharedBackend: 'auto',
    asioUnavailableFallbackEnabled: false,
    soxrFallbackEnabled: true,
    volume: 1,
    playbackRate: 1,
    playbackSpeedMode: 'nightcore',
  };
  private state: AudioPlaybackState = 'idle';
  private hostStatus: AudioStatus['host'] = isNativeOutputBridgeAvailable() ? 'not-initialized' : 'unavailable';
  private currentProbe: AudioProbeResult | null = null;
  private currentTrackId: string | null = null;
  private currentFilePath: string | null = null;
  private currentInputHeaders: Record<string, string> | null = null;
  private currentOutputSettings: AudioOutputSettings | null = null;
  private currentPlan: SampleRatePlan | null = null;
  private currentDevice: AudioDeviceInfo | null = null;
  private currentOutputBackend: string | null = null;
  private currentOutputBackendImpl: string | null = null;
  private currentOutputDeviceType: string | null = null;
  private currentOutputDeviceName: string | null = null;
  private currentUseJuceOutputRequested = false;
  private currentReadyResult: NativeBridgeReadyResult | null = null;
  private currentBridgeOutputMode: AudioOutputMode | null = null;
  private currentBridgeSharedBackend: AudioSharedBackend | null = null;
  private currentResidentOutputSampleRate: number | null = null;
  private currentResamplerEngine: AudioResamplerEngine = 'default';
  private currentResamplerFallbackActive = false;
  private bridge: OutputBridgeLike | null = null;
  private attachedBridgeEvents: { bridge: OutputBridgeLike; listeners: BridgeEventListeners } | null = null;
  private decoderRun: DecoderRun | null = null;
  private gainTransform: PcmVolumeTransform | null = null;
  private speedTransform: PcmPlaybackRateTransform | null = null;
  private levelMeterTransform: PcmLevelMeterTransform | null = null;
  private decoderPipelineCleanup: (() => void) | null = null;
  private levelSnapshot: PcmLevelSnapshot = {
    inputPeakDb: null,
    inputRmsDb: null,
    clipCount: 0,
    lastClipAt: null,
  };
  private errorMessage: string | null = null;
  private outputWarnings: string[] = [];
  private pausedPositionSeconds: number | null = null;
  private runToken = 0;
  private readonly watchdogIntervalMs: number;
  private readonly watchdogStallChecks: number;
  private readonly watchdogMaxRecoveriesPerTrack: number;
  private readonly watchdogRecoveryWindowMs: number;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogLastPositionSeconds: number | null = null;
  private watchdogStalledChecks = 0;
  private watchdogRecovering = false;
  private watchdogPendingWarning: string | null = null;
  private pendingOutputWarnings: string[] = [];
  private watchdogLastRecoveryAt: string | null = null;
  private readonly watchdogRecoveries = new Map<string, { count: number; windowStartedAt: number }>();
  private sharedStabilityTier: SharedStabilityTier = 'standard';
  private sharedStabilityRecovering = false;
  private lastSharedStabilityRecoveryAt: string | null = null;
  private nativeDeviceBufferFrames: number | null = null;
  private nativeRequestedBufferFrames: number | null = null;
  private nativeActualBufferFrames: number | null = null;
  private nativeFifoCapacityFrames: number | null = null;
  private nativeStartupPrebufferFrames: number | null = null;
  private nativeTelemetry: NativeOutputTelemetry = {
    positionFrames: 0,
    bufferedFrames: null,
    underrunCallbacks: 0,
    underrunFrames: 0,
  };
  private lastNativeTelemetryStatusEmittedAt = 0;
  private lastLevelMeterStatusEmittedAt = 0;
  private nativeUnderrunWindow:
    | {
        startedAt: number;
        callbacks: number;
        frames: number;
      }
    | null = null;
  private readonly unavailableAsioDevices = new Map<string, { expiresAt: number; message: string }>();
  private readonly preparedLocalPlaybackCache = new Map<string, PreparedLocalPlaybackItem>();
  private readonly sharedStabilityMemory = new Map<string, { tier: SharedStabilityTier; expiresAt: number }>();
  private readonly eqStateListener = (): void => {
    this.emitStatus();
  };

  constructor(dependencies: AudioSessionDependencies = {}) {
    super();
    this.logger = dependencies.logger ?? defaultLogger;
    this.decoder = dependencies.decoder ?? new DecoderPipeline({ logger: this.logger });
    this.deviceService = dependencies.deviceService ?? new DeviceService({ logger: this.logger });
    this.createBridge = dependencies.createBridge ?? (() => new NativeOutputBridge({ logger: this.logger }));
    this.isNativeHostAvailable = dependencies.isNativeHostAvailable ?? isNativeOutputBridgeAvailable;
    this.reportAudioError = dependencies.reportAudioError ?? defaultAudioErrorReporter;
    this.watchdogIntervalMs = Math.max(250, dependencies.watchdogIntervalMs ?? defaultWatchdogIntervalMs);
    this.watchdogStallChecks = Math.max(1, dependencies.watchdogStallChecks ?? defaultWatchdogStallChecks);
    this.watchdogMaxRecoveriesPerTrack = Math.max(
      0,
      dependencies.watchdogMaxRecoveriesPerTrack ?? defaultWatchdogMaxRecoveriesPerTrack,
    );
    this.watchdogRecoveryWindowMs = Math.max(1000, dependencies.watchdogRecoveryWindowMs ?? defaultWatchdogRecoveryWindowMs);
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.on('error', () => undefined);
    getEqBridge().on('state', this.eqStateListener);
    if (!dependencies.disableWatchdogTimer) {
      this.watchdogTimer = setInterval(() => {
        void this.checkPlaybackWatchdog();
      }, this.watchdogIntervalMs);
      this.watchdogTimer.unref?.();
    }
  }

  listDevices(): AudioDeviceInfo[] {
    return this.deviceService.listDevices();
  }

  async listDevicesAsync(): Promise<AudioDeviceInfo[]> {
    return this.deviceService.listDevicesAsync?.() ?? this.deviceService.listDevices();
  }

  async openAsioControlPanel(settings: Pick<AudioOutputSettings, 'deviceIndex' | 'deviceName'>): Promise<void> {
    if (!this.deviceService.openAsioControlPanel) {
      throw new Error('ASIO control panel is unavailable');
    }

    await this.deviceService.openAsioControlPanel(settings);
  }

  private async refreshDeviceService(options: DeviceListOptions = {}): Promise<void> {
    if (this.deviceService.refresh) {
      await this.deviceService.refresh(options);
      return;
    }

    await (this.deviceService.listDevicesAsync?.() ?? Promise.resolve(this.deviceService.listDevices()));
  }

  async prepareLocalFile(request: AudioSessionPrepareLocalFileRequest): Promise<void> {
    const startedAt = performance.now();
    const context = this.createLocalPrepareContext(request.filePath, request.trackId, request.probe);
    const redactedFilePath = redactUrlSecrets(request.filePath);
    const providedProbe = createProbeFromHint(request.filePath, request.probe);
    const dsdNativeProbeRequired = providedProbe ? shouldProbeDsdNativeSampleRate(providedProbe) : false;
    const providedProbeComplete = isProbeHintCompleteEnough(request.probe) && !dsdNativeProbeRequired;

    this.logger(JSON.stringify({
      event: 'local_prepare_started',
      filePath: redactedFilePath,
      trackId: request.trackId ?? null,
      usedProvidedProbe: providedProbeComplete,
    }));

    try {
      let probeHint = request.probe;
      let probeMs = 0;

      if (!providedProbeComplete) {
        const probeStartedAt = performance.now();
        const probed = await this.decoder.probeLocalFile(request.filePath);
        probeMs = Math.max(0, Math.round(performance.now() - probeStartedAt));
        probeHint = mergeProbeHints(createProbeHint(probed), request.probe);
      }

      const probe = createProbeFromHint(request.filePath, probeHint);
      const plan = probe
        ? this.createSampleRatePlan(probe, context.outputSettings, context.device)
        : null;
      const now = Date.now();

      this.storePreparedLocalPlayback(context.key, {
        filePath: request.filePath,
        trackId: request.trackId,
        probe: probeHint,
        preparedAt: now,
        expiresAt: now + preparedLocalPlaybackTtlMs,
        outputMode: plan?.outputMode,
        requestedOutputSampleRate: plan?.requestedOutputSampleRate ?? null,
        decoderOutputSampleRate: plan?.decoderOutputSampleRate ?? null,
        warnings: plan?.warnings,
      });

      this.logger(JSON.stringify({
        event: 'local_prepare_completed',
        filePath: redactedFilePath,
        trackId: request.trackId ?? null,
        prepareMs: Math.max(0, Math.round(performance.now() - startedAt)),
        probeMs,
        usedProvidedProbe: providedProbeComplete,
        requestedOutputSampleRate: plan?.requestedOutputSampleRate ?? null,
        decoderOutputSampleRate: plan?.decoderOutputSampleRate ?? null,
      }));
    } catch (error) {
      this.logger(JSON.stringify({
        event: 'local_prepare_failed',
        filePath: redactedFilePath,
        trackId: request.trackId ?? null,
        prepareMs: Math.max(0, Math.round(performance.now() - startedAt)),
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async setOutput(settings: AudioOutputSettings): Promise<AudioStatus> {
    const previousOutputSettings = this.currentOutputSettings ? { ...this.currentOutputSettings } : null;
    const previousGlobalOutputSettings = { ...this.outputSettings };
    this.updatePositionFromOutput();
    if (this.shouldClearSharedStabilityMemory(settings)) {
      this.sharedStabilityMemory.clear();
      if (!this.sharedStabilityRecovering) {
        this.sharedStabilityTier = 'standard';
      }
    }
    const baseOutputMode = this.currentOutputSettings?.outputMode ?? this.outputSettings.outputMode;
    const baseLatencyProfile = this.currentOutputSettings?.latencyProfile ?? this.outputSettings.latencyProfile;
    const baseSharedBackend = this.currentOutputSettings?.sharedBackend ?? this.outputSettings.sharedBackend;
    const nextOutputMode = normalizeOutputMode(settings.outputMode ?? baseOutputMode);
    const nextSharedBackend =
      nextOutputMode === 'shared'
        ? normalizeSharedBackend(settings.sharedBackend ?? baseSharedBackend)
        : 'auto';
    const nextLatencyProfile = resolveLatencyProfile(
      nextOutputMode,
      settings.latencyProfile,
      baseOutputMode,
      baseLatencyProfile,
      settings.outputMode !== undefined,
    );
    const nextBufferSizeFrames = this.sanitizeLowLatencyBufferForOutputMode(
      nextOutputMode,
      nextLatencyProfile,
      resolveBufferSizeFrames(settings, this.outputSettings.bufferSizeFrames),
      'output_settings',
    );
    this.outputSettings = {
      ...this.outputSettings,
      ...settings,
      outputMode: nextOutputMode,
      sharedBackend: nextSharedBackend,
      latencyProfile: nextLatencyProfile,
      bufferSizeFrames: nextBufferSizeFrames,
      asioUnavailableFallbackEnabled: settings.asioUnavailableFallbackEnabled ?? this.outputSettings.asioUnavailableFallbackEnabled ?? false,
      soxrFallbackEnabled: settings.soxrFallbackEnabled ?? this.outputSettings.soxrFallbackEnabled ?? true,
      volume: Math.max(0, Math.min(1, Number(settings.volume ?? this.outputSettings.volume) || 0)),
      playbackRate: normalizePlaybackRate(settings.playbackRate ?? this.outputSettings.playbackRate),
      playbackSpeedMode: normalizePlaybackSpeedMode(settings.playbackSpeedMode ?? this.outputSettings.playbackSpeedMode),
    };
    if (this.outputSettings.sharedBackend === 'directsound') {
      this.outputSettings.deviceIndex = undefined;
    }

    if (this.currentOutputSettings) {
      this.currentOutputSettings = {
        ...this.currentOutputSettings,
        ...this.outputSettings,
      };
      this.currentUseJuceOutputRequested = this.currentOutputSettings.useJuceOutput === true;
    } else {
      this.currentUseJuceOutputRequested = this.outputSettings.useJuceOutput === true;
    }

    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings ?? this.outputSettings);

    const outputOnlyChangesVolume =
      previousOutputSettings !== null &&
      Object.keys(settings).every((key) => key === 'volume') &&
      this.currentOutputSettings !== null;

    if (outputOnlyChangesVolume) {
      this.bridge?.setVolume?.(this.outputSettings.volume);
      this.gainTransform?.setVolume(this.bridge?.setVolume ? 1 : this.outputSettings.volume);
      this.levelMeterTransform?.setGain(this.bridge?.setVolume ? this.outputSettings.volume : 1);
      this.emitStatus();
      return this.getStatus();
    }

    if (this.state === 'paused') {
      this.runToken += 1;
      await this.stopResourcesGracefully('output-settings-paused');
      this.currentPlan = null;
      this.currentResidentOutputSampleRate = null;
      this.currentOutputBackend = null;
      this.currentOutputBackendImpl = null;
      this.currentOutputDeviceType = null;
      this.currentOutputDeviceName = null;
      this.currentUseJuceOutputRequested = this.outputSettings.useJuceOutput === true;
      this.currentReadyResult = null;
      this.currentBridgeSharedBackend = null;
      this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
      this.emitStatus();
      return this.getStatus();
    }

    if (this.state === 'playing' && this.currentFilePath && this.currentProbe && this.currentOutputSettings) {
      const positionSeconds = this.clock.getPositionSeconds();
      try {
        return await this.playLocalFile({
          filePath: this.currentFilePath,
          trackId: this.currentTrackId ?? undefined,
          startSeconds: positionSeconds,
          output: this.currentOutputSettings,
          probe: createProbeHint(this.currentProbe),
          inputHeaders: this.currentInputHeaders ?? undefined,
        });
      } catch (error) {
        this.outputSettings = previousGlobalOutputSettings;
        this.currentOutputSettings = previousOutputSettings;
        this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings ?? this.outputSettings);
        this.emitStatus();
        throw error;
      }
    }

    this.emitStatus();
    return this.getStatus();
  }

  async playLocalFile(request: AudioSessionPlayRequest): Promise<AudioStatus> {
    const token = this.runToken + 1;
    this.runToken = token;
    this.stopDecoderRun();
    this.logger(
      `[AudioSession] playLocalFile: file="${redactUrlSecrets(request.filePath)}" trackId=${request.trackId ?? 'n/a'} start=${
        request.startSeconds ?? 0
      }`,
    );

    this.state = 'loading';
    this.hostStatus = 'starting';
    this.errorMessage = null;
    this.outputWarnings = [
      ...(this.watchdogPendingWarning ? [this.watchdogPendingWarning] : []),
      ...this.pendingOutputWarnings,
    ];
    this.watchdogPendingWarning = null;
    this.pendingOutputWarnings = [];
    this.resetWatchdogProgress();
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.currentFilePath = request.filePath;
    this.currentInputHeaders = request.inputHeaders ?? null;
    this.currentTrackId = request.trackId ?? null;
    this.pausedPositionSeconds = null;
    this.currentProbe = null;
    this.currentPlan = null;
    this.currentResidentOutputSampleRate = null;
    this.currentOutputBackend = null;
    this.currentOutputBackendImpl = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.currentResamplerEngine = 'default';
    this.currentResamplerFallbackActive = false;
    this.currentOutputSettings = this.createOutputSettingsForRequest(request.output);
    this.currentUseJuceOutputRequested = this.currentOutputSettings.useJuceOutput === true;
    this.currentDevice = this.resolvePlanDeviceForSettings(this.currentOutputSettings);
    this.resetSharedStabilityForFreshPlayback(this.currentOutputSettings.outputMode ?? 'shared', this.currentOutputSettings, this.currentDevice);
    this.logger(
      `[AudioSession] output: mode=${this.currentOutputSettings.outputMode ?? 'shared'} sharedBackend=${
        this.currentOutputSettings.sharedBackend ?? 'auto'
      } device=${
        this.currentDevice ? `${this.currentDevice.index}:${this.currentDevice.name}` : 'default'
      }`,
    );
    this.emitStatus();

    try {
      const preparedProbe = this.takePreparedLocalProbe(request, this.currentOutputSettings);
      if (preparedProbe) {
        this.logger(JSON.stringify({
          event: 'local_prepare_used_for_playback',
          filePath: redactUrlSecrets(request.filePath),
          trackId: request.trackId ?? null,
          cacheAgeMs: preparedProbe.ageMs,
        }));
      }
      const playbackProbeHint = preparedProbe?.probe ?? request.probe;
      let probe = createProbeFromHint(request.filePath, playbackProbeHint);
      if (!probe || shouldProbeDsdNativeSampleRate(probe)) {
        if (isHttpPlaybackUrl(request.filePath)) {
          probe = createStreamProbeFromHint(request.filePath, playbackProbeHint);
          this.logger(JSON.stringify({
            event: 'stream_probe_fallback_used_for_playback',
            filePath: redactUrlSecrets(request.filePath),
            trackId: request.trackId ?? null,
          }));
        } else {
          const probed = await this.decoder.probeLocalFile(request.filePath);
          probe = createProbeFromHint(request.filePath, mergeProbeHints(createProbeHint(probed), playbackProbeHint)) ?? probed;
        }
      }
      this.assertCurrentRun(token);
      this.currentProbe = probe;
      let { bridge, plan, ready, hostReused, hostRestartReason } = await this.startOutputBridgeForProbe(
        probe,
        token,
        request.startSeconds ?? 0,
      );
      this.assertCurrentRun(token);
      this.applyReadyResult(ready);
      try {
        this.assertReadySampleRateConsistent();
      } catch (error) {
        const failedPlan = this.currentPlan as SampleRatePlan | null;
        if (failedPlan?.outputMode !== 'exclusive') {
          throw error;
        }

        const fallback = await this.startSharedFallbackForProbe(
          probe,
          token,
          request.startSeconds ?? 0,
          error instanceof Error ? error : new Error(String(error)),
        );
        bridge = fallback.bridge;
        plan = fallback.plan;
        ready = fallback.ready;
        hostReused = fallback.hostReused;
        hostRestartReason = fallback.hostRestartReason;
        this.assertCurrentRun(token);
        this.applyReadyResult(ready);
      }
      this.logger(
        `[AudioSession] host ready: requested=${ready.requestedOutputSampleRate} actual=${
          ready.actualDeviceSampleRate ?? 'n/a'
        }`,
      );
      const activePlan = this.currentPlan ?? plan;
      this.logAudioTransition(activePlan, {
        hostReused,
        hostRestartReason,
        preparedLocalProbeUsed: Boolean(preparedProbe),
        preparedLocalProbeAgeMs: preparedProbe?.ageMs ?? null,
      });
      const run = this.decoder.decodeLocalFile(
        this.createDecodeRequest(
          request.filePath,
          request.inputHeaders,
          request.startSeconds ?? 0,
          probe.channels,
          activePlan,
          this.currentOutputSettings,
        ),
      );

      await this.syncEqStateForPlayback();
      this.assertCurrentRun(token);
      const sessionId = bridge.beginSession?.({
        startSeconds: request.startSeconds ?? 0,
        playbackRate: this.currentOutputSettings.playbackRate,
        durationSeconds: probe.durationSeconds,
      });
      const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
      if (!writable) {
        throw new Error('native output bridge did not expose a writable PCM stream');
      }

      this.startDecoderRun(run, writable, token);

      this.state = 'playing';
      this.hostStatus = 'ready';
      this.resetWatchdogProgress();
      this.emitStatus();
      return this.getStatus();
    } catch (error) {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }

      throw error;
    }
  }

  restorePlaybackMemory(memory: PlaybackMemory): AudioStatus {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      return this.getStatus();
    }

    const positionSeconds = Math.max(0, Number(memory.positionSeconds) || 0);
    this.runToken += 1;
    this.stopResources();
    this.resetLevelMeter();
    this.state = 'paused';
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.errorMessage = null;
    this.outputWarnings = [];
    this.currentFilePath = memory.filePath;
    this.currentInputHeaders = null;
    this.currentTrackId = memory.trackId;
    this.currentOutputSettings = { ...this.outputSettings };
    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings);
    this.currentResamplerEngine = 'default';
    this.currentResamplerFallbackActive = false;
    this.currentProbe = createProbeFromHint(memory.filePath, {
      durationSeconds: memory.probe?.durationSeconds ?? memory.durationSeconds,
      fileSampleRate: memory.probe?.fileSampleRate,
      channels: memory.probe?.channels,
      codec: memory.probe?.codec,
      bitDepth: memory.probe?.bitDepth,
      bitrate: memory.probe?.bitrate,
    });
    this.currentPlan = null;
    this.currentResidentOutputSampleRate = null;
    this.currentOutputBackend = null;
    this.currentOutputBackendImpl = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.currentUseJuceOutputRequested = this.outputSettings.useJuceOutput === true;
    this.pausedPositionSeconds = positionSeconds;
    this.clock.reset(positionSeconds, null);
    this.emitStatus();
    return this.getStatus();
  }

  async play(): Promise<AudioStatus> {
    if (this.state === 'paused' && this.currentFilePath && this.currentOutputSettings) {
      const bridge = this.bridge;
      const currentProbe = this.currentProbe;
      const currentPlan = this.currentPlan;
      const canResumePreparedBridge =
        bridge &&
        isWritableUsable(bridge.writable) &&
        currentProbe &&
        currentPlan &&
        this.currentReadyResult &&
        this.hostStatus === 'ready';

      if (canResumePreparedBridge && bridge && currentProbe && currentPlan) {
        const token = this.runToken;
        const startSeconds = this.pausedPositionSeconds ?? this.clock.getPositionSeconds();
        this.pausedPositionSeconds = null;
        this.attachBridgeEvents(bridge, token);
        await this.syncEqStateForPlayback();
        this.assertCurrentRun(token);
        const sessionId = bridge.beginSession?.({
          startSeconds,
          playbackRate: this.currentOutputSettings.playbackRate ?? 1,
          durationSeconds: currentProbe.durationSeconds,
        });
        bridge.resetOutputClock?.(startSeconds, this.currentOutputSettings.playbackRate ?? 1);
        this.clock.reset(startSeconds, currentPlan.actualDeviceSampleRate ?? currentPlan.requestedOutputSampleRate);

        const run = this.decoder.decodeLocalFile(
          this.createDecodeRequest(
            this.currentFilePath,
            this.currentInputHeaders,
            startSeconds,
            currentProbe.channels,
            currentPlan,
            this.currentOutputSettings,
          ),
        );
        const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
        if (!writable) {
          throw new Error('native output bridge did not expose a writable PCM stream');
        }
        this.startDecoderRun(run, writable, token);
        this.state = 'playing';
        this.hostStatus = this.hostStatus === 'starting' ? 'starting' : 'ready';
        this.nativeUnderrunWindow = null;
        this.resetWatchdogProgress();
        this.emitStatus();
        return this.getStatus();
      }

      return this.playLocalFile({
        filePath: this.currentFilePath,
        trackId: this.currentTrackId ?? undefined,
        startSeconds: this.pausedPositionSeconds ?? this.clock.getPositionSeconds(),
        output: this.currentOutputSettings,
        probe: this.currentProbe ? createProbeHint(this.currentProbe) : undefined,
        inputHeaders: this.currentInputHeaders ?? undefined,
      });
    }

    return this.getStatus();
  }

  pause(): AudioStatus {
    if (this.state === 'playing' || this.state === 'loading') {
      if (this.state === 'playing') {
        this.updatePositionFromOutput();
      }
      const positionSeconds = this.state === 'playing' ? this.clock.getPositionSeconds() : this.pausedPositionSeconds ?? 0;
      const sampleRate = this.currentPlan?.actualDeviceSampleRate ?? this.currentPlan?.requestedOutputSampleRate ?? null;
      const keepResidentBridge = Boolean(
        this.state === 'playing' &&
        isResidentOutputMode(this.currentPlan?.outputMode ?? this.currentOutputSettings?.outputMode) &&
        this.bridge &&
        this.currentReadyResult,
      );
      this.runToken += 1;
      const token = this.runToken;
      if (keepResidentBridge) {
        this.stopDecoderRun();
        try {
          this.bridge?.endSession?.();
        } catch {
          // Best-effort idle transition for resident native output.
        }
      } else {
        this.stopResources();
      }
      this.pausedPositionSeconds = positionSeconds;
      this.clock.reset(positionSeconds, sampleRate);
      this.state = 'paused';
      this.nativeUnderrunWindow = null;
      this.resetWatchdogProgress();
      const canPrewarm = !keepResidentBridge && Boolean(this.currentProbe && this.currentOutputSettings && this.isNativeHostAvailable());
      this.hostStatus = canPrewarm ? 'starting' : this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
      if (keepResidentBridge) {
        this.hostStatus = 'ready';
      }
      this.emitStatus();
      if (canPrewarm) {
        void this.preparePausedOutputBridge(token, positionSeconds);
      }
    }

    return this.getStatus();
  }

  stop(): AudioStatus {
    this.runToken += 1;
    this.stopResources();
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.state = 'stopped';
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.currentProbe = null;
    this.currentTrackId = null;
    this.currentFilePath = null;
    this.currentInputHeaders = null;
    this.currentPlan = null;
    this.currentResidentOutputSampleRate = null;
    this.currentDevice = null;
    this.currentOutputBackend = null;
    this.currentOutputBackendImpl = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.currentResamplerEngine = 'default';
    this.currentResamplerFallbackActive = false;
    this.currentUseJuceOutputRequested = false;
    this.currentReadyResult = null;
    this.currentBridgeSharedBackend = null;
    this.pausedPositionSeconds = null;
    this.errorMessage = null;
    this.outputWarnings = [];
    this.resetWatchdogProgress();
    this.clock.reset(0, null);
    this.emitStatus();
    return this.getStatus();
  }

  async resetEngine(): Promise<AudioStatus> {
    return this.forceRestart('reset-audio-engine');
  }

  async forceRestart(reason: string): Promise<AudioStatus> {
    const resetReason = normalizeResetReason(reason);
    this.runToken += 1;
    await this.stopResourcesGracefully(resetReason, true);
    await this.refreshDeviceService({ useJuceOutput: this.outputSettings.useJuceOutput === true });
    this.unavailableAsioDevices.clear();
    this.watchdogRecoveries.clear();
    this.watchdogLastRecoveryAt = null;
    this.watchdogPendingWarning = null;
    this.sharedStabilityTier = 'standard';
    this.sharedStabilityRecovering = false;
    this.watchdogRecovering = false;
    this.lastSharedStabilityRecoveryAt = null;
    this.resetSessionAfterForcedStop();
    const status = this.getStatus();
    this.emit('session-reset', { reason: resetReason, status });
    return status;
  }

  async stopForWindowsAudioServiceRestart(reason = 'windows-audio-service-preflight'): Promise<AudioStatus> {
    const resetReason = normalizeResetReason(reason);
    this.runToken += 1;
    await this.stopResourcesGracefully(resetReason, true);
    this.resetSessionAfterForcedStop();
    return this.getStatus();
  }

  private resetSessionAfterForcedStop(): void {
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.state = 'stopped';
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.currentProbe = null;
    this.currentTrackId = null;
    this.currentFilePath = null;
    this.currentInputHeaders = null;
    this.currentPlan = null;
    this.currentResidentOutputSampleRate = null;
    this.currentDevice = null;
    this.currentOutputBackend = null;
    this.currentOutputBackendImpl = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.currentUseJuceOutputRequested = false;
    this.currentReadyResult = null;
    this.currentBridgeOutputMode = null;
    this.currentBridgeSharedBackend = null;
    this.pausedPositionSeconds = null;
    this.errorMessage = null;
    this.outputWarnings = [];
    this.pendingOutputWarnings = [];
    this.resetWatchdogProgress();
    this.clock.reset(0, null);
    this.emitStatus();
  }

  async seek(positionSeconds: number): Promise<AudioStatus> {
    if (!this.currentFilePath || !this.currentOutputSettings) {
      return this.getStatus();
    }

    const safePositionSeconds = Math.min(
      Math.max(0, positionSeconds),
      this.currentProbe?.durationSeconds && this.currentProbe.durationSeconds > 0
        ? this.currentProbe.durationSeconds
        : Number.POSITIVE_INFINITY,
    );
    this.resetLevelMeter();

    if (this.state === 'paused') {
      const sampleRate = this.currentPlan?.actualDeviceSampleRate ?? this.currentPlan?.requestedOutputSampleRate ?? null;
      this.runToken += 1;
      const token = this.runToken;
      await this.stopResourcesGracefully('seek-paused');
      this.pausedPositionSeconds = safePositionSeconds;
      this.clock.reset(safePositionSeconds, sampleRate);
      const canPrewarm = Boolean(this.currentProbe && this.currentOutputSettings && this.isNativeHostAvailable());
      this.hostStatus = canPrewarm ? 'starting' : this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
      this.emitStatus();
      if (canPrewarm) {
        void this.preparePausedOutputBridge(token, safePositionSeconds);
      }
      return this.getStatus();
    }

    if (this.state === 'playing' && this.bridge && isWritableUsable(this.bridge.writable) && this.currentProbe && this.currentPlan) {
      const token = this.runToken + 1;
      this.runToken = token;
      this.stopDecoderRun();
      await this.syncEqStateForPlayback();
      this.assertCurrentRun(token);
      const sessionId = this.bridge.beginSession?.({
        startSeconds: safePositionSeconds,
        playbackRate: this.currentOutputSettings.playbackRate ?? 1,
        durationSeconds: this.currentProbe.durationSeconds,
      });
      this.bridge.resetOutputClock?.(safePositionSeconds, this.currentOutputSettings.playbackRate ?? 1);
      this.attachBridgeEvents(this.bridge, token);
      this.clock.reset(safePositionSeconds, this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate);

      const run = this.decoder.decodeLocalFile(
        this.createDecodeRequest(
          this.currentFilePath,
          this.currentInputHeaders,
          safePositionSeconds,
          this.currentProbe.channels,
          this.currentPlan,
          this.currentOutputSettings,
        ),
      );
      const writable = this.bridge.createSessionWritable?.(sessionId) ?? this.bridge.writable;
      if (!writable) {
        throw new Error('native output bridge did not expose a writable PCM stream');
      }
      this.startDecoderRun(run, writable, token);
      this.resetWatchdogProgress();
      this.emitStatus();
      return this.getStatus();
    }

    return this.playLocalFile({
      filePath: this.currentFilePath,
      trackId: this.currentTrackId ?? undefined,
      startSeconds: safePositionSeconds,
      output: this.currentOutputSettings,
      inputHeaders: this.currentInputHeaders ?? undefined,
    });
  }

  getStatus(): AudioStatus {
    this.updatePositionFromOutput();

    const status = defaultStatus(this.isNativeHostAvailable());
    const plan = this.currentPlan;
    const eqState = getEqBridge().getState();
    const channelBalanceState = getEqBridge().getChannelBalanceState();
    const audioLevels = createAudioLevelTelemetry(this.levelSnapshot, eqState, channelBalanceState);
    const realtimeLevelClippingRisk = audioLevels.estimatedOutputPeakDb !== null && audioLevels.estimatedOutputPeakDb >= 0;
    const realtimeLevelClipped = audioLevels.clipCount > 0;
    const dspActive = eqState.enabled || channelBalanceState.enabled;
    const bitPerfectDisabledReason = dspActive ? (eqState.enabled ? 'eq_enabled' : 'channel_balance_enabled') : null;
    const warnings = [...(plan?.warnings ?? [])];
    for (const warning of this.outputWarnings) {
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }

    if (dspActive) {
      warnings.push(eqState.enabled ? 'eq_enabled_bit_perfect_disabled' : 'channel_balance_bit_perfect_disabled');
    }

    if (eqState.clippingRisk || channelBalanceState.clippingRisk) {
      warnings.push(eqState.clippingRisk ? 'eq_clipping_risk' : 'channel_balance_clipping_risk');
    }
    if (realtimeLevelClippingRisk && !warnings.includes('audio_level_clipping_risk')) {
      warnings.push('audio_level_clipping_risk');
    }
    if (realtimeLevelClipped && !warnings.includes('audio_level_clipped')) {
      warnings.push('audio_level_clipped');
    }

    const nativeSampleRate = plan?.actualDeviceSampleRate ?? plan?.requestedOutputSampleRate ?? null;
    const nativeBufferedMs =
      nativeSampleRate && this.nativeTelemetry.bufferedFrames !== null
        ? Math.round((this.nativeTelemetry.bufferedFrames / nativeSampleRate) * 1000)
        : null;
    const nativeActualBufferFrames = this.nativeActualBufferFrames ?? this.nativeDeviceBufferFrames;
    const nativeOutputLatencyMs =
      nativeSampleRate && nativeActualBufferFrames !== null
        ? Math.round((nativeActualBufferFrames / nativeSampleRate) * 1000)
        : null;
    const nativePositionStalenessMs =
      this.bridge?.getPositionStalenessMs?.() ?? this.nativeTelemetry.nativePositionStalenessMs ?? null;
    const ffmpeg = this.decoder.getToolchainInfo?.() ?? null;

    return {
      ...status,
      host: this.hostStatus,
      state: this.state,
      outputDeviceId: this.currentDevice?.id ?? null,
    outputDeviceName: this.currentOutputDeviceName ?? this.currentDevice?.name ?? null,
      outputDeviceType: this.currentOutputDeviceType,
      outputBackend: this.currentOutputBackend,
      activeOutputBackendImpl: this.currentOutputBackendImpl,
      outputMode: plan?.outputMode ?? this.outputSettings.outputMode,
      sharedBackend: normalizeSharedBackend(this.currentOutputSettings?.sharedBackend ?? this.outputSettings.sharedBackend),
      useJuceOutputRequested: this.currentOutputSettings ? this.currentUseJuceOutputRequested : this.outputSettings.useJuceOutput === true,
      latencyProfile: normalizeLatencyProfile(this.currentOutputSettings?.latencyProfile ?? this.outputSettings.latencyProfile),
      volume: this.outputSettings.volume,
      playbackRate: this.outputSettings.playbackRate,
      playbackSpeedMode: this.outputSettings.playbackSpeedMode,
      currentFilePath: this.currentFilePath,
      currentTrackId: this.currentTrackId,
      durationSeconds: this.currentProbe?.durationSeconds ?? 0,
      positionSeconds: this.clock.getPositionSeconds(),
      channels: this.currentProbe?.channels ?? null,
      codec: this.currentProbe?.codec ?? null,
      bitDepth: this.currentProbe?.bitDepth ?? null,
      bitrate: this.currentProbe?.bitrate ?? null,
      fileSampleRate: plan?.fileSampleRate ?? null,
      decoderOutputSampleRate: plan?.decoderOutputSampleRate ?? null,
      requestedOutputSampleRate: plan?.requestedOutputSampleRate ?? null,
      actualDeviceSampleRate: plan?.actualDeviceSampleRate ?? null,
      sharedDeviceSampleRate: plan?.sharedDeviceSampleRate ?? this.currentDevice?.sharedDeviceSampleRate ?? null,
      resampling: plan?.resampling ?? false,
      ffmpegPath: ffmpeg?.path ?? null,
      ffmpegSource: ffmpeg?.source ?? null,
      ffmpegVersion: ffmpeg?.version ?? ffmpeg?.manifestVersion ?? null,
      ffmpegHealthy: ffmpeg?.healthy ?? false,
      soxrAvailable: ffmpeg?.soxrAvailable ?? false,
      resamplerEngine: this.currentResamplerEngine,
      resamplerFallbackActive: this.currentResamplerFallbackActive,
      bitPerfectCandidate: (plan?.bitPerfectCandidate ?? false) && !dspActive,
      sampleRateMismatch: plan?.sampleRateMismatch ?? false,
      eqEnabled: eqState.enabled,
      channelBalanceEnabled: channelBalanceState.enabled,
      dspActive,
      preampDb: eqState.preampDb,
      eqPresetName: eqState.presetName,
      clippingRisk: eqState.clippingRisk || Boolean(channelBalanceState.clippingRisk) || realtimeLevelClippingRisk || realtimeLevelClipped,
      audioLevels,
      bitPerfectDisabledReason,
      sharedStabilityTier: plan?.outputMode === 'shared' ? this.sharedStabilityTier : null,
      nativeDeviceBufferFrames: this.nativeDeviceBufferFrames,
      nativeRequestedBufferFrames: this.nativeRequestedBufferFrames,
      nativeActualBufferFrames,
      nativeOutputLatencyMs,
      nativePositionStalenessMs,
      nativeFifoCapacityFrames: this.nativeFifoCapacityFrames,
      nativeStartupPrebufferFrames: this.nativeStartupPrebufferFrames,
      nativeBufferedFrames: this.nativeTelemetry.bufferedFrames,
      nativeBufferedMs,
      nativeUnderrunCallbacks: this.nativeTelemetry.underrunCallbacks,
      nativeUnderrunFrames: this.nativeTelemetry.underrunFrames,
      asioOutputChannelStart: this.currentReadyResult ? numericReadyField(this.currentReadyResult, 'asioOutputChannelStart') : null,
      lastSharedStabilityRecoveryAt: this.lastSharedStabilityRecoveryAt,
      warnings,
      error: this.errorMessage,
    };
  }

  getDiagnostics(): AudioDiagnostics {
    const status = this.getStatus();

    return {
      state: status.state,
      host: status.host,
      outputMode: status.outputMode,
      sharedBackend: status.sharedBackend,
      latencyProfile: status.latencyProfile,
      outputBackend: status.outputBackend,
      activeOutputBackendImpl: status.activeOutputBackendImpl,
      useJuceOutputRequested: status.useJuceOutputRequested,
      outputDeviceName: status.outputDeviceName,
      currentFilePath: status.currentFilePath,
      currentTrackId: status.currentTrackId,
      durationSeconds: status.durationSeconds,
      positionSeconds: status.positionSeconds,
      playbackRate: status.playbackRate,
      fileSampleRate: status.fileSampleRate,
      decoderOutputSampleRate: status.decoderOutputSampleRate,
      requestedOutputSampleRate: status.requestedOutputSampleRate,
      actualDeviceSampleRate: status.actualDeviceSampleRate,
      sharedDeviceSampleRate: status.sharedDeviceSampleRate,
      resampling: status.resampling,
      ffmpegPath: status.ffmpegPath,
      ffmpegSource: status.ffmpegSource,
      ffmpegVersion: status.ffmpegVersion,
      ffmpegHealthy: status.ffmpegHealthy,
      soxrAvailable: status.soxrAvailable,
      resamplerEngine: status.resamplerEngine,
      resamplerFallbackActive: status.resamplerFallbackActive,
      bitPerfectCandidate: status.bitPerfectCandidate,
      sampleRateMismatch: status.sampleRateMismatch,
      sharedStabilityTier: status.sharedStabilityTier,
      nativeDeviceBufferFrames: status.nativeDeviceBufferFrames,
      nativeRequestedBufferFrames: status.nativeRequestedBufferFrames,
      nativeActualBufferFrames: status.nativeActualBufferFrames,
      nativeOutputLatencyMs: status.nativeOutputLatencyMs,
      nativePositionStalenessMs: status.nativePositionStalenessMs,
      nativeFifoCapacityFrames: status.nativeFifoCapacityFrames,
      nativeStartupPrebufferFrames: status.nativeStartupPrebufferFrames,
      nativeBufferedFrames: status.nativeBufferedFrames,
      nativeBufferedMs: status.nativeBufferedMs,
      nativeUnderrunCallbacks: status.nativeUnderrunCallbacks,
      nativeUnderrunFrames: status.nativeUnderrunFrames,
      lastSharedStabilityRecoveryAt: status.lastSharedStabilityRecoveryAt,
      warnings: status.warnings,
      error: status.error,
      watchdogStatus: this.getWatchdogStatus(),
      recentWatchdogRecoveryCount: this.getRecentWatchdogRecoveryCount(),
      lastWatchdogRecoveryTime: this.watchdogLastRecoveryAt,
    };
  }

  async checkPlaybackWatchdog(): Promise<void> {
    if (
      this.state !== 'playing' ||
      this.watchdogRecovering ||
      this.sharedStabilityRecovering ||
      !this.bridge ||
      !this.currentFilePath ||
      !this.currentOutputSettings
    ) {
      this.resetWatchdogProgress();
      return;
    }

    const positionSeconds = this.bridge.getPositionSeconds();
    if (!Number.isFinite(positionSeconds)) {
      this.resetWatchdogProgress();
      return;
    }

    if (
      this.watchdogLastPositionSeconds === null ||
      positionSeconds > this.watchdogLastPositionSeconds + watchdogPositionEpsilonSeconds
    ) {
      this.watchdogLastPositionSeconds = positionSeconds;
      this.watchdogStalledChecks = 0;
      return;
    }

    this.watchdogStalledChecks += 1;
    if (this.watchdogStalledChecks < this.watchdogStallChecks) {
      return;
    }

    await this.recoverFromWatchdogStall(positionSeconds);
  }

  dispose(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    getEqBridge().off('state', this.eqStateListener);
    this.detachBridgeEvents();
    this.stopResources();
  }

  async disposeGracefully(reason = 'dispose'): Promise<void> {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    getEqBridge().off('state', this.eqStateListener);
    await this.stopResourcesGracefully(reason);
    this.detachBridgeEvents();
  }

  private createOutputSettingsForRequest(output: AudioOutputSettings | undefined): AudioOutputSettings {
    const nextOutputMode = normalizeOutputMode(output?.outputMode ?? this.outputSettings.outputMode);
    const nextLatencyProfile = resolveLatencyProfile(
      nextOutputMode,
      output?.latencyProfile,
      this.outputSettings.outputMode,
      this.outputSettings.latencyProfile,
      output?.outputMode !== undefined,
    );

    const settings: AudioOutputSettings = {
      ...this.outputSettings,
      ...output,
      outputMode: nextOutputMode,
      sharedBackend: nextOutputMode === 'shared'
        ? normalizeSharedBackend(output?.sharedBackend ?? this.outputSettings.sharedBackend)
        : 'auto',
      latencyProfile: nextLatencyProfile,
      bufferSizeFrames: this.sanitizeLowLatencyBufferForOutputMode(
        nextOutputMode,
        nextLatencyProfile,
        resolveBufferSizeFrames(output, this.outputSettings.bufferSizeFrames),
        'playback_request',
      ),
      asioUnavailableFallbackEnabled: output?.asioUnavailableFallbackEnabled ?? this.outputSettings.asioUnavailableFallbackEnabled ?? false,
      soxrFallbackEnabled: output?.soxrFallbackEnabled ?? this.outputSettings.soxrFallbackEnabled ?? true,
      volume: Math.max(0, Math.min(1, Number(output?.volume ?? this.outputSettings.volume) || 0)),
      playbackRate: normalizePlaybackRate(output?.playbackRate ?? this.outputSettings.playbackRate),
      playbackSpeedMode: normalizePlaybackSpeedMode(output?.playbackSpeedMode ?? this.outputSettings.playbackSpeedMode),
    };

    if (settings.sharedBackend === 'directsound') {
      settings.deviceIndex = undefined;
    }

    return settings;
  }

  private getRequestedResamplerEngine(plan: SampleRatePlan, outputSettings: AudioOutputSettings): AudioResamplerEngine {
    if (
      plan.outputMode === 'shared' &&
      outputSettings.sharedBackend !== 'directsound' &&
      plan.fileSampleRate !== null &&
      plan.fileSampleRate !== plan.decoderOutputSampleRate
    ) {
      return 'soxr';
    }

    return 'default';
  }

  private createDecodeRequest(
    filePath: string,
    inputHeaders: Record<string, string> | null | undefined,
    startSeconds: number,
    channels: number,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
  ) {
    const resamplerEngine = this.getRequestedResamplerEngine(plan, outputSettings);
    this.currentResamplerEngine = resamplerEngine;
    this.currentResamplerFallbackActive = false;

    return {
      filePath,
      inputHeaders: inputHeaders ?? undefined,
      startSeconds,
      channels,
      decoderOutputSampleRate: plan.decoderOutputSampleRate,
      resamplerEngine,
      allowResamplerFallback: outputSettings.soxrFallbackEnabled !== false,
      onResamplerFallback: (warning: string) => {
        this.currentResamplerEngine = 'default';
        this.currentResamplerFallbackActive = true;
        this.addOutputWarning(warning);
        this.emitStatus();
      },
    };
  }

  private resolvePlanDeviceForSettings(outputSettings: AudioOutputSettings): AudioDeviceInfo | null {
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const explicitDevice = createDeviceFromOutputSettings(outputSettings);

    if (explicitDevice) {
      return explicitDevice;
    }

    return outputMode === 'shared' ? this.resolveDefaultSharedDevice() : null;
  }

  private createLocalPrepareContext(
    filePath: string,
    trackId: string | undefined,
    probe: AudioSessionPrepareLocalFileRequest['probe'] | undefined,
    output: AudioOutputSettings | undefined = undefined,
  ): LocalPrepareContext {
    const outputSettings = this.createOutputSettingsForRequest(output);
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const device = this.resolvePlanDeviceForSettings(outputSettings);
    const sampleRateProbe = createProbeFromHint(filePath, probe) ?? {
      filePath,
      durationSeconds: probe?.durationSeconds ?? 1,
      fileSampleRate: probe?.fileSampleRate ?? null,
      channels: probe?.channels ?? 2,
      codec: probe?.codec ?? null,
      bitDepth: probe?.bitDepth ?? null,
      bitrate: probe?.bitrate ?? null,
    };
    const plan = this.createSampleRatePlan(sampleRateProbe, outputSettings, device);
    const deviceIdentity = device
      ? `${device.outputMode}:${device.index}:${device.name}`
      : `${outputMode}:default:${outputSettings.deviceIndex ?? ''}:${outputSettings.deviceName ?? ''}`;

    return {
      outputSettings,
      device,
      key: JSON.stringify({
        filePath,
        trackId: trackId ?? null,
        outputMode,
        sharedBackend: outputMode === 'shared' ? normalizeSharedBackend(outputSettings.sharedBackend) : null,
        deviceIdentity,
        requestedOutputSampleRate: plan.requestedOutputSampleRate,
        playbackSpeedMode: outputSettings.playbackSpeedMode ?? null,
      }),
    };
  }

  private prunePreparedLocalPlaybackCache(now = Date.now()): void {
    for (const [key, item] of this.preparedLocalPlaybackCache.entries()) {
      if (item.expiresAt <= now) {
        this.preparedLocalPlaybackCache.delete(key);
      }
    }
  }

  private storePreparedLocalPlayback(key: string, item: PreparedLocalPlaybackItem): void {
    this.prunePreparedLocalPlaybackCache(item.preparedAt);
    this.preparedLocalPlaybackCache.delete(key);
    this.preparedLocalPlaybackCache.set(key, item);

    while (this.preparedLocalPlaybackCache.size > preparedLocalPlaybackMaxItems) {
      const oldestKey = this.preparedLocalPlaybackCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }

      this.preparedLocalPlaybackCache.delete(oldestKey);
    }
  }

  private takePreparedLocalProbe(
    request: AudioSessionPlayRequest,
    outputSettings: AudioOutputSettings,
  ): PreparedLocalProbeUse | null {
    const context = this.createLocalPrepareContext(request.filePath, request.trackId, request.probe, outputSettings);
    const now = Date.now();
    this.prunePreparedLocalPlaybackCache(now);
    const cached = this.preparedLocalPlaybackCache.get(context.key);

    if (!cached) {
      this.logger(JSON.stringify({
        event: 'local_prepare_cache_miss',
        filePath: redactUrlSecrets(request.filePath),
        trackId: request.trackId ?? null,
      }));
      return null;
    }

    this.preparedLocalPlaybackCache.delete(context.key);
    this.preparedLocalPlaybackCache.set(context.key, cached);
    const ageMs = Math.max(0, now - cached.preparedAt);
    this.logger(JSON.stringify({
      event: 'local_prepare_cache_hit',
      filePath: redactUrlSecrets(request.filePath),
      trackId: request.trackId ?? null,
      cacheAgeMs: ageMs,
    }));

    return {
      probe: mergeProbeHints(request.probe, cached.probe),
      ageMs,
    };
  }

  private createSampleRatePlan(
    probe: AudioProbeResult,
    outputSettings: AudioOutputSettings,
    selectedDevice: AudioDeviceInfo | null,
    actualDeviceSampleRate: number | null = null,
    planOptions: { residentOutputSampleRate?: number | null } = {},
  ): SampleRatePlan {
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const fileSampleRate = probe.fileSampleRate;
    const sourceSampleRate = fileSampleRate ?? fallbackSampleRate;
    const dsdPcmOutputSampleRate = resolveDsdPcmOutputSampleRate(probe);
    const sourceOutputSampleRate = dsdPcmOutputSampleRate ?? sourceSampleRate;
    const explicitRequestedSampleRate = normalizePositiveInteger(outputSettings.requestedOutputSampleRate);
    const residentOutputSampleRate =
      outputMode !== 'shared' ? normalizePositiveInteger(planOptions.residentOutputSampleRate) : null;
    const sharedDeviceSampleRate =
      normalizePositiveInteger(selectedDevice?.sharedDeviceSampleRate) ??
      (outputMode === 'shared' ? normalizePositiveInteger(selectedDevice?.sampleRate) : null);
    const currentReadySampleRate =
      outputMode === 'shared' ? normalizePositiveInteger(this.currentReadyResult?.actualDeviceSampleRate) : null;
    const requestedOutputSampleRate =
      residentOutputSampleRate ??
      (outputMode === 'shared'
        ? explicitRequestedSampleRate ?? sharedDeviceSampleRate ?? currentReadySampleRate ?? fallbackSharedMixSampleRate
        : dsdPcmOutputSampleRate ?? explicitRequestedSampleRate ?? sourceOutputSampleRate);
    const decoderOutputSampleRate =
      outputMode === 'shared'
        ? requestedOutputSampleRate
        : outputMode === 'asio'
          ? actualDeviceSampleRate ?? requestedOutputSampleRate
          : requestedOutputSampleRate;
    const warnings: string[] = [];

    if (!fileSampleRate) {
      warnings.push('file_sample_rate_unknown_using_44100_fallback');
    }

    if (dsdPcmOutputSampleRate && fileSampleRate !== null && fileSampleRate !== decoderOutputSampleRate) {
      warnings.push(`dsd_source_decoded_to_pcm:${fileSampleRate}->${decoderOutputSampleRate}`);
    }

    if (
      !residentOutputSampleRate &&
      outputMode !== 'shared' &&
      !dsdPcmOutputSampleRate &&
      explicitRequestedSampleRate &&
      explicitRequestedSampleRate !== sourceOutputSampleRate
    ) {
      warnings.push('explicit_resampling_requested_for_exclusive_output');
    }

    if (
      residentOutputSampleRate &&
      fileSampleRate !== null &&
      sourceOutputSampleRate !== residentOutputSampleRate
    ) {
      warnings.push('resident_output_resampling_to_device_rate');
    }

    const sampleRateMismatch =
      actualDeviceSampleRate !== null && actualDeviceSampleRate !== requestedOutputSampleRate;
    if (sampleRateMismatch) {
      warnings.push(
        `actual_device_sample_rate_mismatch:${requestedOutputSampleRate}->${actualDeviceSampleRate}`,
      );
    }

    const fileToDecoderResampling = fileSampleRate !== null && fileSampleRate !== decoderOutputSampleRate;
    const outputSideResampling =
      actualDeviceSampleRate !== null && actualDeviceSampleRate !== decoderOutputSampleRate;
    const sharedModeResampling =
      outputMode === 'shared' &&
      fileSampleRate !== null &&
      ((actualDeviceSampleRate !== null && actualDeviceSampleRate !== fileSampleRate) ||
        requestedOutputSampleRate !== fileSampleRate);
    const resampling = fileToDecoderResampling || outputSideResampling || sharedModeResampling;

    if (sharedModeResampling) {
      warnings.push('shared_output_resampling_or_mixer_rate_difference');
    }

    const bitPerfectCandidate =
      outputMode !== 'shared' &&
      fileSampleRate !== null &&
      fileSampleRate === decoderOutputSampleRate &&
      fileSampleRate === requestedOutputSampleRate &&
      (actualDeviceSampleRate === null || actualDeviceSampleRate === requestedOutputSampleRate) &&
      !sampleRateMismatch;

    return {
      fileSampleRate,
      decoderOutputSampleRate,
      requestedOutputSampleRate,
      actualDeviceSampleRate,
      sharedDeviceSampleRate,
      outputMode,
      resampling,
      bitPerfectCandidate,
      sampleRateMismatch,
      warnings,
    };
  }

  private applyReadyResult(ready: NativeBridgeReadyResult): void {
    if (!this.currentProbe || !this.currentOutputSettings) {
      return;
    }

    this.currentReadyResult = ready;
    if (!isResidentOutputMode(this.currentOutputSettings.outputMode)) {
      this.currentResidentOutputSampleRate = null;
    }
    const readyDevice = ready.device;
    this.currentOutputBackend = typeof readyDevice.backend === 'string' ? readyDevice.backend : null;
    this.currentOutputBackendImpl = typeof readyDevice.backendImpl === 'string' ? readyDevice.backendImpl : null;
    this.currentOutputDeviceType = typeof readyDevice.deviceType === 'string' ? readyDevice.deviceType : null;
    this.currentOutputDeviceName = typeof readyDevice.deviceName === 'string' ? readyDevice.deviceName : null;
    this.currentBridgeOutputMode = normalizeOutputMode(this.currentOutputSettings.outputMode);
    this.currentBridgeSharedBackend =
      this.currentBridgeOutputMode === 'shared'
        ? this.currentOutputBackend === 'directsound-shared'
          ? 'directsound'
          : normalizeSharedBackend(this.currentOutputSettings.sharedBackend)
        : null;
    const readySharedRate =
      normalizePositiveInteger(readyDevice.sharedDeviceSampleRate) ??
      normalizePositiveInteger(readyDevice.sharedSampleRate);
    const selectedDevice = readySharedRate
      ? {
          ...(this.currentDevice ?? {
            id: `${this.currentOutputSettings.outputMode ?? 'shared'}:ready`,
            index: this.currentOutputSettings.deviceIndex ?? -1,
            name: this.currentOutputSettings.deviceName ?? 'Selected output',
            outputMode: this.currentOutputSettings.outputMode === 'asio' ? 'asio' : 'shared',
            sampleRate: null,
            isDefault: false,
          }),
          sharedDeviceSampleRate: readySharedRate,
        }
      : this.currentDevice;
    const readyDeviceName = typeof readyDevice.deviceName === 'string' ? readyDevice.deviceName : null;
    const readySampleRate =
      normalizePositiveInteger(readyDevice.sharedDeviceSampleRate) ??
      normalizePositiveInteger(readyDevice.sharedSampleRate) ??
      ready.actualDeviceSampleRate;
    const resolvedDevice =
      readyDeviceName || readySampleRate
        ? {
            ...(selectedDevice ?? createDeviceFromOutputSettings(this.currentOutputSettings) ?? {
              id: `${this.currentOutputSettings.outputMode ?? 'shared'}:ready`,
              index: this.currentOutputSettings.deviceIndex ?? -1,
              name: 'Selected output',
              outputMode: this.currentOutputSettings.outputMode === 'asio' ? 'asio' : 'shared',
              sampleRate: null,
              sharedDeviceSampleRate: null,
              isDefault: false,
            }),
            name: readyDeviceName ?? selectedDevice?.name ?? this.currentOutputSettings.deviceName ?? 'Selected output',
            sampleRate: readySampleRate,
            sharedDeviceSampleRate: readySampleRate,
          }
        : selectedDevice;

    this.currentDevice = resolvedDevice;
    this.currentPlan = this.createSampleRatePlan(
      this.currentProbe,
      this.currentOutputSettings,
      resolvedDevice,
      ready.actualDeviceSampleRate,
      { residentOutputSampleRate: this.currentResidentOutputSampleRate },
    );
    this.assertAsioSampleRateUsable();
    this.nativeDeviceBufferFrames = numericReadyField(ready, 'deviceBufferFrames');
    this.nativeRequestedBufferFrames = numericReadyField(ready, 'requestedDeviceBufferFrames');
    this.nativeActualBufferFrames =
      numericReadyField(ready, 'nativeActualBufferFrames') ??
      numericReadyField(ready, 'actualBufferFrames') ??
      this.nativeDeviceBufferFrames;
    this.nativeFifoCapacityFrames = numericReadyField(ready, 'fifoCapacityFrames');
    this.nativeStartupPrebufferFrames = numericReadyField(ready, 'startupPrebufferFrames');
    if (readyDevice.bufferSizeFallback === true) {
      const requestedBufferFrames = numericReadyField(ready, 'requestedDeviceBufferFrames');
      const openedBufferFrames = numericReadyField(ready, 'openedDeviceBufferFrames') ?? this.nativeActualBufferFrames;
      this.addOutputWarning(
        requestedBufferFrames && openedBufferFrames
          ? `native_output_buffer_size_fell_back:${requestedBufferFrames}->${openedBufferFrames}`
          : 'native_output_buffer_size_fell_back',
      );
    }
    this.clock.setSampleRate(ready.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate);
  }

  private assertAsioSampleRateUsable(): void {
    const plan = this.currentPlan;

    if (!plan || plan.outputMode !== 'asio' || plan.actualDeviceSampleRate === null) {
      return;
    }

    if (
      plan.requestedOutputSampleRate >= minReliableAsioSampleRate &&
      plan.actualDeviceSampleRate < minReliableAsioSampleRate
    ) {
      throw new Error(
        `asio_output_sample_rate_unusable:${plan.requestedOutputSampleRate}->${plan.actualDeviceSampleRate}`,
      );
    }
  }

  private assertReadySampleRateConsistent(): void {
    const plan = this.currentPlan;

    if (!plan || plan.outputMode !== 'exclusive' || plan.actualDeviceSampleRate === null) {
      return;
    }

    if (plan.actualDeviceSampleRate !== plan.requestedOutputSampleRate) {
      throw new Error(
        `${plan.outputMode}_output_sample_rate_mismatch:${plan.requestedOutputSampleRate}->${plan.actualDeviceSampleRate}`,
      );
    }
  }

  private logAudioTransition(
    plan: SampleRatePlan,
    transition: {
      hostReused: boolean;
      hostRestartReason: string | null;
      preparedLocalProbeUsed?: boolean;
      preparedLocalProbeAgeMs?: number | null;
    },
  ): void {
    const sharedMixRate =
      plan.outputMode === 'shared'
        ? plan.sharedDeviceSampleRate ?? plan.actualDeviceSampleRate ?? plan.requestedOutputSampleRate
        : null;

    this.logger(
      JSON.stringify({
        event: 'audio_transition',
        outputMode: plan.outputMode,
        sourceSampleRate: plan.fileSampleRate,
        sharedMixRate,
        decoderOutputRate: plan.decoderOutputSampleRate,
        hostReused: transition.hostReused,
        hostRestartReason: transition.hostRestartReason,
        preparedLocalProbeUsed: transition.preparedLocalProbeUsed === true,
        preparedLocalProbeAgeMs: transition.preparedLocalProbeAgeMs ?? null,
      }),
    );
  }

  private resolveSelectedDevice(outputSettings: AudioOutputSettings): AudioDeviceInfo | null {
    const deviceIndex = Number(outputSettings.deviceIndex);
    const deviceName = outputSettings.deviceName;

    if (!Number.isInteger(deviceIndex) && !deviceName) {
      return null;
    }

    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const expectedDeviceMode = outputMode === 'asio' ? 'asio' : 'shared';

    const devices = this.deviceService.listDevices().filter((device) => device.outputMode === expectedDeviceMode);

    if (deviceName) {
      const nameMatch = devices.find((device) => device.name === deviceName);
      if (nameMatch) {
        return nameMatch;
      }
    }

    if (Number.isInteger(deviceIndex)) {
      return devices.find((device) => device.index === deviceIndex) ?? null;
    }

    return null;
  }

  private resolveDefaultSharedDevice(): AudioDeviceInfo | null {
    const sharedDevices = this.deviceService.listDevices().filter((device) => device.outputMode === 'shared');

    return sharedDevices.find((device) => device.isDefault) ?? sharedDevices[0] ?? null;
  }

  private createBridgeStartCandidates(outputSettings: AudioOutputSettings): Array<AudioDeviceInfo | null> {
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const explicitDevice = createDeviceFromOutputSettings(outputSettings);

    if (explicitDevice) {
      return outputMode === 'shared' ? [explicitDevice, null] : [explicitDevice];
    }

    return [null];
  }

  private createAsioFallbackCandidates(explicitDevice: AudioDeviceInfo): Array<AudioDeviceInfo | null> {
    const knownAsioDevices = this.deviceService.listDevices().filter((device) => device.outputMode === 'asio');
    const fallbackDevice = knownAsioDevices.find((device) => device.isDefault) ?? knownAsioDevices[0] ?? null;

    if (!fallbackDevice) {
      return [null];
    }

    if (
      fallbackDevice.name !== explicitDevice.name &&
      fallbackDevice.index !== explicitDevice.index
    ) {
      return [fallbackDevice];
    }

    return [];
  }

  private createAsioUnavailableKeyFromParts(deviceIndex?: unknown, deviceName?: unknown): string {
    const normalizedName = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim().toLocaleLowerCase() : '';
    const normalizedIndex = Number.isInteger(Number(deviceIndex)) ? String(Number(deviceIndex)) : '';

    return normalizedName || normalizedIndex ? `${normalizedIndex}:${normalizedName}` : 'default';
  }

  private createAsioUnavailableKeyFromDevice(device: AudioDeviceInfo | null): string {
    return this.createAsioUnavailableKeyFromParts(device?.index, device?.name);
  }

  private createAsioUnavailableKeyFromSettings(settings: AudioOutputSettings): string {
    return this.createAsioUnavailableKeyFromParts(settings.deviceIndex, settings.deviceName);
  }

  private createAsioUnavailableKeyFromStartOptions(options: NativeOutputStartOptions): string {
    return this.createAsioUnavailableKeyFromParts(options.deviceIndex, options.deviceName);
  }

  private rememberUnavailableAsioDevice(key: string, error: Error): void {
    this.unavailableAsioDevices.set(key, {
      expiresAt: Date.now() + asioUnavailableCooldownMs,
      message: error.message,
    });
  }

  private getUnavailableAsioDevice(key: string): { expiresAt: number; message: string } | null {
    const record = this.unavailableAsioDevices.get(key);
    if (!record) {
      return null;
    }

    if (Date.now() >= record.expiresAt) {
      this.unavailableAsioDevices.delete(key);
      return null;
    }

    return record;
  }

  private createNativeOutputStartOptions(options: NativeOutputStartOptions): NativeOutputStartOptions {
    const outputMode = options.asio ? 'asio' : options.exclusive ? 'exclusive' : 'shared';
    const latencyProfile = resolveSupportedLatencyProfile(outputMode, normalizeLatencyProfile(options.latencyProfile));
    const explicitBufferSizeFrames = this.sanitizeLowLatencyBufferForOutputMode(
      outputMode,
      latencyProfile,
      normalizePositiveInteger(options.bufferSizeFrames) ?? undefined,
      'native_start_options',
    );
    const profileBufferSizeFrames =
      explicitBufferSizeFrames ??
      getLatencyProfileBufferSizeFrames(outputMode, latencyProfile, options.requestedOutputSampleRate);

    if (options.asio) {
      return {
        ...options,
        latencyProfile,
        startupPrebufferMs: options.startupPrebufferMs ?? 0,
        startupPrebufferTimeoutMs: options.startupPrebufferTimeoutMs ?? 0,
        bufferSizeFrames: profileBufferSizeFrames,
      };
    }

    if (options.exclusive) {
      return {
        ...options,
        latencyProfile,
        startupPrebufferMs: options.startupPrebufferMs,
        startupPrebufferTimeoutMs: options.startupPrebufferTimeoutMs,
        bufferSizeFrames: profileBufferSizeFrames,
      };
    }

    const sharedBackend = normalizeSharedBackend(options.sharedBackend);
    const sharedProfile = sharedBackend === 'directsound'
      ? directSoundSharedProfile
      : latencyProfile === 'stable'
        ? stableSharedProfile
        : sharedStabilityProfiles[this.sharedStabilityTier];
    const sharedProfileBufferSizeFrames = sharedProfile.bufferSizeFrames ?? 0;
    const stableProfileBufferSizeFrames = latencyProfiles.stable.bufferSizeFrames ?? 8192;
    const effectiveLatencyProfile =
      latencyProfile === 'lowLatency' && sharedProfileBufferSizeFrames > lowLatencyMaxBufferSizeFrames
        ? (sharedProfileBufferSizeFrames >= stableProfileBufferSizeFrames ? 'stable' : 'balanced')
        : latencyProfile;
    if (effectiveLatencyProfile !== latencyProfile) {
      this.addOutputWarning(lowLatencyBufferIgnoredWarning);
      this.logger(
        `[AudioSession] ${lowLatencyBufferIgnoredWarning}; source=shared_stability_profile outputMode=shared requestedBuffer=${sharedProfileBufferSizeFrames}`,
      );
    }

    return {
      ...options,
      latencyProfile: effectiveLatencyProfile,
      ...sharedProfile,
      bufferSizeFrames: explicitBufferSizeFrames ?? (
        sharedBackend === 'directsound'
          ? sharedProfile.bufferSizeFrames
          : Math.max(profileBufferSizeFrames, sharedProfile.bufferSizeFrames ?? 0)
      ),
    };
  }

  private async startNativeFallbackForJuceOutput(
    startOptions: NativeOutputStartOptions,
    token: number,
    phase: string,
    cause: Error,
  ): Promise<{ bridge: OutputBridgeLike; ready: NativeBridgeReadyResult } | null> {
    if (!this.currentOutputSettings || startOptions.useJuceOutput !== true) {
      return null;
    }

    const outputMode = normalizeOutputMode(this.currentOutputSettings.outputMode);
    if (
      outputMode === 'shared' &&
      hasExplicitDeviceSelection(this.currentOutputSettings) &&
      isOutputDeviceStartRefused(cause)
    ) {
      this.addOutputWarning('juce_shared_output_skipped_same_device_native_retry');
      this.logger(
        `[AudioSession] JUCE shared output failed on selected device; trying default shared output instead of retrying the same device natively: ${cause.message}`,
      );
      return null;
    }

    this.currentOutputSettings = {
      ...this.currentOutputSettings,
      useJuceOutput: false,
    };
    this.addOutputWarning('juce_output_fell_back_to_native');
    this.addOutputWarning(`juce_${outputMode}_output_fell_back_to_native`);
    this.logger(`[AudioSession] JUCE ${outputMode} output failed; trying native output: ${cause.message}`);

    const bridge = this.createBridge();
    this.bridge = bridge;
    this.attachBridgeEvents(bridge, token);

    try {
      const ready = await bridge.start({
        ...startOptions,
        useJuceOutput: false,
      });

      return { bridge, ready };
    } catch (error) {
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] native fallback after JUCE failed: ${fallbackError.message}`);
      if (
        outputMode === 'asio' &&
        this.currentOutputSettings.asioUnavailableFallbackEnabled === true &&
        isAsioDeviceUnavailableError(fallbackError)
      ) {
        this.rememberUnavailableAsioDevice(this.createAsioUnavailableKeyFromStartOptions(startOptions), fallbackError);
      }
      this.reportRecoverableAudioError(fallbackError, phase, {
        outputMode,
        recovered: false,
        juceFallback: true,
      });
      await this.stopBridgeGracefully(bridge, 'juce-native-fallback-failed');
      return null;
    }
  }

  private async startOutputBridgeForProbe(
    probe: AudioProbeResult,
    token: number,
    startSeconds: number,
  ): Promise<BridgeStartResult> {
    if (!this.currentOutputSettings) {
      throw new Error('audio output settings unavailable');
    }

    const candidates = this.createBridgeStartCandidates(this.currentOutputSettings);
    let lastError: Error | null = null;
    let previousBridgeStopped = false;
    let asioFallbackCandidatesAdded = false;

    if (
      normalizeOutputMode(this.currentOutputSettings.outputMode) === 'asio' &&
      this.currentOutputSettings.asioUnavailableFallbackEnabled === true
    ) {
      const unavailable = this.getUnavailableAsioDevice(this.createAsioUnavailableKeyFromSettings(this.currentOutputSettings));
      if (unavailable) {
        this.addOutputWarning('asio_output_device_temporarily_unavailable');
        this.addOutputWarning('asio_output_fell_back_to_safe_shared');
        this.logger(
          `[AudioSession] ASIO output is temporarily unavailable; using safe shared output instead: ${unavailable.message}`,
        );
        return this.startSafeSharedFallbackForProbe(
          probe,
          token,
          startSeconds,
          new Error(`ASIO output temporarily unavailable: ${unavailable.message}`),
        );
      }
    }

    for (const candidate of candidates) {
      this.assertCurrentRun(token);
      const outputMode = normalizeOutputMode(this.currentOutputSettings.outputMode);
      const usingDefaultSharedFallback =
        outputMode === 'shared' && candidate === null && hasExplicitDeviceSelection(this.currentOutputSettings);
      const usingDefaultAsioFallback =
        outputMode === 'asio' && candidate === null && hasExplicitDeviceSelection(this.currentOutputSettings);
      const planDevice = outputMode === 'shared' && candidate === null ? this.resolveDefaultSharedDevice() : candidate;
      this.currentDevice = planDevice;
      const residentOutputSampleRate = null;
      this.currentResidentOutputSampleRate = residentOutputSampleRate;
      this.currentPlan = this.createSampleRatePlan(
        probe,
        this.currentOutputSettings,
        this.currentDevice,
        null,
        { residentOutputSampleRate },
      );
      this.logger(
        `[AudioSession] sample-rate plan: file=${this.currentPlan.fileSampleRate ?? 'n/a'} decoder=${
          this.currentPlan.decoderOutputSampleRate
        } requested=${this.currentPlan.requestedOutputSampleRate} mode=${this.currentPlan.outputMode} device=${
          planDevice ? `${planDevice.index}:${planDevice.name}` : 'default'
        }`,
      );
      this.clock.reset(startSeconds, this.currentPlan.requestedOutputSampleRate);
      const sharedBackend = outputMode === 'shared' ? normalizeSharedBackend(this.currentOutputSettings.sharedBackend) : 'auto';
      const useDirectSoundBackend = sharedBackend === 'directsound';
      const useJuceOutputForHost = shouldUseJuceOutputForHost(
        outputMode,
        sharedBackend,
        this.currentOutputSettings.useJuceOutput === true,
      );

      const startOptions = this.createNativeOutputStartOptions({
        requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
        sharedMixSampleRate: outputMode === 'shared' ? this.currentPlan.requestedOutputSampleRate : null,
        channels: probe.channels,
        deviceIndex: useDirectSoundBackend
          ? undefined
          : candidate?.index ?? (usingDefaultSharedFallback || usingDefaultAsioFallback ? undefined : this.currentOutputSettings.deviceIndex),
        deviceName: candidate?.name ?? (usingDefaultSharedFallback || usingDefaultAsioFallback ? undefined : this.currentOutputSettings.deviceName),
        asioOutputChannelStart: outputMode === 'asio'
          ? candidate?.asioOutputChannelStart ?? this.currentOutputSettings.asioOutputChannelStart
          : undefined,
        sharedBackend,
        asio: outputMode === 'asio',
        exclusive: outputMode === 'exclusive',
        useJuceOutput: useJuceOutputForHost,
        latencyProfile: this.currentOutputSettings.latencyProfile,
        bufferSizeFrames: this.currentOutputSettings.bufferSizeFrames ?? undefined,
        volume: this.currentOutputSettings.volume,
        startSeconds,
        playbackRate: this.currentOutputSettings.playbackRate,
        playbackSpeedMode: this.currentOutputSettings.playbackSpeedMode,
        durationSeconds: probe.durationSeconds,
      });
      const reusableBridge = this.bridge;
      if (!useDirectSoundBackend && reusableBridge?.canReuseFor?.(startOptions) && this.currentReadyResult) {
        const residentSampleRate =
          isResidentOutputMode(outputMode) ? getReadyOutputSampleRate(this.currentReadyResult) : null;
        this.currentResidentOutputSampleRate = residentSampleRate;
        if (residentSampleRate) {
          this.currentPlan = this.createSampleRatePlan(
            probe,
            this.currentOutputSettings,
            this.currentDevice,
            residentSampleRate,
            { residentOutputSampleRate: residentSampleRate },
          );
          this.clock.reset(startSeconds, residentSampleRate);
        }
        this.attachBridgeEvents(reusableBridge, token);
        return {
          bridge: reusableBridge,
          plan: this.currentPlan,
          ready: this.currentReadyResult,
          hostReused: true,
          hostRestartReason: null,
        };
      }

      const hostRestartReason = this.bridge
        ? this.currentReadyResult
          ? 'reuse_key_changed'
          : 'resident_host_not_ready'
        : 'initial_start';

      if (this.bridge && !previousBridgeStopped) {
        if (this.shouldDetachSharedReplacement(outputMode, sharedBackend)) {
          this.detachSharedReplacementBridge('replace-output');
        } else {
          await this.stopResourcesGracefully('replace-output');
        }
        previousBridgeStopped = true;
      }

      const bridge = this.createBridge();
      this.bridge = bridge;
      this.attachBridgeEvents(bridge, token);

      try {
        const ready = await bridge.start(startOptions);

        if (usingDefaultSharedFallback) {
          this.addOutputWarning('shared_output_fell_back_to_default_device');
          this.addOutputWarning('shared_output_recovered_to_default_device');
        }

        return { bridge, plan: this.currentPlan, ready, hostReused: false, hostRestartReason };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger(`[AudioSession] output start failed: ${lastError.message}`);
        this.reportRecoverableAudioError(lastError, 'output-start', {
          outputMode,
          candidate: candidate ? { index: candidate.index, name: candidate.name, outputMode: candidate.outputMode } : 'default',
          requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
          channels: probe.channels,
        });
        await this.stopBridgeGracefully(bridge, 'output-start-failed');
        if (isDeviceInitializeTimeoutError(lastError)) {
          this.addOutputWarning('device_initialize_timeout');
          this.logger('[AudioSession] device initialize timed out; skipping retry on same device');
          break;
        }
        const nativeFallback = await this.startNativeFallbackForJuceOutput(
          startOptions,
          token,
          'output-start',
          lastError,
        );
        if (nativeFallback) {
          const fallbackPlan = this.currentPlan;
          if (!fallbackPlan) {
            throw new Error('audio output sample-rate plan unavailable after JUCE fallback');
          }
          return {
            bridge: nativeFallback.bridge,
            plan: fallbackPlan,
            ready: nativeFallback.ready,
            hostReused: false,
            hostRestartReason: 'juce_fallback_to_native',
          };
        }
        if (
          outputMode === 'asio' &&
          candidate !== null &&
          !asioFallbackCandidatesAdded &&
          hasExplicitDeviceSelection(this.currentOutputSettings)
        ) {
          if (this.currentOutputSettings.asioUnavailableFallbackEnabled === true && isAsioDeviceUnavailableError(lastError)) {
            this.rememberUnavailableAsioDevice(this.createAsioUnavailableKeyFromDevice(candidate), lastError);
          }
          asioFallbackCandidatesAdded = true;
          candidates.push(...this.createAsioFallbackCandidates(candidate));
        } else if (
          outputMode === 'asio' &&
          this.currentOutputSettings.asioUnavailableFallbackEnabled === true &&
          isAsioDeviceUnavailableError(lastError)
        ) {
          this.rememberUnavailableAsioDevice(
            candidate ? this.createAsioUnavailableKeyFromDevice(candidate) : this.createAsioUnavailableKeyFromSettings(this.currentOutputSettings),
            lastError,
          );
        }
      }
    }

    if (normalizeOutputMode(this.currentOutputSettings.outputMode) === 'exclusive') {
      const fallbackSettings = createSharedFallbackSettings(this.currentOutputSettings);
      const fallbackDevice = this.resolveSelectedDevice(fallbackSettings) ?? createDeviceFromOutputSettings(fallbackSettings);
      this.assertCurrentRun(token);
      this.currentOutputSettings = fallbackSettings;
      this.currentDevice = fallbackDevice;
      this.currentPlan = this.createSampleRatePlan(probe, fallbackSettings, fallbackDevice);
      this.outputWarnings.push('exclusive_output_fell_back_to_shared');
      this.logger(
        `[AudioSession] exclusive output failed; falling back to shared output: ${
          lastError?.message ?? 'unknown exclusive output error'
        }`,
      );
      this.clock.reset(startSeconds, this.currentPlan.requestedOutputSampleRate);

      const bridge = this.createBridge();
      this.bridge = bridge;
      this.attachBridgeEvents(bridge, token);

      try {
        const ready = await bridge.start(this.createNativeOutputStartOptions({
          requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
          sharedMixSampleRate: this.currentPlan.requestedOutputSampleRate,
          channels: probe.channels,
          deviceIndex: fallbackDevice?.index ?? fallbackSettings.deviceIndex,
          deviceName: fallbackDevice?.name ?? fallbackSettings.deviceName,
          sharedBackend: fallbackSettings.sharedBackend,
          asio: false,
          exclusive: false,
          useJuceOutput: false,
          latencyProfile: fallbackSettings.latencyProfile,
          bufferSizeFrames: fallbackSettings.bufferSizeFrames ?? undefined,
          volume: fallbackSettings.volume,
          startSeconds,
          playbackRate: fallbackSettings.playbackRate,
          playbackSpeedMode: fallbackSettings.playbackSpeedMode,
          durationSeconds: probe.durationSeconds,
        }));

        return {
          bridge,
          plan: this.currentPlan,
          ready,
          hostReused: false,
          hostRestartReason: 'exclusive_fallback_to_shared',
        };
      } catch (error) {
        const fallbackError = error instanceof Error ? error : new Error(String(error));
        this.logger(`[AudioSession] shared fallback failed: ${fallbackError.message}`);
        await this.stopBridgeGracefully(bridge, 'shared-fallback-failed');
        return this.startSafeSharedFallbackForProbe(probe, token, startSeconds, fallbackError);
      }
    }

    if (normalizeOutputMode(this.currentOutputSettings.outputMode) === 'shared') {
      return this.startSafeSharedFallbackForProbe(
        probe,
        token,
        startSeconds,
        lastError ?? new Error('shared output failed before ready'),
      );
    }

    if (normalizeOutputMode(this.currentOutputSettings.outputMode) === 'asio') {
      this.addOutputWarning('asio_output_fell_back_to_safe_shared');
      this.logger(
        `[AudioSession] ASIO output failed; falling back to safe shared output: ${
          lastError?.message ?? 'unknown ASIO output error'
        }`,
      );
      return this.startSafeSharedFallbackForProbe(
        probe,
        token,
        startSeconds,
        lastError ?? new Error('ASIO output failed before ready'),
      );
    }

    throw lastError ?? new Error('no output device candidates available');
  }

  private async startSafeSharedFallbackForProbe(
    probe: AudioProbeResult,
    token: number,
    startSeconds: number,
    cause: Error,
  ): Promise<BridgeStartResult> {
    if (!this.currentOutputSettings) {
      throw new Error('audio output settings unavailable');
    }

    await this.stopResourcesGracefully('safe-shared-fallback');

    const fallbackSettings = createSafeSharedFallbackSettings(this.currentOutputSettings);
    const fallbackDevice = this.resolveDefaultSharedDevice();
    this.assertCurrentRun(token);
    this.currentOutputSettings = fallbackSettings;
    this.currentDevice = fallbackDevice;
    this.currentPlan = this.createSampleRatePlan(probe, fallbackSettings, fallbackDevice);
    this.sharedStabilityTier = 'emergency';
    this.addOutputWarning('shared_output_recovered_safe_mode');
    this.logger(`[AudioSession] shared output failed; trying safe shared output: ${cause.message}`);
    this.clock.reset(startSeconds, this.currentPlan.requestedOutputSampleRate);

    const bridge = this.createBridge();
    this.bridge = bridge;
    this.attachBridgeEvents(bridge, token);

    try {
      const ready = await bridge.start(this.createNativeOutputStartOptions({
        requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
        sharedMixSampleRate: this.currentPlan.requestedOutputSampleRate,
        channels: probe.channels,
        sharedBackend: fallbackSettings.sharedBackend,
        asio: false,
        exclusive: false,
        useJuceOutput: false,
        latencyProfile: fallbackSettings.latencyProfile,
        bufferSizeFrames: fallbackSettings.bufferSizeFrames ?? undefined,
        volume: fallbackSettings.volume,
        startSeconds,
        playbackRate: fallbackSettings.playbackRate,
        playbackSpeedMode: fallbackSettings.playbackSpeedMode,
        durationSeconds: probe.durationSeconds,
      }));

      this.reportRecoverableAudioError(cause, 'safe-shared-fallback', {
        recovered: true,
        requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
        channels: probe.channels,
      });
      return {
        bridge,
        plan: this.currentPlan,
        ready,
        hostReused: false,
        hostRestartReason: 'safe_shared_fallback',
      };
    } catch (error) {
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] safe shared fallback failed: ${fallbackError.message}`);
      await this.stopBridgeGracefully(bridge, 'safe-shared-fallback-failed');
      throw fallbackError;
    }
  }

  private async startSharedFallbackForProbe(
    probe: AudioProbeResult,
    token: number,
    startSeconds: number,
    cause: Error,
  ): Promise<BridgeStartResult> {
    if (!this.currentOutputSettings) {
      throw new Error('audio output settings unavailable');
    }

    await this.stopResourcesGracefully('shared-fallback');

    const fallbackSettings = createSharedFallbackSettings(this.currentOutputSettings);
    const fallbackDevice = this.resolveSelectedDevice(fallbackSettings) ?? createDeviceFromOutputSettings(fallbackSettings);
    this.assertCurrentRun(token);
    this.currentOutputSettings = fallbackSettings;
    this.currentDevice = fallbackDevice;
    this.currentPlan = this.createSampleRatePlan(probe, fallbackSettings, fallbackDevice);
    this.outputWarnings.push('exclusive_output_fell_back_to_shared');
    this.logger(`[AudioSession] exclusive output failed; falling back to shared output: ${cause.message}`);
    this.clock.reset(startSeconds, this.currentPlan.requestedOutputSampleRate);

    const bridge = this.createBridge();
    this.bridge = bridge;
    this.attachBridgeEvents(bridge, token);

    try {
      const ready = await bridge.start(this.createNativeOutputStartOptions({
        requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
        sharedMixSampleRate: this.currentPlan.requestedOutputSampleRate,
        channels: probe.channels,
        deviceIndex: fallbackDevice?.index ?? fallbackSettings.deviceIndex,
        deviceName: fallbackDevice?.name ?? fallbackSettings.deviceName,
        sharedBackend: fallbackSettings.sharedBackend,
        asio: false,
        exclusive: false,
        useJuceOutput: false,
        latencyProfile: fallbackSettings.latencyProfile,
        bufferSizeFrames: fallbackSettings.bufferSizeFrames ?? undefined,
        volume: fallbackSettings.volume,
        startSeconds,
        playbackRate: fallbackSettings.playbackRate,
        playbackSpeedMode: fallbackSettings.playbackSpeedMode,
        durationSeconds: probe.durationSeconds,
      }));

      return {
        bridge,
        plan: this.currentPlan,
        ready,
        hostReused: false,
        hostRestartReason: 'exclusive_fallback_to_shared',
      };
    } catch (error) {
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] shared fallback failed: ${fallbackError.message}`);
      await this.stopBridgeGracefully(bridge, 'shared-fallback-failed');
      return this.startSafeSharedFallbackForProbe(probe, token, startSeconds, fallbackError);
    }
  }

  private async preparePausedOutputBridge(token: number, startSeconds: number): Promise<void> {
    const probe = this.currentProbe;

    if (!probe || !this.currentOutputSettings || !this.currentFilePath) {
      return;
    }

    try {
      const { ready } = await this.startOutputBridgeForProbe(probe, token, startSeconds);

      if (this.runToken !== token) {
        return;
      }

      this.applyReadyResult(ready);
      this.hostStatus = 'ready';
      this.emitStatus();
    } catch (error) {
      if (this.runToken !== token) {
        return;
      }

      await this.stopResourcesGracefully('paused-output-prewarm-failed');
      this.currentPlan = null;
      this.currentResidentOutputSampleRate = null;
      this.currentOutputBackend = null;
      this.currentOutputBackendImpl = null;
      this.currentOutputDeviceType = null;
      this.currentOutputDeviceName = null;
      this.currentUseJuceOutputRequested = false;
      this.currentReadyResult = null;
      this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';

      if (this.state === 'playing') {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      this.logger(`[AudioSession] paused output prewarm failed: ${error instanceof Error ? error.message : String(error)}`);
      this.emitStatus();
    }
  }

  private attachBridgeEvents(bridge: OutputBridgeLike, token: number): void {
    this.detachBridgeEvents();

    const listeners: BridgeEventListeners = {
      position: (frames: unknown, telemetry?: unknown) => {
        if (this.runToken !== token) {
          return;
        }

        this.clock.updateFrames(Number(frames));
        this.watchdogLastPositionSeconds = this.clock.getPositionSeconds();
        this.watchdogStalledChecks = 0;
        if (telemetry && typeof telemetry === 'object' && !Array.isArray(telemetry)) {
          this.handleNativeTelemetry(telemetry as NativeOutputTelemetry);
        }
      },
      ended: () => {
        if (this.runToken !== token) {
          return;
        }

        this.state = 'ended';
        this.updatePositionFromOutput();
        this.resetWatchdogProgress();
        this.emit('ended', this.getStatus());
        this.emitStatus();
      },
      error: (error: unknown) => {
        if (this.runToken !== token) {
          return;
        }

        this.handleError(error instanceof Error ? error : new Error(String(error)));
      },
      deviceEvent: (event: unknown) => {
        if (this.runToken !== token) {
          return;
        }

        void this.handleNativeHostNotification(event);
      },
    };

    bridge.on('position', listeners.position);
    bridge.on('ended', listeners.ended);
    bridge.on('error', listeners.error);
    bridge.on('device-event', listeners.deviceEvent);
    this.attachedBridgeEvents = { bridge, listeners };
  }

  private detachBridgeEvents(bridge: OutputBridgeLike | null = this.attachedBridgeEvents?.bridge ?? null): void {
    const attached = this.attachedBridgeEvents;
    if (!bridge || !attached || attached.bridge !== bridge) {
      return;
    }

    const removeListener = bridge.off ?? bridge.removeListener;
    if (removeListener) {
      removeListener.call(bridge, 'position', attached.listeners.position);
      removeListener.call(bridge, 'ended', attached.listeners.ended);
      removeListener.call(bridge, 'error', attached.listeners.error);
      removeListener.call(bridge, 'device-event', attached.listeners.deviceEvent);
    }

    this.attachedBridgeEvents = null;
  }

  private updatePositionFromOutput(): void {
    if (this.state !== 'paused' && this.bridge?.getPositionSeconds) {
      const positionSeconds = this.bridge.getPositionSeconds();
      const plan = this.currentPlan;
      const sampleRate = plan?.actualDeviceSampleRate ?? plan?.requestedOutputSampleRate ?? null;
      this.clock.reset(positionSeconds, sampleRate);
    }
  }

  private startDecoderRun(run: DecoderRun, writable: Writable, token: number): void {
    this.decoderPipelineCleanup?.();
    const volume = this.currentOutputSettings?.volume ?? this.outputSettings.volume;
    const nativeVolumeControl = typeof this.bridge?.setVolume === 'function';
    const gainTransform = new PcmVolumeTransform(nativeVolumeControl ? 1 : volume);
    const speedTransform = new PcmPlaybackRateTransform(
      this.currentProbe?.channels ?? 2,
      this.currentOutputSettings?.playbackRate ?? this.outputSettings.playbackRate,
    );
    const levelMeterTransform = new PcmLevelMeterTransform((snapshot) => this.handleLevelSnapshot(snapshot));
    levelMeterTransform.setGain(nativeVolumeControl ? volume : 1);
    let inputEnded = false;
    const signalNativeInputEnded = (): void => {
      if (inputEnded || this.runToken !== token || this.decoderRun !== run) {
        return;
      }

      inputEnded = true;
      try {
        writable.end();
      } catch {
        // The native host may already have been stopped by pause/seek/stop.
      }
    };

    this.decoderRun = run;
    this.gainTransform = gainTransform;
    this.speedTransform = speedTransform;
    this.levelMeterTransform = levelMeterTransform;
    const handlePipelineError = (stage: string) => (error: unknown): void => {
      if (this.runToken !== token || this.decoderRun !== run) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.handleError(new Error(`${stage}: ${message}`));
    };
    const streamErrorHandler = handlePipelineError('decoder_stream_error');
    const gainErrorHandler = handlePipelineError('pcm_gain_error');
    const speedErrorHandler = handlePipelineError('pcm_speed_error');
    const levelErrorHandler = handlePipelineError('pcm_level_meter_error');
    const writableErrorHandler = handlePipelineError('native_writable_error');

    run.stream.on('error', streamErrorHandler);
    gainTransform.on('error', gainErrorHandler);
    speedTransform.on('error', speedErrorHandler);
    levelMeterTransform.on('error', levelErrorHandler);
    writable.on('error', writableErrorHandler);
    this.decoderPipelineCleanup = (): void => {
      run.stream.off('error', streamErrorHandler);
      gainTransform.off('error', gainErrorHandler);
      speedTransform.off('error', speedErrorHandler);
      levelMeterTransform.off('error', levelErrorHandler);
      writable.off('error', writableErrorHandler);
    };
    run.stream.pipe(gainTransform).pipe(speedTransform).pipe(levelMeterTransform).pipe(writable, { end: false });
    levelMeterTransform.once('end', signalNativeInputEnded);
    run.done.then(signalNativeInputEnded).catch((error: unknown) => {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async handleNativeHostNotification(event: unknown): Promise<void> {
    if (
      !isNativeHostNotificationEvent(event) ||
      this.state !== 'playing' ||
      this.watchdogRecovering ||
      this.sharedStabilityRecovering ||
      !this.currentFilePath ||
      !this.currentOutputSettings ||
      !this.currentPlan ||
      !this.currentProbe ||
      !this.bridge
    ) {
      return;
    }

    const reason = typeof event.reason === 'string' && event.reason ? event.reason : 'unknown';
    const affectsCurrentOutput = event.currentDevice === true || event.followsDefaultDevice === true;
    let recoveryReason: string | null = null;

    if (event.event === 'audio_session_disconnected') {
      recoveryReason = `native_session_disconnected:${reason}`;
    } else if (event.event === 'default_device_changed' && affectsCurrentOutput) {
      recoveryReason = 'default_device_changed';
    } else if (event.event === 'device_removed' && affectsCurrentOutput) {
      recoveryReason = 'audio_device_removed';
    } else if (event.event === 'device_state_changed' && affectsCurrentOutput && inactiveDeviceReasons.has(reason)) {
      recoveryReason = `audio_device_state_changed:${reason}`;
    }

    if (!recoveryReason) {
      return;
    }

    const bridgePositionSeconds = this.bridge.getPositionSeconds();
    const positionSeconds = Number.isFinite(bridgePositionSeconds) ? bridgePositionSeconds : this.clock.getPositionSeconds();
    this.logger(
      `[AudioSession] ${recoveryReason}; restarting output after native host notification position=${positionSeconds.toFixed(3)}`,
    );

    if (this.currentPlan.outputMode === 'exclusive' && event.event !== 'default_device_changed') {
      this.addPendingOutputWarning(recoveryReason);
      await this.fallbackExclusiveToSharedForInstability(positionSeconds);
      return;
    }

    await this.recoverOutputStability(recoveryReason, positionSeconds);
  }

  private handleNativeTelemetry(telemetry: NativeOutputTelemetry): void {
    this.nativeTelemetry = {
      positionFrames: Math.max(0, Math.round(Number(telemetry.positionFrames) || 0)),
      bufferedFrames:
        telemetry.bufferedFrames === null || telemetry.bufferedFrames === undefined
          ? null
          : Math.max(0, Math.round(Number(telemetry.bufferedFrames) || 0)),
      underrunCallbacks: Math.max(0, Math.round(Number(telemetry.underrunCallbacks) || 0)),
      underrunFrames: Math.max(0, Math.round(Number(telemetry.underrunFrames) || 0)),
      reportedAtMs:
        telemetry.reportedAtMs === null || telemetry.reportedAtMs === undefined
          ? null
          : Math.max(0, Number(telemetry.reportedAtMs) || 0),
      nativePositionStalenessMs:
        telemetry.nativePositionStalenessMs === null || telemetry.nativePositionStalenessMs === undefined
          ? null
          : Math.max(0, Math.round(Number(telemetry.nativePositionStalenessMs) || 0)),
    };

    if (this.state === 'playing') {
      void this.checkNativeUnderrunRecovery();
      this.emitNativeTelemetryStatus();
    }
  }

  private async checkNativeUnderrunRecovery(): Promise<void> {
    if (
      this.state !== 'playing' ||
      this.watchdogRecovering ||
      this.sharedStabilityRecovering ||
      !this.currentFilePath ||
      !this.currentOutputSettings ||
      !this.currentPlan ||
      !this.currentProbe
    ) {
      return;
    }

    const now = Date.now();
    if (!this.nativeUnderrunWindow || now - this.nativeUnderrunWindow.startedAt > nativeUnderrunWindowMs) {
      this.nativeUnderrunWindow = {
        startedAt: now,
        callbacks: this.nativeTelemetry.underrunCallbacks,
        frames: this.nativeTelemetry.underrunFrames,
      };
      return;
    }

    const callbackDelta = this.nativeTelemetry.underrunCallbacks - this.nativeUnderrunWindow.callbacks;
    const frameDelta = this.nativeTelemetry.underrunFrames - this.nativeUnderrunWindow.frames;
    const sampleRate = this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate;
    const frameThreshold = Math.max(1, Math.round((sampleRate * nativeUnderrunFramesThresholdMs) / 1000));

    if (callbackDelta < nativeUnderrunCallbackThreshold && frameDelta < frameThreshold) {
      return;
    }

    if (this.currentPlan.outputMode === 'exclusive') {
      await this.fallbackExclusiveToSharedForInstability(this.clock.getPositionSeconds());
      return;
    }

    const reason = this.currentPlan.outputMode === 'shared' ? 'shared_output_underrun_detected' : 'native_output_underrun_detected';
    await this.recoverOutputStability(reason, this.clock.getPositionSeconds());
  }

  private stopDecoderRun(): void {
    this.decoderPipelineCleanup?.();
    this.decoderPipelineCleanup = null;

    if (this.decoderRun) {
      try {
        this.decoderRun.stream.unpipe();
      } catch {
        // Best-effort resource cleanup.
      }
      this.decoderRun.stop();
      this.decoderRun = null;
    }

    if (this.gainTransform) {
      try {
        this.gainTransform.destroy();
      } catch {
        // Best-effort resource cleanup.
      }
      this.gainTransform = null;
    }

    if (this.speedTransform) {
      try {
        this.speedTransform.destroy();
      } catch {
        // Best-effort resource cleanup.
      }
      this.speedTransform = null;
    }

    if (this.levelMeterTransform) {
      try {
        this.levelMeterTransform.destroy();
      } catch {
        // Best-effort resource cleanup.
      }
      this.levelMeterTransform = null;
    }
  }

  private resetLevelMeter(): void {
    this.levelMeterTransform?.reset();
    this.levelSnapshot = {
      inputPeakDb: null,
      inputRmsDb: null,
      clipCount: 0,
      lastClipAt: null,
    };
    this.lastLevelMeterStatusEmittedAt = 0;
  }

  private resetNativeTelemetry(): void {
    this.nativeDeviceBufferFrames = null;
    this.nativeRequestedBufferFrames = null;
    this.nativeActualBufferFrames = null;
    this.nativeFifoCapacityFrames = null;
    this.nativeStartupPrebufferFrames = null;
    this.nativeTelemetry = {
      positionFrames: 0,
      bufferedFrames: null,
      underrunCallbacks: 0,
      underrunFrames: 0,
      reportedAtMs: null,
      nativePositionStalenessMs: null,
    };
    this.lastNativeTelemetryStatusEmittedAt = 0;
    this.lastLevelMeterStatusEmittedAt = 0;
    this.nativeUnderrunWindow = null;
  }

  private shouldClearSharedStabilityMemory(settings: AudioOutputSettings): boolean {
    return (
      hasOwn(settings, 'latencyProfile') ||
      hasOwn(settings, 'bufferSizeFrames') ||
      hasOwn(settings, 'deviceIndex') ||
      hasOwn(settings, 'deviceName')
    );
  }

  private pruneSharedStabilityMemory(now = Date.now()): void {
    for (const [key, record] of this.sharedStabilityMemory.entries()) {
      if (record.expiresAt <= now) {
        this.sharedStabilityMemory.delete(key);
      }
    }
  }

  private createSharedStabilityMemoryKey(
    settings: AudioOutputSettings,
    device: AudioDeviceInfo | null,
  ): string | null {
    if (normalizeOutputMode(settings.outputMode) !== 'shared') {
      return null;
    }

    const explicitDeviceIndex = Number.isInteger(Number(settings.deviceIndex)) ? Number(settings.deviceIndex) : null;
    const deviceIndex = Number.isInteger(Number(device?.index)) ? Number(device?.index) : explicitDeviceIndex;
    const deviceName = device?.name ?? settings.deviceName ?? 'default';

    return JSON.stringify({
      sharedBackend: normalizeSharedBackend(settings.sharedBackend),
      deviceId: device?.id ?? null,
      deviceIndex,
      deviceName,
      explicitDevice: hasExplicitDeviceSelection(settings),
    });
  }

  private getRememberedSharedStabilityTier(
    settings: AudioOutputSettings,
    device: AudioDeviceInfo | null,
  ): SharedStabilityTier | null {
    const key = this.createSharedStabilityMemoryKey(settings, device);
    if (!key) {
      return null;
    }

    const now = Date.now();
    this.pruneSharedStabilityMemory(now);
    const record = this.sharedStabilityMemory.get(key);
    return record && record.expiresAt > now ? record.tier : null;
  }

  private rememberSharedStabilityTier(
    settings: AudioOutputSettings,
    device: AudioDeviceInfo | null,
    tier: SharedStabilityTier,
  ): void {
    const key = this.createSharedStabilityMemoryKey(settings, device);
    if (!key) {
      return;
    }

    this.pruneSharedStabilityMemory();
    this.sharedStabilityMemory.set(key, {
      tier,
      expiresAt: Date.now() + sharedStabilityMemoryTtlMs,
    });
  }

  private resetSharedStabilityForFreshPlayback(
    outputMode: AudioOutputMode,
    settings: AudioOutputSettings | null = this.currentOutputSettings,
    device: AudioDeviceInfo | null = this.currentDevice,
  ): void {
    if (outputMode === 'shared' && !this.watchdogRecovering && !this.sharedStabilityRecovering) {
      this.sharedStabilityTier = settings ? this.getRememberedSharedStabilityTier(settings, device) ?? 'standard' : 'standard';
    }
  }

  private handleLevelSnapshot(snapshot: PcmLevelSnapshot): void {
    this.levelSnapshot = snapshot;
    if (this.state === 'playing') {
      const now = Date.now();
      if (now - this.lastLevelMeterStatusEmittedAt >= levelMeterStatusIntervalMs) {
        this.lastLevelMeterStatusEmittedAt = now;
        this.emitStatus();
      }
    }
  }

  private stopResources(): void {
    this.stopDecoderRun();

    if (this.bridge) {
      this.detachBridgeEvents(this.bridge);
      try {
        this.bridge.stop();
      } catch {
        // Emergency cleanup must stay synchronous and best-effort.
      }
      this.bridge = null;
      this.currentReadyResult = null;
      this.currentBridgeOutputMode = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
    }
  }

  private async stopResourcesGracefully(reason: string, waitForExitOverride?: boolean): Promise<void> {
    this.stopDecoderRun();

    const bridge = this.bridge;
    if (!bridge) {
      this.currentReadyResult = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
      return;
    }

    try {
      if (bridge.stopGracefully) {
        const timeoutMs = this.getGracefulStopTimeoutMs(reason);
        const waitForExit = waitForExitOverride ?? this.getGracefulStopWaitForExit(reason);
        await this.stopBridgeWithOptions(bridge, reason, timeoutMs, waitForExit);
      } else {
        bridge.stop();
      }
    } catch (error) {
      this.logger(`[AudioSession] graceful stop failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this.bridge === bridge) {
        this.detachBridgeEvents(bridge);
        this.bridge = null;
      }
      this.currentReadyResult = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
    }
  }

  private shouldDetachSharedReplacement(nextOutputMode: AudioOutputMode, nextSharedBackend: AudioSharedBackend): boolean {
    return (
      this.currentBridgeOutputMode === 'shared' &&
      this.currentBridgeSharedBackend !== 'directsound' &&
      nextOutputMode === 'shared' &&
      nextSharedBackend !== 'directsound'
    );
  }

  private detachSharedReplacementBridge(reason: string): void {
    this.stopDecoderRun();

    const bridge = this.bridge;
    if (!bridge) {
      this.currentReadyResult = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
      return;
    }

    this.bridge = null;
    this.detachBridgeEvents(bridge);
    this.currentReadyResult = null;
    this.currentBridgeOutputMode = null;
    this.currentBridgeSharedBackend = null;
    this.currentResidentOutputSampleRate = null;
    this.logger(`[AudioSession] detaching shared output for fast replacement: ${reason}`);

    void this.stopBridgeWithOptions(bridge, reason, sharedReplacementGracefulStopTimeoutMs, false).catch((error) => {
      this.logger(`[AudioSession] background shared stop failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async stopBridgeGracefully(bridge: OutputBridgeLike, reason: string): Promise<void> {
    try {
      if (bridge.stopGracefully) {
        const timeoutMs = this.getGracefulStopTimeoutMs(reason);
        const waitForExit = this.getGracefulStopWaitForExit(reason);
        await this.stopBridgeWithOptions(bridge, reason, timeoutMs, waitForExit);
      } else {
        bridge.stop();
      }
    } catch (error) {
      this.logger(`[AudioSession] graceful stop failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this.bridge === bridge) {
        this.detachBridgeEvents(bridge);
        this.bridge = null;
        this.currentReadyResult = null;
        this.currentBridgeOutputMode = null;
        this.currentBridgeSharedBackend = null;
        this.currentResidentOutputSampleRate = null;
      }
    }
  }

  private getGracefulStopTimeoutMs(reason: string): number | undefined {
    const outputMode =
      reason === 'replace-output'
        ? this.currentBridgeOutputMode
        : reason === 'output-start-failed'
          ? this.currentPlan?.outputMode ?? normalizeOutputMode(this.currentOutputSettings?.outputMode)
          : null;

    if (reason === 'replace-output' && outputMode === 'asio') {
      return undefined;
    }

    return outputMode === 'asio' ? asioFailedStartGracefulStopTimeoutMs : undefined;
  }

  private getGracefulStopWaitForExit(reason: string): boolean {
    return (
      reason === 'replace-output' ||
      reason === 'reset-audio-engine' ||
      reason === 'force-restart' ||
      reason.startsWith('windows-audio-service')
    );
  }

  private async stopBridgeWithOptions(
    bridge: OutputBridgeLike,
    reason: string,
    timeoutMs: number | undefined,
    waitForExit: boolean,
  ): Promise<void> {
    if (!bridge.stopGracefully) {
      bridge.stop();
      return;
    }

    if (timeoutMs === undefined && !waitForExit) {
      await bridge.stopGracefully(reason);
      return;
    }

    if (!waitForExit) {
      await bridge.stopGracefully(reason, timeoutMs);
      return;
    }

    await bridge.stopGracefully(reason, timeoutMs, waitForExit);
  }

  private handleError(error: Error): void {
    this.logger(`[AudioSession] ${error.message}`);
    this.stopResources();
    this.errorMessage = error.message;
    this.state = 'error';
    this.hostStatus = 'error';
    this.reportFatalAudioError(error);
    this.resetWatchdogProgress();
    this.emit('error', error, this.getStatus());
    this.emitStatus();
  }

  private assertCurrentRun(token: number): void {
    if (this.runToken !== token) {
      throw new Error('audio_session_run_cancelled');
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private emitNativeTelemetryStatus(): void {
    const now = Date.now();
    if (now - this.lastNativeTelemetryStatusEmittedAt < nativeTelemetryStatusIntervalMs) {
      return;
    }

    this.lastNativeTelemetryStatusEmittedAt = now;
    this.emitStatus();
  }

  private sanitizeLowLatencyBufferForOutputMode(
    outputMode: AudioOutputMode,
    latencyProfile: AudioLatencyProfile,
    bufferSizeFrames: number | undefined,
    source: string,
  ): number | undefined {
    const sanitized = sanitizeLowLatencyBuffer(outputMode, latencyProfile, bufferSizeFrames);
    if (sanitized.warning && sanitized.bufferSizeFrames !== bufferSizeFrames) {
      this.addOutputWarning(sanitized.warning);
      this.logger(
        `[AudioSession] ${sanitized.warning}; source=${source} outputMode=${outputMode} requestedBuffer=${bufferSizeFrames ?? 'auto'}`,
      );
    }

    return sanitized.bufferSizeFrames;
  }

  private addOutputWarning(warning: string): void {
    if (!this.outputWarnings.includes(warning)) {
      this.outputWarnings.push(warning);
    }
  }

  private addPendingOutputWarning(warning: string): void {
    if (!this.pendingOutputWarnings.includes(warning)) {
      this.pendingOutputWarnings.push(warning);
    }
  }

  private reportRecoverableAudioError(error: Error, phase: string, details?: unknown): void {
    try {
      this.reportAudioError({
        message: error.message,
        stack: error.stack,
        phase,
        severity: 'recoverable',
        details,
        audioStatus: this.getStatus(),
      });
    } catch {
      // Diagnostics must never interrupt playback recovery.
    }
  }

  private async syncEqStateForPlayback(): Promise<void> {
    try {
      await getEqBridge().syncStateToNative();
    } catch (error) {
      if (!isEqControlDisconnectError(error)) {
        throw error;
      }

      this.addOutputWarning('eq_control_sync_skipped');
      this.logger(`[AudioSession] EQ control sync skipped during playback start: ${error instanceof Error ? error.message : String(error)}`);
      this.reportRecoverableAudioError(error instanceof Error ? error : new Error(String(error)), 'eq-control-sync', {
        recovered: true,
      });
    }
  }

  private reportFatalAudioError(error: Error): void {
    try {
      this.reportAudioError({
        message: error.message,
        stack: error.stack,
        phase: this.state === 'loading' ? 'playback-start' : this.state,
        severity: 'fatal',
        details: {
          outputWarnings: this.outputWarnings,
          currentOutputSettings: this.currentOutputSettings,
          currentPlan: this.currentPlan,
        },
        audioStatus: this.getStatus(),
      });
    } catch {
      // Diagnostics must never turn an audio error into a second failure.
    }
  }

  private resetWatchdogProgress(): void {
    this.watchdogLastPositionSeconds = null;
    this.watchdogStalledChecks = 0;
  }

  private getWatchdogRecoveryKey(): string | null {
    return this.currentTrackId ?? this.currentFilePath;
  }

  private getRecentWatchdogRecoveryCount(): number {
    const key = this.getWatchdogRecoveryKey();
    if (!key) {
      return 0;
    }

    const recovery = this.watchdogRecoveries.get(key);
    if (!recovery || Date.now() - recovery.windowStartedAt > this.watchdogRecoveryWindowMs) {
      return 0;
    }

    return recovery.count;
  }

  private getWatchdogStatus(): AudioDiagnostics['watchdogStatus'] {
    if (this.watchdogRecovering || this.sharedStabilityRecovering) {
      return 'recovering';
    }

    if (this.getRecentWatchdogRecoveryCount() >= this.watchdogMaxRecoveriesPerTrack && this.watchdogMaxRecoveriesPerTrack > 0) {
      return 'limited';
    }

    return this.state === 'playing' ? 'monitoring' : 'idle';
  }

  private reserveWatchdogRecoverySlot(): number | null {
    const key = this.getWatchdogRecoveryKey();
    if (!key) {
      return null;
    }

    const now = Date.now();
    const current = this.watchdogRecoveries.get(key);
    const recovery =
      !current || now - current.windowStartedAt > this.watchdogRecoveryWindowMs
        ? { count: 0, windowStartedAt: now }
        : current;

    if (recovery.count >= this.watchdogMaxRecoveriesPerTrack) {
      this.watchdogRecoveries.set(key, recovery);
      return null;
    }

    recovery.count += 1;
    this.watchdogRecoveries.set(key, recovery);
    return recovery.count;
  }

  private tierForRecoveryCount(recoveryCount: number): SharedStabilityTier {
    return recoveryCount >= 2 ? 'emergency' : 'recovery';
  }

  private outputSettingsForRecoveryCount(recoveryCount: number, isSharedOutput: boolean): AudioOutputSettings {
    const output = { ...(this.currentOutputSettings ?? {}) };

    if (recoveryCount >= 3) {
      return {
        ...output,
        latencyProfile: 'stable',
        bufferSizeFrames: latencyProfiles.stable.bufferSizeFrames,
      };
    }

    if (isSharedOutput) {
      return {
        ...output,
        latencyProfile: recoveryCount >= 2 ? 'stable' : 'balanced',
        bufferSizeFrames: undefined,
      };
    }

    return {
      ...output,
      latencyProfile: 'lowLatency',
      bufferSizeFrames: recoveryCount >= 2 ? 2048 : 1024,
    };
  }

  private async fallbackExclusiveToSharedForInstability(positionSeconds: number): Promise<void> {
    if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
      return;
    }

    const outputMode = this.currentPlan?.outputMode ?? normalizeOutputMode(this.currentOutputSettings.outputMode);
    if (outputMode !== 'exclusive' || this.sharedStabilityRecovering) {
      return;
    }

    const filePath = this.currentFilePath;
    const trackId = this.currentTrackId;
    const probe = createProbeHint(this.currentProbe);
    const safePositionSeconds = Math.min(Math.max(0, positionSeconds), this.currentProbe.durationSeconds || Number.POSITIVE_INFINITY);
    const output = createSharedFallbackSettings(this.currentOutputSettings);
    const cause = new Error('exclusive_output_unstable');

    this.sharedStabilityRecovering = true;
    this.lastSharedStabilityRecoveryAt = new Date().toISOString();
    this.watchdogLastRecoveryAt = this.lastSharedStabilityRecoveryAt;
    this.addPendingOutputWarning('exclusive_output_unstable');
    this.addPendingOutputWarning('exclusive_output_fell_back_to_shared');
    this.logger(
      `[AudioSession] exclusive output unstable; falling back to shared output file="${redactUrlSecrets(filePath)}" position=${safePositionSeconds.toFixed(
        3,
      )}`,
    );
    this.reportRecoverableAudioError(cause, 'exclusive-instability-fallback', {
      recovered: true,
      requestedOutputSampleRate: this.currentPlan?.requestedOutputSampleRate ?? null,
      actualDeviceSampleRate: this.currentPlan?.actualDeviceSampleRate ?? null,
      nativeTelemetry: this.nativeTelemetry,
    });

    try {
      await this.playLocalFile({
        filePath,
        trackId: trackId ?? undefined,
        startSeconds: safePositionSeconds,
        output,
        probe,
        inputHeaders: this.currentInputHeaders ?? undefined,
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.sharedStabilityRecovering = false;
      this.resetWatchdogProgress();
    }
  }

  private async recoverOutputStability(reason: string, positionSeconds: number): Promise<void> {
    if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
      return;
    }

    const outputMode = this.currentPlan?.outputMode ?? normalizeOutputMode(this.currentOutputSettings.outputMode);
    const isSharedOutput = outputMode === 'shared';
    const recoveryCount = this.reserveWatchdogRecoverySlot();
    if (recoveryCount === null) {
      this.addOutputWarning(isSharedOutput ? 'shared_stability_recovery_limited' : 'native_output_stability_recovery_limited');
      this.emitStatus();
      return;
    }

    const filePath = this.currentFilePath;
    const trackId = this.currentTrackId;
    const sharedRecoveryTier = isSharedOutput ? this.tierForRecoveryCount(recoveryCount) : null;
    const output = this.outputSettingsForRecoveryCount(recoveryCount, isSharedOutput);
    const probe = createProbeHint(this.currentProbe);
    const safePositionSeconds = Math.min(Math.max(0, positionSeconds), this.currentProbe.durationSeconds || Number.POSITIVE_INFINITY);
    const targetBuffer =
      output.latencyProfile === 'stable'
        ? 'stable'
        : `${
            sharedRecoveryTier
              ? sharedStabilityProfiles[sharedRecoveryTier].bufferSizeFrames
              : normalizePositiveInteger(output.bufferSizeFrames) ?? latencyProfiles.lowLatency.bufferSizeFrames
          } frames`;

    if (sharedRecoveryTier) {
      this.sharedStabilityTier = sharedRecoveryTier;
      this.rememberSharedStabilityTier(this.currentOutputSettings, this.currentDevice, sharedRecoveryTier);
    }
    this.sharedStabilityRecovering = true;
    this.lastSharedStabilityRecoveryAt = new Date().toISOString();
    this.watchdogLastRecoveryAt = this.lastSharedStabilityRecoveryAt;
    this.addPendingOutputWarning(reason);
    if (reason === 'audio_watchdog_recovered_native_output') {
      this.addPendingOutputWarning(`${reason}:${recoveryCount}`);
    }
    if (isSharedOutput) {
      this.addPendingOutputWarning(`shared_stability_recovered:${recoveryCount}`);
    } else {
      this.addPendingOutputWarning(`native_output_stability_recovered:${recoveryCount}`);
    }
    this.addPendingOutputWarning(`native_output_buffer_recovered:${targetBuffer}`);
    this.logger(
      `[AudioSession] ${reason}; restarting ${outputMode} output buffer=${targetBuffer} file="${redactUrlSecrets(filePath)}" position=${safePositionSeconds.toFixed(
        3,
      )} recovery=${recoveryCount}`,
    );

    try {
      await this.playLocalFile({
        filePath,
        trackId: trackId ?? undefined,
        startSeconds: safePositionSeconds,
        output,
        probe,
        inputHeaders: this.currentInputHeaders ?? undefined,
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.sharedStabilityRecovering = false;
      this.resetWatchdogProgress();
    }
  }

  private async recoverFromWatchdogStall(positionSeconds: number): Promise<void> {
    if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
      this.resetWatchdogProgress();
      return;
    }

    await this.recoverOutputStability('audio_watchdog_recovered_native_output', positionSeconds);
  }
}

let defaultAudioSession: AudioSession | null = null;

export const getAudioSession = (): AudioSession => {
  defaultAudioSession ??= new AudioSession();
  return defaultAudioSession;
};
