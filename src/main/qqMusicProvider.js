import axios from 'axios'
import {
  buildQqMusicDownloadHeaders,
  buildQqMusicHeaders,
  getQqMusicUin
} from './qqMusicAuth.js'

const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const QQ_STREAM_HOST = 'https://dl.stream.qqmusic.qq.com/'
const QQ_PLAYLIST_PAGE_SIZE = 1000
const QQ_PLAYLIST_PAGE_CONCURRENCY = 4

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await mapper(items[index], index)
      }
    })
  )

  return results
}

function joinArtists(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => item?.name || item?.singer_name || item?.title || '')
    .filter(Boolean)
    .join(' / ')
}

function pickQqCover(song, albumMid) {
  const direct = pickString(
    song?.cover,
    song?.coverUrl,
    song?.picUrl,
    song?.album?.picUrl,
    song?.album?.cover,
    song?.album?.coverUrl
  )
  if (direct) return direct
  return albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : ''
}

function normalizeSong(song) {
  const mid = pickString(song?.mid, song?.songmid, song?.songMid)
  const file = song?.file || {}
  const mediaMid = pickString(file?.media_mid, file?.mediaMid, song?.media_mid, song?.mediaMid, mid)
  const album = song?.album || {}
  const albumMid = pickString(
    album?.mid,
    album?.pmid,
    album?.albumMid,
    album?.albumMID,
    album?.albummid,
    song?.albummid,
    song?.albumMid,
    song?.albumMID
  )
  const cover = pickQqCover(song, albumMid)
  return {
    id: mid || String(song?.id || song?.songid || ''),
    mid,
    mediaMid,
    name: pickString(song?.name, song?.songname, song?.title),
    artists: joinArtists(song?.singer || song?.singers),
    artist: joinArtists(song?.singer || song?.singers),
    album: pickString(album?.name, song?.albumname, song?.albumName),
    albumMid,
    cover,
    duration: Number(song?.interval || song?.duration || 0) * 1000,
    fee: 0,
    quality: {
      size128: Number(file?.size_128mp3 || file?.size128 || 0) || 0,
      size320: Number(file?.size_320mp3 || file?.size320 || 0) || 0,
      sizeFlac: Number(file?.size_flac || file?.sizeFlac || 0) || 0,
      sizeApe: Number(file?.size_ape || file?.sizeApe || 0) || 0,
      sizeHires: Number(file?.size_hires || file?.sizeHiRes || file?.size_hires_sample || 0) || 0,
      sizeDolby: Number(file?.size_dolby || file?.sizeDolby || 0) || 0,
      pay: song?.pay || null,
      file
    },
    source: 'qq'
  }
}

function normalizeAlbum(album) {
  const albumMid = pickString(album?.albumMID, album?.albummid, album?.mid, album?.albumMid)
  const albumId = album?.albumID || album?.albumid || album?.id || albumMid
  return {
    id: albumMid || String(albumId || ''),
    albumMid,
    albumId,
    name: pickString(album?.albumName, album?.albumname, album?.name),
    artist: pickString(album?.singerName, album?.singername, album?.singer),
    picUrl: albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    size: Number(album?.song_count || album?.songCount || album?.count || 0),
    source: 'qq'
  }
}

function normalizeArtist(artist) {
  const mid = pickString(
    artist?.singerMID,
    artist?.singerMid,
    artist?.singer_mid,
    artist?.mid,
    artist?.singerMID
  )
  const id = artist?.singerID || artist?.singerId || artist?.id || mid
  const name = pickString(
    artist?.singerName,
    artist?.singer_name,
    artist?.name,
    artist?.title
  )
  return {
    id: mid || String(id || ''),
    mid,
    name,
    alias: [],
    picUrl: mid ? `https://y.qq.com/music/photo_new/T001R500x500M000${mid}.jpg` : '',
    albumSize: Number(artist?.albumNum || artist?.album_num || artist?.album_count || 0),
    musicSize: Number(artist?.songNum || artist?.song_num || artist?.song_count || 0),
    source: 'qq'
  }
}

