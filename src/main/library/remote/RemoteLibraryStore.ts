import { randomUUID } from 'node:crypto';
import type { EchoDatabase } from '../../database/createDatabase';
import type { LibraryTrack } from '../../../shared/types/library';
import type {
  RemoteBackgroundJobKind,
  RemoteLibraryTrack,
  RemoteSource,
  RemoteSourceAuthType,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceStatus,
  RemoteSourceSyncMode,
  RemoteSourceUpdate,
} from '../../../shared/types/remoteSources';
import type { RemoteSourceSecret, RemoteTrackWrite } from './remoteTypes';
import { RemoteSourceSecretStore } from './RemoteSourceSecretStore';
import { buildTrackSearchTerms } from '../SearchIndexTokens';

type DbRow = Record<string, unknown>;

const nowIso = (): string => new Date().toISOString();
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const providerOrWebdav = (value: unknown): RemoteSourceProvider =>
  value === 'jellyfin' || value === 'emby' || value === 'smb' || value === 'sshfs' || value === 'subsonic' ? value : 'webdav';

const statusOrEnabled = (value: unknown): RemoteSourceStatus =>
  value === 'disabled' || value === 'error' ? value : 'enabled';

const authTypeOrBasic = (value: unknown): RemoteSourceAuthType =>
  value === 'none' || value === 'token' || value === 'apiKey' ? value : 'basic';

const syncModeOrIndex = (value: unknown): RemoteSourceSyncMode =>
  value === 'browse' || value === 'mirror' ? value : 'index';

const remoteTrackStatusOrPending = (value: unknown) =>
  value === 'searching' || value === 'partial' || value === 'ok' || value === 'not_found' || value === 'error' ? value : 'pending';

export class RemoteLibraryStore {
  constructor(
    private readonly database: EchoDatabase,
    private readonly secretStore = new RemoteSourceSecretStore(),
  ) {}

  listSources(): RemoteSource[] {
    return this.database
      .prepare<[], DbRow>(
        `SELECT remote_sources.*,
          (SELECT COUNT(*) FROM remote_tracks WHERE remote_tracks.source_id = remote_sources.id AND availability != 'missing') AS indexed_track_count
         FROM remote_sources
         ORDER BY created_at DESC`,
      )
      .all()
      .map((row) => this.mapSource(row));
  }

  getSource(id: string): RemoteSource | null {
    const row = this.database
      .prepare<[string], DbRow>(
        `SELECT remote_sources.*,
          (SELECT COUNT(*) FROM remote_tracks WHERE remote_tracks.source_id = remote_sources.id AND availability != 'missing') AS indexed_track_count
         FROM remote_sources
         WHERE id = ?`,
      )
      .get(id);

    return row ? this.mapSource(row) : null;
  }

  getSourceWithSecret(id: string): RemoteSourceSecret | null {
    const row = this.database.prepare<[string], DbRow>('SELECT * FROM remote_sources WHERE id = ?').get(id);
    if (!row) {
      return null;
    }

    return {
      ...this.mapSource({ ...row, indexed_track_count: 0 }),
      secret: this.secretStore.decrypt(textOrNull(row.encrypted_secret)),
    };
  }

