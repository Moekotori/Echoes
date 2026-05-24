import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamingPlaybackSource, StreamingPlaylistDetail, StreamingSearchResult } from '../../shared/types/streaming';
import type { StreamingProvider } from './StreamingProvider';
import { StreamingProviderRegistry } from './StreamingProviderRegistry';
import { StreamingService } from './StreamingService';
import { verifyDownloadAuthorizationToken } from '../downloads/DownloadAuthorization';

const accountState = vi.hoisted(() => ({
  connected: true,
  cookie: 'MUSIC_U=secret; csrf=hidden',
}));

vi.mock('../accounts/AccountService', () => ({
  getAccountService: () => ({
    getStatus: (provider: string) => ({
      provider,
      connected: accountState.connected,
      username: accountState.connected ? 'tester' : null,
      displayName: accountState.connected ? 'Tester' : null,
      avatarUrl: null,
      lastLoginAt: accountState.connected ? '2026-01-01T00:00:00.000Z' : null,
      lastCheckedAt: null,
      expiresAt: null,
      error: null,
    }),
    getCredentials: (provider: string) => ({
      provider,
      cookie: accountState.cookie,
    }),
  }),
}));

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const redirectResponse = (location: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location },
  });

const playlistDetail = (providerPlaylistId: string): StreamingPlaylistDetail => ({
  id: `streaming:qqmusic:playlist:${providerPlaylistId}`,
  provider: 'qqmusic',
  providerPlaylistId,
  title: 'QQ Playlist',
  description: null,
  creator: null,
  coverUrl: null,
  coverThumb: null,
  trackCount: 0,
  tracks: [],
  page: 1,
  pageSize: 500,
  total: 0,
  hasMore: false,
});

const emptyQqSearchResult = (): StreamingSearchResult => ({
  provider: 'qqmusic',
  query: '',
  page: 1,
  pageSize: 20,
  total: 0,
  hasMore: false,
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  mvs: [],
});

