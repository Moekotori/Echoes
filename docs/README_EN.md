<div align="center">
  <img src="../logo.png" alt="ECHO" width="150" />

  <h1>ECHO</h1>

  <p><strong>**A desktop player designed for managing your local music library**  </strong></p>
  <p><strong>**ECHO is currently in a temporary update state; a higher-performance "ECHO Next" is coming soon!**</strong></p>
  <p>
    ECHO combines high-fidelity playback, immersive lyrics, MV, casting, plugins, and remote co-listening into a unified desktop workflow.
  </p>

  <p>
    <a href="https://github.com/Moekotori/ECHO/releases/latest">Latest Release</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="#quick-start">Quick Start</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="./plugin-development.md">Plugin Development</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="./RELEASE_CHECKLIST.md">Release Checklist</a>
  </p>

  <p>
    <a href="../README.md">README 中文</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="./README_EN.md">README English</a>
  </p>

  <p>
    <img src="https://img.shields.io/github/package-json/v/Moekotori/ECHO?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/Electron-31.x-47848f?style=flat-square" alt="Electron 31" />
    <img src="https://img.shields.io/badge/React-18.3-61dafb?style=flat-square" alt="React 18" />
    <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square" alt="Node.js >= 18" />
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
  </p>

</div>

***

<div align="center">

## Understanding ECHO

ECHO is a complete desktop music product, not just a player UI. It spans Electron main process, React renderer, native audio host, plugin sandbox, WebSocket co-listening service, and cross-platform build/release verification. The focus is not on feature accumulation, but on building a stable, integrated desktop listening experience.

| Area                | Implementation                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Desktop Engine      | Electron handles windows, system capabilities, IPC, updates, and local resources; React powers the player UI, library view, and immersive interface.            |
| Audio Pipeline      | `echo-audio-host` runs audio output independently, supports device switching, WASAPI Exclusive Mode, real-time EQ, and automatic fallback. |
| Content Experience  | Local library, playlists, favorites, playback queue, lyrics (line/word-level), MV playback, floating lyrics window, and shareable cards.                         |
| Extensibility       | Plugins declare permissions via `plugin.json` to extend music sources, lyrics, UI slots, and settings.                    |
| Collaboration       | `Listen Together` enables room-based synchronized co-listening while preserving full control of the local player.                   |
| Release Quality     | Includes unit tests, release verification scripts, smoke test docs, and Windows OTA artifact checks.                             |

## Project Positioning

</div>

Unlike most desktop players, ECHO focuses on long-term usability: controllable audio output, synchronized lyrics and MV, safe plugin extensions, clear pre-release checks, and actionable logs.



It showcases capabilities such as:

- Desktop architecture with Electron main/renderer separation
- Coordinated management of player state, library, and lyrics/MV
- Bridging native audio with front-end UI
- Plugin permissions, isolation, and controlled APIs
- Complete workflow from development to testing and release

<div align="center">

## Core Features

| Module                   | Description                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Local Library            | Import local music, scan folders, aggregate covers, album view, playback history, favorites, and custom playlists.              |
| HiFi Playback            | Native audio host for high-fidelity output, device switching, WASAPI Exclusive Mode, playback speed control, and real-time EQ.  |
| Lyrics Experience        | LRC support, line/word highlighting, clickable lyrics, auto-fetch from NetEase, Japanese romaji conversion.                     |
| MV & Video               | Auto-match YouTube/Bilibili MVs; full-screen immersive mode.                                                                    |
| Download & Import        | Download from YouTube, Bilibili, SoundCloud; write metadata and covers; NetEase playlist import.                                |
| Casting & Co-Listening   | DLNA casting; Listen Together service for synchronized playback.                                                                |
| Plugin System            | Extend music sources, lyrics, settings, and UI areas; controlled via declared permissions.                                      |
| Theme System             | CSS variable-based themes, with editor, import/export, and consistency checks.                                                  |
| Desktop Integration      | Auto-update, Discord Rich Presence, crash logs, shareable cards, and multilingual UI.                                           |

