// @vitest-environment jsdom
import { useEffect, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import { hqPlayerConnectDeviceId, type ConnectSessionStatus } from '../../shared/types/connect';
import type { LibraryTrack } from '../../shared/types/library';
import type { PersistedPlaybackSessionV1 } from '../../shared/types/playback';
import { PlaybackQueueProvider, isPlaybackCancellationError, usePlaybackQueue } from './PlaybackQueueProvider';
import { useSharedPlaybackStatus } from './playbackStatusStore';

const makeTrack = (index: number): LibraryTrack => ({
  id: `track-${index}`,
  path: `D:\\Music\\track-${index}.flac`,
  title: `Track ${index}`,
  artist: `Artist ${index}`,
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: index,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 120,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
});

const makePersistedQueueSession = (
  tracks: LibraryTrack[],
  options: Partial<PersistedPlaybackSessionV1> = {},
): PersistedPlaybackSessionV1 => {
  const items = tracks.map((track, index) => ({
    queueId: `queue-${index + 1}`,
    track,
    source: { type: 'manual' as const, label: 'Manual queue' },
    addedAt: `2026-05-21T00:00:0${index}.000Z`,
  }));
  const currentItem = items[0] ?? null;

  return {
    version: 1,
    items,
    currentQueueId: currentItem?.queueId ?? null,
    currentTrackId: currentItem?.track.id ?? null,
    lastPlayedTrack: currentItem?.track ?? null,
    history: [],
    mode: {
      isShuffleEnabled: false,
      repeatMode: 'off',
      automixEnabled: false,
    },
    resume: null,
    updatedAt: '2026-05-21T00:00:00.000Z',
    ...options,
  };
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete (window as Partial<Window>).echo;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PlaybackQueueProvider playback history session', () => {
  it('identifies internal playback cancellation errors', () => {
    expect(isPlaybackCancellationError(new Error('audio_session_run_cancelled'))).toBe(true);
    expect(isPlaybackCancellationError(new Error('native device failed'))).toBe(false);
  });

  it('routes manual playback to the active HQPlayer Connect output instead of local playback', async () => {
    const track = makeTrack(1);
    const playLocalFile = vi.fn();
    const connectTrack = vi.fn().mockResolvedValue({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'playing',
      currentTrackId: track.id,
      metadata: null,
      positionSeconds: 0,
      durationSeconds: track.duration,
      latencyMs: 9,
      error: null,
      updatedAt: '2026-05-21T01:00:00.000Z',
    });

    window.echo = {
      playback: {
        playLocalFile,
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue({
          deviceId: hqPlayerConnectDeviceId,
          protocol: 'hqplayer',
          state: 'playing',
          currentTrackId: 'previous-track',
          metadata: null,
          positionSeconds: 0,
          durationSeconds: 120,
          latencyMs: null,
          error: null,
          updatedAt: '2026-05-21T01:00:00.000Z',
        }),
        connect: connectTrack,
      },
    } as unknown as Window['echo'];

    const AutoPlay = (): JSX.Element => {
      const { playTrack } = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void playTrack(track);
      }, [playTrack]);

      return <span hidden />;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlay />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(connectTrack).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: hqPlayerConnectDeviceId,
      track,
      filePath: track.path,
      positionSeconds: 0,
    })));
    expect(playLocalFile).not.toHaveBeenCalled();
  });

  it('keeps queue navigation on HQPlayer after takeover even when Connect status is idle', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn();
    const connectTrack = vi.fn().mockImplementation(async (request: { track: LibraryTrack }) => ({
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'playing',
      currentTrackId: request.track.id,
      metadata: null,
      positionSeconds: 0,
      durationSeconds: request.track.duration,
      latencyMs: 9,
      error: null,
      updatedAt: '2026-05-21T01:00:00.000Z',
    }));

    window.echo = {
      playback: {
        playLocalFile,
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue({
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
        }),
        connect: connectTrack,
      },
    } as unknown as Window['echo'];

    const ActivateAndAdvance = (): JSX.Element => {
      const { activateHqPlayerTakeover, playNext, replaceQueue } = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        replaceQueue([first, second], { startTrackId: first.id });
        void (async () => {
          await activateHqPlayerTakeover();
          await playNext();
        })();
      }, [activateHqPlayerTakeover, playNext, replaceQueue]);

      return <span hidden />;
    };

    render(
      <PlaybackQueueProvider>
        <ActivateAndAdvance />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(connectTrack).toHaveBeenCalledTimes(2));
    expect(connectTrack.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      deviceId: hqPlayerConnectDeviceId,
      track: first,
      filePath: first.path,
    }));
    expect(connectTrack.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      deviceId: hqPlayerConnectDeviceId,
      track: second,
      filePath: second.path,
    }));
    expect(playLocalFile).not.toHaveBeenCalled();
  });

  it('does not wait for history writes before switching tracks', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    let resolveFinish: (() => void) | null = null;
    const startPlaybackHistory = vi
      .fn()
      .mockResolvedValueOnce({ historyId: 'history-1' })
      .mockResolvedValueOnce({ historyId: 'history-2' });
    const finishPlaybackHistory = vi.fn(() => new Promise<void>((resolve) => {
      resolveFinish = resolve;
    }));
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
      library: {
        startPlaybackHistory,
        finishPlaybackHistory,
      },
    } as unknown as Window['echo'];

    const AutoPlayFirst = (): JSX.Element => {
      const { playNext, playTrack, replaceQueue } = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        replaceQueue([first, second]);
        void playTrack(first);
      }, [playTrack, replaceQueue]);

      return <button type="button" onClick={() => void playNext()}>next</button>;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlayFirst />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(startPlaybackHistory).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: second.id })));
    expect(finishPlaybackHistory).toHaveBeenCalledWith(expect.objectContaining({ historyId: 'history-1' }));
    await waitFor(() => expect(startPlaybackHistory).toHaveBeenCalledTimes(2));
    const finish = resolveFinish ?? (() => undefined);
    finish();
  });

  it('keeps the current playback speed when advancing to the next local track', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          playbackRate: 1.5,
          playbackSpeedMode: 'nightcore',
        }),
      },
    } as unknown as Window['echo'];

    const AutoPlayFirst = (): JSX.Element => {
      const { playNext, playTrack, replaceQueue } = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        replaceQueue([first, second]);
        void playTrack(first);
      }, [playTrack, replaceQueue]);

      return <button type="button" onClick={() => void playNext()}>next</button>;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlayFirst />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() =>
      expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
        trackId: second.id,
        output: {
          playbackRate: 1.5,
          playbackSpeedMode: 'nightcore',
        },
      })),
    );
  });

  it('opens temporary local files, queues them, and records history from snapshots', async () => {
    const first = { ...makeTrack(1), id: 'temporary-local:first', isTemporary: true, title: 'Loose File' };
    const second = { ...makeTrack(2), id: 'temporary-local:second', isTemporary: true };
    const startPlaybackHistory = vi.fn().mockResolvedValue({ historyId: 'history-temp' });
    const resolveLocalAudioFiles = vi.fn().mockResolvedValue({ tracks: [first, second], rejected: [] });
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 120000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        resolveLocalAudioFiles,
        playLocalFile,
      },
      library: {
        startPlaybackHistory,
      },
    } as unknown as Window['echo'];

    const OpenFilesProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();

      return (
        <div>
          <output aria-label="queue-size">{queue.items.length}</output>
          <output aria-label="current-title">{queue.currentTrack?.title ?? ''}</output>
          <button type="button" onClick={() => void queue.openTemporaryLocalFiles(['D:\\Loose\\one.flac', 'D:\\Loose\\two.flac'])}>
            open
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <OpenFilesProbe />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    await waitFor(() => expect(screen.getByLabelText('current-title').textContent).toBe('Loose File'));
    expect(screen.getByLabelText('queue-size').textContent).toBe('2');
    expect(resolveLocalAudioFiles).toHaveBeenCalledWith(['D:\\Loose\\one.flac', 'D:\\Loose\\two.flac']);
    expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: first.path, trackId: first.id }));
    expect(startPlaybackHistory).toHaveBeenCalledWith(expect.objectContaining({
      trackId: null,
      trackPath: first.path,
      title: first.title,
      sourceType: 'local-file',
    }));
  });

  it('prepares only the next local queue item after playback starts', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const third = makeTrack(3);
    const prepareLocalFile = vi.fn().mockResolvedValue(undefined);
    const prepareMediaItem = vi.fn().mockResolvedValue(undefined);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
        prepareLocalFile,
        prepareMediaItem,
      },
    } as unknown as Window['echo'];

    const AutoPlayFirst = (): null => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue([first, second, third]);
        void queue.playTrack(first);
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlayFirst />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: first.id })));
    await waitFor(() => expect(prepareLocalFile).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(prepareLocalFile).toHaveBeenCalledWith({
      filePath: second.path,
      trackId: second.id,
      probe: {
        durationSeconds: second.duration,
        fileSampleRate: second.sampleRate,
        channels: 2,
        codec: second.codec,
        bitDepth: second.bitDepth,
        bitrate: second.bitrate,
      },
      replayGain: null,
    });
    expect(prepareMediaItem).not.toHaveBeenCalled();
  });

  it('keeps automix off by default and sends a next-track plan only after opt-in', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const AutomixProbe = (): null => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue([first, second]);
        void queue.playTrack(first).then(() => {
          queue.setAutomixEnabled(true);
          return queue.playTrack(first);
        });
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <AutomixProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(2));
    expect(playLocalFile.mock.calls[0]?.[0].automix).toBeUndefined();
    expect(playLocalFile.mock.calls[1]?.[0].automix).toMatchObject({
      enabled: true,
      maxTransitionSeconds: 12,
      beatAlignEnabled: true,
      nextItem: {
        mediaType: 'local',
        trackId: second.id,
        path: second.path,
      },
    });
  });

  it('passes ReplayGain and a gapless next-track plan after opt-in', async () => {
    const first = {
      ...makeTrack(1),
      replayGainTrackGainDb: -5,
      replayGainTrackPeak: 0.9,
    };
    const second = makeTrack(2);
    const third = makeTrack(3);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ gaplessPlaybackEnabled: true }),
      },
      playback: {
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const GaplessProbe = (): null => {
      const queue = usePlaybackQueue();
      const didSeedRef = useRef(false);
      const didStartRef = useRef(false);

      useEffect(() => {
        if (!didSeedRef.current) {
          didSeedRef.current = true;
          queue.replaceQueue([first, second, third]);
        }

        if (queue.gaplessPlaybackEnabled && !didStartRef.current) {
          didStartRef.current = true;
          void queue.playTrack(first);
        }
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <GaplessProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(1));
    expect(playLocalFile.mock.calls[0]?.[0]).toMatchObject({
      trackId: first.id,
      replayGain: {
        trackGainDb: -5,
        trackPeak: 0.9,
      },
      gapless: {
        enabled: true,
        nextItem: {
          mediaType: 'local',
          trackId: second.id,
          path: second.path,
        },
        upcomingItems: [
          expect.objectContaining({
            mediaType: 'local',
            trackId: third.id,
            path: third.path,
          }),
        ],
      },
    });
    expect(playLocalFile.mock.calls[0]?.[0].automix).toBeUndefined();
  });

  it('rearms the current native playback when automix is enabled mid-song', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: first.id,
          positionMs: 42000,
          durationMs: first.duration * 1000,
          filePath: first.path,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: first.id,
          currentFilePath: first.path,
          positionSeconds: 42,
          durationSeconds: first.duration,
          error: null,
        }),
      },
    } as unknown as Window['echo'];

    const AutomixToggleProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue([first, second]);
        void queue.playTrack(first);
      }, [queue]);

      return <button type="button" onClick={() => queue.setAutomixEnabled(true)}>enable</button>;
    };

    render(
      <PlaybackQueueProvider>
        <AutomixToggleProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'enable' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(2));
    expect(playLocalFile.mock.calls[1]?.[0]).toMatchObject({
      trackId: first.id,
      startSeconds: 42,
      automix: {
        enabled: true,
        maxTransitionSeconds: 12,
        nextItem: {
          mediaType: 'local',
          trackId: second.id,
          path: second.path,
        },
      },
    });
  });

  it('keeps remote prewarm on prepareMediaItem and skips local prepare for remote next items', async () => {
    const first = makeTrack(1);
    const second: LibraryTrack = {
      ...makeTrack(2),
      id: 'remote:source-1:stable-key',
      mediaType: 'remote',
      sourceId: 'source-1',
      remotePath: '/music/remote.flac',
      stableKey: 'stable-key',
    };
    const prepareLocalFile = vi.fn().mockResolvedValue(undefined);
    const prepareMediaItem = vi.fn().mockResolvedValue(undefined);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: first.duration * 1000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
        prepareLocalFile,
        prepareMediaItem,
      },
    } as unknown as Window['echo'];

    const AutoPlayFirst = (): null => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue([first, second]);
        void queue.playTrack(first);
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlayFirst />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: first.id })));
    await waitFor(() => expect(prepareMediaItem).toHaveBeenCalledTimes(1));
    expect(prepareLocalFile).not.toHaveBeenCalled();
  });

  it('defers automatic network MV search when playback starts', async () => {
    const track = makeTrack(1);
    const getSettings = vi.fn().mockResolvedValue({ autoSearch: true });
    const searchNetworkCandidates = vi.fn().mockResolvedValue([]);
    const getSelected = vi.fn().mockResolvedValue(null);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const playLocalFile = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: track.id,
      positionMs: 0,
      durationMs: track.duration * 1000,
      filePath: track.path,
    });

    window.echo = {
      playback: {
        playLocalFile,
      },
      mv: {
        getSettings,
        searchNetworkCandidates,
        getSelected,
      },
    } as unknown as Window['echo'];

    const AutoPlay = (): null => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(track);
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlay />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: track.id })));
    expect(searchNetworkCandidates).not.toHaveBeenCalled();
    await waitFor(() => expect(searchNetworkCandidates).toHaveBeenCalledWith(track.id));
    await waitFor(() => expect(getSelected).toHaveBeenCalledWith(track.id));
    await waitFor(() =>
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mv:candidatesChanged' })),
    );
  });

  it('plays remote tracks through media-item IPC and records only stable identity', async () => {
    const remoteTrack: LibraryTrack = {
      ...makeTrack(1),
      id: 'remote:source-1:stable-hash',
      mediaType: 'remote',
      path: 'remote://source-1/music/Echo Song.flac',
      sourceId: 'source-1',
      provider: 'webdav',
      remotePath: '/music/Echo Song.flac',
      stableKey: 'stable-key-1',
    };
    const playMediaItem = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: remoteTrack.id,
      positionMs: 0,
      durationMs: remoteTrack.duration * 1000,
      filePath: 'http://127.0.0.1:49152/remote-stream/token',
    });
    const startPlaybackHistory = vi.fn().mockResolvedValue({ historyId: 'history-remote' });

    window.echo = {
      playback: {
        playMediaItem,
      },
      library: {
        startPlaybackHistory,
      },
    } as unknown as Window['echo'];

    const AutoPlayRemote = (): null => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(remoteTrack);
      }, [queue]);

      return null;
    };

    render(
      <PlaybackQueueProvider>
        <AutoPlayRemote />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playMediaItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(startPlaybackHistory).toHaveBeenCalledTimes(1));

    expect(playMediaItem).toHaveBeenCalledWith(expect.objectContaining({
      item: expect.objectContaining({
        mediaType: 'remote',
        trackId: remoteTrack.id,
        sourceId: remoteTrack.sourceId,
        stableKey: remoteTrack.stableKey,
        remotePath: remoteTrack.remotePath,
      }),
    }));
    expect(playMediaItem.mock.calls[0]?.[0].item.streamUrl).toBeUndefined();
    expect(startPlaybackHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: remoteTrack.id,
        mediaType: 'remote',
        sourceId: remoteTrack.sourceId,
        stableKey: remoteTrack.stableKey,
        remotePath: remoteTrack.remotePath,
      }),
    );
    expect(startPlaybackHistory.mock.calls[0]?.[0].trackPath).toBeUndefined();
  });

  it('keeps the requested streaming track current when media IPC returns a stale previous id', async () => {
    const first: LibraryTrack = {
      ...makeTrack(1),
      id: 'streaming:qqmusic:first',
      mediaType: 'streaming',
      path: 'streaming:qqmusic:first',
      provider: 'qqmusic',
      providerTrackId: 'first',
      stableKey: 'streaming:qqmusic:first',
    };
    const second: LibraryTrack = {
      ...makeTrack(2),
      id: 'streaming:qqmusic:second',
      mediaType: 'streaming',
      path: 'streaming:qqmusic:second',
      provider: 'qqmusic',
      providerTrackId: 'second',
      stableKey: 'streaming:qqmusic:second',
    };
    const playMediaItem = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: first.id,
      positionMs: 0,
      durationMs: first.duration * 1000,
      filePath: 'http://127.0.0.1:49152/streaming/stale',
    });

    window.echo = {
      playback: {
        playMediaItem,
      },
    } as unknown as Window['echo'];

    const StreamingProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(first, { replaceQueueWith: [first, second] });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <StreamingProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(first.id));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(playMediaItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(second.id));
  });

  it('refreshes an existing streaming queue item when replaying it at a different quality', async () => {
    const highQualityTrack: LibraryTrack = {
      ...makeTrack(1),
      id: 'streaming:qqmusic:song',
      mediaType: 'streaming',
      path: 'streaming:qqmusic:song',
      provider: 'qqmusic',
      providerTrackId: 'song',
      stableKey: 'streaming:qqmusic:song',
      streamingQuality: 'high',
    };
    const losslessTrack: LibraryTrack = {
      ...highQualityTrack,
      streamingQuality: 'lossless',
    };
    const playMediaItem = vi.fn().mockImplementation((request: { item: { trackId: string }; startSeconds?: number }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.item.trackId,
        positionMs: Math.round(Math.max(0, request.startSeconds ?? 0) * 1000),
        durationMs: highQualityTrack.duration * 1000,
        filePath: 'https://stream.example.test/song.flac',
      }),
    );

    window.echo = {
      playback: {
        playMediaItem,
      },
    } as unknown as Window['echo'];

    const StreamingQualityProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(highQualityTrack);
      }, [queue]);

      return (
        <div>
          <output aria-label="current-quality">{queue.currentTrack?.streamingQuality ?? ''}</output>
          <button type="button" onClick={() => void queue.playTrack(losslessTrack, { startSeconds: 37, forceRefresh: true })}>
            switch quality
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <StreamingQualityProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(playMediaItem).toHaveBeenCalledTimes(1));
    expect(playMediaItem.mock.calls[0]?.[0]).toMatchObject({
      item: expect.objectContaining({ quality: 'high' }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'switch quality' }));

    await waitFor(() => expect(playMediaItem).toHaveBeenCalledTimes(2));
    expect(playMediaItem.mock.calls[1]?.[0]).toMatchObject({
      item: expect.objectContaining({ quality: 'lossless' }),
      startSeconds: 37,
      forceRefresh: true,
    });
    await waitFor(() => expect(screen.getByLabelText('current-quality').textContent).toBe('lossless'));
  });

  it('publishes the requested track before slow playback IPC resolves', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    let resolveSecondPlay: (() => void) | null = null;
    const playLocalFile = vi
      .fn()
      .mockImplementationOnce((request: { trackId: string; filePath: string }) =>
        Promise.resolve({
          state: 'playing',
          currentTrackId: request.trackId,
          positionMs: 0,
          durationMs: first.duration * 1000,
          filePath: request.filePath,
        }),
      )
      .mockImplementationOnce((request: { trackId: string; filePath: string }) =>
        new Promise((resolve) => {
          resolveSecondPlay = () =>
            resolve({
              state: 'playing',
              currentTrackId: request.trackId,
              positionMs: 0,
              durationMs: second.duration * 1000,
              filePath: request.filePath,
            });
        }),
      );

    window.echo = {
      playback: {
        playLocalFile,
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: first.id,
          positionMs: 5000,
          durationMs: first.duration * 1000,
          filePath: first.path,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: first.id,
          currentFilePath: first.path,
          positionSeconds: 5,
          durationSeconds: first.duration,
          fileSampleRate: first.sampleRate,
          outputSampleRate: first.sampleRate,
          channels: 2,
          bitDepth: first.bitDepth,
          bitrate: first.bitrate,
          codec: first.codec,
          outputMode: 'shared',
          requestedSampleRate: first.sampleRate,
          actualDeviceSampleRate: first.sampleRate,
          sampleRateMismatch: false,
          playbackRate: 1,
          playbackSpeedMode: 'nightcore',
          volume: 1,
          error: null,
        }),
      },
    } as unknown as Window['echo'];

    const PendingPlaybackProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const status = useSharedPlaybackStatus();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(first, { replaceQueueWith: [first, second] });
      }, [queue]);

      return (
        <div>
          <output aria-label="queue-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="shared-track">{status.playbackStatus?.currentTrackId ?? ''}</output>
          <output aria-label="visual-state">{status.playbackVisualIntent?.state ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <PendingPlaybackProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('queue-track').textContent).toBe(first.id));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(screen.getByLabelText('queue-track').textContent).toBe(second.id));
    await waitFor(() => expect(screen.getByLabelText('shared-track').textContent).toBe(second.id));
    expect(screen.getByLabelText('visual-state').textContent).toBe('playing');

    const finishSecondPlay = resolveSecondPlay ?? (() => undefined);
    finishSecondPlay();
    await waitFor(() => expect(screen.getByLabelText('visual-state').textContent).toBe(''));
  });

  it('does not let a superseded ASIO start failure overwrite the active track', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const firstPlayback = { reject: null as ((error: Error) => void) | null };
    const playLocalFile = vi
      .fn()
      .mockImplementationOnce(() =>
        new Promise((_resolve, reject) => {
          firstPlayback.reject = reject;
        }),
      )
      .mockImplementationOnce((request: { trackId: string; filePath: string }) =>
        Promise.resolve({
          state: 'playing',
          currentTrackId: request.trackId,
          positionMs: 0,
          durationMs: second.duration * 1000,
          filePath: request.filePath,
        }),
      );

    window.echo = {
      playback: {
        playLocalFile,
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: second.id,
          positionMs: 0,
          durationMs: second.duration * 1000,
          filePath: second.path,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: second.id,
          currentFilePath: second.path,
          positionSeconds: 0,
          durationSeconds: second.duration,
          error: null,
        }),
      },
    } as unknown as Window['echo'];

    const SupersededFailureProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const status = useSharedPlaybackStatus();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue([first, second]);
        void queue.playTrack(first).catch(() => undefined);
      }, [queue]);

      return (
        <div>
          <output aria-label="queue-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="shared-track">{status.playbackStatus?.currentTrackId ?? ''}</output>
          <output aria-label="shared-error">{status.error ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <SupersededFailureProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('queue-track').textContent).toBe(first.id));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(screen.getByLabelText('queue-track').textContent).toBe(second.id));

    const rejectFirstPlay = firstPlayback.reject;
    if (!rejectFirstPlay) {
      throw new Error('first playback promise was not captured');
    }
    rejectFirstPlay(new Error('echo-audio-host timeout_waiting_for_ready; mode="asio"'));

    await waitFor(() => expect(screen.getByLabelText('shared-track').textContent).toBe(second.id));
    expect(screen.getByLabelText('shared-error').textContent).toBe('');
  });

  it('suppresses superseded audio session cancellation status errors', async () => {
    let emitAudioStatus: ((status: AudioStatus) => void) | null = null;

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'stopped',
          currentTrackId: null,
          positionMs: 0,
          durationMs: 0,
          filePath: null,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'stopped',
          error: null,
        }),
        onStatus: vi.fn((listener: (status: AudioStatus) => void) => {
          emitAudioStatus = listener;
          return () => undefined;
        }),
      },
    } as unknown as Window['echo'];

    const StatusProbe = (): JSX.Element => {
      const status = useSharedPlaybackStatus();

      return (
        <div>
          <output aria-label="shared-error">{status.error ?? ''}</output>
          <output aria-label="shared-audio-state">{status.audioStatus?.state ?? ''}</output>
        </div>
      );
    };

    render(<StatusProbe />);

    await waitFor(() => expect(window.echo?.audio?.onStatus).toHaveBeenCalled());
    if (!emitAudioStatus) {
      throw new Error('audio status listener was not captured');
    }

    act(() => {
      emitAudioStatus?.({
        state: 'error',
        error: 'audio_session_run_cancelled',
      } as AudioStatus);
    });
    expect(screen.getByLabelText('shared-error').textContent).toBe('');
    expect(screen.getByLabelText('shared-audio-state').textContent).not.toBe('error');

    act(() => {
      emitAudioStatus?.({
        state: 'error',
        error: 'native_writable_error: device failed',
      } as AudioStatus);
    });
    expect(screen.getByLabelText('shared-error').textContent).toBe('native_writable_error: device failed');
    expect(screen.getByLabelText('shared-audio-state').textContent).toBe('error');
  });

  it('uses HQPlayer Connect status as the shared playback clock while ignoring stale local audio status', async () => {
    const track = makeTrack(1);
    let emitAudioStatus: ((status: AudioStatus) => void) | null = null;
    let emitConnectStatus: ((status: ConnectSessionStatus) => void) | null = null;
    const hqStatus: ConnectSessionStatus = {
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'playing',
      currentTrackId: track.id,
      metadata: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist,
        durationSeconds: track.duration,
        coverHttpUrl: '',
      },
      positionSeconds: 12.345,
      durationSeconds: track.duration,
      latencyMs: 8,
      error: null,
      updatedAt: '2026-05-24T15:10:00.000Z',
    };

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'paused',
          currentTrackId: track.id,
          positionMs: 0,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'paused',
          currentTrackId: track.id,
          currentFilePath: track.path,
          positionSeconds: 0,
          durationSeconds: track.duration,
          error: null,
        }),
        onStatus: vi.fn((listener: (status: AudioStatus) => void) => {
          emitAudioStatus = listener;
          return () => undefined;
        }),
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue(hqStatus),
        onStatus: vi.fn((listener: (status: ConnectSessionStatus) => void) => {
          emitConnectStatus = listener;
          return () => undefined;
        }),
      },
    } as unknown as Window['echo'];

    const StatusProbe = (): JSX.Element => {
      const status = useSharedPlaybackStatus();

      return (
        <div>
          <output aria-label="shared-state">{status.playbackStatus?.state ?? ''}</output>
          <output aria-label="shared-position">{status.playbackStatus?.positionMs ?? ''}</output>
          <output aria-label="shared-audio-state">{status.audioStatus?.state ?? ''}</output>
        </div>
      );
    };

    render(<StatusProbe />);

    await waitFor(() => expect(screen.getByLabelText('shared-state').textContent).toBe('playing'));
    expect(screen.getByLabelText('shared-position').textContent).toBe('12345');
    expect(screen.getByLabelText('shared-audio-state').textContent).toBe('');

    if (!emitAudioStatus || !emitConnectStatus) {
      throw new Error('status listeners were not captured');
    }

    act(() => {
      emitAudioStatus?.({
        state: 'paused',
        currentTrackId: track.id,
        currentFilePath: track.path,
        positionSeconds: 0,
        durationSeconds: track.duration,
        error: null,
      } as AudioStatus);
    });
    expect(screen.getByLabelText('shared-state').textContent).toBe('playing');
    expect(screen.getByLabelText('shared-position').textContent).toBe('12345');
    expect(screen.getByLabelText('shared-audio-state').textContent).toBe('');

    act(() => {
      emitConnectStatus?.({ ...hqStatus, positionSeconds: 14.25 });
    });
    await waitFor(() => expect(screen.getByLabelText('shared-position').textContent).toBe('14250'));
  });
});

