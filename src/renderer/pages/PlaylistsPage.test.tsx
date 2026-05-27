// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DragEvent } from 'react';
import type { DownloadJob } from '../../shared/types/downloads';
import type { LibraryPage, LibraryPlaylist, LibraryPlaylistItem, LibraryTrack } from '../../shared/types/library';
import { PlaybackQueueProvider } from '../stores/PlaybackQueueProvider';
import { PlaylistsPage } from './PlaylistsPage';

vi.mock('../components/library/TrackList', () => ({
  TrackList: ({
    tracks,
    isTrackDraggable,
    onTrackDragEnd,
    onTrackDragOver,
    onTrackDragStart,
    onTrackDrop,
    onOpenTrackMenu,
    onPlay,
    onToggleLiked,
  }: {
    tracks: LibraryTrack[];
    isTrackDraggable?: (track: LibraryTrack) => boolean;
    onTrackDragEnd?: (event: DragEvent<HTMLDivElement>, track: LibraryTrack) => void;
    onTrackDragOver?: (event: DragEvent<HTMLDivElement>, track: LibraryTrack) => void;
    onTrackDragStart?: (event: DragEvent<HTMLDivElement>, track: LibraryTrack) => void;
    onTrackDrop?: (event: DragEvent<HTMLDivElement>, track: LibraryTrack) => void;
    onOpenTrackMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
    onPlay?: (track: LibraryTrack) => void;
    onToggleLiked?: (track: LibraryTrack) => void;
  }) => (
    <div data-testid="playlist-track-list">
      {tracks.map((track) => (
        <div
          data-testid={`playlist-track-row-${track.playlistItemId ?? track.id}`}
          draggable={isTrackDraggable?.(track) ?? false}
          key={track.playlistItemId ?? track.id}
          onDragEnd={(event) => onTrackDragEnd?.(event, track)}
          onDragOver={(event) => onTrackDragOver?.(event, track)}
          onDragStart={(event) => onTrackDragStart?.(event, track)}
          onDrop={(event) => onTrackDrop?.(event, track)}
        >
          <button type="button" onClick={() => onPlay?.(track)}>
            {track.title}
          </button>
          <button type="button" onClick={() => onToggleLiked?.(track)}>
            Like {track.title}
          </button>
          <button type="button" onClick={() => onOpenTrackMenu?.(track, { x: 12, y: 34 })}>
            Open menu for {track.title}
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../components/library/TrackContextMenu', () => ({
  TrackContextMenu: ({
    onAction,
    track,
  }: {
    onAction: (action: 'show-in-folder' | 'copy-path' | 'open-system', track: LibraryTrack) => void;
    track: LibraryTrack;
  }) => (
    <div role="menu">
      <button type="button" onClick={() => onAction('show-in-folder', track)}>
        Show in folder
      </button>
      <button type="button" onClick={() => onAction('copy-path', track)}>
        Copy path
      </button>
      <button type="button" onClick={() => onAction('open-system', track)}>
        Open with system
      </button>
    </div>
  ),
}));

const playlist = (overrides: Partial<LibraryPlaylist> = {}): LibraryPlaylist => ({
  id: 'playlist-1',
  name: 'Road Mix',
  description: 'Manual local playlist',
  kind: 'manual',
  sourceProvider: 'local',
  sourcePlaylistId: null,
  coverId: null,
  coverThumb: null,
  sortMode: 'manual',
  itemCount: 1,
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
  ...overrides,
});

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Song.flac',
  title: 'Song One',
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
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...overrides,
});

const item = (overrides: Partial<LibraryPlaylistItem> = {}): LibraryPlaylistItem => ({
  id: 'item-1',
  playlistId: 'playlist-1',
  mediaType: 'track',
  mediaId: 'track-1',
  sourceProvider: 'local',
  sourceItemId: null,
  titleSnapshot: 'Song One',
  artistSnapshot: 'Artist',
  albumSnapshot: 'Album',
  durationSnapshot: 180,
  coverId: null,
  coverThumb: null,
  position: 0,
  addedAt: '2026-05-14T00:00:00.000Z',
  addedFrom: 'manual',
  unavailable: false,
  track: track(),
  ...overrides,
});

const page = (items: LibraryPlaylistItem[]): LibraryPage<LibraryPlaylistItem> => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  hasMore: false,
});