## Tech Stack

| Layer                | Technology                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| Desktop Runtime      | Electron 31, electron-builder, electron-updater                            |
| Frontend UI          | React 18, React DOM, i18next, lucide-react                                 |
| Build Tools          | electron-vite, Vite, ESLint, Prettier                                      |
| Audio Processing     | `echo-audio-host`, naudiodon, FFmpeg, music-metadata, jsmediatags          |
| Content & Networking | axios, ws, youtube-dl-exec, NetEase Cloud Music API                        |
| Plugin Capability    | Node.js `vm` sandbox, manifest permissions, main/renderer extension points |
| Release Quality      | node:test, release verify scripts, desktop smoke checklist                 |

## Architecture Overview

</div>

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ React Renderer                                                                                   │
│ Player UI, Library View, Lyrics/MV, Plugins, Settings                                            │
└─────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                  │ Context Bridge / IPC
┌─────────────────────────────────────────────────▼────────────────────────────────────────────────┐
│ Electron Main Process                                                                            │
│ Window management, local resources, plugin management, updates, casting, Listen Together, logs   │
└───────────────────────┬──────────────────────────────────────────────────┬───────────────────────┘
                        │                                                  │
┌───────────────────────▼──────────────────────┐    ┌──────────────────────▼───────────────────────┐
│ Native Audio Host                            │    │ Listen Together Server                       │
│ Device output, HiFi, EQ, fallback            │    │ WebSocket room sync                          │
└──────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

<div align="center">

This separates risky capabilities from the UI: renderer handles experience, main process handles desktop features, audio host handles playback output. Plugins run through controlled APIs to prevent destabilizing the host.

## Quick Start

### Requirements

| Dependency | Version                                                   |
| ---------- | --------------------------------------------------------- |
| Node.js    | 18+                                                       |
| npm        | 9+                                                        |
| System     | Windows primary; macOS/Linux supported with build scripts |

Recommended: Node.js 20 LTS.

### Build Environment

</div>

The project includes native audio dependencies (such as `node-libraop`), and on Windows, a build toolchain is required:

- **Recommended: Visual Studio 2022**，with **"Desktop development with C++"** workload（MSVC toolset）
- Or run as admin: `npm install --global windows-build-tools` to install basic build tools

<div align="center">

### Install Dependencies

Because the `@lox-audioserver/node-libraop` component in this project uses foreign npm sources, installations may fail.  
It is recommended to use the Taobao mirror registry in China for installation:

</div>

```bash
# Set npm registry to Taobao mirror
npm config set registry https://registry.npmmirror.com

# Optional: set Electron binary mirror to accelerate download
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/

# Install dependencies
npm install
```

> **Note**: `@lox-audioserver/node-libraop` is an optional component used for the AirPlay RAOP receiver functionality. If this component fails to install, it does not affect core playback; only AirPlay receiver features will be unavailable.

The project contains native dependencies, which will be automatically handled for the Electron runtime after installation via `electron-builder install-app-deps`.

<div align="center">

### Local Development

</div>

```bash
git clone https://github.com/Moekotori/ECHO.git
cd ECHO
npm install
npm run dev
```

After starting, the app will enter Electron development mode, with the renderer layer receiving hot updates via `electron-vite`.

<div align="center">

## Build

</div>

```bash
# General build
npm run build

# Windows installer
npm run build:win

# Windows release with updater artifacts
npm run build:win:release

# macOS
npm run build:mac

# Linux
npm run build:linux
```

The Windows release build outputs the installer, `.blockmap`, `latest.yml`, and other files required for automatic updates.

<div align="center">

## Testing & Release Checks

</div>

```bash
# Unit regression tests
npm run test:unit

# Pre-release verification
npm run verify:release
```

<div align="center">

Before a release, it is recommended to follow the full checklist in `docs/RELEASE_CHECKLIST.md` and combine it with `docs/SMOKE_AUDIO.md` to cover app launch recovery, playback control, device switching, WASAPI Exclusive Mode, EQ, plugins, lyrics/MV, DLNA, and Listen Together functionality.

