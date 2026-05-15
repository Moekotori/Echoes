// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Captions, ListMusic, Music2 } from 'lucide-react';
import { AppProviders } from './AppProviders';
import { AppLayout } from './AppLayout';
import type { AppRoute } from './routes';
import type { LibraryTrack } from '../../shared/types/library';
import { useSharedPlaybackStatus } from '../stores/playbackStatusStore';

const routes: AppRoute[] = [
  {
    id: 'songs',
    label: 'Songs',
    labelKey: 'route.songs.label',
    description: 'Songs',
    icon: Music2,
    placement: 'main',
    element: <div>Shell page</div>,
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    labelKey: 'route.lyrics.label',
    description: 'Lyrics',
    icon: Captions,
    placement: 'main',
    chrome: 'standalone',
    element: <div>Standalone lyrics page</div>,
  },
];

const SharedStatusProbe = (): JSX.Element => {
  useSharedPlaybackStatus();
  return <div>Standalone lyrics page</div>;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

describe('AppLayout standalone routes', () => {
  it('keeps the songs route mounted when navigating away and back', async () => {
    const onSongsMount = vi.fn();
    const onSongsUnmount = vi.fn();
    const SongsProbe = (): JSX.Element => {
      useEffect(() => {
        onSongsMount();
        return () => onSongsUnmount();
      }, []);

      return <div>Songs probe</div>;
    };
    const localRoutes: AppRoute[] = [
      {
        ...routes[0],
        element: <SongsProbe />,
      },
      routes[1],
    ];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    await waitFor(() => expect(onSongsMount).toHaveBeenCalledTimes(1));

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(container.querySelector('[data-route-id="songs"]')?.hasAttribute('hidden')).toBe(true);
    expect(onSongsUnmount).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('app:navigate:lyrics-back'));

    await waitFor(() => expect(container.querySelector('[data-route-id="songs"]')?.hasAttribute('hidden')).toBe(false));
    expect(onSongsMount).toHaveBeenCalledTimes(1);
    expect(onSongsUnmount).not.toHaveBeenCalled();
  });

  it('keeps the player bar on the standalone lyrics page', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    expect(sidebar).toBeTruthy();
    expect(screen.getByRole('contentinfo', { name: '播放控制' })).toBeTruthy();

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByRole('contentinfo', { name: '播放控制' })).toBeTruthy();
  });
  it('uses the lyrics player bar drawer when the lyrics setting is enabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lyricsPlayerBarDrawerEnabled: true, smtcEnabled: true }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(container.querySelector('.app-shell--lyrics-player-drawer')).toBeTruthy());
    const drawerZone = container.querySelector('.lyrics-player-drawer-zone') as HTMLElement;
    expect(drawerZone).toBeTruthy();
    fireEvent.pointerEnter(drawerZone);
    expect(container.querySelector('.app-shell--lyrics-player-drawer-open')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('keeps the same player bar instance when entering the lyrics drawer', async () => {
    const unsubscribeAudioStatus = vi.fn();
    const audioOnStatus = vi.fn(() => unsubscribeAudioStatus);

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lyricsPlayerBarDrawerEnabled: true, smtcEnabled: true }),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: 'track-1',
          positionMs: 15000,
          durationMs: 120000,
          filePath: 'D:\\Music\\song.flac',
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: 'track-1',
          currentFilePath: 'D:\\Music\\song.flac',
          positionSeconds: 15,
          durationSeconds: 120,
          error: null,
        }),
        onStatus: audioOnStatus,
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(null),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(audioOnStatus).toHaveBeenCalledTimes(1));

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(container.querySelector('.lyrics-player-drawer-host')).toBeTruthy());
    expect(audioOnStatus).toHaveBeenCalledTimes(1);
    expect(unsubscribeAudioStatus).not.toHaveBeenCalled();
  });

  it('shares one audio status subscription between the player bar and lyrics page', async () => {
    const audioOnStatus = vi.fn(() => vi.fn());
    const localRoutes: AppRoute[] = [
      routes[0],
      {
        ...routes[1],
        element: <SharedStatusProbe />,
      },
    ];

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lyricsPlayerBarDrawerEnabled: false, smtcEnabled: true }),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: 'track-1',
          positionMs: 15000,
          durationMs: 120000,
          filePath: 'D:\\Music\\song.flac',
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'playing',
          currentTrackId: 'track-1',
          currentFilePath: 'D:\\Music\\song.flac',
          positionSeconds: 15,
          durationSeconds: 120,
          error: null,
        }),
        onStatus: audioOnStatus,
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(null),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    await waitFor(() => expect(audioOnStatus).toHaveBeenCalledTimes(1));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Main navigation' })).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(audioOnStatus).toHaveBeenCalledTimes(1);
  });

  it('shows an upper-left audio error notice with a report action', async () => {
    let audioStatusHandler: ((status: { error: string | null; state: string }) => void) | undefined;
    const openAudioCrashReport = vi.fn().mockResolvedValue('D:\\ECHO\\audio-crash-report.md');
    const audioOnStatus = vi.fn((handler) => {
      audioStatusHandler = handler as typeof audioStatusHandler;
      return vi.fn();
    });

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lyricsPlayerBarDrawerEnabled: false, smtcEnabled: true }),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'idle',
          currentTrackId: null,
          positionMs: 0,
          durationMs: 0,
          filePath: null,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'idle',
          currentTrackId: null,
          currentFilePath: null,
          positionSeconds: 0,
          durationSeconds: 0,
          error: null,
        }),
        onStatus: audioOnStatus,
      },
      diagnostics: {
        getLastCrashSummary: vi.fn().mockResolvedValue(null),
        openAudioCrashReport,
      },
      library: {
        getTrack: vi.fn().mockResolvedValue(null),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(audioStatusHandler).toBeTruthy());
    const emitAudioStatus = audioStatusHandler;
    if (!emitAudioStatus) {
      throw new Error('audio status handler was not registered');
    }
    emitAudioStatus({
      state: 'error',
      error: 'echo-audio-host timeout_waiting_for_ready; mode="asio"',
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('音频错误')).toBeTruthy();
    expect(screen.getByText(/Markdown 诊断报告/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '打开报告' }));
    await waitFor(() => expect(openAudioCrashReport).toHaveBeenCalledTimes(1));
  });

  it('does not apply the app wallpaper layer to the standalone lyrics and MV page', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\wallpaper.png',
          appWallpaperScalePercent: 100,
          appWallpaperBlurPx: 12,
          appWallpaperBrightnessPercent: 80,
          appWallpaperUiOpacityPercent: 0,
          appWallpaperUnifiedOpacityEnabled: true,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(container.querySelector('.app-shell--wallpaper')).toBeTruthy());
    expect(container.querySelector('.app-wallpaper-layer')).toBeTruthy();

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(container.querySelector('.app-shell--lyrics')).toBeTruthy();
    expect(container.querySelector('.app-shell--wallpaper')).toBeNull();
    expect(container.querySelector('.app-wallpaper-layer')).toBeNull();
  });
});

