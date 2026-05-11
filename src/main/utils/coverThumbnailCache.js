import fs from 'fs'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'

export const COVER_THUMB_CACHE_VERSION = 1

const COVER_CACHE_DIR_NAME = 'cover-cache-v2'
const COVER_THUMB_DIR_NAME = 'thumb'
const DEFAULT_COVER_THUMB_MAX_DIMENSION = 320
const MAX_COVER_THUMB_MAX_DIMENSION = 384
const COVER_THUMB_JPEG_QUALITY = 80
const LOCAL_COVER_SOURCES = new Set(['embedded', 'embedded-batch', 'folder'])
const EXTERNAL_COVER_SOURCES = new Set([
  'network',
  'manual-network',
  'remote',
  'netease',
  'qqmusic',
  'external'
])

function normalizeThumbMaxDimension(value) {
  const raw = Number(value || process.env.ECHO_ALBUM_THUMBNAIL_SIZE)
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(MAX_COVER_THUMB_MAX_DIMENSION, Math.max(160, Math.round(raw)))
  }
  return DEFAULT_COVER_THUMB_MAX_DIMENSION
}

function parseCoverDataUrl(dataUrl) {
  const text = String(dataUrl || '').trim()
  const match = text.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\r\n]+)$/i)
  if (!match) return null
  try {
    const buffer = Buffer.from(match[1].replace(/\s+/g, ''), 'base64')
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

function sha1Buffer(buffer) {
  return createHash('sha1').update(buffer).digest('hex')
}

export function getCoverThumbPath(userDataPath = '', coverKey = '') {
  const key = String(coverKey || '').trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(key)) return ''
  return join(userDataPath, COVER_CACHE_DIR_NAME, COVER_THUMB_DIR_NAME, key.slice(0, 2), key.slice(2, 4), `${key}.jpg`)
}

export function getCoverThumbUrl(coverThumbPath = '') {
  const filePath = String(coverThumbPath || '').trim()
  if (!filePath) return ''
  try {
    return pathToFileURL(filePath).toString()
  } catch {
    return ''
  }
}

async function readExistingThumbnail(filePath, imageAdapter) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size <= 0) return null
    let metadata = null
    try {
      metadata = imageAdapter?.readMetadata ? await imageAdapter.readMetadata(filePath) : null
    } catch {
      metadata = null
    }
    return {
      bytes: stat.size,
      width: Number(metadata?.width) > 0 ? Math.round(Number(metadata.width)) : null,
      height: Number(metadata?.height) > 0 ? Math.round(Number(metadata.height)) : null
    }
  } catch {
    return null
  }
}

async function loadElectronNativeImage() {
  try {
    const electron = await import('electron')
    return electron?.nativeImage || null
  } catch {
    return null
  }
}

async function encodeWithElectronNativeImage(sourceBuffer, options = {}) {
  const nativeImage = await loadElectronNativeImage()
  if (!nativeImage?.createFromBuffer) return null

  let image = nativeImage.createFromBuffer(sourceBuffer)
  if (!image || image.isEmpty()) return null

  const maxDimension = normalizeThumbMaxDimension(options.maxDimension)
  let { width, height } = image.getSize()
  const maxSide = Math.max(width || 0, height || 0)
  if (maxSide > maxDimension) {
    const scale = maxDimension / maxSide
    image = image.resize({
      width: Math.max(1, Math.round((width || maxDimension) * scale)),
      height: Math.max(1, Math.round((height || maxDimension) * scale)),
      quality: 'good'
    })
    ;({ width, height } = image.getSize())
  }

  const encoded = image.toJPEG(COVER_THUMB_JPEG_QUALITY)
  if (!encoded?.length) return null
  return {
    buffer: Buffer.from(encoded),
    width: Number(width) > 0 ? Math.round(Number(width)) : null,
    height: Number(height) > 0 ? Math.round(Number(height)) : null
  }
}

