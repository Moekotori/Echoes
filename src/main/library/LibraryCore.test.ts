import { existsSync, mkdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../database/createDatabase';
import { migrations } from '../database/migrations';
import { MetadataService } from './MetadataService';
import { createLibraryService } from './LibraryService';
import { NetworkMetadataStore } from './network/NetworkMetadataStore';
import type { AlbumMergeStrategy } from './AlbumService';
import type {
  CoverCacheRepairOptions,
  CoverExtractOptions,
  CoverResult,
  LibraryScanOptions,
  MetadataResult,
  ParsedTrackMetadata,
  ScannedAudioFile,
  ScannedFile,
} from './libraryTypes';
import type { CoverExtractor } from './workers/CoverExtractor';
import type { FileScanner } from './workers/FileScanner';
import type { MetadataReader } from './workers/MetadataReader';

const tempRoots: string[] = [];
const cleanupCallbacks: Array<() => void> = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const writeAudioFile = (folder: string, name: string, mtime = new Date('2024-01-01T00:00:00.000Z')): string => {
  const filePath = join(folder, name);
  writeFileSync(filePath, `fake audio ${name}`);
  utimesSync(filePath, mtime, mtime);
  return filePath;
};

const validCoverPng = (): Uint8Array =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  );

const baseMetadata = (overrides: Partial<ParsedTrackMetadata> = {}): ParsedTrackMetadata => ({
  title: 'Embedded Title',
  artist: 'Embedded Artist',
  album: 'Embedded Album',
  albumArtist: 'Embedded Album Artist',
  trackNo: 1,
  discNo: 1,
  year: 2024,
  genre: 'Electronic',
  duration: 180,
  codec: 'FLAC',
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 1600000,
  fieldSources: {
    title: 'embedded',
    artist: 'embedded',
    album: 'embedded',
    albumArtist: 'embedded',
    trackNo: 'embedded',
    discNo: 'embedded',
    year: 'embedded',
    genre: 'embedded',
    duration: 'technical',
    codec: 'technical',
    sampleRate: 'technical',
    bitDepth: 'technical',
    bitrate: 'technical',
  },
  ...overrides,
});

const metadataWithSources = (
  overrides: Partial<ParsedTrackMetadata>,
  fieldSources: Partial<ParsedTrackMetadata['fieldSources']>,
): ParsedTrackMetadata => {
  const mergedSources = { ...baseMetadata().fieldSources };
  for (const [key, value] of Object.entries(fieldSources)) {
    if (value) {
      mergedSources[key] = value;
    }
  }

  return baseMetadata({ ...overrides, fieldSources: mergedSources });
};

class MockMetadataService extends MetadataService {
  readonly calls: string[] = [];
  readonly overrides = new Map<string, Partial<ParsedTrackMetadata>>();
  readonly failures = new Set<string>();

  async read(file: ScannedAudioFile): Promise<ParsedTrackMetadata> {
    this.calls.push(file.path);
    if (this.failures.has(file.path)) {
      throw new Error('metadata boom');
    }

    return baseMetadata(this.overrides.get(file.path));
  }
}

const metadataResult = (overrides: Partial<ParsedTrackMetadata> = {}, extras: Partial<MetadataResult> = {}): MetadataResult => {
  const metadata = baseMetadata(overrides);

  return {
    fields: {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      albumArtist: metadata.albumArtist,
      trackNo: metadata.trackNo,
      discNo: metadata.discNo,
      year: metadata.year,
      genre: metadata.genre,
      duration: metadata.duration,
      codec: metadata.codec,
      sampleRate: metadata.sampleRate,
      bitDepth: metadata.bitDepth,
      bitrate: metadata.bitrate,
    },
    fieldSources: metadata.fieldSources,
    embeddedCover: metadata.embeddedCover,
    embeddedMetadataStatus: metadata.embeddedMetadataStatus ?? 'present',
    embeddedCoverStatus: metadata.embeddedCoverStatus ?? (metadata.embeddedCover ? 'present' : 'missing'),
    warnings: [],
    errors: [],
    status: 'ok',
    ...extras,
  };
};

class FakeMetadataReader implements MetadataReader {
  readonly calls: string[] = [];

  constructor(private readonly result: MetadataResult = metadataResult()) {}

  async read(filePath: string): Promise<MetadataResult> {
    this.calls.push(filePath);
    return this.result;
  }
}

class FakeCoverExtractor implements CoverExtractor {
  readonly calls: string[] = [];
  readonly repairCalls: string[] = [];

  constructor(private readonly result?: Partial<CoverResult>) {}

  async extract(filePath: string, options: CoverExtractOptions): Promise<CoverResult> {
    this.calls.push(filePath);
    const sourceHash = this.result?.sourceHash ?? `fake-${this.calls.length}`;
    const coverRoot = join(options.cacheRoot, sourceHash.slice(0, 2), sourceHash);
    mkdirSync(coverRoot, { recursive: true });
    const thumbPath = this.result?.thumbPath ?? join(coverRoot, 'thumb.webp');
    const albumPath = this.result?.albumPath ?? join(coverRoot, 'album.webp');
    const largePath = this.result?.largePath ?? join(coverRoot, 'large.webp');
    const originalRef = this.result?.originalRef ?? join(coverRoot, 'original.svg');

    writeFileSync(thumbPath, 'thumb');
    writeFileSync(albumPath, 'album');
    writeFileSync(largePath, 'large');
    writeFileSync(originalRef, 'original');

    return {
      source: 'default',
      thumbPath,
      albumPath,
      largePath,
      originalRef,
      sourceHash,
      mimeType: 'image/svg+xml',
      warnings: [],
      errors: [],
      ...this.result,
    };
  }

  async repairCachedCover(options: CoverCacheRepairOptions): Promise<CoverResult> {
    this.repairCalls.push(options.sourceHash);
    const coverRoot = join(options.cacheRoot, options.sourceHash.slice(0, 2), options.sourceHash);
    mkdirSync(coverRoot, { recursive: true });
    const thumbPath = options.thumbPath ?? join(coverRoot, 'thumb.webp');
    const albumPath = options.albumPath ?? join(coverRoot, 'album.webp');
    const largePath = options.largePath ?? join(coverRoot, 'large.webp');

    if (!existsSync(thumbPath)) {
      writeFileSync(thumbPath, 'thumb');
    }

    if (!existsSync(albumPath)) {
      writeFileSync(albumPath, 'album');
    }

    if (!existsSync(largePath)) {
      writeFileSync(largePath, 'large');
    }

    return {
      source: options.source,
      thumbPath,
      albumPath,
      largePath,
      originalRef: options.originalRef,
      sourceHash: options.sourceHash,
      mimeType: options.mimeType,
      warnings: [],
      errors: [],
    };
  }
}

class ThrowingCoverExtractor implements CoverExtractor {
  async extract(): Promise<CoverResult> {
    throw new Error('cover extractor boom');
  }
}

class FakeFileScanner implements FileScanner {
  readonly calls: string[] = [];

  constructor(private readonly files: ScannedFile[]) {}

  async *scanFolder(folderPath: string): AsyncIterable<ScannedFile> {
    this.calls.push(folderPath);

    for (const file of this.files) {
      yield file;
    }
  }
}

const createHarness = (
  overrides: { coverExtractor?: CoverExtractor; metadataReader?: MetadataReader; fileScanner?: FileScanner } = {},
) => {
  const root = makeTempRoot();
  const folder = join(root, 'music');
  mkdirSync(folder, { recursive: true });
  const metadataService = new MockMetadataService();
  const databasePath = join(root, 'library.sqlite');
  const coverCacheDir = join(root, 'cover-cache');
  let albumMergeStrategy: AlbumMergeStrategy = 'standard';
  let chineseCrossScriptSearchEnabled = true;
  const service = createLibraryService(databasePath, {
    metadataService,
    coverCacheDir,
    appSettings: () => ({
      appearanceTheme: 'light',
      albumMergeStrategy,
      chineseCrossScriptSearchEnabled,
      artistWallAlbumArtwork: false,
      coverCacheDir,
      hideToTrayOnClose: false,
      appCustomWallpaperPath: null,
      appWallpaperScalePercent: 100,
      appWallpaperBlurPx: 0,
      appWallpaperBrightnessPercent: 100,
      appWallpaperUiOpacityPercent: 100,
      appWallpaperUnifiedOpacityEnabled: false,
      networkMetadataEnabled: false,
      networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
      lyricsNetworkEnabled: true,
      lyricsPreferredProvider: 'lrclib',
      lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
      lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
      lyricsDeepSearchEnabled: true,
      lyricsAutoSearch: true,
      lyricsAutoAcceptScore: 0.7,
      lyricsDefaultOffsetMs: 0,
      lyricsGlobalSyncOffsetMs: 0,
      lyricsEnabled: true,
      lyricsHeaderHidden: false,
      lyricsEmptyStateHidden: true,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
      lyricsFontSizePx: 28,
      lyricsColor: '#ffffff',
      lyricsBackgroundMode: 'theme',
      lyricsCustomWallpaperPath: null,
      lyricsCoverOpacityPercent: 100,
      lyricsCoverBlurPx: 10,
      lyricsCoverBrightnessPercent: 100,
      lyricsBackgroundScalePercent: 100,
      mvEnabledProviders: ['bilibili', 'youtube'],
      mvProviderOrder: ['bilibili', 'youtube'],
      mvAutoSearch: true,
      mvMaxQuality: '1080p',
      mvAllow60fps: true,
      channelBalance: {
        enabled: false,
        balance: 0,
        leftGainDb: 0,
        rightGainDb: 0,
        swapLeftRight: false,
        monoMode: 'off',
        invertLeft: false,
        invertRight: false,
        constantPower: true,
      },
      playerVolume: 1,
      playbackSpeed: 1,
      playbackSpeedMode: 'nightcore',
      scanPerformanceMode: 'balanced',
      duplicateTracksEnabled: false,
      duplicateTracksMode: 'strict',
      duplicateTracksAutoRebuildAfterScan: false,
      discordRichPresenceEnabled: false,
      lastFmEnabled: false,
      lastFmUsername: null,
      lastFmSessionKey: null,
      lastFmScrobbleEnabled: true,
      lastFmNowPlayingEnabled: true,
      lastFmMinScrobbleSeconds: 30,
      lastFmAuthToken: null,
      smtcEnabled: true,
    }),
    ...overrides,
  });
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    try {
      service.close();
    } catch {
      // Some tests intentionally close and reopen the service to simulate app restart.
    }
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // SQLite and image codecs can release Windows handles a tick after test assertions finish.
    }
  };

  cleanupCallbacks.push(cleanup);

  return {
    root,
    folder,
    databasePath,
    coverCacheDir,
    metadataService,
    service,
    async scanFolder(options: LibraryScanOptions = {}) {
      const [libraryFolder] = service.getFolders();
      const job = service.scanFolder(libraryFolder.id, options);
      await service.waitForScan(job.id);
      return service.getScanStatus(job.id);
    },
    addFolder() {
      return service.addFolder(folder);
    },
    setAlbumMergeStrategy(strategy: AlbumMergeStrategy) {
      albumMergeStrategy = strategy;
    },
    setChineseCrossScriptSearchEnabled(enabled: boolean) {
      chineseCrossScriptSearchEnabled = enabled;
    },
    cleanup() {
      cleanup();
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const cleanup of cleanupCallbacks.splice(0)) {
    cleanup();
  }

  for (const root of tempRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // SQLite WAL handles can linger briefly after an assertion failure on Windows.
    }
  }
});

