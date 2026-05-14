export type AudioOutputMode = 'shared' | 'exclusive' | 'asio';

export type AudioPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error';

export type PlaybackSpeedMode = 'nightcore' | 'daycore' | 'speed';
export type ChannelBalanceMonoMode = 'off' | 'sum' | 'left' | 'right';
export type SharedStabilityTier = 'standard' | 'recovery' | 'emergency';

export type ChannelBalanceState = {
  enabled: boolean;
  balance: number;
  leftGainDb: number;
  rightGainDb: number;
  swapLeftRight: boolean;
  monoMode: ChannelBalanceMonoMode;
  invertLeft: boolean;
  invertRight: boolean;
  constantPower: boolean;
  clippingRisk?: boolean;
};

export type AudioLevelTelemetry = {
  inputPeakDb: number | null;
  inputRmsDb: number | null;
  estimatedOutputPeakDb: number | null;
  estimatedOutputRmsDb: number | null;
  headroomDb: number | null;
  clipCount: number;
  lastClipAt: string | null;
  meterSource: 'pre_native_estimated_post_dsp';
};

export const channelBalanceMinBalance = -1;
export const channelBalanceMaxBalance = 1;
export const channelBalanceMinGainDb = -12;
export const channelBalanceMaxGainDb = 6;

export type AudioDeviceInfo = {
  id: string;
  index: number;
  name: string;
  outputMode: Exclude<AudioOutputMode, 'exclusive'>;
  sampleRate: number | null;
  sharedDeviceSampleRate: number | null;
  isDefault: boolean;
};

export type AudioOutputSettings = {
  outputMode?: AudioOutputMode;
  deviceIndex?: number;
  deviceName?: string;
  requestedOutputSampleRate?: number;
  volume?: number;
  playbackRate?: number;
  playbackSpeedMode?: PlaybackSpeedMode;
};

export type AudioStatus = {
  host: 'not-initialized' | 'starting' | 'ready' | 'unavailable' | 'error';
  state: AudioPlaybackState;
  outputDeviceId: string | null;
  outputDeviceName: string | null;
  outputDeviceType: string | null;
  outputBackend: string | null;
  outputMode: AudioOutputMode;
  volume: number;
  playbackRate: number;
  playbackSpeedMode: PlaybackSpeedMode;
  currentFilePath: string | null;
  currentTrackId: string | null;
  durationSeconds: number;
  positionSeconds: number;
  channels: number | null;
  codec: string | null;
  bitDepth: number | null;
  bitrate: number | null;
  fileSampleRate: number | null;
  decoderOutputSampleRate: number | null;
  requestedOutputSampleRate: number | null;
  actualDeviceSampleRate: number | null;
  sharedDeviceSampleRate: number | null;
  resampling: boolean;
  bitPerfectCandidate: boolean;
  sampleRateMismatch: boolean;
  eqEnabled: boolean;
  channelBalanceEnabled: boolean;
  dspActive: boolean;
  preampDb: number;
  eqPresetName: string | null;
  clippingRisk: boolean;
  audioLevels?: AudioLevelTelemetry;
  bitPerfectDisabledReason: string | null;
  sharedStabilityTier?: SharedStabilityTier | null;
  nativeDeviceBufferFrames?: number | null;
  nativeFifoCapacityFrames?: number | null;
  nativeStartupPrebufferFrames?: number | null;
  nativeBufferedFrames?: number | null;
  nativeBufferedMs?: number | null;
  nativeUnderrunCallbacks?: number;
  nativeUnderrunFrames?: number;
  lastSharedStabilityRecoveryAt?: string | null;
  warnings: string[];
  error: string | null;
};

export type AudioDiagnostics = Pick<
  AudioStatus,
  | 'state'
  | 'host'
  | 'outputMode'
  | 'outputBackend'
  | 'outputDeviceName'
  | 'currentFilePath'
  | 'currentTrackId'
  | 'durationSeconds'
  | 'positionSeconds'
  | 'playbackRate'
  | 'fileSampleRate'
  | 'decoderOutputSampleRate'
  | 'requestedOutputSampleRate'
  | 'actualDeviceSampleRate'
  | 'resampling'
  | 'bitPerfectCandidate'
  | 'sampleRateMismatch'
  | 'sharedStabilityTier'
  | 'nativeDeviceBufferFrames'
  | 'nativeFifoCapacityFrames'
  | 'nativeStartupPrebufferFrames'
  | 'nativeBufferedFrames'
  | 'nativeBufferedMs'
  | 'nativeUnderrunCallbacks'
  | 'nativeUnderrunFrames'
  | 'lastSharedStabilityRecoveryAt'
  | 'warnings'
  | 'error'
> & {
  watchdogStatus: 'idle' | 'monitoring' | 'recovering' | 'limited';
  recentWatchdogRecoveryCount: number;
  lastWatchdogRecoveryTime: string | null;
};
