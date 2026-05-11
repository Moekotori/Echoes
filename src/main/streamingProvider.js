import {
  fetchNeteaseDailyRecommendSongs,
  fetchNeteaseLrcText,
  getNeteaseSongDirectUrl,
  searchNeteaseSongs
} from './neteaseLyrics.js'
import { fetchNeteasePlaylistMeta, parseNeteasePlaylistId } from './neteasePlaylist.js'
import {
  getQqMusicPlaylistTracks,
  getQqMusicSongDirectUrl,
  resolveQqMusicPlaylistId,
  searchQqMusicSongs
} from './qqMusicProvider.js'
import { getQqLyricBySongMid } from './lyricsProviders.js'
import youtubedl from 'youtube-dl-exec'
import { spawn } from 'child_process'

const ytDlpBinaryPath = youtubedl.constants.YOUTUBE_DL_PATH.replace('app.asar', 'app.asar.unpacked')

const NATIVE_PROVIDERS = new Set(['netease', 'qqMusic', 'soundcloud'])
const MUSIC_PROVIDERS = new Set(['netease', 'qqMusic', 'soundcloud'])
const SOUNDCLOUD_SEARCH_LIMIT = 12
const SOUNDCLOUD_SEARCH_CACHE_TTL_MS = 8 * 60 * 1000
const SOUNDCLOUD_PLAYBACK_CACHE_TTL_MS = 12 * 60 * 1000
const soundCloudSearchCache = new Map()
const soundCloudPlaybackCache = new Map()

export const STREAMING_PROVIDERS = [
  { id: 'netease', label: '网易云音乐', shortLabel: 'NE', playbackMode: 'nativeStream' },
  { id: 'qqMusic', label: 'QQ 音乐', shortLabel: 'QQ', playbackMode: 'nativeStream' },
  { id: 'soundcloud', label: 'SoundCloud', shortLabel: 'SC', playbackMode: 'nativeStream' }
]

const NETEASE_LEVEL_LABELS = {
  standard: '128k MP3',
  higher: '192k MP3',
  exhigh: '320k MP3',
  lossless: 'FLAC',
  hires: 'Hi-Res'
}

function normalizeQualityMode(value) {
  return value === 'lossy' ? 'lossy' : 'lossless'
}

function getPlaybackQualityOptions(mode) {
  const normalized = normalizeQualityMode(mode)
  return normalized === 'lossy'
    ? { audioQualityMode: 'lossy', qualityPreset: 'high', neteaseLevel: 'exhigh' }
    : { audioQualityMode: 'lossless', qualityPreset: 'lossless', neteaseLevel: 'lossless' }
}

function normalizeProviderList(providers) {
  const requested = Array.isArray(providers) ? providers : []
  const ids = new Set(STREAMING_PROVIDERS.map((provider) => provider.id))
  const selected = requested.map((value) => String(value || '').trim()).filter((id) => ids.has(id))
  return selected.length > 0 ? selected : [...MUSIC_PROVIDERS]
}

function buildStreamingPath(provider, sourceId, raw = null, playbackOptions = {}) {
  const payload = JSON.stringify({
    provider,
    sourceId: String(sourceId || ''),
    raw,
    audioQualityMode: playbackOptions.audioQualityMode || '',
    qualityPreset: playbackOptions.qualityPreset || '',
    neteaseLevel: playbackOptions.neteaseLevel || ''
  })
  return `streaming://${encodeURIComponent(provider)}/track/${encodeURIComponent(payload)}`
}

export function parseStreamingTrackPath(value) {
  const raw = String(value || '')
  const match = raw.match(/^streaming:\/\/([^/]+)\/track\/(.+)$/i)
  if (!match) return null
  try {
    const provider = decodeURIComponent(match[1])
    const payload = JSON.parse(decodeURIComponent(match[2]))
    return {
      provider,
      sourceId: String(payload?.sourceId || ''),
      raw: payload?.raw || null,
      audioQualityMode: payload?.audioQualityMode || '',
      qualityPreset: payload?.qualityPreset || '',
      neteaseLevel: payload?.neteaseLevel || ''
    }
  } catch {
    return null
  }
}

