// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryPage, LibraryTrack } from '../../shared/types/library';

vi.mock('../components/library/TrackList', () => ({
  TrackList: ({
    tracks,
    currentTrackId,
    duplicateHiddenCounts,
    onPlay,
    onShowVersions,
  }: {
    tracks: LibraryTrack[];
    currentTrackId: string | null;
    duplicateHiddenCounts?: Record<string, number>;
    onPlay?: (track: LibraryTrack) => void;
    onShowVersions?: (track: LibraryTrack) => void;
  }) => (
    <div>
      <span data-testid="current-track-id">{currentTrackId ?? 'none'}</span>
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
      getFolders: vi.fn(),
      removeFolder: vi.fn(),
      scanFolder: vi.fn(),
      getScanStatus: vi.fn(),
      cancelScan: vi.fn(),
      getDiagnostics: vi.fn(),
      recordTrackPlayback: vi.fn(),
      refreshDuplicateTracks: vi.fn().mockResolvedValue({
        mode: 'strict',
        totalTracksScanned: tracks.length,
        duplicateGroups: 1,
        duplicateMembers: 2,
        hiddenTracks: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getDuplicateTrackVersions: vi.fn().mockResolvedValue([]),
      getDuplicateIndexSummary: vi.fn().mockResolvedValue({
        mode: 'strict',
        totalTracksScanned: tracks.length,
        duplicateGroups: 0,
        duplicateMembers: 0,
        hiddenTracks: 0,
        updatedAt: '',
      }),
      pruneMissingTracks: vi.fn().mockResolvedValue({ scannedCount: tracks.length, removedCount: 0 }),
      clearTracks: vi.fn().mockResolvedValue({ scannedCount: tracks.length, removedCount: tracks.length }),
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
    fireEvent.click(screen.getAllByRole('option')[11]);

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

  it('scans missing tracks from the toolbar', async () => {
    const track = makeTrack();
    installEcho([track]);

    await renderSongsPage();
    fireEvent.click(screen.getByRole('button', { name: '扫描失效歌曲' }));

    await waitFor(() => expect(window.echo.library.pruneMissingTracks).toHaveBeenCalledTimes(1));
    await screen.findByText('已扫描 1 首，没有发现失效歌曲。');
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
});
