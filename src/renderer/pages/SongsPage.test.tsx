// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryPage, LibraryTrack } from '../../shared/types/library';
import {
  createSongsFirstPageSnapshotQueryKey,
  readSongsStartupLoadDiagnostics,
  writeSongsFirstPageSnapshot,
} from '../stores/songsFirstPageSnapshot';

vi.mock('../components/library/TrackList', () => ({
  TrackList: ({
    tracks,
    currentTrackId,
    canLoadMore,
    duplicateHiddenCounts,
    isLoadingMore,
    loadedCount,
    onEndReached,
    onPlay,
    onShowVersions,
    onVisibleTrackIdsChange,
    totalCount,
  }: {
    tracks: LibraryTrack[];
    currentTrackId: string | null;
    canLoadMore?: boolean;
    duplicateHiddenCounts?: Record<string, number>;
    isLoadingMore?: boolean;
    loadedCount?: number;
    onEndReached?: () => void;
    onPlay?: (track: LibraryTrack) => void;
    onShowVersions?: (track: LibraryTrack) => void;
    onVisibleTrackIdsChange?: (trackIds: string[]) => void;
    totalCount?: number;
  }) => (
    <div
      data-testid="track-list"
      data-total-count={totalCount ?? tracks.length}
      data-loaded-count={loadedCount ?? tracks.length}
      data-loading-more={String(isLoadingMore)}
      data-visible-ids={tracks.slice(0, 2).map((track) => track.id).join(',')}
    >
      <button type="button" onClick={() => onVisibleTrackIdsChange?.(tracks.slice(0, 2).map((track) => track.id))}>
        mock-visible
      </button>
      <span data-testid="current-track-id">{currentTrackId ?? 'none'}</span>
      <button type="button" disabled={!canLoadMore} onClick={onEndReached}>
        mock-load-more
      </button>
      {tracks.map((track) => (
        <div key={track.id}>
          <button type="button" onClick={() => onPlay?.(track)}>
            {track.title}
          </button>
          {duplicateHiddenCounts?.[track.id] ? (
            <button type="button" onClick={() => onShowVersions?.(track)}>
              有 {duplicateHiddenCounts[track.id] + 1} 个版本
            </button>
          ) : null}
        </div>
      ))}
    </div>
  ),
}));

const renderSongsPage = async (): Promise<void> => {
  const { SongsPage } = await import('./SongsPage');
  const { PlaybackQueueProvider } = await import('../stores/PlaybackQueueProvider');
  render(
    <PlaybackQueueProvider>
      <SongsPage />
    </PlaybackQueueProvider>,
  );
};

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Song.flac',
  title: 'Song One',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
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
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const makePage = (items: LibraryTrack[]): LibraryPage<LibraryTrack> => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  hasMore: false,
});

const makePagedResult = (items: LibraryTrack[], overrides: Partial<LibraryPage<LibraryTrack>> = {}): LibraryPage<LibraryTrack> => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  hasMore: false,
  ...overrides,
});