export function parseQqMusicPlaylistId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return raw
  const direct = /(?:[?&](?:id|tid|disstid|dirid)=|\/playlist\/)(\d+)/i.exec(raw)
  if (direct) return direct[1]
  try {
    const normalized = raw.includes('://') ? raw : `https://${raw}`
    const url = new URL(normalized)
    const queryId =
      url.searchParams.get('id') ||
      url.searchParams.get('tid') ||
      url.searchParams.get('disstid') ||
      url.searchParams.get('dirid')
    if (queryId && /^\d+$/.test(queryId)) return queryId
    const pathMatch = url.pathname.match(/(?:playlist|taoge|details\/taoge)(?:\.html)?\/?(\d+)/i)
    if (pathMatch) return pathMatch[1]
  } catch {
    // fall through
  }
  const loose = /\b(\d{5,})\b/.exec(raw)
  return loose ? loose[1] : ''
}

export async function resolveQqMusicPlaylistId(input, { cookie = '' } = {}) {
  const direct = parseQqMusicPlaylistId(input)
  if (direct) return direct

  const raw = String(input || '').trim()
  if (!raw) return ''
  let url
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return ''
  }
  if (!/(^|\.)qq\.com$/i.test(url.hostname)) return ''

  const response = await axios.get(url.toString(), {
    headers: buildQqMusicHeaders(cookie),
    maxRedirects: 0,
    timeout: 12000,
    validateStatus: (status) => status >= 200 && status < 400
  })
  const location = response?.headers?.location
  if (location) {
    return parseQqMusicPlaylistId(new URL(location, url).toString())
  }
  const finalUrl = response?.request?.res?.responseUrl || response?.request?.responseURL || ''
  return parseQqMusicPlaylistId(finalUrl)
}

async function requestMusicu(payload, cookie) {
  const res = await axios.post(QQ_MUSICU_URL, payload, {
    params: { format: 'json', inCharset: 'utf8', outCharset: 'utf-8' },
    headers: buildQqMusicHeaders(cookie),
    timeout: 12000
  })
  return res?.data || {}
}

async function getMusicu(payload, cookie) {
  try {
    const res = await axios.get(QQ_MUSICU_URL, {
      params: { data: JSON.stringify(payload) },
      headers: buildQqMusicHeaders(cookie),
      timeout: 12000
    })
    return res?.data || {}
  } catch (error) {
    if (cookie && error?.response?.status >= 500) {
      const res = await axios.get(QQ_MUSICU_URL, {
        params: { data: JSON.stringify(payload) },
        headers: buildQqMusicHeaders(''),
        timeout: 12000
      })
      return res?.data || {}
    }
    throw error
  }
}

function buildSearchPayload(query, searchType, limit) {
  return {
    comm: {
      g_tk: 5381,
      uin: '0',
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'h5',
      needNewCode: 1,
      ct: 23,
      cv: 0
    },
    req_0: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: {
        remoteplace: 'txt.mqq.all',
        searchid: String(Date.now()),
        search_type: searchType,
        query,
        page_num: 1,
        num_per_page: limit
      }
    }
  }
}

export async function searchQqMusicSongs(keywords, { cookie = '', limit = 20 } = {}) {
  const key = String(keywords || '').trim()
  if (!key) return []
  try {
    const data = await getMusicu(buildSearchPayload(key, 0, limit), cookie)
    const list = data?.req_0?.data?.body?.song?.list || []
    return list.map(normalizeSong).filter((song) => song.mid)
  } catch (error) {
    const message = error?.response?.status
      ? `QQ Music search failed: HTTP ${error.response.status}`
      : error?.message || 'QQ Music search failed'
    throw new Error(message)
  }
}

export async function searchQqMusicAlbums({ albumName = '', artist = '', cookie = '' } = {}) {
  const key = `${albumName || ''} ${artist || ''}`.trim()
  if (!key) return []
  try {
    const data = await getMusicu(buildSearchPayload(key, 2, 8), cookie)
    const list = data?.req_0?.data?.body?.album?.list || []
    return list.map(normalizeAlbum).filter((album) => album.id)
  } catch (error) {
    const message = error?.response?.status
      ? `QQ Music album search failed: HTTP ${error.response.status}`
      : error?.message || 'QQ Music album search failed'
    throw new Error(message)
  }
}

export async function searchQqMusicArtists({ artist = '', cookie = '', limit = 8 } = {}) {
  const key = String(artist || '').trim()
  if (!key) return []
  try {
    const data = await getMusicu(buildSearchPayload(key, 1, limit), cookie)
    const list =
      data?.req_0?.data?.body?.singer?.list ||
      data?.req_0?.data?.body?.singerList ||
      data?.req_0?.data?.body?.zhida?.singer ||
      []
    const normalized = Array.isArray(list) ? list.map(normalizeArtist).filter((item) => item.id) : []
    return normalized
  } catch (error) {
    const message = error?.response?.status
      ? `QQ Music artist search failed: HTTP ${error.response.status}`
      : error?.message || 'QQ Music artist search failed'
    throw new Error(message)
  }
}

