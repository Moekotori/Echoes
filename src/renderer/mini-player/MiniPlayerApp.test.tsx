// @vitest-environment jsdom
import { useEffect, useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioStatus } from '../../shared/types/audio';
import type { LibraryTrack } from '../../shared/types/library';
import type { PlaybackStatus } from '../../shared/types/playback';
import { PlaybackQueueProvider, usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { MiniPlayerApp } from './MiniPlayerApp';

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Mini Song.flac',
  title: 'Mini Song',
  artist: 'Mini Artist',
  album: 'Mini Album',
  albumArtist: 'Mini Album Artist',
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
  coverThumb: 'echo-cover://thumb/mini-cover',
  fieldSources: {},
  ...overrides,
});

const makeAudioStatus = (track: LibraryTrack): AudioStatus => ({
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: 'wasapi-shared',
  activeOutputBackendImpl: null,
  outputMode: 'shared',
  useJuceOutputRequested: false,
  useJuceDecodeRequested: false,
  activeDecodeBackendImpl: null,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: track.path,
  currentTrackId: track.id,
  currentTrackTitle: track.title,
  currentTrackArtist: track.artist,
  currentTrackAlbum: track.album,
  currentTrackAlbumArtist: track.albumArtist,
  currentTrackCoverUrl: 'echo-cover://thumb/status-cover',
  durationSeconds: track.duration,
  positionSeconds: 42,
  channels: 2,
  codec: track.codec,
  bitDepth: track.bitDepth,
  bitrate: track.bitrate,
  fileSampleRate: track.sampleRate,
  decoderOutputSampleRate: track.sampleRate,
  requestedOutputSampleRate: track.sampleRate,
  actualDeviceSampleRate: track.sampleRate,
  sharedDeviceSampleRate: track.sampleRate,
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
});

const makePlaybackStatus = (track: LibraryTrack): PlaybackStatus => ({
  state: 'playing',
  currentTrackId: track.id,
  positionMs: 42_000,
  durationMs: track.duration * 1000,
  filePath: track.path,
});

const installEchoMock = (track: LibraryTrack): void => {
  const audioStatus = makeAudioStatus(track);
  const playbackStatus = makePlaybackStatus(track);

  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: {
      app: {
        getSettings: vi.fn().mockResolvedValue({ gaplessPlaybackEnabled: false }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus),
        onStatus: vi.fn(() => vi.fn()),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue(playbackStatus),
        getQueueSession: vi.fn().mockResolvedValue(null),
        saveQueueSession: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue({ ...playbackStatus, state: 'paused' }),
        play: vi.fn().mockResolvedValue(playbackStatus),
        playLocalFile: vi.fn().mockResolvedValue(playbackStatus),
        seek: vi.fn().mockResolvedValue(playbackStatus),
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue(null),
        onStatus: vi.fn(() => vi.fn()),
      },
      desktopLyrics: {
        getLastAudioStatus: vi.fn().mockResolvedValue(null),
        onAudioStatus: vi.fn(() => undefined),
      },
      miniPlayer: {
        getState: vi.fn().mockResolvedValue({
          visible: true,
          locked: false,
          bounds: null,
          settings: {
            miniPlayerEnabled: true,
            miniPlayerLocked: false,
            miniPlayerAutoHideMainWindow: false,
            miniPlayerBounds: null,
          },
        }),
        onStateChanged: vi.fn(() => undefined),
        hide: vi.fn(),
        show: vi.fn(),
        setLocked: vi.fn(),
        setQueueOpen: vi.fn().mockResolvedValue(null),
        resetBounds: vi.fn(),
      },
    } as unknown as Window['echo'],
  });
};

const QueueSeed = ({ track, tracks }: { track: LibraryTrack; tracks?: LibraryTrack[] }): JSX.Element => {
  const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();
  const seedTracks = useMemo(() => tracks ?? [track], [track, tracks]);

  useEffect(() => {
    replaceQueue(seedTracks, { startTrackId: track.id });
    setCurrentTrackId(track.id);
  }, [replaceQueue, seedTracks, setCurrentTrackId, track.id]);

  return <MiniPlayerApp />;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MiniPlayerApp', () => {
  it('renders lightweight track metadata, artwork, and progress', async () => {
    const track = makeTrack();
    installEchoMock(track);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track} />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText('Mini Song')).toBeTruthy();
    expect(screen.getByText('Mini Artist')).toBeTruthy();
    expect(document.querySelector('.mini-player-cover img')?.getAttribute('src')).toBe('echo-cover://thumb/mini-cover');
    await waitFor(() => expect((screen.getByRole('slider', { name: '播放进度' }) as HTMLInputElement).value).toBe('42'));
  });

  it('commits a seek when the visible progress slider is dragged', async () => {
    const track = makeTrack();
    installEchoMock(track);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track} />
      </PlaybackQueueProvider>,
    );

    const slider = await screen.findByRole('slider', { name: '播放进度' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '90' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(window.echo?.playback?.seek).toHaveBeenCalledWith(90));
  });

  it('opens the mini queue and plays a selected queue item', async () => {
    const firstTrack = makeTrack();
    const secondTrack = makeTrack({
      id: 'track-2',
      path: 'D:\\Music\\Queue Pick.flac',
      title: 'Queue Pick',
      artist: 'Queue Artist',
    });
    installEchoMock(firstTrack);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={firstTrack} tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '打开播放队列' }));

    expect(window.echo?.miniPlayer?.setQueueOpen).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('listbox', { name: '播放队列' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Queue Pick/ }));

    await waitFor(() =>
      expect(window.echo?.playback?.playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
        filePath: secondTrack.path,
        trackId: secondTrack.id,
      })),
    );
  });

  it('prefers live playback status over stale mini player queue metadata', async () => {
    const queuedTrack = makeTrack({
      id: 'stale-track',
      path: 'D:\\Music\\Episode 33.flac',
      title: 'Episode 33',
      artist: 'She Her Her Hers',
      coverThumb: 'echo-cover://thumb/stale-cover',
    });
    const liveTrack = makeTrack({
      id: 'live-track',
      path: 'D:\\Music\\Promise Song.flac',
      title: '約束になれ僕らの歌',
      artist: '虹ヶ咲学園スクールアイドル同好会',
      coverThumb: null,
    });
    installEchoMock(liveTrack);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={queuedTrack} />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText('約束になれ僕らの歌')).toBeTruthy();
    expect(screen.getByText('虹ヶ咲学園スクールアイドル同好会')).toBeTruthy();
    expect(screen.queryByText('Episode 33')).toBeNull();
    expect(document.querySelector('.mini-player-cover img')?.getAttribute('src')).toBe('echo-cover://thumb/status-cover');
  });
});
