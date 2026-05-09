import { normalizeEmbeddedCoverPicture } from './embeddedCover.js'

function normalizeText(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).join(' / ')
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

export function normalizeMusicMetadataPicture(rawPicture = null) {
  if (!rawPicture) return null
  return normalizeEmbeddedCoverPicture({
    data: rawPicture.data,
    format: rawPicture.format || rawPicture.mimeType
  })
}

export function buildMusicMetadataReaderPayload(metadata = {}, picture = null, error = '') {
  const common = metadata?.common || {}
  const format = metadata?.format || {}
  return {
    metadata: {
      title: normalizeText(common.title),
      artist: normalizeText(common.artist || common.artists),
      album: normalizeText(common.album),
      albumArtist: normalizeText(common.albumartist || common.albumArtist),
      year: normalizeTrackPart(common.year),
      genre: normalizeText(common.genre),
      trackNo: normalizeTrackPart(common.track?.no),
      trackTotal: normalizeTrackPart(common.track?.of),
      discNo: normalizeTrackPart(common.disk?.no),
      discTotal: normalizeTrackPart(common.disk?.of),
      duration: normalizeNumber(format.duration),
      codec: normalizeText(format.codec),
      container: normalizeText(format.container),
      lossless: format.lossless === true,
      bitrate: normalizeNumber(format.bitrate),
      sampleRate: normalizeNumber(format.sampleRate),
      bitDepth: normalizeNumber(format.bitsPerSample),
      channels: normalizeNumber(format.numberOfChannels)
    },
    picture,
    error: String(error || ''),
    rawMetadata: metadata || null
  }
}

export async function readMusicMetadataForLocalFile(filePath, options = {}) {
  try {
    const parse =
      typeof options.parseFile === 'function'
        ? options.parseFile
        : (await import('music-metadata')).parseFile
    const metadata = await parse(filePath, {
      duration: true,
      skipCovers: false
    })
    const rawPicture = Array.isArray(metadata?.common?.picture)
      ? metadata.common.picture.find((item) => item?.data) || null
      : null
    return buildMusicMetadataReaderPayload(metadata, normalizeMusicMetadataPicture(rawPicture), '')
  } catch (error) {
    return buildMusicMetadataReaderPayload(null, null, error?.message || String(error || ''))
  }
}
