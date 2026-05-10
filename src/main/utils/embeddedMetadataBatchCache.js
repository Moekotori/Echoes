import fs from 'fs'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { METADATA_AUTO_COMPLETE_VERSION } from '../../shared/metadataAutoCompleteVersion.mjs'

const CACHE_DIR_NAME = 'metadata-cache-v1'
const SHARD_COUNT = 64
const MAX_BATCH_LIMIT = 256

function hashText(value = '') {
  return createHash('sha1').update(String(value || '')).digest('hex')
}

function normalizeSeed(seed = {}) {
  const path = typeof seed?.path === 'string' ? seed.path.trim() : ''
  if (!path) return null
  const sizeBytes = Number(seed.sizeBytes || seed.info?.sizeBytes || 0)
  const mtimeMs = Number(seed.mtimeMs || seed.info?.mtimeMs || 0)
  return {
    path,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
    mtimeMs: Number.isFinite(mtimeMs) && mtimeMs > 0 ? mtimeMs : 0
  }
}

function normalizeBatchLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 64
  return Math.min(MAX_BATCH_LIMIT, Math.max(1, Math.floor(parsed)))
}

function buildFingerprint(seed) {
  return {
    sizeBytes: Number(seed?.sizeBytes || 0) || 0,
    mtimeMs: Number(seed?.mtimeMs || 0) || 0
  }
}

function fingerprintsMatch(record, seed) {
  if (!record?.fingerprint) return false
  const expected = buildFingerprint(seed)
  return (
    Number(record.fingerprint.sizeBytes || 0) === expected.sizeBytes &&
    Number(record.fingerprint.mtimeMs || 0) === expected.mtimeMs
  )
}

function getShardName(path) {
  const hash = hashText(path)
  const shardIndex = Number.parseInt(hash.slice(0, 8), 16) % SHARD_COUNT
  return `${String(shardIndex).padStart(2, '0')}.json`
}

function getCacheDir(userDataPath) {
  return join(userDataPath, CACHE_DIR_NAME)
}