export function isStreamingTrackPath(value) {
  return Boolean(parseStreamingTrackPath(value))
}

function formatArtists(value) {
  if (Array.isArray(value)) return value.map((item) => item?.name || item).filter(Boolean).join(' / ')
  return String(value || '').trim()
}

function bitrateLabel(br) {
  const bitrate = Number(br) || 0
  if (!bitrate) return ''
  if (bitrate >= 1000000) return `${Math.round(bitrate / 10000) / 100} Mbps`
  if (bitrate >= 1000) return `${Math.round(bitrate / 1000)}k`
  return `${bitrate}k`
}

function sampleRateLabel(sr, fallback = 0) {
  const rate = Number(sr || fallback || 0) || 0
  if (!rate) return ''
  if (rate >= 1000) return `${Math.round(rate / 100) / 10}kHz`
  return `${rate}Hz`
}

function formatResolvedQuality({ type, br, level } = {}) {
  const ext = String(type || '').trim().toUpperCase()
  const levelLabel = NETEASE_LEVEL_LABELS[level] || ''
  if (ext && ext !== 'MP3') return ext
  return bitrateLabel(br) || levelLabel || ext || ''
}

function pickQualityLabel(candidates, mode) {
  const available = candidates.filter((item) => item.available)
  if (available.length === 0) return { qualityLabel: '待解析', qualityRank: 0 }
  const lossless = available.find((item) => item.lossless)
  const lossy = available.find((item) => !item.lossless)
  const selected = normalizeQualityMode(mode) === 'lossy' ? (lossy || lossless || available[0]) : (lossless || lossy || available[0])
  return {
    qualityLabel: selected?.sampleRate ? `${selected.label} ${sampleRateLabel(selected.sampleRate)}` : selected?.label || '待解析',
    qualityRank: selected?.rank || 0
  }
}

function neteaseSearchQuality(song, mode) {
  const quality = song?.quality || {}
  const losslessCandidates = [
    { label: 'FLAC', available: Boolean(quality.sq), lossless: true, rank: 4, sampleRate: quality.sq?.sr },
    { label: 'Hi-Res', available: Boolean(quality.hr), lossless: true, rank: 5, sampleRate: quality.hr?.sr }
  ]
  return pickQualityLabel([
    ...losslessCandidates,
    { label: '320k MP3', available: Boolean(quality.h), lossless: false, rank: 3 },
    { label: '192k MP3', available: Boolean(quality.m), lossless: false, rank: 2 },
    { label: '128k MP3', available: Boolean(quality.l), lossless: false, rank: 1 }
  ], mode)
}

function qqSearchQuality(song, mode) {
  const quality = song?.quality || {}
  const file = quality.file || {}
  return pickQualityLabel([
    { label: 'Hi-Res', available: Number(quality.sizeHires || 0) > 0, lossless: true, rank: 5, sampleRate: file.hires_sample },
    { label: 'FLAC', available: Number(quality.sizeFlac || 0) > 0, lossless: true, rank: 4, sampleRate: 44100 },
    { label: 'APE', available: Number(quality.sizeApe || 0) > 0, lossless: true, rank: 4, sampleRate: 44100 },
    { label: '320k MP3', available: Number(quality.size320 || 0) > 0, lossless: false, rank: 3 },
    { label: '128k MP3', available: Number(quality.size128 || 0) > 0, lossless: false, rank: 1 }
  ], mode)
}

