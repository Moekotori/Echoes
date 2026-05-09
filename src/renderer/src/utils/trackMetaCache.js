const DB_NAME = 'echo-track-meta-cache'
const DB_VERSION = 4
const STORE_NAME = 'trackMeta'
const ALBUM_COVER_STORE_NAME = 'albumCover'
const ARTIST_AVATAR_STORE_NAME = 'artistAvatar'
const MAX_CACHE_ENTRIES = 4000
const MAX_CACHE_COVER_ENTRIES = 1200
const MAX_ALBUM_COVER_CACHE_ENTRIES = 1200
const MAX_ARTIST_AVATAR_CACHE_ENTRIES = 2000

let dbPromise = null
let prunePromise = null
let albumCoverPrunePromise = null
let artistAvatarPrunePromise = null

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openTrackMetaDb() {
  if (!hasIndexedDb()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const tx = request.transaction
      let trackStore = null
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        trackStore = db.createObjectStore(STORE_NAME, { keyPath: 'path' })
      } else {
        trackStore = tx?.objectStore(STORE_NAME) || null
      }
      if (trackStore && !trackStore.indexNames.contains('updatedAt')) {
        trackStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (trackStore && !trackStore.indexNames.contains('hasCover')) {
        trackStore.createIndex('hasCover', 'hasCover', { unique: false })
      }

      let albumCoverStore = null
      if (!db.objectStoreNames.contains(ALBUM_COVER_STORE_NAME)) {
        albumCoverStore = db.createObjectStore(ALBUM_COVER_STORE_NAME, { keyPath: 'key' })
      } else {
        albumCoverStore = tx?.objectStore(ALBUM_COVER_STORE_NAME) || null
      }
      if (albumCoverStore && !albumCoverStore.indexNames.contains('updatedAt')) {
        albumCoverStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      let artistAvatarStore = null
      if (!db.objectStoreNames.contains(ARTIST_AVATAR_STORE_NAME)) {
        artistAvatarStore = db.createObjectStore(ARTIST_AVATAR_STORE_NAME, { keyPath: 'key' })
      } else {
        artistAvatarStore = tx?.objectStore(ARTIST_AVATAR_STORE_NAME) || null
      }
      if (artistAvatarStore && !artistAvatarStore.indexNames.contains('updatedAt')) {
        artistAvatarStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

function normalizeAlbumCoverCacheText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeAlbumCoverCacheKeyPart(value) {
  return normalizeAlbumCoverCacheText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function createAlbumCoverCacheKey(album, artist = '') {
  const normalizedAlbum = normalizeAlbumCoverCacheKeyPart(album || 'Singles')
  const normalizedArtist = normalizeAlbumCoverCacheKeyPart(artist)
  return normalizedAlbum ? `${normalizedAlbum}\u0001${normalizedArtist}` : ''
}

export function createAlbumCoverFallbackKey(album) {
  const normalizedAlbum = normalizeAlbumCoverCacheKeyPart(album || 'Singles')
  return normalizedAlbum ? `${normalizedAlbum}\u0001` : ''
}

export function createArtistAvatarCacheKey(artist) {
  return normalizeAlbumCoverCacheKeyPart(artist)
}

export function shouldRefreshTrackMetaCacheForAudioQuality(path, entry) {
  if (!entry || typeof entry !== 'object') return false
  const lowerPath = String(path || '').toLowerCase()
  const codec = String(entry.codec || '').toLowerCase()
  const sampleRate = Number(entry.sampleRateHz || entry.sampleRate || 0)
  const bitrateKbps = Number(entry.bitrateKbps || 0)
  const duration = Number(entry.duration || 0)
  const isAlacLike = /\.(m4a|m4b|alac)(?:#|$)/i.test(lowerPath) || codec.includes('alac')
  if (isAlacLike) return !sampleRate || !Number(entry.bitDepth || 0)

  const isMp3PathWithAacMetadata = /\.mp3(?:#|$)/i.test(lowerPath) && codec.includes('aac')
  if (!isMp3PathWithAacMetadata) return false
  return sampleRate < 32000 || bitrateKbps > 20000 || (duration > 0 && duration < 1)
}

export function mergeTrackMetaEntryPreservingCover(existing = {}, incoming = {}) {
  const next = { ...(existing || {}), ...(incoming || {}) }
  const incomingCover = typeof incoming?.cover === 'string' && incoming.cover ? incoming.cover : ''
  const existingCover = typeof existing?.cover === 'string' && existing.cover ? existing.cover : ''
  if (!incomingCover && existingCover) {
    next.cover = existingCover
    next.coverChecked = true
    if (existing.coverExtractorVersion != null && next.coverExtractorVersion == null) {
      next.coverExtractorVersion = existing.coverExtractorVersion
    }
    if (existing.coverMemoryTrimmed === true) {
      delete next.coverMemoryTrimmed
    }
  }
  return next
}

export function mergeTrackMetaMapPreservingCovers(existingMap = {}, incomingMap = {}) {
  const next = { ...(existingMap || {}) }
  for (const [path, entry] of Object.entries(incomingMap || {})) {
    if (!path) continue
    next[path] = mergeTrackMetaEntryPreservingCover(next[path] || {}, entry || {})
  }
  return next
}

export function isTrackScopedCoverEntry(entry) {
  return entry?.coverScope === 'track'
}

function normalizeAlbumCoverCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const cover = typeof entry.cover === 'string' && entry.cover ? entry.cover : null
  if (!cover) return null
  return {
    album: normalizeAlbumCoverCacheText(entry.album || entry.albumName || 'Singles') || 'Singles',
    artist: normalizeAlbumCoverCacheText(entry.artist || ''),
    cover
  }
}

function normalizeArtistAvatarCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const artist = normalizeAlbumCoverCacheText(entry.artist || '')
  if (!artist) return null
  const avatarUrl = typeof entry.avatarUrl === 'string' && entry.avatarUrl ? entry.avatarUrl : null
  return {
    artist,
    avatarUrl,
    source: typeof entry.source === 'string' ? entry.source : '',
    checkedAt: Number.isFinite(Number(entry.checkedAt)) ? Number(entry.checkedAt) : null
  }
}

export function buildAlbumCoverCacheEntries(items = []) {
  if (!Array.isArray(items) || items.length === 0) return {}
  const entries = {}

  for (const item of items) {
    const entry = normalizeAlbumCoverCacheEntry(item)
    if (!entry) continue
    const exactKey = createAlbumCoverCacheKey(entry.album, entry.artist)
    const fallbackKey = createAlbumCoverFallbackKey(entry.album)
    if (exactKey) entries[exactKey] = entry
    if (fallbackKey) entries[fallbackKey] = entry
  }

  return entries
}

function normalizeTrackMetaEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const next = {}
  for (const key of ['title', 'artist', 'album', 'albumArtist', 'cover', 'codec', 'lyrics', 'genre']) {
    if (typeof entry[key] === 'string') next[key] = entry[key]
    else if (entry[key] == null) next[key] = null
  }
  if (entry.coverScope === 'track') next.coverScope = 'track'
  else if (entry.coverScope === 'album') next.coverScope = 'album'
  for (const key of ['trackNo', 'discNo', 'duration', 'bitrateKbps', 'sampleRateHz', 'bitDepth', 'channels', 'bpm']) {
    const value = Number(entry[key])
    next[key] = Number.isFinite(value) && value > 0 ? value : null
  }
  {
    const value = Number(entry.coverExtractorVersion)
    next.coverExtractorVersion = Number.isFinite(value) && value > 0 ? value : null
  }
  {
    const value = Number(entry.lyricsExtractorVersion)
    next.lyricsExtractorVersion = Number.isFinite(value) && value > 0 ? value : null
  }
  next.coverChecked = entry.coverChecked === true
  next.bpmChecked = entry.bpmChecked === true
  next.bpmMeasured = entry.bpmMeasured === true
  next.mqaChecked = entry.mqaChecked === true
  next.isMqa = entry.isMqa === true
  return next
}

export function hasCachedTrackCoverRecord(record) {
  const metaCover = record?.meta?.cover
  return (
    (typeof metaCover === 'string' && metaCover.length > 0) ||
    record?.hasCover === true ||
    record?.hasCover === 1
  )
}

function countRecords(source, keyRange = null) {
  return new Promise((resolve) => {
    let request
    try {
      request = keyRange ? source.count(keyRange) : source.count()
    } catch {
      resolve(0)
      return
    }
    request.onsuccess = () => resolve(Number(request.result) || 0)
    request.onerror = () => resolve(0)
  })
}

function countMatchingRecords(source, predicate = () => true) {
  return new Promise((resolve) => {
    let count = 0
    let request
    try {
      request = source.openCursor()
    } catch {
      resolve(0)
      return
    }

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(count)
        return
      }

      if (predicate(cursor.value)) count += 1
      cursor.continue()
    }
    request.onerror = () => resolve(count)
  })
}

function deleteOldestRecords(db, storeName, overflow, shouldDelete = () => true) {
  if (!(overflow > 0)) return Promise.resolve(0)

  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const source = store.indexNames.contains('updatedAt') ? store.index('updatedAt') : store
    let deleted = 0
    let cursorDone = false

    const finish = () => {
      if (cursorDone) resolve(deleted)
    }

    const request = source.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || deleted >= overflow) {
        cursorDone = true
        return
      }

      if (!shouldDelete(cursor.value)) {
        cursor.continue()
        return
      }

      const deleteRequest = cursor.delete()
      deleteRequest.onsuccess = () => {
        deleted += 1
        cursor.continue()
      }
      deleteRequest.onerror = () => cursor.continue()
    }
    request.onerror = () => {
      cursorDone = true
    }
    tx.oncomplete = finish
    tx.onerror = () => resolve(deleted)
    tx.onabort = () => resolve(deleted)
  })
}

