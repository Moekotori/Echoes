import type { AccountStatus } from '../../../shared/types/accounts';
import type {
  StreamingAlbum,
  StreamingAlbumDetail,
  StreamingArtist,
  StreamingArtistDetail,
  StreamingArtistRef,
  StreamingLyricsResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingPlaylist,
  StreamingPlaylistDetail,
  StreamingProviderDescriptor,
  StreamingSearchRequest,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { streamingStableKey } from '../../../shared/types/streaming';
import { getAccountService } from '../../accounts/AccountService';
import type { StreamingProvider } from '../StreamingProvider';
import { streamingSearchQueryVariants } from '../StreamingSearchQueryVariants';
import { asRecord, integer, jsonFetch, linesFromLyrics, maybeDecodeBase64, number, splitLyricsByKind, streamingImageProxyUrl, text } from './chinaStreamingUtils';

const provider = 'qqmusic' as const;
const qqReferer = 'https://y.qq.com/';

const qqHeaders = (cookie?: string): Record<string, string> => ({
  Referer: qqReferer,
  Origin: 'https://y.qq.com',
  ...(cookie ? { Cookie: cookie } : {}),
});

const accountStatus = (): AccountStatus => getAccountService().getStatus(provider);

const accountCookie = (): string | undefined => getAccountService().getCredentials(provider).cookie?.trim() || undefined;

const cookieValue = (cookie: string | undefined, ...names: string[]): string | null => {
  if (!cookie) {
    return null;
  }

  for (const name of names) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`, 'iu'));
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }

  return null;
};

const uinFromCookie = (cookie?: string): string => {
  const value = cookieValue(cookie, 'uin', 'qqmusic_uin', 'p_uin', 'pt2gguin', 'loginUin', 'wxuin');
  const match = value?.match(/o?(\d+)/iu);
  return match?.[1] ?? '0';
};

const hasQqPlaybackCredential = (cookie?: string): boolean =>
  Boolean(cookieValue(cookie, 'qqmusic_key', 'qm_keyst', 'music_key', 'p_skey', 'skey'));

const hasConnectedQqPlaybackAccount = (): boolean => {
  const status = accountStatus();
  const cookie = accountCookie();
  return status.connected && uinFromCookie(cookie) !== '0' && hasQqPlaybackCredential(cookie);
};

const stableNumericId = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return String(100000000 + (hash >>> 0) % 900000000);
};

const qqGuidFromCookie = (cookie: string | undefined, uin: string): string =>
  cookieValue(cookie, 'pgv_pvid', 'qqmusic_guid', 'guid')?.replace(/\D/gu, '') || stableNumericId(uin !== '0' ? uin : cookie ?? 'qqmusic');

const qqGtkFromCookie = (cookie: string | undefined): number => {
  const skey = cookieValue(cookie, 'qqmusic_key', 'qm_keyst', 'music_key', 'p_skey', 'skey') ?? '';
  let hash = 5381;
  for (const char of skey) {
    hash += (hash << 5) + char.charCodeAt(0);
  }

  return hash & 0x7fffffff;
};

const findPlaylistRecords = (value: unknown, depth = 0): Record<string, unknown>[] => {
  if (depth > 8 || !value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findPlaylistRecords(item, depth + 1));
  }

  const record = asRecord(value);
  const title = text(record.dissname) ?? text(record.dirName) ?? text(record.name) ?? text(record.title);
  const id = text(record.dissid) ?? text(record.disstid) ?? text(record.tid) ?? text(record.dirid);
  const current = title && id ? [record] : [];

  return [...current, ...Object.values(record).flatMap((item) => findPlaylistRecords(item, depth + 1))];
};

const assertQqWriteSuccess = (value: unknown, fallback: string): void => {
  const body = asRecord(value);
  const rawCode = body.code ?? body.retcode ?? body.result;
  const code = rawCode === undefined || rawCode === null || rawCode === '' ? null : Number(rawCode);
  if (code !== null && Number.isFinite(code) && code !== 0) {
    throw new Error(text(body.message) ?? text(body.msg) ?? `${fallback} (${code})`);
  }
};

const songIdFromSong = (songValue: unknown): string | null => {
  const song = asRecord(songValue);
  const id = song.id ?? song.songid ?? song.songId;
  return id === undefined || id === null ? null : String(id).trim() || null;
};

const albumCoverUrl = (albumMid: string | null, size = 300): string | null =>
  albumMid
    ? streamingImageProxyUrl(`https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albumMid}.jpg`, qqReferer)
    : null;

const artistRefs = (singersValue: unknown): StreamingArtistRef[] => {
  const singers = Array.isArray(singersValue) ? singersValue.map(asRecord) : [];
  return singers
    .map((singer): StreamingArtistRef | null => {
      const id = String(singer.mid ?? singer.singerMID ?? singer.singermid ?? singer.singer_mid ?? singer.pmid ?? singer.id ?? text(singer.name) ?? '').trim();
      const name = text(singer.name);
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

const mapSong = (songValue: unknown): StreamingTrack => {
  const song = asRecord(songValue);
  const album = asRecord(song.album);
  const file = asRecord(song.file);
  const artists = artistRefs(song.singer);
  const mid = text(song.mid) ?? text(song.songmid) ?? text(file.media_mid) ?? String(song.id ?? song.songid ?? text(song.name) ?? text(song.songname) ?? '').trim();
  const title = text(song.name) ?? text(song.title) ?? text(song.songname) ?? text(song.songorig) ?? 'Untitled';
  const artist = artists.map((item) => item.name).join(' / ') || 'Unknown Artist';
  const albumTitle = text(album.name) ?? text(album.title) ?? text(song.albumname) ?? text(song.albumtitle) ?? 'Unknown Album';
  const albumMid = text(album.mid) ?? text(album.pmid) ?? text(song.albummid) ?? text(song.album_mid);
  const pay = asRecord(song.pay);
  const action = asRecord(song.action);
  const payPlay = integer(pay.pay_play ?? pay.payplay ?? pay.payPlay ?? song.pay_play ?? song.payplay ?? song.payPlay);
  const msgPay = integer(action.msgpay ?? action.msgPay ?? song.msgpay ?? song.msgPay);
  const paidPlaybackRequired = payPlay === 1 || Boolean(msgPay && msgPay > 0);
  const hasPlaybackAccount = hasConnectedQqPlaybackAccount();
  const disabled = song.disabled === true || song.disabled === 1 || song.disabled === '1';
  const playable = !disabled && (!paidPlaybackRequired || hasPlaybackAccount);

  return {
    id: streamingStableKey(provider, mid || title),
    provider,
    providerTrackId: mid || title,
    stableKey: streamingStableKey(provider, mid || title),
    title,
    artist,
    artists,
    album: albumTitle,
    albumId: text(album.mid) ?? (album.id == null ? null : String(album.id)),
    albumArtist: artist,
    duration: number(song.interval),
    coverUrl: albumCoverUrl(albumMid, 500),
    coverThumb: albumCoverUrl(albumMid, 150),
    qualities: paidPlaybackRequired && !hasPlaybackAccount ? ['standard'] : ['standard', 'high', 'lossless'],
    explicit: false,
    playable,
    unavailableReason: playable ? null : '需要 QQ 音乐会员或当前版权不可播放。',
    lyricsStatus: 'available',
    mvStatus: text(asRecord(song.mv).vid) ? 'available' : 'unknown',
  };
};

const qualityPrefix = (quality: StreamingPlaybackRequest['quality']): { prefix: string; extension: string; codec: string; mimeType: string; bitrate: number } => {
  if (quality === 'lossless' || quality === 'hires') {
    return { prefix: 'F000', extension: 'flac', codec: 'flac', mimeType: 'audio/flac', bitrate: 999000 };
  }
  if (quality === 'standard') {
    return { prefix: 'M500', extension: 'mp3', codec: 'mp3', mimeType: 'audio/mpeg', bitrate: 128000 };
  }

  return { prefix: 'M800', extension: 'mp3', codec: 'mp3', mimeType: 'audio/mpeg', bitrate: 320000 };
};

const mapAlbum = (albumValue: unknown): StreamingAlbum => {
  const album = asRecord(albumValue);
  const albumMid = text(album.albumMID) ?? text(album.album_mid) ?? text(album.mid) ?? text(album.albumid);
  const title = text(album.albumName) ?? text(album.albumname) ?? text(album.name) ?? 'Unknown Album';
  const singerList = album.singer_list ?? album.singer ?? album.singers;
  const artists = artistRefs(singerList);
  const artist = artists.map((item) => item.name).join(' / ') || text(album.singerName) || text(album.singername) || 'Unknown Artist';

  return {
    id: streamingStableKey(provider, `album:${albumMid || title}`),
    provider,
    providerAlbumId: albumMid || title,
    title,
    artist,
    artists,
    coverUrl: albumCoverUrl(albumMid, 500),
    coverThumb: albumCoverUrl(albumMid, 150),
    releaseDate: text(album.publicTime) ?? text(album.publishDate) ?? text(album.pub_time),
    trackCount: integer(album.song_count ?? album.songCount ?? album.total),
  };
};

const mapArtist = (artistValue: unknown): StreamingArtist => {
  const artist = asRecord(artistValue);
  const artistMid = text(artist.singerMID) ?? text(artist.singermid) ?? text(artist.mid) ?? text(artist.singer_id);
  const name = text(artist.singerName) ?? text(artist.singername) ?? text(artist.name) ?? 'Unknown Artist';
  const avatar = text(artist.singerPic) ?? text(artist.pic) ?? (artistMid ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${artistMid}.jpg` : null);

  return {
    id: streamingStableKey(provider, `artist:${artistMid || name}`),
    provider,
    providerArtistId: artistMid || name,
    name,
    avatarUrl: avatar ? streamingImageProxyUrl(avatar, qqReferer) : null,
    coverUrl: avatar ? streamingImageProxyUrl(avatar, qqReferer) : null,
  };
};

