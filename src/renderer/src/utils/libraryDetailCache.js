export function makeLibraryDetailCacheKey(
  kind,
  identityKey,
  libraryVersion,
  metadataIdentityVersion
) {
  return [
    String(kind || 'detail'),
    String(identityKey || ''),
    String(libraryVersion || ''),
    String(metadataIdentityVersion || 0)
  ].join('\u0001')
}

export function getLibraryDetailCacheEntry(cache, key) {
  if (!cache || typeof cache.get !== 'function' || !key) return null
  return cache.get(key) || null
}

export function setLibraryDetailCacheEntry(cache, key, entry) {
  if (!cache || typeof cache.set !== 'function' || !key || !entry) return null
  const nextEntry = {
    ...entry,
    createdAt: entry.createdAt || Date.now()
  }
  cache.set(key, nextEntry)
  return nextEntry
}
