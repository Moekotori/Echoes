import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  session,
  net,
  clipboard,
  nativeImage,
  Tray,
  Menu,
  globalShortcut,
  safeStorage
} from 'electron'
import { createRequire } from 'module'
import { join, basename, dirname, extname, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { execSync as _execSyncUtf } from 'child_process'

// Fix Windows console encoding so CJK characters in logs aren't garbled
if (process.platform === 'win32') {
  try {
    _execSyncUtf('chcp 65001', { stdio: 'ignore' })
  } catch {
    /* best-effort */
  }
}

// YouTube 内嵌 MV：主界面来自 localhost / 本地 file，embed 为跨域 iframe。Chromium 默认按「顶级站点 × 嵌入源」做
// 存储分区，导致在「应用内登录」子窗口（同一会话）里写入的 youtube.com Cookie 无法被该 iframe 读取，
// 仍会提示「请登录 / 机器人验证」。须在 app ready 之前关闭第三方存储分区。（合规桌面应用常见做法，非绕过验证逻辑。）
const disabledChromiumFeatures = ['ThirdPartyStoragePartitioning']

// Keep WinRTSessionManager enabled by default so Chromium can expose ECHO's
// Media Session to Windows SMTC. If a machine hits the old WinRT/WTS crash,
// launch with ECHO_DISABLE_WINDOWS_SMTC=1 to fall back to the previous path.
if (process.env.ECHO_DISABLE_WINDOWS_SMTC === '1') {
  disabledChromiumFeatures.push('WinRTSessionManager')
}

app.commandLine.appendSwitch('disable-features', disabledChromiumFeatures.join(','))
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService')
// Reduce Chromium automation markers for embedded sign-in windows.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import { existsSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { execFile, spawn } from 'child_process'
import nodeNet from 'node:net'
import DiscordRPC from 'discord-rpc'
import axios from 'axios'
import http from 'http'
import { randomBytes } from 'crypto'
import { audioEngine } from './audio/AudioEngine'
import { listAsioDevices } from './audio/NativeAudioBridge.js'
import { DlnaMediaRenderer } from './cast/DlnaMediaRenderer.js'
import { AirplayRaopReceiver } from './cast/AirplayRaopReceiver.js'
import { UpnpSender } from './cast/UpnpSender.js'
import {
  SubsonicClient,
  isSubsonicTrackPath,
  parseSubsonicTrackPath
} from './remote/SubsonicClient.js'
import {
  WebDavClient,
  isWebDavTrackPath,
  mapWebDavFile,
  parseWebDavTrackPath
} from './remote/WebDavClient.js'
import {
  JellyfinClient,
  isJellyfinLikeSourceType,
  isJellyfinTrackPath,
  parseJellyfinTrackPath
} from './remote/JellyfinClient.js'
import { PhoneRemoteServer } from './remote/PhoneRemoteServer.js'
import { initCrashReporter, logError, getCrashDir } from './CrashReporter'
import MediaDownloader from './MediaDownloader'
import { importPlaylistFromLink } from './playlistLinkImport.js'
import { importSharedPlaylists } from './playlistShareImport.js'
import { convertLinesToRomaji } from './romajiKuroshiro.js'
import {
  collectAudioFilesRecursive,
  createLibraryWatchManager,
  rescanImportedFolders
} from './utils/libraryWatcher.js'
import {
  buildNeteaseErrorLogPayload,
  fetchNeteaseLrcText,
  repairPossiblyMojibakeText,
  withQuietNeteaseConsole,
  searchNeteaseSongs,
  getNeteaseSongDirectUrl
} from './neteaseLyrics.js'
import { searchExternalLyrics } from './lyricsProviders.js'
import {
  NETEASE_COOKIE_DOMAINS,
  buildNcmRequestOptions,
  getNeteaseCookieFromSession,
  validateNeteaseCookie
} from './neteaseAuth.js'
import {
  QQ_MUSIC_COOKIE_DOMAINS,
  getQqMusicCookieFromSession,
  validateQqMusicCookie
} from './qqMusicAuth.js'
import {
  getQqMusicAlbumTracks,
  getQqMusicSongDirectUrl,
  searchQqMusicAlbums,
  searchQqMusicArtists,
  searchQqMusicSongs
} from './qqMusicProvider.js'
import {
  fetchStreamingPlaylist,
  fetchStreamingNeteaseDailyRecommendations,
  fetchStreamingLyrics,
  isStreamingTrackPath,
  parseStreamingTrackPath,
  resolveStreamingPlayback,
  searchStreamingCatalog
} from './streamingProvider.js'
import { getMediaDurationSeconds } from './utils/ffmpegProbeDuration.js'
import {
  getFfmpegAudioInfo,
  normalizeResolvedAudioCodecLabel,
  shouldPreferFfmpegAudioInfo,
  shouldUseFfmpegAudioInfo
} from './utils/ffmpegProbeAudioInfo.js'
import { detectBpm } from './utils/detectBpm.js'
import {
  EMBEDDED_LYRICS_EXTRACTOR_VERSION,
  extractEmbeddedLyricsText
} from './utils/embeddedLyrics.js'
import {
  findFolderCoverDataUrl,
  findInfoSidecarCoverDataUrl,
  readInfoSidecarMetadata
} from './utils/folderCover.js'
import { getResolvedFfmpegStaticPath } from './utils/resolveFfmpegStaticPath.js'
import { getCueAudioPath, getCueDuration, parseCueVirtualPath } from '../shared/cueTracks.mjs'
import { repairPossiblyMojibakeSearchQuery } from './utils/mojibakeRepair.js'
import { parseBilibiliSearchHtml } from './utils/bilibiliSearchHtml.js'
import { logLine as writeLogLine } from './utils/logLine.js'
import { getDialogStrings } from './dialogLocale.js'
import PluginManager from './plugins/PluginManager.js'
import { rankBilibiliVideoResults, rankYoutubeVideoResults } from '../shared/mvSearchRank.mjs'

const APP_NAME = 'ECHO'
const APP_USER_MODEL_ID = 'com.echoes.studio'
const APP_USER_DATA_DIR_NAME = 'ECHO'

try {
  app.setPath('userData', join(app.getPath('appData'), APP_USER_DATA_DIR_NAME))
} catch {
  /* keep Electron default when appData is unavailable */
}

app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

// Single-instance lock: prevents a second ECHO process from racing the first one
// on the same %APPDATA%\ECHO\ LevelDB / IndexedDB exclusive locks. Without this:
//   * After installer overwrites the .exe while the old process is still in tray,
//     launching the new build produces a white window (renderer can't open IndexedDB).
//   * Opening ECHO twice leaves the second window unable to load any cached metadata.
// Must be called AFTER app.setPath('userData', ...) above, since the lock is keyed
// by the userData path.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // Use exit() rather than quit() so before-quit handlers (which would try to stop
  // the renderer HTTP server / native audio host that the *primary* instance owns)
  // never run in this short-lived secondary process.
  app.exit(0)
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
      }
    } catch (err) {
      console.error('[SingleInstance] focus existing window failed:', err?.message || err)
    }
  })
}

import { lastFmClient } from './lastfm.js'
import { buildUpdaterEventDedupeKey, shouldReuseUpdaterState } from '../shared/updaterState.mjs'

const require = createRequire(import.meta.url)

function getNcmApi() {
  return require('@neteasecloudmusicapienhanced/api')
}

const NETEASE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const NETEASE_SEARCH_RATE_LIMIT_COOLDOWN_MS = 60 * 1000
const neteaseCloudSearchCache = new Map()
const neteaseCloudSearchInFlight = new Map()
let neteaseCloudSearchCooldownUntil = 0
let neteaseCloudSearchLastWarnAt = 0

function buildNeteaseCloudSearchCacheKey(kind, keywords) {
  return `${kind}:${String(keywords || '').trim().toLowerCase()}`
}

function getNeteaseErrorText(payload) {
  return repairPossiblyMojibakeText(
    payload?.body?.message ||
      payload?.body?.msg ||
      payload?.message ||
      payload?.body?.code ||
      ''
  )
}

function isNeteaseRateLimitPayload(payload) {
  const status = Number(payload?.status || payload?.body?.code || 0)
  const text = getNeteaseErrorText(payload)
  return status === 405 || text.includes('\u64cd\u4f5c\u9891\u7e41') || /rate|frequent/i.test(text)
}

function warnNeteaseCloudSearchOnce(kind, payload) {
  const now = Date.now()
  if (now - neteaseCloudSearchLastWarnAt < 5000) return
  neteaseCloudSearchLastWarnAt = now
  const text = isNeteaseRateLimitPayload(payload)
    ? '\u64cd\u4f5c\u9891\u7e41\uff0c\u8bf7\u7a0d\u5019\u518d\u8bd5'
    : getNeteaseErrorText(payload) || 'request failed'
  console.warn(`[netease:${kind}] ${text}`)
}

async function cachedNeteaseCloudSearch(kind, params, cookie = '') {
  const keywords = String(params?.keywords || '').trim()
  if (!keywords) return null

  const key = buildNeteaseCloudSearchCacheKey(kind, keywords)
  const cached = neteaseCloudSearchCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  if (Date.now() < neteaseCloudSearchCooldownUntil) return null
  if (neteaseCloudSearchInFlight.has(key)) return await neteaseCloudSearchInFlight.get(key)

  const task = (async () => {
    try {
      const ncm = getNcmApi()
      const value = await withQuietNeteaseConsole(() =>
        ncm.cloudsearch({
          ...params,
          keywords,
          ...buildNcmRequestOptions(cookie)
        })
      )
      if (isNeteaseRateLimitPayload(value)) {
        neteaseCloudSearchCooldownUntil = Date.now() + NETEASE_SEARCH_RATE_LIMIT_COOLDOWN_MS
        warnNeteaseCloudSearchOnce(kind, value)
        return null
      }
      neteaseCloudSearchCache.set(key, {
        value,
        expiresAt: Date.now() + NETEASE_SEARCH_CACHE_TTL_MS
      })
      return value
    } catch (error) {
      const payload = buildNeteaseErrorLogPayload(error)
      if (isNeteaseRateLimitPayload(payload)) {
        neteaseCloudSearchCooldownUntil = Date.now() + NETEASE_SEARCH_RATE_LIMIT_COOLDOWN_MS
      }
      warnNeteaseCloudSearchOnce(kind, payload)
      return null
    } finally {
      neteaseCloudSearchInFlight.delete(key)
    }
  })()

  neteaseCloudSearchInFlight.set(key, task)
  return await task
}

function dialogLocaleFromOpts(opts) {
  const loc = opts && typeof opts === 'object' && opts.locale
  return loc === 'zh' || loc === 'zh-TW' || loc === 'ja' ? loc : 'en'
}

let mainWindow = null
let tray = null
let isQuitting = false
let trayPlaybackState = {
  isPlaying: false,
  trackTitle: ''
}

const TRAY_MENU_LABELS = {
  play: '\u64ad\u653e',
  pause: '\u6682\u505c',
  previous: '\u4e0a\u4e00\u9996',
  next: '\u4e0b\u4e00\u9996',
  showWindow: '\u663e\u793a\u7a97\u53e3',
  quit: '\u9000\u51fa'
}

/** Floating lyrics panel (renderer `?mode=lyrics-desktop`) */
let lyricsDesktopWindow = null
/** Last payload so the child window can request a resend after it subscribes to IPC */
let lyricsDesktopLastPayload = {}
let lyricsDesktopLastPayloadSignature = ''
/** Main-process timer pulls lyrics from the main renderer — not throttled when the main window is minimized */
let lyricsDesktopMainSyncTimer = null
/** Floating mini player panel (renderer `?mode=mini-player`) */
let miniPlayerWindow = null
let miniPlayerLastPayload = {}
let miniPlayerLastPayloadSignature = ''
let miniPlayerMainSyncTimer = null
let miniPlayerAutoHidMainWindow = false
/**
 * Fallback poll cadence for companion windows (desktop lyrics / mini player).
 * Both windows now receive push updates via dedicated IPC channels
 * (`lyricsDesktop:updateData` / `miniPlayer:updateData`) the moment the
 * renderer state changes. The poll only matters when ECHO's main window has
 * been backgrounded long enough for Chromium to throttle its timers; running
 * `webContents.executeJavaScript` 8 Hz on the main process otherwise burned a
 * meaningful slice of CPU for nothing. Once-per-second is plenty for the
 * minimized fallback case.
 */
const LYRICS_DESKTOP_SYNC_INTERVAL_MS = 1000
const MINI_PLAYER_SYNC_INTERVAL_MS = 5000
const MINI_PLAYER_DEFAULT_BOUNDS = { width: 412, height: 68 }
const AUDIO_STATUS_POLL_INTERVAL_MS = 500
const AUDIO_STATUS_PAUSED_HEARTBEAT_MS = 5000
const AUDIO_STATUS_POSITION_DELTA_SEC = 0.45
const MAX_EMBEDDED_COVER_DIMENSION = 768
const MAX_EMBEDDED_COVER_BYTES = 350 * 1024
const MAX_ARTIST_AVATAR_IMAGE_BYTES = 2 * 1024 * 1024
const ARTIST_AVATAR_IMAGE_FETCH_TIMEOUT_MS = 12000
const ARTIST_AVATAR_IMAGE_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000
const artistAvatarImageInFlight = new Map()
const artistAvatarImageHostCooldowns = new Map()

function stopLyricsDesktopMainSyncTimer() {
  if (lyricsDesktopMainSyncTimer) {
    clearInterval(lyricsDesktopMainSyncTimer)
    lyricsDesktopMainSyncTimer = null
  }
}

function stopMiniPlayerMainSyncTimer() {
  if (miniPlayerMainSyncTimer) {
    clearInterval(miniPlayerMainSyncTimer)
    miniPlayerMainSyncTimer = null
  }
}

function buildArtistAvatarImageFailure(error, extra = {}) {
  return {
    ok: false,
    dataUrl: '',
    error,
    transient: false,
    retryAfterMs: 0,
    ...extra
  }
}

function parseRetryAfterMs(value) {
  const raw = String(value || '').trim()
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const dateValue = Date.parse(raw)
  if (Number.isFinite(dateValue)) return Math.max(0, dateValue - Date.now())
  return 0
}

function isTransientArtistAvatarHttpStatus(status) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500
}

function getArtistAvatarImageReferer(cleanUrl) {
  if (/(^|\/\/)(y|qpic)\.qq\.com\//i.test(cleanUrl)) return 'https://y.qq.com/'
  if (/(^|\/\/)(p\d+|music)\.music\.126\.net\//i.test(cleanUrl)) return 'https://music.163.com/'
  try {
    return `${new URL(cleanUrl).origin}/`
  } catch {
    return 'https://music.163.com/'
  }
}

function getArtistAvatarImageHost(cleanUrl) {
  try {
    return new URL(cleanUrl).host.toLowerCase()
  } catch {
    return ''
  }
}

async function fetchImageDataUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return buildArtistAvatarImageFailure('invalid_url')
  }

  const host = getArtistAvatarImageHost(cleanUrl)
  const cooldownUntil = host ? Number(artistAvatarImageHostCooldowns.get(host) || 0) : 0
  if (cooldownUntil > Date.now()) {
    return buildArtistAvatarImageFailure('rate_limited', {
      transient: true,
      status: 429,
      retryAfterMs: cooldownUntil - Date.now()
    })
  }
  if (artistAvatarImageInFlight.has(cleanUrl)) {
    return await artistAvatarImageInFlight.get(cleanUrl)
  }

  const task = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ARTIST_AVATAR_IMAGE_FETCH_TIMEOUT_MS)
    let response = null

    try {
      response = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          Referer: getArtistAvatarImageReferer(cleanUrl)
        }
      })
    } catch (error) {
      return buildArtistAvatarImageFailure(error?.name === 'AbortError' ? 'timeout' : 'network_error', {
        transient: true,
        message: error?.message || String(error || '')
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response?.ok) {
      const status = Number(response?.status || 0)
      const retryAfterMs =
        parseRetryAfterMs(response?.headers?.get?.('retry-after')) ||
        (isTransientArtistAvatarHttpStatus(status) ? ARTIST_AVATAR_IMAGE_RATE_LIMIT_COOLDOWN_MS : 0)
      if (host && retryAfterMs > 0 && isTransientArtistAvatarHttpStatus(status)) {
        artistAvatarImageHostCooldowns.set(host, Date.now() + retryAfterMs)
      }
      return buildArtistAvatarImageFailure(`http_${status || 'error'}`, {
        transient: isTransientArtistAvatarHttpStatus(status),
        status,
        retryAfterMs
      })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    if (!/^image\//i.test(contentType)) {
      return buildArtistAvatarImageFailure('not_image', { status: response.status })
    }

    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
      return buildArtistAvatarImageFailure('empty_image', { status: response.status })
    }
    if (arrayBuffer.byteLength > MAX_ARTIST_AVATAR_IMAGE_BYTES) {
      return buildArtistAvatarImageFailure('image_too_large', { status: response.status })
    }

    const originalBuffer = Buffer.from(arrayBuffer)
    const image = nativeImage.createFromBuffer(originalBuffer)
    if (!image.isEmpty()) {
      const resized = image.resize({ width: 360, height: 360, quality: 'best' })
      const encoded = resized.toJPEG(88)
      if (encoded?.length) {
        return {
          ok: true,
          dataUrl: `data:image/jpeg;base64,${encoded.toString('base64')}`
        }
      }
    }

    return {
      ok: true,
      dataUrl: `data:${contentType.split(';')[0]};base64,${originalBuffer.toString('base64')}`
    }
  })().finally(() => {
    artistAvatarImageInFlight.delete(cleanUrl)
  })

  artistAvatarImageInFlight.set(cleanUrl, task)
  return await task
}

function compressEmbeddedCoverData(picture) {
  if (!picture?.data) {
    return { dataUrl: null, bytes: 0, width: 0, height: 0 }
  }

  try {
    const originalBuffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data)
    const originalMime = picture.format?.includes('/') ? picture.format : `image/${picture.format || 'jpeg'}`
    let image = nativeImage.createFromBuffer(originalBuffer)
    if (image.isEmpty()) {
      return {
        dataUrl: `data:${originalMime};base64,${originalBuffer.toString('base64')}`,
        bytes: originalBuffer.length,
        width: 0,
        height: 0
      }
    }

    let { width, height } = image.getSize()
    if (width > MAX_EMBEDDED_COVER_DIMENSION || height > MAX_EMBEDDED_COVER_DIMENSION) {
      const scale = Math.min(
        MAX_EMBEDDED_COVER_DIMENSION / Math.max(1, width),
        MAX_EMBEDDED_COVER_DIMENSION / Math.max(1, height)
      )
      image = image.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: 'good'
      })
      ;({ width, height } = image.getSize())
    }

    let encoded = image.toJPEG(82)
    if (encoded.length > MAX_EMBEDDED_COVER_BYTES) {
      for (const quality of [74, 66, 58]) {
        encoded = image.toJPEG(quality)
        if (encoded.length <= MAX_EMBEDDED_COVER_BYTES) break
      }
    }

    if (encoded.length > MAX_EMBEDDED_COVER_BYTES && width > 320 && height > 320) {
      const resized = image.resize({
        width: Math.max(320, Math.round(width * 0.72)),
        height: Math.max(320, Math.round(height * 0.72)),
        quality: 'good'
      })
      image = resized
      ;({ width, height } = image.getSize())
      encoded = image.toJPEG(66)
    }

    return {
      dataUrl: `data:image/jpeg;base64,${encoded.toString('base64')}`,
      bytes: encoded.length,
      width,
      height
    }
  } catch {
    try {
      const fallbackBuffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data)
      const fallbackMime = picture.format?.includes('/') ? picture.format : `image/${picture.format || 'jpeg'}`
      return {
        dataUrl: `data:${fallbackMime};base64,${fallbackBuffer.toString('base64')}`,
        bytes: fallbackBuffer.length,
        width: 0,
        height: 0
      }
    } catch {
      return { dataUrl: null, bytes: 0, width: 0, height: 0 }
    }
  }
}

function applyLyricsDesktopLockState(isLocked) {
  if (!lyricsDesktopWindow || lyricsDesktopWindow.isDestroyed()) return
  if (isLocked) {
    lyricsDesktopWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    lyricsDesktopWindow.setIgnoreMouseEvents(false)
  }
}

function lyricsDesktopPullFromMainRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!lyricsDesktopWindow || lyricsDesktopWindow.isDestroyed()) return
  mainWindow.webContents
    .executeJavaScript(
      `(function(){try{return typeof window.__getDesktopLyricsPayload==='function'?window.__getDesktopLyricsPayload():null}catch(e){return null}})()`,
      true
    )
    .then((payload) => {
      if (!payload || typeof payload !== 'object') return
      const payloadSignature = JSON.stringify(payload)
      if (payloadSignature === lyricsDesktopLastPayloadSignature) return
      lyricsDesktopLastPayloadSignature = payloadSignature
      lyricsDesktopLastPayload = payload
      if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
        lyricsDesktopWindow.webContents.send('lyrics-desktop:data', payload)
      }
    })
    .catch(() => {})
}

function startLyricsDesktopMainSyncTimer() {
  stopLyricsDesktopMainSyncTimer()
  lyricsDesktopMainSyncTimer = setInterval(() => {
    lyricsDesktopPullFromMainRenderer()
  }, LYRICS_DESKTOP_SYNC_INTERVAL_MS)
}

function cleanupLyricsDesktopWindow() {
  try {
    stopLyricsDesktopMainSyncTimer()
    if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
      try {
        const bounds = lyricsDesktopWindow.getBounds()
        const state = readAppStateJson()
        state.lyricsDesktopBounds = bounds
        writeAppStateJson(state)
      } catch {
        /* ignore */
      }
      lyricsDesktopWindow.destroy()
    }
  } catch {
    /* ignore */
  } finally {
    lyricsDesktopWindow = null
    lyricsDesktopLastPayloadSignature = ''
  }
}

function applyMiniPlayerAlwaysOnTop(isAlwaysOnTop) {
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return
  if (isAlwaysOnTop) {
    miniPlayerWindow.setAlwaysOnTop(true, 'screen-saver')
    miniPlayerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    miniPlayerWindow.setAlwaysOnTop(false)
    miniPlayerWindow.setVisibleOnAllWorkspaces(false)
  }
}

function buildMiniPlayerPayloadSignature(payload = {}) {
  const track = payload?.track || {}
  const playback = payload?.playback || {}
  const cover = String(track.cover || '')
  const position = Math.max(0, Number(playback.position) || 0)
  return [
    String(track.path || ''),
    String(track.title || ''),
    String(track.artist || ''),
    String(track.album || ''),
    cover.length,
    cover.slice(0, 96),
    track.liked === true ? '1' : '0',
    playback.isPlaying === true ? '1' : '0',
    Math.round((Number(playback.volume) || 0) * 100),
    Math.floor(position / 10),
    Math.round(Math.max(0, Number(playback.duration) || 0))
  ].join('\u0001')
}

function notifyMiniPlayerClosed() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.send('mini-player:closed')
  } catch {
    /* ignore */
  }
}

function sendMiniPlayerPayloadToWindow(payload, { force = false } = {}) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_payload' }
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) {
    return { ok: false, error: 'no_window' }
  }
  const payloadSignature = buildMiniPlayerPayloadSignature(payload)
  if (!force && payloadSignature === miniPlayerLastPayloadSignature) {
    return { ok: true, deduped: true }
  }
  miniPlayerLastPayloadSignature = payloadSignature
  miniPlayerLastPayload = payload
  try {
    miniPlayerWindow.webContents.send('mini-player:data', payload)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

function miniPlayerPullFromMainRenderer({ force = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return
  mainWindow.webContents
    .executeJavaScript(
      `(function(){try{return typeof window.__getMiniPlayerPayload==='function'?window.__getMiniPlayerPayload():null}catch(e){return null}})()`,
      true
    )
    .then((payload) => {
      sendMiniPlayerPayloadToWindow(payload, { force })
    })
    .catch(() => {})
}

function startMiniPlayerMainSyncTimer() {
  stopMiniPlayerMainSyncTimer()
  miniPlayerMainSyncTimer = setInterval(() => {
    miniPlayerPullFromMainRenderer()
  }, MINI_PLAYER_SYNC_INTERVAL_MS)
}

function cleanupMiniPlayerWindow() {
  try {
    stopMiniPlayerMainSyncTimer()
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      try {
        const bounds = miniPlayerWindow.getBounds()
        const state = readAppStateJson()
        state.miniPlayerBounds = bounds
        writeAppStateJson(state)
      } catch {
        /* ignore */
      }
      miniPlayerWindow.destroy()
    }
  } catch {
    /* ignore */
  } finally {
    miniPlayerWindow = null
    miniPlayerLastPayloadSignature = ''
    notifyMiniPlayerClosed()
    restoreMainWindowAfterMiniPlayer()
  }
}

function getTrayTrackTitle(status) {
  const filePath = status?.filePath
  if (typeof filePath !== 'string' || !filePath) return ''

  try {
    if (/^https?:\/\//i.test(filePath)) {
      const url = new URL(filePath)
      const name = basename(decodeURIComponent(url.pathname || ''))
      return name ? name.replace(new RegExp(`${extname(name)}$`), '') : ''
    }
  } catch {
    /* ignore */
  }

  const name = basename(filePath)
  return name ? name.replace(new RegExp(`${extname(name)}$`), '') : ''
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  mainWindow.hide()
  return { ok: true }
}

function shouldAutoHideMainWindowForMiniPlayer() {
  try {
    const state = readAppStateJson()
    return state.config?.miniPlayerAutoHideMainWindow === true
  } catch {
    return false
  }
}

function hideMainWindowForMiniPlayer() {
  if (!shouldAutoHideMainWindowForMiniPlayer()) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  miniPlayerAutoHidMainWindow = true
  mainWindow.hide()
}

function restoreMainWindowAfterMiniPlayer() {
  if (!miniPlayerAutoHidMainWindow) return
  miniPlayerAutoHidMainWindow = false
  if (isQuitting) return
  showMainWindow()
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }
  showMainWindow()
}

function sendPlayerCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  mainWindow.webContents.send('player:cmd', command)
  return { ok: true }
}

function registerGlobalMediaShortcuts() {
  const shortcutSpecs = [
    {
      accelerator: 'MediaPlayPause',
      handler: () => {
        const status = audioEngine.getStatus()
        if (status?.isPlaying) audioEngine.pause()
        else audioEngine.resume()
      }
    },
    {
      accelerator: 'MediaNextTrack',
      handler: () => {
        sendPlayerCommand('next')
      }
    },
    {
      accelerator: 'MediaPreviousTrack',
      handler: () => {
        sendPlayerCommand('prev')
      }
    },
    {
      accelerator: 'MediaStop',
      handler: () => {
        audioEngine.stop()
      }
    }
  ]

  for (const { accelerator, handler } of shortcutSpecs) {
    try {
      const registered = globalShortcut.register(accelerator, handler)
      if (!registered) {
        console.warn(`[Shortcut] Failed to register ${accelerator}`)
      }
    } catch (error) {
      console.warn(`[Shortcut] Failed to register ${accelerator}:`, error?.message || error)
    }
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: trayPlaybackState.trackTitle || 'ECHO',
      enabled: false
    },
    { type: 'separator' },
    {
      label: trayPlaybackState.isPlaying ? TRAY_MENU_LABELS.pause : TRAY_MENU_LABELS.play,
      click: () => {
        if (trayPlaybackState.isPlaying) audioEngine.pause()
        else audioEngine.resume()
      }
    },
    {
      label: TRAY_MENU_LABELS.previous,
      click: () => {
        sendPlayerCommand('prev')
      }
    },
    {
      label: TRAY_MENU_LABELS.next,
      click: () => {
        sendPlayerCommand('next')
      }
    },
    { type: 'separator' },
    {
      label: TRAY_MENU_LABELS.showWindow,
      click: () => {
        showMainWindow()
      }
    },
    {
      label: TRAY_MENU_LABELS.quit,
      click: () => {
        app.quit()
      }
    }
  ])
}