async function readMetadataWithElectronNativeImage(filePath) {
  try {
    const nativeImage = await loadElectronNativeImage()
    if (!nativeImage?.createFromPath) return null
    const image = nativeImage.createFromPath(filePath)
    if (!image || image.isEmpty()) return null
    const size = image.getSize()
    return {
      width: Number(size.width) > 0 ? Math.round(Number(size.width)) : null,
      height: Number(size.height) > 0 ? Math.round(Number(size.height)) : null
    }
  } catch {
    return null
  }
}

const defaultImageAdapter = {
  encodeJpegThumbnail: encodeWithElectronNativeImage,
  readMetadata: readMetadataWithElectronNativeImage
}

function isLocalCacheableCoverSource(source) {
  return LOCAL_COVER_SOURCES.has(String(source || '').trim())
}

export function isExternalCacheableCoverSource(source) {
  return EXTERNAL_COVER_SOURCES.has(String(source || '').trim())
}

export async function ensureCoverThumbnailCache({
  userDataPath = '',
  coverDataUrl = '',
  coverSource = '',
  allowExternalCover = false,
  imageAdapter = defaultImageAdapter,
  maxDimension,
  logger = console.debug
} = {}) {
  const normalizedSource = String(coverSource || '').trim()
  if (
    !userDataPath ||
    (!isLocalCacheableCoverSource(normalizedSource) &&
      !(allowExternalCover && isExternalCacheableCoverSource(normalizedSource)))
  ) {
    return null
  }
  const sourceBuffer = parseCoverDataUrl(coverDataUrl)
  if (!sourceBuffer) return null

  const coverKey = sha1Buffer(sourceBuffer)
  const coverThumbPath = getCoverThumbPath(userDataPath, coverKey)
  if (!coverThumbPath) return null

  const startedAt = Date.now()
  const existing = await readExistingThumbnail(coverThumbPath, imageAdapter)
  if (existing) {
    return {
      coverKey,
      coverThumbPath,
      coverThumbUrl: getCoverThumbUrl(coverThumbPath),
      coverCacheVersion: COVER_THUMB_CACHE_VERSION,
      coverThumbBytes: existing.bytes,
      coverThumbWidth: existing.width,
      coverThumbHeight: existing.height
    }
  }

  try {
    const encoded = await imageAdapter?.encodeJpegThumbnail?.(sourceBuffer, {
      maxDimension: normalizeThumbMaxDimension(maxDimension),
      quality: COVER_THUMB_JPEG_QUALITY
    })
    if (!encoded?.buffer?.length) return null

    fs.mkdirSync(dirname(coverThumbPath), { recursive: true })
    if (!(await readExistingThumbnail(coverThumbPath, imageAdapter))) {
      fs.writeFileSync(coverThumbPath, encoded.buffer)
    }

    const saved = (await readExistingThumbnail(coverThumbPath, imageAdapter)) || {
      bytes: encoded.buffer.length,
      width: Number(encoded.width) > 0 ? Math.round(Number(encoded.width)) : null,
      height: Number(encoded.height) > 0 ? Math.round(Number(encoded.height)) : null
    }

    logger?.('[coverThumbnailCache] thumbnail ready', {
      coverKey,
      bytes: saved.bytes,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    })

    return {
      coverKey,
      coverThumbPath,
      coverThumbUrl: getCoverThumbUrl(coverThumbPath),
      coverCacheVersion: COVER_THUMB_CACHE_VERSION,
      coverThumbBytes: saved.bytes,
      coverThumbWidth: saved.width,
      coverThumbHeight: saved.height
    }
  } catch (error) {
    logger?.('[coverThumbnailCache] thumbnail failed', {
      coverKey,
      bytes: 0,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    })
    return null
  }
}

export function ensureDisplayCoverThumbnailCache(options = {}) {
  return ensureCoverThumbnailCache({
    ...options,
    allowExternalCover: true
  })
}