  createSource(input: RemoteSourceInput): RemoteSource {
    const timestamp = nowIso();
    const id = randomUUID();
    const provider = providerOrWebdav(input.provider);
    const displayName = input.displayName.trim() || provider.toUpperCase();

    this.database
      .prepare(
        `INSERT INTO remote_sources (
          id, provider, display_name, status, base_url, username, auth_type, encrypted_secret,
          config_json, sync_mode, last_test_at, last_sync_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        provider,
        displayName,
        statusOrEnabled(input.status),
        input.baseUrl?.trim() || null,
        input.username?.trim() || null,
        authTypeOrBasic(input.authType),
        this.secretStore.encrypt(input.secret),
        JSON.stringify(input.config ?? {}),
        syncModeOrIndex(input.syncMode),
        null,
        null,
        null,
        timestamp,
        timestamp,
      );

    const source = this.getSource(id);
    if (!source) {
      throw new Error(`Failed to create remote source ${id}`);
    }

    return source;
  }

  updateSource(input: RemoteSourceUpdate): RemoteSource {
    const current = this.getSourceWithSecret(input.id);
    if (!current) {
      throw new Error(`Unknown remote source ${input.id}`);
    }

    const timestamp = nowIso();
    const provider = input.provider ? providerOrWebdav(input.provider) : current.provider;
    const displayName = input.displayName !== undefined ? input.displayName.trim() || current.displayName : current.displayName;
    const secret =
      input.secret !== undefined ? this.secretStore.encrypt(input.secret) : this.getEncryptedSecret(input.id);

    this.database
      .prepare(
        `UPDATE remote_sources SET
          provider = ?,
          display_name = ?,
          status = ?,
          base_url = ?,
          username = ?,
          auth_type = ?,
          encrypted_secret = ?,
          config_json = ?,
          sync_mode = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        provider,
        displayName,
        input.status ? statusOrEnabled(input.status) : current.status,
        input.baseUrl !== undefined ? input.baseUrl?.trim() || null : current.baseUrl,
        input.username !== undefined ? input.username?.trim() || null : current.username,
        input.authType ? authTypeOrBasic(input.authType) : current.authType,
        secret,
        JSON.stringify(input.config ?? current.config),
        input.syncMode ? syncModeOrIndex(input.syncMode) : current.syncMode,
        timestamp,
        input.id,
      );

    const updated = this.getSource(input.id);
    if (!updated) {
      throw new Error(`Unknown remote source ${input.id}`);
    }

    return updated;
  }

