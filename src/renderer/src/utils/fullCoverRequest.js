const fullCoverInFlight = new Map()
const fullCoverCache = new Map()
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

export async function requestTrackFullCover(trackOrSeed = {}) {
  const seed = normalizeTrackSeed(trackOrSeed)
  if (!seed?.path) return ''

  const cached = fullCoverCache.get(seed.path)
  if (cached) {
    fullCoverStats.cacheHitCount += 1
    return cached
  }

  const existing = fullCoverInFlight.get(seed.path)
  if (existing) return existing

  const request = (async () => {
    try {
      if (typeof window === 'undefined' || typeof window.api?.getTrackFullCover !== 'function') {
        return ''
      }
      fullCoverStats.requestCount += 1
      const result = await window.api.getTrackFullCover(seed)
      const cover = typeof result?.cover === 'string' ? result.cover.trim() : ''
      if (cover) fullCoverCache.set(seed.path, cover)
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

