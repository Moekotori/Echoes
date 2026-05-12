import type { EchoDatabase } from './createDatabase';
import { librarySchemaSql, schemaMigrationTableSql } from './schema';

type Migration = {
  id: number;
  apply: (database: EchoDatabase) => void;
};

type ColumnInfoRow = {
  name: string;
};

const hasColumn = (database: EchoDatabase, tableName: string, columnName: string): boolean => {
  const rows = database.prepare<unknown[], ColumnInfoRow>(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
};

const addColumnIfMissing = (
  database: EchoDatabase,
  tableName: string,
  columnName: string,
  columnSql: string,
): void => {
  if (!hasColumn(database, tableName, columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
};

export const migrations: Migration[] = [
  {
    id: 1,
    apply: (database) => database.exec(librarySchemaSql),
  },
  {
    id: 2,
    apply: (database) => {
      addColumnIfMissing(database, 'tracks', 'track_no', 'track_no INTEGER');
      addColumnIfMissing(database, 'tracks', 'disc_no', 'disc_no INTEGER');
      addColumnIfMissing(database, 'tracks', 'year', 'year INTEGER');
      addColumnIfMissing(database, 'scan_jobs', 'phase', "phase TEXT NOT NULL DEFAULT 'queued'");
      addColumnIfMissing(database, 'scan_jobs', 'removed_tracks', 'removed_tracks INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    id: 3,
    apply: (database) => {
      addColumnIfMissing(database, 'folders', 'enabled', 'enabled INTEGER NOT NULL DEFAULT 1');
      addColumnIfMissing(database, 'folders', 'last_scan_at', 'last_scan_at TEXT');

      addColumnIfMissing(database, 'tracks', 'genre', 'genre TEXT');
      addColumnIfMissing(database, 'tracks', 'metadata_status', "metadata_status TEXT NOT NULL DEFAULT 'ok'");
      addColumnIfMissing(database, 'tracks', 'missing', 'missing INTEGER NOT NULL DEFAULT 0');

      addColumnIfMissing(database, 'albums', 'year', 'year INTEGER');

      addColumnIfMissing(database, 'album_tracks', 'disc_no', 'disc_no INTEGER');
      addColumnIfMissing(database, 'album_tracks', 'track_no', 'track_no INTEGER');

      addColumnIfMissing(database, 'artists', 'sort_name', 'sort_name TEXT');
      addColumnIfMissing(database, 'artists', 'track_count', 'track_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'artists', 'album_count', 'album_count INTEGER NOT NULL DEFAULT 0');

      addColumnIfMissing(database, 'covers', 'thumb_path', 'thumb_path TEXT');
      addColumnIfMissing(database, 'covers', 'album_path', 'album_path TEXT');
      addColumnIfMissing(database, 'covers', 'large_path', 'large_path TEXT');
      addColumnIfMissing(database, 'covers', 'original_ref', 'original_ref TEXT');

      addColumnIfMissing(database, 'scan_jobs', 'discovered_count', 'discovered_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'parsed_count', 'parsed_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'skipped_count', 'skipped_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'cover_count', 'cover_count INTEGER NOT NULL DEFAULT 0');

      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_album_tracks_track_id ON album_tracks(track_id);
        CREATE INDEX IF NOT EXISTS idx_covers_id ON covers(id);
      `);
    },
  },
  {
    id: 4,
    apply: (database) => {
      addColumnIfMissing(database, 'covers', 'album_path', 'album_path TEXT');
      addColumnIfMissing(database, 'covers', 'cache_version', 'cache_version INTEGER');
      addColumnIfMissing(database, 'covers', 'warnings_json', "warnings_json TEXT NOT NULL DEFAULT '[]'");
      addColumnIfMissing(database, 'covers', 'errors_json', "errors_json TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    id: 5,
    apply: (database) => {
      addColumnIfMissing(database, 'tracks', 'embedded_metadata_status', "embedded_metadata_status TEXT NOT NULL DEFAULT 'pending'");
      addColumnIfMissing(database, 'tracks', 'embedded_cover_status', "embedded_cover_status TEXT NOT NULL DEFAULT 'pending'");
      addColumnIfMissing(database, 'tracks', 'network_metadata_status', "network_metadata_status TEXT NOT NULL DEFAULT 'none'");

      database.exec(`
        CREATE TABLE IF NOT EXISTS network_metadata_candidates (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          album_id TEXT,
          provider TEXT NOT NULL,
          provider_item_id TEXT NOT NULL,
          title TEXT,
          artist TEXT,
          album TEXT,
          album_artist TEXT,
          year INTEGER,
          genre TEXT,
          duration REAL,
          track_no INTEGER,
          disc_no INTEGER,
          cover_url TEXT,
          score REAL NOT NULL,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS network_metadata_decisions (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          applied_fields_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (candidate_id) REFERENCES network_metadata_candidates(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS network_cover_candidates (
          id TEXT PRIMARY KEY,
          track_id TEXT,
          album_id TEXT,
          provider TEXT NOT NULL,
          cover_url TEXT NOT NULL,
          width INTEGER,
          height INTEGER,
          mime_type TEXT,
          score REAL NOT NULL,
          cached_thumb_path TEXT,
          cached_large_path TEXT,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_network_metadata_candidates_track_id ON network_metadata_candidates(track_id);
        CREATE INDEX IF NOT EXISTS idx_network_metadata_decisions_track_id ON network_metadata_decisions(track_id);
        CREATE INDEX IF NOT EXISTS idx_network_cover_candidates_track_id ON network_cover_candidates(track_id);
      `);
    },
  },
  {
    id: 6,
    apply: (database) => {
      addColumnIfMissing(database, 'tracks', 'play_count', 'play_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'tracks', 'last_played_at', 'last_played_at TEXT');
    },
  },
  {
    id: 7,
    apply: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS playback_history (
          id TEXT PRIMARY KEY,
          track_id TEXT,
          track_path TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          album TEXT,
          album_artist TEXT,
          cover_id TEXT,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          played_seconds REAL NOT NULL DEFAULT 0,
          duration_seconds REAL NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          source_type TEXT,
          source_label TEXT,
          queue_id TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_playback_history_started_at ON playback_history(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playback_history_track_id ON playback_history(track_id);
        CREATE INDEX IF NOT EXISTS idx_playback_history_completed ON playback_history(completed);
      `);
    },
  },
  {
    id: 8,
    apply: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS playback_history_stats (
          history_key TEXT PRIMARY KEY,
          track_id TEXT,
          track_path TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          album TEXT,
          album_artist TEXT,
          cover_id TEXT,
          play_count INTEGER NOT NULL DEFAULT 0,
          completed_count INTEGER NOT NULL DEFAULT 0,
          total_played_seconds REAL NOT NULL DEFAULT 0,
          duration_seconds REAL NOT NULL DEFAULT 0,
          last_started_at TEXT NOT NULL,
          last_ended_at TEXT,
          source_type TEXT,
          source_label TEXT,
          queue_id TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_playback_history_stats_play_count ON playback_history_stats(play_count DESC, last_started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playback_history_stats_last_started_at ON playback_history_stats(last_started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playback_history_track_started ON playback_history(track_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playback_history_path_started ON playback_history(track_path, started_at DESC);

        INSERT INTO playback_history_stats (
          history_key, track_id, track_path, title, artist, album, album_artist, cover_id,
          play_count, completed_count, total_played_seconds, duration_seconds,
          last_started_at, last_ended_at, source_type, source_label, queue_id, updated_at
        )
        WITH grouped_history AS (
          SELECT
            COALESCE(track_id, track_path) AS history_key,
            COUNT(*) AS play_count,
            COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count,
            COALESCE(SUM(played_seconds), 0) AS total_played_seconds,
            MAX(started_at) AS last_started_at,
            MAX(ended_at) AS last_ended_at
          FROM playback_history
          GROUP BY COALESCE(track_id, track_path)
        ),
        latest_history AS (
          SELECT playback_history.*
          FROM playback_history
          INNER JOIN grouped_history
            ON COALESCE(playback_history.track_id, playback_history.track_path) = grouped_history.history_key
          WHERE playback_history.id = (
            SELECT latest.id
            FROM playback_history AS latest
            WHERE COALESCE(latest.track_id, latest.track_path) = grouped_history.history_key
            ORDER BY latest.started_at DESC, latest.created_at DESC, latest.id DESC
            LIMIT 1
          )
        )
        SELECT
          grouped_history.history_key,
          latest_history.track_id,
          latest_history.track_path,
          latest_history.title,
          latest_history.artist,
          latest_history.album,
          latest_history.album_artist,
          latest_history.cover_id,
          grouped_history.play_count,
          grouped_history.completed_count,
          grouped_history.total_played_seconds,
          latest_history.duration_seconds,
          grouped_history.last_started_at,
          grouped_history.last_ended_at,
          latest_history.source_type,
          latest_history.source_label,
          latest_history.queue_id,
          COALESCE(grouped_history.last_ended_at, grouped_history.last_started_at)
        FROM grouped_history
        INNER JOIN latest_history
          ON COALESCE(latest_history.track_id, latest_history.track_path) = grouped_history.history_key
        WHERE 1 = 1
        ON CONFLICT(history_key) DO UPDATE SET
          track_id = excluded.track_id,
          track_path = excluded.track_path,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          album_artist = excluded.album_artist,
          cover_id = excluded.cover_id,
          play_count = excluded.play_count,
          completed_count = excluded.completed_count,
          total_played_seconds = excluded.total_played_seconds,
          duration_seconds = excluded.duration_seconds,
          last_started_at = excluded.last_started_at,
          last_ended_at = excluded.last_ended_at,
          source_type = excluded.source_type,
          source_label = excluded.source_label,
          queue_id = excluded.queue_id,
          updated_at = excluded.updated_at;
      `);
    },
  },
  {
    id: 9,
    apply: (database) => {
      addColumnIfMissing(database, 'artists', 'cover_id', 'cover_id TEXT');
    },
  },
  {
    id: 10,
    apply: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS artist_tracks (
          artist_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (artist_id, track_id),
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS artist_albums (
          artist_id TEXT NOT NULL,
          album_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          PRIMARY KEY (artist_id, album_id),
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_artist_tracks_artist_id ON artist_tracks(artist_id);
        CREATE INDEX IF NOT EXISTS idx_artist_tracks_track_id ON artist_tracks(track_id);
        CREATE INDEX IF NOT EXISTS idx_artist_albums_artist_id ON artist_albums(artist_id);
        CREATE INDEX IF NOT EXISTS idx_artist_albums_album_id ON artist_albums(album_id);
      `);
    },
  },
];

export const runMigrations = (database: EchoDatabase): void => {
  database.exec(schemaMigrationTableSql);

  const appliedRows = database.prepare<unknown[], { id: number }>('SELECT id FROM schema_migrations').all();
  const appliedIds = new Set(appliedRows.map((row) => Number(row.id)));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    database.exec('BEGIN');

    try {
      migration.apply(database);
      database
        .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
};
