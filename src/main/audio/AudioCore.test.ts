import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams, execFile as nodeExecFile, execFileSync as nodeExecFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AudioSession, type AudioSessionDependencies } from './AudioSession';
import { DecoderPipeline, resolveDecoderFfmpegPath } from './DecoderPipeline';
import type { DecoderPipelineDependencies } from './DecoderPipeline';
import { DeviceService } from './DeviceService';
import { NativeOutputBridge, resolveHostBinary } from './NativeOutputBridge';
import type { HostSpawner } from './NativeOutputBridge';
import type {
  AudioDeviceInfo,
  AudioProbeResult,
  DecoderRun,
  NativeBridgeReadyResult,
  NativeOutputStartOptions,
  PcmDecodeRequest,
} from './audioTypes';

const noopLogger = (): void => undefined;

const probe = (filePath: string, fileSampleRate: number): AudioProbeResult => ({
  filePath,
  fileSampleRate,
  durationSeconds: 120,
  channels: 2,
  codec: 'FLAC',
  bitDepth: 24,
  bitrate: 1400000,
});

const pcmBuffer = (samples: number[]): Buffer => {
  const buffer = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => {
    buffer.writeFloatLE(sample, index * 4);
  });
  return buffer;
};

class FakeDecoder {
  readonly decodeRequests: PcmDecodeRequest[] = [];
  readonly probeRequests: string[] = [];

  constructor(private readonly probes: Map<string, AudioProbeResult>) {}

  async probeLocalFile(filePath: string): Promise<AudioProbeResult> {
    this.probeRequests.push(filePath);
    const result = this.probes.get(filePath);

    if (!result) {
      throw new Error(`missing probe for ${filePath}`);
    }

    return result;
  }

  decodeLocalFile(request: PcmDecodeRequest): DecoderRun {
    this.decodeRequests.push(request);
    const stream = new PassThrough();
    const stop = vi.fn(() => {
      stream.destroy();
    });

    queueMicrotask(() => {
      if (!stream.destroyed) {
        stream.end();
      }
    });

    return {
      stream,
      stop,
      done: Promise.resolve(),
    };
  }
}

class PcmChunkDecoder extends FakeDecoder {
  constructor(
    probes: Map<string, AudioProbeResult>,
    private readonly chunks: Buffer[],
  ) {
    super(probes);
  }

  override decodeLocalFile(request: PcmDecodeRequest): DecoderRun {
    this.decodeRequests.push(request);
    const stream = new PassThrough();
    const stop = vi.fn(() => {
      stream.destroy();
    });

    queueMicrotask(() => {
      if (stream.destroyed) {
        return;
      }

      this.chunks.forEach((chunk) => stream.write(chunk));
    });

    return {
      stream,
      stop,
      done: new Promise(() => undefined),
    };
  }
}

class FailingDecoder extends FakeDecoder {
  override decodeLocalFile(request: PcmDecodeRequest): DecoderRun {
    this.decodeRequests.push(request);
    const stream = new PassThrough();

    return {
      stream,
      stop: vi.fn(() => {
        stream.destroy();
      }),
      done: Promise.reject(new Error('ffmpeg_missing')),
    };
  }
}

class FakeBridge extends EventEmitter {
  inputEnded = false;
  sessionBegins = 0;
  sessionEnds = 0;
  readonly sessionChunks: Array<{ sessionId: number; chunk: Buffer }> = [];
  readonly writable = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
    final: (callback) => {
      this.inputEnded = true;
      callback();
    },
  });
  readonly stop = vi.fn();
  startOptions: NativeOutputStartOptions | null = null;
  positionSeconds = 0;
  private sessionId = 0;

  constructor(
    private readonly readySampleRate?: number,
    private readonly readyDevicePatch: Partial<NativeBridgeReadyResult['device']> = {},
  ) {
    super();
  }

  async start(options: NativeOutputStartOptions) {
    this.startOptions = options;
    this.positionSeconds = options.startSeconds ?? 0;
    const actualDeviceSampleRate = this.readySampleRate ?? options.requestedOutputSampleRate;
    const requestedBufferFrames = Math.max(1, Math.round(options.bufferSizeFrames ?? 512));

    return {
      ok: true as const,
      device: {
        ready: true,
        sampleRate: actualDeviceSampleRate,
        backend: options.asio ? 'asio' : options.exclusive ? 'wasapi-exclusive' : 'wasapi-shared',
        deviceType: options.asio ? 'ASIO' : options.exclusive ? 'Windows Audio (Exclusive Mode)' : 'Windows Audio (Shared Mode)',
        deviceName: options.deviceName ?? 'Default output',
        deviceBufferFrames: requestedBufferFrames,
        nativeActualBufferFrames: requestedBufferFrames,
        actualBufferFrames: requestedBufferFrames,
        requestedDeviceBufferFrames: requestedBufferFrames,
        openedDeviceBufferFrames: requestedBufferFrames,
        bufferSizeFallback: false,
        ...this.readyDevicePatch,
      },
      requestedOutputSampleRate: options.requestedOutputSampleRate,
      actualDeviceSampleRate,
    };
  }

  getPositionSeconds(): number {
    return this.positionSeconds;
  }

  resetOutputClock(startSeconds = 0): void {
    this.positionSeconds = startSeconds;
  }

  canReuseFor(options: NativeOutputStartOptions): boolean {
    const normalizeSampleRate = (value: unknown): number | null => {
      const numeric = Number(value);

      return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
    };
    const outputMode = options.asio ? 'asio' : options.exclusive ? 'exclusive' : 'shared';
    const startOutputMode = this.startOptions?.asio ? 'asio' : this.startOptions?.exclusive ? 'exclusive' : 'shared';
    const sampleRate =
      outputMode === 'shared'
        ? normalizeSampleRate(options.sharedMixSampleRate) ?? normalizeSampleRate(options.requestedOutputSampleRate)
        : normalizeSampleRate(options.requestedOutputSampleRate);
    const startSampleRate =
      startOutputMode === 'shared'
        ? normalizeSampleRate(this.startOptions?.sharedMixSampleRate) ?? normalizeSampleRate(this.startOptions?.requestedOutputSampleRate)
        : normalizeSampleRate(this.startOptions?.requestedOutputSampleRate);

    return JSON.stringify({
      outputMode,
      deviceIndex: Number.isInteger(Number(options.deviceIndex)) ? Number(options.deviceIndex) : null,
      deviceName: options.deviceName ?? null,
      sampleRate,
      channels: options.channels,
      asio: options.asio === true,
      exclusive: options.exclusive === true,
      bufferSizeFrames: Number.isFinite(Number(options.bufferSizeFrames)) ? Math.round(Number(options.bufferSizeFrames)) : null,
      latencyProfile: options.latencyProfile ?? null,
      playbackSpeedMode: options.playbackSpeedMode ?? null,
    }) === JSON.stringify({
      outputMode: startOutputMode,
      deviceIndex: Number.isInteger(Number(this.startOptions?.deviceIndex)) ? Number(this.startOptions?.deviceIndex) : null,
      deviceName: this.startOptions?.deviceName ?? null,
      sampleRate: startSampleRate,
      channels: this.startOptions?.channels,
      asio: this.startOptions?.asio === true,
      exclusive: this.startOptions?.exclusive === true,
      bufferSizeFrames: Number.isFinite(Number(this.startOptions?.bufferSizeFrames)) ? Math.round(Number(this.startOptions?.bufferSizeFrames)) : null,
      latencyProfile: this.startOptions?.latencyProfile ?? null,
      playbackSpeedMode: this.startOptions?.playbackSpeedMode ?? null,
    });
  }

  beginSession(options: { startSeconds?: number } = {}): number {
    this.sessionBegins += 1;
    this.inputEnded = false;
    this.positionSeconds = options.startSeconds ?? 0;
    this.sessionId += 1;
    return this.sessionId;
  }

  createSessionWritable(sessionId = this.sessionId): Writable {
    return new Writable({
      write: (chunk, _encoding, callback) => {
        this.sessionChunks.push({ sessionId, chunk: Buffer.from(chunk) });
        callback();
      },
      final: (callback) => {
        this.endSession(sessionId);
        callback();
      },
    });
  }

  endSession(_sessionId?: number): void {
    this.sessionEnds += 1;
    this.inputEnded = true;
  }
}

class DelayedReadyBridge extends FakeBridge {
  private resolveStarted: (() => void) | null = null;
  private resolveReady: (() => void) | null = null;

  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });

  releaseReady(): void {
    this.resolveReady?.();
  }

  override async start(options: NativeOutputStartOptions) {
    this.startOptions = options;
    this.positionSeconds = options.startSeconds ?? 0;
    this.resolveStarted?.();
    await new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    return super.start(options);
  }
}

class StartupFailingBridge extends EventEmitter {
  readonly writable = null;
  readonly stop = vi.fn();

  async start(): Promise<NativeBridgeReadyResult> {
    throw new Error(
      'echo-audio-host exit_code_1; host="echo-audio-host.exe"; args="-sr 44100 -ch 2"; stderr="Failed to initialize output device"',
    );
  }

  getPositionSeconds(): number {
    return 0;
  }
}

class ConfigurableStartupFailingBridge extends EventEmitter {
  readonly writable = null;
  readonly stop = vi.fn();
  startOptions: NativeOutputStartOptions | null = null;

  constructor(private readonly message: string) {
    super();
  }

  async start(options: NativeOutputStartOptions): Promise<NativeBridgeReadyResult> {
    this.startOptions = options;
    throw new Error(this.message);
  }

