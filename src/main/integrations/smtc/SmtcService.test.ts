import { describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../../shared/types/audio';
import { IpcChannels } from '../../../shared/constants/ipcChannels';
import { NoopSmtcService } from './NoopSmtcService';
import { bindSmtcCommandBridge, createSmtcMetadataFromStatus } from './SmtcStatusSync';
import { createSmtcService } from './getSmtcService';
import type { SmtcCommand, SmtcService } from './SmtcService';

const getTrackMock = vi.fn();
const resolveCoverAssetMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'D:\\Project\\ECHONext',
    getPath: () => 'D:\\Echo',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  },
}));

vi.mock('../../library/LibraryService', () => ({
  getLibraryService: () => ({
    getTrack: getTrackMock,
    resolveCoverAsset: resolveCoverAssetMock,
  }),
}));

vi.mock('../../diagnostics/CrashReportService', () => ({
  getCrashReportService: () => ({
    getLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

const makeStatus = (overrides: Partial<AudioStatus> = {}): AudioStatus => ({
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: null,
  outputMode: 'shared',
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: 'D:\\Music\\Loose File.flac',
  currentTrackId: null,
  durationSeconds: 95,
  positionSeconds: 4,
  channels: 2,
  codec: 'flac',
  bitDepth: 16,
  bitrate: 900000,
  fileSampleRate: 44100,
  decoderOutputSampleRate: 44100,
  requestedOutputSampleRate: 44100,
  actualDeviceSampleRate: 44100,
  sharedDeviceSampleRate: 44100,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: 'Flat',
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
  ...overrides,
  activeOutputBackendImpl: overrides.activeOutputBackendImpl ?? null,
  useJuceOutputRequested: overrides.useJuceOutputRequested ?? false,
  activeDecodeBackendImpl: overrides.activeDecodeBackendImpl ?? null,
  useJuceDecodeRequested: overrides.useJuceDecodeRequested ?? false,
});

describe('SMTC service', () => {
  it('NoopSmtcService methods do not throw', () => {
    const service = new NoopSmtcService();

    expect(() => service.initialize()).not.toThrow();
    expect(() => service.setPlaybackState('playing')).not.toThrow();
    expect(() =>
      service.setMetadata({
        trackId: null,
        title: 'Song',
        artist: 'Artist',
        album: null,
        albumArtist: null,
        durationSeconds: 1,
        positionSeconds: 0,
        coverPath: null,
        coverUrl: null,
      }),
    ).not.toThrow();
    expect(() => service.dispose()).not.toThrow();
    expect(service.getDiagnostics()).toMatchObject({
      hostState: 'disabled',
      lastError: null,
    });
  });

  it('returns a no-op service outside Windows', () => {
    expect(createSmtcService('linux')).toBeInstanceOf(NoopSmtcService);
  });

  it('forwards SMTC commands to the renderer window', () => {
    const handlers: Array<(command: SmtcCommand) => void> = [];
    const service: SmtcService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      setPlaybackState: vi.fn(),
      setMetadata: vi.fn(),
      setTimeline: vi.fn(),
      setEnabledActions: vi.fn(),
      onCommand: vi.fn((nextHandler) => {
        handlers[0] = nextHandler;
        return () => {
          handlers.length = 0;
        };
      }),
    };
    const send = vi.fn();
    const unsubscribe = bindSmtcCommandBridge(
      service,
      () =>
        ({
          isDestroyed: () => false,
          webContents: { send },
        }) as never,
    );

    expect(handlers[0]).toBeTruthy();
    handlers[0]?.('next');
    handlers[0]?.({ type: 'seek', positionSeconds: 32 });

    expect(send).toHaveBeenCalledWith(IpcChannels.SmtcCommand, 'next');
    expect(send).toHaveBeenCalledWith(IpcChannels.SmtcCommand, { type: 'seek', positionSeconds: 32 });
    unsubscribe();
    expect(handlers).toHaveLength(0);
  });

  it('uses the file basename when there is no track id', () => {
    const metadata = createSmtcMetadataFromStatus(makeStatus());

    expect(metadata.title).toBe('Loose File.flac');
    expect(metadata.artist).toBe('Local file');
    expect(metadata.coverPath).toBeNull();
  });

  it('does not throw when cover resolution fails', () => {
    getTrackMock.mockReturnValue({
      id: 'track-1',
      path: 'D:\\Music\\Track.flac',
      title: 'Library Song',
      artist: 'Library Artist',
      album: 'Library Album',
      albumArtist: 'Library Album Artist',
      duration: 120,
      coverId: 'cover-1',
    });
    resolveCoverAssetMock.mockImplementation(() => {
      throw new Error('cover boom');
    });

    expect(() => createSmtcMetadataFromStatus(makeStatus({ currentTrackId: 'track-1' }))).not.toThrow();
    expect(createSmtcMetadataFromStatus(makeStatus({ currentTrackId: 'track-1' })).coverPath).toBeNull();
  });
});
