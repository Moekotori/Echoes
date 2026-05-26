// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AudioStatus } from '../../shared/types/audio';
import type {
  LibraryAlbum,
  LibraryArtist,
  LibrarySummary,
  LibraryTrack,
  PlaybackHistoryEntry,
  PlaybackHistorySummary,
  PlaybackStatsDashboard,
} from '../../shared/types/library';
import { albumDetailNavigationEvent } from '../utils/albumNavigation';
import { artistDetailNavigationEvent } from '../utils/artistNavigation';
import { HomePage, resetHomePageCacheForTest } from './HomePage';

const queueState = vi.hoisted(() => ({
  value: {
    currentTrack: null as LibraryTrack | null,
    lastPlayedTrack: null as LibraryTrack | null,
    playTrack: vi.fn(),
    replaceQueue: vi.fn(),
  },
}));

const sharedPlaybackState = vi.hoisted(() => ({
  value: {
    audioStatus: null as AudioStatus | null,
    playbackStatus: null,
    playbackVisualIntent: null,
    error: null,
    version: 0,
  },
}));

vi.mock('../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueState.value,
}));

vi.mock('../stores/playbackStatusStore', () => ({
  useSharedPlaybackStatus: () => sharedPlaybackState.value,
}));

const summary = (overrides: Partial<LibrarySummary> = {}): LibrarySummary => ({
  songCount: 12,
  albumCount: 3,
  artistCount: 4,
  folderCount: 2,
  totalDuration: 7200,
  lastScanAt: '2026-05-25T08:00:00.000Z',
  ...overrides,
});

const track = (id: string, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  mediaType: 'local',
  path: `D:\\Music\\${id}.flac`,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 180,
  codec: 'FLAC',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...overrides,
});