  getPositionSeconds(): number {
    return 0;
  }
}

const createSessionHarness = (
  probes: AudioProbeResult[],
  readySampleRates: number[] = [],
  devices: AudioDeviceInfo[] = [],
  sessionOptions: Partial<AudioSessionDependencies> = {},
) => {
  const decoder = new FakeDecoder(new Map(probes.map((item) => [item.filePath, item])));
  const bridges: FakeBridge[] = [];
  let bridgeIndex = 0;
  const session = new AudioSession({
    decoder,
    deviceService: {
      listDevices: () => devices,
    },
    createBridge: () => {
      const bridge = new FakeBridge(readySampleRates[bridgeIndex]);
      bridgeIndex += 1;
      bridges.push(bridge);
      return bridge;
    },
    logger: noopLogger,
    ...sessionOptions,
  });

  return { decoder, bridges, session };
};

const createLongRunningSessionHarness = (
  probes: AudioProbeResult[],
  readySampleRates: number[] = [],
  devices: AudioDeviceInfo[] = [],
  sessionOptions: Partial<AudioSessionDependencies> = {},
) => {
  const decoder = new PcmChunkDecoder(new Map(probes.map((item) => [item.filePath, item])), [pcmBuffer([0, 0, 0, 0])]);
  const bridges: FakeBridge[] = [];
  let bridgeIndex = 0;
  const session = new AudioSession({
    decoder,
    deviceService: {
      listDevices: () => devices,
    },
    createBridge: () => {
      const bridge = new FakeBridge(readySampleRates[bridgeIndex]);
      bridgeIndex += 1;
      bridges.push(bridge);
      return bridge;
    },
    logger: noopLogger,
    ...sessionOptions,
  });

  return { decoder, bridges, session };
};

class PendingProbeDecoder extends FakeDecoder {
  private resolveProbe: ((probe: AudioProbeResult) => void) | null = null;

  override async probeLocalFile(filePath: string): Promise<AudioProbeResult> {
    this.probeRequests.push(filePath);

    return new Promise((resolve) => {
      this.resolveProbe = resolve;
    });
  }

  finishProbe(probeResult: AudioProbeResult): void {
    this.resolveProbe?.(probeResult);
    this.resolveProbe = null;
  }
}

