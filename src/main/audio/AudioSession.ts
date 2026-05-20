import { EventEmitter } from 'node:events';
import { extname } from 'node:path';
import { Transform } from 'node:stream';
import { performance } from 'node:perf_hooks';
import type { Readable, Writable } from 'node:stream';
import { DeviceService, type DeviceListOptions } from './DeviceService';
import { DecoderPipeline } from './DecoderPipeline';
import { JuceDecodePipeline } from './JuceDecodePipeline';
import { getEqBridge } from './EqBridge';
import { PcmLevelMeterTransform, createAudioLevelTelemetry, type PcmLevelSnapshot } from './AudioLevelMeter';
import { NativeOutputBridge, isNativeOutputBridgeAvailable } from './NativeOutputBridge';
import { PlaybackClock } from './PlaybackClock';
import { isCueTrackPath } from './CueSheet';
import { isDsdCodec, isDsdFilePath, isDsfFilePath, resolveDsdDopTransportSampleRate, resolveDsdPcmOutputSampleRate, shouldProbeDsdNativeSampleRate } from './DsdProbe';
import { createDsfDopStream, createDsfNativeDsdStream, readDsfDopInfo } from './DsdDopPipeline';
import { AutomixAnalyzer } from './AutomixAnalyzer';
import { getAppSettings } from '../app/appSettings';
import { calculateReplayGain, dbToLinearGain, type ReplayGainCalculation, type ReplayGainTrackData } from '../../shared/utils/replayGain';
import type { ReplayGainMode } from '../../shared/types/appSettings';
import {
  createEstimatedAutomixAnalysis,
  planAutomixTransition,
  type AutomixTransitionPlan,
  type TrackTransitionAnalysis,
} from './AutomixPlanner';
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
  AudioSessionPlayPcmStreamRequest,
  AudioSessionPrepareLocalFileRequest,
  AudioSessionAutomixNextTrack,
  AudioSessionGaplessNextTrack,
  AudioSessionPlayRequest,
  AudioStatus,
  DecoderRun,
  FfmpegToolchainDiagnostics,
  NativeHostNotificationEvent,
  NativeBridgeReadyResult,
  NativeOutputTelemetry,
  NativeOutputStartOptions,
  PcmDecodeRequest,
  SampleRatePlan,
} from './audioTypes';
import type { ActiveDsdOutputMode, AudioDsdOutputMode, PlaybackSpeedMode, SharedStabilityTier } from '../../shared/types/audio';
import type { PlaybackMemory } from './PlaybackMemoryStore';
import type { AudioCrashReportPayload } from '../diagnostics/CrashReportService';

type DecoderPipelineLike = Pick<DecoderPipeline, 'probeLocalFile' | 'decodeLocalFile'> & {
  decodeAutomixPair?: DecoderPipeline['decodeAutomixPair'];
  decodeGaplessSequence?: DecoderPipeline['decodeGaplessSequence'];
  getToolchainInfo?: () => FfmpegToolchainDiagnostics;
};
type JuceDecodePipelineLike = Pick<JuceDecodePipeline, 'decodeLocalFile'>;
type AutomixAnalyzerLike = Pick<AutomixAnalyzer, 'analyze'>;
type DeviceServiceLike = Pick<DeviceService, 'listDevices'> &
  Partial<Pick<DeviceService, 'listDevicesAsync' | 'refresh' | 'invalidateCache' | 'openAsioControlPanel'>>;
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
  prepareAutomixPlan?: (plan: AutomixTransitionPlan, options: { fadeStartSeconds: number; sampleRate?: number | null }) => void;
  createAutomixNextWritable?: () => Writable;
  cancelAutomix?: () => void;
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

type StabilityRecoveryOptions = {
  runToken?: number;
  sharedStabilityRecoveryClaimed?: boolean;
};

const normalizeStabilityRecoveryOptions = (
  callerTokenOrOptions: number | StabilityRecoveryOptions | undefined,
): StabilityRecoveryOptions => {
  if (typeof callerTokenOrOptions === 'number') {
    return { runToken: callerTokenOrOptions };
  }

  return callerTokenOrOptions ?? {};
};

type PreparedLocalProbeUse = {
  probe: AudioSessionPrepareLocalFileRequest['probe'];
  ageMs: number;
};

type ActiveAutomixState = {
  enabled: boolean;
  gapless: boolean;
  nextTransitionIndex: number;
  fromTrackId: string | null;
  nextTrackId: string;
  nextFilePath: string;
  nextInputHeaders: Record<string, string> | null;
  nextProbe: AudioProbeResult;
  nextReplayGain: ReplayGainTrackData | null;
  transitionSeconds: number;
  transitionStartSeconds: number;
  compositeStartSeconds: number;
  compositeDurationSeconds: number;
  plan: AutomixTransitionPlan;
  transitions: ActiveAutomixTransition[];
};

type ActiveAutomixTransition = {
  fromTrackId: string | null;
  nextTrackId: string;
  nextFilePath: string;
  nextInputHeaders: Record<string, string> | null;
  nextProbe: AudioProbeResult;
  nextReplayGain: ReplayGainTrackData | null;
  transitionSeconds: number;
  transitionStartSeconds: number;
  trackStartOutputSeconds: number;
  trackStartSourceSeconds: number;
  plan: AutomixTransitionPlan;
};

type NativeAutomixPlayback = {
  currentRun: DecoderRun;
  nextRun: DecoderRun;
  state: ActiveAutomixState;
};

export type AudioErrorRecoveryHandler = (error: Error, status: AudioStatus) => boolean;

export type AudioSessionDependencies = {
  decoder?: DecoderPipelineLike;
  juceDecoder?: JuceDecodePipelineLike;
  automixAnalyzer?: AutomixAnalyzerLike;
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
const sharedStabilityMemoryTtlMs = 30 * 60 * 1000;
const asioFailedStartGracefulStopTimeoutMs = 1_000;
const asioUnavailableCooldownMs = 30_000;
const nativeHostNotificationEvents = new Set<NativeHostNotificationEvent['event']>([
  'default_device_changed',
  'device_state_changed',
  'device_removed',
  'audio_session_disconnected',
]);
const inactiveDeviceReasons = new Set(['disabled', 'not_present', 'unplugged', 'removed']);
type ReplayGainAudioSettings = {
  replayGainEnabled: boolean;
  replayGainMode: ReplayGainMode;
  replayGainPreampDb: number;
  replayGainPreventClipping: boolean;
};

const defaultReplayGainAudioSettings: ReplayGainAudioSettings = {
  replayGainEnabled: false,
  replayGainMode: 'track',
  replayGainPreampDb: 0,
  replayGainPreventClipping: true,
};

const getReplayGainAudioSettings = (): ReplayGainAudioSettings => {
  try {
    const settings = getAppSettings();
    return {
      replayGainEnabled: settings.replayGainEnabled === true,
      replayGainMode: settings.replayGainMode ?? 'track',
      replayGainPreampDb: settings.replayGainPreampDb ?? 0,
      replayGainPreventClipping: settings.replayGainPreventClipping !== false,
    };
  } catch {
    return defaultReplayGainAudioSettings;
  }
};

const isNativeHostNotificationEvent = (event: unknown): event is NativeHostNotificationEvent => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return false;
  }

  const name = (event as { event?: unknown }).event;
  return typeof name === 'string' && nativeHostNotificationEvents.has(name as NativeHostNotificationEvent['event']);
};
const isAudioSessionRunCancelledError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes('audio_session_run_cancelled');
};
const isLivePcmSourcePath = (filePath: string | null | undefined): boolean =>
  typeof filePath === 'string' && filePath.startsWith('airplay-receiver:');
const sharedReplacementGracefulStopTimeoutMs = 750;
const releaseExclusiveOnPauseGracefulStopTimeoutMs = 1_500;
const releaseExclusiveOnPausePlayWaitTimeoutMs = 900;
const decoderStopTimeoutMs = 500;
const minReliableAsioSampleRate = 44_100;
type SharedOutputProfile = Pick<
  NativeOutputStartOptions,
  'bufferSizeFrames' | 'fifoCapacityMs' | 'startupPrebufferMs' | 'startupPrebufferTimeoutMs'
>;

const sharedLowLatencyProfile: SharedOutputProfile = {
  bufferSizeFrames: 2048,
  fifoCapacityMs: 420,
  startupPrebufferMs: 120,
  startupPrebufferTimeoutMs: 450,
};

const sharedStabilityProfiles: Record<SharedStabilityTier, SharedOutputProfile> = {
  standard: {
    bufferSizeFrames: 4096,
    fifoCapacityMs: 750,
    startupPrebufferMs: 180,
    startupPrebufferTimeoutMs: 650,
  },
  recovery: {
    bufferSizeFrames: 8192,
    fifoCapacityMs: 1200,
    startupPrebufferMs: 240,
    startupPrebufferTimeoutMs: 800,
  },
  emergency: {
    bufferSizeFrames: 8192,
    fifoCapacityMs: 1500,
    startupPrebufferMs: 300,
    startupPrebufferTimeoutMs: 1000,
  },
};

const stableSharedProfile: SharedOutputProfile = {
  bufferSizeFrames: 8192,
  fifoCapacityMs: 1500,
  startupPrebufferMs: 300,
  startupPrebufferTimeoutMs: 1000,
};

const directSoundSharedProfile: SharedOutputProfile = {
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

const isLocalJuceDecodePilotPath = (value: string): boolean => {
  if (isHttpPlaybackUrl(value) || isCueTrackPath(value)) {
    return false;
  }

  const extension = extname(value).toLowerCase();
  return extension === '.wav' || extension === '.wave' || extension === '.flac' || extension === '.mp3';
};

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
  return value === 'exclusive' || value === 'asio' || value === 'system' ? value : 'shared';
};

const normalizeSharedBackend = (value: unknown): AudioSharedBackend => {
  return value === 'windows' || value === 'directsound' ? value : 'auto';
};

const normalizeDsdOutputMode = (value: unknown): AudioDsdOutputMode => (value === 'dop' ? 'dop' : 'pcm');

const isResidentOutputMode = (value: unknown): boolean => {
  const mode = normalizeOutputMode(value);
  return mode === 'exclusive' || mode === 'asio';
};

const canReuseResidentOutputBridge = (outputMode: AudioOutputMode): boolean => {
  // ASIO drivers are more fragile across long-lived multi-session hosts, so rotate them per track.
  return outputMode !== 'asio';
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
  dsdOutputMode: 'pcm',
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
  dsdOutputMode: 'pcm',
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

const shouldAttemptJuceDecode = (
  filePath: string,
  inputHeaders: Record<string, string> | null | undefined,
  probe: AudioProbeResult,
  plan: SampleRatePlan,
  outputSettings: AudioOutputSettings,
): boolean =>
  outputSettings.useJuceDecode === true &&
  isLocalJuceDecodePilotPath(filePath) &&
  !inputHeaders &&
  probe.fileSampleRate !== null &&
  probe.fileSampleRate === plan.decoderOutputSampleRate &&
  probe.channels >= 1 &&
  probe.channels <= 2;

const dsdDopSupportedOutputModes = new Set<AudioOutputMode>(['exclusive', 'asio']);

const getDsdDopDisabledWarning = (
  filePath: string,
  inputHeaders: Record<string, string> | null | undefined,
  probe: AudioProbeResult,
  outputSettings: AudioOutputSettings,
  outputMode: AudioOutputMode,
): string | null => {
  if (normalizeDsdOutputMode(outputSettings.dsdOutputMode) !== 'dop') {
    return null;
  }

  if (!isDsdFilePath(filePath) && !isDsdCodec(probe.codec)) {
    return null;
  }

  if (!isDsfFilePath(filePath) || inputHeaders || isCueTrackPath(filePath)) {
    return 'dsd_dop_format_unsupported';
  }

  if (!dsdDopSupportedOutputModes.has(outputMode)) {
    return 'dsd_dop_requires_exclusive_or_asio';
  }

  if (probe.channels < 1 || probe.channels > 2 || !resolveDsdDopTransportSampleRate(probe)) {
    return 'dsd_dop_format_unsupported';
  }

  if (Math.abs((outputSettings.playbackRate ?? 1) - 1) > 1e-6 || Math.abs((outputSettings.volume ?? 1) - 1) > 1e-6) {
    return 'dsd_dop_disabled_by_dsp';
  }

  const eqState = getEqBridge().getState();
  const channelBalanceState = getEqBridge().getChannelBalanceState();
  if (eqState.enabled || channelBalanceState.enabled) {
    return 'dsd_dop_disabled_by_dsp';
  }

  return null;
};

const shouldAttemptDsdDop = (
  filePath: string,
  inputHeaders: Record<string, string> | null | undefined,
  probe: AudioProbeResult,
  outputSettings: AudioOutputSettings,
  outputMode: AudioOutputMode,
): boolean => getDsdDopDisabledWarning(filePath, inputHeaders, probe, outputSettings, outputMode) === null &&
  normalizeDsdOutputMode(outputSettings.dsdOutputMode) === 'dop';

const isDsdPlaybackCandidate = (filePath: string, probe: AudioProbeResult): boolean =>
  isDsdFilePath(filePath) || isDsdCodec(probe.codec);

const getAsioNativeDsdDisabledWarning = (
  filePath: string,
  inputHeaders: Record<string, string> | null | undefined,
  probe: AudioProbeResult,
  outputSettings: AudioOutputSettings,
  outputMode: AudioOutputMode,
): string | null => {
  if (outputSettings.asioNativeDsdExperimentalEnabled !== true) {
    return null;
  }

  if (!isDsdPlaybackCandidate(filePath, probe)) {
    return null;
  }

  if (normalizeDsdOutputMode(outputSettings.dsdOutputMode) !== 'dop') {
    return 'asio_native_dsd_requires_dop';
  }

  if (outputMode !== 'asio') {
    return 'asio_native_dsd_requires_asio';
  }

  const dopDisabledWarning = getDsdDopDisabledWarning(filePath, inputHeaders, probe, outputSettings, outputMode);
  if (dopDisabledWarning) {
    return `asio_native_dsd_blocked:${dopDisabledWarning}`;
  }

  if (!probe.fileSampleRate || ![2_822_400, 5_644_800, 11_289_600].includes(probe.fileSampleRate)) {
    return 'asio_native_dsd_format_unsupported';
  }

  return null;
};

const shouldAttemptAsioNativeDsd = (
  filePath: string,
  inputHeaders: Record<string, string> | null | undefined,
  probe: AudioProbeResult,
  outputSettings: AudioOutputSettings,
  outputMode: AudioOutputMode,
): boolean =>
  outputSettings.asioNativeDsdExperimentalEnabled === true &&
  isDsfFilePath(filePath) &&
  getAsioNativeDsdDisabledWarning(filePath, inputHeaders, probe, outputSettings, outputMode) === null;

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

const clampAutomixTransitionSeconds = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(2, Math.min(12, value))
    : 8;

const createAutomixAnalysisHint = (probe: AudioSessionPlayRequest['probe'] | undefined) => ({
  bpm: probe?.bpm ?? null,
  bpmConfidence: probe?.bpmConfidence ?? null,
  beatOffsetMs: probe?.beatOffsetMs ?? null,
});

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
  if (outputMode === 'system') {
    return null;
  }

  const outputModeKey = outputMode === 'asio' ? 'asio' : 'shared';
  const deviceIndex = Number.isInteger(Number(settings.deviceIndex)) ? Number(settings.deviceIndex) : -1;

  return {
    id: deviceIndex >= 0 ? `${outputModeKey}:${deviceIndex}` : `${outputModeKey}:${settings.deviceName ?? 'selected'}`,
    index: deviceIndex,
    name: settings.deviceName ?? 'Selected output',
    outputMode: outputModeKey,
    sampleRate: outputMode === 'asio' ? normalizePositiveInteger(settings.requestedOutputSampleRate) : null,
    sharedDeviceSampleRate: null,
    isDefault: false,
    asioOutputChannelStart: outputModeKey === 'asio' && Number.isInteger(Number(settings.asioOutputChannelStart))
      ? Math.max(0, Number(settings.asioOutputChannelStart))
      : undefined,
  };
};

