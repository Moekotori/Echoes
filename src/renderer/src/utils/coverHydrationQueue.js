import { mergeTrackMetaEntryPreservingCover } from './trackMetaCache.js'
import { hasRealTrackCover } from './trackUtils.js'

export const DEFAULT_COVER_HYDRATION_BATCH_SIZE = 16
export const DEFAULT_COVER_HYDRATION_CONCURRENCY = 2
export const DEFAULT_COVER_HYDRATION_DEBOUNCE_MS = 180
export const DEFAULT_ALBUM_COVER_HYDRATION_TRACK_LIMIT = 5
export const DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT = 64
export const DEFAULT_LIST_COVER_PREWARM_WINDOW_LIMIT = 32

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
    return hasRealTrackCover(track, entry)
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
    return !hasRealTrackCover(track, entry)
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
    observerCandidateCount: 0,
    recoveryStats: Object.fromEntries(EMBEDDED_COVER_RECOVERY_STAT_KEYS.map((key) => [key, 0])),
    batches: 0,
    lastBatchSize: 0,
    lastElapsedMs: 0,
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
      if (options.force !== true && hasRealTrackCover(seed.track, currentMeta)) {
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
    }
    if (result.queuedCount > 0) {
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
    hydrationObserverCandidateCount: stats.observerCandidateCount,
    hydrationSkippedAlreadyHasRealCover: stats.skippedAlreadyHasRealCover,
    hydrationSkippedInFlight: stats.skippedInFlight,
    hydrationBatches: stats.batches,
    hydrationLastBatchSize: stats.lastBatchSize,
    hydrationLastElapsedMs: stats.lastElapsedMs
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
