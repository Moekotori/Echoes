const CUE_MARKER = '#echo-cue='

function toPositiveNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function stripQuotes(value) {
  return String(value || '')
    .trim()
    .replace(/^"|"$/g, '')
    .trim()
}

export function cueTimeToSeconds(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d+):(\d{1,2}):(\d{1,2})$/)
  if (!match) return 0
  const minutes = Number(match[1]) || 0
  const seconds = Number(match[2]) || 0
  const frames = Number(match[3]) || 0
  return minutes * 60 + seconds + frames / 75
}

export function parseCueSheet(cueText, audioPath = '', durationSec = 0) {
  const text = String(cueText || '').replace(/\r\n?/g, '\n')
  if (!text.trim()) return []

  const tracks = []
  let albumTitle = ''
  let albumArtist = ''
  let current = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || /^REM\b/i.test(line) || /^FILE\b/i.test(line)) continue

    const trackMatch = line.match(/^TRACK\s+(\d+)\s+(\S+)/i)
    if (trackMatch) {
      current = {
        trackNo: Number(trackMatch[1]) || tracks.length + 1,
        title: '',
        artist: '',
        start: null
      }
      tracks.push(current)
      continue
    }

    const titleMatch = line.match(/^TITLE\s+(.+)$/i)
    if (titleMatch) {
      if (current) current.title = stripQuotes(titleMatch[1])
      else albumTitle = stripQuotes(titleMatch[1])
      continue
    }

    const performerMatch = line.match(/^PERFORMER\s+(.+)$/i)
    if (performerMatch) {
      if (current) current.artist = stripQuotes(performerMatch[1])
      else albumArtist = stripQuotes(performerMatch[1])
      continue
    }

    const indexMatch = line.match(/^INDEX\s+01\s+(\d+:\d{1,2}:\d{1,2})/i)
    if (indexMatch && current) {
      current.start = cueTimeToSeconds(indexMatch[1])
    }
  }

  const usable = tracks
    .filter((track) => Number.isFinite(track.start) && track.start >= 0)
    .sort((a, b) => a.start - b.start)

  return usable.map((track, index) => {
    const next = usable[index + 1]
    const end = next?.start ?? toPositiveNumber(durationSec, 0)
    const trackDuration = end > track.start ? end - track.start : null
    return {
      ...track,
      albumTitle,
      albumArtist,
      title: track.title || `Track ${track.trackNo}`,
      artist: track.artist || albumArtist || '',
      audioPath,
      start: track.start,
      end: end > track.start ? end : null,
      duration: trackDuration
    }
  })
}

export function createCueVirtualPath(audioPath, cueTrack) {
  const payload = {
    i: Number(cueTrack?.trackNo || 0) || 0,
    s: toPositiveNumber(cueTrack?.start, 0),
    e: toPositiveNumber(cueTrack?.end, 0),
    t: String(cueTrack?.title || ''),
    a: String(cueTrack?.artist || ''),
    al: String(cueTrack?.albumTitle || '')
  }
  return `${audioPath}${CUE_MARKER}${encodeURIComponent(JSON.stringify(payload))}`
}

export function parseCueVirtualPath(filePath) {
  const raw = String(filePath || '')
  const markerIndex = raw.lastIndexOf(CUE_MARKER)
  if (markerIndex < 0) return null
  const audioPath = raw.slice(0, markerIndex)
  const encoded = raw.slice(markerIndex + CUE_MARKER.length)
  try {
    const payload = JSON.parse(decodeURIComponent(encoded))
    const start = toPositiveNumber(payload?.s, 0)
    const end = toPositiveNumber(payload?.e, 0)
    return {
      audioPath,
      trackNo: Number(payload?.i || 0) || 0,
      start,
      end: end > start ? end : null,
      title: String(payload?.t || ''),
      artist: String(payload?.a || ''),
      albumTitle: String(payload?.al || '')
    }
  } catch {
    return null
  }
}

export function getCueAudioPath(filePath) {
  return parseCueVirtualPath(filePath)?.audioPath || filePath
}

export function getCueStart(filePath) {
  return parseCueVirtualPath(filePath)?.start || 0
}

export function getCueDuration(filePath, fallbackDuration = null) {
  const parsed = parseCueVirtualPath(filePath)
  if (!parsed) return fallbackDuration
  if (parsed.end && parsed.end > parsed.start) return parsed.end - parsed.start
  return fallbackDuration
}

export function toCueAbsoluteTime(filePath, relativeTime = 0) {
  return getCueStart(filePath) + Math.max(0, Number(relativeTime) || 0)
}
