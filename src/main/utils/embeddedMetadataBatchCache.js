import fs from 'fs'
import { dirname, join } from 'path'
import Database from 'better-sqlite3'
import { METADATA_AUTO_COMPLETE_VERSION } from '../../shared/metadataAutoCompleteVersion.mjs'
import { EMBEDDED_COVER_EXTRACTOR_VERSION } from '../../shared/embeddedCoverVersion.mjs'
import {
  COVER_THUMB_CACHE_VERSION,
  getCoverThumbUrl,
  ensureCoverThumbnailCache
} from './coverThumbnailCache.js'
import {
  createEmbeddedCoverRecoveryStats,
  mergeEmbeddedCoverRecoveryStats
} from './embeddedCoverRecovery.js'

const CACHE_DB_NAME = 'metadata-cache-v1.sqlite'
const LEGACY_CACHE_DIR_NAME = 'metadata-cache-v1'
const MAX_BATCH_LIMIT = 256
const MAX_THUMB_ONLY_BATCH_LIMIT = 500
const CACHE_STATE_KEY_LEGACY_IMPORTED = 'legacy-json-imported-v1'

function getStateValue(db, key) {
  const row = db.prepare('SELECT value FROM cache_state WHERE key = ?').get(key)
  return row?.value || ''
}

function setStateValue(db, key, value) {
  db.prepare(
    'INSERT INTO cache_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value || ''))
}

function isStateTruthy(value) {
  return value === '1' || value === 'true'
}

export function getEmbeddedMetadataCacheDbPath(userDataPath = '') {
  return join(userDataPath, CACHE_DB_NAME)
}

function getLegacyMetadataCacheDir(userDataPath = '') {
  return join(userDataPath, LEGACY_CACHE_DIR_NAME)
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

function normalizeThumbOnlyBatchLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_THUMB_ONLY_BATCH_LIMIT
  return Math.min(MAX_THUMB_ONLY_BATCH_LIMIT, Math.max(1, Math.floor(parsed)))
}

function buildFingerprint(seed) {
  return {
    sizeBytes: Number(seed?.sizeBytes || 0) || 0,
    mtimeMs: Number(seed?.mtimeMs || 0) || 0
  }
}

function fingerprintsMatch(record, seed) {
  if (!record || !seed) return false
  const expected = buildFingerprint(seed)
  return (
    Number(record.sizeBytes || 0) === expected.sizeBytes &&
    Number(record.mtimeMs || 0) === expected.mtimeMs
  )
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

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const rawValue = Buffer.isBuffer(value) ? value.toString('utf8') : value
  if (typeof rawValue !== 'string' || !rawValue) return null
  const text = rawValue.replace(/^\uFEFF/, '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') return parseJsonObject(parsed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
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

function applyRecoveredCoverToEntry(entry = {}, recovery = {}) {
  const cover = normalizeText(recovery?.cover)
  if (!cover) return entry
  const coverSource = normalizeBatchSource(recovery.coverSource || 'embedded-batch') || 'embedded-batch'
  const fieldSources =
    entry.fieldSources && typeof entry.fieldSources === 'object' ? entry.fieldSources : {}
  return {
    ...entry,
    cover,
    coverSource,
    coverScope: recovery.coverScope || entry.coverScope || 'album',
    coverChecked: true,
    coverExtractorVersion: normalizeNumber(
      recovery.coverExtractorVersion ||
        entry.coverExtractorVersion ||
        EMBEDDED_COVER_EXTRACTOR_VERSION
    ),
    embeddedPictureCount: Math.max(
      normalizeNonNegativeInteger(entry.embeddedPictureCount),
      normalizeNonNegativeInteger(recovery.embeddedPictureCount)
    ),
    metadataSource: entry.metadataSource || 'embedded-batch',
    fieldSources: {
      ...fieldSources,
      cover: coverSource
    }
  }
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
    codec: technical.codec ?? null,
    bitrateKbps: technical.bitrate ? Math.round(Number(technical.bitrate) / 1000) : null,
    sampleRateHz: technical.sampleRate ?? null,
    bitDepth: technical.bitDepth ?? null,
    channels: technical.channels ?? null,
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

function hasCurrentMetadataVersion(entry = {}) {
  return Number(entry?.metadataAutoCompleteVersion || 0) === METADATA_AUTO_COMPLETE_VERSION
}

function readEmbeddedMetadataCacheRecord(record = {}) {
  if (!record) return null
  const meta = parseJsonObject(record?.meta_json) || parseJsonObject(record?.metaJson)
  if (!meta) {
    return {
      ...record,
      meta: null,
      invalidMeta: true
    }
  }
  return {
    ...record,
    meta
  }
}

function isCachedRecordUsable(record, seed) {
  if (!record || !fingerprintsMatch(record, seed)) return false
  if (!hasCurrentMetadataVersion(record.meta)) return false
  return !hasRetryableMissingEmbeddedCover(record.meta)
}

function hasCurrentCoverThumbnailCache(entry = {}) {
  const coverThumbPath = normalizeText(entry?.coverThumbPath)
  if (!coverThumbPath) return false
  try {
    const stat = fs.statSync(coverThumbPath)
    if (!stat.isFile() || stat.size <= 0) return false
  } catch {
    return false
  }
  return (
    entry?.coverCacheVersion === COVER_THUMB_CACHE_VERSION &&
    normalizeText(entry?.coverKey) &&
    coverThumbPath
  )
}

function attachCoverThumbUrl(entry = {}) {
  const coverThumbUrl = normalizeText(entry?.coverThumbUrl) || getCoverThumbUrl(entry?.coverThumbPath)
  if (!coverThumbUrl || entry.coverThumbUrl === coverThumbUrl) return entry
  return {
    ...entry,
    coverThumbUrl
  }
}

function readValidCoverThumb(coverThumbPath = '') {
  const thumbPath = normalizeText(coverThumbPath)
  if (!thumbPath) return { ok: false, reason: 'noThumbPath', missingThumb: false, bytes: null }
  try {
    const stat = fs.statSync(thumbPath)
    if (!stat.isFile()) {
      return { ok: false, reason: 'missingThumbFile', missingThumb: true, bytes: null }
    }
    if (stat.size <= 0) {
      return { ok: false, reason: 'zeroByteThumb', missingThumb: true, bytes: null }
    }
    return { ok: true, missingThumb: false, bytes: stat.size }
  } catch {
    return { ok: false, reason: 'missingThumbFile', missingThumb: true, bytes: null }
  }
}

function buildThumbOnlyEntry(record = {}) {
  const entry = record?.meta || null
  if (!entry || typeof entry !== 'object') {
    return { reason: 'invalidMeta', missingThumb: false, entry: null }
  }
  const thumbPath = normalizeText(entry.coverThumbPath)
  const thumbState = readValidCoverThumb(thumbPath)
  if (!thumbState.ok) {
    return {
      reason: thumbState.reason || 'missingThumbFile',
      missingThumb: thumbState.missingThumb,
      entry: null
    }
  }
  const coverThumbUrl = normalizeText(entry.coverThumbUrl) || getCoverThumbUrl(thumbPath)
  if (!coverThumbUrl) {
    return {
      reason: 'missingThumbFile',
      missingThumb: true,
      entry: null
    }
  }
  return {
    missingThumb: false,
    entry: {
      path: normalizeText(record.path),
      coverKey: normalizeText(entry.coverKey) || null,
      coverThumbPath: thumbPath,
      coverThumbUrl,
      coverCacheVersion: normalizeNumber(entry.coverCacheVersion),
      coverThumbBytes: normalizeNumber(entry.coverThumbBytes) || thumbState.bytes,
      coverThumbWidth: normalizeNumber(entry.coverThumbWidth),
      coverThumbHeight: normalizeNumber(entry.coverThumbHeight),
      coverSource: normalizeText(entry.coverSource) || null,
      coverChecked: entry.coverChecked === true,
      embeddedPictureCount: normalizeNonNegativeInteger(entry.embeddedPictureCount)
    }
  }
}

function writeThumbOnlyDebugSummary(summary = {}) {
  console.debug('[embeddedMetadataBatchCache] thumb-only summary', {
    requestCount: summary.requestCount,
    uniqueCount: summary.uniqueCount,
    hitCount: summary.hitCount,
    missCount: summary.missCount,
    missingThumbCount: summary.missingThumbCount,
    missNoRecord: summary.missNoRecord,
    missFingerprintMismatch: summary.missFingerprintMismatch,
    missNoThumbPath: summary.missNoThumbPath,
    missInvalidMeta: summary.missInvalidMeta,
    missMissingThumbFile: summary.missMissingThumbFile,
    missZeroByteThumb: summary.missZeroByteThumb,
    seedMissingFingerprint: summary.seedMissingFingerprint,
    elapsedMs: summary.elapsedMs
  })
}

async function maybeAttachCoverThumbnailCache(entry, { userDataPath, imageAdapter } = {}) {
  if (!entry?.cover) return entry
  if (hasCurrentCoverThumbnailCache(entry)) return attachCoverThumbUrl(entry)
  const thumbnail = await ensureCoverThumbnailCache({
    userDataPath,
    coverDataUrl: entry.cover,
    coverSource: entry.coverSource,
    imageAdapter
  })
  if (!thumbnail) return entry
  return {
    ...entry,
    ...thumbnail
  }
}

function openEmbeddedMetadataCacheDb(userDataPath = '') {
  const dbPath = getEmbeddedMetadataCacheDbPath(userDataPath)
  fs.mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS embedded_metadata_cache (
      path TEXT PRIMARY KEY,
      sizeBytes INTEGER NOT NULL,
      mtimeMs INTEGER NOT NULL,
      meta_json TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embedded_metadata_cache_updatedAt
      ON embedded_metadata_cache(updatedAt);
  `)
  const columns = db.prepare('PRAGMA table_info(embedded_metadata_cache)').all()
  const columnNames = new Set(columns.map((column) => column.name))
  if (columnNames.has('metaJson') && !columnNames.has('meta_json')) {
    db.exec(`
      ALTER TABLE embedded_metadata_cache ADD COLUMN meta_json TEXT;
      UPDATE embedded_metadata_cache
      SET meta_json = metaJson
      WHERE meta_json IS NULL AND metaJson IS NOT NULL;
    `)
  } else if (columnNames.has('metaJson') && columnNames.has('meta_json')) {
    db.exec(`
      UPDATE embedded_metadata_cache
      SET meta_json = metaJson
      WHERE (meta_json IS NULL OR meta_json = '') AND metaJson IS NOT NULL AND metaJson != '';
    `)
  }
  return db
}

function importLegacyEmbeddedMetadataCache(db, userDataPath = '') {
  if (isStateTruthy(getStateValue(db, CACHE_STATE_KEY_LEGACY_IMPORTED))) return 0

  const legacyDir = getLegacyMetadataCacheDir(userDataPath)
  const legacyFiles = fs.existsSync(legacyDir)
    ? fs.readdirSync(legacyDir).filter((fileName) => fileName.endsWith('.json'))
    : []

  if (legacyFiles.length === 0) {
    setStateValue(db, CACHE_STATE_KEY_LEGACY_IMPORTED, '1')
    return 0
  }

  const insertRecord = db.prepare(`
    INSERT INTO embedded_metadata_cache (path, sizeBytes, mtimeMs, meta_json, updatedAt)
    VALUES (@path, @sizeBytes, @mtimeMs, @meta_json, @updatedAt)
    ON CONFLICT(path) DO UPDATE SET
      sizeBytes = excluded.sizeBytes,
      mtimeMs = excluded.mtimeMs,
      meta_json = excluded.meta_json,
      updatedAt = excluded.updatedAt
  `)

  let importedCount = 0
  const importTransaction = db.transaction(() => {
    for (const fileName of legacyFiles) {
      const payload = readJsonFile(join(legacyDir, fileName))
      for (const record of Object.values(payload || {})) {
        const path = typeof record?.path === 'string' ? record.path.trim() : ''
        const meta = record?.meta
        if (!path || !meta || typeof meta !== 'object') continue
        const fingerprint = buildFingerprint(record?.fingerprint || {})
        insertRecord.run({
          path,
          sizeBytes: fingerprint.sizeBytes,
          mtimeMs: fingerprint.mtimeMs,
          meta_json: JSON.stringify(meta),
          updatedAt: Number(record?.updatedAt) || 0
        })
        importedCount += 1
      }
    }
    setStateValue(db, CACHE_STATE_KEY_LEGACY_IMPORTED, '1')
  })

  importTransaction()
  return importedCount
}

function deleteCachedRecord(db, path) {
  db.prepare('DELETE FROM embedded_metadata_cache WHERE path = ?').run(path)
}

function hasLegacyMetaJsonColumn(db) {
  const columns = db.prepare('PRAGMA table_info(embedded_metadata_cache)').all()
  return columns.some((column) => column.name === 'metaJson')
}

function getCachedRecord(db, path, options = {}) {
  const hasLegacyMetaJson = options.hasLegacyMetaJson === true
  const row = db
    .prepare(
      hasLegacyMetaJson
        ? 'SELECT path, sizeBytes, mtimeMs, meta_json, metaJson, updatedAt FROM embedded_metadata_cache WHERE path = ?'
        : 'SELECT path, sizeBytes, mtimeMs, meta_json, updatedAt FROM embedded_metadata_cache WHERE path = ?'
    )
    .get(path)
  if (!row) return null
  return readEmbeddedMetadataCacheRecord(row)
}

export async function readTrackFullCoverFromEmbeddedMetadataCache({
  userDataPath = '',
  path = '',
  coverThumbnailImageAdapter
} = {}) {
  const trackPath = typeof path === 'string' ? path.trim() : ''
  if (!userDataPath || !trackPath) {
    return { ok: false, cover: null, error: 'invalid_request' }
  }

  let db = null
  try {
    db = openEmbeddedMetadataCacheDb(userDataPath)
    const hasLegacyMetaJson = hasLegacyMetaJsonColumn(db)
    const record = getCachedRecord(db, trackPath, { hasLegacyMetaJson })
    const entry = record?.meta || null
    const cover = normalizeText(entry?.cover)
    if (!cover) {
      return { ok: false, cover: null, error: record ? 'cover_not_found' : 'cache_miss' }
    }
    let entryWithThumb = entry
    const existingThumbState = readValidCoverThumb(entryWithThumb.coverThumbPath)
    if (!existingThumbState.ok) {
      const thumbnail = await ensureCoverThumbnailCache({
        userDataPath,
        coverDataUrl: cover,
        coverSource: entryWithThumb.coverSource || 'embedded-batch',
        imageAdapter: coverThumbnailImageAdapter
      })
      if (thumbnail) {
        entryWithThumb = {
          ...entryWithThumb,
          ...thumbnail,
          coverSource: entryWithThumb.coverSource || 'embedded-batch'
        }
        try {
          upsertCachedRecord(db, { path: trackPath, ...record }, entryWithThumb)
        } catch {
          /* keep returning the full cover even if thumbnail write-back fails */
        }
      }
    } else {
      entryWithThumb = {
        ...attachCoverThumbUrl(entryWithThumb),
        coverThumbBytes: normalizeNumber(entryWithThumb.coverThumbBytes) || existingThumbState.bytes
      }
      if (entryWithThumb !== entry) {
        try {
          upsertCachedRecord(db, { path: trackPath, ...record }, entryWithThumb)
        } catch {
          /* ignore thumbnail url write-back errors */
        }
      }
    }
    return {
      ok: true,
      cover,
      coverKey: normalizeText(entryWithThumb.coverKey) || null,
      coverThumbPath: normalizeText(entryWithThumb.coverThumbPath) || null,
      coverThumbUrl:
        normalizeText(entryWithThumb.coverThumbUrl) || getCoverThumbUrl(entryWithThumb.coverThumbPath),
      coverCacheVersion: normalizeNumber(entryWithThumb.coverCacheVersion),
      coverThumbBytes: normalizeNumber(entryWithThumb.coverThumbBytes),
      coverThumbWidth: normalizeNumber(entryWithThumb.coverThumbWidth),
      coverThumbHeight: normalizeNumber(entryWithThumb.coverThumbHeight),
      coverSource: normalizeText(entryWithThumb.coverSource) || null
    }
  } catch (error) {
    return { ok: false, cover: null, error: error?.message || String(error) }
  } finally {
    try {
      db?.close()
    } catch {
      /* ignore db close errors */
    }
  }
}

export function readCoverThumbBatchFromEmbeddedMetadataCache({
  userDataPath = '',
  seeds = [],
  options = {}
} = {}) {
  const limit = normalizeThumbOnlyBatchLimit(options?.limit)
  const unique = new Map()
  let seedMissingFingerprintCount = 0
  for (const seed of Array.isArray(seeds) ? seeds : []) {
    const normalized = normalizeSeed(seed)
    if (!normalized || unique.has(normalized.path)) continue
    if (!(normalized.sizeBytes > 0) || !(normalized.mtimeMs > 0)) seedMissingFingerprintCount += 1
    unique.set(normalized.path, normalized)
    if (unique.size >= limit) break
  }

  const entries = {}
  const hitPaths = []
  const missPaths = []
  const missingThumbPaths = []
  const missingThumb = {}
  const missReasons = {
    noRecord: [],
    fingerprintMismatch: [],
    noThumbPath: [],
    invalidMeta: [],
    missingThumbFile: [],
    zeroByteThumb: []
  }
  const errors = {}
  const startedAt = Date.now()
  const recordMiss = (path, reason) => {
    if (path) missPaths.push(path)
    if (Array.isArray(missReasons[reason])) missReasons[reason].push(path)
    if (reason === 'missingThumbFile' || reason === 'zeroByteThumb') {
      missingThumbPaths.push(path)
      missingThumb[path] = true
    }
  }

  if (!userDataPath || unique.size === 0) {
    return {
      ok: true,
      entries,
      hitPaths,
      missPaths,
      missingThumbPaths,
      missingThumb,
      missReasons,
      thumbOnlyMissNoRecord: 0,
      thumbOnlyMissFingerprintMismatch: 0,
      thumbOnlyMissNoThumbPath: 0,
      thumbOnlyMissInvalidMeta: 0,
      thumbOnlyMissMissingThumbFile: 0,
      thumbOnlyMissZeroByteThumb: 0,
      thumbOnlySeedMissingFingerprint: seedMissingFingerprintCount,
      thumbOnlyRequestUniqueCount: unique.size,
      errors,
      elapsedMs: 0
    }
  }

  let db = null
  try {
    db = openEmbeddedMetadataCacheDb(userDataPath)
    const hasLegacyMetaJson = hasLegacyMetaJsonColumn(db)

    for (const seed of unique.values()) {
      let cachedRecord = null
      try {
        cachedRecord = getCachedRecord(db, seed.path, { hasLegacyMetaJson })
      } catch (error) {
        recordMiss(seed.path, 'invalidMeta')
        errors[seed.path] = error?.message || String(error)
        continue
      }
      if (!cachedRecord) {
        recordMiss(seed.path, 'noRecord')
        continue
      }
      if (cachedRecord.invalidMeta || !cachedRecord.meta) {
        recordMiss(seed.path, 'invalidMeta')
        continue
      }
      if (!fingerprintsMatch(cachedRecord, seed)) {
        recordMiss(seed.path, 'fingerprintMismatch')
        continue
      }
      const thumb = buildThumbOnlyEntry(cachedRecord)
      if (thumb?.entry) {
        entries[seed.path] = thumb.entry
        hitPaths.push(seed.path)
      } else {
        recordMiss(seed.path, thumb?.reason || 'invalidMeta')
      }
    }
  } catch (error) {
    errors.__global = error?.message || String(error)
    for (const seed of unique.values()) {
      if (!missPaths.includes(seed.path) && !hitPaths.includes(seed.path)) {
        recordMiss(seed.path, 'invalidMeta')
      }
    }
  } finally {
    try {
      db?.close()
    } catch {
      /* ignore db close errors */
    }
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  writeThumbOnlyDebugSummary({
    requestCount: unique.size,
    uniqueCount: unique.size,
    hitCount: hitPaths.length,
    missCount: missPaths.length,
    missingThumbCount: missingThumbPaths.length,
    missNoRecord: missReasons.noRecord.length,
    missFingerprintMismatch: missReasons.fingerprintMismatch.length,
    missNoThumbPath: missReasons.noThumbPath.length,
    missInvalidMeta: missReasons.invalidMeta.length,
    missMissingThumbFile: missReasons.missingThumbFile.length,
    missZeroByteThumb: missReasons.zeroByteThumb.length,
    seedMissingFingerprint: seedMissingFingerprintCount,
    elapsedMs
  })

  return {
    ok: true,
    entries,
    hitPaths,
    missPaths,
    missingThumbPaths,
    missingThumb,
    missReasons,
    thumbOnlyMissNoRecord: missReasons.noRecord.length,
    thumbOnlyMissFingerprintMismatch: missReasons.fingerprintMismatch.length,
    thumbOnlyMissNoThumbPath: missReasons.noThumbPath.length,
    thumbOnlyMissInvalidMeta: missReasons.invalidMeta.length,
    thumbOnlyMissMissingThumbFile: missReasons.missingThumbFile.length,
    thumbOnlyMissZeroByteThumb: missReasons.zeroByteThumb.length,
    thumbOnlySeedMissingFingerprint: seedMissingFingerprintCount,
    thumbOnlyRequestUniqueCount: unique.size,
    errors,
    elapsedMs
  }
}

function upsertCachedRecord(db, seed, entry) {
  db.prepare(`
    INSERT INTO embedded_metadata_cache (path, sizeBytes, mtimeMs, meta_json, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      sizeBytes = excluded.sizeBytes,
      mtimeMs = excluded.mtimeMs,
      meta_json = excluded.meta_json,
      updatedAt = excluded.updatedAt
  `).run(
    seed.path,
    Number(seed.sizeBytes || 0) || 0,
    Number(seed.mtimeMs || 0) || 0,
    JSON.stringify(entry),
    Date.now()
  )
}

export async function readEmbeddedMetadataBatch({
  seeds = [],
  options = {},
  userDataPath = '',
  readMetadata,
  recoverCover,
  coverThumbnailImageAdapter
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
  const batchStats = {
    sqliteHitCount: 0,
    legacyImportedCount: 0,
    parsedCount: 0,
    failedCount: 0,
    retryableEmbeddedCoverMissingCount: 0,
    sqliteErrorCount: 0,
    elapsedMs: 0,
    ...createEmbeddedCoverRecoveryStats()
  }
  const startedAt = Date.now()

  if (!userDataPath || typeof readMetadata !== 'function' || unique.size === 0) {
    return {
      ok: true,
      entries,
      cachedPaths,
      parsedPaths,
      failedPaths,
      errors,
      recoveryStats: createEmbeddedCoverRecoveryStats()
    }
  }

  let db = null
  let hasLegacyMetaJson = false
  try {
    try {
      db = openEmbeddedMetadataCacheDb(userDataPath)
      hasLegacyMetaJson = hasLegacyMetaJsonColumn(db)
    } catch (error) {
      batchStats.sqliteErrorCount += 1
      console.debug('[embeddedMetadataBatchCache] sqlite open failed', error?.message || error)
    }

    if (db) {
      try {
        batchStats.legacyImportedCount = importLegacyEmbeddedMetadataCache(db, userDataPath)
      } catch (error) {
        batchStats.sqliteErrorCount += 1
        console.debug('[embeddedMetadataBatchCache] legacy import failed', error?.message || error)
      }
    }

    for (const seed of unique.values()) {
      let cachedRecord = null
      if (db) {
        try {
          cachedRecord = getCachedRecord(db, seed.path, { hasLegacyMetaJson })
        } catch (error) {
          batchStats.sqliteErrorCount += 1
          console.debug('[embeddedMetadataBatchCache] sqlite read failed', error?.message || error)
        }
      }
      if (cachedRecord && !force && isCachedRecordUsable(cachedRecord, seed)) {
        const entry = await maybeAttachCoverThumbnailCache(cachedRecord.meta, {
          userDataPath,
          imageAdapter: coverThumbnailImageAdapter
        })
        entries[seed.path] = entry
        cachedPaths.push(seed.path)
        batchStats.sqliteHitCount += 1
        if (entry !== cachedRecord.meta && db) {
          try {
            upsertCachedRecord(db, seed, entry)
          } catch (error) {
            batchStats.sqliteErrorCount += 1
            console.debug('[embeddedMetadataBatchCache] sqlite write failed', error?.message || error)
          }
        }
        continue
      }

      if (cachedRecord && !cachedRecord.meta && db) {
        try {
          deleteCachedRecord(db, seed.path)
        } catch (error) {
          batchStats.sqliteErrorCount += 1
          console.debug('[embeddedMetadataBatchCache] sqlite delete failed', error?.message || error)
        }
      }

      try {
        const data = await readMetadata(seed.path)
        let entry = normalizeEntryFromExtendedMetadata(data, seed)
        if (!entry) {
          failedPaths.push(seed.path)
          errors[seed.path] = data?.error || 'metadata_parse_failed'
          continue
        }
        if (hasRetryableMissingEmbeddedCover(entry)) {
          if (typeof recoverCover === 'function') {
            try {
              const recovery = await recoverCover(seed.path, {
                seed,
                entry,
                options,
                userDataPath
              })
              mergeEmbeddedCoverRecoveryStats(batchStats, recovery?.recoveryStats)
              if (recovery?.cover) {
                entry = applyRecoveredCoverToEntry(entry, recovery)
              }
            } catch (error) {
              batchStats.embeddedCoverRecoveryAttempted += 1
              batchStats.embeddedCoverRecoveryFailed += 1
              batchStats.embeddedCoverRecoveryError += 1
            }
          }
          if (hasRetryableMissingEmbeddedCover(entry)) {
            batchStats.retryableEmbeddedCoverMissingCount += 1
            if (db) {
              try {
                deleteCachedRecord(db, seed.path)
              } catch (error) {
                batchStats.sqliteErrorCount += 1
                console.debug(
                  '[embeddedMetadataBatchCache] sqlite delete failed',
                  error?.message || error
                )
              }
            }
            failedPaths.push(seed.path)
            errors[seed.path] = 'embedded_cover_missing'
            continue
          }
        }
        const entryWithThumbnail = await maybeAttachCoverThumbnailCache(entry, {
          userDataPath,
          imageAdapter: coverThumbnailImageAdapter
        })
        entries[seed.path] = entryWithThumbnail
        parsedPaths.push(seed.path)
        if (db) {
          try {
            upsertCachedRecord(db, seed, entryWithThumbnail)
          } catch (error) {
            batchStats.sqliteErrorCount += 1
            console.debug('[embeddedMetadataBatchCache] sqlite write failed', error?.message || error)
          }
        }
      } catch (error) {
        failedPaths.push(seed.path)
        errors[seed.path] = error?.message || String(error || '')
      }
    }
  } finally {
    batchStats.parsedCount = parsedPaths.length
    batchStats.failedCount = failedPaths.length
    batchStats.elapsedMs = Math.max(0, Date.now() - startedAt)
    console.debug('[embeddedMetadataBatchCache] batch summary', batchStats)
    try {
      db?.close()
    } catch {
      /* ignore db close errors */
    }
  }

  return {
    ok: true,
    entries,
    cachedPaths,
    parsedPaths,
    failedPaths,
    errors,
    recoveryStats: Object.fromEntries(
      Object.keys(createEmbeddedCoverRecoveryStats()).map((key) => [key, batchStats[key] || 0])
    )
  }
}
