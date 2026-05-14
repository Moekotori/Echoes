import { EventEmitter } from 'node:events';
import { Transform } from 'node:stream';
import type { Writable } from 'node:stream';
import { DeviceService } from './DeviceService';
import { DecoderPipeline } from './DecoderPipeline';
import { getEqBridge } from './EqBridge';
import { PcmLevelMeterTransform, createAudioLevelTelemetry, type PcmLevelSnapshot } from './AudioLevelMeter';
import { NativeOutputBridge, isNativeOutputBridgeAvailable } from './NativeOutputBridge';
import { PlaybackClock } from './PlaybackClock';
import type {
  AudioDeviceInfo,
  AudioDiagnostics,
  AudioLatencyProfile,
  AudioOutputMode,
  AudioOutputSettings,
  AudioPlaybackState,
  AudioProbeResult,
  AudioSessionPlayRequest,
  AudioStatus,
  DecoderRun,
  NativeBridgeReadyResult,
  NativeOutputTelemetry,
  NativeOutputStartOptions,
  SampleRatePlan,
} from './audioTypes';
import type { PlaybackSpeedMode, SharedStabilityTier } from '../../shared/types/audio';
import type { PlaybackMemory } from './PlaybackMemoryStore';
import type { AudioCrashReportPayload } from '../diagnostics/CrashReportService';

type DecoderPipelineLike = Pick<DecoderPipeline, 'probeLocalFile' | 'decodeLocalFile'>;
type DeviceServiceLike = Pick<DeviceService, 'listDevices'>;
type OutputBridgeLike = {
  writable: Writable | null;
  start: (options: NativeOutputStartOptions) => Promise<NativeBridgeReadyResult>;
  stop: () => void;
  getPositionSeconds: () => number;
  getPositionStalenessMs?: () => number | null;
  resetOutputClock?: (startSeconds?: number, playbackRate?: number) => void;
  on: (event: 'position' | 'ended' | 'error', listener: (...args: unknown[]) => void) => OutputBridgeLike;
};

type BridgeStartResult = {
  bridge: OutputBridgeLike;
  plan: SampleRatePlan;
  ready: NativeBridgeReadyResult;
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
const defaultWatchdogIntervalMs = 2000;
const defaultWatchdogStallChecks = 3;
const defaultWatchdogMaxRecoveriesPerTrack = 2;
const defaultWatchdogRecoveryWindowMs = 5 * 60 * 1000;
const watchdogPositionEpsilonSeconds = 0.05;
const sharedUnderrunWindowMs = 15_000;
const sharedUnderrunCallbackThreshold = 3;
const sharedUnderrunFramesThresholdMs = 100;

const sharedStabilityProfiles: Record<
  SharedStabilityTier,
  Pick<NativeOutputStartOptions, 'bufferSizeFrames' | 'fifoCapacityMs' | 'startupPrebufferMs' | 'startupPrebufferTimeoutMs'>
> = {
  standard: {
    bufferSizeFrames: 2048,
    fifoCapacityMs: 750,
    startupPrebufferMs: 120,
    startupPrebufferTimeoutMs: 600,
  },
  recovery: {
    bufferSizeFrames: 4096,
    fifoCapacityMs: 1000,
    startupPrebufferMs: 180,
    startupPrebufferTimeoutMs: 600,
  },
  emergency: {
    bufferSizeFrames: 8192,
    fifoCapacityMs: 1500,
    startupPrebufferMs: 250,
    startupPrebufferTimeoutMs: 600,
  },
};

const latencyProfiles: Record<AudioLatencyProfile, Pick<NativeOutputStartOptions, 'bufferSizeFrames'>> = {
  lowLatency: {
    bufferSizeFrames: 1024,
  },
  balanced: {
    bufferSizeFrames: 2048,
  },
  stable: {
    bufferSizeFrames: 8192,
  },
};

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

const isWritableUsable = (writable: Writable | null): writable is Writable =>
  Boolean(writable && !writable.destroyed && !writable.writableEnded);

const normalizeOutputMode = (value: unknown): AudioOutputMode => {
  return value === 'exclusive' || value === 'asio' ? value : 'shared';
};

const normalizeLatencyProfile = (value: unknown): AudioLatencyProfile => {
  return value === 'stable' || value === 'lowLatency' ? value : 'balanced';
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
  requestedOutputSampleRate: undefined,
});

