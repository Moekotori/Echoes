// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioStatus } from '../../shared/types/audio';
import type {
  LibraryAlbum,
  LibrarySummary,
  LibraryTrack,
  PlaybackHistoryEntry,
  PlaybackHistorySummary,
  PlaybackStatsDashboard,
} from '../../shared/types/library';
import { albumDetailNavigationEvent } from '../utils/albumNavigation';
import { HomePage, resetHomePageCacheForTest } from './HomePage';

const queueState = vi.hoisted(() => ({
  value: {
    currentTrack: null,
    lastPlayedTrack: null,
    playTrack: vi.fn(),
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
  topArtists: [{ artist: 'Aimer', playCount: 4, completedCount: 3, playedSeconds: 720 }],
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
    getAlbumForTrack: vi.fn().mockResolvedValue(album('recent-album', { title: 'Album' })),
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
  sharedPlaybackState.value.audioStatus = null;
  (window as unknown as { echo?: Window['echo'] }).echo = undefined;
});

describe('HomePage', () => {
  it('shows a desktop bridge fallback instead of crashing', async () => {
    render(<HomePage />);

    expect((await screen.findByRole('alert')).textContent).toContain('桌面曲库桥接不可用');
  });

  it('loads lightweight library and listening summaries', async () => {
    const library = installLibraryMock();

    render(<HomePage />);

    expect(await screen.findByRole('button', { name: /Breeze/ })).toBeTruthy();
    expect(screen.queryByText('曲库脉冲')).toBeNull();
    expect(screen.getByRole('tab', { name: '添加于' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '已播放' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('本周回声')).toBeTruthy();
    expect(document.querySelectorAll('.home-recent-panel .home-cover-card')).toHaveLength(4);
    expect(document.querySelector('.home-recent-panel .home-cover-card img')?.getAttribute('src')).toBe('echo-cover://album/recent-cover');
    expect(screen.queryByText('Fifth Cover')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '已播放' }));
    expect(screen.getByRole('tab', { name: '已播放' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('button', { name: /Night Signal/ })).toBeTruthy();
    expect(document.querySelectorAll('.home-recent-panel .home-cover-card')).toHaveLength(4);
    expect(document.querySelector('.home-recent-panel .home-played-rail img')?.getAttribute('src')).toBe('echo-cover://album/played-cover');
    expect(library.getTracks).toHaveBeenCalledWith({ page: 1, pageSize: 8, sort: 'recent' });
    expect(library.getPlaybackHistory).toHaveBeenCalledWith({ page: 1, pageSize: 6 });
  });

  it('reuses cached home data when the page mounts again', async () => {
    const library = installLibraryMock();

    render(<HomePage />);
    expect(await screen.findByRole('button', { name: /Breeze/ })).toBeTruthy();

    vi.mocked(library.getSummary).mockClear();
    vi.mocked(library.getTracks).mockClear();
    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    cleanup();

    render(<HomePage />);

    expect(await screen.findByRole('button', { name: /Breeze/ })).toBeTruthy();
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

      const clickMetric = async (label: string): Promise<string | undefined> => {
        fireEvent.click(await screen.findByRole('button', { name: `打开${label}` }));
        return (navigate.mock.calls.at(-1)?.[0] as CustomEvent<string> | undefined)?.detail;
      };

      expect(await clickMetric('歌曲')).toBe('songs');
      expect(await clickMetric('专辑')).toBe('albums');
      expect(await clickMetric('艺术家')).toBe('artists');
      expect(await clickMetric('文件夹')).toBe('folders');
    } finally {
      window.removeEventListener('app:navigate:route', navigate);
    }
  });

  it('opens the album detail from a recent cover without starting playback', async () => {
    const library = installLibraryMock();
    const navigateAlbum = vi.fn<(event: Event) => void>();
    window.addEventListener(albumDetailNavigationEvent, navigateAlbum);

    try {
      render(<HomePage />);

      fireEvent.click(await screen.findByRole('button', { name: /Breeze/ }));

      await waitFor(() => expect(library.getAlbumForTrack).toHaveBeenCalledWith('recent-1'));
      expect(queueState.value.playTrack).not.toHaveBeenCalled();
      expect((navigateAlbum.mock.calls[0]?.[0] as CustomEvent<unknown> | undefined)?.detail).toEqual(
        expect.objectContaining({ album: expect.objectContaining({ id: 'recent-album' }) }),
      );
    } finally {
      window.removeEventListener(albumDetailNavigationEvent, navigateAlbum);
    }
  });

  it('keeps the hero continue button as the explicit playback action', async () => {
    installLibraryMock();

    render(<HomePage />);

    await screen.findByRole('button', { name: /Breeze/ });
    fireEvent.click(screen.getByRole('button', { name: /继续播放|缁х画鎾斁/ }));

    await waitFor(() => expect(queueState.value.playTrack).toHaveBeenCalledTimes(1));
    expect(queueState.value.playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recent-1', title: 'Breeze' }),
      expect.objectContaining({ source: { type: 'manual', label: 'ECHO Home' } }),
    );
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

    await screen.findByRole('button', { name: /Breeze/ });
    const visualizer = document.querySelector('.home-signal-visualizer');

    expect(visualizer?.getAttribute('data-active')).toBe('true');
    expect(visualizer?.getAttribute('data-meter-ready')).toBe('true');
    expect(visualizer?.textContent).not.toContain('PRE-NATIVE');
    expect(visualizer?.textContent).not.toContain('ASIO');
    expect(visualizer?.textContent).not.toContain('SHARED');
    expect(document.querySelectorAll('.home-signal-bars i')).toHaveLength(48);
  });

  it('refreshes only library pulse data on library changes', async () => {
    const library = installLibraryMock();
    render(<HomePage />);

    await screen.findByRole('button', { name: /Breeze/ });
    vi.mocked(library.getSummary).mockClear();
    vi.mocked(library.getTracks).mockClear();
    vi.mocked(library.getPlaybackHistory).mockClear();
    vi.mocked(library.getPlaybackHistorySummary).mockClear();
    vi.mocked(library.getPlaybackStatsDashboard).mockClear();
    vi.mocked(library.getSummary).mockResolvedValue(summary({ songCount: 13 }));
    vi.mocked(library.getTracks).mockResolvedValue(page([track('recent-2', { title: 'Fresh Cover' })]));

    window.dispatchEvent(new Event('library:changed'));

    expect(await screen.findByRole('button', { name: /Fresh Cover/ })).toBeTruthy();
    expect(library.getSummary).toHaveBeenCalledTimes(1);
    expect(library.getTracks).toHaveBeenCalledTimes(1);
    expect(library.getPlaybackHistory).not.toHaveBeenCalled();
    expect(library.getPlaybackHistorySummary).not.toHaveBeenCalled();
    expect(library.getPlaybackStatsDashboard).not.toHaveBeenCalled();
  });
});
