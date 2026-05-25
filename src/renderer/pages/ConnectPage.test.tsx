// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hqPlayerConnectDeviceId, type ConnectDevice, type ConnectSessionStatus } from '../../shared/types/connect';
import type {
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackControlSendState,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../shared/types/hqplayer';
import { ConnectPage } from './ConnectPage';

const queueMock = {
  currentTrack: {
    mediaType: 'local',
    id: 'track-1',
    path: 'D:\\Music\\song.flac',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
  },
  lastPlayedTrack: null,
};

const playbackStatusMock = {
  audioStatus: {
    currentFilePath: 'D:\\Music\\song.flac',
    positionSeconds: 12,
  },
  playbackStatus: null,
};

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

vi.mock('../stores/playbackStatusStore', () => ({
  useSharedPlaybackStatus: () => playbackStatusMock,
}));

const hqSettings: HqPlayerSettings = {
  enabled: true,
  connectionMode: 'localDesktop',
  host: '127.0.0.1',
  port: 4321,
  executablePath: null,
  allowLaunch: false,
  mediaServerEnabled: true,
  mediaServerPort: null,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
};

const hqStatus = (state: HqPlayerStatus['state']): HqPlayerStatus => ({
  enabled: true,
  state,
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  mediaServerEnabled: true,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
  lastCheckedAt: '2026-05-21T01:00:00.000Z',
  lastError: null,
});

const hqControl = (sendState: HqPlayerPlaybackControlSendState = 'prepared'): HqPlayerPlaybackControlPlan => ({
  state: 'prepared',
  reason: null,
  action: 'play-source',
  transport: 'dry-run',
  endpoint: {
    connectionMode: 'localDesktop',
    host: '127.0.0.1',
    port: 4321,
  },
  profileName: null,
  source: {
    trackId: 'track-1',
    mediaType: 'local',
    url: 'D:\\Music\\song.flac',
    exposure: 'local-file',
    mimeType: 'audio/flac',
    expiresAt: null,
    hasHeaders: false,
  },
  metadata: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    durationSeconds: 180,
  },
  startSeconds: 12,
  createdAt: '2026-05-21T01:00:00.000Z',
  send: {
    state: sendState,
    reason: null,
    transport: 'official-control-tcp',
    command: 'PlayNextURI+Play+Seek',
    endpoint: {
      connectionMode: 'localDesktop',
      host: '127.0.0.1',
      port: 4321,
    },
    startedAt: '2026-05-21T01:00:00.000Z',
    finishedAt: sendState === 'sent' ? '2026-05-21T01:00:00.012Z' : '2026-05-21T01:00:00.000Z',
    elapsedMs: sendState === 'sent' ? 12 : 0,
    message: null,
    response: sendState === 'sent' ? '<PlayNextURI result="OK"/>\n<Play result="OK"/>\n<Seek result="OK"/>' : null,
  },
});

const hqHandoff = (control = hqControl()): HqPlayerPlaybackHandoffPlan => ({
  state: 'ready',
  reason: null,
  endpoint: control.endpoint,
  defaultPlaybackBackend: 'hqplayer',
  profileName: null,
  source: {
    trackId: 'track-1',
    mediaType: 'local',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    url: 'D:\\Music\\song.flac',
    exposure: 'local-file',
    headers: {},
    mimeType: 'audio/flac',
    expiresAt: null,
    durationSeconds: 180,
    startSeconds: 12,
    mediaServer: null,
    streaming: null,
  },
  fallback: null,
  control,
  createdAt: '2026-05-21T01:00:00.000Z',
});

const connectStatus: ConnectSessionStatus = {
  deviceId: null,
  protocol: null,
  state: 'idle',
  currentTrackId: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  latencyMs: null,
  error: null,
  updatedAt: '2026-05-21T01:00:00.000Z',
};

const hqPlayerDevice: ConnectDevice = {
  id: hqPlayerConnectDeviceId,
  name: 'HQPlayer Desktop',
  protocol: 'hqplayer',
  model: 'Local Desktop Control',
  manufacturer: 'Signalyst',
  address: '127.0.0.1:4321',
  capabilities: {
    canPlay: false,
    canPause: false,
    canStop: false,
    canSeek: false,
    canSetVolume: false,
    supportsMetadata: true,
    supportsSetNext: false,
    supportedMimeTypes: [],
    requiresTranscode: false,
  },
  state: 'available',
  lastSeenAt: null,
  unsupportedReason: null,
};

