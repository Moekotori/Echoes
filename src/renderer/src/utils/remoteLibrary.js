export function isSubsonicTrackPath(value) {
  return /^subsonic:\/\/[^/]+\/song\/.+/i.test(String(value || ''))
}

export function isNetworkFolderTrackPath(value) {
  return /^network-folder:\/\/[^/]+\/file\/.+/i.test(String(value || ''))
}

export function isWebDavTrackPath(value) {
  return /^webdav:\/\/[^/]+\/file\/.+/i.test(String(value || ''))
}

export function isJellyfinTrackPath(value) {
  return /^(jellyfin|emby):\/\/[^/]+\/audio\/.+/i.test(String(value || ''))
}

export function isStreamingTrackPath(value) {
  return /^streaming:\/\/[^/]+\/track\/.+/i.test(String(value || ''))
}

export function parseStreamingTrackPath(value) {
  const raw = String(value || '')
  const match = raw.match(/^streaming:\/\/([^/]+)\/track\/(.+)$/i)
  if (!match) return null
  try {
    const provider = decodeURIComponent(match[1])
    const payload = JSON.parse(decodeURIComponentSafe(match[2]))
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

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return String(value || '')
  }
}

function formatStreamingArtists(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item?.name || item)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(' / ')
  }
  return String(value || '').trim()
}

function formatStreamingAlbum(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  return String(value.name || value.title || value.albumName || '').trim()
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeStreamingDuration(value) {
  const duration = Number(value || 0)
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return duration > 1000 ? duration / 1000 : duration
}

export function isRemoteTrackPath(value) {
  return (
    isSubsonicTrackPath(value) ||
    isNetworkFolderTrackPath(value) ||
    isWebDavTrackPath(value) ||
    isJellyfinTrackPath(value) ||
    isStreamingTrackPath(value)
  )
}

export function formatRemoteDuration(seconds) {
  const total = Number(seconds || 0)
  if (!Number.isFinite(total) || total <= 0) return '--:--'
  const minutes = Math.floor(total / 60)
  const secs = Math.floor(total % 60)
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function buildRemoteTrackMeta(track) {
  const info = track?.info || {}
  const remoteType = track?.remoteType || info.remoteType || 'subsonic'
  const streamingPayload = remoteType === 'streaming' ? parseStreamingTrackPath(track?.path) : null
  const streamingRaw = streamingPayload?.raw || {}
  const streamingArtist = formatStreamingArtists(streamingRaw.artists || streamingRaw.artist)
  const streamingAlbum = formatStreamingAlbum(streamingRaw.album)
  const streamingCover = pickFirstString(
    streamingRaw.cover,
    streamingRaw.coverUrl,
    streamingRaw.picUrl,
    streamingRaw.album?.picUrl,
    streamingRaw.album?.cover,
    streamingRaw.album?.coverUrl
  )
  const completeServerMeta = remoteType === 'subsonic' || remoteType === 'jellyfin' || remoteType === 'emby'
  return {
    title: track?.title || info.title || streamingRaw.name || streamingRaw.title || track?.name || 'Unknown Title',
    artist: track?.artist || info.artist || streamingArtist || 'Unknown Artist',
    album: track?.album || info.album || streamingAlbum || '',
    cover: info.cover || track?.cover || streamingCover || '',
    coverChecked: completeServerMeta,
    duration:
      Number(track?.duration || info.duration || 0) ||
      normalizeStreamingDuration(streamingRaw.duration || streamingRaw.dt) ||
      undefined,
    codec: info.codec || undefined,
    bitrate: info.bitrate || undefined,
    bitrateKbps: info.bitrateKbps || undefined,
    sampleRate: info.sampleRate || undefined,
    sampleRateHz: info.sampleRateHz || undefined,
    bitDepth: info.bitDepth || undefined,
    channels: info.channels || undefined,
    bpm: info.bpm || undefined,
    bpmChecked: completeServerMeta,
    mqaChecked: completeServerMeta,
    isMqa: false,
    remoteType,
    streamingProvider: info.streamingProvider || track?.streamingProvider || '',
    streamingPlaybackMode: info.streamingPlaybackMode || track?.streamingPlaybackMode || '',
    remoteSourceId: track?.remoteSourceId || '',
    remoteSongId: track?.remoteSongId || track?.remoteItemId || ''
  }
}

export function mergeRemoteTrackMeta(cachedMeta = {}, serverMeta = {}) {
  const cached = cachedMeta && typeof cachedMeta === 'object' ? cachedMeta : {}
  const server = serverMeta && typeof serverMeta === 'object' ? serverMeta : {}
  const merged = {
    ...cached,
    ...server,
    cover: server.cover || cached.cover || ''
  }

  if (!server.title || server.title === 'Unknown Title') {
    merged.title = cached.title || server.title || ''
  }
  if (!server.artist || server.artist === 'Unknown Artist') {
    merged.artist = cached.artist || server.artist || ''
  }
  if (!server.album) {
    merged.album = cached.album || ''
  }

  return merged
}