function runCachePrune(task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.warn('[track-meta-cache] prune failed', error)
    })
}

export async function readTrackMetaCache(paths = []) {
  const db = await openTrackMetaDb()
  if (!db || !Array.isArray(paths) || paths.length === 0) return {}

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const result = {}
    let pending = paths.length

    const finish = () => {
      pending -= 1
      if (pending <= 0) resolve(result)
    }

    for (const path of paths) {
      const request = store.get(path)
      request.onsuccess = () => {
        const cached = request.result?.meta
        const normalized = normalizeTrackMetaEntry(cached)
        if (normalized) result[path] = normalized
        finish()
      }
      request.onerror = finish
    }
  })
}

export async function writeTrackMetaCache(entries = {}) {
  const db = await openTrackMetaDb()
  if (!db || !entries || typeof entries !== 'object') return

  await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const updatedAt = Date.now()

    for (const [path, entry] of Object.entries(entries)) {
      if (!path) continue
      const meta = normalizeTrackMetaEntry(entry)
      if (!meta) continue
      store.put({ path, meta, updatedAt, hasCover: hasCachedTrackCoverRecord({ meta }) ? 1 : 0 })
    }

    tx.oncomplete = resolve
    tx.onerror = resolve
    tx.onabort = resolve
  })

  runCachePrune(pruneTrackMetaCache)
}

