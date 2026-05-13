import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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

vi.mock('electron', () => ({
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
    resolveCoverAsset: vi.fn(() => null),
    addFolder: vi.fn(),
    getFolders: vi.fn(),
    removeFolder: vi.fn(),
    scanFolder: vi.fn(),
    getScanStatus: vi.fn(),
    cancelScan: vi.fn(),
    getTracks: vi.fn(),
    getAlbums: vi.fn(),
    getArtists: vi.fn(),
    getArtist: vi.fn(),
    getArtistTracks: vi.fn(),
    getArtistAlbums: vi.fn(),
    getAlbumTracks: vi.fn(),
    getSummary: vi.fn(),
    refreshAlbumGrouping: vi.fn(() => ({ songCount: 2, albumCount: 1, artistCount: 2, folderCount: 1, totalDuration: 2, lastScanAt: null })),
    getDiagnostics: vi.fn(),
    clearCache: vi.fn(() => ({ scannedCount: 1, removedCount: 1, deletedCoverCacheFiles: 2, freedCoverCacheBytes: 128 })),
    updateTrackTags: vi.fn(),
    recordTrackPlayback: vi.fn(),
    deleteTrack: vi.fn(),
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

  it('refreshes album grouping through IPC', async () => {
    const service = installLibraryService();

    const result = await handlers[IpcChannels.LibraryRefreshAlbumGrouping]!();

    expect(service.refreshAlbumGrouping).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ albumCount: 1 });
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
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