const fakeCacheStore = (): ConstructorParameters<typeof StreamingService>[1] =>
  ({
    importStreamingPlaylistPage: (playlist: StreamingPlaylistDetail, options: { startPosition: number }) => ({
      playlist: {
        id: 'playlist-1',
        name: playlist.title,
        description: playlist.description,
        kind: 'synced',
        sourceProvider: playlist.provider,
        sourcePlaylistId: playlist.providerPlaylistId,
        coverId: null,
        coverThumb: playlist.coverThumb,
        sortMode: 'manual',
        itemCount: playlist.tracks.length,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      nextPosition: options.startPosition + playlist.tracks.length,
    }),
  }) as unknown as ConstructorParameters<typeof StreamingService>[1];

describe('StreamingService playlist imports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    accountState.connected = true;
    accountState.cookie = 'MUSIC_U=secret; csrf=hidden';
  });

  it('resolves QQ Music c6 share links before importing playlists', async () => {
    const registry = new StreamingProviderRegistry();
    const getPlaylist = vi.fn(async (input: { providerPlaylistId: string; page?: number; pageSize?: number }) =>
      playlistDetail(input.providerPlaylistId),
    );
    const provider: StreamingProvider = {
      name: 'qqmusic',
      search: vi.fn(async () => emptyQqSearchResult()),
      getTrack: vi.fn(),
      getPlaylist,
      resolvePlayback: vi.fn(),
    };
    registry.register(provider);
    const service = new StreamingService(registry, fakeCacheStore());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        redirectResponse('https://i.y.qq.com/n2/m/share/details/taoge.html?ADTAG=pc_v17&channelId=10036163&id=9712626873&openinqqmusic=1'),
      ),
    );

    const result = await service.importPlaylistFromUrl('https://c6.y.qq.com/base/fcgi-bin/u?__=xJV4sRoZMZIT');

    expect(getPlaylist).toHaveBeenCalledWith({ providerPlaylistId: '9712626873', page: 1, pageSize: 500 });
    expect(result).toMatchObject({
      provider: 'qqmusic',
      providerPlaylistId: '9712626873',
      playlistName: 'QQ Playlist',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://c6.y.qq.com/base/fcgi-bin/u?__=xJV4sRoZMZIT',
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({ Referer: 'https://y.qq.com/' }),
      }),
    );
  });

  it('imports normal QQ Music playlist links without resolving redirects', async () => {
    const registry = new StreamingProviderRegistry();
    const getPlaylist = vi.fn(async (input: { providerPlaylistId: string; page?: number; pageSize?: number }) =>
      playlistDetail(input.providerPlaylistId),
    );
    registry.register({
      name: 'qqmusic',
      search: vi.fn(),
      getTrack: vi.fn(),
      getPlaylist,
      resolvePlayback: vi.fn(),
    });
    const service = new StreamingService(registry, fakeCacheStore());
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));

    const result = await service.importPlaylistFromUrl('https://y.qq.com/n/ryqq/playlist/778899');

    expect(fetch).not.toHaveBeenCalled();
    expect(getPlaylist).toHaveBeenCalledWith({ providerPlaylistId: '778899', page: 1, pageSize: 500 });
    expect(result.providerPlaylistId).toBe('778899');
  });

  it('imports Spotify playlist links without resolving playback URLs', async () => {
    const registry = new StreamingProviderRegistry();
    const getPlaylist = vi.fn(async (input: { providerPlaylistId: string; page?: number; pageSize?: number }): Promise<StreamingPlaylistDetail> => ({
      id: `streaming:spotify:playlist:${input.providerPlaylistId}`,
      provider: 'spotify',
      providerPlaylistId: input.providerPlaylistId,
      title: 'Spotify Playlist',
      description: null,
      creator: null,
      coverUrl: null,
      coverThumb: null,
      trackCount: 0,
      tracks: [],
      page: 1,
      pageSize: 500,
      total: 0,
      hasMore: false,
    }));
    const resolvePlayback = vi.fn();
    registry.register({
      name: 'spotify',
      descriptor: {
        displayName: 'Spotify',
        enabled: true,
        supportsSearch: true,
        supportsPlayback: true,
        supportsDownload: false,
        supportsLyrics: false,
        supportsMv: false,
        requiresAccount: true,
      },
      search: vi.fn(),
      getTrack: vi.fn(),
      getPlaylist,
      resolvePlayback,
    });
    const service = new StreamingService(registry, fakeCacheStore());

    const result = await service.importPlaylistFromUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');

    expect(getPlaylist).toHaveBeenCalledWith({ providerPlaylistId: '37i9dQZF1DXcBWIGoYBM5M', page: 1, pageSize: 500 });
    expect(resolvePlayback).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: 'spotify',
      providerPlaylistId: '37i9dQZF1DXcBWIGoYBM5M',
      playlistName: 'Spotify Playlist',
    });
  });

  it('exposes Spotify as playback-only and not downloadable in provider descriptors', () => {
    const registry = new StreamingProviderRegistry();
    registry.register({
      name: 'spotify',
      descriptor: {
        displayName: 'Spotify',
        enabled: true,
        supportsSearch: true,
        supportsPlayback: true,
        supportsDownload: false,
        supportsLyrics: false,
        supportsMv: false,
        requiresAccount: true,
      },
      search: vi.fn(),
      getTrack: vi.fn(),
      resolvePlayback: vi.fn(),
    });

    expect(registry.list().find((provider) => provider.name === 'spotify')).toMatchObject({
      name: 'spotify',
      supportsPlayback: true,
      supportsDownload: false,
      requiresAccount: true,
    });
  });

  it('attaches a short-lived download authorization to protected playback sources', async () => {
    const registry = new StreamingProviderRegistry();
    registry.register({
      name: 'qqmusic',
      search: vi.fn(),
      getTrack: vi.fn(),
      resolvePlayback: vi.fn(async (): Promise<StreamingPlaybackSource> => ({
        provider: 'qqmusic',
        providerTrackId: 'song-mid',
        url: 'https://isure.stream.qqmusic.qq.com/song.flac',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        mimeType: 'audio/flac',
        bitrate: 999000,
        sampleRate: null,
        bitDepth: 16,
        codec: 'flac',
        headers: {},
        requiresProxy: false,
        supportsRange: true,
      })),
    });
    const service = new StreamingService(registry, fakeCacheStore());

    const source = await service.resolvePlayback({ provider: 'qqmusic', providerTrackId: 'song-mid', quality: 'lossless' });

    expect(source.downloadAuthorizationToken).toEqual(expect.any(String));
    expect(
      verifyDownloadAuthorizationToken(source.downloadAuthorizationToken, {
        provider: 'qqmusic',
        providerTrackId: 'song-mid',
        url: 'https://isure.stream.qqmusic.qq.com/song.flac',
      }),
    ).toBe(true);
  });

  it('does not attach protected download authorization when the platform account is not connected', async () => {
    accountState.connected = false;
    accountState.cookie = '';
    const registry = new StreamingProviderRegistry();
    registry.register({
      name: 'qqmusic',
      search: vi.fn(),
      getTrack: vi.fn(),
      resolvePlayback: vi.fn(async (): Promise<StreamingPlaybackSource> => ({
        provider: 'qqmusic',
        providerTrackId: 'song-mid',
        url: 'https://isure.stream.qqmusic.qq.com/song.flac',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        mimeType: 'audio/flac',
        bitrate: 999000,
        sampleRate: null,
        bitDepth: 16,
        codec: 'flac',
        headers: {},
        requiresProxy: false,
        supportsRange: true,
      })),
    });
    const service = new StreamingService(registry, fakeCacheStore());

    const source = await service.resolvePlayback({ provider: 'qqmusic', providerTrackId: 'song-mid', quality: 'lossless' });

    expect(source.downloadAuthorizationToken).toBeUndefined();
  });

  it('allows playback URL resolution to take longer than normal metadata calls', async () => {
    vi.useFakeTimers();
    const registry = new StreamingProviderRegistry();
    registry.register({
      name: 'netease',
      search: vi.fn(),
      getTrack: vi.fn(),
      resolvePlayback: vi.fn(() =>
        new Promise<StreamingPlaybackSource>((resolve) => {
          setTimeout(() => {
            resolve({
              provider: 'netease',
              providerTrackId: 'song-id',
              url: 'https://m701.music.126.net/token/song.flac',
              expiresAt: new Date(Date.now() + 120_000).toISOString(),
              mimeType: 'audio/flac',
              bitrate: 999000,
              sampleRate: null,
              bitDepth: 16,
              codec: 'flac',
              headers: {},
              requiresProxy: false,
              supportsRange: true,
            });
          }, 11_000);
        })),
    });
    const service = new StreamingService(registry, fakeCacheStore());

    const sourcePromise = service.resolvePlayback({ provider: 'netease', providerTrackId: 'song-id', quality: 'lossless' });
    await vi.advanceTimersByTimeAsync(11_500);

    await expect(sourcePromise).resolves.toMatchObject({
      url: 'https://m701.music.126.net/token/song.flac',
      codec: 'flac',
    });
  });
});
