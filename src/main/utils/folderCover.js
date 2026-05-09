import fs from 'fs'
import { nativeImage } from 'electron'
import { basename, dirname, extname, join } from 'path'

const FOLDER_COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const INFO_SIDECAR_METADATA_FILE = 'metadata.json'
const MAX_FOLDER_COVER_DIMENSION = 520
const FOLDER_COVER_JPEG_QUALITY = 78
const MAX_FOLDER_COVER_CACHE_ENTRIES = 512
const PREFERRED_COVER_NAMES = [
  'cover',
  'folder',
  'front',
  'album',
  'artwork',
  'coverart',
  'albumart'
]

const folderCoverCache = new Map()
const infoSidecarCoverCache = new Map()

function trimCache(cache, maxEntries = MAX_FOLDER_COVER_CACHE_ENTRIES) {
  while (cache.size > maxEntries) {
    const firstKey = cache.keys().next().value
    if (firstKey === undefined) break
    cache.delete(firstKey)
  }
}

function getDirectoryMtimeMs(dirPath) {
  try {
    return fs.statSync(dirPath).mtimeMs || 0
  } catch {
    return 0
  }
}

function readCoverCache(cache, key) {
  if (!key || !cache.has(key)) return undefined
  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

function writeCoverCache(cache, key, value) {
  if (!key) return value
  cache.set(key, value || null)
  trimCache(cache)
  return value
}

function imageMimeFromPath(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function scoreFolderCoverName(filePath) {
  const name = basename(filePath, extname(filePath)).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const preferredIndex = PREFERRED_COVER_NAMES.indexOf(name)
  if (preferredIndex >= 0) return preferredIndex
  if (name.includes('cover')) return 20
  if (name.includes('folder')) return 21
  if (name.includes('front')) return 22
  if (name.includes('album')) return 23
  return 100
}

function isPreferredFolderCoverCandidate(filePath) {
  return scoreFolderCoverName(filePath) < 100
}

function normalizeImageStem(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}

function normalizeCoverDirectoryText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function looksLikeDiscSubdirectoryName(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
  return /^(?:cd|disc|disk|dvd|bd|vol|volume)?\s*\d{1,3}$/.test(normalized)
}

function isInfoSidecarDir(dirPath) {
  return /\.info$/i.test(basename(dirPath || ''))
}

function compressImageFileToDataUrl(filePath) {
  try {
    const buffer = fs.readFileSync(filePath)
    let image = nativeImage.createFromBuffer(buffer)
    if (image.isEmpty()) {
      return `data:${imageMimeFromPath(filePath)};base64,${buffer.toString('base64')}`
    }

    const size = image.getSize()
    const maxSide = Math.max(size.width || 0, size.height || 0)
    if (maxSide > MAX_FOLDER_COVER_DIMENSION) {
      const scale = MAX_FOLDER_COVER_DIMENSION / maxSide
      image = image.resize({
        width: Math.max(1, Math.round((size.width || MAX_FOLDER_COVER_DIMENSION) * scale)),
        height: Math.max(1, Math.round((size.height || MAX_FOLDER_COVER_DIMENSION) * scale)),
        quality: 'best'
      })
    }

    const jpeg = image.toJPEG(FOLDER_COVER_JPEG_QUALITY)
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

export function readInfoSidecarMetadata(audioPath) {
  if (typeof audioPath !== 'string' || !audioPath) return null

  try {
    const dirPath = dirname(audioPath)
    if (!isInfoSidecarDir(dirPath)) return null

    const metadataPath = join(dirPath, INFO_SIDECAR_METADATA_FILE)
    if (!fs.existsSync(metadataPath)) return null

    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null

    return {
      id: String(parsed.id || basename(dirPath).replace(/\.info$/i, '')).trim(),
      name: String(parsed.name || '').trim(),
      duration: Number(parsed.duration) > 0 ? Number(parsed.duration) : null,
      bpm: Number(parsed.bpm) > 0 ? Math.round(Number(parsed.bpm)) : null
    }
  } catch {
    return null
  }
}

export function findInfoSidecarCoverDataUrl(audioPath, sidecar = readInfoSidecarMetadata(audioPath)) {
  if (typeof audioPath !== 'string' || !audioPath || !sidecar) return null

  try {
    const dirPath = dirname(audioPath)
    if (!isInfoSidecarDir(dirPath)) return null
    const cacheKey = `${dirPath}\u0001${basename(audioPath)}\u0001${getDirectoryMtimeMs(dirPath)}`
    const cached = readCoverCache(infoSidecarCoverCache, cacheKey)
    if (cached !== undefined) return cached

    const audioStem = normalizeImageStem(basename(audioPath, extname(audioPath)))
    const packageId = normalizeImageStem(sidecar.id || basename(dirPath).replace(/\.info$/i, ''))
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const images = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(dirPath, entry.name))
      .filter((filePath) => FOLDER_COVER_EXTS.has(extname(filePath).toLowerCase()))

    if (!images.length) return null

    const nonThumbnailImages = images.filter(
      (filePath) => !/_thumbnail$/i.test(basename(filePath, extname(filePath)))
    )
    const onlyNonThumbnail =
      nonThumbnailImages.length === 1 ? normalizeImageStem(basename(nonThumbnailImages[0], extname(nonThumbnailImages[0]))) : ''

    const scored = images
      .map((filePath) => {
        const stem = normalizeImageStem(basename(filePath, extname(filePath)))
        let score = Number.POSITIVE_INFINITY
        if (onlyNonThumbnail && stem === onlyNonThumbnail) score = 0
        else if (audioStem && stem === audioStem) score = 1
        else if (audioStem && stem === `${audioStem}_thumbnail`) score = 2
        else if (packageId && stem === packageId) score = 3
        else if (packageId && stem === `${packageId}_thumbnail`) score = 4
        else if (images.length === 1) score = 10
        return { filePath, score }
      })
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => a.score - b.score)

    for (const candidate of scored) {
      const dataUrl = compressImageFileToDataUrl(candidate.filePath)
      if (dataUrl) return writeCoverCache(infoSidecarCoverCache, cacheKey, dataUrl)
    }
    writeCoverCache(infoSidecarCoverCache, cacheKey, null)
  } catch {
    return null
  }

  return null
}

function findFolderCoverDataUrlInDirectory(dirPath) {
  if (!dirPath) return null

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const images = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(dirPath, entry.name))
      .filter((filePath) => FOLDER_COVER_EXTS.has(extname(filePath).toLowerCase()))

    const candidates = (images.length === 1 ? images : images.filter(isPreferredFolderCoverCandidate))
      .sort((a, b) => scoreFolderCoverName(a) - scoreFolderCoverName(b))

    for (const candidate of candidates) {
      const dataUrl = compressImageFileToDataUrl(candidate)
      if (dataUrl) return dataUrl
    }
  } catch {
    return null
  }

  return null
}