export async function readAlbumCoverCache(keys = []) {
  const db = await openTrackMetaDb()
  if (!db || !Array.isArray(keys) || keys.length === 0) return {}

  return new Promise((resolve) => {
    const tx = db.transaction(ALBUM_COVER_STORE_NAME, 'readonly')
    const store = tx.objectStore(ALBUM_COVER_STORE_NAME)
    const result = {}
    const uniqueKeys = [...new Set(keys.filter(Boolean))]
    let pending = uniqueKeys.length

    if (pending === 0) {
      resolve(result)
      return
    }

    const finish = () => {
      pending -= 1
      if (pending <= 0) resolve(result)
    }

    for (const key of uniqueKeys) {
      const request = store.get(key)
      request.onsuccess = () => {
        const cached = normalizeAlbumCoverCacheEntry(request.result?.entry)
        if (cached) result[key] = cached
        finish()
      }
      request.onerror = finish
    }

    tx.onerror = () => resolve(result)
    tx.onabort = () => resolve(result)
  })
}

export async function writeAlbumCoverCache(entries = {}) {
  const db = await openTrackMetaDb()
  if (!db || !entries || typeof entries !== 'object') return

  await new Promise((resolve) => {
    const tx = db.transaction(ALBUM_COVER_STORE_NAME, 'readwrite')
    const store = tx.objectStore(ALBUM_COVER_STORE_NAME)
    const updatedAt = Date.now()

    for (const [key, entry] of Object.entries(entries)) {
      if (!key) continue
      const normalized = normalizeAlbumCoverCacheEntry(entry)
      if (!normalized) continue
      store.put({ key, entry: normalized, updatedAt })
    }

    tx.oncomplete = resolve
    tx.onerror = resolve
    tx.onabort = resolve
  })

  runCachePrune(pruneAlbumCoverCache)
}

