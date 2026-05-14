// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Captions, ListMusic, Music2 } from 'lucide-react';
import { AppProviders } from './AppProviders';
import { AppLayout } from './AppLayout';
import type { AppRoute } from './routes';
import type { LibraryTrack } from '../../shared/types/library';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

describe('AppLayout standalone routes', () => {
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