const hqPlayerConnectStatus: ConnectSessionStatus = {
  deviceId: hqPlayerConnectDeviceId,
  protocol: 'hqplayer',
  state: 'playing',
  currentTrackId: 'track-1',
  metadata: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: null,
    durationSeconds: 180,
    coverHttpUrl: '',
  },
  positionSeconds: 12,
  durationSeconds: 180,
  latencyMs: 12,
  error: null,
  updatedAt: '2026-05-21T01:00:00.000Z',
};

const installEchoBridge = (
  status: HqPlayerStatus,
  settings: HqPlayerSettings = hqSettings,
  initialConnectStatus: ConnectSessionStatus = connectStatus,
) => {
  const sentControl = hqControl('sent');
  const bridge = {
    app: {
      getSettings: vi.fn().mockResolvedValue({ connectAutoStartReceiversEnabled: false }),
      setSettings: vi.fn(),
    },
    connect: {
      listDevices: vi.fn().mockResolvedValue([hqPlayerDevice]),
      refresh: vi.fn().mockResolvedValue([hqPlayerDevice]),
      getStatus: vi.fn().mockResolvedValue(initialConnectStatus),
      connect: vi.fn().mockResolvedValue(hqPlayerConnectStatus),
      disconnect: vi.fn().mockResolvedValue(connectStatus),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      onStatus: vi.fn(() => () => undefined),
      getReceiverStatus: vi.fn().mockResolvedValue({
        enabled: false,
        state: 'disabled',
        advertisedName: 'ECHO Next',
        addresses: [],
        currentClient: null,
        currentUri: null,
        metadata: null,
        positionSeconds: 0,
        durationSeconds: 0,
        volume: 100,
        error: null,
        debugEvents: [],
        updatedAt: '2026-05-21T01:00:00.000Z',
      }),
      setReceiverEnabled: vi.fn(),
      stopReceiverPlayback: vi.fn(),
      onReceiverStatus: vi.fn(() => () => undefined),
      getAirPlayReceiverStatus: vi.fn().mockResolvedValue({
        enabled: false,
        state: 'disabled',
        advertisedName: 'ECHO Next (AirPlay)',
        nativeAvailable: false,
        currentSourceId: null,
        currentClient: null,
        metadata: null,
        currentLyricLine: null,
        artworkUrl: null,
        positionSeconds: 0,
        durationSeconds: 0,
        volume: 100,
        error: null,
        debugEvents: [],
        updatedAt: '2026-05-21T01:00:00.000Z',
      }),
      setAirPlayReceiverEnabled: vi.fn(),
      stopAirPlayReceiverPlayback: vi.fn(),
      onAirPlayReceiverStatus: vi.fn(() => () => undefined),
    },
    hqPlayer: {
      getSettings: vi.fn().mockResolvedValue(settings),
      setSettings: vi.fn().mockImplementation(async (patch: HqPlayerSettings) => ({ ...settings, ...patch })),
      getStatus: vi.fn().mockResolvedValue(status),
      testConnection: vi.fn().mockResolvedValue({
        ok: true,
        state: 'available',
        endpoint: {
          connectionMode: 'localDesktop',
          host: '127.0.0.1',
          port: 4321,
        },
        elapsedMs: 12,
        checkedAt: '2026-05-21T01:00:00.000Z',
        error: null,
      }),
      createPlaybackHandoff: vi.fn().mockResolvedValue(hqHandoff()),
      sendLastPlaybackControl: vi.fn().mockResolvedValue(sentControl.send),
      getLastPlaybackHandoff: vi.fn()
        .mockResolvedValueOnce(hqHandoff())
        .mockResolvedValue(hqHandoff(sentControl)),
      getLastPlaybackControl: vi.fn()
        .mockResolvedValueOnce(hqControl())
        .mockResolvedValue(sentControl),
    },
  };
  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: bridge,
  });
  return bridge;
};

