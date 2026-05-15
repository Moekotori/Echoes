import { createRequire } from 'node:module';
import type { AccountStatus } from '../../../shared/types/accounts';
import type {
  StreamingArtistRef,
  StreamingLyricsResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingPlaylistDetail,
  StreamingProviderDescriptor,
  StreamingSearchRequest,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { streamingStableKey } from '../../../shared/types/streaming';
import { getAccountService } from '../../accounts/AccountService';
import type { StreamingProvider } from '../StreamingProvider';
import { asRecord, integer, jsonFetch, linesFromLyrics, number, splitLyricsByKind, streamingImageProxyUrl, text } from './chinaStreamingUtils';

const provider = 'netease' as const;
const neteaseReferer = 'https://music.163.com/';
const loadFromCjs = createRequire(import.meta.url);
const neteaseSongDetailBatchSize = 100;

const neteaseHeaders = (cookie?: string): Record<string, string> => ({
  Referer: neteaseReferer,
  Origin: 'https://music.163.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ...(cookie ? { Cookie: cookie } : {}),
});

type NeteaseRequestedQuality = NonNullable<StreamingPlaybackRequest['quality']> | 'fallback';
type NeteaseApi = {
  playlist_track_all?: (request: Record<string, unknown>) => Promise<{ body?: { songs?: unknown[] } }>;
  recommend_songs?: (request: Record<string, unknown>) => Promise<{ body?: unknown }>;
  song_url_v1?: (request: Record<string, unknown>) => Promise<{ body?: { data?: unknown[] } }>;
};
type NeteaseResolvedSource = {
  url: string;
  type: string;
  br: number;
  level: string;
};
let ncmApiForTests: NeteaseApi | null | undefined;

const neteaseQualityLevels: Record<NeteaseRequestedQuality, Array<{ level: string; bitrate: number; quality: NonNullable<StreamingPlaybackSource['codec']> }>> = {
  hires: [
    { level: 'jymaster', bitrate: 2000000, quality: 'flac' },
    { level: 'sky', bitrate: 1500000, quality: 'flac' },
    { level: 'jyeffect', bitrate: 1500000, quality: 'flac' },
    { level: 'hires', bitrate: 999000, quality: 'flac' },
    { level: 'lossless', bitrate: 999000, quality: 'flac' },
    { level: 'exhigh', bitrate: 320000, quality: 'mp3' },
    { level: 'higher', bitrate: 192000, quality: 'mp3' },
    { level: 'standard', bitrate: 128000, quality: 'mp3' },
  ],
  lossless: [
    { level: 'lossless', bitrate: 999000, quality: 'flac' },
    { level: 'exhigh', bitrate: 320000, quality: 'mp3' },
    { level: 'higher', bitrate: 192000, quality: 'mp3' },
    { level: 'standard', bitrate: 128000, quality: 'mp3' },
  ],
  high: [
    { level: 'exhigh', bitrate: 320000, quality: 'mp3' },
    { level: 'higher', bitrate: 192000, quality: 'mp3' },
    { level: 'standard', bitrate: 128000, quality: 'mp3' },
  ],
  standard: [{ level: 'standard', bitrate: 128000, quality: 'mp3' }],
  fallback: [
    { level: 'exhigh', bitrate: 320000, quality: 'mp3' },
    { level: 'higher', bitrate: 192000, quality: 'mp3' },
    { level: 'standard', bitrate: 128000, quality: 'mp3' },
  ],
};

const imageUrl = (value: unknown, size = 300): string | null => {
  const raw = text(value);
  const normalized = raw?.replace(/^http:\/\//iu, 'https://');
  return normalized ? `${normalized}${normalized.includes('?') ? '&' : '?'}param=${size}y${size}` : null;
};

const neteaseImageUrl = (value: unknown, size: number): string | null => streamingImageProxyUrl(imageUrl(value, size), neteaseReferer);

const accountStatus = (): AccountStatus => getAccountService().getStatus(provider);

const accountCookie = (): string | undefined => getAccountService().getCredentials(provider).cookie?.trim() || undefined;

const getNcmApi = (): NeteaseApi | null => {
  if (ncmApiForTests !== undefined) {
    return ncmApiForTests;
  }

  try {
    return loadFromCjs('@neteasecloudmusicapienhanced/api') as NeteaseApi;
  } catch {
    return null;
  }
};

export const setNeteaseApiForTests = (api: NeteaseApi | null | undefined): void => {
  ncmApiForTests = api;
};

const cookieValue = (cookie: string | undefined, name: string): string | null => {
  if (!cookie) {
    return null;
  }

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`, 'u'));
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const toPlaybackSource = (
  request: StreamingPlaybackRequest,
  source: NeteaseResolvedSource,
  candidate: { bitrate: number; quality: NonNullable<StreamingPlaybackSource['codec']> },
): StreamingPlaybackSource => {
  const type = source.type.toLocaleLowerCase() || candidate.quality || 'mp3';

  return {
    provider,
    providerTrackId: request.providerTrackId,
    url: source.url,
    expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    mimeType: type === 'flac' ? 'audio/flac' : 'audio/mpeg',
    bitrate: source.br || candidate.bitrate,
    sampleRate: null,
    bitDepth: null,
    codec: type,
    headers: {},
    requiresProxy: false,
    supportsRange: true,
  };
};

const resolveWithNcmApi = async (
  request: StreamingPlaybackRequest,
  candidate: { level: string; bitrate: number; quality: NonNullable<StreamingPlaybackSource['codec']> },
  cookie: string | undefined,
): Promise<NeteaseResolvedSource | null> => {
  const ncm = getNcmApi();
  if (!ncm?.song_url_v1) {
    return null;
  }

  const id = Number(request.providerTrackId);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  try {
    const response = await ncm.song_url_v1({
      id,
      level: candidate.level,
      ...(cookie ? { cookie } : {}),
    });
    const entry = asRecord(Array.isArray(response.body?.data) ? response.body?.data[0] : null);
    const url = text(entry.url);
    if (!url) {
      return null;
    }

    return {
      url,
      type: text(entry.type) ?? candidate.quality,
      br: integer(entry.br) ?? candidate.bitrate,
      level: text(entry.level) ?? candidate.level,
    };
  } catch {
    return null;
  }
};

const artistRefs = (artistsValue: unknown): StreamingArtistRef[] => {
  const artists = Array.isArray(artistsValue) ? artistsValue.map(asRecord) : [];
  return artists
    .map((artist): StreamingArtistRef | null => {
      const id = String(artist.id ?? text(artist.name) ?? '').trim();
      const name = text(artist.name);
      if (!id || !name) {
        return null;
      }

      return {
        id: streamingStableKey(provider, `artist:${id}`),
        provider,
        providerArtistId: id,
        name,
      };
    })
    .filter((artist): artist is StreamingArtistRef => Boolean(artist));
};

const mapSong = (songValue: unknown, detailCoverUrl: string | null = null): StreamingTrack => {
  const song = asRecord(songValue);
  const album = asRecord(song.album ?? song.al);
  const artistsValue = song.artists ?? song.ar;
  const artists = artistRefs(artistsValue);
  const providerTrackId = String(song.id ?? '').trim();
  const title = text(song.name) ?? text(song.title) ?? 'Untitled';
  const artist = artists.map((item) => item.name).join(' / ') || 'Unknown Artist';
  const albumTitle = text(album.name) ?? 'Unknown Album';
  const fee = integer(song.fee);
  const noCopyright = song.noCopyrightRcmd != null || song.copyright === 0;
  const playable = !noCopyright;
  const coverSource = detailCoverUrl ?? album.picUrl ?? album.blurPicUrl ?? album.pic;

  return {
    id: streamingStableKey(provider, providerTrackId || title),
    provider,
    providerTrackId: providerTrackId || title,
    stableKey: streamingStableKey(provider, providerTrackId || title),
    title,
    artist,
    artists,
    album: albumTitle,
    albumId: album.id == null ? null : String(album.id),
    albumArtist: artist,
    duration: (number(song.duration ?? song.dt) ?? 0) > 0 ? (number(song.duration ?? song.dt) ?? 0) / 1000 : null,
    coverUrl: neteaseImageUrl(coverSource, 600),
    coverThumb: neteaseImageUrl(coverSource, 160),
    qualities: fee === 1 ? ['standard', 'high'] : ['standard', 'high', 'lossless'],
    explicit: false,
    playable,
    unavailableReason: playable ? null : 'This NetEase track is temporarily unavailable.',
    lyricsStatus: 'available',
    mvStatus: integer(song.mvid ?? song.mv) ? 'available' : 'unknown',
  };
};

const dailyRecommendSongs = (value: unknown): unknown[] => {
  const body = asRecord(value);
  const data = asRecord(body.data);
  if (Array.isArray(data.dailySongs)) {
    return data.dailySongs;
  }

  if (Array.isArray(body.recommend)) {
    return body.recommend;
  }

  return [];
};

export class NeteaseStreamingProvider implements StreamingProvider {
  readonly name = provider;

  get descriptor(): Omit<StreamingProviderDescriptor, 'name'> {
    const status = accountStatus();
    return {
      displayName: '网易云音乐',
      enabled: true,
      supportsSearch: true,
      supportsPlayback: true,
      supportsLyrics: true,
      supportsMv: true,
      requiresAccount: true,
      accountConnected: status.connected,
      accountDisplayName: status.displayName,
      accountUsername: status.username,
      accountAvatarUrl: status.avatarUrl,
      status: status.connected ? 'ready' : 'needs_account',
      statusMessage: status.connected ? '已连接网易云音乐账号' : '可搜索公开结果，登录后播放能力更完整',
    };
  }

  async search(request: StreamingSearchRequest): Promise<StreamingSearchResult> {
    const page = Math.max(1, Math.floor(request.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(request.pageSize ?? 20)));
    const params = new URLSearchParams({
      type: '1',
      s: request.query,
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    const data = asRecord(await jsonFetch(`https://music.163.com/api/search/get/web?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
    const result = asRecord(data.result);
    const songs = Array.isArray(result.songs) ? result.songs : [];
    const total = integer(result.songCount);
    const detailCoverUrls = await this.findDetailCoverUrls(
      songs.map((songValue) => asRecord(songValue).id).filter((id) => id !== undefined && id !== null),
    );

    return {
      provider,
      query: request.query,
      page,
      pageSize,
      total,
      hasMore: total ? page * pageSize < total : songs.length === pageSize,
      tracks: songs.map((song) => mapSong(song, detailCoverUrls.get(String(asRecord(song).id)) ?? null)),
      albums: [],
      artists: [],
      playlists: [],
      mvs: [],
    };
  }

  async getTrack(input: { providerTrackId: string }): Promise<StreamingTrack> {
    const params = new URLSearchParams({ id: input.providerTrackId, ids: JSON.stringify([input.providerTrackId]) });
    const data = asRecord(await jsonFetch(`https://music.163.com/api/song/detail/?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
    const songs = Array.isArray(data.songs) ? data.songs : [];
    const song = songs[0];
    if (!song) {
      throw new Error('没有找到这首网易云音乐歌曲');
    }

    return mapSong(song);
  }

  async getPlaylist(input: { providerPlaylistId: string; page?: number; pageSize?: number }): Promise<StreamingPlaylistDetail> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(input.pageSize ?? 100)));
    const params = new URLSearchParams({ id: input.providerPlaylistId });
    const data = asRecord(
      await jsonFetch(`https://music.163.com/api/v6/playlist/detail?${params.toString()}`, {
        headers: neteaseHeaders(accountCookie()),
        timeoutMs: 12_000,
      }),
    );
    const playlist = asRecord(data.playlist ?? data.result);
    const trackIds = Array.isArray(playlist.trackIds)
      ? playlist.trackIds.map((item) => String(asRecord(item).id ?? '').trim()).filter(Boolean)
      : [];
    const embeddedTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    const total = trackIds.length || integer(playlist.trackCount) || embeddedTracks.length;
    const offset = (page - 1) * pageSize;
    const pageTrackIds = trackIds.slice(offset, offset + pageSize);
    let tracks = embeddedTracks.slice(offset, offset + pageSize);

    if (pageTrackIds.length > 0) {
      tracks = await this.fetchPlaylistTrackPage(input.providerPlaylistId, offset, pageSize, pageTrackIds).catch(() => tracks);
    }

    const consumedCount = pageTrackIds.length || tracks.length;

    return {
      id: streamingStableKey(provider, `playlist:${input.providerPlaylistId}`),
      provider,
      providerPlaylistId: input.providerPlaylistId,
      title: text(playlist.name) ?? 'NetEase Playlist',
      description: text(playlist.description),
      creator: text(asRecord(playlist.creator).nickname),
      coverUrl: neteaseImageUrl(playlist.coverImgUrl ?? playlist.picUrl, 600),
      coverThumb: neteaseImageUrl(playlist.coverImgUrl ?? playlist.picUrl, 160),
      trackCount: total,
      tracks: tracks.map((track) => mapSong(track)),
      page,
      pageSize,
      total,
      hasMore: offset + consumedCount < total,
    };
  }

  async getDailyRecommendPlaylist(): Promise<StreamingPlaylistDetail> {
    const cookie = accountCookie();
    if (!cookie) {
      throw new Error('Please connect a NetEase Cloud Music account before loading daily recommendations.');
    }

    const ncm = getNcmApi();
    let body: unknown = null;
    if (ncm?.recommend_songs) {
      const response = await ncm.recommend_songs({ cookie });
      body = response.body;
    } else {
      body = await jsonFetch('https://music.163.com/api/v3/discovery/recommend/songs', {
        headers: neteaseHeaders(cookie),
        timeoutMs: 12_000,
      });
    }

    const songs = dailyRecommendSongs(body);
    if (songs.length === 0) {
      const data = asRecord(asRecord(body).data);
      const message = text(data.message) ?? text(asRecord(body).message) ?? text(asRecord(body).msg);
      throw new Error(message ?? 'NetEase daily recommendations returned no songs.');
    }

    const tracks = songs.map((song) => mapSong(song));

    return {
      id: streamingStableKey(provider, 'playlist:daily-recommend'),
      provider,
      providerPlaylistId: 'daily-recommend',
      title: '每日推荐',
      description: '根据网易云音乐账号生成，每天 6:00 更新。',
      creator: accountStatus().displayName ?? accountStatus().username ?? null,
      coverUrl: tracks[0]?.coverUrl ?? null,
      coverThumb: tracks[0]?.coverThumb ?? null,
      trackCount: songs.length,
      tracks,
      page: 1,
      pageSize: songs.length,
      total: songs.length,
      hasMore: false,
    };
  }

  private async findDetailCoverUrls(songIds: unknown[]): Promise<Map<string, string>> {
    const ids = songIds.map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) {
      return new Map();
    }

    try {
      const params = new URLSearchParams({ id: ids[0], ids: JSON.stringify(ids) });
      const data = asRecord(await jsonFetch(`https://music.163.com/api/song/detail/?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
      const songs = Array.isArray(data.songs) ? data.songs : [];
      return new Map(
        songs
          .map((songValue): [string, string] | null => {
            const song = asRecord(songValue);
            const album = asRecord(song.album ?? song.al);
            const coverUrl = text(album.picUrl ?? album.blurPicUrl ?? album.pic);
            return coverUrl ? [String(song.id), coverUrl] : null;
          })
          .filter((entry): entry is [string, string] => Boolean(entry)),
      );
    } catch {
      return new Map();
    }
  }

  private async fetchSongs(songIds: string[]): Promise<unknown[]> {
    if (songIds.length === 0) {
      return [];
    }

    const songs: unknown[] = [];
    for (let index = 0; index < songIds.length; index += neteaseSongDetailBatchSize) {
      const batchIds = songIds.slice(index, index + neteaseSongDetailBatchSize);
      const params = new URLSearchParams({ id: batchIds[0], ids: JSON.stringify(batchIds) });
      const data = asRecord(
        await jsonFetch(`https://music.163.com/api/song/detail/?${params.toString()}`, {
          headers: neteaseHeaders(accountCookie()),
          timeoutMs: 12_000,
        }),
      );
      if (Array.isArray(data.songs)) {
        songs.push(...data.songs);
      }
    }

    return songs;
  }

  private async fetchPlaylistTrackPage(playlistId: string, offset: number, limit: number, fallbackSongIds: string[]): Promise<unknown[]> {
    const ncm = getNcmApi();
    const cookie = accountCookie();
    if (ncm?.playlist_track_all) {
      try {
        const response = await ncm.playlist_track_all({
          id: playlistId,
          limit,
          offset,
          ...(cookie ? { cookie } : {}),
        });
        if (Array.isArray(response.body?.songs) && response.body.songs.length > 0) {
          return response.body.songs;
        }
      } catch {
        // Fall back to the public song detail endpoint below.
      }
    }

    return this.fetchSongs(fallbackSongIds);
  }

  async getLyrics(input: { providerTrackId: string }): Promise<StreamingLyricsResult> {
    const params = new URLSearchParams({ id: input.providerTrackId, lv: '1', kv: '1', tv: '1', rv: '1' });
    const data = asRecord(await jsonFetch(`https://music.163.com/api/song/lyric?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
    const lyricText = text(asRecord(data.lrc).lyric);
    const translationLyrics = text(asRecord(data.tlyric).lyric);
    const romanizationLyrics = text(asRecord(data.romalrc).lyric);
    const split = splitLyricsByKind(lyricText);
    const lines = linesFromLyrics(split.syncedLyrics, split.plainLyrics, translationLyrics, romanizationLyrics);
    const instrumental = data.nolyric === true || data.needDesc === true;

    return {
      provider,
      providerTrackId: input.providerTrackId,
      status: instrumental || split.syncedLyrics || split.plainLyrics || lines.length > 0 ? 'available' : 'missing',
      plainLyrics: split.plainLyrics,
      syncedLyrics: split.syncedLyrics,
      translationLyrics,
      romanizationLyrics,
      lines,
      sourceLabel: '网易云音乐',
    };
  }

  async getMv(input: { providerTrackId: string }): Promise<StreamingMvResult> {
    const track = await this.getTrack(input);
    const params = new URLSearchParams({ id: input.providerTrackId, ids: JSON.stringify([input.providerTrackId]) });
    const data = asRecord(await jsonFetch(`https://music.163.com/api/song/detail/?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
    const song = asRecord((Array.isArray(data.songs) ? data.songs : [])[0]);
    const mvId = integer(song.mv ?? song.mvid);

    if (!mvId) {
      return { provider, providerTrackId: input.providerTrackId, status: 'missing', items: [] };
    }

    return {
      provider,
      providerTrackId: input.providerTrackId,
      status: 'available',
      items: [
        {
          id: streamingStableKey(provider, `mv:${mvId}`),
          provider,
          providerMvId: String(mvId),
          providerTrackId: input.providerTrackId,
          title: `${track.title} MV`,
          artist: track.artist,
          duration: track.duration,
          thumbnailUrl: track.coverThumb,
        },
      ],
    };
  }

  async resolvePlayback(request: StreamingPlaybackRequest): Promise<StreamingPlaybackSource> {
    const cookie = accountCookie();
    const csrfToken = cookieValue(cookie, '__csrf') ?? cookieValue(cookie, 'csrf') ?? '';
    const candidates = neteaseQualityLevels[request.quality ?? 'fallback'] ?? neteaseQualityLevels.fallback;
    let lastSource: Record<string, unknown> = {};
    const attemptedLevels: string[] = [];

    for (const candidate of candidates) {
      attemptedLevels.push(candidate.level);
      const ncmSource = await resolveWithNcmApi(request, candidate, cookie);
      if (ncmSource) {
        return toPlaybackSource(request, ncmSource, candidate);
      }

      const params = new URLSearchParams({
        ids: JSON.stringify([request.providerTrackId]),
        level: candidate.level,
        br: String(candidate.bitrate),
        encodeType: candidate.quality === 'flac' ? 'flac' : 'mp3',
        csrf_token: csrfToken,
        os: 'pc',
      });
      const data = asRecord(
        await jsonFetch(`https://music.163.com/api/song/enhance/player/url/v1?${params.toString()}`, {
          headers: neteaseHeaders(cookie),
        }).catch(() =>
          jsonFetch(`https://music.163.com/api/song/enhance/player/url?${params.toString()}`, {
            headers: neteaseHeaders(cookie),
          }),
        ),
      );
      const source = asRecord((Array.isArray(data.data) ? data.data : [])[0]);
      lastSource = source;
      const url = text(source.url);
      if (url) {
        return toPlaybackSource(
          request,
          {
            url,
            type: text(source.type)?.toLocaleLowerCase() ?? candidate.quality,
            br: integer(source.br) ?? candidate.bitrate,
            level: text(source.level) ?? candidate.level,
          },
          candidate,
        );
      }
    }

    const message = text(lastSource.message) ?? text(lastSource.msg) ?? null;
    const code = integer(lastSource.code);
    throw new Error(message ?? `这首歌暂时不可播放，已尝试 ${attemptedLevels.join(' / ')} 音质${code ? `（网易返回 ${code}）` : ''}`);
  }
}