const artistFromRef = (artist: StreamingArtistRef): StreamingArtist => ({
  id: streamingStableKey(provider, `artist:${artist.providerArtistId}`),
  provider,
  providerArtistId: artist.providerArtistId,
  name: artist.name,
  avatarUrl: null,
  coverUrl: null,
});

const uniqueArtistsFromTracks = (tracks: StreamingTrack[]): StreamingArtist[] => {
  const artistsById = new Map<string, StreamingArtist>();
  for (const track of tracks) {
    for (const artist of track.artists) {
      if (!artistsById.has(artist.providerArtistId)) {
        artistsById.set(artist.providerArtistId, artistFromRef(artist));
      }
    }
  }

  return [...artistsById.values()];
};

const mapPlaylist = (playlistValue: unknown): StreamingPlaylist => {
  const playlist = asRecord(playlistValue);
  const providerPlaylistId = text(playlist.dissid) ?? text(playlist.disstid) ?? text(playlist.id) ?? text(playlist.tid) ?? text(playlist.dirid) ?? text(playlist.name) ?? 'playlist';
  const title = text(playlist.dissname) ?? text(playlist.dirName) ?? text(playlist.name) ?? text(playlist.title) ?? 'QQ Music Playlist';
  const rawCover = text(playlist.imgurl) ?? text(playlist.logo) ?? text(playlist.picurl) ?? text(playlist.cover_url) ?? text(playlist.coverUrl);

  return {
    id: streamingStableKey(provider, `playlist:${providerPlaylistId}`),
    provider,
    providerPlaylistId,
    title,
    description: text(playlist.introduction) ?? text(playlist.desc) ?? text(playlist.description),
    creator: text(playlist.creator) ?? text(playlist.nickname) ?? text(playlist.username) ?? text(playlist.dissCreator),
    coverUrl: rawCover ? streamingImageProxyUrl(rawCover, qqReferer) : null,
    coverThumb: rawCover ? streamingImageProxyUrl(rawCover, qqReferer) : null,
    trackCount: integer(playlist.song_count ?? playlist.songCount ?? playlist.songnum ?? playlist.total_song_num),
  };
};

