import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  handlers[channel] = handler;
});
const showOpenDialogMock = vi.fn();
const showSaveDialogMock = vi.fn();
const writeImageMock = vi.fn();
const createFromBufferMock = vi.fn(() => ({ isEmpty: () => false }));
const openPathMock = vi.fn();
const showItemInFolderMock = vi.fn();
const trashItemMock = vi.fn();
const getLibraryServiceMock = vi.fn();
const appSettingsMock = vi.hoisted(() => ({
  current: {
    networkMetadataEnabled: false,
    networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => (name === 'downloads' ? 'D:\\Downloads' : 'D:\\UserData')),
  },
  ipcMain: {
    handle: handleMock,
  },
  clipboard: {
    writeImage: writeImageMock,
    writeText: vi.fn(),
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
    showSaveDialog: showSaveDialogMock,
  },
  nativeImage: {
    createFromBuffer: createFromBufferMock,
  },
  shell: {
    openPath: openPathMock,
    showItemInFolder: showItemInFolderMock,
    trashItem: trashItemMock,
  },
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: getLibraryServiceMock,
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: () => appSettingsMock.current,
}));

const resetHandlers = (): void => {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
};

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-library-ipc-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const installLibraryService = () => {
  const track = {
    id: 'track-1',
    path: 'D:\\Music\\song.flac',
    title: '星灯',
    artist: 'Suara',
    album: 'Music',
    albumArtist: 'Suara',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: 1,
    codec: 'FLAC',
    sampleRate: 44100,
    bitDepth: 16,
    bitrate: 1000,
    coverId: null,
    coverThumb: null,
    fieldSources: {},
  };
  const service = {
    getTrack: vi.fn(() => track),
    getPlaylist: vi.fn(() => ({
      id: 'playlist-1',
      name: 'Export Mix',
      description: 'For export',
      kind: 'manual',
      sourceProvider: 'local',
      sourcePlaylistId: null,
      coverId: null,
      coverThumb: null,
      sortMode: 'manual',
      itemCount: 2,
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
    })),
    getPlaylistItems: vi.fn(() => ({
      items: [
        {
          id: 'item-1',
          playlistId: 'playlist-1',
          mediaType: 'track',
          mediaId: 'track-1',
          sourceProvider: 'local',
          sourceItemId: null,
          titleSnapshot: 'Local, Song',
          artistSnapshot: 'Suara',
          albumSnapshot: 'Music',
          durationSnapshot: 123,
          coverId: null,
          coverThumb: null,
          position: 0,
          addedAt: '2026-05-14T00:00:00.000Z',
          addedFrom: 'manual',
          unavailable: false,
          track,
        },
        {
          id: 'item-2',
          playlistId: 'playlist-1',
          mediaType: 'stream_track',
          mediaId: 'stream-1',
          sourceProvider: 'netease',
          sourceItemId: 'song-1',
          titleSnapshot: 'Stream "Song"',
          artistSnapshot: 'Net Artist',
          albumSnapshot: 'Net Album',
          durationSnapshot: 456,
          coverId: null,
          coverThumb: null,
          position: 1,
          addedAt: '2026-05-14T00:00:01.000Z',
          addedFrom: 'streaming-playlist',
          unavailable: false,
          track: null,
        },
      ],
      page: 1,
      pageSize: 500,
      total: 2,
      hasMore: false,
    })),
    createPlaylist: vi.fn((request: { name: string }) => ({
      id: 'playlist-imported',
      name: request.name,
      description: null,
      kind: 'manual',
      sourceProvider: 'local',
      sourcePlaylistId: null,
      coverId: null,
      coverThumb: null,
      sortMode: 'manual',
      itemCount: 0,
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
    })),
    resolveCoverAsset: vi.fn(() => null),
    addFolder: vi.fn(),
    getFolders: vi.fn(),
    getFolderOverviews: vi.fn(() => []),
    getFolderChildren: vi.fn(() => []),
    getFolderTracks: vi.fn(() => ({ items: [], page: 1, pageSize: 100, total: 0, hasMore: false })),
    resolveLibraryFolderPath: vi.fn(() => 'D:\\Music'),
    importAudioFile: vi.fn(async (path: string) => ({ id: `track-${path}`, path })),
    addTracksToPlaylist: vi.fn((_playlistId: string, trackIds: string[]) =>
      trackIds.map((trackId, index) => ({
        id: `item-${index + 1}`,
        playlistId: 'playlist-1',
        mediaType: 'track',
        mediaId: trackId,
        sourceProvider: 'local',
        sourceItemId: null,
        titleSnapshot: `Song ${index + 1}`,
        artistSnapshot: 'Artist',
        albumSnapshot: 'Album',
        durationSnapshot: 120,
        coverId: null,
        coverThumb: null,
        position: index,
        addedAt: '2026-05-18T00:00:00.000Z',
        addedFrom: 'library',
        unavailable: false,
        track: null,
      })),
    ),
    removeFolder: vi.fn(),
    scanFolder: vi.fn(),
    getScanStatus: vi.fn(),
    cancelScan: vi.fn(),
    getTracks: vi.fn(),
    locateTrackInTracks: vi.fn(() => ({ found: false, reason: 'not-found', track: null, items: [], page: 1, pageSize: 100, index: -1, total: 0, hasMore: false })),
    getDuplicateHiddenCounts: vi.fn(() => ({ 'track-1': 1, 'track-2': 0 })),
    getAlbums: vi.fn(),
    getAlbum: vi.fn(),
    getAlbumForTrack: vi.fn(),
    getArtists: vi.fn(),
    getArtist: vi.fn(),
    getArtistTracks: vi.fn(),
    getArtistAlbums: vi.fn(),
    enqueueMissingArtistImages: vi.fn(() => ({ queued: 0, skipped: 0 })),
    refreshArtistImage: vi.fn(async () => ({ queued: true, entry: null })),
    refreshVisibleArtistImages: vi.fn(() => ({ queued: 0, skipped: 0 })),
    getArtistImage: vi.fn(() => null),
    getArtistImageCacheSummary: vi.fn(() => ({ total: 0, matched: 0, pending: 0, loading: 0, notFound: 0, error: 0, rateLimited: 0 })),
    getArtistImageJobStatus: vi.fn(() => ({
      paused: false,
      running: false,
      queued: 0,
      active: 0,
      lastQueued: { queued: 0, skipped: 0 },
      summary: { total: 0, matched: 0, pending: 0, loading: 0, notFound: 0, error: 0, rateLimited: 0 },
    })),
    setArtistImageJobsPaused: vi.fn(() => ({
      paused: true,
      running: false,
      queued: 0,
      active: 0,
      lastQueued: { queued: 0, skipped: 0 },
      summary: { total: 0, matched: 0, pending: 0, loading: 0, notFound: 0, error: 0, rateLimited: 0 },
    })),
    kickoffArtistImageBackfill: vi.fn(() => ({
      paused: false,
      running: true,
      queued: 2,
      active: 0,
      lastQueued: { queued: 2, skipped: 0 },
      summary: { total: 2, matched: 0, pending: 2, loading: 0, notFound: 0, error: 0, rateLimited: 0 },
    })),
    clearArtistImageCache: vi.fn(() => ({ removedRows: 0, deletedFiles: 0, freedBytes: 0 })),
    getAlbumTracks: vi.fn(),
    getSummary: vi.fn(),
    refreshAlbumGrouping: vi.fn(() => ({ songCount: 2, albumCount: 1, artistCount: 2, folderCount: 1, totalDuration: 2, lastScanAt: null })),
    getDiagnostics: vi.fn(),
    clearCache: vi.fn(() => ({ scannedCount: 1, removedCount: 1, deletedCoverCacheFiles: 2, freedCoverCacheBytes: 128 })),
    updateTrackTags: vi.fn(),
    recordTrackPlayback: vi.fn(),
    deleteTrack: vi.fn(),
    resolveLyricsBackgroundCover: vi.fn(async () => ({
      coverUrl: 'echo-image://remote/cover',
      provider: 'netease-cloud-music',
      confidence: 0.96,
    })),
  };

  getLibraryServiceMock.mockReturnValue(service);
  return service;
};

