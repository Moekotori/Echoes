// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryFolderNode, LibraryFolderOverview, LibraryPage, LibraryTrack } from '../../shared/types/library';
import { PlaybackQueueProvider } from '../stores/PlaybackQueueProvider';
import { FoldersPage } from './FoldersPage';

vi.mock('../components/library/TrackList', () => ({
  TrackList: ({
    tracks,
    currentTrackId,
    onOpenTrackMenu,
  }: {
    tracks: LibraryTrack[];
    currentTrackId: string | null;
    onOpenTrackMenu?: (track: LibraryTrack, position: { x: number; y: number }) => void;
  }) => (
    <div data-testid="folder-track-list">
      <span data-testid="current-track-id">{currentTrackId ?? 'none'}</span>
      {tracks.map((item) => (
        <button
          key={item.id}
          type="button"
          className="track-row"
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenTrackMenu?.(item, { x: event.clientX, y: event.clientY });
          }}
        >
          {item.title}
        </button>
      ))}
    </div>
  ),
}));

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Root.flac',
  title: 'Root Song',
  artist: 'Root Artist',
  album: 'Root Album',
  albumArtist: 'Root Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 60,
  codec: 'FLAC',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
  ...overrides,
});

const overview = (overrides: Partial<LibraryFolderOverview> = {}): LibraryFolderOverview => ({
  id: 'folder-1',
  path: 'D:\\Music',
  name: 'Music',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastScanAt: null,
  recentScan: null,
  trackCount: 2,
  albumCount: 1,
  artistCount: 1,
  totalDuration: 180,
  totalSizeBytes: 1024,
  missingTrackCount: 0,
  losslessTrackCount: 2,
  hiResTrackCount: 0,
  childFolderCount: 1,
  coverThumbs: [],
  ...overrides,
});

const childNode = (overrides: Partial<LibraryFolderNode> = {}): LibraryFolderNode => ({
  folderId: 'folder-1',
  path: 'D:\\Music\\Rock',
  parentPath: 'D:\\Music',
  name: 'Rock',
  depth: 1,
  trackCount: 1,
  directTrackCount: 1,
  childFolderCount: 0,
  totalDuration: 120,
  totalSizeBytes: 512,
  coverThumbs: [],
  ...overrides,
});

const page = (items: LibraryTrack[], total = items.length): LibraryPage<LibraryTrack> => ({
  items,
  page: 1,
  pageSize: 100,
  total,
  hasMore: false,
});

const renderFoldersPage = () =>
  render(
    <PlaybackQueueProvider>
      <FoldersPage />
    </PlaybackQueueProvider>,
  );

let libraryMock: {
  getFolderOverviews: ReturnType<typeof vi.fn>;
  getFolderChildren: ReturnType<typeof vi.fn>;
  getFolderTracks: ReturnType<typeof vi.fn>;
  openLibraryFolderPath: ReturnType<typeof vi.fn>;
  chooseFolder: ReturnType<typeof vi.fn>;
  addFolder: ReturnType<typeof vi.fn>;
  scanFolder: ReturnType<typeof vi.fn>;
  removeFolder: ReturnType<typeof vi.fn>;
  getScanStatus: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  libraryMock = {
    getFolderOverviews: vi.fn().mockResolvedValue([overview()]),
    getFolderChildren: vi.fn().mockResolvedValue([childNode()]),
    getFolderTracks: vi.fn().mockResolvedValue(page([track()])),
    openLibraryFolderPath: vi.fn().mockResolvedValue(undefined),
    chooseFolder: vi.fn().mockResolvedValue(null),
    addFolder: vi.fn(),
    scanFolder: vi.fn(),
    removeFolder: vi.fn(),
    getScanStatus: vi.fn(),
  };

  Object.defineProperty(window, 'echo', {
    configurable: true,
    value: {
      library: libraryMock,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FoldersPage', () => {
  it('loads root overviews first and fetches child nodes lazily', async () => {
    renderFoldersPage();

    expect(await screen.findByRole('heading', { name: 'Folders' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Music').length).toBeGreaterThan(0));
    expect(libraryMock.getFolderOverviews).toHaveBeenCalledTimes(1);
    expect(libraryMock.getFolderChildren).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Music/i }).querySelector('.folder-expand-hit')!);

    await waitFor(() => expect(libraryMock.getFolderChildren).toHaveBeenCalledWith({ folderId: 'folder-1', parentPath: 'D:\\Music' }));
    expect(await screen.findByText('Rock')).toBeTruthy();
  });

  it('loads scoped tracks for the selected folder and recursive toggle', async () => {
    renderFoldersPage();

    await waitFor(() =>
      expect(libraryMock.getFolderTracks).toHaveBeenCalledWith(
        expect.objectContaining({
          folderId: 'folder-1',
          path: 'D:\\Music',
          recursive: true,
          page: 1,
          pageSize: 100,
        }),
      ),
    );

    fireEvent.click(screen.getByLabelText('Include subfolders'));

    await waitFor(() =>
      expect(libraryMock.getFolderTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({
          folderId: 'folder-1',
          path: 'D:\\Music',
          recursive: false,
        }),
      ),
    );
  });

  it('opens the shared track context menu for folder tracks', async () => {
    renderFoldersPage();

    await screen.findByText('Root Song');
    const row = screen.getByText('Root Song').closest('.track-row');
    expect(row).toBeTruthy();

    fireEvent.contextMenu(row!, { clientX: 240, clientY: 180 });

    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(5);
  });
});
