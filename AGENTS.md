# ECHO AI Agent Guide

This file is the operating manual for any AI agent working in this repository. Read it before making changes. The goal is simple: keep ECHO stable, preserve the product experience, and stop large legacy entry files from growing even larger.

ECHO is an Electron + React desktop music player with native audio, streaming, lyrics, MV playback, playlist tools, remote libraries, plugin support, cast/remote features, and Windows packaging. Many important flows cross renderer, preload, main, and native audio code. Build success is necessary, but it is not enough.

## Current Hotspots

These files are already too large and should be treated as integration surfaces, not default implementation homes:

- `src/renderer/src/App.jsx`: legacy renderer orchestration, about 23k lines. It coordinates playback, library state, lyrics, MV, drawers, queue, settings, and many cross-feature handlers.
- `src/renderer/src/index.css`: legacy global style surface, about 12k lines. It contains broad app layout, theme, shell, and feature styles.
- `src/main/index.js`: legacy main-process integration surface, about 6.8k lines. It owns app startup, windows, IPC registration, dialogs, file IO routing, media services, sign-in windows, cast, remote, crash recovery, and native audio wiring.
- `src/preload/index.js`: IPC bridge surface. Smaller, but easy to bloat because every renderer-main feature wants an API here.

Rule of thumb: new behavior belongs in a focused module first; these files should only wire that module into the existing app.

## Non-Negotiables

1. Preserve the current ECHO product feel. Do not redesign the app unless the user explicitly asks.
2. Respect the dirty worktree. Do not revert, overwrite, or clean up changes you did not make.
3. Keep all source, docs, locale files, and scripts valid UTF-8.
4. Decode user-supplied text files through `src/shared/textEncoding.mjs` instead of hard-coding UTF-8.
5. Do not add broad feature logic to `App.jsx`, `index.css`, or `src/main/index.js` by default.
6. Prefer small, contiguous, reviewable patches over scattered edits.
7. Run the right guards and tests for the area touched.
8. Treat playback, lyrics, MV, queue scope, metadata, cover art, encoding, and Windows packaging as user-visible correctness surfaces.

## First Pass For Any Task

Before coding:

1. Check the current worktree with `git status --short`.
2. Search before editing. Use `rg` / `rg --files`.
3. Identify the real owner module for the change using the routing table below.
4. If the change may touch `App.jsx`, read `docs/APP_JSX_CHANGE_MAP.md` first.
5. If the change may touch user-facing text or locale JSON, plan to run `npm run guard:encoding`.
6. If behavior crosses renderer and main, inspect `src/preload/index.js` and the matching `ipcMain.handle(...)` in `src/main`.

## Preferred Routing

| Change type | Preferred location | Legacy file role |
| --- | --- | --- |
| Drawer or panel UI | `src/renderer/src/components/*Drawer.jsx` | `App.jsx` owns open state and passes props |
| Reusable UI control | `src/renderer/src/components` or `src/renderer/src/components/ui` | import and render only |
| Track rows, library display, compact visual polish | existing component or `src/renderer/src/styles/echo-track-list.css` | avoid large global CSS edits |
| Pure renderer data transforms | `src/renderer/src/utils/*.js` | call utility from existing handler |
| Playback queue/context logic | `src/shared/playbackSequence.mjs`, `src/shared/playbackPersistence.mjs`, or focused renderer utils | coordinate current track only |
| Lyrics parsing/ranking/storage/UI helpers | `src/shared/lyrics*.mjs`, `src/renderer/src/utils/lyrics*.js`, `src/renderer/src/components/Lyrics*.jsx` | keep track-specific state and render |
| MV URL parsing/search/ranking/visibility | `src/shared/mvSearchRank.mjs`, `src/renderer/src/utils/mv*.js`, main provider modules | store selected MV identity and render player |
| Defaults and persisted settings | `src/renderer/src/config/defaultConfig.js` plus normalization | wire through config state |
| Locale labels/copy | `src/renderer/src/locales/*.json` | reference translation keys |
| Main-process IO, dialogs, metadata, downloader, auth, provider work | focused files under `src/main` | register IPC and app/window lifecycle only |
| Native audio behavior | `src/main/audio/*` and `src/main/audio/engine/*` | expose narrow IPC handlers |
| Preload bridge | `src/preload/index.js` | expose a minimal, typed-ish API wrapper |
| Global style tokens | `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/echo-tokens.css` | import only |
| Feature-specific CSS | `src/renderer/src/styles/*` or component classes | avoid new unrelated sections in `index.css` |
| Packaging/release | `package.json`, `scripts/build-win.mjs`, `electron-app/build/*`, `docs/RELEASE_CHECKLIST.md` | keep version/artifact changes deliberate |

