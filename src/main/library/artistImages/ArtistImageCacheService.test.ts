import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type EchoDatabase } from '../../database/createDatabase';
import { LibraryStore } from '../LibraryStore';
import { ArtistImageCacheService } from './ArtistImageCacheService';
import { artistImageKeyForName } from './ArtistImageMatching';
import type { ArtistImageCandidate, ArtistImageProvider } from './ArtistImageTypes';

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-artist-images-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const validPng = (): Uint8Array =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  );

const insertArtist = (database: EchoDatabase, id: string, name: string): string => {
  const key = artistImageKeyForName(name);
  database
    .prepare(
      `INSERT INTO artists (
        id, artist_key, name, sort_name, role, track_count, album_count, cover_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'track', 1, 0, NULL, ?, ?)`,
    )
    .run(id, key, name, key, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  return key;
};

const insertCache = (
  database: EchoDatabase,
  artistKey: string,
  status: string,
  overrides: Record<string, unknown> = {},
): void => {
  database
    .prepare(
      `INSERT INTO artist_image_cache (
        artist_key, artist_name, provider, provider_artist_id, source_url, source_hash,
        thumb_path, medium_path, large_path, status, confidence, failure_reason,
        fetched_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      artistKey,
      overrides.artistName ?? 'Echo Artist',
      overrides.provider ?? 'qqmusic',
      overrides.providerArtistId ?? null,
      overrides.sourceUrl ?? null,
      overrides.sourceHash ?? null,
      overrides.thumbPath ?? null,
      overrides.mediumPath ?? null,
      overrides.largePath ?? null,
      status,
      overrides.confidence ?? 0,
      overrides.failureReason ?? null,
      overrides.fetchedAt ?? null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );
};

const createProvider = (searchArtistImage: ReturnType<typeof vi.fn>): ArtistImageProvider => ({
  name: 'mock',
  minRequestIntervalMs: 0,
  searchArtistImage: searchArtistImage as (input: { artistName: string; artistKey: string }) => Promise<ArtistImageCandidate[]>,
});

const createService = (
  database: EchoDatabase,
  provider: ArtistImageProvider,
  root = makeTempRoot(),
): ArtistImageCacheService =>
  new ArtistImageCacheService(database, {
    cacheRoot: join(root, 'artist-images'),
    providers: [provider],
    fetchImage: async (url) => ({
      data: validPng(),
      mimeType: 'image/png',
      sourceHash: `hash:${url}`,
    }),
  });

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ArtistImageCacheService', () => {
  it('does not request the provider when a matched cache exists', () => {
    const database = createDatabase(':memory:');
    const artistKey = insertArtist(database, 'artist-1', 'Echo Artist');
    insertCache(database, artistKey, 'matched', {
      thumbPath: 'D:/cache/thumb.webp',
      mediumPath: 'D:/cache/medium.webp',
      largePath: 'D:/cache/large.webp',
      confidence: 0.96,
    });
    const providerSearch = vi.fn();
    const service = createService(database, createProvider(providerSearch));

    const result = service.refreshVisibleArtistImages([{ id: 'artist-1', name: 'Echo Artist' }]);

    expect(result).toEqual({ queued: 0, skipped: 1 });
    expect(providerSearch).not.toHaveBeenCalled();
    database.close();
  });

  it('does not retry not_found or error rows during the next enqueue', () => {
    const database = createDatabase(':memory:');
    const missingKey = insertArtist(database, 'artist-1', 'Missing Artist');
    const errorKey = insertArtist(database, 'artist-2', 'Error Artist');
    insertCache(database, missingKey, 'not_found', { failureReason: 'no_result' });
    insertCache(database, errorKey, 'error', { failureReason: 'network' });
    const providerSearch = vi.fn();
    const service = createService(database, createProvider(providerSearch));

    const result = service.enqueueMissingArtistImages([
      { id: 'artist-1', name: 'Missing Artist' },
      { id: 'artist-2', name: 'Error Artist' },
    ]);

    expect(result).toEqual({ queued: 0, skipped: 2 });
    expect(providerSearch).not.toHaveBeenCalled();
    database.close();
  });

  it('includes failed cache rows when enqueueing missing artists with force', async () => {
    const database = createDatabase(':memory:');
    const missingKey = insertArtist(database, 'artist-1', 'Missing Artist');
    const errorKey = insertArtist(database, 'artist-2', 'Error Artist');
    insertCache(database, missingKey, 'not_found', { failureReason: 'no_result' });
    insertCache(database, errorKey, 'error', { failureReason: 'network' });
    const providerSearch = vi.fn().mockResolvedValue([]);
    const service = createService(database, createProvider(providerSearch));

    const result = service.enqueueMissingArtistImages([], { force: true, limit: 10 });

    expect(result).toEqual({ queued: 2, skipped: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(providerSearch).toHaveBeenCalledTimes(2);
    database.close();
  });

  it('retries stale loading rows on the next service run', async () => {
    const database = createDatabase(':memory:');
    const artistKey = insertArtist(database, 'artist-1', 'Interrupted Artist');
    insertCache(database, artistKey, 'loading');
    const providerSearch = vi.fn().mockResolvedValue([]);
    const service = createService(database, createProvider(providerSearch));

    const result = await service.refreshArtistImage('artist-1');

    expect(providerSearch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      queued: true,
      entry: {
        status: 'not_found',
        failureReason: 'no_result',
      },
    });
    database.close();
  });

  it('forceRefresh requests the provider again', async () => {
    const database = createDatabase(':memory:');
    const artistKey = insertArtist(database, 'artist-1', 'Echo Artist');
    insertCache(database, artistKey, 'matched', { confidence: 0.96, sourceUrl: 'https://old.example/avatar.jpg' });
    const providerSearch = vi.fn().mockResolvedValue([
      {
        provider: 'mock',
        providerArtistId: 'remote-1',
        artistName: 'Echo Artist',
        imageUrl: 'https://example.test/avatar.jpg',
        confidence: 0.96,
        sourceUrl: 'https://example.test/artist',
      },
    ]);
    const service = createService(database, createProvider(providerSearch));

    const result = await service.refreshArtistImage('artist-1', true);

    expect(providerSearch).toHaveBeenCalledTimes(1);
    expect(result.entry).toMatchObject({
      status: 'matched',
      provider: 'mock',
      providerArtistId: 'remote-1',
      sourceUrl: 'https://example.test/artist',
      confidence: 0.96,
    });
    expect(result.entry?.thumbPath).toContain('thumb.webp');
    database.close();
  });

  it('stores low-confidence provider results as not_found', async () => {
    const database = createDatabase(':memory:');
    insertArtist(database, 'artist-1', 'A');
    const providerSearch = vi.fn().mockResolvedValue([
      {
        provider: 'mock',
        providerArtistId: 'remote-1',
        artistName: 'A',
        imageUrl: 'https://example.test/avatar.jpg',
        confidence: 0.7,
        sourceUrl: 'https://example.test/artist',
      },
    ]);
    const service = createService(database, createProvider(providerSearch));

    const result = await service.refreshArtistImage('artist-1', true);

    expect(result.entry).toMatchObject({
      status: 'not_found',
      failureReason: 'low_confidence',
      confidence: 0.7,
    });
    database.close();
  });

  it('getArtists returns cached local artist avatar URLs', () => {
    const database = createDatabase(':memory:');
    const artistKey = insertArtist(database, 'artist-1', 'Echo Artist');
    insertCache(database, artistKey, 'matched', {
      thumbPath: 'D:/cache/thumb.webp',
      mediumPath: 'D:/cache/medium.webp',
      largePath: 'D:/cache/large.webp',
      confidence: 0.96,
    });
    const store = new LibraryStore(database);

    const artist = store.getArtists({ pageSize: 1 }).items[0];

    expect(artist.avatarThumbUrl).toBe(`echo-artist-image://thumb/${encodeURIComponent(artistKey)}`);
    expect(artist.avatarUrl).toBe(`echo-artist-image://large/${encodeURIComponent(artistKey)}`);
    expect(artist.avatarStatus).toBe('matched');
    expect(artist.avatarProvider).toBe('qqmusic');
    database.close();
  });

  it('does not resolve image paths outside the artist image cache directory', () => {
    const database = createDatabase(':memory:');
    const artistKey = insertArtist(database, 'artist-1', 'Echo Artist');
    insertCache(database, artistKey, 'matched', {
      thumbPath: 'D:/outside/thumb.webp',
      mediumPath: 'D:/outside/medium.webp',
      largePath: 'D:/outside/large.webp',
      confidence: 0.96,
    });
    const providerSearch = vi.fn();
    const service = createService(database, createProvider(providerSearch));

    expect(service.resolveAsset(artistKey, 'thumb')).toBeNull();
    database.close();
  });
});
