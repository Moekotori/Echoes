// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlbumOnlineInfo, LibraryAlbum, LibraryArtist, LibraryTrack } from '../../../shared/types/library';
import { AlbumDetailView } from './AlbumDetailView';

const queueMock = {
  currentTrackId: null as string | null,
  playTrack: vi.fn().mockResolvedValue({}),
  replaceQueue: vi.fn(),
};

let mockAlbumTracks: LibraryTrack[] = [];

vi.mock('../../stores/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => queueMock,
}));

vi.mock('../../i18n/I18nProvider', () => {
  const strings: Record<string, string> = {
    'albumDetail.action.back': 'Albums',
    'albumDetail.action.openSource': 'Open source',
    'albumDetail.aria.openArtist': 'Open artist {artist}',
    'albumDetail.online.match': 'MusicBrainz match',
    'albumDetail.information.artistProfile': 'Artist profile',
    'albumDetail.information.externalLinks': 'External links',
    'albumDetail.ratings.count': '{count} ratings',
    'albumDetail.ratings.overviewAria': 'External album ratings',
    'albumDetail.releases.count': '{count} release versions',
    'albumDetail.releases.current': 'Current match',
    'albumDetail.releases.currentHint': 'Shows the matched release',
    'albumDetail.releases.heading': 'Versions / Releases',
    'albumDetail.sources.barcode': 'Barcode',
    'albumDetail.sources.catalogNumber': 'Catalog no.',
    'albumDetail.sources.kind.database': 'Database',
    'albumDetail.sources.kind.streaming': 'Streaming',
    'albumDetail.sources.labels': 'Label / catalog',
    'albumDetail.sources.releaseDetails': 'Current release',
    'albumDetail.related.heading': 'My Library',
    'albumDetail.related.thisAlbum': 'This album',
    'albumDetail.tab.credits': 'Credits',
    'albumDetail.tab.information': 'Information',
    'albumDetail.tab.releases': 'Versions',
    'albumDetail.tab.sources': 'Sources',
    'albumDetail.tab.tracks': 'Tracks',
  };

  return {
    useI18n: () => ({
      t: (key: string, options?: Record<string, string | number>) =>
        Object.entries(options ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), strings[key] ?? key),
    }),
  };
});

vi.mock('./AlbumTrackList', async () => {
  const React = await import('react');

  return {
    AlbumTrackList: ({ onFirstTrackChange, onLoadedTracksChange }: {
      onFirstTrackChange?: (track: LibraryTrack | null, isLoading: boolean) => void;
      onLoadedTracksChange?: (tracks: LibraryTrack[], total: number, isLoading: boolean) => void;
    }) => {
      React.useEffect(() => {
        const loadedTracks = mockAlbumTracks.length > 0 ? mockAlbumTracks : [track()];
        onFirstTrackChange?.(loadedTracks[0] ?? null, false);
        onLoadedTracksChange?.(loadedTracks, loadedTracks.length, false);
      }, [onFirstTrackChange, onLoadedTracksChange]);

      return <section>Mock album tracks</section>;
    },
  };
});