  deleteSource(id: string): void {
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM remote_tracks WHERE source_id = ?').run(id);
      this.database.prepare('DELETE FROM remote_sources WHERE id = ?').run(id);
    })();
  }

  updateSourceTestResult(id: string, ok: boolean, message: string, testedAt = nowIso()): void {
    this.database
      .prepare('UPDATE remote_sources SET status = ?, last_test_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(ok ? 'enabled' : 'error', testedAt, ok ? null : message, testedAt, id);
  }

  updateSourceSyncResult(id: string, ok: boolean, message: string | null, syncedAt = nowIso()): void {
    this.database
      .prepare('UPDATE remote_sources SET status = ?, last_sync_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(ok ? 'enabled' : 'error', ok ? syncedAt : null, ok ? null : message, syncedAt, id);
  }

  getTrack(id: string): RemoteLibraryTrack | null {
    const row = this.database.prepare<[string], DbRow>('SELECT * FROM remote_tracks WHERE id = ?').get(id);
    return row ? this.mapTrack(row) : null;
  }

  getTrackBySourcePath(sourceId: string, remotePath: string): RemoteLibraryTrack | null {
    const row = this.database
      .prepare<[string, string], DbRow>('SELECT * FROM remote_tracks WHERE source_id = ? AND remote_path = ?')
      .get(sourceId, remotePath);
    return row ? this.mapTrack(row) : null;
  }

  getTrackIdsForBackgroundJobs(sourceId: string, kinds: RemoteBackgroundJobKind[], options: { failedOnly?: boolean; limit?: number } = {}): string[] {
    return this.queryTracksForBackgroundJobs(sourceId, kinds, options, 'id').map((row) => String(row.id));
  }

  getTracksByIds(trackIds: string[]): RemoteLibraryTrack[] {
    if (trackIds.length === 0) {
      return [];
    }

    const placeholders = trackIds.map(() => '?').join(', ');
    return this.database
      .prepare<unknown[], DbRow>(
        `SELECT * FROM remote_tracks
         WHERE id IN (${placeholders})
         ORDER BY updated_at ASC`,
      )
      .all(...trackIds)
      .map((row) => this.mapTrack(row));
  }

  getTracksForBackgroundJobs(sourceId: string, kinds: RemoteBackgroundJobKind[], options: { failedOnly?: boolean; limit?: number } = {}): RemoteLibraryTrack[] {
    return this.queryTracksForBackgroundJobs(sourceId, kinds, options, '*').map((row) => this.mapTrack(row));
  }

  private queryTracksForBackgroundJobs(
    sourceId: string,
    kinds: RemoteBackgroundJobKind[],
    options: { failedOnly?: boolean; limit?: number },
    columns: 'id' | '*',
  ): DbRow[] {
    const clauses = ['source_id = ?', "availability != 'missing'"];
    const params: unknown[] = [sourceId];
    const statusClauses: string[] = [];
    const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(5000, Math.round(options.limit)))
      : 5000;

    if (kinds.includes('metadata') || kinds.includes('duration-backfill')) {
      statusClauses.push(options.failedOnly ? "metadata_status = 'error'" : "metadata_status IN ('pending', 'partial', 'error')");
    }

    if (kinds.includes('lyrics')) {
      statusClauses.push(options.failedOnly ? "lyrics_status = 'error'" : "lyrics_status IN ('pending', 'not_found', 'error')");
    }

    if (kinds.includes('mv')) {
      statusClauses.push(options.failedOnly ? "mv_status = 'error'" : "mv_status IN ('pending', 'not_found', 'error')");
    }

    if (kinds.includes('cover')) {
      statusClauses.push(
        `(
          cover_id IS NULL
          AND cover_status IN (${options.failedOnly ? "'error'" : "'pending', 'error'"})
          AND metadata_status != 'error'
          AND (
            provider NOT IN ('jellyfin', 'emby', 'subsonic')
            OR json_extract(field_sources_json, '$.coverArt') IS NOT NULL
          )
        )`,
      );
    }

    if (statusClauses.length > 0) {
      clauses.push(`(${statusClauses.join(' OR ')})`);
    }

    return this.database
      .prepare<unknown[], DbRow>(
        `SELECT ${columns} FROM remote_tracks
         WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(...params, limit);
  }

  getComparableFingerprint(sourceId: string, remotePath: string): { etag: string | null; modifiedAt: string | null; sizeBytes: number | null; coverId: string | null } | null {
    const row = this.database
      .prepare<[string, string], DbRow>('SELECT etag, modified_at, size_bytes, cover_id FROM remote_tracks WHERE source_id = ? AND remote_path = ?')
      .get(sourceId, remotePath);

    return row
      ? {
          etag: textOrNull(row.etag),
          modifiedAt: textOrNull(row.modified_at),
          sizeBytes: numberOrNull(row.size_bytes),
          coverId: textOrNull(row.cover_id),
        }
      : null;
  }

  getComparableFingerprints(sourceId: string): Map<string, { etag: string | null; modifiedAt: string | null; sizeBytes: number | null; coverId: string | null }> {
    const rows = this.database
      .prepare<[string], DbRow>('SELECT remote_path, etag, modified_at, size_bytes, cover_id FROM remote_tracks WHERE source_id = ?')
      .all(sourceId);
    const fingerprints = new Map<string, { etag: string | null; modifiedAt: string | null; sizeBytes: number | null; coverId: string | null }>();

    for (const row of rows) {
      fingerprints.set(String(row.remote_path), {
        etag: textOrNull(row.etag),
        modifiedAt: textOrNull(row.modified_at),
        sizeBytes: numberOrNull(row.size_bytes),
        coverId: textOrNull(row.cover_id),
      });
    }

    return fingerprints;
  }

  upsertTracks(tracks: RemoteTrackWrite[]): void {
    if (tracks.length === 0) {
      return;
    }

    const statement = this.database.prepare(
      `INSERT INTO remote_tracks (
        id, source_id, provider, remote_path, remote_url_hash, stable_key,
        title, artist, album, album_artist, track_no, disc_no, year, genre, duration,
        codec, sample_rate, bit_depth, bitrate, size_bytes, modified_at, etag, cover_id,
        cover_status, metadata_status, lyrics_status, mv_status, availability, field_sources_json, search_terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, remote_path) DO UPDATE SET
        remote_url_hash = excluded.remote_url_hash,
        stable_key = excluded.stable_key,
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
        size_bytes = excluded.size_bytes,
        modified_at = excluded.modified_at,
        etag = excluded.etag,
        cover_id = COALESCE(excluded.cover_id, remote_tracks.cover_id),
        cover_status = CASE
          WHEN excluded.cover_id IS NOT NULL OR remote_tracks.cover_id IS NOT NULL THEN 'ok'
          WHEN remote_tracks.cover_status IN ('searching', 'not_found', 'error') THEN remote_tracks.cover_status
          ELSE excluded.cover_status
        END,
        metadata_status = excluded.metadata_status,
        availability = excluded.availability,
        field_sources_json = excluded.field_sources_json,
        search_terms = excluded.search_terms,
        updated_at = excluded.updated_at`,
    );
    const timestamp = nowIso();

    this.database.transaction(() => {
      for (const track of tracks) {
        const searchTerms = buildTrackSearchTerms({
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumArtist: track.albumArtist,
          genre: track.genre,
          remotePath: track.remotePath,
        });

        statement.run(
          track.id,
          track.sourceId,
          track.provider,
          track.remotePath,
          track.remoteUrlHash,
          track.stableKey,
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
          track.sizeBytes,
          track.modifiedAt,
          track.etag,
          track.coverId,
          track.coverId ? 'ok' : track.coverStatus,
          track.metadataStatus,
          track.lyricsStatus,
          track.mvStatus,
          track.availability,
          JSON.stringify(track.fieldSources),
          searchTerms,
          track.createdAt ?? timestamp,
          track.updatedAt ?? timestamp,
        );
      }
    })();
  }

  updateTrackMetadata(trackId: string, update: {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    trackNo: number | null;
    discNo: number | null;
    year: number | null;
    genre: string | null;
    duration: number | null;
    codec: string | null;
    sampleRate: number | null;
    bitDepth: number | null;
    bitrate: number | null;
    metadataStatus: RemoteLibraryTrack['metadataStatus'];
    fieldSources: Record<string, string>;
  }): RemoteLibraryTrack | null {
    this.database
      .prepare(
        `UPDATE remote_tracks SET
          title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          track_no = ?,
          disc_no = ?,
          year = ?,
          genre = ?,
          duration = ?,
          codec = ?,
          sample_rate = ?,
          bit_depth = ?,
          bitrate = ?,
          metadata_status = ?,
          field_sources_json = ?,
          search_terms = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        update.title,
        update.artist,
        update.album,
        update.albumArtist,
        update.trackNo,
        update.discNo,
        update.year,
        update.genre,
        update.duration,
        update.codec,
        update.sampleRate,
        update.bitDepth,
        update.bitrate,
        update.metadataStatus,
        JSON.stringify(update.fieldSources),
        buildTrackSearchTerms({
          title: update.title,
          artist: update.artist,
          album: update.album,
          albumArtist: update.albumArtist,
          genre: update.genre,
          remotePath: this.getTrack(trackId)?.remotePath,
        }),
        nowIso(),
        trackId,
      );

    return this.getTrack(trackId);
  }

  updateTrackDuration(trackId: string, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    this.database
      .prepare(
        `UPDATE remote_tracks
         SET duration = ?, metadata_status = CASE metadata_status WHEN 'pending' THEN 'partial' ELSE metadata_status END, updated_at = ?
         WHERE id = ? AND (duration IS NULL OR duration <= 0)`,
      )
      .run(duration, nowIso(), trackId);
  }

  updateTrackCover(trackId: string, coverId: string | null): RemoteLibraryTrack | null {
    this.database
      .prepare('UPDATE remote_tracks SET cover_id = ?, cover_status = ?, updated_at = ? WHERE id = ?')
      .run(coverId, coverId ? 'ok' : 'pending', nowIso(), trackId);
    return this.getTrack(trackId);
  }

  updateTrackCoversByCoverArt(sourceId: string, coverArt: string, coverId: string): number {
    return this.database
      .prepare(
        `UPDATE remote_tracks
         SET cover_id = ?, cover_status = 'ok', updated_at = ?
         WHERE source_id = ?
           AND cover_id IS NULL
           AND json_extract(field_sources_json, '$.coverArt') = ?`,
      )
      .run(coverId, nowIso(), sourceId, coverArt).changes;
  }

  updateTrackJobStatus(trackId: string, kind: RemoteBackgroundJobKind, status: RemoteLibraryTrack['metadataStatus']): void {
    const column = kind === 'cover' ? 'cover_status' : kind === 'lyrics' ? 'lyrics_status' : kind === 'mv' ? 'mv_status' : 'metadata_status';
    this.database.prepare(`UPDATE remote_tracks SET ${column} = ?, updated_at = ? WHERE id = ?`).run(status, nowIso(), trackId);
  }

  markMissingExcept(sourceId: string, remotePaths: Set<string>): number {
    const rows = this.database.prepare<[string], { remote_path: string }>('SELECT remote_path FROM remote_tracks WHERE source_id = ?').all(sourceId);
    const missing = rows.map((row) => row.remote_path).filter((remotePath) => !remotePaths.has(remotePath));
    if (missing.length === 0) {
      return 0;
    }

    const statement = this.database.prepare('UPDATE remote_tracks SET availability = ?, updated_at = ? WHERE source_id = ? AND remote_path = ?');
    const timestamp = nowIso();
    this.database.transaction(() => {
      for (const remotePath of missing) {
        statement.run('missing', timestamp, sourceId, remotePath);
      }
    })();
    return missing.length;
  }

  removeMissingTracks(sourceId: string): number {
    return this.database.prepare('DELETE FROM remote_tracks WHERE source_id = ? AND availability = ?').run(sourceId, 'missing').changes;
  }

  toLibraryTrack(track: RemoteLibraryTrack): LibraryTrack {
    return {
      id: track.id,
      mediaType: 'remote',
      path: `remote://${track.sourceId}${track.remotePath}`,
      sourceId: track.sourceId,
      provider: track.provider,
      remotePath: track.remotePath,
      stableKey: track.stableKey,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      trackNo: track.trackNo,
      discNo: track.discNo,
      year: track.year,
      genre: track.genre,
      duration: track.duration ?? 0,
      codec: track.codec,
      sampleRate: track.sampleRate,
      bitDepth: track.bitDepth,
      bitrate: track.bitrate,
      coverId: track.coverId,
      coverThumb: track.coverThumb,
      metadataStatus: track.metadataStatus,
      embeddedCoverStatus: track.coverStatus === 'ok' ? 'present' : track.coverStatus === 'searching' ? 'reading' : track.coverStatus === 'error' ? 'error' : track.coverStatus === 'pending' ? 'pending' : 'missing',
      fieldSources: track.fieldSources,
      unavailable: track.availability === 'missing',
    };
  }

  private getEncryptedSecret(id: string): string | null {
    const row = this.database.prepare<[string], { encrypted_secret: string | null }>('SELECT encrypted_secret FROM remote_sources WHERE id = ?').get(id);
    return row?.encrypted_secret ?? null;
  }

  private mapSource(row: DbRow): RemoteSource {
    return {
      id: String(row.id),
      provider: providerOrWebdav(row.provider),
      displayName: String(row.display_name),
      status: statusOrEnabled(row.status),
      baseUrl: textOrNull(row.base_url),
      username: textOrNull(row.username),
      authType: authTypeOrBasic(row.auth_type),
      config: parseJsonObject(row.config_json),
      syncMode: syncModeOrIndex(row.sync_mode),
      lastTestAt: textOrNull(row.last_test_at),
      lastSyncAt: textOrNull(row.last_sync_at),
      lastError: textOrNull(row.last_error),
      indexedTrackCount: Number(row.indexed_track_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapTrack(row: DbRow): RemoteLibraryTrack {
    const coverId = textOrNull(row.cover_id);

    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      provider: providerOrWebdav(row.provider),
      remotePath: String(row.remote_path),
      stableKey: String(row.stable_key),
      title: String(row.title),
      artist: String(row.artist),
      album: String(row.album),
      albumArtist: String(row.album_artist),
      trackNo: numberOrNull(row.track_no),
      discNo: numberOrNull(row.disc_no),
      year: numberOrNull(row.year),
      genre: textOrNull(row.genre),
      duration: numberOrNull(row.duration),
      codec: textOrNull(row.codec),
      sampleRate: numberOrNull(row.sample_rate),
      bitDepth: numberOrNull(row.bit_depth),
      bitrate: numberOrNull(row.bitrate),
      sizeBytes: numberOrNull(row.size_bytes),
      modifiedAt: textOrNull(row.modified_at),
      etag: textOrNull(row.etag),
      coverId,
      coverThumb: coverId ? `echo-cover://thumb/${encodeURIComponent(coverId)}` : null,
      coverStatus: remoteTrackStatusOrPending(row.cover_status),
      metadataStatus: remoteTrackStatusOrPending(row.metadata_status),
      lyricsStatus: remoteTrackStatusOrPending(row.lyrics_status),
      mvStatus: remoteTrackStatusOrPending(row.mv_status),
      availability: row.availability === 'available' || row.availability === 'missing' ? row.availability : 'unknown',
      fieldSources: Object.fromEntries(
        Object.entries(parseJsonObject(row.field_sources_json)).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
      ),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