describe('ConnectPage HQPlayer controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'echo');
  });

  it('shows HQPlayer as a Connect output device and routes connection through Connect', async () => {
    const bridge = installEchoBridge(hqStatus('available'));
    render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop');
    const row = screen.getByText('HQPlayer Desktop').closest('article');
    expect(row).toBeTruthy();
    const connectButton = row?.querySelector('button');
    expect(connectButton).toBeTruthy();

    fireEvent.click(connectButton as HTMLButtonElement);

    await waitFor(() => expect(bridge.connect.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: hqPlayerConnectDeviceId,
        track: expect.objectContaining({ id: 'track-1' }),
        filePath: 'D:\\Music\\song.flac',
        positionSeconds: 12,
      }),
    ));
    expect(bridge.hqPlayer.sendLastPlaybackControl).not.toHaveBeenCalled();
  });

  it('connects local HQPlayer with the default desktop endpoint instead of requiring a typed port', async () => {
    const bridge = installEchoBridge(hqStatus('unavailable'), {
      ...hqSettings,
      enabled: false,
      port: null,
      defaultPlaybackBackend: 'echoNative',
    });
    render(<ConnectPage />);

    fireEvent.click(await screen.findByRole('button', { name: /检测 HQPlayer/u }));

    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        connectionMode: 'localDesktop',
        host: '127.0.0.1',
        port: 4321,
        defaultPlaybackBackend: 'echoNative',
      }),
    ));
    expect(bridge.hqPlayer.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 4321,
      }),
    );
  });

  it('keeps the HQPlayer details collapsed while disabled and expands after enabling', async () => {
    const bridge = installEchoBridge(hqStatus('disabled'), {
      ...hqSettings,
      enabled: false,
    });
    const { container } = render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop');
    await waitFor(() => expect(container.querySelector('.connect-hqplayer-collapsed')).toBeTruthy());
    expect(container.querySelector('.connect-hqplayer-layout')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '启用 HQPlayer' }));

    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));
    await waitFor(() => expect(container.querySelector('.connect-hqplayer-layout')).toBeTruthy());
    expect(container.querySelector('.connect-hqplayer-collapsed')).toBeNull();
  });

  it('shows read-only HQPlayer probe details in the diagnostics area', async () => {
    installEchoBridge({
      ...hqStatus('available'),
      controlInfo: {
        name: 'Living Room',
        product: 'HQPlayer Desktop',
        version: '5.17.2',
        platform: 'Windows',
        engine: '5.29.2',
        receivedAt: '2026-05-21T01:00:00.000Z',
      },
      playbackStatus: {
        state: 'playing',
        stateCode: 2,
        track: 1,
        trackId: 'track-1',
        tracksTotal: 1,
        queued: false,
        positionSeconds: 12,
        durationSeconds: 180,
        volume: -3,
        activeMode: 'poly-sinc',
        activeFilter: 'sinc-M',
        activeShaper: 'ASDM7',
        activeRate: 2822400,
        activeBits: 1,
        activeChannels: 2,
        inputFill: 0.5,
        outputFill: 0.7,
        outputDelayUs: 12000,
        apodizing: 1,
        metadata: null,
        receivedAt: '2026-05-21T01:00:00.000Z',
      },
    });
    render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop 5.17.2');
    expect(screen.getByText('5.29.2')).toBeTruthy();
    expect(screen.getByText(/播放中/u)).toBeTruthy();
    expect(screen.getByText(/2822400Hz/u)).toBeTruthy();
  });

  it('keeps enabled local HQPlayer passive until the user manually tests it', async () => {
    const bridge = installEchoBridge(hqStatus('unavailable'), hqSettings);
    render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop');
    await waitFor(() => expect(bridge.hqPlayer.getStatus).toHaveBeenCalled());
    expect(bridge.hqPlayer.testConnection).not.toHaveBeenCalled();
  });

  it('stops the active HQPlayer session when HQPlayer is disabled', async () => {
    const bridge = installEchoBridge(hqStatus('available'), hqSettings, hqPlayerConnectStatus);
    render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop');
    const hqPlayerToggle = screen
      .getAllByRole('button', { name: /HQPlayer/u })
      .find((button) => button.className.includes('toggle-btn'));
    expect(hqPlayerToggle).toBeTruthy();

    fireEvent.click(hqPlayerToggle as HTMLButtonElement);

    await waitFor(() => expect(bridge.connect.disconnect).toHaveBeenCalled());
    await waitFor(() => expect(bridge.hqPlayer.setSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })));
  });

  it('disables unsupported transport controls while HQPlayer is the active output', async () => {
    installEchoBridge(hqStatus('available'), hqSettings, hqPlayerConnectStatus);
    render(<ConnectPage />);

    await screen.findByText('HQPlayer Desktop');

    expect((screen.getByRole('button', { name: '播放' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '暂停' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '停止' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '断开' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