describe('Audio Core sample-rate regression guard', () => {
  it('44.1k file + exclusive requests 44100 and never defaults to 48000', async () => {
    const { bridges, session } = createSessionHarness([probe('441.flac', 44100)]);

    const status = await session.playLocalFile({
      filePath: '441.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(status.fileSampleRate).toBe(44100);
    expect(status.decoderOutputSampleRate).toBe(44100);
    expect(status.requestedOutputSampleRate).toBe(44100);
    expect(status.outputBackend).toBe('wasapi-exclusive');
    expect(status.outputDeviceType).toBe('Windows Audio (Exclusive Mode)');
    expect(status.outputDeviceName).toBe('Default output');
    expect(bridges[0].startOptions).toMatchObject({
      requestedOutputSampleRate: 44100,
      exclusive: true,
      asio: false,
    });
  });

  it('48k file + exclusive requests 48000', async () => {
    const { bridges, session } = createSessionHarness([probe('48.flac', 48000)]);

    const status = await session.playLocalFile({
      filePath: '48.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(status.requestedOutputSampleRate).toBe(48000);
    expect(bridges[0].startOptions?.requestedOutputSampleRate).toBe(48000);
  });

  it('closes native input when the decoder reaches EOF', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridges[0].inputEnded).toBe(true);
  });

  it('exposes pre-native PCM level telemetry after volume is applied', async () => {
    const decoder = new PcmChunkDecoder(new Map([['meter.flac', probe('meter.flac', 44100)]]), [pcmBuffer([1, -1])]);
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => new FakeBridge(),
      logger: noopLogger,
    });

    await session.playLocalFile({ filePath: 'meter.flac', output: { outputMode: 'shared', volume: 0.5 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = session.getStatus();

    expect(status.audioLevels?.inputPeakDb).toBe(-6);
    expect(status.audioLevels?.inputRmsDb).toBe(-6);
    expect(status.audioLevels?.meterSource).toBe('pre_native_estimated_post_dsp');
    session.stop();
  });

  it('raises realtime clipping risk from estimated output level and clip count', async () => {
    const decoder = new PcmChunkDecoder(new Map([['hot.flac', probe('hot.flac', 44100)]]), [pcmBuffer([1, 0.5])]);
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => new FakeBridge(),
      logger: noopLogger,
    });

    await session.playLocalFile({ filePath: 'hot.flac', output: { outputMode: 'shared' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = session.getStatus();

    expect(status.audioLevels?.estimatedOutputPeakDb).toBe(0);
    expect(status.audioLevels?.clipCount).toBe(1);
    expect(status.clippingRisk).toBe(true);
    expect(status.warnings).toContain('audio_level_clipping_risk');
    expect(status.warnings).toContain('audio_level_clipped');
    session.stop();
  });

  it('resets level telemetry on stop', async () => {
    const decoder = new PcmChunkDecoder(new Map([['reset.flac', probe('reset.flac', 44100)]]), [pcmBuffer([0.5, -0.5])]);
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => new FakeBridge(),
      logger: noopLogger,
    });

    await session.playLocalFile({ filePath: 'reset.flac', output: { outputMode: 'shared' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.getStatus().audioLevels?.inputPeakDb).toBe(-6);

    const stopped = session.stop();

    expect(stopped.audioLevels?.inputPeakDb).toBeNull();
    expect(stopped.audioLevels?.clipCount).toBe(0);
  });

  it('stop closes resident exclusive output', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'exclusive' } });
    const status = session.stop();

    expect(status.state).toBe('stopped');
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
  });

  it('96k file + exclusive requests 96000', async () => {
    const { bridges, session } = createSessionHarness([probe('96.flac', 96000)]);

    const status = await session.playLocalFile({
      filePath: '96.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(status.requestedOutputSampleRate).toBe(96000);
    expect(bridges[0].startOptions?.requestedOutputSampleRate).toBe(96000);
  });

  it('switching 48k to 44.1k exclusive reopens at the source rate', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('48.flac', 48000), probe('441.flac', 44100)]);

    await session.playLocalFile({ filePath: '48.flac', output: { outputMode: 'exclusive' } });
    const status = await session.playLocalFile({ filePath: '441.flac', output: { outputMode: 'exclusive' } });

    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(status.requestedOutputSampleRate).toBe(44100);
    expect(status.actualDeviceSampleRate).toBe(44100);
    expect(status.decoderOutputSampleRate).toBe(44100);
    expect(status.resampling).toBe(false);
    expect(status.bitPerfectCandidate).toBe(true);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({
      filePath: '441.flac',
      decoderOutputSampleRate: 44100,
    });
  });

  it('switching 44.1k to 96k exclusive reopens at 96000', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('441.flac', 44100), probe('96.flac', 96000)]);

    await session.playLocalFile({ filePath: '441.flac', output: { outputMode: 'exclusive' } });
    const status = await session.playLocalFile({ filePath: '96.flac', output: { outputMode: 'exclusive' } });

    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(status.requestedOutputSampleRate).toBe(96000);
    expect(status.decoderOutputSampleRate).toBe(96000);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({
      filePath: '96.flac',
      decoderOutputSampleRate: 96000,
    });
  });

  it('reuses the native bridge for consecutive tracks with the same output plan', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('first.flac', 44100), probe('second.flac', 44100)]);

    await session.playLocalFile({ filePath: 'first.flac', output: { outputMode: 'shared' } });
    await session.playLocalFile({ filePath: 'second.flac', output: { outputMode: 'shared' } });

    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
    expect(bridges[0].sessionBegins).toBe(2);
    expect(decoder.decodeRequests.map((request) => request.filePath)).toEqual(['first.flac', 'second.flac']);
  });

  it('reuses shared output across source sample-rate changes at the fixed mix rate', async () => {
    const { bridges, decoder, session } = createSessionHarness([
      probe('441.flac', 44100),
      probe('48.flac', 48000),
      probe('96.flac', 96000),
    ], [48000]);

    await session.playLocalFile({ filePath: '441.flac', output: { outputMode: 'shared' } });
    await session.playLocalFile({ filePath: '48.flac', output: { outputMode: 'shared' } });
    const status = await session.playLocalFile({ filePath: '96.flac', output: { outputMode: 'shared' } });

    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
    expect(bridges[0].sessionBegins).toBe(3);
    expect(status.requestedOutputSampleRate).toBe(48000);
    expect(status.decoderOutputSampleRate).toBe(48000);
    expect(decoder.decodeRequests.map((request) => request.decoderOutputSampleRate)).toEqual([48000, 48000, 48000]);
  });

  it('logs shared transition diagnostics with host reuse state', async () => {
    const logs: string[] = [];
    const { bridges, session } = createSessionHarness(
      [probe('441.flac', 44100), probe('96.flac', 96000)],
      [48000],
      [],
      { logger: (message) => logs.push(message) },
    );

    await session.playLocalFile({ filePath: '441.flac', output: { outputMode: 'shared' } });
    await session.playLocalFile({ filePath: '96.flac', output: { outputMode: 'shared' } });

    const transitions = logs
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.event === 'audio_transition');

    expect(bridges).toHaveLength(1);
    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toMatchObject({
      outputMode: 'shared',
      sourceSampleRate: 44100,
      sharedMixRate: 48000,
      decoderOutputRate: 48000,
      hostReused: false,
      hostRestartReason: 'initial_start',
    });
    expect(transitions[1]).toMatchObject({
      outputMode: 'shared',
      sourceSampleRate: 96000,
      sharedMixRate: 48000,
      decoderOutputRate: 48000,
      hostReused: true,
      hostRestartReason: null,
    });
  });

  it('prepareLocalFile caches a complete provided probe without probing the file', async () => {
    const completeProbe = {
      durationSeconds: 120,
      fileSampleRate: 44100,
      channels: 2,
      codec: 'flac',
      bitDepth: 16,
      bitrate: 900000,
    };
    const { decoder, session } = createSessionHarness([probe('prepared.flac', 44100)]);

    await session.prepareLocalFile({ filePath: 'prepared.flac', trackId: 'prepared', probe: completeProbe });

    expect(decoder.probeRequests).toEqual([]);
  });

  it('prepareLocalFile probes and caches when the provided probe is incomplete', async () => {
    const { decoder, session } = createSessionHarness([probe('incomplete.flac', 96000)]);

    await session.prepareLocalFile({
      filePath: 'incomplete.flac',
      trackId: 'incomplete',
      probe: { durationSeconds: 120 },
    });
    await session.playLocalFile({ filePath: 'incomplete.flac', trackId: 'incomplete' });

    expect(decoder.probeRequests).toEqual(['incomplete.flac']);
    expect(decoder.decodeRequests[0]).toMatchObject({
      filePath: 'incomplete.flac',
      decoderOutputSampleRate: 48000,
    });
  });

  it('playLocalFile uses a fresh prepared local probe and reports it in transition diagnostics', async () => {
    let now = 1_000;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const logs: string[] = [];
    const completeProbe = {
      durationSeconds: 120,
      fileSampleRate: 44100,
      channels: 2,
      codec: 'flac',
      bitDepth: 16,
      bitrate: 900000,
    };
    const { decoder, session } = createSessionHarness([probe('prepared-play.flac', 44100)], [48000], [], {
      logger: (message) => logs.push(message),
    });

    await session.prepareLocalFile({ filePath: 'prepared-play.flac', trackId: 'prepared-play', probe: completeProbe });
    now += 750;
    await session.playLocalFile({ filePath: 'prepared-play.flac', trackId: 'prepared-play' });
    dateNow.mockRestore();

    const transitions = logs
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.event === 'audio_transition');

    expect(decoder.probeRequests).toEqual([]);
    expect(transitions.at(-1)).toMatchObject({
      preparedLocalProbeUsed: true,
      preparedLocalProbeAgeMs: 750,
    });
  });

  it('playLocalFile falls back to probing when the local prepare cache is missing', async () => {
    const { decoder, session } = createSessionHarness([probe('miss.flac', 44100)]);

    await session.playLocalFile({ filePath: 'miss.flac', trackId: 'miss' });

    expect(decoder.probeRequests).toEqual(['miss.flac']);
  });

  it('expires prepared local probes after the short TTL', async () => {
    let now = 1_000;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const completeProbe = {
      durationSeconds: 120,
      fileSampleRate: 44100,
      channels: 2,
      codec: 'flac',
      bitDepth: 16,
      bitrate: 900000,
    };
    const { decoder, session } = createSessionHarness([probe('expired.flac', 44100)]);

    await session.prepareLocalFile({ filePath: 'expired.flac', trackId: 'expired', probe: completeProbe });
    now += 121_000;
    await session.playLocalFile({ filePath: 'expired.flac', trackId: 'expired' });
    dateNow.mockRestore();

    expect(decoder.probeRequests).toEqual(['expired.flac']);
  });

  it('separates prepared local probes by output context', async () => {
    const completeProbe = {
      durationSeconds: 120,
      fileSampleRate: 44100,
      channels: 2,
      codec: 'flac',
      bitDepth: 16,
      bitrate: 900000,
    };
    const { decoder, session } = createSessionHarness([probe('context.flac', 44100)]);

    await session.prepareLocalFile({ filePath: 'context.flac', trackId: 'context', probe: completeProbe });
    await session.playLocalFile({ filePath: 'context.flac', trackId: 'context', output: { outputMode: 'exclusive' } });

    expect(decoder.probeRequests).toEqual(['context.flac']);
  });

  it('does not reuse exclusive output across sample-rate changes', async () => {
    const { bridges, session } = createSessionHarness([probe('48.flac', 48000), probe('441.flac', 44100)]);

    await session.playLocalFile({ filePath: '48.flac', output: { outputMode: 'exclusive' } });
    await session.playLocalFile({ filePath: '441.flac', output: { outputMode: 'exclusive' } });

    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
  });

  it('shared mode keeps file and actual device rates separate and reports resampling', async () => {
    const sharedDevice: AudioDeviceInfo = {
      id: 'shared:0',
      index: 0,
      name: 'Speakers',
      outputMode: 'shared',
      sampleRate: 48000,
      sharedDeviceSampleRate: 48000,
      isDefault: true,
    };
    const { session } = createSessionHarness([probe('441.flac', 44100)], [48000], [sharedDevice]);

    const status = await session.playLocalFile({
      filePath: '441.flac',
      output: { outputMode: 'shared', deviceIndex: 0 },
    });

    expect(status.fileSampleRate).toBe(44100);
    expect(status.requestedOutputSampleRate).toBe(48000);
    expect(status.actualDeviceSampleRate).toBe(48000);
    expect(status.sharedDeviceSampleRate).toBe(48000);
    expect(status.resampling).toBe(true);
    expect(status.warnings).toContain('shared_output_resampling_or_mixer_rate_difference');
  });

  it('uses the system default shared mix rate without pinning the default device', async () => {
    const sharedDevice: AudioDeviceInfo = {
      id: 'shared:0',
      index: 0,
      name: 'Speakers',
      outputMode: 'shared',
      sampleRate: 48000,
      sharedDeviceSampleRate: 48000,
      isDefault: true,
    };
    const { bridges, decoder, session } = createSessionHarness([probe('441.flac', 44100)], [48000], [sharedDevice]);

    const status = await session.playLocalFile({
      filePath: '441.flac',
      output: { outputMode: 'shared' },
    });

    expect(status.requestedOutputSampleRate).toBe(48000);
    expect(status.decoderOutputSampleRate).toBe(48000);
    expect(status.sharedDeviceSampleRate).toBe(48000);
    expect(status.latencyProfile).toBe('balanced');
    expect(bridges[0].startOptions?.deviceIndex).toBeUndefined();
    expect(bridges[0].startOptions?.deviceName).toBeUndefined();
    expect(bridges[0].startOptions).toMatchObject({
      requestedOutputSampleRate: 48000,
      bufferSizeFrames: 2048,
      fifoCapacityMs: 420,
      startupPrebufferMs: 120,
      startupPrebufferTimeoutMs: 450,
      latencyProfile: 'balanced',
    });
    expect(decoder.decodeRequests[0].decoderOutputSampleRate).toBe(48000);
  });

  it('includes the shared mixer rate in audio diagnostics', async () => {
    const sharedDevice: AudioDeviceInfo = {
      id: 'shared:0',
      index: 0,
      name: 'Speakers',
      outputMode: 'shared',
      sampleRate: 48000,
      sharedDeviceSampleRate: 48000,
      isDefault: true,
    };
    const { session } = createSessionHarness([probe('441.flac', 44100)], [48000], [sharedDevice]);

    await session.playLocalFile({
      filePath: '441.flac',
      output: { outputMode: 'shared' },
    });

    expect(session.getDiagnostics().sharedDeviceSampleRate).toBe(48000);
  });

  it('prefers stored device name over stale device index after host replacement', async () => {
    const devices: AudioDeviceInfo[] = [
      {
        id: 'shared:0',
        index: 0,
        name: 'TEAC USB AUDIO DEVICE',
        outputMode: 'shared',
        sampleRate: 48000,
        sharedDeviceSampleRate: 48000,
        isDefault: true,
      },
      {
        id: 'shared:6',
        index: 6,
        name: 'VoiceMeeter Aux Input',
        outputMode: 'shared',
        sampleRate: 48000,
        sharedDeviceSampleRate: 48000,
        isDefault: false,
      },
    ];
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)], [48000], devices);

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared', deviceIndex: 6, deviceName: 'TEAC USB AUDIO DEVICE' },
    });

    expect(bridges[0].startOptions).toMatchObject({
      deviceIndex: 6,
      deviceName: 'TEAC USB AUDIO DEVICE',
    });
  });

  it('falls back to the system default shared device when the selected shared device fails', async () => {
    const failingBridge = new ConfigurableStartupFailingBridge('output open failed: device disappeared');
    const fallbackBridge = new FakeBridge(48000);
    const bridges = [failingBridge, fallbackBridge];
    const reportAudioError = vi.fn();
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['song.flac', probe('song.flac', 44100)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => bridges.shift() as unknown as FakeBridge,
      reportAudioError,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared', deviceIndex: 6, deviceName: 'Missing USB DAC' },
    });

    expect(failingBridge.stop).toHaveBeenCalledTimes(1);
    expect(failingBridge.startOptions).toMatchObject({ deviceIndex: 6, deviceName: 'Missing USB DAC' });
    expect(fallbackBridge.startOptions?.deviceIndex).toBeUndefined();
    expect(fallbackBridge.startOptions?.deviceName).toBeUndefined();
    expect(status.state).toBe('playing');
    expect(status.warnings).toContain('shared_output_fell_back_to_default_device');
  });

  it('marks selected shared device timeout recovery when the default shared device starts', async () => {
    const failingBridge = new ConfigurableStartupFailingBridge(
      'echo-audio-host timeout_waiting_for_ready; host="echo-audio-host.exe"; args="-sr 44100 -ch 2"; mode="shared"; elapsedMs=15000',
    );
    const fallbackBridge = new FakeBridge(48000);
    const bridges = [failingBridge, fallbackBridge];
    const reportAudioError = vi.fn();
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['song.flac', probe('song.flac', 44100)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => bridges.shift() as unknown as FakeBridge,
      reportAudioError,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared', deviceIndex: 6, deviceName: 'Sleeping USB DAC' },
    });

    expect(fallbackBridge.startOptions?.deviceIndex).toBeUndefined();
    expect(fallbackBridge.startOptions?.deviceName).toBeUndefined();
    expect(status.state).toBe('playing');
    expect(status.warnings).toContain('shared_output_recovered_to_default_device');
    expect(reportAudioError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('timeout_waiting_for_ready'),
      phase: 'output-start',
      severity: 'recoverable',
    }));
  });

  it('uses safe shared output when the default shared device also fails', async () => {
    const defaultBridge = new ConfigurableStartupFailingBridge(
      'echo-audio-host timeout_waiting_for_ready; host="echo-audio-host.exe"; args="-sr 44100 -ch 2"; mode="shared"; elapsedMs=15000',
    );
    const safeBridge = new FakeBridge(48000);
    const bridges = [defaultBridge, safeBridge];
    const reportAudioError = vi.fn();
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['song.flac', probe('song.flac', 44100)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => bridges.shift() as unknown as FakeBridge,
      reportAudioError,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared' },
    });

    expect(defaultBridge.stop).toHaveBeenCalledTimes(1);
    expect(safeBridge.startOptions).not.toHaveProperty('deviceIndex');
    expect(safeBridge.startOptions).not.toHaveProperty('deviceName');
    expect(safeBridge.startOptions).toMatchObject({
      bufferSizeFrames: 8192,
      fifoCapacityMs: 1500,
      startupPrebufferMs: 250,
    });
    expect(status.state).toBe('playing');
    expect(status.latencyProfile).toBe('stable');
    expect(status.sharedStabilityTier).toBe('emergency');
    expect(status.warnings).toContain('shared_output_recovered_safe_mode');
    expect(reportAudioError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('timeout_waiting_for_ready'),
      phase: 'safe-shared-fallback',
      severity: 'recoverable',
    }));
  });

  it('uses library probe hints and avoids device enumeration on the playback hot path', async () => {
    const decoder = new FakeDecoder(new Map());
    const bridges: FakeBridge[] = [];
    let listCalls = 0;
    const session = new AudioSession({
      decoder,
      deviceService: {
        listDevices: () => {
          listCalls += 1;
          return [];
        },
      },
      createBridge: () => {
        const bridge = new FakeBridge(48000);
        bridges.push(bridge);
        return bridge;
      },
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'hinted.flac',
      trackId: 'track-1',
      output: { outputMode: 'shared', deviceIndex: 6, deviceName: 'TEAC USB AUDIO DEVICE' },
      probe: {
        durationSeconds: 123,
        fileSampleRate: 44100,
        channels: 2,
        codec: 'FLAC',
        bitDepth: 24,
        bitrate: 1400000,
      },
    });

    expect(listCalls).toBe(0);
    expect(status.durationSeconds).toBe(123);
    expect(status.fileSampleRate).toBe(44100);
    expect(bridges[0].startOptions).toMatchObject({
      deviceIndex: 6,
      deviceName: 'TEAC USB AUDIO DEVICE',
    });
    expect(decoder.decodeRequests[0]).toMatchObject({
      filePath: 'hinted.flac',
      decoderOutputSampleRate: 48000,
    });
  });

  it('falls back to shared output when exclusive opens at the wrong sample rate', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('441.flac', 44100)], [48000, 48000]);

    const status = await session.playLocalFile({
      filePath: '441.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges[0].startOptions).toMatchObject({ exclusive: true, requestedOutputSampleRate: 44100 });
    expect(bridges[1].startOptions).toMatchObject({ exclusive: false, requestedOutputSampleRate: 48000 });
    expect(status.outputMode).toBe('shared');
    expect(status.outputBackend).toBe('wasapi-shared');
    expect(status.actualDeviceSampleRate).toBe(48000);
    expect(status.requestedOutputSampleRate).toBe(48000);
    expect(status.sampleRateMismatch).toBe(false);
    expect(status.resampling).toBe(true);
    expect(status.warnings).toContain('exclusive_output_fell_back_to_shared');
    expect(status.warnings).toContain('shared_output_resampling_or_mixer_rate_difference');
    expect(status.error).toBeNull();
    expect(decoder.decodeRequests[0]).toMatchObject({
      filePath: '441.flac',
      decoderOutputSampleRate: 48000,
    });
  });

  it('falls back to shared output when exclusive startup fails', async () => {
    const decoder = new FakeDecoder(new Map([['song.flac', probe('song.flac', 44100)]]));
    const failingBridge = new ConfigurableStartupFailingBridge('WASAPI exclusive open failed: AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED');
    const fallbackBridge = new FakeBridge(48000);
    const bridges = [failingBridge, fallbackBridge];
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => bridges.shift() as unknown as FakeBridge,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(failingBridge.stop).toHaveBeenCalledTimes(1);
    expect(failingBridge.startOptions).toMatchObject({ exclusive: true });
    expect(fallbackBridge.startOptions).toMatchObject({ exclusive: false });
    expect(status.state).toBe('playing');
    expect(status.outputMode).toBe('shared');
    expect(status.outputBackend).toBe('wasapi-shared');
    expect(status.warnings).toContain('exclusive_output_fell_back_to_shared');
    expect(status.error).toBeNull();
  });

  it('ASIO ready metadata is exposed in AudioStatus', async () => {
    const { bridges, session } = createSessionHarness([probe('asio.flac', 96000)]);

    const status = await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', deviceName: 'TEAC ASIO USB DRIVER' },
    });

    expect(status.outputMode).toBe('asio');
    expect(status.outputBackend).toBe('asio');
    expect(status.outputDeviceType).toBe('ASIO');
    expect(status.outputDeviceName).toBe('TEAC ASIO USB DRIVER');
    expect(bridges[0].startOptions).toMatchObject({
      asio: true,
      exclusive: false,
      deviceName: 'TEAC ASIO USB DRIVER',
    });
  });

  it('passes explicit ASIO buffer size requests through to the native bridge', async () => {
    const { bridges, session } = createSessionHarness([probe('asio.flac', 48000)]);

    const status = await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });

    expect(bridges[0].startOptions).toMatchObject({
      asio: true,
      bufferSizeFrames: 128,
    });
    expect(status.nativeRequestedBufferFrames).toBe(128);
    expect(status.nativeActualBufferFrames).toBe(128);
  });

  it('reports ASIO buffer fallback metadata when the driver opens a larger buffer', async () => {
    const bridge = new FakeBridge(48000, {
      deviceBufferFrames: 512,
      nativeActualBufferFrames: 512,
      actualBufferFrames: 512,
      requestedDeviceBufferFrames: 128,
      openedDeviceBufferFrames: 512,
      bufferSizeFallback: true,
    });
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['asio.flac', probe('asio.flac', 48000)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => bridge,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });

    expect(status.nativeRequestedBufferFrames).toBe(128);
    expect(status.nativeActualBufferFrames).toBe(512);
    expect(status.nativeOutputLatencyMs).toBe(11);
    expect(status.warnings).toContain('native_output_buffer_size_fell_back:128->512');
  });

  it('restarts ASIO output when the requested buffer size changes', async () => {
    const { bridges, session } = createLongRunningSessionHarness([probe('asio.flac', 48000)]);

    await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });
    bridges[0].positionSeconds = 8.5;
    const status = await session.setOutput({ bufferSizeFrames: 256 });

    expect(status.state).toBe('playing');
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      asio: true,
      bufferSizeFrames: 256,
      startSeconds: 8.5,
    });
  });

  it('reuses ASIO output for consecutive tracks with the same explicit buffer size', async () => {
    const { bridges, session } = createSessionHarness([probe('first-asio.flac', 48000), probe('second-asio.flac', 48000)]);

    await session.playLocalFile({
      filePath: 'first-asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });
    await session.playLocalFile({
      filePath: 'second-asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });

    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
    expect(bridges[0].sessionBegins).toBe(2);
  });

  it('reopens ASIO output across sample-rate changes and decodes to the requested rate', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('first-asio.flac', 48000), probe('second-asio.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'first-asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });
    const status = await session.playLocalFile({
      filePath: 'second-asio.flac',
      output: { outputMode: 'asio', bufferSizeFrames: 128 },
    });

    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(status.requestedOutputSampleRate).toBe(44100);
    expect(status.decoderOutputSampleRate).toBe(44100);
    expect(status.resampling).toBe(false);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({
      filePath: 'second-asio.flac',
      decoderOutputSampleRate: 44100,
    });
  });

  it('uses balanced native buffering for WASAPI exclusive by default', async () => {
    const { bridges, session } = createSessionHarness([probe('exclusive.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'exclusive.flac',
      output: { outputMode: 'exclusive' },
    });

    const startOptions = bridges[0].startOptions;
    expect(startOptions).toMatchObject({
      exclusive: true,
      bufferSizeFrames: 2048,
      latencyProfile: 'balanced',
    });
    expect(startOptions?.startupPrebufferMs).toBeUndefined();
    expect(startOptions?.startupPrebufferTimeoutMs).toBeUndefined();
  });

  it('ignores low-latency requests for WASAPI exclusive output', async () => {
    const { bridges, session } = createSessionHarness([probe('exclusive.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'exclusive.flac',
      output: { outputMode: 'exclusive', latencyProfile: 'lowLatency' },
    });

    expect(bridges[0].startOptions).toMatchObject({
      exclusive: true,
      bufferSizeFrames: 2048,
      latencyProfile: 'balanced',
    });
  });

  it('uses the adaptive low-latency 256-frame native buffer for ASIO by default', async () => {
    const { bridges, session } = createSessionHarness([probe('asio.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio' },
    });

    expect(bridges[0].startOptions).toMatchObject({
      asio: true,
      bufferSizeFrames: 256,
      startupPrebufferMs: 0,
      startupPrebufferTimeoutMs: 0,
      latencyProfile: 'lowLatency',
    });
  });

  it('reports native buffer fallback warnings and latency from ready metadata', async () => {
    const bridge = new FakeBridge(44100, {
      deviceBufferFrames: 4096,
      nativeActualBufferFrames: 4096,
      actualBufferFrames: 4096,
      requestedDeviceBufferFrames: 512,
      openedDeviceBufferFrames: 4096,
      bufferSizeFallback: true,
    });
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['fallback.flac', probe('fallback.flac', 44100)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => bridge,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'fallback.flac',
      output: { outputMode: 'exclusive' },
    });

    expect(status.warnings).toContain('native_output_buffer_size_fell_back:512->4096');
    expect(status.nativeActualBufferFrames).toBe(4096);
    expect(status.nativeOutputLatencyMs).toBe(93);
  });

  it('keeps ASIO playback alive when the driver opens at its hardware sample rate', async () => {
    const decoder = new FakeDecoder(new Map([['asio.flac', probe('asio.flac', 44100)]]));
    const bridge = new FakeBridge(48000);
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => bridge,
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', deviceName: 'Realtek ASIO' },
    });

    expect(status.outputMode).toBe('asio');
    expect(status.requestedOutputSampleRate).toBe(44100);
    expect(status.actualDeviceSampleRate).toBe(48000);
    expect(status.decoderOutputSampleRate).toBe(48000);
    expect(status.resampling).toBe(true);
    expect(status.bitPerfectCandidate).toBe(false);
    expect(status.warnings).toContain('actual_device_sample_rate_mismatch:44100->48000');
    expect(decoder.decodeRequests[0]).toMatchObject({
      filePath: 'asio.flac',
      decoderOutputSampleRate: 48000,
    });
  });

  it('falls back to the default ASIO device when a selected ASIO driver refuses to open', async () => {
    const devices: AudioDeviceInfo[] = [
      {
        id: 'asio:0',
        index: 0,
        name: 'FlexASIO',
        outputMode: 'asio',
        sampleRate: null,
        sharedDeviceSampleRate: 48000,
        isDefault: true,
      },
      {
        id: 'asio:2',
        index: 2,
        name: 'TEAC ASIO USB DRIVER',
        outputMode: 'asio',
        sampleRate: null,
        sharedDeviceSampleRate: 48000,
        isDefault: false,
      },
    ];
    const decoder = new FakeDecoder(new Map([['asio.flac', probe('asio.flac', 44100)]]));
    const failingBridge = new ConfigurableStartupFailingBridge('ASIO open failed: No device found.');
    const fallbackBridge = new FakeBridge(44100);
    const bridges = [failingBridge, fallbackBridge];
    const session = new AudioSession({
      decoder,
      deviceService: {
        listDevices: () => devices,
      },
      createBridge: () => bridges.shift() ?? new FakeBridge(44100),
      logger: noopLogger,
    });

    const status = await session.playLocalFile({
      filePath: 'asio.flac',
      output: { outputMode: 'asio', deviceIndex: 2, deviceName: 'TEAC ASIO USB DRIVER' },
    });

    expect(status.outputMode).toBe('asio');
    expect(status.outputBackend).toBe('asio');
    expect(status.outputDeviceName).toBe('FlexASIO');
    expect(failingBridge.startOptions).toMatchObject({
      asio: true,
      deviceIndex: 2,
      deviceName: 'TEAC ASIO USB DRIVER',
    });
    expect(fallbackBridge.startOptions).toMatchObject({
      asio: true,
      deviceIndex: 0,
      deviceName: 'FlexASIO',
    });
  });

  it('pause stops the active native host and prewarms resume output at the current position', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 12.5;
    const status = session.pause();

    expect(status.state).toBe('paused');
    expect(status.positionSeconds).toBe(12.5);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({ startSeconds: 12.5 });
  });

  it('play resumes a paused file from the prewarmed output host', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 18.25;
    session.pause();
    await Promise.resolve();
    await Promise.resolve();
    const status = await session.play();

    expect(status.state).toBe('playing');
    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges[1].positionSeconds).toBe(18.25);
    expect(decoder.probeRequests).toEqual(['song.flac']);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({ startSeconds: 18.25 });
  });

  it('pause keeps resident exclusive output open and play resumes through the same host', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'exclusive' } });
    bridges[0].positionSeconds = 14.5;
    const pausedStatus = session.pause();
    const resumedStatus = await session.play();

    expect(pausedStatus.state).toBe('paused');
    expect(pausedStatus.host).toBe('ready');
    expect(resumedStatus.state).toBe('playing');
    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
    expect(bridges[0].sessionBegins).toBe(2);
    expect(bridges[0].sessionEnds).toBeGreaterThanOrEqual(1);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({ startSeconds: 14.5 });
  });

  it('does not resume from a paused prewarm bridge before its actual sample rate is ready', async () => {
    const decoder = new FakeDecoder(new Map([['song.flac', probe('song.flac', 192000)]]));
    const initialBridge = new FakeBridge(48000);
    const delayedPrewarmBridge = new DelayedReadyBridge(48000);
    const resumedBridge = new FakeBridge(48000);
    const bridges = [initialBridge, delayedPrewarmBridge, resumedBridge];
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => bridges.shift() as FakeBridge,
      logger: noopLogger,
    });

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    initialBridge.positionSeconds = 18.25;
    session.pause();
    await delayedPrewarmBridge.started;

    const status = await session.play();
    delayedPrewarmBridge.releaseReady();

    expect(status.state).toBe('playing');
    expect(delayedPrewarmBridge.stop).toHaveBeenCalledTimes(1);
    expect(resumedBridge.startOptions).toMatchObject({ startSeconds: 18.25 });
    expect(decoder.decodeRequests.at(-1)).toMatchObject({
      startSeconds: 18.25,
      decoderOutputSampleRate: 48000,
    });
    expect(decoder.decodeRequests.some((request) => request.decoderOutputSampleRate === 192000)).toBe(false);
  });

  it('seek while paused moves the stored position without starting playback', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 7;
    session.pause();
    const pausedStatus = await session.seek(33);

    expect(pausedStatus.state).toBe('paused');
    expect(pausedStatus.positionSeconds).toBe(33);
    expect(bridges).toHaveLength(3);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges[1].stop).toHaveBeenCalledTimes(1);
    expect(bridges[2].startOptions).toMatchObject({ startSeconds: 33 });

    await Promise.resolve();
    await Promise.resolve();
    await session.play();
    expect(bridges).toHaveLength(3);
    expect(session.getStatus().positionSeconds).toBe(33);
  });

  it('seek while playing reuses the active output host', async () => {
    const { bridges, decoder, session } = createLongRunningSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 12;
    const status = await session.seek(42);

    expect(status.state).toBe('playing');
    expect(status.positionSeconds).toBe(42);
    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
    expect(decoder.decodeRequests.at(-1)).toMatchObject({
      filePath: 'song.flac',
      startSeconds: 42,
    });
  });

  it('changing volume while playing updates status without restarting output', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 21.75;
    const status = await session.setOutput({ volume: 0.35 });

    expect(status.state).toBe('playing');
    expect(status.volume).toBe(0.35);
    expect(status.positionSeconds).toBe(21.75);
    expect(bridges).toHaveLength(1);
    expect(bridges[0].stop).not.toHaveBeenCalled();
  });

  it('switching output while playing restarts the current file on the new device', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared', deviceIndex: 0, deviceName: 'TEAC USB AUDIO DEVICE' },
    });
    bridges[0].positionSeconds = 21.75;
    const status = await session.setOutput({
      outputMode: 'shared',
      deviceIndex: 5,
      deviceName: 'Mi Monitor (NVIDIA High Definition Audio)',
    });

    expect(status.state).toBe('playing');
    expect(status.outputDeviceId).toBe('shared:5');
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      startSeconds: 21.75,
      deviceIndex: 5,
      deviceName: 'Mi Monitor (NVIDIA High Definition Audio)',
    });
    expect(decoder.probeRequests).toEqual(['song.flac']);
  });

  it('switching exclusive devices stops the resident bridge and opens the new device', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'exclusive', deviceIndex: 0, deviceName: 'TEAC USB AUDIO DEVICE' },
    });
    bridges[0].positionSeconds = 12.25;
    const status = await session.setOutput({
      outputMode: 'exclusive',
      deviceIndex: 1,
      deviceName: 'RME ADI-2 DAC',
    });

    expect(status.state).toBe('playing');
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      exclusive: true,
      deviceIndex: 1,
      deviceName: 'RME ADI-2 DAC',
      startSeconds: 12.25,
    });
  });

  it('switching output while paused updates the resume target without starting playback', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'shared', deviceIndex: 0, deviceName: 'TEAC USB AUDIO DEVICE' },
    });
    bridges[0].positionSeconds = 9;
    session.pause();
    const pausedStatus = await session.setOutput({
      outputMode: 'shared',
      deviceIndex: 5,
      deviceName: 'Mi Monitor (NVIDIA High Definition Audio)',
    });

    expect(pausedStatus.state).toBe('paused');
    expect(pausedStatus.outputDeviceId).toBe('shared:5');
    expect(bridges).toHaveLength(2);
    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges[1].stop).toHaveBeenCalledTimes(1);

    await session.play();
    expect(bridges).toHaveLength(3);
    expect(bridges[2].startOptions).toMatchObject({
      startSeconds: 9,
      deviceIndex: 5,
      deviceName: 'Mi Monitor (NVIDIA High Definition Audio)',
    });
  });
});

