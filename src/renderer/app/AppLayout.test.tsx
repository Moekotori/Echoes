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

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 64 })),
    measureElement: vi.fn(),
  }),
}));

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

const routesWithHome: AppRoute[] = [
  {
    id: 'home',
    label: 'Home',
    labelKey: 'route.home.label',
    description: 'Home',
    icon: Music2,
    placement: 'main',
    element: <div>Home shell</div>,
  },
  ...routes,
];

const routesWithQueue: AppRoute[] = [
  routes[0],
  routes[1],
  {
    id: 'queue',
    label: 'Queue',
    labelKey: 'route.queue.label',
    description: 'Queue',
    icon: ListMusic,
    placement: 'main',
    element: <div>Full queue page</div>,
  },
];

const SharedStatusProbe = (): JSX.Element => {
  useSharedPlaybackStatus();
  return <div>Standalone lyrics page</div>;
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

describe('AppLayout standalone routes', () => {
  it('starts on Home when a home route is available without mounting Songs', async () => {
    window.localStorage.clear();

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routesWithHome} />
      </AppProviders>,
    );

    expect(await screen.findByText('Home shell')).toBeTruthy();
    expect(container.querySelector('[data-route-id="home"]')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-route-id="songs"]')).toBeNull();
  });

  it('mounts Songs lazily and keeps it mounted only after the first visit', async () => {
    window.localStorage.clear();
    const onSongsMount = vi.fn();
    const onSongsUnmount = vi.fn();
    const SongsProbe = (): JSX.Element => {
      useEffect(() => {
        onSongsMount();
        return () => onSongsUnmount();
      }, []);

      return <div>Songs lazy probe</div>;
    };
    const localRoutes: AppRoute[] = [
      routesWithHome[0],
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

    await waitFor(() => expect(screen.getByText('Home shell')).toBeTruthy());
    expect(onSongsMount).not.toHaveBeenCalled();

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Songs' }));

    await waitFor(() => expect(onSongsMount).toHaveBeenCalledTimes(1));
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(onSongsUnmount).not.toHaveBeenCalled();
    expect(container.querySelector('[data-route-id="songs"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('unmounts History when leaving so heavy stats work cannot stay resident', async () => {
    window.localStorage.clear();
    const onHistoryMount = vi.fn();
    const onHistoryUnmount = vi.fn();
    const HistoryProbe = (): JSX.Element => {
      useEffect(() => {
        onHistoryMount();
        return () => onHistoryUnmount();
      }, []);

      return <div>History transient probe</div>;
    };
    const localRoutes: AppRoute[] = [
      routesWithHome[0],
      routes[0],
      {
        id: 'history',
        label: 'History',
        labelKey: 'route.history.label',
        description: 'History',
        icon: ListMusic,
        placement: 'main',
        element: <HistoryProbe />,
      },
      routes[1],
    ];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByText('Home shell')).toBeTruthy());

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'History' }));

    await waitFor(() => expect(onHistoryMount).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-route-id="history"]')?.hasAttribute('hidden')).toBe(false);

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Songs' }));

    await waitFor(() => expect(onHistoryUnmount).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-route-id="history"]')).toBeNull();
  });

  it('keeps the playlists route mounted so browse position survives page switches', async () => {
    window.localStorage.clear();
    const onPlaylistsMount = vi.fn();
    const onPlaylistsUnmount = vi.fn();
    const PlaylistsProbe = (): JSX.Element => {
      useEffect(() => {
        onPlaylistsMount();
        return () => onPlaylistsUnmount();
      }, []);

      return (
        <div data-testid="playlist-scroll-probe">
          <div>Playlists persistent probe</div>
        </div>
      );
    };
    const localRoutes: AppRoute[] = [
      routesWithHome[0],
      routes[0],
      {
        id: 'playlists',
        label: 'Playlists',
        labelKey: 'route.playlists.label',
        description: 'Playlists',
        icon: ListMusic,
        placement: 'main',
        element: <PlaylistsProbe />,
      },
      routes[1],
    ];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByText('Home shell')).toBeTruthy());

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Playlists' }));

    const scrollProbe = await screen.findByTestId('playlist-scroll-probe');
    scrollProbe.scrollTop = 480;
    expect(onPlaylistsMount).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Songs' }));

    await waitFor(() => expect(container.querySelector('[data-route-id="playlists"]')?.hasAttribute('hidden')).toBe(true));
    expect(onPlaylistsUnmount).not.toHaveBeenCalled();

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Playlists' }));

    await waitFor(() => expect(container.querySelector('[data-route-id="playlists"]')?.hasAttribute('hidden')).toBe(false));
    expect(screen.getByTestId('playlist-scroll-probe').scrollTop).toBe(480);
    expect(onPlaylistsMount).toHaveBeenCalledTimes(1);
    expect(onPlaylistsUnmount).not.toHaveBeenCalled();
  });

  it('lets upper-left chrome notices be closed manually', async () => {
    (window as unknown as { echo?: Window['echo'] }).echo = undefined;

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /最小化|Minimize/ }));

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /关闭提示|Close notice/ }));

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

  it('shows page notices in the upper-left chrome notice area', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    window.dispatchEvent(new CustomEvent('app:show-chrome-notice', { detail: '随机排序没有稳定位置，当前播放歌曲只能在已加载列表内定位。' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('随机排序没有稳定位置，当前播放歌曲只能在已加载列表内定位。'),
    );
  });

  it('toggles desktop lyrics from the lower-right icon', async () => {
    const show = vi.fn().mockResolvedValue({ visible: true });
    const hide = vi.fn().mockResolvedValue({ visible: false });

    window.echo = {
      desktopLyrics: {
        getState: vi.fn().mockResolvedValue({ visible: false }),
        show,
        hide,
        onStateChanged: vi.fn(() => undefined),
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const toggle = await screen.findByRole('button', { name: /桌面歌词|Desktop lyrics/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(toggle);
    await waitFor(() => expect(hide).toHaveBeenCalledTimes(1));
  });

  it('unlocks desktop lyrics from the lower-right icon context menu', async () => {
    const setLocked = vi.fn().mockResolvedValue({ visible: true, locked: false });

    window.echo = {
      desktopLyrics: {
        getState: vi.fn().mockResolvedValue({ visible: true, locked: true }),
        show: vi.fn(),
        hide: vi.fn(),
        setLocked,
        onStateChanged: vi.fn(() => undefined),
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const toggle = await screen.findByRole('button', { name: /隐藏桌面歌词|Hide desktop lyrics/i });

    fireEvent.contextMenu(toggle);

    await waitFor(() => expect(setLocked).toHaveBeenCalledWith(false));

    fireEvent.contextMenu(toggle);

    expect(setLocked).toHaveBeenCalledTimes(1);
  });

  it('opens a markdown crash report from the abnormal-exit notice', async () => {
    const openCrashReport = vi.fn().mockResolvedValue('D:\\ECHO\\crash-report.md');

    window.echo = {
      diagnostics: {
        getLastCrashSummary: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          startedAt: '2026-05-18T00:00:00.000Z',
          detectedAt: '2026-05-18T00:01:00.000Z',
          sessionBasename: 'session-1',
          sessionPathHash: 'hash',
          reason: 'abnormalExit',
        }),
        openCrashReport,
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByText(/没有正常退出|did not exit normally/i)).toBeTruthy());
    const diagnosticsNotice = screen.getByText(/没有正常退出|did not exit normally/i).closest('.chrome-notice--diagnostics');
    if (!diagnosticsNotice) {
      throw new Error('diagnostics notice was not rendered');
    }
    fireEvent.click(within(diagnosticsNotice as HTMLElement).getByRole('button', { name: /打开报告|Open Report/i }));

    await waitFor(() => expect(openCrashReport).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Markdown 报告已打开|Markdown report opened/i)).toBeTruthy();
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

  it('navigates to the plugin manager from a settings shortcut event', async () => {
    const localRoutes: AppRoute[] = [
      routes[0],
      routes[1],
      {
        id: 'plugins',
        label: 'Plugins',
        description: 'Plugins',
        icon: ListMusic,
        placement: 'main',
        element: <div>Plugin manager page</div>,
      },
    ];

    render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    window.dispatchEvent(new Event('app:navigate:plugins'));

    await waitFor(() => expect(screen.getByText('Plugin manager page')).toBeTruthy());
  });

  it('reopens the first-run wizard when settings mark onboarding incomplete', async () => {
    const getSettings = vi.fn().mockResolvedValue({ onboardingCompleted: true, smtcEnabled: true });
    window.echo = {
      app: {
        getSettings,
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(getSettings).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { onboardingCompleted: false } }));
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('applies saved sidebar visibility and order from settings', async () => {
    window.localStorage.clear();
    const getSettings = vi.fn().mockResolvedValue({
      downloadsFeatureUnlocked: true,
      sidebarRouteOrder: ['queue', 'home', 'songs', 'settings'],
      sidebarHiddenRouteIds: ['songs'],
    });
    window.echo = {
      app: {
        getSettings,
      },
    } as unknown as Window['echo'];

    const localRoutes: AppRoute[] = [
      routesWithHome[0],
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

    render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    await waitFor(() => {
      expect(within(sidebar).queryByRole('button', { name: 'Songs' })).toBeNull();
      expect(within(sidebar).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Queue', 'Home']);
    });
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

  it('marks main-process library updates as scroll-preserving', async () => {
    let libraryChangedHandler: (() => void) | null = null;
    const receivedEvents: Event[] = [];
    window.echo = {
      library: {
        getSummary: vi.fn(async () => ({})),
        onLibraryChanged: vi.fn((handler) => {
          libraryChangedHandler = handler;
          return vi.fn();
        }),
      },
    } as unknown as Window['echo'];
    window.addEventListener('library:changed', (event) => receivedEvents.push(event));

    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    await waitFor(() => expect(window.echo?.library.onLibraryChanged).toHaveBeenCalledTimes(1));
    await act(async () => {
      libraryChangedHandler?.();
    });

    expect(receivedEvents).toHaveLength(1);
    expect((receivedEvents[0] as CustomEvent).detail).toEqual({ preserveScroll: true });
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

  it('opens the full queue page from the shell player bar', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routesWithQueue} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Playback queue' }));

    await waitFor(() => expect(screen.getByText('Full queue page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: '播放队列抽屉' })).toBeNull();
  });

  it('opens the lightweight queue drawer from the lyrics player bar', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routesWithQueue} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: '播放队列抽屉' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Playback queue' }));

    expect(screen.getByRole('complementary', { name: '播放队列抽屉' })).toBeTruthy();
    expect(screen.getByText('队列为空')).toBeTruthy();
    expect(screen.queryByText('Full queue page')).toBeNull();
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

  it('uses the lyrics transport button to switch from MV to pure lyrics before exiting', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'mv' } }));
    });

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();

    const playerBar = screen.getByRole('contentinfo');
    fireEvent.click(within(playerBar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();

    fireEvent.click(within(playerBar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Shell page')).toBeTruthy());
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
  });

  it('exits the MV page when the MV transport button is clicked again', async () => {
    render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'mv' } }));
    });

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull();

    fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: 'MV' }));

    await waitFor(() => expect(screen.getByText('Shell page')).toBeTruthy());
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeTruthy();
  });

  it('uses the lyrics mini player bar when the lyrics setting is enabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: true,
          lyricsPlayerBarDrawerOpacityPercent: 64,
          lyricsPlayerBarDrawerColorMode: 'custom',
          lyricsPlayerBarDrawerColor: '#ff3366',
          smtcEnabled: true,
        }),
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
    expect(container.querySelector('.app-shell--lyrics-mini-player')).toBeTruthy();
    expect(container.querySelector('.lyrics-player-drawer-zone')).toBeNull();
    const miniHost = container.querySelector('.lyrics-player-drawer-host') as HTMLElement;
    expect(miniHost.querySelector('.player-bar')).toBeTruthy();
    expect(miniHost.dataset.miniPlayerColorMode).toBe('custom');
    expect(miniHost.style.getPropertyValue('--lyrics-mini-player-background')).toBe('rgba(255, 51, 102, 0.64)');
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('uses the lyrics mini player bar automatically on the MV page', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          lyricsPlayerBarDrawerAutoEnableForMv: true,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'mv' } }));
    });

    await waitFor(() => expect(container.querySelector('.app-shell--lyrics-player-drawer')).toBeTruthy());
    expect(container.querySelector('.app-shell--lyrics-mini-player')).toBeTruthy();
  });

  it('keeps the normal MV player bar when MV auto mini player is disabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          lyricsPlayerBarDrawerAutoEnableForMv: false,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <AppProviders>
        <AppLayout routes={routes} />
      </AppProviders>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'mv' } }));
    });

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(container.querySelector('.app-shell--lyrics-player-drawer')).toBeNull();
    expect(container.querySelector('.app-shell--lyrics-mini-player')).toBeNull();
  });

  it('keeps the same player bar instance when entering the lyrics mini player', async () => {
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

    await waitFor(() => expect(audioOnStatus).toHaveBeenCalled());
    const initialAudioSubscriptionCount = audioOnStatus.mock.calls.length;

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(container.querySelector('.lyrics-player-drawer-host')).toBeTruthy());
    expect(audioOnStatus).toHaveBeenCalledTimes(initialAudioSubscriptionCount);
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

    await waitFor(() => expect(audioOnStatus).toHaveBeenCalled());
    const initialAudioSubscriptionCount = audioOnStatus.mock.calls.length;
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Main navigation' })).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    expect(audioOnStatus).toHaveBeenCalledTimes(initialAudioSubscriptionCount);
  });

  it('shows an upper-left audio error notice with a report action', async () => {
    const audioStatusHandlers: Array<(status: { error: string | null; state: string }) => void> = [];
    const openAudioCrashReport = vi.fn().mockResolvedValue('D:\\ECHO\\audio-crash-report.md');
    const audioOnStatus = vi.fn((handler) => {
      audioStatusHandlers.push(handler as (status: { error: string | null; state: string }) => void);
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

    await waitFor(() => expect(audioStatusHandlers[0]).toBeTruthy());
    const emitAudioStatus = audioStatusHandlers[0];
    if (!emitAudioStatus) {
      throw new Error('audio status handler was not registered');
    }
    emitAudioStatus({
      state: 'error',
      error: 'echo-audio-host timeout_waiting_for_ready; mode="asio"',
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/音频错误|Audio Error/i)).toBeTruthy();
    expect(screen.getByText(/Markdown (诊断报告|diagnostics report)/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /打开报告|Open Report/i }));
    await waitFor(() => expect(openAudioCrashReport).toHaveBeenCalledTimes(1));
  });

  it('clears transient audio error notices after playback recovers', async () => {
    const audioStatusHandlers: Array<(status: { error: string | null; state: string }) => void> = [];
    const audioOnStatus = vi.fn((handler) => {
      audioStatusHandlers.push(handler as (status: { error: string | null; state: string }) => void);
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

    await waitFor(() => expect(audioStatusHandlers[0]).toBeTruthy());
    audioStatusHandlers[0]?.({
      state: 'error',
      error: 'echo-audio-host timeout_waiting_for_ready; mode="asio"',
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    audioStatusHandlers[0]?.({
      state: 'playing',
      error: null,
    });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('auto-dismisses upper-left audio error notices after five seconds', async () => {
    const audioStatusHandlers: Array<(status: { error: string | null; state: string }) => void> = [];
    const audioOnStatus = vi.fn((handler) => {
      audioStatusHandlers.push(handler as (status: { error: string | null; state: string }) => void);
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

    await waitFor(() => expect(audioStatusHandlers[0]).toBeTruthy());
    vi.useFakeTimers();
    act(() => {
      audioStatusHandlers[0]?.({
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
    expect(screen.getByText(/账号登录失效|Account Login Expired/i)).toBeTruthy();
    expect(screen.getByText(/Bilibili/)).toBeTruthy();
    expect(screen.getByText(/设置 > 集成|Settings > Integrations/i)).toBeTruthy();
  });

  it('suppresses account expiry notices when the setting is enabled', async () => {
    let accountStatusHandler:
      | ((statuses: Array<{ provider: 'bilibili'; connected: boolean; error: string | null }>) => void)
      | undefined;
    const accountsOnStatusesChanged = vi.fn((handler) => {
      accountStatusHandler = handler as typeof accountStatusHandler;
      return vi.fn();
    });

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          smtcEnabled: true,
          suppressAccountExpiryNotices: true,
        }),
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
    await waitFor(() => expect(window.echo?.app?.getSettings).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    const emitAccountStatuses = accountStatusHandler;
    if (!emitAccountStatuses) {
      throw new Error('account status handler was not registered');
    }
    emitAccountStatuses([{ provider: 'bilibili', connected: false, error: 'Bilibili login is invalid or expired.' }]);

    expect(screen.queryByText(/账号登录失效|Account Login Expired/i)).toBeNull();
    expect(screen.queryByText(/设置 > 集成|Settings > Integrations/i)).toBeNull();
  });

  it('hides the app wallpaper layer on the standalone lyrics and MV page without unmounting it', async () => {
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
    const wallpaperLayer = container.querySelector('.app-wallpaper-layer') as HTMLElement | null;
    expect(wallpaperLayer).toBeTruthy();
    expect(wallpaperLayer?.dataset.hidden).toBe('true');
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

  it('renders video app wallpaper and marks it ready after media load', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\motion.mp4',
          appWallpaperMediaType: 'video',
          appVideoWallpaperPauseMode: 'smart',
          appWallpaperScalePercent: 115,
          appWallpaperBlurPx: 0,
          appWallpaperBrightnessPercent: 100,
          appWallpaperUiOpacityPercent: 80,
          appWallpaperVisualProtectionEnabled: true,
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

    const video = await waitFor(() => {
      const element = container.querySelector('.app-wallpaper-layer video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element as HTMLVideoElement;
    });
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);

    fireEvent.loadedData(video);

    await waitFor(() => expect(container.querySelector('.app-shell--wallpaper-ready')).toBeTruthy());
    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    playSpy.mockRestore();
  });

  it('keeps video wallpaper mounted when navigating away and resumes it on return', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\motion.mp4',
          appWallpaperMediaType: 'video',
          appVideoWallpaperPauseMode: 'smart',
          appWallpaperScalePercent: 115,
          appWallpaperBlurPx: 0,
          appWallpaperBrightnessPercent: 100,
          appWallpaperUiOpacityPercent: 80,
          appWallpaperVisualProtectionEnabled: true,
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

    const video = await waitFor(() => {
      const element = container.querySelector('.app-wallpaper-layer video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element as HTMLVideoElement;
    });
    fireEvent.loadedData(video);
    await waitFor(() => expect(container.querySelector('.app-shell--wallpaper-ready')).toBeTruthy());

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Standalone lyrics page')).toBeTruthy());
    const hiddenLayer = container.querySelector('.app-wallpaper-layer') as HTMLElement | null;
    expect(hiddenLayer?.dataset.hidden).toBe('true');
    expect(container.querySelector('.app-wallpaper-layer video')).toBe(video);
    expect(container.querySelector('.app-shell--wallpaper-ready')).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Lyrics' }));

    await waitFor(() => expect(screen.getByText('Shell page')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('.app-shell--wallpaper-ready')).toBeTruthy());
    expect(container.querySelector('.app-wallpaper-layer video')).toBe(video);
    expect((container.querySelector('.app-wallpaper-layer') as HTMLElement | null)?.dataset.hidden).toBeUndefined();
    expect(playSpy).toHaveBeenCalled();
  });

  it('resumes ready video wallpaper after page visibility returns', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({
          lyricsPlayerBarDrawerEnabled: false,
          appCustomWallpaperPath: 'D:\\Echo\\app-wallpapers\\motion.mp4',
          appWallpaperMediaType: 'video',
          appVideoWallpaperPauseMode: 'smart',
          appWallpaperScalePercent: 115,
          appWallpaperBlurPx: 0,
          appWallpaperBrightnessPercent: 100,
          appWallpaperUiOpacityPercent: 80,
          appWallpaperVisualProtectionEnabled: true,
          appWallpaperUnifiedOpacityEnabled: false,
          smtcEnabled: true,
        }),
      },
    } as unknown as Window['echo'];

    try {
      const { container } = render(
        <AppProviders>
          <AppLayout routes={routes} />
        </AppProviders>,
      );

      const video = await waitFor(() => {
        const element = container.querySelector('.app-wallpaper-layer video') as HTMLVideoElement | null;
        expect(element).toBeTruthy();
        return element as HTMLVideoElement;
      });
      fireEvent.loadedData(video);
      await waitFor(() => expect(container.querySelector('.app-shell--wallpaper-ready')).toBeTruthy());

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(pauseSpy).toHaveBeenCalled());

      playSpy.mockClear();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => expect(playSpy).toHaveBeenCalled());
    } finally {
      if (visibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
      } else {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    }
  });
});

describe('AppLayout local file open integration', () => {
  it('imports selected audio and osu archive files through the library bridge', async () => {
    const chooseImportFiles = vi.fn().mockResolvedValue(['D:\\Music\\song.flac', 'D:\\Maps\\beatmap.osz']);
    const importAudioFiles = vi.fn().mockResolvedValue({
      importedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      trackIds: ['track-audio', 'track-osu'],
      tracks: [],
    });
    const localRoutes: AppRoute[] = [
      routes[0],
      {
        id: 'import-file',
        label: 'Import File',
        labelKey: 'route.importFile.label',
        description: 'Import File',
        icon: Music2,
        placement: 'utility',
        element: <div>Import file placeholder</div>,
      },
    ];
    window.echo = {
      library: {
        chooseImportFiles,
        importAudioFiles,
      },
    } as unknown as Window['echo'];

    render(
      <AppProviders>
        <AppLayout routes={localRoutes} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: /导入文件|Import File/ }));

    await waitFor(() => expect(chooseImportFiles).toHaveBeenCalledTimes(1));
    expect(importAudioFiles).toHaveBeenCalledWith(['D:\\Music\\song.flac', 'D:\\Maps\\beatmap.osz']);
    expect(await screen.findByText(/已入库 2 个文件|Imported 2 files into the library/i)).toBeTruthy();
  });

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