export function findFolderCoverDataUrl(audioPath, { albumName = '' } = {}) {
  if (typeof audioPath !== 'string' || !audioPath) return null

  const dirPath = dirname(audioPath)
  const parentDir = dirname(dirPath)
  const cacheKey = [
    dirPath,
    normalizeCoverDirectoryText(albumName),
    getDirectoryMtimeMs(dirPath),
    parentDir && parentDir !== dirPath ? getDirectoryMtimeMs(parentDir) : 0
  ].join('\u0001')
  const cached = readCoverCache(folderCoverCache, cacheKey)
  if (cached !== undefined) return cached

  const directCover = findFolderCoverDataUrlInDirectory(dirPath)
  if (directCover) return writeCoverCache(folderCoverCache, cacheKey, directCover)

  if (!parentDir || parentDir === dirPath) {
    writeCoverCache(folderCoverCache, cacheKey, null)
    return null
  }

  const albumKey = normalizeCoverDirectoryText(albumName)
  const parentLooksLikeAlbum =
    albumKey && normalizeCoverDirectoryText(basename(parentDir)) === albumKey
  const currentLooksLikeDiscFolder = looksLikeDiscSubdirectoryName(basename(dirPath))
  if (!parentLooksLikeAlbum && !currentLooksLikeDiscFolder) {
    writeCoverCache(folderCoverCache, cacheKey, null)
    return null
  }

  return writeCoverCache(folderCoverCache, cacheKey, findFolderCoverDataUrlInDirectory(parentDir))
}
