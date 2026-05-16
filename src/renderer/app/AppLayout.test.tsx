// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

describe('AppLayout standalone routes', () => {
  it('lets upper-left chrome notices be closed manually', async () => {
    (window as unknown as { echo?: Window['echo'] }).echo = undefined;

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /最小化|Minimize/ }));

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('auto-dismisses upper-left chrome notices after five seconds', async () => {
    vi.useFakeTimers();
    (window as unknown as { echo?: Window['echo'] }).echo = undefined;

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /最小化|Minimize/ }));
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('status').className).toContain('is-hiding');

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

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

  it('notifies the library views when a download is imported', async () => {
    let jobsUpdated: ((jobs: Array<{ id: string; importedTrackId: string | null }>) => void) | null = null;
    const unsubscribeDownloads = vi.fn();
    const onLibraryChanged = vi.fn();
    window.echo = {
      downloads: {
        onJobsUpdated: vi.fn((handler) => {
          jobsUpdated = handler as typeof jobsUpdated;
          return unsubscribeDownloads;
        }),
      },
    } as unknown as Window['echo'];
    window.addEventListener('library:changed', onLibraryChanged);

    const { unmount } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(window.echo?.downloads?.onJobsUpdated).toHaveBeenCalledTimes(1));

    act(() => {
      jobsUpdated?.([{ id: 'job-1', importedTrackId: null }]);
    });
    expect(onLibraryChanged).not.toHaveBeenCalled();

    act(() => {
      jobsUpdated?.([{ id: 'job-1', importedTrackId: 'track-1' }]);
    });
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);

    act(() => {
      jobsUpdated?.([{ id: 'job-1', importedTrackId: 'track-1' }]);
    });
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribeDownloads).toHaveBeenCalledTimes(1);
    window.removeEventListener('library:changed', onLibraryChanged);
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
  it('returns to the previous shell route when the lyrics transport button is clicked from lyrics', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Shell page')).toBeTruthy());
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
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

  it('auto-dismisses upper-left audio error notices after five seconds', async () => {
    let audioStatusHandler: ((status: { error: string | null; state: string }) => void) | undefined;
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
          warnings: [],
        }),
        onStatus: audioOnStatus,
        setOutput: vi.fn().mockResolvedValue({
          state: 'idle',
          currentTrackId: null,
          currentFilePath: null,
          positionSeconds: 0,
          durationSeconds: 0,
          error: null,
          warnings: [],
        }),
      },
      diagnostics: {
        getLastCrashSummary: vi.fn().mockResolvedValue(null),
        openAudioCrashReport: vi.fn().mockResolvedValue('D:\\ECHO\\audio-crash-report.md'),
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
    vi.useFakeTimers();
    act(() => {
      audioStatusHandler?.({
        state: 'error',
        error: 'echo-audio-host timeout_waiting_for_ready; mode="asio"',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an upper-left notice when an account login expires', async () => {
    let accountStatusHandler:
      | ((statuses: Array<{ provider: 'bilibili'; connected: boolean; error: string | null }>) => void)
      | undefined;
    const accountsOnStatusesChanged = vi.fn((handler) => {
      accountStatusHandler = handler as typeof accountStatusHandler;
      return vi.fn();
    });

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lyricsPlayerBarDrawerEnabled: false, smtcEnabled: true }),
      },
      accounts: {
        onStatusesChanged: accountsOnStatusesChanged,
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(accountStatusHandler).toBeTruthy());
    const emitAccountStatuses = accountStatusHandler;
    if (!emitAccountStatuses) {
      throw new Error('account status handler was not registered');
    }
    emitAccountStatuses([{ provider: 'bilibili', connected: false, error: 'Bilibili login is invalid or expired.' }]);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('账号登录失效')).toBeTruthy();
    expect(screen.getByText(/Bilibili/)).toBeTruthy();
    expect(screen.getByText(/设置 > 集成/)).toBeTruthy();
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
          appWallpaperVisualProtectionEnabled: false,
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

  it('lets wallpaper opacity pass through without visual protection forcing full transparency', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\wallpaper.png',
          appWallpaperScalePercent: 100,
          appWallpaperBlurPx: 0,
          appWallpaperBrightnessPercent: 100,
          appWallpaperUiOpacityPercent: 50,
          appWallpaperVisualProtectionEnabled: false,
          appWallpaperUnifiedOpacityEnabled: false,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(container.querySelector('.app-wallpaper-layer')).toBeTruthy());
    const wallpaper = container.querySelector('.app-wallpaper-layer img') as HTMLImageElement | null;
    expect(wallpaper).toBeTruthy();
    fireEvent.load(wallpaper as HTMLImageElement);

    const shell = await waitFor(() => {
      const element = container.querySelector('.app-shell--wallpaper-ready') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    expect(shell.dataset.wallpaperVisualProtection).toBe('false');
    expect(shell.dataset.wallpaperUiTransparent).toBeUndefined();
    expect(shell.style.getPropertyValue('--app-wallpaper-ui-titlebar-alpha')).toBe('0.370');
    expect(shell.style.getPropertyValue('--app-wallpaper-ui-page-base-alpha')).toBe('0.310');
  });

  it('marks wallpaper chrome as transparent only when protection is off and UI opacity is zero', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\wallpaper.png',
          appWallpaperScalePercent: 100,
          appWallpaperBlurPx: 0,
          appWallpaperBrightnessPercent: 100,
          appWallpaperUiOpacityPercent: 0,
          appWallpaperVisualProtectionEnabled: false,
          appWallpaperUnifiedOpacityEnabled: false,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(container.querySelector('.app-wallpaper-layer')).toBeTruthy());
    fireEvent.load(container.querySelector('.app-wallpaper-layer img') as HTMLImageElement);

    const shell = await waitFor(() => {
      const element = container.querySelector('.app-shell--wallpaper-ready') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    expect(shell.dataset.wallpaperVisualProtection).toBe('false');
    expect(shell.dataset.wallpaperUiTransparent).toBe('true');
    expect(shell.style.getPropertyValue('--app-wallpaper-ui-titlebar-alpha')).toBe('0.000');
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
