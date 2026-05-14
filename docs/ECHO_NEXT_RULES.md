# ECHO Next Rules

These rules are architectural guardrails. They are part of Phase 0 and should be treated as development constraints.

## File Size And Ownership

1. No giant `App.tsx`.
2. No giant `main/index.ts`.
3. No giant global CSS file.
4. Pages over 500 lines must be split.
5. Services over 800 lines must be split.
6. Shared abstractions must have a clear owner and purpose.

## App Entrypoints

`src/renderer/app/App.tsx` may only compose:

- providers
- layout
- routes
- future error boundary

`src/main/index.ts` may only compose:

- app lifecycle
- main window creation through lifecycle
- IPC registration
- necessary service bootstrap

## Renderer Rules

The renderer must not:

- scan folders
- read metadata
- parse covers
- load full covers for lists
- decide album grouping
- hold the whole library in React state
- run heavy search over a full in-memory track array
- let high-frequency playback state rerender the entire app
- know whether library workers are TypeScript, Rust, or C++

Songs, albums, artists, and search results must be paged or virtualized.

Current Phase 1 list defaults:

- songs: `pageSize = 100`
- albums: `pageSize = 60`
- track rows are virtualized with an estimated 70px row height
- list and album-wall images must use lazy loading and async decoding
- AlbumsPage must request page 1 first and append more pages only near scroll bottom; it must not loop through every album page up front
- AlbumWall may stay paged + lazy image for Phase 1.2; add grid virtualization later only if large-library smoke tests prove it is needed

## Preload Rules

Preload must:

- expose `window.echo`
- keep APIs grouped by domain
- return typed results

Preload must not:

- expose raw `ipcRenderer`
- access files directly
- implement business logic
- parse metadata or covers
- know which worker implementation backs Library Core

Renderer must not open Electron dialogs directly. Folder chooser UX must go through preload and IPC, not from React components calling `dialog`.

Renderer EQ UI may render controls, curves, warnings, and preset actions. It must not process audio buffers, calculate native filter coefficients, read/write preset files directly, or bypass the typed `window.echo.eq` preload API.

## Native Worker Boundary

Library Core heavy work must be called through stable interfaces:

- `MetadataReader`
- `CoverExtractor`
- `FileScanner`

`LibraryService` may compose concrete defaults, but orchestration must depend on the interfaces. IPC and Renderer must never import `TsMetadataReader`, `TsCoverExtractor`, or `TsFileScanner`.

Future Go/C#/Rust workers must preserve the same return shapes:

- metadata fields, field sources, warnings, errors, and status
- cover source, thumb path, album path, large path, original reference, source hash, warnings, and errors
- scanned file path, size, and mtime

SQLite schema, IPC payloads, and Renderer list views must not change just because a worker implementation changes.

## Metadata Priority

Metadata priority is fixed:

1. user manual edit
2. embedded tags
3. sidecar/info files
4. folder structure
5. network completion
6. filename fallback

Filename guessing must never overwrite embedded `title`, `artist`, or `album`.

Network metadata must never overwrite embedded tags.

Network metadata must not write fields while `embedded_metadata_status` is `pending` or `reading`. It may apply only missing-only fields after embedded metadata is `missing` or `error`, and only when the current field source is `unknown`, `filename_fallback`, or `network`.

Every stored track must preserve per-field source information in `field_sources_json`.

Phase 1 must persist at least:

- `title`
- `artist`
- `album`
- `albumArtist`
- `trackNo`
- `discNo`
- `year`
- `duration`
- `codec`
- `sampleRate`
- `bitDepth`
- `bitrate`

## Cover Priority

Long-term cover priority is fixed:

1. user manual cover
2. embedded cover
3. local folder cover
4. sidecar cover
5. network cover
6. generated placeholder

Network covers must never overwrite manual, embedded, or local covers.

Network cover lookup is manual and weak. It must not write covers while `embedded_cover_status` is `pending` or `reading`, and it may apply only when the current cover source is `default`.

Current TS+sharp v0.2 covers must be stored as:

- `thumb.webp` at 96x96 for `LibraryTrack.coverThumb`
- `album.webp` at 320x320 for `LibraryAlbum.coverThumb`
- `large.webp` up to 768x768 for NowPlaying/detail
- original

`sharp` performs the real resize work. TypeScript owns cover priority, cache directory scheduling, and fallback behavior.

List views use track thumbs only. Album walls use album thumbs only. Full covers load on demand outside list scrolling.

List APIs must never return `cover_large`, `cover_original`, `largePath`, `originalRef`, raw binary cover data, or base64 cover payloads.