type AudioOutputRestartSnapshot = {
  outputMode: AudioOutputMode;
  sharedBackend: AudioSharedBackend;
  deviceIndex: number | null;
  deviceName: string | null;
  asioOutputChannelStart: number | null;
  requestedOutputSampleRate: number | null;
  latencyProfile: AudioLatencyProfile;
  bufferSizeFrames: number | null;
  useJuceOutput: boolean;
  useJuceDecode: boolean;
  dsdOutputMode: AudioDsdOutputMode;
  asioNativeDsdExperimentalEnabled: boolean;
  asioUnavailableFallbackEnabled: boolean;
  soxrFallbackEnabled: boolean;
  releaseExclusiveOnPauseExperimentalEnabled: boolean;
};

const createOutputRestartSnapshot = (settings: AudioOutputSettings): AudioOutputRestartSnapshot => {
  const outputMode = normalizeOutputMode(settings.outputMode);
  const sharedBackend = outputMode === 'shared' ? normalizeSharedBackend(settings.sharedBackend) : 'auto';

  return {
    outputMode,
    sharedBackend,
    deviceIndex: Number.isInteger(Number(settings.deviceIndex)) ? Number(settings.deviceIndex) : null,
    deviceName: typeof settings.deviceName === 'string' && settings.deviceName.trim() ? settings.deviceName : null,
    asioOutputChannelStart:
      outputMode === 'asio' && Number.isInteger(Number(settings.asioOutputChannelStart))
        ? Math.max(0, Number(settings.asioOutputChannelStart))
        : null,
    requestedOutputSampleRate: outputMode === 'shared' ? null : normalizePositiveInteger(settings.requestedOutputSampleRate),
    latencyProfile: normalizeLatencyProfile(settings.latencyProfile),
    bufferSizeFrames: normalizePositiveInteger(settings.bufferSizeFrames),
    useJuceOutput: settings.useJuceOutput === true,
    useJuceDecode: settings.useJuceDecode === true,
    dsdOutputMode: normalizeDsdOutputMode(settings.dsdOutputMode),
    asioNativeDsdExperimentalEnabled: settings.asioNativeDsdExperimentalEnabled === true,
    asioUnavailableFallbackEnabled: settings.asioUnavailableFallbackEnabled === true,
    soxrFallbackEnabled: settings.soxrFallbackEnabled !== false,
    releaseExclusiveOnPauseExperimentalEnabled: settings.releaseExclusiveOnPauseExperimentalEnabled === true,
  };
};

