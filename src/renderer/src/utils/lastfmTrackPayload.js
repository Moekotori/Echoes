function cleanText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
}

function isUnknownText(value, kind) {
  const text = cleanText(value).toLowerCase()
  if (!text) return true
  if (kind === 'artist') return text === 'unknown artist' || text === '<unknown>'
  if (kind === 'album') return text === 'unknown album'
  if (kind === 'title') return text === 'unknown track' || text === 'unknown title'
  return false
}

function firstUseful(kind, ...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text && !isUnknownText(text, kind)) return text
  }
  return ''
}

function pathFileName(path) {
  const text = String(path || '').split(/[?#]/)[0]
  const parts = text.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || ''
}

function stripExtension(name) {
  return cleanText(name).replace(/\.[^/.]+$/, '')
}

function parseArtistTitle(text) {
  const value = cleanText(text)
  if (!value) return null

  const separators = [' - ', ' -- ', ' | ', ' _ ', ' / ', ' \u2013 ', ' \u2014 ']
  for (const separator of separators) {
    if (!value.includes(separator)) continue
    const [left, ...rest] = value.split(separator)
    const artist = cleanText(left)
    const title = cleanText(rest.join(separator))
    if (artist && title) return { artist, title }
  }

  return null
}

function durationFromTrack(track) {
  const values = [track?.info?.duration, track?.duration, track?.cue?.duration]
  for (const value of values) {
    const duration = Number(value)
    if (Number.isFinite(duration) && duration > 0) return duration
  }
  return 0
}

export function buildLastFmTrackPayload(track) {
  if (!track || typeof track !== 'object') return null

  const info = track.info || {}
  const fileTitle = stripExtension(track.name || pathFileName(track.path))
  const parsed =
    parseArtistTitle(info.title) ||
    parseArtistTitle(track.title) ||
    parseArtistTitle(fileTitle) ||
    parseArtistTitle(stripExtension(track.name))

  const title = firstUseful('title', info.title, track.title, parsed?.title, fileTitle)
  if (!title) return null

  const artist =
    firstUseful(
      'artist',
      info.artist,
      track.artist,
      info.albumArtist,
      track.albumArtist,
      parsed?.artist
    ) || 'Unknown Artist'

  return {
    artist,
    title,
    album: firstUseful('album', info.album, track.album),
    duration: durationFromTrack(track)
  }
}

export function getLastFmScrobbleThresholdSec(durationSec) {
  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) return 30
  return Math.max(30, Math.min(240, duration * 0.5))
}