Do not start a Go/C#/Rust CoverWorker until benchmark or smoke-test data proves TS+sharp is insufficient. Decision indicators are sustained CPU above 50% while generating 1000 album thumbs, unacceptable memory peaks for 3000/10000 covers, unstable Electron `sharp` packaging/rebuilds, or slow cover-cache hits after derivatives already exist.

## Long Tasks

All long tasks must be:

- backgrounded
- cancellable
- progress-reporting
- error-collecting

This includes scanning, metadata extraction, cover generation, audio analysis, and future network enrichment.

Network enrichment must not run automatically at app startup, must not issue requests for every scanned track, must use provider timeouts, must keep concurrency at 2 or below, and provider failure must not affect local library rows.

Local library scans must skip metadata parsing when `path + size_bytes + mtime_ms` is unchanged.

Scan jobs must report one of these phases:

- `discovering`
- `checking_cache`
- `reading_metadata`
- `extracting_covers`
- `grouping_albums`
- `writing_database`
- `finished`
- `failed`
- `cancelled`

Per-file metadata or cover errors must be collected without failing the entire scan.

Metadata and cover workers must use concurrency limits. Cover thumbnails must be created during scans, not during list scrolling.

## Library Persistence

SQLite is the source of truth after a scan. Restarting the app must not reparse the whole library.

`better-sqlite3` must be rebuilt for the Electron runtime ABI before desktop dev runs. `npm run dev` owns that check through `npm run rebuild:native`; do not rely on the binary produced for the system Node.js ABI when testing folder import or library scanning in Electron. Vitest uses the system Node.js ABI, so Vitest global setup owns the opposite rebuild even when tests are launched directly through `vitest`, an editor, or `npm test`. `scripts/ensure-native-abi.mjs` caches ABI-specific binaries under `node_modules/.echo-native-cache` to keep repeat Node/Electron switches fast.

Required persisted tables:

- `folders`
- `tracks`
- `albums`
- `album_tracks`
- `artists`
- `covers`
- `scan_jobs`

Album wall views must read the `albums` table. They must not regroup the full track table in the renderer.

If a file is removed from a scanned folder, the next scan must hide it from list APIs without touching the disk file.

Current v0.1 policy: missing files are marked `missing = 1` and filtered out of list APIs. This keeps cache history without deleting the user's disk files.

## Album Grouping

Album grouping must be performed in Library Core and persisted.

Rules:

- same album + same album artist merges
- same album + different album artist does not merge
- album artist missing or unknown uses folder path as a weak separator
- empty or unknown album values must not collapse into one giant album
- year participates in the album key when available

## Testing Rules

Changes touching metadata, cover, audio, library, encoding, database migration, or file scanning behavior must include focused tests.

Library Core tests should prefer real SQLite and mocked metadata readers over large binary audio fixtures unless a parser integration bug specifically requires real media.

Tests that touch Library Core must cover the worker boundary with fake `MetadataReader`, `CoverExtractor`, and `FileScanner` implementations so the architecture stays Rust/C++ ready.

Folder import UX must keep `library.chooseFolder()` in main/preload, treat repeated imports as idempotent rescans, and refresh SongsPage / AlbumsPage after import or scan completion through the shared `library:changed` event. Sidebar import entries are direct actions: `Import Folder` opens the folder picker instead of navigating, and `Import File` opens the local audio file picker without exposing Electron dialogs to Renderer code.

SongsPage must stay a list view, not an import wizard. Its folder-plus button may navigate to `ImportFolderPage` through the lightweight `app:navigate:import-folder` event, while `FoldersPage`, `ImportFolderPage`, and Settings reuse `LibraryFoldersPanel`.

TrackRow may start single-track local playback through a callback passed down from SongsPage. SongsPage may store `currentTrackId`, but high-frequency playback position and audio status must stay out of App.tsx and must not rerender the song list.

The current playback queue is only the visible/loaded SongsPage window. Do not expand it into a full playback queue until a LibraryService-backed queue service exists.

PlayerBar polling is temporary. Future playback/audio status should use throttled IPC push events such as `playback:onStatus` and `audio:onStatus`, and position updates must not rerender SongsPage or TrackList.

Library diagnostics are dev-only. They must use `library.getDiagnostics()`, must not trigger scans, and must not return full track lists, full cover records, binary cover data, or base64 cover data.

EQ changes must preserve the audio-thread boundary. Preset JSON storage belongs to main/native non-realtime code, not the JUCE callback. Native EQ parameters must be passed through atomic or lock-free state, smoothed before use, and must keep disabled/bypassed output bit-transparent once the bypass fade completes.
