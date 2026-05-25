import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import { AirPlayReceiverSpikeService, convertS16leToF32le, resolveAirPlayHelperNodePath } from './AirPlayReceiverSpikeService';

const audioStatus = (overrides: Partial<AudioStatus> = {}): AudioStatus => ({
  host: 'ready',
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
  resamplerEngine: 'default',
  resamplerFallbackActive: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  latencyProfile: 'balanced',
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: null,
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
  ...overrides,
});

class FakeAudioSession extends EventEmitter {
  status = audioStatus();
  playPcmStream = vi.fn(async (request: { stream: PassThrough; sourceId: string; trackId?: string | null }) => {
    this.status = audioStatus({
      state: 'playing',
      currentFilePath: request.sourceId,
      currentTrackId: request.trackId ?? request.sourceId,
      codec: 'pcm-f32le',
      channels: 2,
      fileSampleRate: 44100,
      decoderOutputSampleRate: 44100,
      requestedOutputSampleRate: 44100,
    });
    this.emit('status', this.status);
    return this.status;
  });
  pause = vi.fn(async () => {
    this.status = { ...this.status, state: 'paused' };
    this.emit('status', this.status);
    return this.status;
  });
  stop = vi.fn(async () => {
    this.status = { ...this.status, state: 'stopped', currentFilePath: null, currentTrackId: null };
    this.emit('status', this.status);
    return this.status;
  });
  setOutput = vi.fn(async (settings: { volume: number }) => {
    this.status = { ...this.status, volume: settings.volume };
    this.emit('status', this.status);
    return this.status;
  });
  getStatus = (): AudioStatus => this.status;
}

