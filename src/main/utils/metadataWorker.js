import { parentPort } from 'worker_threads'

function normalizeText(value) {
  if (Array.isArray(value))
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(' / ')
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeTrackPart(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function buildLightweightMetadata(metadata = {}) {
  const common = metadata?.common || {}
  const format = metadata?.format || {}
  return {
    title: normalizeText(common.title),
    artist: normalizeText(common.artist || common.artists),
    album: normalizeText(common.album),
    albumArtist: normalizeText(common.albumartist || common.albumArtist),
    year: normalizeTrackPart(common.year),
    genre: normalizeText(common.genre),
    trackNo: normalizeTrackPart(common.track?.no),
    discNo: normalizeTrackPart(common.disk?.no),
    duration: normalizeNumber(format.duration),
    codec: normalizeText(format.codec),
    sampleRate: normalizeNumber(format.sampleRate),
    bitDepth: normalizeNumber(format.bitsPerSample),
    channels: normalizeNumber(format.numberOfChannels),
    lossless: format.lossless === true,
    container: normalizeText(format.container),
    bitrate: normalizeNumber(format.bitrate)
  }
}

parentPort?.on('message', async (task) => {
  const id = task?.id
  const filePath = String(task?.filePath || '').trim()
  try {
    const { parseFile } = await import('music-metadata')
    const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
    parentPort?.postMessage({
      id,
      success: true,
      metadata: buildLightweightMetadata(metadata)
    })
  } catch (error) {
    parentPort?.postMessage({
      id,
      success: false,
      error: error?.message || String(error || '')
    })
  }
})
