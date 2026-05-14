# ECHO Next Library Core

Library Core v0.1 fixes the old ECHO library pain points by making SQLite the source of truth and by keeping heavy work behind native-worker-ready interfaces. Restarting the app reads folders, tracks, albums, artists, covers, and scan jobs directly from SQLite. It does not reparse every song, regenerate every cover, or regroup the album wall in Renderer memory.

## Modules

`LibraryService`

- public facade used by IPC
- composes `LibraryStore`, `ScanJobQueue`, workers, and album grouping
- depends on worker interfaces, not concrete TS implementations

`LibraryStore`

- owns all SQLite reads and writes
- runs paged track, album, album-track, folder, scan-job, and summary queries
- writes scan results in transactions
- persists album, artist, and cover cache rows

`ScanJobQueue`

- backgrounds scan jobs
- reports progress, phases, cancellation, and collected warnings/errors
- enforces metadata and cover worker concurrency limits
- orchestrates scanner, metadata reader, cover extractor, and SQLite writes

`MetadataReader`

- stable worker interface for tag parsing
- TS v0.1 implementation: `TsMetadataReader`
- future replacement: `RustMetadataWorker` or C++ equivalent

`CoverExtractor`

- stable worker interface for cover extraction and cache file generation
- TS+sharp v0.2 implementation: `TsCoverExtractor`
- `sharp` performs real resize output for `thumb.webp`, `album.webp`, and `large.webp`
- TypeScript still owns cover priority, cache directory scheduling, and fallback behavior
- highest-priority future native worker

`FileScanner`

- stable worker interface for file enumeration and stat data
- TS v0.1 implementation: `TsFileScanner`
- Rust/C++ only if pressure tests prove it is needed

`AlbumService`

- owns `album_key` generation
- prevents empty album values from collapsing into one huge Unknown Album

## SQLite Schema

Core tables:

- `folders`: `id`, `path`, `enabled`, `last_scan_at`, timestamps
- `tracks`: path fingerprint, normalized metadata, `genre`, `metadata_status`, `embedded_metadata_status`, `embedded_cover_status`, `network_metadata_status`, `field_sources_json`, `cover_id`, `missing`, timestamps
- `albums`: persisted album-wall records with `album_key`, title, artist, year, cover, count, duration
- `album_tracks`: persisted track order with disc/track numbers
- `artists`: persisted artist counts
- `covers`: `source_type`, `thumb_path`, `album_path`, `large_path`, `original_ref`, hash, cache version, and MIME metadata
- `scan_jobs`: status, phase, discovered/parsed/skipped/cover counts, errors, timestamps
- `network_metadata_candidates`, `network_metadata_decisions`, `network_cover_candidates`: weak network completion candidates, user/auto decisions, and cover candidates

Important indexes:

- `folders(path)`
- `tracks(path)`
- `tracks(folder_id)`
- `tracks(title)`
- `tracks(artist)`
- `tracks(album)`
- `albums(album_key)`
- `album_tracks(album_id)`
- `album_tracks(track_id)`
- `covers(id)`

Migrations are repeatable and use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and guarded `ALTER TABLE ADD COLUMN`.

## Scan Pipeline

1. `library.scanFolder(folderId)` creates a `scan_jobs` row and returns immediately.
2. `ScanJobQueue` runs in the background.
3. `discovering`: `FileScanner` emits `path`, `sizeBytes`, and `mtimeMs`.
4. `checking_cache`: `LibraryStore` compares each file against persisted `path + size_bytes + mtime_ms`.
5. Unchanged files are skipped. Metadata and cover workers are not called for them.
6. `reading_metadata`: changed/new files go through `MetadataReader`; embedded metadata readiness becomes `present`, `missing`, or `error`.
7. `extracting_covers`: changed/new files go through `CoverExtractor`; embedded cover readiness becomes `present`, `missing`, or `error`.
8. `grouping_albums`: `AlbumService` rebuilds persisted albums from track rows.
9. `writing_database`: tracks, covers, albums, artists, folders, and scan status are committed through SQLite.
10. Final phase becomes `finished`, `failed`, or `cancelled`.

Network completion is a separate Phase C. It is optional, manually triggered, non-blocking, and writes provider output to candidate tables before any merge is attempted.

Per-file worker warnings/errors are collected in `scan_jobs.errors_json`; they do not fail the whole scan.

Deletion policy: when a file disappears from a scanned folder, the next scan marks its track row `missing = 1`. List APIs filter missing tracks out, preserving history while avoiding disk deletion. Library Core never deletes user audio files.