## Listen Together Server

ECHO’s synchronized co-listening feature is handled by a separate service and can be deployed independently.

</div>

```bash
cd server/listen-together
npm install
PORT=8787 npm start
```

<div align="center">

For production deployment, refer to `server/listen-together/DEPLOY_FROM_ZERO_ZH.md`, which includes steps for reverse proxy and process management.

## Plugin Development

ECHO plugins are installed as folders, with each plugin containing at least a `plugin.json` file.

</div>

```text
my-plugin/
  plugin.json
  main.js
  renderer.js
  styles.css
  locales/
  icon.png
```

<div align="center">

Plugins can declare permissions for network, storage, and UI slots, and interact with the host through controlled APIs.  
Main process plugins run inside a Node.js `vm` sandbox, preventing direct access to `require`, `fs`, `child_process`, and other Node.js capabilities;  
renderer process plugins extend the UI by registering components, hooks, and settings panels.

The full API reference and examples can be found in [`docs/plugin-development.md`](../docs/plugin-development.md) and [`examples/`](../examples/).

## Project Structure

</div>

```
src/
  main/          # Electron main process (IPC, audio engine, plugins)
    audio/       # Native audio bridge and AudioEngine wrapper
    cast/        # DLNA renderer
    plugins/     # Plugin manager, sandbox, storage
  preload/       # Context bridge exposing APIs to renderer
  renderer/
    src/
      components/  # Reusable UI components
      locales/     # i18n translation files (en, zh, ja)
      styles/      # Global styles and theme variables
      App.jsx      # Root application component
server/
  listen-together/  # WebSocket-based co-listening server
  scripts/          # Build and maintenance scripts
  docs/             # Developer documentation
  examples/         # Example plugins
```

<div align="center">

## Design Decisions

</div>

- The audio pipeline operates independently of the renderer process. Playback runs in a separate host process to minimize UI changes affecting audio stability.
- Plugin capabilities are first scoped with clear boundaries before exposing extension points. Plugins declare their permissions via the manifest, and the host provides controlled APIs according to those permissions.
- The release workflow is formalized. Build, unit tests, release verification, and desktop smoke testing are organized into executable commands and documentation.
- Local experience is prioritized. Library, lyrics, MV playback, casting, and co-listening are all centered around the currently playing track to reduce fragmentation between features.

<div align="center">

## Open Source Credits

</div>

ECHO uses the following open-source projects:

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [electron-vite](https://electron-vite.org/)
- [electron-builder](https://www.electron.build/)
- [naudiodon](https://github.com/Streampunk/naudiodon)
- [FFmpeg](https://ffmpeg.org/)
- [music-metadata](https://github.com/borewit/music-metadata)
- [Kuroshiro](https://kuroshiro.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [i18next](https://github.com/i18next/i18next)

<div align="center">

## Star History

</div>

<p align="center">
  <a href="https://star-history.com/#Moekotori/ECHO&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date" />
      <img alt="ECHO Star History" src="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date" />
    </picture>
  </a>
</p>

<div align="center">

<p>A modern, feature-rich desktop music player built with Electron and React.</p>

<p>
  <a href="https://github.com/Moekotori/Echoes/releases/latest">
    <img src="https://img.shields.io/github/v/release/Moekotori/Echoes?label=release&color=blue" alt="Latest Release">
  </a>
  <a href="https://github.com/Moekotori/Echoes/releases">
    <img src="https://img.shields.io/github/downloads/Moekotori/Echoes/total?color=brightgreen" alt="Downloads">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/electron-31.x-47848f" alt="Electron">
  <img src="https://img.shields.io/badge/react-18-61dafb" alt="React">
</p>

<p>
  <a href="https://github.com/Moekotori/Echoes/releases/latest">
    <strong>Download latest release</strong>
  </a>
  &nbsp;&middot;&nbsp;
  <a href="docs/plugin-development.md">Plugin Development</a>
  &nbsp;&middot;&nbsp;
  <a href="#getting-started">Getting Started</a>
</p>

</div>