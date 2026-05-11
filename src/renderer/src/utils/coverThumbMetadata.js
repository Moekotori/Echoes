const THUMB_FIELDS = [
  'coverKey',
  'coverThumbPath',
  'coverThumbUrl',
  'coverCacheVersion',
  'coverThumbBytes',
  'coverThumbWidth',
  'coverThumbHeight'
]

function isNetworkCoverUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isDataImageCover(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

export function buildCoverThumbMetaEntry(path = '', source = {}, fallback = {}) {
  const trackPath = String(path || '').trim()
  if (!trackPath || !source || typeof source !== 'object') return null

  const entry = { path: trackPath }
  let hasThumbField = false
  for (const field of THUMB_FIELDS) {
    if (source[field] == null || source[field] === '') continue
    entry[field] = source[field]
    hasThumbField = true
  }
  if (!hasThumbField) return null

  const coverSource = String(source.coverSource || fallback.coverSource || '').trim()
  if (coverSource) entry.coverSource = coverSource
  entry.coverChecked = source.coverChecked === false ? false : true
  if (Number.isFinite(Number(source.embeddedPictureCount))) {
    entry.embeddedPictureCount = Math.max(0, Math.floor(Number(source.embeddedPictureCount)))
  }
  if (fallback.sizeBytes != null) entry.sizeBytes = fallback.sizeBytes
  if (fallback.mtimeMs != null) entry.mtimeMs = fallback.mtimeMs
  return entry
}

export function buildRemoteCoverThumbMetaEntry(path = '', coverUrl = '', fallback = {}) {
  const trackPath = String(path || '').trim()
  const remoteCoverUrl = String(coverUrl || '').trim()
  if (!trackPath || !isNetworkCoverUrl(remoteCoverUrl)) return null
  return buildCoverThumbMetaEntry(
    trackPath,
    {
      coverThumbUrl: remoteCoverUrl,
      coverSource: fallback.coverSource || 'network',
      coverChecked: true
    },
    fallback
  )
}

export async function cacheExternalCoverThumbForTrack(trackOrPath, coverDataUrl = '', options = {}) {
  const path =
    typeof trackOrPath === 'string'
      ? trackOrPath.trim()
      : typeof trackOrPath?.path === 'string'
        ? trackOrPath.path.trim()
        : ''
  const cover = String(coverDataUrl || '').trim()
  if (!path || !cover || typeof window === 'undefined') return null
  if (typeof window.api?.cacheExternalCoverForTrack !== 'function') return null

  const track = typeof trackOrPath === 'object' && trackOrPath ? trackOrPath : {}
  const payloadCover =
    options.coverUrl || isNetworkCoverUrl(cover)
      ? { coverUrl: options.coverUrl || cover }
      : isDataImageCover(cover)
        ? { coverDataUrl: cover }
        : { coverDataUrl: cover }
  const fallback = {
    coverSource: options.coverSource || 'network',
    sizeBytes: track?.sizeBytes || track?.info?.sizeBytes || options.sizeBytes || null,
    mtimeMs: track?.mtimeMs || track?.info?.mtimeMs || options.mtimeMs || null
  }
  const remoteFallback =
    options.allowRemoteThumbFallback === false
      ? null
      : buildRemoteCoverThumbMetaEntry(path, options.coverUrl || cover, fallback)
  let response = null
  try {
    response = await window.api.cacheExternalCoverForTrack({
      path,
      ...payloadCover,
      coverSource: options.coverSource || 'network',
      sizeBytes: track?.sizeBytes || track?.info?.sizeBytes || options.sizeBytes || 0,
      mtimeMs: track?.mtimeMs || track?.info?.mtimeMs || options.mtimeMs || 0
    })
  } catch {
    return remoteFallback
  }
  if (!response?.ok) return remoteFallback
  return buildCoverThumbMetaEntry(path, response, {
    coverSource: options.coverSource || response.coverSource || 'network',
    sizeBytes: fallback.sizeBytes,
    mtimeMs: fallback.mtimeMs
  })
}