const qqSearchType = (request: StreamingSearchRequest): number => {
  const mediaType = request.mediaTypes?.[0] ?? 'track';
  if (mediaType === 'album') {
    return 8;
  }
  if (mediaType === 'artist') {
    return 9;
  }
  if (mediaType === 'playlist') {
    return 3;
  }
  return 0;
};

type QqPlaybackQuality = NonNullable<StreamingPlaybackRequest['quality']>;
type QqVkeyResult = {
  item: Record<string, unknown>;
  payload: Record<string, unknown>;
};

type QqPlaybackEndpoint = {
  module: string;
  method: string;
  modern: boolean;
  platforms: readonly (string | null)[];
};

const qqPlaybackQualityFallbacks: Record<QqPlaybackQuality | 'fallback', QqPlaybackQuality[]> = {
  hires: ['lossless', 'high', 'standard'],
  lossless: ['lossless', 'high', 'standard'],
  high: ['high', 'standard'],
  standard: ['standard'],
  fallback: ['high', 'standard'],
};

const qqPlaybackPlatforms = ['20', 'yqq'] as const;
const qqPlaybackEndpoints: readonly QqPlaybackEndpoint[] = [
  { module: 'music.vkey.GetVkey', method: 'UrlGetVkey', modern: true, platforms: [null] },
  { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', modern: false, platforms: qqPlaybackPlatforms },
];

const qqPlaybackFilenames = (
  selectedQuality: ReturnType<typeof qualityPrefix>,
  mediaMid: string | null,
  providerTrackId: string,
): string[] => {
  const primaryId = mediaMid ?? providerTrackId;
  const candidates = [`${selectedQuality.prefix}${primaryId}.${selectedQuality.extension}`];
  if (!mediaMid) {
    candidates.push(`${selectedQuality.prefix}${providerTrackId}${providerTrackId}.${selectedQuality.extension}`);
  }

  return [...new Set(candidates)];
};

const qqPlaybackFailureMessage = (lastResult: QqVkeyResult | null): string => {
  const requestCode = Number(lastResult?.payload.code);
  const rawResult = lastResult?.item.result ?? lastResult?.payload.result ?? lastResult?.payload.code;
  const result = Number(rawResult);
  const returnedUin = text(lastResult?.payload.uin);
  const loginKey = text(lastResult?.payload.login_key);
  if (requestCode === 1000 || (result === 104003 && !returnedUin && !loginKey)) {
    return 'QQ 音乐登录凭证已过期，当前 Cookie 已不能换取会员播放地址。请在设置里重新登录 QQ 音乐后再试。';
  }
  if (result === 104003) {
    return 'QQ 音乐返回无播放权限（104003）。请确认当前登录的是已开通会员的 QQ 音乐账号，并在设置里重新登录 QQ 音乐后再试。';
  }
  if (result === 104013) {
    return 'QQ 音乐限制当前设备播放（104013）。请稍后重试，或在设置里重新登录 QQ 音乐后再试。';
  }

  const message = text(lastResult?.item.msg) ?? text(lastResult?.item.message) ?? text(lastResult?.payload.msg) ?? text(lastResult?.payload.message);
  if (message && !/^\d{1,3}(?:\.\d{1,3}){3};/u.test(message)) {
    return message;
  }
  if (Number.isFinite(result) && result > 0) {
    return `QQ 音乐暂时没有返回播放地址（${result}）。若你已开通会员，请在设置里重新登录 QQ 音乐后再试。`;
  }

  return '这首歌暂时不可播放。若你已开通 QQ 音乐会员，请在设置里重新登录 QQ 音乐后再试。';
};

export class QQMusicStreamingProvider implements StreamingProvider {
  readonly name = provider;

  get descriptor(): Omit<StreamingProviderDescriptor, 'name'> {
    const status = accountStatus();
    return {
      displayName: 'QQ 音乐',
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
      statusMessage: status.connected ? 'QQ Music account connected' : 'Public search is available. Sign in for full playback support.',
    };
  }

  async search(request: StreamingSearchRequest): Promise<StreamingSearchResult> {
    const variants = (request.page ?? 1) === 1 ? streamingSearchQueryVariants(request.query) : [request.query];
    let firstResult: StreamingSearchResult | null = null;

    for (const query of variants) {
      const result = await this.searchOnce({ ...request, query });
      firstResult ??= result;
      if (result.tracks.length > 0 || result.albums.length > 0 || result.artists.length > 0 || result.playlists.length > 0) {
        return { ...result, query: request.query };
      }
    }

    if ((request.mediaTypes?.[0] ?? 'track') === 'artist' && (request.page ?? 1) === 1) {
      for (const query of variants) {
        const trackResult = await this.searchOnce({ ...request, query, mediaTypes: ['track'] });
        const artists = uniqueArtistsFromTracks(trackResult.tracks);
        if (artists.length > 0) {
          return {
            ...trackResult,
            query: request.query,
            tracks: [],
            albums: [],
            artists: artists.slice(0, request.pageSize ?? 20),
            playlists: [],
            mvs: [],
            total: artists.length,
            hasMore: false,
          };
        }
      }
    }

    return firstResult ? { ...firstResult, query: request.query } : this.searchOnce(request);
  }

  private async searchOnce(request: StreamingSearchRequest): Promise<StreamingSearchResult> {
    const page = Math.max(1, Math.floor(request.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(request.pageSize ?? 20)));
    const searchType = qqSearchType(request);
    const body = {
      comm: {
        ct: '19',
        cv: '1859',
        uin: uinFromCookie(accountCookie()),
      },
      req_1: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          query: request.query,
          page_num: page,
          num_per_page: pageSize,
          search_type: searchType,
        },
      },
    };
    const data = asRecord(
      await jsonFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: qqHeaders(accountCookie()),
        body,
      }),
    );
    const payload = asRecord(asRecord(data.req_1).data);
    const bodyData = asRecord(payload.body);
    const songData = asRecord(bodyData.song);
    const albumData = asRecord(bodyData.album);
    const singerData = asRecord(bodyData.singer);
    const playlistData = asRecord(bodyData.songlist ?? bodyData.playlist ?? bodyData.mv);
    const meta = asRecord(payload.meta);
    const songs = Array.isArray(songData.list) ? songData.list : [];
    const albums = Array.isArray(albumData.list) ? albumData.list : [];
    const artists = Array.isArray(singerData.list) ? singerData.list : [];
    const playlistRecords = Array.isArray(playlistData.list)
      ? playlistData.list
      : Array.isArray(playlistData.itemlist)
        ? playlistData.itemlist
        : searchType === 3
          ? findPlaylistRecords(bodyData)
          : [];
    const total =
      searchType === 8
        ? integer(albumData.totalnum ?? albumData.total ?? meta.sum ?? meta.estimate_sum)
        : searchType === 9
          ? integer(singerData.totalnum ?? singerData.total ?? meta.sum ?? meta.estimate_sum)
          : searchType === 3
            ? integer(playlistData.totalnum ?? playlistData.total ?? meta.sum ?? meta.estimate_sum)
          : integer(songData.totalnum ?? songData.total ?? meta.sum ?? meta.estimate_sum);

    return {
      provider,
      query: request.query,
      page,
      pageSize,
      total,
      hasMore: total ? page * pageSize < total : Math.max(songs.length, albums.length, artists.length, playlistRecords.length) === pageSize,
      tracks: songs.map(mapSong),
      albums: albums.map(mapAlbum),
      artists: artists.map(mapArtist),
      playlists: playlistRecords.map(mapPlaylist),
      mvs: [],
    };
  }

  async getTrack(input: { providerTrackId: string }): Promise<StreamingTrack> {
    const song = await this.fetchSong(input.providerTrackId);
    return mapSong(song);
  }

  private async fetchArtistDetail(providerArtistId: string, cookie: string | undefined): Promise<StreamingArtistDetail> {
    const [tracksData, albumsData] = await Promise.all([
      jsonFetch(
        `https://c.y.qq.com/v8/fcg-bin/fcg_v8_singer_track_cp.fcg?${new URLSearchParams({
          singermid: providerArtistId,
          begin: '0',
          num: '30',
          order: 'listen',
          format: 'json',
        }).toString()}`,
        { headers: qqHeaders(cookie) },
      ),
      jsonFetch(
        `https://c.y.qq.com/v8/fcg-bin/fcg_v8_singer_album.fcg?${new URLSearchParams({
          singermid: providerArtistId,
          begin: '0',
          num: '24',
          format: 'json',
        }).toString()}`,
        { headers: qqHeaders(cookie) },
      ),
    ]);
    const tracksRoot = asRecord(asRecord(tracksData).data ?? tracksData);
    const albumsRoot = asRecord(asRecord(albumsData).data ?? albumsData);
    const singer = asRecord(tracksRoot.singer ?? albumsRoot.singer);
    const artist = mapArtist({
      ...singer,
      singerMID: text(singer.mid) ?? text(singer.singerMID) ?? providerArtistId,
      singerName: text(singer.name) ?? text(singer.singerName),
    });
    const topTracks = (Array.isArray(tracksRoot.list) ? tracksRoot.list : [])
      .map((item) => asRecord(item).musicData ?? item)
      .map(mapSong);
    const albums = (Array.isArray(albumsRoot.list) ? albumsRoot.list : [])
      .map((item) => asRecord(item).album ?? item)
      .map(mapAlbum);

    return {
      ...artist,
      topTracks,
      albums,
    };
  }

  async getAlbum(input: { providerAlbumId: string }): Promise<StreamingAlbumDetail> {
    const params = new URLSearchParams({
      albummid: input.providerAlbumId,
      format: 'json',
      newsong: '1',
    });
    const data = asRecord(
      await jsonFetch(`https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?${params.toString()}`, {
        headers: qqHeaders(accountCookie()),
      }),
    );
    const albumValue = asRecord(data.data ?? data);
    const songs = Array.isArray(albumValue.list) ? albumValue.list : Array.isArray(albumValue.songlist) ? albumValue.songlist : [];
    const album = mapAlbum({
      ...albumValue,
      albumMID: text(albumValue.mid) ?? text(albumValue.albumMID) ?? input.providerAlbumId,
      albumName: text(albumValue.name) ?? text(albumValue.albumName),
      singerName: text(albumValue.singername) ?? text(albumValue.singerName),
      publicTime: text(albumValue.aDate) ?? text(albumValue.publicTime),
      song_count: integer(albumValue.total) ?? integer(albumValue.total_song_num) ?? songs.length,
    });

    if (!album.providerAlbumId && songs.length === 0) {
      throw new Error('没有找到这张 QQ 音乐专辑');
    }

    return {
      ...album,
      tracks: songs.map(mapSong),
    };
  }

  async getArtist(input: { providerArtistId: string }): Promise<StreamingArtistDetail> {
    const cookie = accountCookie();
    try {
      return await this.fetchArtistDetail(input.providerArtistId, cookie);
    } catch (error) {
      const searchResult = await this.searchOnce({ provider, query: input.providerArtistId, mediaTypes: ['artist'], page: 1, pageSize: 5 });
      const replacement = searchResult.artists.find((artist) => artist.providerArtistId !== input.providerArtistId) ?? searchResult.artists[0];
      if (!replacement) {
        throw error;
      }

      return this.fetchArtistDetail(replacement.providerArtistId, cookie);
    }
  }

  async getPlaylist(input: { providerPlaylistId: string; page?: number; pageSize?: number }): Promise<StreamingPlaylistDetail> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(input.pageSize ?? 100)));
    const begin = (page - 1) * pageSize;
    const params = new URLSearchParams({
      type: '1',
      json: '1',
      utf8: '1',
      onlysong: '0',
      disstid: input.providerPlaylistId,
      format: 'json',
      g_tk: '5381',
      loginUin: uinFromCookie(accountCookie()),
      hostUin: '0',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      song_begin: String(begin),
      song_num: String(pageSize),
    });
    const data = asRecord(
      await jsonFetch(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?${params.toString()}`, {
        headers: qqHeaders(accountCookie()),
        timeoutMs: 12_000,
      }),
    );
    const cd = asRecord((Array.isArray(data.cdlist) ? data.cdlist : [])[0]);
    const songlist = Array.isArray(cd.songlist) ? cd.songlist : [];
    const total = integer(cd.total_song_num ?? cd.songnum) ?? songlist.length;
    const logo = text(cd.logo) ?? text(cd.picurl);
    const coverUrl = logo ? streamingImageProxyUrl(logo, qqReferer) : null;

    return {
      id: streamingStableKey(provider, `playlist:${input.providerPlaylistId}`),
      provider,
      providerPlaylistId: input.providerPlaylistId,
      title: text(cd.dissname) ?? 'QQ Music Playlist',
      description: 'Liked songs synced from the QQ Music account',
      creator: text(asRecord(cd.headurl).nick) ?? text(cd.nickname),
      coverUrl,
      coverThumb: coverUrl,
      trackCount: total,
      tracks: songlist.map(mapSong),
      page,
      pageSize,
      total,
      hasMore: begin + songlist.length < total,
    };
  }

  async getLyrics(input: { providerTrackId: string }): Promise<StreamingLyricsResult> {
    const params = new URLSearchParams({
      songmid: input.providerTrackId,
      pcachetime: String(Date.now()),
      g_tk: '5381',
      loginUin: uinFromCookie(accountCookie()),
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      nobase64: '1',
    });
    const data = asRecord(await jsonFetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params.toString()}`, { headers: qqHeaders(accountCookie()) }));
    const translationLyrics = maybeDecodeBase64(data.trans);
    const romanizationLyrics = maybeDecodeBase64(data.roma);
    const lyricText = maybeDecodeBase64(data.lyric);
    const split = splitLyricsByKind(lyricText);
    const lines = linesFromLyrics(split.syncedLyrics, split.plainLyrics, translationLyrics, romanizationLyrics);
    const instrumental = !split.syncedLyrics && !split.plainLyrics && Boolean(lyricText);

    return {
      provider,
      providerTrackId: input.providerTrackId,
      status: instrumental || split.syncedLyrics || split.plainLyrics || lines.length > 0 ? 'available' : 'missing',
      plainLyrics: split.plainLyrics,
      syncedLyrics: split.syncedLyrics,
      translationLyrics,
      romanizationLyrics,
      instrumental,
      lines,
      sourceLabel: 'QQ 音乐',
    };
  }

  async getMv(input: { providerTrackId: string }): Promise<StreamingMvResult> {
    const song = asRecord(await this.fetchSong(input.providerTrackId));
    const track = mapSong(song);
    const mv = asRecord(song.mv);
    const mvId = text(mv.vid);

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
          providerMvId: mvId,
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
    const song = asRecord(await this.fetchSong(request.providerTrackId));
    const file = asRecord(song.file);
    const mediaMid = text(file.media_mid) ?? text(file.strMediaMid);
    const cookie = accountCookie();
    const uin = uinFromCookie(cookie);
    if (uin === '0' || !hasQqPlaybackCredential(cookie)) {
      throw new Error('QQ Music login is incomplete. Please reconnect QQ Music before playing VIP tracks.');
    }

    const guid = qqGuidFromCookie(cookie, uin);
    const gtk = qqGtkFromCookie(cookie);
    const qualities = qqPlaybackQualityFallbacks[request.quality ?? 'fallback'] ?? qqPlaybackQualityFallbacks.fallback;
    let lastResult: QqVkeyResult | null = null;

    for (const quality of qualities) {
      const selectedQuality = qualityPrefix(quality);
      for (const filename of qqPlaybackFilenames(selectedQuality, mediaMid, request.providerTrackId)) {
        for (const endpoint of qqPlaybackEndpoints) {
          for (const platform of endpoint.platforms) {
            const param: Record<string, unknown> = {
              guid,
              songmid: [request.providerTrackId],
              filename: [filename],
              songtype: [0],
              uin,
            };
            if (endpoint.modern) {
              param.ctx = 0;
            } else {
              param.loginflag = 1;
              if (platform) {
                param.platform = platform;
              }
            }

            const body = {
              req_0: {
                module: endpoint.module,
                method: endpoint.method,
                param,
              },
              comm: endpoint.modern
                ? {
                    uin,
                    format: 'json',
                    ct: 24,
                    cv: 4_747_474,
                    platform: 'yqq.json',
                    chid: '0',
                    g_tk: gtk,
                    g_tk_new_20200303: gtk,
                    inCharset: 'utf-8',
                    outCharset: 'utf-8',
                    notice: 0,
                    needNewCode: 1,
                  }
                : {
                    uin,
                    format: 'json',
                    ct: 24,
                    cv: 0,
                  },
            };
            const data = asRecord(
              await jsonFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
                method: 'POST',
                headers: qqHeaders(cookie),
                body,
              }),
            );
            const payload = asRecord(asRecord(data.req_0).data);
            const item = asRecord((Array.isArray(payload.midurlinfo) ? payload.midurlinfo : [])[0]);
            lastResult = { item, payload };
            const purl = text(item.purl);

            if (!purl) {
              continue;
            }

            const sip = Array.isArray(payload.sip) ? payload.sip.map(text).find(Boolean) : null;
            const url = purl.startsWith('http') ? purl : `${sip ?? 'https://isure.stream.qqmusic.qq.com/'}${purl}`;

            return {
              provider,
              providerTrackId: request.providerTrackId,
              url,
              expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
              mimeType: selectedQuality.mimeType,
              bitrate: selectedQuality.bitrate,
              sampleRate: null,
              bitDepth: selectedQuality.codec === 'flac' ? 16 : null,
              codec: selectedQuality.codec,
              headers: {},
              requiresProxy: false,
              supportsRange: true,
            };
          }
        }
      }
    }

    throw new Error(qqPlaybackFailureMessage(lastResult));
  }

  async getLikedSongsPlaylist(input: { page?: number; pageSize?: number } = {}): Promise<StreamingPlaylistDetail> {
    const cookie = accountCookie();
    if (!cookie) {
      throw new Error('Please connect a QQ Music account first.');
    }

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(input.pageSize ?? 100)));
    const begin = (page - 1) * pageSize;
    const data = await this.fetchLikedSongsPage(cookie, begin, pageSize);
    const tracks = data.songs.map(mapSong);

    return {
      id: streamingStableKey(provider, 'playlist:liked-songs'),
      provider,
      providerPlaylistId: 'liked-songs',
      title: 'QQ Music Liked Songs',
      description: 'Liked songs synced from the QQ Music account',
      creator: accountStatus().displayName ?? accountStatus().username ?? null,
      coverUrl: tracks[0]?.coverUrl ?? null,
      coverThumb: tracks[0]?.coverThumb ?? null,
      trackCount: data.total,
      tracks,
      page,
      pageSize,
      total: data.total,
      hasMore: begin + tracks.length < data.total,
    };
  }

  async setTrackLiked(input: { providerTrackId: string; liked: boolean }): Promise<void> {
    const cookie = accountCookie();
    if (!cookie) {
      throw new Error('Please connect a QQ Music account before liking tracks.');
    }

    const uin = uinFromCookie(cookie);
    if (uin === '0') {
      throw new Error('Unable to read QQ Music account UIN. Please reconnect and try again.');
    }

    const playlistId = await this.findLikedPlaylistId(cookie);
    if (input.liked) {
      await this.addTrackToLikedPlaylist(cookie, uin, playlistId, input.providerTrackId);
      return;
    }

    const song = await this.fetchSong(input.providerTrackId);
    const songId = songIdFromSong(song);
    if (!songId) {
      throw new Error('Unable to read QQ Music song id for unlike.');
    }

    await this.removeTrackFromLikedPlaylist(cookie, uin, playlistId, songId);
  }

  private async fetchSong(providerTrackId: string): Promise<unknown> {
    const params = new URLSearchParams({
      songmid: providerTrackId,
      tpl: 'yqq_song_detail',
      format: 'json',
    });
    const data = asRecord(await jsonFetch(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params.toString()}`, { headers: qqHeaders(accountCookie()) }));
    const songs = Array.isArray(data.data) ? data.data : [];
    const song = songs[0];
    if (!song) {
      throw new Error('没有找到这首 QQ 音乐歌曲');
    }

    return song;
  }

  private async addTrackToLikedPlaylist(cookie: string, uin: string, playlistId: string, providerTrackId: string): Promise<void> {
    const params = new URLSearchParams({
      loginUin: uin,
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      uin,
      dirid: playlistId,
      midlist: providerTrackId,
      typelist: '13',
      addtype: '',
      formsender: '4',
      source: '153',
      type: '3',
      utf8: '1',
    });
    const data = await jsonFetch(`https://c.y.qq.com/splcloud/fcgi-bin/fcg_music_add2songdir.fcg?${params.toString()}`, {
      headers: qqHeaders(cookie),
      timeoutMs: 12_000,
    });
    assertQqWriteSuccess(data, 'QQ Music like failed');
  }

  private async removeTrackFromLikedPlaylist(cookie: string, uin: string, playlistId: string, songId: string): Promise<void> {
    const params = new URLSearchParams({
      loginUin: uin,
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      uin,
      dirid: playlistId,
      songids: songId,
    });
    const data = await jsonFetch(`https://c.y.qq.com/splcloud/fcgi-bin/fcg_music_delbatchsong.fcg?${params.toString()}`, {
      headers: qqHeaders(cookie),
      timeoutMs: 12_000,
    });
    assertQqWriteSuccess(data, 'QQ Music unlike failed');
  }

  private async fetchLikedSongsPage(cookie: string, begin: number, pageSize: number): Promise<{ total: number; songs: unknown[] }> {
    const uin = uinFromCookie(cookie);
    if (uin === '0') {
      throw new Error('Unable to read QQ Music account UIN. Please reconnect QQ Music and try again.');
    }

    const params = new URLSearchParams({
      loginUin: uin,
      hostUin: uin,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      ct: '20',
      cid: '205360956',
      userid: uin,
      reqtype: '1',
      sin: String(begin),
      ein: String(begin + pageSize - 1),
    });
    const data = asRecord(
      await jsonFetch(`https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?${params.toString()}`, {
        headers: qqHeaders(cookie),
        timeoutMs: 12_000,
      }),
    );
    const payload = asRecord(data.data);
    const entries = Array.isArray(payload.songlist) ? payload.songlist : [];
    const songs = entries.map((entry) => asRecord(entry).data ?? entry);

    return {
      total: integer(payload.totalsong) ?? songs.length,
      songs,
    };
  }

  private async findLikedPlaylistId(cookie: string): Promise<string> {
    const uin = uinFromCookie(cookie);
    if (uin === '0') {
      throw new Error('Unable to read QQ Music account UIN. Please reconnect QQ Music and try again.');
    }

    const params = new URLSearchParams({
      loginUin: uin,
      hostUin: uin,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0',
      ct: '20',
      cid: '205360956',
      userid: uin,
      reqtype: '2',
      sin: '0',
      ein: '49',
    });
    const data = await jsonFetch(`https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?${params.toString()}`, {
      headers: qqHeaders(cookie),
      timeoutMs: 12_000,
    });
    const playlists = findPlaylistRecords(data);
    const liked = playlists.find((playlist) => {
      const name = text(playlist.dissname) ?? text(playlist.dirName) ?? text(playlist.name) ?? text(playlist.title) ?? '';
      return /我喜欢|我喜歡|like/iu.test(name);
    });
    const id = liked
      ? text(liked.dissid) ?? text(liked.disstid) ?? text(liked.tid) ?? text(liked.dirid)
      : text(asRecord(data).mymusic) ?? text(asRecord(data).mymusicId);

    if (!id) {
      throw new Error('Could not find the QQ Music liked songs playlist.');
    }

    return id;
  }
}
