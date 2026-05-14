import { afterEach, describe, expect, it, vi } from 'vitest';
import { NeteaseStreamingProvider } from './NeteaseStreamingProvider';
import { QQMusicStreamingProvider } from './QQMusicStreamingProvider';

const accountStatus = vi.hoisted(() => ({
  connected: true,
  displayName: 'Tester',
  username: 'tester',
  avatarUrl: null,
}));

vi.mock('../../accounts/AccountService', () => ({
  getAccountService: () => ({
    getStatus: (provider: string) => ({
      provider,
      connected: accountStatus.connected,
      username: accountStatus.username,
      displayName: accountStatus.displayName,
      avatarUrl: accountStatus.avatarUrl,
      lastLoginAt: '2026-01-01T00:00:00.000Z',
      lastCheckedAt: null,
      expiresAt: null,
      error: null,
    }),
    getCredentials: (provider: string) => ({
      provider,
      cookie: provider === 'qqmusic' ? 'uin=o123456; qm_keyst=secret' : 'MUSIC_U=secret; csrf=hidden',
    }),
  }),
}));

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const remoteImageUrl = (url: string, referer: string): string =>
  `echo-image://remote/${encodeURIComponent(url)}?referer=${encodeURIComponent(referer)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  accountStatus.connected = true;
});

describe('China streaming providers', () => {
  it('maps NetEase search results to streaming tracks', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            result: {
              songCount: 1,
              songs: [
                {
                  id: 123,
                  name: '测试歌曲',
                  duration: 181000,
                  artists: [{ id: 1, name: '测试歌手' }],
                  album: { id: 2, name: '测试专辑', picId: 109951 },
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            songs: [
              {
                id: 123,
                album: { picUrl: 'https://p.music.126.net/detail-cover.jpg' },
              },
            ],
          }),
        ),
    );

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: '测试', page: 1, pageSize: 10 });

    expect(result.tracks[0]).toMatchObject({
      provider: 'netease',
      providerTrackId: '123',
      stableKey: 'streaming:netease:123',
      title: '测试歌曲',
      artist: '测试歌手',
      album: '测试专辑',
      duration: 181,
      coverThumb: remoteImageUrl('https://p.music.126.net/detail-cover.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('resolves NetEase playback without returning secret headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: 123,
              url: 'https://m701.music.126.net/token/song.mp3',
              br: 320000,
              type: 'mp3',
            },
          ],
        }),
      ),
    );

    const source = await new NeteaseStreamingProvider().resolvePlayback({ provider: 'netease', providerTrackId: '123', quality: 'high' });

    expect(source).toMatchObject({
      provider: 'netease',
      providerTrackId: '123',
      url: 'https://m701.music.126.net/token/song.mp3',
      headers: {},
      requiresProxy: false,
      supportsRange: true,
    });
  });

  it('maps QQ Music search results to streaming tracks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            song: {
              totalnum: 1,
              list: [
                {
                  mid: 'song-mid',
                  name: '测试歌曲',
                  interval: 180,
                  singer: [{ mid: 'artist-mid', name: '测试歌手' }],
                  album: { mid: 'album-mid', name: '测试专辑' },
                },
              ],
            },
          },
        }),
      ),
    );

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: '测试', page: 1, pageSize: 10 });

    expect(result.tracks[0]).toMatchObject({
      provider: 'qqmusic',
      providerTrackId: 'song-mid',
      stableKey: 'streaming:qqmusic:song-mid',
      title: '测试歌曲',
      artist: '测试歌手',
      album: '测试专辑',
      duration: 180,
      coverThumb: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T002R150x150M000album-mid.jpg', 'https://y.qq.com/'),
    });
  });

  it('resolves QQ Music playback through vkey without leaking account cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              {
                mid: 'song-mid',
                name: '测试歌曲',
                file: { media_mid: 'media-mid' },
                singer: [{ name: '测试歌手' }],
                album: { name: '测试专辑', mid: 'album-mid' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            req_0: {
              data: {
                sip: ['https://isure.stream.qqmusic.qq.com/'],
                midurlinfo: [{ purl: 'M800media-mid.mp3?vkey=temporary' }],
              },
            },
          }),
        ),
    );

    const source = await new QQMusicStreamingProvider().resolvePlayback({ provider: 'qqmusic', providerTrackId: 'song-mid', quality: 'high' });

    expect(source).toMatchObject({
      provider: 'qqmusic',
      providerTrackId: 'song-mid',
      url: 'https://isure.stream.qqmusic.qq.com/M800media-mid.mp3?vkey=temporary',
      headers: {},
      requiresProxy: false,
      supportsRange: true,
    });
  });

  it('exposes account status through provider descriptors', () => {
    accountStatus.connected = false;
    const descriptor = new QQMusicStreamingProvider().descriptor;

    expect(descriptor).toMatchObject({
      requiresAccount: true,
      accountConnected: false,
      status: 'needs_account',
    });
  });
});