## The App.jsx Rule

`src/renderer/src/App.jsx` is a routing layer. It is allowed to change, but only when that is the clearest and smallest route.

Before editing `App.jsx`:

1. Read `docs/APP_JSX_CHANGE_MAP.md`.
2. State the exact region being touched: imports, config normalization, playback state, MV state, lyrics state, drawer state, library/playlist state, context menu handlers, or a specific JSX block.
3. Move new business logic into `src/renderer/src/components`, `src/renderer/src/utils`, `src/renderer/src/config`, `src/shared`, or `src/main` first.
4. Keep the `App.jsx` patch contiguous where possible.
5. Avoid adding broad `useEffect` hooks. If an effect is necessary, keep one owner, a narrow dependency list, and clear cleanup.
6. Do not patch nested JSX fragments one line at a time. Replace a complete nearby JSX block when structure changes.

After editing `App.jsx`:

- Run `npm run guard:app-jsx`.
- Run `npm run build` after renderer/main behavior changes.
- Run targeted unit tests when a helper/module was added or changed.

`npm run guard:app-jsx` is a soft warning by default. Use `STRICT_APP_JSX_GUARD=1` only when intentionally enforcing a blocking gate.

## The index.css Rule

`src/renderer/src/index.css` is a legacy global stylesheet. Do not treat it as the default place for new CSS.

Prefer:

- Tokens and shared theme variables: `src/renderer/src/styles/tokens.css` or `src/renderer/src/styles/echo-tokens.css`.
- Track list, library rows, dark-mode readability, and dense list behavior: `src/renderer/src/styles/echo-track-list.css`.
- Component-specific classes near the component's existing class names.

Before editing `index.css`:

1. Search for an existing class or feature section.
2. Check whether `echo-track-list.css` or a component-level class is the better owner.
3. Make the smallest possible selector change.
4. Avoid broad selectors that affect playback, lyrics, MV, mini-player, and settings at once.
5. Avoid visual rewrites for performance fixes unless the user asked for visual changes.

After style changes:

- Run `npm run build`.
- If text or locale-facing styles changed, visually check long Chinese/Japanese/English strings where feasible.
- For dark mode/readability changes, verify both light and dark theme selectors.

## The src/main/index.js Rule

`src/main/index.js` is a main-process router and lifecycle file, not a dumping ground.

Prefer:

- Downloader logic: `src/main/MediaDownloader.js`.
- Streaming providers: `src/main/streamingProvider.js`, `src/main/netease*.js`, `src/main/qqMusic*.js`.
- Lyrics provider logic: `src/main/lyricsProviders.js`, `src/main/neteaseLyrics.js`, renderer/shared lyrics utilities when appropriate.
- Remote library clients: `src/main/remote/*`.
- Cast and AirPlay/DLNA: `src/main/cast/*`.
- Crash handling: `src/main/CrashReporter.js`.
- Audio engine bridge: `src/main/audio/*`.
- File/tag/metadata helpers: `src/main/utils/*`.
- Dialog labels: `src/main/dialogLocale.js`.

When adding IPC:

1. Put the real work in a focused main module.
2. Register a narrow `ipcMain.handle(...)` in `src/main/index.js`.
3. Expose a small wrapper in `src/preload/index.js`.
4. Call it from renderer code through `window.api`.
5. Validate inputs in the main process. Never trust renderer payloads for filesystem paths, URLs, or auth-like data.

## Preload Bridge Rules

`src/preload/index.js` should stay a thin bridge.

- Do not put business logic here.
- Do not expose raw `ipcRenderer`.
- Use clear method names grouped by feature when possible.
- Keep payloads serializable.
- When adding a listener API, return an unsubscribe function and remove the exact listener.
- If a comment or label contains non-ASCII text, run `npm run guard:encoding`.

## Renderer Architecture Notes

Important current renderer areas:

- Entry: `src/renderer/src/main.jsx`.
- Main shell: `src/renderer/src/App.jsx`.
- Error boundary: `src/renderer/src/RendererErrorBoundary.jsx`.
- Floating windows: `src/renderer/src/LyricsDesktop.jsx`, `src/renderer/src/MiniPlayerWindow.jsx`.
- Components: `src/renderer/src/components`.
- UI primitives: `src/renderer/src/components/ui`.
- Renderer utilities: `src/renderer/src/utils`.
- Shared cross-runtime logic: `src/shared`.
- Locales: `src/renderer/src/locales`.
- Plugins renderer surface: `src/renderer/src/plugins`.

Keep expensive playback-time updates out of broad React state where possible. Be especially careful around current time, lyric index, MV sync, mini-player payloads, smart collections, recent/most-played collections, and wallpaper/glass effects.

## Audio And Playback Rules

Playback bugs are high-risk. Manual next/previous, auto-advance, gapless, and Automix must obey the same active playback context.

Preferred surfaces:

- Queue and context resolution: `src/shared/playbackSequence.mjs`, `src/shared/playbackPersistence.mjs`.
- Clock helpers: `src/shared/playbackClock.mjs`.
- Main audio orchestration: `src/main/audio/AudioEngine.js`.
- Native bridge: `src/main/audio/NativeAudioBridge.js`.
- Native host source: `src/main/audio/engine/*`.
- Renderer progress UI: `src/renderer/src/components/PlayerProgressControl.jsx`.

When touching playback:

- Test or reason through play, pause, seek, next, previous, track end, scoped playlist playback, and queue behavior.
- Do not let manual skip escape a user playlist, smart collection, history list, streaming list, or active search context.
- Do not change cover art or metadata loading as a side effect of memory/performance work unless the user explicitly allows it.
- For ASIO/WASAPI exclusive work, verify the native route and watch for hidden HTML audio/MV paths that can keep the DAC at the wrong sample rate.

## Lyrics Rules

Lyrics are user-visible and timing-sensitive.

Preferred surfaces:

- Shared parsing/timeline: `src/shared/lyricsTimeline.mjs`, `src/shared/lyricsKaraoke.mjs`, `src/shared/lyricsSourcePriority.mjs`.
- Renderer parsing/storage/ranking: `src/renderer/src/utils/lyrics*.js`.
- Local override cache: `src/renderer/src/utils/lyricsOverrideStorage.js`.
- Candidate picker: `src/renderer/src/components/LyricsCandidatePicker.jsx`.
- Settings drawer: `src/renderer/src/components/LyricsSettingsDrawer.jsx`.
- Providers/main fetch: `src/main/lyricsProviders.js`, `src/main/neteaseLyrics.js`.

Rules:

- Local/embedded/user-selected lyrics should not be silently overwritten by weak online matches.
- Instrumental-looking or ambiguous tracks should reject weak automatic matches.
- Successful online matches should be cached when the existing flow expects offline reuse.
- Lyric quick controls belong inside the lyric column, above the first lyric line.
- If timing changes, test seek and fast-forward behavior.

## MV And Streaming Rules

MV and streaming flows cross providers, renderer sync, and downloader/auth state.

Preferred surfaces:

- MV search ranking: `src/shared/mvSearchRank.mjs`.
- MV URL/source helpers: `src/renderer/src/utils/mv*.js`.
- Streaming UI: `src/renderer/src/components/StreamingView.jsx`.
- Streaming provider logic: `src/main/streamingProvider.js`, `src/main/netease*.js`, `src/main/qqMusic*.js`.
- Downloader: `src/main/MediaDownloader.js` and `src/renderer/src/components/MediaDownloaderDrawer.jsx`.

Rules:

- Do not reset Bilibili iframe/player `src` as a seek strategy.
- Be careful with direct Bilibili media loops and fallback behavior.
- Treat system-browser sign-in and cookie status as part of downloader correctness.
- Provider-bound lyrics should follow the streaming track identity, not a stale local track.

## Locale And Text Rules

- User-facing labels go in `src/renderer/src/locales/en.json`, `zh.json`, `zh-TW.json`, and `ja.json`.
- Keep locale keys consistent across all locale files.
- Do not leave fallback English visible in Chinese/Japanese UI for newly added strings.
- Run `npm run guard:encoding` after touching locale files or non-ASCII comments/text.
- Manually review mojibake warnings. The guard can warn on suspicious text even when valid UTF-8.
- For imported lyrics, playlists, theme/settings JSON, and TXT/M3U/LRC files, use `decodeTextBytes(...)` from `src/shared/textEncoding.mjs` so UTF-8, UTF-16, GB18030, Big5, Shift-JIS, and EUC-JP files do not render as mojibake.

