import { join } from 'node:path';
import electron from 'electron';
import { createDatabase, type EchoDatabase } from '../database/createDatabase';
import type {
  StreamingLyricsResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingProviderDescriptor,
  StreamingProviderName,
  StreamingSearchRequest,
  StreamingSearchResult,
  StreamingTrack,
} from '../../shared/types/streaming';
import { streamingStableKey } from '../../shared/types/streaming';
import { StreamingCacheStore } from './StreamingCacheStore';
import { StreamingMemoryCache } from './StreamingMemoryCache';
import { StreamingPlaybackResolver } from './StreamingPlaybackResolver';
import type { StreamingProvider } from './StreamingProvider';
import { StreamingProviderRegistry } from './StreamingProviderRegistry';
import { StreamingRateLimiter } from './StreamingRateLimiter';
import { MockStreamingProvider } from './providers/MockStreamingProvider';
import { NeteaseStreamingProvider } from './providers/NeteaseStreamingProvider';
import { QQMusicStreamingProvider } from './providers/QQMusicStreamingProvider';

const searchTtlMs = 5 * 60 * 1000;
const trackDetailTtlMs = 30 * 60 * 1000;
const maxPlaybackTtlMs = 5 * 60 * 1000;
const fallbackPlaybackTtlMs = 2 * 60 * 1000;
const providerTimeoutMs = 10 * 1000;
const searchCacheVersion = 'v2';

type StreamingTrackRequest = {
  provider: StreamingProviderName;
  providerTrackId: string;
};

const expiresAtFromTtl = (ttlMs: number): string => new Date(Date.now() + ttlMs).toISOString();

const normalizePage = (value: number | undefined): number => Math.max(1, Math.floor(value ?? 1));

const normalizePageSize = (value: number | undefined): number => Math.min(50, Math.max(1, Math.floor(value ?? 20)));

const normalizeSearchRequest = (request: StreamingSearchRequest): StreamingSearchRequest => ({
  provider: request.provider,
  query: request.query.trim(),
  mediaTypes: request.mediaTypes?.length ? request.mediaTypes : ['track'],
  page: normalizePage(request.page),
  pageSize: normalizePageSize(request.pageSize),
});

const searchCacheKey = (request: StreamingSearchRequest): string =>
  `search:${searchCacheVersion}:${request.provider}:${request.query.trim().toLocaleLowerCase()}:${(request.mediaTypes ?? ['track']).join(',')}:${normalizePage(
    request.page,
  )}:${normalizePageSize(request.pageSize)}`;

const trackCacheKey = (provider: StreamingProviderName, providerTrackId: string): string =>
  `track:${provider}:${providerTrackId}`;

const playbackCacheKey = (request: StreamingPlaybackRequest): string =>
  `playback:${request.provider}:${request.providerTrackId}:${request.quality ?? 'auto'}`;

const lyricsCacheKey = (provider: StreamingProviderName, providerTrackId: string): string =>
  `lyrics:streaming:${provider}:${providerTrackId}`;

const mvCacheKey = (provider: StreamingProviderName, providerTrackId: string): string =>
  `mv:streaming:${provider}:${providerTrackId}`;

const cleanError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

const withTimeout = async <T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const playableTtlMs = (source: StreamingPlaybackSource): number => {
  if (!source.expiresAt) {
    return fallbackPlaybackTtlMs;
  }

  const expiresAtMs = Date.parse(source.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return fallbackPlaybackTtlMs;
  }

  return Math.max(0, Math.min(maxPlaybackTtlMs, expiresAtMs - Date.now() - 30_000));
};

export class StreamingService {
  private readonly playbackResolver: StreamingPlaybackResolver;

  constructor(
    private readonly registry: StreamingProviderRegistry,
    private readonly cacheStore: StreamingCacheStore,
    private readonly memoryCache = new StreamingMemoryCache(),
    private readonly rateLimiter = new StreamingRateLimiter({ maxConcurrent: 2, minIntervalMs: 150 }),
  ) {
    this.playbackResolver = new StreamingPlaybackResolver(registry);
  }

