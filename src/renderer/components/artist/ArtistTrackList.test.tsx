// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryPage, LibraryTrack } from '../../../shared/types/library';
import { ArtistTrackList } from './ArtistTrackList';

const queueMock = {
  items: [],
  removeQueueItem: vi.fn(),
};

vi.mock('../../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Karakuri',
  artist: 'Archouchou',
  album: 'Refrain',
  albumArtist: 'Archouchou',
  trackNo: 1,
  discNo: 1,
  year: 2024,
  genre: null,
  duration: 221,
  codec: 'flac',
  sampleRate: 48000,
  bitDepth: 24,
  bitrate: 1411000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const page = (items: LibraryTrack[], overrides: Partial<LibraryPage<LibraryTrack>> = {}): LibraryPage<LibraryTrack> => ({
  items,
  page: 1,
  pageSize: 50,
  total: items.length,
  hasMore: false,
  ...overrides,
});

const installLibrary = (getArtistTracks: ReturnType<typeof vi.fn>): void => {
  window.echo = {
    library: {
      getArtistTracks,
    },
  } as unknown as Window['echo'];
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  queueMock.items = [];
  queueMock.removeQueueItem.mockReset();
});

describe('ArtistTrackList', () => {
  it('opens the shared track context menu from right click and runs menu actions', async () => {
    const onAppendToQueue = vi.fn();
    const onPlayNext = vi.fn();
    installLibrary(vi.fn().mockResolvedValue(page([track()])));

    render(
      <ArtistTrackList
        artistId="artist-1"
        currentTrackId={null}
        onAppendToQueue={onAppendToQueue}
        onOpenAlbum={vi.fn()}
        onPlayNext={onPlayNext}
        onPlayTrack={vi.fn()}
      />,
    );

    const row = await screen.findByRole('listitem');
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });

    await screen.findByRole('menu');
    const firstMenuItems = screen.getAllByRole('menuitem');
    fireEvent.click(firstMenuItems[1]);
    expect(onPlayNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'track-1' }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Karakuri' }));

    await screen.findByRole('menu');
    const secondMenuItems = screen.getAllByRole('menuitem');
    fireEvent.click(secondMenuItems[2]);
    expect(onAppendToQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 'track-1' }));
  });
});
