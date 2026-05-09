import { createRequire } from 'module'
import fs from 'fs'
import { join } from 'path'
import MediaDownloader from './MediaDownloader.js'
import { buildNcmRequestOptions, buildNeteaseHeaderArgs } from './neteaseAuth.js'

const require = createRequire(import.meta.url)

function getNcmApi() {
  return require('@neteasecloudmusicapienhanced/api')
}

function formatNcmError(err) {
  if (!err || typeof err !== 'object') return String(err)
  const msg = err.body?.msg || err.body?.message
  if (msg) return String(msg)
  if (err.status && err.status !== 200) return `Request failed (HTTP ${err.status})`
  return 'NetEase Cloud Music API request failed'
}

const NETEASE_SONG_DETAIL_BATCH_SIZE = 500

function normalizeNeteaseTrackIds(trackIds = []) {
  if (!Array.isArray(trackIds)) return []
  return trackIds
    .map((item) => item?.id ?? item)
    .map((id) => String(id || '').trim())
    .filter((id) => /^\d+$/.test(id))
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function fetchNeteaseSongsByTrackIds(ncm, trackIds, base = {}) {
  const orderedIds = normalizeNeteaseTrackIds(trackIds)
  if (orderedIds.length === 0) return []

  const uniqueIds = [...new Set(orderedIds)]
  const songById = new Map()

  for (const batch of chunkArray(uniqueIds, NETEASE_SONG_DETAIL_BATCH_SIZE)) {
    const result = await ncm.song_detail({
      ids: batch.join(','),
      ...base
    })
    for (const song of result.body?.songs || []) {
      const id = String(song?.id || '').trim()
      if (id) songById.set(id, song)
    }
  }

  return orderedIds.map((id) => songById.get(id)).filter(Boolean)
}

export function parseNeteasePlaylistId(input) {
  if (input == null) return null
  const s = String(input).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return s
  try {
    const normalized = s.includes('://') ? s : `https://${s}`
    const u = new URL(normalized)
    const directId = u.searchParams.get('id')
    if (directId && /^\d+$/.test(directId)) return directId
    const pathMatch = u.pathname.match(/\/playlist\/(\d+)/)
    if (pathMatch) return pathMatch[1]
    if (u.hash) {
      const hashQuery = u.hash.includes('?') ? u.hash.slice(u.hash.indexOf('?') + 1) : ''
      const q = new URLSearchParams(hashQuery)
      const hashId = q.get('id')
      if (hashId && /^\d+$/.test(hashId)) return hashId
    }
  } catch {
    // fall through
  }
  const m = /[?&]id=(\d+)/.exec(s)
  return m ? m[1] : null
}

export async function fetchNeteasePlaylistMeta(playlistId, opts = {}) {
  const ncm = getNcmApi()
  const base = buildNcmRequestOptions(opts.cookie)

  let detail
  try {
    detail = await ncm.playlist_detail({
      id: playlistId,
      ...base
    })
  } catch (err) {
    throw new Error(formatNcmError(err))
  }

  const playlist = detail.body?.playlist
  if (!playlist) {
    throw new Error(
      'Playlist not found or inaccessible (private or removed; try signing in to NetEase again).'
    )
  }

  const name = playlist.name || 'NetEase Playlist'

  let songs = []
  try {
    songs = await fetchNeteaseSongsByTrackIds(ncm, playlist.trackIds, base)
    if (songs.length === 0) songs = playlist.tracks || []
  } catch (err) {
    songs = playlist.tracks || []
    if (songs.length === 0) {
      throw new Error(formatNcmError(err))
    }
  }

  const tracks = songs.map((track) => {
    const album = track.al || track.album || {}
    return {
      id: track.id,
      name: (track.name && String(track.name).trim()) || 'Unknown',
      artists: (track.ar || track.artists || [])
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(', '),
      album: album.name || '',
      cover: album.picUrl || album.cover || album.coverUrl || track.picUrl || track.cover || null,
      duration: track.dt || track.duration || 0,
      fee: track.fee || 0,
      quality: {
        l: track.l || null,
        m: track.m || null,
        h: track.h || null,
        sq: track.sq || null,
        hr: track.hr || null,
        privilege: track.privilege || null
      }
    }
  })

  return { name, tracks }
}

function ytDlpExtraArgs() {
  const fromEnv = process.env.ECHOES_YTDLP_EXTRA
    ? process.env.ECHOES_YTDLP_EXTRA.split(/\s+/).filter(Boolean)
    : []
  const geo = process.env.ECHOES_NETEASE_NO_GEO === '1' ? [] : ['--geo-bypass-country', 'CN']
  return [...geo, ...fromEnv]
}

function sanitizeFolderName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned || 'Imported playlist'
}

function ensurePlaylistFolder(baseDir, folderName) {
  const resolved = join(baseDir, sanitizeFolderName(folderName))
  fs.mkdirSync(resolved, { recursive: true })
  return resolved
}

export function buildNeteaseTrackFilename(track) {
  const title = String(track?.name || track?.title || '').trim()
  return title || `netease-${track?.id || 'track'}`
}

export async function importNeteasePlaylist(
  playlistInput,
  downloadFolder,
  eventSender,
  preferredFolderName = null,
  opts = {}
) {
  const playlistId = parseNeteasePlaylistId(playlistInput)
  if (!playlistId) {
    throw new Error('Invalid playlist URL or ID')
  }
  if (!downloadFolder || !fs.existsSync(downloadFolder)) {
    throw new Error('Invalid save folder; choose a valid directory in Settings.')
  }

  const meta = await fetchNeteasePlaylistMeta(playlistId, opts)
  const targetFolder = ensurePlaylistFolder(downloadFolder, preferredFolderName || meta.name)
  const total = meta.tracks.length

  eventSender.send('playlist-link:import-progress', {
    phase: 'meta',
    playlistName: meta.name,
    total
  })

  if (total === 0) {
    return { playlistName: meta.name, added: [], failed: [] }
  }

  const extraArgs = [...buildNeteaseHeaderArgs(opts.cookie), ...ytDlpExtraArgs()]
  const added = []
  const failed = []

  for (let i = 0; i < meta.tracks.length; i++) {
    const track = meta.tracks[i]
    const songUrl = `https://music.163.com/song?id=${track.id}`

    eventSender.send('playlist-link:import-progress', {
      phase: 'download',
      current: i + 1,
      total,
      trackName: track.name,
      artists: track.artists
    })

    const basename = buildNeteaseTrackFilename(track)
    try {
      const downloadedPath = await MediaDownloader.downloadAudioWithBasename(
        songUrl,
        targetFolder,
        basename,
        eventSender,
        { extraArgs, quickMode: opts.quickMode === true }
      )
      const filePath = MediaDownloader.renameDownloadedMedia(
        downloadedPath,
        buildNeteaseTrackFilename(track)
      )
      const item = { path: filePath, trackTitle: track.name, sourceUrl: songUrl }
      added.push(item)
      eventSender.send('playlist-link:import-progress', {
        phase: 'added',
        playlistName: meta.name,
        ...item
      })
    } catch (error) {
      failed.push({
        name: track.name,
        error: error.message || String(error)
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return {
    playlistName: meta.name,
    added,
    failed
  }
}
