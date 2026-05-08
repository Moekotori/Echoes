import fs from 'fs'
import { nativeImage } from 'electron'
import { basename, dirname, extname, join } from 'path'

const FOLDER_COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const INFO_SIDECAR_METADATA_FILE = 'metadata.json'
const MAX_FOLDER_COVER_DIMENSION = 520
const FOLDER_COVER_JPEG_QUALITY = 78
const PREFERRED_COVER_NAMES = [
  'cover',
  'folder',
  'front',
  'album',
  'artwork',
  'coverart',
  'albumart'
]

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
      if (dataUrl) return dataUrl
    }
  } catch {
    return null
  }

  return null
}

export function findFolderCoverDataUrl(audioPath) {
  if (typeof audioPath !== 'string' || !audioPath) return null

  try {
    const dirPath = dirname(audioPath)
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