const album = (overrides: Partial<LibraryAlbum> = {}): LibraryAlbum => ({
  id: 'album-1',
  albumKey: 'echo/unit',
  title: 'Mock Album',
  albumArtist: 'Echo Unit',
  year: 2026,
  trackCount: 1,
  duration: 180,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const track = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Mock Track',
  artist: 'Echo Unit',
  album: 'Mock Album',
  albumArtist: 'Echo Unit',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 1000000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

const artist = (): LibraryArtist => ({
  id: 'artist-1',
  name: 'Echo Unit',
  sortName: 'Echo Unit',
  role: 'both',
  trackCount: 1,
  albumCount: 1,
  coverId: null,
  coverThumb: null,
  avatarUrl: null,
  avatarThumbUrl: null,
  avatarStatus: null,
});

const onlineInfo = (): AlbumOnlineInfo => ({
  albumId: 'album-1',
  status: 'ready',
  sources: [{ provider: 'wikipedia', label: 'en.wikipedia.org' }],
  match: {
    provider: 'musicbrainz',
    providerItemId: 'mb-release-1',
    title: 'Mock Album',
    artist: 'Echo Unit',
    year: 2026,
    confidence: 0.96,
    url: 'https://musicbrainz.org/release/mb-release-1',
    possible: false,
  },
  sourceLinks: [
    { provider: 'musicbrainz', label: 'MusicBrainz', url: 'https://musicbrainz.org/release/mb-release-1', kind: 'database' },
    { provider: 'rateYourMusic', label: 'Rate Your Music', url: 'https://rateyourmusic.com/release/album/echo_unit/mock_album/', kind: 'database' },
    { provider: 'spotify', label: 'Spotify', url: 'https://open.spotify.com/album/mock', kind: 'streaming' },
  ],
  externalRatings: [
    {
      provider: 'rateYourMusic',
      score: 3.82,
      maxScore: 5,
      ratingCount: 12431,
      rankText: '#24 in 2024',
      url: 'https://rateyourmusic.com/release/album/echo_unit/mock_album/',
      fetchedAt: '2026-05-21T00:00:00.000Z',
      expiresAt: '2026-06-21T00:00:00.000Z',
      confidence: 0.95,
    },
  ],
  releaseDetails: {
    title: 'Mock Album',
    date: '2026-05-01',
    country: 'JP',
    barcode: '1234567890123',
    status: 'Official',
    labels: [{ name: 'Mock Label', catalogNumber: 'MOCK-1' }],
    mediaFormats: ['Digital Media'],
    copyrights: [],
  },
  releaseVersions: [
    {
      providerItemId: 'mb-release-1',
      title: 'Mock Album',
      artist: 'Echo Unit',
      year: 2026,
      date: '2026-05-01',
      country: 'JP',
      barcode: '1234567890123',
      status: 'Official',
      disambiguation: null,
      mediaFormats: ['Digital Media'],
      trackCount: 1,
      catalogNumbers: ['MOCK-1'],
      labels: ['Mock Label'],
      url: 'https://musicbrainz.org/release/mb-release-1',
      confidence: 0.96,
      isMatched: true,
    },
    {
      providerItemId: 'mb-release-2',
      title: 'Mock Album',
      artist: 'Echo Unit',
      year: 2026,
      date: '2026-06-01',
      country: 'US',
      barcode: null,
      status: 'Official',
      disambiguation: 'CD',
      mediaFormats: ['CD'],
      trackCount: 1,
      catalogNumbers: ['MOCK-CD'],
      labels: ['Mock Label'],
      url: 'https://musicbrainz.org/release/mb-release-2',
      confidence: 0.82,
      isMatched: false,
    },
  ],
  credits: [
    {
      role: 'Composer',
      people: [{ name: 'Mock Composer', detail: 'music', trackTitle: null, source: 'work' }],
    },
  ],
  information: {
    title: 'Mock Album',
    description: 'Album',
    extract: 'Mock album overview.',
    url: 'https://example.test/album',
    language: 'en',
    thumbnailUrl: null,
    externalLinks: [{ label: 'example.test / album official', url: 'https://example.test/album-official' }],
  },
  artistInformation: {
    title: 'Echo Unit',
    description: 'Artist',
    extract: 'Echo Unit artist overview.',
    url: 'https://example.test/artist',
    language: 'en',
    thumbnailUrl: null,
    externalLinks: [{ label: 'example.test / artist official', url: 'https://example.test/artist-official' }],
  },
  fetchedAt: '2026-05-21T00:00:00.000Z',
  expiresAt: '2026-06-21T00:00:00.000Z',
  fromCache: false,
  errors: [],
});

const relatedAlbum = (): LibraryAlbum => ({
  ...album(),
  id: 'album-2',
  albumKey: 'echo/unit/sister',
  title: 'Sister Album',
  year: 2025,
  trackCount: 8,
  duration: 2200,
  coverId: 'cover-2',
  coverThumb: 'echo-cover://album/cover-2',
});

const installLibrary = (): {
  getAlbumOnlineInfo: ReturnType<typeof vi.fn>;
  getArtists: ReturnType<typeof vi.fn>;
  getArtistAlbums: ReturnType<typeof vi.fn>;
} => {
  const getAlbumOnlineInfo = vi.fn().mockResolvedValue(onlineInfo());
  const getArtists = vi.fn().mockResolvedValue({
    items: [artist()],
    page: 1,
    pageSize: 50,
    total: 1,
    hasMore: false,
  });
  const getArtistAlbums = vi.fn().mockResolvedValue({
    items: [album(), relatedAlbum()],
    page: 1,
    pageSize: 8,
    total: 2,
    hasMore: false,
  });
  window.echo = {
    app: {
      openExternalUrl: vi.fn().mockResolvedValue(undefined),
    },
    library: {
      getAlbum: vi.fn().mockResolvedValue({ coverLarge: null }),
      getAlbumOnlineInfo,
      getArtists,
      getArtistAlbums,
      getLikedAlbumIds: vi.fn().mockResolvedValue({}),
    },
  } as unknown as Window['echo'];
  return { getAlbumOnlineInfo, getArtists, getArtistAlbums };
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  queueMock.playTrack.mockReset();
  queueMock.playTrack.mockResolvedValue({});
  queueMock.replaceQueue.mockReset();
  mockAlbumTracks = [];
});

describe('AlbumDetailView', () => {
  it('returns from the album detail after Escape plays the back animation', async () => {
    vi.useFakeTimers();
    installLibrary();
    const onBack = vi.fn();

    render(<AlbumDetailView album={album()} onBack={onBack} />);

    expect(screen.getByText('Mock Album')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('starts reading online album info when the detail opens and shows tracks by default', async () => {
    const { getAlbumOnlineInfo } = installLibrary();

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    await waitFor(() => expect(getAlbumOnlineInfo).toHaveBeenCalledWith('album-1', { force: false }));

    expect(screen.getByText('Mock album tracks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tracks' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
    expect(await screen.findByText('1234567890123')).toBeTruthy();
    expect(screen.getByText('3.82 / 5')).toBeTruthy();
    expect(screen.getByText('12,431 ratings - #24 in 2024')).toBeTruthy();
    expect(screen.getAllByText('Rate Your Music').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spotify').length).toBeGreaterThan(0);
  });

  it('hides the external rating panel when rating data is absent', async () => {
    const { getAlbumOnlineInfo } = installLibrary();
    getAlbumOnlineInfo.mockResolvedValueOnce({ ...onlineInfo(), externalRatings: [] });

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));

    expect(await screen.findByText('1234567890123')).toBeTruthy();
    expect(screen.queryByText('3.82 / 5')).toBeNull();
  });

  it('shows MusicBrainz release versions and marks the current match', async () => {
    installLibrary();

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));

    expect(await screen.findByText('Current match')).toBeTruthy();
    expect(screen.getByText('MOCK-CD')).toBeTruthy();
  });

  it('shows artist information after opening the information tab', async () => {
    installLibrary();

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Information' }));

    expect(await screen.findByText('Artist profile - en.wikipedia.org')).toBeTruthy();
    expect(screen.getByText('Echo Unit artist overview.')).toBeTruthy();
  });

  it('uses original album artwork in the detail hero', async () => {
    installLibrary();

    const { container } = render(<AlbumDetailView album={album({
      coverId: 'cover 1',
      coverThumb: 'echo-cover://album/cover%201',
    })} onBack={vi.fn()} />);

    expect((container.querySelector('.album-detail-cover img') as HTMLImageElement | null)?.getAttribute('src')).toBe('echo-cover://original/cover%201');
  });

  it('opens information links through the system browser bridge', async () => {
    installLibrary();

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Information' }));
    fireEvent.click(await screen.findByRole('link', { name: /album official/i }));

    await waitFor(() => expect(window.echo?.app?.openExternalUrl).toHaveBeenCalledWith('https://example.test/album-official'));
  });

  it('opens the album artist detail from the hero artist name', async () => {
    const { getArtists } = installLibrary();
    const navigate = vi.fn();
    window.addEventListener('app:navigate:artist-detail', navigate);

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open artist Echo Unit' }));

    await waitFor(() => expect(getArtists).toHaveBeenCalledWith({ page: 1, pageSize: 50, search: 'Echo Unit', sort: 'default' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect((navigate.mock.calls[0]?.[0] as CustomEvent).detail.artist.id).toBe('artist-1');

    window.removeEventListener('app:navigate:artist-detail', navigate);
  });

  it('derives the album artist display from track artists when the album artist is Various Artists', async () => {
    mockAlbumTracks = [
      track({
        id: 'track-1',
        artist: 'Mock Producer / Echo Unit / Hatsune Miku',
        albumArtist: 'Various Artists',
      }),
      track({
        id: 'track-2',
        artist: 'Echo Unit / Hatsune Miku',
        albumArtist: 'Various Artists',
      }),
    ];
    const { getArtists } = installLibrary();

    render(<AlbumDetailView album={album({ albumArtist: 'Various Artists' })} onBack={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Open artist Various Artists' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));

    expect(await screen.findByRole('button', { name: 'Open artist Echo Unit / Hatsune Miku' })).toBeTruthy();
    await waitFor(() =>
      expect(getArtists).toHaveBeenCalledWith({ page: 1, pageSize: 50, search: 'Echo Unit', sort: 'default', sourceProvider: 'local' }),
    );
    expect(screen.queryByText('Various Artists')).toBeNull();
  });

  it('shows the album artist library shelf under the track list', async () => {
    const { getArtists, getArtistAlbums } = installLibrary();

    render(<AlbumDetailView album={album()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));

    expect(await screen.findByText('My Library')).toBeTruthy();
    expect(screen.getByText('Sister Album')).toBeTruthy();
    expect(screen.getByText('This album')).toBeTruthy();
    expect(getArtists).toHaveBeenCalledWith({ page: 1, pageSize: 50, search: 'Echo Unit', sort: 'default', sourceProvider: 'local' });
    expect(getArtistAlbums).toHaveBeenCalledWith('artist-1', { page: 1, pageSize: 8, sort: 'recent' });
  });
});