export async function readArtistAvatarCache(keys = []) {
  const db = await openTrackMetaDb()
  if (!db || !Array.isArray(keys) || keys.length === 0) return {}

  return new Promise((resolve) => {
    const tx = db.transaction(ARTIST_AVATAR_STORE_NAME, 'readonly')
    const store = tx.objectStore(ARTIST_AVATAR_STORE_NAME)
    const result = {}
    const uniqueKeys = [...new Set(keys.filter(Boolean))]
    let pending = uniqueKeys.length

    if (pending === 0) {
      resolve(result)
      return
    }

    const finish = () => {
      pending -= 1
      if (pending <= 0) resolve(result)
    }

    for (const key of uniqueKeys) {
      const request = store.get(key)
      request.onsuccess = () => {
        const cached = normalizeArtistAvatarCacheEntry(request.result?.entry)
        if (cached) result[key] = cached
        finish()
      }
      request.onerror = finish
    }

    tx.onerror = () => resolve(result)
    tx.onabort = () => resolve(result)
  })
}

export async function writeArtistAvatarCache(entries = {}) {
  const db = await openTrackMetaDb()
  if (!db || !entries || typeof entries !== 'object') return

  await new Promise((resolve) => {
    const tx = db.transaction(ARTIST_AVATAR_STORE_NAME, 'readwrite')
    const store = tx.objectStore(ARTIST_AVATAR_STORE_NAME)
    const updatedAt = Date.now()

    for (const [key, entry] of Object.entries(entries)) {
      if (!key) continue
      const normalized = normalizeArtistAvatarCacheEntry({
        ...entry,
        checkedAt: entry?.checkedAt || updatedAt
      })
      if (!normalized) continue
      store.put({ key, entry: normalized, updatedAt })
    }

    tx.oncomplete = resolve
    tx.onerror = resolve
    tx.onabort = resolve
  })

  runCachePrune(pruneArtistAvatarCache)
}

export async function pruneArtistAvatarCache() {
  if (artistAvatarPrunePromise) return artistAvatarPrunePromise

  artistAvatarPrunePromise = (async () => {
    const db = await openTrackMetaDb()
    if (!db) return

    const readTx = db.transaction(ARTIST_AVATAR_STORE_NAME, 'readonly')
    const total = await countRecords(readTx.objectStore(ARTIST_AVATAR_STORE_NAME))
    const overflow = total - MAX_ARTIST_AVATAR_CACHE_ENTRIES
    if (overflow <= 0) return

    await deleteOldestRecords(db, ARTIST_AVATAR_STORE_NAME, overflow, (record) => !!record?.key)
  })().finally(() => {
    artistAvatarPrunePromise = null
  })

  return artistAvatarPrunePromise
}

export async function pruneAlbumCoverCache() {
  if (albumCoverPrunePromise) return albumCoverPrunePromise

  albumCoverPrunePromise = (async () => {
    const db = await openTrackMetaDb()
    if (!db) return

    const readTx = db.transaction(ALBUM_COVER_STORE_NAME, 'readonly')
    const total = await countRecords(readTx.objectStore(ALBUM_COVER_STORE_NAME))
    const overflow = total - MAX_ALBUM_COVER_CACHE_ENTRIES
    if (overflow <= 0) return

    await deleteOldestRecords(db, ALBUM_COVER_STORE_NAME, overflow, (record) => !!record?.key)
  })().finally(() => {
    albumCoverPrunePromise = null
  })

  return albumCoverPrunePromise
}

export async function pruneTrackMetaCache() {
  if (prunePromise) return prunePromise

  prunePromise = (async () => {
    const db = await openTrackMetaDb()
    if (!db) return

    const readTx = db.transaction(STORE_NAME, 'readonly')
    const store = readTx.objectStore(STORE_NAME)
    const total = await countRecords(store)
    const overflow = total - MAX_CACHE_ENTRIES
    if (overflow > 0) {
      await deleteOldestRecords(db, STORE_NAME, overflow, (record) => !!record?.path)
    }

    const coverReadTx = db.transaction(STORE_NAME, 'readonly')
    const coverStore = coverReadTx.objectStore(STORE_NAME)
    const coverTotal = await countMatchingRecords(coverStore, hasCachedTrackCoverRecord)
    const coverOverflow = coverTotal - MAX_CACHE_COVER_ENTRIES
    if (coverOverflow > 0) {
      await deleteOldestRecords(
        db,
        STORE_NAME,
        coverOverflow,
        (record) => hasCachedTrackCoverRecord(record) && !!record?.path
      )
    }
  })().finally(() => {
    prunePromise = null
  })

  return prunePromise
}
