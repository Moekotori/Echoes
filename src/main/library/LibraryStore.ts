import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import type { EchoDatabase } from '../database/createDatabase';
import type { AlbumMergeStrategy, AlbumService } from './AlbumService';
import { updateCoverPathsInDatabase } from './CoverCacheManager';
import type {
  CoverSource,
  CoverResult,
  CoverVariant,
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryArtist,
  LibraryDiagnostics,
  LibraryFolder,
  LibraryFolderChildrenQuery,
  LibraryFolderNode,
  LibraryFolderOverview,
  LibraryFolderPathRequest,
  LibraryFolderTracksQuery,
  LibraryPage,
  LibraryPageQuery,
  LibraryPlaylist,
  LibraryPlaylistItem,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  LibraryScanStatus,
  LibrarySummary,
  LibraryTrack,
  ScanJobUpdate,
  StoredTrackCoverState,
  StoredTrackFingerprint,
  TrackWrite,
} from './libraryTypes';
import { COVER_CACHE_VERSION as currentCoverCacheVersion } from './libraryTypes';

type DbRow = Record<string, unknown>;
type ArtistIndexStats = {
  id: string;
  key: string;
  name: string;
  trackIds: Set<string>;
  albumIds: Set<string>;
  coverId: string | null;
  coverScore: number;
};

const defaultPageSize = 100;
const maxPageSize = 500;

const nowIso = (): string => new Date().toISOString();

const pageFromQuery = (query?: LibraryPageQuery): { page: number; pageSize: number; search: string; sort: string } => ({
  page: Math.max(1, Math.floor(Number(query?.page ?? 1))),
  pageSize: Math.min(maxPageSize, Math.max(1, Math.floor(Number(query?.pageSize ?? defaultPageSize)))),
  search: typeof query?.search === 'string' ? query.search.trim() : '',
  sort: query?.sort ?? 'default',
});

const pageFromHistoryQuery = (
  query?: PlaybackHistoryQuery,
): { page: number; pageSize: number; search: string; from: string | null; to: string | null; completedOnly: boolean } => ({
  page: Math.max(1, Math.floor(Number(query?.page ?? 1))),
  pageSize: Math.min(maxPageSize, Math.max(1, Math.floor(Number(query?.pageSize ?? 50)))),
  search: typeof query?.search === 'string' ? query.search.trim() : '',
  from: typeof query?.from === 'string' && query.from.trim() ? query.from.trim() : null,
  to: typeof query?.to === 'string' && query.to.trim() ? query.to.trim() : null,
  completedOnly: query?.completedOnly === true,
});

