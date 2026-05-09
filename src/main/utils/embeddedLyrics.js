import { EMBEDDED_LYRICS_EXTRACTOR_VERSION } from '../../shared/embeddedLyricsVersion.mjs'

const TIMESTAMP_FORMAT_MPEG_FRAME_NUMBER = 1
const TIMESTAMP_FORMAT_MILLISECONDS = 2
const MPEG_AUDIO_SAMPLES_PER_FRAME = 1152

export { EMBEDDED_LYRICS_EXTRACTOR_VERSION }

function normalizeEmbeddedText(text) {
  return String(text || '')
    .replace(/^\ufeff/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

function getLyricsTimestamp(row) {
  const value = row?.timestamp ?? row?.timeStamp ?? row?.time ?? row?.startTime ?? row?.start
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN
}

function normalizeTimestampMs(timestamp, tag, metadata) {
  const timeStampFormat = Number(tag?.timeStampFormat)
  if (timeStampFormat === TIMESTAMP_FORMAT_MPEG_FRAME_NUMBER) {
    const sampleRate = Number(metadata?.format?.sampleRate)
    if (Number.isFinite(sampleRate) && sampleRate > 0) {
      return (timestamp * MPEG_AUDIO_SAMPLES_PER_FRAME * 1000) / sampleRate
    }
  }
  if (timeStampFormat === TIMESTAMP_FORMAT_MILLISECONDS) return timestamp

  const durationSec = Number(metadata?.format?.duration)
  if (Number.isFinite(durationSec) && durationSec > 0 && timestamp <= durationSec + 5) {
    return timestamp * 1000
  }
  return timestamp
}

function formatLrcTimestamp(timestampMs) {
  const boundedMs = Math.max(0, Math.round(Number(timestampMs) || 0))
  const totalCentiseconds = Math.floor(boundedMs / 10)
  const centiseconds = totalCentiseconds % 100
  const totalSeconds = Math.floor(totalCentiseconds / 100)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    centiseconds
  ).padStart(2, '0')}]`
}

function buildSyncedLyricsText(tag, metadata) {
  const rows = Array.isArray(tag?.syncText) ? tag.syncText : []
  const normalizedRows = []

  for (const row of rows) {
    const rawTimestamp = getLyricsTimestamp(row)
    if (!Number.isFinite(rawTimestamp)) continue
    const text = normalizeEmbeddedText(row?.text)
    if (!text) continue
    const timestampMs = normalizeTimestampMs(rawTimestamp, tag, metadata)
    for (const line of text.split('\n')) {
      const cleanLine = normalizeEmbeddedText(line)
      if (cleanLine) normalizedRows.push({ timestampMs, text: cleanLine })
    }
  }

  if (normalizedRows.length === 0) return ''
  normalizedRows.sort((a, b) => a.timestampMs - b.timestampMs)
  return normalizedRows
    .map((row) => `${formatLrcTimestamp(row.timestampMs)}${row.text}`)
    .join('\n')
}

function decodeEmbeddedTextValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return normalizeEmbeddedText(value)

  if (Array.isArray(value)) {
    return value
      .map((item) => decodeEmbeddedTextValue(item))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buffer = Buffer.from(value)
    const candidates = [
      buffer.toString('utf8'),
      buffer.toString('utf16le'),
      buffer.toString('latin1')
    ]
    for (const candidate of candidates) {
      const normalized = normalizeEmbeddedText(candidate)
      if (normalized) return normalized
    }
    return ''
  }

  if (typeof value === 'object') {
    return (
      decodeEmbeddedTextValue(value.text) ||
      decodeEmbeddedTextValue(value.value) ||
      decodeEmbeddedTextValue(value.data) ||
      decodeEmbeddedTextValue(value.description)
    )
  }

  return ''
}

function extractSyncedLyricsValue(value, metadata) {
  if (!value) return ''

  if (Array.isArray(value)) {
    const candidates = value
      .map((item) => extractSyncedLyricsValue(item, metadata))
      .filter(Boolean)
    if (candidates.length === 0) return ''
    return candidates.sort((a, b) => b.split('\n').length - a.split('\n').length)[0]
  }

  if (typeof value === 'object') {
    const synced = buildSyncedLyricsText(value, metadata)
    if (synced) return synced
    return (
      extractSyncedLyricsValue(value.value, metadata) ||
      extractSyncedLyricsValue(value.data, metadata)
    )
  }

  return ''
}

function extractPlainLyricsValue(value) {
  return decodeEmbeddedTextValue(value)
}

export function extractEmbeddedLyricsText(metadata) {
  const commonLyrics = metadata?.common?.lyrics
  const syncedCommonLyrics = extractSyncedLyricsValue(commonLyrics, metadata)
  if (syncedCommonLyrics) return syncedCommonLyrics

  const plainCommonLyrics = extractPlainLyricsValue(commonLyrics)
  if (plainCommonLyrics) return plainCommonLyrics

  const lyricTagIds = new Set(['\u00a9lyr', 'lyrics', 'uslt', 'sylt', 'wm/lyrics'])
  const nativeLyricValues = []
  for (const nativeTags of Object.values(metadata?.native || {})) {
    for (const tag of Array.isArray(nativeTags) ? nativeTags : []) {
      const tagId = String(tag?.id || '')
        .trim()
        .toLowerCase()
      if (!tagId) continue
      if (!lyricTagIds.has(tagId) && !tagId.endsWith(':lyrics')) continue
      nativeLyricValues.push(tag?.value)
    }
  }

  const syncedNativeLyrics = extractSyncedLyricsValue(nativeLyricValues, metadata)
  if (syncedNativeLyrics) return syncedNativeLyrics

  return extractPlainLyricsValue(nativeLyricValues)
}
