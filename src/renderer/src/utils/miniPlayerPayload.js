export function sanitizeMiniPlayerCover(value) {
  const text = String(value || '').trim()
  if (/^data:image\//i.test(text)) return text
  if (/^https?:\/\//i.test(text)) return text
  if (/^file:\/\//i.test(text)) return text
  return ''
}

export function buildMiniPlayerPayloadSignature(payload = {}) {
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

function readMiniPlayerValue(source, flatKey, sectionKey, sectionValueKey = flatKey) {
  if (source?.[sectionKey] && Object.prototype.hasOwnProperty.call(source[sectionKey], sectionValueKey)) {
    return source[sectionKey][sectionValueKey]
  }
  return source?.[flatKey]
}

export function buildMiniPlayerPayload(source = {}) {
  const trackPath = readMiniPlayerValue(source, 'trackPath', 'track', 'path') || ''
  const title = readMiniPlayerValue(source, 'title', 'track') || ''
  const artist = readMiniPlayerValue(source, 'artist', 'track') || ''
  const album = readMiniPlayerValue(source, 'album', 'track') || ''
  const cover = readMiniPlayerValue(source, 'cover', 'track') || ''
  const liked = readMiniPlayerValue(source, 'liked', 'track') === true
  const isPlaying = readMiniPlayerValue(source, 'isPlaying', 'playback') === true
  const volume = readMiniPlayerValue(source, 'volume', 'playback') ?? 1
  const position = readMiniPlayerValue(source, 'position', 'playback') ?? 0
  const duration = readMiniPlayerValue(source, 'duration', 'playback') ?? 0
  const updatedAtMs = readMiniPlayerValue(source, 'updatedAtMs', 'playback') ?? 0
  const safeTitle = String(title || '').trim()
  const safeArtist = String(artist || '').trim()
  const safeUpdatedAtMs = Math.max(0, Number(updatedAtMs) || 0)
  return {
    track: {
      path: String(trackPath || ''),
      title: safeTitle,
      artist: safeArtist,
      album: String(album || '').trim(),
      cover: sanitizeMiniPlayerCover(cover),
      liked: liked === true
    },
    playback: {
      isPlaying: isPlaying === true,
      volume: Math.min(1, Math.max(0, Number(volume) || 0)),
      position: Math.max(0, Number(position) || 0),
      duration: Math.max(0, Number(duration) || 0),
      ...(safeUpdatedAtMs > 0 ? { updatedAtMs: safeUpdatedAtMs } : {})
    }
  }
}
