import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hqPlayerConnectDeviceId, type ConnectStartRequest } from '../../shared/types/connect';
import type { LibraryTrack } from '../../shared/types/library';
import type { HqPlayerConnectionTestResult, HqPlayerSettings, HqPlayerStatus } from '../../shared/types/hqplayer';

const mocks = vi.hoisted(() => {
  const audioSession = {
    getStatus: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  };
  const libraryService = {
    getTrack: vi.fn(),
    resolveCoverAsset: vi.fn(),
  };

  return {
    audioSession,
    libraryService,
  };
});

vi.mock('../audio/AudioSession', () => ({
  getAudioSession: () => mocks.audioSession,
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: () => mocks.libraryService,
}));

const localTrack: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\song.flac',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
};

const hqStatus = (state: HqPlayerStatus['state'] = 'disabled'): HqPlayerStatus => ({
  enabled: state !== 'disabled',
  state,
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  mediaServerEnabled: false,
  defaultPlaybackBackend: 'ask',
  profileName: null,
  lastCheckedAt: null,
  lastError: null,
});

const hqSettings = (patch: Partial<HqPlayerSettings> = {}): HqPlayerSettings => ({
  enabled: false,
  connectionMode: 'localDesktop',
  host: '127.0.0.1',
  port: 4321,
  executablePath: null,
  allowLaunch: false,
  mediaServerEnabled: false,
  mediaServerPort: null,
  defaultPlaybackBackend: 'ask',
  profileName: null,
  ...patch,
});

const hqConnectionOk = (settings: HqPlayerSettings = hqSettings({ enabled: true })): HqPlayerConnectionTestResult => ({
  ok: true,
  state: 'available',
  endpoint: {
    connectionMode: settings.connectionMode,
    host: settings.host,
    port: settings.port,
  },
  elapsedMs: 8,
  checkedAt: '2026-05-21T01:00:00.000Z',
  error: null,
  playbackStatus: {
    state: 'playing',
    stateCode: 2,
    track: 1,
    trackId: localTrack.id,
    tracksTotal: 1,
    queued: false,
    positionSeconds: 7,
    durationSeconds: 180,
    volume: null,
    activeMode: null,
    activeFilter: null,
    activeShaper: null,
    activeRate: null,
    activeBits: null,
    activeChannels: null,
    inputFill: null,
    outputFill: null,
    outputDelayUs: null,
    apodizing: null,
    metadata: null,
    receivedAt: '2026-05-21T01:00:00.000Z',
  },
});

const createHqPlayerService = (initial: Partial<HqPlayerSettings> = {}) => {
  let settings = hqSettings(initial);
  return {
    getSettings: vi.fn(() => settings),
    setSettings: vi.fn().mockImplementation((patch: Partial<HqPlayerSettings>) => {
      settings = { ...settings, ...patch };
      return settings;
    }),
    getStatus: vi.fn().mockImplementation(() => ({
      ...hqStatus(settings.enabled ? 'available' : 'disabled'),
      enabled: settings.enabled,
      endpoint: {
        connectionMode: settings.connectionMode,
        host: settings.host,
        port: settings.port,
      },
    })),
    testConnection: vi.fn().mockImplementation(async (patch?: Partial<HqPlayerSettings>) => hqConnectionOk({ ...settings, ...patch })),
    createPlaybackHandoff: vi.fn().mockResolvedValue({
      state: 'ready',
      reason: null,
      control: {
        state: 'prepared',
        reason: null,
      },
    }),
    sendLastPlaybackControl: vi.fn().mockResolvedValue({
      state: 'sent',
      reason: null,
      message: null,
    }),
    seekPlayback: vi.fn().mockResolvedValue({
      state: 'sent',
      reason: null,
      message: null,
    }),
    stopPlayback: vi.fn().mockResolvedValue({
      state: 'sent',
      reason: null,
      message: null,
    }),
  };
};

const hqConnectionRefused: HqPlayerConnectionTestResult = {
  ok: false,
  state: 'unavailable',
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  elapsedMs: 12,
  checkedAt: '2026-05-21T01:00:00.000Z',
  error: 'hqplayer_connection_refused',
};

const hqConnectionWithoutPlayback: HqPlayerConnectionTestResult = {
  ok: true,
  state: 'available',
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  elapsedMs: 8,
  checkedAt: '2026-05-21T01:00:00.000Z',
  error: null,
  playbackStatus: null,
};