describe('AudioSession playback watchdog', () => {
  it('throttles native telemetry status events while preserving immediate pause status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'));
    const { bridges, session } = createLongRunningSessionHarness([probe('music.flac', 48_000)], [48_000], [], {
      disableWatchdogTimer: true,
    });

    try {
      await session.playLocalFile({ filePath: 'music.flac' });
      const statuses: unknown[] = [];
      session.on('status', (status) => statuses.push(status));

      bridges[0].emit('position', 480, {
        positionFrames: 480,
        bufferedFrames: 4800,
        underrunCallbacks: 0,
        underrunFrames: 0,
      });
      bridges[0].emit('position', 960, {
        positionFrames: 960,
        bufferedFrames: 4800,
        underrunCallbacks: 0,
        underrunFrames: 0,
      });

      expect(statuses).toHaveLength(1);

      vi.advanceTimersByTime(999);
      bridges[0].emit('position', 1440, {
        positionFrames: 1440,
        bufferedFrames: 4800,
        underrunCallbacks: 0,
        underrunFrames: 0,
      });
      expect(statuses).toHaveLength(1);

      vi.advanceTimersByTime(1);
      bridges[0].emit('position', 1920, {
        positionFrames: 1920,
        bufferedFrames: 4800,
        underrunCallbacks: 0,
        underrunFrames: 0,
      });
      expect(statuses).toHaveLength(2);

      session.pause();
      expect(statuses).toHaveLength(3);
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });

  it('does not recover while playing position advances', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)], [], [], {
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
    });

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 10;
    await session.checkPlaybackWatchdog();
    bridges[0].positionSeconds = 11;
    await session.checkPlaybackWatchdog();

    expect(bridges).toHaveLength(1);
    expect(session.getDiagnostics().recentWatchdogRecoveryCount).toBe(0);
  });

  it('recovers stuck native output while playing', async () => {
    const { bridges, decoder, session } = createSessionHarness([probe('song.flac', 44100)], [], [], {
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
    });

    await session.playLocalFile({ filePath: 'song.flac', trackId: 'track-1', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 15.5;
    await session.checkPlaybackWatchdog();
    await session.checkPlaybackWatchdog();

    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(decoder.decodeRequests.at(-1)).toMatchObject({ filePath: 'song.flac', startSeconds: 15.5 });
    expect(session.getStatus().warnings).toContain('audio_watchdog_recovered_native_output:1');
    expect(session.getDiagnostics().recentWatchdogRecoveryCount).toBe(1);
  });

  it('does not recover while paused, loading, or ended', async () => {
    const pausedHarness = createSessionHarness([probe('paused.flac', 44100)], [], [], {
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
    });
    await pausedHarness.session.playLocalFile({ filePath: 'paused.flac', output: { outputMode: 'shared' } });
    pausedHarness.bridges[0].positionSeconds = 5;
    pausedHarness.session.pause();
    await pausedHarness.session.checkPlaybackWatchdog();
    await pausedHarness.session.checkPlaybackWatchdog();
    expect(pausedHarness.bridges).toHaveLength(2);

    const pendingDecoder = new PendingProbeDecoder(new Map());
    const loadingBridges: FakeBridge[] = [];
    const loadingSession = new AudioSession({
      decoder: pendingDecoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => {
        const bridge = new FakeBridge();
        loadingBridges.push(bridge);
        return bridge;
      },
      logger: noopLogger,
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
    });
    const loadingPlay = loadingSession.playLocalFile({ filePath: 'loading.flac', output: { outputMode: 'shared' } });
    await Promise.resolve();
    expect(loadingSession.getStatus().state).toBe('loading');
    await loadingSession.checkPlaybackWatchdog();
    await loadingSession.checkPlaybackWatchdog();
    expect(loadingBridges).toHaveLength(0);
    pendingDecoder.finishProbe(probe('loading.flac', 44100));
    await loadingPlay;

    const endedHarness = createSessionHarness([probe('ended.flac', 44100)], [], [], {
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
    });
    await endedHarness.session.playLocalFile({ filePath: 'ended.flac', output: { outputMode: 'shared' } });
    endedHarness.bridges[0].positionSeconds = 12;
    endedHarness.bridges[0].emit('ended');
    await endedHarness.session.checkPlaybackWatchdog();
    await endedHarness.session.checkPlaybackWatchdog();
    expect(endedHarness.bridges).toHaveLength(1);
  });

  it('limits shared stability recovery without entering an error loop', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)], [], [], {
      disableWatchdogTimer: true,
      watchdogStallChecks: 1,
      watchdogMaxRecoveriesPerTrack: 1,
    });

    await session.playLocalFile({ filePath: 'song.flac', trackId: 'track-1', output: { outputMode: 'shared' } });
    bridges[0].positionSeconds = 9;
    await session.checkPlaybackWatchdog();
    await session.checkPlaybackWatchdog();
    bridges[1].positionSeconds = 9;
    await session.checkPlaybackWatchdog();
    await session.checkPlaybackWatchdog();

    const status = session.getStatus();
    expect(status.state).toBe('playing');
    expect(status.error).toBeNull();
    expect(status.warnings).toContain('shared_stability_recovery_limited');
    expect(bridges).toHaveLength(2);
  });

  it('starts shared output with the balanced anti-stutter profile by default', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 44100)]);

    await session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'shared' } });

    expect(bridges[0].startOptions).toMatchObject({
      bufferSizeFrames: 2048,
      fifoCapacityMs: 420,
      startupPrebufferMs: 120,
      startupPrebufferTimeoutMs: 450,
      latencyProfile: 'balanced',
    });
  });

  it('upgrades shared stability after repeated native underruns', async () => {
    const { bridges, session } = createSessionHarness([probe('song.flac', 48000)], [], [], {
      disableWatchdogTimer: true,
    });

    await session.playLocalFile({ filePath: 'song.flac', trackId: 'track-1', output: { outputMode: 'shared' } });
    bridges[0].emit('position', 48000, {
      positionFrames: 48000,
      bufferedFrames: 0,
      underrunCallbacks: 0,
      underrunFrames: 0,
    });
    bridges[0].emit('position', 48512, {
      positionFrames: 48512,
      bufferedFrames: 0,
      underrunCallbacks: 3,
      underrunFrames: 512,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      bufferSizeFrames: 4096,
      fifoCapacityMs: 750,
      startupPrebufferMs: 180,
    });
    expect(session.getStatus().sharedStabilityTier).toBe('recovery');
    expect(session.getStatus().warnings).toContain('shared_output_underrun_detected');
    expect(session.getStatus().warnings).toContain('shared_stability_recovered:1');
    expect(session.getStatus().warnings).toContain('native_output_buffer_recovered:4096 frames');
  });

  it('falls back from unstable exclusive output to shared after repeated native underruns', async () => {
    const { bridges, session } = createSessionHarness([probe('exclusive.flac', 48000)], [], [], {
      disableWatchdogTimer: true,
    });

    await session.playLocalFile({ filePath: 'exclusive.flac', trackId: 'track-exclusive', output: { outputMode: 'exclusive' } });
    bridges[0].emit('position', 48000, {
      positionFrames: 48000,
      bufferedFrames: 0,
      underrunCallbacks: 0,
      underrunFrames: 0,
    });
    bridges[0].emit('position', 48512, {
      positionFrames: 48512,
      bufferedFrames: 0,
      underrunCallbacks: 3,
      underrunFrames: 512,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      exclusive: false,
      asio: false,
    });
    expect(bridges[1].startOptions?.startSeconds).toBeCloseTo(48512 / 48000);
    expect(session.getStatus().outputMode).toBe('shared');
    expect(session.getStatus().warnings).toContain('exclusive_output_unstable');
    expect(session.getStatus().warnings).toContain('exclusive_output_fell_back_to_shared');
  });

  it('upgrades ASIO output after repeated native underruns', async () => {
    const { bridges, session } = createSessionHarness([probe('asio.flac', 48000)], [], [], {
      disableWatchdogTimer: true,
    });

    await session.playLocalFile({ filePath: 'asio.flac', trackId: 'track-asio', output: { outputMode: 'asio' } });
    bridges[0].emit('position', 48000, {
      positionFrames: 48000,
      bufferedFrames: 0,
      underrunCallbacks: 0,
      underrunFrames: 0,
    });
    bridges[0].emit('position', 48512, {
      positionFrames: 48512,
      bufferedFrames: 0,
      underrunCallbacks: 3,
      underrunFrames: 512,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridges[0].stop).toHaveBeenCalledTimes(1);
    expect(bridges).toHaveLength(2);
    expect(bridges[1].startOptions).toMatchObject({
      asio: true,
      exclusive: false,
      bufferSizeFrames: 1024,
      latencyProfile: 'lowLatency',
    });
    expect(session.getStatus().outputMode).toBe('asio');
    expect(session.getStatus().warnings).toContain('native_output_underrun_detected');
    expect(session.getStatus().warnings).toContain('native_output_stability_recovered:1');
    expect(session.getStatus().warnings).toContain('native_output_buffer_recovered:1024 frames');
  });

  it('moves ASIO underrun recovery through 1024, 2048, then Stable', async () => {
    const { bridges, session } = createSessionHarness([probe('asio.flac', 48000)], [], [], {
      disableWatchdogTimer: true,
    });

    await session.playLocalFile({ filePath: 'asio.flac', trackId: 'track-asio', output: { outputMode: 'asio' } });

    for (const [index, expectedBuffer] of [1024, 2048, 8192].entries()) {
      bridges[index].emit('position', 48000 + index * 1000, {
        positionFrames: 48000 + index * 1000,
        bufferedFrames: 0,
        underrunCallbacks: index * 3,
        underrunFrames: index * 512,
      });
      bridges[index].emit('position', 48512 + index * 1000, {
        positionFrames: 48512 + index * 1000,
        bufferedFrames: 0,
        underrunCallbacks: (index + 1) * 3,
        underrunFrames: (index + 1) * 512,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(bridges[index + 1].startOptions).toMatchObject({
        asio: true,
        bufferSizeFrames: expectedBuffer,
        latencyProfile: expectedBuffer === 8192 ? 'stable' : 'lowLatency',
      });
    }

    expect(session.getStatus().warnings).toContain('native_output_stability_recovered:3');
    expect(session.getStatus().warnings).toContain('native_output_buffer_recovered:stable');
  });
});

describe('NativeOutputBridge host arguments', () => {
  it('resolves the ECHO Next electron-app build host before migration fallbacks', () => {
    const exe = process.platform === 'win32' ? 'echo-audio-host.exe' : 'echo-audio-host';
    const cwd = join('tmp', 'echo-next');
    const nextHost = join(cwd, 'electron-app', 'build', exe);

    const resolved = resolveHostBinary({
      cwd,
      appPath: null,
      resourcesPath: '',
      exists: (candidate) => candidate === nextHost,
    });

    expect(resolved).toBe(nextHost);
  });

  it('returns null when the native host is unavailable', () => {
    const resolved = resolveHostBinary({
      cwd: join('tmp', 'empty-echo-next'),
      appPath: null,
      resourcesPath: '',
      exists: () => false,
      includeMigrationFallback: false,
    });

    expect(resolved).toBeNull();
  });

  it.each([44100, 48000, 96000])(
    'spawns echo-audio-host with -sr %i and -exclusive',
    async (sampleRate) => {
    const spawned: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = (file: string, args: string[]): ChildProcessWithoutNullStreams => {
      spawned.push({ file, args });
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write(`{"ready":true,"sampleRate":${sampleRate}}\n`);
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: sampleRate,
      channels: 2,
      exclusive: true,
    });

    expect(spawned[0].args).toEqual(expect.arrayContaining(['-sr', String(sampleRate), '-ch', '2', '-exclusive']));
    expect(spawned[0].args).toContain('-framed-stdin');
    if (sampleRate !== 48000) {
      expect(spawned[0].args).not.toEqual(expect.arrayContaining(['-sr', '48000']));
    }
    },
  );

  it('passes device name and index so the host can recover from stale indexes', async () => {
    const spawned: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = (file: string, args: string[]): ChildProcessWithoutNullStreams => {
      spawned.push({ file, args });
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
      deviceIndex: 6,
      deviceName: 'TEAC USB AUDIO DEVICE',
    });

    expect(spawned[0].args).toEqual(
      expect.arrayContaining(['-device', 'TEAC USB AUDIO DEVICE', '-device-index', '6']),
    );
  });

  it('passes shared FIFO and startup prebuffer host arguments', async () => {
    const spawned: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = (file: string, args: string[]): ChildProcessWithoutNullStreams => {
      spawned.push({ file, args });
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
      bufferSizeFrames: 2048,
      fifoCapacityMs: 750,
      startupPrebufferMs: 120,
      startupPrebufferTimeoutMs: 600,
    });
    bridge.stop();

    expect(spawned[0].args).toEqual(
      expect.arrayContaining(['-buffer', '2048', '-fifo-ms', '750', '-prebuffer-ms', '120', '-prebuffer-timeout-ms', '600']),
    );
  });

  it('passes explicit zero startup prebuffer arguments to the native host', async () => {
    const spawned: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = (file: string, args: string[]): ChildProcessWithoutNullStreams => {
      spawned.push({ file, args });
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
      exclusive: true,
      bufferSizeFrames: 512,
      startupPrebufferMs: 0,
      startupPrebufferTimeoutMs: 0,
    });
    bridge.stop();

    expect(spawned[0].args).toEqual(
      expect.arrayContaining(['-buffer', '512', '-prebuffer-ms', '0', '-prebuffer-timeout-ms', '0']),
    );
  });

  it('wraps persistent session PCM in framed stdin messages', async () => {
    const writes: Buffer[] = [];
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdin.on('data', (chunk) => writes.push(Buffer.from(chunk)));
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
    });
    const sessionId = bridge.beginSession({ startSeconds: 0 });
    const writable = bridge.createSessionWritable(sessionId);
    writable.end(pcmBuffer([0.25, -0.25]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.stop();

    const framed = Buffer.concat(writes);
    expect(framed.subarray(0, 4).toString('ascii')).toBe('ECNP');
    expect(framed.readUInt8(4)).toBe(1);
    expect(framed.readUInt8(5)).toBe(1);
    expect(framed.readUInt32LE(8)).toBe(sessionId);
    expect(framed.readUInt8(21)).toBe(2);
    expect(framed.readUInt32LE(24)).toBe(sessionId);
    expect(framed.readUInt32LE(28)).toBe(8);
    expect(framed.readUInt8(45)).toBe(3);
  });

  it('treats framed native pos as per-session position when reusing a resident host', async () => {
    const stdoutRef = new PassThrough();
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout: stdoutRef,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdoutRef.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
    });

    bridge.beginSession({ startSeconds: 0 });
    stdoutRef.write('{"pos":48000}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.getPositionSeconds()).toBeGreaterThanOrEqual(1);
    expect(bridge.getPositionSeconds()).toBeLessThan(1.1);

    bridge.beginSession({ startSeconds: 0 });
    stdoutRef.write('{"pos":24000}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.getPositionSeconds()).toBeGreaterThanOrEqual(0.5);
    expect(bridge.getPositionSeconds()).toBeLessThan(0.6);
    bridge.stop();
  });

  it('ignores stale framed ended events that arrive before PCM for a new session', async () => {
    const stdoutRef = new PassThrough();
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout: stdoutRef,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdoutRef.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });
    const ended = vi.fn();

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
    });
    bridge.on('ended', ended);

    bridge.beginSession({ startSeconds: 0 });
    stdoutRef.write('{"event":"ended"}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ended).not.toHaveBeenCalled();

    const sessionId = bridge.beginSession({ startSeconds: 0 });
    bridge.writePcmFrame(sessionId, pcmBuffer([0.1, -0.1]), () => undefined);
    stdoutRef.write('{"event":"ended"}\n');
    stdoutRef.write('{"event":"ended"}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ended).toHaveBeenCalledTimes(1);
    bridge.stop();
  });

  it('adds seek start time to per-session framed native pos', async () => {
    const stdoutRef = new PassThrough();
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout: stdoutRef,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdoutRef.write('{"ready":true,"sampleRate":48000}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 48000,
      channels: 2,
    });

    bridge.beginSession({ startSeconds: 12 });
    stdoutRef.write('{"pos":24000}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.getPositionSeconds()).toBeGreaterThanOrEqual(12.5);
    expect(bridge.getPositionSeconds()).toBeLessThan(12.6);
    bridge.stop();
  });

  it('spawns echo-audio-host with -asio and without -exclusive for ASIO output', async () => {
    const spawned: Array<{ file: string; args: string[] }> = [];
    const fakeSpawn = (file: string, args: string[]): ChildProcessWithoutNullStreams => {
      spawned.push({ file, args });
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":96000,"backend":"asio","deviceType":"ASIO","deviceName":"TEAC ASIO"}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 96000,
      channels: 2,
      asio: true,
      exclusive: true,
    });

    expect(spawned[0].args).toEqual(expect.arrayContaining(['-sr', '96000', '-ch', '2', '-asio']));
    expect(spawned[0].args).not.toContain('-exclusive');
  });

  it('allows slow Exclusive host startup to outlive the shared-mode ready timeout', async () => {
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      setTimeout(() => {
        stdout.write(
          '{"ready":true,"sampleRate":192000,"backend":"wasapi-exclusive","deviceType":"Windows Audio (Exclusive Mode)","deviceName":"TEAC"}\n',
        );
      }, 20);

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      readyTimeoutMs: 5,
      logger: noopLogger,
    });

    const ready = await bridge.start({
      requestedOutputSampleRate: 192000,
      channels: 2,
      exclusive: true,
    });

    expect(ready.actualDeviceSampleRate).toBe(192000);
    bridge.stop();
  });

  it('extrapolates native position after pos events and stops extrapolating after clock reset', async () => {
    const stdoutRef = new PassThrough();
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stdout = stdoutRef;
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stdout.write('{"ready":true,"sampleRate":44100}\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await bridge.start({
      requestedOutputSampleRate: 44100,
      channels: 2,
      durationSeconds: 1.05,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.getPositionSeconds()).toBe(0);

    stdoutRef.write('{"pos":44100}\n');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const extrapolatedPosition = bridge.getPositionSeconds();
    expect(extrapolatedPosition).toBeGreaterThan(1);
    expect(extrapolatedPosition).toBeLessThanOrEqual(1.05);

    bridge.resetOutputClock(0.5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.getPositionSeconds()).toBeCloseTo(0.5, 2);
    bridge.stop();
  });
});

