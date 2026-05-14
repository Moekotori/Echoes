import type { EchoDatabase } from '../database/createDatabase';
import type { StreamingProviderName, StreamingTrack } from '../../shared/types/streaming';
import { streamingProviderNames, streamingStableKey } from '../../shared/types/streaming';

type DbRow = Record<string, unknown>;

const nowIso = (): string => new Date().toISOString();

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const providerOrMock = (value: unknown): StreamingProviderName =>
  typeof value === 'string' && streamingProviderNames.includes(value as StreamingProviderName)
    ? (value as StreamingProviderName)
    : 'mock';

const sensitiveKeyPattern = /cookie|token|secret|authorization|headers|password|credential/iu;

const providerReferers: Partial<Record<StreamingProviderName, string>> = {
  netease: 'https://music.163.com/',
  qqmusic: 'https://y.qq.com/',
  bilibili: 'https://www.bilibili.com/',
};

const proxyableImageHosts = new Set([
  'p.music.126.net',
  'p1.music.126.net',
  'p2.music.126.net',
  'p3.music.126.net',
  'p4.music.126.net',
  'y.gtimg.cn',
  'qpic.y.qq.com',
  'i0.hdslb.com',
  'i1.hdslb.com',
  'i2.hdslb.com',
  'archive.biliimg.com',
]);

const normalizeRemoteImageUrl = (provider: StreamingProviderName, value: string | null): string | null => {
  if (!value || value.startsWith('echo-image://') || value.startsWith('echo-cover://') || value.startsWith('data:')) {
    return value;
  }

  const referer = providerReferers[provider];
  if (!referer) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !proxyableImageHosts.has(url.hostname)) {
      return value;
    }

    return `echo-image://remote/${encodeURIComponent(url.toString())}?referer=${encodeURIComponent(referer)}`;
  } catch {
    return value;
  }
};

const sanitizeForCache = (value: unknown, depth = 0): unknown => {
  if (depth > 8) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForCache(item, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitiveKeyPattern.test(key) ? '[redacted]' : sanitizeForCache(item, depth + 1);
  }

  return output;
};

export class StreamingCacheStore {
  constructor(private readonly database: EchoDatabase) {}

  getTrack(provider: StreamingProviderName, providerTrackId: string): StreamingTrack | null {
    const row =
      this.database
        .prepare<[StreamingProviderName, string], DbRow>(
          'SELECT * FROM streaming_tracks WHERE provider = ? AND provider_track_id = ?',
        )
        .get(provider, providerTrackId) ?? null;

    return row ? this.mapTrack(row) : null;
  }

  upsertTrack(track: StreamingTrack, raw: unknown = track): void {
    if (!this.database.inTransaction) {
      this.database.transaction(() => this.upsertTrack(track, raw))();
      return;
    }

    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO streaming_tracks (
          id, provider, provider_track_id, stable_key, title, artist, album, album_id,
          album_artist, duration, cover_url, cover_id, qualities_json, playable,
          unavailable_reason, lyrics_status, mv_status, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_track_id) DO UPDATE SET
          id = excluded.id,
          stable_key = excluded.stable_key,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          album_id = excluded.album_id,
          album_artist = excluded.album_artist,
          duration = excluded.duration,
          cover_url = excluded.cover_url,
          cover_id = excluded.cover_id,
          qualities_json = excluded.qualities_json,
          playable = excluded.playable,
          unavailable_reason = excluded.unavailable_reason,
          lyrics_status = excluded.lyrics_status,
          mv_status = excluded.mv_status,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        track.id,
        track.provider,
        track.providerTrackId,
        track.stableKey,
        track.title,
        track.artist,
        track.album,
        track.albumId,
        track.albumArtist,
        track.duration,
        track.coverUrl,
        null,
        JSON.stringify(track.qualities),
        track.playable ? 1 : 0,
        track.unavailableReason,
        track.lyricsStatus,
        track.mvStatus,
        JSON.stringify(sanitizeForCache(raw)),
        timestamp,
        timestamp,
      );
  }

  upsertTracks(tracks: StreamingTrack[]): void {
    if (tracks.length === 0) {
      return;
    }

    this.database.transaction((items: StreamingTrack[]) => {
      for (const track of items) {
        this.upsertTrack(track);
      }
    })(tracks);
  }

  getApiCache<T>(cacheKey: string, options: { allowExpired?: boolean } = {}): T | null {
    const row = options.allowExpired
      ? (this.database
          .prepare<[string], DbRow>('SELECT payload_json, expires_at FROM streaming_api_cache WHERE cache_key = ?')
          .get(cacheKey) ?? null)
      : (this.database
          .prepare<[string, string], DbRow>(
            'SELECT payload_json, expires_at FROM streaming_api_cache WHERE cache_key = ? AND expires_at > ?',
          )
          .get(cacheKey, nowIso()) ?? null);

    return row ? parseJson<T | null>(row.payload_json, null) : null;
  }

  setApiCache(provider: StreamingProviderName, kind: string, cacheKey: string, payload: unknown, expiresAt: string): void {
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO streaming_api_cache (
          cache_key, provider, kind, payload_json, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          provider = excluded.provider,
          kind = excluded.kind,
          payload_json = excluded.payload_json,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
      )
      .run(cacheKey, provider, kind, JSON.stringify(sanitizeForCache(payload)), expiresAt, timestamp, timestamp);
  }

  private mapTrack(row: DbRow): StreamingTrack {
    const provider = providerOrMock(row.provider);
    const providerTrackId = String(row.provider_track_id);
    const raw = parseJson<Partial<StreamingTrack>>(row.raw_json, {});
    const coverUrl = normalizeRemoteImageUrl(provider, textOrNull(row.cover_url));
    const coverThumb = normalizeRemoteImageUrl(provider, textOrNull(raw.coverThumb) ?? textOrNull(row.cover_url));

    return {
      id: String(row.id),
      provider,
      providerTrackId,
      stableKey: textOrNull(row.stable_key) ?? streamingStableKey(provider, providerTrackId),
      title: String(row.title),
      artist: String(row.artist),
      artists: Array.isArray(raw.artists) ? raw.artists : [],
      album: String(row.album),
      albumId: textOrNull(row.album_id),
      albumArtist: textOrNull(row.album_artist),
      duration: numberOrNull(row.duration),
      coverUrl,
      coverThumb,
      qualities: parseJson(row.qualities_json, []),
      explicit: raw.explicit === true,
      playable: Number(row.playable ?? 1) !== 0,
      unavailableReason: textOrNull(row.unavailable_reason),
      lyricsStatus:
        row.lyrics_status === 'available' || row.lyrics_status === 'missing' ? row.lyrics_status : 'unknown',
      mvStatus: row.mv_status === 'available' || row.mv_status === 'missing' ? row.mv_status : 'unknown',
    };
  }
}