describe('PlaybackQueueProvider playback modes', () => {
  it('uses the next queued track for manual next while repeat-one stays enabled', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 120000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const RepeatOneManualNextProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.setRepeatMode('one');
        void queue.playTrack(first, { replaceQueueWith: [first, second] });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="repeat-mode">{queue.repeatMode}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <RepeatOneManualNextProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(first.id));
    expect(screen.getByLabelText('repeat-mode').textContent).toBe('one');

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(second.id));
    expect(screen.getByLabelText('repeat-mode').textContent).toBe('one');
    expect(playLocalFile).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: second.id }));
  });

  it('keeps repeat-one for automatic end-of-track advance', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 120000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const RepeatOneAutoAdvanceProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.setRepeatMode('one');
        void queue.playTrack(first, { replaceQueueWith: [first, second] });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext({ autoAdvance: true })}>
            auto next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <RepeatOneAutoAdvanceProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(first.id));

    fireEvent.click(screen.getByRole('button', { name: 'auto next' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('current-track').textContent).toBe(first.id);
    expect(playLocalFile).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: first.id }));
  });

  it('does not repeat recently played queue items while shuffle still has unplayed tracks', async () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3), makeTrack(4)];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    window.echo = {
      playback: {
        playLocalFile: vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
          Promise.resolve({
            state: 'playing',
            currentTrackId: request.trackId,
            positionMs: 0,
            durationMs: 120000,
            filePath: request.filePath,
          }),
        ),
      },
    } as unknown as Window['echo'];

    const ShuffleProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.replaceQueue(tracks);
        queue.toggleShuffle();
        void queue.playTrack(tracks[0]);
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <ShuffleProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-1'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-2'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-3'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-4'));

    expect(randomSpy).toHaveBeenCalled();
  });

  it('loads shuffle candidates from the full song library when the current queue came from Songs', async () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const getTracks = vi.fn().mockResolvedValue({
      items: [tracks[0], tracks[1], tracks[2]],
      page: 1,
      pageSize: 50,
      total: 3,
      hasMore: false,
    });

    window.echo = {
      playback: {
        playLocalFile: vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
          Promise.resolve({
            state: 'playing',
            currentTrackId: request.trackId,
            positionMs: 0,
            durationMs: 120000,
            filePath: request.filePath,
          }),
        ),
      },
      library: {
        getTracks,
      },
    } as unknown as Window['echo'];

    const LibraryShuffleProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.toggleShuffle();
        void queue.playTrack(tracks[0], {
          replaceQueueWith: [tracks[0]],
          source: { type: 'songs', label: 'Songs', sort: 'default' },
        });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" disabled={!queue.canGoNext} onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <LibraryShuffleProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-1'));
    await waitFor(() => expect((screen.getByRole('button', { name: 'next' }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-2'));
    expect(getTracks).toHaveBeenCalledWith({
      page: 1,
      pageSize: 500,
      search: undefined,
      sort: 'random',
      hideDuplicates: undefined,
      showDuplicatesOnly: undefined,
      duplicateMode: 'strict',
    });
  });

  it('uses queued songs before asking the library for more shuffle candidates', async () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const getTracks = vi.fn().mockResolvedValue({
      items: [tracks[2]],
      page: 1,
      pageSize: 500,
      total: 3,
      hasMore: false,
    });

    window.echo = {
      playback: {
        playLocalFile: vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
          Promise.resolve({
            state: 'playing',
            currentTrackId: request.trackId,
            positionMs: 0,
            durationMs: 120000,
            filePath: request.filePath,
          }),
        ),
      },
      library: {
        getTracks,
      },
    } as unknown as Window['echo'];

    const QueuedSongsShuffleProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.toggleShuffle();
        void queue.playTrack(tracks[0], {
          replaceQueueWith: tracks,
          source: { type: 'songs', label: 'Songs', sort: 'random' },
        });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <QueuedSongsShuffleProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-1'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-2'));
    expect(getTracks).not.toHaveBeenCalled();
  });

  it('refreshes a random Songs queue after the loaded random page is exhausted', async () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3), makeTrack(4)];
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 120000,
        filePath: request.filePath,
      }),
    );
    const getTracks = vi.fn().mockResolvedValue({
      items: [tracks[2], tracks[3]],
      page: 1,
      pageSize: 2,
      total: 4,
      hasMore: true,
    });

    window.echo = {
      playback: {
        playLocalFile,
      },
      library: {
        getTracks,
      },
    } as unknown as Window['echo'];

    const RandomQueueRefreshProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        void queue.playTrack(tracks[0], {
          replaceQueueWith: [tracks[0], tracks[1]],
          source: { type: 'songs', label: 'Songs', sort: 'random' },
        });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="queue-track-ids">{queue.items.map((item) => item.track.id).join(',')}</output>
          <button type="button" disabled={!queue.canGoNext} onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <RandomQueueRefreshProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-1'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-2'));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-3'));
    expect(screen.getByLabelText('queue-track-ids').textContent).toBe('track-3,track-4');
    expect(getTracks).toHaveBeenCalledWith({
      page: 1,
      pageSize: 2,
      search: undefined,
      sort: 'random',
      hideDuplicates: undefined,
      showDuplicatesOnly: undefined,
      duplicateMode: 'strict',
    });
  });

  it('does not fall back to a recently played song when library shuffle returns no fresh candidates', async () => {
    const first = makeTrack(1);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 120000,
        filePath: request.filePath,
      }),
    );
    const getTracks = vi.fn().mockResolvedValue({
      items: [first],
      page: 1,
      pageSize: 500,
      total: 1,
      hasMore: false,
    });

    window.echo = {
      playback: {
        playLocalFile,
      },
      library: {
        getTracks,
      },
    } as unknown as Window['echo'];

    const ExhaustedLibraryShuffleProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didStartRef = useRef(false);

      useEffect(() => {
        if (didStartRef.current) {
          return;
        }

        didStartRef.current = true;
        queue.toggleShuffle();
        void queue.playTrack(first, {
          replaceQueueWith: [first],
          source: { type: 'songs', label: 'Songs', sort: 'default' },
        });
      }, [queue]);

      return (
        <div>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <button type="button" disabled={!queue.canGoNext} onClick={() => void queue.playNext()}>
            next
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <ExhaustedLibraryShuffleProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe(first.id));

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    await waitFor(() => expect(getTracks).toHaveBeenCalledTimes(1));
    expect(playLocalFile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('current-track').textContent).toBe(first.id);
  });

  it('turns off repeat-all when shuffle is enabled', async () => {
    const ModeProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();

      return (
        <div>
          <span data-testid="shuffle">{queue.isShuffleEnabled ? 'on' : 'off'}</span>
          <span data-testid="repeat">{queue.repeatMode}</span>
          <button type="button" onClick={() => queue.setRepeatMode('all')}>
            repeat all
          </button>
          <button type="button" onClick={queue.toggleShuffle}>
            shuffle
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <ModeProbe />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'repeat all' }));
    expect(screen.getByTestId('repeat').textContent).toBe('all');

    fireEvent.click(screen.getByRole('button', { name: 'shuffle' }));

    await waitFor(() => expect(screen.getByTestId('shuffle').textContent).toBe('on'));
    expect(screen.getByTestId('repeat').textContent).toBe('off');
  });

  it('remembers shuffle and repeat mode across provider restarts', async () => {
    const ModeProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();

      return (
        <div>
          <span data-testid="shuffle">{queue.isShuffleEnabled ? 'on' : 'off'}</span>
          <span data-testid="repeat">{queue.repeatMode}</span>
          <button type="button" onClick={queue.toggleShuffle}>
            shuffle
          </button>
          <button type="button" onClick={() => queue.setRepeatMode('one')}>
            repeat one
          </button>
        </div>
      );
    };

    const firstRender = render(
      <PlaybackQueueProvider>
        <ModeProbe />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'shuffle' }));
    fireEvent.click(screen.getByRole('button', { name: 'repeat one' }));

    await waitFor(() => expect(screen.getByTestId('shuffle').textContent).toBe('on'));
    expect(screen.getByTestId('repeat').textContent).toBe('one');

    firstRender.unmount();

    render(
      <PlaybackQueueProvider>
        <ModeProbe />
      </PlaybackQueueProvider>,
    );

    expect(screen.getByTestId('shuffle').textContent).toBe('on');
    expect(screen.getByTestId('repeat').textContent).toBe('one');
  });

  it('remembers queue items and the current track across provider restarts', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];

    const QueueMemoryProbe = ({ seed = false }: { seed?: boolean }): JSX.Element => {
      const queue = usePlaybackQueue();
      const didSeedRef = useRef(false);

      useEffect(() => {
        if (!seed || didSeedRef.current) {
          return;
        }

        didSeedRef.current = true;
        queue.replaceQueue(tracks, { startTrackId: tracks[1].id });
      }, [queue, seed]);

      return (
        <div>
          <output aria-label="queue-size">{queue.items.length}</output>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="current-title">{queue.currentTrack?.title ?? ''}</output>
        </div>
      );
    };

    const firstRender = render(
      <PlaybackQueueProvider>
        <QueueMemoryProbe seed />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('queue-size').textContent).toBe('2'));
    expect(screen.getByLabelText('current-track').textContent).toBe('track-2');

    firstRender.unmount();

    render(
      <PlaybackQueueProvider>
        <QueueMemoryProbe />
      </PlaybackQueueProvider>,
    );

    expect(screen.getByLabelText('queue-size').textContent).toBe('2');
    expect(screen.getByLabelText('current-track').textContent).toBe('track-2');
    expect(screen.getByLabelText('current-title').textContent).toBe('Track 2');
  });

  it('removes every queued instance of a track by track id', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);

    const RemoveTrackProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      const didSeedRef = useRef(false);

      useEffect(() => {
        if (didSeedRef.current) {
          return;
        }

        didSeedRef.current = true;
        queue.appendToQueue(first);
        queue.appendToQueue(second);
        queue.appendToQueue(first);
      }, [queue]);

      return (
        <div>
          <output aria-label="queue-track-ids">{queue.items.map((item) => item.track.id).join(',')}</output>
          <button type="button" onClick={() => queue.removeTrackFromQueue(first.id)}>
            remove first
          </button>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <RemoveTrackProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('queue-track-ids').textContent).toBe('track-1,track-2,track-1'));
    fireEvent.click(screen.getByRole('button', { name: 'remove first' }));

    await waitFor(() => expect(screen.getByLabelText('queue-track-ids').textContent).toBe('track-2'));
  });
});

