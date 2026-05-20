export type AudioOutputMode = 'shared' | 'exclusive' | 'asio' | 'system';
export type AudioSharedBackend = 'auto' | 'windows' | 'directsound';

export type AudioPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error';

export type PlaybackSpeedMode = 'nightcore' | 'daycore' | 'speed';
export type AudioLatencyProfile = 'stable' | 'balanced' | 'lowLatency';
export type ChannelBalanceMonoMode = 'off' | 'sum' | 'left' | 'right';
export type SharedStabilityTier = 'standard' | 'recovery' | 'emergency';
export type AudioResamplerEngine = 'default' | 'soxr';
export type FfmpegToolchainSource = 'explicit' | 'bundled' | 'dev-bundled' | 'system';
export type AudioDsdOutputMode = 'pcm' | 'dop';
export type ActiveDsdOutputMode = 'pcm' | 'dop' | 'native' | null;
export type AudioAutomixMode = 'off' | 'armed' | 'transitioning';

export type AudioAutomixStatus = {
  enabled: boolean;
  mode: AudioAutomixMode;
  active: boolean;
  transitionSeconds: number | null;
  transitionStartedAtSeconds: number | null;
  nextTrackId: string | null;
  transitionMode?: 'smartCrossfade' | 'beatAligned' | 'energyFade' | 'gaplessFallback' | null;
  fallbackReason?: string | null;
  beatAligned?: boolean;
  skipIntroSilence?: boolean;
  engine?: 'nativeDualDeck' | 'ffmpegPremix' | 'nativeGapless' | 'ffmpegGapless' | 'fallback' | null;
  tempoRatio?: number | null;
  nextStartSeconds?: number | null;
  overlapSeconds?: number | null;
  advanceAtSeconds?: number | null;
  plannedTrackCount?: number;
  nextTransitionIndex?: number;
};

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
  outputMode: Exclude<AudioOutputMode, 'exclusive' | 'system'>;
  sampleRate: number | null;
  sharedDeviceSampleRate: number | null;
  isDefault: boolean;
  asioOutputChannels?: number;
  asioOutputChannelStart?: number;
  asioChannelNames?: string[];
};

export type AudioOutputSettings = {
  outputMode?: AudioOutputMode;
  sharedBackend?: AudioSharedBackend;
  deviceIndex?: number;
  deviceName?: string;
  asioOutputChannelStart?: number;
  requestedOutputSampleRate?: number;
  latencyProfile?: AudioLatencyProfile;
  bufferSizeFrames?: number | null;
  useJuceOutput?: boolean;
  useJuceDecode?: boolean;
  dsdOutputMode?: AudioDsdOutputMode;
  asioNativeDsdExperimentalEnabled?: boolean;
  asioUnavailableFallbackEnabled?: boolean;
  soxrFallbackEnabled?: boolean;
  releaseExclusiveOnPauseExperimentalEnabled?: boolean;
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
  activeOutputBackendImpl: string | null;
  outputMode: AudioOutputMode;
  sharedBackend?: AudioSharedBackend | null;
  useJuceOutputRequested: boolean;
  useJuceDecodeRequested: boolean;
  activeDecodeBackendImpl: string | null;
  dsdOutputModeRequested?: AudioDsdOutputMode;
  activeDsdOutputMode?: ActiveDsdOutputMode;
  dsdNativeSampleRate?: number | null;
  dsdTransportSampleRate?: number | null;
  volume: number;
  playbackRate: number;
  playbackSpeedMode: PlaybackSpeedMode;
  replayGainEnabled?: boolean;
  replayGainMode?: 'off' | 'track' | 'album';
  replayGainAppliedDb?: number;
  replayGainPreventedClipping?: boolean;
  automix?: AudioAutomixStatus;
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
  ffmpegPath?: string | null;
  ffmpegSource?: FfmpegToolchainSource | null;
  ffmpegVersion?: string | null;
  ffmpegHealthy?: boolean;
  soxrAvailable?: boolean;
  resamplerEngine?: AudioResamplerEngine;
  resamplerFallbackActive?: boolean;
  bitPerfectCandidate: boolean;
  sampleRateMismatch: boolean;
  latencyProfile?: AudioLatencyProfile;
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
  nativeRequestedBufferFrames?: number | null;
  nativeActualBufferFrames?: number | null;
  nativeOutputLatencyMs?: number | null;
  nativePositionStalenessMs?: number | null;
  nativeFifoCapacityFrames?: number | null;
  nativeStartupPrebufferFrames?: number | null;
  nativeBufferedFrames?: number | null;
  nativeBufferedMs?: number | null;
  nativeUnderrunCallbacks?: number;
  nativeUnderrunFrames?: number;
  asioOutputChannelStart?: number | null;
  lastSharedStabilityRecoveryAt?: string | null;
  warnings: string[];
  error: string | null;
};

export type AudioSessionResetEvent = {
  reason: string;
  status: AudioStatus;
};

export type AudioDiagnostics = Pick<
  AudioStatus,
  | 'state'
  | 'host'
  | 'outputMode'
  | 'sharedBackend'
  | 'outputBackend'
  | 'activeOutputBackendImpl'
  | 'useJuceOutputRequested'
  | 'useJuceDecodeRequested'
  | 'activeDecodeBackendImpl'
  | 'dsdOutputModeRequested'
  | 'activeDsdOutputMode'
  | 'dsdNativeSampleRate'
  | 'dsdTransportSampleRate'
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
  | 'sharedDeviceSampleRate'
  | 'resampling'
  | 'ffmpegPath'
  | 'ffmpegSource'
  | 'ffmpegVersion'
  | 'ffmpegHealthy'
  | 'soxrAvailable'
  | 'resamplerEngine'
  | 'resamplerFallbackActive'
  | 'bitPerfectCandidate'
  | 'sampleRateMismatch'
  | 'latencyProfile'
  | 'sharedStabilityTier'
  | 'nativeDeviceBufferFrames'
  | 'nativeRequestedBufferFrames'
  | 'nativeActualBufferFrames'
  | 'nativeOutputLatencyMs'
  | 'nativePositionStalenessMs'
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