function normalizeNeteaseTrack(song, playbackOptions) {
  const id = String(song?.id || '')
  const durationMs = Number(song?.duration || song?.dt || 0) || 0
  const quality = neteaseSearchQuality(song, playbackOptions.audioQualityMode)
  return {
    id: `netease:${id}`,
    provider: 'netease',
    providerLabel: '网易云音乐',
    sourceId: id,
    path: buildStreamingPath('netease', id, song, playbackOptions),
    title: song?.name || 'Unknown Title',
    artist: formatArtists(song?.artists || song?.artist),
    album: song?.album || '',
    cover: song?.cover || '',
    duration: durationMs > 0 ? durationMs / 1000 : 0,
    ...playbackOptions,
    ...quality,
    playbackMode: 'nativeStream',
    canUseNativeAudio: true,
    canUseEq: true,
    controlled: false,
    raw: song
  }
}

function normalizeQqTrack(song, playbackOptions) {
  const id = String(song?.mid || song?.songMid || song?.id || '')
  const durationMs = Number(song?.duration || 0) || 0
  const quality = qqSearchQuality(song, playbackOptions.audioQualityMode)
  return {
    id: `qqMusic:${id}`,
    provider: 'qqMusic',
    providerLabel: 'QQ 音乐',
    sourceId: id,
    path: buildStreamingPath('qqMusic', id, song, playbackOptions),
    title: song?.name || 'Unknown Title',
    artist: formatArtists(song?.artists || song?.artist),
    album: song?.album || '',
    cover: song?.cover || '',
    duration: durationMs > 1000 ? durationMs / 1000 : durationMs,
    ...playbackOptions,
    ...quality,
    playbackMode: 'nativeStream',
    canUseNativeAudio: true,
    canUseEq: true,
    controlled: false,
    raw: song
  }
}

function getYtDlpJson(target, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpBinaryPath, [...args, target], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (chunk) => {
      out += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      err += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err || `yt-dlp exited with ${code}`))
        return
      }
      try {
        resolve(JSON.parse(out.trim()))
      } catch (error) {
        reject(new Error(`Failed to parse yt-dlp JSON: ${error?.message || error}`))
      }
    })
  })
}

function readTimedMapEntry(cache, key, ttlMs) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function pickQqTrackMid(track) {
  return String(
    track?.sourceId ||
      track?.mid ||
      track?.songmid ||
      track?.songMid ||
      track?.raw?.mid ||
      track?.raw?.songmid ||
      track?.raw?.songMid ||
      track?.raw?.id ||
      ''
  ).trim()
}

function writeTimedMapEntry(cache, key, value, maxEntries = 40) {
  cache.set(key, { time: Date.now(), value })
  if (cache.size <= maxEntries) return
  const oldestKey = cache.keys().next().value
  if (oldestKey) cache.delete(oldestKey)
}

function buildSoundCloudYtDlpArgs(cookieFile = '', options = {}) {
  const args = [
    '-J',
    '--no-warnings',
    '--skip-download',
    '--socket-timeout',
    '30',
    '--ignore-no-formats-error',
    '-f',
    'bestaudio/best'
  ]
  if (options.flatPlaylist) args.push('--flat-playlist')
  if (cookieFile) args.push('--cookies', cookieFile)
  return args
}

