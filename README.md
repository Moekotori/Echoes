<div align="center">

<img src="logo.png" alt="ECHO" width="180" />

<h1>ECHO</h1>

<p>A desktop music player focused on audio quality, lyrics, and extensibility.</p>

<p>
  <a href="https://github.com/Moekotori/ECHO/releases/latest">
    <img src="https://img.shields.io/github/v/release/Moekotori/ECHO?label=release&color=blue" />
  </a>
  <a href="https://github.com/Moekotori/ECHO/releases">
    <img src="https://img.shields.io/github/downloads/Moekotori/ECHO/total?color=brightgreen" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows" />
  <img src="https://img.shields.io/badge/electron-31.x-47848f" />
</p>

<p>
  <a href="https://github.com/Moekotori/ECHO/releases/latest"><b>Download</b></a>
  &nbsp;·&nbsp;
  <a href="docs/plugin-development.md">Plugin Development</a>
  &nbsp;·&nbsp;
  <a href="#getting-started">Getting Started</a>
</p>

</div>

---

> If you want to clone and build from source, use the `moe/carnary` branch. `main` tracks stable releases.

## Overview

ECHO is a Windows desktop music player built on Electron and React. It runs audio through an out-of-process native host for WASAPI exclusive output, syncs lyrics line-by-line or word-by-word, matches and plays YouTube/Bilibili music videos, and supports synchronized co-listening over WebSocket. A sandboxed plugin system lets you add custom music sources, lyrics providers, and UI panels.

---

## Features

**Audio**

- WASAPI Exclusive Mode for bit-perfect output on Windows
- Out-of-process native audio host (`echo-audio-host`) — main process crashes don't interrupt playback
- Parametric EQ with per-band control and presets
- 24-bit / 192kHz support
- NCM format conversion

**Lyrics**

- Line-by-line and word-level karaoke highlighting
- NetEase lyrics auto-fetch with manual candidate search
- Japanese romaji conversion via Kuroshiro
- Floating desktop lyrics overlay

**Music Video**

- Auto-matches and plays YouTube or Bilibili MV alongside local tracks
- Quality selection, direct stream support, fullscreen MV-as-background mode

**Library & Playback**

- Folder-based local library with drag-and-drop import
- Album view, playlists, liked tracks, queue management
- Playback rate control with pitch preservation
- Audio output device switching without stopping playback

**Network**

- Room-based synchronized co-listening via self-hosted WebSocket server
- DLNA cast to network renderers
- Subsonic, WebDAV, and Jellyfin remote library support

**Download**

- Download audio from YouTube, Bilibili, and SoundCloud via yt-dlp
- Metadata and cover art written automatically

**Other**

- Sandboxed plugin system (music sources, lyrics providers, UI panels)
- CSS variable-based theme engine with in-app editor
- Discord Rich Presence
- OTA auto-update via GitHub Releases
- English, Simplified Chinese, Traditional Chinese, and Japanese UI

---

## Requirements

| | |
|---|---|
| OS | Windows 10 / 11 |
| Node.js | >= 18 (20 LTS recommended for native modules) |
| npm | >= 9 |

---

## Getting Started

```bash
git clone -b moe/carnary https://github.com/Moekotori/ECHO.git
cd ECHO
npm install
npm run dev
```

If you are in mainland China, the project `.npmrc` points to a domestic registry mirror.

Native modules (`naudiodon`) compile automatically via the `postinstall` hook.

---

## Building

```bash
npm run build:win          # NSIS installer under dist/
npm run build:win:release  # includes .blockmap and latest.yml for auto-update
```

---

## Testing

```bash
npm run test:unit     # unit regression suite
npm run verify:release  # pre-release checks
```

---

## Listen Together Server

```bash
cd server/listen-together
npm install
PORT=8787 npm start
```

For production deployment with Nginx and PM2, see [`server/listen-together/DEPLOY_FROM_ZERO_ZH.md`](server/listen-together/DEPLOY_FROM_ZERO_ZH.md).

---

## Plugin Development

Plugins live in the user plugin directory and load at startup. Each plugin is a folder with a `plugin.json` manifest and optional `main.js`, `renderer.js`, and `styles.css`.

Full API reference: [`docs/plugin-development.md`](docs/plugin-development.md)  
Examples: [`examples/`](examples/)

---

## Project Structure

```
src/
  main/           # Electron main process (IPC, audio, plugins, cast)
    audio/        # Native audio bridge and AudioEngine
    cast/         # DLNA renderer
    plugins/      # Plugin manager and sandbox
  preload/        # Context bridge
  renderer/
    src/
      components/ # UI components
      locales/    # i18n (en, zh, ja)
      styles/     # Global styles and theme variables
      App.jsx     # Root component
server/
  listen-together/  # WebSocket co-listening server
scripts/            # Build and maintenance scripts
docs/               # Developer documentation
examples/           # Example plugins
```

---

## FAQ

**Why WASAPI exclusive mode?**

In shared mode, Windows resamples audio to the system default format (typically 48kHz/16-bit), which alters the signal. Exclusive mode bypasses the mixer entirely for bit-perfect output.

**Does Listen Together need a public server?**

No. `server/listen-together` works on a local LAN. Any environment that runs Node.js works.

**Are plugins sandboxed?**

Yes. Plugins declare permissions explicitly; network and file access is gated by the plugin manifest. See the plugin development docs for details.

**NetEase or Bilibili APIs stopped working?**

Open an issue or use the plugin system to add an alternative source.

---

## Contributors

<a href="https://github.com/Moekotori/ECHO/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Moekotori/ECHO" />
</a>

Special thanks to [@jerry155756294](https://github.com/jerry155756294) for their contributions.

---

## Contributing

1. Fork and create a feature branch.
2. Follow the existing code style — run `npm run lint` and `npm run format` before committing.
3. Open a pull request with a clear description.

---

## Acknowledgements

ECHO is built on top of these open-source projects:

[Electron](https://electronjs.org) · [React](https://react.dev) · [electron-vite](https://electron-vite.org) · [naudiodon](https://github.com/Streampunk/naudiodon) · [Kuroshiro](https://kuroshiro.org) · [music-metadata](https://github.com/Borewit/music-metadata) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [FFmpeg](https://ffmpeg.org) · [lucide-react](https://lucide.dev)

---

## License

MIT — see [LICENSE](LICENSE).