describe('AirPlayReceiverSpikeService', () => {
  it('uses the current Electron executable for the AirPlay helper in packaged builds', () => {
    const nodePath = resolveAirPlayHelperNodePath({
      isPackaged: true,
      processExecPath: 'C:\\Program Files\\ECHO NEXT\\ECHO NEXT.exe',
      npmNodeExecPath: 'C:\\Program Files\\ECHO Next\\ECHO NEXT.exe',
      nodeEnvPath: 'C:\\stale\\node.exe',
    });

    expect(nodePath).toBe('C:\\Program Files\\ECHO NEXT\\ECHO NEXT.exe');
  });

  it('keeps explicit Node runtimes available for AirPlay helper development runs', () => {
    const nodePath = resolveAirPlayHelperNodePath({
      isPackaged: false,
      processExecPath: 'C:\\Electron\\electron.exe',
      npmNodeExecPath: 'C:\\Node\\node.exe',
      nodeEnvPath: null,
    });

    expect(nodePath).toBe('C:\\Node\\node.exe');
  });

  it('converts signed 16-bit PCM to float32 PCM', () => {
    const input = Buffer.alloc(8);
    input.writeInt16LE(-32768, 0);
    input.writeInt16LE(0, 2);
    input.writeInt16LE(16384, 4);
    input.writeInt16LE(32767, 6);

    const output = convertS16leToF32le(input);

    expect(output.readFloatLE(0)).toBe(-1);
    expect(output.readFloatLE(4)).toBe(0);
    expect(output.readFloatLE(8)).toBeCloseTo(0.5, 4);
    expect(output.readFloatLE(12)).toBeCloseTo(0.99997, 4);
  });

  it('reports native backend failure without enabling the receiver', async () => {
    const service = new AirPlayReceiverSpikeService({
      audioSession: new FakeAudioSession() as never,
      loadRaopModule: async () => {
        throw new Error('Cannot find module @lox-audioserver/node-libraop');
      },
    });

    const status = await service.setEnabled(true);

    expect(status.enabled).toBe(false);
    expect(status.state).toBe('unavailable');
    expect(status.nativeAvailable).toBe(false);
    expect(status.error).toContain('node-libraop');
  });

  it('binds the RAOP receiver to all adapters and advertises each LAN interface', async () => {
    const audio = new FakeAudioSession();
    const startReceiver = vi.fn((_options: { portBase: number }) => 23);
    const stopReceiver = vi.fn();
    const mdnsStarts: Array<{ address: string; mac: string; port: number }> = [];
    const mdnsStops: Array<ReturnType<typeof vi.fn>> = [];
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      getAdvertiseInterfaces: () => [
        { name: 'Ethernet', address: '192.168.31.214', mac: '60:CF:84:CB:1E:D1' },
        { name: 'Wi-Fi', address: '10.0.0.8', mac: '70:CF:84:CB:1E:D1' },
      ],
      createMdnsAdvertiser: () => {
        const stop = vi.fn(async () => undefined);
        mdnsStops.push(stop);
        return {
          start: vi.fn(async (advertisement) => {
            mdnsStarts.push({
              address: advertisement.address,
              mac: advertisement.mac,
              port: advertisement.port,
            });
          }),
          stop,
        };
      },
      loadRaopModule: async () => ({
        startReceiver,
        stopReceiver,
        sendRemoteCommand: vi.fn(() => true),
      }),
    });

    const status = await service.setEnabled(true);
    const options = startReceiver.mock.calls[0]?.[0];
    expect(options).toBeDefined();

    expect(status.enabled).toBe(true);
    expect(options).toEqual(expect.objectContaining({
      name: 'ECHO Next (AirPlay)',
      model: 'ECHO-Next-AirPlay-Spike',
      mac: '60:CF:84:CB:1E:D1',
      latencies: '1000:1000',
      metadata: true,
      portRange: 100,
    }));
    expect(options).not.toHaveProperty('host');
    expect(mdnsStarts).toEqual([
      { address: '192.168.31.214', mac: '60:CF:84:CB:1E:D1', port: options!.portBase },
      { address: '10.0.0.8', mac: '60:CF:84:CB:1E:D1', port: options!.portBase },
    ]);

    await service.setEnabled(false);

    expect(stopReceiver).toHaveBeenCalledWith(23);
    expect(mdnsStops).toHaveLength(2);
    expect(mdnsStops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });

  it('keeps the receiver enabled but surfaces discovery failure when mDNS cannot advertise', async () => {
    const service = new AirPlayReceiverSpikeService({
      audioSession: new FakeAudioSession() as never,
      getAdvertiseInterfaces: () => [
        { name: 'Wi-Fi', address: '192.168.31.214', mac: '60:CF:84:CB:1E:D1' },
      ],
      createMdnsAdvertiser: () => ({
        start: vi.fn(async () => {
          throw new Error('bind EADDRINUSE 0.0.0.0:5353');
        }),
        stop: vi.fn(async () => undefined),
      }),
      loadRaopModule: async () => ({
        startReceiver: vi.fn(() => 23),
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
    });

    const status = await service.setEnabled(true);

    expect(status.enabled).toBe(true);
    expect(status.nativeAvailable).toBe(true);
    expect(status.error).toContain('AirPlay discovery unavailable');
    expect(status.debugEvents.some((event) => event.action === 'mdns' && event.message?.includes('EADDRINUSE'))).toBe(true);
  });

  it('surfaces unsupported modern AirPlay POST attempts from native logs', async () => {
    const logHandlers: Array<(event: unknown) => void> = [];
    const service = new AirPlayReceiverSpikeService({
      audioSession: new FakeAudioSession() as never,
      getAdvertiseInterfaces: () => [
        { name: 'Wi-Fi', address: '192.168.31.214', mac: '60:CF:84:CB:1E:D1' },
      ],
      createMdnsAdvertiser: () => ({
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
      }),
      loadRaopModule: async () => ({
        startReceiver: vi.fn(() => 23),
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
        setLogHandler: vi.fn((handler) => {
          logHandlers.push(handler);
        }),
      }),
    });

    await service.setEnabled(true);
    logHandlers[0]?.({ source: 'raop', level: 'info', line: 'handle_rtsp:591 unknown/unhandled method POST' });

    const status = service.getStatus();
    expect(status.state).toBe('error');
    expect(status.error).toContain('unsupported AirPlay RTSP POST');
  });

  it('does not label non-POST RTSP 501 responses as unsupported POST flow', async () => {
    const logHandlers: Array<(event: unknown) => void> = [];
    const service = new AirPlayReceiverSpikeService({
      audioSession: new FakeAudioSession() as never,
      getAdvertiseInterfaces: () => [
        { name: 'Wi-Fi', address: '192.168.31.214', mac: '60:CF:84:CB:1E:D1' },
      ],
      createMdnsAdvertiser: () => ({
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
      }),
      loadRaopModule: async () => ({
        startReceiver: vi.fn(() => 23),
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
        setLogHandler: vi.fn((handler) => {
          logHandlers.push(handler);
        }),
      }),
    });

    await service.setEnabled(true);
    logHandlers[0]?.({ source: 'raop', level: 'info', line: 'handle_rtsp:625 responding: RTSP/1.0 501 Not Implemented' });

    const status = service.getStatus();
    expect(status.state).toBe('idle');
    expect(status.error).toBeNull();
  });

  it('maps RAOP metadata artwork and PCM events into an AirPlay playback session', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const stopReceiver = vi.fn();
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 7;
        },
        stopReceiver,
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    harness.handler?.({ type: 'metadata', title: 'Air Song', artist: 'Singer', album: 'Album', durationMs: 180_000 });
    harness.handler?.({ type: 'artwork', data: Buffer.from([1, 2, 3]), mimeType: 'image/png' });
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(32767, 0);
    pcm.writeInt16LE(-32768, 2);
    harness.handler?.({ type: 'pcm', data: pcm, sampleRate: 44100, channels: 2 });
    await Promise.resolve();

    const status = service.getStatus();
    expect(audio.playPcmStream).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: expect.stringMatching(/^airplay-receiver:/u),
      sampleRate: 44100,
      channels: 2,
      output: expect.objectContaining({
        outputMode: 'shared',
        sharedBackend: 'auto',
        requestedOutputSampleRate: 48000,
        latencyProfile: 'stable',
        bufferSizeFrames: 8192,
        useJuceDecode: false,
        dsdOutputMode: 'pcm',
        asioNativeDsdExperimentalEnabled: false,
        releaseExclusiveOnPauseExperimentalEnabled: false,
      }),
    }));
    expect(status.state).toBe('playing');
    expect(status.currentClient?.address).toBe('192.168.1.50');
    expect(status.metadata?.title).toBe('Air Song');
    expect(status.metadata?.artist).toBe('Singer');
    expect(status.metadata?.coverHttpUrl).toMatch(/^data:image\/png;base64,/u);
  });

  it('waits for direct AirPlay PCM before starting audio playback by default', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 19;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', port: 9, remoteAddress: '192.168.1.51' });
    await Promise.resolve();

    expect(audio.playPcmStream).not.toHaveBeenCalled();
    expect(service.getStatus().state).toBe('ready');
    expect(service.getStatus().debugEvents.some((event) => event.action === 'stream' && event.message === 'using direct PCM events')).toBe(true);
  });

  it('falls back to direct PCM events when AirPlay HTTP PCM has not produced audio', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 13;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      useHttpPcmBridge: true,
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', port: 9, remoteAddress: '192.168.1.51' });
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(32767, 0);
    pcm.writeInt16LE(-32768, 2);
    harness.handler?.({ type: 'pcm', data: pcm, sampleRate: 48000, channels: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(audio.playPcmStream).toHaveBeenCalledTimes(2);
    expect(audio.playPcmStream).toHaveBeenLastCalledWith(expect.objectContaining({
      sourceId: expect.stringMatching(/^airplay-receiver:/u),
      sampleRate: 48000,
      channels: 2,
    }));
    expect(service.getStatus().state).toBe('playing');
  });

  it('sends AirPlay remote commands for computer transport controls', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const sendRemoteCommand = vi.fn(() => true);
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 15;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand,
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    harness.handler?.({ type: 'pcm', data: Buffer.from([0, 0]), sampleRate: 44100, channels: 2 });
    await Promise.resolve();

    const sourceId = service.getStatus().currentSourceId;
    expect(service.isCurrentSource(sourceId)).toBe(true);
    expect(service.isCurrentSource('local.flac')).toBe(false);

    await service.pausePlayback();
    expect(sendRemoteCommand).toHaveBeenCalledWith(15, 'pause');
    expect(audio.pause).not.toHaveBeenCalled();
    expect(service.getStatus().state).toBe('paused');

    await service.playPlayback();
    expect(sendRemoteCommand).toHaveBeenCalledWith(15, 'play');
    expect(service.getStatus().state).toBe('playing');
  });

  it('maps AirPlay dB volume events without muting normal playback', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 19;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'volume', value: -20 });
    await Promise.resolve();

    expect(audio.setOutput).toHaveBeenCalledWith({ volume: 0.1 });
    expect(service.getStatus().volume).toBe(10);
  });

  it('does not fake AirPlay seek state when the native backend cannot seek the sender', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 16;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    harness.handler?.({ type: 'metadata', title: 'Air Song', artist: 'Singer', durationMs: 180_000 });
    harness.handler?.({ type: 'pcm', data: Buffer.from([0, 0]), sampleRate: 44100, channels: 2 });
    await Promise.resolve();

    const status = await service.seekPlayback(42);

    expect(status.positionSeconds).toBe(0);
    expect(audio.status.positionSeconds).toBe(0);
  });

  it('resets the AirPlay song clock when metadata switches to a new track', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 17;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    harness.handler?.({ type: 'metadata', title: 'First Song', artist: 'Singer', durationMs: 180_000, elapsedMs: 30_000 });
    expect(service.getStatus().positionSeconds).toBe(30);

    harness.handler?.({ type: 'metadata', title: 'Second Song', artist: 'Singer', durationMs: 200_000 });

    const status = service.getStatus();
    expect(status.metadata?.title).toBe('Second Song');
    expect(status.positionSeconds).toBe(0);
    expect(status.durationSeconds).toBe(200);
  });

  it('keeps an active AirPlay PCM HTTP stream alive across flush events', async () => {
    const service = new AirPlayReceiverSpikeService({
      audioSession: new FakeAudioSession() as never,
      loadRaopModule: async () => ({
        startReceiver: vi.fn(() => 18),
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
    });
    const internals = service as unknown as {
      currentSourceId: string;
      httpPcmRequest: { destroy: () => void };
      httpPcmTransform: { destroy: () => void };
      httpPcmBytesReceived: number;
      handleRaopEvent: (event: Record<string, unknown>) => void;
    };

    await service.setEnabled(true);
    internals.currentSourceId = 'airplay-receiver:active';
    internals.httpPcmRequest = { destroy: vi.fn() };
    internals.httpPcmTransform = { destroy: vi.fn() };
    internals.httpPcmBytesReceived = 4;

    internals.handleRaopEvent({ type: 'flush' });

    expect(internals.httpPcmRequest.destroy).not.toHaveBeenCalled();
    expect(internals.httpPcmTransform.destroy).not.toHaveBeenCalled();
    expect(service.getStatus().state).toBe('paused');
    expect(service.getStatus().debugEvents.some((event) => event.action === 'stream' && event.message === 'keep PCM HTTP alive after flush')).toBe(true);
  });

  it('uses album metadata when AirPlay sends a generic instrumental title', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 11;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({
      type: 'metadata',
      title: '纯音乐，请欣赏',
      artist: 'lapix/Flamenco House',
      album: 'Flamenco House',
      durationMs: 144_000,
    });

    const status = service.getStatus();
    expect(status.metadata?.title).toBe('Flamenco House');
    expect(status.metadata?.artist).toBe('lapix');
    expect(status.metadata?.album).toBe('Flamenco House');
    expect(status.metadata?.durationSeconds).toBe(144);
  });

  it('uses album metadata when AirPlay sends a lyric line as title', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 12;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({
      type: 'metadata',
      title: "And I know, I'm not alone",
      artist: 'Porter Robinson/Madeon/Shelter (シェルター)',
      album: 'Shelter',
      durationMs: 219_000,
    });

    const status = service.getStatus();
    expect(status.metadata?.title).toBe('Shelter');
    expect(status.metadata?.artist).toBe('Porter Robinson / Madeon');
    expect(status.metadata?.album).toBe('Shelter');
  });

  it('keeps stable song metadata when AirPlay sends lyric lines as title updates', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 14;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand: vi.fn(() => true),
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({
      type: 'metadata',
      title: 'Shelter',
      artist: 'Porter Robinson / Madeon',
      album: 'Shelter',
      durationMs: 219_000,
    });
    harness.handler?.({
      type: 'metadata',
      title: "And I know, I'm not alone",
      artist: 'Porter Robinson / Madeon',
      album: 'Shelter',
      durationMs: 219_000,
      elapsedMs: 30_000,
    });

    const status = service.getStatus();
    expect(status.metadata?.title).toBe('Shelter');
    expect(status.metadata?.artist).toBe('Porter Robinson / Madeon');
    expect(status.currentLyricLine).toBe("And I know, I'm not alone");
    expect(status.positionSeconds).toBe(30);
  });

  it('lets an incoming AirPlay stream preempt stale local playback status', async () => {
    const audio = new FakeAudioSession();
    audio.status = audioStatus({ state: 'playing', currentFilePath: 'local.flac', currentTrackId: 'local-track' });
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const sendRemoteCommand = vi.fn(() => true);
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 10;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand,
      }),
      now: () => 1_000,
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    audio.emit('status', audio.status);
    harness.handler?.({ type: 'pcm', data: Buffer.from([0, 0]), sampleRate: 44100, channels: 2 });
    await Promise.resolve();

    expect(sendRemoteCommand).not.toHaveBeenCalledWith(10, 'stop');
    expect(audio.playPcmStream).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: expect.stringMatching(/^airplay-receiver:/u) }),
    );
    expect(service.getStatus().state).toBe('playing');
  });

  it('releases the AirPlay session when local playback takes over', async () => {
    const audio = new FakeAudioSession();
    const harness: { handler?: (event: Record<string, unknown>) => void } = {};
    const sendRemoteCommand = vi.fn(() => true);
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: (_options, nextHandler) => {
          harness.handler = nextHandler;
          return 8;
        },
        stopReceiver: vi.fn(),
        sendRemoteCommand,
      }),
    });

    await service.setEnabled(true);
    harness.handler?.({ type: 'stream', remoteAddress: '192.168.1.50' });
    harness.handler?.({ type: 'metadata', title: 'Air Song', artist: 'Singer' });
    harness.handler?.({ type: 'pcm', data: Buffer.from([0, 0]), sampleRate: 44100, channels: 2 });
    await Promise.resolve();
    audio.status = audioStatus({ state: 'loading', currentFilePath: 'local.flac' });
    audio.emit('status', audio.status);
    harness.handler?.({ type: 'pcm', data: Buffer.from([0, 0]), sampleRate: 44100, channels: 2 });

    const status = service.getStatus();
    expect(sendRemoteCommand).toHaveBeenCalledWith(8, 'stop');
    expect(audio.playPcmStream).toHaveBeenCalledTimes(1);
    expect(status.state).toBe('idle');
    expect(status.metadata).toBeNull();
    expect(status.currentSourceId).toBeNull();
  });

  it('does not stop local audio when disabling an idle AirPlay receiver', async () => {
    const audio = new FakeAudioSession();
    audio.status = audioStatus({ state: 'playing', currentFilePath: 'local.flac', currentTrackId: 'local-track' });
    const stopReceiver = vi.fn();
    const service = new AirPlayReceiverSpikeService({
      audioSession: audio as never,
      loadRaopModule: async () => ({
        startReceiver: () => 9,
        stopReceiver,
        sendRemoteCommand: vi.fn(() => true),
      }),
    });

    await service.setEnabled(true);
    await service.setEnabled(false);

    expect(stopReceiver).toHaveBeenCalledWith(9);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.status.currentFilePath).toBe('local.flac');
  });
});
