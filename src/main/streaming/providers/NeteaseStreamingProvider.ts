import type { AccountStatus } from '../../../shared/types/accounts';
import type {
  StreamingArtistRef,
  StreamingLyricsResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
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

const neteaseHeaders = (cookie?: string): Record<string, string> => ({
  Referer: neteaseReferer,
  Origin: 'https://music.163.com',
  ...(cookie ? { Cookie: cookie } : {}),
});

const imageUrl = (value: unknown, size = 300): string | null => {
  const raw = text(value);
  return raw ? `${raw}${raw.includes('?') ? '&' : '?'}param=${size}y${size}` : null;
};

const neteaseImageUrl = (value: unknown, size: number): string | null => streamingImageProxyUrl(imageUrl(value, size), neteaseReferer);

const accountStatus = (): AccountStatus => getAccountService().getStatus(provider);

const accountCookie = (): string | undefined => getAccountService().getCredentials(provider).cookie?.trim() || undefined;

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
    unavailableReason: playable ? null : '这首歌暂时不可播放',
    lyricsStatus: 'available',
    mvStatus: integer(song.mvid ?? song.mv) ? 'available' : 'unknown',
  };
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

  async getLyrics(input: { providerTrackId: string }): Promise<StreamingLyricsResult> {
    const params = new URLSearchParams({ id: input.providerTrackId, lv: '1', kv: '1', tv: '-1', rv: '-1' });
    const data = asRecord(await jsonFetch(`https://music.163.com/api/song/lyric?${params.toString()}`, { headers: neteaseHeaders(accountCookie()) }));
    const lyricText = text(asRecord(data.lrc).lyric);
    const split = splitLyricsByKind(lyricText);
    const lines = linesFromLyrics(split.syncedLyrics, split.plainLyrics);
    const instrumental = data.nolyric === true || data.needDesc === true;

    return {
      provider,
      providerTrackId: input.providerTrackId,
      status: instrumental || split.syncedLyrics || split.plainLyrics || lines.length > 0 ? 'available' : 'missing',
      plainLyrics: split.plainLyrics,
      syncedLyrics: split.syncedLyrics,
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
    const bitrate = request.quality === 'lossless' || request.quality === 'hires' ? 999000 : request.quality === 'standard' ? 128000 : 320000;
    const params = new URLSearchParams({
      ids: JSON.stringify([request.providerTrackId]),
      br: String(bitrate),
    });
    const data = asRecord(
      await jsonFetch(`https://music.163.com/api/song/enhance/player/url?${params.toString()}`, {
        headers: neteaseHeaders(accountCookie()),
      }),
    );
    const source = asRecord((Array.isArray(data.data) ? data.data : [])[0]);
    const url = text(source.url);

    if (!url) {
      throw new Error('这首歌暂时不可播放，可能需要会员或版权不可用');
    }

    const resolvedBitrate = integer(source.br) ?? bitrate;
    const type = text(source.type)?.toLocaleLowerCase() ?? 'mp3';

    return {
      provider,
      providerTrackId: request.providerTrackId,
      url,
      expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      mimeType: type === 'flac' ? 'audio/flac' : 'audio/mpeg',
      bitrate: resolvedBitrate,
      sampleRate: null,
      bitDepth: null,
      codec: type,
      headers: {},
      requiresProxy: false,
      supportsRange: true,
    };
  }
}