const likeSearch = (search: string): string => `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
const likePrefix = (prefix: string): string => `${prefix.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
const searchSeparatorPattern = /[\s!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~_-]+/u;
const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const pathSeparatorPattern = /[\\/]+/u;
const preferredPathSeparator = process.platform === 'win32' ? '\\' : '/';

const stripTrailingPathSeparators = (value: string): string => {
  const normalized = resolve(value);
  const rootMatch = normalized.match(/^[A-Za-z]:[\\/]?$/u);

  if (rootMatch || normalized === '/' || normalized === '\\') {
    return normalized;
  }

  return normalized.replace(/[\\/]+$/u, '');
};

const pathCompareValue = (value: string): string =>
  process.platform === 'win32' ? stripTrailingPathSeparators(value).toLocaleLowerCase() : stripTrailingPathSeparators(value);

const isPathInsideOrEqual = (rootPath: string, candidatePath: string): boolean => {
  const root = pathCompareValue(rootPath);
  const candidate = pathCompareValue(candidatePath);

  return candidate === root || candidate.startsWith(`${root}\\`) || candidate.startsWith(`${root}/`);
};

const childPathFor = (parentPath: string, childName: string): string =>
  `${stripTrailingPathSeparators(parentPath)}${preferredPathSeparator}${childName}`;

const folderDepth = (rootPath: string, folderPath: string): number => {
  const root = stripTrailingPathSeparators(rootPath);
  const folder = stripTrailingPathSeparators(folderPath);

  if (pathCompareValue(root) === pathCompareValue(folder)) {
    return 0;
  }

  const prefixLength = root.endsWith('\\') || root.endsWith('/') ? root.length : root.length + 1;
  return folder.slice(prefixLength).split(pathSeparatorPattern).filter(Boolean).length;
};

type SearchPredicate = (term: string) => { sql: string; params: string[] };

const likePredicate =
  (expression: string): SearchPredicate =>
  (term) => ({
    sql: `${expression} LIKE ? ESCAPE '\\'`,
    params: [likeSearch(term)],
  });

const searchTerms = (search: string): string[] => {
  const normalized = search.normalize('NFKC').trim();
  const parts = normalized.split(searchSeparatorPattern).filter(Boolean);
  const terms =
    parts.length === 1 && cjkPattern.test(parts[0]) && Array.from(parts[0]).length > 2 ? Array.from(parts[0]) : parts;

  return Array.from(new Set(terms)).slice(0, 12);
};

const buildSearchFilter = (
  search: string,
  predicates: SearchPredicate[],
): { sql: string; params: string[] } => {
  const terms = searchTerms(search);

  if (terms.length === 0) {
    return { sql: '', params: [] };
  }

  const params: string[] = [];
  const sql = terms
    .map((term) => {
      const clauses = predicates.map((predicate) => predicate(term));
      params.push(...clauses.flatMap((clause) => clause.params));
      return `(${clauses.map((clause) => clause.sql).join(' OR ')})`;
    })
    .join(' AND ');

  return { sql, params };
};

const parseJsonObject = (value: unknown): Record<string, string> => {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const parseErrors = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const playbackHistoryKey = (trackId: string | null, trackPath: string): string => trackId ?? trackPath;
const coverSourceOrNull = (value: unknown): CoverSource | null =>
  value === 'manual' || value === 'embedded' || value === 'folder' || value === 'network' || value === 'default' ? value : null;
const artistNameSeparatorPattern = /\s*(?:\/|,|;|；|&|×)\s*|\s+\b(?:feat\.?|ft\.?|featuring|with|x)\b\s+/iu;
const coverSourceRank: Record<CoverSource, number> = {
  default: 0,
  network: 1,
  folder: 2,
  embedded: 3,
  manual: 4,
};

const stableArtistAlbumScore = (artistKey: string, albumId: string): number => {
  let hash = 2166136261;
  const value = `${artistKey}:${albumId}`;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const normalizeArtistDisplayName = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const artistKeyForName = (name: string): string => name.normalize('NFKC').toLocaleLowerCase();

const splitArtistNames = (value: unknown): string[] => {
  const normalized = normalizeArtistDisplayName(value);

  if (!normalized) {
    return [];
  }

  const names = normalized.split(artistNameSeparatorPattern).map(normalizeArtistDisplayName).filter(Boolean);
  const uniqueNames = new Map<string, string>();

  for (const name of names.length > 0 ? names : [normalized]) {
    const key = artistKeyForName(name);
    if (!uniqueNames.has(key)) {
      uniqueNames.set(key, name);
    }
  }

  return Array.from(uniqueNames.values());
};

const preferredCoverSource = (current: unknown, next: CoverSource): CoverSource => {
  const currentSource = coverSourceOrNull(current);
  return currentSource && coverSourceRank[currentSource] > coverSourceRank[next] ? currentSource : next;
};

export class LibraryStore {
  private lastTracksQueryMs: number | null = null;
  private lastAlbumsQueryMs: number | null = null;

  constructor(private readonly database: EchoDatabase) {}

  transaction<T>(work: () => T): T {
    if (this.database.inTransaction) {
      return work();
    }

    return this.database.transaction(work)();
  }

  addFolder(folderPath: string): LibraryFolder {
    const normalizedPath = resolve(folderPath);
    const existing = this.getRow('SELECT * FROM folders WHERE path = ?', normalizedPath);
    const timestamp = nowIso();

    if (existing) {
      this.run('UPDATE folders SET status = ?, enabled = ?, updated_at = ? WHERE id = ?', 'active', 1, timestamp, existing.id);
      return this.mapFolder({ ...existing, status: 'active', enabled: 1, updated_at: timestamp });
    }

    const id = randomUUID();
    const name = basename(normalizedPath) || normalizedPath;

    this.run(
      `INSERT INTO folders (id, path, name, status, enabled, last_scan_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      normalizedPath,
      name,
      'active',
      1,
      null,
      timestamp,
      timestamp,
    );

    return {
      id,
      path: normalizedPath,
      name,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  getFolders(): LibraryFolder[] {
    return this.allRows(
      "SELECT * FROM folders WHERE enabled = 1 AND status != 'removed' ORDER BY path COLLATE NOCASE",
    ).map((row) => this.mapFolder(row));
  }

  getFolder(folderId: string): LibraryFolder | null {
    const row = this.getRow("SELECT * FROM folders WHERE id = ? AND enabled = 1 AND status != 'removed'", folderId);
    return row ? this.mapFolder(row) : null;
  }

  getFolderOverviews(): LibraryFolderOverview[] {
    return this.allRows(
      "SELECT * FROM folders WHERE enabled = 1 AND status != 'removed' ORDER BY path COLLATE NOCASE",
    ).map((row) => {
      const folder = this.mapFolder(row);
      const activeStats = this.getRow(
        `SELECT
          COUNT(*) AS track_count,
          COALESCE(SUM(duration), 0) AS total_duration,
          COALESCE(SUM(size_bytes), 0) AS total_size_bytes,
          COALESCE(SUM(CASE WHEN UPPER(COALESCE(codec, '')) IN ('FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'DSF', 'DFF') THEN 1 ELSE 0 END), 0) AS lossless_count,
          COALESCE(SUM(CASE WHEN COALESCE(bit_depth, 0) >= 24 OR COALESCE(sample_rate, 0) >= 88200 THEN 1 ELSE 0 END), 0) AS hires_count
         FROM tracks
         WHERE folder_id = ? AND missing = 0`,
        folder.id,
      );
      const missingStats = this.getRow(
        `SELECT COUNT(*) AS missing_count
         FROM tracks
         WHERE folder_id = ? AND missing != 0`,
        folder.id,
      );
      const albumStats = this.getRow(
        `SELECT COUNT(DISTINCT album_tracks.album_id) AS album_count
         FROM tracks
         INNER JOIN album_tracks ON album_tracks.track_id = tracks.id
         WHERE tracks.folder_id = ? AND tracks.missing = 0`,
        folder.id,
      );
      const artistStats = this.getRow(
        `SELECT COUNT(DISTINCT artist_tracks.artist_id) AS artist_count
         FROM tracks
         INNER JOIN artist_tracks ON artist_tracks.track_id = tracks.id
         WHERE tracks.folder_id = ? AND tracks.missing = 0`,
        folder.id,
      );
      const recentScanRow = this.getRow(
        'SELECT * FROM scan_jobs WHERE folder_id = ? ORDER BY created_at DESC LIMIT 1',
        folder.id,
      );

      return {
        ...folder,
        lastScanAt: textOrNull(row.last_scan_at),
        recentScan: recentScanRow ? this.mapScanJob(recentScanRow) : null,
        trackCount: Number(activeStats?.track_count ?? 0),
        albumCount: Number(albumStats?.album_count ?? 0),
        artistCount: Number(artistStats?.artist_count ?? 0),
        totalDuration: Number(activeStats?.total_duration ?? 0),
        totalSizeBytes: Number(activeStats?.total_size_bytes ?? 0),
        missingTrackCount: Number(missingStats?.missing_count ?? 0),
        losslessTrackCount: Number(activeStats?.lossless_count ?? 0),
        hiResTrackCount: Number(activeStats?.hires_count ?? 0),
        childFolderCount: this.getDirectChildFolderCount(folder.id, folder.path),
        coverThumbs: this.getFolderCoverThumbs(folder.id, folder.path, true),
      };
    });
  }

  getFolderChildren(query: LibraryFolderChildrenQuery): LibraryFolderNode[] {
    const folder = this.requireFolder(query.folderId);
    const parentPath = this.resolveFolderScopedPath(folder, query.parentPath);
    const prefix = `${stripTrailingPathSeparators(parentPath)}${preferredPathSeparator}`;
    const rows = this.allRows(
      `SELECT path, duration, size_bytes, cover_id
       FROM tracks
       WHERE folder_id = ? AND missing = 0 AND path LIKE ? ESCAPE '\\'
       ORDER BY path COLLATE NOCASE`,
      folder.id,
      likePrefix(prefix),
    );
    const children = new Map<
      string,
      LibraryFolderNode & {
        childFolderNames: Set<string>;
        coverIds: Set<string>;
      }
    >();

    for (const row of rows) {
      const trackPath = String(row.path);
      const relativePath = trackPath.slice(prefix.length);
      const parts = relativePath.split(pathSeparatorPattern).filter(Boolean);

      if (parts.length <= 1) {
        continue;
      }

      const name = parts[0];
      const childPath = childPathFor(parentPath, name);
      const existing =
        children.get(childPath) ??
        ({
          folderId: folder.id,
          path: childPath,
          parentPath,
          name,
          depth: folderDepth(folder.path, childPath),
          trackCount: 0,
          directTrackCount: 0,
          childFolderCount: 0,
          totalDuration: 0,
          totalSizeBytes: 0,
          coverThumbs: [],
          childFolderNames: new Set<string>(),
          coverIds: new Set<string>(),
        } satisfies LibraryFolderNode & { childFolderNames: Set<string>; coverIds: Set<string> });

      existing.trackCount += 1;
      existing.totalDuration += Number(row.duration ?? 0);
      existing.totalSizeBytes += Number(row.size_bytes ?? 0);

      if (parts.length === 2) {
        existing.directTrackCount += 1;
      } else if (parts[1]) {
        existing.childFolderNames.add(parts[1]);
      }

      const coverId = textOrNull(row.cover_id);
      if (coverId && existing.coverIds.size < 4) {
        existing.coverIds.add(coverId);
      }

      children.set(childPath, existing);
    }

    return Array.from(children.values())
      .map(({ childFolderNames, coverIds, ...child }) => ({
        ...child,
        childFolderCount: childFolderNames.size,
        coverThumbs: Array.from(coverIds)
          .slice(0, 4)
          .map((coverId) => this.toCoverUrl(coverId, 'thumb'))
          .filter((value): value is string => Boolean(value)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  }

  getFolderTracks(query: LibraryFolderTracksQuery): LibraryPage<LibraryTrack> {
    const startedAt = performance.now();
    const folder = this.requireFolder(query.folderId);
    const folderPath = this.resolveFolderScopedPath(folder, query.path);
    const { page, pageSize, search, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const scope = this.folderTrackScope(folder.id, folderPath, query.recursive !== false);
    const searchFilter = buildSearchFilter(search, [
      likePredicate('tracks.title'),
      likePredicate('tracks.artist'),
      likePredicate('tracks.album'),
      likePredicate('tracks.album_artist'),
      likePredicate('COALESCE(tracks.genre, \'\')'),
      likePredicate('tracks.path'),
    ]);
    const whereSql = searchFilter.sql ? `WHERE ${scope.sql} AND ${searchFilter.sql}` : `WHERE ${scope.sql}`;
    const params = [...scope.params, ...searchFilter.params];
    const orderSql = this.trackOrderSql(sort);
    const totalRow = this.getRow(`SELECT COUNT(*) AS total FROM tracks ${whereSql}`, ...params);
    const rows = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
       FROM tracks
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    try {
      return {
        items: rows.map((row) => this.mapTrack(row)),
        page,
        pageSize,
        total,
        hasMore: offset + rows.length < total,
      };
    } finally {
      this.lastTracksQueryMs = performance.now() - startedAt;
    }
  }

  resolveLibraryFolderPath(request: LibraryFolderPathRequest): string {
    return this.resolveFolderScopedPath(this.requireFolder(request.folderId), request.path);
  }

  removeFolder(folderId: string): void {
    this.transaction(() => {
      const timestamp = nowIso();
      this.run('UPDATE folders SET status = ?, enabled = ?, updated_at = ? WHERE id = ?', 'removed', 0, timestamp, folderId);
      this.run('DELETE FROM tracks WHERE folder_id = ?', folderId);
      this.run('DELETE FROM scan_jobs WHERE folder_id = ?', folderId);
      this.run('DELETE FROM album_tracks');
      this.run('DELETE FROM albums');
      this.refreshArtists();
    });
  }

  createScanJob(folderId: string): LibraryScanStatus {
    const id = randomUUID();
    const timestamp = nowIso();

    this.run(
      `INSERT INTO scan_jobs (
        id, folder_id, status, phase, errors_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      folderId,
      'queued',
      'queued',
      '[]',
      timestamp,
      timestamp,
    );

    const job = this.getScanJob(id);

    if (!job) {
      throw new Error(`Failed to create scan job ${id}`);
    }

    return job;
  }

  updateScanJob(jobId: string, update: ScanJobUpdate): LibraryScanStatus {
    const current = this.getScanJob(jobId);

    if (!current) {
      throw new Error(`Unknown scan job ${jobId}`);
    }

    const next = {
      ...current,
      ...update,
      errors: update.errors ?? current.errors,
    };
    const errorCount = update.errorCount ?? next.errors.length;

    this.run(
      `UPDATE scan_jobs SET
        status = ?,
        phase = ?,
        discovered_count = ?,
        parsed_count = ?,
        skipped_count = ?,
        cover_count = ?,
        total_files = ?,
        processed_files = ?,
        skipped_files = ?,
        added_tracks = ?,
        updated_tracks = ?,
        removed_tracks = ?,
        error_count = ?,
        errors_json = ?,
        cancel_requested = COALESCE(?, cancel_requested),
        started_at = ?,
        finished_at = ?,
        updated_at = ?
      WHERE id = ?`,
      next.status,
      next.phase,
      next.totalFiles,
      next.processedFiles,
      next.skippedFiles,
      update.coverCount ?? current.coverCount ?? 0,
      next.totalFiles,
      next.processedFiles,
      next.skippedFiles,
      next.addedTracks,
      next.updatedTracks,
      next.removedTracks,
      errorCount,
      JSON.stringify(next.errors),
      typeof update.cancelRequested === 'boolean' ? (update.cancelRequested ? 1 : 0) : null,
      next.startedAt,
      next.finishedAt,
      nowIso(),
      jobId,
    );

    const updated = this.getScanJob(jobId);

    if (!updated) {
      throw new Error(`Failed to update scan job ${jobId}`);
    }

    return updated;
  }

  getScanJob(jobId: string): LibraryScanStatus | null {
    const row = this.getRow('SELECT * FROM scan_jobs WHERE id = ?', jobId);
    return row ? this.mapScanJob(row) : null;
  }

  isScanCancelled(jobId: string): boolean {
    const row = this.getRow('SELECT cancel_requested FROM scan_jobs WHERE id = ?', jobId);
    return Number(row?.cancel_requested ?? 0) === 1;
  }

  finishFolderScan(folderId: string, timestamp = nowIso()): void {
    this.run('UPDATE folders SET last_scan_at = ?, updated_at = ? WHERE id = ?', timestamp, timestamp, folderId);
  }

  findTrackFingerprint(filePath: string): StoredTrackFingerprint | null {
    const row = this.getRow('SELECT id, size_bytes, mtime_ms FROM tracks WHERE path = ? AND missing = 0', resolve(filePath));

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      sizeBytes: Number(row.size_bytes),
      mtimeMs: Number(row.mtime_ms),
    };
  }

  getTrackFingerprintsByFolder(folderId: string): Map<string, StoredTrackFingerprint> {
    const rows = this.allRows(
      'SELECT id, path, size_bytes, mtime_ms FROM tracks WHERE folder_id = ? AND missing = 0',
      folderId,
    );
    const fingerprints = new Map<string, StoredTrackFingerprint>();

    for (const row of rows) {
      fingerprints.set(String(row.path), {
        id: String(row.id),
        sizeBytes: Number(row.size_bytes),
        mtimeMs: Number(row.mtime_ms),
      });
    }

    return fingerprints;
  }

  getTrackCacheStatesByFolder(folderId: string): Map<string, StoredTrackCoverState> {
    const rows = this.allRows(
      `SELECT
        tracks.path, tracks.id, tracks.size_bytes, tracks.mtime_ms, tracks.cover_id,
        covers.source_type, covers.source_hash, covers.mime_type,
        covers.thumb_path, covers.album_path, covers.large_path, covers.original_ref,
        covers.cache_version
      FROM tracks
      LEFT JOIN covers ON covers.id = tracks.cover_id
      WHERE tracks.folder_id = ? AND tracks.missing = 0`,
      folderId,
    );
    const states = new Map<string, StoredTrackCoverState>();

    for (const row of rows) {
      states.set(resolve(String(row.path)), {
        id: String(row.id),
        sizeBytes: Number(row.size_bytes),
        mtimeMs: Number(row.mtime_ms),
        coverId: textOrNull(row.cover_id),
        coverSource: coverSourceOrNull(row.source_type),
        sourceHash: textOrNull(row.source_hash),
        mimeType: textOrNull(row.mime_type),
        thumbPath: textOrNull(row.thumb_path),
        albumPath: textOrNull(row.album_path),
        largePath: textOrNull(row.large_path),
        originalRef: textOrNull(row.original_ref),
        cacheVersion: numberOrNull(row.cache_version),
      });
    }

    return states;
  }

  findTrackCoverState(filePath: string): StoredTrackCoverState | null {
    const row = this.getRow(
      `SELECT
        tracks.id, tracks.size_bytes, tracks.mtime_ms, tracks.cover_id,
        covers.source_type, covers.source_hash, covers.mime_type,
        covers.thumb_path, covers.album_path, covers.large_path, covers.original_ref,
        covers.cache_version
      FROM tracks
      LEFT JOIN covers ON covers.id = tracks.cover_id
      WHERE tracks.path = ? AND tracks.missing = 0`,
      resolve(filePath),
    );

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      sizeBytes: Number(row.size_bytes),
      mtimeMs: Number(row.mtime_ms),
      coverId: textOrNull(row.cover_id),
      coverSource: coverSourceOrNull(row.source_type),
      sourceHash: textOrNull(row.source_hash),
      mimeType: textOrNull(row.mime_type),
      thumbPath: textOrNull(row.thumb_path),
      albumPath: textOrNull(row.album_path),
      largePath: textOrNull(row.large_path),
      originalRef: textOrNull(row.original_ref),
      cacheVersion: numberOrNull(row.cache_version),
    };
  }

  markTracksMissingFromFolder(folderId: string, discoveredPaths: string[], timestamp = nowIso()): number {
    const normalizedPaths = new Set(discoveredPaths.map((filePath) => resolve(filePath)));
    const existingRows = this.allRows('SELECT id, path FROM tracks WHERE folder_id = ? AND missing = 0', folderId);
    const missingIds = existingRows.filter((row) => !normalizedPaths.has(String(row.path))).map((row) => String(row.id));

    let changed = 0;

    for (const id of missingIds) {
      const result = this.run('UPDATE tracks SET missing = 1, updated_at = ? WHERE id = ?', timestamp, id);
      changed += Number(result.changes ?? 0);
    }

    return changed;
  }

  removeTracksMissingFromFolder(folderId: string, discoveredPaths: string[]): number {
    return this.markTracksMissingFromFolder(folderId, discoveredPaths);
  }

  upsertCover(result: CoverResult, now = nowIso()): string | null {
    const existing = this.getRow('SELECT id, source_type FROM covers WHERE source_hash = ?', result.sourceHash);
    const warningsJson = JSON.stringify(result.warnings);
    const errorsJson = JSON.stringify(result.errors);
    const source = preferredCoverSource(existing?.source_type, result.source);

    if (textOrNull(existing?.id)) {
      this.run(
        `UPDATE covers SET
          source_type = ?,
          mime_type = ?,
          thumb_path = ?,
          album_path = ?,
          large_path = ?,
          original_ref = ?,
          cache_version = ?,
          warnings_json = ?,
          errors_json = ?,
          cover_thumb = ?,
          cover_large = ?,
          cover_original = ?,
          updated_at = ?
        WHERE id = ?`,
        source,
        result.mimeType,
        result.thumbPath,
        result.albumPath,
        result.largePath,
        result.originalRef,
        currentCoverCacheVersion,
        warningsJson,
        errorsJson,
        result.thumbPath,
        result.largePath,
        result.originalRef,
        now,
        existing?.id,
      );
      return String(existing?.id);
    }

    const id = randomUUID();
    this.run(
      `INSERT INTO covers (
        id, source_type, source_hash, mime_type,
        thumb_path, album_path, large_path, original_ref,
        cache_version, warnings_json, errors_json,
        cover_thumb, cover_large, cover_original,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      source,
      result.sourceHash,
      result.mimeType,
      result.thumbPath,
      result.albumPath,
      result.largePath,
      result.originalRef,
      currentCoverCacheVersion,
      warningsJson,
      errorsJson,
      result.thumbPath,
      result.largePath,
      result.originalRef,
      now,
      now,
    );

    return id;
  }

  upsertTrack(track: TrackWrite): 'added' | 'updated' {
    const existing = this.getRow('SELECT id, created_at FROM tracks WHERE path = ?', resolve(track.path));
    const createdAt = textOrNull(existing?.created_at) ?? track.createdAt ?? track.updatedAt;
    const id = textOrNull(existing?.id) ?? track.id;

    this.run(
      `INSERT INTO tracks (
        id, path, folder_id, size_bytes, mtime_ms, title, artist, album, album_artist,
        track_no, disc_no, year, genre, duration, codec, sample_rate, bit_depth, bitrate,
        cover_id, metadata_status, embedded_metadata_status, embedded_cover_status, network_metadata_status,
        field_sources_json, missing, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        folder_id = excluded.folder_id,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        album_artist = excluded.album_artist,
        track_no = excluded.track_no,
        disc_no = excluded.disc_no,
        year = excluded.year,
        genre = excluded.genre,
        duration = excluded.duration,
        codec = excluded.codec,
        sample_rate = excluded.sample_rate,
        bit_depth = excluded.bit_depth,
        bitrate = excluded.bitrate,
        cover_id = excluded.cover_id,
        metadata_status = excluded.metadata_status,
        embedded_metadata_status = excluded.embedded_metadata_status,
        embedded_cover_status = excluded.embedded_cover_status,
        network_metadata_status = excluded.network_metadata_status,
        field_sources_json = excluded.field_sources_json,
        missing = 0,
        updated_at = excluded.updated_at`,
      id,
      resolve(track.path),
      track.folderId,
      track.sizeBytes,
      track.mtimeMs,
      track.title,
      track.artist,
      track.album,
      track.albumArtist,
      track.trackNo,
      track.discNo,
      track.year,
      track.genre,
      track.duration,
      track.codec,
      track.sampleRate,
      track.bitDepth,
      track.bitrate,
      track.coverId,
      track.metadataStatus ?? 'ok',
      track.embeddedMetadataStatus ?? 'pending',
      track.embeddedCoverStatus ?? 'pending',
      'none',
      JSON.stringify(track.fieldSources),
      0,
      createdAt,
      track.updatedAt,
    );

    return existing ? 'updated' : 'added';
  }

  updateTrackCover(trackId: string, coverId: string | null, timestamp = nowIso()): void {
    this.run('UPDATE tracks SET cover_id = ?, updated_at = ? WHERE id = ?', coverId, timestamp, trackId);
  }

  updateCoverCachePaths(oldDir: string, newDir: string, warnings: string[] = []): number {
    return this.transaction(() => updateCoverPathsInDatabase(this.database, oldDir, newDir, warnings));
  }

  recordTrackPlayback(trackId: string, timestamp = nowIso()): void {
    this.run(
      'UPDATE tracks SET play_count = COALESCE(play_count, 0) + 1, last_played_at = ? WHERE id = ? AND missing = 0',
      timestamp,
      trackId,
    );
  }

  createPlaybackHistoryEntry(input: {
    trackId: string | null;
    trackPath: string;
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    coverId: string | null;
    durationSeconds: number;
    sourceType?: string | null;
    sourceLabel?: string | null;
    queueId?: string | null;
    startedAt?: string;
  }): PlaybackHistoryEntry {
    const id = randomUUID();
    const startedAt = input.startedAt ?? nowIso();
    const durationSeconds = Math.max(0, Number(input.durationSeconds) || 0);
    const sourceType = textOrNull(input.sourceType);
    const sourceLabel = textOrNull(input.sourceLabel);
    const queueId = textOrNull(input.queueId);
    const historyKey = playbackHistoryKey(input.trackId, input.trackPath);

    return this.transaction(() => {
      this.run(
        `INSERT INTO playback_history (
          id, track_id, track_path, title, artist, album, album_artist, cover_id,
          started_at, ended_at, played_seconds, duration_seconds, completed,
          source_type, source_label, queue_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.trackId,
        input.trackPath,
        input.title,
        input.artist,
        input.album,
        input.albumArtist,
        input.coverId,
        startedAt,
        null,
        0,
        durationSeconds,
        0,
        sourceType,
        sourceLabel,
        queueId,
        startedAt,
      );

      this.run(
        `INSERT INTO playback_history_stats (
          history_key, track_id, track_path, title, artist, album, album_artist, cover_id,
          play_count, completed_count, total_played_seconds, duration_seconds,
          last_started_at, last_ended_at, source_type, source_label, queue_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(history_key) DO UPDATE SET
          track_id = excluded.track_id,
          track_path = excluded.track_path,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          album_artist = excluded.album_artist,
          cover_id = excluded.cover_id,
          play_count = playback_history_stats.play_count + 1,
          duration_seconds = excluded.duration_seconds,
          last_started_at = excluded.last_started_at,
          source_type = excluded.source_type,
          source_label = excluded.source_label,
          queue_id = excluded.queue_id,
          updated_at = excluded.updated_at`,
        historyKey,
        input.trackId,
        input.trackPath,
        input.title,
        input.artist,
        input.album,
        input.albumArtist,
        input.coverId,
        1,
        0,
        0,
        durationSeconds,
        startedAt,
        null,
        sourceType,
        sourceLabel,
        queueId,
        startedAt,
      );

      const entry = this.getPlaybackHistoryEntry(id);
      if (!entry) {
        throw new Error(`Failed to create playback history entry ${id}`);
      }

      return entry;
    });
  }

  finishPlaybackHistoryEntry(
    id: string,
    input: { playedSeconds: number; completed?: boolean; endedAt?: string },
  ): PlaybackHistoryEntry | null {
    return this.transaction(() => {
      const current = this.getRow('SELECT * FROM playback_history WHERE id = ?', id);
      if (!current) {
        return null;
      }

      const endedAt = input.endedAt ?? nowIso();
      const playedSeconds = Math.max(0, Number(input.playedSeconds) || 0);
      const durationSeconds = Number(current.duration_seconds ?? 0);
      const completed = input.completed ?? this.isPlaybackCompleted(playedSeconds, durationSeconds);
      const previousPlayedSeconds = Math.max(0, Number(current.played_seconds ?? 0) || 0);
      const wasCompleted = Number(current.completed ?? 0) === 1;
      const historyKey = playbackHistoryKey(textOrNull(current.track_id), String(current.track_path));

      this.run(
        `UPDATE playback_history SET
          ended_at = ?,
          played_seconds = ?,
          completed = ?
        WHERE id = ?`,
        endedAt,
        playedSeconds,
        completed ? 1 : 0,
        id,
      );

      this.run(
        `UPDATE playback_history_stats SET
          total_played_seconds = MAX(0, COALESCE(total_played_seconds, 0) + ?),
          completed_count = MAX(0, COALESCE(completed_count, 0) + ?),
          last_ended_at = ?,
          updated_at = ?
        WHERE history_key = ?`,
        playedSeconds - previousPlayedSeconds,
        (completed ? 1 : 0) - (wasCompleted ? 1 : 0),
        endedAt,
        endedAt,
        historyKey,
      );

      const trackId = textOrNull(current.track_id);
      if (completed && !wasCompleted && trackId) {
        this.recordTrackPlayback(trackId, endedAt);
      }

      return this.getPlaybackHistoryEntry(id);
    });
  }

  getPlaybackHistory(query?: PlaybackHistoryQuery): LibraryPage<PlaybackHistoryEntry> {
    const { page, pageSize, search, from, to, completedOnly } = pageFromHistoryQuery(query);
    const offset = (page - 1) * pageSize;
    const searchFilter = buildSearchFilter(search, [
      likePredicate('playback_history_stats.title'),
      likePredicate('playback_history_stats.artist'),
      likePredicate("COALESCE(playback_history_stats.album, '')"),
      likePredicate('playback_history_stats.track_path'),
    ]);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (searchFilter.sql) {
      clauses.push(searchFilter.sql);
      params.push(...searchFilter.params);
    }

    if (from) {
      clauses.push('playback_history_stats.last_started_at >= ?');
      params.push(from);
    }

    if (to) {
      clauses.push('playback_history_stats.last_started_at < ?');
      params.push(to);
    }

    if (completedOnly) {
      clauses.push('playback_history_stats.completed_count > 0');
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = this.getRow(
      `SELECT COUNT(*) AS total
       FROM playback_history_stats
       ${whereSql}`,
      ...params,
    );
    const rows = this.allRows(
      `SELECT
         history_key AS id,
         track_id,
         track_path,
         title,
         artist,
         album,
         album_artist,
         cover_id,
         last_started_at AS started_at,
         last_ended_at AS ended_at,
         total_played_seconds AS played_seconds,
         duration_seconds,
         play_count AS history_play_count,
         completed_count,
         source_type,
         source_label,
         queue_id
       FROM playback_history_stats
       ${whereSql}
       ORDER BY play_count DESC, last_started_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapPlaybackHistoryEntry(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  deletePlaybackHistoryEntry(id: string): void {
    this.transaction(() => {
      this.run('DELETE FROM playback_history WHERE COALESCE(track_id, track_path) = ?', id);
      this.run('DELETE FROM playback_history_stats WHERE history_key = ?', id);
    });
  }

  clearPlaybackHistory(): void {
    this.transaction(() => {
      this.run('DELETE FROM playback_history');
      this.run('DELETE FROM playback_history_stats');
    });
  }

  getPlaybackHistorySummary(now = new Date()): PlaybackHistorySummary {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const todayRow = this.getRow(
      `SELECT COUNT(*) AS count, COALESCE(SUM(played_seconds), 0) AS played_seconds
       FROM playback_history
       WHERE started_at >= ? AND started_at < ?`,
      startOfToday.toISOString(),
      endOfToday.toISOString(),
    );
    const totalRow = this.getRow('SELECT COUNT(*) AS total, MAX(started_at) AS latest FROM playback_history');

    return {
      todayCount: Number(todayRow?.count ?? 0),
      todayPlayedSeconds: Number(todayRow?.played_seconds ?? 0),
      totalCount: Number(totalRow?.total ?? 0),
      latestPlayedAt: textOrNull(totalRow?.latest),
    };
  }

  getTrack(trackId: string): LibraryTrack | null {
    const row = this.getRow(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
      FROM tracks
      WHERE tracks.id = ? AND tracks.missing = 0`,
      trackId,
    );

    return row ? this.mapTrack(row) : null;
  }

  getActiveTracks(): LibraryTrack[] {
    return this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
      FROM tracks
      WHERE tracks.missing = 0`,
    ).map((row) => this.mapTrack(row));
  }

  updateTrackTags(
    trackId: string,
    update: {
      title: string;
      artist: string;
      album: string;
      albumArtist: string;
      trackNo: number | null;
      discNo: number | null;
      year: number | null;
      genre: string | null;
      sizeBytes: number;
      mtimeMs: number;
      fieldSources: Record<string, string>;
    },
    timestamp = nowIso(),
  ): LibraryTrack {
    this.run(
      `UPDATE tracks SET
        size_bytes = ?,
        mtime_ms = ?,
        title = ?,
        artist = ?,
        album = ?,
        album_artist = ?,
        track_no = ?,
        disc_no = ?,
        year = ?,
        genre = ?,
        metadata_status = ?,
        field_sources_json = ?,
        updated_at = ?
      WHERE id = ? AND missing = 0`,
      update.sizeBytes,
      update.mtimeMs,
      update.title,
      update.artist,
      update.album,
      update.albumArtist,
      update.trackNo,
      update.discNo,
      update.year,
      update.genre,
      'ok',
      JSON.stringify(update.fieldSources),
      timestamp,
      trackId,
    );

    const updated = this.getTrack(trackId);
    if (!updated) {
      throw new Error(`Unknown track ${trackId}`);
    }

    return updated;
  }

  deleteTrack(trackId: string): void {
    this.run('DELETE FROM tracks WHERE id = ?', trackId);
  }

  deleteTracks(trackIds: string[]): number {
    let changed = 0;

    for (const trackId of trackIds) {
      changed += Number(this.run('DELETE FROM tracks WHERE id = ?', trackId).changes ?? 0);
    }

    return changed;
  }

  deleteAllTracks(): number {
    const changed = Number(this.run('DELETE FROM tracks').changes ?? 0);
    this.run('DELETE FROM artist_tracks');
    this.run('DELETE FROM artist_albums');
    this.run('DELETE FROM album_tracks');
    this.run('DELETE FROM albums');
    this.run('DELETE FROM artists');
    return changed;
  }

  deleteLibraryCache(): number {
    return this.transaction(() => {
      const changed = this.deleteAllTracks();
      this.run('DELETE FROM network_metadata_decisions');
      this.run('DELETE FROM network_metadata_candidates');
      this.run('DELETE FROM network_cover_candidates');
      this.run('DELETE FROM covers');
      this.run('DELETE FROM scan_jobs');
      return changed;
    });
  }

  refreshArtists(): void {
    this.transaction(() => {
      const timestamp = nowIso();
      const stats = new Map<string, ArtistIndexStats>();
      const trackLinks = new Map<string, { artistId: string; trackId: string; sourceName: string; position: number }>();
      const albumLinks = new Map<string, { artistId: string; albumId: string; sourceName: string }>();
      const ensureArtist = (name: string): ArtistIndexStats => {
        const key = artistKeyForName(name);
        const current = stats.get(key);

        if (current) {
          return current;
        }

        const next = {
          id: randomUUID(),
          key,
          name,
          trackIds: new Set<string>(),
          albumIds: new Set<string>(),
          coverId: null,
          coverScore: Number.MAX_SAFE_INTEGER,
        };
        stats.set(key, next);

        return next;
      };
      const linkAlbum = (artist: ArtistIndexStats, albumId: string | null, sourceName: string): void => {
        if (!albumId) {
          return;
        }

        artist.albumIds.add(albumId);
        albumLinks.set(`${artist.id}:${albumId}`, {
          artistId: artist.id,
          albumId,
          sourceName,
        });
      };
      const considerCover = (artist: ArtistIndexStats, albumId: string | null, coverId: string | null): void => {
        if (!albumId || !coverId) {
          return;
        }

        const score = stableArtistAlbumScore(artist.key, albumId);
        if (score < artist.coverScore) {
          artist.coverId = coverId;
          artist.coverScore = score;
        }
      };

      this.run('DELETE FROM artist_tracks');
      this.run('DELETE FROM artist_albums');
      this.run('DELETE FROM artists');

      const trackRows = this.allRows(
        `SELECT
          tracks.id AS track_id,
          tracks.artist AS artist,
          album_tracks.album_id AS album_id,
          albums.cover_id AS album_cover_id
        FROM tracks
        LEFT JOIN album_tracks ON album_tracks.track_id = tracks.id
        LEFT JOIN albums ON albums.id = album_tracks.album_id
        WHERE tracks.missing = 0
          AND tracks.artist IS NOT NULL
          AND TRIM(tracks.artist) != ''
        ORDER BY tracks.created_at ASC, tracks.id ASC`,
      );

      trackRows.forEach((row, position) => {
        const trackId = String(row.track_id);
        const sourceName = normalizeArtistDisplayName(row.artist);
        const albumId = textOrNull(row.album_id);
        const coverId = textOrNull(row.album_cover_id);

        for (const name of splitArtistNames(sourceName)) {
          const artist = ensureArtist(name);

          artist.trackIds.add(trackId);
          trackLinks.set(`${artist.id}:${trackId}`, {
            artistId: artist.id,
            trackId,
            sourceName,
            position,
          });
          linkAlbum(artist, albumId, sourceName);
          considerCover(artist, albumId, coverId);
        }
      });

      const albumRows = this.allRows(
        `SELECT id, album_artist, cover_id
         FROM albums
         WHERE album_artist IS NOT NULL AND TRIM(album_artist) != ''`,
      );

      for (const row of albumRows) {
        const albumId = String(row.id);
        const sourceName = normalizeArtistDisplayName(row.album_artist);
        const coverId = textOrNull(row.cover_id);

        for (const name of splitArtistNames(sourceName)) {
          const artist = ensureArtist(name);
          linkAlbum(artist, albumId, sourceName);
          considerCover(artist, albumId, coverId);
        }
      }

      for (const artist of stats.values()) {
        this.run(
          `INSERT OR REPLACE INTO artists (
            id, artist_key, name, sort_name, role, track_count, album_count, cover_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          artist.id,
          artist.key,
          artist.name,
          artist.key,
          'track',
          artist.trackIds.size,
          artist.albumIds.size,
          artist.coverId,
          timestamp,
          timestamp,
        );
      }

      for (const link of trackLinks.values()) {
        this.run(
          `INSERT OR IGNORE INTO artist_tracks (artist_id, track_id, source_name, position)
           VALUES (?, ?, ?, ?)`,
          link.artistId,
          link.trackId,
          link.sourceName,
          link.position,
        );
      }

      for (const link of albumLinks.values()) {
        this.run(
          `INSERT OR IGNORE INTO artist_albums (artist_id, album_id, source_name)
           VALUES (?, ?, ?)`,
          link.artistId,
          link.albumId,
          link.sourceName,
        );
      }
    });
  }

  refreshAlbums(
    albumService: AlbumService,
    now = nowIso(),
    options: { albumMergeStrategy?: AlbumMergeStrategy } = {},
  ): void {
    this.run('DELETE FROM album_tracks');
    this.run('DELETE FROM albums');

    const tracks = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.artist, tracks.album, tracks.album_artist,
        tracks.year, tracks.duration, tracks.cover_id, tracks.disc_no, tracks.track_no,
        tracks.field_sources_json, covers.source_hash AS cover_source_hash
       FROM tracks
       LEFT JOIN covers ON covers.id = tracks.cover_id
       WHERE tracks.missing = 0
       ORDER BY tracks.album_artist COLLATE NOCASE, tracks.album COLLATE NOCASE, tracks.disc_no, tracks.track_no, tracks.title COLLATE NOCASE`,
    );

    const albumIdsByKey = new Map<string, string>();
    const albumStats = new Map<
      string,
      {
        id: string;
        albumKey: string;
        title: string;
        albumArtist: string;
        year: number | null;
        trackCount: number;
        duration: number;
        coverId: string | null;
      }
    >();
    const albumTrackLinks: Array<{ albumId: string; trackId: string; discNo: number | null; trackNo: number | null; position: number }> = [];

    tracks.forEach((track, index) => {
      const trackId = String(track.id);
      const title = String(track.album || '');
      const albumArtist = String(track.album_artist || '');
      const year = numberOrNull(track.year);
      const fieldSources = parseJsonObject(track.field_sources_json);
      const albumKey = albumService.makeAlbumKey({
        albumTitle: title,
        albumArtist,
        fallbackArtist: String(track.artist || ''),
        albumArtistSource: fieldSources.albumArtist,
        year,
        filePath: String(track.path),
        trackId,
        coverId: textOrNull(track.cover_id),
        coverSourceHash: textOrNull(track.cover_source_hash),
        mergeStrategy: options.albumMergeStrategy ?? 'standard',
      });
      const albumId = albumIdsByKey.get(albumKey) ?? randomUUID();

      albumIdsByKey.set(albumKey, albumId);

      const stats =
        albumStats.get(albumKey) ??
        {
          id: albumId,
          albumKey,
          title: title || 'Unknown Album',
          albumArtist: albumArtist || String(track.artist || 'Unknown Artist'),
          year,
          trackCount: 0,
          duration: 0,
          coverId: textOrNull(track.cover_id),
        };

      stats.trackCount += 1;
      stats.duration += Number(track.duration ?? 0);
      stats.coverId = stats.coverId ?? textOrNull(track.cover_id);
      albumStats.set(albumKey, stats);

      albumTrackLinks.push({
        albumId,
        trackId,
        discNo: numberOrNull(track.disc_no),
        trackNo: numberOrNull(track.track_no),
        position: index,
      });
    });

    for (const album of albumStats.values()) {
      this.run(
        `INSERT INTO albums (
          id, album_key, title, album_artist, year, cover_id, track_count, duration, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        album.id,
        album.albumKey,
        album.title,
        album.albumArtist,
        album.year,
        album.coverId,
        album.trackCount,
        album.duration,
        now,
        now,
      );
    }

    for (const link of albumTrackLinks) {
      this.run(
        'INSERT INTO album_tracks (album_id, track_id, disc_no, track_no, position) VALUES (?, ?, ?, ?, ?)',
        link.albumId,
        link.trackId,
        link.discNo,
        link.trackNo,
        link.position,
      );
    }
  }

  getTracks(query?: LibraryPageQuery): LibraryPage<LibraryTrack> {
    const startedAt = performance.now();
    const { page, pageSize, search, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const searchFilter = buildSearchFilter(search, [
      likePredicate('tracks.title'),
      likePredicate('tracks.artist'),
      likePredicate('tracks.album'),
      likePredicate('tracks.album_artist'),
      likePredicate('COALESCE(tracks.genre, \'\')'),
      likePredicate('tracks.path'),
    ]);
    const whereSql = searchFilter.sql ? `WHERE tracks.missing = 0 AND ${searchFilter.sql}` : 'WHERE tracks.missing = 0';
    const orderSql = this.trackOrderSql(sort);
    const totalRow = this.getRow(`SELECT COUNT(*) AS total FROM tracks ${whereSql}`, ...searchFilter.params);
    const rows = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
      FROM tracks
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?`,
      ...searchFilter.params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    try {
      return {
        items: rows.map((row) => this.mapTrack(row)),
        page,
        pageSize,
        total,
        hasMore: offset + rows.length < total,
      };
    } finally {
      this.lastTracksQueryMs = performance.now() - startedAt;
    }
  }

  getAlbums(query?: LibraryPageQuery): LibraryPage<LibraryAlbum> {
    const startedAt = performance.now();
    const { page, pageSize, search, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const searchFilter = buildSearchFilter(search, [
      likePredicate('albums.title'),
      likePredicate('albums.album_artist'),
      likePredicate('COALESCE(CAST(albums.year AS TEXT), \'\')'),
      (term) => {
        const value = likeSearch(term);

        return {
          sql: `EXISTS (
            SELECT 1
            FROM album_tracks
            INNER JOIN tracks ON tracks.id = album_tracks.track_id
            WHERE album_tracks.album_id = albums.id
              AND tracks.missing = 0
              AND (
                tracks.title LIKE ? ESCAPE '\\'
                OR tracks.artist LIKE ? ESCAPE '\\'
                OR tracks.album_artist LIKE ? ESCAPE '\\'
                OR COALESCE(tracks.genre, '') LIKE ? ESCAPE '\\'
                OR tracks.path LIKE ? ESCAPE '\\'
              )
          )`,
          params: [value, value, value, value, value],
        };
      },
    ]);
    const whereSql = searchFilter.sql ? `WHERE ${searchFilter.sql}` : '';
    const orderSql = this.albumOrderSql(sort);
    const totalRow = this.getRow(`SELECT COUNT(*) AS total FROM albums ${whereSql}`, ...searchFilter.params);
    const rows = this.allRows(
      `SELECT
        albums.id, albums.album_key, albums.title, albums.album_artist, albums.year, albums.track_count,
        albums.duration, albums.cover_id
      FROM albums
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?`,
      ...searchFilter.params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    try {
      return {
        items: rows.map((row) => this.mapAlbum(row)),
        page,
        pageSize,
        total,
        hasMore: offset + rows.length < total,
      };
    } finally {
      this.lastAlbumsQueryMs = performance.now() - startedAt;
    }
  }

  getAlbum(albumId: string): LibraryAlbumDetail | null {
    const row = this.getRow(
      `SELECT
        albums.id, albums.album_key, albums.title, albums.album_artist, albums.year, albums.track_count,
        albums.duration, albums.cover_id
      FROM albums
      WHERE albums.id = ?`,
      albumId,
    );

    return row ? this.mapAlbumDetail(row) : null;
  }

  getArtists(query?: LibraryPageQuery): LibraryPage<LibraryArtist> {
    const { page, pageSize, search, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const searchFilter = buildSearchFilter(search, [
      likePredicate('artists.name'),
      likePredicate('COALESCE(artists.sort_name, \'\')'),
    ]);
    const whereSql = searchFilter.sql ? `WHERE ${searchFilter.sql}` : '';
    const orderSql = this.artistOrderSql(sort);
    const totalRow = this.getRow(`SELECT COUNT(*) AS total FROM artists ${whereSql}`, ...searchFilter.params);
    const rows = this.allRows(
      `SELECT id, name, sort_name, role, track_count, album_count, cover_id
       FROM artists
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      ...searchFilter.params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapArtist(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getArtist(artistId: string): LibraryArtist | null {
    const row = this.getRow(
      `SELECT id, name, sort_name, role, track_count, album_count, cover_id
       FROM artists
       WHERE id = ?`,
      artistId,
    );

    return row ? this.mapArtist(row) : null;
  }

  getArtistTracks(artistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'sort'>): LibraryPage<LibraryTrack> {
    const artist = this.getArtist(artistId);
    const { page, pageSize, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;

    if (!artist) {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        hasMore: false,
      };
    }

    const orderSql = this.artistTrackOrderSql(sort);
    const totalRow = this.getRow(
      `SELECT COUNT(*) AS total
       FROM artist_tracks
       INNER JOIN tracks ON tracks.id = artist_tracks.track_id
       WHERE artist_tracks.artist_id = ?
         AND tracks.missing = 0`,
      artist.id,
    );
    const rows = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
      FROM artist_tracks
      INNER JOIN tracks ON tracks.id = artist_tracks.track_id
      WHERE artist_tracks.artist_id = ?
        AND tracks.missing = 0
      ${orderSql}
      LIMIT ? OFFSET ?`,
      artist.id,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapTrack(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getArtistAlbums(artistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'sort'>): LibraryPage<LibraryAlbum> {
    const artist = this.getArtist(artistId);
    const { page, pageSize, sort } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;

    if (!artist) {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        hasMore: false,
      };
    }

    const orderSql = this.albumOrderSql(sort);
    const totalRow = this.getRow(
      `SELECT COUNT(*) AS total
       FROM artist_albums
       INNER JOIN albums ON albums.id = artist_albums.album_id
       WHERE artist_albums.artist_id = ?`,
      artist.id,
    );
    const rows = this.allRows(
      `SELECT
        albums.id, albums.album_key, albums.title, albums.album_artist, albums.year, albums.track_count,
        albums.duration, albums.cover_id
      FROM artist_albums
      INNER JOIN albums ON albums.id = artist_albums.album_id
      WHERE artist_albums.artist_id = ?
      ${orderSql}
      LIMIT ? OFFSET ?`,
      artist.id,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapAlbum(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getAlbumTracks(albumId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize'>): LibraryPage<LibraryTrack> {
    const { page, pageSize } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const totalRow = this.getRow('SELECT COUNT(*) AS total FROM album_tracks WHERE album_id = ?', albumId);
    const rows = this.allRows(
      `SELECT
        tracks.id, tracks.path, tracks.title, tracks.artist, tracks.album, tracks.album_artist,
        tracks.track_no, tracks.disc_no, tracks.year, tracks.genre,
        tracks.duration, tracks.codec, tracks.sample_rate, tracks.bit_depth, tracks.bitrate,
        tracks.cover_id, tracks.metadata_status, tracks.embedded_metadata_status, tracks.embedded_cover_status,
        tracks.network_metadata_status, tracks.field_sources_json
      FROM album_tracks
      INNER JOIN tracks ON tracks.id = album_tracks.track_id
      WHERE album_tracks.album_id = ? AND tracks.missing = 0
      ORDER BY album_tracks.position ASC
      LIMIT ? OFFSET ?`,
      albumId,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapTrack(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  getPlaylists(): LibraryPlaylist[] {
    return this.allRows(
      `SELECT *
       FROM playlists
       ORDER BY updated_at DESC, name COLLATE NOCASE`,
    ).map((row) => this.mapPlaylist(row));
  }

  createPlaylist(input: { name: string; description?: string | null }, timestamp = nowIso()): LibraryPlaylist {
    const id = randomUUID();
    const name = input.name.trim();
    const description = textOrNull(input.description?.trim());

    if (!name) {
      throw new Error('Playlist name is required');
    }

    this.run(
      `INSERT INTO playlists (
        id, name, description, kind, source_provider, source_playlist_id,
        cover_id, sort_mode, item_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      description,
      'manual',
      'local',
      null,
      null,
      'manual',
      0,
      timestamp,
      timestamp,
    );

    const playlist = this.getPlaylist(id);
    if (!playlist) {
      throw new Error(`Failed to create playlist ${id}`);
    }

    return playlist;
  }

  updatePlaylist(
    input: { playlistId: string; name?: string; description?: string | null; coverId?: string | null; sortMode?: string },
    timestamp = nowIso(),
  ): LibraryPlaylist {
    const current = this.getPlaylist(input.playlistId);
    if (!current) {
      throw new Error(`Unknown playlist ${input.playlistId}`);
    }

    const name = input.name === undefined ? current.name : input.name.trim();
    if (!name) {
      throw new Error('Playlist name is required');
    }

    const sortMode = input.sortMode ?? current.sortMode;
    if (!['manual', 'titleAsc', 'titleDesc', 'artistAsc', 'addedDesc'].includes(sortMode)) {
      throw new Error(`Unsupported playlist sort mode ${sortMode}`);
    }

    this.run(
      `UPDATE playlists SET
        name = ?,
        description = ?,
        cover_id = ?,
        sort_mode = ?,
        updated_at = ?
       WHERE id = ?`,
      name,
      input.description === undefined ? current.description : textOrNull(input.description?.trim()),
      input.coverId === undefined ? current.coverId : textOrNull(input.coverId),
      sortMode,
      timestamp,
      input.playlistId,
    );

    const updated = this.getPlaylist(input.playlistId);
    if (!updated) {
      throw new Error(`Unknown playlist ${input.playlistId}`);
    }

    return updated;
  }

  deletePlaylist(playlistId: string): void {
    this.run('DELETE FROM playlists WHERE id = ?', playlistId);
  }

  getPlaylist(playlistId: string): LibraryPlaylist | null {
    const row = this.getRow('SELECT * FROM playlists WHERE id = ?', playlistId);
    return row ? this.mapPlaylist(row) : null;
  }

  getPlaylistItems(playlistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search'>): LibraryPage<LibraryPlaylistItem> {
    const { page, pageSize, search } = pageFromQuery(query);
    const offset = (page - 1) * pageSize;
    const searchFilter = buildSearchFilter(search, [
      likePredicate('COALESCE(playlist_items.title_snapshot, tracks.title, \'\')'),
      likePredicate('COALESCE(playlist_items.artist_snapshot, tracks.artist, \'\')'),
      likePredicate('COALESCE(playlist_items.album_snapshot, tracks.album, \'\')'),
    ]);
    const whereSql = searchFilter.sql ? `playlist_items.playlist_id = ? AND ${searchFilter.sql}` : 'playlist_items.playlist_id = ?';
    const params = [playlistId, ...searchFilter.params];
    const totalRow = this.getRow(
      `SELECT COUNT(*) AS total
       FROM playlist_items
       LEFT JOIN tracks ON tracks.id = playlist_items.media_id
       WHERE ${whereSql}`,
      ...params,
    );
    const rows = this.allRows(
      `SELECT
        playlist_items.*,
        tracks.id AS track_id,
        tracks.path AS track_path,
        tracks.title AS track_title,
        tracks.artist AS track_artist,
        tracks.album AS track_album,
        tracks.album_artist AS track_album_artist,
        tracks.track_no AS track_track_no,
        tracks.disc_no AS track_disc_no,
        tracks.year AS track_year,
        tracks.genre AS track_genre,
        tracks.duration AS track_duration,
        tracks.codec AS track_codec,
        tracks.sample_rate AS track_sample_rate,
        tracks.bit_depth AS track_bit_depth,
        tracks.bitrate AS track_bitrate,
        tracks.cover_id AS track_cover_id,
        tracks.metadata_status AS track_metadata_status,
        tracks.embedded_metadata_status AS track_embedded_metadata_status,
        tracks.embedded_cover_status AS track_embedded_cover_status,
        tracks.network_metadata_status AS track_network_metadata_status,
        tracks.field_sources_json AS track_field_sources_json,
        tracks.missing AS track_missing
      FROM playlist_items
      LEFT JOIN tracks ON tracks.id = playlist_items.media_id
      WHERE ${whereSql}
      ORDER BY playlist_items.position ASC, playlist_items.added_at ASC
      LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.mapPlaylistItem(row)),
      page,
      pageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  addTrackToPlaylist(playlistId: string, trackId: string, timestamp = nowIso()): LibraryPlaylistItem {
    const [item] = this.addTracksToPlaylist(playlistId, [trackId], timestamp);
    if (!item) {
      throw new Error(`Failed to add track ${trackId} to playlist ${playlistId}`);
    }

    return item;
  }

  addTracksToPlaylist(playlistId: string, trackIds: string[], timestamp = nowIso()): LibraryPlaylistItem[] {
    return this.transaction(() => {
      const playlist = this.getPlaylist(playlistId);
      if (!playlist) {
        throw new Error(`Unknown playlist ${playlistId}`);
      }

      const items: LibraryPlaylistItem[] = [];
      let nextPosition = Number(this.getRow('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM playlist_items WHERE playlist_id = ?', playlistId)?.next_position ?? 0);

      for (const trackId of trackIds) {
        const track = this.getTrack(trackId);
        if (!track) {
          throw new Error(`Unknown track ${trackId}`);
        }

        const itemId = randomUUID();
        this.run(
          `INSERT INTO playlist_items (
            id, playlist_id, media_type, media_id, source_provider, source_item_id,
            title_snapshot, artist_snapshot, album_snapshot, duration_snapshot,
            cover_id, position, added_at, added_from, unavailable
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          itemId,
          playlistId,
          'track',
          track.id,
          'local',
          null,
          track.title,
          track.artist,
          track.album,
          track.duration,
          track.coverId,
          nextPosition,
          timestamp,
          'library',
          0,
        );
        nextPosition += 1;

        const itemRow = this.getPlaylistItemRow(itemId);
        const item = itemRow ? this.mapPlaylistItem(itemRow) : null;
        if (item) {
          items.push(item);
        }
      }

      this.refreshPlaylistItemCount(playlistId, timestamp);
      return items;
    });
  }

  removePlaylistItem(itemId: string): void {
    this.transaction(() => {
      const row = this.getRow('SELECT playlist_id FROM playlist_items WHERE id = ?', itemId);
      if (!row) {
        return;
      }

      const playlistId = String(row.playlist_id);
      this.run('DELETE FROM playlist_items WHERE id = ?', itemId);
      this.resequencePlaylistItems(playlistId);
      this.refreshPlaylistItemCount(playlistId);
    });
  }

  movePlaylistItem(playlistId: string, itemId: string, targetPosition: number): void {
    this.transaction(() => {
      const rows = this.allRows('SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, added_at ASC', playlistId);
      const fromIndex = rows.findIndex((row) => row.id === itemId);
      if (fromIndex < 0) {
        throw new Error(`Unknown playlist item ${itemId}`);
      }

      const next = [...rows];
      const [moved] = next.splice(fromIndex, 1);
      const insertIndex = Math.max(0, Math.min(Math.floor(targetPosition), next.length));
      next.splice(insertIndex, 0, moved);
      next.forEach((row, index) => {
        this.run('UPDATE playlist_items SET position = ? WHERE id = ?', index, row.id);
      });
      this.run('UPDATE playlists SET updated_at = ? WHERE id = ?', nowIso(), playlistId);
    });
  }

  clearPlaylist(playlistId: string): void {
    this.transaction(() => {
      this.run('DELETE FROM playlist_items WHERE playlist_id = ?', playlistId);
      this.refreshPlaylistItemCount(playlistId);
    });
  }

  getSummary(): LibrarySummary {
    const songCount = Number(this.getRow('SELECT COUNT(*) AS total FROM tracks WHERE missing = 0')?.total ?? 0);
    const albumCount = Number(this.getRow('SELECT COUNT(*) AS total FROM albums')?.total ?? 0);
    const artistCount = Number(this.getRow('SELECT COUNT(*) AS total FROM artists')?.total ?? 0);
    const folderCount = Number(
      this.getRow("SELECT COUNT(*) AS total FROM folders WHERE enabled = 1 AND status != 'removed'")?.total ?? 0,
    );
    const duration = Number(this.getRow('SELECT COALESCE(SUM(duration), 0) AS total FROM tracks WHERE missing = 0')?.total ?? 0);
    const scanRow = this.getRow("SELECT finished_at FROM scan_jobs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1");

    return {
      songCount,
      albumCount,
      artistCount,
      folderCount,
      totalDuration: duration,
      lastScanAt: textOrNull(scanRow?.finished_at),
    };
  }

  getDiagnostics(paths: {
    databasePath: string | null;
    databaseSizeBytes: number | null;
    coverCachePath: string | null;
    coverCacheSizeBytes: number | null;
    cpuCount: number;
    scanPerformanceMode: LibraryDiagnostics['scanPerformanceMode'];
    metadataConcurrency: number;
    coverConcurrency: number;
  }): LibraryDiagnostics {
    const lastScanRow = this.getRow(
      `SELECT status, phase, discovered_count, parsed_count, skipped_count, cover_count, error_count, started_at, finished_at
       FROM scan_jobs
       ORDER BY COALESCE(finished_at, started_at, updated_at) DESC
       LIMIT 1`,
    );

    return {
      foldersCount: Number(
        this.getRow("SELECT COUNT(*) AS total FROM folders WHERE enabled = 1 AND status != 'removed'")?.total ?? 0,
      ),
      tracksCount: Number(this.getRow('SELECT COUNT(*) AS total FROM tracks WHERE missing = 0')?.total ?? 0),
      albumsCount: Number(this.getRow('SELECT COUNT(*) AS total FROM albums')?.total ?? 0),
      artistsCount: Number(this.getRow('SELECT COUNT(*) AS total FROM artists')?.total ?? 0),
      coversCount: Number(this.getRow('SELECT COUNT(*) AS total FROM covers')?.total ?? 0),
      lastScan: lastScanRow
        ? {
            status: this.mapScanStatus(lastScanRow.status),
            phase: this.mapScanPhase(lastScanRow.phase),
            discoveredCount: Number(lastScanRow.discovered_count ?? 0),
            parsedCount: Number(lastScanRow.parsed_count ?? 0),
            skippedCount: Number(lastScanRow.skipped_count ?? 0),
            coverCount: Number(lastScanRow.cover_count ?? 0),
            errorCount: Number(lastScanRow.error_count ?? 0),
            startedAt: textOrNull(lastScanRow.started_at),
            finishedAt: textOrNull(lastScanRow.finished_at),
          }
        : null,
      lastQueryMs: {
        getTracks: this.lastTracksQueryMs,
        getAlbums: this.lastAlbumsQueryMs,
      },
      averageAlbumPayloadBytes: this.getAverageAlbumPayloadBytes(),
      coverCacheVersion: currentCoverCacheVersion,
      ...paths,
    };
  }

  private requireFolder(folderId: string): LibraryFolder {
    const folder = this.getFolder(folderId);

    if (!folder) {
      throw new Error(`Unknown library folder ${folderId}`);
    }

    return folder;
  }

  private resolveFolderScopedPath(folder: LibraryFolder, requestedPath?: string): string {
    const rootPath = stripTrailingPathSeparators(folder.path);
    const targetPath = stripTrailingPathSeparators(requestedPath?.trim() || rootPath);

    if (!isPathInsideOrEqual(rootPath, targetPath)) {
      throw new Error(`Folder path is outside the library root: ${targetPath}`);
    }

    return targetPath;
  }

  private folderTrackScope(
    folderId: string,
    folderPath: string,
    recursive: boolean,
  ): { sql: string; params: unknown[] } {
    const prefix = `${stripTrailingPathSeparators(folderPath)}${preferredPathSeparator}`;
    const prefixLike = likePrefix(prefix);

    if (recursive) {
      return {
        sql: "tracks.folder_id = ? AND tracks.missing = 0 AND tracks.path LIKE ? ESCAPE '\\'",
        params: [folderId, prefixLike],
      };
    }

    return {
      sql: `tracks.folder_id = ?
        AND tracks.missing = 0
        AND tracks.path LIKE ? ESCAPE '\\'
        AND INSTR(SUBSTR(tracks.path, ?), ?) = 0
        AND INSTR(SUBSTR(tracks.path, ?), ?) = 0`,
      params: [folderId, prefixLike, prefix.length + 1, '\\', prefix.length + 1, '/'],
    };
  }

  private getFolderCoverThumbs(folderId: string, folderPath: string, recursive: boolean): string[] {
    const scope = this.folderTrackScope(folderId, folderPath, recursive);
    return this.allRows(
      `SELECT DISTINCT tracks.cover_id
       FROM tracks
       WHERE ${scope.sql} AND tracks.cover_id IS NOT NULL
       ORDER BY tracks.updated_at DESC
       LIMIT 4`,
      ...scope.params,
    )
      .map((row) => this.toCoverUrl(row.cover_id, 'thumb'))
      .filter((value): value is string => Boolean(value));
  }

  private getDirectChildFolderCount(folderId: string, folderPath: string): number {
    const prefix = `${stripTrailingPathSeparators(folderPath)}${preferredPathSeparator}`;
    const childNames = new Set<string>();
    const rows = this.allRows(
      `SELECT path
       FROM tracks
       WHERE folder_id = ? AND missing = 0 AND path LIKE ? ESCAPE '\\'`,
      folderId,
      likePrefix(prefix),
    );

    for (const row of rows) {
      const parts = String(row.path).slice(prefix.length).split(pathSeparatorPattern).filter(Boolean);
      if (parts.length > 1) {
        childNames.add(parts[0]);
      }
    }

    return childNames.size;
  }

  private refreshPlaylistItemCount(playlistId: string, timestamp = nowIso()): void {
    this.run(
      `UPDATE playlists SET
        item_count = (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ?),
        updated_at = ?
       WHERE id = ?`,
      playlistId,
      timestamp,
      playlistId,
    );
  }

  private resequencePlaylistItems(playlistId: string): void {
    const rows = this.allRows('SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, added_at ASC', playlistId);
    rows.forEach((row, index) => {
      this.run('UPDATE playlist_items SET position = ? WHERE id = ?', index, row.id);
    });
  }

  private getPlaylistItemRow(itemId: string): DbRow | null {
    return this.getRow(
      `SELECT
        playlist_items.*,
        tracks.id AS track_id,
        tracks.path AS track_path,
        tracks.title AS track_title,
        tracks.artist AS track_artist,
        tracks.album AS track_album,
        tracks.album_artist AS track_album_artist,
        tracks.track_no AS track_track_no,
        tracks.disc_no AS track_disc_no,
        tracks.year AS track_year,
        tracks.genre AS track_genre,
        tracks.duration AS track_duration,
        tracks.codec AS track_codec,
        tracks.sample_rate AS track_sample_rate,
        tracks.bit_depth AS track_bit_depth,
        tracks.bitrate AS track_bitrate,
        tracks.cover_id AS track_cover_id,
        tracks.metadata_status AS track_metadata_status,
        tracks.embedded_metadata_status AS track_embedded_metadata_status,
        tracks.embedded_cover_status AS track_embedded_cover_status,
        tracks.network_metadata_status AS track_network_metadata_status,
        tracks.field_sources_json AS track_field_sources_json,
        tracks.missing AS track_missing
      FROM playlist_items
      LEFT JOIN tracks ON tracks.id = playlist_items.media_id
      WHERE playlist_items.id = ?`,
      itemId,
    );
  }

  private mapPlaylist(row: DbRow): LibraryPlaylist {
    const coverId = textOrNull(row.cover_id);

    return {
      id: String(row.id),
      name: String(row.name),
      description: textOrNull(row.description),
      kind: this.mapPlaylistKind(row.kind),
      sourceProvider: this.mapPlaylistSourceProvider(row.source_provider),
      sourcePlaylistId: textOrNull(row.source_playlist_id),
      coverId,
      coverThumb: coverId ? this.toCoverUrl(coverId, 'album') : null,
      sortMode: this.mapPlaylistSortMode(row.sort_mode),
      itemCount: Number(row.item_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapPlaylistItem(row: DbRow): LibraryPlaylistItem {
    const coverId = textOrNull(row.cover_id) ?? textOrNull(row.track_cover_id);
    const trackMissing = Number(row.track_missing ?? 1) !== 0;
    const hasTrack = textOrNull(row.track_id) !== null && !trackMissing;
    const unavailable = Number(row.unavailable ?? 0) !== 0 || (row.media_type === 'track' && (!hasTrack || !textOrNull(row.media_id)));

    return {
      id: String(row.id),
      playlistId: String(row.playlist_id),
      mediaType: this.mapPlaylistMediaType(row.media_type),
      mediaId: textOrNull(row.media_id),
      sourceProvider: this.mapPlaylistSourceProvider(row.source_provider),
      sourceItemId: textOrNull(row.source_item_id),
      titleSnapshot: textOrNull(row.title_snapshot),
      artistSnapshot: textOrNull(row.artist_snapshot),
      albumSnapshot: textOrNull(row.album_snapshot),
      durationSnapshot: numberOrNull(row.duration_snapshot),
      coverId,
      coverThumb: coverId ? this.toCoverUrl(coverId, 'thumb') : null,
      position: Number(row.position ?? 0),
      addedAt: String(row.added_at),
      addedFrom: textOrNull(row.added_from),
      unavailable,
      track: hasTrack
        ? this.mapTrack({
            id: row.track_id,
            path: row.track_path,
            title: row.track_title,
            artist: row.track_artist,
            album: row.track_album,
            album_artist: row.track_album_artist,
            track_no: row.track_track_no,
            disc_no: row.track_disc_no,
            year: row.track_year,
            genre: row.track_genre,
            duration: row.track_duration,
            codec: row.track_codec,
            sample_rate: row.track_sample_rate,
            bit_depth: row.track_bit_depth,
            bitrate: row.track_bitrate,
            cover_id: row.track_cover_id,
            metadata_status: row.track_metadata_status,
            embedded_metadata_status: row.track_embedded_metadata_status,
            embedded_cover_status: row.track_embedded_cover_status,
            network_metadata_status: row.track_network_metadata_status,
            field_sources_json: row.track_field_sources_json,
          })
        : null,
    };
  }

  private mapPlaylistKind(value: unknown): LibraryPlaylist['kind'] {
    return value === 'smart' || value === 'synced' || value === 'system' ? value : 'manual';
  }

  private mapPlaylistSourceProvider(value: unknown): LibraryPlaylist['sourceProvider'] {
    return value === 'netease' || value === 'qqmusic' || value === 'remote' ? value : 'local';
  }

  private mapPlaylistSortMode(value: unknown): LibraryPlaylist['sortMode'] {
    return value === 'titleAsc' || value === 'titleDesc' || value === 'artistAsc' || value === 'addedDesc' ? value : 'manual';
  }

  private mapPlaylistMediaType(value: unknown): LibraryPlaylistItem['mediaType'] {
    return value === 'stream_track' || value === 'remote_file' ? value : 'track';
  }

  private getAverageAlbumPayloadBytes(): number | null {
    const row = this.getRow(
      `SELECT AVG(
        160
        + LENGTH(id)
        + LENGTH(album_key)
        + LENGTH(title)
        + LENGTH(album_artist)
        + COALESCE(LENGTH(CAST(year AS TEXT)), 4)
        + LENGTH(CAST(track_count AS TEXT))
        + LENGTH(CAST(duration AS TEXT))
        + COALESCE(LENGTH(cover_id), 4)
        + CASE WHEN cover_id IS NULL THEN 4 ELSE LENGTH('echo-cover://album/') + LENGTH(cover_id) END
      ) AS average_bytes
      FROM albums`,
    );
    const value = Number(row?.average_bytes ?? 0);

    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private getPlaybackHistoryEntry(id: string): PlaybackHistoryEntry | null {
    const row = this.getRow('SELECT * FROM playback_history WHERE id = ?', id);
    return row ? this.mapPlaybackHistoryEntry(row) : null;
  }

  private isPlaybackCompleted(playedSeconds: number, durationSeconds: number): boolean {
    if (durationSeconds <= 0) {
      return playedSeconds >= 30;
    }

    return playedSeconds >= 30 || playedSeconds >= durationSeconds * 0.5;
  }

  private trackOrderSql(sort: string): string {
    switch (sort) {
      case 'artist':
        return 'ORDER BY tracks.artist COLLATE NOCASE, tracks.title COLLATE NOCASE';
      case 'album':
        return 'ORDER BY tracks.album COLLATE NOCASE, tracks.title COLLATE NOCASE';
      case 'recent':
        return 'ORDER BY tracks.updated_at DESC, tracks.title COLLATE NOCASE';
      case 'createdAsc':
        return 'ORDER BY tracks.created_at ASC, tracks.title COLLATE NOCASE';
      case 'createdDesc':
        return 'ORDER BY tracks.created_at DESC, tracks.title COLLATE NOCASE';
      case 'titleDesc':
        return 'ORDER BY tracks.title COLLATE NOCASE DESC, tracks.artist COLLATE NOCASE';
      case 'durationAsc':
        return 'ORDER BY tracks.duration ASC, tracks.title COLLATE NOCASE';
      case 'durationDesc':
        return 'ORDER BY tracks.duration DESC, tracks.title COLLATE NOCASE';
      case 'qualityAsc':
        return 'ORDER BY COALESCE(tracks.bitrate, 0) ASC, tracks.size_bytes ASC, tracks.title COLLATE NOCASE';
      case 'qualityDesc':
        return 'ORDER BY COALESCE(tracks.bitrate, 0) DESC, tracks.size_bytes DESC, tracks.title COLLATE NOCASE';
      case 'frequent':
        return 'ORDER BY COALESCE(tracks.play_count, 0) DESC, tracks.last_played_at DESC, tracks.title COLLATE NOCASE';
      case 'random':
        return 'ORDER BY RANDOM()';
      case 'titleAsc':
      case 'default':
      case 'title':
      default:
        return 'ORDER BY tracks.title COLLATE NOCASE, tracks.artist COLLATE NOCASE';
    }
  }

  private artistTrackOrderSql(sort: string): string {
    switch (sort) {
      case 'recent':
        return 'ORDER BY COALESCE(tracks.last_played_at, tracks.updated_at) DESC, tracks.title COLLATE NOCASE';
      case 'frequent':
        return 'ORDER BY COALESCE(tracks.play_count, 0) DESC, tracks.last_played_at DESC, tracks.title COLLATE NOCASE';
      case 'titleAsc':
      case 'title':
        return 'ORDER BY tracks.title COLLATE NOCASE, tracks.album COLLATE NOCASE';
      case 'titleDesc':
        return 'ORDER BY tracks.title COLLATE NOCASE DESC, tracks.album COLLATE NOCASE';
      case 'durationAsc':
        return 'ORDER BY tracks.duration ASC, tracks.title COLLATE NOCASE';
      case 'durationDesc':
        return 'ORDER BY tracks.duration DESC, tracks.title COLLATE NOCASE';
      case 'random':
        return 'ORDER BY RANDOM()';
      case 'default':
      default:
        return 'ORDER BY tracks.album COLLATE NOCASE, COALESCE(tracks.disc_no, 0), COALESCE(tracks.track_no, 0), tracks.title COLLATE NOCASE';
    }
  }

  private albumOrderSql(sort: string): string {
    switch (sort) {
      case 'artist':
        return 'ORDER BY albums.album_artist COLLATE NOCASE, albums.title COLLATE NOCASE';
      case 'recent':
      case 'createdDesc':
        return 'ORDER BY albums.updated_at DESC, albums.title COLLATE NOCASE';
      case 'createdAsc':
        return 'ORDER BY albums.created_at ASC, albums.title COLLATE NOCASE';
      case 'titleDesc':
        return 'ORDER BY albums.title COLLATE NOCASE DESC, albums.album_artist COLLATE NOCASE';
      case 'durationAsc':
        return 'ORDER BY albums.duration ASC, albums.title COLLATE NOCASE';
      case 'durationDesc':
        return 'ORDER BY albums.duration DESC, albums.title COLLATE NOCASE';
      case 'random':
        return 'ORDER BY RANDOM()';
      case 'album':
      case 'titleAsc':
      case 'default':
      case 'title':
      default:
        return 'ORDER BY albums.title COLLATE NOCASE, albums.album_artist COLLATE NOCASE';
    }
  }

  private artistOrderSql(sort: string): string {
    switch (sort) {
      case 'frequent':
        return 'ORDER BY artists.track_count DESC, artists.album_count DESC, artists.name COLLATE NOCASE';
      case 'createdDesc':
      case 'recent':
        return 'ORDER BY artists.updated_at DESC, artists.name COLLATE NOCASE';
      case 'createdAsc':
        return 'ORDER BY artists.created_at ASC, artists.name COLLATE NOCASE';
      case 'titleDesc':
        return 'ORDER BY artists.name COLLATE NOCASE DESC';
      case 'random':
        return 'ORDER BY RANDOM()';
      case 'artist':
      case 'titleAsc':
      case 'default':
      case 'title':
      default:
        return 'ORDER BY artists.sort_name COLLATE NOCASE, artists.name COLLATE NOCASE';
    }
  }

  private mapFolder(row: DbRow): LibraryFolder {
    return {
      id: String(row.id),
      path: String(row.path),
      name: String(row.name),
      status: Number(row.enabled ?? 1) === 0 || row.status === 'removed' ? 'removed' : 'active',
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapPlaybackHistoryEntry(row: DbRow): PlaybackHistoryEntry {
    const coverId = textOrNull(row.cover_id);

    return {
      id: String(row.id),
      trackId: textOrNull(row.track_id),
      trackPath: String(row.track_path),
      title: String(row.title),
      artist: String(row.artist),
      album: String(row.album ?? ''),
      albumArtist: String(row.album_artist ?? ''),
      coverId,
      coverThumb: coverId ? this.toCoverUrl(coverId, 'thumb') : null,
      startedAt: String(row.started_at),
      endedAt: textOrNull(row.ended_at),
      playedSeconds: Number(row.history_played_seconds_total ?? row.played_seconds ?? 0),
      durationSeconds: Number(row.duration_seconds ?? 0),
      playCount: Number(row.history_play_count ?? 1),
      completed: Number(row.completed_count ?? row.completed ?? 0) > 0,
      sourceType: textOrNull(row.source_type),
      sourceLabel: textOrNull(row.source_label),
      queueId: textOrNull(row.queue_id),
    };
  }

  private mapScanJob(row: DbRow): LibraryScanStatus {
    return {
      id: String(row.id),
      folderId: String(row.folder_id),
      status: this.mapScanStatus(row.status),
      phase: this.mapScanPhase(row.phase),
      totalFiles: Number(row.discovered_count ?? row.total_files ?? 0),
      processedFiles: Number(row.parsed_count ?? row.processed_files ?? 0),
      skippedFiles: Number(row.skipped_count ?? row.skipped_files ?? 0),
      addedTracks: Number(row.added_tracks ?? 0),
      updatedTracks: Number(row.updated_tracks ?? 0),
      removedTracks: Number(row.removed_tracks ?? 0),
      coverCount: Number(row.cover_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      errors: parseErrors(row.errors_json),
      startedAt: textOrNull(row.started_at),
      finishedAt: textOrNull(row.finished_at),
    };
  }

  private mapScanStatus(value: unknown): LibraryScanStatus['status'] {
    if (
      value === 'queued' ||
      value === 'running' ||
      value === 'completed' ||
      value === 'cancelled' ||
      value === 'failed'
    ) {
      return value;
    }

    return 'failed';
  }

  private mapScanPhase(value: unknown): LibraryScanStatus['phase'] {
    if (
      value === 'queued' ||
      value === 'discovering' ||
      value === 'checking_cache' ||
      value === 'reading_metadata' ||
      value === 'extracting_covers' ||
      value === 'grouping_albums' ||
      value === 'writing_database' ||
      value === 'finished' ||
      value === 'failed' ||
      value === 'cancelled'
    ) {
      return value;
    }

    return 'queued';
  }

  private mapTrack(row: DbRow): LibraryTrack {
    return {
      id: String(row.id),
      path: String(row.path),
      title: String(row.title),
      artist: String(row.artist),
      album: String(row.album),
      albumArtist: String(row.album_artist),
      trackNo: numberOrNull(row.track_no),
      discNo: numberOrNull(row.disc_no),
      year: numberOrNull(row.year),
      genre: textOrNull(row.genre),
      duration: Number(row.duration ?? 0),
      codec: textOrNull(row.codec),
      sampleRate: numberOrNull(row.sample_rate),
      bitDepth: numberOrNull(row.bit_depth),
      bitrate: numberOrNull(row.bitrate),
      coverId: textOrNull(row.cover_id),
      coverThumb: this.toCoverUrl(row.cover_id, 'thumb'),
      metadataStatus: textOrNull(row.metadata_status) ?? 'ok',
      embeddedMetadataStatus: this.mapEmbeddedStatus(row.embedded_metadata_status),
      embeddedCoverStatus: this.mapEmbeddedStatus(row.embedded_cover_status),
      networkMetadataStatus: this.mapNetworkStatus(row.network_metadata_status),
      fieldSources: parseJsonObject(row.field_sources_json),
    };
  }

  private mapArtist(row: DbRow): LibraryArtist {
    const trackCount = Number(row.track_count ?? 0);
    const albumCount = Number(row.album_count ?? 0);

    return {
      id: String(row.id),
      name: String(row.name),
      sortName: String(row.sort_name ?? row.name),
      role: trackCount > 0 && albumCount > 0 ? 'both' : albumCount > 0 ? 'album' : 'track',
      trackCount,
      albumCount,
      coverId: textOrNull(row.cover_id),
      coverThumb: this.toCoverUrl(row.cover_id, 'album'),
    };
  }

  private mapEmbeddedStatus(value: unknown): LibraryTrack['embeddedMetadataStatus'] {
    if (value === 'pending' || value === 'reading' || value === 'present' || value === 'missing' || value === 'error') {
      return value;
    }

    return 'pending';
  }

  private mapNetworkStatus(value: unknown): LibraryTrack['networkMetadataStatus'] {
    if (
      value === 'none' ||
      value === 'pending' ||
      value === 'candidate_found' ||
      value === 'applied_missing_only' ||
      value === 'rejected' ||
      value === 'error'
    ) {
      return value;
    }

    return 'none';
  }

  private mapAlbum(row: DbRow): LibraryAlbum {
    return {
      id: String(row.id),
      albumKey: String(row.album_key),
      title: String(row.title),
      albumArtist: String(row.album_artist),
      year: numberOrNull(row.year),
      trackCount: Number(row.track_count ?? 0),
      duration: Number(row.duration ?? 0),
      coverId: textOrNull(row.cover_id),
      coverThumb: this.toCoverUrl(row.cover_id, 'album'),
    };
  }

  private mapAlbumDetail(row: DbRow): LibraryAlbumDetail {
    const album = this.mapAlbum(row);

    return {
      ...album,
      coverLarge: this.toCoverUrl(row.cover_id, 'large'),
    };
  }

  resolveCoverAsset(coverId: string, variant: CoverVariant): { filePath: string; mimeType: string | null } | null {
    const row = this.getRow(
      `SELECT mime_type, thumb_path, album_path, large_path, original_ref
       FROM covers
       WHERE id = ?`,
      coverId,
    );

    if (!row) {
      return null;
    }

    const thumbPath = textOrNull(row.thumb_path);
    const albumPath = textOrNull(row.album_path);
    const largePath = textOrNull(row.large_path);
    const candidates =
      variant === 'thumb'
        ? [thumbPath, albumPath, largePath]
        : variant === 'album'
          ? [albumPath, thumbPath, largePath]
          : [largePath, albumPath, thumbPath];
    const filePath = candidates.find((candidate): candidate is string => Boolean(candidate)) ?? null;

    return filePath
      ? {
          filePath,
          mimeType: this.mimeTypeForCoverPath(filePath, textOrNull(row.mime_type)),
        }
      : null;
  }

  private toCoverUrl(value: unknown, variant: CoverVariant): string | null {
    const coverId = textOrNull(value);

    return coverId ? `echo-cover://${variant}/${encodeURIComponent(coverId)}` : null;
  }

  private mimeTypeForCoverPath(filePath: string, fallback: string | null): string | null {
    const lowerPath = filePath.toLocaleLowerCase();

    if (lowerPath.endsWith('.webp')) {
      return 'image/webp';
    }

    if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
      return 'image/jpeg';
    }

    if (lowerPath.endsWith('.png')) {
      return 'image/png';
    }

    if (lowerPath.endsWith('.svg')) {
      return 'image/svg+xml';
    }

    return fallback;
  }

  private getRow(sql: string, ...params: unknown[]): DbRow | null {
    return this.database.prepare<unknown[], DbRow>(sql).get(...params) ?? null;
  }

  private allRows(sql: string, ...params: unknown[]): DbRow[] {
    return this.database.prepare<unknown[], DbRow>(sql).all(...params);
  }

  private run(sql: string, ...params: unknown[]): { changes: number } {
    return this.database.prepare(sql).run(...params);
  }
}