describe('PlaybackQueueProvider persisted queue session', () => {
  const renderSessionProbe = (): void => {
    const SessionProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();

      return (
        <div>
          <output aria-label="queue-size">{queue.items.length}</output>
          <output aria-label="current-track">{queue.currentTrackId ?? ''}</output>
          <output aria-label="repeat-mode">{queue.repeatMode}</output>
          <output aria-label="shuffle-mode">{queue.isShuffleEnabled ? 'on' : 'off'}</output>
          <output aria-label="automix-mode">{queue.automixEnabled ? 'on' : 'off'}</output>
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <SessionProbe />
      </PlaybackQueueProvider>,
    );
  };

  it('hydrates queue, current item, and playback mode from the main process session', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    const session = makePersistedQueueSession(tracks, {
      currentQueueId: 'queue-2',
      currentTrackId: tracks[1].id,
      lastPlayedTrack: tracks[1],
      mode: {
        isShuffleEnabled: true,
        repeatMode: 'one',
        automixEnabled: true,
      },
    });

    window.echo = {
      playback: {
        getQueueSession: vi.fn().mockResolvedValue(session),
        saveQueueSession: vi.fn(async (snapshot) => snapshot),
      },
    } as unknown as Window['echo'];

    renderSessionProbe();

    await waitFor(() => expect(screen.getByLabelText('queue-size').textContent).toBe('2'));
    expect(screen.getByLabelText('current-track').textContent).toBe('track-2');
    expect(screen.getByLabelText('repeat-mode').textContent).toBe('one');
    expect(screen.getByLabelText('shuffle-mode').textContent).toBe('on');
    expect(screen.getByLabelText('automix-mode').textContent).toBe('on');
  });

  it('does not write an empty queue before main-process hydration finishes', () => {
    vi.useFakeTimers();
    const saveQueueSession = vi.fn(async (snapshot) => snapshot);
    window.echo = {
      playback: {
        getQueueSession: vi.fn(() => new Promise<PersistedPlaybackSessionV1 | null>(() => undefined)),
        saveQueueSession,
      },
    } as unknown as Window['echo'];

    renderSessionProbe();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveQueueSession).not.toHaveBeenCalled();
  });

  it('migrates the legacy localStorage active queue into the main process session once', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    const legacy = makePersistedQueueSession(tracks, {
      currentQueueId: 'queue-2',
      currentTrackId: tracks[1].id,
      lastPlayedTrack: tracks[1],
      mode: {
        isShuffleEnabled: true,
        repeatMode: 'all',
        automixEnabled: true,
      },
    });
    window.localStorage.setItem('echo-next:playback-queue', JSON.stringify({
      version: 1,
      items: legacy.items,
      currentQueueId: legacy.currentQueueId,
      currentTrackId: legacy.currentTrackId,
      lastPlayedTrack: legacy.lastPlayedTrack,
      history: legacy.history,
    }));
    window.localStorage.setItem('echo-next:playback-mode', JSON.stringify({
      isShuffleEnabled: true,
      repeatMode: 'all',
    }));
    window.localStorage.setItem('echo-next:automix-enabled', 'true');

    const saveQueueSession = vi.fn(async (snapshot) => snapshot);
    window.echo = {
      playback: {
        getQueueSession: vi.fn().mockResolvedValue(null),
        saveQueueSession,
      },
    } as unknown as Window['echo'];

    renderSessionProbe();

    await waitFor(() => expect(screen.getByLabelText('current-track').textContent).toBe('track-2'));
    await waitFor(() => expect(saveQueueSession).toHaveBeenCalled());
    expect(saveQueueSession.mock.calls[0]?.[0]).toMatchObject({
      currentQueueId: 'queue-2',
      currentTrackId: 'track-2',
      mode: {
        isShuffleEnabled: true,
        repeatMode: 'all',
        automixEnabled: true,
      },
    });
    expect(window.localStorage.getItem('echo-next:playback-queue')).toBeNull();
    expect(window.localStorage.getItem('echo-next:playback-mode')).toBeNull();
    expect(window.localStorage.getItem('echo-next:automix-enabled')).toBeNull();
  });

  it('starts the restored current queue item from the persisted resume position', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    const session = makePersistedQueueSession(tracks, {
      resume: {
        queueId: 'queue-1',
        trackId: 'track-1',
        filePath: tracks[0].path,
        positionMs: 42000,
        durationMs: 120000,
        state: 'paused',
        updatedAt: '2026-05-21T00:03:00.000Z',
      },
    });
    const playLocalFile = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: 'track-1',
      positionMs: 42000,
      durationMs: 120000,
      filePath: tracks[0].path,
    });
    window.echo = {
      playback: {
        getQueueSession: vi.fn().mockResolvedValue(session),
        saveQueueSession: vi.fn(async (snapshot) => snapshot),
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const PlayProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      return (
        <div>
          {queue.items.map((item) => (
            <button key={item.queueId} type="button" onClick={() => void queue.playQueueItem(item.queueId)}>
              {item.track.title}
            </button>
          ))}
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <PlayProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Track 1' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Track 1' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalled());
    expect(playLocalFile.mock.calls[0]?.[0].startSeconds).toBe(42);
  });

  it('does not reuse the resume position for a different queue item', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    const session = makePersistedQueueSession(tracks, {
      resume: {
        queueId: 'queue-1',
        trackId: 'track-1',
        filePath: tracks[0].path,
        positionMs: 42000,
        durationMs: 120000,
        state: 'paused',
        updatedAt: '2026-05-21T00:03:00.000Z',
      },
    });
    const playLocalFile = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: 'track-2',
      positionMs: 0,
      durationMs: 120000,
      filePath: tracks[1].path,
    });
    window.echo = {
      playback: {
        getQueueSession: vi.fn().mockResolvedValue(session),
        saveQueueSession: vi.fn(async (snapshot) => snapshot),
        playLocalFile,
      },
    } as unknown as Window['echo'];

    const PlayProbe = (): JSX.Element => {
      const queue = usePlaybackQueue();
      return (
        <div>
          {queue.items.map((item) => (
            <button key={item.queueId} type="button" onClick={() => void queue.playQueueItem(item.queueId)}>
              {item.track.title}
            </button>
          ))}
        </div>
      );
    };

    render(
      <PlaybackQueueProvider>
        <PlayProbe />
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Track 2' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Track 2' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalled());
    expect(playLocalFile.mock.calls[0]?.[0].startSeconds).toBeUndefined();
  });
});
