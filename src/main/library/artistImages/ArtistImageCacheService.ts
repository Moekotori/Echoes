import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import type { EchoDatabase } from '../../database/createDatabase';
import type {
  ArtistImageCacheClearResult,
  ArtistImageCacheEntry,
  ArtistImageCacheSummary,
  ArtistImageCacheStatus,
  ArtistImageQueueResult,
  ArtistImageRefreshResult,
} from '../../../shared/types/library';
import {
  ARTIST_IMAGE_AUTO_MATCH_MIN_CONFIDENCE,
  artistImageKeyForName,
} from './ArtistImageMatching';
import { QQMusicArtistImageProvider } from './QQMusicArtistImageProvider';
import type { ArtistImageCandidate, ArtistImageLookupInput, ArtistImageProvider, ArtistImageUpdatedPayload } from './ArtistImageTypes';

type DbRow = Record<string, unknown>;

type ResolvedArtist = {
  artistId: string | null;
  artistKey: string;
  artistName: string;
};

type QueueTask = {
  artist: ResolvedArtist;
  force: boolean;
  resolve?: (entry: ArtistImageCacheEntry | null) => void;
  reject?: (error: unknown) => void;
};

type DownloadedImage = {
  data: Uint8Array;
  mimeType: string;
  sourceHash: string;
};

type ArtistImageCacheServiceOptions = {
  cacheRoot: string;
  providers?: ArtistImageProvider[];
  concurrency?: number;
  fetchImage?: (url: string) => Promise<DownloadedImage>;
  onUpdated?: (payload: ArtistImageUpdatedPayload) => void;
};

const maxImageBytes = 5 * 1024 * 1024;
const imageRequestTimeoutMs = 8000;
const defaultProvider = 'qqmusic';
const cacheStatuses = new Set<ArtistImageCacheStatus>([
  'pending',
  'loading',
  'matched',
  'not_found',
  'error',
  'rate_limited',
]);
const nonRetryStatuses = new Set<ArtistImageCacheStatus>(['matched', 'not_found', 'error', 'rate_limited']);

const nowIso = (): string => new Date().toISOString();

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const statusOrPending = (value: unknown): ArtistImageCacheStatus =>
  typeof value === 'string' && cacheStatuses.has(value as ArtistImageCacheStatus)
    ? (value as ArtistImageCacheStatus)
    : 'pending';

const hashText = (value: string): string => createHash('sha256').update(value).digest('hex');

const isSupportedImageMimeType = (value: string | null | undefined): value is string => {
  const normalized = value?.split(';')[0]?.trim().toLocaleLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp';
};

const mimeTypeForImageUrl = (url: string): string | null => {
  try {
    switch (extname(new URL(url).pathname).toLocaleLowerCase()) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return null;
    }
  } catch {
    return null;
  }
};

class ArtistImageDownloadError extends Error {
  constructor(
    message: string,
    readonly status: ArtistImageCacheStatus = 'error',
  ) {
    super(message);
  }
}

export class ArtistImageCacheService {
  private readonly providers: ArtistImageProvider[];
  private readonly concurrency: number;
  private readonly fetchImage: (url: string) => Promise<DownloadedImage>;
  private readonly onUpdated: ((payload: ArtistImageUpdatedPayload) => void) | null;
  private readonly queue: QueueTask[] = [];
  private readonly queuedKeys = new Set<string>();
  private readonly lastProviderRequestAt = new Map<string, number>();
  private activeCount = 0;

  constructor(
    private readonly database: EchoDatabase,
    options: ArtistImageCacheServiceOptions,
  ) {
    this.providers = options.providers?.length ? options.providers : [new QQMusicArtistImageProvider()];
    this.concurrency = Math.max(1, Math.min(2, Math.floor(options.concurrency ?? 1)));
    this.fetchImage = options.fetchImage ?? this.downloadImage;
    this.onUpdated = options.onUpdated ?? null;
    this.cacheRoot = resolve(options.cacheRoot);
  }

