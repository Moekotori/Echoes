// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../shared/types/appSettings';
import type {
  StreamingAlbum,
  StreamingArtist,
  StreamingArtistDetail,
  StreamingProviderDescriptor,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { PlaybackQueueProvider } from '../../stores/PlaybackQueueProvider';
import { StreamingSearchPage } from './StreamingSearchPage';
import { updateStreamingSearchMemory } from './streamingSearchMemory';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const rowSize = estimateSize();
    return {
      getTotalSize: () => count * rowSize,
      getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: rowSize,
        start: index * rowSize,
      })),
      measureElement: () => undefined,
    };
  },
}));

const provider: StreamingProviderDescriptor = {
  name: 'netease',
  displayName: 'NetEase Cloud Music',
  enabled: true,
  supportsSearch: true,
  supportsPlayback: true,
  supportsLyrics: true,
  supportsMv: true,
  requiresAccount: false,
};

const qqProvider: StreamingProviderDescriptor = {
  name: 'qqmusic',
  displayName: 'QQ Music',
  enabled: true,
  supportsSearch: true,
  supportsPlayback: true,
  supportsLyrics: true,
  supportsMv: true,
  requiresAccount: false,
};

const artist: StreamingArtist = {
  id: 'streaming:netease:artist:jay',
  provider: 'netease',
  providerArtistId: 'jay',
  name: '周杰伦',
  avatarUrl: null,
  coverUrl: null,
};

const track: StreamingTrack = {
  id: 'streaming:netease:song:sunny',
  provider: 'netease',
  providerTrackId: 'sunny',
  stableKey: 'streaming:netease:sunny',
  title: '晴天',
  artist: '周杰伦',
  artists: [],
  album: '叶惠美',
  albumId: 'album-yhm',
  albumArtist: '周杰伦',
  duration: 269,
  coverUrl: null,
  coverThumb: null,
  qualities: ['high', 'lossless'],
  explicit: false,
  playable: true,
  unavailableReason: null,
  lyricsStatus: 'unknown',
  mvStatus: 'unknown',
};

const searchResult: StreamingSearchResult = {
  provider: 'netease',
  query: '周杰伦',
  page: 1,
  pageSize: 30,
  total: 1,
  hasMore: false,
  tracks: [],
  albums: [],
  artists: [artist],
  playlists: [],
  mvs: [],
};

const qqArtistWithMidName: StreamingArtist = {
  id: 'streaming:qqmusic:artist:002DYpxl3hW3EP',
  provider: 'qqmusic',
  providerArtistId: '002DYpxl3hW3EP',
  name: '002DYpxl3hW3EP',
  avatarUrl: null,
  coverUrl: null,
};

const qqArtistAlbum: StreamingAlbum = {
  id: 'streaming:qqmusic:album:0003lclS1T2kXW',
  provider: 'qqmusic',
  providerAlbumId: '0003lclS1T2kXW',
  title: 'My Worlds - The Collection',
  artist: 'Justin Bieber',
  artists: [{
    id: 'streaming:qqmusic:artist:002DYpxl3hW3EP',
    provider: 'qqmusic',
    providerArtistId: '002DYpxl3hW3EP',
    name: 'Justin Bieber',
  }],
  coverUrl: null,
  coverThumb: null,
  releaseDate: '2010-11-19',
  trackCount: 31,
};

const trackSearchResult: StreamingSearchResult = {
  ...searchResult,
  query: '晴天',
  tracks: [track],
  artists: [],
};

const resetStreamingMemory = (): void => {
  updateStreamingSearchMemory({
    provider: 'netease',
    quality: 'max',
    activeTab: 'track',
    input: '',
    query: '',
    result: null,
    failedCoverUrls: {},
    scrollTop: 0,
  });
};

afterEach(() => {
  cleanup();
  resetStreamingMemory();
  window.localStorage.clear();
  vi.restoreAllMocks();
  delete (window as Partial<Window>).echo;
});

