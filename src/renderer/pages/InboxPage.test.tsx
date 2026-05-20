// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryInboxTrackPage, LibraryTrack } from '../../shared/types/library';
import { InboxPage } from './InboxPage';

let libraryBridge: Record<string, unknown> | null = null;

vi.mock('../utils/echoBridge', () => ({
  getLibraryBridge: () => libraryBridge,
}));

const track = (id: string, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  path: `D:\\Music\\${id}.flac`,
  title: `Song ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  metadataStatus: 'ok',
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const inboxPage = (overrides: Partial<LibraryInboxTrackPage> = {}): LibraryInboxTrackPage => ({
  page: 1,
  pageSize: 60,
  total: 1,
  hasMore: false,
  scope: 'latest',
  filter: 'all',
  batches: [
    {
      id: 'batch-1',
      scanJobId: 'scan-1',
      folderId: 'folder-1',
      folderName: 'Music',
      folderPath: 'D:\\Music',
      addedCount: 1,
      missingCoverCount: 1,
      metadataIssueCount: 0,
      createdAt: '2026-05-20T00:00:00.000Z',
      finishedAt: '2026-05-20T00:00:00.000Z',
    },
  ],
  selectedBatch: {
    id: 'batch-1',
    scanJobId: 'scan-1',
    folderId: 'folder-1',
    folderName: 'Music',
    folderPath: 'D:\\Music',
    addedCount: 1,
    missingCoverCount: 1,
    metadataIssueCount: 0,
    createdAt: '2026-05-20T00:00:00.000Z',
    finishedAt: '2026-05-20T00:00:00.000Z',
  },
  facets: {
    folders: [{ value: 'folder-1', label: 'Music', count: 1 }],
    albums: [{ value: 'Album', label: 'Album', count: 1 }],
    artists: [{ value: 'Artist', label: 'Artist', count: 1 }],
  },
  items: [
    {
      batchId: 'batch-1',
      addedAt: '2026-05-20T00:00:00.000Z',
      track: track('track-1'),
      reasons: ['missing_cover'],
    },
  ],
  ...overrides,
});

afterEach(() => {
  cleanup();
  libraryBridge = null;
  vi.restoreAllMocks();
});

describe('InboxPage', () => {
  it('loads new-song inbox rows and applies bounded filters', async () => {
    const getLibraryInboxTracks = vi.fn().mockResolvedValue(inboxPage());
    libraryBridge = {
      getLibraryInboxTracks,
      onLibraryChanged: vi.fn(),
    };

    render(<InboxPage />);

    expect(await screen.findByText('Song track-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '资料异常' }));

    await waitFor(() =>
      expect(getLibraryInboxTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scope: 'latest',
          filter: 'metadata_issue',
          page: 1,
          pageSize: 60,
        }),
      ),
    );
  });

  it('creates a playlist from the current inbox filter without touching playback APIs', async () => {
    const getLibraryInboxTracks = vi.fn().mockResolvedValue(inboxPage());
    const createPlaylistFromLibraryInbox = vi.fn().mockResolvedValue({
      playlist: { name: 'Inbox Picks' },
      addedCount: 1,
      matchedCount: 1,
      skippedCount: 0,
      truncated: false,
      limit: 1000,
    });
    libraryBridge = {
      getLibraryInboxTracks,
      createPlaylistFromLibraryInbox,
      onLibraryChanged: vi.fn(),
    };

    render(<InboxPage />);

    await screen.findByText('Song track-1');
    fireEvent.click(screen.getByRole('button', { name: /生成歌单/ }));

    await waitFor(() =>
      expect(createPlaylistFromLibraryInbox).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'latest',
          filter: 'all',
        }),
      ),
    );
    expect(await screen.findByText(/Inbox Picks/)).toBeTruthy();
  });
});
