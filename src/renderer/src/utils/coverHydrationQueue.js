import { mergeTrackMetaEntryPreservingCover } from './trackMetaCache.js'
import { hasRealTrackCover } from './trackUtils.js'

export const DEFAULT_COVER_HYDRATION_BATCH_SIZE = 24
export const DEFAULT_COVER_HYDRATION_CONCURRENCY = 3
export const DEFAULT_COVER_HYDRATION_DEBOUNCE_MS = 100
export const DEFAULT_ALBUM_COVER_HYDRATION_TRACK_LIMIT = 5
export const DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT = 120
export const DEFAULT_LIST_COVER_PREWARM_WINDOW_LIMIT = 64
export const DEFAULT_LIST_COVER_IDLE_PREWARM_LIMIT = 160
export const DEFAULT_LIST_COVER_IDLE_PREWARM_SCAN_LIMIT = 640
export const DEFAULT_COVER_THUMB_ONLY_BATCH_LIMIT = 400

const EMBEDDED_COVER_RECOVERY_STAT_KEYS = [
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

function normalizeTrackList(trackOrTracks) {
  if (Array.isArray(trackOrTracks)) return trackOrTracks.filter(Boolean)
  return trackOrTracks ? [trackOrTracks] : []
}

function readPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function normalizeTrackSeed(track, currentMeta = null) {
  if (typeof track === 'string') {
    const path = track.trim()
    return path
      ? {
          path,
          sizeBytes: readPositiveNumber(currentMeta?.sizeBytes),
          mtimeMs: readPositiveNumber(currentMeta?.mtimeMs),
          track: { path }
        }
      : null
  }
  if (!track || typeof track !== 'object') return null
  const path = typeof track.path === 'string' ? track.path.trim() : ''
  if (!path) return null
  const info = track.info || {}
  return {
    path,
    sizeBytes: readPositiveNumber(
      track.sizeBytes,
      info.sizeBytes,
      track.fileSizeBytes,
      info.fileSizeBytes,
      track.fileSize,
      info.fileSize,
      currentMeta?.sizeBytes
    ),
    mtimeMs: readPositiveNumber(
      track.mtimeMs,
      info.mtimeMs,
      track.modifiedTimeMs,
      info.modifiedTimeMs,
      track.lastModified,
      info.lastModified,
      currentMeta?.mtimeMs
    ),
    track
  }
}

function normalizeHydrationSeed(track, currentMeta = null) {
  return normalizeTrackSeed(track, currentMeta)
}

function hasTrackThumbnailSource(track = null, ...entries) {
  for (const entry of [track, ...entries]) {
    if (!entry || typeof entry !== 'object') continue
    const thumbUrl = typeof entry.coverThumbUrl === 'string' ? entry.coverThumbUrl.trim() : ''
    if (thumbUrl) return true
    const thumbPath = typeof entry.coverThumbPath === 'string' ? entry.coverThumbPath.trim() : ''
    if (thumbPath) return true
    if (entry.info && typeof entry.info === 'object' && hasTrackThumbnailSource(entry.info)) {
      return true
    }
  }
  return false
}

export function hasHydratableCoverSource(track = null, currentMeta = null) {
  return hasRealTrackCover(track, currentMeta)
}

function mergeHydratedEntry(currentEntry = {}, entry = {}, seed = {}) {
  return mergeTrackMetaEntryPreservingCover(currentEntry || {}, {
    ...entry,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  })
}

function shouldLog(isDebugEnabled) {
  try {
    return typeof isDebugEnabled === 'function' ? isDebugEnabled() === true : isDebugEnabled === true
  } catch {
    return false
  }
}

function summarizePath(path = '') {
  const value = String(path || '')
  const basename = value.split(/[\\/]/).filter(Boolean).pop() || value || 'unknown'
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return `${basename}#${hash.toString(16).padStart(8, '0').slice(-8)}`
}

function classifyHydrationError(error = '') {
  const value = String(error || '').toLowerCase()
  if (value.includes('embedded_cover_missing')) return 'embeddedCoverMissing'
  if (
    value.includes('enoent') ||
    value.includes('file_missing') ||
    value.includes('not_found') ||
    value.includes('not found') ||
    value.includes('missing file')
  ) {
    return 'fileMissing'
  }
  return 'other'
}

export function selectAlbumCoverHydrationTracks(
  album = {},
  {
    trackMetaMap = {},
    effectiveTrackMetaMap = {},
    maxTracks = DEFAULT_ALBUM_COVER_HYDRATION_TRACK_LIMIT,
    isLocalTrack = null
  } = {}
) {
  const tracks = Array.isArray(album?.tracks) ? album.tracks : []
  const limit = Math.max(1, Number(maxTracks) || DEFAULT_ALBUM_COVER_HYDRATION_TRACK_LIMIT)
  if (
    hasRealTrackCover(album) ||
    (Array.isArray(album?.coverCandidates) &&
      album.coverCandidates.some((cover) => hasRealTrackCover({ cover })))
  ) {
    return []
  }

  const hasReadyAlbumCover = tracks.some((track) => {
    const path = track?.path || ''
    const entry = path ? effectiveTrackMetaMap[path] || trackMetaMap[path] || null : null
    return hasTrackThumbnailSource(track, entry)
  })
  if (hasReadyAlbumCover) return []

  const candidates = []
  const seen = new Set()
  for (const track of tracks) {
    const path = typeof track?.path === 'string' ? track.path.trim() : ''
    if (!path || seen.has(path)) continue
    if (typeof isLocalTrack === 'function' && !isLocalTrack(track)) continue
    seen.add(path)
    candidates.push(track)
    if (candidates.length >= limit) break
  }
  return candidates
}

export function selectListCoverHydrationPrewarmTracks(
  tracks = [],
  {
    visibleRange = null,
    trackMetaMap = {},
    effectiveTrackMetaMap = {},
    maxInitialTracks = DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT,
    maxWindowTracks = DEFAULT_LIST_COVER_PREWARM_WINDOW_LIMIT,
    isLocalTrack = null
  } = {}
) {
  const list = Array.isArray(tracks) ? tracks : []
  const candidates = []
  const seen = new Set()
  const shouldSelect = (track) => {
    const path = track?.path
    if (!path || seen.has(path)) return false
    if (typeof isLocalTrack === 'function' && !isLocalTrack(track)) return false
    const entry = effectiveTrackMetaMap[path] || trackMetaMap[path] || null
    return !hasTrackThumbnailSource(track, entry)
  }
  const pushTrack = (track) => {
    if (!shouldSelect(track)) return false
    seen.add(track.path)
    candidates.push(track)
    return true
  }

  const initialLimit = Math.max(0, Number(maxInitialTracks) || 0)
  for (const track of list.slice(0, initialLimit)) pushTrack(track)

  const windowLimit = Math.max(0, Number(maxWindowTracks) || 0)
  if (visibleRange && windowLimit > 0 && list.length > 0) {
    const startIndex = Math.max(0, Number(visibleRange.startIndex) || 0)
    const explicitEnd = Math.max(startIndex, Number(visibleRange.endIndex) || 0)
    const endIndex = Math.min(list.length, Math.max(explicitEnd, startIndex + windowLimit))
    let windowCount = 0
    for (let index = startIndex; index < endIndex && windowCount < windowLimit; index += 1) {
      if (pushTrack(list[index])) windowCount += 1
    }
  }

  return candidates
}

export function selectListCoverHydrationIdlePrewarmTracks(
  tracks = [],
  {
    visibleRange = null,
    trackMetaMap = {},
    effectiveTrackMetaMap = {},
    maxTracks = DEFAULT_LIST_COVER_IDLE_PREWARM_LIMIT,
    maxScanTracks = DEFAULT_LIST_COVER_IDLE_PREWARM_SCAN_LIMIT,
    excludePaths = new Set(),
    isLocalTrack = null
  } = {}
) {
  const list = Array.isArray(tracks) ? tracks : []
  const limit = Math.max(0, Number(maxTracks) || 0)
  const scanLimit = Math.max(limit, Number(maxScanTracks) || DEFAULT_LIST_COVER_IDLE_PREWARM_SCAN_LIMIT)
  if (list.length === 0 || limit <= 0) return []

  const startIndex = Math.min(
    list.length,
    Math.max(0, Number(visibleRange?.endIndex ?? DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT) || 0)
  )
  const candidates = []
  const seen = new Set(excludePaths instanceof Set ? excludePaths : [])
  const scanEnd = Math.min(list.length, startIndex + scanLimit)
  for (let index = startIndex; index < scanEnd && candidates.length < limit; index += 1) {
    const track = list[index]
    const path = typeof track?.path === 'string' ? track.path.trim() : ''
    if (!path || seen.has(path)) continue
    if (typeof isLocalTrack === 'function' && !isLocalTrack(track)) continue
    const entry = effectiveTrackMetaMap[path] || trackMetaMap[path] || null
    if (hasTrackThumbnailSource(track, entry)) continue
    seen.add(path)
    candidates.push(track)
  }
  return candidates
}

export function scheduleListCoverHydrationIdlePrewarm({
  delayMs = 2000,
  setTimeoutFn = (callback, delay) => window.setTimeout(callback, delay),
  clearTimeoutFn = (timer) => window.clearTimeout(timer),
  getCandidates = () => [],
  requestHydration = () => {}
} = {}) {
  let cancelled = false
  const timer = setTimeoutFn(() => {
    if (cancelled) return
    const candidates = getCandidates()
    if (!Array.isArray(candidates) || candidates.length === 0) return
    requestHydration(candidates, { reason: 'list-idle-prewarm' })
  }, Math.max(0, Number(delayMs) || 0))

  return () => {
    cancelled = true
    clearTimeoutFn(timer)
  }
}

function createThumbOnlyStats() {
  return {
    requestCount: 0,
    hitCount: 0,
    missCount: 0,
    missingFileCount: 0,
    mergedCount: 0,
    elapsedMs: 0,
    heavyHydrationAvoidedCount: 0,
    missNoRecord: 0,
    missFingerprintMismatch: 0,
    missNoThumbPath: 0,
    missInvalidMeta: 0,
    missMissingThumbFile: 0,
    missZeroByteThumb: 0,
    seedMissingFingerprint: 0,
    requestUniqueCount: 0
  }
}

export function createCoverThumbOnlyPrewarmManager({
  readCoverThumbBatch,
  getCurrentMeta = () => ({}),
  mergeEntries = () => {},
  limit = DEFAULT_COVER_THUMB_ONLY_BATCH_LIMIT
} = {}) {
  const stats = createThumbOnlyStats()
  const latestRunKeyByScope = new Map()

  const prewarmThumbsBeforeHydration = async (
    tracks = [],
    { runKey = '', reason = '', scope = 'default' } = {}
  ) => {
    const list = normalizeTrackList(tracks)
    if (list.length === 0) return { tracksToHydrate: [], stale: false }
    if (typeof readCoverThumbBatch !== 'function') return { tracksToHydrate: list, stale: false }

    const scopeKey = String(scope || 'default')
    const currentRunKey = String(runKey || `${Date.now()}:${Math.random()}`)
    latestRunKeyByScope.set(scopeKey, currentRunKey)
    const seeds = []
    const trackByPath = new Map()
    for (const track of list) {
      const path = typeof track?.path === 'string' ? track.path.trim() : ''
      if (!path || trackByPath.has(path)) continue
      if (hasTrackThumbnailSource(track, getCurrentMeta(path) || {})) continue
      const seed = normalizeHydrationSeed(track, getCurrentMeta(path) || {})
      if (!seed || !(seed.sizeBytes > 0) || !(seed.mtimeMs > 0)) continue
      seeds.push({
        path: seed.path,
        sizeBytes: seed.sizeBytes,
        mtimeMs: seed.mtimeMs
      })
      trackByPath.set(seed.path, track)
    }
    if (seeds.length === 0) return { tracksToHydrate: [], stale: false }

    stats.requestCount += 1
    stats.requestUniqueCount += seeds.length
    const startedAt = Date.now()
    let result = null
    try {
      result = await readCoverThumbBatch(seeds, { limit, reason })
    } catch (error) {
      result = {
        entries: {},
        hitPaths: [],
        missPaths: seeds.map((seed) => seed.path),
        missingThumbPaths: [],
        errors: { __global: error?.message || String(error || '') }
      }
    }
    stats.elapsedMs += Number(result?.elapsedMs) >= 0 ? Number(result.elapsedMs) : Date.now() - startedAt

    if (latestRunKeyByScope.get(scopeKey) !== currentRunKey) {
      return { tracksToHydrate: [], stale: true }
    }

    const entries = result?.entries || {}
    const hitPaths = Array.isArray(result?.hitPaths) ? result.hitPaths : Object.keys(entries)
    const missingThumbPaths = Array.isArray(result?.missingThumbPaths)
      ? result.missingThumbPaths
      : []
    const missPathSet = new Set(Array.isArray(result?.missPaths) ? result.missPaths : [])
    const hitPathSet = new Set(hitPaths)
    stats.hitCount += hitPathSet.size
    stats.missingFileCount += missingThumbPaths.length
    stats.missCount += Math.max(0, missPathSet.size)
    stats.heavyHydrationAvoidedCount += hitPathSet.size
    stats.missNoRecord += Number(result?.thumbOnlyMissNoRecord || 0)
    stats.missFingerprintMismatch += Number(result?.thumbOnlyMissFingerprintMismatch || 0)
    stats.missNoThumbPath += Number(result?.thumbOnlyMissNoThumbPath || 0)
    stats.missInvalidMeta += Number(result?.thumbOnlyMissInvalidMeta || 0)
    stats.missMissingThumbFile += Number(result?.thumbOnlyMissMissingThumbFile || 0)
    stats.missZeroByteThumb += Number(result?.thumbOnlyMissZeroByteThumb || 0)
    stats.seedMissingFingerprint += Number(result?.thumbOnlySeedMissingFingerprint || 0)

    let mergedCount = 0
    if (Object.keys(entries).length > 0) {
      const mergeResult = mergeEntries(entries) || {}
      mergedCount = Number.isFinite(Number(mergeResult.mergedCount))
        ? Number(mergeResult.mergedCount)
        : Object.keys(entries).length
      stats.mergedCount += mergedCount
    }

    const tracksToHydrate = []
    for (const seed of seeds) {
      if (hitPathSet.has(seed.path)) continue
      const track = trackByPath.get(seed.path)
      if (track) tracksToHydrate.push(track)
    }
    return { tracksToHydrate, stale: false, mergedCount }
  }

  return {
    prewarmThumbsBeforeHydration,
    cancelScope: (scope = 'default') => {
      latestRunKeyByScope.set(String(scope || 'default'), '')
    },
    getDebugStats: () => ({
      thumbOnlyRequestCount: stats.requestCount,
      thumbOnlyHitCount: stats.hitCount,
      thumbOnlyMissCount: stats.missCount,
      thumbOnlyMissingFileCount: stats.missingFileCount,
      thumbOnlyMergedCount: stats.mergedCount,
      thumbOnlyElapsedMs: stats.elapsedMs,
      heavyHydrationAvoidedCount: stats.heavyHydrationAvoidedCount,
      thumbOnlyMissNoRecord: stats.missNoRecord,
      thumbOnlyMissFingerprintMismatch: stats.missFingerprintMismatch,
      thumbOnlyMissNoThumbPath: stats.missNoThumbPath,
      thumbOnlyMissInvalidMeta: stats.missInvalidMeta,
      thumbOnlyMissMissingThumbFile: stats.missMissingThumbFile,
      thumbOnlyMissZeroByteThumb: stats.missZeroByteThumb,
      thumbOnlySeedMissingFingerprint: stats.seedMissingFingerprint,
      thumbOnlyRequestUniqueCount: stats.requestUniqueCount
    })
  }
}

export function createCoverHydrationManager({
  readEmbeddedMetadataBatch,
  getCurrentMeta = () => ({}),
  mergeEntries = () => {},
  maxBatchSize = DEFAULT_COVER_HYDRATION_BATCH_SIZE,
  maxConcurrentBatches = DEFAULT_COVER_HYDRATION_CONCURRENCY,
  debounceMs = DEFAULT_COVER_HYDRATION_DEBOUNCE_MS,
  setTimeoutFn = (callback, delay) => window.setTimeout(callback, delay),
  clearTimeoutFn = (timer) => window.clearTimeout(timer),
  logger = console.debug,
  isDebugEnabled = false
} = {}) {
  const queue = new Map()
  const inFlightPaths = new Set()
  const activeBatches = new Set()
  const idleWaiters = new Set()
  let timer = null
  let disposed = false
  const stats = {
    queued: 0,
    completed: 0,
    failed: 0,
    merged: 0,
    mergeMiss: 0,
    skippedAlreadyHasRealCover: 0,
    skippedInFlight: 0,
    skippedInvalid: 0,
    failedEmbeddedCoverMissing: 0,
    failedNoSeedInfo: 0,
    failedFileMissing: 0,
    failedOther: 0,
    candidateCount: 0,
    prewarmCandidateCount: 0,
    idlePrewarmCandidateCount: 0,
    idlePrewarmQueuedCount: 0,
    observerCandidateCount: 0,
    recoveryStats: Object.fromEntries(EMBEDDED_COVER_RECOVERY_STAT_KEYS.map((key) => [key, 0])),
    batches: 0,
    lastBatchSize: 0,
    lastElapsedMs: 0,
    totalElapsedMs: 0,
    batchElapsedMsTotal: 0,
    queuePeakSize: 0,
    lastErrors: []
  }

  const log = (message, details = {}) => {
    if (!shouldLog(isDebugEnabled)) return
    logger?.('[cover-hydration]', message, details)
  }

  const recordLastError = (path, reason) => {
    stats.lastErrors.unshift({
      track: summarizePath(path),
      reason: String(reason || 'unknown')
    })
    stats.lastErrors = stats.lastErrors.slice(0, 10)
  }

  const recordFailure = (path, error, category = null) => {
    const resolvedCategory = category || classifyHydrationError(error)
    stats.failed += 1
    if (resolvedCategory === 'embeddedCoverMissing') stats.failedEmbeddedCoverMissing += 1
    else if (resolvedCategory === 'noSeedInfo') stats.failedNoSeedInfo += 1
    else if (resolvedCategory === 'fileMissing') stats.failedFileMissing += 1
    else stats.failedOther += 1
    recordLastError(path, error || resolvedCategory)
  }

  const classifyRequestReason = (reason = '') => {
    const value = String(reason || '').toLowerCase()
    if (value.includes('prewarm')) return 'prewarm'
    if (value.includes('visible') || value.includes('observer')) return 'observer'
    return 'other'
  }

  const mergeRecoveryStats = (recoveryStats = {}) => {
    for (const key of EMBEDDED_COVER_RECOVERY_STAT_KEYS) {
      stats.recoveryStats[key] =
        Number(stats.recoveryStats[key] || 0) + Number(recoveryStats?.[key] || 0)
    }
  }

  const resolveIdle = () => {
    if (timer || queue.size > 0 || activeBatches.size > 0) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  const schedule = () => {
    if (disposed || timer || queue.size === 0) return
    timer = setTimeoutFn(() => {
      timer = null
      processQueue()
    }, Math.max(0, Number(debounceMs) || 0))
  }

  const startBatch = (batch) => {
    const batchToken = {}
    activeBatches.add(batchToken)
    const startedAt = Date.now()
    const seeds = batch.map((item) => ({
      path: item.path,
      sizeBytes: item.sizeBytes,
      mtimeMs: item.mtimeMs
    }))
    stats.batches += 1
    stats.lastBatchSize = seeds.length
    log('batch start', {
      queuedCount: queue.size,
      skippedAlreadyHasRealCover: stats.skippedAlreadyHasRealCover,
      skippedInFlight: stats.skippedInFlight,
      batchSize: seeds.length
    })

    Promise.resolve()
      .then(() =>
        readEmbeddedMetadataBatch(seeds, {
          limit: Math.max(1, Number(maxBatchSize) || DEFAULT_COVER_HYDRATION_BATCH_SIZE)
        })
      )
      .then((result) => {
        if (disposed) return
        mergeRecoveryStats(result?.recoveryStats)
        const resultEntries = result?.entries || {}
        const failedPaths = new Set(Array.isArray(result?.failedPaths) ? result.failedPaths : [])
        const updates = {}
        let completedCount = 0
        let failedCount = 0
        for (const seed of batch) {
          const entry = resultEntries[seed.path]
          if (entry) {
            updates[seed.path] = mergeHydratedEntry(getCurrentMeta(seed.path) || {}, entry, seed)
            completedCount += 1
          } else if (failedPaths.has(seed.path)) {
            failedCount += 1
            recordFailure(seed.path, result?.errors?.[seed.path] || 'metadata_read_failed')
          }
        }
        if (Object.keys(updates).length > 0) {
          const mergeResult = mergeEntries(updates) || {}
          const updateCount = Object.keys(updates).length
          stats.merged += Number.isFinite(Number(mergeResult.mergedCount))
            ? Number(mergeResult.mergedCount)
            : updateCount
          stats.mergeMiss += Number.isFinite(Number(mergeResult.mergeMissCount))
            ? Number(mergeResult.mergeMissCount)
            : 0
        }
        stats.completed += completedCount
        stats.lastElapsedMs = Math.max(0, Date.now() - startedAt)
        stats.totalElapsedMs += stats.lastElapsedMs
        stats.batchElapsedMsTotal += stats.lastElapsedMs
        log('batch complete', {
          batchSize: seeds.length,
          completedCount,
          failedCount,
          elapsedMs: stats.lastElapsedMs
        })
      })
      .catch((error) => {
        if (disposed) return
        for (const seed of batch) {
          recordFailure(seed.path, error?.message || String(error || 'metadata_read_failed'))
        }
        stats.lastElapsedMs = Math.max(0, Date.now() - startedAt)
        stats.totalElapsedMs += stats.lastElapsedMs
        stats.batchElapsedMsTotal += stats.lastElapsedMs
        log('batch failed', {
          batchSize: batch.length,
          completedCount: 0,
          failedCount: batch.length,
          elapsedMs: stats.lastElapsedMs,
          error: error?.message || String(error || '')
        })
      })
      .finally(() => {
        for (const seed of batch) inFlightPaths.delete(seed.path)
        activeBatches.delete(batchToken)
        processQueue()
        resolveIdle()
      })
  }

  function processQueue() {
    if (disposed) return
    const concurrency = Math.max(
      1,
      Number(maxConcurrentBatches) || DEFAULT_COVER_HYDRATION_CONCURRENCY
    )
    const batchSize = Math.max(1, Number(maxBatchSize) || DEFAULT_COVER_HYDRATION_BATCH_SIZE)
    while (activeBatches.size < concurrency && queue.size > 0) {
      const batch = []
      for (const [path, seed] of queue) {
        queue.delete(path)
        if (inFlightPaths.has(path)) continue
        inFlightPaths.add(path)
        batch.push(seed)
        if (batch.length >= batchSize) break
      }
      if (batch.length === 0) break
      startBatch(batch)
    }
    resolveIdle()
  }

  const requestCoverHydration = (trackOrTracks, options = {}) => {
    const tracks = normalizeTrackList(trackOrTracks)
    const reasonKind = classifyRequestReason(options.reason)
    stats.candidateCount += tracks.length
    if (reasonKind === 'prewarm') stats.prewarmCandidateCount += tracks.length
    else if (reasonKind === 'observer') stats.observerCandidateCount += tracks.length
    if (String(options.reason || '').toLowerCase().includes('idle')) {
      stats.idlePrewarmCandidateCount += tracks.length
    }
    const result = {
      queuedCount: 0,
      skippedAlreadyHasCover: 0,
      skippedAlreadyHasRealCover: 0,
      skippedInFlight: 0,
      skippedInvalid: 0
    }
    for (const track of tracks) {
      const path =
        typeof track === 'string'
          ? track.trim()
          : typeof track?.path === 'string'
            ? track.path.trim()
            : ''
      const currentMeta = path ? getCurrentMeta(path) || {} : {}
      const seed = normalizeTrackSeed(track, currentMeta)
      if (!seed) {
        result.skippedInvalid += 1
        stats.skippedInvalid += 1
        recordFailure(path, 'invalid_seed', 'noSeedInfo')
        continue
      }
      if (!(seed.sizeBytes > 0) || !(seed.mtimeMs > 0)) {
        result.skippedInvalid += 1
        stats.skippedInvalid += 1
        recordFailure(seed.path, 'missing_size_or_mtime', 'noSeedInfo')
        continue
      }
      if (options.force !== true && hasTrackThumbnailSource(seed.track, currentMeta)) {
        result.skippedAlreadyHasCover += 1
        result.skippedAlreadyHasRealCover += 1
        stats.skippedAlreadyHasRealCover += 1
        continue
      }
      if (queue.has(seed.path) || inFlightPaths.has(seed.path)) {
        result.skippedInFlight += 1
        stats.skippedInFlight += 1
        continue
      }
      queue.set(seed.path, seed)
      result.queuedCount += 1
      stats.queued += 1
      if (String(options.reason || '').toLowerCase().includes('idle')) {
        stats.idlePrewarmQueuedCount += 1
      }
    }
    if (result.queuedCount > 0) {
      stats.queuePeakSize = Math.max(stats.queuePeakSize, queue.size)
      log('queued', {
        queuedCount: result.queuedCount,
        skippedAlreadyHasRealCover: result.skippedAlreadyHasRealCover,
        skippedInFlight: result.skippedInFlight,
        batchSize: Math.min(queue.size, Number(maxBatchSize) || DEFAULT_COVER_HYDRATION_BATCH_SIZE)
      })
      schedule()
    }
    return result
  }

  const flushNow = () => {
    if (timer) {
      clearTimeoutFn(timer)
      timer = null
    }
    processQueue()
    return whenIdle()
  }

  function whenIdle() {
    if (!timer && queue.size === 0 && activeBatches.size === 0) return Promise.resolve()
    return new Promise((resolve) => {
      idleWaiters.add(resolve)
    })
  }

  const getDebugStats = () => ({
    hydrationQueued: queue.size,
    hydrationInFlight: inFlightPaths.size,
    hydrationCompleted: stats.completed,
    hydrationSkipped:
      stats.skippedAlreadyHasRealCover + stats.skippedInFlight + stats.skippedInvalid,
    hydrationFailed: stats.failed,
    hydrationMergedCount: stats.merged,
    hydrationMergeMissCount: stats.mergeMiss,
    hydrationLastErrors: stats.lastErrors.slice(0, 10),
    hydrationFailedEmbeddedCoverMissing: stats.failedEmbeddedCoverMissing,
    hydrationFailedNoSeedInfo: stats.failedNoSeedInfo,
    hydrationFailedFileMissing: stats.failedFileMissing,
    hydrationFailedOther: stats.failedOther,
    ...stats.recoveryStats,
    hydrationCandidateCount: stats.candidateCount,
    hydrationPrewarmCandidateCount: stats.prewarmCandidateCount,
    hydrationIdlePrewarmCandidateCount: stats.idlePrewarmCandidateCount,
    hydrationIdlePrewarmQueuedCount: stats.idlePrewarmQueuedCount,
    hydrationObserverCandidateCount: stats.observerCandidateCount,
    hydrationSkippedAlreadyHasRealCover: stats.skippedAlreadyHasRealCover,
    hydrationSkippedInFlight: stats.skippedInFlight,
    hydrationBatches: stats.batches,
    hydrationLastBatchSize: stats.lastBatchSize,
    hydrationLastElapsedMs: stats.lastElapsedMs,
    hydrationAverageBatchElapsedMs:
      stats.batches > 0 ? Math.round(stats.batchElapsedMsTotal / stats.batches) : 0,
    hydrationTotalElapsedMs: stats.totalElapsedMs,
    hydrationThroughputPerSecond:
      stats.totalElapsedMs > 0 ? Math.round((stats.completed / stats.totalElapsedMs) * 1000) : 0,
    hydrationQueuePeakSize: stats.queuePeakSize
  })

  const dispose = () => {
    disposed = true
    if (timer) {
      clearTimeoutFn(timer)
      timer = null
    }
    queue.clear()
    inFlightPaths.clear()
    activeBatches.clear()
    resolveIdle()
  }

  return {
    requestCoverHydration,
    flushNow,
    whenIdle,
    getDebugStats,
    dispose
  }
}
