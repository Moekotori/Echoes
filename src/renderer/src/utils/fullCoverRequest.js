const fullCoverInFlight = new Map()
const fullCoverCache = new Map()
const fullCoverResultCache = new Map()
const fullCoverStats = {
  requestCount: 0,
  cacheHitCount: 0
}

function normalizeTrackSeed(trackOrSeed = {}) {
  if (!trackOrSeed || typeof trackOrSeed !== 'object') {
    if (typeof trackOrSeed === 'string') {
      const path = trackOrSeed.trim()
      return path ? { path } : null
    }
    return null
  }
  const path = typeof trackOrSeed.path === 'string' ? trackOrSeed.path.trim() : ''
  if (!path) return null
  return {
    path,
    sizeBytes: Number(trackOrSeed.sizeBytes) || Number(trackOrSeed.info?.sizeBytes) || 0,
    mtimeMs: Number(trackOrSeed.mtimeMs) || Number(trackOrSeed.info?.mtimeMs) || 0
  }
}

export function getFullCoverRequestStats() {
  return {
    requestCount: fullCoverStats.requestCount,
    cacheHitCount: fullCoverStats.cacheHitCount,
    inFlightCount: fullCoverInFlight.size,
    cachedCount: fullCoverCache.size
  }
}

function notifyFullCoverResult(callback, seed, result) {
  if (typeof callback !== 'function' || !seed?.path || !result) return
  try {
    callback(seed, result)
  } catch {
    /* ignore callback errors so artwork fallback stays soft */
  }
}

export async function requestTrackFullCover(trackOrSeed = {}, options = {}) {
  const seed = normalizeTrackSeed(trackOrSeed)
  if (!seed?.path) return ''

  const cached = fullCoverCache.get(seed.path)
  if (cached) {
    fullCoverStats.cacheHitCount += 1
    notifyFullCoverResult(options?.onResult, seed, fullCoverResultCache.get(seed.path))
    return cached
  }

  const existing = fullCoverInFlight.get(seed.path)
  if (existing) {
    if (typeof options?.onResult !== 'function') return existing
    return existing.then((cover) => {
      notifyFullCoverResult(options.onResult, seed, fullCoverResultCache.get(seed.path))
      return cover
    })
  }

  const request = (async () => {
    try {
      if (typeof window === 'undefined' || typeof window.api?.getTrackFullCover !== 'function') {
        return ''
      }
      fullCoverStats.requestCount += 1
      const result = await window.api.getTrackFullCover(seed)
      const cover = typeof result?.cover === 'string' ? result.cover.trim() : ''
      if (cover) {
        fullCoverCache.set(seed.path, cover)
        fullCoverResultCache.set(seed.path, { ...result, cover })
        notifyFullCoverResult(options?.onResult, seed, { ...result, cover })
      }
      return cover
    } catch {
      return ''
    } finally {
      fullCoverInFlight.delete(seed.path)
    }
  })()

  fullCoverInFlight.set(seed.path, request)
  return request
}