function getShardPath(userDataPath, path) {
  return join(getCacheDir(userDataPath), getShardName(path))
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeNonNegativeInteger(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

function normalizeBatchSource(source) {
  const value = String(source || '').trim()
  return value === 'embedded' ? 'embedded-batch' : value
}

function normalizeBatchFieldSources(fieldSources = {}) {
  const normalized = {}
  for (const [field, source] of Object.entries(fieldSources || {})) {
    const nextSource = normalizeBatchSource(source)
    if (nextSource) normalized[field] = nextSource
  }
  return normalized
}

function hasRetryableMissingEmbeddedCover(entry = {}) {
  return Number(entry?.embeddedPictureCount || 0) > 0 && !normalizeText(entry?.cover)
}

function normalizeEntryFromExtendedMetadata(data = {}, seed = {}) {
  if (!data?.success) return null
  const common = data.common || {}
  const technical = data.technical || {}
  const fieldSources =
    common.fieldSources && typeof common.fieldSources === 'object' ? common.fieldSources : {}
  const normalizedFieldSources = normalizeBatchFieldSources(fieldSources)
  const coverSource = normalizeBatchSource(common.coverSource)
  return {
    title: normalizeText(common.title) || null,
    artist: normalizeText(common.artist) || null,
    album: normalizeText(common.album) || null,
    albumArtist: normalizeText(common.albumArtist) || null,
    trackNo: normalizeNumber(common.trackNo),
    year: normalizeNumber(common.year),
    genre: normalizeText(common.genre) || null,
    duration: normalizeNumber(technical.duration),
    codec: normalizeText(technical.codec) || null,
    bitrateKbps: technical.bitrate ? Math.round(Number(technical.bitrate) / 1000) : null,
    sampleRateHz: normalizeNumber(technical.sampleRate),
    bitDepth: normalizeNumber(technical.bitDepth),
    channels: normalizeNumber(technical.channels),
    cover: normalizeText(common.cover) || null,
    coverScope: common.coverScope || null,
    coverSource: coverSource || null,
    coverChecked: common.coverChecked === true,
    coverExtractorVersion: normalizeNumber(common.coverExtractorVersion),
    coverThumbnailOnly: common.coverThumbnailOnly === true,
    coverMaxDimension: normalizeNumber(common.coverMaxDimension),
    embeddedPictureCount: normalizeNonNegativeInteger(common.embeddedPictureCount),
    metadataSource:
      normalizeBatchSource(common.metadataSource) ||
      (Object.keys(normalizedFieldSources).length ? 'embedded-batch' : null),
    fieldSources: normalizedFieldSources,
    metadataDetailMode: 'embedded-batch',
    metadataAutoCompleteSource: 'embedded-batch',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: seed.sizeBytes || null,
    mtimeMs: seed.mtimeMs || null
  }
}

function normalizeCachedEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null
  const normalized = normalizeEntryFromExtendedMetadata(
    {
      success: true,
      common: {
        ...entry,
        fieldSources: entry.fieldSources || {}
      },
      technical: {
        duration: entry.duration,
        codec: entry.codec,
        bitrate: entry.bitrateKbps ? Number(entry.bitrateKbps) * 1000 : null,
        sampleRate: entry.sampleRateHz,
        bitDepth: entry.bitDepth,
        channels: entry.channels
      }
    },
    entry
  )
  return normalized
}

function isCachedRecordUsable(record, seed) {
  if (!fingerprintsMatch(record, seed)) return false
  if (Number(record?.meta?.metadataAutoCompleteVersion || 0) !== METADATA_AUTO_COMPLETE_VERSION) {
    return false
  }
  return !hasRetryableMissingEmbeddedCover(record?.meta)
}

export async function readEmbeddedMetadataBatch({
  seeds = [],
  options = {},
  userDataPath = '',
  readMetadata
} = {}) {
  const limit = normalizeBatchLimit(options?.limit)
  const force = options?.force === true
  const unique = new Map()
  for (const seed of Array.isArray(seeds) ? seeds : []) {
    const normalized = normalizeSeed(seed)
    if (!normalized || unique.has(normalized.path)) continue
    unique.set(normalized.path, normalized)
    if (unique.size >= limit) break
  }

  const entries = {}
  const cachedPaths = []
  const parsedPaths = []
  const failedPaths = []
  const errors = {}

  if (!userDataPath || typeof readMetadata !== 'function' || unique.size === 0) {
    return { ok: true, entries, cachedPaths, parsedPaths, failedPaths, errors }
  }

  const shardCache = new Map()
  const getShard = (path) => {
    const shardPath = getShardPath(userDataPath, path)
    if (!shardCache.has(shardPath)) {
      shardCache.set(shardPath, {
        path: shardPath,
        records: readJsonFile(shardPath),
        changed: false
      })
    }
    return shardCache.get(shardPath)
  }

  for (const seed of unique.values()) {
    const shard = getShard(seed.path)
    const record = shard.records[seed.path]
    if (!force && isCachedRecordUsable(record, seed)) {
      const entry = normalizeCachedEntry(record.meta)
      if (entry) {
        entries[seed.path] = entry
        cachedPaths.push(seed.path)
        continue
      }
    }

    try {
      const data = await readMetadata(seed.path)
      const entry = normalizeEntryFromExtendedMetadata(data, seed)
      if (!entry) {
        failedPaths.push(seed.path)
        errors[seed.path] = data?.error || 'metadata_parse_failed'
        continue
      }
      if (hasRetryableMissingEmbeddedCover(entry)) {
        delete shard.records[seed.path]
        shard.changed = true
        failedPaths.push(seed.path)
        errors[seed.path] = 'embedded_cover_missing'
        continue
      }
      entries[seed.path] = entry
      parsedPaths.push(seed.path)
      shard.records[seed.path] = {
        path: seed.path,
        fingerprint: buildFingerprint(seed),
        meta: entry,
        updatedAt: Date.now()
      }
      shard.changed = true
    } catch (error) {
      failedPaths.push(seed.path)
      errors[seed.path] = error?.message || String(error || '')
    }
  }

  for (const shard of shardCache.values()) {
    if (shard.changed) writeJsonFile(shard.path, shard.records)
  }

  return { ok: true, entries, cachedPaths, parsedPaths, failedPaths, errors }
}
