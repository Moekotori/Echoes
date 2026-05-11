import { createRequire } from 'module'
import { extname } from 'path'
import { normalizeEmbeddedCoverMime, normalizeEmbeddedCoverPicture } from './embeddedCover.js'

const require = createRequire(import.meta.url)
const MAX_EMBEDDED_COVER_BYTES = 350 * 1024

export const EMBEDDED_COVER_RECOVERY_STAT_KEYS = [
  'embeddedCoverRecoveryAttempted',
  'embeddedCoverRecoverySucceeded',
  'embeddedCoverRecoveryFailed',
  'embeddedCoverRecoveryMusicMetadataSucceeded',
  'embeddedCoverRecoveryJsmediatagsSucceeded',
  'embeddedCoverRecoveryFolderSucceeded',
  'embeddedCoverRecoveryNativeImageFailed',
  'embeddedCoverRecoveryNoPictureData',
  'embeddedCoverRecoveryUnsupportedMime',
  'embeddedCoverRecoveryError'
]

export function createEmbeddedCoverRecoveryStats() {
  return Object.fromEntries(EMBEDDED_COVER_RECOVERY_STAT_KEYS.map((key) => [key, 0]))
}

export function mergeEmbeddedCoverRecoveryStats(target = {}, source = {}) {
  for (const key of EMBEDDED_COVER_RECOVERY_STAT_KEYS) {
    target[key] = Number(target[key] || 0) + Number(source?.[key] || 0)
  }
  return target
}