describe('library IPC', () => {
  beforeEach(async () => {
    resetHandlers();
    handleMock.mockClear();
    showOpenDialogMock.mockReset();
    showSaveDialogMock.mockReset();
    writeImageMock.mockReset();
    createFromBufferMock.mockClear();
    openPathMock.mockReset();
    showItemInFolderMock.mockReset();
    trashItemMock.mockReset();
    getLibraryServiceMock.mockReset();
    appSettingsMock.current = {
      networkMetadataEnabled: false,
      networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
    };
    installLibraryService();
    const module = await import('./libraryIpc');
    module.registerLibraryIpc();
  });

  it('returns null when choose folder is cancelled', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await handlers[IpcChannels.LibraryChooseFolder]!();

    expect(result).toBeNull();
  });

  it('returns the selected folder path when choose folder succeeds', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['D:\\Music'] });

    const result = await handlers[IpcChannels.LibraryChooseFolder]!();

    expect(result).toBe('D:\\Music');
  });

  it('saves dropped audio files to downloads and imports them', async () => {
    const root = makeTempRoot();
    const { app } = await import('electron');
    vi.mocked(app.getPath).mockReturnValue(root);

    const result = await handlers[IpcChannels.LibraryImportDroppedFiles]!(null, [
      { name: 'song.flac', type: 'audio/flac', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'cover.jpg', type: 'image/jpeg', bytes: new Uint8Array([4, 5, 6]) },
    ]);

    expect(result).toMatchObject({
      importedCount: 1,
      ignoredCount: 1,
      failedCount: 0,
      outputDirectory: root,
    });
    expect(existsSync(join(root, 'song.flac'))).toBe(true);
    expect(getLibraryServiceMock().importAudioFile).toHaveBeenCalledWith(join(root, 'song.flac'), { folderPath: root });
  });

  it('classifies dropped import paths as folders, audio files, unsupported files, or missing paths', async () => {
    const root = makeTempRoot();
    const folderPath = join(root, 'Album');
    const audioPath = join(root, 'song.opus');
    const cuePath = join(root, 'album.cue');
    const unsupportedPath = join(root, 'cover.jpg');
    const missingPath = join(root, 'missing.flac');
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(audioPath, 'audio');
    writeFileSync(cuePath, 'cue');
    writeFileSync(unsupportedPath, 'image');

    const result = await handlers[IpcChannels.LibraryClassifyImportPaths]!(null, [
      folderPath,
      audioPath,
      cuePath,
      unsupportedPath,
      missingPath,
    ]);

    expect(result).toEqual({
      folders: [folderPath],
      audioFiles: [audioPath],
      unsupportedFiles: [cuePath, unsupportedPath],
      missingPaths: [missingPath],
    });
  });

  it('imports selected local audio paths and adds them to a playlist', async () => {
    const service = installLibraryService();
    const root = makeTempRoot();
    const firstPath = join(root, 'one.flac');
    const secondPath = join(root, 'two.mp3');
    const unsupportedPath = join(root, 'cover.jpg');
    const missingPath = join(root, 'missing.flac');
    writeFileSync(firstPath, 'audio');
    writeFileSync(secondPath, 'audio');
    writeFileSync(unsupportedPath, 'image');

    const result = await handlers[IpcChannels.LibraryAddLocalAudioFilesToPlaylist]!(null, 'playlist-1', [
      firstPath,
      secondPath,
      unsupportedPath,
      missingPath,
    ]);

    expect(service.importAudioFile).toHaveBeenCalledWith(firstPath);
    expect(service.importAudioFile).toHaveBeenCalledWith(secondPath);
    expect(service.addTracksToPlaylist).toHaveBeenCalledWith('playlist-1', [`track-${firstPath}`, `track-${secondPath}`]);
    expect(result).toMatchObject({
      importedCount: 2,
      addedCount: 2,
      skippedCount: 2,
      failedCount: 0,
      trackIds: [`track-${firstPath}`, `track-${secondPath}`],
    });
  });

  it('copies a generated song card image to the clipboard', async () => {
    const result = await handlers[IpcChannels.LibraryCopyTrackCover]!(null, 'track-1');

    expect(result).toBe(true);
    expect(createFromBufferMock).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer((createFromBufferMock.mock.calls[0] as unknown[])[0])).toBe(true);
    expect(writeImageMock).toHaveBeenCalledTimes(1);
  });

  it('saves a generated song card as png', async () => {
    const root = makeTempRoot();
    const outputPath = join(root, 'card.png');
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: outputPath });

    const result = await handlers[IpcChannels.LibrarySaveTrackCover]!(null, 'track-1');

    expect(result).toBe(outputPath);
    expect(showSaveDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: '星灯 - Suara.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      }),
    );
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath).subarray(1, 4).toString()).toBe('PNG');
  });

  it('exports playlists as json, txt, m3u8, and csv', async () => {
    const service = installLibraryService();
    const root = makeTempRoot();
    const formats = ['json', 'txt', 'm3u8', 'csv'] as const;

    for (const format of formats) {
      const outputPath = join(root, `playlist.${format}`);
      showSaveDialogMock.mockResolvedValueOnce({ canceled: false, filePath: outputPath });

      const result = await handlers[IpcChannels.LibraryExportPlaylist]!(null, { playlistId: 'playlist-1', format });

      expect(result).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf8');
      if (format === 'json') {
        expect(JSON.parse(content)).toMatchObject({
          playlist: { id: 'playlist-1', name: 'Export Mix' },
          tracks: expect.arrayContaining([
            expect.objectContaining({ title: 'Local, Song', path: 'D:\\Music\\song.flac' }),
            expect.objectContaining({ title: 'Stream "Song"', provider: 'netease', sourceItemId: 'song-1' }),
          ]),
        });
      } else if (format === 'txt') {
        expect(content).toContain('Export Mix');
        expect(content).toContain('1. Local, Song - Suara');
      } else if (format === 'm3u8') {
        expect(content).toContain('#EXTM3U');
        expect(content).toContain('D:\\Music\\song.flac');
        expect(content).toContain('# Stream "Song" - Net Artist (netease:song-1)');
      } else {
        expect(content).toContain('title,artist,album,duration,path,provider,sourceItemId,unavailable');
        expect(content).toContain('"Local, Song",Suara,Music,123,D:\\Music\\song.flac,local,,false');
        expect(content).toContain('"Stream ""Song""",Net Artist,Net Album,456,,netease,song-1,false');
      }
    }

    expect(service.getPlaylist).toHaveBeenCalledWith('playlist-1');
    expect(service.getPlaylistItems).toHaveBeenCalledWith('playlist-1', { page: 1, pageSize: 500 });
  });

  it('returns null when playlist export is cancelled', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined });

    const result = await handlers[IpcChannels.LibraryExportPlaylist]!(null, { playlistId: 'playlist-1', format: 'json' });

    expect(result).toBeNull();
  });

  it('imports local m3u8 files as local playlists', async () => {
    const service = installLibraryService();
    const root = makeTempRoot();
    const audioPath = join(root, 'Song One.flac');
    const playlistPath = join(root, 'Road Mix.m3u8');
    writeFileSync(audioPath, 'fake audio');
    writeFileSync(playlistPath, ['#EXTM3U', '#PLAYLIST:Road Mix', '#EXTINF:180,Artist - Song One', 'Song One.flac'].join('\n'));
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [playlistPath] });

    const result = await handlers[IpcChannels.LibraryImportPlaylistFile]!();

    expect(result).toEqual({
      playlistId: 'playlist-imported',
      playlistName: 'Road Mix',
      importedCount: 1,
      filePath: playlistPath,
    });
    expect(service.createPlaylist).toHaveBeenCalledWith({ name: 'Road Mix' });
    expect(service.importAudioFile).toHaveBeenCalledWith(audioPath);
    expect(service.addTracksToPlaylist).toHaveBeenCalledWith('playlist-imported', [`track-${audioPath}`]);
  });

  it('refreshes album grouping through IPC', async () => {
    const service = installLibraryService();

    const result = await handlers[IpcChannels.LibraryRefreshAlbumGrouping]!();

    expect(service.refreshAlbumGrouping).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ albumCount: 1 });
  });

  it('returns duplicate hidden counts for normalized track ids', async () => {
    const service = installLibraryService();

    const result = await handlers[IpcChannels.LibraryGetDuplicateHiddenCounts]!(null, ['track-1', 'track-2'], 'strict');

    expect(service.getDuplicateHiddenCounts).toHaveBeenCalledWith(['track-1', 'track-2'], 'strict');
    expect(result).toEqual({ 'track-1': 1, 'track-2': 0 });
  });

  it('accepts file modified sorting for songs and albums', async () => {
    const service = installLibraryService();

    await handlers[IpcChannels.LibraryGetTracks]!(null, { page: 1, pageSize: 50, sort: 'fileModifiedDesc', extra: true });
    await handlers[IpcChannels.LibraryGetAlbums]!(null, { page: 1, pageSize: 50, sort: 'fileModifiedAsc', extra: true });

    expect(service.getTracks).toHaveBeenCalledWith({ page: 1, pageSize: 50, sort: 'fileModifiedDesc' });
    expect(service.getAlbums).toHaveBeenCalledWith({ page: 1, pageSize: 50, sort: 'fileModifiedAsc' });
  });

  it('locates a song-list track through IPC with a normalized query', async () => {
    const service = installLibraryService();

    await handlers[IpcChannels.LibraryLocateTrackInTracks]!(null, 'track-1', {
      page: 9,
      pageSize: 50,
      search: 'needle',
      sort: 'artist',
      hideDuplicates: true,
      duplicateMode: 'strict',
      extra: true,
    });

    expect(service.locateTrackInTracks).toHaveBeenCalledWith('track-1', {
      page: 9,
      pageSize: 50,
      search: 'needle',
      sort: 'artist',
      hideDuplicates: true,
      duplicateMode: 'strict',
    });
  });

  it('registers artist detail IPC handlers with normalized queries', async () => {
    const service = installLibraryService();
    service.getArtist.mockReturnValue({
      id: 'artist-1',
      name: 'Suara',
      sortName: 'suara',
      role: 'both',
      trackCount: 2,
      albumCount: 1,
      coverId: null,
      coverThumb: null,
    });
    service.getArtistTracks.mockReturnValue({ items: [], page: 1, pageSize: 50, total: 0, hasMore: false });
    service.getArtistAlbums.mockReturnValue({ items: [], page: 1, pageSize: 12, total: 0, hasMore: false });

    await handlers[IpcChannels.LibraryGetArtist]!(null, 'artist-1');
    await handlers[IpcChannels.LibraryGetArtistTracks]!(null, 'artist-1', { page: 2, pageSize: 50, sort: 'durationDesc', extra: true });
    await handlers[IpcChannels.LibraryGetArtistAlbums]!(null, 'artist-1', { page: 1, pageSize: 12, sort: 'recent' });

    expect(service.getArtist).toHaveBeenCalledWith('artist-1');
    expect(service.getArtistTracks).toHaveBeenCalledWith('artist-1', { page: 2, pageSize: 50, sort: 'durationDesc' });
    expect(service.getArtistAlbums).toHaveBeenCalledWith('artist-1', { page: 1, pageSize: 12, sort: 'recent' });
  });

  it('registers artist image cache IPC handlers', async () => {
    const service = installLibraryService();

    await handlers[IpcChannels.LibraryArtistImagesEnqueueMissing]!(null, {
      artists: [{ id: 'artist-1', name: 'Suara' }],
      limit: 25,
      force: false,
    });
    await handlers[IpcChannels.LibraryArtistImagesRefreshVisible]!(null, [{ id: 'artist-1', name: 'Suara' }]);
    await handlers[IpcChannels.LibraryArtistImagesRefreshOne]!(null, { artistId: 'artist-1', force: true });
    await handlers[IpcChannels.LibraryArtistImagesGetStatus]!(null, 'artist-1');
    await handlers[IpcChannels.LibraryArtistImagesGetSummary]!(null);
    await handlers[IpcChannels.LibraryArtistImagesGetJobStatus]!(null);
    await handlers[IpcChannels.LibraryArtistImagesSetPaused]!(null, true);
    await handlers[IpcChannels.LibraryArtistImagesKickoff]!(null, { force: true, limit: 50 });
    await handlers[IpcChannels.LibraryArtistImagesClearCache]!();

    expect(service.enqueueMissingArtistImages).toHaveBeenCalledWith([{ id: 'artist-1', name: 'Suara', artistKey: undefined, artistName: undefined }], {
      force: false,
      limit: 25,
    });
    expect(service.refreshVisibleArtistImages).toHaveBeenCalledWith([{ id: 'artist-1', name: 'Suara', artistKey: undefined, artistName: undefined }]);
    expect(service.refreshArtistImage).toHaveBeenCalledWith('artist-1', true);
    expect(service.getArtistImage).toHaveBeenCalledWith('artist-1');
    expect(service.getArtistImageCacheSummary).toHaveBeenCalledTimes(1);
    expect(service.getArtistImageJobStatus).toHaveBeenCalledTimes(1);
    expect(service.setArtistImageJobsPaused).toHaveBeenCalledWith(true);
    expect(service.kickoffArtistImageBackfill).toHaveBeenCalledWith({ force: true, limit: 50 });
    expect(service.clearArtistImageCache).toHaveBeenCalledTimes(1);
  });

  it('registers folder center IPC handlers with normalized queries', async () => {
    const service = installLibraryService();
    openPathMock.mockResolvedValue('');

    await handlers[IpcChannels.LibraryGetFolderOverviews]!();
    await handlers[IpcChannels.LibraryGetFolderChildren]!(null, { folderId: 'folder-1', parentPath: 'D:\\Music' });
    await handlers[IpcChannels.LibraryGetFolderTracks]!(null, {
      folderId: 'folder-1',
      path: 'D:\\Music\\Rock',
      recursive: false,
      page: 2,
      pageSize: 25,
      sort: 'album',
      search: 'live',
    });
    await handlers[IpcChannels.LibraryOpenLibraryFolderPath]!(null, { folderId: 'folder-1', path: 'D:\\Music' });

    expect(service.getFolderOverviews).toHaveBeenCalledTimes(1);
    expect(service.getFolderChildren).toHaveBeenCalledWith({ folderId: 'folder-1', parentPath: 'D:\\Music' });
    expect(service.getFolderTracks).toHaveBeenCalledWith({
      folderId: 'folder-1',
      path: 'D:\\Music\\Rock',
      recursive: false,
      page: 2,
      pageSize: 25,
      sort: 'album',
      search: 'live',
    });
    expect(service.resolveLibraryFolderPath).toHaveBeenCalledWith({ folderId: 'folder-1', path: 'D:\\Music' });
    expect(openPathMock).toHaveBeenCalledWith('D:\\Music');
  });

  it('opens an arbitrary file path in its folder', async () => {
    await handlers[IpcChannels.LibraryOpenPathInFolder]!(null, 'D:\\Loose\\song.flac');

    expect(showItemInFolderMock).toHaveBeenCalledWith('D:\\Loose\\song.flac');
  });

  it('registers album detail IPC handler', async () => {
    const service = installLibraryService();
    service.getAlbum.mockReturnValue({
      id: 'album-1',
      albumKey: 'artist/album',
      title: 'Album',
      albumArtist: 'Artist',
      year: 2026,
      trackCount: 1,
      duration: 120,
      coverId: 'cover-1',
      coverThumb: 'echo-cover://album/cover-1',
      coverLarge: 'echo-cover://large/cover-1',
    });

    const result = await handlers[IpcChannels.LibraryGetAlbum]!(null, 'album-1');

    expect(service.getAlbum).toHaveBeenCalledWith('album-1');
    expect(result).toMatchObject({ coverLarge: 'echo-cover://large/cover-1' });
  });

  it('registers track album lookup IPC handler', async () => {
    const service = installLibraryService();
    service.getAlbumForTrack.mockReturnValue({
      id: 'album-1',
      albumKey: 'artist/album',
      title: 'Album',
      albumArtist: 'Artist',
      year: 2026,
      trackCount: 1,
      duration: 120,
      coverId: 'cover-1',
      coverThumb: 'echo-cover://album/cover-1',
    });

    const result = await handlers[IpcChannels.LibraryGetAlbumForTrack]!(null, 'track-1');

    expect(service.getAlbumForTrack).toHaveBeenCalledWith('track-1');
    expect(result).toMatchObject({ id: 'album-1' });
  });

  it('resolves lyrics background covers through the dedicated lyrics option when global network metadata is off', async () => {
    const service = installLibraryService();

    const result = await handlers[IpcChannels.LibraryResolveLyricsBackgroundCover]!(null, 'track-1');

    expect(service.resolveLyricsBackgroundCover).toHaveBeenCalledWith('track-1', ['netease-cloud-music', 'qq-music']);
    expect(result).toMatchObject({
      coverUrl: 'echo-image://remote/cover',
      provider: 'netease-cloud-music',
    });
  });
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