const album = (id: string, overrides: Partial<LibraryAlbum> = {}): LibraryAlbum => ({
  id,
  mediaType: 'local',
  albumKey: `album:${id}`,
  title: `Album ${id}`,
  albumArtist: 'Artist',
  year: null,
  trackCount: 10,
  duration: 1800,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const spectrum24 = (values: number[]): number[] =>
  Array.from({ length: 24 }, (_, index) => {
    const sourceIndex = Math.min(values.length - 1, Math.floor((index / 24) * values.length));
    return values[sourceIndex] ?? 0;
  });

const artist = (id: string, overrides: Partial<LibraryArtist> = {}): LibraryArtist => ({
  id,
  mediaType: 'local',
  artistKey: `artist:${id}`,
  name: `Artist ${id}`,
  sortName: `Artist ${id}`,
  role: 'both',
  albumCount: 1,
  trackCount: 1,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const historyEntry = (id: string, overrides: Partial<PlaybackHistoryEntry> = {}): PlaybackHistoryEntry => ({
  id,
  trackId: id,
  trackPath: `D:\\Music\\${id}.flac`,
  mediaType: 'local',
  provider: null,
  providerTrackId: null,
  stableKey: null,
  title: `History ${id}`,
  artist: 'History Artist',
  album: 'History Album',
  albumArtist: 'History Artist',
  coverId: null,
  coverThumb: null,
  startedAt: '2026-05-25T09:00:00.000Z',
  endedAt: '2026-05-25T09:03:00.000Z',
  playedSeconds: 180,
  durationSeconds: 180,
  durationSnapshot: 180,
  coverSnapshot: null,
  playCount: 1,
  completed: true,
  sourceType: 'manual',
  sourceLabel: 'Songs',
  queueId: null,
  ...overrides,
});

const historySummary = (overrides: Partial<PlaybackHistorySummary> = {}): PlaybackHistorySummary => ({
  todayCount: 2,
  todayPlayedSeconds: 360,
  totalCount: 10,
  latestPlayedAt: '2026-05-25T09:00:00.000Z',
  rangeCount: 5,
  rangePlayedSeconds: 900,
  rangeLatestPlayedAt: '2026-05-25T09:00:00.000Z',
  ...overrides,
});

const stats = (overrides: Partial<PlaybackStatsDashboard> = {}): PlaybackStatsDashboard => ({
  generatedAt: '2026-05-25T09:00:00.000Z',
  totals: {
    playCount: 5,
    completedCount: 4,
    playedSeconds: 900,
    uniqueTracks: 3,
    uniqueArtists: 2,
  },
  topTracks: [],
  topArtists: [
    { artist: 'Aimer', playCount: 4, completedCount: 3, playedSeconds: 720 },
    { artist: 'Moe', playCount: 2, completedCount: 2, playedSeconds: 360 },
  ],
  formatBreakdown: [],
  qualityBreakdown: [],
  dailyActivity: [
    { date: '2026-05-19', playCount: 1, playedSeconds: 120 },
    { date: '2026-05-20', playCount: 2, playedSeconds: 360 },
  ],
  ...overrides,
});

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: items.length,
  total: items.length,
  hasMore: false,
});

const installLibraryMock = (overrides: Partial<NonNullable<Window['echo']>['library']> = {}) => {
  const getAlbumForTrack = vi.fn(async (trackId: string) => {
    if (trackId === 'recent-1') {
      return album('recent-album', { title: 'Album' });
    }
    if (trackId.startsWith('history-')) {
      return album(`played-album-${trackId}`, {
        title: trackId === 'history-1' ? 'Night Album' : `Played Album ${trackId}`,
        albumArtist: trackId === 'history-1' ? 'Night Artist' : 'History Artist',
        coverId: trackId === 'history-1' ? 'played-album-cover' : `played-album-cover-${trackId}`,
      });
    }

    return album(`album-${trackId}`);
  });
  const library = {
    getSummary: vi.fn().mockResolvedValue(summary()),
    getTracks: vi.fn().mockResolvedValue(page([
      track('recent-1', { title: 'Breeze', artist: 'Moe', coverId: 'recent-cover', coverThumb: 'echo-cover://thumb/recent-cover' }),
      track('recent-2', { title: 'Echo Bloom', coverId: 'recent-cover-2', coverThumb: 'echo-cover://thumb/recent-cover-2' }),
      track('recent-3', { title: 'Signal Blue', coverId: 'recent-cover-3', coverThumb: 'echo-cover://thumb/recent-cover-3' }),
      track('recent-4', { title: 'Glass Tide', coverId: 'recent-cover-4', coverThumb: 'echo-cover://thumb/recent-cover-4' }),
      track('recent-5', { title: 'Fifth Cover', coverId: 'recent-cover-5', coverThumb: 'echo-cover://thumb/recent-cover-5' }),
    ])),
    getPlaybackHistory: vi.fn().mockResolvedValue(page([
      historyEntry('history-1', { title: 'Night Signal', coverId: 'played-cover', coverThumb: 'echo-cover://thumb/played-cover' }),
      historyEntry('history-2', { title: 'Played Two', coverId: 'played-cover-2', coverThumb: 'echo-cover://thumb/played-cover-2' }),
      historyEntry('history-3', { title: 'Played Three', coverId: 'played-cover-3', coverThumb: 'echo-cover://thumb/played-cover-3' }),
      historyEntry('history-4', { title: 'Played Four', coverId: 'played-cover-4', coverThumb: 'echo-cover://thumb/played-cover-4' }),
      historyEntry('history-5', { title: 'Played Five', coverId: 'played-cover-5', coverThumb: 'echo-cover://thumb/played-cover-5' }),
    ])),
    getAlbums: vi.fn().mockResolvedValue(page([
      album('daily-1', { title: 'Daily Album One', albumArtist: 'Moe', coverId: 'daily-cover-1', coverThumb: 'echo-cover://album/daily-cover-1' }),
      album('daily-2', { title: 'Daily Album Two', albumArtist: 'Aimer', coverId: 'daily-cover-2', coverThumb: 'echo-cover://album/daily-cover-2' }),
      album('daily-3', { title: 'Daily Album Three', albumArtist: 'ECHO', coverId: 'daily-cover-3', coverThumb: 'echo-cover://album/daily-cover-3' }),
      album('daily-4', { title: 'Daily Album Four', albumArtist: 'Next', coverId: 'daily-cover-4', coverThumb: 'echo-cover://album/daily-cover-4' }),
      album('daily-5', { title: 'Daily Album Five', albumArtist: 'ECHO', coverId: 'daily-cover-5', coverThumb: 'echo-cover://album/daily-cover-5' }),
      album('daily-6', { title: 'Daily Album Six', albumArtist: 'Next', coverId: 'daily-cover-6', coverThumb: 'echo-cover://album/daily-cover-6' }),
      album('daily-7', { title: 'Daily Album Seven', albumArtist: 'Moe', coverId: 'daily-cover-7', coverThumb: 'echo-cover://album/daily-cover-7' }),
    ])),
    getArtists: vi.fn().mockResolvedValue(page([artist('artist-moe', { name: 'Moe', sortName: 'Moe' })])),
    getAlbumForTrack,
    getPlaybackHistorySummary: vi.fn().mockResolvedValue(historySummary()),
    getPlaybackStatsDashboard: vi.fn().mockResolvedValue(stats()),
    ...overrides,
  };

  window.echo = { library } as unknown as Window['echo'];
  return library;
};

afterEach(() => {
  cleanup();
  resetHomePageCacheForTest();
  vi.restoreAllMocks();
  queueState.value.currentTrack = null;
  queueState.value.lastPlayedTrack = null;
  queueState.value.playTrack.mockReset();
  queueState.value.replaceQueue.mockReset();
  sharedPlaybackState.value.audioStatus = null;
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

const waitForRecentPanelReady = async (): Promise<void> => {
  await waitFor(() => {
    expect(document.querySelectorAll('.home-recent-panel .home-cover-card').length).toBeGreaterThan(0);
  });
};

describe('HomePage', () => {
  it('shows a desktop bridge fallback instead of crashing', async () => {
    render(<HomePage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('loads lightweight library and listening summaries', async () => {
    const library = installLibraryMock();

    render(<HomePage />);

    await waitForRecentPanelReady();
    expect(screen.queryByText('鏇插簱鑴夊啿')).toBeNull();
    expect(screen.getAllByRole('tab')[1]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('本周回声')).toBeTruthy();
    expect(document.querySelectorAll('.home-recent-panel .home-cover-card')).toHaveLength(4);
    expect(document.querySelector('.home-recent-panel .home-cover-card img')?.getAttribute('src')).toBe('echo-cover://large/daily-cover-1');
    expect(document.querySelectorAll('.home-recommend-panel .home-cover-card')).toHaveLength(7);
    expect(document.querySelector('.home-recommend-panel .home-cover-card img')?.getAttribute('src')).toMatch(/^echo-cover:\/\/large\/daily-cover-/);
    expect(library.getAlbums).toHaveBeenCalledWith({ page: 1, pageSize: 8, sort: 'recent' });
    expect(library.getAlbums).toHaveBeenCalledWith({ page: 1, pageSize: 7, sort: 'default' });
    const contentGrid = document.querySelector('.home-content-grid');
    const recommendPanel = document.querySelector('.home-recommend-panel');
    expect(contentGrid && recommendPanel ? contentGrid.compareDocumentPosition(recommendPanel) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy();
    expect(within(document.querySelector('.home-recent-panel') as HTMLElement).queryByText('Daily Album Five')).toBeNull();
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('button', { name: /Night Album/ })).toBeTruthy();
    expect(document.querySelectorAll('.home-recent-panel .home-cover-card')).toHaveLength(4);
    expect(document.querySelector('.home-recent-panel .home-played-rail img')?.getAttribute('src')).toBe('echo-cover://large/played-album-cover');
    expect(library.getTracks).toHaveBeenCalledWith({ page: 1, pageSize: 8, sort: 'recent' });
    expect(library.getPlaybackHistory).toHaveBeenCalledWith({ page: 1, pageSize: 12, sort: 'recent' });
  });

  it('reuses cached home data when the page mounts again', async () => {
    const library = installLibraryMock();

    render(<HomePage />);
    await waitForRecentPanelReady();

    vi.mocked(library.getSummary).mockClear();
    vi.mocked(library.getTracks).mockClear();
    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    vi.mocked(library.getAlbums).mockClear();
    vi.mocked(library.getAlbumForTrack).mockClear();
    cleanup();

    render(<HomePage />);

    await waitForRecentPanelReady();
    expect(library.getSummary).not.toHaveBeenCalled();
    expect(library.getTracks).not.toHaveBeenCalled();
    expect(library.getPlaybackHistory).not.toHaveBeenCalled();
    expect(library.getPlaybackHistorySummary).not.toHaveBeenCalled();
    expect(library.getPlaybackStatsDashboard).not.toHaveBeenCalled();
    expect(library.getAlbums).not.toHaveBeenCalled();
    expect(library.getAlbumForTrack).not.toHaveBeenCalled();
  });

  it('keeps the selected recent activity tab when returning to home', async () => {
    installLibraryMock();

    render(<HomePage />);

    await waitForRecentPanelReady();
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('true');
    cleanup();

    render(<HomePage />);

    await waitForRecentPanelReady();
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab')[1]?.getAttribute('aria-selected')).toBe('false');
    expect(document.querySelector('.home-recent-panel .home-played-rail')).toBeTruthy();
  });

  it('refreshes recommendation albums without reloading playback or library pulses', async () => {
    const library = installLibraryMock();

    render(<HomePage />);

    await waitForRecentPanelReady();
    vi.mocked(library.getSummary).mockClear();
    vi.mocked(library.getTracks).mockClear();
    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    vi.mocked(library.getAlbums).mockClear();
    vi.mocked(library.getAlbums).mockResolvedValue(page([
      album('random-recommendation', { title: 'Random Recommendation', coverId: 'random-recommendation-cover' }),
    ]));

    const recommendPanel = document.querySelector('.home-recommend-panel') as HTMLElement;
    fireEvent.click(recommendPanel.querySelector('.home-section-header button') as HTMLButtonElement);

    expect(await within(recommendPanel).findByRole('button', { name: /Random Recommendation/ })).toBeTruthy();
    expect(library.getAlbums).toHaveBeenCalledWith({ page: 1, pageSize: 7, sort: 'random' });
    expect(library.getSummary).not.toHaveBeenCalled();
    expect(library.getTracks).not.toHaveBeenCalled();
    expect(library.getPlaybackHistory).not.toHaveBeenCalled();
    expect(library.getPlaybackHistorySummary).not.toHaveBeenCalled();
    expect(library.getPlaybackStatsDashboard).not.toHaveBeenCalled();
  });

  it('navigates from library metric tiles', async () => {
    installLibraryMock();
    const navigate = vi.fn<(event: Event) => void>();
    window.addEventListener('app:navigate:route', navigate);

    try {
      render(<HomePage />);

      await waitForRecentPanelReady();
      const clickMetric = (index: number): string | undefined => {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.home-metric-tile');
        fireEvent.click(buttons[index]);
        return (navigate.mock.calls.at(-1)?.[0] as CustomEvent<string> | undefined)?.detail;
      };

      expect(clickMetric(0)).toBe('songs');
      expect(clickMetric(1)).toBe('albums');
      expect(clickMetric(2)).toBe('artists');
      expect(clickMetric(3)).toBe('folders');
    } finally {
      window.removeEventListener('app:navigate:route', navigate);
    }
  });

  it('opens the album detail from a recent cover without starting playback', async () => {
    installLibraryMock();
    const navigateAlbum = vi.fn<(event: Event) => void>();
    window.addEventListener(albumDetailNavigationEvent, navigateAlbum);

    try {
      render(<HomePage />);

      fireEvent.click((await screen.findAllByRole('button', { name: /Daily Album One/ }))[0]);

      expect(queueState.value.playTrack).not.toHaveBeenCalled();
      expect((navigateAlbum.mock.calls[0]?.[0] as CustomEvent<unknown> | undefined)?.detail).toEqual(
        expect.objectContaining({ album: expect.objectContaining({ id: 'daily-1' }), returnTo: 'home' }),
      );
    } finally {
      window.removeEventListener(albumDetailNavigationEvent, navigateAlbum);
    }
  });

  it('opens hero artist and album links with home return targets', async () => {
    const library = installLibraryMock();
    const navigateArtist = vi.fn<(event: Event) => void>();
    const navigateAlbum = vi.fn<(event: Event) => void>();
    window.addEventListener(artistDetailNavigationEvent, navigateArtist);
    window.addEventListener(albumDetailNavigationEvent, navigateAlbum);

    try {
      render(<HomePage />);

      await waitForRecentPanelReady();
      const nowCard = document.querySelector('.home-now-card') as HTMLElement;
      expect(nowCard).toBeTruthy();

      fireEvent.click(within(nowCard).getByRole('button', { name: 'Moe' }));

      await waitFor(() =>
        expect(library.getArtists).toHaveBeenCalledWith({ page: 1, pageSize: 50, search: 'Moe', sort: 'default' }),
      );
      expect((navigateArtist.mock.calls[0]?.[0] as CustomEvent<unknown> | undefined)?.detail).toEqual(
        expect.objectContaining({ artist: expect.objectContaining({ id: 'artist-moe' }), returnTo: 'home' }),
      );

      vi.mocked(library.getAlbumForTrack).mockClear();
      fireEvent.click(within(nowCard).getByRole('button', { name: 'Album' }));

      await waitFor(() => expect(library.getAlbumForTrack).toHaveBeenCalledWith('recent-1'));
      expect((navigateAlbum.mock.calls[0]?.[0] as CustomEvent<unknown> | undefined)?.detail).toEqual(
        expect.objectContaining({ album: expect.objectContaining({ id: 'recent-album' }), returnTo: 'home' }),
      );
      expect(queueState.value.playTrack).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(artistDetailNavigationEvent, navigateArtist);
      window.removeEventListener(albumDetailNavigationEvent, navigateAlbum);
    }
  });

  it('renders an artist leaderboard and opens artist detail from home', async () => {
    const getArtists = vi.fn().mockResolvedValue(page([artist('artist-aimer', { name: 'Aimer', sortName: 'Aimer' })]));
    installLibraryMock({ getArtists });
    const navigateArtist = vi.fn<(event: Event) => void>();
    window.addEventListener(artistDetailNavigationEvent, navigateArtist);

    try {
      render(<HomePage />);

      await waitForRecentPanelReady();
      const panel = document.querySelector('.home-artist-rank-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      await waitFor(() => expect(panel.querySelectorAll('.home-artist-rank-row')).toHaveLength(2));
      expect(panel.querySelector('.home-artist-avatar')).toBeNull();
      expect(panel.querySelector('.home-artist-rank-row[data-rank-lead="true"]')).toBeTruthy();
      expect(panel.textContent).toContain('Aimer');
      expect(panel.textContent).toContain('01');
      expect(panel.textContent).toContain('75%');

      fireEvent.click(within(panel).getByRole('button', { name: /Aimer/ }));

      await waitFor(() => expect(getArtists).toHaveBeenCalledWith({ page: 1, pageSize: 50, search: 'Aimer', sort: 'default' }));
      expect((navigateArtist.mock.calls[0]?.[0] as CustomEvent<unknown> | undefined)?.detail).toEqual(
        expect.objectContaining({ artist: expect.objectContaining({ id: 'artist-aimer' }), returnTo: 'home' }),
      );
    } finally {
      window.removeEventListener(artistDetailNavigationEvent, navigateArtist);
    }
  });

  it('keeps the hero continue button as the explicit playback action', async () => {
    installLibraryMock();

    render(<HomePage />);

    await waitForRecentPanelReady();
    fireEvent.click(document.querySelector<HTMLButtonElement>('.home-primary-action')!);

    await waitFor(() => expect(queueState.value.playTrack).toHaveBeenCalledTimes(1));
    expect(queueState.value.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recent-1', title: 'Breeze' }),
      expect.objectContaining({ source: { type: 'manual', label: 'ECHO Home' } }),
    );
  });

  it('generates a random queue from the hero without starting playback', async () => {
    const library = installLibraryMock();
    const navigate = vi.fn<(event: Event) => void>();
    window.addEventListener('app:navigate:route', navigate);

    try {
      render(<HomePage />);

      await waitForRecentPanelReady();
      vi.mocked(library.getTracks).mockClear();
      vi.mocked(library.getTracks).mockResolvedValueOnce(page([
        track('random-1', { title: 'Random One' }),
        track('random-2', { title: 'Random Two' }),
      ]));

      fireEvent.click(screen.getByRole('button', { name: /生成随机队列/ }));

      await waitFor(() => expect(library.getTracks).toHaveBeenCalledWith({ page: 1, pageSize: 36, sort: 'random', randomWindow: true }));
      await waitFor(() =>
        expect(queueState.value.replaceQueue).toHaveBeenCalledWith(
          [expect.objectContaining({ id: 'random-1' }), expect.objectContaining({ id: 'random-2' })],
          { startTrackId: undefined, source: { type: 'songs', label: '随机队列', sort: 'random' } },
        ),
      );
      expect(queueState.value.playTrack).not.toHaveBeenCalled();
      expect((navigate.mock.calls.at(-1)?.[0] as CustomEvent<string> | undefined)?.detail).toBe('queue');
    } finally {
      window.removeEventListener('app:navigate:route', navigate);
    }
  });

  it('uses shared native audio levels for the hero signal visualizer', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'asio',
      audioLevels: {
        inputPeakDb: -6,
        inputRmsDb: -16,
        estimatedOutputPeakDb: -5,
        estimatedOutputRmsDb: -15,
        headroomDb: 5,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    render(<HomePage />);

    await waitForRecentPanelReady();
    const visualizer = document.querySelector('.home-signal-visualizer');

    expect(visualizer?.getAttribute('data-active')).toBe('true');
    expect(visualizer?.getAttribute('data-meter-ready')).toBe('true');
    expect(visualizer?.textContent).not.toContain('PRE-NATIVE');
    expect(visualizer?.textContent).not.toContain('ASIO');
    expect(visualizer?.textContent).not.toContain('SHARED');
    expect(document.querySelectorAll('.home-signal-bars i')).toHaveLength(48);
  });

  it('maps native visual spectrum telemetry without changing the hero visualizer shape', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      audioLevels: {
        inputPeakDb: -4,
        inputRmsDb: -14,
        estimatedOutputPeakDb: -4,
        estimatedOutputRmsDb: -14,
        visualSpectrum: spectrum24([0.9, 0.75, 0.5, 0.25, 0.12, 0.08, 0.06, 0.08, 0.14, 0.24, 0.38, 0.52]),
        visualSpectrumVersion: 2,
        visualEnergy: 0.72,
        visualTransient: 0.28,
        visualTelemetryState: 'pcm',
        headroomDb: 4,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    render(<HomePage />);

    await waitForRecentPanelReady();
    const bars = document.querySelectorAll<HTMLElement>('.home-signal-bars i');
    const firstHeight = bars[0]?.style.getPropertyValue('--home-signal-height');
    const middleHeight = bars[22]?.style.getPropertyValue('--home-signal-height');
    const firstScale = Number(bars[0]?.style.getPropertyValue('--home-signal-scale') ?? '0');
    const middleScale = Number(bars[22]?.style.getPropertyValue('--home-signal-scale') ?? '0');

    expect(bars).toHaveLength(48);
    expect(document.querySelector('.home-signal-visualizer')?.textContent).not.toContain('EXCLUSIVE');
    expect(firstHeight).not.toBe('');
    expect(middleHeight).not.toBe('');
    expect(firstHeight).not.toBe(middleHeight);
    expect(firstScale).toBeGreaterThan(middleScale);
  });

  it('uses compositor animation variables so active spectrum bars move between telemetry updates', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      audioLevels: {
        inputPeakDb: -4,
        inputRmsDb: -14,
        estimatedOutputPeakDb: -4,
        estimatedOutputRmsDb: -14,
        visualSpectrum: spectrum24([0.9, 0.75, 0.5, 0.25, 0.12, 0.08, 0.06, 0.08, 0.14, 0.24, 0.38, 0.52]),
        visualSpectrumVersion: 2,
        visualEnergy: 0.72,
        visualTransient: 0.28,
        visualTelemetryState: 'pcm',
        headroomDb: 4,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    render(<HomePage />);

    await waitForRecentPanelReady();
    const bars = document.querySelectorAll<HTMLElement>('.home-signal-bars i');
    const firstScale = Number(bars[0]?.style.getPropertyValue('--home-signal-scale') ?? '0');
    const firstMotion = Number(bars[0]?.style.getPropertyValue('--home-signal-motion') ?? '0');
    const durations = Array.from(bars)
      .slice(0, 4)
      .map((bar) => bar.style.getPropertyValue('--home-signal-duration'));

    expect(firstScale).toBeGreaterThan(0);
    expect(firstMotion).toBeGreaterThan(0);
    expect(new Set(durations).size).toBeGreaterThan(1);
  });

  it('uses visual transient telemetry to increase active bar motion', async () => {
    installLibraryMock();
    const visualSpectrum = spectrum24([0.62, 0.58, 0.46, 0.34, 0.24, 0.2, 0.18, 0.2, 0.26, 0.36, 0.48, 0.56]);
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      audioLevels: {
        inputPeakDb: -8,
        inputRmsDb: -18,
        estimatedOutputPeakDb: -8,
        estimatedOutputRmsDb: -18,
        visualSpectrum,
        visualSpectrumVersion: 2,
        visualEnergy: 0.48,
        visualTransient: 0.02,
        visualTelemetryState: 'pcm',
        headroomDb: 8,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    const view = render(<HomePage />);

    await waitForRecentPanelReady();
    const firstMotion = Number(document.querySelector<HTMLElement>('.home-signal-bars i')?.style.getPropertyValue('--home-signal-motion') ?? '0');
    sharedPlaybackState.value.audioStatus = {
      ...(sharedPlaybackState.value.audioStatus as AudioStatus),
      audioLevels: {
        ...(sharedPlaybackState.value.audioStatus as AudioStatus).audioLevels!,
        visualTransient: 0.72,
      },
    };

    view.rerender(<HomePage />);

    const nextMotion = Number(document.querySelector<HTMLElement>('.home-signal-bars i')?.style.getPropertyValue('--home-signal-motion') ?? '0');
    expect(nextMotion).toBeGreaterThan(firstMotion);
  });

  it('keeps trusted silent PCM telemetry restrained instead of drawing a fake curve', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      positionSeconds: 18,
      audioLevels: {
        inputPeakDb: null,
        inputRmsDb: null,
        estimatedOutputPeakDb: null,
        estimatedOutputRmsDb: null,
        visualSpectrum: Array.from({ length: 24 }, () => 0),
        visualSpectrumVersion: 2,
        visualEnergy: 0,
        visualTransient: 0,
        visualTelemetryState: 'pcm',
        headroomDb: null,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    render(<HomePage />);

    await waitForRecentPanelReady();
    const bars = document.querySelectorAll<HTMLElement>('.home-signal-bars i');
    const scales = Array.from(bars).map((bar) => Number(bar.style.getPropertyValue('--home-signal-scale') || '0'));
    const motions = Array.from(bars).map((bar) => Number(bar.style.getPropertyValue('--home-signal-motion') || '0'));

    expect(Math.max(...scales)).toBeLessThan(0.18);
    expect(Math.max(...motions)).toBeLessThan(0.06);
  });

  it('keeps startup priming telemetry from drawing a fake large curve', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      positionSeconds: 0.2,
      audioLevels: {
        inputPeakDb: null,
        inputRmsDb: null,
        estimatedOutputPeakDb: null,
        estimatedOutputRmsDb: null,
        visualSpectrum: Array.from({ length: 24 }, () => 0),
        visualSpectrumVersion: 2,
        visualEnergy: 0,
        visualTransient: 0,
        visualTelemetryState: 'pcm',
        headroomDb: null,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    render(<HomePage />);

    await waitForRecentPanelReady();
    const bars = document.querySelectorAll<HTMLElement>('.home-signal-bars i');
    const scales = Array.from(bars).map((bar) => Number(bar.style.getPropertyValue('--home-signal-scale') || '0'));
    const motions = Array.from(bars).map((bar) => Number(bar.style.getPropertyValue('--home-signal-motion') || '0'));

    expect(Math.max(...scales)).toBeLessThan(0.18);
    expect(Math.max(...motions)).toBeLessThan(0.06);
  });

  it('keeps signal animation timing stable when spectrum telemetry changes', async () => {
    installLibraryMock();
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      outputMode: 'exclusive',
      audioLevels: {
        inputPeakDb: -4,
        inputRmsDb: -14,
        estimatedOutputPeakDb: -4,
        estimatedOutputRmsDb: -14,
        visualSpectrum: spectrum24([0.9, 0.75, 0.5, 0.25, 0.12, 0.08, 0.06, 0.08, 0.14, 0.24, 0.38, 0.52]),
        visualSpectrumVersion: 2,
        visualEnergy: 0.72,
        visualTransient: 0.18,
        visualTelemetryState: 'pcm',
        headroomDb: 4,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    const view = render(<HomePage />);

    await waitForRecentPanelReady();
    const firstBar = document.querySelector<HTMLElement>('.home-signal-bars i');
    const firstDuration = firstBar?.style.getPropertyValue('--home-signal-duration');
    const firstScale = firstBar?.style.getPropertyValue('--home-signal-scale');
    sharedPlaybackState.value.audioStatus = {
      ...(sharedPlaybackState.value.audioStatus as AudioStatus),
      audioLevels: {
        ...(sharedPlaybackState.value.audioStatus as AudioStatus).audioLevels!,
        visualSpectrum: spectrum24([0.08, 0.12, 0.18, 0.28, 0.5, 0.8, 0.95, 0.7, 0.44, 0.24, 0.14, 0.08]),
        visualEnergy: 0.64,
        visualTransient: 0.32,
      },
    };

    view.rerender(<HomePage />);

    const nextBar = document.querySelector<HTMLElement>('.home-signal-bars i');
    expect(nextBar?.style.getPropertyValue('--home-signal-duration')).toBe(firstDuration);
    expect(nextBar?.style.getPropertyValue('--home-signal-scale')).not.toBe(firstScale);
  });

  it('keeps real spectrum bars tied to telemetry instead of the track seed', async () => {
    installLibraryMock();
    const visualSpectrum = spectrum24([0.9, 0.75, 0.5, 0.25, 0.12, 0.08, 0.06, 0.08, 0.14, 0.24, 0.38, 0.52]);
    sharedPlaybackState.value.audioStatus = {
      state: 'playing',
      currentTrackId: 'seed-a',
      outputMode: 'exclusive',
      audioLevels: {
        inputPeakDb: -4,
        inputRmsDb: -14,
        estimatedOutputPeakDb: -4,
        estimatedOutputRmsDb: -14,
        visualSpectrum,
        visualSpectrumVersion: 2,
        visualEnergy: 0.72,
        visualTransient: 0.28,
        visualTelemetryState: 'pcm',
        headroomDb: 4,
        clipCount: 0,
        lastClipAt: null,
        meterSource: 'pre_native_estimated_post_dsp',
      },
    } as AudioStatus;

    const view = render(<HomePage />);

    await waitForRecentPanelReady();
    const firstBars = Array.from(document.querySelectorAll<HTMLElement>('.home-signal-bars i')).map((bar) => ({
      duration: bar.style.getPropertyValue('--home-signal-duration'),
      motion: bar.style.getPropertyValue('--home-signal-motion'),
      scale: bar.style.getPropertyValue('--home-signal-scale'),
    }));

    sharedPlaybackState.value.audioStatus = {
      ...(sharedPlaybackState.value.audioStatus as AudioStatus),
      currentTrackId: 'seed-b',
    };

    view.rerender(<HomePage />);

    const nextBars = Array.from(document.querySelectorAll<HTMLElement>('.home-signal-bars i')).map((bar) => ({
      duration: bar.style.getPropertyValue('--home-signal-duration'),
      motion: bar.style.getPropertyValue('--home-signal-motion'),
      scale: bar.style.getPropertyValue('--home-signal-scale'),
    }));
    expect(nextBars).toEqual(firstBars);
  });

  it('refreshes only library pulse data on library changes', async () => {
    const library = installLibraryMock();
    render(<HomePage />);

    await waitForRecentPanelReady();
    vi.mocked(library.getSummary).mockClear();
    vi.mocked(library.getTracks).mockClear();
    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    vi.mocked(library.getAlbums).mockClear();
    vi.mocked(library.getSummary).mockResolvedValue(summary({ songCount: 13 }));
    vi.mocked(library.getTracks).mockResolvedValue(page([track('recent-2', { title: 'Fresh Cover' })]));
    vi.mocked(library.getAlbums).mockImplementation(async (query) =>
      query?.sort === 'recent'
        ? page([album('fresh-added-album', { title: 'Fresh Added Album', coverId: 'fresh-added-cover' })])
        : page([album('daily-refresh', { title: 'Daily Refresh Album', coverId: 'daily-refresh-cover' })]),
    );

    window.dispatchEvent(new Event('library:changed'));

    expect(await screen.findByRole('button', { name: /Fresh Added Album/ })).toBeTruthy();
    expect(library.getSummary).toHaveBeenCalledTimes(1);
    expect(library.getTracks).toHaveBeenCalledTimes(1);
    expect(library.getAlbums).toHaveBeenCalledWith({ page: 1, pageSize: 8, sort: 'recent' });
    expect(library.getPlaybackHistory).not.toHaveBeenCalled();
    expect(library.getPlaybackHistorySummary).not.toHaveBeenCalled();
    expect(library.getPlaybackStatsDashboard).not.toHaveBeenCalled();
  });

  it('refreshes recently played album cards on playback history changes', async () => {
    const library = installLibraryMock();
    vi.mocked(library.getAlbumForTrack).mockImplementation(async (trackId: string) => {
      if (trackId === 'history-new') {
        return album('played-album-new', { title: 'Fresh Played Album', albumArtist: 'Fresh Artist', coverId: 'fresh-played-cover' });
      }

      return album(`played-album-${trackId}`, { title: `Played Album ${trackId}`, coverId: `played-cover-${trackId}` });
    });

    render(<HomePage />);

    await waitForRecentPanelReady();
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(await screen.findByRole('button', { name: /Played Album history-1/ })).toBeTruthy();

    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    vi.mocked(library.getPlaybackHistory).mockResolvedValue(page([
      historyEntry('history-new', { title: 'Fresh Play', coverId: 'fresh-track-cover' }),
    ]));

    window.dispatchEvent(new Event('playback-history:changed'));

    expect(await screen.findByRole('button', { name: /Fresh Played Album/ })).toBeTruthy();
    expect(document.querySelector('.home-recent-panel .home-played-rail img')?.getAttribute('src')).toBe('echo-cover://large/fresh-played-cover');
    expect(library.getPlaybackHistory).toHaveBeenCalledWith({ page: 1, pageSize: 12, sort: 'recent' });
    expect(library.getPlaybackHistorySummary).toHaveBeenCalledTimes(1);
    expect(library.getPlaybackStatsDashboard).toHaveBeenCalledTimes(1);
  });

  it('places the currently playing album at the front of the played rail immediately', async () => {
    const currentTrack = track('current-played', {
      title: 'Current Song',
      artist: 'Current Artist',
      album: 'Current Played Album',
      albumArtist: 'Current Artist',
      coverId: 'current-track-cover',
      coverThumb: 'echo-cover://thumb/current-track-cover',
    });
    queueState.value.currentTrack = currentTrack;
    const library = installLibraryMock({
      getAlbumForTrack: vi.fn(async (trackId: string) => {
        if (trackId === 'current-played') {
          return album('current-played-album', {
            title: 'Current Played Album',
            albumArtist: 'Current Artist',
            coverId: 'current-played-cover',
          });
        }

        return album(`played-album-${trackId}`, { title: `Played Album ${trackId}`, coverId: `played-cover-${trackId}` });
      }),
    });

    render(<HomePage />);

    await screen.findAllByText(/Current Song/);
    fireEvent.click(screen.getAllByRole('tab')[0]);

    await waitFor(() =>
      expect(document.querySelector('.home-recent-panel .home-played-rail img')?.getAttribute('src')).toBe('echo-cover://large/current-played-cover'),
    );
    expect(within(document.querySelector('.home-played-rail') as HTMLElement).getByRole('button', { name: /Current Played Album/ })).toBeTruthy();
    expect(library.getAlbumForTrack).toHaveBeenCalledWith('current-played');
  });
});