  getProviders(): StreamingProviderDescriptor[] {
    return this.registry.list();
  }

  async search(request: StreamingSearchRequest): Promise<StreamingSearchResult> {
    const normalized = normalizeSearchRequest(request);
    if (!normalized.query) {
      return {
        provider: normalized.provider,
        query: normalized.query,
        page: normalized.page ?? 1,
        pageSize: normalized.pageSize ?? 20,
        total: 0,
        hasMore: false,
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
        mvs: [],
      };
    }

    const key = searchCacheKey(normalized);
    const memoryHit = this.memoryCache.get<StreamingSearchResult>(key);
    if (memoryHit) {
      return { ...memoryHit, cached: true };
    }

    const sqliteHit = this.cacheStore.getApiCache<StreamingSearchResult>(key);
    if (sqliteHit) {
      this.memoryCache.set(key, sqliteHit, searchTtlMs);
      return { ...sqliteHit, cached: true };
    }

    const staleSqliteHit = this.cacheStore.getApiCache<StreamingSearchResult>(key, { allowExpired: true });
    if (staleSqliteHit) {
      void this.refreshSearchCache(normalized, key);
      return { ...staleSqliteHit, cached: true };
    }

    return this.memoryCache.getOrCreateInflight(key, async () => {
      return this.refreshSearchCache(normalized, key);
    });
  }

  async getTrack(providerName: StreamingProviderName, providerTrackId: string): Promise<StreamingTrack> {
    const key = trackCacheKey(providerName, providerTrackId);
    const memoryHit = this.memoryCache.get<StreamingTrack>(key);
    if (memoryHit) {
      return memoryHit;
    }

    const sqliteHit = this.cacheStore.getTrack(providerName, providerTrackId);
    if (sqliteHit) {
      return this.memoryCache.set(key, sqliteHit, trackDetailTtlMs);
    }

    return this.memoryCache.getOrCreateInflight(key, async () => {
      const provider = this.registry.get(providerName);
      const track = this.normalizeTrack(providerName, await this.callProvider(provider, () => provider.getTrack({ providerTrackId }), 'Streaming track'));
      this.cacheStore.upsertTrack(track);
      return this.memoryCache.set(key, track, trackDetailTtlMs);
    });
  }

  async resolvePlayback(request: StreamingPlaybackRequest): Promise<StreamingPlaybackSource> {
    const key = playbackCacheKey(request);
    const memoryHit = this.memoryCache.get<StreamingPlaybackSource>(key);
    if (memoryHit) {
      return memoryHit;
    }

    return this.memoryCache.getOrCreateInflight(key, async () => {
      const provider = this.registry.get(request.provider);
      const source = await this.callProvider(provider, () => this.playbackResolver.resolve(request), 'Streaming playback');
      const ttlMs = playableTtlMs(source);
      if (ttlMs > 0) {
        this.memoryCache.set(key, source, ttlMs);
      }

      return source;
    });
  }

  invalidatePlayback(request: StreamingPlaybackRequest): void {
    this.memoryCache.delete(playbackCacheKey(request));
  }

  async getLyrics(request: StreamingTrackRequest): Promise<StreamingLyricsResult> {
    const key = lyricsCacheKey(request.provider, request.providerTrackId);
    const memoryHit = this.memoryCache.get<StreamingLyricsResult>(key);
    if (memoryHit) {
      return memoryHit;
    }

    const sqliteHit = this.cacheStore.getApiCache<StreamingLyricsResult>(key);
    if (sqliteHit) {
      return this.memoryCache.set(key, sqliteHit, trackDetailTtlMs);
    }

    return this.memoryCache.getOrCreateInflight(key, async () => {
      const provider = this.registry.get(request.provider);
      const result = provider.getLyrics
        ? await this.callProvider(provider, () => provider.getLyrics!({ providerTrackId: request.providerTrackId }), 'Streaming lyrics')
        : {
            provider: request.provider,
            providerTrackId: request.providerTrackId,
            status: 'unknown' as const,
            plainLyrics: null,
            syncedLyrics: null,
            lines: [],
            sourceLabel: null,
          };
      this.cacheStore.setApiCache(request.provider, 'lyrics', key, result, expiresAtFromTtl(trackDetailTtlMs));
      return this.memoryCache.set(key, result, trackDetailTtlMs);
    });
  }

