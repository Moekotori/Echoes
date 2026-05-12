// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtistDetailView } from './ArtistDetailView';
import type { LibraryArtist, LibraryTrack } from '../../../shared/types/library';

const queueMock = {
  appendToQueue: vi.fn(),
  currentTrackId: null as string | null,
  playTrack: vi.fn().mockResolvedValue({}),
  playTrackNext: vi.fn(),
  replaceQueue: vi.fn(),
};

let mockTracks: LibraryTrack[] = [];
let mockTotal = 0;
let mockIsLoading = false;

vi.mock('../../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

vi.mock('./ArtistAlbumGrid', () => ({
  ArtistAlbumGrid: () => <section aria-label="mock albums">Mock albums</section>,
}));

vi.mock('./ArtistTrackList', async () => {
  const React = await import('react');

  return {
    ArtistTrackList: ({ onLoadedTracksChange }: { onLoadedTracksChange?: (tracks: LibraryTrack[], total: number, isLoading: boolean) => void }) => {
      React.useEffect(() => {
        onLoadedTracksChange?.(mockTracks, mockTotal, mockIsLoading);
      }, [onLoadedTracksChange]);

      return mockTracks.length === 0 && !mockIsLoading ? <p>这个艺术家还没有可显示的歌曲。</p> : <section>Mock tracks</section>;
    },
  };
});

const artist = (overrides: Partial<LibraryArtist> = {}): LibraryArtist => ({
  id: 'artist-1',
  name: 'Echo Unit',
  sortName: 'echo unit',
  role: 'both',
  trackCount: 3,
  albumCount: 2,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const track = (id: string): LibraryTrack => ({
  id,
  path: `D:\\Music\\${id}.flac`,
  title: `Track ${id}`,
  artist: 'Echo Unit',
  album: 'Album',
  albumArtist: 'Echo Unit',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 1000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
});

const installLibrary = (getArtist = vi.fn().mockResolvedValue(artist())): void => {
  window.echo = {
    library: {
      getArtist,
    },
  } as unknown as Window['echo'];
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  queueMock.appendToQueue.mockReset();
  queueMock.playTrack.mockReset();
  queueMock.playTrack.mockResolvedValue({});
  queueMock.playTrackNext.mockReset();
  queueMock.replaceQueue.mockReset();
  mockTracks = [];
  mockTotal = 0;
  mockIsLoading = false;
});

describe('ArtistDetailView', () => {
  it('shows the loading state while artist tracks are being read', async () => {
    mockIsLoading = true;
    installLibrary();

    render(<ArtistDetailView artist={artist()} onBack={vi.fn()} />);

    await screen.findByText('Echo Unit');
    expect((screen.getByRole('button', { name: /Reading Artist/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the empty track state from the artist track section', async () => {
    installLibrary();

    render(<ArtistDetailView artist={artist({ trackCount: 0 })} onBack={vi.fn()} />);

    expect(await screen.findByText('这个艺术家还没有可显示的歌曲。')).toBeTruthy();
  });

  it('plays the loaded artist queue from Play Artist', async () => {
    const first = track('1');
    const second = track('2');
    mockTracks = [first, second];
    mockTotal = 2;
    installLibrary();

    render(<ArtistDetailView artist={artist()} onBack={vi.fn()} />);

    await waitFor(() => expect((screen.getByRole('button', { name: /Play Artist/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Play Artist/i }));

    await waitFor(() => expect(queueMock.replaceQueue).toHaveBeenCalledTimes(1));
    expect(queueMock.replaceQueue).toHaveBeenCalledWith(mockTracks, {
      startTrackId: first.id,
      source: { type: 'artist', label: 'Echo Unit', artistId: 'artist-1' },
    });
    expect(queueMock.playTrack).toHaveBeenCalledWith(first, {
      source: { type: 'artist', label: 'Echo Unit', artistId: 'artist-1' },
    });
  });
});