export async function getQqMusicAlbumTracks({ albumMid = '', albumId = '', cookie = '' } = {}) {
  const payload = {
    req_0: {
      module: 'music.musichallAlbum.AlbumSongList',
      method: 'GetAlbumSongList',
      param: {
        albumMid,
        albumID: Number(albumId || 0),
        begin: 0,
        num: 200,
        order: 2
      }
    },
    comm: {
      ct: 24,
      cv: 0
    }
  }
  const data = await requestMusicu(payload, cookie)
  const list = data?.req_0?.data?.songList || data?.req_0?.data?.songlist || []
  return list
    .map((item) => normalizeSong(item?.songInfo || item))
    .filter((song) => song.mid)
}

function getQqPlaylistSongList(body) {
  return body.songlist || body.songList || body.cdlist?.[0]?.songlist || []
}

function getQqPlaylistName(body) {
  return (
    pickString(
      body.dissname,
      body.dirinfo?.title,
      body.dirinfo?.dissname,
      body.cdlist?.[0]?.dissname
    ) || 'QQ Music Playlist'
  )
}

function getQqPlaylistTotal(body, fallback = 0) {
  return pickNumber(
    body.total_song_num,
    body.songnum,
    body.song_num,
    body.songCount,
    body.song_count,
    body.total,
    body.dirinfo?.songnum,
    body.dirinfo?.song_num,
    body.dirinfo?.songCount,
    body.dirinfo?.song_count,
    body.dirinfo?.total,
    body.cdlist?.[0]?.total_song_num,
    body.cdlist?.[0]?.songnum,
    body.cdlist?.[0]?.song_num,
    body.cdlist?.[0]?.songCount,
    body.cdlist?.[0]?.song_count,
    body.cdlist?.[0]?.total,
    fallback
  )
}

async function getQqMusicPlaylistPage({ disstid, cookie, begin = 0, num = QQ_PLAYLIST_PAGE_SIZE }) {
  const playlistId = String(disstid || '').trim()
  if (!/^\d+$/.test(playlistId)) {
    throw new Error('Invalid QQ Music playlist URL or ID')
  }
  const payload = {
    req_0: {
      module: 'music.srfDissInfo.DissInfo',
      method: 'CgiGetDiss',
      param: {
        disstid: playlistId,
        dirid: Number(playlistId),
        tag: 1,
        userinfo: 1,
        song_begin: Math.max(0, Math.floor(Number(begin) || 0)),
        song_num: Math.max(1, Math.min(Math.floor(Number(num) || QQ_PLAYLIST_PAGE_SIZE), QQ_PLAYLIST_PAGE_SIZE))
      }
    },
    comm: {
      ct: 24,
      cv: 0
    }
  }
  const data = await requestMusicu(payload, cookie)
  const body = data?.req_0?.data || {}
  const songlist = getQqPlaylistSongList(body)
  return {
    name: getQqPlaylistName(body),
    total: getQqPlaylistTotal(body, songlist.length),
    tracks: songlist
      .map((item) => normalizeSong(item?.songInfo || item))
      .filter((song) => song.mid)
  }
}