const downloadJob = (overrides: Partial<DownloadJob> = {}): DownloadJob => ({
  id: 'job-1',
  sourceUrl: 'https://cdn.example/song.mp3',
  provider: 'unknown' as const,
  audioStrategy: 'best_available' as const,
  status: 'queued' as const,
  title: 'Remote Song',
  durationSeconds: null,
  thumbnailUrl: null,
  webpageUrl: null,
  outputPath: null,
  downloadedBytes: null,
  totalBytes: null,
  speedBytesPerSecond: null,
  etaSeconds: null,
  importedTrackId: null,
  progress: 0,
  error: null,
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:00.000Z',
  completedAt: null,
  ...overrides,
});

const dragDataTransfer = () => {
  const data = new Map<string, string>();
  return {
    dropEffect: '',
    effectAllowed: '',
    getData: vi.fn((type: string) => data.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  };
};

const renderPlaylistsPage = () =>
  render(
    <PlaybackQueueProvider>
      <PlaylistsPage />
    </PlaybackQueueProvider>,
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('PlaylistsPage actions menu', () => {
  it('renames the selected playlist from the menu', async () => {
    const renamed = playlist({ name: 'Road Mix 2' });
    window.prompt = vi.fn(() => 'Road Mix 2');
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValueOnce([playlist()]).mockResolvedValue([renamed]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([item()])),
        updatePlaylist: vi.fn().mockResolvedValue(renamed),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名歌单' }));

    await waitFor(() =>
      expect(window.echo.library.updatePlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', name: 'Road Mix 2' }),
    );
    expect(await screen.findByText('歌单已重命名')).toBeTruthy();
  });

  it('updates sort mode and exports the playlist from the menu', async () => {
    const sorted = playlist({ sortMode: 'titleAsc' });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValueOnce([playlist()]).mockResolvedValue([sorted]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([item()])),
        updatePlaylist: vi.fn().mockResolvedValue(sorted),
        exportPlaylist: vi.fn().mockResolvedValue('D:\\Exports\\Road Mix.json'),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '歌名 A-Z' }));
    await waitFor(() =>
      expect(window.echo.library.updatePlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', sortMode: 'titleAsc' }),
    );
    expect(await screen.findByText('排序方式已更新')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '更多歌单操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'JSON' }));

    await waitFor(() =>
      expect(window.echo.library.exportPlaylist).toHaveBeenCalledWith({ playlistId: 'playlist-1', format: 'json' }),
    );
    expect(await screen.findByText('歌单已导出：D:\\Exports\\Road Mix.json')).toBeTruthy();
  });

  it('shows streaming quality only for remote playlists and sends the selected quality to playback', async () => {
    const remoteTrackItem = item({
      mediaType: 'stream_track',
      mediaId: 'streaming:qqmusic:song-mid',
      sourceProvider: 'qqmusic',
      sourceItemId: 'song-mid',
      titleSnapshot: 'Remote Song',
      track: null,
    });
    const playMediaItem = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: 'streaming:qqmusic:song-mid',
      positionMs: 0,
      durationMs: 180000,
      filePath: null,
    });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ sourceProvider: 'qqmusic', sourcePlaylistId: '123' })]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([remoteTrackItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        startPlaybackHistory: vi.fn().mockResolvedValue({ historyId: 'history-1' }),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
        playMediaItem,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    const qualityButton = await screen.findByRole('button', { name: 'Streaming quality' });
    expect(qualityButton.textContent).toContain('Hi-Res');

    fireEvent.click(await screen.findByRole('button', { name: 'Remote Song' }));
    await waitFor(() =>
      expect(playMediaItem).toHaveBeenCalledWith(expect.objectContaining({
        item: expect.objectContaining({
          mediaType: 'streaming',
          provider: 'qqmusic',
          providerTrackId: 'song-mid',
          quality: 'hires',
        }),
      })),
    );

    fireEvent.click(qualityButton);
    fireEvent.click(screen.getByRole('option', { name: 'Standard' }));
    expect(qualityButton.textContent).toContain('Standard');
    fireEvent.click(screen.getByRole('button', { name: 'Remote Song' }));
    await waitFor(() =>
      expect(playMediaItem).toHaveBeenLastCalledWith(expect.objectContaining({
        item: expect.objectContaining({
          quality: 'standard',
        }),
      })),
    );
  });

  it('sends selected quality when remote playlist items include cached track details', async () => {
    const remoteTrackItem = item({
      mediaType: 'stream_track',
      mediaId: 'streaming:netease:123',
      sourceProvider: 'netease',
      sourceItemId: '123',
      titleSnapshot: 'NetEase Song',
      track: track({
        id: 'streaming:netease:123',
        mediaType: 'streaming',
        path: 'streaming:netease:123',
        provider: 'netease',
        providerTrackId: '123',
        stableKey: 'streaming:netease:123',
        title: 'NetEase Song',
        codec: null,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
      }),
    });
    const playMediaItem = vi.fn().mockResolvedValue({
      state: 'playing',
      currentTrackId: 'streaming:netease:123',
      positionMs: 0,
      durationMs: 180000,
      filePath: null,
    });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ sourceProvider: 'netease', sourcePlaylistId: '163289102' })]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([remoteTrackItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        startPlaybackHistory: vi.fn().mockResolvedValue({ historyId: 'history-1' }),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
        playMediaItem,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: 'NetEase Song' }));
    await waitFor(() =>
      expect(playMediaItem).toHaveBeenCalledWith(expect.objectContaining({
        item: expect.objectContaining({
          mediaType: 'streaming',
          provider: 'netease',
          providerTrackId: '123',
          quality: 'hires',
        }),
      })),
    );
  });

  it('hides streaming quality for local playlists', async () => {
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist()]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([item()])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    await screen.findByRole('button', { name: 'Song One' });
    expect(screen.queryByRole('button', { name: 'Streaming quality' })).toBeNull();
  });

  it('starts playlist playback from the primary action and lets the user exit it', async () => {
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 180000,
        filePath: request.filePath,
      }),
    );
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist()]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([item()])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
        playLocalFile,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: '播放歌单' }));

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: 'track-1' })));
    expect(await screen.findByText('正在按歌单顺序播放：Road Mix')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '退出歌单播放' }));

    expect(await screen.findByText('已退出歌单播放，恢复原队列')).toBeTruthy();
  });

  it('saves manual order changes for local playlists after dragging rows', async () => {
    const firstItem = item();
    const secondItem = item({
      id: 'item-2',
      mediaId: 'track-2',
      titleSnapshot: 'Song Two',
      position: 1,
      track: track({ id: 'track-2', title: 'Song Two' }),
    });
    const movePlaylistItem = vi.fn().mockResolvedValue(undefined);
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ itemCount: 2 })]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([firstItem, secondItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        movePlaylistItem,
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    const firstRow = await screen.findByTestId('playlist-track-row-item-1');
    const secondRow = await screen.findByTestId('playlist-track-row-item-2');
    expect(firstRow).toHaveProperty('draggable', true);

    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });

    await waitFor(() => expect(movePlaylistItem).toHaveBeenCalledWith('playlist-1', 'item-1', 1));
    expect(await screen.findByText('歌单顺序已保存')).toBeTruthy();
  });

  it('keeps remote playlists out of manual drag sorting', async () => {
    const remoteTrackItem = item({
      mediaType: 'stream_track',
      mediaId: 'streaming:netease:123',
      sourceProvider: 'netease',
      sourceItemId: '123',
      titleSnapshot: 'NetEase Song',
      track: null,
    });
    const movePlaylistItem = vi.fn().mockResolvedValue(undefined);
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ sourceProvider: 'netease', sourcePlaylistId: '123' })]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([remoteTrackItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        movePlaylistItem,
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    const remoteRow = await screen.findByTestId('playlist-track-row-item-1');
    expect(remoteRow).toHaveProperty('draggable', false);

    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(remoteRow, { dataTransfer });
    fireEvent.drop(remoteRow, { dataTransfer });

    expect(movePlaylistItem).not.toHaveBeenCalled();
  });

  it('adds selected local audio files to the current local playlist', async () => {
    const emptyPage = page([]);
    const addedItem = item({ id: 'item-added', mediaId: 'track-added', track: track({ id: 'track-added', title: 'Added Song' }) });
    const chooseImportFiles = vi.fn().mockResolvedValue(['D:\\Music\\Added Song.flac', 'D:\\Maps\\Beatmap.osz']);
    const addLocalAudioFilesToPlaylist = vi.fn().mockResolvedValue({
      importedCount: 2,
      addedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      trackIds: ['track-added', 'track-osu'],
      items: [addedItem],
    });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ itemCount: 0 })]),
        getPlaylistItems: vi.fn().mockResolvedValueOnce(emptyPage).mockResolvedValue(page([addedItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        chooseImportFiles,
        addLocalAudioFilesToPlaylist,
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: '添加本地歌曲' }));

    await waitFor(() => expect(chooseImportFiles).toHaveBeenCalled());
    await waitFor(() =>
      expect(addLocalAudioFilesToPlaylist).toHaveBeenCalledWith('playlist-1', ['D:\\Music\\Added Song.flac', 'D:\\Maps\\Beatmap.osz']),
    );
    expect(await screen.findByText('已添加 2 首本地歌曲')).toBeTruthy();
  });

  it('likes NetEase and QQ streaming playlist tracks through the provider bridge', async () => {
    const remoteTrackItem = item({
      mediaType: 'stream_track',
      mediaId: 'streaming:netease:1983779468',
      sourceProvider: 'netease',
      sourceItemId: '1983779468',
      titleSnapshot: 'Remote Like Song',
      track: null,
    });
    const toggleTrackLiked = vi.fn();
    const setTrackLiked = vi.fn().mockResolvedValue({ liked: true });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist({ sourceProvider: 'netease', sourcePlaylistId: 'daily-recommend' })]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([remoteTrackItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({ 'streaming:netease:1983779468': false }),
        toggleTrackLiked,
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
      streaming: {
        setTrackLiked,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Like Remote Like Song' }));

    await waitFor(() =>
      expect(setTrackLiked).toHaveBeenCalledWith({
        provider: 'netease',
        providerTrackId: '1983779468',
        liked: true,
      }),
    );
    expect(toggleTrackLiked).not.toHaveBeenCalled();
  });

  it('runs local file actions from the track context menu', async () => {
    const openTrackInFolder = vi.fn().mockResolvedValue(undefined);
    const copyTrackPath = vi.fn().mockResolvedValue(undefined);
    const openTrackWithSystem = vi.fn().mockResolvedValue(undefined);
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([playlist()]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([item()])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
        openTrackInFolder,
        copyTrackPath,
        openTrackWithSystem,
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open menu for Song One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show in folder' }));
    await waitFor(() => expect(openTrackInFolder).toHaveBeenCalledWith('track-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Open menu for Song One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }));
    await waitFor(() => expect(copyTrackPath).toHaveBeenCalledWith('track-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Open menu for Song One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open with system' }));
    await waitFor(() => expect(openTrackWithSystem).toHaveBeenCalledWith('track-1'));
  });

  it('refreshes a remote playlist by re-importing its source playlist', async () => {
    const remotePlaylist = playlist({
      sourceProvider: 'qqmusic',
      sourcePlaylistId: '778899',
      name: 'QQ Mix',
    });
    const importPlaylistFromUrl = vi.fn().mockResolvedValue({
      playlistId: 'playlist-1',
      playlistName: 'QQ Mix',
      importedCount: 2,
      provider: 'qqmusic',
      providerPlaylistId: '778899',
    });
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([remotePlaylist]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([
          item({
            mediaType: 'stream_track',
            mediaId: 'streaming:qqmusic:song-mid',
            sourceProvider: 'qqmusic',
            sourceItemId: 'song-mid',
            titleSnapshot: 'Untitled',
            track: null,
          }),
        ])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
      streaming: {
        importPlaylistFromUrl,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    fireEvent.click(await screen.findByRole('button', { name: '刷新歌单' }));

    await waitFor(() =>
      expect(importPlaylistFromUrl).toHaveBeenCalledWith('https://y.qq.com/n/ryqq/playlist/778899'),
    );
    expect(await screen.findByText('已刷新歌单：QQ Mix，共 2 首')).toBeTruthy();
  });

  it('imports Spotify playlist links from the sidebar form', async () => {
    const spotifyUrl = 'https://open.spotify.com/playlist/5MFN2Ep3ZU2FIQWIXNSLrT?si=866d26088e4a4a47';
    const importedPlaylist = playlist({
      id: 'spotify-playlist',
      sourceProvider: 'spotify',
      sourcePlaylistId: '5MFN2Ep3ZU2FIQWIXNSLrT',
      name: 'Spotify Mix',
      itemCount: 1,
    });
    const importedItem = item({
      id: 'spotify-item-1',
      playlistId: 'spotify-playlist',
      mediaType: 'stream_track',
      mediaId: 'streaming:spotify:track-1',
      sourceProvider: 'spotify',
      sourceItemId: 'track-1',
      titleSnapshot: 'Spotify Song',
      artistSnapshot: 'Spotify Artist',
      track: null,
    });
    const importPlaylistFromUrl = vi.fn().mockResolvedValue({
      playlistId: 'spotify-playlist',
      playlistName: 'Spotify Mix',
      importedCount: 1,
      provider: 'spotify',
      providerPlaylistId: '5MFN2Ep3ZU2FIQWIXNSLrT',
    });
    const getPlaylistItems = vi.fn(async (playlistId: string) =>
      page(playlistId === 'spotify-playlist' ? [importedItem] : []),
    );
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValueOnce([playlist({ itemCount: 0 })]).mockResolvedValue([importedPlaylist]),
        getPlaylistItems,
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
      streaming: {
        importPlaylistFromUrl,
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    const input = await screen.findByPlaceholderText('粘贴网易云 / QQ 音乐 / Spotify 歌单链接');
    fireEvent.change(input, { target: { value: spotifyUrl } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(importPlaylistFromUrl).toHaveBeenCalledWith(spotifyUrl));
    expect(await screen.findByText('已添加歌单：Spotify Mix，共 1 首')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Spotify Song' })).toBeTruthy();
  });

  it('queues a remote playlist download in playlist order and uses the playlist folder', async () => {
    const remotePlaylist = playlist({
      sourceProvider: 'netease',
      sourcePlaylistId: 'playlist-123',
      name: 'Daily Mix',
      itemCount: 2,
    });
    const firstItem = item({
      id: 'item-1',
      mediaType: 'stream_track',
      mediaId: 'streaming:netease:track-1',
      sourceProvider: 'netease',
      sourceItemId: 'track-1',
      titleSnapshot: 'First Remote',
      artistSnapshot: 'Artist A',
      track: null,
      position: 0,
    });
    const secondItem = item({
      id: 'item-2',
      mediaType: 'stream_track',
      mediaId: 'streaming:netease:track-2',
      sourceProvider: 'netease',
      sourceItemId: 'track-2',
      titleSnapshot: 'Second Remote',
      artistSnapshot: 'Artist B',
      track: null,
      position: 1,
    });
    const resolvePlayback = vi.fn(async ({ providerTrackId }: { providerTrackId: string }) => ({
      url: `https://cdn.example/${providerTrackId}.mp3`,
      headers: { Referer: 'https://music.163.com/' },
      mimeType: 'audio/mpeg',
      codec: 'mp3',
      downloadAuthorizationToken: `download-token-${providerTrackId}`,
    }));
    const createUrlJob = vi.fn(async (url: string, options: Record<string, unknown>) =>
      downloadJob({
        id: `job-${String(options.streamingProviderTrackId)}`,
        sourceUrl: url,
        title: String(options.title),
      }),
    );
    window.echo = {
      library: {
        getPlaylists: vi.fn().mockResolvedValue([remotePlaylist]),
        getPlaylistItems: vi.fn().mockResolvedValue(page([firstItem, secondItem])),
        getLikedTrackIds: vi.fn().mockResolvedValue({}),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ state: 'idle', currentTrackId: null, positionMs: 0, durationMs: 0, filePath: null }),
      },
      app: {
        getSettings: vi.fn().mockResolvedValue({ downloadsFeatureUnlocked: true }),
      },
      streaming: {
        resolvePlayback,
        getTrack: vi.fn(async ({ providerTrackId }: { providerTrackId: string }) => ({
          id: providerTrackId,
          provider: 'netease',
          providerTrackId,
          title: providerTrackId === 'track-1' ? 'First Remote' : 'Second Remote',
          artist: providerTrackId === 'track-1' ? 'Artist A' : 'Artist B',
          album: 'Daily Album',
          albumArtist: 'Daily Artists',
          duration: 180,
          coverUrl: null,
          coverThumb: null,
          liked: false,
        })),
      },
      downloads: {
        getSettings: vi.fn().mockResolvedValue({
          audioStrategy: 'best_available',
          importToLibrary: true,
          bindMvAfterImport: true,
          outputDirectory: 'D:\\Downloads',
        }),
        getJobs: vi.fn().mockResolvedValue([]),
        createUrlJob,
        onJobsUpdated: vi.fn(() => () => undefined),
      },
    } as unknown as Window['echo'];

    renderPlaylistsPage();

    const downloadButton = await screen.findByRole('button', { name: '下载歌单' });
    await waitFor(() => expect(downloadButton).toHaveProperty('disabled', false));
    fireEvent.click(downloadButton);

    await waitFor(() => expect(createUrlJob).toHaveBeenCalledTimes(2));
    expect(createUrlJob.mock.calls.map((call) => call[0])).toEqual([
      'https://cdn.example/track-1.mp3',
      'https://cdn.example/track-2.mp3',
    ]);
    expect(createUrlJob.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        outputSubdirectory: 'Daily Mix',
        streamingProvider: 'netease',
        streamingProviderTrackId: 'track-1',
        downloadAuthorizationToken: 'download-token-track-1',
      }),
    );
    expect(createUrlJob.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        outputSubdirectory: 'Daily Mix',
        streamingProviderTrackId: 'track-2',
        downloadAuthorizationToken: 'download-token-track-2',
      }),
    );
    expect(await screen.findByText('已按歌单顺序加入下载队列：2 首')).toBeTruthy();

    cleanup();
    renderPlaylistsPage();

    await waitFor(() => expect(screen.queryByText('下载歌单：Daily Mix')).toBeNull());
  });
});