function isMp3LikePath(filePath = '') {
  return /\.(?:mp3|mp2|mpga)(?:#|$)/i.test(String(filePath || ''))
}

function sanitizeMime(mime = '') {
  const normalized = normalizeEmbeddedCoverMime(mime || 'image/jpeg')
  return /^image\//i.test(normalized) ? normalized : ''
}

async function loadNativeImage() {
  try {
    const electron = await import('electron')
    return electron?.nativeImage || null
  } catch {
    return null
  }
}

function normalizeMaxDimension(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 320
  return Math.min(768, Math.max(160, Math.round(parsed)))
}

async function compressRecoveredCoverData(picture, options = {}) {
  const stats = createEmbeddedCoverRecoveryStats()
  const normalized = normalizeEmbeddedCoverPicture({
    data: picture?.data,
    format: picture?.format || picture?.mimeType || picture?.type || 'image/jpeg'
  })
  if (!normalized) {
    stats.embeddedCoverRecoveryNoPictureData += 1
    return { dataUrl: null, bytes: 0, width: 0, height: 0, nativeImageEmpty: false, stats }
  }

  const mime = sanitizeMime(normalized.mime)
  if (!mime) {
    stats.embeddedCoverRecoveryUnsupportedMime += 1
    return { dataUrl: null, bytes: 0, width: 0, height: 0, nativeImageEmpty: false, stats }
  }

  const rawDataUrl = `data:${mime};base64,${normalized.buffer.toString('base64')}`
  const imageAdapter = options.imageAdapter || {}
  let nativeImage = imageAdapter.nativeImage || null
  if (!nativeImage && imageAdapter.disableNativeImage !== true) {
    nativeImage = await loadNativeImage()
  }

  try {
    if (!nativeImage?.createFromBuffer) {
      stats.embeddedCoverRecoveryNativeImageFailed += 1
      return {
        dataUrl: rawDataUrl,
        bytes: normalized.buffer.length,
        width: 0,
        height: 0,
        nativeImageEmpty: true,
        stats
      }
    }

    let image = nativeImage.createFromBuffer(normalized.buffer)
    if (!image || image.isEmpty?.() === true) {
      stats.embeddedCoverRecoveryNativeImageFailed += 1
      return {
        dataUrl: rawDataUrl,
        bytes: normalized.buffer.length,
        width: 0,
        height: 0,
        nativeImageEmpty: true,
        stats
      }
    }

    const maxDimension = normalizeMaxDimension(options.maxDimension)
    let { width, height } = image.getSize?.() || {}
    const maxSide = Math.max(Number(width) || 0, Number(height) || 0)
    if (maxSide > maxDimension && typeof image.resize === 'function') {
      const scale = maxDimension / maxSide
      image = image.resize({
        width: Math.max(1, Math.round((Number(width) || maxDimension) * scale)),
        height: Math.max(1, Math.round((Number(height) || maxDimension) * scale)),
        quality: 'good'
      })
      ;({ width, height } = image.getSize?.() || {})
    }

    let encoded = typeof image.toJPEG === 'function' ? image.toJPEG(82) : null
    if (encoded?.length > MAX_EMBEDDED_COVER_BYTES) {
      for (const quality of [74, 66, 58]) {
        encoded = image.toJPEG(quality)
        if (encoded?.length <= MAX_EMBEDDED_COVER_BYTES) break
      }
    }
    if (encoded?.length > MAX_EMBEDDED_COVER_BYTES && (Number(width) > 320 || Number(height) > 320)) {
      const resized = image.resize({
        width: Math.max(320, Math.round((Number(width) || 320) * 0.72)),
        height: Math.max(320, Math.round((Number(height) || 320) * 0.72)),
        quality: 'good'
      })
      if (resized && typeof resized.toJPEG === 'function') {
        image = resized
        ;({ width, height } = image.getSize?.() || {})
        encoded = image.toJPEG(66)
      }
    }
    if (!encoded?.length) {
      stats.embeddedCoverRecoveryNativeImageFailed += 1
      return {
        dataUrl: rawDataUrl,
        bytes: normalized.buffer.length,
        width: 0,
        height: 0,
        nativeImageEmpty: true,
        stats
      }
    }

    return {
      dataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString('base64')}`,
      bytes: encoded.length,
      width: Number(width) > 0 ? Math.round(Number(width)) : 0,
      height: Number(height) > 0 ? Math.round(Number(height)) : 0,
      nativeImageEmpty: false,
      stats
    }
  } catch {
    stats.embeddedCoverRecoveryNativeImageFailed += 1
    return {
      dataUrl: rawDataUrl,
      bytes: normalized.buffer.length,
      width: 0,
      height: 0,
      nativeImageEmpty: true,
      stats
    }
  }
}

async function resolveFolderCoverDataUrl(filePath, options = {}) {
  if (typeof options.findFolderCoverDataUrl === 'function') {
    return options.findFolderCoverDataUrl(filePath, {
      albumName: options.entry?.album || '',
      maxDimension: options.maxDimension || options.coverMaxDimension || 320
    })
  }
  const { findFolderCoverDataUrl } = await import('./folderCover.js')
  return findFolderCoverDataUrl(filePath, {
    albumName: options.entry?.album || '',
    maxDimension: options.maxDimension || options.coverMaxDimension || 320
  })
}

async function readMusicMetadataPicture(filePath, options = {}) {
  const parse =
    typeof options.parseFile === 'function'
      ? options.parseFile
      : (await import('music-metadata')).parseFile
  const metadata = await parse(filePath, { duration: false, skipCovers: false })
  const pictures = Array.isArray(metadata?.common?.picture) ? metadata.common.picture : []
  return {
    picture: pictures.find((item) => item?.data) || null,
    pictureCount: pictures.length
  }
}

async function readJsmediatagsPicture(filePath, options = {}) {
  if (!isMp3LikePath(filePath)) return { picture: null, error: '' }
  if (typeof options.readJsmediatagsPicture === 'function') {
    return options.readJsmediatagsPicture(filePath)
  }

  return await new Promise((resolve) => {
    let jsmediatags = null
    try {
      jsmediatags = require('jsmediatags')
    } catch (error) {
      resolve({ picture: null, error: error?.message || String(error || '') })
      return
    }

    try {
      jsmediatags.read(filePath, {
        onSuccess: (tag) => resolve({ picture: tag?.tags?.picture || null, error: '' }),
        onError: (error) =>
          resolve({ picture: null, error: error?.info || error?.message || String(error || '') })
      })
    } catch (error) {
      resolve({ picture: null, error: error?.message || String(error || '') })
    }
  })
}

function buildRecoveredCoverResult({
  compressed,
  source,
  coverSource,
  coverScope = 'album',
  embeddedPictureCount = 0
}) {
  return {
    ok: true,
    source,
    cover: compressed.dataUrl,
    coverSource,
    coverScope,
    coverBytes: compressed.bytes || 0,
    coverWidth: compressed.width || 0,
    coverHeight: compressed.height || 0,
    nativeImageEmpty: compressed.nativeImageEmpty === true,
    embeddedPictureCount
  }
}

export async function recoverEmbeddedCoverForBatch(filePath, options = {}) {
  const stats = createEmbeddedCoverRecoveryStats()
  stats.embeddedCoverRecoveryAttempted += 1
  const maxDimension = options.coverMaxDimension || options.maxDimension || 320

  try {
    const musicMetadata = await readMusicMetadataPicture(filePath, options)
    if (musicMetadata.picture?.data) {
      const compressed = await compressRecoveredCoverData(musicMetadata.picture, {
        maxDimension,
        imageAdapter: options.imageAdapter
      })
      mergeEmbeddedCoverRecoveryStats(stats, compressed.stats)
      if (compressed.dataUrl) {
        stats.embeddedCoverRecoverySucceeded += 1
        stats.embeddedCoverRecoveryMusicMetadataSucceeded += 1
        return {
          ...buildRecoveredCoverResult({
            compressed,
            source: 'music-metadata',
            coverSource: 'embedded-batch',
            embeddedPictureCount: musicMetadata.pictureCount || 1
          }),
          recoveryStats: stats
        }
      }
    } else {
      stats.embeddedCoverRecoveryNoPictureData += 1
    }
  } catch {
    stats.embeddedCoverRecoveryError += 1
  }

  try {
    const jsmediatags = await readJsmediatagsPicture(filePath, options)
    if (jsmediatags?.picture?.data) {
      const picture = jsmediatags.picture
      const compressed = await compressRecoveredCoverData(
        {
          data: picture.data,
          format: picture.format || picture.type || picture.mimeType || 'image/jpeg'
        },
        {
          maxDimension,
          imageAdapter: options.imageAdapter
        }
      )
      mergeEmbeddedCoverRecoveryStats(stats, compressed.stats)
      if (compressed.dataUrl) {
        stats.embeddedCoverRecoverySucceeded += 1
        stats.embeddedCoverRecoveryJsmediatagsSucceeded += 1
        return {
          ...buildRecoveredCoverResult({
            compressed,
            source: 'jsmediatags',
            coverSource: 'embedded-batch',
            embeddedPictureCount: 1
          }),
          recoveryStats: stats
        }
      }
    } else if (isMp3LikePath(filePath)) {
      stats.embeddedCoverRecoveryNoPictureData += 1
    }
  } catch {
    stats.embeddedCoverRecoveryError += 1
  }

  try {
    const folderCover = await resolveFolderCoverDataUrl(filePath, {
      ...options,
      maxDimension
    })
    if (folderCover) {
      stats.embeddedCoverRecoverySucceeded += 1
      stats.embeddedCoverRecoveryFolderSucceeded += 1
      return {
        ok: true,
        source: 'folder',
        cover: folderCover,
        coverSource: 'folder',
        coverScope: 'album',
        coverBytes: folderCover.length,
        coverWidth: 0,
        coverHeight: 0,
        nativeImageEmpty: false,
        embeddedPictureCount: Number(options.entry?.embeddedPictureCount || 0) || 0,
        recoveryStats: stats
      }
    }
  } catch {
    stats.embeddedCoverRecoveryError += 1
  }

  stats.embeddedCoverRecoveryFailed += 1
  return {
    ok: false,
    source: '',
    recoveryStats: stats,
    error: extname(filePath).toLowerCase() || 'cover_recovery_failed'
  }
}