describe('Library Core', () => {
  it('migration can initialize database and run repeatedly', () => {
    const root = makeTempRoot();
    const databasePath = join(root, 'library.sqlite');
    const database = createDatabase(databasePath);
    const tables = database.prepare<unknown[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const indexes = database.prepare<unknown[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'folders',
        'tracks',
        'tracks_fts',
        'remote_tracks_fts',
        'albums',
        'album_tracks',
        'artists',
        'artist_tracks',
        'artist_albums',
        'covers',
        'scan_jobs',
        'playback_history',
        'playback_history_stats',
        'playlists',
        'playlist_items',
        'network_metadata_candidates',
        'network_metadata_decisions',
        'network_cover_candidates',
        'lyrics_cache',
        'lyrics_candidates',
        'duplicate_track_groups',
        'duplicate_track_members',
      ]),
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_tracks_path',
        'idx_tracks_folder_id',
        'idx_tracks_title',
        'idx_tracks_artist',
        'idx_tracks_album',
        'idx_albums_album_key',
        'idx_album_tracks_album_id',
        'idx_album_tracks_track_id',
        'idx_artist_tracks_artist_id',
        'idx_artist_tracks_track_id',
        'idx_artist_albums_artist_id',
        'idx_artist_albums_album_id',
        'idx_folders_path',
        'idx_covers_id',
        'idx_covers_source_hash',
        'idx_playback_history_started_at',
        'idx_playback_history_track_id',
        'idx_playback_history_completed',
        'idx_playback_history_track_started',
        'idx_playback_history_path_started',
        'idx_playback_history_stats_play_count',
        'idx_playback_history_stats_last_started_at',
        'idx_playlist_items_playlist_position',
        'idx_playlist_items_media',
        'idx_playlist_items_source',
        'idx_network_metadata_candidates_track_id',
        'idx_network_metadata_decisions_track_id',
        'idx_network_cover_candidates_track_id',
        'idx_lyrics_cache_track_provider',
        'idx_lyrics_cache_cache_key',
        'idx_lyrics_candidates_track_provider_status',
        'idx_duplicate_members_track_id',
        'idx_duplicate_members_group_rank',
        'idx_duplicate_groups_representative',
        'idx_duplicate_members_hidden',
      ]),
    );

    database.close();
    const reopened = createDatabase(databasePath);
    const migrationRows = reopened.prepare<unknown[], { id: number }>('SELECT id FROM schema_migrations ORDER BY id').all();

    expect(migrationRows.map((row) => Number(row.id))).toEqual(migrations.map((migration) => migration.id));
    reopened.close();
  });

  it('migration backfills playback history stats from existing history rows', () => {
    const root = makeTempRoot();
    const databasePath = join(root, 'library.sqlite');
    const database = createDatabase(databasePath);

    database.exec(`
      INSERT INTO playback_history (
        id, track_id, track_path, title, artist, album, album_artist, cover_id,
        started_at, ended_at, played_seconds, duration_seconds, completed,
        source_type, source_label, queue_id, created_at
      ) VALUES
        ('history-1', 'track-a', 'A.flac', 'Old Title', 'Artist A', 'Album A', 'Album Artist A', NULL,
          '2026-05-12T10:00:00.000Z', '2026-05-12T10:01:00.000Z', 10, 60, 0,
          'songs', 'Songs', 'queue-1', '2026-05-12T10:00:00.000Z'),
        ('history-2', 'track-a', 'A.flac', 'Latest Title', 'Artist A', 'Album A', 'Album Artist A', 'cover-a',
          '2026-05-12T11:00:00.000Z', '2026-05-12T11:01:00.000Z', 40, 60, 1,
          'album', 'Album A', 'queue-2', '2026-05-12T11:00:00.000Z'),
        ('history-3', NULL, 'Stream.flac', 'Stream Title', 'Artist B', 'Album B', 'Album Artist B', NULL,
          '2026-05-12T12:00:00.000Z', NULL, 5, 0, 0,
          'stream', 'Stream', NULL, '2026-05-12T12:00:00.000Z');
      DELETE FROM playback_history_stats;
    `);

    migrations.find((migration) => migration.id === 8)?.apply(database);
    const rows = database
      .prepare<
        unknown[],
        {
          history_key: string;
          title: string;
          play_count: number;
          completed_count: number;
          total_played_seconds: number;
          last_started_at: string;
        }
      >(
        `SELECT history_key, title, play_count, completed_count, total_played_seconds, last_started_at
         FROM playback_history_stats
         ORDER BY play_count DESC, history_key ASC`,
      )
      .all();

    expect(rows).toEqual([
      {
        history_key: 'track-a',
        title: 'Latest Title',
        play_count: 2,
        completed_count: 1,
        total_played_seconds: 50,
        last_started_at: '2026-05-12T11:00:00.000Z',
      },
      {
        history_key: 'Stream.flac',
        title: 'Stream Title',
        play_count: 1,
        completed_count: 0,
        total_played_seconds: 5,
        last_started_at: '2026-05-12T12:00:00.000Z',
      },
    ]);

    database.close();
  });

  it('can add folder', () => {
    const harness = createHarness();
    const folder = harness.addFolder();

    expect(folder.path).toBe(harness.folder);
    expect(harness.service.getFolders()).toHaveLength(1);
    harness.cleanup();
  });

  it('addFolder is idempotent for the same path', () => {
    const harness = createHarness();
    const first = harness.addFolder();
    const second = harness.service.addFolder(harness.folder);

    expect(second.id).toBe(first.id);
    expect(harness.service.getFolders()).toHaveLength(1);
    harness.cleanup();
  });

  it('addFolder persists across service restart', () => {
    const harness = createHarness();
    harness.addFolder();
    harness.service.close();

    const restarted = createLibraryService(harness.databasePath, {
      metadataService: new MockMetadataService(),
      coverCacheDir: harness.coverCacheDir,
    });

    expect(restarted.getFolders()).toHaveLength(1);
    expect(restarted.getFolders()[0].path).toBe(harness.folder);
    restarted.close();
    harness.cleanup();
  });

  it('returns lazy folder overviews, child nodes, and scoped folder tracks', async () => {
    const harness = createHarness();
    const rockFolder = join(harness.folder, 'Rock');
    const liveFolder = join(rockFolder, 'Live');
    mkdirSync(liveFolder, { recursive: true });
    const rootTrack = writeAudioFile(harness.folder, 'Root Song.flac');
    const rockTrack = writeAudioFile(rockFolder, 'Rock Song.flac');
    const liveTrack = writeAudioFile(liveFolder, 'Live Song.flac');
    harness.metadataService.overrides.set(rootTrack, baseMetadata({ title: 'Root Song', artist: 'Root Artist', album: 'Root Album', duration: 60 }));
    harness.metadataService.overrides.set(rockTrack, baseMetadata({ title: 'Rock Song', artist: 'Rock Artist', album: 'Rock Album', duration: 120 }));
    harness.metadataService.overrides.set(liveTrack, baseMetadata({ title: 'Live Song', artist: 'Rock Artist', album: 'Live Album', duration: 180 }));
    const folder = harness.addFolder();

    await harness.scanFolder();
    const [overview] = harness.service.getFolderOverviews();
    const children = harness.service.getFolderChildren({ folderId: folder.id, parentPath: folder.path });
    const rootDirectTracks = harness.service.getFolderTracks({ folderId: folder.id, path: folder.path, recursive: false, pageSize: 10 });
    const rockRecursiveTracks = harness.service.getFolderTracks({ folderId: folder.id, path: rockFolder, recursive: true, pageSize: 10, sort: 'titleAsc' });
    const rockDirectTracks = harness.service.getFolderTracks({ folderId: folder.id, path: rockFolder, recursive: false, pageSize: 10 });

    expect(overview).toMatchObject({
      id: folder.id,
      trackCount: 3,
      albumCount: 3,
      childFolderCount: 1,
      totalDuration: 360,
    });
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      name: 'Rock',
      trackCount: 2,
      directTrackCount: 1,
      childFolderCount: 1,
    });
    expect(rootDirectTracks.items.map((track) => track.title)).toEqual(['Root Song']);
    expect(rockRecursiveTracks.items.map((track) => track.title)).toEqual(['Live Song', 'Rock Song']);
    expect(rockDirectTracks.items.map((track) => track.title)).toEqual(['Rock Song']);
    harness.cleanup();
  });

  it('rejects folder scoped queries outside the library root', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'Safe.flac');
    const folder = harness.addFolder();

    await harness.scanFolder();

    expect(() =>
      harness.service.getFolderTracks({
        folderId: folder.id,
        path: join(harness.root, 'outside'),
        recursive: true,
      }),
    ).toThrow(/outside the library root/);
    expect(() => harness.service.getFolderChildren({ folderId: folder.id, parentPath: join(harness.root, 'outside') })).toThrow(
      /outside the library root/,
    );
    harness.cleanup();
  });

  it('manages manual playlists with local track snapshots and pagination', async () => {
    const harness = createHarness();
    const firstPath = writeAudioFile(harness.folder, 'Playlist A.flac');
    const secondPath = writeAudioFile(harness.folder, 'Playlist B.flac');
    harness.metadataService.overrides.set(firstPath, baseMetadata({ title: 'Playlist One', artist: 'Artist A', album: 'Album A', duration: 111 }));
    harness.metadataService.overrides.set(secondPath, baseMetadata({ title: 'Playlist Two', artist: 'Artist B', album: 'Album B', duration: 222 }));
    harness.addFolder();

    await harness.scanFolder();
    const [firstTrack, secondTrack] = harness.service.getTracks({ pageSize: 2, sort: 'titleAsc' }).items;
    const playlist = harness.service.createPlaylist({ name: 'Road Mix', description: 'Manual picks' });
    const updated = harness.service.updatePlaylist({ playlistId: playlist.id, name: 'Road Mix 2', description: null });
    const [firstItem, secondItem] = harness.service.addTracksToPlaylist(updated.id, [firstTrack.id, secondTrack.id]);
    const firstPage = harness.service.getPlaylistItems(updated.id, { page: 1, pageSize: 1 });
    const secondPage = harness.service.getPlaylistItems(updated.id, { page: 2, pageSize: 1 });

    expect(updated.name).toBe('Road Mix 2');
    expect(harness.service.getPlaylists()[0]).toMatchObject({ id: playlist.id, itemCount: 2, sourceProvider: 'local' });
    expect(firstItem.titleSnapshot).toBe('Playlist One');
    expect(firstItem.sourceItemId).toBe(firstTrack.path);
    expect(firstItem.track?.id).toBe(firstTrack.id);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items[0].id).toBe(secondItem.id);

    harness.service.movePlaylistItem(updated.id, secondItem.id, 0);
    expect(harness.service.getPlaylistItems(updated.id, { pageSize: 10 }).items.map((item) => item.id)).toEqual([secondItem.id, firstItem.id]);

    harness.service.removePlaylistItem(secondItem.id);
    expect(harness.service.getPlaylist(updated.id)?.itemCount).toBe(1);

    harness.cleanup();
  }, 20000);

  it('orders playlist items by the saved playlist sort mode', async () => {
    const harness = createHarness();
    const bravoPath = writeAudioFile(harness.folder, 'Bravo.flac');
    const alphaPath = writeAudioFile(harness.folder, 'Alpha.flac');
    const charliePath = writeAudioFile(harness.folder, 'Charlie.flac');
    harness.metadataService.overrides.set(bravoPath, baseMetadata({ title: 'Bravo', artist: 'Zeta Artist', album: 'Album B' }));
    harness.metadataService.overrides.set(alphaPath, baseMetadata({ title: 'Alpha', artist: 'Alpha Artist', album: 'Album A' }));
    harness.metadataService.overrides.set(charliePath, baseMetadata({ title: 'Charlie', artist: 'Middle Artist', album: 'Album C' }));
    harness.addFolder();

    await harness.scanFolder();
    const tracks = harness.service.getTracks({ pageSize: 10, sort: 'titleAsc' }).items;
    const byTitle = new Map(tracks.map((track) => [track.title, track.id]));
    const playlist = harness.service.createPlaylist({ name: 'Sorted Mix' });
    harness.service.addTrackToPlaylist(playlist.id, byTitle.get('Bravo')!);
    await new Promise((resolve) => setTimeout(resolve, 2));
    harness.service.addTrackToPlaylist(playlist.id, byTitle.get('Alpha')!);
    await new Promise((resolve) => setTimeout(resolve, 2));
    harness.service.addTrackToPlaylist(playlist.id, byTitle.get('Charlie')!);

    const readTitles = () => harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items.map((item) => item.titleSnapshot);

    expect(readTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    harness.service.updatePlaylist({ playlistId: playlist.id, sortMode: 'titleAsc' });
    expect(readTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    harness.service.updatePlaylist({ playlistId: playlist.id, sortMode: 'titleDesc' });
    expect(readTitles()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    harness.service.updatePlaylist({ playlistId: playlist.id, sortMode: 'artistAsc' });
    expect(readTitles()).toEqual(['Alpha', 'Charlie', 'Bravo']);
    harness.service.updatePlaylist({ playlistId: playlist.id, sortMode: 'addedDesc' });
    expect(readTitles()).toEqual(['Charlie', 'Alpha', 'Bravo']);

    harness.cleanup();
  }, 20000);

  it('keeps playlist item snapshots when a local track is deleted', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Deleted Playlist Track.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Snapshot Title', artist: 'Snapshot Artist', album: 'Snapshot Album', duration: 90 }));
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    const playlist = harness.service.createPlaylist({ name: 'Snapshots' });
    const item = harness.service.addTrackToPlaylist(playlist.id, track.id);

    harness.service.deleteTrack(track.id);
    const [afterDelete] = harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items;

    expect(afterDelete.id).toBe(item.id);
    expect(afterDelete.track).toBeNull();
    expect(afterDelete.unavailable).toBe(true);
    expect(afterDelete.titleSnapshot).toBe('Snapshot Title');
    expect(afterDelete.artistSnapshot).toBe('Snapshot Artist');
    harness.cleanup();
  }, 20000);

  it('relinks local playlist items after library tracks are rebuilt', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Rebuilt Playlist Track.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Rebuilt Song', artist: 'Rebuilt Artist', album: 'Rebuilt Album', duration: 123 }));
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    const playlist = harness.service.createPlaylist({ name: 'Rebuilt Mix' });
    const item = harness.service.addTrackToPlaylist(playlist.id, track.id);

    harness.service.clearTracks();
    const [afterClear] = harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items;
    expect(afterClear.id).toBe(item.id);
    expect(afterClear.unavailable).toBe(true);

    const rebuiltTrack = await harness.service.importAudioFile(filePath);
    const [afterReimport] = harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items;

    expect(rebuiltTrack.id).not.toBe(track.id);
    expect(afterReimport.id).toBe(item.id);
    expect(afterReimport.mediaId).toBe(rebuiltTrack.id);
    expect(afterReimport.sourceItemId).toBe(rebuiltTrack.path);
    expect(afterReimport.track?.id).toBe(rebuiltTrack.id);
    expect(afterReimport.unavailable).toBe(false);
    harness.cleanup();
  }, 20000);

  it('relinks older local playlist items from snapshots when path identity is missing', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Legacy Playlist Track.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Legacy Song', artist: 'Legacy Artist', album: 'Legacy Album', duration: 99 }));
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    const playlist = harness.service.createPlaylist({ name: 'Legacy Mix' });
    const item = harness.service.addTrackToPlaylist(playlist.id, track.id);
    const database = createDatabase(harness.databasePath);
    database.prepare('UPDATE playlist_items SET source_item_id = NULL WHERE id = ?').run(item.id);
    database.close();

    harness.service.clearTracks();
    const rebuiltTrack = await harness.service.importAudioFile(filePath);
    const [afterReimport] = harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items;

    expect(rebuiltTrack.id).not.toBe(track.id);
    expect(afterReimport.id).toBe(item.id);
    expect(afterReimport.mediaId).toBe(rebuiltTrack.id);
    expect(afterReimport.sourceItemId).toBe(rebuiltTrack.path);
    expect(afterReimport.track?.id).toBe(rebuiltTrack.id);
    expect(afterReimport.unavailable).toBe(false);
    harness.cleanup();
  }, 20000);

  it('switches matching streaming playlist items to the downloaded local track', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Downloaded Stream.flac');
    const playlist = harness.service.createPlaylist({ name: 'Streaming Mix' });
    const streamingItem = harness.service.addStreamingTrackToPlaylist(playlist.id, {
      id: 'streaming:netease:123',
      provider: 'netease',
      providerTrackId: '123',
      stableKey: 'streaming:netease:123',
      title: 'Cloud Song',
      artist: 'Cloud Artist',
      album: 'Cloud Album',
      duration: 180,
      unavailable: false,
    });
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Downloaded Song', artist: 'Local Artist', album: 'Local Album' }));

    const localTrack = await harness.service.importAudioFile(filePath);
    const result = harness.service.linkDownloadedStreamingTrack({
      provider: 'netease',
      providerTrackId: '123',
      stableKey: 'streaming:netease:123',
      trackId: localTrack.id,
    });
    const [linkedItem] = harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).items;

    expect(result.updatedItems).toBe(1);
    expect(linkedItem.id).toBe(streamingItem.id);
    expect(linkedItem.mediaType).toBe('track');
    expect(linkedItem.mediaId).toBe(localTrack.id);
    expect(linkedItem.sourceProvider).toBe('local');
    expect(linkedItem.sourceItemId).toBe(localTrack.path);
    expect(linkedItem.track?.id).toBe(localTrack.id);
    expect(linkedItem.track?.mediaType).toBe('local');
    expect(linkedItem.unavailable).toBe(false);
    expect(linkedItem.titleSnapshot).toBe('Cloud Song');
    harness.cleanup();
  }, 20000);

  it('cascades playlist items when deleting a playlist', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'Cascade Playlist Track.flac');
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    const playlist = harness.service.createPlaylist({ name: 'Delete Me' });
    harness.service.addTrackToPlaylist(playlist.id, track.id);
    harness.service.deletePlaylist(playlist.id);

    expect(harness.service.getPlaylist(playlist.id)).toBeNull();
    expect(harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('rebuilds duplicate index and hides lower quality duplicates only when requested', async () => {
    const harness = createHarness();
    const hiresPath = writeAudioFile(harness.folder, 'Song hires.flac');
    const mp3Path = writeAudioFile(harness.folder, 'Song mp3.mp3');
    const uniquePath = writeAudioFile(harness.folder, 'Unique.flac');
    harness.metadataService.overrides.set(
      hiresPath,
      baseMetadata({
        title: 'Duplicate Song',
        artist: 'Duplicate Artist',
        album: 'Hi-Res Album',
        duration: 180,
        codec: 'FLAC',
        bitDepth: 24,
        sampleRate: 192_000,
        bitrate: 5_461_000,
      }),
    );
    harness.metadataService.overrides.set(
      mp3Path,
      baseMetadata({
        title: 'Duplicate Song',
        artist: 'Duplicate Artist',
        album: 'MP3 Album',
        duration: 181,
        codec: 'MP3',
        bitDepth: null,
        sampleRate: 44_100,
        bitrate: 320_000,
      }),
    );
    harness.metadataService.overrides.set(
      uniquePath,
      baseMetadata({
        title: 'Unique Song',
        artist: 'Duplicate Artist',
        album: 'Unique Album',
        duration: 200,
        codec: 'FLAC',
        bitDepth: 16,
        sampleRate: 44_100,
        bitrate: 1_013_000,
      }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const before = harness.service.getTracks({ pageSize: 10, sort: 'titleAsc' });
    const playlist = harness.service.createPlaylist({ name: 'Keep Links' });
    harness.service.addTrackToPlaylist(playlist.id, before.items[0].id);
    const summary = harness.service.refreshDuplicateTracks('strict');
    const visible = harness.service.getTracks({ pageSize: 10, sort: 'titleAsc', hideDuplicates: true, duplicateMode: 'strict' });
    const hiddenSearch = harness.service.getTracks({ pageSize: 10, search: 'MP3 Album', hideDuplicates: true, duplicateMode: 'strict' });
    const firstPage = harness.service.getTracks({ page: 1, pageSize: 1, sort: 'titleAsc', hideDuplicates: true, duplicateMode: 'strict' });
    const secondPage = harness.service.getTracks({ page: 2, pageSize: 1, sort: 'titleAsc', hideDuplicates: true, duplicateMode: 'strict' });
    const representative = visible.items.find((track) => track.title === 'Duplicate Song');
    const uniqueTrack = before.items.find((track) => track.title === 'Unique Song');
    const versions = representative ? harness.service.getDuplicateTrackVersions(representative.id) : [];

    expect(summary).toMatchObject({
      mode: 'strict',
      totalTracksScanned: 3,
      duplicateGroups: 1,
      duplicateMembers: 2,
      hiddenTracks: 1,
    });
    expect(before.total).toBe(3);
    expect(harness.service.getTracks({ pageSize: 10, sort: 'titleAsc' }).total).toBe(3);
    expect(visible.total).toBe(2);
    expect(visible.items.map((track) => track.album).sort()).toEqual(['Hi-Res Album', 'Unique Album']);
    expect(hiddenSearch.total).toBe(0);
    expect(firstPage.items).toHaveLength(1);
    expect(secondPage.items).toHaveLength(1);
    expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ rank: 1, hidden: false });
    expect(versions[0].track.album).toBe('Hi-Res Album');
    expect(versions[1]).toMatchObject({ rank: 2, hidden: true });
    expect(
      harness.service.getDuplicateHiddenCounts([versions[0].track.id, versions[1].track.id, uniqueTrack?.id ?? 'missing-track'], 'strict'),
    ).toEqual({
      [versions[0].track.id]: 1,
      [versions[1].track.id]: 1,
      [uniqueTrack?.id ?? 'missing-track']: 0,
    });
    expect(harness.service.getDuplicateTrackGroup(versions[1].track.id)?.hiddenCount).toBe(1);
    expect(harness.service.getDuplicateIndexSummary('strict')).toMatchObject({
      duplicateGroups: 1,
      duplicateMembers: 2,
      hiddenTracks: 1,
    });
    expect(harness.service.getPlaylistItems(playlist.id, { pageSize: 10 }).total).toBe(1);
    expect(harness.service.getTracks({ pageSize: 10 }).items.every((track) => track.unavailable !== true)).toBe(true);

    harness.cleanup();
  }, 20000);

  it('path + size + mtime unchanged skips metadata parse', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'Artist - Song.flac');
    harness.addFolder();

    await harness.scanFolder();
    const secondScan = await harness.scanFolder();

    expect(harness.metadataService.calls).toHaveLength(1);
    expect(secondScan.skippedFiles).toBe(1);
    harness.cleanup();
  });

  it('embedded tag rescan all forces unchanged tracks to reread and apply embedded metadata', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Artist - Rescan All.flac');
    harness.addFolder();

    await harness.scanFolder();
    harness.metadataService.overrides.set(filePath, { title: 'Updated Embedded Title' });
    const secondScan = await harness.scanFolder({ mode: 'embedded-tags-all' });
    const track = harness.service.getTracks({ pageSize: 1 }).items[0];

    expect(harness.metadataService.calls).toHaveLength(2);
    expect(secondScan.updatedTracks).toBe(1);
    expect(secondScan.skippedFiles).toBe(0);
    expect(track.title).toBe('Updated Embedded Title');
    harness.cleanup();
  });

  it('embedded tag rescan missing cover only rereads tracks without complete cover cache', async () => {
    const coverExtractor = new FakeCoverExtractor({ source: 'embedded' });
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Artist - Covered.flac');
    writeAudioFile(harness.folder, 'Artist - Missing Cover.flac');
    harness.addFolder();

    await harness.scanFolder();
    const tracks = harness.service.getTracks({ pageSize: 10 }).items;
    const missingCoverTrack = tracks.find((track) => track.title.includes('Missing Cover')) ?? tracks[0];
    const albumAsset = missingCoverTrack.coverId ? harness.service.resolveCoverAsset(missingCoverTrack.coverId, 'album') : null;
    expect(albumAsset?.filePath).toBeTruthy();
    unlinkSync(albumAsset!.filePath);

    const secondScan = await harness.scanFolder({ mode: 'embedded-tags-missing-cover' });

    expect(harness.metadataService.calls).toHaveLength(3);
    expect(coverExtractor.calls).toHaveLength(3);
    expect(secondScan.updatedTracks).toBe(1);
    expect(secondScan.skippedFiles).toBe(1);
    harness.cleanup();
  });

  it('missing-only network repair applies a high-confidence cover candidate without recording ignored', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(validCoverPng() as unknown as BodyInit, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'network-repair-cover' });
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Network - Cover Repair.flac');
    harness.addFolder();

    await harness.scanFolder();
    const track = harness.service.getTracks({ pageSize: 1 }).items[0];
    const database = createDatabase(harness.databasePath);
    const candidateId = new NetworkMetadataStore(database).upsertMetadataCandidate(
      track.id,
      null,
      {
        provider: 'mock',
        providerItemId: 'network-cover-candidate',
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist,
        year: track.year,
        genre: track.genre,
        duration: track.duration,
        trackNo: track.trackNo,
        discNo: track.discNo,
        coverUrl: 'https://example.test/cover.png',
        raw: {},
      },
      0.96,
    ).id;
    database.close();

    const result = await harness.service.applyNetworkMissingOnly(candidateId, { fields: ['cover'] });
    const updated = harness.service.getTrack(track.id);
    const verify = createDatabase(harness.databasePath);
    const decisions = verify
      .prepare<[], { decision: string }>('SELECT decision FROM network_metadata_decisions ORDER BY created_at ASC')
      .all()
      .map((row) => row.decision);
    const cover = verify
      .prepare<[string], { source_type: string }>('SELECT source_type FROM covers WHERE id = ?')
      .get(String(updated?.coverId));
    verify.close();

    expect(result.appliedFields.coverId).toBeTruthy();
    expect(updated?.coverId).toBe(result.appliedFields.coverId);
    expect(cover?.source_type).toBe('network');
    expect(decisions).toContain('accepted');
    expect(decisions).not.toContain('ignored');
    harness.cleanup();
  });

  it('loading embedded track tags refreshes persisted text tags and embedded cover', async () => {
    let currentMetadata = metadataResult({ title: 'Old Title', artist: 'Old Artist', album: 'Old Album', albumArtist: 'Old Artist' });
    const metadataReader: MetadataReader = {
      async read() {
        return currentMetadata;
      },
    };
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'embedded-reload-cover' });
    const harness = createHarness({ metadataReader, coverExtractor });
    const filePath = writeAudioFile(harness.folder, 'Reload Tags.flac');

    const imported = await harness.service.importAudioFile(filePath);
    currentMetadata = metadataResult(
      {
        title: '山海',
        artist: '草东没有派对',
        album: '丑奴儿',
        albumArtist: '草东没有派对',
        trackNo: 10,
        year: 2016,
        bpm: 108,
      },
      {
        embeddedCover: {
          data: validCoverPng(),
          mimeType: 'image/png',
        },
        embeddedCoverStatus: 'present',
      },
    );

    const result = await harness.service.loadEmbeddedTrackTags(imported.id);
    const updated = harness.service.getTrack(imported.id);

    expect(result.track.title).toBe('山海');
    expect(result.track.artist).toBe('草东没有派对');
    expect(result.track.album).toBe('丑奴儿');
    expect(result.track.coverId).toBeTruthy();
    expect(result.coverThumb).toBe(`echo-cover://thumb/${encodeURIComponent(String(result.track.coverId))}`);
    expect(updated?.title).toBe('山海');
    expect(updated?.artist).toBe('草东没有派对');
    expect(updated?.album).toBe('丑奴儿');
    expect(updated?.bpm).toBe(108);
    expect(updated?.coverId).toBe(result.track.coverId);
    expect(updated?.fieldSources.title).toBe('embedded');
    expect(updated?.embeddedCoverStatus).toBe('present');
    harness.cleanup();
  });

  it('path + size + mtime unchanged with complete cover cache skips cover work', async () => {
    const coverExtractor = new FakeCoverExtractor();
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Artist - Cached Cover.flac');
    harness.addFolder();

    await harness.scanFolder();
    const secondScan = await harness.scanFolder();

    expect(harness.metadataService.calls).toHaveLength(1);
    expect(coverExtractor.calls).toHaveLength(1);
    expect(coverExtractor.repairCalls).toHaveLength(0);
    expect(secondScan.skippedFiles).toBe(1);
    harness.cleanup();
  });

  it('unchanged track with missing cover_id backfills cover by rereading metadata', async () => {
    const coverExtractor = new FakeCoverExtractor();
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Artist - Missing Cover Id.flac');
    harness.addFolder();

    await harness.scanFolder();
    harness.service.close();
    const database = createDatabase(harness.databasePath);
    database.prepare('UPDATE tracks SET cover_id = NULL').run();
    database.close();

    const restarted = createLibraryService(harness.databasePath, {
      metadataService: harness.metadataService,
      coverExtractor,
      coverCacheDir: harness.coverCacheDir,
    });
    const [libraryFolder] = restarted.getFolders();
    const job = restarted.scanFolder(libraryFolder.id);
    await restarted.waitForScan(job.id);
    const track = restarted.getTracks({ pageSize: 1 }).items[0];

    expect(harness.metadataService.calls).toHaveLength(2);
    expect(coverExtractor.calls).toHaveLength(2);
    expect(track.coverId).toBeTruthy();
    restarted.close();
    harness.cleanup();
  });

  it('unchanged track with missing derivative repairs from original_ref without rereading metadata', async () => {
    const coverExtractor = new FakeCoverExtractor();
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Artist - Missing Album Derivative.flac');
    harness.addFolder();

    await harness.scanFolder();
    const track = harness.service.getTracks({ pageSize: 1 }).items[0];
    harness.service.close();
    const database = createDatabase(harness.databasePath);
    const cover = database
      .prepare<[string | null], { album_path: string }>('SELECT album_path FROM covers WHERE id = ?')
      .get(track.coverId);
    database.close();
    expect(cover?.album_path).toBeTruthy();
    unlinkSync(cover!.album_path);

    const restarted = createLibraryService(harness.databasePath, {
      metadataService: harness.metadataService,
      coverExtractor,
      coverCacheDir: harness.coverCacheDir,
    });
    const [libraryFolder] = restarted.getFolders();
    const job = restarted.scanFolder(libraryFolder.id);
    await restarted.waitForScan(job.id);

    expect(harness.metadataService.calls).toHaveLength(1);
    expect(coverExtractor.calls).toHaveLength(1);
    expect(coverExtractor.repairCalls).toHaveLength(1);
    expect(existsSync(cover!.album_path)).toBe(true);
    restarted.close();
    harness.cleanup();
  });

  it('changed mtime or size triggers reparse', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Artist - Song.flac');
    harness.addFolder();

    await harness.scanFolder();
    writeFileSync(filePath, 'fake audio with a changed size');
    utimesSync(filePath, new Date('2024-01-02T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z'));
    const secondScan = await harness.scanFolder();

    expect(harness.metadataService.calls).toHaveLength(2);
    expect(secondScan.updatedTracks).toBe(1);
    harness.cleanup();
  });

  it('deleted files are removed from the library on the next scan', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Artist - Removed.flac');
    harness.addFolder();

    await harness.scanFolder();
    rmSync(filePath);
    const secondScan = await harness.scanFolder();

    expect(secondScan.removedTracks).toBe(1);
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('prunes missing tracks without a full folder scan', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Artist - Missing Later.flac');
    harness.addFolder();

    await harness.scanFolder();
    rmSync(filePath);
    const result = harness.service.pruneMissingTracks();

    expect(result).toEqual({ scannedCount: 1, removedCount: 1 });
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('prunes missing and five-second-or-shorter tracks without deleting local files', async () => {
    const harness = createHarness();
    const shortFile = writeAudioFile(harness.folder, 'Artist - Blip.flac');
    const keepFile = writeAudioFile(harness.folder, 'Artist - Full Song.flac');
    harness.metadataService.overrides.set(shortFile, baseMetadata({ title: 'Blip', duration: 5 }));
    harness.metadataService.overrides.set(keepFile, baseMetadata({ title: 'Full Song', duration: 6 }));
    harness.addFolder();

    await harness.scanFolder();
    const result = await harness.service.pruneInvalidTracks();

    expect(result).toEqual({
      scannedCount: 2,
      removedCount: 1,
      missingRemovedCount: 0,
      shortRemovedCount: 1,
      shortDurationThresholdSeconds: 5,
    });
    expect(existsSync(shortFile)).toBe(true);
    expect(harness.service.getTracks({ pageSize: 10 }).items.map((track) => track.title)).toEqual(['Full Song']);
    harness.cleanup();
  });

  it('clears the visible library list without deleting local files', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Artist - Keep File.flac');
    harness.addFolder();

    await harness.scanFolder();
    const result = harness.service.clearTracks();

    expect(result).toEqual({ scannedCount: 1, removedCount: 1 });
    expect(existsSync(filePath)).toBe(true);
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('scan job reports progress phases and per-file metadata errors', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'Good.flac');
    const badFile = writeAudioFile(harness.folder, 'Bad.flac');
    harness.metadataService.failures.add(badFile);
    harness.addFolder();

    const status = await harness.scanFolder();

    expect(status.status).toBe('completed');
    expect(status.phase).toBe('finished');
    expect(status.totalFiles).toBe(2);
    expect(status.processedFiles).toBe(2);
    expect(status.errorCount).toBe(1);
    expect(status.errors[0]).toContain('metadata boom');
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(1);
    harness.cleanup();
  });

  it('metadata embedded title is not overwritten by filename fallback', () => {
    const metadataService = new MetadataService();
    const parsed = metadataService.normalize('Filename Artist - Filename Title.flac', {
      common: {
        title: 'Embedded Title',
        artist: 'Embedded Artist',
        album: 'Embedded Album',
      },
      format: {},
    } as Parameters<MetadataService['normalize']>[1]);

    expect(parsed.title).toBe('Embedded Title');
    expect(parsed.artist).toBe('Embedded Artist');
    expect(parsed.album).toBe('Embedded Album');
    expect(parsed.fieldSources.title).toBe('embedded');
  });

  it('embedded artist prevents Unknown Artist fallback', () => {
    const metadataService = new MetadataService();
    const parsed = metadataService.normalize('No Artist In Name.flac', {
      common: {
        artist: 'Embedded Artist',
      },
      format: {},
    } as Parameters<MetadataService['normalize']>[1]);

    expect(parsed.artist).toBe('Embedded Artist');
    expect(parsed.artist).not.toBe('Unknown Artist');
    expect(parsed.fieldSources.artist).toBe('embedded');
  });

  it('embedded album is not overwritten by folder inference', () => {
    const metadataService = new MetadataService();
    const parsed = metadataService.normalize(join('Folder Album', 'Artist - Song.flac'), {
      common: {
        album: 'Embedded Album',
      },
      format: {},
    } as Parameters<MetadataService['normalize']>[1]);

    expect(parsed.album).toBe('Embedded Album');
    expect(parsed.fieldSources.album).toBe('embedded');
  });

  it('missing embedded albumArtist is marked as artist fallback', () => {
    const metadataService = new MetadataService();
    const parsed = metadataService.normalize(join('Folder Album', 'Artist - Song.flac'), {
      common: {
        artist: 'Embedded Artist',
        album: 'Embedded Album',
      },
      format: {},
    } as Parameters<MetadataService['normalize']>[1]);

    expect(parsed.albumArtist).toBe('Embedded Artist');
    expect(parsed.fieldSources.albumArtist).toBe('artist_fallback');
  });

  it('album grouping same embedded albumArtist merges even when track artists differ', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Same Artist' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Same Artist' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('album grouping same folder and same album uses folder when albumArtist is artist fallback', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources(
        { title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Track Artist One', year: 2024 },
        { albumArtist: 'artist_fallback' },
      ),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources(
        { title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Track Artist Two', year: 2024 },
        { albumArtist: 'artist_fallback' },
      ),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('album grouping same album with artist fallback stays split across folders', async () => {
    const harness = createHarness();
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources(
        { title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Track Artist One', year: 2024 },
        { albumArtist: 'artist_fallback' },
      ),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources(
        { title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Track Artist Two', year: 2024 },
        { albumArtist: 'artist_fallback' },
      ),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('standard album grouping keeps same title and same cover split across folders without reliable albumArtist', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources({ title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Track Artist One' }, { albumArtist: 'artist_fallback' }),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources({ title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Track Artist Two' }, { albumArtist: 'artist_fallback' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges same title and same cover across folders and artists', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'Same Album', albumArtist: 'Album Artist One' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'Same Album', albumArtist: 'Album Artist Two' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges exact beatmania soundtrack titles across artists without matching covers', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const albumsUnderTest = [
      {
        title: 'beatmania IIDX 12 HAPPY SKY ORIGINAL SOUNDTRACK',
        artists: ['BEMANI Sound Team', '石川貴之/清水達也'],
      },
      {
        title: 'beatmania IIDX 25 CANNON BALLERS ORIGINAL SOUNDTRACK',
        artists: ['BEMANI Sound Team', '中原龍太郎'],
      },
    ];

    albumsUnderTest.forEach((album, albumIndex) => {
      album.artists.forEach((artist, artistIndex) => {
        const folder = join(harness.folder, `album-${albumIndex}`, `artist-${artistIndex}`);
        mkdirSync(folder, { recursive: true });
        const file = writeAudioFile(folder, `Track ${albumIndex}-${artistIndex}.flac`);
        harness.metadataService.overrides.set(
          file,
          baseMetadata({
            title: `Track ${albumIndex}-${artistIndex}`,
            artist,
            album: album.title,
            albumArtist: artist,
          }),
        );
      });
    });
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    expect(albums.items.map((album) => album.trackCount).sort((left, right) => left - right)).toEqual([2, 2]);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges same cover when album titles are at least 85 percent similar', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      baseMetadata({
        title: 'A',
        artist: 'Artist One',
        album: 'beatmania IIDX 25 CANNON BALLERS Original Soundtrack',
        albumArtist: 'Album Artist One',
      }),
    );
    harness.metadataService.overrides.set(
      second,
      baseMetadata({
        title: 'B',
        artist: 'Artist Two',
        album: 'beatmania IIDX 25 CANON BALLERS Original Soundtrack',
        albumArtist: 'Album Artist Two',
      }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges visually identical cached covers even when original cover hashes differ', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor({ source: 'embedded' }) });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'KiLLKiSS', albumArtist: 'Ave Mujica' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'KiLLKISS', albumArtist: 'Ave Mujica' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges titles above 95 percent before artist differences', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'Fionaredica', albumArtist: 'HITNEX TRAX' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'Fïonaredica', albumArtist: 'Kobaryo' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping keeps similar titles split below 95 percent when covers differ', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'maimai ALL PERFECT COLLECTION', albumArtist: 'SEGA Sound Team' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'maimai でらっくす ベストアルバム', albumArtist: 'SEGA Sound Team' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping treats full-width and half-width title punctuation as matching', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: '28／29', albumArtist: 'Airi Suzuki' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: '28/29', albumArtist: 'Tsunku' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges same title even when covers differ', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'Same Album', albumArtist: 'Album Artist One' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'Same Album', albumArtist: 'Album Artist Two' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping does not split a standard album when track covers differ', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'Same Album', albumArtist: 'Same Album Artist' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'Same Album', albumArtist: 'Same Album Artist' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping does not merge different titles with same cover', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Artist One', album: 'Album One', albumArtist: 'Album Artist One' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Artist Two', album: 'Album Two', albumArtist: 'Album Artist Two' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping keeps empty and Unknown Album tracks split by track id', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const first = writeAudioFile(harness.folder, 'Loose A.flac');
    const second = writeAudioFile(harness.folder, 'Loose B.flac');
    const third = writeAudioFile(harness.folder, 'Loose C.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'Loose A', album: '', albumArtist: '' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'Loose B', album: '', albumArtist: '' }));
    harness.metadataService.overrides.set(third, baseMetadata({ title: 'Loose C', album: 'Unknown Album', albumArtist: '' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(3);
    harness.cleanup();
  });

  it('sameTitleAndCover album grouping merges same title when cover hash is missing', async () => {
    const harness = createHarness({ coverExtractor: new ThrowingCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources({ title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Track Artist One' }, { albumArtist: 'artist_fallback' }),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources({ title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Track Artist Two' }, { albumArtist: 'artist_fallback' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('refreshAlbumGrouping rebuilds album tables after changing strategy without rescanning files', async () => {
    const coverExtractor = new FakeCoverExtractor({ sourceHash: 'same-cover-hash' });
    const harness = createHarness({ coverExtractor });
    const firstFolder = join(harness.folder, 'disc-a');
    const secondFolder = join(harness.folder, 'disc-b');
    mkdirSync(firstFolder, { recursive: true });
    mkdirSync(secondFolder, { recursive: true });
    const first = writeAudioFile(firstFolder, 'A.flac');
    const second = writeAudioFile(secondFolder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources({ title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Track Artist One' }, { albumArtist: 'artist_fallback' }),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources({ title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Track Artist Two' }, { albumArtist: 'artist_fallback' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    expect(harness.service.getAlbums({ pageSize: 10 }).total).toBe(2);
    const metadataCallsAfterScan = harness.metadataService.calls.length;
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const summary = harness.service.refreshAlbumGrouping();

    expect(summary.albumCount).toBe(1);
    expect(harness.service.getAlbums({ pageSize: 10 }).items[0].trackCount).toBe(2);
    expect(harness.metadataService.calls).toHaveLength(metadataCallsAfterScan);
    harness.cleanup();
  });

  it('album grouping different albumArtist does not merge', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', album: 'Same Album', albumArtist: 'Artist One' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', album: 'Same Album', albumArtist: 'Artist Two' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('empty album values do not merge into one giant Unknown Album', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'Loose A.flac');
    const second = writeAudioFile(harness.folder, 'Loose B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'Loose A', album: '', albumArtist: '' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'Loose B', album: '', albumArtist: '' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('Unknown Album values do not merge by folder', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'Loose A.flac');
    const second = writeAudioFile(harness.folder, 'Loose B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources({ title: 'Loose A', artist: 'Artist One', album: 'Unknown Album', albumArtist: 'Artist One' }, { albumArtist: 'artist_fallback' }),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources({ title: 'Loose B', artist: 'Artist Two', album: 'Unknown Album', albumArtist: 'Artist Two' }, { albumArtist: 'artist_fallback' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(2);
    harness.cleanup();
  });

  it('manual albumArtist source groups by manual Album Artist', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(
      first,
      metadataWithSources({ title: 'A', artist: 'Track Artist One', album: 'Same Album', albumArtist: 'Manual Album Artist' }, { albumArtist: 'manual' }),
    );
    harness.metadataService.overrides.set(
      second,
      metadataWithSources({ title: 'B', artist: 'Track Artist Two', album: 'Same Album', albumArtist: 'Manual Album Artist' }, { albumArtist: 'manual' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].albumArtist).toBe('Manual Album Artist');
    expect(albums.items[0].trackCount).toBe(2);
    harness.cleanup();
  });

  it('albums persist and can be read after restart without metadata parsing', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'A.flac');
    writeAudioFile(harness.folder, 'B.flac');
    harness.addFolder();

    await harness.scanFolder();
    harness.service.close();

    const restartedMetadata = new MockMetadataService();
    const restarted = createLibraryService(harness.databasePath, {
      metadataService: restartedMetadata,
      coverCacheDir: harness.coverCacheDir,
    });
    const albums = restarted.getAlbums({ pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].trackCount).toBe(2);
    expect(restartedMetadata.calls).toHaveLength(0);
    restarted.close();
    harness.cleanup();
  });

  it('getTracks returns paginated data', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'A.flac');
    writeAudioFile(harness.folder, 'B.flac');
    writeAudioFile(harness.folder, 'C.flac');
    harness.addFolder();

    await harness.scanFolder();
    const firstPage = harness.service.getTracks({ page: 1, pageSize: 2 });
    const secondPage = harness.service.getTracks({ page: 2, pageSize: 2 });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items).toHaveLength(1);
    harness.cleanup();
  });

  it('locates a track page and absolute index using the current song-list query', async () => {
    const harness = createHarness();
    const alpha = writeAudioFile(harness.folder, 'Alpha.flac', new Date('2024-01-01T00:00:00.000Z'));
    const bravo = writeAudioFile(harness.folder, 'Bravo.flac', new Date('2024-02-01T00:00:00.000Z'));
    const charlie = writeAudioFile(harness.folder, 'Charlie.flac', new Date('2024-03-01T00:00:00.000Z'));
    const delta = writeAudioFile(harness.folder, 'Delta.flac', new Date('2024-04-01T00:00:00.000Z'));
    harness.metadataService.overrides.set(alpha, baseMetadata({ title: 'Alpha', artist: 'Zulu', album: 'Gamma', duration: 60, bitrate: 320000 }));
    harness.metadataService.overrides.set(bravo, baseMetadata({ title: 'Bravo', artist: 'Yankee', album: 'Beta', duration: 120, bitrate: 640000 }));
    harness.metadataService.overrides.set(charlie, baseMetadata({ title: 'Charlie', artist: 'Xray', album: 'Alpha', duration: 180, bitrate: 960000 }));
    harness.metadataService.overrides.set(delta, baseMetadata({ title: 'Delta', artist: 'Whiskey', album: 'Delta', duration: 240, bitrate: 1280000 }));
    harness.addFolder();

    await harness.scanFolder();

    const sorts = ['default', 'artist', 'album', 'durationAsc', 'fileModifiedDesc', 'recent', 'qualityDesc'] as const;
    for (const sort of sorts) {
      const ordered = harness.service.getTracks({ pageSize: 10, sort }).items;
      const target = ordered[2]!;
      const expectedPage = harness.service.getTracks({ page: 2, pageSize: 2, sort });
      const located = harness.service.locateTrackInTracks(target.id, { pageSize: 2, sort });

      expect(located).toMatchObject({
        found: true,
        reason: 'found',
        page: 2,
        index: 2,
        total: 4,
      });
      expect(located.items.map((track) => track.id)).toEqual(expectedPage.items.map((track) => track.id));
      expect(located.track?.id).toBe(target.id);
    }

    const titleDescending = harness.service.getTracks({ page: 1, pageSize: 2, sort: 'titleDesc' });
    const titleLocated = harness.service.locateTrackInTracks(titleDescending.items[1]!.id, { pageSize: 2, sort: 'titleDesc' });
    const filtered = harness.service.locateTrackInTracks(titleDescending.items[1]!.id, { pageSize: 2, search: 'Alpha', sort: 'titleDesc' });
    const missing = harness.service.locateTrackInTracks('missing-track', { pageSize: 2, sort: 'default' });
    const random = harness.service.locateTrackInTracks(titleDescending.items[1]!.id, { pageSize: 2, sort: 'random' });

    expect(titleLocated).toMatchObject({ found: true, reason: 'found', page: 1, index: 1 });
    expect(filtered).toMatchObject({ found: false, reason: 'filtered', total: 1 });
    expect(missing).toMatchObject({ found: false, reason: 'not-found' });
    expect(random).toMatchObject({ found: false, reason: 'unsupported-sort' });
    harness.cleanup();
  });

  it('getTracks sorts mixed Chinese and Latin titles naturally before pagination', async () => {
    const harness = createHarness();
    const zFile = writeAudioFile(harness.folder, 'z.flac');
    const aiFile = writeAudioFile(harness.folder, 'ai.flac');
    const cFile = writeAudioFile(harness.folder, 'c.flac');
    const buFile = writeAudioFile(harness.folder, 'bu.flac');
    harness.metadataService.overrides.set(zFile, baseMetadata({ title: 'Zebra' }));
    harness.metadataService.overrides.set(aiFile, baseMetadata({ title: '爱你' }));
    harness.metadataService.overrides.set(cFile, baseMetadata({ title: 'Coffee' }));
    harness.metadataService.overrides.set(buFile, baseMetadata({ title: '不如' }));
    harness.addFolder();

    await harness.scanFolder();
    const ascending = harness.service.getTracks({ page: 1, pageSize: 3, sort: 'titleAsc' });
    const descending = harness.service.getTracks({ page: 1, pageSize: 3, sort: 'titleDesc' });

    expect(ascending.items.map((track) => track.title)).toEqual(['Coffee', 'Zebra', '爱你']);
    expect(ascending.hasMore).toBe(true);
    expect(descending.items.map((track) => track.title)).toEqual(['不如', '爱你', 'Zebra']);
    expect(descending.hasMore).toBe(true);
    harness.cleanup();
  });

  it('getTracks sorts by file modified time', async () => {
    const harness = createHarness();
    const oldFile = writeAudioFile(harness.folder, 'Old.flac', new Date('2024-01-01T00:00:00.000Z'));
    const newFile = writeAudioFile(harness.folder, 'New.flac', new Date('2024-03-01T00:00:00.000Z'));
    harness.metadataService.overrides.set(oldFile, baseMetadata({ title: 'Old Song' }));
    harness.metadataService.overrides.set(newFile, baseMetadata({ title: 'New Song' }));
    harness.addFolder();

    await harness.scanFolder();
    const ascending = harness.service.getTracks({ pageSize: 10, sort: 'fileModifiedAsc' });
    const descending = harness.service.getTracks({ pageSize: 10, sort: 'fileModifiedDesc' });

    expect(ascending.items.map((track) => track.title)).toEqual(['Old Song', 'New Song']);
    expect(descending.items.map((track) => track.title)).toEqual(['New Song', 'Old Song']);
    harness.cleanup();
  });

  it('getAlbums sorts by the modified time of files inside each album', async () => {
    const harness = createHarness();
    const oldAlbumFile = writeAudioFile(harness.folder, 'Old Album.flac', new Date('2024-01-01T00:00:00.000Z'));
    const newAlbumFile = writeAudioFile(harness.folder, 'New Album.flac', new Date('2024-03-01T00:00:00.000Z'));
    harness.metadataService.overrides.set(oldAlbumFile, baseMetadata({ title: 'Old Track', album: 'Old Album' }));
    harness.metadataService.overrides.set(newAlbumFile, baseMetadata({ title: 'New Track', album: 'New Album' }));
    harness.addFolder();

    await harness.scanFolder();
    const ascending = harness.service.getAlbums({ pageSize: 10, sort: 'fileModifiedAsc' });
    const descending = harness.service.getAlbums({ pageSize: 10, sort: 'fileModifiedDesc' });

    expect(ascending.items.map((album) => album.title)).toEqual(['Old Album', 'New Album']);
    expect(descending.items.map((album) => album.title)).toEqual(['New Album', 'Old Album']);
    harness.cleanup();
  });

  it('getTracks search matches multiple terms across metadata fields', async () => {
    const harness = createHarness();
    const match = writeAudioFile(harness.folder, 'Loose Match.flac');
    const miss = writeAudioFile(harness.folder, 'Loose Miss.flac');
    harness.metadataService.overrides.set(match, baseMetadata({ title: 'Seven Mile', artist: 'Blue Harbor', album: 'Night Signals' }));
    harness.metadataService.overrides.set(miss, baseMetadata({ title: 'Seven Mile', artist: 'Red Harbor', album: 'Morning Signals' }));
    harness.addFolder();

    await harness.scanFolder();
    const tracks = harness.service.getTracks({ search: 'blue seven', pageSize: 10 });

    expect(tracks.total).toBe(1);
    expect(tracks.items[0].title).toBe('Seven Mile');
    harness.cleanup();
  });

  it('getTracks search matches filenames and paths when metadata is sparse', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'bootleg-live-take.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Untitled', artist: 'Unknown Artist', album: 'Unknown Album' }));
    harness.addFolder();

    await harness.scanFolder();
    const tracks = harness.service.getTracks({ search: 'bootleg live', pageSize: 10 });

    expect(tracks.total).toBe(1);
    expect(tracks.items[0].path).toBe(filePath);
    harness.cleanup();
  });

  it('getTracks search matches Chinese substrings and pinyin aliases from the search index', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'magic-old-man.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: '会魔法的老人', artist: '周杰伦', album: '魔法电台' }));
    harness.addFolder();

    await harness.scanFolder();

    for (const search of ['魔法', 'mofa', 'mo fa', 'hmf', 'laoren']) {
      const tracks = harness.service.getTracks({ search, pageSize: 10 });
      expect(tracks.items.map((track) => track.title)).toContain('会魔法的老人');
    }

    expect(harness.service.getTracks({ search: 'unrelated', pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('getTracks search honors the simplified/traditional search switch', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'traditional.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: '愛與夢', artist: 'Echo Artist', album: 'Echo Album' }));
    harness.addFolder();

    await harness.scanFolder();

    expect(harness.service.getTracks({ search: '爱与梦', pageSize: 10 }).total).toBe(1);

    harness.setChineseCrossScriptSearchEnabled(false);
    expect(harness.service.getTracks({ search: '爱与梦', pageSize: 10 }).total).toBe(0);
    expect(harness.service.getTracks({ search: '愛與夢', pageSize: 10 }).total).toBe(1);
    harness.cleanup();
  });

  it('getTracks search index follows track tag edits and deletes', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'indexed-song.flac');
    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Original Title', artist: 'Search Artist', album: 'Search Album' }));
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ search: 'original', pageSize: 10 }).items;

    expect(track.title).toBe('Original Title');

    harness.metadataService.overrides.set(filePath, baseMetadata({ title: 'Updated Needle', artist: 'Search Artist', album: 'Search Album' }));
    writeFileSync(filePath, 'updated audio');
    utimesSync(filePath, new Date('2024-01-02T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z'));
    await harness.scanFolder();

    expect(harness.service.getTracks({ search: 'original', pageSize: 10 }).total).toBe(0);
    expect(harness.service.getTracks({ search: 'updated needle', pageSize: 10 }).items[0].title).toBe('Updated Needle');

    harness.service.deleteTrack(track.id);

    expect(harness.service.getTracks({ search: 'updated', pageSize: 10 }).total).toBe(0);
    harness.cleanup();
  });

  it('playback history stores redundant track metadata and only completed plays increment play_count', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'History Song.flac');
    harness.metadataService.overrides.set(
      filePath,
      baseMetadata({
        title: 'History Title',
        artist: 'History Artist',
        album: 'History Album',
        albumArtist: 'History Album Artist',
        duration: 120,
      }),
    );
    harness.addFolder();
    await harness.scanFolder();
    const track = harness.service.getTracks({ pageSize: 1 }).items[0];

    const first = harness.service.startPlaybackHistory({
      trackId: track.id,
      sourceType: 'songs',
      sourceLabel: 'Songs',
      queueId: 'queue-1',
    });
    const unfinished = harness.service.finishPlaybackHistory({
      historyId: first.historyId,
      playedSeconds: 12,
    });
    const second = harness.service.startPlaybackHistory({
      trackId: track.id,
      sourceType: 'album',
      sourceLabel: 'History Album',
      queueId: 'queue-2',
    });
    const completed = harness.service.finishPlaybackHistory({
      historyId: second.historyId,
      playedSeconds: 61,
      endedAt: '2026-05-12T12:00:00.000Z',
    });

    expect(unfinished?.completed).toBe(false);
    expect(completed?.completed).toBe(true);
    expect(completed).toMatchObject({
      trackId: track.id,
      trackPath: filePath,
      title: 'History Title',
      artist: 'History Artist',
      album: 'History Album',
      albumArtist: 'History Album Artist',
      sourceType: 'album',
      sourceLabel: 'History Album',
      queueId: 'queue-2',
      endedAt: '2026-05-12T12:00:00.000Z',
    });

    harness.service.finishPlaybackHistory({
      historyId: second.historyId,
      playedSeconds: 70,
      completed: true,
      endedAt: '2026-05-12T12:05:00.000Z',
    });

    const database = createDatabase(harness.databasePath);
    const row = database
      .prepare<unknown[], { play_count: number; last_played_at: string | null }>('SELECT play_count, last_played_at FROM tracks WHERE id = ?')
      .get(track.id);
    const stats = database
      .prepare<
        unknown[],
        {
          play_count: number;
          completed_count: number;
          total_played_seconds: number;
          last_ended_at: string | null;
          title: string;
          source_label: string | null;
        }
      >(
        `SELECT play_count, completed_count, total_played_seconds, last_ended_at, title, source_label
         FROM playback_history_stats
         WHERE history_key = ?`,
      )
      .get(track.id);
    database.close();

    expect(row?.play_count).toBe(1);
    expect(row?.last_played_at).toBe('2026-05-12T12:00:00.000Z');
    expect(stats).toMatchObject({
      play_count: 2,
      completed_count: 1,
      total_played_seconds: 82,
      last_ended_at: '2026-05-12T12:05:00.000Z',
      title: 'History Title',
      source_label: 'History Album',
    });
    harness.cleanup();
  });

  it('playback history supports paging, search, completed filters, and cleanup without deleting tracks', async () => {
    const harness = createHarness();
    const firstFile = writeAudioFile(harness.folder, 'Needle Song.flac');
    const secondFile = writeAudioFile(harness.folder, 'Other Song.flac');
    harness.metadataService.overrides.set(firstFile, baseMetadata({ title: 'Needle Title', artist: 'Blue Artist', album: 'Night Album', duration: 60 }));
    harness.metadataService.overrides.set(secondFile, baseMetadata({ title: 'Other Title', artist: 'Red Artist', album: 'Day Album', duration: 60 }));
    harness.addFolder();
    await harness.scanFolder();
    const tracks = harness.service.getTracks({ pageSize: 10 }).items;
    const needle = tracks.find((track) => track.title === 'Needle Title')!;
    const other = tracks.find((track) => track.title === 'Other Title')!;
    const first = harness.service.startPlaybackHistory({ trackId: needle.id, sourceType: 'songs', sourceLabel: 'Songs' });
    const second = harness.service.startPlaybackHistory({ trackId: other.id, sourceType: 'songs', sourceLabel: 'Songs' });
    const third = harness.service.startPlaybackHistory({ trackId: needle.id, sourceType: 'songs', sourceLabel: 'Songs' });

    harness.service.finishPlaybackHistory({ historyId: first.historyId, playedSeconds: 10 });
    harness.service.finishPlaybackHistory({ historyId: second.historyId, playedSeconds: 35 });
    harness.service.finishPlaybackHistory({ historyId: third.historyId, playedSeconds: 40 });

    const firstPage = harness.service.getPlaybackHistory({ page: 1, pageSize: 1 });
    const secondPage = harness.service.getPlaybackHistory({ page: 2, pageSize: 1 });
    const search = harness.service.getPlaybackHistory({ search: 'Needle Blue', pageSize: 10 });
    const completedOnly = harness.service.getPlaybackHistory({ completedOnly: true, pageSize: 10 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items[0]).toMatchObject({ title: 'Needle Title', playCount: 2 });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]).toMatchObject({ title: 'Other Title', playCount: 1 });
    expect(search.items.map((item) => item.title)).toEqual(['Needle Title']);
    expect(completedOnly.items.map((item) => item.title)).toEqual(['Needle Title', 'Other Title']);

    harness.service.deletePlaybackHistoryEntry(firstPage.items[0].id);
    expect(harness.service.getPlaybackHistory({ pageSize: 10 }).total).toBe(1);

    harness.service.clearPlaybackHistory();
    expect(harness.service.getPlaybackHistory({ pageSize: 10 }).total).toBe(0);
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(2);
    harness.cleanup();
  });

  it('playback history range filters aggregate only plays inside the requested window', async () => {
    const harness = createHarness();
    const firstFile = writeAudioFile(harness.folder, 'Weekly Song.flac');
    const secondFile = writeAudioFile(harness.folder, 'Monthly Song.flac');
    harness.metadataService.overrides.set(firstFile, baseMetadata({ title: 'Weekly Title', artist: 'Blue Artist', album: 'Night Album', duration: 60 }));
    harness.metadataService.overrides.set(secondFile, baseMetadata({ title: 'Monthly Title', artist: 'Red Artist', album: 'Day Album', duration: 60 }));
    harness.addFolder();
    await harness.scanFolder();
    const tracks = harness.service.getTracks({ pageSize: 10 }).items;
    const weekly = tracks.find((track) => track.title === 'Weekly Title')!;
    const monthly = tracks.find((track) => track.title === 'Monthly Title')!;
    const oldWeekly = harness.service.startPlaybackHistory({ trackId: weekly.id, sourceType: 'songs', sourceLabel: 'Songs' });
    const currentMonthly = harness.service.startPlaybackHistory({ trackId: monthly.id, sourceType: 'songs', sourceLabel: 'Songs' });
    const currentWeekly = harness.service.startPlaybackHistory({ trackId: weekly.id, sourceType: 'songs', sourceLabel: 'Songs' });

    harness.service.finishPlaybackHistory({ historyId: oldWeekly.historyId, playedSeconds: 10 });
    harness.service.finishPlaybackHistory({ historyId: currentMonthly.historyId, playedSeconds: 35 });
    harness.service.finishPlaybackHistory({ historyId: currentWeekly.historyId, playedSeconds: 40 });

    const now = new Date();
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfWeekWindow = new Date(now);
    startOfWeekWindow.setDate(startOfWeekWindow.getDate() - 6);
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 14);
    const currentMonthlyDate = new Date(now);
    currentMonthlyDate.setMinutes(currentMonthlyDate.getMinutes() - 5);
    const currentWeeklyDate = new Date(now);
    currentWeeklyDate.setMinutes(currentWeeklyDate.getMinutes() - 1);
    const database = createDatabase(harness.databasePath);
    const moveHistoryEntry = database.prepare('UPDATE playback_history SET started_at = ?, ended_at = ?, created_at = ? WHERE id = ?');
    moveHistoryEntry.run(oldDate.toISOString(), oldDate.toISOString(), oldDate.toISOString(), oldWeekly.historyId);
    moveHistoryEntry.run(currentMonthlyDate.toISOString(), currentMonthlyDate.toISOString(), currentMonthlyDate.toISOString(), currentMonthly.historyId);
    moveHistoryEntry.run(currentWeeklyDate.toISOString(), currentWeeklyDate.toISOString(), currentWeeklyDate.toISOString(), currentWeekly.historyId);
    database.close();

    const weeklyHistory = harness.service.getPlaybackHistory({
      from: startOfWeekWindow.toISOString(),
      to: startOfTomorrow.toISOString(),
      pageSize: 10,
    });
    const weeklySummary = harness.service.getPlaybackHistorySummary({
      from: startOfWeekWindow.toISOString(),
      to: startOfTomorrow.toISOString(),
    });

    expect(weeklyHistory.items).toHaveLength(2);
    expect(weeklyHistory.items.find((item) => item.title === 'Weekly Title')).toMatchObject({
      playCount: 1,
      playedSeconds: 40,
    });
    expect(weeklySummary).toMatchObject({
      rangeCount: 2,
      rangePlayedSeconds: 75,
      totalCount: 3,
      rangeLatestPlayedAt: currentWeeklyDate.toISOString(),
    });
    harness.cleanup();
  });

  it('getAlbums search matches tracks inside an album', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'Hidden Track', artist: 'Searchable Artist', album: 'Deep Cuts', albumArtist: 'Various Artists' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B Side', artist: 'Other Artist', album: 'Deep Cuts', albumArtist: 'Various Artists' }));
    harness.addFolder();

    await harness.scanFolder();
    const albums = harness.service.getAlbums({ search: 'searchable hidden', pageSize: 10 });

    expect(albums.total).toBe(1);
    expect(albums.items[0].title).toBe('Deep Cuts');
    harness.cleanup();
  });

  it('getAlbumTracks returns paginated tracks from persisted album_tracks', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'A.flac');
    writeAudioFile(harness.folder, 'B.flac');
    harness.addFolder();

    await harness.scanFolder();
    const [album] = harness.service.getAlbums({ pageSize: 1 }).items;
    const firstPage = harness.service.getAlbumTracks(album.id, { page: 1, pageSize: 1 });
    const secondPage = harness.service.getAlbumTracks(album.id, { page: 2, pageSize: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items).toHaveLength(1);
    harness.cleanup();
  });

  it('getArtistTracks returns case-insensitive artist tracks with pagination and sorting', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'A.flac');
    const second = writeAudioFile(harness.folder, 'B.flac');
    const third = writeAudioFile(harness.folder, 'C.flac');
    const other = writeAudioFile(harness.folder, 'D.flac');
    harness.metadataService.overrides.set(
      first,
      baseMetadata({ title: 'Second Song', artist: 'Echo Unit', album: 'Alpha', albumArtist: 'Echo Unit', trackNo: 2, duration: 120 }),
    );
    harness.metadataService.overrides.set(
      second,
      baseMetadata({ title: 'First Song', artist: 'echo unit', album: 'Alpha', albumArtist: 'Echo Unit', trackNo: 1, duration: 240 }),
    );
    harness.metadataService.overrides.set(
      third,
      baseMetadata({ title: 'Third Song', artist: 'Echo Unit', album: 'Beta', albumArtist: 'Echo Unit', trackNo: 1, duration: 360 }),
    );
    harness.metadataService.overrides.set(
      other,
      baseMetadata({ title: 'Other Song', artist: 'Other Artist', album: 'Elsewhere', albumArtist: 'Other Artist' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: 'Echo Unit', pageSize: 1 }).items;
    const firstPage = harness.service.getArtistTracks(artist.id, { page: 1, pageSize: 2 });
    const secondPage = harness.service.getArtistTracks(artist.id, { page: 2, pageSize: 2 });
    const durationSorted = harness.service.getArtistTracks(artist.id, { page: 1, pageSize: 3, sort: 'durationDesc' });

    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((track) => track.title)).toEqual(['First Song', 'Second Song']);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items.map((track) => track.title)).toEqual(['Third Song']);
    expect(durationSorted.items.map((track) => track.title)).toEqual(['Third Song', 'First Song', 'Second Song']);
    harness.cleanup();
  });

  it('getArtistAlbums returns albums by album artist with pagination', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'AlbumA.flac');
    const second = writeAudioFile(harness.folder, 'AlbumB.flac');
    const other = writeAudioFile(harness.folder, 'AlbumC.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Echo Unit', album: 'First Album', albumArtist: 'Echo Unit' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Echo Unit', album: 'Second Album', albumArtist: 'Echo Unit' }));
    harness.metadataService.overrides.set(other, baseMetadata({ title: 'C', artist: 'Other Artist', album: 'Other Album', albumArtist: 'Other Artist' }));
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: 'Echo Unit', pageSize: 1 }).items;
    const firstPage = harness.service.getArtistAlbums(artist.id, { page: 1, pageSize: 1 });
    const secondPage = harness.service.getArtistAlbums(artist.id, { page: 2, pageSize: 1 });

    expect(firstPage.total).toBe(2);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0].title).toBe('First Album');
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].title).toBe('Second Album');
    harness.cleanup();
  });

  it('getArtistTracks includes tracks from albums credited to the artist', async () => {
    const harness = createHarness();
    const first = writeAudioFile(harness.folder, 'AlbumArtistA.flac');
    const second = writeAudioFile(harness.folder, 'AlbumArtistB.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'Unit Song A', artist: 'Guest Singer A', album: 'Unit Album', albumArtist: '10 Jigen', trackNo: 1 }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'Unit Song B', artist: 'Guest Singer B', album: 'Unit Album', albumArtist: '10 Jigen', trackNo: 2 }));
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: '10 Jigen', pageSize: 1 }).items;
    const tracks = harness.service.getArtistTracks(artist.id, { page: 1, pageSize: 10 });

    expect(artist).toMatchObject({ name: '10 Jigen', trackCount: 2, albumCount: 1 });
    expect(tracks.total).toBe(2);
    expect(tracks.items.map((track) => track.title)).toEqual(['Unit Song A', 'Unit Song B']);
    harness.cleanup();
  });

  it('keeps mixed same-title albums from leaking unrelated tracks into an artist page', async () => {
    const harness = createHarness({ coverExtractor: new FakeCoverExtractor() });
    harness.setAlbumMergeStrategy('sameTitleAndCover');
    const adoTrack = writeAudioFile(harness.folder, 'Ado.flac');
    const c418Track = writeAudioFile(harness.folder, 'C418.flac');
    const yoneTrack = writeAudioFile(harness.folder, 'Yone.flac');
    harness.metadataService.overrides.set(
      adoTrack,
      baseMetadata({ title: 'New Genesis', artist: 'Ado', album: 'Web Stream', albumArtist: 'Ado' }),
    );
    harness.metadataService.overrides.set(
      c418Track,
      baseMetadata({ title: 'Minecraft', artist: 'C418', album: 'Web Stream', albumArtist: 'C418' }),
    );
    harness.metadataService.overrides.set(
      yoneTrack,
      baseMetadata({ title: 'Kaeru', artist: 'YONEDA', album: 'Web Stream', albumArtist: 'YONEDA' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: 'Ado', pageSize: 1 }).items;
    const tracks = harness.service.getArtistTracks(artist.id, { page: 1, pageSize: 10 });
    const albums = harness.service.getArtistAlbums(artist.id, { page: 1, pageSize: 10 });
    const [mergedAlbum] = harness.service.getAlbums({ search: 'Web Stream', pageSize: 1 }).items;

    expect(artist).toMatchObject({ name: 'Ado', trackCount: 1, albumCount: 0 });
    expect(tracks.items.map((track) => track.title)).toEqual(['New Genesis']);
    expect(albums.total).toBe(0);
    expect(mergedAlbum).toMatchObject({ title: 'Web Stream', albumArtist: 'Various Artists', trackCount: 3 });
    harness.cleanup();
  });

  it('splits collaboration artists into shared artist entries without splitting Japanese group punctuation', async () => {
    const harness = createHarness();
    const duet = writeAudioFile(harness.folder, 'Duet.flac');
    const solo = writeAudioFile(harness.folder, 'Solo.flac');
    const comma = writeAudioFile(harness.folder, 'Comma.flac');
    const japaneseGroup = writeAudioFile(harness.folder, 'JapaneseGroup.flac');
    const repeated = writeAudioFile(harness.folder, 'Repeated.flac');
    harness.metadataService.overrides.set(
      duet,
      baseMetadata({ title: 'Duet Song', artist: '2PM/尹恩惠', album: 'Duet Album', albumArtist: '2PM/尹恩惠' }),
    );
    harness.metadataService.overrides.set(
      solo,
      baseMetadata({ title: 'Solo Song', artist: '2PM', album: 'Solo Album', albumArtist: '2PM' }),
    );
    harness.metadataService.overrides.set(
      comma,
      baseMetadata({ title: 'Comma Song', artist: 'Afterglow,FLOW', album: 'Split Album', albumArtist: 'Afterglow,FLOW' }),
    );
    harness.metadataService.overrides.set(
      japaneseGroup,
      baseMetadata({
        title: 'Group Song',
        artist: '25時、ナイトコードで。',
        album: 'Night Album',
        albumArtist: '25時、ナイトコードで。',
      }),
    );
    harness.metadataService.overrides.set(
      repeated,
      baseMetadata({ title: 'Repeated Song', artist: 'Repeat/Repeat', album: 'Repeat Album', albumArtist: 'Repeat/Repeat' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [twoPm] = harness.service.getArtists({ search: '2PM', pageSize: 10 }).items;
    const [yoon] = harness.service.getArtists({ search: '尹恩惠', pageSize: 10 }).items;
    const [afterglow] = harness.service.getArtists({ search: 'Afterglow', pageSize: 10 }).items;
    const flow = harness.service.getArtists({ search: 'FLOW', pageSize: 10 }).items.find((artist) => artist.name === 'FLOW')!;
    const [nightCode] = harness.service.getArtists({ search: '25時 ナイトコード', pageSize: 10 }).items;
    const [repeat] = harness.service.getArtists({ search: 'Repeat', pageSize: 10 }).items;

    expect(harness.service.getArtists({ search: '2PM/尹恩惠', pageSize: 10 }).total).toBe(0);
    expect(twoPm).toMatchObject({ name: '2PM', trackCount: 2, albumCount: 2 });
    expect(yoon).toMatchObject({ name: '尹恩惠', trackCount: 1, albumCount: 1 });
    expect(afterglow).toMatchObject({ name: 'Afterglow', trackCount: 1, albumCount: 1 });
    expect(flow).toMatchObject({ name: 'FLOW', trackCount: 1, albumCount: 1 });
    expect(nightCode).toMatchObject({ name: '25時、ナイトコードで。', trackCount: 1, albumCount: 1 });
    expect(repeat).toMatchObject({ name: 'Repeat', trackCount: 1, albumCount: 1 });
    expect(harness.service.getArtistTracks(twoPm.id, { pageSize: 10 }).items.map((track) => track.title)).toEqual([
      'Duet Song',
      'Solo Song',
    ]);
    expect(harness.service.getArtistTracks(yoon.id, { pageSize: 10 }).items.map((track) => track.title)).toEqual(['Duet Song']);
    expect(harness.service.getArtistAlbums(twoPm.id, { pageSize: 10 }).items.map((album) => album.title)).toEqual([
      'Duet Album',
      'Solo Album',
    ]);
    expect(harness.service.getArtistAlbums(yoon.id, { pageSize: 10 }).items.map((album) => album.title)).toEqual(['Duet Album']);
    harness.cleanup();
  });

  it('getArtists returns a representative album cover when one is available', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Cover Artist.flac');
    harness.metadataService.overrides.set(
      filePath,
      baseMetadata({
        title: 'Covered Song',
        artist: 'Cover Artist',
        album: 'Covered Album',
        albumArtist: 'Cover Artist',
        embeddedCover: {
          data: validCoverPng(),
          mimeType: 'image/png',
        },
      }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: 'Cover Artist', pageSize: 1 }).items;

    expect(artist.coverId).toBeTruthy();
    expect(artist.coverThumb).toContain('echo-cover://album/');
    harness.cleanup();
  });

  it('getArtists keeps cover fields empty when an artist has no album cover', async () => {
    const harness = createHarness({ coverExtractor: new ThrowingCoverExtractor() });
    const filePath = writeAudioFile(harness.folder, 'Plain Artist.flac');
    harness.metadataService.overrides.set(
      filePath,
      baseMetadata({ title: 'Plain Song', artist: 'Plain Artist', album: 'Plain Album', albumArtist: 'Plain Artist' }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [artist] = harness.service.getArtists({ search: 'Plain Artist', pageSize: 1 }).items;

    expect(artist.coverId).toBeNull();
    expect(artist.coverThumb).toBeNull();
    harness.cleanup();
  });

  it('getArtists representative album cover selection is stable across reads', async () => {
    const coverExtractor = new FakeCoverExtractor();
    const harness = createHarness({ coverExtractor });
    const first = writeAudioFile(harness.folder, 'Stable A.flac');
    const second = writeAudioFile(harness.folder, 'Stable B.flac');
    harness.metadataService.overrides.set(first, baseMetadata({ title: 'A', artist: 'Stable Artist', album: 'First Album', albumArtist: 'Stable Artist' }));
    harness.metadataService.overrides.set(second, baseMetadata({ title: 'B', artist: 'Stable Artist', album: 'Second Album', albumArtist: 'Stable Artist' }));
    harness.addFolder();

    await harness.scanFolder();
    const firstRead = harness.service.getArtists({ search: 'Stable Artist', pageSize: 1 }).items[0];
    const secondRead = harness.service.getArtists({ search: 'Stable Artist', pageSize: 1 }).items[0];

    expect(firstRead.coverId).toBeTruthy();
    expect(secondRead.coverId).toBe(firstRead.coverId);
    harness.cleanup();
  });

  it('list API does not return full cover', async () => {
    const harness = createHarness();
    const filePath = writeAudioFile(harness.folder, 'Cover.flac');
    harness.metadataService.overrides.set(
      filePath,
      baseMetadata({
        embeddedCover: {
          data: validCoverPng(),
          mimeType: 'image/png',
        },
      }),
    );
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    const [album] = harness.service.getAlbums({ pageSize: 1 }).items;
    const albumDetail = harness.service.getAlbum(album.id);
    const serializedTrack = JSON.stringify(track);
    const serializedAlbum = JSON.stringify(album);
    const serializedAlbumDetail = JSON.stringify(albumDetail);

    expect(track).toHaveProperty('coverThumb');
    expect(track.coverThumb).toContain('echo-cover://thumb/');
    expect(album.coverThumb).toContain('echo-cover://album/');
    expect(albumDetail?.coverThumb).toContain('echo-cover://album/');
    expect(albumDetail?.coverLarge).toContain('echo-cover://large/');
    expect(track).not.toHaveProperty('largePath');
    expect(track).not.toHaveProperty('originalRef');
    expect(album).not.toHaveProperty('largePath');
    expect(album).not.toHaveProperty('originalRef');
    expect(track).not.toHaveProperty('coverLarge');
    expect(track).not.toHaveProperty('coverOriginal');
    expect(serializedTrack).not.toContain('file://');
    expect(serializedAlbum).not.toContain('file://');
    expect(serializedTrack).not.toContain('cover-cache');
    expect(serializedAlbum).not.toContain('cover-cache');
    expect(serializedAlbumDetail).not.toContain('cover-cache');
    expect(serializedTrack).not.toContain('largePath');
    expect(serializedAlbum).not.toContain('largePath');
    expect(serializedAlbumDetail).not.toContain('largePath');
    expect(serializedTrack).not.toContain('originalRef');
    expect(serializedAlbum).not.toContain('originalRef');
    expect(serializedAlbumDetail).not.toContain('originalRef');
    expect(serializedTrack).not.toContain('base64');
    expect(serializedAlbum).not.toContain('base64');
    expect(serializedAlbumDetail).not.toContain('base64');
    harness.cleanup();
  });

  it('does not fall back to compressed derivatives for original cover assets', async () => {
    const coverExtractor = new FakeCoverExtractor({ source: 'embedded', mimeType: 'image/png' });
    const harness = createHarness({ coverExtractor });
    writeAudioFile(harness.folder, 'Original Cover Only.flac');
    harness.addFolder();

    await harness.scanFolder();
    const track = harness.service.getTracks({ pageSize: 1 }).items[0];
    const largeAsset = track.coverId ? harness.service.resolveCoverAsset(track.coverId, 'large') : null;
    const originalAsset = track.coverId ? harness.service.resolveCoverAsset(track.coverId, 'original') : null;

    expect(largeAsset?.filePath.endsWith('large.webp')).toBe(true);
    expect(originalAsset?.filePath.endsWith('original.svg')).toBe(true);

    const database = createDatabase(harness.databasePath);
    database.prepare('UPDATE covers SET original_ref = NULL, cover_original = NULL WHERE id = ?').run(track.coverId);
    database.close();

    expect(harness.service.resolveCoverAsset(track.coverId!, 'large')?.filePath.endsWith('large.webp')).toBe(true);
    expect(harness.service.resolveCoverAsset(track.coverId!, 'original')).toBeNull();
    harness.cleanup();
  });

  it('getDiagnostics returns counts and timings without full track or cover lists', async () => {
    const harness = createHarness();
    writeAudioFile(harness.folder, 'Diagnostics.flac');
    harness.addFolder();

    await harness.scanFolder();
    harness.service.getTracks({ pageSize: 1 });
    harness.service.getAlbums({ pageSize: 1 });
    const diagnostics = harness.service.getDiagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.foldersCount).toBe(1);
    expect(diagnostics.tracksCount).toBe(1);
    expect(diagnostics.albumsCount).toBe(1);
    expect(diagnostics.coversCount).toBe(1);
    expect(diagnostics.lastScan?.status).toBe('completed');
    expect(diagnostics.lastScan?.coverCount).toBe(1);
    expect(diagnostics.lastScan?.skippedCount).toBe(0);
    expect(typeof diagnostics.lastQueryMs.getTracks).toBe('number');
    expect(typeof diagnostics.lastQueryMs.getAlbums).toBe('number');
    expect(typeof diagnostics.averageAlbumPayloadBytes).toBe('number');
    expect(diagnostics.coverCachePath).toBe(harness.coverCacheDir);
    expect(typeof diagnostics.coverCacheSizeBytes).toBe('number');
    expect(diagnostics.coverCacheVersion).toBe(1);
    expect(diagnostics.databasePath).toBe(harness.databasePath);
    expect(diagnostics.scanPerformanceMode).toBe('balanced');
    expect(diagnostics.metadataConcurrency).toBeGreaterThan(0);
    expect(diagnostics.coverConcurrency).toBeGreaterThan(0);
    expect(diagnostics.cpuCount).toBeGreaterThanOrEqual(0);
    expect(serialized).not.toContain('"items"');
    expect(serialized).not.toContain('coverLarge');
    expect(serialized).not.toContain('coverOriginal');
    harness.cleanup();
  });

  it('embedded cover wins over folder/default cover', async () => {
    const embeddedCover = validCoverPng();
    const harness = createHarness({
      metadataReader: new FakeMetadataReader(
        metadataResult({
          embeddedCover: {
            data: embeddedCover,
            mimeType: 'image/png',
          },
        }),
      ),
    });
    writeAudioFile(harness.folder, 'Cover Priority.flac');
    writeFileSync(join(harness.folder, 'cover.jpg'), new Uint8Array([9, 9, 9]));
    harness.addFolder();

    await harness.scanFolder();
    const [track] = harness.service.getTracks({ pageSize: 1 }).items;
    harness.service.close();
    const database = createDatabase(harness.databasePath);
    const cover = database
      .prepare<[string | null], { source_type: string; thumb_path: string | null }>('SELECT source_type, thumb_path FROM covers WHERE id = ?')
      .get(track.coverId);

    expect(cover?.source_type).toBe('embedded');
    expect(typeof cover?.thumb_path).toBe('string');
    expect(track.coverThumb).toContain('echo-cover://thumb/');
    database.close();
    harness.cleanup();
  });

  it('cover extractor failures do not prevent track metadata from being written', async () => {
    const harness = createHarness({ coverExtractor: new ThrowingCoverExtractor() });
    writeAudioFile(harness.folder, 'Cover Failure.flac');
    harness.addFolder();

    const status = await harness.scanFolder();
    const tracks = harness.service.getTracks({ pageSize: 10 });

    expect(status.status).toBe('completed');
    expect(status.errors.join('\n')).toContain('cover extractor boom');
    expect(tracks.total).toBe(1);
    expect(tracks.items[0].title).toBe('Embedded Title');
    expect(tracks.items[0].coverThumb).toBeNull();
    harness.cleanup();
  });

  it('LibraryService can scan with fake worker interfaces instead of concrete TS workers', async () => {
    const root = makeTempRoot();
    const folder = join(root, 'music');
    mkdirSync(folder, { recursive: true });
    const filePath = writeAudioFile(folder, 'Fake Worker.flac');
    const fileScanner = new FakeFileScanner([
      {
        path: filePath,
        sizeBytes: 123,
        mtimeMs: 456,
      },
    ]);
    const metadataReader = new FakeMetadataReader(metadataResult({ title: 'Worker Title' }));
    const coverExtractor = new FakeCoverExtractor();
    const service = createLibraryService(join(root, 'library.sqlite'), {
      fileScanner,
      metadataReader,
      coverExtractor,
      coverCacheDir: join(root, 'cover-cache'),
    });

    const libraryFolder = service.addFolder(folder);
    const job = service.scanFolder(libraryFolder.id);
    await service.waitForScan(job.id);

    const tracks = service.getTracks({ pageSize: 10 });
    expect(fileScanner.calls).toEqual([folder]);
    expect(metadataReader.calls).toEqual([filePath]);
    expect(coverExtractor.calls).toEqual([filePath]);
    expect(tracks.total).toBe(1);
    expect(tracks.items[0].title).toBe('Worker Title');
    service.close();
  });

  it('worker warnings and errors are collected without failing the scan', async () => {
    const root = makeTempRoot();
    const folder = join(root, 'music');
    mkdirSync(folder, { recursive: true });
    const filePath = writeAudioFile(folder, 'Noisy Worker.flac');
    const metadataReader = new FakeMetadataReader(
      metadataResult(
        { title: 'Noisy Title' },
        {
          status: 'error',
          warnings: ['metadata warning'],
          errors: ['metadata fallback'],
        },
      ),
    );
    const coverExtractor = new FakeCoverExtractor({
      warnings: ['cover warning'],
      errors: ['cover fallback'],
    });
    const service = createLibraryService(join(root, 'library.sqlite'), {
      fileScanner: new FakeFileScanner([
        {
          path: filePath,
          sizeBytes: 123,
          mtimeMs: 456,
        },
      ]),
      metadataReader,
      coverExtractor,
      coverCacheDir: join(root, 'cover-cache'),
    });

    const libraryFolder = service.addFolder(folder);
    const job = service.scanFolder(libraryFolder.id);
    await service.waitForScan(job.id);
    const status = service.getScanStatus(job.id);
    const tracks = service.getTracks({ pageSize: 10 });

    expect(status.status).toBe('completed');
    expect(status.errorCount).toBe(4);
    expect(status.errors.join('\n')).toContain('metadata warning');
    expect(status.errors.join('\n')).toContain('metadata fallback');
    expect(status.errors.join('\n')).toContain('cover warning');
    expect(status.errors.join('\n')).toContain('cover fallback');
    expect(tracks.total).toBe(1);
    expect(tracks.items[0].metadataStatus).toBe('error');
    service.close();
  });

  it('scan job can be cancelled while worker work is in flight', async () => {
    const root = makeTempRoot();
    const folder = join(root, 'music');
    mkdirSync(folder, { recursive: true });
    const filePath = writeAudioFile(folder, 'Slow Worker.flac');
    let resolveStarted: () => void = () => undefined;
    let releaseRead: () => void = () => undefined;
    const readStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const metadataReader: MetadataReader = {
      async read() {
        resolveStarted();
        await new Promise<void>((resolveRead) => {
          releaseRead = resolveRead;
        });
        return metadataResult();
      },
    };
    const service = createLibraryService(join(root, 'library.sqlite'), {
      fileScanner: new FakeFileScanner([
        {
          path: filePath,
          sizeBytes: 123,
          mtimeMs: 456,
        },
      ]),
      metadataReader,
      coverExtractor: new FakeCoverExtractor(),
      coverCacheDir: join(root, 'cover-cache'),
    });
    const libraryFolder = service.addFolder(folder);
    const job = service.scanFolder(libraryFolder.id);

    await readStarted;
    const cancelling = service.cancelScan(job.id);
    expect(cancelling.status).toBe('running');
    releaseRead();
    await service.waitForScan(job.id);
    expect(service.getScanStatus(job.id).status).toBe('cancelled');
    service.close();
  });

  it('imports a single audio file without scanning the full folder', async () => {
    const metadataReader = new FakeMetadataReader(metadataResult({ title: 'Downloaded Song', artist: 'Download Artist' }));
    const coverExtractor = new FakeCoverExtractor();
    const harness = createHarness({ metadataReader, coverExtractor });
    const filePath = writeAudioFile(harness.folder, 'Downloaded Song.m4p');

    const track = await harness.service.importAudioFile(filePath);

    expect(track.title).toBe('Downloaded Song');
    expect(track.artist).toBe('Download Artist');
    expect(metadataReader.calls).toEqual([filePath]);
    expect(coverExtractor.calls).toEqual([filePath]);
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(1);
    expect(harness.service.getAlbums({ pageSize: 10 }).total).toBe(1);
    expect(harness.service.getArtists({ pageSize: 10 }).total).toBeGreaterThan(0);
    harness.cleanup();
  });

  it('updates an existing track when the same path is imported again', async () => {
    const metadataReader = new FakeMetadataReader(metadataResult({ title: 'Repeat Title' }));
    const harness = createHarness({ metadataReader, coverExtractor: new FakeCoverExtractor() });
    const filePath = writeAudioFile(harness.folder, 'Repeat Import.flac');

    const first = await harness.service.importAudioFile(filePath);
    const second = await harness.service.importAudioFile(filePath);

    expect(first.id).toBe(second.id);
    expect(harness.service.getTracks({ pageSize: 10 }).total).toBe(1);
    expect(metadataReader.calls).toEqual([filePath, filePath]);
    harness.cleanup();
  });
});
