import { normalizeEmbeddedCoverPicture } from './embeddedCover.js'

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

function assignEmbeddedFieldSource(fieldSources, field, value) {
  if (value === null || value === undefined) return
  if (typeof value === 'string' && !value.trim()) return
  fieldSources[field] = 'embedded'
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
  const normalized = {
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
  }
  const fieldSources = {}
  for (const field of [
    'title',
    'artist',
    'album',
    'albumArtist',
    'year',
    'genre',
    'trackNo',
    'trackTotal',
    'discNo',
    'discTotal',
    'duration',
    'codec',
    'container',
    'bitrate',
    'sampleRate',
    'bitDepth',
    'channels'
  ]) {
    assignEmbeddedFieldSource(fieldSources, field, normalized[field])
  }
  if (normalized.lossless === true) fieldSources.lossless = 'embedded'
  if (picture) fieldSources.cover = 'embedded'
  return {
    metadata: {
      ...normalized,
      cover: picture || null,
      coverSource: picture ? 'embedded' : null,
      metadataSource: Object.keys(fieldSources).length > 0 ? 'embedded' : null,
      fieldSources
    },
    picture,
    error: String(error || ''),
    rawMetadata: metadata || null
  }
}

function buildRawMetadataFromLightweight(metadata = {}) {
  return {
    common: {
      title: metadata.title || '',
      artist: metadata.artist || '',
      album: metadata.album || '',
      albumartist: metadata.albumArtist || '',
      albumArtist: metadata.albumArtist || '',
      year: metadata.year || null,
      genre: metadata.genre ? [metadata.genre] : [],
      track: {
        no: metadata.trackNo || null,
        of: null
      },
      disk: {
        no: metadata.discNo || null,
        of: null
      },
      picture: []
    },
    format: {
      duration: metadata.duration || null,
      codec: metadata.codec || '',
      container: metadata.container || '',
      lossless: metadata.lossless === true,
      bitrate: metadata.bitrate || null,
      sampleRate: metadata.sampleRate || null,
      bitsPerSample: metadata.bitDepth || null,
      numberOfChannels: metadata.channels || null
    },
    native: {}
  }
}

export async function readMusicMetadataForLocalFile(filePath, options = {}) {
  try {
    if (options.useWorker === true && typeof options.parseFile !== 'function') {
      const { getMetadataWorkerPool } = await import('./metadataWorkerPool.js')
      const result = await getMetadataWorkerPool().read(filePath)
      if (!result?.success) {
        return buildMusicMetadataReaderPayload(
          null,
          null,
          result?.error || 'metadata worker failed'
        )
      }
      return buildMusicMetadataReaderPayload(
        buildRawMetadataFromLightweight(result.metadata),
        null,
        ''
      )
    }
    const parse =
      typeof options.parseFile === 'function'
        ? options.parseFile
        : (await import('music-metadata')).parseFile
    const skipCovers = options.skipCovers === true
    const metadata = await parse(filePath, {
      duration: true,
      skipCovers
    })
    const rawPicture = Array.isArray(metadata?.common?.picture)
      ? metadata.common.picture.find((item) => item?.data) || null
      : null
    return buildMusicMetadataReaderPayload(
      metadata,
      skipCovers ? null : normalizeMusicMetadataPicture(rawPicture),
      ''
    )
  } catch (error) {
    return buildMusicMetadataReaderPayload(null, null, error?.message || String(error || ''))
  }
}