function refreshTrayMenu(status) {
  let shouldUpdateMenu = false

  if (status && typeof status === 'object') {
    const nextState = {
      isPlaying: !!status.isPlaying,
      trackTitle: getTrayTrackTitle(status)
    }
    shouldUpdateMenu =
      nextState.isPlaying !== trayPlaybackState.isPlaying ||
      nextState.trackTitle !== trayPlaybackState.trackTitle
    trayPlaybackState = nextState
  }

  if (!tray || tray.isDestroyed()) return
  if (status && !shouldUpdateMenu) return
  tray.setContextMenu(buildTrayMenu())
}

function createTrayIcon() {
  const candidatePaths = [resolveAppIconPath(), join(__dirname, '..', '..', 'website', 'icon.png')]

  for (const candidate of candidatePaths) {
    if (!candidate) continue
    const icon = nativeImage.createFromPath(candidate)
    if (!icon.isEmpty()) return icon
  }

  return undefined
}

function createTray() {
  if (tray && !tray.isDestroyed()) {
    refreshTrayMenu(audioEngine.getStatus())
    return tray
  }

  const trayIcon = createTrayIcon()
  if (!trayIcon) return null

  tray = new Tray(trayIcon)
  tray.setToolTip('ECHO')
  refreshTrayMenu(audioEngine.getStatus())

  tray.on('click', () => {
    toggleMainWindowVisibility()
  })
  tray.on('right-click', () => {
    refreshTrayMenu(audioEngine.getStatus())
    tray?.popUpContextMenu(buildTrayMenu())
  })

  return tray
}

function destroyTray() {
  if (!tray || tray.isDestroyed()) return
  tray.destroy()
  tray = null
}

function broadcastAudioStatus(status) {
  refreshTrayMenu(status)
  if (!mainWindow || mainWindow.isDestroyed()) return
  const webContents = mainWindow.webContents
  if (!webContents || webContents.isDestroyed()) return
  try {
    webContents.send('audio:status-update', status)
  } catch (e) {
    if (!isQuitting) {
      console.warn('[AudioStatus] skipped send:', e?.message || e)
    }
  }
}

function buildAudioStatusSignature(status = {}) {
  return [
    status.isPlaying === true ? '1' : '0',
    status.filePath || '',
    status.playbackRate || 1,
    status.exclusive === true ? '1' : '0',
    status.exclusiveConfirmed === true ? '1' : '0',
    status.asio === true ? '1' : '0',
    status.nativeBridge === true ? '1' : '0',
    status.automix === true ? '1' : '0',
    status.fileSampleRate || 0,
    status.outputSampleRate || 0,
    status.codec || '',
    status.bitsPerSample || 0,
    status.isDSD === true ? '1' : '0',
    status.dsdRate || 0,
    status.bitPerfect === true ? '1' : '0',
    status.useEQ === true ? '1' : '0'
  ].join('\u0001')
}

function shouldBroadcastAudioStatus(lastSent, nextStatus, nowMs, lastSentAtMs) {
  if (!lastSent) return true
  if (buildAudioStatusSignature(lastSent) !== buildAudioStatusSignature(nextStatus)) return true
  if (nextStatus?.isPlaying === true) {
    const lastTime = Number(lastSent.currentTime)
    const nextTime = Number(nextStatus.currentTime)
    return (
      !Number.isFinite(lastTime) ||
      !Number.isFinite(nextTime) ||
      Math.abs(nextTime - lastTime) >= AUDIO_STATUS_POSITION_DELTA_SEC
    )
  }
  return nowMs - lastSentAtMs >= AUDIO_STATUS_PAUSED_HEARTBEAT_MS
}

function broadcastCastStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('cast:status', getCastStatus())
}

const dlnaRenderer = new DlnaMediaRenderer({
  audioEngine,
  getMainWindow: () => mainWindow,
  onCastActivity: broadcastCastStatus
})
const airplayReceiver = new AirplayRaopReceiver({
  audioEngine,
  getMainWindow: () => mainWindow,
  beforePlayHook: () => dlnaRenderer.stopPlaybackOnly(),
  onCastActivity: broadcastCastStatus
})
const upnpSender = new UpnpSender({
  logLine: (line) => console.info(line)
})
const phoneRemoteServer = new PhoneRemoteServer({
  getMainWindow: () => mainWindow,
  onCommand: (message) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('remote:command', message)
  }
})

function getCastStatus() {
  const dlna = dlnaRenderer.getStatus()
  const airplay = airplayReceiver.getStatus()
  const airplayActive = !!airplay.airplayActive
  const dlnaActive =
    !!dlna.dlnaEnabled &&
    !!dlna.currentUri &&
    (dlna.transportState === 'PLAYING' || dlna.transportState === 'PAUSED_PLAYBACK')

  if (airplayActive) {
    return {
      ...dlna,
      ...airplay,
      castActive: true,
      castKind: 'airplay',
      castLabel: 'AirPlay',
      currentUri: 'airplay://stream',
      transportState: airplay.airplayState,
      trackDurationSec: airplay.airplayDurationSec || 0,
      positionSec: airplay.airplayPositionSec || 0,
      isPlaying: airplay.airplayState === 'PLAYING',
      dlnaMeta: { ...airplay.airplayMeta },
      castMetadataTrusted: !!airplay.airplayMetadataTrusted,
      lastError: airplay.lastError || dlna.lastError
    }
  }

  return {
    ...dlna,
    ...airplay,
    castActive: dlnaActive,
    castKind: dlnaActive ? 'dlna' : '',
    castLabel: dlnaActive ? 'DLNA' : '',
    castMetadataTrusted: dlnaActive,
    lastError: airplay.lastError || dlna.lastError
  }
}
let youtubeSignInWindow = null
let bilibiliSignInWindow = null
let neteaseSignInWindow = null
let qqMusicSignInWindow = null
let youtubeSystemBrowserSession = null
let soundCloudSystemBrowserSession = null
let soundCloudSystemCookiePollTimer = null
let rendererHttpServer = null
let rendererServerUrl = null
const RENDERER_HTTP_HOST = '127.0.0.1'
const RENDERER_HTTP_PORT_FROM_ENV = Number(process.env.ECHO_RENDERER_PORT || 17631)
const RENDERER_HTTP_PREFERRED_PORT =
  Number.isInteger(RENDERER_HTTP_PORT_FROM_ENV) &&
  RENDERER_HTTP_PORT_FROM_ENV > 0 &&
  RENDERER_HTTP_PORT_FROM_ENV < 65536
    ? RENDERER_HTTP_PORT_FROM_ENV
    : 17631
let libraryWatchManager = null
const APP_STATE_FILE = 'echoes-app-state.json'
const APP_STATE_WRITE_DEBOUNCE_MS = 1000
const APP_STATE_KEYS = new Set([
  'playlist',
  'userPlaylists',
  'userSmartCollections',
  'displayMetadataOverrides',
  'config',
  'likedPaths',
  'upNextQueue',
  'trackStats',
  'playMode',
  'queuePlaybackEnabled',
  'playbackHistory',
  'volume',
  'importedFolders',
  'downloaderSettings',
  'remoteLibraries',
  'ltSettings',
  'lyricsDesktopBounds',
  'miniPlayerBounds',
  'playbackSession'
])
const APP_STATE_IMMEDIATE_FLUSH_KEYS = new Set([
  'config',
  'playlist',
  'importedFolders',
  'remoteLibraries'
])
let appStateCache = {}
let appStateWriteTimer = null
let updaterCheckPromise = null
let updaterCurrentEvent = null
let updaterLastEventKey = ''
let updaterListenersBound = false
let updaterAutoCheckEnabled = true

function getAppStateFilePath(baseDir = app.getPath('userData')) {
  return join(baseDir, APP_STATE_FILE)
}

function readAppStateJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function isMeaningfulAppStateValue(value) {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function mergeAppStateConfig(primaryConfig, fallbackConfig) {
  const primary =
    primaryConfig && typeof primaryConfig === 'object' && !Array.isArray(primaryConfig)
      ? primaryConfig
      : null
  const fallback =
    fallbackConfig && typeof fallbackConfig === 'object' && !Array.isArray(fallbackConfig)
      ? fallbackConfig
      : null
  if (!primary && !fallback) return primaryConfig
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    ...fallback,
    ...primary,
    customColors: {
      ...(fallback.customColors || {}),
      ...(primary.customColors || {})
    },
    lyricsColor: primary.lyricsColor || fallback.lyricsColor || null
  }
}

function mergeAppStateSnapshot(primaryState, fallbackState) {
  const primary =
    primaryState && typeof primaryState === 'object' && !Array.isArray(primaryState)
      ? primaryState
      : {}
  const fallback =
    fallbackState && typeof fallbackState === 'object' && !Array.isArray(fallbackState)
      ? fallbackState
      : {}
  const next = { ...primary }
  let changed = false

  for (const key of APP_STATE_KEYS) {
    if (key === 'config') {
      const mergedConfig = mergeAppStateConfig(next.config, fallback.config)
      if (mergedConfig && JSON.stringify(mergedConfig) !== JSON.stringify(next.config)) {
        next.config = mergedConfig
        changed = true
      }
      continue
    }
    if (!isMeaningfulAppStateValue(next[key]) && isMeaningfulAppStateValue(fallback[key])) {
      next[key] = fallback[key]
      changed = true
    }
  }

  return { state: next, changed }
}

function getLegacyAppStateFileCandidates() {
  const candidates = []
  try {
    const appDataDir = app.getPath('appData')
    for (const dirName of ['ECHO', 'echoes', 'Echoes', 'com.echo.player']) {
      candidates.push(getAppStateFilePath(join(appDataDir, dirName)))
    }
  } catch {
    /* ignore */
  }

  const currentPath = resolve(getAppStateFilePath())
  const seen = new Set()
  return candidates
    .flatMap((filePath) => [filePath, `${filePath}.bak`])
    .filter((filePath) => {
      const resolved = resolve(filePath)
      if (resolved === currentPath || seen.has(resolved)) return false
      seen.add(resolved)
      return fs.existsSync(filePath)
    })
}

function writeAppStateJsonFile(filePath, nextState) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, `${filePath}.bak`)
    }
  } catch {
    /* backup is best-effort */
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(nextState), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function readAppStateJson() {
  const currentFilePath = getAppStateFilePath()
  let currentState = readAppStateJsonFile(currentFilePath)
  let changed = false

  if (!isMeaningfulAppStateValue(currentState)) {
    const backupState = readAppStateJsonFile(`${currentFilePath}.bak`)
    if (isMeaningfulAppStateValue(backupState)) {
      currentState = backupState
      changed = true
    }
  }

  for (const candidate of getLegacyAppStateFileCandidates()) {
    const legacyState = readAppStateJsonFile(candidate)
    if (!isMeaningfulAppStateValue(legacyState)) continue
    const merged = mergeAppStateSnapshot(currentState, legacyState)
    currentState = merged.state
    changed = changed || merged.changed
  }

  if (changed) {
    try {
      writeAppStateJsonFile(currentFilePath, currentState)
      console.log(`[appState] Migrated persisted state into ${currentFilePath}`)
    } catch (error) {
      console.warn('[appState] migration write failed:', error?.message || error)
    }
  }

  return currentState
}

function writeAppStateJson(nextState) {
  try {
    const filePath = getAppStateFilePath()
    writeAppStateJsonFile(filePath, nextState)
    return true
  } catch (e) {
    console.warn('[appState] write failed:', e?.message || e)
    return false
  }
}

function ensureAppStateCache() {
  if (!appStateCache || typeof appStateCache !== 'object') {
    appStateCache = readAppStateJson()
  }
  return appStateCache
}

function loadAppStateCache() {
  appStateCache = readAppStateJson()
  return appStateCache
}

function clearAppStateWriteTimer() {
  if (appStateWriteTimer) {
    clearTimeout(appStateWriteTimer)
    appStateWriteTimer = null
  }
}

function flushAppStateCacheSync() {
  clearAppStateWriteTimer()
  return writeAppStateJson(ensureAppStateCache())
}

function createRemoteSourceId() {
  return `remote-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

function normalizeRemoteSourceType(value) {
  if (
    value === 'networkFolder' ||
    value === 'sshfs' ||
    value === 'webdav' ||
    value === 'jellyfin' ||
    value === 'emby'
  ) {
    return value
  }
  return 'subsonic'
}

function isFileBackedRemoteSourceType(value) {
  const sourceType = normalizeRemoteSourceType(value)
  return sourceType === 'networkFolder' || sourceType === 'sshfs'
}

function getDefaultRemoteSourceName(value) {
  const sourceType = normalizeRemoteSourceType(value)
  if (sourceType === 'webdav') return '网盘音乐'
  if (sourceType === 'jellyfin') return 'Jellyfin Music'
  if (sourceType === 'emby') return 'Emby Music'
  if (sourceType === 'sshfs') return 'SSHFS Music'
  if (sourceType === 'networkFolder') return 'NAS Music'
  return 'Navidrome'
}

function isCredentialRemoteSourceType(value) {
  const sourceType = normalizeRemoteSourceType(value)
  return sourceType === 'subsonic' || sourceType === 'webdav' || isJellyfinLikeSourceType(sourceType)
}

function normalizeRemoteServerUrl(value, type = 'subsonic') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const sourceType = normalizeRemoteSourceType(type)
  const defaultProtocol = sourceType === 'webdav' ? 'https' : 'http'
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `${defaultProtocol}://${raw}`
  try {
    const url = new URL(withProtocol)
    url.pathname = url.pathname.replace(/\/+$/, '')
    if (sourceType === 'subsonic') {
      url.pathname = url.pathname.replace(/\/rest$/i, '')
    }
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

function encryptRemotePassword(password) {
  const value = String(password || '')
  if (!value) return null
  if (!safeStorage?.isEncryptionAvailable?.()) {
    return null
  }
  return {
    encoding: 'safeStorage',
    value: safeStorage.encryptString(value).toString('base64')
  }
}

function decryptRemotePassword(secret) {
  if (!secret || secret.encoding !== 'safeStorage' || !secret.value) return ''
  try {
    return safeStorage.decryptString(Buffer.from(secret.value, 'base64'))
  } catch (error) {
    console.warn('[remote-library] password decrypt failed:', error?.message || error)
    return ''
  }
}

function getRemoteLibraryState() {
  const state = ensureAppStateCache()
  if (!state.remoteLibraries || typeof state.remoteLibraries !== 'object') {
    state.remoteLibraries = { sources: [] }
  }
  if (!Array.isArray(state.remoteLibraries.sources)) {
    state.remoteLibraries.sources = []
  }
  return state.remoteLibraries
}

function getRemoteSourcesSafe() {
  return getRemoteLibraryState().sources.map(source => ({
    id: source.id,
    type: normalizeRemoteSourceType(source.type),
    name: source.name || getDefaultRemoteSourceName(source.type),
    serverUrl: source.serverUrl || '',
    folderPath: source.folderPath || '',
    username: source.username || '',
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    hasPassword: Boolean(source.password),
    passwordPersisted: Boolean(source.password)
  }))
}

function findRemoteSource(sourceId) {
  return getRemoteLibraryState().sources.find(source => source.id === sourceId) || null
}

function createSubsonicClientForSource(source, passwordOverride) {
  if (!source) {
    throw new Error('远程音乐库不存在')
  }
  const password =
    passwordOverride !== undefined && passwordOverride !== null
      ? String(passwordOverride)
      : decryptRemotePassword(source.password)
  if (!password) {
    throw new Error('远程音乐库密码不可用，请重新保存连接')
  }
  return new SubsonicClient({
    serverUrl: source.serverUrl,
    username: source.username,
    password
  })
}

function createWebDavClientForSource(source, passwordOverride) {
  if (!source) {
    throw new Error('WebDAV 网盘来源不存在')
  }
  const password =
    passwordOverride !== undefined && passwordOverride !== null
      ? String(passwordOverride)
      : decryptRemotePassword(source.password)
  return new WebDavClient({
    serverUrl: source.serverUrl,
    username: source.username,
    password
  })
}

function createJellyfinClientForSource(source, passwordOverride) {
  if (!source) {
    throw new Error('Jellyfin / Emby 音乐库不存在')
  }
  const password =
    passwordOverride !== undefined && passwordOverride !== null
      ? String(passwordOverride)
      : decryptRemotePassword(source.password)
  if (!password) {
    throw new Error('Jellyfin / Emby 密码不可用，请重新保存连接')
  }
  return new JellyfinClient({
    type: normalizeRemoteSourceType(source.type),
    serverUrl: source.serverUrl,
    username: source.username,
    password
  })
}

let webDavProxyServer = null
let webDavProxyPort = 0
const webDavProxyTokens = new Map()
const WEB_DAV_PROXY_TOKEN_TTL_MS = 30 * 60 * 1000

function cleanupWebDavProxyTokens() {
  const now = Date.now()
  for (const [token, entry] of webDavProxyTokens.entries()) {
    if (!entry || entry.expiresAt <= now) webDavProxyTokens.delete(token)
  }
}

async function ensureWebDavProxyServer() {
  if (webDavProxyServer && webDavProxyPort) return webDavProxyPort

  webDavProxyServer = http.createServer(async (req, res) => {
    try {
      cleanupWebDavProxyTokens()
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
      const match = requestUrl.pathname.match(/^\/webdav\/([^/]+)$/)
      if (!match) {
        res.writeHead(404)
        res.end()
        return
      }

      const token = decodeURIComponent(match[1])
      const entry = webDavProxyTokens.get(token)
      if (!entry || entry.expiresAt <= Date.now()) {
        webDavProxyTokens.delete(token)
        res.writeHead(410)
        res.end('remote token expired')
        return
      }

      const source = findRemoteSource(entry.sourceId)
      const client = createWebDavClientForSource(source)
      const headers = {
        ...client.authHeaders(),
        'User-Agent': 'ECHO-WebDAV-Proxy/1.0'
      }
      if (req.headers.range) headers.Range = req.headers.range

      const upstream = await axios.request({
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        url: client.buildUrl(entry.itemPath),
        responseType: req.method === 'HEAD' ? 'text' : 'stream',
        timeout: 30000,
        headers,
        validateStatus: status => status >= 200 && status < 500
      })

      const responseHeaders = {}
      for (const key of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag'
      ]) {
        if (upstream.headers?.[key] !== undefined) responseHeaders[key] = upstream.headers[key]
      }
      responseHeaders['cache-control'] = 'no-store'
      res.writeHead(upstream.status, responseHeaders)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      upstream.data.on('error', () => {
        if (!res.destroyed) res.destroy()
      })
      req.on('close', () => {
        upstream.data?.destroy?.()
      })
      upstream.data.pipe(res)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      }
      res.end(error?.message || 'WebDAV proxy error')
    }
  })

  await new Promise((resolvePromise, rejectPromise) => {
    webDavProxyServer.once('error', rejectPromise)
    webDavProxyServer.listen(0, '127.0.0.1', () => {
      const address = webDavProxyServer.address()
      webDavProxyPort = typeof address === 'object' && address ? address.port : 0
      console.log(`[WebDAVProxy] Started at http://127.0.0.1:${webDavProxyPort}`)
      resolvePromise()
    })
  })
  return webDavProxyPort
}

async function createWebDavProxyUrl(sourceId, itemPath) {
  const port = await ensureWebDavProxyServer()
  const token = randomBytes(24).toString('hex')
  webDavProxyTokens.set(token, {
    sourceId,
    itemPath,
    expiresAt: Date.now() + WEB_DAV_PROXY_TOKEN_TTL_MS
  })
  return `http://127.0.0.1:${port}/webdav/${encodeURIComponent(token)}`
}

async function stopWebDavProxyServer() {
  webDavProxyTokens.clear()
  webDavProxyPort = 0
  if (!webDavProxyServer) return
  await new Promise((resolvePromise) => {
    webDavProxyServer.close(() => resolvePromise())
  })
  webDavProxyServer = null
}

function isRemoteAudioFilePath(value) {
  return /\.(mp3|wav|flac|ogg|m4a|aac|dsf|dff|opus|webm|wma|alac|aiff|m4b|caf)$/i.test(
    String(value || '')
  )
}

async function resolveSubsonicPlaybackPath(filePath) {
  const parsed = parseSubsonicTrackPath(filePath)
  if (!parsed) {
    return filePath
  }
  const source = findRemoteSource(parsed.sourceId)
  const client = createSubsonicClientForSource(source)
  return client.getStreamUrl(parsed.songId)
}

async function resolveWebDavPlaybackPath(filePath) {
  const parsed = parseWebDavTrackPath(filePath)
  if (!parsed) return filePath
  return await createWebDavProxyUrl(parsed.sourceId, parsed.itemPath)
}

async function resolveJellyfinPlaybackPath(filePath) {
  const parsed = parseJellyfinTrackPath(filePath)
  if (!parsed) return filePath
  const source = findRemoteSource(parsed.sourceId)
  const client = createJellyfinClientForSource(source)
  return client.getStreamUrl(parsed.itemId, parsed.mediaSourceId)
}

function createNetworkFolderTrackPath(sourceId, filePath) {
  return `network-folder://${encodeURIComponent(sourceId)}/file/${encodeURIComponent(filePath)}`
}

function parseNetworkFolderTrackPath(value) {
  const raw = String(value || '')
  const match = raw.match(/^network-folder:\/\/([^/]+)\/file\/(.+)$/i)
  if (!match) return null
  return {
    sourceId: decodeURIComponent(match[1]),
    filePath: decodeURIComponent(match[2])
  }
}

function isNetworkFolderTrackPath(value) {
  return Boolean(parseNetworkFolderTrackPath(value))
}

function mapNetworkFolderAudioEntry(source, entry) {
  const filePath = String(entry?.path || '')
  const title = basename(filePath, extname(filePath)) || entry?.name || 'Unknown Title'
  const folderName = basename(dirname(filePath)) || source?.name || 'Network Folder'
  const remoteType = normalizeRemoteSourceType(source?.type)
  const sourceName = source?.name || getDefaultRemoteSourceName(remoteType)
  return {
    path: createNetworkFolderTrackPath(source.id, filePath),
    name: title,
    title,
    artist: folderName,
    album: sourceName,
    remote: true,
    remoteType,
    remoteSourceId: source.id,
    remoteSourceName: sourceName,
    remoteActualPath: filePath,
    folder: entry?.folder || dirname(filePath),
    birthtimeMs: Number(entry?.birthtimeMs || 0),
    mtimeMs: Number(entry?.mtimeMs || 0),
    sizeBytes: Number(entry?.sizeBytes || 0),
    info: {
      title,
      artist: folderName,
      album: sourceName,
      source: sourceName,
      remoteType
    }
  }
}

async function collectNetworkFolderTracks(source) {
  if (!source?.folderPath) throw new Error('Network folder path is empty')
  const stats = await fs.promises.stat(source.folderPath)
  if (!stats.isDirectory()) throw new Error('Network folder path is not a directory')
  const entries = []
  await collectAudioFilesRecursive(source.folderPath, entries)
  return entries.map(entry => mapNetworkFolderAudioEntry(source, entry))
}

async function resolveRemotePlaybackPath(filePath) {
  if (isStreamingTrackPath(filePath)) {
    const parsed = parseStreamingTrackPath(filePath)
    const soundCloudCookieFile = await writeSoundCloudCookiesFromSession()
    const playback = await resolveStreamingPlayback({
      track: parsed,
      neteaseCookie: (await resolveNeteaseAuthState('')).cookie || '',
      qqMusicCookie: (await resolveQqMusicAuthState('')).cookie || '',
      soundCloudCookieFile
    })
    if (!playback?.ok || !playback.url) {
      throw new Error(playback?.message || playback?.error || 'streaming_track_unavailable')
    }
    return playback.url
  }
  const networkParsed = parseNetworkFolderTrackPath(filePath)
  if (networkParsed) return networkParsed.filePath
  if (isWebDavTrackPath(filePath)) return await resolveWebDavPlaybackPath(filePath)
  if (isJellyfinTrackPath(filePath)) return await resolveJellyfinPlaybackPath(filePath)
  return await resolveSubsonicPlaybackPath(filePath)
}

async function resolveRemotePlaybackUrl(filePath) {
  if (isStreamingTrackPath(filePath)) {
    const parsed = parseStreamingTrackPath(filePath)
    const soundCloudCookieFile = await writeSoundCloudCookiesFromSession()
    const playback = await resolveStreamingPlayback({
      track: parsed,
      neteaseCookie: (await resolveNeteaseAuthState('')).cookie || '',
      qqMusicCookie: (await resolveQqMusicAuthState('')).cookie || '',
      soundCloudCookieFile
    })
    return playback?.url || ''
  }
  const networkParsed = parseNetworkFolderTrackPath(filePath)
  if (networkParsed) return pathToFileURL(networkParsed.filePath).href
  if (isWebDavTrackPath(filePath)) return await resolveWebDavPlaybackPath(filePath)
  if (isJellyfinTrackPath(filePath)) return await resolveJellyfinPlaybackPath(filePath)
  if (isSubsonicTrackPath(filePath)) return await resolveSubsonicPlaybackPath(filePath)
  return ''
}

function resolveMetadataFilePath(filePath) {
  const localPath = parseNetworkFolderTrackPath(filePath)?.filePath || filePath
  return getCueAudioPath(localPath)
}

async function getSubsonicTrackMetadata(filePath) {
  const parsed = parseSubsonicTrackPath(filePath)
  if (!parsed) return null
  const source = findRemoteSource(parsed.sourceId)
  const client = createSubsonicClientForSource(source)
  return client.getSong(parsed.songId, source)
}

async function getJellyfinTrackMetadata(filePath) {
  const parsed = parseJellyfinTrackPath(filePath)
  if (!parsed) return null
  const source = findRemoteSource(parsed.sourceId)
  const client = createJellyfinClientForSource(source)
  return client.getAudioItem(parsed.itemId, source)
}

function getInternalYoutubeCookieFile() {
  return join(app.getPath('userData'), 'youtube-cookies.txt')
}

function getInternalSoundCloudCookieFile() {
  return join(app.getPath('userData'), 'soundcloud-cookies.txt')
}

function getSystemLoginProfileRoot(provider = 'youtube', browser = 'edge') {
  const safeProvider = provider === 'soundcloud' ? 'soundcloud' : 'youtube'
  const safeBrowser = browser === 'chrome' ? 'chrome' : 'edge'
  return join(app.getPath('userData'), `${safeProvider}-login-browser`, safeBrowser)
}

function getYoutubeSystemProfileRoot(browser = 'edge') {
  return getSystemLoginProfileRoot('youtube', browser)
}

function resolveYoutubeBrowserExecutable(browser = 'edge') {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates =
    browser === 'chrome'
      ? [
          join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          localAppData ? join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
          'chrome.exe'
        ]
      : [
          join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          localAppData ? join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
          'msedge.exe'
        ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.includes(sep)) {
      if (existsSync(candidate)) return candidate
    } else {
      return candidate
    }
  }
  return ''
}

function findFreeLocalPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = nodeNet.createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

async function fetchJsonWithRetry(url, retries = 20) {
  let lastError = null
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw lastError || new Error('Browser debugging endpoint is not ready')
}

function sendCdpCommand(webSocketUrl, method, params = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const WebSocketImpl = require('ws')
    const ws = new WebSocketImpl(webSocketUrl)
    const id = 1
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch (_) {}
      rejectCommand(new Error('Timed out while reading YouTube login cookies'))
    }, 10000)

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }))
    })
    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(String(message))
        if (payload.id !== id) return
        clearTimeout(timer)
        ws.close()
        if (payload.error) {
          rejectCommand(new Error(payload.error.message || 'Chrome DevTools command failed'))
          return
        }
        resolveCommand(payload.result)
      } catch (error) {
        clearTimeout(timer)
        try {
          ws.close()
        } catch (_) {}
        rejectCommand(error)
      }
    })
    ws.on('error', (error) => {
      clearTimeout(timer)
      rejectCommand(error)
    })
  })
}

function toNetscapeCookieLine(cookie) {
  if (!cookie?.name || typeof cookie.value !== 'string') return ''
  const rawDomain = String(cookie.domain || '').trim()
  if (!rawDomain) return ''
  const domain = cookie.httpOnly && !rawDomain.startsWith('#HttpOnly_')
    ? `#HttpOnly_${rawDomain}`
    : rawDomain
  const includeSubdomains = rawDomain.startsWith('.') ? 'TRUE' : 'FALSE'
  const pathValue = cookie.path || '/'
  const secure = cookie.secure ? 'TRUE' : 'FALSE'
  const expires = Number.isFinite(cookie.expires)
    ? Math.max(0, Math.trunc(cookie.expires))
    : Number.isFinite(cookie.expirationDate)
      ? Math.max(0, Math.trunc(cookie.expirationDate))
      : 0
  return [domain, includeSubdomains, pathValue, secure, expires, cookie.name, cookie.value].join('\t')
}

function writeNetscapeCookiesFile(cookies, filePath) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# This file is generated by ECHO for yt-dlp. Do not share it.',
    ...cookies.map(toNetscapeCookieLine).filter(Boolean)
  ]
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function isYouTubeCookieSignedIn(cookies = []) {
  return cookies.some(
    (cookie) =>
      /(^|\.)youtube\.com$/i.test(String(cookie.domain || '').replace(/^#HttpOnly_/, '')) &&
      (cookie.name === 'SID' || cookie.name === 'SSID' || cookie.name === 'LOGIN_INFO')
  )
}

function isSoundCloudCookieSignedIn(cookies = []) {
  return cookies.some((cookie) => {
    const domain = String(cookie.domain || '').replace(/^#HttpOnly_/, '')
    return /(^|\.)soundcloud\.com$/i.test(domain) && /^oauth_token$/i.test(cookie.name)
  })
}

async function writeSoundCloudCookiesFromSession() {
  const filePath = getInternalSoundCloudCookieFile()
  const ses = await getMainWindowSession()
  const cookies = await ses.cookies.get({ domain: '.soundcloud.com' })
  if (isSoundCloudCookieSignedIn(cookies)) {
    writeNetscapeCookiesFile(cookies, filePath)
    return filePath
  }
  return existsSync(filePath) ? filePath : ''
}

async function saveSoundCloudCookiesFromSystemBrowser() {
  if (!soundCloudSystemBrowserSession?.port) {
    return { ok: false, error: 'browser_not_open' }
  }
  const targets = await fetchJsonWithRetry(
    `http://127.0.0.1:${soundCloudSystemBrowserSession.port}/json/list`
  )
  const pageTarget = Array.isArray(targets)
    ? targets.find((target) => /soundcloud\.com/i.test(String(target.url || ''))) || targets[0]
    : null
  const webSocketDebuggerUrl = pageTarget?.webSocketDebuggerUrl
  if (!webSocketDebuggerUrl) {
    return { ok: false, error: 'debug_endpoint_not_ready' }
  }
  const result = await sendCdpCommand(webSocketDebuggerUrl, 'Network.getAllCookies')
  const cookies = Array.isArray(result?.cookies) ? result.cookies : []
  const usefulCookies = cookies.filter((cookie) => {
    const domain = String(cookie.domain || '').replace(/^#HttpOnly_/, '')
    return /(^|\.)soundcloud\.com$/i.test(domain) || /(^|\.)sndcdn\.com$/i.test(domain)
  })
  if (!isSoundCloudCookieSignedIn(usefulCookies)) {
    return { ok: false, error: 'not_signed_in' }
  }
  const filePath = getInternalSoundCloudCookieFile()
  writeNetscapeCookiesFile(usefulCookies, filePath)
  notifySignInStatusChanged()
  return { ok: true, signedIn: true, filePath }
}

function scheduleSoundCloudSystemCookieCapture() {
  if (soundCloudSystemCookiePollTimer) {
    clearTimeout(soundCloudSystemCookiePollTimer)
    soundCloudSystemCookiePollTimer = null
  }
  const deadline = Date.now() + 3 * 60 * 1000
  const poll = async () => {
    if (!soundCloudSystemBrowserSession?.port) return
    try {
      const result = await saveSoundCloudCookiesFromSystemBrowser()
      if (result?.ok && result.signedIn) {
        soundCloudSystemCookiePollTimer = null
        return
      }
    } catch (error) {
      console.warn('[SoundCloud] system browser cookie capture failed:', error?.message || error)
    }
    if (Date.now() >= deadline) {
      soundCloudSystemCookiePollTimer = null
      return
    }
    soundCloudSystemCookiePollTimer = setTimeout(poll, 3000)
    soundCloudSystemCookiePollTimer.unref?.()
  }
  soundCloudSystemCookiePollTimer = setTimeout(poll, 2500)
  soundCloudSystemCookiePollTimer.unref?.()
}

function withResolvedYoutubeCookieOptions(options = {}) {
  const next = { ...(options || {}) }
  const internalCookieFile = getInternalYoutubeCookieFile()
  if (existsSync(internalCookieFile)) {
    next.youtubeCookieFile = internalCookieFile
  }
  return next
}

function scheduleAppStateFlush() {
  clearAppStateWriteTimer()
  appStateWriteTimer = setTimeout(() => {
    appStateWriteTimer = null
    flushAppStateCacheSync()
  }, APP_STATE_WRITE_DEBOUNCE_MS)
}

function cloneAppStateSnapshot() {
  const state = ensureAppStateCache()
  try {
    return JSON.parse(JSON.stringify(state))
  } catch {
    return { ...state }
  }
}

function getAutoUpdateEnabledFromState() {
  const config = ensureAppStateCache()?.config
  return config?.autoUpdateEnabled !== false && config?.networkAccessDisabled !== true
}

let networkAccessDisabled = false

function getNetworkAccessDisabledFromState() {
  const config = ensureAppStateCache()?.config
  return config?.networkAccessDisabled === true
}

function isNetworkAccessDisabled() {
  return networkAccessDisabled || getNetworkAccessDisabledFromState()
}

function isLocalNetworkUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''))
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function buildNetworkDisabledResult() {
  return { ok: false, success: false, error: 'network_disabled' }
}

function getSavedNeteaseCookieFromAppState() {
  try {
    const state = ensureAppStateCache()
    const cookie = state?.downloaderSettings?.neteaseCookie
    return typeof cookie === 'string' ? cookie.trim() : ''
  } catch {
    return ''
  }
}

function getSavedQqMusicCookieFromAppState() {
  try {
    const state = ensureAppStateCache()
    const cookie = state?.downloaderSettings?.qqMusicCookie
    return typeof cookie === 'string' ? cookie.trim() : ''
  } catch {
    return ''
  }
}

function updateDownloaderSettingsAuth(patch = {}) {
  const state = ensureAppStateCache()
  const current =
    state.downloaderSettings && typeof state.downloaderSettings === 'object'
      ? state.downloaderSettings
      : {}
  state.downloaderSettings = {
    ...current,
    ...patch
  }
  flushAppStateCacheSync()
}

async function getMainWindowSession() {
  if (mainWindow?.webContents?.session) return mainWindow.webContents.session
  return session.defaultSession
}

async function clearSessionCookiesForDomains(electronSession, domains = []) {
  if (!electronSession?.cookies?.get || !electronSession?.cookies?.remove) {
    return { removed: 0, errors: [] }
  }
  const errors = []
  let removed = 0
  const seen = new Set()
  const normalizedDomains = domains
    .map((domain) =>
      String(domain || '')
        .trim()
        .replace(/^#HttpOnly_/, '')
        .replace(/^\./, '')
        .toLowerCase()
    )
    .filter(Boolean)

  const matchesTargetDomain = (cookie) => {
    const host = String(cookie?.domain || '')
      .replace(/^#HttpOnly_/, '')
      .replace(/^\./, '')
      .toLowerCase()
    if (!host) return false
    return normalizedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  }

  const candidateCookies = []
  const addCookie = (cookie) => {
    if (!cookie || !matchesTargetDomain(cookie)) return
    candidateCookies.push(cookie)
  }

  for (const domain of domains) {
    let cookies = []
    try {
      cookies = await electronSession.cookies.get({ domain })
    } catch (error) {
      errors.push(error?.message || String(error))
      continue
    }

    for (const cookie of cookies) {
      addCookie(cookie)
    }
  }

  try {
    const allCookies = await electronSession.cookies.get({})
    for (const cookie of allCookies) {
      addCookie(cookie)
    }
  } catch (error) {
    errors.push(error?.message || String(error))
  }

  for (const cookie of candidateCookies) {
    const name = String(cookie?.name || '')
    if (!name) continue
    const host = String(cookie.domain || '')
      .replace(/^#HttpOnly_/, '')
      .replace(/^\./, '')
    if (!host) continue
    const path = String(cookie.path || '/')
    const key = `${host}\n${path}\n${name}`
    if (seen.has(key)) continue
    seen.add(key)
    const encodedPath = path.startsWith('/') ? path : `/${path}`
    const schemes = cookie.secure === false ? ['http', 'https'] : ['https', 'http']
    for (const scheme of schemes) {
      try {
        await electronSession.cookies.remove(`${scheme}://${host}${encodedPath}`, name)
        removed += 1
        break
      } catch (error) {
        if (scheme === schemes[schemes.length - 1]) {
          errors.push(error?.message || String(error))
        }
      }
    }
  }

  return { removed, errors }
}

function notifySignInStatusChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('signin:status-changed')
  }
}

async function resolveNeteaseAuthState(preferredCookie = '') {
  const candidates = []
  const pushCandidate = (cookie, source) => {
    const trimmed = String(cookie || '').trim()
    if (!trimmed) return
    if (candidates.some((item) => item.cookie === trimmed)) return
    candidates.push({ cookie: trimmed, source })
  }

  const ses = await getMainWindowSession()
  pushCandidate(await getNeteaseCookieFromSession(ses), 'session')
  pushCandidate(preferredCookie, 'preferred')
  pushCandidate(getSavedNeteaseCookieFromAppState(), 'appState')
  pushCandidate(process.env.ECHOES_NETEASE_COOKIE?.trim(), 'env')

  let lastChecked = null
  for (const candidate of candidates) {
    const checked = await validateNeteaseCookie(candidate.cookie)
    lastChecked = { ...checked, source: candidate.source }
    if (checked.valid) {
      return {
        ok: true,
        checked: true,
        valid: true,
        signedIn: true,
        cookie: candidate.cookie,
        source: candidate.source,
        hasMusicU: checked.hasMusicU,
        hasMusicA: checked.hasMusicA,
        account: checked.account,
        profile: checked.profile,
        vipType: checked.vipType || 0,
        isVip: checked.isVip === true
      }
    }
  }

  return {
    ok: true,
    checked: Boolean(lastChecked?.checked),
    valid: false,
    signedIn: false,
    cookie: '',
    source: lastChecked?.source || '',
    hasMusicU: Boolean(lastChecked?.hasMusicU),
    hasMusicA: Boolean(lastChecked?.hasMusicA),
    account: null,
    profile: null,
    vipType: 0,
    isVip: false,
    error: lastChecked?.checked === false ? lastChecked?.error || '' : ''
  }
}

function resolveAppIconPath() {
  const candidates = [
    join(__dirname, '..', '..', 'software.png'),
    resolve(process.resourcesPath || '', 'software.png'),
    resolve(app.getAppPath(), 'software.png'),
    resolve(app.getAppPath(), '..', 'software.png'),
    resolve(__dirname, '..', '..', 'software.png'),
    resolve(process.cwd(), 'software.png'),
    join(__dirname, '..', '..', 'website', 'icon.png'),
    resolve(app.getAppPath(), 'website', 'icon.png'),
    resolve(app.getAppPath(), '..', 'website', 'icon.png'),
    resolve(__dirname, '..', '..', 'website', 'icon.png'),
    resolve(process.cwd(), 'website', 'icon.png')
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore and try next path
    }
  }

  return ''
}

function createAppWindowIcon() {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return undefined
  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? undefined : icon
}

/** Override with env `ECHOES_SOUNDCLOUD_PROXY` (no trailing slash), e.g. https://your-proxy.example.com */
const SOUNDCLOUD_PROXY_BASE = (
  process.env.ECHOES_SOUNDCLOUD_PROXY || 'https://soundcloud-ep22.onrender.com'
).replace(/\/$/, '')

function sanitizeDownloadStem(name, fallback = 'soundcloud-track') {
  const stem = String(name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return stem || fallback
}

function buildUniqueDownloadPath(targetDir, stem, ext) {
  const baseStem = sanitizeDownloadStem(stem)
  let candidate = join(targetDir, `${baseStem}${ext}`)
  let index = 2
  while (fs.existsSync(candidate)) {
    candidate = join(targetDir, `${baseStem} (${index})${ext}`)
    index += 1
  }
  return candidate
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function createRendererHttpServer(rendererRoot) {
  return http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${RENDERER_HTTP_HOST}`)
      let pathname = decodeURIComponent(requestUrl.pathname || '/')
      if (pathname === '/') pathname = '/index.html'

      const normalizedPath = pathname.replace(/^\/+/, '')
      let targetPath = resolve(join(rendererRoot, normalizedPath))

      const allowedPrefix = `${rendererRoot}${sep}`
      if (targetPath !== rendererRoot && !targetPath.startsWith(allowedPrefix)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        targetPath = resolve(join(rendererRoot, 'index.html'))
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      res.writeHead(200, {
        'Content-Type': getMimeType(targetPath),
        'Cache-Control': 'no-cache'
      })
      fs.createReadStream(targetPath).pipe(res)
    } catch (e) {
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  })
}

function listenRendererHttpServer(server, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => {
      server.off('listening', onListening)
      rejectPromise(error)
    }
    const onListening = () => {
      server.off('error', onError)
      const addr = server.address()
      const resolvedPort = typeof addr === 'object' && addr ? addr.port : port
      resolvePromise(resolvedPort)
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, RENDERER_HTTP_HOST)
  })
}

async function startRendererHttpServer() {
  if (rendererServerUrl) return rendererServerUrl

  const rendererRoot = resolve(join(__dirname, '../renderer'))
  let server = createRendererHttpServer(rendererRoot)
  let port = RENDERER_HTTP_PREFERRED_PORT

  try {
    port = await listenRendererHttpServer(server, RENDERER_HTTP_PREFERRED_PORT)
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error
    console.warn(
      `[RendererServer] Preferred port ${RENDERER_HTTP_PREFERRED_PORT} is busy; falling back to a random port. Renderer IndexedDB caches may not be reused for this run.`
    )
    try {
      server.close()
    } catch {}
    server = createRendererHttpServer(rendererRoot)
    port = await listenRendererHttpServer(server, 0)
  }

  rendererHttpServer = server
  rendererServerUrl = `http://${RENDERER_HTTP_HOST}:${port}`
  console.log(`[RendererServer] Started at ${rendererServerUrl}`)

  return rendererServerUrl
}

async function stopRendererHttpServer() {
  if (!rendererHttpServer) return
  await new Promise((resolvePromise) => {
    rendererHttpServer.close(() => resolvePromise())
  })
  rendererHttpServer = null
  rendererServerUrl = null
}

function initUpdater() {
  updaterAutoCheckEnabled = getAutoUpdateEnabledFromState()

  const sendUpdaterEvent = (event, data = {}) => {
    const payload = { event, ...data }
    const dedupeKey = buildUpdaterEventDedupeKey(event, data)
    if (dedupeKey === updaterLastEventKey) return
    updaterLastEventKey = dedupeKey
    updaterCurrentEvent = payload
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-message', payload)
    }
  }

  const finishCheck = () => {
    updaterCheckPromise = null
  }

  const runUpdateCheck = async (source = 'manual') => {
    if (isNetworkAccessDisabled()) {
      sendUpdaterEvent('error', { message: 'network_disabled' })
      return buildNetworkDisabledResult()
    }

    if (updaterCheckPromise) {
      console.log(`[UpdaterState] Reusing in-flight check for source=${source}`)
      if (source === 'manual' && updaterCurrentEvent?.event) {
        sendUpdaterEvent(updaterCurrentEvent.event, updaterCurrentEvent)
      }
      return updaterCheckPromise
    }

    if (shouldReuseUpdaterState(updaterCurrentEvent)) {
      console.log(
        `[UpdaterState] Reusing existing state=${updaterCurrentEvent?.event || 'unknown'}`
      )
      if (source === 'manual') {
        sendUpdaterEvent(updaterCurrentEvent.event, updaterCurrentEvent)
      }
      return { success: true, skipped: true, state: updaterCurrentEvent }
    }

    updaterCheckPromise = autoUpdater
      .checkForUpdates()
      .then((result) => ({ success: true, info: result?.updateInfo }))
      .catch((e) => {
        console.error('[Updater] 检查更新失败:', e)
        sendUpdaterEvent('error', { message: e?.message || String(e) })
        return { success: false, error: e?.message || String(e) }
      })
      .finally(() => {
        finishCheck()
      })

    return updaterCheckPromise
  }

  autoUpdater.autoDownload = true // 发现新版后自动在后台下载
  autoUpdater.autoInstallOnAppQuit = true // 关闭时自动安装

  if (!updaterListenersBound) {
    updaterListenersBound = true

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for updates')
      sendUpdaterEvent('checking')
    })

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] 发现新版本:', info.version)
      sendUpdaterEvent('update-available', { version: info.version })
    })

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] Update not available')
      sendUpdaterEvent('update-not-available')
    })

    autoUpdater.on('download-progress', (prog) => {
      sendUpdaterEvent('download-progress', { percent: Math.round(prog.percent || 0) })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] 新版本已下载完毕:', info.version)
      sendUpdaterEvent('update-downloaded', { version: info.version })
      if (!mainWindow || mainWindow.isDestroyed()) return
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: '发现新版本',
          message: `ECHO ${info.version} 已经下载完毕，是否立刻重启并安装更新？`,
          buttons: ['重启并安装', '稍后安装']
        })
        .then((res) => {
          if (res.response === 0) {
            autoUpdater.quitAndInstall(false, true)
          }
        })
    })

    autoUpdater.on('error', (err) => {
      console.error('[Updater] 更新发生错误:', err)
      sendUpdaterEvent('error', { message: err?.message || String(err) })
    })
  }

  ipcMain.handle('app:checkForUpdates', async () => {
    if (isNetworkAccessDisabled()) {
      sendUpdaterEvent('error', { message: 'network_disabled' })
      return buildNetworkDisabledResult()
    }
    if (is.dev) {
      sendUpdaterEvent('update-not-available')
      return { success: true, dev: true }
    }
    return runUpdateCheck('manual')
  })

  ipcMain.handle('app:installUpdate', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (is.dev) return { success: true, dev: true }
    try {
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 启动后静默检查一次
  ipcMain.handle('app:setAutoUpdateEnabled', async (_, enabled) => {
    updaterAutoCheckEnabled = enabled !== false && !isNetworkAccessDisabled()
    return { success: true, enabled: updaterAutoCheckEnabled }
  })

  ipcMain.handle('app:setNetworkAccessDisabled', async (_, disabled) => {
    networkAccessDisabled = disabled === true
    updaterAutoCheckEnabled = getAutoUpdateEnabledFromState()
    autoUpdater.autoDownload = !networkAccessDisabled
    return { success: true, disabled: networkAccessDisabled }
  })

  if (is.dev) return // 不在开发环境自动更新

  if (updaterAutoCheckEnabled) {
    void runUpdateCheck('startup')
  }
}

async function createWindow() {
  const appWindowIcon = createAppWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 760,
    minHeight: 500,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(appWindowIcon ? { icon: appWindowIcon } : {}),
    // Keep timers/rAF running when minimized so desktop lyrics IPC sync does not stall.
    backgroundThrottling: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      // webSecurity must be false so file:// audio works from http(s) pages.
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (updaterCurrentEvent) {
      mainWindow.webContents.send('updater-message', updaterCurrentEvent)
    }
  })

  // Defensive: if the very first navigation fails (GPU cache corruption right after
  // install, transient localhost server hiccup, etc.), reload the renderer once or
  // twice instead of leaving a white window. Bounded so a real persistent failure
  // (bad URL, missing file) still surfaces in logs instead of looping forever.
  let mainWindowReloadAttempts = 0
  const MAIN_WINDOW_MAX_RELOADS = 2
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      // -3 (ABORTED) fires during normal in-app navigation; ignore it.
      if (errorCode === -3) return
      if (mainWindow.isDestroyed()) return
      if (mainWindowReloadAttempts >= MAIN_WINDOW_MAX_RELOADS) {
        console.error(
          '[Window] did-fail-load gave up after retries:',
          errorCode,
          errorDescription
        )
        return
      }
      mainWindowReloadAttempts += 1
      console.warn(
        `[Window] did-fail-load (attempt ${mainWindowReloadAttempts}/${MAIN_WINDOW_MAX_RELOADS}):`,
        errorCode,
        errorDescription,
        '→ reload in 500ms'
      )
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.reload()
      }, 500)
    }
  )
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindowReloadAttempts = 0
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      hideMainWindowToTray()
      return
    }
    cleanupLyricsDesktopWindow()
    cleanupMiniPlayerWindow()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const localUrl = await startRendererHttpServer()
    mainWindow.loadURL(localUrl)
  }

  createTray()
}

// Discord RPC Setup
const DISCORD_CLIENT_ID = '1487118099298779206'
const DISCORD_RPC_RECONNECT_MAX = 10
const DISCORD_RPC_LOG_RATE_MS = 30000
let rpcClient = null
let rpcReady = false
let rpcRetryTimer = null
let rpcConnecting = false
let rpcEnabled = true
let rpcReconnectAttempts = 0
let rpcLastActivity = null
let rpcActivityRevision = 0
let rpcLastActivityErrorLogAt = 0
let rpcDisposePromise = null
let discordRpcQuitCleanupDone = false
/** 应用即将退出（Windows/Linux 关窗链或任意平台 before-quit）：禁止重连 */
let discordRpcQuitting = false
/**
 * Once we've burned through every reconnect attempt we stop touching Discord
 * until something meaningful changes (new track, RPC toggle, etc). Without
 * this flag every periodic setActivity from the renderer would silently kick
 * off another connect→fail→log cycle, which spammed the console with
 * "Disconnected" / "Max reconnect attempts reached" pairs when the user
 * doesn't even have Discord open.
 */
let rpcGaveUp = false
let rpcGaveUpTrackId = ''
let rpcLastConnectErrorLogAt = 0
const rpcCoverCache = new Map()

const DEFAULT_RPC_ACTIVITY = {
  details: 'Browsing library',
  state: 'ECHO',
  largeImageKey: 'echoes_logo',
  largeImageText: 'ECHO - Hi-Fi Audio Player',
  instance: false
}

function clearRpcRetryTimer() {
  if (rpcRetryTimer) {
    clearTimeout(rpcRetryTimer)
    rpcRetryTimer = null
  }
}

/** 重连 / login 前快速拆掉旧 transport，不?? Discord clear（避免闪断展示） */
function destroyRpcClient() {
  if (!rpcClient) {
    rpcReady = false
    rpcConnecting = false
    return
  }
  const c = rpcClient
  rpcClient = null
  rpcReady = false
  rpcConnecting = false
  try {
    c.removeAllListeners()
  } catch (_) {}
  Promise.resolve(c.destroy()).catch(() => {})
}

/** 退出或用户关闭 RPC：先 clearActivity ?? destroy，减少对端残留「正在玩?? */
async function disposeDiscordRpc() {
  if (rpcDisposePromise) return rpcDisposePromise
  clearRpcRetryTimer()
  const c = rpcClient
  const wasReady = rpcReady
  rpcClient = null
  rpcReady = false
  rpcConnecting = false
  rpcDisposePromise = (async () => {
    if (!c) return
    try {
      if (wasReady) await c.clearActivity()
    } catch (_) {}
    try {
      c.removeAllListeners()
    } catch (_) {}
    try {
      await c.destroy()
    } catch (_) {}
  })().finally(() => {
    rpcDisposePromise = null
  })
  return rpcDisposePromise
}

function handleDiscordRpcCommandFailure(error, reason, client, reconnect = true) {
  if (discordRpcQuitting) return
  const message = error?.message || error
  rpcReady = false
  rpcConnecting = false
  if (rpcClient === client) destroyRpcClient()
  const now = Date.now()
  if (now - rpcLastActivityErrorLogAt > 15000) {
    rpcLastActivityErrorLogAt = now
    console.warn(`[Discord RPC] ${reason}:`, message)
  }
  if (reconnect) scheduleDiscordReconnect(reason)
}

function buildRpcPayload(activity = {}) {
  const payload = {
    details: activity.title || 'Unknown Track',
    state: `${activity.artist || 'ECHO'}${activity.playbackRate ? ` · ${activity.playbackRate}x Speed` : ''}`,
    // NOTE: Discord RPC expects app asset key, not arbitrary URL.
    largeImageKey: 'echoes_logo',
    largeImageText: 'ECHO',
    smallImageKey: activity.isPlaying ? 'playing' : 'paused',
    smallImageText: activity.isPlaying ? 'Playing' : 'Paused',
    instance: false
  }

  if (activity.startTimestamp && Number.isFinite(activity.startTimestamp)) {
    payload.startTimestamp = activity.startTimestamp
  }
  if (activity.endTimestamp && Number.isFinite(activity.endTimestamp)) {
    payload.endTimestamp = activity.endTimestamp
  }

  return payload
}