describe('AudioSession host availability', () => {
  it('reports unavailable when echo-audio-host is missing without throwing', () => {
    const unavailableSession = new AudioSession({
      decoder: new FakeDecoder(new Map()),
      deviceService: { listDevices: () => [] },
      createBridge: () => new FakeBridge(),
      isNativeHostAvailable: () => false,
      logger: noopLogger,
    });

    expect(unavailableSession.getStatus().host).toBe('unavailable');
  });

});

describe('DeviceService diagnostics', () => {
  it('logs native host list failures instead of silently returning an empty ASIO list', () => {
    const logs: string[] = [];
    const failure = Object.assign(new Error('command failed'), {
      status: 2,
      stderr: Buffer.from('[echo-audio-host] ASIO support is disabled at build time'),
      stdout: Buffer.from(''),
    });
    const execMock = vi.fn(() => {
      throw failure;
    });
    const service = new DeviceService({
      hostBinary: 'echo-audio-host.exe',
      execFileSync: execMock as unknown as typeof nodeExecFileSync,
      logger: (message) => logs.push(message),
    });

    expect(service.listAsioDevices()).toEqual([]);
    expect(logs[0]).toContain('asio device enumeration failed');
    expect(logs[0]).toContain('echo-audio-host.exe');
    expect(logs[0]).toContain('ASIO support is disabled');
  });

  it('logs an empty ASIO list distinctly from an enumeration failure', () => {
    const logs: string[] = [];
    const service = new DeviceService({
      hostBinary: 'echo-audio-host.exe',
      execFileSync: vi.fn(() => '') as unknown as typeof nodeExecFileSync,
      logger: (message) => logs.push(message),
    });

    expect(service.listAsioDevices()).toEqual([]);
    expect(logs[0]).toContain('ASIO device enumeration returned no devices');
  });

  it('uses async native host enumeration for UI device lists', async () => {
    const execFileSyncMock = vi.fn(() => {
      throw new Error('sync enumeration should not run');
    });
    const execFileMock = vi.fn((_bin, args, _options, callback) => {
      const output = Array.isArray(args) && args.includes('-asio')
        ? ''
        : '0\tSpeakers\t48000\t1\t48000\n';
      queueMicrotask(() => callback(null, output, ''));
      return {} as ReturnType<typeof nodeExecFile>;
    });
    const service = new DeviceService({
      hostBinary: 'echo-audio-host.exe',
      execFileSync: execFileSyncMock as unknown as typeof nodeExecFileSync,
      execFile: execFileMock as unknown as typeof nodeExecFile,
      logger: noopLogger,
    });

    await expect(service.listDevicesAsync()).resolves.toMatchObject([
      {
        id: 'shared:0',
        name: 'Speakers',
        outputMode: 'shared',
        sharedDeviceSampleRate: 48000,
      },
    ]);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('DecoderPipeline ffmpeg resolution', () => {
  it('prefers explicit ffmpegPath over env and ffmpeg-static', () => {
    expect(
      resolveDecoderFfmpegPath({
        ffmpegPath: 'explicit-ffmpeg',
        env: { ECHO_FFMPEG_PATH: 'env-ffmpeg' },
        staticFfmpegPath: 'static-ffmpeg',
      }),
    ).toBe('explicit-ffmpeg');
  });

  it('prefers ECHO_FFMPEG_PATH over ffmpeg-static', () => {
    expect(
      resolveDecoderFfmpegPath({
        env: { ECHO_FFMPEG_PATH: 'env-ffmpeg' },
        staticFfmpegPath: 'static-ffmpeg',
      }),
    ).toBe('env-ffmpeg');
  });

  it('falls back to ffmpeg-static before system ffmpeg', () => {
    expect(
      resolveDecoderFfmpegPath({
        env: {},
        staticFfmpegPath: 'static-ffmpeg',
        systemFfmpegPath: 'system-ffmpeg',
      }),
    ).toBe('static-ffmpeg');
  });

  it('uses app.asar.unpacked for packaged ffmpeg-static paths', () => {
    expect(
      resolveDecoderFfmpegPath({
        env: {},
        staticFfmpegPath: join('C:', 'App', 'resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      }),
    ).toBe(join('C:', 'App', 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'));
  });

  it('normalizes missing spawn errors to ffmpeg_missing', async () => {
    const spawn: NonNullable<DecoderPipelineDependencies['spawn']> = () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(() => true),
      });

      queueMicrotask(() => {
        child.emit('error', Object.assign(new Error('spawn missing ENOENT'), { code: 'ENOENT' }));
      });

      return child as unknown as ReturnType<NonNullable<DecoderPipelineDependencies['spawn']>>;
    };
    const decoder = new DecoderPipeline({
      ffmpegPath: 'missing-ffmpeg',
      spawn,
      logger: noopLogger,
    });
    const run = decoder.decodeLocalFile({
      filePath: 'song.flac',
      startSeconds: 0,
      channels: 2,
      decoderOutputSampleRate: 44100,
    });

    await expect(run.done).rejects.toThrow('ffmpeg_missing');
  });

  it('surfaces decoder errors in AudioSession status', async () => {
    const decoder = new FailingDecoder(new Map([['song.flac', probe('song.flac', 44100)]]));
    const session = new AudioSession({
      decoder,
      deviceService: { listDevices: () => [] },
      createBridge: () => new FakeBridge(),
      isNativeHostAvailable: () => true,
      logger: noopLogger,
    });

    await session.playLocalFile({
      filePath: 'song.flac',
      output: { outputMode: 'exclusive' },
    });
    await Promise.resolve();

    expect(session.getStatus().state).toBe('error');
    expect(session.getStatus().error).toBe('ffmpeg_missing');
  });

  it('includes ffmpeg stderr and spawn details when decoding exits non-zero', async () => {
    const spawn: NonNullable<DecoderPipelineDependencies['spawn']> = () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(() => true),
      });

      queueMicrotask(() => {
        child.stderr.write('Invalid data found when processing input\n');
        child.emit('exit', 1, null);
      });

      return child as unknown as ReturnType<NonNullable<DecoderPipelineDependencies['spawn']>>;
    };
    const decoder = new DecoderPipeline({
      ffmpegPath: 'test-ffmpeg',
      spawn,
      logger: noopLogger,
    });
    const run = decoder.decodeLocalFile({
      filePath: 'broken.flac',
      startSeconds: 0,
      channels: 2,
      decoderOutputSampleRate: 44100,
    });

    await expect(run.done).rejects.toThrow(
      'ffmpeg_exit_code_1; ffmpeg="test-ffmpeg"; args="-hide_banner -loglevel error -nostdin -ss 0 -i broken.flac -vn -f f32le -ac 2 -ar 44100 pipe:1"; stderr="Invalid data found when processing input"',
    );
  });
});

describe('NativeOutputBridge diagnostics', () => {
  it('includes elapsed time, output mode, and stderr tail when ready times out', async () => {
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stderr.write('[echo-audio-host] createDevice is still waiting\n');
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      readyTimeoutMs: 5,
      logger: noopLogger,
    });

    let message = '';
    try {
      await bridge.start({
        requestedOutputSampleRate: 44100,
        channels: 2,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('echo-audio-host timeout_waiting_for_ready');
    expect(message).toContain('mode="shared"');
    expect(message).toMatch(/elapsedMs=\d+/);
    expect(message).toContain('stderrTail="[echo-audio-host] createDevice is still waiting"');
  });

  it('includes host stderr and spawn details when the native host exits before ready', async () => {
    const fakeSpawn = (): ChildProcessWithoutNullStreams => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: vi.fn(() => true),
      }) as unknown as ChildProcessWithoutNullStreams;

      queueMicrotask(() => {
        stderr.write('[echo-audio-host] Failed to initialize output device\n');
        child.emit('exit', 1, null);
      });

      return child;
    };
    const bridge = new NativeOutputBridge({
      hostBinary: 'echo-audio-host.exe',
      spawn: fakeSpawn as HostSpawner,
      logger: noopLogger,
    });

    await expect(
      bridge.start({
        requestedOutputSampleRate: 44100,
        channels: 2,
      }),
    ).rejects.toThrow(
      'echo-audio-host exit_code_1; host="echo-audio-host.exe"; args="-sr 44100 -ch 2 -eq-port',
    );
  });

  it('propagates native host startup failures into AudioSession status', async () => {
    const session = new AudioSession({
      decoder: new FakeDecoder(new Map([['song.flac', probe('song.flac', 44100)]])),
      deviceService: { listDevices: () => [] },
      createBridge: () => new StartupFailingBridge(),
      isNativeHostAvailable: () => true,
      logger: noopLogger,
    });

    await expect(
      session.playLocalFile({ filePath: 'song.flac', output: { outputMode: 'exclusive' } }),
    ).rejects.toThrow('Failed to initialize output device');
    expect(session.getStatus().state).toBe('error');
    expect(session.getStatus().error).toContain('Failed to initialize output device');
  });
});