describe('StreamingSearchPage artist detail', () => {
  it('opens a streaming artist detail even when cached top tracks miss artist refs', async () => {
    const legacyCachedTrack = { ...track, artists: undefined } as unknown as StreamingTrack;
    const artistDetail: StreamingArtistDetail = {
      ...artist,
      topTracks: [legacyCachedTrack],
      albums: [],
    };

    updateStreamingSearchMemory({
      provider: 'netease',
      quality: 'max',
      activeTab: 'artist',
      input: '周杰伦',
      query: '周杰伦',
      result: searchResult,
      failedCoverUrls: {},
      scrollTop: 0,
    });

    window.echo = {
      streaming: {
        getProviders: vi.fn().mockResolvedValue([provider]),
        search: vi.fn().mockResolvedValue(searchResult),
        getArtist: vi.fn().mockResolvedValue(artistDetail),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <StreamingSearchPage />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /周杰伦/ }));

    expect(await screen.findByRole('heading', { name: '周杰伦' })).toBeTruthy();
    await waitFor(() => expect(window.echo?.streaming?.getArtist).toHaveBeenCalledWith({
      provider: 'netease',
      providerArtistId: 'jay',
    }));
    expect(await screen.findByText('晴天')).toBeTruthy();
    expect(screen.getAllByText('周杰伦').length).toBeGreaterThan(0);
  });

  it('uses QQ Music album metadata when the artist detail name is a provider id', async () => {
    const qqSearchResult: StreamingSearchResult = {
      provider: 'qqmusic',
      query: 'Justin Bieber',
      page: 1,
      pageSize: 30,
      total: 1,
      hasMore: false,
      tracks: [],
      albums: [],
      artists: [qqArtistWithMidName],
      playlists: [],
      mvs: [],
    };
    const artistDetail: StreamingArtistDetail = {
      ...qqArtistWithMidName,
      topTracks: [],
      albums: [qqArtistAlbum],
    };

    updateStreamingSearchMemory({
      provider: 'qqmusic',
      quality: 'max',
      activeTab: 'artist',
      input: 'Justin Bieber',
      query: 'Justin Bieber',
      result: qqSearchResult,
      failedCoverUrls: {},
      scrollTop: 0,
    });

    window.echo = {
      streaming: {
        getProviders: vi.fn().mockResolvedValue([qqProvider]),
        search: vi.fn().mockResolvedValue(qqSearchResult),
        getArtist: vi.fn().mockResolvedValue(artistDetail),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <StreamingSearchPage />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /002DYpxl3hW3EP/ }));

    expect(await screen.findByRole('heading', { name: 'Justin Bieber' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '002DYpxl3hW3EP' })).toBeNull();
    expect(await screen.findByText('My Worlds - The Collection')).toBeTruthy();
  });
});

describe('StreamingSearchPage download visibility', () => {
  const primeTrackSearch = (): void => {
    updateStreamingSearchMemory({
      provider: 'netease',
      quality: 'max',
      activeTab: 'track',
      input: '晴天',
      query: '晴天',
      result: trackSearchResult,
      failedCoverUrls: {},
      scrollTop: 0,
    });
  };

  it('hides streaming download actions by default', async () => {
    primeTrackSearch();

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ streamingDownloadActionsEnabled: false } as AppSettings),
      },
      streaming: {
        getProviders: vi.fn().mockResolvedValue([provider]),
        search: vi.fn().mockResolvedValue(trackSearchResult),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <StreamingSearchPage />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText('晴天')).toBeTruthy();
    await waitFor(() => expect(window.echo?.app?.getSettings).toHaveBeenCalled());
    expect(screen.queryByTitle('下载')).toBeNull();
  });

  it('shows streaming download actions when enabled in settings', async () => {
    primeTrackSearch();

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ streamingDownloadActionsEnabled: true } as AppSettings),
      },
      streaming: {
        getProviders: vi.fn().mockResolvedValue([provider]),
        search: vi.fn().mockResolvedValue(trackSearchResult),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <StreamingSearchPage />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText('晴天')).toBeTruthy();
    expect(await screen.findByTitle('下载')).toBeTruthy();
  });
});