describe('ConnectService HQPlayer output device', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.audioSession.getStatus.mockReturnValue({
      state: 'playing',
      currentTrackId: localTrack.id,
      currentFilePath: localTrack.path,
      positionSeconds: 7,
    });
    mocks.audioSession.pause.mockResolvedValue({});
    mocks.audioSession.stop.mockReturnValue({});
    mocks.libraryService.getTrack.mockReturnValue(localTrack);
    mocks.libraryService.resolveCoverAsset.mockReturnValue(null);
  });

  it('lists HQPlayer as a synthetic Connect output device', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    const service = new ConnectService(hqPlayer);

    expect(service.listDevices()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: hqPlayerConnectDeviceId,
        name: 'HQPlayer Desktop',
        protocol: 'hqplayer',
        state: 'unavailable',
        capabilities: expect.objectContaining({
          canPlay: false,
          canPause: false,
          canStop: false,
          canSetVolume: false,
        }),
      }),
    ]));
  });

  it('surfaces the last HQPlayer control probe on the synthetic device', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    hqPlayer.getStatus.mockReturnValue({
      ...hqStatus('available'),
      lastCheckedAt: '2026-05-21T01:00:00.000Z',
      controlInfo: {
        name: 'Living Room',
        product: 'HQPlayer Desktop',
        version: '5.17.2',
        platform: 'Windows',
        engine: '5.29.2',
        receivedAt: '2026-05-21T01:00:01.000Z',
      },
    });
    const service = new ConnectService(hqPlayer);

    expect(service.listDevices()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: hqPlayerConnectDeviceId,
        model: 'HQPlayer Desktop 5.17.2',
        lastSeenAt: '2026-05-21T01:00:01.000Z',
      }),
    ]));
  });

  it('connects HQPlayer through the official control sender after releasing local ECHO playback', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    const service = new ConnectService(hqPlayer);
    const request: ConnectStartRequest = {
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
      positionSeconds: 7,
    };

    await expect(service.connect(request)).resolves.toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'playing',
      currentTrackId: localTrack.id,
      positionSeconds: 7,
    });

    expect(hqPlayer.setSettings).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
    }));
    expect(hqPlayer.testConnection).toHaveBeenCalledTimes(2);
    expect(hqPlayer.createPlaybackHandoff).toHaveBeenCalledWith(expect.objectContaining({
      confirmed: true,
      startSeconds: 7,
      item: expect.objectContaining({
        mediaType: 'local',
        trackId: localTrack.id,
        path: localTrack.path,
      }),
    }));
    expect(hqPlayer.sendLastPlaybackControl).toHaveBeenCalledOnce();
    expect(mocks.audioSession.stop).toHaveBeenCalledOnce();
    expect(mocks.audioSession.pause).not.toHaveBeenCalled();
    expect(mocks.audioSession.stop.mock.invocationCallOrder[0]).toBeLessThan(
      hqPlayer.sendLastPlaybackControl.mock.invocationCallOrder[0],
    );
  });

  it('preserves configured remote HQPlayer endpoint when connecting', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService({
      enabled: true,
      connectionMode: 'remote',
      host: '10.0.0.8',
      port: 4322,
      mediaServerEnabled: true,
    });
    const service = new ConnectService(hqPlayer);

    await expect(service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    })).resolves.toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'playing',
    });

    expect(hqPlayer.setSettings).not.toHaveBeenCalled();
    expect(hqPlayer.testConnection).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      connectionMode: 'remote',
      host: '10.0.0.8',
      port: 4322,
      mediaServerEnabled: true,
    }));
    expect(mocks.audioSession.pause).toHaveBeenCalledOnce();
    expect(mocks.audioSession.stop).not.toHaveBeenCalled();
    expect(mocks.audioSession.pause.mock.invocationCallOrder[0]).toBeLessThan(
      hqPlayer.sendLastPlaybackControl.mock.invocationCallOrder[0],
    );
  });

  it('seeks the active HQPlayer session through HQPlayer control instead of DLNA', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    const service = new ConnectService(hqPlayer);

    await service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    });

    await expect(service.seek(42.6)).resolves.toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      positionSeconds: 42.6,
    });
    expect(hqPlayer.seekPlayback).toHaveBeenCalledWith(42.6);
  });

  it('stops HQPlayer playback before disconnecting the active HQPlayer session', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    const service = new ConnectService(hqPlayer);

    await service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    });

    await expect(service.disconnect()).resolves.toMatchObject({
      deviceId: null,
      protocol: null,
      state: 'idle',
    });
    expect(hqPlayer.stopPlayback).toHaveBeenCalledOnce();
  });

  it('routes stop to HQPlayer control when HQPlayer is the active output', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    const service = new ConnectService(hqPlayer);

    await service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    });

    await expect(service.stop()).resolves.toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'stopped',
      positionSeconds: 0,
    });
    expect(hqPlayer.stopPlayback).toHaveBeenCalledOnce();
  });

  it('keeps HQPlayer connection failures visible on the Connect session', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    hqPlayer.testConnection.mockResolvedValueOnce(hqConnectionRefused);
    const service = new ConnectService(hqPlayer);

    await expect(service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    })).rejects.toThrow('hqplayer_connection_refused');

    expect(service.getStatus()).toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'error',
      error: 'hqplayer_connection_refused',
    });
    expect(hqPlayer.sendLastPlaybackControl).not.toHaveBeenCalled();
    expect(mocks.audioSession.stop).not.toHaveBeenCalled();
  });

  it('does not mark HQPlayer as playing until Status confirms playback', async () => {
    const { ConnectService } = await import('./ConnectService');
    const hqPlayer = createHqPlayerService();
    hqPlayer.testConnection.mockResolvedValue(hqConnectionWithoutPlayback);
    const service = new ConnectService(hqPlayer);

    await expect(service.connect({
      deviceId: hqPlayerConnectDeviceId,
      track: localTrack,
      filePath: localTrack.path,
    })).rejects.toThrow(/未确认播放/u);

    expect(hqPlayer.sendLastPlaybackControl).toHaveBeenCalledOnce();
    expect(mocks.audioSession.stop).toHaveBeenCalledOnce();
    expect(service.getStatus()).toMatchObject({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'error',
      error: expect.stringMatching(/未确认播放/u),
    });
    expect(mocks.audioSession.pause).not.toHaveBeenCalled();
  });
});