function pickSoundCloudEntryUrl(entry) {
  const webpageUrl = entry?.webpage_url || entry?.original_url || entry?.url || ''
  if (/^https?:\/\//i.test(webpageUrl)) return webpageUrl
  return ''
}

function normalizeSoundCloudTrack(entry, playbackOptions) {
  const sourceId = String(entry?.id || entry?.display_id || entry?.webpage_url || entry?.url || '')
  const webpageUrl = pickSoundCloudEntryUrl(entry)
  const title = entry?.title || entry?.fulltitle || 'SoundCloud Track'
  const artist = entry?.artist || entry?.uploader || entry?.creator || ''
  const cover = entry?.thumbnail || entry?.thumbnails?.find((item) => item?.url)?.url || ''
  const raw = {
    id: sourceId,
    webpageUrl,
    extractor: entry?.extractor || entry?.extractor_key || 'SoundCloud'
  }
  return {
    id: `soundcloud:${sourceId || webpageUrl}`,
    provider: 'soundcloud',
    providerLabel: 'SoundCloud',
    sourceId,
    webpageUrl,
    path: buildStreamingPath('soundcloud', sourceId || webpageUrl, raw, playbackOptions),
    title,
    artist,
    album: entry?.album || 'SoundCloud',
    cover,
    duration: Number(entry?.duration || 0) || 0,
    ...playbackOptions,
    qualityLabel: entry?.abr ? `${Math.round(Number(entry.abr))}k` : 'SoundCloud',
    qualityRank: 2,
    playbackMode: 'nativeStream',
    canUseNativeAudio: true,
    canUseEq: true,
    controlled: false,
    raw
  }
}

async function searchSoundCloudTracks(query, playbackOptions, cookieFile = '') {
  if (!cookieFile) {
    return {
      provider: 'soundcloud',
      ok: false,
      results: [],
      reason: 'auth_required',
      message: 'SoundCloud 需要先登录账号后再搜索。'
    }
  }
  const cacheKey = `${query.toLowerCase()}::${playbackOptions.audioQualityMode || ''}::${cookieFile}`
  const cached = readTimedMapEntry(soundCloudSearchCache, cacheKey, SOUNDCLOUD_SEARCH_CACHE_TTL_MS)
  if (cached) return cached

  const payload = await getYtDlpJson(
    `scsearch${SOUNDCLOUD_SEARCH_LIMIT}:${query}`,
    buildSoundCloudYtDlpArgs(cookieFile, { flatPlaylist: true })
  )
  const entries = Array.isArray(payload?.entries) ? payload.entries : []
  const result = {
    provider: 'soundcloud',
    ok: true,
    results: entries
      .filter((entry) => entry && (entry.id || entry.url || entry.webpage_url))
      .slice(0, SOUNDCLOUD_SEARCH_LIMIT)
      .map((entry) => normalizeSoundCloudTrack(entry, playbackOptions))
  }
  writeTimedMapEntry(soundCloudSearchCache, cacheKey, result)
  return result
}

function pickPlayableFormat(payload) {
  const formats = Array.isArray(payload?.formats) ? payload.formats : []
  const candidates = formats
    .filter((format) => /^https?:\/\//i.test(String(format?.url || '')))
    .map((format) => ({
      ...format,
      score:
        (format.vcodec === 'none' ? 10000 : 0) +
        (Number(format.abr || format.tbr || 0) || 0) +
        (/opus|aac|mp3|m4a/i.test(String(format.acodec || format.ext || '')) ? 100 : 0)
    }))
    .sort((a, b) => b.score - a.score)
  return candidates[0] || (/^https?:\/\//i.test(String(payload?.url || '')) ? payload : null)
}

async function resolveSoundCloudPlayback(track, cookieFile = '') {
  if (!cookieFile) {
    return {
      ok: false,
      provider: 'soundcloud',
      error: 'auth_required',
      message: 'SoundCloud 需要先登录账号。'
    }
  }
  const url = track?.webpageUrl || track?.raw?.webpageUrl || track?.raw?.webpage_url || track?.sourceId || ''
  if (!url) return { ok: false, provider: 'soundcloud', error: 'missing_url' }
  const cacheKey = `${url}::${cookieFile}`
  const cached = readTimedMapEntry(soundCloudPlaybackCache, cacheKey, SOUNDCLOUD_PLAYBACK_CACHE_TTL_MS)
  if (cached) return cached
  const payload = await getYtDlpJson(url, buildSoundCloudYtDlpArgs(cookieFile))
  const format = pickPlayableFormat(payload)
  if (!format?.url) return { ok: false, provider: 'soundcloud', error: 'no_native_stream' }
  const result = {
    ok: true,
    provider: 'soundcloud',
    playbackMode: 'nativeStream',
    url: format.url,
    type: format.ext || payload.ext || '',
    qualityLabel: format.abr ? `${Math.round(Number(format.abr))}k SoundCloud` : 'SoundCloud',
    headers: format.http_headers || payload.http_headers || {}
  }
  writeTimedMapEntry(soundCloudPlaybackCache, cacheKey, result)
  return result
}

export async function searchStreamingCatalog({
  query,
  providers,
  audioQualityMode = 'lossless',
  neteaseCookie = '',
  qqMusicCookie = '',
  soundCloudCookieFile = ''
} = {}) {
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) {
    return { ok: true, query: '', results: [], statuses: [] }
  }

  const playbackOptions = getPlaybackQualityOptions(audioQualityMode)
  const selectedProviders = normalizeProviderList(providers)
  const tasks = selectedProviders.map(async (provider) => {
    try {
      if (provider === 'netease') {
        const songs = await searchNeteaseSongs(normalizedQuery, { cookie: neteaseCookie })
        return {
          provider,
          ok: true,
          results: songs.slice(0, 20).map((song) => normalizeNeteaseTrack(song, playbackOptions))
        }
      }
      if (provider === 'qqMusic') {
        const songs = await searchQqMusicSongs(normalizedQuery, { cookie: qqMusicCookie, limit: 20 })
        return {
          provider,
          ok: true,
          results: songs.slice(0, 20).map((song) => normalizeQqTrack(song, playbackOptions))
        }
      }
      if (provider === 'soundcloud') {
        return await searchSoundCloudTracks(normalizedQuery, playbackOptions, soundCloudCookieFile)
      }
      return { provider, ok: false, results: [], message: 'unsupported_provider' }
    } catch (error) {
      return {
        provider,
        ok: false,
        results: [],
        message: error?.message || String(error)
      }
    }
  })

  const settled = await Promise.all(tasks)
  return {
    ok: true,
    query: normalizedQuery,
    providers: selectedProviders,
    audioQualityMode: playbackOptions.audioQualityMode,
    results: settled.flatMap((item) => item.results || []),
    statuses: settled.map(({ results, ...status }) => status)
  }
}

export async function fetchStreamingNeteaseDailyRecommendations({
  audioQualityMode = 'lossless',
  neteaseCookie = ''
} = {}) {
  const playbackOptions = getPlaybackQualityOptions(audioQualityMode)
  const songs = await fetchNeteaseDailyRecommendSongs({ cookie: neteaseCookie })
  return {
    ok: true,
    provider: 'netease',
    audioQualityMode: playbackOptions.audioQualityMode,
    results: songs.slice(0, 60).map((song) => normalizeNeteaseTrack(song, playbackOptions))
  }
}

export async function fetchStreamingPlaylist({
  provider,
  playlistInput,
  audioQualityMode = 'lossless',
  neteaseCookie = '',
  qqMusicCookie = ''
} = {}) {
  const normalizedProvider = provider === 'qqMusic' ? 'qqMusic' : 'netease'
  const playbackOptions = getPlaybackQualityOptions(audioQualityMode)
  const rawInput = String(playlistInput || '').trim()
  if (!rawInput) return { ok: false, provider: normalizedProvider, error: 'missing_playlist_link', results: [] }

  if (normalizedProvider === 'qqMusic') {
    const playlistId = await resolveQqMusicPlaylistId(rawInput, { cookie: qqMusicCookie })
    if (!playlistId) return { ok: false, provider: normalizedProvider, error: 'invalid_playlist_link', results: [] }
    const meta = await getQqMusicPlaylistTracks({
      playlistId,
      cookie: qqMusicCookie
    })
    return {
      ok: true,
      provider: normalizedProvider,
      playlistName: meta.name || 'QQ Music Playlist',
      audioQualityMode: playbackOptions.audioQualityMode,
      results: (meta.tracks || []).map((song) => normalizeQqTrack(song, playbackOptions))
    }
  }

  const playlistId = parseNeteasePlaylistId(rawInput)
  if (!playlistId) return { ok: false, provider: normalizedProvider, error: 'invalid_playlist_link', results: [] }
  const meta = await fetchNeteasePlaylistMeta(playlistId, { cookie: neteaseCookie })
  return {
    ok: true,
    provider: normalizedProvider,
    playlistName: meta.name || 'NetEase Playlist',
    audioQualityMode: playbackOptions.audioQualityMode,
    results: (meta.tracks || []).map((song) => normalizeNeteaseTrack(song, playbackOptions))
  }
}

export async function resolveStreamingPlayback({
  track,
  neteaseCookie = '',
  qqMusicCookie = '',
  qualityPreset = 'auto',
  neteaseLevel = 'exhigh',
  soundCloudCookieFile = ''
} = {}) {
  const provider = String(track?.provider || '').trim()
  if (!provider) return { ok: false, error: 'missing_provider' }

  const effectiveQualityPreset = track?.qualityPreset || qualityPreset || 'auto'
  const effectiveNeteaseLevel = track?.neteaseLevel || neteaseLevel || 'exhigh'

  if (NATIVE_PROVIDERS.has(provider)) {
    if (provider === 'netease') {
      const sourceId = track?.sourceId || track?.id?.replace(/^netease:/, '')
      const direct = await getNeteaseSongDirectUrl(sourceId, effectiveNeteaseLevel, { cookie: neteaseCookie })
      if (!direct?.url) return { ok: false, provider, error: 'no_native_stream' }
      return {
        ok: true,
        provider,
        playbackMode: 'nativeStream',
        url: direct.url,
        type: direct.type || direct.ext || '',
        qualityLabel:
          formatResolvedQuality({ type: direct.type || direct.ext, br: direct.br, level: direct.level }) ||
          '网易云音质',
        headers: direct.headers || {}
      }
    }

    if (provider === 'qqMusic') {
      const direct = await getQqMusicSongDirectUrl(track?.raw || track, {
        qualityPreset: effectiveQualityPreset,
        cookie: qqMusicCookie
      })
      if (!direct?.url) return { ok: false, provider, error: 'no_native_stream' }
      return {
        ok: true,
        provider,
        playbackMode: 'nativeStream',
        url: direct.url,
        type: direct.type || direct.ext || '',
        qualityLabel: direct.qualityLabel || 'QQ 音乐音质',
        headers: direct.headers || {}
      }
    }

    if (provider === 'soundcloud') {
      return await resolveSoundCloudPlayback(track, soundCloudCookieFile)
    }
  }

  return { ok: false, provider, error: 'unsupported_provider' }
}

export async function fetchStreamingLyrics({
  track,
  neteaseCookie = '',
  qqMusicCookie = ''
} = {}) {
  const provider = String(track?.provider || '').trim()
  if (!provider) return { ok: false, provider: '', lrc: '', error: 'missing_provider' }

  if (provider === 'netease') {
    const sourceId = track?.sourceId || track?.id?.replace(/^netease:/, '')
    const result = await fetchNeteaseLrcText({
      songId: sourceId,
      keywords: [track?.title || track?.name, track?.artist].filter(Boolean).join(' '),
      durationSec: Number(track?.duration || 0) || undefined,
      cookie: neteaseCookie
    })
    return {
      ok: Boolean(result?.lrc),
      provider,
      source: 'netease',
      lrc: result?.lrc || '',
      confidence: result?.confidence ?? null,
      song: result?.song || null
    }
  }

  if (provider === 'qqMusic') {
    const sourceId = pickQqTrackMid(track)
    const hit = await getQqLyricBySongMid({
      songmid: sourceId,
      trackName: track?.title || track?.name || '',
      artistName: track?.artist || '',
      albumName: track?.album || '',
      durationSec: Number(track?.duration || 0) || undefined,
      qqMusicCookie
    })
    const lrc = hit?.syncedLyrics || hit?.plainLyrics || ''
    return {
      ok: Boolean(lrc),
      provider,
      source: 'qq',
      lrc,
      providerId: sourceId,
      item: hit
    }
  }

  return {
    ok: false,
    provider,
    lrc: '',
    error: provider === 'soundcloud' ? 'provider_lyrics_unavailable' : 'unsupported_provider'
  }
}