const installEcho = (tracks: LibraryTrack[] = []) => {
  const playLocalFile = vi.fn().mockImplementation(({ filePath, trackId }: { filePath: string; trackId?: string }) =>
    Promise.resolve({
      state: 'playing',
      currentTrackId: trackId ?? tracks[0]?.id ?? null,
      positionMs: 0,
      durationMs: 180000,
      filePath,
    }),
  );

  window.echo = {
    library: {
      getTracks: vi.fn().mockResolvedValue(makePage(tracks)),
      getAlbums: vi.fn(),
      getAlbumTracks: vi.fn(),
      getSummary: vi.fn(),
      chooseFolder: vi.fn(),
      addFolder: vi.fn(),
      getFolders: vi.fn().mockResolvedValue([]),
      removeFolder: vi.fn(),
      scanFolder: vi.fn(),
      getScanStatus: vi.fn(),
      cancelScan: vi.fn(),
      getDiagnostics: vi.fn(),
      recordTrackPlayback: vi.fn(),
      refreshAlbumGrouping: vi.fn(),
      refreshDuplicateTracks: vi.fn().mockResolvedValue({
        mode: 'strict',
        totalTracksScanned: tracks.length,
        duplicateGroups: 1,
        duplicateMembers: 2,
        hiddenTracks: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getDuplicateTrackVersions: vi.fn().mockResolvedValue([]),
      getDuplicateHiddenCounts: vi.fn().mockResolvedValue({}),
      getDuplicateIndexSummary: vi.fn().mockResolvedValue({
        mode: 'strict',
        totalTracksScanned: tracks.length,
        duplicateGroups: 0,
        duplicateMembers: 0,
        hiddenTracks: 0,
        updatedAt: '',
      }),
      getLikedTrackIds: vi.fn().mockResolvedValue({}),
      pruneInvalidTracks: vi.fn().mockResolvedValue({
        scannedCount: tracks.length,
        removedCount: 0,
        missingRemovedCount: 0,
        shortRemovedCount: 0,
        shortDurationThresholdSeconds: 5,
      }),
      pruneMissingTracks: vi.fn().mockResolvedValue({ scannedCount: tracks.length, removedCount: 0 }),
      clearTracks: vi.fn().mockResolvedValue({ scannedCount: tracks.length, removedCount: tracks.length }),
      clearCache: vi.fn(),
      startBpmAnalysis: vi.fn(),
    },
    playback: {
      getStatus: vi.fn().mockResolvedValue({
        state: 'idle',
        currentTrackId: null,
        positionMs: 0,
        durationMs: 0,
        filePath: null,
      }),
      playLocalFile,
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      openLocalAudioFile: vi.fn(),
    },
    app: {
      getVersion: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        duplicateTracksEnabled: false,
        duplicateTracksMode: 'strict',
        playbackFollowCurrentTrack: false,
      }),
      setSettings: vi.fn().mockResolvedValue({
        duplicateTracksEnabled: true,
        duplicateTracksMode: 'strict',
      }),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
    },
    audio: {
      getStatus: vi.fn(),
      listDevices: vi.fn(),
      setOutput: vi.fn(),
    },
  } as unknown as Window['echo'];

  return { playLocalFile };
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('SongsPage', () => {
  it('renders a renderer first-page snapshot before SQLite returns the fresh page', async () => {
    const cachedTrack = makeTrack({ id: 'cached-track', title: 'Cached Song' });
    const freshTrack = makeTrack({ id: 'fresh-track', title: 'Fresh Song' });
    installEcho();
    const queryKey = createSongsFirstPageSnapshotQueryKey({
      pageSize: 100,
      search: '',
      sort: 'default',
      hideDuplicates: false,
      duplicateMode: 'strict',
    });
    writeSongsFirstPageSnapshot(queryKey, makePagedResult([cachedTrack], { total: 10000, hasMore: true }));

    let resolveTracks!: (page: LibraryPage<LibraryTrack>) => void;
    vi.mocked(window.echo.library.getTracks).mockReturnValue(
      new Promise<LibraryPage<LibraryTrack>>((resolve) => {
        resolveTracks = resolve;
      }),
    );

    await renderSongsPage();

    expect(screen.getByText('Cached Song')).toBeTruthy();
    expect(screen.getByTestId('track-list').getAttribute('data-total-count')).toBe('10000');

    await waitFor(() =>
      expect(readSongsStartupLoadDiagnostics()).toMatchObject({
        source: 'renderer-snapshot',
        itemCount: 1,
        total: 10000,
      }),
    );

    resolveTracks(makePagedResult([freshTrack], { total: 1 }));

    await screen.findByText('Fresh Song');
    expect(screen.queryByText('Cached Song')).toBeNull();
    const diagnostics = readSongsStartupLoadDiagnostics();
    expect(diagnostics?.source).toBe('renderer-snapshot');
    expect(diagnostics?.sqliteQueryMs).toEqual(expect.any(Number));
    expect(diagnostics?.total).toBe(1);
  });

  it('does not scan or start heavy library jobs while loading the startup song list', async () => {
    installEcho([makeTrack()]);

    await renderSongsPage();

    await screen.findByText('Song One');
    expect(window.echo.library.scanFolder).not.toHaveBeenCalled();
    expect(window.echo.library.refreshAlbumGrouping).not.toHaveBeenCalled();
    expect(window.echo.library.startBpmAnalysis).not.toHaveBeenCalled();
  });

  it('restores the remembered song sort mode', async () => {
    window.localStorage.setItem('echo-next.songs.sort', 'recent');
    installEcho([makeTrack()]);

    await renderSongsPage();

    await waitFor(() =>
      expect(window.echo.library.getTracks).toHaveBeenCalledWith(expect.objectContaining({ sort: 'recent' })),
    );
  });

  it('remembers the selected song sort mode', async () => {
    installEcho([makeTrack()]);

    await renderSongsPage();
    fireEvent.click(screen.getByRole('button', { name: /默认排序/ }));
    fireEvent.click(screen.getByRole('option', { name: '按艺术家' }));

    await waitFor(() => expect(window.localStorage.getItem('echo-next.songs.sort')).toBe('artist'));
    await waitFor(() =>
      expect(window.echo.library.getTracks).toHaveBeenCalledWith(expect.objectContaining({ sort: 'artist' })),
    );
  });

  it('dispatches navigation from the import folder button', async () => {
    installEcho();
    const navigate = vi.fn();
    window.addEventListener('app:navigate:import-folder', navigate);

    await renderSongsPage();
    fireEvent.click(screen.getByRole('button', { name: '导入文件夹' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    window.removeEventListener('app:navigate:import-folder', navigate);
  });

  it('plays a local file from TrackRow and exposes queue currentTrackId to TrackList', async () => {
    const track = makeTrack();
    const { playLocalFile } = installEcho([track]);

    await renderSongsPage();

    await screen.findByText('Song One');
    expect(screen.getByTestId('current-track-id').textContent).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'Song One' }));

    await waitFor(() =>
      expect(playLocalFile).toHaveBeenCalledWith({
        filePath: track.path,
        trackId: track.id,
        probe: {
          durationSeconds: track.duration,
          fileSampleRate: track.sampleRate,
          channels: 2,
          codec: track.codec,
          bitDepth: track.bitDepth,
          bitrate: track.bitrate,
        },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('current-track-id').textContent).toBe('track-1'));
  });

  it('maintains the library from the toolbar without blocking on the renderer', async () => {
    const track = makeTrack();
    installEcho([track]);
    vi.mocked(window.echo.library.pruneInvalidTracks).mockResolvedValue({
      scannedCount: 1,
      removedCount: 1,
      missingRemovedCount: 0,
      shortRemovedCount: 1,
      shortDurationThresholdSeconds: 5,
    });
    vi.mocked(window.echo.library.getFolders).mockResolvedValue([
      {
        id: 'folder-1',
        path: 'D:/Music',
        name: 'Music',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    vi.mocked(window.echo.library.scanFolder).mockResolvedValue({
      id: 'scan-1',
      folderId: 'folder-1',
      status: 'completed',
      phase: 'finished',
      totalFiles: 1,
      processedFiles: 1,
      skippedFiles: 1,
      addedTracks: 0,
      updatedTracks: 0,
      removedTracks: 0,
      coverCount: 0,
      errorCount: 0,
      errors: [],
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
    });

    await renderSongsPage();
    fireEvent.click(screen.getByRole('button', { name: '扫描失效歌曲、短音频并增量扫描' }));

    await waitFor(() => expect(window.echo.library.pruneInvalidTracks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.echo.library.scanFolder).toHaveBeenCalledWith('folder-1'));
    await screen.findByText('维护完成：检查 1 首，移除失效 0 首，移除 5 秒及以下短音频 1 首，增量扫描 1 个文件夹。');
  });

  it('confirms before clearing the song list', async () => {
    const track = makeTrack();
    installEcho([track]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderSongsPage();
    await screen.findByText('Song One');
    fireEvent.click(screen.getByRole('button', { name: '清空列表' }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('清空歌曲列表？\n这会从列表移除 1 首歌曲，不会删除本地音乐文件。'));
    await waitFor(() => expect(window.echo.library.clearTracks).toHaveBeenCalledTimes(1));
  });

  it('passes the full library total to TrackList after the first page loads', async () => {
    const firstPageTracks = Array.from({ length: 100 }, (_, index) => makeTrack({ id: `track-${index + 1}`, title: `Song ${index + 1}` }));
    installEcho();
    vi.mocked(window.echo.library.getTracks).mockResolvedValue(makePagedResult(firstPageTracks, { total: 10000, hasMore: true }));

    await renderSongsPage();

    await waitFor(() => expect(screen.getByTestId('track-list').getAttribute('data-total-count')).toBe('10000'));
    expect(screen.getByTestId('track-list').getAttribute('data-loaded-count')).toBe('100');
  });

  it('loads duplicate badges only for visible song rows', async () => {
    const tracks = Array.from({ length: 5 }, (_, index) => makeTrack({ id: `track-${index + 1}`, title: `Song ${index + 1}` }));
    installEcho(tracks);

    await renderSongsPage();
    await screen.findByText('Song 1');
    fireEvent.click(screen.getByRole('button', { name: 'mock-visible' }));

    await waitFor(() => expect(window.echo.library.getDuplicateHiddenCounts).toHaveBeenCalledWith(['track-1', 'track-2'], 'strict'));
    expect(window.echo.library.getDuplicateTrackVersions).not.toHaveBeenCalled();
  });

  it('keeps TrackList totalCount stable when appending the second song page', async () => {
    const firstPageTracks = Array.from({ length: 100 }, (_, index) => makeTrack({ id: `track-${index + 1}`, title: `Song ${index + 1}` }));
    const secondPageTracks = Array.from({ length: 100 }, (_, index) => makeTrack({ id: `track-${index + 101}`, title: `Song ${index + 101}` }));
    installEcho();
    vi.mocked(window.echo.library.getTracks)
      .mockResolvedValueOnce(makePagedResult(firstPageTracks, { page: 1, total: 10000, hasMore: true }))
      .mockResolvedValueOnce(makePagedResult(secondPageTracks, { page: 2, total: 10000, hasMore: true }));

    await renderSongsPage();
    await waitFor(() => expect(screen.getByTestId('track-list').getAttribute('data-loaded-count')).toBe('100'));

    fireEvent.click(screen.getByRole('button', { name: 'mock-load-more' }));

    await waitFor(() => expect(screen.getByTestId('track-list').getAttribute('data-loaded-count')).toBe('200'));
    expect(screen.getByTestId('track-list').getAttribute('data-total-count')).toBe('10000');
    expect(window.echo.library.getTracks).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    expect(window.echo.library.getDuplicateTrackVersions).not.toHaveBeenCalled();
  });

  it('closes the duplicate version panel when clicking the overlay outside the panel', async () => {
    const track = makeTrack();
    const hiddenTrack = makeTrack({ id: 'track-2', path: 'D:\\Music\\Song Copy.flac' });
    installEcho([track]);
    vi.mocked(window.echo.library.getDuplicateHiddenCounts).mockResolvedValue({ [track.id]: 1 });
    vi.mocked(window.echo.library.getDuplicateTrackVersions).mockResolvedValue([
      { groupId: 'group-1', track, qualityScore: 100, rank: 1, hidden: false, reasons: [] },
      { groupId: 'group-1', track: hiddenTrack, qualityScore: 80, rank: 2, hidden: true, reasons: [] },
    ]);

    await renderSongsPage();
    await screen.findByText('Song One');
    fireEvent.click(screen.getByRole('button', { name: 'mock-visible' }));

    fireEvent.click(await screen.findByRole('button', { name: /版本/ }));
    const dialog = await screen.findByRole('dialog', { name: '重复歌曲版本' });

    fireEvent.click(screen.getByText('Duplicate Track Merge View'));
    expect(screen.queryByRole('dialog', { name: '重复歌曲版本' })).not.toBeNull();

    fireEvent.click(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '重复歌曲版本' })).toBeNull());
  });
});