describe('AppLayout local file open integration', () => {
  it('opens system-provided local audio files through the playback queue', async () => {
    const track: LibraryTrack = {
      id: 'temporary-local:file',
      isTemporary: true,
      path: 'D:\\Loose\\song.flac',
      title: 'Loose Song',
      artist: 'Local Artist',
      album: '',
      albumArtist: 'Local Artist',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: 120,
      codec: 'FLAC',
      sampleRate: 44100,
      bitDepth: 16,
      bitrate: null,
      coverId: null,
      coverThumb: null,
      fieldSources: {},
    };
    let openHandler: ((paths: string[]) => void) | null = null;
    const resolveLocalAudioFiles = vi.fn().mockResolvedValue({ tracks: [track], rejected: [] });
    const playLocalFile = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: track.id,
      positionMs: 0,
      durationMs: 120000,
      filePath: track.path,
    });
    const localRoutes: AppRoute[] = [
      routes[0],
      {
        id: 'queue',
        label: 'Queue',
        labelKey: 'route.queue.label',
        description: 'Queue',
        icon: ListMusic,
        placement: 'main',
        element: <div>Queue page</div>,
      },
    ];

    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
        playLocalFile,
        resolveLocalAudioFiles,
        onLocalAudioFilesOpened: (handler: (paths: string[]) => void) => {
          openHandler = handler;
          return vi.fn();
        },
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, currentFilePath: null, positionSeconds: 0, durationSeconds: 0, error: null }),
        onStatus: vi.fn(() => vi.fn()),
      },
      library: {
        startPlaybackHistory: vi.fn().mockResolvedValue({ historyId: 'history-1' }),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    await waitFor(() => expect(openHandler).toBeTruthy());
    const emitOpenFiles = openHandler as ((paths: string[]) => void) | null;
    expect(emitOpenFiles).toBeTruthy();
    emitOpenFiles?.(['D:\\Loose\\song.flac']);

    await waitFor(() => expect(resolveLocalAudioFiles).toHaveBeenCalledWith(['D:\\Loose\\song.flac']));
    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: track.path })));
    expect(screen.getByText('Queue page')).toBeTruthy();
  });
});