## Tests And Validation

Common commands:

- `npm run build`: required after renderer/main behavior changes.
- `npm run test:unit`: runs all unit tests in `test/unit`.
- `node --test test/unit/<name>.test.mjs`: targeted unit test.
- `npm run guard:app-jsx`: required if `App.jsx` changed.
- `npm run guard:encoding`: required for locale/user-facing text/non-ASCII/comment encoding-sensitive changes.
- `npm run verify:release`: release sanity checks.
- `npm run build:audio-host`: native audio host build.
- `npm run build:airplay-raop`: AirPlay RAOP native dependency build.
- `npm run build:win`: Windows installer path.
- `npm run theme:audit`: theme audit/update when theme tokens are involved.

Target tests by area:

- Playback context: `test/unit/playbackSequence.test.mjs`, `playbackPersistence.test.mjs`, `playbackClock.test.mjs`.
- Lyrics: `lyrics*.test.mjs`, `neteaseLyrics*.test.mjs`, `embeddedLyrics.test.mjs`.
- MV: `mv*.test.mjs`, `bilibiliSearchHtml.test.mjs`.
- Metadata/tags/files: `trackUtils.test.mjs`, `wavInfoTags.test.mjs`, `ffmpegProbeAudioInfo.test.mjs`, `embeddedLyrics.test.mjs`.
- Remote libraries: `webDavClient.test.mjs`, `jellyfinClient.test.mjs`.
- UI payload helpers: `miniPlayerPayload.test.mjs`, `settingsSearch.test.mjs`, `themeColors.test.mjs`.

If tests cannot be run, state exactly why.

## Smoke-Test Matrix

Build success is the baseline. When touching related behavior, also smoke-test the affected flows:

- Playback: start, pause, seek, next, previous, track end, queue, scoped playlist.
- Lyrics: visibility, search, quick controls, local/embedded/online priority, seek sync.
- MV: YouTube/Bilibili selection, direct Bilibili playback, fallback, sync after seek, sustained smoothness.
- Context menus: tracks, covers, albums, artists, groups.
- Library: folder hierarchy, albums, artists, smart collections, playlists, drag/drop.
- Streaming/downloader: provider search, sign-in/cookie status, download progress, metadata application.
- Export: save dialogs, file formats, playlist import/export.
- Remote/cast: phone remote, DLNA/AirPlay send/receive when touched.
- Windows packaging: icon, shortcut, installer artifact name, app version, native resources.

## Performance And Memory Guidance

- Do not solve memory pressure by breaking cover art, metadata loading, or library richness unless explicitly requested.
- First inspect eager derived data, persisted app state size, renderer payloads, timers, and repeated state commits.
- For playback CPU spikes, inspect renderer timeupdate/current-time updates, lyric index updates, mini-player payload updates, smart collection recomputation, wallpaper/glass CSS, and GPU/compositor-heavy selectors before blaming decoding.
- Keep hot-path updates throttled and scoped.

## Git And File Hygiene

- Do not run destructive commands such as `git reset --hard`, `git checkout -- <file>`, or broad deletes unless the user explicitly asks.
- Do not stage or commit unrelated user changes.
- Do not edit generated build output unless the task is specifically about generated output.
- Avoid committing large local media files, logs, crash dumps, `dist`, `out`, or native build intermediates unless the user asks and the repo intentionally tracks them.
- Use `.codex-logs` only for local run logs; do not treat it as source.

## Documentation Expectations

When adding or changing architecture guidance:

- Update docs close to the affected system.
- Keep instructions concrete: paths, commands, and smoke tests.
- Do not add vague "be careful" notes without an actionable rule.
- If a rule exists because of a real regression, name the symptom and the safer path.

## Final Checklist For Agents

Before finishing:

1. Summarize files changed.
2. Report commands run and whether they passed.
3. Mention any commands not run and why.
4. Call out residual risk, especially when playback/MV/lyrics could not be manually smoked.
5. Keep the answer short enough for the user to act on.