export async function getQqMusicPlaylistTracks({ playlistId = '', cookie = '', limit = Infinity } = {}) {
  const disstid = String(playlistId || '').trim()
  if (!/^\d+$/.test(disstid)) {
    throw new Error('Invalid QQ Music playlist URL or ID')
  }

  const maxTracks = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : Infinity
  const firstPageSize = Math.min(QQ_PLAYLIST_PAGE_SIZE, maxTracks)
  const firstPage = await getQqMusicPlaylistPage({
    disstid,
    cookie,
    begin: 0,
    num: firstPageSize
  })
  const tracks = [...firstPage.tracks]
  const reportedTotal = Math.min(getQqPlaylistTotal(firstPage, tracks.length), maxTracks)

  if (reportedTotal > tracks.length) {
    const pageStarts = []
    for (let begin = QQ_PLAYLIST_PAGE_SIZE; begin < reportedTotal; begin += QQ_PLAYLIST_PAGE_SIZE) {
      pageStarts.push(begin)
    }
    const pages = await mapWithConcurrency(
      pageStarts,
      QQ_PLAYLIST_PAGE_CONCURRENCY,
      (begin) =>
        getQqMusicPlaylistPage({
          disstid,
          cookie,
          begin,
          num: Math.min(QQ_PLAYLIST_PAGE_SIZE, reportedTotal - begin)
        })
    )
    for (const page of pages) tracks.push(...page.tracks)
  } else if (tracks.length >= QQ_PLAYLIST_PAGE_SIZE && maxTracks > tracks.length) {
    let begin = QQ_PLAYLIST_PAGE_SIZE
    let shouldContinue = true
    while (shouldContinue && tracks.length < maxTracks) {
      const pageStarts = []
      for (
        let i = 0;
        i < QQ_PLAYLIST_PAGE_CONCURRENCY && begin + i * QQ_PLAYLIST_PAGE_SIZE < maxTracks;
        i++
      ) {
        pageStarts.push(begin + i * QQ_PLAYLIST_PAGE_SIZE)
      }
      const pages = await mapWithConcurrency(pageStarts, QQ_PLAYLIST_PAGE_CONCURRENCY, (start) =>
        getQqMusicPlaylistPage({
          disstid,
          cookie,
          begin: start,
          num: Math.min(QQ_PLAYLIST_PAGE_SIZE, maxTracks - start)
        })
      )
      for (const page of pages) tracks.push(...page.tracks)
      shouldContinue = pages.every((page) => page.tracks.length >= QQ_PLAYLIST_PAGE_SIZE)
      begin += pageStarts.length * QQ_PLAYLIST_PAGE_SIZE
    }
  }

  return {
    name: firstPage.name,
    tracks: tracks.slice(0, maxTracks)
  }
}

function buildQualityCandidates(preset, mediaMid) {
  const all = [
    { quality: 'flac', filename: `F000${mediaMid}.flac`, ext: 'flac', label: 'FLAC' },
    { quality: 'ape', filename: `A000${mediaMid}.ape`, ext: 'ape', label: 'APE' },
    { quality: '320', filename: `M800${mediaMid}.mp3`, ext: 'mp3', label: '320k MP3' },
    { quality: '128', filename: `M500${mediaMid}.mp3`, ext: 'mp3', label: '128k MP3' },
    { quality: 'm4a', filename: `C400${mediaMid}.m4a`, ext: 'm4a', label: 'M4A' }
  ]
  const p = String(preset || 'auto').toLowerCase()
  if (p === 'lossless' || p === 'auto') return all
  if (p === 'high') return all.filter((item) => ['320', '128', 'm4a'].includes(item.quality))
  if (p === 'medium') return all.filter((item) => ['128', 'm4a'].includes(item.quality))
  if (p === 'low') return all.filter((item) => ['m4a', '128'].includes(item.quality))
  return all
}

export async function getQqMusicSongDirectUrl(
  song,
  { qualityPreset = 'auto', cookie = '' } = {}
) {
  const songMid = pickString(song?.mid, song?.songMid, song?.songmid, song?.id)
  const mediaMid = pickString(song?.mediaMid, song?.media_mid, song?.file?.media_mid, songMid)
  if (!songMid || !mediaMid) return null

  const uin = getQqMusicUin(cookie)
  const candidates = buildQualityCandidates(qualityPreset, mediaMid)
  for (const candidate of candidates) {
    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: '10000',
          songmid: [songMid],
          songtype: [0],
          uin,
          loginflag: 1,
          platform: '20',
          filename: [candidate.filename]
        }
      },
      comm: {
        uin,
        format: 'json',
        ct: 24,
        cv: 0
      }
    }
    const data = await requestMusicu(payload, cookie)
    const info = data?.req_0?.data?.midurlinfo?.[0]
    const purl = info?.purl
    if (!purl) continue
    const host = data?.req_0?.data?.sip?.[0] || QQ_STREAM_HOST
    const degraded =
      String(qualityPreset || '').toLowerCase() === 'lossless' &&
      !['flac', 'ape'].includes(candidate.quality)
    return {
      url: `${host}${purl}`,
      ext: candidate.ext,
      type: candidate.ext,
      quality: candidate.quality,
      qualityLabel: candidate.label,
      degraded,
      headers: buildQqMusicDownloadHeaders(cookie)
    }
  }

  return null
}