  private readonly cacheRoot: string;

  getArtistImage(artistIdOrKey: string): ArtistImageCacheEntry | null {
    const artist = this.resolveArtist({ id: artistIdOrKey, artistKey: artistIdOrKey });
    if (!artist) {
      return null;
    }

    return this.getCacheEntry(artist.artistKey);
  }

  getSummary(): ArtistImageCacheSummary {
    const rows = this.database
      .prepare<[], { status: string; count: number }>(
        `SELECT status, COUNT(*) AS count
         FROM artist_image_cache
         GROUP BY status`,
      )
      .all();
    const summary = {
      total: 0,
      matched: 0,
      pending: 0,
      loading: 0,
      notFound: 0,
      error: 0,
      rateLimited: 0,
    };

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      summary.total += count;
      switch (row.status) {
        case 'matched':
          summary.matched = count;
          break;
        case 'pending':
          summary.pending = count;
          break;
        case 'loading':
          summary.loading = count;
          break;
        case 'not_found':
          summary.notFound = count;
          break;
        case 'error':
          summary.error = count;
          break;
        case 'rate_limited':
          summary.rateLimited = count;
          break;
      }
    }

    return summary;
  }

  enqueueMissingArtistImages(
    artists: ArtistImageLookupInput[],
    options: { force?: boolean; limit?: number } = {},
  ): ArtistImageQueueResult {
    const force = options.force === true;
    const resolvedArtists = artists.length > 0
      ? artists.map((artist) => this.resolveArtist(artist)).filter((artist): artist is ResolvedArtist => Boolean(artist))
      : this.findMissingArtists(options.limit ?? 200, force);
    let queued = 0;
    let skipped = 0;

    for (const artist of resolvedArtists) {
      if (this.enqueueArtist(artist, force)) {
        queued += 1;
      } else {
        skipped += 1;
      }
    }

    this.drainQueue();
    return { queued, skipped };
  }

  refreshVisibleArtistImages(artists: ArtistImageLookupInput[]): ArtistImageQueueResult {
    return this.enqueueMissingArtistImages(artists, { force: false });
  }

  refreshArtistImage(artistIdOrKey: string, force = false): Promise<ArtistImageRefreshResult> {
    const artist = this.resolveArtist({ id: artistIdOrKey, artistKey: artistIdOrKey });

    if (!artist) {
      return Promise.resolve({ queued: false, entry: null });
    }

    return new Promise((resolveTask, rejectTask) => {
      if (!this.enqueueArtist(artist, force, resolveTask, rejectTask)) {
        resolveTask({ queued: false, entry: this.getCacheEntry(artist.artistKey) });
        return;
      }

      this.drainQueue();
    });
  }

  clearCache(): ArtistImageCacheClearResult {
    const stats = directoryStats(this.cacheRoot);
    const removedRows = Number(this.database.prepare('DELETE FROM artist_image_cache').run().changes ?? 0);
    clearDirectoryContents(this.cacheRoot);

    return {
      removedRows,
      deletedFiles: stats.fileCount,
      freedBytes: stats.sizeBytes,
    };
  }

  resolveAsset(
    artistKey: string,
    variant: 'thumb' | 'medium' | 'large',
  ): { filePath: string; mimeType: string | null } | null {
    const row = this.database
      .prepare<[string], DbRow>(
        `SELECT thumb_path, medium_path, large_path
         FROM artist_image_cache
         WHERE artist_key = ? AND status = 'matched'`,
      )
      .get(artistKey);

    if (!row) {
      return null;
    }

    const thumbPath = textOrNull(row.thumb_path);
    const mediumPath = textOrNull(row.medium_path);
    const largePath = textOrNull(row.large_path);
    const candidates =
      variant === 'thumb'
        ? [thumbPath, mediumPath, largePath]
        : variant === 'medium'
          ? [mediumPath, largePath, thumbPath]
          : [largePath, mediumPath, thumbPath];
    const filePath = candidates.find((candidate): candidate is string => Boolean(candidate)) ?? null;

    if (!filePath || !isPathInsideDirectory(this.cacheRoot, filePath)) {
      return null;
    }

    return {
      filePath,
      mimeType: 'image/webp',
    };
  }

  private enqueueArtist(
    artist: ResolvedArtist,
    force: boolean,
    resolveTask?: (result: ArtistImageRefreshResult) => void,
    rejectTask?: (error: unknown) => void,
  ): boolean {
    if (this.queuedKeys.has(artist.artistKey)) {
      return false;
    }

    const existing = this.getCacheEntry(artist.artistKey);
    if (!force && existing && nonRetryStatuses.has(existing.status)) {
      return false;
    }

    this.ensurePendingRow(artist, force);
    this.queuedKeys.add(artist.artistKey);
    this.queue.push({
      artist,
      force,
      resolve: resolveTask
        ? (entry) => resolveTask({ queued: true, entry })
        : undefined,
      reject: rejectTask,
    });

    return true;
  }

  private drainQueue(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeCount += 1;
      void this.runTask(task)
        .catch((error) => {
          task.reject?.(error);
        })
        .finally(() => {
          this.queuedKeys.delete(task.artist.artistKey);
          this.activeCount -= 1;
          this.drainQueue();
        });
    }
  }

  private async runTask(task: QueueTask): Promise<void> {
    let entry: ArtistImageCacheEntry | null = null;

    try {
      this.markLoading(task.artist);
      entry = await this.fetchAndStore(task.artist);
      task.resolve?.(entry);
    } catch (error) {
      entry = this.markStatus(task.artist, 'error', {
        failureReason: error instanceof Error ? error.message : String(error),
      });
      task.resolve?.(entry);
    }
  }

  private async fetchAndStore(artist: ResolvedArtist): Promise<ArtistImageCacheEntry> {
    let bestLowConfidence: ArtistImageCandidate | null = null;

    for (const provider of this.providers) {
      let candidates: ArtistImageCandidate[];

      try {
        await this.waitForProviderRateLimit(provider);
        candidates = await provider.searchArtistImage({
          artistKey: artist.artistKey,
          artistName: artist.artistName,
        });
      } catch (error) {
        return this.markStatus(artist, this.statusForProviderError(error), {
          provider: provider.name,
          failureReason: error instanceof Error ? error.message : String(error),
        });
      }

      const sortedCandidates = [...candidates].sort((left, right) => right.confidence - left.confidence);
      const best = sortedCandidates[0] ?? null;
      if (!best) {
        continue;
      }

      if (best.confidence < ARTIST_IMAGE_AUTO_MATCH_MIN_CONFIDENCE) {
        bestLowConfidence = !bestLowConfidence || best.confidence > bestLowConfidence.confidence ? best : bestLowConfidence;
        continue;
      }

      try {
        const downloaded = await this.fetchImage(best.imageUrl);
        const paths = await this.writeImageVariants(artist.artistKey, downloaded.data);
        const entry = this.markStatus(artist, 'matched', {
          provider: best.provider,
          providerArtistId: best.providerArtistId,
          sourceUrl: best.sourceUrl ?? best.imageUrl,
          sourceHash: downloaded.sourceHash,
          thumbPath: paths.thumbPath,
          mediumPath: paths.mediumPath,
          largePath: paths.largePath,
          confidence: best.confidence,
          failureReason: null,
          fetchedAt: nowIso(),
        });
        this.onUpdated?.({
          artistId: artist.artistId,
          artistKey: artist.artistKey,
          status: 'matched',
        });
        return entry;
      } catch (error) {
        const status = error instanceof ArtistImageDownloadError ? error.status : 'error';
        return this.markStatus(artist, status, {
          provider: best.provider,
          providerArtistId: best.providerArtistId,
          sourceUrl: best.sourceUrl ?? best.imageUrl,
          confidence: best.confidence,
          failureReason: error instanceof Error ? error.message : String(error),
          fetchedAt: nowIso(),
        });
      }
    }

    if (bestLowConfidence) {
      return this.markStatus(artist, 'not_found', {
        provider: bestLowConfidence.provider,
        providerArtistId: bestLowConfidence.providerArtistId,
        sourceUrl: bestLowConfidence.sourceUrl ?? bestLowConfidence.imageUrl,
        confidence: bestLowConfidence.confidence,
        failureReason: 'low_confidence',
        fetchedAt: nowIso(),
      });
    }

    return this.markStatus(artist, 'not_found', {
      provider: this.providers[0]?.name ?? defaultProvider,
      confidence: 0,
      failureReason: 'no_result',
      fetchedAt: nowIso(),
    });
  }

  private ensurePendingRow(artist: ResolvedArtist, force: boolean): void {
    const timestamp = nowIso();
    const existing = this.getCacheEntry(artist.artistKey);

    if (!existing) {
      this.database
        .prepare(
          `INSERT INTO artist_image_cache (
            artist_key, artist_name, provider, status, confidence, created_at, updated_at
          ) VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
        )
        .run(artist.artistKey, artist.artistName, this.providers[0]?.name ?? defaultProvider, timestamp, timestamp);
      return;
    }

    if (!force && existing.status === 'pending') {
      return;
    }

    this.database
      .prepare(
        `UPDATE artist_image_cache
         SET artist_name = ?,
             status = 'pending',
             failure_reason = NULL,
             updated_at = ?
         WHERE artist_key = ?`,
      )
      .run(artist.artistName, timestamp, artist.artistKey);
  }

  private markLoading(artist: ResolvedArtist): ArtistImageCacheEntry {
    return this.markStatus(artist, 'loading', {
      provider: this.providers[0]?.name ?? defaultProvider,
      failureReason: null,
    });
  }

  private markStatus(
    artist: ResolvedArtist,
    status: ArtistImageCacheStatus,
    fields: Partial<{
      provider: string;
      providerArtistId: string | null;
      sourceUrl: string | null;
      sourceHash: string | null;
      thumbPath: string | null;
      mediumPath: string | null;
      largePath: string | null;
      confidence: number;
      failureReason: string | null;
      fetchedAt: string | null;
    }> = {},
  ): ArtistImageCacheEntry {
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO artist_image_cache (
          artist_key, artist_name, provider, provider_artist_id, source_url, source_hash,
          thumb_path, medium_path, large_path, status, confidence, failure_reason,
          fetched_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(artist_key) DO UPDATE SET
          artist_name = excluded.artist_name,
          provider = excluded.provider,
          provider_artist_id = excluded.provider_artist_id,
          source_url = excluded.source_url,
          source_hash = excluded.source_hash,
          thumb_path = COALESCE(excluded.thumb_path, artist_image_cache.thumb_path),
          medium_path = COALESCE(excluded.medium_path, artist_image_cache.medium_path),
          large_path = COALESCE(excluded.large_path, artist_image_cache.large_path),
          status = excluded.status,
          confidence = excluded.confidence,
          failure_reason = excluded.failure_reason,
          fetched_at = excluded.fetched_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        artist.artistKey,
        artist.artistName,
        fields.provider ?? this.getCacheEntry(artist.artistKey)?.provider ?? this.providers[0]?.name ?? defaultProvider,
        fields.providerArtistId ?? null,
        fields.sourceUrl ?? null,
        fields.sourceHash ?? null,
        fields.thumbPath ?? null,
        fields.mediumPath ?? null,
        fields.largePath ?? null,
        status,
        fields.confidence ?? 0,
        fields.failureReason ?? null,
        fields.fetchedAt ?? null,
        timestamp,
        timestamp,
      );

    return this.getCacheEntry(artist.artistKey)!;
  }

  private getCacheEntry(artistKey: string): ArtistImageCacheEntry | null {
    const row = this.database
      .prepare<[string], DbRow>(
        `SELECT *
         FROM artist_image_cache
         WHERE artist_key = ?`,
      )
      .get(artistKey);

    return row ? this.mapCacheEntry(row) : null;
  }

  private mapCacheEntry(row: DbRow): ArtistImageCacheEntry {
    return {
      artistKey: String(row.artist_key),
      artistName: String(row.artist_name),
      provider: String(row.provider),
      providerArtistId: textOrNull(row.provider_artist_id),
      sourceUrl: textOrNull(row.source_url),
      sourceHash: textOrNull(row.source_hash),
      thumbPath: textOrNull(row.thumb_path),
      mediumPath: textOrNull(row.medium_path),
      largePath: textOrNull(row.large_path),
      status: statusOrPending(row.status),
      confidence: Number(row.confidence ?? 0),
      failureReason: textOrNull(row.failure_reason),
      fetchedAt: textOrNull(row.fetched_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private resolveArtist(input: ArtistImageLookupInput): ResolvedArtist | null {
    const lookupId = input.artistId ?? input.id ?? null;
    const lookupKey = input.artistKey ?? null;
    const row = lookupId || lookupKey
      ? this.database
          .prepare<[string | null, string | null, string | null, string | null], DbRow>(
            `SELECT id, artist_key, name
             FROM artists
             WHERE (? IS NOT NULL AND id = ?)
                OR (? IS NOT NULL AND artist_key = ?)
             LIMIT 1`,
          )
          .get(lookupId, lookupId, lookupKey, lookupKey)
      : null;

    if (row) {
      return {
        artistId: String(row.id),
        artistKey: String(row.artist_key),
        artistName: String(row.name),
      };
    }

    const artistName = input.artistName ?? input.name ?? null;
    if (!artistName?.trim()) {
      return null;
    }

    return {
      artistId: null,
      artistKey: lookupKey ?? artistImageKeyForName(artistName.trim()),
      artistName: artistName.trim(),
    };
  }

  private findMissingArtists(limit: number, includeFailed = false): ResolvedArtist[] {
    return this.database
      .prepare<[number, number], DbRow>(
        `SELECT artists.id, artists.artist_key, artists.name
         FROM artists
         LEFT JOIN artist_image_cache ON artist_image_cache.artist_key = artists.artist_key
         WHERE artist_image_cache.artist_key IS NULL
            OR artist_image_cache.status = 'pending'
            OR artist_image_cache.status = 'loading'
            OR (? = 1 AND artist_image_cache.status IN ('not_found', 'error', 'rate_limited'))
         ORDER BY artists.track_count DESC, artists.album_count DESC, artists.name COLLATE NOCASE
         LIMIT ?`,
      )
      .all(includeFailed ? 1 : 0, Math.max(1, Math.min(1000, Math.floor(limit))))
      .map((row) => ({
        artistId: String(row.id),
        artistKey: String(row.artist_key),
        artistName: String(row.name),
      }));
  }

  private async waitForProviderRateLimit(provider: ArtistImageProvider): Promise<void> {
    const minInterval = provider.minRequestIntervalMs ?? 800;
    const now = Date.now();
    const lastRequestAt = this.lastProviderRequestAt.get(provider.name) ?? 0;
    const waitMs = Math.max(0, lastRequestAt + minInterval - now);

    if (waitMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
    }

    this.lastProviderRequestAt.set(provider.name, Date.now());
  }

  private statusForProviderError(error: unknown): ArtistImageCacheStatus {
    const message = error instanceof Error ? error.message : String(error);
    return /(?:429|rate[_ -]?limit|too many requests)/iu.test(message) ? 'rate_limited' : 'error';
  }

  private readonly downloadImage = async (url: string): Promise<DownloadedImage> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), imageRequestTimeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
          Referer: 'https://y.qq.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      if (response.status === 404) {
        throw new ArtistImageDownloadError('artist_image_not_found', 'not_found');
      }
      if (response.status === 429) {
        throw new ArtistImageDownloadError('artist_image_rate_limited', 'rate_limited');
      }
      if (!response.ok) {
        throw new ArtistImageDownloadError(`artist_image_request_failed:${response.status}`, 'error');
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new ArtistImageDownloadError('artist_image_too_large', 'error');
      }

      const contentType = response.headers.get('content-type');
      const mimeType = isSupportedImageMimeType(contentType) ? contentType.split(';')[0] : mimeTypeForImageUrl(url);
      if (!mimeType || !isSupportedImageMimeType(mimeType)) {
        throw new ArtistImageDownloadError('artist_image_unsupported_type', 'error');
      }

      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > maxImageBytes) {
        throw new ArtistImageDownloadError('artist_image_too_large', 'error');
      }

      const contentHash = createHash('sha256').update(data).digest('hex');
      return {
        data,
        mimeType,
        sourceHash: createHash('sha256').update(`${url}\0${contentHash}`).digest('hex'),
      };
    } catch (error) {
      if (error instanceof ArtistImageDownloadError) {
        throw error;
      }
      throw new ArtistImageDownloadError(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      clearTimeout(timer);
    }
  };

  private async writeImageVariants(
    artistKey: string,
    data: Uint8Array,
  ): Promise<{ thumbPath: string; mediumPath: string; largePath: string }> {
    const artistDirectory = join(this.cacheRoot, hashText(artistKey));
    const thumbPath = join(artistDirectory, 'thumb.webp');
    const mediumPath = join(artistDirectory, 'medium.webp');
    const largePath = join(artistDirectory, 'large.webp');
    const tempId = randomUUID();
    const tempThumbPath = join(artistDirectory, `thumb.${tempId}.tmp.webp`);
    const tempMediumPath = join(artistDirectory, `medium.${tempId}.tmp.webp`);
    const tempLargePath = join(artistDirectory, `large.${tempId}.tmp.webp`);

    await mkdir(artistDirectory, { recursive: true });

    try {
      const source = sharp(Buffer.from(data)).rotate();
      await Promise.all([
        source.clone().resize(128, 128, { fit: 'cover', position: 'centre' }).webp({ quality: 76, effort: 4 }).toFile(tempThumbPath),
        source.clone().resize(320, 320, { fit: 'cover', position: 'centre' }).webp({ quality: 82, effort: 4 }).toFile(tempMediumPath),
        source.clone().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 4 }).toFile(tempLargePath),
      ]);
      await rename(tempThumbPath, thumbPath);
      await rename(tempMediumPath, mediumPath);
      await rename(tempLargePath, largePath);
    } catch (error) {
      await Promise.all([
        rm(tempThumbPath, { force: true }),
        rm(tempMediumPath, { force: true }),
        rm(tempLargePath, { force: true }),
      ]);
      throw new ArtistImageDownloadError(error instanceof Error ? error.message : String(error), 'error');
    }

    return {
      thumbPath,
      mediumPath,
      largePath,
    };
  }
}

const directoryStats = (targetPath: string): { fileCount: number; sizeBytes: number } => {
  if (!existsSync(targetPath)) {
    return { fileCount: 0, sizeBytes: 0 };
  }

  let fileCount = 0;
  let sizeBytes = 0;
  const pending = [targetPath];

  while (pending.length > 0) {
    const current = pending.pop()!;
    const stat = statSync(current);

    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        pending.push(join(current, entry));
      }
    } else {
      fileCount += 1;
      sizeBytes += stat.size;
    }
  }

  return { fileCount, sizeBytes };
};

const clearDirectoryContents = (targetPath: string): void => {
  const root = resolve(targetPath);
  if (basename(root) !== 'artist-images') {
    throw new Error(`Refusing to clear unexpected artist image cache directory: ${root}`);
  }

  if (!existsSync(root)) {
    return;
  }

  for (const entry of readdirSync(root)) {
    rmSync(join(root, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
};

const isPathInsideDirectory = (directory: string, filePath: string): boolean => {
  const relativePath = relative(resolve(directory), resolve(filePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
};