const createSafeSharedFallbackSettings = (settings: AudioOutputSettings): AudioOutputSettings => ({
  ...settings,
  outputMode: 'shared',
  deviceIndex: undefined,
  deviceName: undefined,
  requestedOutputSampleRate: undefined,
  latencyProfile: 'stable',
  bufferSizeFrames: undefined,
});

const numericReadyField = (ready: NativeBridgeReadyResult, field: string): number | null => {
  const value = ready.device[field];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
};

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

const createProbeHint = (probe: AudioProbeResult): AudioSessionPlayRequest['probe'] => ({
  durationSeconds: probe.durationSeconds,
  fileSampleRate: probe.fileSampleRate,
  channels: probe.channels,
  codec: probe.codec,
  bitDepth: probe.bitDepth,
  bitrate: probe.bitrate,
});

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
  };
};

const defaultStatus = (nativeHostAvailable: boolean): AudioStatus => ({
  host: nativeHostAvailable ? 'not-initialized' : 'unavailable',
  state: 'idle',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: null,
  outputMode: 'shared',
  latencyProfile: 'balanced',
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
    volume: 1,
    playbackRate: 1,
    playbackSpeedMode: 'nightcore',
  };
  private state: AudioPlaybackState = 'idle';
  private hostStatus: AudioStatus['host'] = isNativeOutputBridgeAvailable() ? 'not-initialized' : 'unavailable';
  private currentProbe: AudioProbeResult | null = null;
  private currentTrackId: string | null = null;
  private currentFilePath: string | null = null;
  private currentOutputSettings: AudioOutputSettings | null = null;
  private currentPlan: SampleRatePlan | null = null;
  private currentDevice: AudioDeviceInfo | null = null;
  private currentOutputBackend: string | null = null;
  private currentOutputDeviceType: string | null = null;
  private currentOutputDeviceName: string | null = null;
  private bridge: OutputBridgeLike | null = null;
  private decoderRun: DecoderRun | null = null;
  private gainTransform: PcmVolumeTransform | null = null;
  private levelMeterTransform: PcmLevelMeterTransform | null = null;
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
  private nativeActualBufferFrames: number | null = null;
  private nativeFifoCapacityFrames: number | null = null;
  private nativeStartupPrebufferFrames: number | null = null;
  private nativeTelemetry: NativeOutputTelemetry = {
    positionFrames: 0,
    bufferedFrames: null,
    underrunCallbacks: 0,
    underrunFrames: 0,
  };
  private sharedUnderrunWindow:
    | {
        startedAt: number;
        callbacks: number;
        frames: number;
      }
    | null = null;

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
    getEqBridge().on('state', () => {
      this.emitStatus();
    });
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

  async setOutput(settings: AudioOutputSettings): Promise<AudioStatus> {
    const previousOutputSettings = this.currentOutputSettings ? { ...this.currentOutputSettings } : null;
    this.updatePositionFromOutput();
    this.outputSettings = {
      ...this.outputSettings,
      ...settings,
      outputMode: normalizeOutputMode(settings.outputMode ?? this.outputSettings.outputMode),
      latencyProfile: normalizeLatencyProfile(settings.latencyProfile ?? this.outputSettings.latencyProfile),
      bufferSizeFrames: normalizePositiveInteger(settings.bufferSizeFrames) ?? this.outputSettings.bufferSizeFrames,
      volume: Math.max(0, Math.min(1, Number(settings.volume ?? this.outputSettings.volume) || 0)),
      playbackRate: normalizePlaybackRate(settings.playbackRate ?? this.outputSettings.playbackRate),
      playbackSpeedMode: normalizePlaybackSpeedMode(settings.playbackSpeedMode ?? this.outputSettings.playbackSpeedMode),
    };

    if (this.currentOutputSettings) {
      this.currentOutputSettings = {
        ...this.currentOutputSettings,
        ...this.outputSettings,
      };
    }

    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings ?? this.outputSettings);

    const outputOnlyChangesVolume =
      previousOutputSettings !== null &&
      Object.keys(settings).every((key) => key === 'volume') &&
      this.currentOutputSettings !== null;

    if (outputOnlyChangesVolume) {
      this.gainTransform?.setVolume(this.outputSettings.volume);
      this.emitStatus();
      return this.getStatus();
    }

    if (this.state === 'paused') {
      this.runToken += 1;
      this.stopResources();
      this.currentPlan = null;
      this.currentOutputBackend = null;
      this.currentOutputDeviceType = null;
      this.currentOutputDeviceName = null;
      this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
      this.emitStatus();
      return this.getStatus();
    }

    if (this.state === 'playing' && this.currentFilePath && this.currentProbe && this.currentOutputSettings) {
      const positionSeconds = this.clock.getPositionSeconds();
      return this.playLocalFile({
        filePath: this.currentFilePath,
        trackId: this.currentTrackId ?? undefined,
        startSeconds: positionSeconds,
        output: this.currentOutputSettings,
        probe: createProbeHint(this.currentProbe),
      });
    }

    this.emitStatus();
    return this.getStatus();
  }

  async playLocalFile(request: AudioSessionPlayRequest): Promise<AudioStatus> {
    const token = this.runToken + 1;
    this.runToken = token;
    this.stopResources();
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
    this.currentTrackId = request.trackId ?? null;
    this.pausedPositionSeconds = null;
    this.currentProbe = null;
    this.currentPlan = null;
    this.currentOutputBackend = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.currentOutputSettings = {
      ...this.outputSettings,
      ...request.output,
      outputMode: normalizeOutputMode(request.output?.outputMode ?? this.outputSettings.outputMode),
      latencyProfile: normalizeLatencyProfile(request.output?.latencyProfile ?? this.outputSettings.latencyProfile),
      bufferSizeFrames: normalizePositiveInteger(request.output?.bufferSizeFrames) ?? this.outputSettings.bufferSizeFrames,
      volume: Math.max(0, Math.min(1, Number(request.output?.volume ?? this.outputSettings.volume) || 0)),
      playbackRate: normalizePlaybackRate(request.output?.playbackRate ?? this.outputSettings.playbackRate),
      playbackSpeedMode: normalizePlaybackSpeedMode(request.output?.playbackSpeedMode ?? this.outputSettings.playbackSpeedMode),
    };
    this.resetSharedStabilityForFreshPlayback(this.currentOutputSettings.outputMode ?? 'shared');
    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings);
    this.logger(
      `[AudioSession] output: mode=${this.currentOutputSettings.outputMode ?? 'shared'} device=${
        this.currentDevice ? `${this.currentDevice.index}:${this.currentDevice.name}` : 'default'
      }`,
    );
    this.emitStatus();

    try {
      const probe = createProbeFromHint(request.filePath, request.probe) ?? await this.decoder.probeLocalFile(request.filePath);
      this.assertCurrentRun(token);
      this.currentProbe = probe;
      let { bridge, plan, ready } = await this.startOutputBridgeForProbe(probe, token, request.startSeconds ?? 0);
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
        this.assertCurrentRun(token);
        this.applyReadyResult(ready);
      }
      this.logger(
        `[AudioSession] host ready: requested=${ready.requestedOutputSampleRate} actual=${
          ready.actualDeviceSampleRate ?? 'n/a'
        }`,
      );
      const activePlan = this.currentPlan ?? plan;
      const run = this.decoder.decodeLocalFile({
        filePath: request.filePath,
        startSeconds: request.startSeconds ?? 0,
        channels: probe.channels,
        decoderOutputSampleRate: activePlan.decoderOutputSampleRate,
      });

      const writable = bridge.writable;
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
    this.currentTrackId = memory.trackId;
    this.currentOutputSettings = { ...this.outputSettings };
    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings);
    this.currentProbe = createProbeFromHint(memory.filePath, {
      durationSeconds: memory.probe?.durationSeconds ?? memory.durationSeconds,
      fileSampleRate: memory.probe?.fileSampleRate,
      channels: memory.probe?.channels,
      codec: memory.probe?.codec,
      bitDepth: memory.probe?.bitDepth,
      bitrate: memory.probe?.bitrate,
    });
    this.currentPlan = null;
    this.currentOutputBackend = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.pausedPositionSeconds = positionSeconds;
    this.clock.reset(positionSeconds, null);
    this.emitStatus();
    return this.getStatus();
  }

  async play(): Promise<AudioStatus> {
    if (this.state === 'paused' && this.currentFilePath && this.currentOutputSettings) {
      if (this.bridge && isWritableUsable(this.bridge.writable) && this.currentProbe && this.currentPlan) {
        const token = this.runToken;
        const startSeconds = this.pausedPositionSeconds ?? this.clock.getPositionSeconds();
        this.pausedPositionSeconds = null;
        this.bridge.resetOutputClock?.(startSeconds, this.currentOutputSettings.playbackRate ?? 1);
        this.clock.reset(startSeconds, this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate);

        const run = this.decoder.decodeLocalFile({
          filePath: this.currentFilePath,
          startSeconds,
          channels: this.currentProbe.channels,
          decoderOutputSampleRate: this.currentPlan.decoderOutputSampleRate,
        });
        this.startDecoderRun(run, this.bridge.writable, token);
        this.state = 'playing';
        this.hostStatus = this.hostStatus === 'starting' ? 'starting' : 'ready';
        this.sharedUnderrunWindow = null;
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
      this.runToken += 1;
      const token = this.runToken;
      this.stopResources();
      this.pausedPositionSeconds = positionSeconds;
      this.clock.reset(positionSeconds, sampleRate);
      this.state = 'paused';
      this.sharedUnderrunWindow = null;
      this.resetWatchdogProgress();
      const canPrewarm = Boolean(this.currentProbe && this.currentOutputSettings && this.isNativeHostAvailable());
      this.hostStatus = canPrewarm ? 'starting' : this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
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
    this.currentPlan = null;
    this.currentDevice = null;
    this.currentOutputBackend = null;
    this.currentOutputDeviceType = null;
    this.currentOutputDeviceName = null;
    this.pausedPositionSeconds = null;
    this.errorMessage = null;
    this.outputWarnings = [];
    this.resetWatchdogProgress();
    this.clock.reset(0, null);
    this.emitStatus();
    return this.getStatus();
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
      this.stopResources();
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
      this.bridge.resetOutputClock?.(safePositionSeconds, this.currentOutputSettings.playbackRate ?? 1);
      this.attachBridgeEvents(this.bridge, token);
      this.clock.reset(safePositionSeconds, this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate);

      const run = this.decoder.decodeLocalFile({
        filePath: this.currentFilePath,
        startSeconds: safePositionSeconds,
        channels: this.currentProbe.channels,
        decoderOutputSampleRate: this.currentPlan.decoderOutputSampleRate,
      });
      this.startDecoderRun(run, this.bridge.writable, token);
      this.resetWatchdogProgress();
      this.emitStatus();
      return this.getStatus();
    }

    return this.playLocalFile({
      filePath: this.currentFilePath,
      trackId: this.currentTrackId ?? undefined,
      startSeconds: safePositionSeconds,
      output: this.currentOutputSettings,
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

    return {
      ...status,
      host: this.hostStatus,
      state: this.state,
      outputDeviceId: this.currentDevice?.id ?? null,
      outputDeviceName: this.currentOutputDeviceName ?? this.currentDevice?.name ?? null,
      outputDeviceType: this.currentOutputDeviceType,
      outputBackend: this.currentOutputBackend,
      outputMode: plan?.outputMode ?? this.outputSettings.outputMode,
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
      nativeActualBufferFrames,
      nativeOutputLatencyMs,
      nativePositionStalenessMs,
      nativeFifoCapacityFrames: this.nativeFifoCapacityFrames,
      nativeStartupPrebufferFrames: this.nativeStartupPrebufferFrames,
      nativeBufferedFrames: this.nativeTelemetry.bufferedFrames,
      nativeBufferedMs,
      nativeUnderrunCallbacks: this.nativeTelemetry.underrunCallbacks,
      nativeUnderrunFrames: this.nativeTelemetry.underrunFrames,
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
      latencyProfile: status.latencyProfile,
      outputBackend: status.outputBackend,
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
      resampling: status.resampling,
      bitPerfectCandidate: status.bitPerfectCandidate,
      sampleRateMismatch: status.sampleRateMismatch,
      sharedStabilityTier: status.sharedStabilityTier,
      nativeDeviceBufferFrames: status.nativeDeviceBufferFrames,
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
    if (this.state !== 'playing' || this.watchdogRecovering || !this.bridge || !this.currentFilePath || !this.currentOutputSettings) {
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
    this.stopResources();
  }

  private createSampleRatePlan(
    probe: AudioProbeResult,
    outputSettings: AudioOutputSettings,
    selectedDevice: AudioDeviceInfo | null,
    actualDeviceSampleRate: number | null = null,
  ): SampleRatePlan {
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const fileSampleRate = probe.fileSampleRate;
    const sourceSampleRate = fileSampleRate ?? fallbackSampleRate;
    const explicitRequestedSampleRate = normalizePositiveInteger(outputSettings.requestedOutputSampleRate);
    const sharedDeviceSampleRate =
      normalizePositiveInteger(selectedDevice?.sharedDeviceSampleRate) ??
      (outputMode === 'shared' ? normalizePositiveInteger(selectedDevice?.sampleRate) : null);
    const requestedOutputSampleRate =
      outputMode === 'shared'
        ? explicitRequestedSampleRate ?? sharedDeviceSampleRate ?? sourceSampleRate
        : explicitRequestedSampleRate ?? sourceSampleRate;
    const decoderOutputSampleRate =
      outputMode === 'shared' || outputMode === 'asio'
        ? actualDeviceSampleRate ?? requestedOutputSampleRate
        : requestedOutputSampleRate;
    const warnings: string[] = [];

    if (!fileSampleRate) {
      warnings.push('file_sample_rate_unknown_using_44100_fallback');
    }

    if (outputMode !== 'shared' && explicitRequestedSampleRate && explicitRequestedSampleRate !== sourceSampleRate) {
      warnings.push('explicit_resampling_requested_for_exclusive_output');
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

    const readyDevice = ready.device;
    this.currentOutputBackend = typeof readyDevice.backend === 'string' ? readyDevice.backend : null;
    this.currentOutputDeviceType = typeof readyDevice.deviceType === 'string' ? readyDevice.deviceType : null;
    this.currentOutputDeviceName = typeof readyDevice.deviceName === 'string' ? readyDevice.deviceName : null;
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
    );
    this.nativeDeviceBufferFrames = numericReadyField(ready, 'deviceBufferFrames');
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

  private createBridgeStartCandidates(outputSettings: AudioOutputSettings): Array<AudioDeviceInfo | null> {
    const outputMode = normalizeOutputMode(outputSettings.outputMode);
    const explicitDevice = createDeviceFromOutputSettings(outputSettings);

    if (outputMode === 'asio' && explicitDevice) {
      const candidates: Array<AudioDeviceInfo | null> = [explicitDevice];
      const knownAsioDevices = this.deviceService.listDevices().filter((device) => device.outputMode === 'asio');
      const fallbackDevice = knownAsioDevices.find((device) => device.isDefault) ?? knownAsioDevices[0] ?? null;

      if (
        fallbackDevice &&
        fallbackDevice.name !== explicitDevice.name &&
        fallbackDevice.index !== explicitDevice.index
      ) {
        candidates.push(fallbackDevice);
      }

      if (!fallbackDevice) {
        candidates.push(null);
      }

      return candidates;
    }

    if (explicitDevice) {
      return outputMode === 'shared' ? [explicitDevice, null] : [explicitDevice];
    }

    return [null];
  }

  private createNativeOutputStartOptions(options: NativeOutputStartOptions): NativeOutputStartOptions {
    const latencyProfile = normalizeLatencyProfile(options.latencyProfile);
    const latencyProfileOptions = latencyProfiles[latencyProfile];
    const explicitBufferSizeFrames = normalizePositiveInteger(options.bufferSizeFrames);
    const profileBufferSizeFrames = explicitBufferSizeFrames ?? latencyProfileOptions.bufferSizeFrames ?? 2048;

    if (options.exclusive || options.asio) {
      return {
        ...options,
        latencyProfile,
        bufferSizeFrames: profileBufferSizeFrames,
      };
    }

    const sharedProfile = sharedStabilityProfiles[this.sharedStabilityTier];

    return {
      ...options,
      latencyProfile,
      ...sharedProfile,
      bufferSizeFrames: explicitBufferSizeFrames ?? Math.max(profileBufferSizeFrames, sharedProfile.bufferSizeFrames ?? 0),
    };
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

    for (const candidate of candidates) {
      this.assertCurrentRun(token);
      this.currentDevice = candidate;
      this.currentPlan = this.createSampleRatePlan(probe, this.currentOutputSettings, this.currentDevice);
      this.logger(
        `[AudioSession] sample-rate plan: file=${this.currentPlan.fileSampleRate ?? 'n/a'} decoder=${
          this.currentPlan.decoderOutputSampleRate
        } requested=${this.currentPlan.requestedOutputSampleRate} mode=${this.currentPlan.outputMode} device=${
          candidate ? `${candidate.index}:${candidate.name}` : 'default'
        }`,
      );
      this.clock.reset(startSeconds, this.currentPlan.requestedOutputSampleRate);

      const bridge = this.createBridge();
      this.bridge = bridge;
      this.attachBridgeEvents(bridge, token);

      const outputMode = this.currentPlan.outputMode;
      const usingDefaultSharedFallback =
        outputMode === 'shared' && candidate === null && hasExplicitDeviceSelection(this.currentOutputSettings);

      try {
        const ready = await bridge.start(this.createNativeOutputStartOptions({
          requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
          channels: probe.channels,
          deviceIndex: candidate?.index ?? (usingDefaultSharedFallback ? undefined : this.currentOutputSettings.deviceIndex),
          deviceName: candidate?.name ?? (usingDefaultSharedFallback ? undefined : this.currentOutputSettings.deviceName),
          asio: outputMode === 'asio',
          exclusive: outputMode === 'exclusive',
          latencyProfile: this.currentOutputSettings.latencyProfile,
          bufferSizeFrames: this.currentOutputSettings.bufferSizeFrames,
          volume: this.currentOutputSettings.volume,
          startSeconds,
          playbackRate: this.currentOutputSettings.playbackRate,
          playbackSpeedMode: this.currentOutputSettings.playbackSpeedMode,
          durationSeconds: probe.durationSeconds,
        }));

        if (usingDefaultSharedFallback) {
          this.addOutputWarning('shared_output_fell_back_to_default_device');
          this.addOutputWarning('shared_output_recovered_to_default_device');
        }

        return { bridge, plan: this.currentPlan, ready };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger(`[AudioSession] output start failed: ${lastError.message}`);
        this.reportRecoverableAudioError(lastError, 'output-start', {
          outputMode,
          candidate: candidate ? { index: candidate.index, name: candidate.name, outputMode: candidate.outputMode } : 'default',
          requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
          channels: probe.channels,
        });
        bridge.stop();
        if (this.bridge === bridge) {
          this.bridge = null;
        }
      }
    }

    if (normalizeOutputMode(this.currentOutputSettings.outputMode) === 'exclusive') {
      const fallbackSettings = createSharedFallbackSettings(this.currentOutputSettings);
      const fallbackDevice = createDeviceFromOutputSettings(fallbackSettings);
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
          channels: probe.channels,
          deviceIndex: fallbackDevice?.index ?? fallbackSettings.deviceIndex,
          deviceName: fallbackDevice?.name ?? fallbackSettings.deviceName,
          asio: false,
          exclusive: false,
          latencyProfile: fallbackSettings.latencyProfile,
          bufferSizeFrames: fallbackSettings.bufferSizeFrames,
          volume: fallbackSettings.volume,
          startSeconds,
          playbackRate: fallbackSettings.playbackRate,
          playbackSpeedMode: fallbackSettings.playbackSpeedMode,
          durationSeconds: probe.durationSeconds,
        }));

        return { bridge, plan: this.currentPlan, ready };
      } catch (error) {
        const fallbackError = error instanceof Error ? error : new Error(String(error));
        this.logger(`[AudioSession] shared fallback failed: ${fallbackError.message}`);
        bridge.stop();
        if (this.bridge === bridge) {
          this.bridge = null;
        }
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

    this.bridge?.stop();
    this.bridge = null;

    const fallbackSettings = createSafeSharedFallbackSettings(this.currentOutputSettings);
    this.assertCurrentRun(token);
    this.currentOutputSettings = fallbackSettings;
    this.currentDevice = null;
    this.currentPlan = this.createSampleRatePlan(probe, fallbackSettings, null);
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
        channels: probe.channels,
        asio: false,
        exclusive: false,
        latencyProfile: fallbackSettings.latencyProfile,
        bufferSizeFrames: fallbackSettings.bufferSizeFrames,
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
      return { bridge, plan: this.currentPlan, ready };
    } catch (error) {
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] safe shared fallback failed: ${fallbackError.message}`);
      bridge.stop();
      if (this.bridge === bridge) {
        this.bridge = null;
      }
      throw cause;
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

    this.bridge?.stop();
    this.bridge = null;

    const fallbackSettings = createSharedFallbackSettings(this.currentOutputSettings);
    const fallbackDevice = createDeviceFromOutputSettings(fallbackSettings);
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
        channels: probe.channels,
        deviceIndex: fallbackDevice?.index ?? fallbackSettings.deviceIndex,
        deviceName: fallbackDevice?.name ?? fallbackSettings.deviceName,
        asio: false,
        exclusive: false,
        latencyProfile: fallbackSettings.latencyProfile,
        bufferSizeFrames: fallbackSettings.bufferSizeFrames,
        volume: fallbackSettings.volume,
        startSeconds,
        playbackRate: fallbackSettings.playbackRate,
        playbackSpeedMode: fallbackSettings.playbackSpeedMode,
        durationSeconds: probe.durationSeconds,
      }));

      return { bridge, plan: this.currentPlan, ready };
    } catch (error) {
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] shared fallback failed: ${fallbackError.message}`);
      bridge.stop();
      if (this.bridge === bridge) {
        this.bridge = null;
      }
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

      this.bridge?.stop();
      this.bridge = null;
      this.currentPlan = null;
      this.currentOutputBackend = null;
      this.currentOutputDeviceType = null;
      this.currentOutputDeviceName = null;
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
    bridge.on('position', (frames: unknown, telemetry?: unknown) => {
      if (this.runToken !== token) {
        return;
      }

      this.clock.updateFrames(Number(frames));
      this.watchdogLastPositionSeconds = this.clock.getPositionSeconds();
      this.watchdogStalledChecks = 0;
      if (telemetry && typeof telemetry === 'object' && !Array.isArray(telemetry)) {
        this.handleNativeTelemetry(telemetry as NativeOutputTelemetry);
      }
    });
    bridge.on('ended', () => {
      if (this.runToken !== token) {
        return;
      }

      this.state = 'ended';
      this.updatePositionFromOutput();
      this.resetWatchdogProgress();
      this.emit('ended', this.getStatus());
      this.emitStatus();
    });
    bridge.on('error', (error: unknown) => {
      if (this.runToken !== token) {
        return;
      }

      this.handleError(error instanceof Error ? error : new Error(String(error)));
    });
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
    const gainTransform = new PcmVolumeTransform(this.currentOutputSettings?.volume ?? this.outputSettings.volume);
    const speedTransform = new PcmPlaybackRateTransform(
      this.currentProbe?.channels ?? 2,
      this.currentOutputSettings?.playbackRate ?? this.outputSettings.playbackRate,
    );
    const levelMeterTransform = new PcmLevelMeterTransform((snapshot) => this.handleLevelSnapshot(snapshot));
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
    this.levelMeterTransform = levelMeterTransform;
    run.stream.pipe(gainTransform).pipe(speedTransform).pipe(levelMeterTransform).pipe(writable, { end: false });
    levelMeterTransform.once('end', signalNativeInputEnded);
    run.done.then(signalNativeInputEnded).catch((error: unknown) => {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });
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
      void this.checkSharedUnderrunRecovery();
      this.emitStatus();
    }
  }

  private async checkSharedUnderrunRecovery(): Promise<void> {
    if (
      this.state !== 'playing' ||
      this.watchdogRecovering ||
      this.sharedStabilityRecovering ||
      this.currentPlan?.outputMode !== 'shared' ||
      !this.currentFilePath ||
      !this.currentOutputSettings ||
      !this.currentProbe
    ) {
      return;
    }

    const now = Date.now();
    if (!this.sharedUnderrunWindow || now - this.sharedUnderrunWindow.startedAt > sharedUnderrunWindowMs) {
      this.sharedUnderrunWindow = {
        startedAt: now,
        callbacks: this.nativeTelemetry.underrunCallbacks,
        frames: this.nativeTelemetry.underrunFrames,
      };
      return;
    }

    const callbackDelta = this.nativeTelemetry.underrunCallbacks - this.sharedUnderrunWindow.callbacks;
    const frameDelta = this.nativeTelemetry.underrunFrames - this.sharedUnderrunWindow.frames;
    const sampleRate = this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate;
    const frameThreshold = Math.max(1, Math.round((sampleRate * sharedUnderrunFramesThresholdMs) / 1000));

    if (callbackDelta < sharedUnderrunCallbackThreshold && frameDelta < frameThreshold) {
      return;
    }

    await this.recoverSharedStability('shared_output_underrun_detected', this.clock.getPositionSeconds());
  }

  private stopDecoderRun(): void {
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
  }

  private resetNativeTelemetry(): void {
    this.nativeDeviceBufferFrames = null;
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
    this.sharedUnderrunWindow = null;
  }

  private resetSharedStabilityForFreshPlayback(outputMode: AudioOutputMode): void {
    if (outputMode === 'shared' && !this.watchdogRecovering && !this.sharedStabilityRecovering) {
      this.sharedStabilityTier = 'standard';
    }
  }

  private handleLevelSnapshot(snapshot: PcmLevelSnapshot): void {
    this.levelSnapshot = snapshot;
    if (this.state === 'playing') {
      this.emitStatus();
    }
  }

  private stopResources(): void {
    this.stopDecoderRun();

    if (this.bridge) {
      this.bridge.stop();
      this.bridge = null;
    }
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

  private async recoverSharedStability(reason: string, positionSeconds: number): Promise<void> {
    if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
      return;
    }

    const recoveryCount = this.reserveWatchdogRecoverySlot();
    if (recoveryCount === null) {
      this.addOutputWarning('shared_stability_recovery_limited');
      this.emitStatus();
      return;
    }

    const filePath = this.currentFilePath;
    const trackId = this.currentTrackId;
    const output = { ...this.currentOutputSettings, outputMode: 'shared' as const };
    const probe = createProbeHint(this.currentProbe);
    const safePositionSeconds = Math.min(Math.max(0, positionSeconds), this.currentProbe.durationSeconds || Number.POSITIVE_INFINITY);

    this.sharedStabilityTier = this.tierForRecoveryCount(recoveryCount);
    this.sharedStabilityRecovering = true;
    this.lastSharedStabilityRecoveryAt = new Date().toISOString();
    this.addPendingOutputWarning(reason);
    if (reason === 'audio_watchdog_recovered_native_output') {
      this.addPendingOutputWarning(`${reason}:${recoveryCount}`);
    }
    this.addPendingOutputWarning(`shared_stability_recovered:${recoveryCount}`);
    this.logger(
      `[AudioSession] ${reason}; restarting shared output tier=${this.sharedStabilityTier} file="${redactUrlSecrets(filePath)}" position=${safePositionSeconds.toFixed(
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

    if (this.currentPlan?.outputMode === 'shared') {
      await this.recoverSharedStability('audio_watchdog_recovered_native_output', positionSeconds);
      return;
    }

    const recoveryCount = this.reserveWatchdogRecoverySlot();
    if (recoveryCount === null) {
      this.handleError(new Error('audio_watchdog_recovery_limit_exceeded'));
      return;
    }

    const filePath = this.currentFilePath;
    const trackId = this.currentTrackId;
    const output = { ...this.currentOutputSettings };
    const probe = createProbeHint(this.currentProbe);
    const safePositionSeconds = Math.min(Math.max(0, positionSeconds), this.currentProbe.durationSeconds || Number.POSITIVE_INFINITY);

    this.watchdogRecovering = true;
    this.watchdogPendingWarning = `audio_watchdog_recovered_native_output:${recoveryCount}`;
    this.logger(
      `[AudioSession] watchdog detected stalled native output; restarting file="${redactUrlSecrets(filePath)}" position=${safePositionSeconds.toFixed(3)} recovery=${recoveryCount}`,
    );

    try {
      await this.playLocalFile({
        filePath,
        trackId: trackId ?? undefined,
        startSeconds: safePositionSeconds,
        output,
        probe,
      });
      this.watchdogLastRecoveryAt = new Date().toISOString();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.watchdogRecovering = false;
      this.resetWatchdogProgress();
    }
  }
}

let defaultAudioSession: AudioSession | null = null;

export const getAudioSession = (): AudioSession => {
  defaultAudioSession ??= new AudioSession();
  return defaultAudioSession;
};
