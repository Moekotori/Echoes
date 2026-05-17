// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioStatus } from '../../../shared/types/audio';
import type { EqState } from '../../../shared/types/eq';
import type { GlobalShortcutAction } from '../../../shared/types/globalShortcuts';
import type { LibraryTrack } from '../../../shared/types/library';
import { PlaybackQueueProvider, usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { PlaybackCommandController } from './PlaybackCommandController';
import { PlayerBar } from './PlayerBar';

const makeTrack = (index: number, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: `track-${index}`,
  path: `D:\\Music\\song-${index}.flac`,
  title: `Song ${index}`,
  artist: `Artist ${index}`,
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: index,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180 + index,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const audioStatus = (track: LibraryTrack): AudioStatus => ({
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
  durationSeconds: track.duration,
  positionSeconds: 4,
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

const eqState = (): EqState => ({
  enabled: false,
  preampDb: 0,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequencyHz) => ({
    frequencyHz,
    gainDb: 0,
    q: 1,
  })),
});

const QueueSeed = ({ tracks }: { tracks: LibraryTrack[] }): JSX.Element => {
  const { setCurrentTrackId, replaceQueue } = usePlaybackQueue();

  useEffect(() => {
    replaceQueue(tracks);
    setCurrentTrackId(tracks[0]?.id ?? null);
  }, [replaceQueue, setCurrentTrackId, tracks]);

  return <PlayerBar />;
};

const ExternalPlaySeed = ({ track }: { track: LibraryTrack }): JSX.Element => {
  const { playTrack } = usePlaybackQueue();

  useEffect(() => {
    void playTrack(track);
  }, [playTrack, track]);

  return <PlayerBar />;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PlayerBar', () => {
  it('opens the lyrics page when the artwork button is clicked', async () => {
    const track = makeTrack(3, {
      title: 'Cover Click Track',
      artist: 'Cover Click Artist',
      coverId: 'cover-click',
      coverThumb: 'echo-cover://thumb/cover-click',
    });
    const onNavigateLyrics = vi.fn();
    const onNavigateNowPlaying = vi.fn();

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 12000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(track),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];
    window.addEventListener('app:navigate:lyrics', onNavigateLyrics);
    window.addEventListener('app:navigate:now-playing', onNavigateNowPlaying);

    try {
      render(
        <PlaybackQueueProvider>
          <PlayerBar />
        </PlaybackQueueProvider>,
      );

      await screen.findByText('Cover Click Track');
      fireEvent.click(screen.getByRole('button', { name: '打开歌词' }));

      expect(onNavigateLyrics).toHaveBeenCalledTimes(1);
      expect(onNavigateNowPlaying).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('app:navigate:lyrics', onNavigateLyrics);
      window.removeEventListener('app:navigate:now-playing', onNavigateNowPlaying);
    }
  });

  it('shows a short audiohost timeout message in the footer', async () => {
    const track = makeTrack(12);
    const rawError =
      'echo-audio-host timeout_waiting_for_ready; host="echo-audio-host.exe"; args="-sr 44100 -ch 2"; mode="shared"; elapsedMs=15000; stderrTail="[echo-audio-host] createDevice is still waiting"';

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'error',
          currentTrackId: track.id,
          positionMs: 0,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(track),
          state: 'error',
          error: rawError,
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(track),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <PlayerBar />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText('音频输出启动超时，可能是驱动初始化太慢、设备被占用，或采样率/缓冲设置被拒绝。')).toBeTruthy();
    expect(screen.queryByText(/timeout_waiting_for_ready/)).toBeNull();
  });

  it('hydrates restored playback from the library so cover art survives restart', async () => {
    const restoredTrack = makeTrack(9, {
      title: 'Restored Track',
      artist: 'Restored Artist',
      coverId: 'cover-restored',
      coverThumb: 'echo-cover://thumb/cover-restored',
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'paused',
          currentTrackId: restoredTrack.id,
          positionMs: 138000,
          durationMs: restoredTrack.duration * 1000,
          filePath: restoredTrack.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(restoredTrack),
          state: 'paused',
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(restoredTrack),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [restoredTrack.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <PlaybackQueueProvider>
        <PlayerBar />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Restored Track');
    expect(screen.getByText('Restored Artist')).toBeTruthy();
    expect(container.querySelector('.player-cover img')?.getAttribute('src')).toBe('echo-cover://original/cover-restored');
  });

  it('shows cover art for a track started outside the SongsPage loaded queue', async () => {
    const albumTrack = makeTrack(7, {
      title: 'Album Detail Track',
      artist: 'Album Detail Artist',
      coverThumb: 'echo-cover://album/cover-7',
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: null,
          positionMs: 0,
          durationMs: albumTrack.duration * 1000,
          filePath: albumTrack.path,
        }),
        playLocalFile: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: albumTrack.id,
          positionMs: 0,
          durationMs: albumTrack.duration * 1000,
          filePath: albumTrack.path,
        }),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(albumTrack),
          currentTrackId: null,
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <PlaybackQueueProvider>
        <ExternalPlaySeed track={albumTrack} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Album Detail Track');
    expect(screen.getByText('Album Detail Artist')).toBeTruthy();
    expect(container.querySelector('.player-cover img')?.getAttribute('src')).toBe('echo-cover://original/cover-7');
    expect(screen.queryByText(/\.flac$/i)).toBeNull();
    expect(screen.queryByText('Local file')).toBeNull();
  });

  it('keeps the newly queued next track visible when audio status still reports the previous track', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    let playbackTrack = firstTrack;

    window.echo = {
      playback: {
        getStatus: vi.fn().mockImplementation(() =>
          Promise.resolve({
            state: 'playing',
            currentTrackId: playbackTrack.id,
            positionMs: 4000,
            durationMs: playbackTrack.duration * 1000,
            filePath: playbackTrack.path,
          }),
        ),
        playLocalFile: vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) => {
          playbackTrack = trackId === secondTrack.id ? secondTrack : firstTrack;

          return Promise.resolve({
            state: 'playing',
            currentTrackId: trackId ?? playbackTrack.id,
            positionMs: 0,
            durationMs: playbackTrack.duration * 1000,
            filePath,
          });
        }),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText('Song 2')).toBeTruthy());
    expect(screen.queryByText('Song 1')).toBeNull();
  });

  it('keeps the transport in playing view while a track switch is pending', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    let audioStatusHandler: ((status: AudioStatus) => void) | null = null;
    let resolveSecondPlay: (() => void) | null = null;
    const playLocalFile = vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) =>
      new Promise((resolve) => {
        resolveSecondPlay = () =>
          resolve({
            state: 'playing',
            currentTrackId: trackId ?? secondTrack.id,
            positionMs: 0,
            durationMs: secondTrack.duration * 1000,
            filePath,
          });
      }),
    );

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: firstTrack.id,
          positionMs: 4000,
          durationMs: firstTrack.duration * 1000,
          filePath: firstTrack.path,
        }),
        playLocalFile,
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        onStatus: vi.fn((handler) => {
          audioStatusHandler = handler;
          return () => undefined;
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getLikedTrackIds: vi.fn().mockResolvedValue({ [firstTrack.id]: false, [secondTrack.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByRole('button', { name: 'Pause' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: secondTrack.id })));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    act(() => {
      audioStatusHandler?.({
        ...audioStatus(firstTrack),
        state: 'paused',
      });
    });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    const finishSecondPlay = resolveSecondPlay ?? (() => undefined);
    act(() => {
      finishSecondPlay();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
  });

  it('keeps volume and playback speed popovers mutually exclusive', async () => {
    const track = makeTrack(1);

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Volume' }).parentElement!);
    expect(screen.getByText('100%')).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '播放速度' }).parentElement!);
    expect(screen.getByText('1.00x')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('100%')).toBeNull());

    fireEvent.pointerMove(window, { clientX: 500, clientY: 500 });
    await waitFor(() => expect(screen.queryByText('1.00x')).toBeNull());
  });

  it('handles the space playback shortcut even when the focused target stops keydown bubbling', async () => {
    const track = makeTrack(1);
    const pause = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: track.id,
      positionMs: 4000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
        <div data-testid="space-blocker" tabIndex={0} onKeyDown={(event) => event.stopPropagation()} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    fireEvent.keyDown(screen.getByTestId('space-blocker'), { code: 'Space', key: ' ' });

    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
  });

  it('does not hijack space typed into editable fields', async () => {
    const track = makeTrack(1);
    const pause = vi.fn();

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
        <input aria-label="Search text" />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    fireEvent.keyDown(screen.getByLabelText('Search text'), { code: 'Space', key: ' ' });

    expect(pause).not.toHaveBeenCalled();
  });

  it('does not hijack space when a focused search field receives a window-level key event', async () => {
    const track = makeTrack(1);
    const pause = vi.fn();

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
        <input aria-label="Search text" type="search" />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    const searchInput = screen.getByLabelText('Search text');
    searchInput.focus();
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });

    expect(document.activeElement).toBe(searchInput);
    expect(pause).not.toHaveBeenCalled();
  });

  it('uses the main process playback state before toggling from the space shortcut', async () => {
    const track = makeTrack(1);
    const play = vi.fn();
    const pause = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: track.id,
      positionMs: 4000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        state: 'paused',
        currentTrackId: track.id,
        positionMs: 4000,
        durationMs: track.duration * 1000,
        filePath: track.path,
      })
      .mockResolvedValue({
        state: 'playing',
        currentTrackId: track.id,
        positionMs: 4000,
        durationMs: track.duration * 1000,
        filePath: track.path,
      });

    window.echo = {
      playback: {
        getStatus,
        playLocalFile: vi.fn(),
        play,
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(track),
          state: 'paused',
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(track),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });

    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
    expect(play).not.toHaveBeenCalled();
  });

  it('does not let a stale paused refresh freeze the UI after resuming playback', async () => {
    const track = makeTrack(1);
    const playbackGetStatus = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: track.id,
      positionMs: 10000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });
    const audioGetStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ...audioStatus(track),
        state: 'paused',
        positionSeconds: 10,
      })
      .mockResolvedValue({
        ...audioStatus(track),
        state: 'paused',
        positionSeconds: 10,
      });
    const play = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: track.id,
      positionMs: 10000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });

    window.echo = {
      playback: {
        getStatus: playbackGetStatus,
        playLocalFile: vi.fn(),
        play,
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: audioGetStatus,
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(track),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByRole('button', { name: 'Play' });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(audioGetStatus.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('keeps polling local BPM analysis after playback is paused', async () => {
    const track = makeTrack(1, {
      bpm: null,
      analysisStatus: 'none',
    });
    const analyzedTrack = {
      ...track,
      bpm: 128,
      bpmConfidence: 0.86,
      beatOffsetMs: 12,
      analysisStatus: 'complete' as const,
      analysisUpdatedAt: '2026-05-14T12:00:00.000Z',
    };
    const startBpmAnalysis = vi.fn().mockResolvedValue({
      id: 'bpm-job-1',
      status: 'running',
      totalTracks: 1,
      processedTracks: 0,
      updatedTracks: 0,
      errorCount: 0,
      currentTrackTitle: track.title,
      startedAt: '2026-05-14T11:59:58.000Z',
      finishedAt: null,
      errors: [],
    });
    const getBpmAnalysisStatus = vi.fn().mockResolvedValue({
      id: 'bpm-job-1',
      status: 'completed',
      totalTracks: 1,
      processedTracks: 1,
      updatedTracks: 1,
      errorCount: 0,
      currentTrackTitle: null,
      startedAt: '2026-05-14T11:59:58.000Z',
      finishedAt: '2026-05-14T12:00:00.000Z',
      errors: [],
    });
    const pause = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: track.id,
      positionMs: 4000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(analyzedTrack),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
        startBpmAnalysis,
        getBpmAnalysisStatus,
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    await waitFor(() => expect(startBpmAnalysis).toHaveBeenCalledWith({ trackIds: [track.id] }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByText('128 BPM')).toBeTruthy(), { timeout: 3000 });
    expect(getBpmAnalysisStatus).toHaveBeenCalledWith('bpm-job-1');
  }, 10000);

  it('starts playback BPM analysis for embedded BPM that has not been verified by ECHO', async () => {
    const track = makeTrack(1, {
      bpm: 126,
      bpmConfidence: 1,
      beatOffsetMs: null,
      analysisStatus: 'complete',
      fieldSources: { bpm: 'embedded' },
    });
    const analyzedTrack = {
      ...track,
      bpm: 128,
      bpmConfidence: 0.86,
      beatOffsetMs: 12,
      analysisStatus: 'complete' as const,
      analysisUpdatedAt: '2026-05-14T12:00:00.000Z',
      fieldSources: { bpm: 'audio_analysis', beatOffsetMs: 'audio_analysis' },
    };
    const startBpmAnalysis = vi.fn().mockResolvedValue({
      id: 'bpm-job-embedded',
      status: 'running',
      totalTracks: 1,
      processedTracks: 0,
      updatedTracks: 0,
      errorCount: 0,
      currentTrackTitle: track.title,
      startedAt: '2026-05-14T11:59:58.000Z',
      finishedAt: null,
      errors: [],
    });
    const getBpmAnalysisStatus = vi.fn().mockResolvedValue({
      id: 'bpm-job-embedded',
      status: 'completed',
      totalTracks: 1,
      processedTracks: 1,
      updatedTracks: 1,
      errorCount: 0,
      currentTrackTitle: null,
      startedAt: '2026-05-14T11:59:58.000Z',
      finishedAt: '2026-05-14T12:00:00.000Z',
      errors: [],
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(analyzedTrack),
        getLikedTrackIds: vi.fn().mockResolvedValue({ [track.id]: false }),
        startBpmAnalysis,
        getBpmAnalysisStatus,
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(startBpmAnalysis).toHaveBeenCalledWith({ trackIds: [track.id] }));
    await waitFor(() => expect(screen.getByText('128 BPM')).toBeTruthy(), { timeout: 3000 });
  }, 10000);

  it('routes SMTC pause, previous, and next commands through the playback queue', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    const smtcHandlers: Array<(command: 'play' | 'pause' | 'playPause' | 'previous' | 'next' | 'stop') => void> = [];
    const playLocalFile = vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: trackId ?? null,
        positionMs: 0,
        durationMs: (trackId === secondTrack.id ? secondTrack.duration : firstTrack.duration) * 1000,
        filePath,
      }),
    );
    const pause = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: secondTrack.id,
      positionMs: 4000,
      durationMs: secondTrack.duration * 1000,
      filePath: secondTrack.path,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: firstTrack.id,
          positionMs: 4000,
          durationMs: firstTrack.duration * 1000,
          filePath: firstTrack.path,
        }),
        playLocalFile,
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      smtc: {
        onCommand: vi.fn((handler) => {
          smtcHandlers[0] = handler;
          return () => {
            smtcHandlers.length = 0;
          };
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <PlaybackCommandController />
        <QueueSeed tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    expect(smtcHandlers[0]).toBeTruthy();
    smtcHandlers[0]?.('next');

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: secondTrack.id })));
    smtcHandlers[0]?.('previous');

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: firstTrack.id })));
    smtcHandlers[0]?.('pause');

    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
  });

  it('routes global shortcut commands through the playback queue', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    const globalShortcutHandlers: Array<(command: GlobalShortcutAction) => void> = [];
    const playLocalFile = vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: trackId ?? null,
        positionMs: 0,
        durationMs: (trackId === secondTrack.id ? secondTrack.duration : firstTrack.duration) * 1000,
        filePath,
      }),
    );
    const pause = vi.fn().mockResolvedValue({
      state: 'paused',
      currentTrackId: secondTrack.id,
      positionMs: 4000,
      durationMs: secondTrack.duration * 1000,
      filePath: secondTrack.path,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: firstTrack.id,
          positionMs: 4000,
          durationMs: firstTrack.duration * 1000,
          filePath: firstTrack.path,
        }),
        playLocalFile,
        play: vi.fn(),
        pause,
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
        onGlobalShortcutCommand: vi.fn((handler) => {
          globalShortcutHandlers[0] = handler as typeof globalShortcutHandlers[number];
          return () => {
            globalShortcutHandlers.length = 0;
          };
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <PlaybackCommandController />
        <QueueSeed tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    expect(globalShortcutHandlers[0]).toBeTruthy();
    globalShortcutHandlers[0]?.('nextTrack');

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: secondTrack.id })));
    globalShortcutHandlers[0]?.('previousTrack');

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: firstTrack.id })));
    globalShortcutHandlers[0]?.('playPause');

    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
  });

  it('handles boss key and playback speed global shortcut commands', async () => {
    const track = makeTrack(1);
    const globalShortcutHandlers: Array<(command: GlobalShortcutAction) => void> = [];
    const setOutput = vi.fn().mockResolvedValue(audioStatus(track));
    const setSettings = vi.fn().mockResolvedValue({ smtcEnabled: true, playbackSpeed: 1.1, playbackSpeedMode: 'nightcore' });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
        setSettings,
        onGlobalShortcutCommand: vi.fn((handler) => {
          globalShortcutHandlers[0] = handler as typeof globalShortcutHandlers[number];
          return () => {
            globalShortcutHandlers.length = 0;
          };
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(track),
          playbackRate: 1,
          playbackSpeedMode: 'nightcore',
        }),
        listDevices: vi.fn(),
        setOutput,
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <PlaybackCommandController />
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    globalShortcutHandlers[0]?.('speedUp');
    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({ playbackRate: 1.1, playbackSpeedMode: 'nightcore' }));
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ playbackSpeed: 1.1, playbackSpeedMode: 'nightcore' }));

    setOutput.mockClear();
    globalShortcutHandlers[0]?.('bossKey');
    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({ volume: 0 }));
  });

  it('opens settings drawers from global shortcut commands', async () => {
    const track = makeTrack(1);
    const globalShortcutHandlers: Array<(command: GlobalShortcutAction) => void> = [];
    const openAudioSettings = vi.fn();
    const openMvSettings = vi.fn();
    const openLyricsSettings = vi.fn();
    window.addEventListener('app:open-audio-settings', openAudioSettings);
    window.addEventListener('app:open-mv-settings', openMvSettings);
    window.addEventListener('app:open-lyrics-settings', openLyricsSettings);

    window.echo = {
      playback: {
        getStatus: vi.fn(),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
        onGlobalShortcutCommand: vi.fn((handler) => {
          globalShortcutHandlers[0] = handler as typeof globalShortcutHandlers[number];
          return () => {
            globalShortcutHandlers.length = 0;
          };
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(track)),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <PlaybackCommandController />
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    globalShortcutHandlers[0]?.('openAudioSettings');
    globalShortcutHandlers[0]?.('openMvSettings');
    globalShortcutHandlers[0]?.('openLyricsSettings');

    expect(openAudioSettings).toHaveBeenCalledTimes(1);
    expect(openMvSettings).toHaveBeenCalledTimes(1);
    expect(openLyricsSettings).toHaveBeenCalledTimes(1);
    window.removeEventListener('app:open-audio-settings', openAudioSettings);
    window.removeEventListener('app:open-mv-settings', openMvSettings);
    window.removeEventListener('app:open-lyrics-settings', openLyricsSettings);
  });

  it('publishes current playback metadata and actions through the browser media session', async () => {
    const track = makeTrack(1, {
      title: 'SMTC Song',
      artist: 'SMTC Artist',
      album: 'SMTC Album',
      coverId: 'cover-1',
      coverThumb: 'echo-cover://thumb/cover-1',
    });
    const actionHandlers = new Map<string, MediaSessionActionHandler | null>();
    const mediaSession = {
      metadata: null as MediaMetadata | null,
      playbackState: 'none' as MediaSessionPlaybackState,
      setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        actionHandlers.set(action, handler);
      }),
      setPositionState: vi.fn(),
    };
    const play = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: track.id,
      positionMs: 4000,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });

    class TestMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork: MediaImage[];

      constructor(init: MediaMetadataInit) {
        this.title = init.title ?? '';
        this.artist = init.artist ?? '';
        this.album = init.album ?? '';
        this.artwork = init.artwork ?? [];
      }
    }

    vi.stubGlobal('MediaMetadata', TestMediaMetadata);
    Object.defineProperty(window.navigator, 'mediaSession', {
      configurable: true,
      value: mediaSession,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'paused',
          currentTrackId: track.id,
          positionMs: 4000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play,
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          ...audioStatus(track),
          state: 'paused',
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      app: {
        getVersion: vi.fn(),
        getSettings: vi.fn().mockResolvedValue({ smtcEnabled: true }),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <PlaybackQueueProvider>
        <PlaybackCommandController />
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('SMTC Song');
    await waitFor(() => expect(mediaSession.metadata?.title).toBe('SMTC Song'));

    expect(mediaSession.metadata?.artist).toBe('SMTC Artist');
    expect(mediaSession.metadata?.album).toBe('SMTC Album');
    expect(container.querySelector('.player-cover img')?.getAttribute('src')).toBe('echo-cover://original/cover-1');
    expect(mediaSession.metadata?.artwork[0]?.src).toBe('echo-cover://original/cover-1');
    expect(mediaSession.playbackState).toBe('paused');
    expect(mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: track.duration,
      playbackRate: 1,
      position: 4,
    });

    actionHandlers.get('play')?.({ action: 'play' });
    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it('keeps streaming progress moving when status briefly stays at zero', async () => {
    const track = makeTrack(1, {
      id: 'streaming:qqmusic:song-1',
      mediaType: 'streaming',
      path: 'streaming:qqmusic:song-1',
      provider: 'qqmusic',
      providerTrackId: 'song-1',
      codec: null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
    });
    const zeroAudioStatus = { ...audioStatus(track), positionSeconds: 0 };

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 0,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(zeroAudioStatus),
        onStatus: vi.fn(),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    expect(screen.getByText('流媒体')).toBeTruthy();
    const slider = screen.getByRole('slider', { name: 'Seek position' }) as HTMLInputElement;
    expect(Number(slider.value)).toBe(0);
    await waitFor(() => expect(Number(slider.value)).toBeGreaterThan(0.1), { timeout: 1000 });
  });

  it('keeps progress from jumping backward on a brief same-track stale audio status', async () => {
    const track = makeTrack(1);
    const statusHandlers: Array<(status: AudioStatus) => void> = [];

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 12000,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ ...audioStatus(track), positionSeconds: 12 }),
        onStatus: vi.fn((handler) => {
          statusHandlers[0] = handler;
          return () => {
            statusHandlers.length = 0;
          };
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    const slider = screen.getByRole('slider', { name: 'Seek position' }) as HTMLInputElement;
    await waitFor(() => expect(Number(slider.value)).toBeGreaterThanOrEqual(12));

    act(() => {
      statusHandlers[0]?.({ ...audioStatus(track), positionSeconds: 10.6 });
    });

    expect(Number(slider.value)).toBeGreaterThanOrEqual(12);
  });

  it('broadcasts the requested seek target when streaming seek returns stale status', async () => {
    const track = makeTrack(1, {
      id: 'streaming:qqmusic:song-1',
      mediaType: 'streaming',
      path: 'streaming:qqmusic:song-1',
      provider: 'qqmusic',
      providerTrackId: 'song-1',
    });
    const seek = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: track.id,
      positionMs: 0,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });
    const seekedHandler = vi.fn();

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 0,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek,
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ ...audioStatus(track), positionSeconds: 0 }),
        onStatus: vi.fn(),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
    } as unknown as Window['echo'];

    window.addEventListener('playback:seeked', seekedHandler);

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[track]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    const slider = screen.getByRole('slider', { name: 'Seek position' });
    fireEvent.change(slider, { target: { value: '21' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(seek).toHaveBeenCalledWith(21));
    await waitFor(() => expect(seekedHandler).toHaveBeenCalled());
    expect((seekedHandler.mock.calls[0][0] as CustomEvent).detail.positionSeconds).toBe(21);

    window.removeEventListener('playback:seeked', seekedHandler);
  });

  it('auto-plays the next queued track when audio status pushes ended', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    const thirdTrack = makeTrack(3);
    const statusHandlers: Array<(status: AudioStatus) => void> = [];
    const playLocalFile = vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: trackId ?? null,
        positionMs: 0,
        durationMs: (trackId === thirdTrack.id ? thirdTrack.duration : trackId === secondTrack.id ? secondTrack.duration : firstTrack.duration) * 1000,
        filePath,
      }),
    );

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: firstTrack.id,
          positionMs: 4000,
          durationMs: firstTrack.duration * 1000,
          filePath: firstTrack.path,
        }),
        playLocalFile,
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        onStatus: vi.fn((handler) => {
          statusHandlers[0] = handler;
          return () => {
            statusHandlers.length = 0;
          };
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[firstTrack, secondTrack, thirdTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    expect(statusHandlers[0]).toBeTruthy();
    statusHandlers[0]?.({
      ...audioStatus(firstTrack),
      state: 'ended',
      positionSeconds: firstTrack.duration,
    });

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: secondTrack.id })));
    await screen.findByText('Song 2');

    statusHandlers[0]?.({
      ...audioStatus(firstTrack),
      state: 'ended',
      positionSeconds: firstTrack.duration,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(playLocalFile).not.toHaveBeenCalledWith(expect.objectContaining({ trackId: thirdTrack.id }));

    statusHandlers[0]?.(audioStatus(secondTrack));
    expect(screen.getByText('Song 2')).toBeTruthy();
  });

  it('still auto-plays the next queued track when the audio ends after the MV', async () => {
    const firstTrack = makeTrack(1);
    const secondTrack = makeTrack(2);
    const statusHandlers: Array<(status: AudioStatus) => void> = [];
    const playLocalFile = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: secondTrack.id,
      positionMs: 0,
      durationMs: secondTrack.duration * 1000,
      filePath: secondTrack.path,
    });

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: firstTrack.id,
          positionMs: 4000,
          durationMs: firstTrack.duration * 1000,
          filePath: firstTrack.path,
        }),
        playLocalFile,
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus(firstTrack)),
        onStatus: vi.fn((handler) => {
          statusHandlers[0] = handler;
          return () => {
            statusHandlers.length = 0;
          };
        }),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
      },
      eq: {
        getState: vi.fn().mockResolvedValue(eqState()),
        setEnabled: vi.fn().mockResolvedValue(eqState()),
        setBandGain: vi.fn().mockResolvedValue(eqState()),
        setPreamp: vi.fn().mockResolvedValue(eqState()),
        setPreset: vi.fn().mockResolvedValue(eqState()),
        reset: vi.fn().mockResolvedValue(eqState()),
        listPresets: vi.fn().mockResolvedValue([]),
        savePreset: vi.fn(),
        deletePreset: vi.fn().mockResolvedValue([]),
      },
      library: {
        getTracks: vi.fn(),
        getAlbums: vi.fn(),
        getAlbumTracks: vi.fn(),
        getSummary: vi.fn(),
        chooseFolder: vi.fn(),
        addFolder: vi.fn(),
        getFolders: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        getScanStatus: vi.fn(),
        cancelScan: vi.fn(),
        getDiagnostics: vi.fn(),
      },
      app: {
        getVersion: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <QueueSeed tracks={[firstTrack, secondTrack]} />
      </PlaybackQueueProvider>,
    );

    await screen.findByText('Song 1');
    window.dispatchEvent(new CustomEvent('mv:ended-before-audio', { detail: { trackId: firstTrack.id } }));

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(playLocalFile).not.toHaveBeenCalled();

    statusHandlers[0]?.({
      ...audioStatus(firstTrack),
      state: 'ended',
      positionSeconds: firstTrack.duration,
    });

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: secondTrack.id })));
    await screen.findByText('Song 2');
  });
});