  async getMv(request: StreamingTrackRequest): Promise<StreamingMvResult> {
    const key = mvCacheKey(request.provider, request.providerTrackId);
    const memoryHit = this.memoryCache.get<StreamingMvResult>(key);
    if (memoryHit) {
      return memoryHit;
    }

    const sqliteHit = this.cacheStore.getApiCache<StreamingMvResult>(key);
    if (sqliteHit) {
      return this.memoryCache.set(key, sqliteHit, trackDetailTtlMs);
    }

    return this.memoryCache.getOrCreateInflight(key, async () => {
      const provider = this.registry.get(request.provider);
      const result = provider.getMv
        ? await this.callProvider(provider, () => provider.getMv!({ providerTrackId: request.providerTrackId }), 'Streaming MV')
        : {
            provider: request.provider,
            providerTrackId: request.providerTrackId,
            status: 'unknown' as const,
            items: [],
          };
      this.cacheStore.setApiCache(request.provider, 'mv', key, result, expiresAtFromTtl(trackDetailTtlMs));
      return this.memoryCache.set(key, result, trackDetailTtlMs);
    });
  }

  normalizeTrack(provider: StreamingProviderName, raw: StreamingTrack): StreamingTrack {
    const providerTrackId = raw.providerTrackId.trim();
    return {
      ...raw,
      provider,
      providerTrackId,
      id: raw.id || streamingStableKey(provider, providerTrackId),
      stableKey: streamingStableKey(provider, providerTrackId),
      title: raw.title.trim() || 'Untitled',
      artist: raw.artist.trim() || 'Unknown Artist',
      album: raw.album.trim() || 'Unknown Album',
      artists: raw.artists ?? [],
      qualities: raw.qualities ?? [],
      playable: raw.playable !== false,
      unavailableReason: raw.playable === false ? raw.unavailableReason ?? 'This streaming track is unavailable.' : null,
      lyricsStatus: raw.lyricsStatus ?? 'unknown',
      mvStatus: raw.mvStatus ?? 'unknown',
    };
  }

  private async callProvider<T>(provider: StreamingProvider, work: () => Promise<T>, label: string): Promise<T> {
    try {
      return await this.rateLimiter.schedule(provider.name, () => withTimeout(work(), providerTimeoutMs, label));
    } catch (error) {
      throw cleanError(error, `${label} failed.`);
    }
  }

  private async refreshSearchCache(request: StreamingSearchRequest, key: string): Promise<StreamingSearchResult> {
    const provider = this.registry.get(request.provider);
    const result = await this.callProvider(provider, () => provider.search(request), 'Streaming search');
    const normalizedResult = {
      ...result,
      tracks: result.tracks.map((track) => this.normalizeTrack(result.provider, track)),
    };
    this.cacheStore.upsertTracks(normalizedResult.tracks);
    this.cacheStore.setApiCache(request.provider, 'search', key, normalizedResult, expiresAtFromTtl(searchTtlMs));
    return this.memoryCache.set(key, normalizedResult, searchTtlMs);
  }
}

export const createStreamingService = (database: EchoDatabase): StreamingService => {
  const registry = new StreamingProviderRegistry();
  registry.register(new MockStreamingProvider());
  registry.register(new NeteaseStreamingProvider());
  registry.register(new QQMusicStreamingProvider());
  return new StreamingService(registry, new StreamingCacheStore(database));
};

let defaultStreamingService: StreamingService | null = null;
let defaultStreamingDatabase: EchoDatabase | null = null;

export const getStreamingService = (): StreamingService => {
  if (!defaultStreamingService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;
    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultStreamingDatabase = createDatabase(join(electronApp.getPath('userData'), 'echo-library.sqlite'));
    defaultStreamingService = createStreamingService(defaultStreamingDatabase);
  }

  return defaultStreamingService;
};
