// @vitest-environment jsdom
import { useEffect, useRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrack } from '../../shared/types/library';
import { PlaybackQueueProvider, usePlaybackQueue } from './PlaybackQueueProvider';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlaybackQueueProvider playback history session', () => {
  it('finishes the active history session before switching tracks', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const startPlaybackHistory = vi
      .fn()
      .mockResolvedValueOnce({ historyId: 'history-1' })
      .mockResolvedValueOnce({ historyId: 'history-2' });
    const finishPlaybackHistory = vi.fn().mockResolvedValue(null);

    window.echo = {
      playback: {
        playLocalFile: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: first.id,
          positionMs: 0,
          durationMs: first.duration * 1000,
          filePath: first.path,
        }),
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

    await waitFor(() => expect(finishPlaybackHistory).toHaveBeenCalledWith(expect.objectContaining({ historyId: 'history-1' })));
    expect(startPlaybackHistory).toHaveBeenCalledTimes(2);
  });

  it('triggers automatic network MV search when playback starts', async () => {
    const track = makeTrack(1);
    const getSettings = vi.fn().mockResolvedValue({ autoSearch: true });
    const searchNetworkCandidates = vi.fn().mockResolvedValue([]);
    const getSelected = vi.fn().mockResolvedValue(null);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    window.echo = {
      playback: {
        playLocalFile: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: track.id,
          positionMs: 0,
          durationMs: track.duration * 1000,
          filePath: track.path,
        }),
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

    await waitFor(() => expect(searchNetworkCandidates).toHaveBeenCalledWith(track.id));
    await waitFor(() => expect(getSelected).toHaveBeenCalledWith(track.id));
    await waitFor(() =>
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mv:candidatesChanged' })),
    );
  });
});

describe('PlaybackQueueProvider playback modes', () => {
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
      pageSize: 50,
      search: undefined,
      sort: 'random',
      hideDuplicates: undefined,
      duplicateMode: 'strict',
    });
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
});