## Cache Strategy

The incremental key is:

- `path`
- `size_bytes`
- `mtime_ms`

When all three match, ECHO Next trusts SQLite metadata and cover links. This avoids the old restart behavior where the whole library was parsed again.

Covers are cached on disk and deduplicated by `sourceHash`. `getTracks` and `getAlbums` return only `coverThumb` protocol URLs. They never return `largePath`, `originalRef`, full cover binary, or base64 payloads.

Albums are persisted in `albums` and `album_tracks`, so the album wall reads cached rows after restart instead of regrouping all tracks in Renderer memory.

## Native SQLite In Dev

Library Core uses `better-sqlite3`, which is a native Node/Electron module. The binary must match the Electron runtime ABI used by the desktop app, not only the system `node.exe` ABI. If it is built for the wrong ABI, Electron will show an error like `NODE_MODULE_VERSION ... requires NODE_MODULE_VERSION ...` and library APIs such as `library.getTracks` will fail.

Current development uses Electron 37.x because `better-sqlite3@12.9.0` rebuilds cleanly for that Electron ABI on Windows. `npm run dev` runs `npm run rebuild:native` first, which executes:

```bash
electron-rebuild -w better-sqlite3
```

After dependency changes or a clean install, use `npm run dev` normally; the predev step keeps the SQLite binding aligned with the Electron desktop runtime. Vitest global setup runs `scripts/ensure-native-abi.mjs node` first because tests execute under the system Node.js ABI, so direct `vitest` runs and editor-launched tests get the same protection as `npm test`. The `posttest` hook then runs the Electron ABI check so the working tree is left ready for Electron dev after `npm test`. The ABI helper caches rebuilt `better-sqlite3.node` binaries under `node_modules/.echo-native-cache`, so repeat switches between Node and Electron usually restore a cached binary instead of compiling again.

Browser-only Vite preview cannot scan folders because it has no Electron main process, preload bridge, or native SQLite access.

## Metadata Priority

Fixed priority:

1. manual
2. embedded
3. sidecar/info
4. folder inference
5. network completion
6. filename fallback

Network completion is weak. It can apply missing-only fields only after embedded metadata is `missing` or `error`, and only when field sources are `unknown`, `filename_fallback`, or `network`. It cannot overwrite `manual`, `embedded`, `sidecar`, or `folder_structure`.

Filename guessing only fills fields that remain local fallbacks. Embedded `title`, `artist`, and `album` are never overwritten, which prevents valid files from being stuck as Unknown Artist.

Every stored track writes `field_sources_json` for title, artist, album, albumArtist, trackNo, discNo, year, genre, duration, codec, sampleRate, bitDepth, and bitrate.

## Cover Priority

Priority:

1. manual cover
2. embedded cover
3. same-folder `cover`, `folder`, or `front` image
4. network cover
5. generated default cover

Network cover lookup is allowed only when local cover source is `default` and embedded cover readiness is `missing` or `error`. Network URLs are never sent to Renderer; accepted network covers must enter the cover cache pipeline and be stored in `covers`.

Cover layers:

- `thumb_path`: 96x96 `thumb.webp`; `LibraryTrack.coverThumb`; small list rows only
- `album_path`: 320x320 `album.webp`; `LibraryAlbum.coverThumb`; album wall only
- `large_path`: max 768x768 `large.webp`; reserved for NowPlaying/detail
- `original_ref`: retained for on-demand original access

List and album-wall images must use `loading="lazy"` and `decoding="async"`. Renderer code must not request `large` or `original` variants during scrolling and must not generate cover derivatives.

## Album Grouping

`album_key` is based on normalized:

- `albumArtist || artist`
- `album`
- `year`

Rules:

- same album + same albumArtist merges
- same album + different albumArtist does not merge
- missing/unknown albumArtist uses folder path as a weak separator
- empty/unknown album values get per-track keys and do not create one giant Unknown Album
- albums and album_tracks are persisted

## API And UI Data Flow

Preload exposes typed methods only:

- `library.addFolder(path)`
- `library.getFolders()`
- `library.removeFolder(folderId)`
- `library.scanFolder(folderId)`
- `library.getScanStatus(jobId)`
- `library.cancelScan(jobId)`
- `library.getTracks({ page, pageSize, search, sort })`
- `library.getAlbums({ page, pageSize, search, sort })`
- `library.getAlbumTracks(albumId, { page, pageSize })`
- `library.getSummary()`
- `library.getDiagnostics()`

IPC handlers validate input and call `LibraryService`. SQL, scanning, metadata, cover, and grouping logic stay inside Library Core.

