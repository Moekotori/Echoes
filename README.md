<div align="center">
  <img src="./logo.png" alt="ECHO" width="150" />


  <h1>ECHO</h1>

  <p><strong>为本地音乐收藏设计的桌面播放器</strong></p>

  <p>
    ECHO 将高保真播放、沉浸歌词、MV、投屏、插件扩展与远程共听收束到同一个桌面工作流中。
  </p>


  <p>
    <a href="https://github.com/Moekotori/ECHO/releases/latest">Latest Release</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="#快速开始">快速开始</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="./docs/plugin-development.md">插件开发</a>
    <span>&nbsp;|&nbsp;</span>
    <a href="./docs/RELEASE_CHECKLIST.md">发布检查</a>
  </p>


  <p>
    <img src="https://img.shields.io/github/package-json/v/Moekotori/ECHO?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/Electron-31.x-47848f?style=flat-square" alt="Electron 31" />
    <img src="https://img.shields.io/badge/React-18.3-61dafb?style=flat-square" alt="React 18" />
    <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square" alt="Node.js >= 18" />
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
  </p>

</div>

---

## 30 秒看懂 ECHO

ECHO 是一个完整的桌面音乐产品，而不是简单的播放器界面。项目覆盖 Electron 主进程、React 渲染层、原生音频宿主进程、插件沙箱、WebSocket 共听服务、跨平台打包与发布校验。它的重点不是堆功能，而是把听歌场景里经常被割裂的能力做成一条稳定的桌面端体验链路。

| 方向       | 项目里的实现                                                 |
| ---------- | ------------------------------------------------------------ |
| 桌面端工程 | Electron 负责窗口、系统能力、IPC、更新与本地资源管理；React 负责播放器交互、曲库视图与沉浸式界面。 |
| 音频链路   | 独立 `echo-audio-host` 承担音频输出，支持设备切换、WASAPI Exclusive Mode、实时 EQ 与异常回退。 |
| 内容体验   | 本地曲库、歌单、收藏、播放队列、逐行/逐词歌词、MV 播放、歌词桌面悬浮窗与分享卡片导出。 |
| 扩展能力   | 插件通过 `plugin.json` 声明权限与贡献点，可扩展音乐源、歌词源、UI 插槽与设置面板。 |
| 协作场景   | `Listen Together` 通过独立服务实现房间式同步共听，并保留本地播放器的完整控制体验。 |
| 发布质量   | 提供单元测试、发布校验脚本、桌面烟测文档与 Windows OTA 构建产物检查。 |

## 项目定位

很多桌面播放器只解决“能播放”的问题。ECHO 更关注长期使用时的细节：音频输出是否可控，歌词和 MV 是否能跟随播放状态，插件是否可以安全扩展，发布前是否有明确的回归检查，异常情况是否能落到可诊断的日志里。

它适合展示以下能力：

- Electron 桌面端工程组织与主/渲染进程边界设计
- 复杂播放器状态、曲库状态、歌词/MV 状态的协调
- 原生音频能力与前端 UI 的桥接
- 插件系统的权限设计、运行隔离与 API 约束
- 从开发、测试到打包发布的完整产品化流程

## 核心功能

| 模块       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| 本地曲库   | 支持本地音乐导入、文件夹扫描、封面聚合、专辑视图、播放历史、收藏与自定义歌单。 |
| HiFi 播放  | 通过原生音频宿主进程承载播放链路，支持输出设备切换、WASAPI 独占模式、播放速率控制与实时参数均衡。 |
| 歌词体验   | 支持 LRC 歌词、逐行高亮、逐词卡拉 OK 高亮、歌词点击跳转、网易云歌词检索与日文罗马音转换。 |
| MV 与视频  | 支持围绕当前曲目匹配 YouTube 与 Bilibili MV，可作为播放背景进入全屏沉浸模式。 |
| 下载与导入 | 支持从 YouTube、Bilibili、SoundCloud 下载音频，并写入基础元数据与封面信息；支持网易云歌单导入。 |
| 投屏与共听 | 支持 DLNA 投屏；提供 Listen Together 服务，用于房间式远程同步播放。 |
| 插件系统   | 插件可扩展音乐源、歌词源、设置项和 UI 区域，并通过权限声明限制访问边界。 |
| 主题系统   | 基于 CSS 变量实现主题能力，支持主题编辑、导入、导出与一致性检查。 |
| 桌面集成   | 支持自动更新、Discord Rich Presence、崩溃日志查看、分享卡片导出和多语言界面。 |

## 技术栈

| 层级       | 技术选型                                                     |
| ---------- | ------------------------------------------------------------ |
| 桌面运行时 | Electron 31, electron-builder, electron-updater              |
| 前端界面   | React 18, React DOM, i18next, lucide-react                   |
| 构建工具   | electron-vite, Vite, ESLint, Prettier                        |
| 音频处理   | `echo-audio-host`, naudiodon, FFmpeg, music-metadata, jsmediatags |
| 内容与网络 | axios, ws, youtube-dl-exec, NetEase Cloud Music API          |
| 插件能力   | Node.js `vm` 沙箱、manifest 权限声明、主进程与渲染进程扩展点 |
| 发布质量   | node:test, release verify scripts, desktop smoke checklist   |

