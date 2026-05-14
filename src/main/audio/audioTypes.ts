import type { Readable } from 'node:stream';
import type {
  AudioDeviceInfo,
  AudioDiagnostics,
  AudioOutputMode,
  AudioOutputSettings,
  AudioPlaybackState,
  AudioStatus,
} from '../../shared/types/audio';
import type { PlaybackProbeHint } from '../../shared/types/playback';

export type {
  AudioDeviceInfo,
  AudioDiagnostics,
  AudioOutputMode,
  AudioOutputSettings,
  AudioPlaybackState,
  AudioStatus,
};

export type LocalAudioSource = {
  filePath: string;
  trackId?: string;
};

export type AudioProbeResult = {
  filePath: string;
  durationSeconds: number;
  fileSampleRate: number | null;
  channels: number;
  codec: string | null;
  bitDepth: number | null;
  bitrate: number | null;
};

export type SampleRatePlan = {
  fileSampleRate: number | null;
  decoderOutputSampleRate: number;
  requestedOutputSampleRate: number;
  actualDeviceSampleRate: number | null;
  sharedDeviceSampleRate: number | null;
  outputMode: AudioOutputMode;
  resampling: boolean;
  bitPerfectCandidate: boolean;
  sampleRateMismatch: boolean;
  warnings: string[];
};

export type PcmDecodeRequest = {
  filePath: string;
  startSeconds: number;
  channels: number;
  decoderOutputSampleRate: number;
};

export type DecoderRun = {
  stream: Readable;
  stop: () => void;
  done: Promise<void>;
};

export type NativeOutputStartOptions = {
  requestedOutputSampleRate: number;
  channels: number;
  deviceIndex?: number;
  deviceName?: string;
  asio?: boolean;
  exclusive?: boolean;
  bufferSizeFrames?: number;
  fifoCapacityMs?: number;
  startupPrebufferMs?: number;
  startupPrebufferTimeoutMs?: number;
  volume?: number;
  startSeconds?: number;
  playbackRate?: number;
  playbackSpeedMode?: AudioOutputSettings['playbackSpeedMode'];
};

export type NativeOutputTelemetry = {
  positionFrames: number;
  bufferedFrames: number | null;
  underrunCallbacks: number;
  underrunFrames: number;
};

export type NativeBridgeReadyMessage = Record<string, unknown> & {
  ready?: boolean;
  sampleRate?: number;
  sharedSampleRate?: number;
  sharedDeviceSampleRate?: number;
  hardwareSampleRate?: number;
  exclusive?: boolean;
  backend?: string;
  deviceType?: string;
  deviceName?: string;
  eqControlPort?: number;
  deviceBufferFrames?: number;
  fifoCapacityFrames?: number;
  startupPrebufferFrames?: number;
  startupPrebufferTimeoutMs?: number;
};

export type NativeBridgeReadyResult = {
  ok: true;
  device: NativeBridgeReadyMessage;
  requestedOutputSampleRate: number;
  actualDeviceSampleRate: number | null;
};

export type AudioSessionPlayRequest = LocalAudioSource & {
  startSeconds?: number;
  output?: AudioOutputSettings;
  probe?: PlaybackProbeHint;
};

export type AudioCoreEventMap = {
  status: [AudioStatus];
  ended: [AudioStatus];
  error: [Error, AudioStatus];
};