`SongsPage` reads paged tracks with `pageSize = 100`, keeps search debounced, and renders a virtualized `TrackList`. Track rows receive `coverThumb` only.

`AlbumsPage` reads albums with `pageSize = 60` from the persisted `albums` table. It loads page 1 first and appends later pages only when the album wall scrolls near the bottom. It must not loop through every page or put the full album library into Renderer state. It never regroups tracks in Renderer.

Current AlbumWall rendering is paged grid + lazy image loading. TODO: if 3000/10000 album smoke tests still show scroll jank after pagination, replace the grid with `@tanstack/react-virtual` grid virtualization.

Folders, Settings, and Import Folder share the same `LibraryFoldersPanel`. It supports:

- system folder selection through `library.chooseFolder()`
- manual path entry as an advanced fallback
- add and scan
- rescan for already imported folders
- cancel scan
- remove folder

Import flow:

- `library.chooseFolder()` opens the Electron directory picker in main
- the `Folders` route is the normal folder management surface
- the `Import Folder` route is a focused import surface that uses the same panel with input focus
- the SongsPage folder-plus action dispatches `app:navigate:import-folder`, keeping SongsPage thin
- App chrome can still open the directory picker directly for quick import
- Settings and the import view fill the chosen path into the input and immediately start import and scan
- repeated imports of the same path are idempotent and become a rescan
- when a scan completes, the panel calls `library.getSummary()` and emits a `library:changed` window event so SongsPage and AlbumsPage reload their first page

The sidebar `Import File` action opens the existing local audio file picker directly. Phase 1 does not add single-file library ingestion; that remains separate from the folder-based Library Core cache.

This is not a file manager and never copies, moves, renames, or deletes disk files.

## Phase 1.1 Playback And Diagnostics

`TrackRow` accepts `onPlay(track)` while staying memoized. `TrackList` passes the callback through, and `SongsPage` calls:

```ts
window.echo.playback.playLocalFile({
  filePath: track.path,
  trackId: track.id,
});
```

`SongsPage` updates only `currentTrackId` from the returned playback status. It does not subscribe to playback progress, so position polling cannot rerender the song list. The current `PlaybackQueueProvider` / `usePlaybackQueue` queue is only the already loaded tracks window, such as the visible SongsPage page or loaded album tracks. It is not a complete library playback queue; the full-library queue belongs in a later LibraryService or queue service, not in Phase 1.2.

`PlayerBar` owns lightweight 500 ms polling of `playback.getStatus()` and `audio.getStatus()` until push IPC exists. It displays current file, track id, state, position/duration, codec, `fileSampleRate`, `actualDeviceSampleRate`, `outputMode`, and `sampleRateMismatch`. TODO: replace polling with `playback:onStatus` and `audio:onStatus` IPC push events, throttle high-frequency position updates, and keep those updates out of SongsPage.

`library.getDiagnostics()` returns counts, last scan counters, last paged query timings, approximate average album payload size, database path/size, cover cache path/size, and cover cache version. It never triggers a scan and never returns track lists or full cover payloads. The diagnostics panel is dev-only in Settings > Library.

`npm run benchmark:library` generates 3000 and 10000 fake tracks and 3000 and 10000 fake albums with cover cache rows. It measures SQLite insertion, album grouping, first-page track/album queries, album page 10, album total count, coverThumb payload length, forbidden cover payload checks (`large`, `original`, `base64`), unchanged scan skip simulation, memory, and database size. It does not need real audio files.

## Performance Budget

- startup does not scan the full library
- `getTracks` first page target: under 200 ms
- `getAlbums` first page target: under 300 ms
- AlbumsPage must request page 1 first and must not request every album page up front
- unchanged scan skip rate should approach 100%
- cover thumbs are generated during scan, not UI scroll
- album wall reads `albums` after restart
- list APIs do not return full covers
- scans are backgrounded and cancellable
- metadata and cover workers have concurrency limits
- large libraries must not hold CPU near 50% because the album wall is rendering

## Native CoverWorker Decision

Do not start a Go/C#/Rust `CoverWorker` just because the boundary exists. TS+sharp v0.2 remains the current implementation until benchmark or smoke data proves it is not enough.

Move cover generation native only if one or more of these is measured:

- generating 1000 album thumbs keeps CPU above 50% for a long stretch
- generating 3000 or 10000 covers creates unacceptable memory peaks
- Electron packaging or native rebuilds for `sharp` become unstable
- cover cache hits are still slow after `thumb.webp` and `album.webp` already exist