function normalizeDiscordExternalImageUrl(coverUrl) {
  if (!coverUrl || typeof coverUrl !== 'string') return null
  const url = coverUrl.trim()
  if (!/^https?:\/\//i.test(url)) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost')
    ) {
      return null
    }
    if (parsed.protocol === 'http:') parsed.protocol = 'https:'
    return parsed.toString()
  } catch (_) {
    return null
  }
}

function getDiscordImageKeyCandidates(coverUrl) {
  const url = normalizeDiscordExternalImageUrl(coverUrl)
  return url ? [url] : []
}

async function resolveRpcCoverUrl(activity = {}) {
  const activityCoverUrl = normalizeDiscordExternalImageUrl(activity?.coverUrl)
  if (activityCoverUrl) {
    return activityCoverUrl
  }

  const title = (activity?.title || '').trim()
  const artist = (activity?.artist || '').trim()
  const cacheKey = `${title}::${artist}`
  if (!title) return null

  if (rpcCoverCache.has(cacheKey)) {
    return rpcCoverCache.get(cacheKey)
  }

  try {
    const query = encodeURIComponent(`${title} ${artist}`.trim())
    const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=1`
    const response = await axios.get(url, { timeout: 5000 })
    const artwork = response?.data?.results?.[0]?.artworkUrl100 || null
    const highRes = artwork ? artwork.replace('100x100bb.jpg', '1000x1000bb.jpg') : null
    rpcCoverCache.set(cacheKey, highRes)
    return highRes
  } catch (_) {
    rpcCoverCache.set(cacheKey, null)
    return null
  }
}

async function applyRpcActivity(activity, fallbackToDefault = false, expectedRevision = rpcActivityRevision) {
  if (discordRpcQuitting || !rpcClient || !rpcReady) return false
  const client = rpcClient
  const isStaleActivity = () => expectedRevision !== rpcActivityRevision
  const refreshIfStale = () => {
    if (!isStaleActivity() || discordRpcQuitting || !rpcEnabled) return
    const revision = rpcActivityRevision
    setTimeout(() => {
      applyRpcActivity(rpcLastActivity, true, revision).catch(() => {})
    }, 0)
  }
  try {
    if (activity) {
      if (isStaleActivity()) return false
      const payload = buildRpcPayload(activity)
      const resolvedCoverUrl = await resolveRpcCoverUrl(activity)
      if (discordRpcQuitting || !rpcReady || rpcClient !== client || isStaleActivity()) return false
      const candidates = getDiscordImageKeyCandidates(resolvedCoverUrl)

      for (const imageKey of candidates) {
        if (discordRpcQuitting || !rpcReady || rpcClient !== client || isStaleActivity()) return false
        try {
          await client.setActivity({
            ...payload,
            largeImageKey: imageKey,
            largeImageText: `${activity.title || 'Unknown Track'} cover`
          })
          if (isStaleActivity()) {
            refreshIfStale()
            return false
          }
          return true
        } catch (_) {
          // Try next candidate
        }
      }

      // Fallback to app default asset if dynamic cover fails.
      if (discordRpcQuitting || !rpcReady || rpcClient !== client || isStaleActivity()) return false
      await client.setActivity(payload)
      if (isStaleActivity()) {
        refreshIfStale()
        return false
      }
      return true
    }

    if (discordRpcQuitting || !rpcReady || rpcClient !== client || isStaleActivity()) return false
    await client.setActivity(DEFAULT_RPC_ACTIVITY)
    return true
  } catch (e) {
    if (fallbackToDefault) {
      try {
        if (discordRpcQuitting || !rpcReady || rpcClient !== client || isStaleActivity()) return false
        await client.setActivity(DEFAULT_RPC_ACTIVITY)
        return true
      } catch (_) {}
    }
    rpcReady = false
    rpcConnecting = false
    if (rpcClient === client) destroyRpcClient()
    const now = Date.now()
    if (now - rpcLastActivityErrorLogAt > 15000) {
      rpcLastActivityErrorLogAt = now
      console.warn('[Discord RPC] setActivity failed:', e?.message || e)
    }
    scheduleDiscordReconnect('set-activity-failed')
    return false
  }
}

async function resolveQqMusicAuthState(preferredCookie = '') {
  const candidates = []
  const pushCandidate = (cookie, source) => {
    const trimmed = String(cookie || '').trim()
    if (!trimmed) return
    if (candidates.some((item) => item.cookie === trimmed)) return
    candidates.push({ cookie: trimmed, source })
  }

  const ses = await getMainWindowSession()
  pushCandidate(await getQqMusicCookieFromSession(ses), 'session')
  pushCandidate(preferredCookie, 'preferred')
  pushCandidate(getSavedQqMusicCookieFromAppState(), 'appState')
  pushCandidate(process.env.ECHOES_QQMUSIC_COOKIE?.trim(), 'env')

  let lastChecked = null
  for (const candidate of candidates) {
    const checked = await validateQqMusicCookie(candidate.cookie)
    lastChecked = { ...checked, source: candidate.source }
    if (checked.valid) {
      return {
        ok: true,
        checked: true,
        valid: true,
        signedIn: true,
        cookie: candidate.cookie,
        source: candidate.source,
        uin: checked.uin,
        profile: checked.profile,
        isVip: checked.isVip === true
      }
    }
  }

  return {
    ok: true,
    checked: Boolean(lastChecked?.checked),
    valid: false,
    signedIn: false,
    cookie: candidates[0]?.cookie || '',
    source: lastChecked?.source || '',
    uin: lastChecked?.uin || '',
    profile: null,
    isVip: false,
    error: lastChecked?.checked === false ? lastChecked?.error || '' : ''
  }
}

function resetDiscordRpcGiveUp() {
  rpcGaveUp = false
  rpcGaveUpTrackId = ''
  rpcReconnectAttempts = 0
}

function logDiscordConnectFailure(level, message) {
  const now = Date.now()
  if (now - rpcLastConnectErrorLogAt < DISCORD_RPC_LOG_RATE_MS) return
  rpcLastConnectErrorLogAt = now
  if (level === 'warn') console.warn(message)
  else console.log(message)
}

function scheduleDiscordReconnect(reason = 'unknown') {
  if (discordRpcQuitting || !rpcEnabled) return
  if (!rpcLastActivity) return
  if (rpcRetryTimer) return
  if (rpcGaveUp) return
  if (rpcReconnectAttempts >= DISCORD_RPC_RECONNECT_MAX) {
    rpcGaveUp = true
    rpcGaveUpTrackId = rpcLastActivity?.trackId || ''
    console.warn(
      '[Discord RPC] Max reconnect attempts reached; change track or re-enable RPC to retry.'
    )
    return
  }

  const delay = Math.min(5000 * Math.pow(2, rpcReconnectAttempts), 60000)
  rpcReconnectAttempts += 1
  console.log(`[Discord RPC] Reconnect scheduled in ${delay}ms (${reason})`)
  rpcRetryTimer = setTimeout(() => {
    rpcRetryTimer = null
    if (rpcLastActivity && !rpcGaveUp) initDiscordRPC()
  }, delay)
}

function initDiscordRPC() {
  if (discordRpcQuitting || !rpcEnabled || !rpcLastActivity) return
  if (rpcReady || rpcConnecting) return

  clearRpcRetryTimer()
  destroyRpcClient()

  try {
    try {
      DiscordRPC.register(DISCORD_CLIENT_ID)
    } catch (_) {}
    rpcConnecting = true
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' })
    const client = rpcClient

    client.on('ready', () => {
      if (rpcClient !== client) return
      rpcReady = true
      rpcConnecting = false
      resetDiscordRpcGiveUp()
      rpcLastConnectErrorLogAt = 0
      console.log('[Discord RPC] Connected!')
      if (rpcLastActivity) {
        applyRpcActivity(rpcLastActivity, true, rpcActivityRevision).catch(() => {})
      }
    })

    client.on('disconnected', () => {
      if (rpcClient !== client) return
      logDiscordConnectFailure('log', '[Discord RPC] Disconnected')
      rpcReady = false
      rpcConnecting = false
      destroyRpcClient()
      scheduleDiscordReconnect('disconnected')
    })

    client.on('error', (err) => {
      if (rpcClient !== client) return
      logDiscordConnectFailure('log', `[Discord RPC] Client error: ${err?.message || err}`)
      rpcReady = false
      rpcConnecting = false
      destroyRpcClient()
      scheduleDiscordReconnect('client-error')
    })

    client.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
      if (rpcClient !== client) return
      logDiscordConnectFailure('log', `[Discord RPC] Login failed: ${err?.message || err}`)
      rpcReady = false
      rpcConnecting = false
      destroyRpcClient()
      scheduleDiscordReconnect('login-failed')
    })
  } catch (e) {
    logDiscordConnectFailure('log', `[Discord RPC] Init error: ${e?.message || e}`)
    rpcReady = false
    rpcConnecting = false
    destroyRpcClient()
    scheduleDiscordReconnect('init-error')
  }
}

app.whenReady().then(async () => {
  app.setName(APP_NAME)
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)
  loadAppStateCache()

  const chromeVersion = process.versions.chrome || '126.0.0.0'
  const chromeMajor = chromeVersion.split('.')[0]
  const standardUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  const MV_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
  const BILI_STREAM_CACHE_TTL_MS = 8 * 60 * 1000
  const BILI_SEARCH_API_BACKOFF_MS = 2 * 60 * 1000
  const mvSearchCache = new Map()
  const mvSearchPending = new Map()
  const biliStreamCache = new Map()
  const biliStreamPending = new Map()
  let bilibiliSearchApiBackoffUntil = 0

  const readTimedCache = (cache, key, ttlMs) => {
    const hit = cache.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > ttlMs) {
      cache.delete(key)
      return null
    }
    return hit.value
  }

  const writeTimedCache = (cache, key, value) => {
    cache.set(key, { value, at: Date.now() })
    return value
  }

  app.userAgentFallback = standardUA
  session.defaultSession.setUserAgent(standardUA)
  networkAccessDisabled = getNetworkAccessDisabledFromState()

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      if (isNetworkAccessDisabled() && !isLocalNetworkUrl(details.url)) {
        callback({ cancel: true })
        return
      }
      callback({})
    }
  )

  initUpdater()

  // 修正 Sec-CH-UA Client Hints + B 站视???CDN Referer 注入
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://*.google.com/*',
        'https://*.youtube.com/*',
        'https://*.gstatic.com/*',
        'https://*.googleapis.com/*',
        'https://*.bilivideo.com/*',
        'https://*.bilivideo.cn/*'
      ]
    },
    (details, callback) => {
      const h = details.requestHeaders
      h['User-Agent'] = standardUA
      if (/bilivideo\.com|bilivideo\.cn/i.test(details.url)) {
        h['Referer'] = 'https://www.bilibili.com/'
        h['Origin'] = 'https://www.bilibili.com'
      } else {
        h['Sec-CH-UA'] =
          `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not_A Brand";v="8"`
        h['Sec-CH-UA-Mobile'] = '?0'
        h['Sec-CH-UA-Platform'] = `"Windows"`
      }
      callback({ requestHeaders: h })
    }
  )

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://*.bilivideo.com/*', 'https://*.bilivideo.cn/*'] },
    (details, callback) => {
      const rh = details.responseHeaders || {}
      rh['access-control-allow-origin'] = ['*']
      rh['access-control-allow-methods'] = ['GET, HEAD, OPTIONS']
      callback({ responseHeaders: rh })
    }
  )

  // 初始化崩溃报告器（必须在最前）
  initCrashReporter(() => audioEngine.getStatus())

  // 插件系统
  const pluginManager = new PluginManager()
  pluginManager.registerIPC()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('app:getVersion', async () => {
    try {
      return app.getVersion()
    } catch {
      return '0.0.0'
    }
  })

  ipcMain.handle('appState:get', async (_, key) => {
    if (!APP_STATE_KEYS.has(key)) return null
    const state = ensureAppStateCache()
    return state[key] ?? null
  })

  ipcMain.handle('appState:getSnapshot', async () => cloneAppStateSnapshot())

  ipcMain.on('appState:getSnapshotSync', (event) => {
    event.returnValue = cloneAppStateSnapshot()
  })

  ipcMain.handle('appState:set', async (_, key, value) => {
    if (!APP_STATE_KEYS.has(key)) return { ok: false, error: 'invalid_key' }
    const state = ensureAppStateCache()
    state[key] = value
    if (APP_STATE_IMMEDIATE_FLUSH_KEYS.has(key)) {
      flushAppStateCacheSync()
    } else {
      scheduleAppStateFlush()
    }
    return { ok: true }
  })

  ipcMain.handle('remoteLibrary:listSources', async () => ({
    ok: true,
    sources: getRemoteSourcesSafe(),
    encryptionAvailable: Boolean(safeStorage?.isEncryptionAvailable?.())
  }))

  ipcMain.handle('remoteLibrary:saveSource', async (_, payload = {}) => {
    try {
      const state = getRemoteLibraryState()
      const now = new Date().toISOString()
      const id = payload.id || createRemoteSourceId()
      const existingIndex = state.sources.findIndex(source => source.id === id)
      const existing = existingIndex >= 0 ? state.sources[existingIndex] : null
      const sourceType = normalizeRemoteSourceType(payload.type || existing?.type)
      const passwordProvided = typeof payload.password === 'string' && payload.password.length > 0
      const encryptedPassword =
        isCredentialRemoteSourceType(sourceType)
          ? passwordProvided
            ? encryptRemotePassword(payload.password)
            : existing?.password || null
          : null
      const source = {
        id,
        type: sourceType,
        name:
          String(
            payload.name ||
              existing?.name ||
              getDefaultRemoteSourceName(sourceType)
          ).trim() || getDefaultRemoteSourceName(sourceType),
        serverUrl:
          isCredentialRemoteSourceType(sourceType)
            ? normalizeRemoteServerUrl(payload.serverUrl || existing?.serverUrl || '', sourceType)
            : '',
        folderPath:
          isFileBackedRemoteSourceType(sourceType)
            ? String(payload.folderPath || existing?.folderPath || '').trim()
            : '',
        username:
          isCredentialRemoteSourceType(sourceType)
            ? String(payload.username || existing?.username || '').trim()
            : '',
        password: encryptedPassword,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }
      if (isFileBackedRemoteSourceType(sourceType)) {
        if (!source.folderPath) {
          return { ok: false, error: '文件夹路径不能为空' }
        }
        try {
          const stats = await fs.promises.stat(source.folderPath)
          if (!stats.isDirectory()) {
            return { ok: false, error: '路径不是可访问的文件夹' }
          }
        } catch (error) {
          return { ok: false, error: error?.message || String(error) }
        }
      }
      if (sourceType === 'subsonic' && !source.serverUrl) {
        return { ok: false, error: '服务器地址不能为空' }
      }
      if (sourceType === 'webdav' && !source.serverUrl) {
        return { ok: false, error: '网盘 WebDAV 地址不能为空' }
      }
      if (isJellyfinLikeSourceType(sourceType) && !source.serverUrl) {
        return { ok: false, error: 'Jellyfin / Emby 服务器地址不能为空' }
      }
      if (sourceType === 'subsonic' && !source.username) {
        return { ok: false, error: '用户名不能为空' }
      }
      if (isJellyfinLikeSourceType(sourceType) && !source.username) {
        return { ok: false, error: 'Jellyfin / Emby 用户名不能为空' }
      }
      if (false && sourceType === 'subsonic' && !source.username) {
        return { ok: false, error: '用户名不能为空' }
      }
      if (isCredentialRemoteSourceType(sourceType) && passwordProvided && !encryptedPassword) {
        return { ok: false, error: '当前系统不可用安全存储，未保存密码' }
      }
      if (sourceType === 'subsonic' && !source.password) {
        return { ok: false, error: '请填写密码或 API 密码' }
      }
      if (isJellyfinLikeSourceType(sourceType) && !source.password) {
        return { ok: false, error: '请填写 Jellyfin / Emby 密码' }
      }
      if (false && sourceType === 'subsonic' && !source.serverUrl) {
        return { ok: false, error: '服务器地址不能为空' }
      }
      if (false && sourceType === 'subsonic' && !source.username) {
        return { ok: false, error: '用户名不能为空' }
      }
      if (false && sourceType === 'subsonic' && passwordProvided && !encryptedPassword) {
        return { ok: false, error: '当前系统不可用安全存储，未保存密码' }
      }
      if (false && sourceType === 'subsonic' && !source.password) {
        return { ok: false, error: '请填写密码或 API 密码' }
      }
      if (existingIndex >= 0) {
        state.sources[existingIndex] = source
      } else {
        state.sources.push(source)
      }
      flushAppStateCacheSync()
      return { ok: true, source: getRemoteSourcesSafe().find(item => item.id === id) }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('remoteLibrary:removeSource', async (_, sourceId) => {
    const state = getRemoteLibraryState()
    const before = state.sources.length
    state.sources = state.sources.filter(source => source.id !== sourceId)
    if (state.sources.length !== before) {
      flushAppStateCacheSync()
    }
    return { ok: true, sources: getRemoteSourcesSafe() }
  })

  ipcMain.handle('remoteLibrary:testSource', async (_, payload = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const existing = payload.id ? findRemoteSource(payload.id) : null
      const sourceType = normalizeRemoteSourceType(payload.type || existing?.type)
      if (isFileBackedRemoteSourceType(sourceType)) {
        const folderPath = String(payload.folderPath || existing?.folderPath || '').trim()
        if (!folderPath) return { ok: false, error: '文件夹路径不能为空' }
        const stats = await fs.promises.stat(folderPath)
        if (!stats.isDirectory()) {
          return { ok: false, error: '路径不是可访问的文件夹' }
        }
        return { ok: true }
      }
      if (sourceType === 'webdav') {
        const source =
          payload.id && !payload.serverUrl
            ? existing
            : {
                id: payload.id || 'test',
                name: payload.name || '网盘音乐',
                serverUrl: normalizeRemoteServerUrl(
                  payload.serverUrl || existing?.serverUrl || '',
                  sourceType
                ),
                username: String(payload.username || existing?.username || '').trim(),
                password: existing?.password || null
              }
        const passwordOverride =
          typeof payload.password === 'string' && payload.password.length > 0
            ? payload.password
            : undefined
        const client = createWebDavClientForSource(source, passwordOverride)
        await client.ping()
        return { ok: true }
      }
      if (isJellyfinLikeSourceType(sourceType)) {
        const source =
          payload.id && !payload.serverUrl
            ? existing
            : {
                id: payload.id || 'test',
                type: sourceType,
                name: payload.name || getDefaultRemoteSourceName(sourceType),
                serverUrl: normalizeRemoteServerUrl(
                  payload.serverUrl || existing?.serverUrl || '',
                  sourceType
                ),
                username: String(payload.username || existing?.username || '').trim(),
                password: existing?.password || null
              }
        const passwordOverride =
          typeof payload.password === 'string' && payload.password.length > 0
            ? payload.password
            : undefined
        const client = createJellyfinClientForSource(source, passwordOverride)
        await client.ping()
        return { ok: true }
      }
      const source =
        payload.id && !payload.serverUrl
          ? existing
          : {
              id: payload.id || 'test',
              name: payload.name || 'Navidrome',
              serverUrl: normalizeRemoteServerUrl(
                payload.serverUrl || existing?.serverUrl || '',
                sourceType
              ),
              username: String(payload.username || existing?.username || '').trim(),
              password: existing?.password || null
            }
      const passwordOverride =
        typeof payload.password === 'string' && payload.password.length > 0 ? payload.password : undefined
      const client = createSubsonicClientForSource(source, passwordOverride)
      await client.ping()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('remoteLibrary:getArtists', async (_, sourceId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isFileBackedRemoteSourceType(source?.type)) {
        const tracks = await collectNetworkFolderTracks(source)
        const folders = new Map()
        for (const track of tracks) {
          const id = track.folder || dirname(track.remoteActualPath || '')
          if (!folders.has(id)) {
            folders.set(id, {
              id,
              name: basename(id) || source.name || 'Network Folder',
              albumCount: 0
            })
          }
          folders.get(id).albumCount += 1
        }
        return { ok: true, artists: Array.from(folders.values()) }
      }
      if (normalizeRemoteSourceType(source?.type) === 'webdav') {
        const client = createWebDavClientForSource(source)
        const entries = await client.list('/')
        const folders = entries
          .filter(entry => entry.isDirectory)
          .map(entry => ({
            id: entry.path,
            name: entry.name || basename(entry.path) || source.name || 'WebDAV',
            albumCount: 0
          }))
        return {
          ok: true,
          artists: folders.length
            ? folders
            : [{ id: '/', name: source?.name || 'WebDAV', albumCount: 0 }]
        }
      }
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        const artists = await client.getArtists()
        return { ok: true, artists }
      }
      const client = createSubsonicClientForSource(source)
      const artists = await client.getArtists()
      return { ok: true, artists }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), artists: [] }
    }
  })

  ipcMain.handle('remoteLibrary:getArtist', async (_, sourceId, artistId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isFileBackedRemoteSourceType(source?.type)) {
        const tracks = (await collectNetworkFolderTracks(source)).filter(
          track => track.folder === artistId
        )
        return {
          ok: true,
          artist: {
            id: artistId,
            name: basename(artistId) || source.name || 'Network Folder',
            albums: [
              {
                id: artistId,
                name: basename(artistId) || source.name || 'Network Folder',
                title: basename(artistId) || source.name || 'Network Folder',
                artist: source.name || 'Network Folder',
                songCount: tracks.length,
                duration: 0
              }
            ]
          }
        }
      }
      if (normalizeRemoteSourceType(source?.type) === 'webdav') {
        const client = createWebDavClientForSource(source)
        const entries = await client.list(artistId || '/')
        const folders = entries.filter(entry => entry.isDirectory)
        return {
          ok: true,
          artist: {
            id: artistId || '/',
            name: basename(artistId || '/') || source.name || 'WebDAV',
            albums: folders.length
              ? folders.map(folder => ({
                  id: folder.path,
                  name: folder.name,
                  title: folder.name,
                  artist: source.name || 'WebDAV',
                  songCount: 0,
                  duration: 0
                }))
              : [
                  {
                    id: artistId || '/',
                    name: basename(artistId || '/') || source.name || 'WebDAV',
                    title: basename(artistId || '/') || source.name || 'WebDAV',
                    artist: source.name || 'WebDAV',
                    songCount: entries.filter(entry => !entry.isDirectory && isRemoteAudioFilePath(entry.path)).length,
                    duration: 0
                  }
                ]
          }
        }
      }
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        const artist = await client.getArtist(artistId)
        return { ok: true, artist }
      }
      const client = createSubsonicClientForSource(source)
      const artist = await client.getArtist(artistId)
      return { ok: true, artist }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), artist: null }
    }
  })

  ipcMain.handle('remoteLibrary:getAlbum', async (_, sourceId, albumId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isFileBackedRemoteSourceType(source?.type)) {
        const songs = (await collectNetworkFolderTracks(source)).filter(track => track.folder === albumId)
        return {
          ok: true,
          album: {
            id: albumId,
            name: basename(albumId) || source.name || 'Network Folder',
            title: basename(albumId) || source.name || 'Network Folder',
            artist: source.name || 'Network Folder',
            songCount: songs.length,
            duration: 0,
            songs
          }
        }
      }
      if (normalizeRemoteSourceType(source?.type) === 'webdav') {
        const client = createWebDavClientForSource(source)
        const entries = await client.list(albumId || '/')
        const songs = entries
          .filter(entry => !entry.isDirectory && isRemoteAudioFilePath(entry.path))
          .map(entry => mapWebDavFile(source, entry, client))
        return {
          ok: true,
          album: {
            id: albumId || '/',
            name: basename(albumId || '/') || source.name || 'WebDAV',
            title: basename(albumId || '/') || source.name || 'WebDAV',
            artist: source.name || 'WebDAV',
            songCount: songs.length,
            duration: 0,
            songs
          }
        }
      }
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        const album = await client.getAlbum(albumId, source)
        return { ok: true, album }
      }
      const client = createSubsonicClientForSource(source)
      const album = await client.getAlbum(albumId, source)
      return { ok: true, album }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), album: null }
    }
  })

  ipcMain.handle('remoteLibrary:search', async (_, sourceId, query) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isFileBackedRemoteSourceType(source?.type)) {
        const needle = String(query || '').trim().toLowerCase()
        const allTracks = await collectNetworkFolderTracks(source)
        const songs = needle
          ? allTracks.filter(track => {
              const haystack = [
                track.title,
                track.artist,
                track.album,
                track.remoteActualPath
              ]
                .filter(Boolean)
                .join('\n')
                .toLowerCase()
              return haystack.includes(needle)
            })
          : allTracks.slice(0, 250)
        const albumMap = new Map()
        for (const track of songs) {
          const folderId = track.folder || dirname(track.remoteActualPath || '')
          if (!albumMap.has(folderId)) {
            albumMap.set(folderId, {
              id: folderId,
              name: basename(folderId) || source.name || 'Network Folder',
              title: basename(folderId) || source.name || 'Network Folder',
              artist: source.name || 'Network Folder',
              songCount: 0,
              duration: 0
            })
          }
          albumMap.get(folderId).songCount += 1
        }
        return {
          ok: true,
          result: { artists: [], albums: Array.from(albumMap.values()), songs }
        }
      }
      if (normalizeRemoteSourceType(source?.type) === 'webdav') {
        const client = createWebDavClientForSource(source)
        const result = await client.search(query, source)
        return { ok: true, result }
      }
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        const result = await client.search(query, source)
        return { ok: true, result }
      }
      const client = createSubsonicClientForSource(source)
      const result = await client.search(query, source)
      return { ok: true, result }
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        result: { artists: [], albums: [], songs: [] }
      }
    }
  })

  ipcMain.handle('remoteLibrary:getSubsonicSpecial', async (_, sourceId, kind) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        const result =
          kind === 'recentlyPlayed'
            ? await client.getRecentlyPlayed(source)
            : await client.getStarred(source)
        return { ok: true, result }
      }
      if (normalizeRemoteSourceType(source?.type) !== 'subsonic') {
        return { ok: false, error: 'not_subsonic', result: { artists: [], albums: [], songs: [] } }
      }
      const client = createSubsonicClientForSource(source)
      const result =
        kind === 'recentlyPlayed'
          ? await client.getRecentlyPlayed(source)
          : await client.getStarred(source)
      return { ok: true, result }
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        result: { artists: [], albums: [], songs: [] }
      }
    }
  })

  ipcMain.handle('remoteLibrary:getPlaylists', async (_, sourceId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        return { ok: true, playlists: await client.getPlaylists() }
      }
      if (normalizeRemoteSourceType(source?.type) !== 'subsonic') {
        return { ok: true, playlists: [] }
      }
      const client = createSubsonicClientForSource(source)
      return { ok: true, playlists: await client.getPlaylists() }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), playlists: [] }
    }
  })

  ipcMain.handle('remoteLibrary:getPlaylist', async (_, sourceId, playlistId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      const source = findRemoteSource(sourceId)
      if (isJellyfinLikeSourceType(normalizeRemoteSourceType(source?.type))) {
        const client = createJellyfinClientForSource(source)
        return { ok: true, playlist: await client.getPlaylist(playlistId, source) }
      }
      if (normalizeRemoteSourceType(source?.type) !== 'subsonic') {
        return { ok: false, error: 'not_subsonic', playlist: null }
      }
      const client = createSubsonicClientForSource(source)
      return { ok: true, playlist: await client.getPlaylist(playlistId, source) }
    } catch (error) {
      return { ok: false, error: error?.message || String(error), playlist: null }
    }
  })

  ipcMain.handle('remoteLibrary:resolveStreamUrl', async (_, filePath) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      if (
        !isSubsonicTrackPath(filePath) &&
        !isNetworkFolderTrackPath(filePath) &&
        !isWebDavTrackPath(filePath) &&
        !isJellyfinTrackPath(filePath)
      ) {
        return { ok: false, error: 'not_remote_track' }
      }
      return { ok: true, url: await resolveRemotePlaybackUrl(filePath) }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (typeof url !== 'string') return { ok: false, error: 'invalid_url' }
    const t = url.trim()
    if (!/^https?:\/\//i.test(t)) return { ok: false, error: 'invalid_url' }
    try {
      await shell.openExternal(t)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('shell:showItemInFolder', async (_, fullPath) => {
    if (typeof fullPath !== 'string' || !fullPath.trim())
      return { ok: false, error: 'invalid_path' }
    try {
      shell.showItemInFolder(fullPath.trim())
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('shell:openPath', async (_, fullPath) => {
    if (typeof fullPath !== 'string' || !fullPath.trim())
      return { ok: false, error: 'invalid_path' }
    try {
      const err = await shell.openPath(fullPath.trim())
      if (err) return { ok: false, error: err }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('clipboard:writeText', async (_, text) => {
    if (typeof text !== 'string') return { ok: false, error: 'invalid_text' }
    try {
      clipboard.writeText(text)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('clipboard:writeImage', async (_, dataUrl) => {
    if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
      return { ok: false, error: 'invalid_image_data' }
    }
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return { ok: false, error: 'invalid_image_data' }
      clipboard.writeImage(img)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // IPC: Show open folder dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections']
    })
    if (canceled) {
      return []
    } else {
      return filePaths
    }
  })
  // IPC: Show open files dialog
  ipcMain.handle('dialog:openFile', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: d.filterAudio,
          extensions: [
            'mp3',
            'wav',
            'flac',
            'ogg',
            'm4a',
            'aac',
            'ncm',
            'dsf',
            'dff',
            'opus',
            'webm',
            'wma',
            'alac',
            'aiff',
            'm4b',
            'caf'
          ]
        }
      ]
    })
    if (canceled) {
      return []
    } else {
      return filePaths.map((f) => ({
        name: basename(f),
        path: f
      }))
    }
  })

  // IPC: Show open VST plugin dialog (.dll)
  ipcMain.handle('dialog:openVstPlugin', async (_, opts) => {
    const loc = dialogLocaleFromOpts(opts)
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: loc === 'zh' ? 'VST2 插件' : 'VST2 Plugin', extensions: ['dll'] }]
    })
    return { canceled, filePaths }
  })

  // IPC: Show open lyrics file dialog (.lrc / .lrcx)
  ipcMain.handle('dialog:openLyricsFile', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: d.filterLyrics,
          extensions: ['lrc', 'lrcx', 'txt']
        }
      ]
    })
    if (canceled || !filePaths?.length) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:openCookiesFile', async (_, opts) => {
    const loc = dialogLocaleFromOpts(opts)
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: loc === 'zh' ? '选择 YouTube cookies.txt' : 'Select YouTube cookies.txt',
      properties: ['openFile'],
      filters: [
        { name: loc === 'zh' ? 'Cookies 文本文件' : 'Cookies text file', extensions: ['txt'] },
        { name: loc === 'zh' ? '所有文件' : 'All files', extensions: ['*'] }
      ]
    })
    if (canceled || !filePaths?.length) return null
    return filePaths[0]
  })

  // IPC: Show open image dialog
  ipcMain.handle('dialog:openImage', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: d.filterImages,
          extensions: ['jpg', 'png', 'gif', 'webp', 'bmp', 'jpeg']
        }
      ]
    })
    if (canceled) {
      return null
    } else {
      return filePaths[0] // Return the single path
    }
  })

  ipcMain.handle('dialog:openFontFile', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: d.filterFonts,
          extensions: ['ttf', 'otf', 'woff', 'woff2']
        }
      ]
    })
    if (canceled || !filePaths?.length) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:openThemeJson', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: d.filterThemeJson, extensions: ['json'] }]
    })
    if (canceled || !filePaths?.length) return null
    try {
      const content = fs.readFileSync(filePaths[0], 'utf8')
      return { path: filePaths[0], content }
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })

  ipcMain.handle('dialog:openSettingsJson', async (_, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: d.filterSettingsJson || 'Settings JSON', extensions: ['json'] }]
    })
    if (canceled || !filePaths?.length) return null
    try {
      const content = fs.readFileSync(filePaths[0], 'utf8')
      return { path: filePaths[0], content }
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })

  ipcMain.handle('dialog:openPlaylistFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入播放列表',
      properties: ['openFile'],
      filters: [
        { name: 'Playlist Files', extensions: ['json', 'm3u8', 'm3u'] },
        { name: 'M3U Playlist', extensions: ['m3u8', 'm3u'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (canceled || !filePaths?.length) return null
    try {
      const content = fs.readFileSync(filePaths[0], 'utf8')
      return { path: filePaths[0], content }
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })

  ipcMain.handle('dialog:saveThemeJson', async (_, text, defaultName, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: d.saveThemeTitle,
      defaultPath: defaultName || 'echoes-studio-theme.json',
      filters: [{ name: d.filterThemeJson, extensions: ['json'] }]
    })
    if (canceled || !filePath) return { success: false }
    try {
      fs.writeFileSync(filePath, text, 'utf8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: String(e.message || e) }
    }
  })

  ipcMain.handle('dialog:saveSettingsJson', async (_, text, defaultName, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: d.saveSettingsTitle || 'Export settings',
      defaultPath: defaultName || 'echo-settings.json',
      filters: [{ name: d.filterSettingsJson || 'Settings JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { success: false }
    try {
      fs.writeFileSync(filePath, text, 'utf8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: String(e.message || e) }
    }
  })

  ipcMain.handle('dialog:saveImage', async (_, dataUrl, defaultName) => {
    if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
      return { success: false, error: 'invalid_image_data' }
    }
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return { success: false, error: 'invalid_image_data' }
      const pngBuffer = img.toPNG()
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Image',
        defaultPath: defaultName || 'song-card.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      })
      if (canceled || !filePath) return { success: false }
      fs.writeFileSync(filePath, pngBuffer)
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: String(e.message || e) }
    }
  })

  // IPC: Read directory ?? 递归包含所有子文件夹中的受支持音频
  ipcMain.handle('file:readDirectory', async (_, dirPath) => {
    try {
      const audioFiles = []
      await collectAudioFilesRecursive(dirPath, audioFiles)
      return audioFiles
    } catch (e) {
      console.error(e)
      return []
    }
  })

  // IPC: Process multiple paths (files or directories) for drag-and-drop
  ipcMain.handle('file:getFilesFromPaths', async (_, paths) => {
    const result = []
    for (const p of paths) {
      await collectAudioFilesRecursive(p, result)
    }
    return result
  })

  ipcMain.handle('file:rescanFolders', async (_, payload) => {
    try {
      return await rescanImportedFolders(payload?.folders, payload?.existingPaths)
    } catch (e) {
      console.error('[file:rescanFolders]', e)
      return []
    }
  })

  ipcMain.handle('library:watchFolders', async (_, payload) => {
    try {
      if (!libraryWatchManager) {
        libraryWatchManager = createLibraryWatchManager({
          onChange: (diff) => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.send('library:folders-changed', diff)
          }
        })
      }
      return await libraryWatchManager.start(payload?.folders, payload?.existingTracks)
    } catch (e) {
      console.error('[library:watchFolders]', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('library:stopWatchingFolders', async () => {
    try {
      if (!libraryWatchManager) return { ok: true }
      return libraryWatchManager.stop()
    } catch (e) {
      console.error('[library:stopWatchingFolders]', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // IPC: Batch get file stats (birthtimeMs) for existing tracks that lack it
  ipcMain.handle('file:batchStats', async (_, paths) => {
    const out = {}
    await Promise.all(
      (Array.isArray(paths) ? paths : []).map(async (p) => {
        try {
          const s = await fs.promises.stat(p)
          out[p] = { birthtimeMs: s.birthtimeMs || s.ctimeMs || 0 }
        } catch {
          out[p] = { birthtimeMs: 0 }
        }
      })
    )
    return out
  })

  ipcMain.handle('file:batchExists', async (_, paths) => {
    const out = {}
    for (const p of Array.isArray(paths) ? paths : []) {
      out[p] = typeof p === 'string' && p ? fs.existsSync(resolveMetadataFilePath(p)) : false
    }
    return out
  })

  ipcMain.handle('file:deleteAudioFile', async (_, filePath) => {
    try {
      const resolvedPath = assertEditableLocalPath(filePath)
      if (!fs.existsSync(resolvedPath)) return { ok: false, error: 'file_not_found' }
      const stat = await fs.promises.stat(resolvedPath)
      if (!stat.isFile()) return { ok: false, error: 'not_a_file' }
      await shell.trashItem(resolvedPath)
      return { ok: true, path: resolvedPath }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // IPC: Read file as buffer (for jsmediatags or general binary reading)
  ipcMain.handle('file:readBuffer', async (_, filePath) => {
    try {
      filePath = resolveMetadataFilePath(filePath)
      if (!existsSync(filePath)) {
        return { success: false, error: 'file_not_found' }
      }
      const buffer = fs.readFileSync(filePath)
      return buffer
    } catch (e) {
      return null
    }
  })

  ipcMain.handle('file:readText', async (_, filePath) => {
    try {
      filePath = resolveMetadataFilePath(filePath)
      return fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      return null
    }
  })

  // IPC: 日文歌词??????罗马音（Kuroshiro + Kuromoji，首调较慢）
  ipcMain.handle('lyrics:toRomajiBatch', async (_, texts) => {
    try {
      return await convertLinesToRomaji(texts)
    } catch (e) {
      console.warn('[lyrics:toRomajiBatch]', e?.message || e)
      return Array.isArray(texts) ? texts.map(() => '') : []
    }
  })

  ipcMain.handle('lyrics:neteaseFetch', async (_, payload) => {
    if (isNetworkAccessDisabled()) return { ok: false, lrc: '', confidence: null, error: 'network_disabled' }
    try {
      const auth = await resolveNeteaseAuthState(payload?.cookie || '')
      const result = await fetchNeteaseLrcText({
        ...(payload || {}),
        cookie: auth.valid ? auth.cookie : ''
      })
      if (result?.rateLimited) {
        return {
          ok: false,
          lrc: '',
          confidence: null,
          error: 'rate_limited',
          rateLimited: true,
          phase: result.phase || 'lyric',
          retryAfterMs: result.retryAfterMs || 0
        }
      }
      return {
        ok: !!result?.lrc,
        lrc: result?.lrc || '',
        confidence: result?.confidence,
        song: result?.song || null
      }
    } catch (e) {
      console.warn('[lyrics:neteaseFetch]', e?.message || e)
      return { ok: false, lrc: '', confidence: null }
    }
  })

  ipcMain.handle('lyrics:searchExternal', async (_, payload) => {
    if (isNetworkAccessDisabled()) return { ok: false, items: [], error: 'network_disabled' }
    try {
      const items = await searchExternalLyrics(payload || {})
      return { ok: true, items }
    } catch (e) {
      console.warn('[lyrics:searchExternal]', e?.message || e)
      return { ok: false, items: [] }
    }
  })

  // IPC: Read LRC lyrics file (same directory, same name as audio file)
  ipcMain.handle('file:readLyrics', async (_, audioFilePath) => {
    try {
      if (isSubsonicTrackPath(audioFilePath) || isJellyfinTrackPath(audioFilePath)) return null
      audioFilePath = resolveMetadataFilePath(audioFilePath)
      const { dirname, basename, join: pathJoin, extname } = await import('path')
      const dir = dirname(audioFilePath)
      const nameWithoutExt = basename(audioFilePath, extname(audioFilePath))
      const lrcPath = pathJoin(dir, `${nameWithoutExt}.lrc`)
      const lrcPath2 = pathJoin(dir, `${nameWithoutExt}.txt`) // Check for .txt as well
      if (fs.existsSync(lrcPath)) {
        const content = fs.readFileSync(lrcPath, 'utf-8')
        return content
      } else if (fs.existsSync(lrcPath2)) {
        return fs.readFileSync(lrcPath2, 'utf8')
      }
      return null
    } catch (error) {
      console.error('Error reading lyrics:', error)
      return null
    }
  })

  // IPC: Read info JSON (from yt-dlp)
  ipcMain.handle('file:readInfoJson', async (_, audioFilePath) => {
    try {
      if (isSubsonicTrackPath(audioFilePath) || isJellyfinTrackPath(audioFilePath)) return null
      audioFilePath = resolveMetadataFilePath(audioFilePath)
      const { dirname, basename, join: pathJoin, extname } = await import('path')
      const dir = dirname(audioFilePath)
      const nameWithoutExt = basename(audioFilePath, extname(audioFilePath))
      const infoPath = pathJoin(dir, `${nameWithoutExt}.info.json`)
      if (fs.existsSync(infoPath)) {
        const content = fs.readFileSync(infoPath, 'utf-8')
        return JSON.parse(content)
      }
      return null
    } catch (error) {
      console.error('Error reading info json:', error)
      return null
    }
  })

  // Media Download IPC
  ipcMain.handle('netease:search', async (event, keywords, preferredCookie = '') => {
    const auth = await resolveNeteaseAuthState(preferredCookie)
    return await searchNeteaseSongs(keywords, { cookie: auth.valid ? auth.cookie : '' })
  })

  ipcMain.handle('netease:searchAlbum', async (_, payload) => {
    try {
      const albumName = String(payload?.albumName || '').trim()
      const artist = String(payload?.artist || '').trim()
      if (!albumName && !artist) return []
      const auth = await resolveNeteaseAuthState(payload?.cookie || '')
      const res = await cachedNeteaseCloudSearch('searchAlbum', {
        keywords: `${albumName} ${artist}`.trim(),
        type: 10,
        limit: 8
      }, auth.valid ? auth.cookie : '')
      const albums = res?.body?.result?.albums
      if (!Array.isArray(albums)) return []
      return albums.map((album) => ({
        id: album.id,
        name: album.name || '',
        artist:
          (album.artists || album.ar || []).map((item) => item?.name).filter(Boolean).join(' / ') ||
          album.artist?.name ||
          '',
        picUrl: album.picUrl || album.blurPicUrl || '',
        size: album.size || album.trackCount || 0
      }))
    } catch (e) {
      console.warn('[netease:searchAlbum]', e?.message || e)
      return []
    }
  })

  ipcMain.handle('netease:searchArtist', async (_, payload) => {
    try {
      const artistName = String(payload?.artist || '').trim()
      if (!artistName) return { ok: true, artists: [] }
      const auth = await resolveNeteaseAuthState(payload?.cookie || '')
      const res = await cachedNeteaseCloudSearch('searchArtist', {
        keywords: artistName,
        type: 100,
        limit: 8
      }, auth.valid ? auth.cookie : '')
      const artists = res?.body?.result?.artists
      if (!res) {
        return {
          ok: false,
          artists: [],
          error: 'rate_limited_or_network',
          transient: true,
          retryAfterMs: Math.max(0, neteaseCloudSearchCooldownUntil - Date.now())
        }
      }
      if (!Array.isArray(artists)) return { ok: true, artists: [] }
      return {
        ok: true,
        artists: artists.map((artist) => ({
          id: artist.id,
          name: artist.name || '',
          alias: Array.isArray(artist.alias) ? artist.alias.filter(Boolean) : [],
          picUrl: artist.picUrl || artist.img1v1Url || artist.avatar || '',
          img1v1Url: artist.img1v1Url || '',
          albumSize: artist.albumSize || 0,
          musicSize: artist.musicSize || 0
        }))
      }
    } catch (e) {
      console.warn('[netease:searchArtist]', e?.message || e)
      return { ok: false, artists: [], error: e?.message || 'network_error', transient: true }
    }
  })

  ipcMain.handle('qqMusic:searchArtist', async (_, payload) => {
    try {
      const auth = await resolveQqMusicAuthState(payload?.cookie || '')
      const artists = await searchQqMusicArtists({
        artist: payload?.artist || '',
        cookie: auth.cookie || '',
        limit: payload?.limit || 8
      })
      return { ok: true, artists }
    } catch (e) {
      console.error('[qqMusic:searchArtist]', e?.message || e)
      return { ok: false, artists: [], error: e?.message || 'network_error', transient: true }
    }
  })

  ipcMain.handle('artistAvatar:fetchImageDataUrl', async (_, url) => {
    try {
      return await fetchImageDataUrl(url)
    } catch (e) {
      console.error('[artistAvatar:fetchImageDataUrl]', e?.message || e)
      return { ok: false, dataUrl: '', error: 'network_error', transient: true }
    }
  })

  ipcMain.handle('netease:getAlbumTracks', async (_, payload) => {
    try {
      const auth = await resolveNeteaseAuthState(payload?.cookie || '')
      const ncm = getNcmApi()
      const res = await ncm.album({
        id: payload?.albumId,
        ...buildNcmRequestOptions(auth.valid ? auth.cookie : '')
      })
      const songs = res?.body?.songs
      if (!Array.isArray(songs)) return []
      return songs.map((track) => ({
        id: track.id,
        name: track.name || '',
        artist: (track.ar || track.artists || []).map((item) => item?.name).filter(Boolean).join(' / '),
        duration: track.dt || track.duration || 0,
        fee: track.fee || 0
      }))
    } catch (e) {
      console.error('[netease:getAlbumTracks]', e?.message || e)
      return []
    }
  })

  ipcMain.handle('qqMusic:search', async (_, keywords, preferredCookie = '') => {
    const auth = await resolveQqMusicAuthState(preferredCookie)
    return await searchQqMusicSongs(keywords, { cookie: auth.cookie || '' })
  })

  ipcMain.handle('qqMusic:searchAlbum', async (_, payload) => {
    const auth = await resolveQqMusicAuthState(payload?.cookie || '')
    return await searchQqMusicAlbums({
      ...(payload || {}),
      cookie: auth.cookie || ''
    })
  })

  ipcMain.handle('qqMusic:getAlbumTracks', async (_, payload) => {
    const auth = await resolveQqMusicAuthState(payload?.cookie || '')
    return await getQqMusicAlbumTracks({
      ...(payload || {}),
      cookie: auth.cookie || ''
    })
  })

  ipcMain.handle('qqMusic:getSongUrl', async (_, song, qualityPreset = 'auto', preferredCookie = '') => {
    const auth = await resolveQqMusicAuthState(preferredCookie)
    return await getQqMusicSongDirectUrl(song, {
      qualityPreset,
      cookie: auth.cookie || ''
    })
  })

  ipcMain.handle('streaming:search', async (_, payload = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const neteaseAuth = await resolveNeteaseAuthState(payload?.neteaseCookie || '')
    const qqMusicAuth = await resolveQqMusicAuthState(payload?.qqMusicCookie || '')
    const soundCloudCookieFile = await writeSoundCloudCookiesFromSession()
    return await searchStreamingCatalog({
      query: payload?.query || '',
      providers: payload?.providers || [],
      audioQualityMode: payload?.audioQualityMode || 'lossless',
      neteaseCookie: neteaseAuth.valid ? neteaseAuth.cookie : '',
      qqMusicCookie: qqMusicAuth.cookie || '',
      soundCloudCookieFile
    })
  })

  ipcMain.handle('streaming:fetchPlaylist', async (_, payload = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const neteaseAuth = await resolveNeteaseAuthState(payload?.neteaseCookie || '')
    const qqMusicAuth = await resolveQqMusicAuthState(payload?.qqMusicCookie || '')
    return await fetchStreamingPlaylist({
      provider: payload?.provider || 'netease',
      playlistInput: payload?.playlistInput || '',
      audioQualityMode: payload?.audioQualityMode || 'lossless',
      neteaseCookie: neteaseAuth.valid ? neteaseAuth.cookie : '',
      qqMusicCookie: qqMusicAuth.cookie || ''
    })
  })

  ipcMain.handle('streaming:neteaseDailyRecommendations', async (_, payload = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const neteaseAuth = await resolveNeteaseAuthState(payload?.neteaseCookie || '')
    if (!neteaseAuth.valid) {
      return { ok: false, provider: 'netease', error: 'auth_required', results: [] }
    }
    return await fetchStreamingNeteaseDailyRecommendations({
      audioQualityMode: payload?.audioQualityMode || 'lossless',
      neteaseCookie: neteaseAuth.cookie || ''
    })
  })

  ipcMain.handle('streaming:resolvePlayback', async (_, track = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const neteaseAuth = await resolveNeteaseAuthState(track?.neteaseCookie || '')
    const qqMusicAuth = await resolveQqMusicAuthState(track?.qqMusicCookie || '')
    const soundCloudCookieFile = await writeSoundCloudCookiesFromSession()
    return await resolveStreamingPlayback({
      track,
      neteaseCookie: neteaseAuth.valid ? neteaseAuth.cookie : '',
      qqMusicCookie: qqMusicAuth.cookie || '',
      qualityPreset: track?.qualityPreset || 'auto',
      neteaseLevel: track?.neteaseLevel || 'exhigh',
      soundCloudCookieFile
    })
  })

  ipcMain.handle('streaming:fetchLyrics', async (_, track = {}) => {
    if (isNetworkAccessDisabled()) return { ok: false, lrc: '', error: 'network_disabled' }
    const neteaseAuth = await resolveNeteaseAuthState(track?.neteaseCookie || '')
    const qqMusicAuth = await resolveQqMusicAuthState(track?.qqMusicCookie || '')
    return await fetchStreamingLyrics({
      track,
      neteaseCookie: neteaseAuth.valid ? neteaseAuth.cookie : '',
      qqMusicCookie: qqMusicAuth.cookie || ''
    })
  })

  ipcMain.handle('netease:fetchLrcText', async (event, params) => {
    if (isNetworkAccessDisabled()) return { ok: false, error: 'network_disabled' }
    const auth = await resolveNeteaseAuthState(params?.cookie || '')
    return await fetchNeteaseLrcText({
      ...(params || {}),
      cookie: auth.valid ? auth.cookie : ''
    })
  })

  ipcMain.handle('media:writeFile', async (event, filePath, text) => {
    const fs = require('fs')
    fs.writeFileSync(filePath, text, 'utf8')
    return true
  })

  ipcMain.handle('media:getMetadata', async (event, url, options = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return await MediaDownloader.getMetadata(url, withResolvedYoutubeCookieOptions(options))
  })

  ipcMain.handle('media:download', async (event, url, folder, options = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const auth = await resolveNeteaseAuthState(options?.neteaseCookie || '')
    return await MediaDownloader.downloadAudio(url, folder, event.sender, {
      ...withResolvedYoutubeCookieOptions(options),
      neteaseCookie: auth.valid ? auth.cookie : ''
    })
  })

  ipcMain.handle('netease:getSongUrl', async (_, songId, level, preferredCookie = '') => {
    const auth = await resolveNeteaseAuthState(preferredCookie)
    return await getNeteaseSongDirectUrl(songId, level, {
      cookie: auth.valid ? auth.cookie : ''
    })
  })

  ipcMain.handle('media:downloadFromUrl', async (event, opts) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const { url, targetFolder, filename, headers } = opts || {}
    if (!url || !targetFolder || !filename) throw new Error('Missing required parameters')
    return await MediaDownloader.downloadFromUrl(url, targetFolder, filename, event.sender, { headers })
  })

  ipcMain.handle('media:renameDownloadedMedia', async (_, filePath, desiredStem) => {
    return MediaDownloader.renameDownloadedMedia(filePath, desiredStem)
  })

  ipcMain.handle('media:applyDownloadedMetadata', async (_, payload) => {
    return await applyDownloadedMetadata(payload)
  })

  ipcMain.handle('playlistLink:importPlaylist', async (event, payload) => {
    const {
      playlistInput,
      downloadFolder,
      preferredFolderName,
      neteaseCookie,
      qqMusicCookie,
      downloadProvider,
      audioQualityPreset,
      youtubeCookieBrowser,
      youtubeCookieFile,
      quickMode
    } = payload || {}
    const auth = await resolveNeteaseAuthState(neteaseCookie || '')
    const qqAuth = await resolveQqMusicAuthState(qqMusicCookie || '')
    return await importPlaylistFromLink(
      playlistInput,
      downloadFolder,
      event.sender,
      preferredFolderName,
      {
        cookie: auth.valid ? auth.cookie : '',
        qqCookie: qqAuth.valid ? qqAuth.cookie : '',
        downloadProvider: downloadProvider === 'qq' ? 'qq' : 'netease',
        qualityPreset: audioQualityPreset || 'auto',
        youtubeCookieBrowser,
        youtubeCookieFile: withResolvedYoutubeCookieOptions({ youtubeCookieFile }).youtubeCookieFile,
        quickMode: quickMode === true
      }
    )
  })

  ipcMain.handle('playlistShare:import', async (event, payload) => {
    const { playlists, downloadFolder, neteaseCookie } = payload || {}
    const auth = await resolveNeteaseAuthState(neteaseCookie || '')
    return await importSharedPlaylists(playlists, downloadFolder, event.sender, {
      cookie: auth.valid ? auth.cookie : ''
    })
  })

  ipcMain.handle('playlist:exportM3U', async (_, { tracks, suggestedName } = {}) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出播放列表',
      defaultPath: `${suggestedName || 'playlist'}.m3u8`,
      filters: [{ name: 'M3U Playlist', extensions: ['m3u8', 'm3u'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }

    const lines = ['#EXTM3U']
    for (const track of Array.isArray(tracks) ? tracks : []) {
      if (!track?.path) continue
      const info = track.info || {}
      const duration = Math.round(Number(info.duration) || -1)
      const artist = String(info.artist || '').trim()
      const title = String(info.title || track.path?.split(/[\\/]/).pop() || '').trim()
      const displayName = artist ? `${artist} - ${title}` : title
      lines.push(`#EXTINF:${duration},${displayName}`)
      lines.push(track.path)
    }
    const content = lines.join('\n') + '\n'

    try {
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { ok: true, filePath }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('playlist:exportText', async (_, { tracks, suggestedName } = {}) => {
    const safeName = String(suggestedName || 'playlist')
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
      .replace(/[. ]+$/g, '')
      .trim()
    let filePath = ''
    try {
      const result = await dialog.showSaveDialog({
        title: '导出TXT',
        defaultPath: `${safeName || 'playlist'}.txt`,
        filters: [{ name: 'Text File', extensions: ['txt'] }]
      })
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }
      filePath = result.filePath
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }

    const safeTracks = Array.isArray(tracks) ? tracks.filter((track) => track?.path) : []
    const lines = [`${suggestedName || 'Playlist'}`, `${safeTracks.length} tracks`, '']
    safeTracks.forEach((track, index) => {
      const info = track.info || {}
      const artist = String(info.artist || '').trim()
      const title = String(info.title || track.path?.split(/[\\/]/).pop() || '').trim()
      const displayName = artist ? `${artist} - ${title}` : title
      lines.push(`${String(index + 1).padStart(2, '0')}. ${displayName}`)
      lines.push(track.path)
    })

    try {
      await fs.promises.writeFile(filePath, lines.join('\n') + '\n', 'utf-8')
      return { ok: true, filePath }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // IPC: Search MV
  function parseYouTubeSearchItems(html = '') {
    const items = []
    const seen = new Set()
    const rendererRegex = /"videoRenderer":\{([\s\S]*?)\}(?=,"(?:radioRenderer|playlistRenderer|reelShelfRenderer|channelRenderer|shelfRenderer|continuationItemRenderer|richItemRenderer)"|],"|}$)/g
    for (const match of html.matchAll(rendererRegex)) {
      const block = match[1] || ''
      const idMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
      const titleMatch = block.match(/"title":\{"runs":\[\{"text":"([^"]+)"/)
      if (!idMatch?.[1] || seen.has(idMatch[1])) continue
      seen.add(idMatch[1])
      const ownerMatch =
        block.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/) ||
        block.match(/"longBylineText":\{"runs":\[\{"text":"([^"]+)"/)
      const durationMatch = block.match(/"lengthText":\{"(?:simpleText":"([^"]+)"|runs":\[\{"text":"([^"]+)")/)
      const viewCountMatch =
        block.match(/"viewCountText":\{"(?:simpleText":"([^"]+)"|runs":\[\{"text":"([^"]+)")/) ||
        block.match(/"shortViewCountText":\{"(?:simpleText":"([^"]+)"|runs":\[\{"text":"([^"]+)")/)
      const viewCountText = viewCountMatch?.[1] || viewCountMatch?.[2] || ''
      items.push({
        id: idMatch[1],
        title: titleMatch?.[1] || 'unknown',
        author: ownerMatch?.[1] || '',
        duration: durationMatch?.[1] || durationMatch?.[2] || '',
        ...(viewCountText ? { viewCountText } : {}),
        source: 'youtube'
      })
      if (items.length >= 8) break
    }
    return items
  }

  function buildBilibiliMvSearchPayload(videoResults, normalizedQuery, searchContext, mode, startedAt) {
    if (!Array.isArray(videoResults) || videoResults.length === 0) return null
    const scored = rankBilibiliVideoResults(videoResults, normalizedQuery, searchContext)
    const items = scored.map(({ originalIndex, ...item }) => item)
    const hit = items.find((item) => item.autoAccepted) || items[0]
    if (!hit) return null

    writeLogLine(
      `[MV Search] Bilibili ${mode}: "${normalizedQuery}" -> items=${items.length} bvid=${hit.id} auto=${hit.autoAccepted === true ? 'yes' : hit.autoRejectReason || 'no'} res=${hit.resolution || 'N/A'} | total=${Date.now() - startedAt}ms`
    )
    return {
      id: hit.id,
      title: hit.title,
      source: 'bilibili',
      resolution: hit.resolution,
      author: hit.author,
      ...(hit.playCount > 0 ? { playCount: hit.playCount } : {}),
      score: hit.score,
      autoAccepted: hit.autoAccepted === true,
      autoRejectReason: hit.autoRejectReason || '',
      items
    }
  }

  function parseBilibiliApiJson(bodyText = '') {
    const text = String(bodyText || '').trim()
    if (!text) throw new Error('empty_response')
    if (text.startsWith('<')) throw new Error('html_response')
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`invalid_json:${error?.message || error}`)
    }
  }

  ipcMain.handle('api:searchMV', async (_, query, source = 'youtube', options = {}) => {
    const normalizedSource = String(source || 'youtube').trim().toLowerCase() || 'youtube'
    const rawQuery = String(query || '').trim()
    const normalizedQuery = repairPossiblyMojibakeSearchQuery(rawQuery)
    const rawOptions = options && typeof options === 'object' ? options : {}
    const searchContext = {
      title: repairPossiblyMojibakeSearchQuery(String(rawOptions.title || '').trim()),
      artist: repairPossiblyMojibakeSearchQuery(String(rawOptions.artist || '').trim())
    }
    const contextCacheKey =
      searchContext.title || searchContext.artist
        ? `::${searchContext.title.toLowerCase()}::${searchContext.artist.toLowerCase()}`
        : ''
    const cacheKey = `${normalizedSource}::${normalizedQuery.toLowerCase()}${contextCacheKey}`
    const cached = readTimedCache(mvSearchCache, cacheKey, MV_SEARCH_CACHE_TTL_MS)
    if (cached) {
      writeLogLine(`[MV Search] cache hit: ${normalizedSource} "${normalizedQuery}"`)
      return cached
    }
    const pending = mvSearchPending.get(cacheKey)
    if (pending) {
      writeLogLine(`[MV Search] awaiting in-flight request: ${normalizedSource} "${normalizedQuery}"`)
      return pending
    }

    const startedAt = Date.now()
    const task = (async () => {
    try {
      if (normalizedSource === 'bilibili') {
        let apiError = null
        if (Date.now() >= bilibiliSearchApiBackoffUntil) {
          try {
            const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(normalizedQuery)}`
            const resp = await net.fetch(url, {
              headers: {
                'User-Agent': standardUA,
                Accept: 'application/json,text/plain,*/*',
                Referer: 'https://www.bilibili.com/'
              }
            })
            const bodyText = await resp.text()
            if (!resp.ok) {
              throw new Error(`http_${resp.status}`)
            }
            const data = parseBilibiliApiJson(bodyText)
            if (Number(data?.code || 0) !== 0) {
              throw new Error(`code_${data?.code || 'unknown'}`)
            }
            const payload = buildBilibiliMvSearchPayload(
              data?.data?.result || [],
              normalizedQuery,
              searchContext,
              'api',
              startedAt
            )
            if (payload) return writeTimedCache(mvSearchCache, cacheKey, payload)
          } catch (error) {
            apiError = error
            bilibiliSearchApiBackoffUntil = Date.now() + BILI_SEARCH_API_BACKOFF_MS
            writeLogLine(
              `[MV Search] Bilibili API fallback: "${normalizedQuery}" -> ${error?.message || error}`
            )
          }
        }

        const webUrl = `https://search.bilibili.com/video?keyword=${encodeURIComponent(normalizedQuery)}`
        const webResp = await net.fetch(webUrl, {
          headers: {
            'User-Agent': standardUA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: 'https://www.bilibili.com/'
          }
        })
        const webHtml = await webResp.text()
        const webResults = parseBilibiliSearchHtml(webHtml, 15)
        const payload = buildBilibiliMvSearchPayload(
          webResults,
          normalizedQuery,
          searchContext,
          apiError ? 'web-fallback' : 'web',
          startedAt
        )
        if (payload) {
          return writeTimedCache(mvSearchCache, cacheKey, payload)
        }
      } else {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedQuery)}`
        const { data } = await axios.get(url, {
          headers: { 'User-Agent': standardUA }
        })
        const scored = rankYoutubeVideoResults(parseYouTubeSearchItems(data), normalizedQuery, searchContext)
        const items = scored.map(({ originalIndex, ...item }) => item)
        const hit = items.find((item) => item.autoAccepted) || items[0]
        if (hit?.id) {
          writeLogLine(
            `[MV Search] YouTube: "${normalizedQuery}" -> items=${items.length} id=${hit.id} auto=${hit.autoAccepted === true ? 'yes' : hit.autoRejectReason || 'no'} | total=${Date.now() - startedAt}ms`
          )
          return writeTimedCache(mvSearchCache, cacheKey, {
            id: hit.id,
            title: hit.title,
            source: 'youtube',
            author: hit.author,
            duration: hit.duration,
            ...(hit.viewCount > 0 ? { viewCount: hit.viewCount } : {}),
            score: hit.score,
            autoAccepted: hit.autoAccepted === true,
            autoRejectReason: hit.autoRejectReason || '',
            items
          })
        }
      }
    } catch (e) {
      writeLogLine(`[MV Search] Error: ${e.message}`)
    }
    return null
    })()

    mvSearchPending.set(cacheKey, task)
    return task.finally(() => {
      mvSearchPending.delete(cacheKey)
    })
  })

  // IPC: Save audio file
  ipcMain.handle('dialog:saveExport', async (_, arrayBuffer, defaultName, opts) => {
    const d = getDialogStrings(dialogLocaleFromOpts(opts))
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: d.saveExportTitle,
      defaultPath: defaultName || 'export.wav',
      filters: [{ name: d.filterWav, extensions: ['wav'] }]
    })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer))
      return { success: true, filePath }
    }
    return { success: false }
  })

  // IPC: Close App
  ipcMain.on('window:close', () => {
    app.quit()
  })

  ipcMain.handle('window:hide-to-tray', async () => {
    return hideMainWindowToTray()
  })

  // IPC: Maximize App
  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
  })

  // IPC: Minimize App
  ipcMain.on('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) win.minimize()
  })

  ipcMain.handle('player:next', async () => {
    return sendPlayerCommand('next')
  })

  ipcMain.handle('player:prev', async () => {
    return sendPlayerCommand('prev')
  })

  // IPC: Download from SoundCloud. Prefer local yt-dlp; keep the proxy only as a fallback.
  ipcMain.handle('soundcloud:download', async (event, url, downloadPath) => {
    const targetDir = downloadPath || join(app.getAppPath(), 'downloads')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    try {
      const soundCloudCookieFile = await writeSoundCloudCookiesFromSession()
      const metadata = await MediaDownloader.getMetadata(url, { soundCloudCookieFile }).catch((error) => {
        console.warn('[SoundCloud] yt-dlp metadata failed, continuing with fallback title:', error)
        return null
      })
      const title = MediaDownloader.sanitizeFilenameStem(metadata?.title || 'SoundCloud Track')
      const filePath = await MediaDownloader.downloadAudioWithBasename(url, targetDir, title, event.sender, {
        audioQualityPreset: 'auto',
        soundCloudCookieFile
      })
      const renamedPath = MediaDownloader.renameDownloadedMedia(filePath, title)
      return {
        success: true,
        name: basename(renamedPath),
        path: renamedPath
      }
    } catch (ytDlpError) {
      console.warn('[SoundCloud] yt-dlp download failed, falling back to proxy:', ytDlpError)
    }

    try {
      const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
      const metaRes = await axios.get(oembedUrl)
      const info = metaRes.data || {}

      if (!info.title) throw new Error('SoundCloud 链接不可用，可能已删除、私密或地址写错')

      const title = sanitizeDownloadStem(info.title)

      const filePath = buildUniqueDownloadPath(targetDir, title, '.mp3')
      const fileName = basename(filePath)

      const proxyUrl = `${SOUNDCLOUD_PROXY_BASE}/stream?url=${encodeURIComponent(url)}`
      console.log(`[SoundCloud] Downloading via proxy: ${proxyUrl}`)

      const response = await axios({
        method: 'GET',
        url: proxyUrl,
        responseType: 'stream',
        timeout: 60000
      })

      const writeStream = fs.createWriteStream(filePath)

      return new Promise((resolve, reject) => {
        const totalBytes = Number(response.headers?.['content-length'] || 0) || 0
        let receivedBytes = 0
        response.data.on('data', (chunk) => {
          if (!totalBytes) return
          receivedBytes += chunk.length || 0
          event.sender?.send?.('media:download-progress', {
            url,
            progress: Math.max(0, Math.min(100, (receivedBytes / totalBytes) * 100))
          })
        })
        response.data.pipe(writeStream)

        writeStream.on('finish', () => {
          event.sender?.send?.('media:download-progress', { url, progress: 100 })
          resolve({
            success: true,
            name: fileName,
            path: filePath
          })
        })

        response.data.on('error', (err) => {
          console.error('SoundCloud stream error:', err)
          reject(err)
        })

        writeStream.on('error', (err) => {
          console.error('SoundCloud write error:', err)
          reject(err)
        })
      })
    } catch (e) {
      console.error('SoundCloud download error:', e)
      return {
        success: false,
        error:
          e.response?.status === 404
            ? 'SoundCloud 链接不可用，可能已删除、私密或地址写错'
            : e.response?.status >= 500
              ? 'SoundCloud 下载失败：本地 yt-dlp 与备用代理都不可用'
              : e.message
      }
    }
  })

  // IPC: Convert NCM to FLAC/MP3
  ipcMain.handle('file:convertNcm', async (_, ncmPath) => {
    return new Promise((resolve) => {
      // exe path is in root
      const exeName = 'NCMconverter.exe'
      // Use process.cwd() in dev, process.resourcesPath in production
      const exePath = is.dev ? join(process.cwd(), exeName) : join(process.resourcesPath, exeName)

      if (!fs.existsSync(exePath)) {
        console.error('Converter not found at:', exePath)
        return resolve({ success: false, error: 'Converter not found' })
      }

      execFile(exePath, [ncmPath], (error, stdout, stderr) => {
        if (error) {
          console.error('Conversion error:', error)
          return resolve({ success: false, error: error.message })
        }

        // Try to find the output file (flac or mp3)
        const dir = dirname(ncmPath)
        const nameWithoutExt = basename(ncmPath, extname(ncmPath))

        const possibleOutputs = [
          join(dir, `${nameWithoutExt}.flac`),
          join(dir, `${nameWithoutExt}.mp3`)
        ]

        for (const outPath of possibleOutputs) {
          if (fs.existsSync(outPath)) {
            return resolve({
              success: true,
              path: outPath,
              name: basename(outPath)
            })
          }
        }

        resolve({
          success: false,
          error: 'Conversion completed but output file not found'
        })
      })
    })
  })

  function getExtendedMetadataFallback(filePath) {
    const ext = extname(filePath)
    const baseTitle = basename(filePath, ext)
    const extShort = ext.replace(/^\./, '').toUpperCase() || null
    return {
      success: true,
      technical: {
        sampleRate: null,
        bitrate: null,
        channels: null,
        bitDepth: null,
        codec: extShort,
        duration: null,
        isMqa: false,
        lossless: ['FLAC', 'WAV', 'APE', 'ALAC'].includes(extShort || '')
      },
      common: {
        title: baseTitle,
        artist: 'Unknown Artist',
        album: null,
        albumArtist: null,
        trackNo: null,
        discNo: null,
        bpm: null,
        lyrics: null,
        lyricsExtractorVersion: EMBEDDED_LYRICS_EXTRACTOR_VERSION,
        cover: null
      }
    }
  }

  function normalizeBpmMetadataValue(value) {
    const candidates = Array.isArray(value) ? value : [value]
    for (const item of candidates) {
      if (item === null || item === undefined || item === '') continue
      const raw = typeof item === 'object' && item !== null && 'value' in item ? item.value : item
      const match = String(raw).replace(',', '.').match(/\d+(?:\.\d+)?/)
      if (!match) continue
      const parsed = Number.parseFloat(match[0])
      if (Number.isFinite(parsed) && parsed >= 40 && parsed <= 260) {
        return Math.round(parsed)
      }
    }
    return null
  }

  function extractBpmMetadataValue(metadata) {
    const commonBpm = normalizeBpmMetadataValue(metadata?.common?.bpm)
    if (commonBpm) return commonBpm

    const bpmTagIds = new Set(['bpm', 'tbpm', 'tempo', 'tmpo', 'wm/beatsperminute'])
    for (const nativeTags of Object.values(metadata?.native || {})) {
      if (!Array.isArray(nativeTags)) continue
      for (const tag of nativeTags) {
        const id = String(tag?.id || '').toLowerCase()
        if (!id) continue
        if (bpmTagIds.has(id) || id.includes('bpm') || id.includes('tempo')) {
          const bpm = normalizeBpmMetadataValue(tag?.value)
          if (bpm) return bpm
        }
      }
    }
    return null
  }

  function hasMqaMetadata(metadata) {
    const values = [
      metadata?.format?.codec,
      metadata?.format?.codecProfile,
      metadata?.format?.container,
      metadata?.format?.tagTypes,
      metadata?.common?.comment,
      metadata?.common?.description,
      metadata?.common?.encodedby,
      metadata?.common?.encoder
    ]

    for (const nativeTags of Object.values(metadata?.native || {})) {
      if (!Array.isArray(nativeTags)) continue
      for (const tag of nativeTags) {
        values.push(tag?.id, tag?.value)
      }
    }

    return values.some((value) => {
      const text = Array.isArray(value) ? value.join(' ') : String(value || '')
      return /\bmqa\b|mqaencoder|mqaoriginalsamplerate/i.test(text)
    })
  }

  function getLocalFileSizeBytes(filePath) {
    try {
      return fs.statSync(filePath).size || 0
    } catch {
      return 0
    }
  }

  function normalizeResolvedAudioCodec(metadata, filePath, probedInfo = null, preferProbed = false) {
    return normalizeResolvedAudioCodecLabel({
      codecLabel: resolveAudioCodecLabel(metadata, filePath),
      filePath,
      probedCodec: probedInfo?.codec,
      preferProbed
    })
  }

  function getReadableInfoSidecarName(sidecar) {
    const name = String(sidecar?.name || '').trim()
    if (!name) return ''
    if (/[\ufffd\u9289\u511e\u5113\u5157]/.test(name)) return ''
    return name
  }

  async function buildExtendedMetadataResponse(filePath) {
    const requestedPath = filePath
    const cueTrack = parseCueVirtualPath(requestedPath)
    filePath = getCueAudioPath(filePath)
    try {
      const { parseFile, selectCover } = await import('music-metadata')
      const metadata = await parseFile(filePath)
      let cover = null
      let coverScope = 'album'

      const extLower = extname(filePath).toLowerCase()
      const infoSidecar = readInfoSidecarMetadata(filePath)
      const isDsdFile = extLower === '.dsf' || extLower === '.dff'
      const fileSizeBytes = getLocalFileSizeBytes(filePath)
      const firstCodecLabel = resolveAudioCodecLabel(metadata, filePath)
      const ffmpegInfo = shouldUseFfmpegAudioInfo(filePath, metadata, firstCodecLabel, {
        fileSizeBytes
      })
        ? await getFfmpegAudioInfo(filePath)
        : null
      const preferFfmpegInfo = shouldPreferFfmpegAudioInfo(filePath, metadata, ffmpegInfo, {
        fileSizeBytes,
        codecLabel: firstCodecLabel
      })
      let durationSec = metadata.format.duration || infoSidecar?.duration || null
      if (preferFfmpegInfo && Number(ffmpegInfo?.duration) > 0) {
        durationSec = ffmpegInfo.duration
      }
      if (isDsdFile) {
        const probed = await getMediaDurationSeconds(filePath)
        if (probed > 0) durationSec = probed
      }

      const picture = selectCover(metadata.common.picture)
      let coverBytes = 0
      let coverWidth = 0
      let coverHeight = 0
      let coverExtractorVersion = 0
      const preferFfmpegCover =
        preferFfmpegInfo ||
        /\.(opus|ogg)$/i.test(filePath) ||
        /ogg/i.test(metadata.format?.container || '')
      if (preferFfmpegCover) {
        const extractedCover = await extractAttachedCoverWithFfmpeg(filePath)
        if (extractedCover?.dataUrl) {
          cover = extractedCover.dataUrl
          coverBytes = extractedCover.bytes
          coverWidth = extractedCover.width
          coverHeight = extractedCover.height
          coverExtractorVersion = 2
        }
      }
      if (picture) {
        const compressedCover = cover ? null : compressEmbeddedCoverData(picture)
        if (compressedCover) {
          cover = compressedCover.dataUrl
          coverScope = 'album'
          coverBytes = compressedCover.bytes
          coverWidth = compressedCover.width
          coverHeight = compressedCover.height
          coverExtractorVersion = 1
        }
      }
      if (!cover) {
        cover = findInfoSidecarCoverDataUrl(filePath, infoSidecar)
        coverScope = cover ? 'track' : 'album'
        if (!cover) cover = findFolderCoverDataUrl(filePath)
        coverExtractorVersion = cover ? 1 : 0
      }

      const codecLabel = normalizeResolvedAudioCodec(metadata, filePath, ffmpegInfo, preferFfmpegInfo)
      const embeddedLyrics = extractEmbeddedLyricsText(metadata)
      const sampleRate = preferFfmpegInfo
        ? ffmpegInfo?.sampleRate || metadata.format.sampleRate || null
        : metadata.format.sampleRate || ffmpegInfo?.sampleRate || null
      const bitrate = preferFfmpegInfo
        ? ffmpegInfo?.bitrate || metadata.format.bitrate || null
        : metadata.format.bitrate || ffmpegInfo?.bitrate || null
      const channels = preferFfmpegInfo
        ? ffmpegInfo?.channels || metadata.format.numberOfChannels || null
        : metadata.format.numberOfChannels || ffmpegInfo?.channels || null
      const bitDepth = preferFfmpegInfo
        ? ffmpegInfo?.bitDepth || metadata.format.bitsPerSample || null
        : metadata.format.bitsPerSample || ffmpegInfo?.bitDepth || null
      const displayDuration = getCueDuration(requestedPath, durationSec || infoSidecar?.duration || 0)

      return {
        success: true,
        technical: {
          sampleRate,
          bitrate,
          channels,
          bitDepth,
          codec: codecLabel,
          duration: displayDuration,
          isMqa: hasMqaMetadata(metadata),
          lossless:
            metadata.format.lossless ||
            /^(alac|flac|wav|aiff|ape)$/i.test(ffmpegInfo?.codec || '') ||
            /^(alac|flac|wav|aiff|ape)$/i.test(codecLabel) ||
            metadata.format.container?.toLowerCase() === 'flac' ||
            metadata.format.container?.toLowerCase() === 'wav'
        },
        common: {
          title:
            cueTrack?.title ||
            metadata.common.title ||
            ffmpegInfo?.tags?.title ||
            getReadableInfoSidecarName(infoSidecar) ||
            basename(filePath, extname(filePath)),
          artist:
            cueTrack?.artist ||
            metadata.common.artist ||
            ffmpegInfo?.tags?.artist ||
            'Unknown Artist',
          album: cueTrack?.albumTitle || metadata.common.album || ffmpegInfo?.tags?.album,
          albumArtist:
            metadata.common.albumartist ||
            metadata.common.albumArtist ||
            ffmpegInfo?.tags?.albumArtist ||
            null,
          trackNo: metadata.common.track?.no ?? null,
          discNo: metadata.common.disk?.no ?? null,
          bpm: extractBpmMetadataValue(metadata) || infoSidecar?.bpm || null,
          lyrics: embeddedLyrics || null,
          lyricsExtractorVersion: EMBEDDED_LYRICS_EXTRACTOR_VERSION,
          cover,
          coverScope,
          coverExtractorVersion,
          coverBytes,
          coverWidth,
          coverHeight
        }
      }
    } catch (e) {
      const msg = e?.message || String(e)
      const isKnownParseNoise =
        e?.name === 'FieldDecodingError' ||
        /FourCC|invalid characters|Tokenizer|Failed to determine|End-Of-Stream|Unexpected end/i.test(
          msg
        )
      if (!isKnownParseNoise) {
        console.error('getExtendedMetadata error:', msg)
      }
      return getExtendedMetadataFallback(filePath)
    }
  }

  function normalizeMetadataText(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function normalizeMetadataNumber(value) {
    if (value === null || value === undefined || value === '') return ''
    const parsed = Number.parseInt(String(value), 10)
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : ''
  }

  function normalizeMetadataGenre(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeMetadataText(item))
        .filter(Boolean)
        .join('; ')
    }
    return normalizeMetadataText(value)
  }

  function isEditableLocalPath(filePath) {
    if (typeof filePath !== 'string') return false
    const trimmed = filePath.trim()
    if (!trimmed) return false
    if (/^https?:\/\//i.test(trimmed)) return false
    if (trimmed.startsWith('\\\\')) return true
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
    if (trimmed.startsWith('/')) return true
    return false
  }

  function assertEditableLocalPath(filePath) {
    const trimmed = typeof filePath === 'string' ? filePath.trim() : ''
    if (!trimmed) throw new Error('Missing audio file path')
    if (!isEditableLocalPath(trimmed)) throw new Error('Only local audio files can be edited')
    return trimmed
  }

  function isDsdAudioFile(filePath) {
    const extension = extname(filePath).toLowerCase()
    return extension === '.dsf' || extension === '.dff'
  }

  function createPictureDataUrl(picture) {
    if (!picture?.data) return null
    try {
      const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data)
      if (!buffer.length) return null
      const mime = picture.format?.includes('/') ? picture.format : `image/${picture.format || 'jpeg'}`
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  async function extractAttachedCoverWithFfmpeg(filePath) {
    const tempPath = resolve(app.getPath('temp'), `echo-attached-cover-${process.pid}-${Date.now()}.jpg`)
    try {
      await runFfmpegCommand([
        '-y',
        '-i',
        filePath,
        '-map',
        '0:v:0?',
        '-an',
        '-frames:v',
        '1',
        '-update',
        '1',
        '-q:v',
        '3',
        tempPath
      ])
      if (!fs.existsSync(tempPath)) return null
      const data = fs.readFileSync(tempPath)
      if (!data.length) return null
      return compressEmbeddedCoverData({ data, format: 'image/jpeg' })
    } catch {
      return null
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch {
        /* ignore temp cleanup errors */
      }
    }
  }

  function buildFfmpegMetadataArgs(entries, { skipEmptyFields = false } = {}) {
    const args = []
    for (const [key, value] of entries) {
      if (skipEmptyFields && !value) continue
      args.push('-metadata', `${key}=${value}`)
    }
    return args
  }

  function resolveFfmpegOutputFormat(filePath) {
    const extension = extname(filePath).toLowerCase()
    switch (extension) {
      case '.flac':
        return 'flac'
      case '.mp3':
        return 'mp3'
      case '.m4a':
      case '.mp4':
      case '.aac':
      case '.alac':
        return 'mp4'
      case '.ogg':
      case '.opus':
        return 'ogg'
      case '.wav':
        return 'wav'
      case '.ape':
        return 'ape'
      case '.wma':
      case '.asf':
        return 'asf'
      default:
        return ''
    }
  }

  function runFfmpegCommand(args) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getResolvedFfmpegStaticPath()
      if (!ffmpegPath) {
        reject(new Error('FFmpeg executable not found'))
        return
      }

      execFile(ffmpegPath, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 32 }, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  function replaceFileWithBackup(targetPath, tempPath) {
    const backupPath = resolve(
      dirname(targetPath),
      `.${basename(targetPath)}.echo-backup-${process.pid}-${Date.now()}${extname(targetPath)}`
    )

    fs.renameSync(targetPath, backupPath)
    try {
      fs.renameSync(tempPath, targetPath)
      fs.rmSync(backupPath, { force: true })
    } catch (error) {
      try {
        if (fs.existsSync(backupPath) && !fs.existsSync(targetPath)) {
          fs.renameSync(backupPath, targetPath)
        }
      } catch {
        /* best effort restore */
      }
      throw error
    }
  }

  function resolveImageExtensionFromUrl(url, contentType = '') {
    const type = String(contentType || '').toLowerCase()
    if (type.includes('png')) return '.png'
    if (type.includes('webp')) return '.webp'
    if (type.includes('jpeg') || type.includes('jpg')) return '.jpg'
    try {
      const parsed = new URL(url)
      const found = extname(parsed.pathname).toLowerCase()
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(found)) return found
    } catch {
      /* ignore invalid cover urls */
    }
    return '.jpg'
  }

  async function downloadRemoteCoverToTemp(coverUrl) {
    const raw = String(coverUrl || '').trim()
    if (!/^https?:\/\//i.test(raw)) return ''
    const res = await axios.get(raw, {
      responseType: 'arraybuffer',
      timeout: 12000,
      maxContentLength: 8 * 1024 * 1024,
      headers: {
        Referer: 'https://y.qq.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
      }
    })
    const ext = resolveImageExtensionFromUrl(raw, res?.headers?.['content-type'])
    const tempPath = resolve(app.getPath('temp'), `echo-cover-${process.pid}-${Date.now()}${ext}`)
    fs.writeFileSync(tempPath, Buffer.from(res.data))
    return tempPath
  }

  async function applyDownloadedMetadata(payload) {
    const filePath = assertEditableLocalPath(payload?.path)
    if (!fs.existsSync(filePath)) throw new Error('Audio file not found')

    let tempCoverPath = ''
    try {
      tempCoverPath = await downloadRemoteCoverToTemp(payload?.coverUrl)
      await writeAudioMetadata(
        {
          path: filePath,
          title: payload?.title,
          artist: payload?.artist,
          album: payload?.album,
          albumArtist: payload?.albumArtist || payload?.artist,
          trackNumber: payload?.trackNumber
        },
        {
          coverPath: tempCoverPath,
          skipEmptyFields: true
        }
      )
      return { ok: true }
    } finally {
      if (tempCoverPath) {
        try {
          fs.rmSync(tempCoverPath, { force: true })
        } catch {
          /* ignore temp cleanup errors */
        }
      }
    }
  }

  async function writeAudioMetadata(payload, options = {}) {
    const {
      coverPath: explicitCoverPath = undefined,
      returnExtendedMetadata = false,
      skipEmptyFields = false,
      rejectDsd = false,
      tempPath: explicitTempPath = ''
    } = options

    const filePath = assertEditableLocalPath(payload?.path)
    if (!fs.existsSync(filePath)) throw new Error('Audio file not found')
    if (rejectDsd && isDsdAudioFile(filePath)) {
      throw new Error('DSD files do not support tag editing')
    }

    const rawCoverPath =
      typeof explicitCoverPath === 'string' ? explicitCoverPath : payload?.coverPath || ''
    const coverPath = typeof rawCoverPath === 'string' ? rawCoverPath.trim() : ''
    if (coverPath && !fs.existsSync(coverPath)) throw new Error('Selected cover image was not found')

    const title = normalizeMetadataText(payload?.title)
    const artist = normalizeMetadataText(payload?.artist)
    const album = normalizeMetadataText(payload?.album)
    const albumArtist = normalizeMetadataText(payload?.albumArtist)
    const trackNo = normalizeMetadataNumber(payload?.trackNo ?? payload?.trackNumber)
    const discNo = normalizeMetadataNumber(payload?.discNo)
    const year = normalizeMetadataNumber(payload?.year)
    const genre = normalizeMetadataGenre(payload?.genre)

    const extension = extname(filePath)
    const tempPath =
      typeof explicitTempPath === 'string' && explicitTempPath.trim()
        ? explicitTempPath.trim()
        : resolve(dirname(filePath), `.${basename(filePath)}.echo-tags-${process.pid}-${Date.now()}${extension}`)
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', filePath]

    if (coverPath) {
      args.push('-i', coverPath)
      args.push('-map', '0:a?', '-map', '0:s?', '-map', '0:d?', '-map', '1:v:0')
    } else {
      args.push('-map', '0')
    }

    args.push('-c', 'copy')
    if (coverPath) {
      args.push('-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic')
      if (/\.mp3$/i.test(filePath)) {
        args.push('-id3v2_version', '3')
      }
      args.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
    }

    args.push(
      ...buildFfmpegMetadataArgs(
        [
          ['title', title],
          ['artist', artist],
          ['album', album],
          ['album_artist', albumArtist],
          ['track', trackNo],
          ['disc', discNo],
          ['date', year],
          ['genre', genre]
        ],
        { skipEmptyFields }
      ),
      ...(resolveFfmpegOutputFormat(filePath) ? ['-f', resolveFfmpegOutputFormat(filePath)] : []),
      tempPath
    )

    try {
      await runFfmpegCommand(args)
      replaceFileWithBackup(filePath, tempPath)
      if (returnExtendedMetadata) {
        return await buildExtendedMetadataResponse(filePath)
      }
      return { ok: true }
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch {
        /* ignore temp cleanup errors */
      }
      throw error
    }
  }

  async function writeExtendedMetadata(payload) {
    return await writeAudioMetadata(payload, { returnExtendedMetadata: true })
  }

  function createTemporaryRenamePath(filePath, index) {
    const dir = dirname(filePath)
    const ext = extname(filePath)
    let candidate = resolve(
      dir,
      `.echo-rename-${process.pid}-${Date.now()}-${index}${ext || '.tmp'}`
    )
    let attempt = 1
    while (fs.existsSync(candidate)) {
      candidate = resolve(
        dir,
        `.echo-rename-${process.pid}-${Date.now()}-${index}-${attempt}${ext || '.tmp'}`
      )
      attempt += 1
    }
    return candidate
  }

  function normalizeRenameItems(payload) {
    return Array.isArray(payload)
      ? payload.filter(
          (item) =>
            item &&
            typeof item.from === 'string' &&
            item.from.trim() &&
            typeof item.to === 'string' &&
            item.to.trim()
        )
      : []
  }

  async function batchRenameFiles(payload) {
    const items = normalizeRenameItems(payload)
      .map((item) => ({ from: item.from.trim(), to: item.to.trim() }))
      .filter((item) => item.from !== item.to)

    if (!items.length) return { success: true, renamed: [] }

    const sourceSet = new Set(items.map((item) => item.from.toLowerCase()))
    const targetSet = new Set()
    for (const item of items) {
      if (!fs.existsSync(item.from)) {
        throw new Error(`File not found: ${item.from}`)
      }
      if (dirname(item.from).toLowerCase() !== dirname(item.to).toLowerCase()) {
        throw new Error('Renaming across folders is not supported')
      }
      const targetKey = item.to.toLowerCase()
      if (targetSet.has(targetKey)) {
        throw new Error(`Duplicate target name: ${item.to}`)
      }
      targetSet.add(targetKey)
      if (fs.existsSync(item.to) && !sourceSet.has(targetKey)) {
        throw new Error(`Target file already exists: ${item.to}`)
      }
    }

    const staged = []
    const finalized = []
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        const tempPath = createTemporaryRenamePath(item.from, index)
        fs.renameSync(item.from, tempPath)
        staged.push({ ...item, tempPath })
      }

      for (const item of staged) {
        fs.renameSync(item.tempPath, item.to)
        finalized.push(item)
      }

      return {
        success: true,
        renamed: finalized.map(({ from, to }) => ({ from, to }))
      }
    } catch (error) {
      for (let index = finalized.length - 1; index >= 0; index -= 1) {
        const item = finalized[index]
        try {
          if (fs.existsSync(item.to)) fs.renameSync(item.to, item.tempPath)
        } catch {
          /* best effort rollback */
        }
      }
      for (let index = staged.length - 1; index >= 0; index -= 1) {
        const item = staged[index]
        try {
          if (fs.existsSync(item.tempPath) && !fs.existsSync(item.from)) {
            fs.renameSync(item.tempPath, item.from)
          }
        } catch {
          /* best effort rollback */
        }
      }
      throw error
    }
  }

  function resolveAudioCodecLabel(metadata, filePath) {
    const explicitCodec = String(metadata?.format?.codec || '').trim()
    const codecProfile = String(metadata?.format?.codecProfile || '').trim()
    const container = String(metadata?.format?.container || '').trim()
    const extUpper = extname(filePath).replace(/^\./, '').toUpperCase()

    if (/alac/i.test(explicitCodec) || /alac/i.test(codecProfile) || /\.alac$/i.test(filePath)) {
      return 'ALAC'
    }

    return explicitCodec || container || extUpper || 'unknown'
  }

  // IPC: Get Extended Audio Metadata (Sample rate, bitrate, format, cover)
  ipcMain.handle('file:getExtendedMetadata', async (_, filePath) => {
    if (isSubsonicTrackPath(filePath) || isJellyfinTrackPath(filePath)) {
      try {
        const track = isJellyfinTrackPath(filePath)
          ? await getJellyfinTrackMetadata(filePath)
          : await getSubsonicTrackMetadata(filePath)
        const info = track?.info || {}
        const bitrateKbps = Number(info.bitrateKbps || 0)
        const codec = info.codec || 'Remote'
        return {
          success: true,
          technical: {
            sampleRate: Number(info.sampleRateHz || 0) || null,
            bitrate: bitrateKbps ? bitrateKbps * 1000 : null,
            channels: Number(info.channels || 0) || null,
            bitDepth: Number(info.bitDepth || 0) || null,
            codec,
            duration: Number(info.duration || track?.duration || 0) || null,
            isMqa: false,
            lossless: /^(flac|alac|wav|aiff)$/i.test(codec)
          },
          common: {
            title: track?.title || info.title || 'Unknown Title',
            artist: track?.artist || info.artist || 'Unknown Artist',
            album: track?.album || info.album || '',
            albumArtist: info.albumArtist || null,
            trackNo: null,
            discNo: null,
            bpm: null,
            lyrics: null,
            cover: info.cover || null,
            coverExtractorVersion: info.cover ? 1 : 0,
            coverBytes: 0,
            coverWidth: 0,
            coverHeight: 0
          }
        }
      } catch (error) {
        return { success: false, error: error?.message || String(error) }
      }
    }
    const metadataPath = resolveMetadataFilePath(filePath)
    if (!existsSync(metadataPath)) {
      return { success: false, error: 'file_not_found' }
    }
    return await buildExtendedMetadataResponse(filePath)
  })

  ipcMain.handle('file:detectBpm', async (_, filePath) => {
    try {
      if (isSubsonicTrackPath(filePath) || isJellyfinTrackPath(filePath)) {
        return { success: false, error: 'remote_bpm_unavailable', bpm: null }
      }
      filePath = resolveMetadataFilePath(filePath)
      if (!existsSync(filePath)) {
        return { success: false, error: 'file_not_found', bpm: null }
      }
      const result = await detectBpm(filePath)
      return {
        success: true,
        bpm: result.bpm || null,
        confidence: result.confidence || 0,
        backend: result.backend || null
      }
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
        bpm: null
      }
    }
  })

  ipcMain.handle('tags:read', async (_, filePath) => {
    try {
      const resolvedPath = assertEditableLocalPath(filePath)
      if (!fs.existsSync(resolvedPath)) throw new Error('Audio file not found')
      const { parseFile, selectCover } = await import('music-metadata')
      const metadata = await parseFile(resolvedPath)
      const cover = selectCover(metadata.common.picture)
      return {
        title: metadata.common.title || basename(resolvedPath, extname(resolvedPath)),
        artist: metadata.common.artist || '',
        albumArtist: metadata.common.albumartist || metadata.common.albumArtist || '',
        album: metadata.common.album || '',
        trackNumber: metadata.common.track?.no ? String(metadata.common.track.no) : '',
        year: metadata.common.year ? String(metadata.common.year) : '',
        genre: Array.isArray(metadata.common.genre)
          ? metadata.common.genre.filter(Boolean).join('; ')
          : normalizeMetadataGenre(metadata.common.genre),
        coverDataUrl: createPictureDataUrl(cover)
      }
    } catch (error) {
      return {
        error: error?.message || String(error)
      }
    }
  })

  ipcMain.handle('dialog:selectImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (canceled || !filePaths?.length) return null
    return filePaths[0]
  })

  ipcMain.handle('tags:write', async (_, filePath, tags, newCoverPath) => {
    try {
      const resolvedPath = assertEditableLocalPath(filePath)
      const extension = extname(resolvedPath)
      const dirPath = dirname(resolvedPath)
      const baseName = basename(resolvedPath, extension)
      const payload = {
        path: resolvedPath,
        title: tags?.title,
        artist: tags?.artist,
        albumArtist: tags?.albumArtist,
        album: tags?.album,
        trackNumber: tags?.trackNumber,
        year: tags?.year,
        genre: tags?.genre
      }
      await writeAudioMetadata(payload, {
        coverPath: newCoverPath,
        skipEmptyFields: true,
        rejectDsd: true,
        tempPath: resolve(dirPath, `.${baseName}.echotmp${extension}`)
      })
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error)
      }
    }
  })

  ipcMain.handle('file:updateExtendedMetadata', async (_, payload) => {
    try {
      return await writeExtendedMetadata(payload)
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error)
      }
    }
  })

  ipcMain.handle('file:batchRenameFiles', async (_, payload) => {
    try {
      return await batchRenameFiles(payload)
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
        renamed: []
      }
    }
  })

  ipcMain.handle('lastfm:login', async (_, username, password) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return await lastFmClient.authenticate(username, password)
  })

  ipcMain.handle('lastfm:startWebAuth', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const result = await lastFmClient.createWebAuthToken()
    if (result?.ok && result.url) {
      await shell.openExternal(result.url)
    }
    return result
  })

  ipcMain.handle('lastfm:completeWebAuth', async (_, token) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return await lastFmClient.completeWebAuth(token)
  })

  ipcMain.handle('lastfm:logout', () => {
    lastFmClient.clearSession()
    return { ok: true }
  })

  ipcMain.handle('lastfm:setSession', (_, sessionKey, username) => {
    lastFmClient.setSession(sessionKey, username)
    return { ok: true }
  })

  ipcMain.handle('lastfm:nowPlaying', (_, artist, track, album, duration) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return lastFmClient.nowPlaying(artist, track, album, duration)
  })

  ipcMain.handle('lastfm:scrobble', (_, artist, track, album, startedAt, duration) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return lastFmClient.scrobble(artist, track, album, startedAt, duration)
  })

  // IPC: Update Discord Rich Presence
  ipcMain.on('discord:setActivity', (_, activity) => {
    rpcLastActivity = activity || null
    rpcActivityRevision += 1
    const revision = rpcActivityRevision
    if (!rpcEnabled || discordRpcQuitting) return

    // If we previously gave up after exhausting reconnect attempts, only try
    // again when something materially changed (new track). Otherwise the
    // periodic position-bucket pings would silently re-trigger the whole
    // connect→fail cycle every 10s and re-spam the console.
    if (rpcGaveUp) {
      const nextTrackId = activity?.trackId || ''
      if (!nextTrackId || nextTrackId === rpcGaveUpTrackId) return
      resetDiscordRpcGiveUp()
    }

    if (!rpcClient || !rpcReady) {
      if (!rpcConnecting && !rpcRetryTimer) initDiscordRPC()
      return
    }

    applyRpcActivity(rpcLastActivity, true, revision).catch(() => {})
  })

  // IPC: Clear Discord Presence
  ipcMain.on('discord:clearActivity', () => {
    rpcLastActivity = null
    rpcActivityRevision += 1
    clearRpcRetryTimer()
    if (!rpcClient || !rpcReady) {
      if (rpcClient && !rpcConnecting) void disposeDiscordRpc()
      return
    }
    const client = rpcClient
    try {
      Promise.resolve(client.clearActivity())
        .catch((error) => {
          handleDiscordRpcCommandFailure(error, 'clear-activity-failed', client, false)
        })
        .finally(() => {
          if (!rpcLastActivity && rpcClient === client) void disposeDiscordRpc()
        })
    } catch (error) {
      handleDiscordRpcCommandFailure(error, 'clear-activity-failed', client, false)
    }
  })

  // IPC: Toggle Discord RPC
  ipcMain.on('discord:toggle', (_, enabled) => {
    rpcEnabled = !!enabled
    if (enabled) {
      if (discordRpcQuitting) return
      resetDiscordRpcGiveUp()
      rpcLastConnectErrorLogAt = 0
      if (rpcLastActivity) initDiscordRPC()
    } else {
      rpcLastActivity = null
      rpcActivityRevision += 1
      void disposeDiscordRpc()
    }
  })

  // === Native Audio Engine IPC ===
  ipcMain.handle('audio:getDevices', async () => {
    return audioEngine.getDevices()
  })

  ipcMain.handle('audio:getAsioDevices', () => {
    try {
      return listAsioDevices()
    } catch {
      return []
    }
  })

  ipcMain.handle('audio:setDevice', async (_, deviceId) => {
    return audioEngine.setDevice(deviceId)
  })

  ipcMain.handle('audio:setAsio', (_, enabled) => {
    audioEngine.setAsio(enabled)
    return { ok: true }
  })

  ipcMain.handle('audio:setExclusive', async (_, exclusive) => {
    audioEngine.setExclusive(exclusive)
  })

  ipcMain.handle('audio:setOutputBufferProfile', async (_, profile) => {
    audioEngine.setOutputBufferProfile(profile)
  })

  ipcMain.handle('audio:setEqConfig', async (_, eqConfig) => {
    audioEngine.setEqConfig(eqConfig)
  })

  ipcMain.handle(
    'audio:play',
    async (_, filePath, startTime, playbackRate, sourceSampleRateHint) => {
      if (isStreamingTrackPath(filePath)) {
        audioEngine.stop()
      }
      const resolvedPath = await resolveRemotePlaybackPath(filePath)
      return audioEngine.play(resolvedPath, startTime, playbackRate, sourceSampleRateHint)
    }
  )

  ipcMain.handle('audio:setPlaybackRate', async (_, rate) => {
    return audioEngine.setPlaybackRate(rate)
  })

  ipcMain.handle('audio:seek', async (_, filePath, startTime, playbackRate, shouldPlay) => {
    const resolvedPath = filePath ? await resolveRemotePlaybackPath(filePath) : ''
    const resume = typeof shouldPlay === 'boolean' ? shouldPlay : undefined
    return audioEngine.seek(resolvedPath, startTime, playbackRate, resume)
  })

  ipcMain.handle('audio:pause', async () => {
    audioEngine.pause()
  })

  ipcMain.handle('audio:resume', async () => {
    audioEngine.resume()
  })

  ipcMain.handle('audio:startFadeOut', async (_, durationMs) => {
    return await new Promise((resolve) => {
      audioEngine.startFadeOut(durationMs, () => resolve(true))
    })
  })

  ipcMain.handle('audio:startFadeIn', async (_, durationMs) => {
    audioEngine.startFadeIn(durationMs)
    return true
  })

  ipcMain.handle('audio:cancelFade', async () => {
    audioEngine.cancelFade()
    return true
  })

  ipcMain.handle('audio:stop', async () => {
    audioEngine.stop()
  })

  ipcMain.handle('audio:setVolume', async (_, vol) => {
    audioEngine.setVolume(vol)
  })

  ipcMain.handle('audio:loadVst', async (_, path) => {
    audioEngine.loadVstPlugin(path)
  })

  ipcMain.handle('audio:disableVst', async () => {
    audioEngine.disableVstPlugin()
  })

  ipcMain.handle('audio:showVstUI', async () => {
    audioEngine.showVstPluginUI()
  })

  // Start polling playback status
  let lastBroadcastAudioStatus = null
  let lastBroadcastAudioStatusAt = 0
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const now = Date.now()
    const status = audioEngine.getStatus()
    if (shouldBroadcastAudioStatus(lastBroadcastAudioStatus, status, now, lastBroadcastAudioStatusAt)) {
      broadcastAudioStatus(status)
      lastBroadcastAudioStatus = status
      lastBroadcastAudioStatusAt = now
    }
  }, AUDIO_STATUS_POLL_INTERVAL_MS)

  ipcMain.handle('lyricsDesktop:open', async () => {
    try {
      if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
        lyricsDesktopWindow.focus()
        startLyricsDesktopMainSyncTimer()
        lyricsDesktopPullFromMainRenderer()
        return { ok: true }
      }

      const globalState = readAppStateJson()
      const savedBounds = globalState.lyricsDesktopBounds || { width: 680, height: 132 }
      const alwaysOnTop = globalState.config?.desktopLyricsAlwaysOnTop !== false
      const locked = globalState.config?.desktopLyricsLocked === true
      const appWindowIcon = createAppWindowIcon()

      lyricsDesktopWindow = new BrowserWindow({
        width: savedBounds.width,
        height: savedBounds.height,
        x: savedBounds.x,
        y: savedBounds.y,
        minWidth: 400,
        minHeight: 64,
        title: `${APP_NAME} Lyrics`,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: alwaysOnTop,
        autoHideMenuBar: true,
        ...(appWindowIcon ? { icon: appWindowIcon } : {}),
        backgroundThrottling: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: false,
          webSecurity: false
        }
      })

      applyLyricsDesktopLockState(locked)

      if (alwaysOnTop) {
        lyricsDesktopWindow.setAlwaysOnTop(true, 'screen-saver')
        lyricsDesktopWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      }

      // Must attach before loadURL: ready-to-show often fires before loadURL's promise resolves,
      // so registering after await loadURL leaves the window invisible forever (show: false).
      lyricsDesktopWindow.once('ready-to-show', () => {
        if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) lyricsDesktopWindow.show()
      })
      lyricsDesktopWindow.on('close', () => {
        try {
          if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
            const bounds = lyricsDesktopWindow.getBounds()
            const state = readAppStateJson()
            state.lyricsDesktopBounds = bounds
            writeAppStateJson(state)
          }
        } catch {
          // ignore
        }
      })
      lyricsDesktopWindow.on('closed', () => {
        stopLyricsDesktopMainSyncTimer()
        lyricsDesktopWindow = null
        lyricsDesktopLastPayloadSignature = ''
      })
      let loadUrl
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const u = new URL(process.env['ELECTRON_RENDERER_URL'])
        u.searchParams.set('mode', 'lyrics-desktop')
        loadUrl = u.toString()
      } else {
        const localUrl = await startRendererHttpServer()
        const u = new URL(localUrl)
        u.searchParams.set('mode', 'lyrics-desktop')
        loadUrl = u.toString()
      }
      await lyricsDesktopWindow.loadURL(loadUrl)
      if (
        lyricsDesktopWindow &&
        !lyricsDesktopWindow.isDestroyed() &&
        !lyricsDesktopWindow.isVisible()
      ) {
        lyricsDesktopWindow.show()
      }
      startLyricsDesktopMainSyncTimer()
      lyricsDesktopPullFromMainRenderer()
      return { ok: true }
    } catch (e) {
      console.error('[lyricsDesktop] open failed:', e)
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('lyricsDesktop:close', async () => {
    try {
      stopLyricsDesktopMainSyncTimer()
      if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
        lyricsDesktopWindow.close()
      }
      lyricsDesktopWindow = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('lyricsDesktop:setAlwaysOnTop', async (_, isAlwaysOnTop) => {
    try {
      if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
        if (isAlwaysOnTop) {
          lyricsDesktopWindow.setAlwaysOnTop(true, 'screen-saver')
          lyricsDesktopWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        } else {
          lyricsDesktopWindow.setAlwaysOnTop(false)
          lyricsDesktopWindow.setVisibleOnAllWorkspaces(false)
        }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('lyricsDesktop:setLocked', async (_, isLocked) => {
    try {
      applyLyricsDesktopLockState(!!isLocked)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  /** User dismissed the floating overlay (Escape / right-click): close + uncheck in main UI */
  ipcMain.handle('lyricsDesktop:dismiss', async () => {
    try {
      stopLyricsDesktopMainSyncTimer()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lyrics-desktop:uncheck')
      }
      if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
        lyricsDesktopWindow.close()
      }
      lyricsDesktopWindow = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('lyricsDesktop:ready', async () => {
    if (lyricsDesktopWindow && !lyricsDesktopWindow.isDestroyed()) {
      lyricsDesktopWindow.webContents.send('lyrics-desktop:data', lyricsDesktopLastPayload)
    }
    return { ok: true }
  })

  ipcMain.handle('lyricsDesktop:updateData', async (_, payload = null) => {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_payload' }
    if (!lyricsDesktopWindow || lyricsDesktopWindow.isDestroyed()) return { ok: false, error: 'no_window' }
    const payloadSignature = JSON.stringify(payload)
    if (payloadSignature === lyricsDesktopLastPayloadSignature) return { ok: true, deduped: true }
    lyricsDesktopLastPayloadSignature = payloadSignature
    lyricsDesktopLastPayload = payload
    try {
      lyricsDesktopWindow.webContents.send('lyrics-desktop:data', payload)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:open', async () => {
    try {
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
        if (miniPlayerWindow.isMinimized()) miniPlayerWindow.restore()
        miniPlayerWindow.setSize(
          MINI_PLAYER_DEFAULT_BOUNDS.width,
          MINI_PLAYER_DEFAULT_BOUNDS.height,
          false
        )
        miniPlayerWindow.show()
        miniPlayerWindow.focus()
        startMiniPlayerMainSyncTimer()
        miniPlayerPullFromMainRenderer({ force: true })
        hideMainWindowForMiniPlayer()
        return { ok: true }
      }

      const globalState = readAppStateJson()
      const savedBounds = globalState.miniPlayerBounds || MINI_PLAYER_DEFAULT_BOUNDS
      const alwaysOnTop = globalState.config?.miniPlayerAlwaysOnTop !== false
      const appWindowIcon = createAppWindowIcon()

      miniPlayerWindow = new BrowserWindow({
        width: MINI_PLAYER_DEFAULT_BOUNDS.width,
        height: MINI_PLAYER_DEFAULT_BOUNDS.height,
        x: savedBounds.x,
        y: savedBounds.y,
        minWidth: 320,
        minHeight: 64,
        maxWidth: 430,
        maxHeight: 74,
        title: `${APP_NAME} Mini Player`,
        show: false,
        frame: false,
        transparent: false,
        backgroundColor: '#f7fbfb',
        hasShadow: true,
        resizable: false,
        maximizable: false,
        minimizable: true,
        skipTaskbar: true,
        alwaysOnTop,
        autoHideMenuBar: true,
        ...(appWindowIcon ? { icon: appWindowIcon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: false,
          webSecurity: false,
          backgroundThrottling: true
        }
      })

      applyMiniPlayerAlwaysOnTop(alwaysOnTop)

      miniPlayerWindow.once('ready-to-show', () => {
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) miniPlayerWindow.show()
      })
      miniPlayerWindow.on('close', () => {
        try {
          if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            const bounds = miniPlayerWindow.getBounds()
            const state = readAppStateJson()
            state.miniPlayerBounds = bounds
            writeAppStateJson(state)
          }
        } catch {
          // ignore
        }
      })
      miniPlayerWindow.on('closed', () => {
        stopMiniPlayerMainSyncTimer()
        miniPlayerWindow = null
        miniPlayerLastPayloadSignature = ''
        notifyMiniPlayerClosed()
        restoreMainWindowAfterMiniPlayer()
      })

      let loadUrl
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const u = new URL(process.env['ELECTRON_RENDERER_URL'])
        u.searchParams.set('mode', 'mini-player')
        loadUrl = u.toString()
      } else {
        const localUrl = await startRendererHttpServer()
        const u = new URL(localUrl)
        u.searchParams.set('mode', 'mini-player')
        loadUrl = u.toString()
      }
      await miniPlayerWindow.loadURL(loadUrl)
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed() && !miniPlayerWindow.isVisible()) {
        miniPlayerWindow.show()
      }
      startMiniPlayerMainSyncTimer()
      miniPlayerPullFromMainRenderer({ force: true })
      hideMainWindowForMiniPlayer()
      return { ok: true }
    } catch (e) {
      console.error('[miniPlayer] open failed:', e)
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:close', async () => {
    try {
      stopMiniPlayerMainSyncTimer()
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
        miniPlayerWindow.close()
      }
      miniPlayerWindow = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:hide', async () => {
    try {
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) miniPlayerWindow.minimize()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:dismiss', async () => {
    try {
      stopMiniPlayerMainSyncTimer()
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) miniPlayerWindow.close()
      miniPlayerWindow = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:setAlwaysOnTop', async (_, isAlwaysOnTop) => {
    try {
      applyMiniPlayerAlwaysOnTop(isAlwaysOnTop === true)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:ready', async () => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      if (miniPlayerLastPayload && Object.keys(miniPlayerLastPayload).length > 0) {
        miniPlayerWindow.webContents.send('mini-player:data', miniPlayerLastPayload)
      }
      miniPlayerPullFromMainRenderer({ force: true })
    }
    return { ok: true }
  })

  ipcMain.handle('miniPlayer:updateData', async (_, payload = {}) => {
    try {
      return sendMiniPlayerPayloadToWindow(payload)
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('miniPlayer:command', async (_, message = {}) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mini-player:command', message)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // === Phone remote control Web app ===
  ipcMain.handle('remote:start', async (_, opts = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    try {
      return await phoneRemoteServer.start(opts || {})
    } catch (error) {
      return { ok: false, error: error?.message || String(error), ...phoneRemoteServer.getStatus() }
    }
  })

  ipcMain.handle('remote:stop', async () => phoneRemoteServer.stop())
  ipcMain.handle('remote:status', async () => phoneRemoteServer.getStatus())
  ipcMain.handle('remote:rotateToken', async () => phoneRemoteServer.rotateToken())
  ipcMain.handle('remote:listClients', async () => ({
    ok: true,
    clients: phoneRemoteServer.listClients()
  }))
  ipcMain.handle('remote:kickClient', async (_, clientId) => phoneRemoteServer.kickClient(clientId))
  ipcMain.handle('remote:updateState', async (_, snapshot) => phoneRemoteServer.updateState(snapshot))

  // === 手机投流到本机（DLNA MediaRenderer???==
  ipcMain.handle('cast:dlnaStart', async (_, opts) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return dlnaRenderer.start(opts || {})
  })

  ipcMain.handle('cast:dlnaStop', async () => {
    return dlnaRenderer.stop()
  })

  ipcMain.handle('cast:airplayStart', async (_, opts) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return airplayReceiver.start(opts || {})
  })

  ipcMain.handle('cast:airplayStop', async () => {
    return airplayReceiver.stop()
  })

  ipcMain.handle('cast:airplayCommand', async (_, command) => {
    return airplayReceiver.sendRemoteCommand(command)
  })

  ipcMain.handle('cast:stopPlayback', async () => {
    const airplay = airplayReceiver.getStatus()
    const dlna = dlnaRenderer.getStatus()
    const dlnaActive =
      !!dlna.dlnaEnabled &&
      !!dlna.currentUri &&
      (dlna.transportState === 'PLAYING' || dlna.transportState === 'PAUSED_PLAYBACK')
    let stopped = false
    if (airplay.airplayActive) {
      await airplayReceiver.stopPlaybackOnly({ localTakeover: true })
      stopped = true
    }
    if (dlnaActive) {
      await dlnaRenderer.stopPlaybackOnly()
      stopped = true
    }
    broadcastCastStatus()
    return { ok: true, stopped }
  })

  ipcMain.handle('cast:getStatus', async () => {
    return getCastStatus()
  })

  // === 本机投送到数播（DLNA/OpenHome Control Point）===
  ipcMain.handle('castSend:discover', async (_, opts = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    return upnpSender.safeCall(() => upnpSender.discover(opts || {}))
  })

  ipcMain.handle('castSend:getStatus', async () => {
    return upnpSender.getStatus()
  })

  ipcMain.handle('castSend:playTrack', async (_, payload = {}) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const track = payload?.track || payload
    const deviceId = payload?.deviceId || payload?.targetDeviceId || ''
    return upnpSender.safeCall(() => upnpSender.playTrack(deviceId, track, payload?.options || {}))
  })

  ipcMain.handle('castSend:pause', async (_, deviceId = '') => {
    return upnpSender.safeCall(() => upnpSender.pause(deviceId))
  })

  ipcMain.handle('castSend:resume', async (_, deviceId = '') => {
    return upnpSender.safeCall(() => upnpSender.resume(deviceId))
  })

  ipcMain.handle('castSend:stop', async (_, deviceId = '') => {
    return upnpSender.safeCall(() => upnpSender.stop(deviceId))
  })

  ipcMain.handle('castSend:seek', async (_, payload = {}) => {
    return upnpSender.safeCall(() => upnpSender.seek(payload?.seconds || 0, payload?.deviceId || ''))
  })

  ipcMain.handle('castSend:setVolume', async (_, payload = {}) => {
    return upnpSender.safeCall(() => upnpSender.setVolume(payload?.volume ?? 0.7, payload?.deviceId || ''))
  })

  // 获取崩溃报告目录
  ipcMain.handle('crash:getReportDir', () => {
    return getCrashDir()
  })

  // 获取崩溃报告列表
  ipcMain.handle('crash:listReports', () => {
    try {
      const dir = getCrashDir()
      if (!fs.existsSync(dir)) return []
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: join(dir, f),
          size: fs.statSync(join(dir, f)).size,
          time: fs.statSync(join(dir, f)).mtime.toISOString()
        }))
        .sort((a, b) => new Date(b.time) - new Date(a.time))
    } catch (e) {
      return []
    }
  })

  // 打开崩溃报告文件??
  ipcMain.on('crash:openDir', () => {
    const dir = getCrashDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
  })

  ipcMain.handle('dev:openDevTools', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
    return { ok: true }
  })

  ipcMain.handle('dev:reloadWindow', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload()
    }
    return { ok: true }
  })

  ipcMain.handle('dev:openUserData', () => {
    const p = app.getPath('userData')
    try {
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
      shell.openPath(p)
    } catch (_) {}
    return { ok: true, path: p }
  })
  const STEALTH_JS = `(function(){
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
    if(!window.chrome)window.chrome={};
    if(!window.chrome.runtime)window.chrome.runtime={connect:function(){},sendMessage:function(){}};
    if(!window.chrome.app)window.chrome.app={
      InstallState:{DISABLED:'disabled',INSTALLED:'installed',NOT_INSTALLED:'not_installed'},
      RunningState:{CANNOT_RUN:'cannot_run',READY_TO_RUN:'ready_to_run',RUNNING:'running'},
      getDetails:function(){return null},
      getIsInstalled:function(){return false},
      isInstalled:false,
      installState:function(cb){cb('not_installed')},
      runningState:function(){return 'cannot_run'}
    };
    if(!window.chrome.csi)window.chrome.csi=function(){return{onloadT:Date.now(),pageT:3,startE:0,tran:15}};
    if(!window.chrome.loadTimes)window.chrome.loadTimes=function(){return{
      commitLoadTime:Date.now()/1e3-1,firstPaintAfterLoadTime:0,firstPaintTime:Date.now()/1e3-0.5,
      finishDocumentLoadTime:Date.now()/1e3-0.3,finishLoadTime:Date.now()/1e3-0.2,
      navigationType:'Other',npnNegotiatedProtocol:'h2',requestTime:Date.now()/1e3-2,
      startLoadTime:Date.now()/1e3-2,wasAlternateProtocolAvailable:false,wasFetchedViaSpdy:true,
      wasNpnNegotiated:true
    }};
    Object.defineProperty(navigator,'plugins',{get:()=>{
      const p=[
        {name:'Chrome PDF Plugin',filename:'internal-pdf-viewer',description:'Portable Document Format',length:1,item:()=>null,namedItem:()=>null},
        {name:'Chrome PDF Viewer',filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai',description:'',length:1,item:()=>null,namedItem:()=>null},
        {name:'Native Client',filename:'internal-nacl-plugin',description:'',length:1,item:()=>null,namedItem:()=>null},
      ];p.refresh=()=>{};try{Object.setPrototypeOf(p,PluginArray.prototype)}catch(e){};return p}});
    Object.defineProperty(navigator,'languages',{get:()=>['zh-CN','zh','en-US','en']});
    const _oq=navigator.permissions&&navigator.permissions.query&&navigator.permissions.query.bind(navigator.permissions);
    if(_oq)navigator.permissions.query=(p)=>p.name==='notifications'?Promise.resolve({state:Notification.permission}):_oq(p);
  })()`

  function injectStealth(webContents) {
    webContents.setUserAgent(standardUA)
    const inject = () => {
      if (webContents.isDestroyed()) return
      webContents.executeJavaScript(STEALTH_JS).catch(() => {})
    }
    webContents.on('dom-ready', inject)
    webContents.on('did-navigate-in-page', inject)
  }

  function createSignInWindow(url, onClosed) {
    const sharedSession = mainWindow.webContents.session
    const appWindowIcon = createAppWindowIcon()
    const win = new BrowserWindow({
      parent: mainWindow,
      width: 960,
      height: 720,
      minWidth: 400,
      minHeight: 400,
      title: APP_NAME,
      show: false,
      autoHideMenuBar: true,
      ...(appWindowIcon ? { icon: appWindowIcon } : {}),
      webPreferences: {
        session: sharedSession,
        contextIsolation: true,
        sandbox: true
      }
    })
    injectStealth(win.webContents)
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show()
    })
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win,
        autoHideMenuBar: true,
        webPreferences: {
          session: sharedSession,
          contextIsolation: true,
          sandbox: true
        }
      }
    }))
    win.webContents.on('did-create-window', (child) => {
      injectStealth(child.webContents)
    })
    win.loadURL(url)
    win.on('closed', () => {
      if (onClosed) onClosed()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('signin:status-changed')
      }
    })
    return win
  }

  ipcMain.handle('youtube:openSignInWindow', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: 'no_main_window' }
    }
    if (youtubeSignInWindow && !youtubeSignInWindow.isDestroyed()) {
      youtubeSignInWindow.focus()
      return { ok: true, reused: true }
    }
    youtubeSignInWindow = createSignInWindow('https://www.youtube.com/', () => {
      youtubeSignInWindow = null
    })
    return { ok: true }
  })

  ipcMain.handle('youtube:openSystemSignIn', async (_, browser = 'edge') => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const normalizedBrowser = browser === 'chrome' ? 'chrome' : 'edge'
    try {
      const executable = resolveYoutubeBrowserExecutable(normalizedBrowser)
      if (!executable) {
        return { ok: false, error: normalizedBrowser === 'chrome' ? 'chrome_not_found' : 'edge_not_found' }
      }
      const userDataDir = getYoutubeSystemProfileRoot(normalizedBrowser)
      fs.mkdirSync(userDataDir, { recursive: true })
      const port = await findFreeLocalPort()
      const args = [
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        'https://www.youtube.com/'
      ]
      const child = spawn(executable, args, {
        detached: false,
        stdio: 'ignore',
        windowsHide: false
      })
      child.on('exit', () => {
        if (youtubeSystemBrowserSession?.pid === child.pid) {
          youtubeSystemBrowserSession = null
        }
      })
      youtubeSystemBrowserSession = {
        browser: normalizedBrowser,
        port,
        userDataDir,
        pid: child.pid || 0
      }
      return { ok: true, browser: normalizedBrowser }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('youtube:saveSystemCookies', async () => {
    try {
      if (!youtubeSystemBrowserSession?.port) {
        return { ok: false, error: 'browser_not_open' }
      }
      const targets = await fetchJsonWithRetry(
        `http://127.0.0.1:${youtubeSystemBrowserSession.port}/json/list`
      )
      const pageTarget = Array.isArray(targets)
        ? targets.find((target) => /youtube\.com/i.test(String(target.url || ''))) || targets[0]
        : null
      const webSocketDebuggerUrl = pageTarget?.webSocketDebuggerUrl
      if (!webSocketDebuggerUrl) {
        return { ok: false, error: 'debug_endpoint_not_ready' }
      }
      const result = await sendCdpCommand(webSocketDebuggerUrl, 'Network.getAllCookies')
      const cookies = Array.isArray(result?.cookies) ? result.cookies : []
      const usefulCookies = cookies.filter((cookie) => {
        const domain = String(cookie.domain || '').replace(/^#HttpOnly_/, '')
        return /(^|\.)youtube\.com$/i.test(domain) || /(^|\.)google\.com$/i.test(domain)
      })
      if (!usefulCookies.length) {
        return { ok: false, error: 'no_youtube_cookies' }
      }
      const filePath = getInternalYoutubeCookieFile()
      writeNetscapeCookiesFile(usefulCookies, filePath)
      const signedIn = isYouTubeCookieSignedIn(usefulCookies)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('signin:status-changed')
      }
      return { ok: true, signedIn, count: usefulCookies.length }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('youtube:getSystemCookieStatus', async () => {
    const filePath = getInternalYoutubeCookieFile()
    if (!existsSync(filePath)) return { ok: true, available: false }
    try {
      const stat = fs.statSync(filePath)
      return { ok: true, available: true, updatedAt: stat.mtimeMs }
    } catch (error) {
      return { ok: false, available: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('youtube:logout', async () => {
    try {
      const ses = await getMainWindowSession()
      const cleared = await clearSessionCookiesForDomains(ses, [
        '.youtube.com',
        'youtube.com',
        '.google.com',
        'google.com'
      ])
      const filePath = getInternalYoutubeCookieFile()
      if (existsSync(filePath)) fs.rmSync(filePath, { force: true })
      notifySignInStatusChanged()
      return { ok: true, removed: cleared.removed, errors: cleared.errors }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('bilibili:openSignInWindow', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: 'no_main_window' }
    }
    if (bilibiliSignInWindow && !bilibiliSignInWindow.isDestroyed()) {
      bilibiliSignInWindow.focus()
      return { ok: true, reused: true }
    }
    bilibiliSignInWindow = createSignInWindow('https://www.bilibili.com/', () => {
      bilibiliSignInWindow = null
    })
    return { ok: true }
  })

  ipcMain.handle('bilibili:logout', async () => {
    try {
      const ses = await getMainWindowSession()
      const cleared = await clearSessionCookiesForDomains(ses, [
        '.bilibili.com',
        'bilibili.com',
        '.passport.bilibili.com',
        'passport.bilibili.com'
      ])
      notifySignInStatusChanged()
      return { ok: true, removed: cleared.removed, errors: cleared.errors }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('soundcloud:openSignInWindow', async (_, browser = 'edge') => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const normalizedBrowser = browser === 'chrome' ? 'chrome' : 'edge'
    try {
      if (soundCloudSystemBrowserSession?.port) {
        scheduleSoundCloudSystemCookieCapture()
        return { ok: true, reused: true, browser: soundCloudSystemBrowserSession.browser }
      }
      const executable = resolveYoutubeBrowserExecutable(normalizedBrowser)
      if (!executable) {
        return { ok: false, error: normalizedBrowser === 'chrome' ? 'chrome_not_found' : 'edge_not_found' }
      }
      const userDataDir = getSystemLoginProfileRoot('soundcloud', normalizedBrowser)
      fs.mkdirSync(userDataDir, { recursive: true })
      const port = await findFreeLocalPort()
      const child = spawn(
        executable,
        [
          `--user-data-dir=${userDataDir}`,
          `--remote-debugging-port=${port}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--new-window',
          'https://soundcloud.com/signin'
        ],
        {
          detached: false,
          stdio: 'ignore',
          windowsHide: false
        }
      )
      child.on('exit', () => {
        if (soundCloudSystemBrowserSession?.pid === child.pid) {
          soundCloudSystemBrowserSession = null
        }
      })
      soundCloudSystemBrowserSession = {
        browser: normalizedBrowser,
        port,
        userDataDir,
        pid: child.pid || 0
      }
      scheduleSoundCloudSystemCookieCapture()
      return { ok: true, browser: normalizedBrowser }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('soundcloud:logout', async () => {
    try {
      const ses = await getMainWindowSession()
      const cleared = await clearSessionCookiesForDomains(ses, [
        '.soundcloud.com',
        'soundcloud.com',
        '.sndcdn.com',
        'sndcdn.com'
      ])
      const filePath = getInternalSoundCloudCookieFile()
      if (existsSync(filePath)) fs.rmSync(filePath, { force: true })
      notifySignInStatusChanged()
      return { ok: true, removed: cleared.removed, errors: cleared.errors }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('netease:openSignInWindow', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: 'no_main_window' }
    }
    if (neteaseSignInWindow && !neteaseSignInWindow.isDestroyed()) {
      neteaseSignInWindow.focus()
      return { ok: true, reused: true }
    }
    neteaseSignInWindow = createSignInWindow('https://music.163.com/#/login', () => {
      neteaseSignInWindow = null
    })
    return { ok: true }
  })

  ipcMain.handle('netease:logout', async () => {
    try {
      const ses = await getMainWindowSession()
      const cleared = await clearSessionCookiesForDomains(ses, NETEASE_COOKIE_DOMAINS)
      updateDownloaderSettingsAuth({ neteaseCookie: '' })
      notifySignInStatusChanged()
      return { ok: true, removed: cleared.removed, errors: cleared.errors }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('qqMusic:openSignInWindow', async () => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: 'no_main_window' }
    }
    if (qqMusicSignInWindow && !qqMusicSignInWindow.isDestroyed()) {
      qqMusicSignInWindow.focus()
      return { ok: true, reused: true }
    }
    qqMusicSignInWindow = createSignInWindow('https://y.qq.com/', () => {
      qqMusicSignInWindow = null
    })
    return { ok: true }
  })

  ipcMain.handle('qqMusic:logout', async () => {
    try {
      const ses = await getMainWindowSession()
      const cleared = await clearSessionCookiesForDomains(ses, QQ_MUSIC_COOKIE_DOMAINS)
      updateDownloaderSettingsAuth({ qqMusicCookie: '' })
      notifySignInStatusChanged()
      return { ok: true, removed: cleared.removed, errors: cleared.errors }
    } catch (error) {
      return { ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('netease:getCookie', async (_, preferredCookie = '') => {
    return await resolveNeteaseAuthState(preferredCookie)
  })

  ipcMain.handle('qqMusic:getCookie', async (_, preferredCookie = '') => {
    return await resolveQqMusicAuthState(preferredCookie)
  })

  ipcMain.handle('signin:checkStatus', async () => {
    const ses = await getMainWindowSession()
    const ytCookies = await ses.cookies.get({ domain: '.youtube.com' })
    const ytSignedIn = ytCookies.some(
      (c) => c.name === 'SID' || c.name === 'SSID' || c.name === 'LOGIN_INFO'
    ) || existsSync(getInternalYoutubeCookieFile())
    const biliCookies = await ses.cookies.get({ domain: '.bilibili.com' })
    const biliSignedIn = biliCookies.some((c) => c.name === 'DedeUserID' || c.name === 'SESSDATA')
    const soundCloudCookies = await ses.cookies.get({ domain: '.soundcloud.com' })
    const soundCloudSignedIn =
      isSoundCloudCookieSignedIn(soundCloudCookies) || existsSync(getInternalSoundCloudCookieFile())
    const neteaseAuth = await resolveNeteaseAuthState()
    const neteaseSignedIn = neteaseAuth.valid === true
    const qqMusicAuth = await resolveQqMusicAuthState()
    const qqMusicSignedIn = qqMusicAuth.valid === true
    return {
      youtube: ytSignedIn,
      bilibili: biliSignedIn,
      soundcloud: soundCloudSignedIn,
      netease: neteaseSignedIn,
      qqMusic: qqMusicSignedIn
    }
  })

  // ─── Bilibili: 直接解析视频流地址（绕过嵌入播放器画质限制）───
  const BILI_QN_DESC = {
    6: '240P',
    16: '360P',
    32: '480P',
    64: '720P',
    80: '1080P',
    112: '1080P+',
    116: '1080P 60fps',
    120: '4K',
    127: '8K'
  }

  ipcMain.handle('bilibili:resolveStream', async (_, bvid, qualityId) => {
    if (isNetworkAccessDisabled()) return buildNetworkDisabledResult()
    const normalizedBvid = String(bvid || '').trim()
    const qn = qualityId || 80
    try {
      const ses = session.defaultSession
      const cookies = await ses.cookies.get({ domain: '.bilibili.com' })
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const authBucket = cookieStr ? 'auth' : 'anon'
      const cacheKey = `${normalizedBvid}::${qn}::${authBucket}`
      const cached = readTimedCache(biliStreamCache, cacheKey, BILI_STREAM_CACHE_TTL_MS)
      if (cached) {
        console.log(`[Bilibili Stream] cache hit: ${normalizedBvid} qn=${qn} (${authBucket})`)
        return cached
      }
      const pending = biliStreamPending.get(cacheKey)
      if (pending) {
        console.log(`[Bilibili Stream] awaiting in-flight request: ${normalizedBvid} qn=${qn}`)
        return pending
      }

      const startedAt = Date.now()
      const headers = {
        Cookie: cookieStr,
        Referer: 'https://www.bilibili.com/',
        'User-Agent': standardUA
      }

      const task = (async () => {
        const infoRes = await axios.get(
          `https://api.bilibili.com/x/web-interface/view?bvid=${normalizedBvid}`,
          { headers, timeout: 10000 }
        )
        const cid = infoRes.data?.data?.cid
        if (!cid) return { ok: false, error: 'no_cid' }

        const playRes = await axios.get(
          `https://api.bilibili.com/x/player/playurl?bvid=${normalizedBvid}&cid=${cid}&qn=${qn}&fnval=4048&fourk=1`,
          { headers, timeout: 10000 }
        )
        const d = playRes.data?.data
        if (!d) return { ok: false, error: 'no_play_data', code: playRes.data?.code }

        if (d.dash) {
          const videos = (d.dash.video || []).filter((v) => v.baseUrl || v.base_url)
          const audios = (d.dash.audio || []).filter((a) => a.baseUrl || a.base_url)
          const codecPriority = (c) => {
            if (!c) return 0
            if (c.startsWith('av01')) return 2
            if (c.startsWith('hev1') || c.startsWith('hvc1')) return 1
            return 0
          }
          videos.sort((a, b) => {
            if (b.id !== a.id) return b.id - a.id
            return codecPriority(b.codecs) - codecPriority(a.codecs)
          })
          audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
          const bestVideo = videos.find((v) => v.id <= qn) || videos[0]
          const bestAudio = audios[0]
          const actualQn = bestVideo?.id || qn
          const result = {
            ok: true,
            videoUrl: bestVideo?.baseUrl || bestVideo?.base_url,
            audioUrl: bestAudio?.baseUrl || bestAudio?.base_url,
            quality: actualQn,
            qualityDesc: BILI_QN_DESC[actualQn] || String(actualQn),
            format: 'dash',
            acceptQuality: d.accept_quality || []
          }
          console.log(
            `[Bilibili Stream] DASH: qn=${actualQn} (${BILI_QN_DESC[actualQn] || '?'}) | total=${Date.now() - startedAt}ms | cache=miss`
          )
          return writeTimedCache(biliStreamCache, cacheKey, result)
        }

        if (d.durl?.length > 0) {
          const actualQn = d.quality || qn
          const result = {
            ok: true,
            videoUrl: d.durl[0].url,
            audioUrl: null,
            quality: actualQn,
            qualityDesc: BILI_QN_DESC[actualQn] || String(actualQn),
            format: 'durl',
            acceptQuality: d.accept_quality || []
          }
          console.log(
            `[Bilibili Stream] durl: qn=${actualQn} (${BILI_QN_DESC[actualQn] || '?'}) | total=${Date.now() - startedAt}ms | cache=miss`
          )
          return writeTimedCache(biliStreamCache, cacheKey, result)
        }

        return { ok: false, error: 'no_stream_found' }
      })()

      biliStreamPending.set(cacheKey, task)
      return task.finally(() => {
        biliStreamPending.delete(cacheKey)
      })
    } catch (e) {
      console.error('[Bilibili Stream] Error:', e?.message || e)
      return { ok: false, error: e?.message || 'unknown' }
    }
  })

  // Native bridge: forward track-ended to renderer
  audioEngine.onTrackEnded(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:track-ended')
    }
  })

  // Gapless: notify renderer when track changes without interruption
  audioEngine.onGaplessTrackChanged((nextPath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:gapless-track-changed', nextPath)
    }
  })

  audioEngine.onAutomixTrackChanged((nextPath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:automix-track-changed', nextPath)
    }
  })

  ipcMain.handle('audio:setGapless', (_, enabled) => {
    audioEngine.setGapless(enabled)
  })

  ipcMain.handle('audio:prebufferNext', async (_, filePath) => {
    const resolvedPath = await resolveRemotePlaybackPath(filePath)
    audioEngine.prebufferNextTrack(resolvedPath)
  })

  ipcMain.handle('audio:cancelPrebuffer', () => {
    audioEngine._cancelPrebuffer()
  })

  ipcMain.handle('audio:startAutomixNext', async (_, filePath, options = {}) => {
    const resolvedPath = await resolveRemotePlaybackPath(filePath)
    return audioEngine.startAutomixNextTrack(resolvedPath, options || {})
  })

  ipcMain.handle('audio:cancelAutomix', () => {
    audioEngine.cancelAutomix()
    return { ok: true }
  })

  await createWindow()
  registerGlobalMediaShortcuts()
  pluginManager.setMainWindow(mainWindow)
  pluginManager.loadAll().catch((e) => {
    console.error('[PluginManager] loadAll failed:', e?.message || e)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((e) => {
        console.error('[Window] Failed to create window:', e?.message || e)
      })
    }
  })
})

app.on('before-quit', (event) => {
  isQuitting = true
  destroyTray()
  discordRpcQuitting = true
  clearRpcRetryTimer()
  const shouldWaitForRpcClear = !discordRpcQuitCleanupDone && !!rpcClient && rpcReady
  const rpcCleanup = disposeDiscordRpc()
  flushAppStateCacheSync()
  cleanupMiniPlayerWindow()
  cleanupLyricsDesktopWindow()
  stopRendererHttpServer().catch(() => {})
  stopWebDavProxyServer().catch(() => {})
  dlnaRenderer.stop().catch(() => {})
  airplayReceiver.stop().catch(() => {})
  upnpSender.shutdown().catch(() => {})
  phoneRemoteServer.stop().catch(() => {})
  libraryWatchManager?.stop()
  if (shouldWaitForRpcClear) {
    event.preventDefault()
    Promise.resolve(rpcCleanup).finally(() => {
      discordRpcQuitCleanupDone = true
      app.quit()
    })
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  flushAppStateCacheSync()
})

app.on('window-all-closed', () => {
  clearRpcRetryTimer()
  // 停止音频引擎
  audioEngine.stop()
  if (process.platform !== 'darwin') {
    app.quit()
    return
  }
  discordRpcQuitting = true
  void disposeDiscordRpc()
})