const outputRestartSettingsEqual = (left: AudioOutputSettings, right: AudioOutputSettings): boolean => {
  const leftSnapshot = createOutputRestartSnapshot(left);
  const rightSnapshot = createOutputRestartSnapshot(right);

  return (Object.keys(leftSnapshot) as Array<keyof AudioOutputRestartSnapshot>).every((key) => leftSnapshot[key] === rightSnapshot[key]);
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
  useJuceDecodeRequested: false,
  activeDecodeBackendImpl: null,
  dsdOutputModeRequested: 'pcm',
  activeDsdOutputMode: null,
  dsdNativeSampleRate: null,
  dsdTransportSampleRate: null,
  latencyProfile: 'lowLatency',
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  replayGainEnabled: false,
  replayGainMode: 'track',
  replayGainAppliedDb: 0,
  replayGainPreventedClipping: false,
  automix: {
    enabled: false,
    mode: 'off',
    active: false,
    transitionSeconds: null,
    transitionStartedAtSeconds: null,
    nextTrackId: null,
    transitionMode: null,
    fallbackReason: null,
    beatAligned: false,
    skipIntroSilence: false,
    nextStartSeconds: null,
    overlapSeconds: null,
    advanceAtSeconds: null,
    plannedTrackCount: 0,
    nextTransitionIndex: 0,
  },
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

  constructor(volume: number, private readonly maxGain = 1) {
    super();
    this.gain = Math.max(0, Math.min(this.maxGain, volume));
  }

  setVolume(volume: number): void {
    this.gain = Math.max(0, Math.min(this.maxGain, volume));
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
  private playbackRate: number;
  private remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private frameCursor = 0;

  constructor(channels: number, playbackRate: number) {
    super();
    this.frameBytes = Math.max(1, Math.round(channels)) * 4;
    this.playbackRate = normalizePlaybackRate(playbackRate);
  }

  setPlaybackRate(playbackRate: number): void {
    this.playbackRate = normalizePlaybackRate(playbackRate);
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    if (Math.abs(this.playbackRate - 1) < 1e-6 && this.remainder.length === 0 && Math.abs(this.frameCursor) < 1e-6) {
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

class PcmLinearResamplerTransform extends Transform {
  private readonly channels: number;
  private readonly frameBytes: number;
  private readonly step: number;
  private remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private previousFrame: Float32Array | null = null;
  private sourceCursor = 0;

  constructor(channels: number, sourceSampleRate: number, targetSampleRate: number) {
    super();
    this.channels = Math.max(1, Math.min(8, Math.round(channels)));
    this.frameBytes = this.channels * 4;
    this.step = sourceSampleRate / targetSampleRate;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    const input = this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    const completeBytes = input.length - (input.length % this.frameBytes);
    this.remainder = completeBytes < input.length ? Buffer.from(input.subarray(completeBytes)) : Buffer.alloc(0);

    if (completeBytes <= 0) {
      callback();
      return;
    }

    const inputFrames = completeBytes / this.frameBytes;
    const historyFrames = inputFrames + (this.previousFrame ? 1 : 0);
    if (historyFrames < 2) {
      this.previousFrame = this.readFrame(input, 0);
      callback();
      return;
    }

    const estimatedOutputFrames = Math.max(1, Math.ceil(historyFrames / this.step) + 2);
    const output = Buffer.allocUnsafe(estimatedOutputFrames * this.frameBytes);
    let outputFrames = 0;

    while (this.sourceCursor + 1 < historyFrames) {
      const leftFrame = Math.floor(this.sourceCursor);
      const rightFrame = leftFrame + 1;
      const fraction = this.sourceCursor - leftFrame;
      for (let channel = 0; channel < this.channels; channel += 1) {
        const left = this.readHistorySample(input, leftFrame, channel);
        const right = this.readHistorySample(input, rightFrame, channel);
        output.writeFloatLE(left + (right - left) * fraction, (outputFrames * this.channels + channel) * 4);
      }
      outputFrames += 1;
      this.sourceCursor += this.step;
    }

    this.sourceCursor -= historyFrames - 1;
    this.previousFrame = this.readFrame(input, inputFrames - 1);
    callback(null, output.subarray(0, outputFrames * this.frameBytes));
  }

  override _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    this.remainder = Buffer.alloc(0);
    this.previousFrame = null;
    this.sourceCursor = 0;
    callback();
  }

  private readHistorySample(input: Buffer, frameIndex: number, channel: number): number {
    if (this.previousFrame) {
      if (frameIndex === 0) {
        return this.previousFrame[channel] ?? 0;
      }
      return input.readFloatLE(((frameIndex - 1) * this.channels + channel) * 4);
    }

    return input.readFloatLE((frameIndex * this.channels + channel) * 4);
  }

  private readFrame(input: Buffer, frameIndex: number): Float32Array {
    const frame = new Float32Array(this.channels);
    for (let channel = 0; channel < this.channels; channel += 1) {
      frame[channel] = input.readFloatLE((frameIndex * this.channels + channel) * 4);
    }
    return frame;
  }
}

export class AudioSession extends EventEmitter {
  private readonly decoder: DecoderPipelineLike;
  private readonly juceDecoder: JuceDecodePipelineLike;
  private readonly automixAnalyzer: AutomixAnalyzerLike;
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
    useJuceOutput: true,
    useJuceDecode: false,
    dsdOutputMode: 'pcm',
    asioNativeDsdExperimentalEnabled: false,
    asioUnavailableFallbackEnabled: false,
    soxrFallbackEnabled: true,
    releaseExclusiveOnPauseExperimentalEnabled: false,
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
  private currentUseJuceDecodeRequested = false;
  private currentDecodeBackendImpl: string | null = null;
  private currentDsdOutputModeRequested: AudioDsdOutputMode = 'pcm';
  private currentActiveDsdOutputMode: ActiveDsdOutputMode = null;
  private currentDsdNativeSampleRate: number | null = null;
  private currentDsdTransportSampleRate: number | null = null;
  private currentReplayGain: ReplayGainTrackData | null = null;
  private currentReplayGainCalculation: ReplayGainCalculation = {
    appliedDb: 0,
    selectedGainDb: null,
    selectedPeak: null,
    preventedClipping: false,
    active: false,
  };
  private currentReadyResult: NativeBridgeReadyResult | null = null;
  private currentBridgeOutputMode: AudioOutputMode | null = null;
  private currentBridgeSharedBackend: AudioSharedBackend | null = null;
  private currentResidentOutputSampleRate: number | null = null;
  private currentResamplerEngine: AudioResamplerEngine = 'default';
  private currentResamplerFallbackActive = false;
  private activeAutomix: ActiveAutomixState | null = null;
  private bridge: OutputBridgeLike | null = null;
  private bridgeStopInProgress: Promise<void> | null = null;
  private attachedBridgeEvents: { bridge: OutputBridgeLike; listeners: BridgeEventListeners } | null = null;
  private nativeHostNotificationQueue: Promise<void> = Promise.resolve();
  private decoderRun: DecoderRun | null = null;
  private decoderStopInProgress: Promise<void> | null = null;
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
  private exclusiveReleaseOnPausePromise: Promise<void> | null = null;
  private exclusiveReleasedOnPause = false;
  private exclusiveResumeAfterRelease = false;
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
  private lastSharedStabilityRecoveryKey: string | null = null;
  private audioErrorRecoveryHandler: AudioErrorRecoveryHandler | null = null;
  private readonly eqStateListener = (): void => {
    this.emitStatus();
  };

  constructor(dependencies: AudioSessionDependencies = {}) {
    super();
    this.logger = dependencies.logger ?? defaultLogger;
    this.decoder = dependencies.decoder ?? new DecoderPipeline({ logger: this.logger });
    this.juceDecoder = dependencies.juceDecoder ?? new JuceDecodePipeline({ logger: this.logger });
    this.automixAnalyzer = dependencies.automixAnalyzer ?? new AutomixAnalyzer({ logger: this.logger });
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

  setAudioErrorRecoveryHandler(handler: AudioErrorRecoveryHandler | null): void {
    this.audioErrorRecoveryHandler = handler;
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
      this.lastSharedStabilityRecoveryKey = null;
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
      useJuceDecode: settings.useJuceDecode ?? this.outputSettings.useJuceDecode ?? false,
      dsdOutputMode: normalizeDsdOutputMode(settings.dsdOutputMode ?? this.outputSettings.dsdOutputMode),
      asioNativeDsdExperimentalEnabled: settings.asioNativeDsdExperimentalEnabled ?? this.outputSettings.asioNativeDsdExperimentalEnabled ?? false,
      asioUnavailableFallbackEnabled: settings.asioUnavailableFallbackEnabled ?? this.outputSettings.asioUnavailableFallbackEnabled ?? false,
      soxrFallbackEnabled: settings.soxrFallbackEnabled ?? this.outputSettings.soxrFallbackEnabled ?? true,
      releaseExclusiveOnPauseExperimentalEnabled:
        settings.releaseExclusiveOnPauseExperimentalEnabled ??
        this.outputSettings.releaseExclusiveOnPauseExperimentalEnabled ??
        false,
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
      this.currentUseJuceDecodeRequested = this.currentOutputSettings.useJuceDecode === true;
      this.currentDsdOutputModeRequested = normalizeDsdOutputMode(this.currentOutputSettings.dsdOutputMode);
    } else {
      this.currentUseJuceOutputRequested = this.outputSettings.useJuceOutput === true;
      this.currentUseJuceDecodeRequested = this.outputSettings.useJuceDecode === true;
      this.currentDsdOutputModeRequested = normalizeDsdOutputMode(this.outputSettings.dsdOutputMode);
    }

    this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings ?? this.outputSettings);

    if (nextOutputMode === 'system') {
      this.runToken += 1;
      await this.stopResourcesGracefully('system-output-mode', true);
      this.resetSessionAfterForcedStop();
      this.hostStatus = 'ready';
      return this.getStatus();
    }

    const outputOnlyChangesVolume =
      previousOutputSettings !== null &&
      Object.keys(settings).every((key) => key === 'volume') &&
      this.currentOutputSettings !== null;
    const outputOnlyChangesPlaybackSpeed =
      previousOutputSettings !== null &&
      Object.keys(settings).every((key) => key === 'playbackRate' || key === 'playbackSpeedMode') &&
      this.currentOutputSettings !== null &&
      (this.state !== 'playing' || this.speedTransform !== null);

    if (outputOnlyChangesVolume) {
      this.bridge?.setVolume?.(this.outputSettings.volume);
      this.gainTransform?.setVolume(this.bridge?.setVolume ? 1 : this.outputSettings.volume);
      this.levelMeterTransform?.setGain(this.bridge?.setVolume ? this.outputSettings.volume : 1);
      this.emitStatus();
      return this.getStatus();
    }

    if (outputOnlyChangesPlaybackSpeed) {
      const positionSeconds = this.clock.getPositionSeconds();
      this.speedTransform?.setPlaybackRate(this.outputSettings.playbackRate);
      this.bridge?.resetOutputClock?.(positionSeconds, this.outputSettings.playbackRate);
      this.clock.reset(positionSeconds, this.currentPlan?.actualDeviceSampleRate ?? this.currentPlan?.requestedOutputSampleRate ?? null);
      this.emitStatus();
      return this.getStatus();
    }

    const outputDoesNotRequireRestart =
      previousOutputSettings !== null &&
      this.currentOutputSettings !== null &&
      outputRestartSettingsEqual(previousOutputSettings, this.currentOutputSettings);
    const playbackSpeedChanged =
      previousOutputSettings !== null &&
      this.currentOutputSettings !== null &&
      (normalizePlaybackRate(previousOutputSettings.playbackRate) !== normalizePlaybackRate(this.currentOutputSettings.playbackRate) ||
        normalizePlaybackSpeedMode(previousOutputSettings.playbackSpeedMode) !==
          normalizePlaybackSpeedMode(this.currentOutputSettings.playbackSpeedMode));
    const playbackSpeedCanUpdateInPlace = this.speedTransform !== null;

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
      this.currentUseJuceDecodeRequested = this.outputSettings.useJuceDecode === true;
      this.currentDsdOutputModeRequested = normalizeDsdOutputMode(this.outputSettings.dsdOutputMode);
      this.currentActiveDsdOutputMode = null;
      this.currentDsdNativeSampleRate = null;
      this.currentDsdTransportSampleRate = null;
      this.currentDecodeBackendImpl = null;
      this.currentReadyResult = null;
      this.currentBridgeSharedBackend = null;
      this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
      this.emitStatus();
      return this.getStatus();
    }

    if (this.state === 'playing' && this.currentFilePath && this.currentProbe && this.currentOutputSettings) {
      if (outputDoesNotRequireRestart && (!playbackSpeedChanged || playbackSpeedCanUpdateInPlace)) {
        this.bridge?.setVolume?.(this.outputSettings.volume);
        this.gainTransform?.setVolume(this.bridge?.setVolume ? 1 : this.outputSettings.volume);
        this.levelMeterTransform?.setGain(this.bridge?.setVolume ? this.outputSettings.volume : 1);

        if (playbackSpeedChanged) {
          const positionSeconds = this.clock.getPositionSeconds();
          this.speedTransform?.setPlaybackRate(this.outputSettings.playbackRate);
          this.bridge?.resetOutputClock?.(positionSeconds, this.outputSettings.playbackRate);
          this.clock.reset(positionSeconds, this.currentPlan?.actualDeviceSampleRate ?? this.currentPlan?.requestedOutputSampleRate ?? null);
        }

        this.emitStatus();
        return this.getStatus();
      }

      if (this.isCurrentLivePcmStream()) {
        this.currentOutputSettings = previousOutputSettings;
        this.currentDevice = createDeviceFromOutputSettings(this.currentOutputSettings ?? this.outputSettings);
        this.currentUseJuceOutputRequested = this.currentOutputSettings?.useJuceOutput === true;
        this.currentUseJuceDecodeRequested = false;
        this.currentDsdOutputModeRequested = 'pcm';
        this.addOutputWarning('live_pcm_output_restart_skipped');
        this.logger(
          `[AudioSession] output change saved globally but live PCM stream cannot be restarted source="${redactUrlSecrets(
            this.currentFilePath,
          )}"`,
        );
        this.emitStatus();
        return this.getStatus();
      }

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
    const decoderStop = this.stopDecoderRun();
    if (decoderStop) {
      await decoderStop;
    }
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
    this.exclusiveReleasedOnPause = false;
    this.watchdogPendingWarning = null;
    this.pendingOutputWarnings = [];
    this.resetWatchdogProgress();
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.currentFilePath = request.filePath;
    this.currentInputHeaders = request.inputHeaders ?? null;
    this.currentTrackId = request.trackId ?? null;
    this.currentReplayGain = request.replayGain ?? null;
    this.currentReplayGainCalculation = {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak: null,
      preventedClipping: false,
      active: false,
    };
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
    this.activeAutomix = null;
    this.currentDecodeBackendImpl = null;
    this.currentOutputSettings = this.createOutputSettingsForRequest(request.output);
    if (normalizeOutputMode(this.currentOutputSettings.outputMode) === 'system') {
      this.state = 'error';
      this.hostStatus = 'ready';
      this.errorMessage = 'system_audio_requires_renderer';
      this.addOutputWarning('system_audio_requires_renderer');
      this.emitStatus();
      throw new Error('system_audio_requires_renderer');
    }
    this.currentUseJuceOutputRequested = this.currentOutputSettings.useJuceOutput === true;
    this.currentUseJuceDecodeRequested = this.currentOutputSettings.useJuceDecode === true;
    this.currentDsdOutputModeRequested = normalizeDsdOutputMode(this.currentOutputSettings.dsdOutputMode);
    this.currentActiveDsdOutputMode = null;
    this.currentDsdNativeSampleRate = null;
    this.currentDsdTransportSampleRate = null;
    this.currentDevice = this.resolvePlanDeviceForSettings(this.currentOutputSettings);
    this.clock.reset(request.startSeconds ?? 0, null);
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
      let activePlan = this.currentPlan ?? plan;
      this.logAudioTransition(activePlan, {
        hostReused,
        hostRestartReason,
        preparedLocalProbeUsed: Boolean(preparedProbe),
        preparedLocalProbeAgeMs: preparedProbe?.ageMs ?? null,
      });
      if (this.exclusiveResumeAfterRelease && activePlan.outputMode === 'exclusive') {
        this.exclusiveResumeAfterRelease = false;
      }
      if (activePlan.dsdOutputMode === 'native') {
        try {
          const info = await readDsfDopInfo(request.filePath);
          const nativeDsdStream = createDsfNativeDsdStream(request.filePath, info, request.startSeconds ?? 0);
          this.currentDsdNativeSampleRate = info.nativeSampleRate;
          this.currentDsdTransportSampleRate = null;
          this.currentActiveDsdOutputMode = 'native';
          this.currentDecodeBackendImpl = 'dsf-bitstream-native-dsd';
          this.assertCurrentRun(token);
          const sessionId = bridge.beginSession?.({
            startSeconds: request.startSeconds ?? 0,
            playbackRate: 1,
            durationSeconds: probe.durationSeconds,
          });
          const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
          if (!writable) {
            throw new Error('native output bridge did not expose a writable native DSD stream');
          }

          this.startBitstreamRun(nativeDsdStream, writable, token);
          this.state = 'playing';
          this.hostStatus = 'ready';
          this.resetWatchdogProgress();
          this.emitStatus();
          return this.getStatus();
        } catch (error) {
          if (this.runToken !== token) {
            throw new Error('audio_session_run_cancelled');
          }

          if (isAudioSessionRunCancelledError(error)) {
            throw error;
          }

          const nativeDsdError = error instanceof Error ? error : new Error(String(error));
          this.addOutputWarning(`asio_native_dsd_fell_back_to_dop:${nativeDsdError.message.slice(0, 96)}`);
          await this.stopResourcesGracefully('asio-native-dsd-fallback-to-dop');
          this.currentOutputSettings = {
            ...this.currentOutputSettings,
            asioNativeDsdExperimentalEnabled: false,
          };
          this.currentActiveDsdOutputMode = null;
          this.currentDsdNativeSampleRate = null;
          this.currentDsdTransportSampleRate = null;
          ({ bridge, plan, ready, hostReused, hostRestartReason } = await this.startOutputBridgeForProbe(
            probe,
            token,
            request.startSeconds ?? 0,
          ));
          this.assertCurrentRun(token);
          this.applyReadyResult(ready);
          activePlan = this.currentPlan ?? plan;
        }
      }
      if (activePlan.dsdOutputMode === 'dop') {
        try {
          const info = await readDsfDopInfo(request.filePath);
          const dopStream = createDsfDopStream(request.filePath, info, request.startSeconds ?? 0);
          this.currentDsdNativeSampleRate = info.nativeSampleRate;
          this.currentDsdTransportSampleRate = info.transportSampleRate;
          this.currentActiveDsdOutputMode = 'dop';
          this.currentDecodeBackendImpl = 'dsf-bitstream-dop';
          this.assertCurrentRun(token);
          const sessionId = bridge.beginSession?.({
            startSeconds: request.startSeconds ?? 0,
            playbackRate: 1,
            durationSeconds: probe.durationSeconds,
          });
          const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
          if (!writable) {
            throw new Error('native output bridge did not expose a writable DoP stream');
          }

          this.startBitstreamRun(dopStream, writable, token);
          this.state = 'playing';
          this.hostStatus = 'ready';
          this.resetWatchdogProgress();
          this.emitStatus();
          return this.getStatus();
        } catch (error) {
          if (this.runToken !== token) {
            throw new Error('audio_session_run_cancelled');
          }

          if (isAudioSessionRunCancelledError(error)) {
            throw error;
          }

          const dopError = error instanceof Error ? error : new Error(String(error));
          this.addOutputWarning(`dsd_dop_fell_back_to_pcm:${dopError.message.slice(0, 96)}`);
          await this.stopResourcesGracefully('dsd-dop-fallback-to-pcm');
          this.currentOutputSettings = {
            ...this.currentOutputSettings,
            dsdOutputMode: 'pcm',
          };
          this.currentActiveDsdOutputMode = null;
          this.currentDsdNativeSampleRate = null;
          this.currentDsdTransportSampleRate = null;
          ({ bridge, plan, ready, hostReused, hostRestartReason } = await this.startOutputBridgeForProbe(
            probe,
            token,
            request.startSeconds ?? 0,
          ));
          this.assertCurrentRun(token);
          this.applyReadyResult(ready);
        }
      }
      const pcmPlan = this.currentPlan ?? plan;
      const nativeAutomix = await this.createNativeAutomixPlayback(
        request,
        probe,
        pcmPlan,
        this.currentOutputSettings,
        bridge,
      );
      const nativeGapless = nativeAutomix
        ? null
        : await this.createNativeGaplessPlayback(
            request,
            probe,
            pcmPlan,
            this.currentOutputSettings,
            bridge,
          );
      const automixRun = nativeAutomix
        ? null
        : nativeGapless
          ? null
          : await this.createAutomixDecoderRunForPlayback(request, probe, pcmPlan, this.currentOutputSettings);
      const gaplessRun = nativeAutomix || nativeGapless || automixRun
        ? null
        : await this.createGaplessDecoderRunForPlayback(request, probe, pcmPlan, this.currentOutputSettings);
      const activeChainedState = nativeAutomix?.state ?? nativeGapless?.state ?? automixRun?.state ?? gaplessRun?.state ?? null;
      const playbackRun = automixRun
        ? automixRun.run
        : gaplessRun
          ? gaplessRun.run
          : await this.createDecoderRunForPlayback(
              request.filePath,
              request.inputHeaders,
              request.startSeconds ?? 0,
              probe,
              pcmPlan,
              this.currentOutputSettings,
            );
      this.activeAutomix = activeChainedState;

      await this.syncEqStateForPlayback();
      this.assertCurrentRun(token);
      const sessionId = bridge.beginSession?.({
        startSeconds: activeChainedState?.compositeStartSeconds ?? request.startSeconds ?? 0,
        playbackRate: this.currentOutputSettings.playbackRate,
        durationSeconds: activeChainedState?.compositeDurationSeconds ?? probe.durationSeconds,
      });
      const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
      if (!writable) {
        throw new Error('native output bridge did not expose a writable PCM stream');
      }

      if (nativeAutomix || nativeGapless) {
        const nextWritable = bridge.createAutomixNextWritable?.();
        if (!nextWritable || !bridge.prepareAutomixPlan) {
          throw new Error('native output bridge did not expose an Automix deck');
        }

        const nativeChainedState = (nativeAutomix ?? nativeGapless)!.state;
        const transition = nativeChainedState.transitions[0];
        bridge.prepareAutomixPlan(nativeChainedState.plan, {
          fadeStartSeconds: Math.max(0, transition?.transitionStartSeconds ?? nativeChainedState.transitionStartSeconds),
          sampleRate: pcmPlan.actualDeviceSampleRate ?? pcmPlan.requestedOutputSampleRate,
        });
        this.startNativeAutomixRuns(
          (nativeAutomix ?? nativeGapless)!.currentRun,
          (nativeAutomix ?? nativeGapless)!.nextRun,
          writable,
          nextWritable,
          token,
          nativeGapless ? 'native-gapless-dual-deck' : 'native-automix-dual-deck',
        );
      } else if (playbackRun) {
        this.startDecoderRun(playbackRun, writable, token);
      }

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

  async playPcmStream(request: AudioSessionPlayPcmStreamRequest): Promise<AudioStatus> {
    const token = this.runToken + 1;
    this.runToken = token;
    const decoderStop = this.stopDecoderRun();
    if (decoderStop) {
      await decoderStop;
    }
    this.logger(
      `[AudioSession] playPcmStream: source="${redactUrlSecrets(request.sourceId)}" trackId=${request.trackId ?? 'n/a'} sampleRate=${
        request.sampleRate
      } channels=${request.channels}`,
    );

    this.state = 'loading';
    this.hostStatus = 'starting';
    this.errorMessage = null;
    this.outputWarnings = [
      ...(this.watchdogPendingWarning ? [this.watchdogPendingWarning] : []),
      ...this.pendingOutputWarnings,
    ];
    this.exclusiveReleasedOnPause = false;
    this.watchdogPendingWarning = null;
    this.pendingOutputWarnings = [];
    this.resetWatchdogProgress();
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.currentFilePath = request.sourceId;
    this.currentInputHeaders = null;
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
    this.currentDecodeBackendImpl = 'airplay-raop-pcm';
    this.currentOutputSettings = this.createOutputSettingsForRequest(request.output);
    this.currentUseJuceOutputRequested = this.currentOutputSettings.useJuceOutput === true;
    this.currentUseJuceDecodeRequested = false;
    this.currentDsdOutputModeRequested = 'pcm';
    this.currentActiveDsdOutputMode = null;
    this.currentDsdNativeSampleRate = null;
    this.currentDsdTransportSampleRate = null;
    this.currentDevice = this.resolvePlanDeviceForSettings(this.currentOutputSettings);
    this.resetSharedStabilityForFreshPlayback(this.currentOutputSettings.outputMode ?? 'shared', this.currentOutputSettings, this.currentDevice);
    this.emitStatus();

    try {
      const sampleRate = Math.max(8_000, Math.round(request.sampleRate));
      const channels = Math.max(1, Math.min(8, Math.round(request.channels)));
      const probe: AudioProbeResult = {
        filePath: request.sourceId,
        durationSeconds: Math.max(0, request.durationSeconds ?? 0),
        fileSampleRate: sampleRate,
        channels,
        codec: 'pcm-f32le',
        bitDepth: 32,
        bitrate: sampleRate * channels * 32,
      };
      this.currentProbe = probe;
      let { bridge, plan, ready, hostReused, hostRestartReason } = await this.startOutputBridgeForProbe(probe, token, 0);
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
          0,
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

      const activePlan = this.currentPlan ?? plan;
      this.logAudioTransition(activePlan, {
        hostReused,
        hostRestartReason,
        preparedLocalProbeUsed: false,
        preparedLocalProbeAgeMs: null,
      });
      await this.syncEqStateForPlayback();
      this.assertCurrentRun(token);
      const sessionId = bridge.beginSession?.({
        startSeconds: 0,
        playbackRate: this.currentOutputSettings.playbackRate,
        durationSeconds: probe.durationSeconds,
      });
      const writable = bridge.createSessionWritable?.(sessionId) ?? bridge.writable;
      if (!writable) {
        throw new Error('native output bridge did not expose a writable PCM stream');
      }

      const runDone = new Promise<void>((resolve, reject) => {
        request.stream.once('end', resolve);
        request.stream.once('close', resolve);
        request.stream.once('error', reject);
      });
      const run: DecoderRun = {
        stream: request.stream,
        stop: () => request.stream.destroy(),
        done: runDone,
        decoderBackendImpl: 'airplay-raop-pcm',
        resamplerEngine: 'default',
        resamplerFallbackActive: false,
      };
      this.currentDecodeBackendImpl = 'airplay-raop-pcm';
      this.startDecoderRun(run, writable, token);

      this.state = 'playing';
      this.hostStatus = 'ready';
      this.resetWatchdogProgress();
      this.emitStatus();
      return this.getStatus();
    } catch (error) {
      request.stream.destroy();
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
    this.currentUseJuceDecodeRequested = this.outputSettings.useJuceDecode === true;
    this.currentDsdOutputModeRequested = normalizeDsdOutputMode(this.outputSettings.dsdOutputMode);
    this.currentActiveDsdOutputMode = null;
    this.currentDsdNativeSampleRate = null;
    this.currentDsdTransportSampleRate = null;
    this.currentDecodeBackendImpl = null;
    this.pausedPositionSeconds = positionSeconds;
    this.clock.reset(positionSeconds, null);
    this.emitStatus();
    return this.getStatus();
  }

  async play(): Promise<AudioStatus> {
    await this.waitForExclusiveReleaseOnPause('play');

    if (this.state === 'paused' && this.currentFilePath && this.currentOutputSettings) {
      if (this.isCurrentLivePcmStream()) {
        this.addOutputWarning('live_pcm_resume_skipped');
        this.logger(
          `[AudioSession] play requested for live PCM stream; waiting for sender to resume source="${redactUrlSecrets(
            this.currentFilePath,
          )}"`,
        );
        this.emitStatus();
        return this.getStatus();
      }

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
        this.runToken += 1;
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

        const run = await this.createDecoderRunForPlayback(
          this.currentFilePath,
          this.currentInputHeaders,
          startSeconds,
          currentProbe,
          currentPlan,
          this.currentOutputSettings,
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

      this.exclusiveResumeAfterRelease = this.exclusiveReleasedOnPause;
      this.exclusiveReleasedOnPause = false;
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

  private shouldReleaseExclusiveOnPause(): boolean {
    return Boolean(
      this.state === 'playing' &&
      this.currentOutputSettings?.releaseExclusiveOnPauseExperimentalEnabled === true &&
      normalizeOutputMode(this.currentPlan?.outputMode ?? this.currentOutputSettings.outputMode) === 'exclusive' &&
      this.bridge &&
      this.currentReadyResult,
    );
  }

  private async waitForExclusiveReleaseOnPause(reason: string): Promise<void> {
    const release = this.exclusiveReleaseOnPausePromise;
    if (!release) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        release,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, releaseExclusiveOnPausePlayWaitTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (this.exclusiveReleaseOnPausePromise) {
      this.addOutputWarning('exclusive_release_on_pause_still_finishing');
      this.logger(`[AudioSession] continuing ${reason} while exclusive pause release finishes in background`);
    }
  }

  private async releaseExclusiveOutputOnPause(
    bridge: OutputBridgeLike,
    token: number,
    positionSeconds: number,
    sampleRate: number | null,
  ): Promise<void> {
    const decoderStop = this.stopDecoderRun();
    if (decoderStop) {
      await decoderStop;
    }
    try {
      bridge.endSession?.();
    } catch {
      // Best-effort idle transition before releasing exclusive WASAPI.
    }

    this.detachBridgeEvents(bridge);
    this.pausedPositionSeconds = positionSeconds;
    this.clock.reset(positionSeconds, sampleRate);
    this.state = 'paused';
    this.hostStatus = 'starting';
    this.nativeUnderrunWindow = null;
    this.resetWatchdogProgress();
    this.exclusiveReleasedOnPause = true;
    this.addOutputWarning('exclusive_released_on_pause');
    this.emitStatus();

    const release = this.releaseExclusiveBridgeOnPause(bridge, token);
    this.exclusiveReleaseOnPausePromise = release;
    try {
      await release;
    } finally {
      if (this.exclusiveReleaseOnPausePromise === release) {
        this.exclusiveReleaseOnPausePromise = null;
      }
    }
  }

  private async releaseExclusiveBridgeOnPause(bridge: OutputBridgeLike, token: number): Promise<void> {
    const reason = 'release-exclusive-on-pause';
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    try {
      await Promise.race([
        this.stopBridgeWithOptions(bridge, reason, releaseExclusiveOnPauseGracefulStopTimeoutMs, true),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new Error('release_exclusive_on_pause_timeout'));
          }, releaseExclusiveOnPauseGracefulStopTimeoutMs + 250);
        }),
      ]);
    } catch (error) {
      if (timedOut) {
        this.addOutputWarning('exclusive_release_on_pause_forced_stop');
      } else {
        this.addOutputWarning('exclusive_release_on_pause_failed');
      }
      this.logger(`[AudioSession] exclusive release on pause cleanup failed: ${
        error instanceof Error ? error.message : String(error)
      }`);
      try {
        bridge.stop();
      } catch {
        // The host may have already exited or be force-killed by stopGracefully.
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (this.bridge === bridge && this.runToken === token) {
        this.bridge = null;
        this.currentReadyResult = null;
        this.currentBridgeOutputMode = null;
        this.currentBridgeSharedBackend = null;
        this.currentResidentOutputSampleRate = null;
        this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
        this.emitStatus();
      }
    }
  }

  async pause(): Promise<AudioStatus> {
    if (this.state === 'playing' || this.state === 'loading') {
      if (this.state === 'playing') {
        this.updatePositionFromOutput();
      }
      const positionSeconds = this.state === 'playing' ? this.clock.getPositionSeconds() : this.pausedPositionSeconds ?? 0;
      const sampleRate = this.currentPlan?.actualDeviceSampleRate ?? this.currentPlan?.requestedOutputSampleRate ?? null;
      const shouldReleaseExclusiveOnPause = this.shouldReleaseExclusiveOnPause();
      const keepResidentBridge = Boolean(
        this.state === 'playing' &&
        !shouldReleaseExclusiveOnPause &&
        isResidentOutputMode(this.currentPlan?.outputMode ?? this.currentOutputSettings?.outputMode) &&
        this.bridge &&
        this.currentReadyResult,
      );
      this.runToken += 1;
      this.activeAutomix = null;
      const token = this.runToken;
      if (shouldReleaseExclusiveOnPause && this.bridge) {
        await this.releaseExclusiveOutputOnPause(this.bridge, token, positionSeconds, sampleRate);
        return this.getStatus();
      }
      if (keepResidentBridge) {
        const decoderStop = this.stopDecoderRun();
        if (decoderStop) {
          await decoderStop;
        }
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
    this.exclusiveReleaseOnPausePromise = null;
    this.exclusiveReleasedOnPause = false;
    this.exclusiveResumeAfterRelease = false;
    this.stopResources();
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.state = 'stopped';
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.currentProbe = null;
    this.currentTrackId = null;
    this.currentReplayGain = null;
    this.currentReplayGainCalculation = {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak: null,
      preventedClipping: false,
      active: false,
    };
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
    this.currentDecodeBackendImpl = null;
    this.activeAutomix = null;
    this.currentUseJuceOutputRequested = false;
    this.currentUseJuceDecodeRequested = false;
    this.currentDsdOutputModeRequested = 'pcm';
    this.currentActiveDsdOutputMode = null;
    this.currentDsdNativeSampleRate = null;
    this.currentDsdTransportSampleRate = null;
    this.currentReadyResult = null;
    this.currentBridgeOutputMode = null;
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
    this.lastSharedStabilityRecoveryKey = null;
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
    this.exclusiveReleaseOnPausePromise = null;
    this.exclusiveReleasedOnPause = false;
    this.exclusiveResumeAfterRelease = false;
    this.resetLevelMeter();
    this.resetNativeTelemetry();
    this.state = 'stopped';
    this.hostStatus = this.isNativeHostAvailable() ? 'not-initialized' : 'unavailable';
    this.currentProbe = null;
    this.currentTrackId = null;
    this.currentReplayGain = null;
    this.currentReplayGainCalculation = {
      appliedDb: 0,
      selectedGainDb: null,
      selectedPeak: null,
      preventedClipping: false,
      active: false,
    };
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

    if (this.isCurrentLivePcmStream()) {
      this.addOutputWarning('live_pcm_seek_skipped');
      this.logger(
        `[AudioSession] seek ignored for live PCM stream source="${redactUrlSecrets(this.currentFilePath)}" position=${Math.max(
          0,
          Number(positionSeconds) || 0,
        ).toFixed(3)}`,
      );
      this.emitStatus();
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
      const keepExclusiveReleased =
        this.exclusiveReleasedOnPause &&
        this.currentOutputSettings.releaseExclusiveOnPauseExperimentalEnabled === true &&
        normalizeOutputMode(this.currentOutputSettings.outputMode) === 'exclusive';
      const canPrewarm = !keepExclusiveReleased && Boolean(this.currentProbe && this.currentOutputSettings && this.isNativeHostAvailable());
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
      const decoderStop = this.stopDecoderRun();
      if (decoderStop) {
        await decoderStop;
      }
      await this.syncEqStateForPlayback();
      this.assertCurrentRun(token);

      const activeDsdOutputMode = this.currentPlan.dsdOutputMode;
      let bitstreamRun: { stream: Readable; decodeBackendImpl: string; nativeSampleRate: number; transportSampleRate: number | null } | null = null;
      if (activeDsdOutputMode === 'dop' || activeDsdOutputMode === 'native') {
        try {
          const info = await readDsfDopInfo(this.currentFilePath);
          bitstreamRun = {
            stream: activeDsdOutputMode === 'native'
              ? createDsfNativeDsdStream(this.currentFilePath, info, safePositionSeconds)
              : createDsfDopStream(this.currentFilePath, info, safePositionSeconds),
            decodeBackendImpl: activeDsdOutputMode === 'native' ? 'dsf-bitstream-native-dsd' : 'dsf-bitstream-dop',
            nativeSampleRate: info.nativeSampleRate,
            transportSampleRate: activeDsdOutputMode === 'dop' ? info.transportSampleRate : null,
          };
        } catch (error) {
          if (this.runToken !== token || isAudioSessionRunCancelledError(error)) {
            return this.getStatus();
          }

          this.handleError(error instanceof Error ? error : new Error(String(error)));
          return this.getStatus();
        }
      }

      const sessionId = this.bridge.beginSession?.({
        startSeconds: safePositionSeconds,
        playbackRate: this.currentOutputSettings.playbackRate ?? 1,
        durationSeconds: this.currentProbe.durationSeconds,
      });
      this.bridge.resetOutputClock?.(safePositionSeconds, this.currentOutputSettings.playbackRate ?? 1);
      this.attachBridgeEvents(this.bridge, token);
      this.clock.reset(safePositionSeconds, this.currentPlan.actualDeviceSampleRate ?? this.currentPlan.requestedOutputSampleRate);

      if (bitstreamRun) {
        const writable = this.bridge.createSessionWritable?.(sessionId) ?? this.bridge.writable;
        if (!writable) {
          throw new Error('native output bridge did not expose a writable DSD bitstream');
        }
        this.currentActiveDsdOutputMode = activeDsdOutputMode;
        this.currentDsdNativeSampleRate = bitstreamRun.nativeSampleRate;
        this.currentDsdTransportSampleRate = bitstreamRun.transportSampleRate;
        this.currentDecodeBackendImpl = bitstreamRun.decodeBackendImpl;
        this.startBitstreamRun(bitstreamRun.stream, writable, token);
        this.resetWatchdogProgress();
        this.emitStatus();
        return this.getStatus();
      }

      const run = await this.createDecoderRunForPlayback(
        this.currentFilePath,
        this.currentInputHeaders,
        safePositionSeconds,
        this.currentProbe,
        this.currentPlan,
        this.currentOutputSettings,
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
    const automixActive = this.activeAutomix !== null;
    const settings = getReplayGainAudioSettings();
    const replayGainCalculation = this.currentReplayGainCalculation;
    const replayGainActive = replayGainCalculation.active && Math.abs(replayGainCalculation.appliedDb) >= 0.001;
    const dspActive = eqState.enabled || channelBalanceState.enabled || automixActive || replayGainActive;
    const bitPerfectDisabledReason = eqState.enabled
      ? 'eq_enabled'
      : channelBalanceState.enabled
        ? 'channel_balance_enabled'
        : automixActive
          ? 'automix_enabled'
          : replayGainActive
            ? 'replay_gain_enabled'
            : null;
    const warnings = [...(plan?.warnings ?? [])];
    for (const warning of this.outputWarnings) {
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }

    if (eqState.enabled) {
      warnings.push('eq_enabled_bit_perfect_disabled');
    } else if (channelBalanceState.enabled) {
      warnings.push('channel_balance_bit_perfect_disabled');
    } else if (automixActive) {
      warnings.push('automix_enabled_bit_perfect_disabled');
    } else if (replayGainActive) {
      warnings.push('replay_gain_bit_perfect_disabled');
    }

    if (settings.replayGainEnabled === true && (this.currentActiveDsdOutputMode === 'dop' || this.currentActiveDsdOutputMode === 'native')) {
      warnings.push('replay_gain_disabled_by_dsd_direct');
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
    const rawPositionSeconds = this.clock.getPositionSeconds();
    const currentAutomixTransition =
      this.activeAutomix && this.activeAutomix.nextTransitionIndex > 0
        ? this.activeAutomix.transitions[this.activeAutomix.nextTransitionIndex - 1]
        : null;
    const automixPositionSeconds =
      currentAutomixTransition
        ? Math.max(
            0,
            rawPositionSeconds - (this.activeAutomix?.compositeStartSeconds ?? 0) - currentAutomixTransition.trackStartOutputSeconds +
              currentAutomixTransition.trackStartSourceSeconds,
          )
        : rawPositionSeconds;
    const automixDurationSeconds = this.currentProbe?.durationSeconds ?? 0;

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
      useJuceDecodeRequested: this.currentOutputSettings ? this.currentUseJuceDecodeRequested : this.outputSettings.useJuceDecode === true,
      activeDecodeBackendImpl: this.currentDecodeBackendImpl,
      dsdOutputModeRequested: this.currentOutputSettings
        ? this.currentDsdOutputModeRequested
        : normalizeDsdOutputMode(this.outputSettings.dsdOutputMode),
      activeDsdOutputMode: this.currentActiveDsdOutputMode,
      dsdNativeSampleRate: this.currentDsdNativeSampleRate,
      dsdTransportSampleRate: this.currentDsdTransportSampleRate,
      latencyProfile: normalizeLatencyProfile(this.currentOutputSettings?.latencyProfile ?? this.outputSettings.latencyProfile),
      volume: this.outputSettings.volume,
      playbackRate: this.outputSettings.playbackRate,
      playbackSpeedMode: this.outputSettings.playbackSpeedMode,
      replayGainEnabled: settings.replayGainEnabled === true,
      replayGainMode: settings.replayGainMode ?? 'track',
      replayGainAppliedDb: replayGainCalculation.appliedDb,
      replayGainPreventedClipping: replayGainCalculation.preventedClipping,
      automix: {
        enabled: automixActive,
        mode: this.activeAutomix
          ? this.activeAutomix.nextTransitionIndex > 0
            ? 'transitioning'
            : 'armed'
          : 'off',
        active: automixActive,
        transitionSeconds: this.activeAutomix?.transitionSeconds ?? null,
        transitionStartedAtSeconds: this.activeAutomix?.transitionStartSeconds ?? null,
        nextTrackId: this.activeAutomix?.nextTrackId ?? null,
        transitionMode: this.activeAutomix?.plan.mode ?? null,
        fallbackReason: this.activeAutomix?.plan.fallbackReason ?? null,
        beatAligned: this.activeAutomix?.plan.beatAligned ?? false,
        skipIntroSilence: this.activeAutomix?.plan.skipIntroSilence ?? false,
        engine: this.currentDecodeBackendImpl === 'native-gapless-dual-deck'
          ? 'nativeGapless'
          : this.currentDecodeBackendImpl === 'ffmpeg-gapless'
            ? 'ffmpegGapless'
            : this.currentDecodeBackendImpl === 'native-automix-dual-deck'
              ? 'nativeDualDeck'
              : this.currentDecodeBackendImpl === 'ffmpeg-automix'
                ? 'ffmpegPremix'
                : automixActive
                  ? 'fallback'
                  : null,
        tempoRatio: this.activeAutomix?.plan.tempoRatio ?? null,
        nextStartSeconds: this.activeAutomix?.plan.nextStartSeconds ?? null,
        overlapSeconds: this.activeAutomix?.plan.overlapSeconds ?? null,
        advanceAtSeconds: this.activeAutomix?.plan.advanceAtSeconds ?? null,
        plannedTrackCount: this.activeAutomix ? this.activeAutomix.transitions.length + 1 : 0,
        nextTransitionIndex: this.activeAutomix?.nextTransitionIndex ?? 0,
      },
      currentFilePath: this.currentFilePath,
      currentTrackId: this.currentTrackId,
      durationSeconds: automixDurationSeconds,
      positionSeconds: automixPositionSeconds,
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
      useJuceDecodeRequested: status.useJuceDecodeRequested,
      activeDecodeBackendImpl: status.activeDecodeBackendImpl,
      dsdOutputModeRequested: status.dsdOutputModeRequested,
      activeDsdOutputMode: status.activeDsdOutputMode,
      dsdNativeSampleRate: status.dsdNativeSampleRate,
      dsdTransportSampleRate: status.dsdTransportSampleRate,
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
    const token = this.runToken;

    try {
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

      await this.recoverFromWatchdogStall(positionSeconds, token);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
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
      asioNativeDsdExperimentalEnabled: output?.asioNativeDsdExperimentalEnabled ?? this.outputSettings.asioNativeDsdExperimentalEnabled ?? false,
      asioUnavailableFallbackEnabled: output?.asioUnavailableFallbackEnabled ?? this.outputSettings.asioUnavailableFallbackEnabled ?? false,
      useJuceDecode: output?.useJuceDecode ?? this.outputSettings.useJuceDecode ?? false,
      dsdOutputMode: normalizeDsdOutputMode(output?.dsdOutputMode ?? this.outputSettings.dsdOutputMode),
      soxrFallbackEnabled: output?.soxrFallbackEnabled ?? this.outputSettings.soxrFallbackEnabled ?? true,
      releaseExclusiveOnPauseExperimentalEnabled:
        output?.releaseExclusiveOnPauseExperimentalEnabled ??
        this.outputSettings.releaseExclusiveOnPauseExperimentalEnabled ??
        false,
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
  ): PcmDecodeRequest {
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

  private createFfmpegDecoderRun(request: PcmDecodeRequest): DecoderRun {
    this.currentDecodeBackendImpl = 'ffmpeg';
    return this.decoder.decodeLocalFile(request);
  }

  private async createDecoderRunForPlayback(
    filePath: string,
    inputHeaders: Record<string, string> | null | undefined,
    startSeconds: number,
    probe: AudioProbeResult,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
  ): Promise<DecoderRun> {
    const request = this.createDecodeRequest(
      filePath,
      inputHeaders,
      startSeconds,
      probe.channels,
      plan,
      outputSettings,
    );

    this.currentUseJuceDecodeRequested = outputSettings.useJuceDecode === true;

    if (!shouldAttemptJuceDecode(filePath, inputHeaders, probe, plan, outputSettings)) {
      return this.createFfmpegDecoderRun(request);
    }

    let juceRun: DecoderRun | null = null;
    try {
      juceRun = this.juceDecoder.decodeLocalFile(request);
      await juceRun.ready;
      this.currentDecodeBackendImpl = juceRun.decoderBackendImpl ?? 'juce-audio-format';
      return juceRun;
    } catch (error) {
      juceRun?.done.catch(() => undefined);
      juceRun?.stop();
      this.addOutputWarning('juce_decode_fell_back_to_ffmpeg');
      const fallbackError = error instanceof Error ? error : new Error(String(error));
      this.logger(`[AudioSession] JUCE decode failed; falling back to FFmpeg: ${fallbackError.message}`);
      this.reportRecoverableAudioError(fallbackError, 'juce-decode-fallback', {
        recovered: true,
        requestedOutputSampleRate: plan.requestedOutputSampleRate,
        actualDeviceSampleRate: plan.actualDeviceSampleRate,
      });
      return this.createFfmpegDecoderRun(request);
    }
  }

  private async resolveAutomixNextProbe(next: AudioSessionAutomixNextTrack): Promise<AudioProbeResult> {
    let nextProbe = createProbeFromHint(next.filePath, next.probe);
    if (!nextProbe || shouldProbeDsdNativeSampleRate(nextProbe)) {
      if (isHttpPlaybackUrl(next.filePath)) {
        nextProbe = createStreamProbeFromHint(next.filePath, next.probe);
      } else {
        const probed = await this.decoder.probeLocalFile(next.filePath);
        nextProbe = createProbeFromHint(next.filePath, mergeProbeHints(createProbeHint(probed), next.probe)) ?? probed;
      }
    }

    return nextProbe;
  }

  private getAutomixCandidateTrackId(track: AudioSessionAutomixNextTrack | null | undefined): string | null {
    if (!track) {
      return null;
    }

    return track.trackId ?? track.filePath;
  }

  private async resolveAutomixAnalysis(
    filePath: string,
    inputHeaders: Record<string, string> | undefined,
    probe: AudioProbeResult,
    hint: AudioSessionPlayRequest['probe'] | undefined,
    provided: TrackTransitionAnalysis | null | undefined,
  ): Promise<TrackTransitionAnalysis> {
    if (provided) {
      return provided;
    }

    const analysisHint = createAutomixAnalysisHint(hint);
    const estimated = createEstimatedAutomixAnalysis(probe, analysisHint);
    try {
      const analysisPromise = this.automixAnalyzer.analyze({
        filePath,
        probe,
        headers: inputHeaders,
        hint: analysisHint,
      });
      const timeoutPromise = new Promise<TrackTransitionAnalysis>((resolve) => {
        const timer = setTimeout(() => resolve(estimated), 1800);
        timer.unref?.();
      });
      return await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error) {
      this.logger(`[AudioSession] Automix analysis fallback: ${error instanceof Error ? error.message : String(error)}`);
      return estimated;
    }
  }

  private createGaplessTransitionPlan(
    currentStartSeconds: number,
    currentProbe: AudioProbeResult,
    nextProbe: AudioProbeResult,
  ): AutomixTransitionPlan | null {
    const currentDuration = Math.max(0, currentProbe.durationSeconds);
    const nextDuration = Math.max(0, nextProbe.durationSeconds);
    if (currentDuration - currentStartSeconds < 0.25 || nextDuration < 0.25) {
      return null;
    }

    return {
      mode: 'gaplessFallback',
      currentStartSeconds,
      currentEndSeconds: currentDuration,
      currentFadeStartSeconds: currentDuration,
      nextStartSeconds: 0,
      overlapSeconds: 0.001,
      curve: 'tri',
      currentGainDb: 0,
      nextGainDb: 0,
      tempoRatio: 1,
      advanceAtSeconds: currentDuration,
      skipIntroSilence: false,
      beatAligned: false,
      fallbackReason: null,
    };
  }

  private createGaplessTransition(
    fromTrackId: string | null,
    next: AudioSessionGaplessNextTrack,
    nextProbe: AudioProbeResult,
    transitionStartSeconds: number,
    trackStartSourceSeconds: number,
    plan: AutomixTransitionPlan,
  ): ActiveAutomixTransition {
    return {
      fromTrackId,
      nextTrackId: next.trackId ?? next.filePath,
      nextFilePath: next.filePath,
      nextInputHeaders: next.inputHeaders ?? null,
      nextProbe,
      nextReplayGain: next.replayGain ?? null,
      transitionSeconds: 0,
      transitionStartSeconds,
      trackStartOutputSeconds: transitionStartSeconds,
      trackStartSourceSeconds,
      plan,
    };
  }

  private async createNativeAutomixPlayback(
    request: AudioSessionPlayRequest,
    currentProbe: AudioProbeResult,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
    bridge: OutputBridgeLike,
  ): Promise<NativeAutomixPlayback | null> {
    const automix = request.automix;
    const next = automix?.next ?? null;
    if (
      automix?.enabled !== true ||
      !next ||
      typeof bridge.prepareAutomixPlan !== 'function' ||
      typeof bridge.createAutomixNextWritable !== 'function' ||
      outputSettings.playbackRate !== 1 ||
      plan.dsdOutputMode !== 'pcm' ||
      isDsdCodec(currentProbe.codec) ||
      isDsdFilePath(request.filePath)
    ) {
      return null;
    }

    const currentStartSeconds = Math.max(0, request.startSeconds ?? 0);
    const currentRemainingSeconds = Math.max(0, currentProbe.durationSeconds - currentStartSeconds);
    if (currentRemainingSeconds < 4) {
      return null;
    }

    const nextProbe = await this.resolveAutomixNextProbe(next);
    if (nextProbe.durationSeconds < 4 || isDsdCodec(nextProbe.codec) || isDsdFilePath(next.filePath)) {
      return null;
    }

    const [currentAnalysis, nextAnalysis] = await Promise.all([
      this.resolveAutomixAnalysis(
        request.filePath,
        request.inputHeaders,
        currentProbe,
        request.probe,
        automix.currentAnalysis,
      ),
      this.resolveAutomixAnalysis(
        next.filePath,
        next.inputHeaders,
        nextProbe,
        next.probe,
        automix.nextAnalysis,
      ),
    ]);
    const transitionPlan = planAutomixTransition({
      currentProbe,
      nextProbe,
      currentStartSeconds,
      currentAnalysis,
      nextAnalysis,
      currentHint: createAutomixAnalysisHint(request.probe),
      nextHint: createAutomixAnalysisHint(next.probe),
      maxTransitionSeconds: clampAutomixTransitionSeconds(automix.maxTransitionSeconds),
      beatAlignEnabled: automix.beatAlignEnabled !== false,
    });
    if (!transitionPlan) {
      return null;
    }

    const currentDecodeRequest = this.createDecodeRequest(
      request.filePath,
      request.inputHeaders,
      transitionPlan.currentStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    const nextDecodeRequest = this.createDecodeRequest(
      next.filePath,
      next.inputHeaders,
      transitionPlan.nextStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    if (transitionPlan.beatAligned && Math.abs(transitionPlan.tempoRatio - 1) >= 0.001) {
      nextDecodeRequest.tempoRatio = transitionPlan.tempoRatio;
    }
    const transitionStartSeconds = Math.max(0, transitionPlan.currentFadeStartSeconds - transitionPlan.currentStartSeconds);
    const transition: ActiveAutomixTransition = {
      fromTrackId: request.trackId ?? null,
      nextTrackId: this.getAutomixCandidateTrackId(next) ?? next.filePath,
      nextFilePath: next.filePath,
      nextInputHeaders: next.inputHeaders ?? null,
      nextProbe,
      nextReplayGain: next.replayGain ?? null,
      transitionSeconds: transitionPlan.overlapSeconds,
      transitionStartSeconds,
      trackStartOutputSeconds: transitionStartSeconds,
      trackStartSourceSeconds: transitionPlan.nextStartSeconds,
      plan: transitionPlan,
    };
    const compositeDurationSeconds = transitionStartSeconds + Math.max(0, nextProbe.durationSeconds - transitionPlan.nextStartSeconds);

    return {
      currentRun: this.decoder.decodeLocalFile(currentDecodeRequest),
      nextRun: this.decoder.decodeLocalFile(nextDecodeRequest),
      state: {
        enabled: true,
        gapless: false,
        nextTransitionIndex: 0,
        fromTrackId: request.trackId ?? null,
        nextTrackId: next.trackId ?? next.filePath,
        nextFilePath: next.filePath,
        nextInputHeaders: next.inputHeaders ?? null,
        nextProbe,
        nextReplayGain: next.replayGain ?? null,
        transitionSeconds: transitionPlan.overlapSeconds,
        transitionStartSeconds,
        compositeStartSeconds: transitionPlan.currentStartSeconds,
        compositeDurationSeconds,
        plan: transitionPlan,
        transitions: [transition],
      },
    };
  }

  private async createNativeGaplessPlayback(
    request: AudioSessionPlayRequest,
    currentProbe: AudioProbeResult,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
    bridge: OutputBridgeLike,
  ): Promise<NativeAutomixPlayback | null> {
    const gapless = request.gapless;
    const next = gapless?.next ?? null;
    if (
      request.automix?.enabled === true ||
      gapless?.enabled !== true ||
      !next ||
      (gapless.following?.length ?? 0) > 0 ||
      typeof bridge.prepareAutomixPlan !== 'function' ||
      typeof bridge.createAutomixNextWritable !== 'function' ||
      outputSettings.playbackRate !== 1 ||
      plan.dsdOutputMode !== 'pcm' ||
      isDsdCodec(currentProbe.codec) ||
      isDsdFilePath(request.filePath)
    ) {
      return null;
    }

    const currentStartSeconds = Math.max(0, request.startSeconds ?? 0);
    const nextProbe = await this.resolveAutomixNextProbe(next);
    if (isDsdCodec(nextProbe.codec) || isDsdFilePath(next.filePath)) {
      return null;
    }

    const transitionPlan = this.createGaplessTransitionPlan(currentStartSeconds, currentProbe, nextProbe);
    if (!transitionPlan) {
      return null;
    }

    const currentDecodeRequest = this.createDecodeRequest(
      request.filePath,
      request.inputHeaders,
      currentStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    const nextDecodeRequest = this.createDecodeRequest(
      next.filePath,
      next.inputHeaders,
      0,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    const transitionStartSeconds = Math.max(0, currentProbe.durationSeconds - currentStartSeconds);
    const transition = this.createGaplessTransition(
      request.trackId ?? null,
      next,
      nextProbe,
      transitionStartSeconds,
      0,
      transitionPlan,
    );

    return {
      currentRun: this.decoder.decodeLocalFile(currentDecodeRequest),
      nextRun: this.decoder.decodeLocalFile(nextDecodeRequest),
      state: {
        enabled: true,
        gapless: true,
        nextTransitionIndex: 0,
        fromTrackId: request.trackId ?? null,
        nextTrackId: next.trackId ?? next.filePath,
        nextFilePath: next.filePath,
        nextInputHeaders: next.inputHeaders ?? null,
        nextProbe,
        nextReplayGain: next.replayGain ?? null,
        transitionSeconds: 0,
        transitionStartSeconds,
        compositeStartSeconds: currentStartSeconds,
        compositeDurationSeconds: transitionStartSeconds + nextProbe.durationSeconds,
        plan: transitionPlan,
        transitions: [transition],
      },
    };
  }

  private async createAutomixDecoderRunForPlayback(
    request: AudioSessionPlayRequest,
    currentProbe: AudioProbeResult,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
  ): Promise<{ run: DecoderRun; state: ActiveAutomixState } | null> {
    const automix = request.automix;
    const next = automix?.next ?? null;
    if (
      automix?.enabled !== true ||
      !next ||
      !this.decoder.decodeAutomixPair ||
      outputSettings.playbackRate !== 1 ||
      plan.dsdOutputMode !== 'pcm'
    ) {
      return null;
    }

    const currentStartSeconds = Math.max(0, request.startSeconds ?? 0);
    const currentRemainingSeconds = Math.max(0, currentProbe.durationSeconds - currentStartSeconds);
    if (currentRemainingSeconds < 4) {
      return null;
    }

    const candidates = [next, ...(automix.following ?? [])].slice(0, 4);
    const resolvedCandidates: Array<{
      track: AudioSessionAutomixNextTrack;
      probe: AudioProbeResult;
      analysis: TrackTransitionAnalysis;
    }> = [];
    for (const candidate of candidates) {
      const candidateProbe = await this.resolveAutomixNextProbe(candidate);
      if (candidateProbe.durationSeconds < 4 || isDsdCodec(candidateProbe.codec) || isDsdFilePath(candidate.filePath)) {
        break;
      }

      const candidateAnalysis = await this.resolveAutomixAnalysis(
        candidate.filePath,
        candidate.inputHeaders,
        candidateProbe,
        candidate.probe,
        candidate === next ? automix.nextAnalysis : null,
      );
      resolvedCandidates.push({
        track: candidate,
        probe: candidateProbe,
        analysis: candidateAnalysis,
      });
    }
    const firstCandidate = resolvedCandidates[0];
    if (!firstCandidate) {
      return null;
    }

    const currentAnalysis = await this.resolveAutomixAnalysis(
      request.filePath,
      request.inputHeaders,
      currentProbe,
      request.probe,
      automix.currentAnalysis,
    );
    const transitionPlans: AutomixTransitionPlan[] = [];
    let previousProbe = currentProbe;
    let previousAnalysis = currentAnalysis;
    let previousHint = request.probe;
    let previousStartSeconds = currentStartSeconds;
    for (const candidate of resolvedCandidates) {
      const transitionPlan = planAutomixTransition({
        currentProbe: previousProbe,
        nextProbe: candidate.probe,
        currentStartSeconds: previousStartSeconds,
        currentAnalysis: previousAnalysis,
        nextAnalysis: candidate.analysis,
        currentHint: createAutomixAnalysisHint(previousHint),
        nextHint: createAutomixAnalysisHint(candidate.track.probe),
        maxTransitionSeconds: clampAutomixTransitionSeconds(automix.maxTransitionSeconds),
        beatAlignEnabled: automix.beatAlignEnabled !== false,
      });
      if (!transitionPlan) {
        break;
      }

      transitionPlans.push(transitionPlan);
      previousProbe = candidate.probe;
      previousAnalysis = candidate.analysis;
      previousHint = candidate.track.probe;
      previousStartSeconds = transitionPlan.nextStartSeconds;
    }
    const transitionPlan = transitionPlans[0];
    if (!transitionPlan) {
      return null;
    }

    const currentDecodeRequest = this.createDecodeRequest(
      request.filePath,
      request.inputHeaders,
      transitionPlan.currentStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    currentDecodeRequest.replayGainDb = this.calculateCurrentReplayGain().appliedDb;
    const nextDecodeRequest = this.createDecodeRequest(
      firstCandidate.track.filePath,
      firstCandidate.track.inputHeaders,
      transitionPlan.nextStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    nextDecodeRequest.replayGainDb = this.calculateReplayGainForTrack(firstCandidate.track.replayGain).appliedDb;
    const followingDecodeRequests = resolvedCandidates.slice(1, transitionPlans.length).map((candidate, index) => ({
      track: {
        ...this.createDecodeRequest(
          candidate.track.filePath,
          candidate.track.inputHeaders,
          transitionPlans[index + 1].nextStartSeconds,
          currentProbe.channels,
          plan,
          outputSettings,
        ),
        durationSeconds: candidate.probe.durationSeconds,
        replayGainDb: this.calculateReplayGainForTrack(candidate.track.replayGain).appliedDb,
      },
      plan: transitionPlans[index + 1],
    }));
    this.currentDecodeBackendImpl = 'ffmpeg-automix';
    const run = this.decoder.decodeAutomixPair({
      current: {
        ...currentDecodeRequest,
        durationSeconds: currentProbe.durationSeconds,
      },
      next: {
        ...nextDecodeRequest,
        durationSeconds: firstCandidate.probe.durationSeconds,
      },
      plan: transitionPlan,
      following: followingDecodeRequests,
    });
    const trackStartOutputSeconds = [0];
    const trackStartSourceSeconds = [transitionPlan.currentStartSeconds];
    const transitions: ActiveAutomixTransition[] = [];
    for (let index = 0; index < transitionPlans.length; index += 1) {
      const activePlan = transitionPlans[index];
      const candidate = resolvedCandidates[index];
      const sourceStartSeconds = index === 0 ? transitionPlan.currentStartSeconds : transitionPlans[index - 1].nextStartSeconds;
      const transitionStartSeconds = trackStartOutputSeconds[index] + Math.max(0, activePlan.currentFadeStartSeconds - sourceStartSeconds);
      transitions.push({
        fromTrackId: index === 0
          ? request.trackId ?? null
          : this.getAutomixCandidateTrackId(resolvedCandidates[index - 1]?.track),
        nextTrackId: this.getAutomixCandidateTrackId(candidate.track) ?? candidate.track.filePath,
        nextFilePath: candidate.track.filePath,
        nextInputHeaders: candidate.track.inputHeaders ?? null,
        nextProbe: candidate.probe,
        nextReplayGain: candidate.track.replayGain ?? null,
        transitionSeconds: activePlan.overlapSeconds,
        transitionStartSeconds,
        trackStartOutputSeconds: transitionStartSeconds,
        trackStartSourceSeconds: activePlan.nextStartSeconds,
        plan: activePlan,
      });
      trackStartOutputSeconds[index + 1] = transitionStartSeconds;
      trackStartSourceSeconds[index + 1] = activePlan.nextStartSeconds;
    }
    const lastCandidate = resolvedCandidates[transitionPlans.length - 1];
    const lastTrackOutputStartSeconds = trackStartOutputSeconds[transitionPlans.length] ?? 0;
    const lastTrackSourceStartSeconds = trackStartSourceSeconds[transitionPlans.length] ?? 0;
    const compositeDurationSeconds = lastTrackOutputStartSeconds + Math.max(0, lastCandidate.probe.durationSeconds - lastTrackSourceStartSeconds);

    return {
      run,
      state: {
        enabled: true,
        gapless: false,
        nextTransitionIndex: 0,
        fromTrackId: request.trackId ?? null,
        nextTrackId: firstCandidate.track.trackId ?? firstCandidate.track.filePath,
        nextFilePath: firstCandidate.track.filePath,
        nextInputHeaders: firstCandidate.track.inputHeaders ?? null,
        nextProbe: firstCandidate.probe,
        nextReplayGain: firstCandidate.track.replayGain ?? null,
        transitionSeconds: transitionPlan.overlapSeconds,
        transitionStartSeconds: transitions[0]?.transitionStartSeconds ?? 0,
        compositeStartSeconds: transitionPlan.currentStartSeconds,
        compositeDurationSeconds,
        plan: transitionPlan,
        transitions,
      },
    };
  }

  private async createGaplessDecoderRunForPlayback(
    request: AudioSessionPlayRequest,
    currentProbe: AudioProbeResult,
    plan: SampleRatePlan,
    outputSettings: AudioOutputSettings,
  ): Promise<{ run: DecoderRun; state: ActiveAutomixState } | null> {
    const gapless = request.gapless;
    const next = gapless?.next ?? null;
    if (
      request.automix?.enabled === true ||
      gapless?.enabled !== true ||
      !next ||
      !this.decoder.decodeGaplessSequence ||
      outputSettings.playbackRate !== 1 ||
      plan.dsdOutputMode !== 'pcm' ||
      isDsdCodec(currentProbe.codec) ||
      isDsdFilePath(request.filePath)
    ) {
      return null;
    }

    const currentStartSeconds = Math.max(0, request.startSeconds ?? 0);
    const candidates = [next, ...(gapless.following ?? [])].slice(0, 4);
    const resolvedCandidates: Array<{
      track: AudioSessionGaplessNextTrack;
      probe: AudioProbeResult;
    }> = [];
    for (const candidate of candidates) {
      const candidateProbe = await this.resolveAutomixNextProbe(candidate);
      if (candidateProbe.durationSeconds < 0.25 || isDsdCodec(candidateProbe.codec) || isDsdFilePath(candidate.filePath)) {
        break;
      }
      resolvedCandidates.push({ track: candidate, probe: candidateProbe });
    }

    const firstCandidate = resolvedCandidates[0];
    if (!firstCandidate) {
      return null;
    }

    const firstPlan = this.createGaplessTransitionPlan(currentStartSeconds, currentProbe, firstCandidate.probe);
    if (!firstPlan) {
      return null;
    }

    const currentDecodeRequest = this.createDecodeRequest(
      request.filePath,
      request.inputHeaders,
      currentStartSeconds,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    currentDecodeRequest.replayGainDb = this.calculateCurrentReplayGain().appliedDb;

    const nextDecodeRequest = this.createDecodeRequest(
      firstCandidate.track.filePath,
      firstCandidate.track.inputHeaders,
      0,
      currentProbe.channels,
      plan,
      outputSettings,
    );
    nextDecodeRequest.replayGainDb = this.calculateReplayGainForTrack(firstCandidate.track.replayGain).appliedDb;

    const followingDecodeRequests = resolvedCandidates.slice(1).map((candidate) => {
      const decodeRequest = this.createDecodeRequest(
        candidate.track.filePath,
        candidate.track.inputHeaders,
        0,
        currentProbe.channels,
        plan,
        outputSettings,
      );
      decodeRequest.replayGainDb = this.calculateReplayGainForTrack(candidate.track.replayGain).appliedDb;
      return {
        ...decodeRequest,
        durationSeconds: candidate.probe.durationSeconds,
      };
    });

    const run = this.decoder.decodeGaplessSequence({
      current: {
        ...currentDecodeRequest,
        durationSeconds: currentProbe.durationSeconds,
      },
      next: {
        ...nextDecodeRequest,
        durationSeconds: firstCandidate.probe.durationSeconds,
      },
      following: followingDecodeRequests,
    });
    run.decoderBackendImpl = 'ffmpeg-gapless';
    this.currentDecodeBackendImpl = 'ffmpeg-gapless';

    const transitions: ActiveAutomixTransition[] = [];
    let trackStartOutputSeconds = Math.max(0, currentProbe.durationSeconds - currentStartSeconds);
    let previousTrackId: string | null = request.trackId ?? null;
    let previousProbe = currentProbe;
    let previousStartSeconds = currentStartSeconds;
    for (const candidate of resolvedCandidates) {
      const transitionPlan = transitions.length === 0
        ? firstPlan
        : this.createGaplessTransitionPlan(previousStartSeconds, previousProbe, candidate.probe);
      if (!transitionPlan) {
        break;
      }
      transitions.push(this.createGaplessTransition(
        previousTrackId,
        candidate.track,
        candidate.probe,
        trackStartOutputSeconds,
        0,
        transitionPlan,
      ));
      previousTrackId = candidate.track.trackId ?? candidate.track.filePath;
      previousProbe = candidate.probe;
      previousStartSeconds = 0;
      trackStartOutputSeconds += candidate.probe.durationSeconds;
    }

    return {
      run,
      state: {
        enabled: true,
        gapless: true,
        nextTransitionIndex: 0,
        fromTrackId: request.trackId ?? null,
        nextTrackId: firstCandidate.track.trackId ?? firstCandidate.track.filePath,
        nextFilePath: firstCandidate.track.filePath,
        nextInputHeaders: firstCandidate.track.inputHeaders ?? null,
        nextProbe: firstCandidate.probe,
        nextReplayGain: firstCandidate.track.replayGain ?? null,
        transitionSeconds: 0,
        transitionStartSeconds: transitions[0]?.transitionStartSeconds ?? 0,
        compositeStartSeconds: currentStartSeconds,
        compositeDurationSeconds: trackStartOutputSeconds,
        plan: firstPlan,
        transitions,
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
    const dsdDopTransportSampleRate = shouldAttemptDsdDop(
      probe.filePath,
      this.currentInputHeaders,
      probe,
      outputSettings,
      outputMode,
    )
      ? resolveDsdDopTransportSampleRate(probe)
      : null;
    const asioNativeDsdSampleRate = shouldAttemptAsioNativeDsd(
      probe.filePath,
      this.currentInputHeaders,
      probe,
      outputSettings,
      outputMode,
    )
      ? fileSampleRate
      : null;
    const dsdOutputMode: Exclude<ActiveDsdOutputMode, null> = asioNativeDsdSampleRate
      ? 'native'
      : dsdDopTransportSampleRate
        ? 'dop'
        : 'pcm';
    const sourceOutputSampleRate = asioNativeDsdSampleRate ?? dsdDopTransportSampleRate ?? dsdPcmOutputSampleRate ?? sourceSampleRate;
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
        ? sharedDeviceSampleRate ?? currentReadySampleRate ?? fallbackSharedMixSampleRate
        : asioNativeDsdSampleRate ?? dsdDopTransportSampleRate ?? dsdPcmOutputSampleRate ?? explicitRequestedSampleRate ?? sourceOutputSampleRate);
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

    const dsdDopDisabledWarning = getDsdDopDisabledWarning(
      probe.filePath,
      this.currentInputHeaders,
      probe,
      outputSettings,
      outputMode,
    );
    if (dsdDopDisabledWarning) {
      warnings.push(dsdDopDisabledWarning);
    }

    const asioNativeDsdDisabledWarning = getAsioNativeDsdDisabledWarning(
      probe.filePath,
      this.currentInputHeaders,
      probe,
      outputSettings,
      outputMode,
    );
    if (asioNativeDsdDisabledWarning) {
      warnings.push(asioNativeDsdDisabledWarning);
    }

    if (dsdOutputMode === 'pcm' && dsdPcmOutputSampleRate && fileSampleRate !== null && fileSampleRate !== decoderOutputSampleRate) {
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

    const fileToDecoderResampling = dsdOutputMode !== 'pcm'
      ? false
      : fileSampleRate !== null && fileSampleRate !== decoderOutputSampleRate;
    const outputSideResampling = dsdOutputMode !== 'pcm'
      ? false
      : actualDeviceSampleRate !== null && actualDeviceSampleRate !== decoderOutputSampleRate;
    const sharedModeResampling =
      dsdOutputMode !== 'pcm'
        ? false
        : outputMode === 'shared' &&
          fileSampleRate !== null &&
          ((actualDeviceSampleRate !== null && actualDeviceSampleRate !== fileSampleRate) ||
            requestedOutputSampleRate !== fileSampleRate);
    const resampling = fileToDecoderResampling || outputSideResampling || sharedModeResampling;

    if (sharedModeResampling) {
      warnings.push('shared_output_resampling_or_mixer_rate_difference');
    }

    const bitPerfectCandidate =
      dsdOutputMode !== 'pcm'
        ? true
        : outputMode !== 'shared' &&
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
      dsdOutputMode,
      dsdNativeSampleRate: dsdOutputMode !== 'pcm' ? fileSampleRate : null,
      dsdTransportSampleRate: dsdOutputMode === 'dop' ? dsdDopTransportSampleRate : null,
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
    this.currentActiveDsdOutputMode = this.currentPlan?.dsdOutputMode !== 'pcm' ? this.currentPlan?.dsdOutputMode ?? null : null;
    this.currentDsdNativeSampleRate = this.currentPlan?.dsdNativeSampleRate ?? null;
    this.currentDsdTransportSampleRate = this.currentPlan?.dsdTransportSampleRate ?? null;
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
        : latencyProfile === 'lowLatency' && this.sharedStabilityTier === 'standard'
          ? sharedLowLatencyProfile
          : sharedStabilityProfiles[this.sharedStabilityTier];
    const sharedProfileBufferSizeFrames = sharedProfile.bufferSizeFrames ?? 0;
    const effectiveLatencyProfile =
      latencyProfile === 'lowLatency' && sharedProfileBufferSizeFrames > lowLatencyMaxBufferSizeFrames
        ? (this.sharedStabilityTier === 'emergency' || sharedProfile === stableSharedProfile ? 'stable' : 'balanced')
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
      this.assertCurrentRun(token);

      return { bridge, ready };
    } catch (error) {
      if (isAudioSessionRunCancelledError(error)) {
        await this.stopBridgeGracefully(bridge, 'juce-native-fallback-superseded');
        throw error;
      }

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
      const isDsdDopOutput = this.currentPlan.dsdOutputMode === 'dop';
      const isAsioNativeDsdOutput = this.currentPlan.dsdOutputMode === 'native';
      const residentReuseAllowed = canReuseResidentOutputBridge(outputMode);

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
        useJuceOutput: isDsdDopOutput ? false : useJuceOutputForHost,
        latencyProfile: this.currentOutputSettings.latencyProfile,
        bufferSizeFrames: this.currentOutputSettings.bufferSizeFrames ?? undefined,
        volume: this.currentOutputSettings.volume,
        startSeconds,
        playbackRate: this.currentOutputSettings.playbackRate,
        playbackSpeedMode: this.currentOutputSettings.playbackSpeedMode,
        durationSeconds: probe.durationSeconds,
        inputFormat: isAsioNativeDsdOutput ? 'dsd-native-raw' : isDsdDopOutput ? 'dop24le' : 'pcm-f32le',
        asioNativeDsdOutput: isAsioNativeDsdOutput,
        nativeDsdSampleRate: isAsioNativeDsdOutput ? this.currentPlan.dsdNativeSampleRate : null,
      });
      const reusableBridge = this.bridge;
      if (!useDirectSoundBackend && residentReuseAllowed && reusableBridge?.canReuseFor?.(startOptions) && this.currentReadyResult) {
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

      if (!this.bridge && this.bridgeStopInProgress && !previousBridgeStopped) {
        await this.bridgeStopInProgress;
        this.assertCurrentRun(token);
        previousBridgeStopped = true;
      }

      const hostRestartReason = this.bridge
        ? this.currentReadyResult
          ? residentReuseAllowed
            ? 'reuse_key_changed'
            : 'asio_session_rotation'
          : 'resident_host_not_ready'
        : 'initial_start';

      if (this.bridge && !previousBridgeStopped) {
        if (this.shouldDetachSharedReplacement(outputMode, sharedBackend)) {
          await this.detachSharedReplacementBridge('replace-output');
        } else {
          await this.stopResourcesGracefully('replace-output');
        }
        this.assertCurrentRun(token);
        previousBridgeStopped = true;
      }

      const bridge = this.createBridge();
      this.bridge = bridge;
      this.attachBridgeEvents(bridge, token);

      try {
        const ready = await bridge.start(startOptions);
        this.assertCurrentRun(token);

        if (usingDefaultSharedFallback) {
          this.addOutputWarning('shared_output_fell_back_to_default_device');
          this.addOutputWarning('shared_output_recovered_to_default_device');
        }

        return { bridge, plan: this.currentPlan, ready, hostReused: false, hostRestartReason };
      } catch (error) {
        if (isAudioSessionRunCancelledError(error)) {
          await this.stopBridgeGracefully(bridge, 'output-start-superseded');
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger(`[AudioSession] output start failed: ${lastError.message}`);
        this.reportRecoverableAudioError(lastError, 'output-start', {
          outputMode,
          candidate: candidate ? { index: candidate.index, name: candidate.name, outputMode: candidate.outputMode } : 'default',
          requestedOutputSampleRate: this.currentPlan.requestedOutputSampleRate,
          channels: probe.channels,
        });
        await this.stopBridgeGracefully(bridge, 'output-start-failed');
        this.assertCurrentRun(token);
        if (this.currentPlan?.dsdOutputMode === 'native' && this.currentOutputSettings.dsdOutputMode === 'dop') {
          this.addOutputWarning(`asio_native_dsd_fell_back_to_dop:${lastError.message.slice(0, 96)}`);
          this.currentOutputSettings = {
            ...this.currentOutputSettings,
            asioNativeDsdExperimentalEnabled: false,
          };
          this.currentActiveDsdOutputMode = null;
          this.currentDsdNativeSampleRate = null;
          this.currentDsdTransportSampleRate = null;
          return this.startOutputBridgeForProbe(probe, token, startSeconds);
        }
        if (this.currentPlan?.dsdOutputMode === 'dop' && this.currentOutputSettings.dsdOutputMode === 'dop') {
          this.addOutputWarning(`dsd_dop_fell_back_to_pcm:${lastError.message.slice(0, 96)}`);
          this.currentOutputSettings = {
            ...this.currentOutputSettings,
            dsdOutputMode: 'pcm',
          };
          this.currentActiveDsdOutputMode = null;
          this.currentDsdNativeSampleRate = null;
          this.currentDsdTransportSampleRate = null;
          return this.startOutputBridgeForProbe(probe, token, startSeconds);
        }
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
      this.addOutputWarning('exclusive_output_fell_back_to_shared');
      if (this.exclusiveResumeAfterRelease) {
        this.addOutputWarning('exclusive_resume_fell_back_to_shared');
        this.exclusiveResumeAfterRelease = false;
      }
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
        this.assertCurrentRun(token);

        return {
          bridge,
          plan: this.currentPlan,
          ready,
          hostReused: false,
          hostRestartReason: 'exclusive_fallback_to_shared',
        };
      } catch (error) {
        if (isAudioSessionRunCancelledError(error)) {
          await this.stopBridgeGracefully(bridge, 'shared-fallback-superseded');
          throw error;
        }

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
      this.assertCurrentRun(token);

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
      if (isAudioSessionRunCancelledError(error)) {
        await this.stopBridgeGracefully(bridge, 'safe-shared-fallback-superseded');
        throw error;
      }

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
    this.addOutputWarning('exclusive_output_fell_back_to_shared');
    if (this.exclusiveResumeAfterRelease) {
      this.addOutputWarning('exclusive_resume_fell_back_to_shared');
      this.exclusiveResumeAfterRelease = false;
    }
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
      this.assertCurrentRun(token);

      return {
        bridge,
        plan: this.currentPlan,
        ready,
        hostReused: false,
        hostRestartReason: 'exclusive_fallback_to_shared',
      };
    } catch (error) {
      if (isAudioSessionRunCancelledError(error)) {
        await this.stopBridgeGracefully(bridge, 'shared-fallback-superseded');
        throw error;
      }

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
      this.currentUseJuceDecodeRequested = false;
      this.currentDecodeBackendImpl = null;
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
        this.maybeAdvanceAutomix(token);
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

        this.deviceService.invalidateCache?.();
        this.enqueueNativeHostNotification(event, token);
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
    if (this.state === 'playing' && this.bridge?.getPositionSeconds) {
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
    const replayGainCalculation = this.calculateCurrentReplayGain();
    const replayGainTransform = new PcmVolumeTransform(run.replayGainAppliedInStream === true ? 1 : this.replayGainLinearGain(replayGainCalculation), 16);
    const livePcmResampler = this.createLivePcmResamplerTransform();
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
    this.currentReplayGainCalculation = replayGainCalculation;
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
    const resamplerErrorHandler = handlePipelineError('live_pcm_resampler_error');
    const gainErrorHandler = handlePipelineError('pcm_gain_error');
    const replayGainErrorHandler = handlePipelineError('pcm_replay_gain_error');
    const speedErrorHandler = handlePipelineError('pcm_speed_error');
    const levelErrorHandler = handlePipelineError('pcm_level_meter_error');
    const writableErrorHandler = handlePipelineError('native_writable_error');

    run.stream.on('error', streamErrorHandler);
    livePcmResampler?.on('error', resamplerErrorHandler);
    gainTransform.on('error', gainErrorHandler);
    replayGainTransform.on('error', replayGainErrorHandler);
    speedTransform.on('error', speedErrorHandler);
    levelMeterTransform.on('error', levelErrorHandler);
    writable.on('error', writableErrorHandler);
    this.decoderPipelineCleanup = (): void => {
      run.stream.off('error', streamErrorHandler);
      livePcmResampler?.off('error', resamplerErrorHandler);
      livePcmResampler?.destroy();
      gainTransform.off('error', gainErrorHandler);
      replayGainTransform.off('error', replayGainErrorHandler);
      replayGainTransform.destroy();
      speedTransform.off('error', speedErrorHandler);
      levelMeterTransform.off('error', levelErrorHandler);
      writable.off('error', writableErrorHandler);
    };
    const pcmSource = livePcmResampler ? run.stream.pipe(livePcmResampler) : run.stream;
    pcmSource.pipe(gainTransform).pipe(replayGainTransform).pipe(speedTransform).pipe(levelMeterTransform).pipe(writable, { end: false });
    levelMeterTransform.once('end', signalNativeInputEnded);
    run.done.then(signalNativeInputEnded).catch((error: unknown) => {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private calculateCurrentReplayGain(): ReplayGainCalculation {
    if (this.currentActiveDsdOutputMode === 'dop' || this.currentActiveDsdOutputMode === 'native') {
      return {
        appliedDb: 0,
        selectedGainDb: null,
        selectedPeak: null,
        preventedClipping: false,
        active: false,
      };
    }

    return this.calculateReplayGainForTrack(this.currentReplayGain);
  }

  private calculateReplayGainForTrack(replayGain: ReplayGainTrackData | null | undefined): ReplayGainCalculation {
    const settings = getReplayGainAudioSettings();
    return calculateReplayGain({
      ...(replayGain ?? {}),
      enabled: settings.replayGainEnabled,
      mode: settings.replayGainMode,
      preampDb: settings.replayGainPreampDb,
      preventClipping: settings.replayGainPreventClipping,
    });
  }

  private replayGainLinearGain(calculation: ReplayGainCalculation): number {
    if (!calculation.active || Math.abs(calculation.appliedDb) < 0.001) {
      return 1;
    }
    return Math.max(0, Math.min(16, dbToLinearGain(calculation.appliedDb)));
  }

  private startNativeAutomixRuns(
    currentRun: DecoderRun,
    nextRun: DecoderRun,
    currentWritable: Writable,
    nextWritable: Writable,
    token: number,
    decoderBackendImpl: 'native-automix-dual-deck' | 'native-gapless-dual-deck' = 'native-automix-dual-deck',
  ): void {
    this.decoderPipelineCleanup?.();
    const volume = this.currentOutputSettings?.volume ?? this.outputSettings.volume;
    const nativeVolumeControl = typeof this.bridge?.setVolume === 'function';
    const currentReplayGainCalculation = this.calculateCurrentReplayGain();
    const nextReplayGainCalculation = this.calculateReplayGainForTrack(this.activeAutomix?.nextReplayGain);
    const currentGainTransform = new PcmVolumeTransform(nativeVolumeControl ? 1 : volume);
    const nextGainTransform = new PcmVolumeTransform(nativeVolumeControl ? 1 : volume);
    const currentReplayGainTransform = new PcmVolumeTransform(this.replayGainLinearGain(currentReplayGainCalculation), 16);
    const nextReplayGainTransform = new PcmVolumeTransform(this.replayGainLinearGain(nextReplayGainCalculation), 16);
    const levelMeterTransform = new PcmLevelMeterTransform((snapshot) => this.handleLevelSnapshot(snapshot));
    levelMeterTransform.setGain(nativeVolumeControl ? volume : 1);
    const combinedRun: DecoderRun = {
      stream: currentRun.stream,
      stop: () => {
        currentRun.stop();
        nextRun.stop();
      },
      done: Promise.allSettled([currentRun.done, nextRun.done]).then((results) => {
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (rejected) {
          throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
        }
      }),
      decoderBackendImpl,
      resamplerEngine: currentRun.resamplerEngine,
      resamplerFallbackActive: currentRun.resamplerFallbackActive || nextRun.resamplerFallbackActive,
    };
    let currentEnded = false;
    let nextEnded = false;
    const signalCurrentEnded = (): void => {
      if (currentEnded || this.runToken !== token || this.decoderRun !== combinedRun) {
        return;
      }

      currentEnded = true;
      try {
        currentWritable.end();
      } catch {
        // The native host may already have been stopped by pause/seek/stop.
      }
    };
    const signalNextEnded = (): void => {
      if (nextEnded || this.runToken !== token || this.decoderRun !== combinedRun) {
        return;
      }

      nextEnded = true;
      try {
        nextWritable.end();
      } catch {
        // The native host may already have been stopped by pause/seek/stop.
      }
    };

    this.decoderRun = combinedRun;
    this.currentDecodeBackendImpl = decoderBackendImpl;
    this.currentReplayGainCalculation = currentReplayGainCalculation;
    this.gainTransform = currentGainTransform;
    this.speedTransform = null;
    this.levelMeterTransform = levelMeterTransform;
    const handlePipelineError = (stage: string) => (error: unknown): void => {
      if (this.runToken !== token || this.decoderRun !== combinedRun) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.handleError(new Error(`${stage}: ${message}`));
    };
    const currentStreamErrorHandler = handlePipelineError('native_automix_current_stream_error');
    const nextStreamErrorHandler = handlePipelineError('native_automix_next_stream_error');
    const currentGainErrorHandler = handlePipelineError('native_automix_current_gain_error');
    const nextGainErrorHandler = handlePipelineError('native_automix_next_gain_error');
    const currentReplayGainErrorHandler = handlePipelineError('native_automix_current_replay_gain_error');
    const nextReplayGainErrorHandler = handlePipelineError('native_automix_next_replay_gain_error');
    const levelErrorHandler = handlePipelineError('native_automix_level_meter_error');
    const currentWritableErrorHandler = handlePipelineError('native_automix_current_writable_error');
    const nextWritableErrorHandler = handlePipelineError('native_automix_next_writable_error');

    currentRun.stream.on('error', currentStreamErrorHandler);
    nextRun.stream.on('error', nextStreamErrorHandler);
    currentGainTransform.on('error', currentGainErrorHandler);
    nextGainTransform.on('error', nextGainErrorHandler);
    currentReplayGainTransform.on('error', currentReplayGainErrorHandler);
    nextReplayGainTransform.on('error', nextReplayGainErrorHandler);
    levelMeterTransform.on('error', levelErrorHandler);
    currentWritable.on('error', currentWritableErrorHandler);
    nextWritable.on('error', nextWritableErrorHandler);
    this.decoderPipelineCleanup = (): void => {
      currentRun.stream.off('error', currentStreamErrorHandler);
      nextRun.stream.off('error', nextStreamErrorHandler);
      currentGainTransform.off('error', currentGainErrorHandler);
      nextGainTransform.off('error', nextGainErrorHandler);
      currentReplayGainTransform.off('error', currentReplayGainErrorHandler);
      nextReplayGainTransform.off('error', nextReplayGainErrorHandler);
      levelMeterTransform.off('error', levelErrorHandler);
      currentWritable.off('error', currentWritableErrorHandler);
      nextWritable.off('error', nextWritableErrorHandler);
      currentRun.stream.unpipe(currentGainTransform);
      currentGainTransform.unpipe(currentReplayGainTransform);
      currentReplayGainTransform.unpipe(levelMeterTransform);
      levelMeterTransform.unpipe(currentWritable);
      nextRun.stream.unpipe(nextGainTransform);
      nextGainTransform.unpipe(nextReplayGainTransform);
      nextReplayGainTransform.unpipe(nextWritable);
    };

    currentRun.stream.pipe(currentGainTransform).pipe(currentReplayGainTransform).pipe(levelMeterTransform).pipe(currentWritable, { end: false });
    nextRun.stream.pipe(nextGainTransform).pipe(nextReplayGainTransform).pipe(nextWritable, { end: false });
    levelMeterTransform.once('end', signalCurrentEnded);
    nextGainTransform.once('end', signalNextEnded);
    currentRun.done.then(signalCurrentEnded).catch((error: unknown) => {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    nextRun.done.then(signalNextEnded).catch((error: unknown) => {
      if (this.runToken === token) {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private startBitstreamRun(stream: Readable, writable: Writable, token: number): void {
    this.decoderPipelineCleanup?.();
    let inputEnded = false;
    const signalNativeInputEnded = (): void => {
      if (inputEnded || this.runToken !== token) {
        return;
      }

      inputEnded = true;
      try {
        writable.end();
      } catch {
        // The native host may already have been stopped by pause/seek/stop.
      }
    };

    const handlePipelineError = (stage: string) => (error: unknown): void => {
      if (this.runToken !== token) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.handleError(new Error(`${stage}: ${message}`));
    };
    const streamErrorHandler = handlePipelineError('dsd_dop_stream_error');
    const writableErrorHandler = handlePipelineError('native_writable_error');

    stream.on('error', streamErrorHandler);
    writable.on('error', writableErrorHandler);
    this.decoderPipelineCleanup = (): void => {
      stream.off('error', streamErrorHandler);
      writable.off('error', writableErrorHandler);
      stream.unpipe(writable);
      stream.destroy();
    };
    stream.pipe(writable, { end: false });
    stream.once('end', signalNativeInputEnded);
    stream.once('close', signalNativeInputEnded);
  }

  private maybeAdvanceAutomix(token: number): void {
    const automix = this.activeAutomix;
    if (!automix || this.runToken !== token) {
      return;
    }

    const compositePositionSeconds = Math.max(0, this.clock.getPositionSeconds() - automix.compositeStartSeconds);
    let advanced = false;
    while (automix.nextTransitionIndex < automix.transitions.length) {
      const transition = automix.transitions[automix.nextTransitionIndex];
      if (!transition || compositePositionSeconds < transition.transitionStartSeconds) {
        break;
      }

      automix.nextTransitionIndex += 1;
      automix.fromTrackId = transition.fromTrackId;
      automix.nextTrackId = transition.nextTrackId;
      automix.nextFilePath = transition.nextFilePath;
      automix.nextInputHeaders = transition.nextInputHeaders;
      automix.nextProbe = transition.nextProbe;
      automix.nextReplayGain = transition.nextReplayGain;
      automix.transitionSeconds = transition.transitionSeconds;
      automix.transitionStartSeconds = transition.transitionStartSeconds;
      automix.plan = transition.plan;
      this.currentTrackId = transition.nextTrackId;
      this.currentFilePath = transition.nextFilePath;
      this.currentInputHeaders = transition.nextInputHeaders;
      this.currentProbe = transition.nextProbe;
      this.currentReplayGain = transition.nextReplayGain;
      this.currentReplayGainCalculation = this.calculateCurrentReplayGain();
      this.emit('automix-advance', {
        fromTrackId: transition.fromTrackId,
        toTrackId: transition.nextTrackId,
        transitionSeconds: transition.transitionSeconds,
        mode: transition.plan.mode,
        fallbackReason: transition.plan.fallbackReason,
        beatAligned: transition.plan.beatAligned,
        skipIntroSilence: transition.plan.skipIntroSilence,
        nextStartSeconds: transition.plan.nextStartSeconds,
      });
      advanced = true;
    }
    if (advanced) {
      this.emitStatus();
    }
  }

  private enqueueNativeHostNotification(event: unknown, token: number): void {
    this.nativeHostNotificationQueue = this.nativeHostNotificationQueue
      .then(() => this.handleNativeHostNotification(event, token))
      .catch((error) => {
        this.logger(
          `[AudioSession] native host notification handler failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private async handleNativeHostNotification(event: unknown, token: number): Promise<void> {
    if (
      this.runToken !== token ||
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
    this.sharedStabilityRecovering = true;
    this.logger(
      `[AudioSession] ${recoveryReason}; restarting output after native host notification position=${positionSeconds.toFixed(3)}`,
    );

    const recoveryOptions: StabilityRecoveryOptions = {
      runToken: token,
      sharedStabilityRecoveryClaimed: true,
    };

    if (this.currentPlan.outputMode === 'exclusive' && event.event !== 'default_device_changed') {
      this.addPendingOutputWarning(recoveryReason);
      await this.fallbackExclusiveToSharedForInstability(positionSeconds, recoveryOptions);
      return;
    }

    await this.recoverOutputStability(recoveryReason, positionSeconds, recoveryOptions);
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
    const token = this.runToken;

    try {
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

      const positionSeconds = this.clock.getPositionSeconds();
      if (this.currentPlan.outputMode === 'exclusive') {
        await this.fallbackExclusiveToSharedForInstability(positionSeconds, token);
        return;
      }

      const reason = this.currentPlan.outputMode === 'shared' ? 'shared_output_underrun_detected' : 'native_output_underrun_detected';
      await this.recoverOutputStability(reason, positionSeconds, token);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private stopDecoderRun(): Promise<void> | null {
    const previousStop = this.decoderStopInProgress;
    this.decoderPipelineCleanup?.();
    this.decoderPipelineCleanup = null;

    const run = this.decoderRun;
    this.decoderRun = null;
    if (run) {
      try {
        run.stream.unpipe();
      } catch {
        // Best-effort resource cleanup.
      }
      try {
        run.stream.destroy();
      } catch {
        // Best-effort resource cleanup.
      }
      run.stop();
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

    if (!previousStop && run?.waitForExitOnStop !== true) {
      return null;
    }

    const stopPromise = (async (): Promise<void> => {
      if (previousStop) {
        try {
          await previousStop;
        } catch {
          // Prior cleanup already logged or was superseded.
        }
      }

      if (run?.waitForExitOnStop === true) {
        await this.waitForDecoderRunExit(run);
      }
    })();

    this.decoderStopInProgress = stopPromise;
    return stopPromise.finally(() => {
      if (this.decoderStopInProgress === stopPromise) {
        this.decoderStopInProgress = null;
      }
    });
  }

  private async waitForDecoderRunExit(run: DecoderRun): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    try {
      await Promise.race([
        run.done.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            timedOut = true;
            resolve();
          }, decoderStopTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (!timedOut) {
      return;
    }

    this.logger('[AudioSession] decoder process did not exit after stop; forcing cleanup');
    try {
      run.stop();
    } catch {
      // Best-effort decoder cleanup.
    }
    try {
      run.stream.destroy();
    } catch {
      // Best-effort decoder cleanup.
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
    const explicitDevice = hasExplicitDeviceSelection(settings);
    const readyDefaultDevice = !explicitDevice && typeof device?.id === 'string' && device.id.endsWith(':ready');
    const deviceIndex = readyDefaultDevice ? explicitDeviceIndex : Number.isInteger(Number(device?.index)) ? Number(device?.index) : explicitDeviceIndex;
    const deviceName = readyDefaultDevice ? 'default' : device?.name ?? settings.deviceName ?? 'default';

    return JSON.stringify({
      sharedBackend: normalizeSharedBackend(settings.sharedBackend),
      deviceId: readyDefaultDevice ? null : device?.id ?? null,
      deviceIndex,
      deviceName,
      explicitDevice,
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
    this.lastSharedStabilityRecoveryKey = key;
  }

  private resetSharedStabilityForFreshPlayback(
    outputMode: AudioOutputMode,
    settings: AudioOutputSettings | null = this.currentOutputSettings,
    device: AudioDeviceInfo | null = this.currentDevice,
  ): void {
    if (outputMode === 'shared' && !this.watchdogRecovering && !this.sharedStabilityRecovering) {
      const key = settings ? this.createSharedStabilityMemoryKey(settings, device) : null;
      const lastRecoveryAtMs = this.lastSharedStabilityRecoveryAt ? Date.parse(this.lastSharedStabilityRecoveryAt) : Number.NaN;
      const recentSameDeviceRecovery =
        key !== null &&
        key === this.lastSharedStabilityRecoveryKey &&
        this.sharedStabilityTier !== 'standard' &&
        Number.isFinite(lastRecoveryAtMs) &&
        Date.now() - lastRecoveryAtMs < sharedStabilityMemoryTtlMs
          ? this.sharedStabilityTier
          : null;
      this.sharedStabilityTier = settings
        ? this.getRememberedSharedStabilityTier(settings, device) ?? recentSameDeviceRecovery ?? 'standard'
        : recentSameDeviceRecovery ?? 'standard';
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
    void this.stopDecoderRun();

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
    const decoderStop = this.stopDecoderRun();
    if (decoderStop) {
      await decoderStop;
    }

    const bridge = this.bridge;
    if (!bridge) {
      this.currentReadyResult = null;
      this.currentBridgeOutputMode = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
      if (this.bridgeStopInProgress) {
        await this.bridgeStopInProgress;
      }
      return;
    }

    const timeoutMs = bridge.stopGracefully ? this.getGracefulStopTimeoutMs(reason) : undefined;
    const waitForExit = bridge.stopGracefully
      ? waitForExitOverride ?? this.getGracefulStopWaitForExit(reason)
      : false;
    this.bridge = null;
    this.detachBridgeEvents(bridge);
    this.currentReadyResult = null;
    this.currentBridgeOutputMode = null;
    this.currentBridgeSharedBackend = null;
    this.currentResidentOutputSampleRate = null;

    const stopPromise = (async (): Promise<void> => {
      try {
        if (bridge.stopGracefully) {
          await this.stopBridgeWithOptions(bridge, reason, timeoutMs, waitForExit);
        } else {
          bridge.stop();
        }
      } catch (error) {
        this.logger(`[AudioSession] graceful stop failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    this.bridgeStopInProgress = stopPromise;

    try {
      await stopPromise;
    } finally {
      if (this.bridgeStopInProgress === stopPromise) {
        this.bridgeStopInProgress = null;
      }
      if (this.bridge === bridge) {
        this.detachBridgeEvents(bridge);
        this.bridge = null;
      }
      this.currentReadyResult = null;
      this.currentBridgeOutputMode = null;
      this.currentBridgeSharedBackend = null;
      this.currentResidentOutputSampleRate = null;
    }
  }

  private shouldDetachSharedReplacement(nextOutputMode: AudioOutputMode, nextSharedBackend: AudioSharedBackend): boolean {
    void nextOutputMode;
    void nextSharedBackend;
    return false;
  }

  private async detachSharedReplacementBridge(reason: string): Promise<void> {
    const decoderStop = this.stopDecoderRun();
    if (decoderStop) {
      await decoderStop;
    }

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
    if (reason === 'app-quit') {
      return 1500;
    }

    const outputMode =
      reason === 'replace-output'
        ? this.currentBridgeOutputMode
        : reason === 'output-start-failed'
          ? this.currentPlan?.outputMode ?? normalizeOutputMode(this.currentOutputSettings?.outputMode)
          : null;

    if (reason === 'replace-output' && outputMode === 'asio') {
      return undefined;
    }

    if (reason === 'replace-output' && outputMode === 'shared' && this.currentBridgeSharedBackend !== 'directsound') {
      return sharedReplacementGracefulStopTimeoutMs;
    }

    return outputMode === 'asio' ? asioFailedStartGracefulStopTimeoutMs : undefined;
  }

  private getGracefulStopWaitForExit(reason: string): boolean {
    return (
      reason === 'app-quit' ||
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
    if (isAudioSessionRunCancelledError(error)) {
      this.logger('[AudioSession] ignored superseded playback run cancellation');
      return;
    }

    if (this.tryClaimRecoverableAudioError(error)) {
      this.stopResources();
      this.errorMessage = null;
      this.state = 'loading';
      this.hostStatus = 'starting';
      this.resetWatchdogProgress();
      this.emitStatus();
      return;
    }

    this.stopResources();
    this.errorMessage = error.message;
    this.state = 'error';
    this.hostStatus = 'error';
    this.reportFatalAudioError(error);
    this.resetWatchdogProgress();
    this.emit('error', error, this.getStatus());
    this.emitStatus();
  }

  private tryClaimRecoverableAudioError(error: Error): boolean {
    if (!this.audioErrorRecoveryHandler) {
      return false;
    }

    try {
      return this.audioErrorRecoveryHandler(error, this.getStatus()) === true;
    } catch (recoveryError) {
      this.logger(`[AudioSession] audio error recovery handler failed: ${
        recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      }`);
      return false;
    }
  }

  private assertCurrentRun(token: number): void {
    if (this.runToken !== token) {
      throw new Error('audio_session_run_cancelled');
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private isCurrentLivePcmStream(): boolean {
    return isLivePcmSourcePath(this.currentFilePath) || (
      this.currentFilePath !== null &&
      this.currentDecodeBackendImpl === 'airplay-raop-pcm'
    );
  }

  private skipLivePcmRestart(reason: string, positionSeconds: number): void {
    this.addOutputWarning('live_pcm_restart_skipped');
    this.logger(
      `[AudioSession] ${reason}; live PCM stream cannot be restarted source="${redactUrlSecrets(
        this.currentFilePath ?? 'unknown',
      )}" position=${Math.max(0, positionSeconds).toFixed(3)}`,
    );
    this.resetWatchdogProgress();
    this.emitStatus();
  }

  private createLivePcmResamplerTransform(): PcmLinearResamplerTransform | null {
    if (!this.isCurrentLivePcmStream() || !this.currentProbe || !this.currentPlan) {
      return null;
    }

    const sourceSampleRate = normalizePositiveInteger(this.currentProbe.fileSampleRate);
    const targetSampleRate =
      normalizePositiveInteger(this.currentPlan.actualDeviceSampleRate) ?? normalizePositiveInteger(this.currentPlan.decoderOutputSampleRate);
    const channels = normalizePositiveInteger(this.currentProbe.channels) ?? 2;
    if (!sourceSampleRate || !targetSampleRate || sourceSampleRate === targetSampleRate) {
      return null;
    }

    this.addOutputWarning(`live_pcm_resampled:${sourceSampleRate}->${targetSampleRate}`);
    this.logger(
      `[AudioSession] live PCM resampler enabled source=${sourceSampleRate} target=${targetSampleRate} channels=${channels}`,
    );
    return new PcmLinearResamplerTransform(channels, sourceSampleRate, targetSampleRate);
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

  private async fallbackExclusiveToSharedForInstability(
    positionSeconds: number,
    callerTokenOrOptions: number | StabilityRecoveryOptions = {},
  ): Promise<void> {
    const options = normalizeStabilityRecoveryOptions(callerTokenOrOptions);
    const token = options.runToken ?? this.runToken;
    const releaseSharedStabilityRecovery = options.sharedStabilityRecoveryClaimed || !this.sharedStabilityRecovering;
    if (!options.sharedStabilityRecoveryClaimed) {
      if (this.sharedStabilityRecovering) {
        return;
      }
      this.sharedStabilityRecovering = true;
    }

    let recoveryRunToken: number | null = null;

    try {
      if (!this.isRecoveryRunCurrent(token)) {
        this.logger('[AudioSession] exclusive instability fallback skipped after playback run changed');
        return;
      }

      if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
        return;
      }

      if (this.isCurrentLivePcmStream()) {
        this.skipLivePcmRestart('exclusive_output_unstable', positionSeconds);
        return;
      }

      const outputMode = this.currentPlan?.outputMode ?? normalizeOutputMode(this.currentOutputSettings.outputMode);
      if (outputMode !== 'exclusive') {
        return;
      }

      const filePath = this.currentFilePath;
      const trackId = this.currentTrackId;
      const probe = createProbeHint(this.currentProbe);
      const safePositionSeconds = Math.min(Math.max(0, positionSeconds), this.currentProbe.durationSeconds || Number.POSITIVE_INFINITY);
      const output = createSharedFallbackSettings(this.currentOutputSettings);
      const cause = new Error('exclusive_output_unstable');

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

      if (!this.isRecoveryRunCurrent(token)) {
        this.logger('[AudioSession] exclusive instability fallback aborted before restart after playback run changed');
        return;
      }

      recoveryRunToken = this.runToken + 1;
      await this.playLocalFile({
        filePath,
        trackId: trackId ?? undefined,
        startSeconds: safePositionSeconds,
        output,
        probe,
        inputHeaders: this.currentInputHeaders ?? undefined,
      });
      if (this.runToken !== recoveryRunToken) {
        this.logger('[AudioSession] exclusive instability fallback was superseded after playback restart');
        return;
      }
    } catch (error) {
      if (isAudioSessionRunCancelledError(error)) {
        this.logger('[AudioSession] exclusive instability fallback was superseded by a newer playback run');
      } else {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (releaseSharedStabilityRecovery) {
        this.sharedStabilityRecovering = false;
      }
      if (this.runToken === token || this.runToken === recoveryRunToken) {
        this.resetWatchdogProgress();
      }
    }
  }

  private async recoverOutputStability(
    reason: string,
    positionSeconds: number,
    callerTokenOrOptions: number | StabilityRecoveryOptions = {},
  ): Promise<void> {
    const options = normalizeStabilityRecoveryOptions(callerTokenOrOptions);
    const token = options.runToken ?? this.runToken;
    const releaseSharedStabilityRecovery = options.sharedStabilityRecoveryClaimed || !this.sharedStabilityRecovering;
    if (!options.sharedStabilityRecoveryClaimed) {
      if (this.sharedStabilityRecovering) {
        return;
      }
      this.sharedStabilityRecovering = true;
    }

    let recoveryRunToken: number | null = null;

    try {
      if (!this.isRecoveryRunCurrent(token)) {
        this.logger(`[AudioSession] ${reason}; stability recovery skipped after playback run changed`);
        return;
      }

      if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
        return;
      }

      if (this.isCurrentLivePcmStream()) {
        this.skipLivePcmRestart(reason, positionSeconds);
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

      if (!this.isRecoveryRunCurrent(token)) {
        this.logger(`[AudioSession] ${reason}; stability recovery aborted before restart after playback run changed`);
        return;
      }

      recoveryRunToken = this.runToken + 1;
      await this.playLocalFile({
        filePath,
        trackId: trackId ?? undefined,
        startSeconds: safePositionSeconds,
        output,
        probe,
        inputHeaders: this.currentInputHeaders ?? undefined,
      });
      if (this.runToken !== recoveryRunToken) {
        this.logger(`[AudioSession] ${reason}; stability recovery was superseded after playback restart`);
        return;
      }
    } catch (error) {
      if (isAudioSessionRunCancelledError(error)) {
        this.logger('[AudioSession] output stability recovery was superseded by a newer playback run');
      } else {
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (releaseSharedStabilityRecovery) {
        this.sharedStabilityRecovering = false;
      }
      if (this.runToken === token || this.runToken === recoveryRunToken) {
        this.resetWatchdogProgress();
      }
    }
  }

  private isRecoveryRunCurrent(runToken: number | undefined): boolean {
    return runToken === undefined || this.runToken === runToken;
  }

  private async recoverFromWatchdogStall(positionSeconds: number, callerToken?: number): Promise<void> {
    const token = callerToken ?? this.runToken;

    if (this.watchdogRecovering || this.sharedStabilityRecovering) {
      return;
    }

    this.watchdogRecovering = true;
    try {
      if (!this.currentFilePath || !this.currentOutputSettings || !this.currentProbe || this.state !== 'playing') {
        this.resetWatchdogProgress();
        return;
      }

      if (this.isCurrentLivePcmStream()) {
        this.skipLivePcmRestart('audio_watchdog_recovered_native_output', positionSeconds);
        return;
      }

      await this.recoverOutputStability('audio_watchdog_recovered_native_output', positionSeconds, token);
    } finally {
      this.watchdogRecovering = false;
    }
  }
}

let defaultAudioSession: AudioSession | null = null;

export const getAudioSession = (): AudioSession => {
  defaultAudioSession ??= new AudioSession();
  return defaultAudioSession;
};

export const disposeDefaultAudioSessionGracefully = async (reason = 'app-quit'): Promise<void> => {
  if (!defaultAudioSession) {
    return;
  }

  const session = defaultAudioSession;
  defaultAudioSession = null;
  await session.disposeGracefully(reason);
};