## 架构概览

```text
┌────────────────────────────────────────────────────────────┐
│ React Renderer                                              │
│ 播放器 UI、曲库视图、歌词/MV、插件 UI、设置面板              │
└──────────────────────────────┬─────────────────────────────┘
                               │ Context Bridge / IPC
┌──────────────────────────────▼─────────────────────────────┐
│ Electron Main Process                                        │
│ 窗口管理、本地资源、插件管理、更新、投屏、共听、日志          │
└───────────────┬──────────────────────────────┬─────────────┘
                │                              │
┌───────────────▼──────────────┐   ┌───────────▼─────────────┐
│ Native Audio Host             │   │ Listen Together Server   │
│ 设备输出、HiFi、EQ、回退       │   │ WebSocket 房间同步        │
└──────────────────────────────┘   └─────────────────────────┘
```

这个结构把高风险能力从 UI 中拆开：渲染进程负责体验，主进程负责桌面能力，音频宿主进程负责播放输出。插件系统也被放在受控 API 之后，避免扩展能力直接破坏宿主应用。

## 快速开始

### 环境要求

| 依赖    | 版本                                                      |
| ------- | --------------------------------------------------------- |
| Node.js | 18 或更高                                                 |
| npm     | 9 或更高                                                  |
| 系统    | Windows 为主要开发与测试平台，macOS 与 Linux 提供构建脚本 |

推荐使用 Node.js 20 LTS。项目包含原生依赖，安装后会通过 `electron-builder install-app-deps` 自动处理 Electron 运行时依赖。

### 本地运行

```bash
git clone https://github.com/Moekotori/ECHO.git
cd ECHO
npm install
npm run dev
```

启动后会进入 Electron 开发模式，渲染层由 `electron-vite` 提供热更新。

## 构建

```bash
# 通用构建
npm run build

# Windows 安装包
npm run build:win

# Windows 发布构建，包含 electron-updater 所需产物
npm run build:win:release

# macOS
npm run build:mac

# Linux
npm run build:linux
```

Windows 发布构建会输出安装包、`.blockmap` 与 `latest.yml` 等自动更新相关文件。

## 测试与发布检查

```bash
# 单元回归测试
npm run test:unit

# 发布前校验
npm run verify:release
```

发布前建议按 `docs/RELEASE_CHECKLIST.md` 执行完整检查，并结合 `docs/SMOKE_AUDIO.md` 覆盖启动恢复、播放控制、设备切换、WASAPI 独占模式、EQ、插件、歌词/MV、DLNA 与共听入口。

## Listen Together 服务

ECHO 的同步共听能力由独立服务承载，可以单独部署。

```bash
cd server/listen-together
npm install
PORT=8787 npm start
```

生产部署可参考 `server/listen-together/DEPLOY_FROM_ZERO_ZH.md`，其中包含反向代理与进程管理相关步骤。

## 插件开发

ECHO 的插件以文件夹形式安装，每个插件至少包含一个 `plugin.json`。

```text
my-plugin/
  plugin.json
  main.js
  renderer.js
  styles.css
  locales/
  icon.png
```

插件可以声明网络、存储、UI 插槽等权限，并通过受控 API 与宿主通信。主进程插件运行在 Node.js `vm` 沙箱中，不能直接访问 `require`、`fs`、`child_process` 等 Node.js 能力；渲染进程插件通过注册组件、Hook 与设置项参与界面扩展。

完整 API 与示例见 `docs/plugin-development.md` 与 `examples/`。

## 项目结构

```text
src/
  main/                 Electron 主进程，负责 IPC、音频、插件、投屏与更新
    audio/              Native audio bridge 与 AudioEngine 封装
    cast/               DLNA renderer 相关能力
    plugins/            插件管理、沙箱与插件存储
  preload/              Context Bridge，对渲染进程暴露安全 API
  renderer/
    src/
      components/       可复用 UI 组件
      locales/          en、zh、ja 多语言资源
      styles/           全局样式与主题变量
      App.jsx           渲染层入口
server/
  listen-together/      WebSocket 同步共听服务
scripts/                构建、校验与维护脚本
docs/                   插件、发布与桌面烟测文档
examples/               插件示例
```

## 工程取舍

- 音频链路不依赖渲染进程。播放输出放到独立宿主进程中，降低 UI 变更对音频稳定性的影响。
- 插件能力先定义边界，再开放入口。插件通过 manifest 声明能力，宿主应用按权限提供 API。
- 发布流程显式化。构建、单元测试、发布校验和桌面烟测被整理为可执行命令与文档。
- 本地体验优先。曲库、歌词、MV、投屏、共听都围绕“正在播放的歌曲”组织，减少功能之间的割裂感。

## 相关开源项目

ECHO 的实现参考并使用了以下开源生态：

- Electron
- React
- electron-vite
- electron-builder
- naudiodon
- FFmpeg
- music-metadata
- Kuroshiro
- yt-dlp
- i18next

## Star History

<p align="center">
  <a href="https://star-history.com/#Moekotori/ECHO&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date" />
      <img alt="ECHO Star History" src="https://api.star-history.com/svg?repos=Moekotori/ECHO&type=Date" />
    </picture>
  </a>
</p>

