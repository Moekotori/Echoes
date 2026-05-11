import { EMBEDDED_COVER_EXTRACTOR_VERSION } from '../../../shared/embeddedCoverVersion.mjs'
import {
  METADATA_PRIORITY_VERSION,
  mergeTrackMetaWithPriority,
  normalizeMetadataSource
} from './metadataPriority.js'
import { getTrackAlbumGroupKey, hasRealTrackCover } from './trackUtils.js'

const DB_NAME = 'echo-track-meta-cache'
const DB_VERSION = 4
const STORE_NAME = 'trackMeta'
const ALBUM_COVER_STORE_NAME = 'albumCover'
const ARTIST_AVATAR_STORE_NAME = 'artistAvatar'
const TRACK_META_CACHE_FINGERPRINT_VERSION = 1
const MAX_CACHE_ENTRIES = 50000
const MAX_CACHE_COVER_ENTRIES = 10000
const MAX_ALBUM_COVER_CACHE_ENTRIES = 10000
const MAX_ARTIST_AVATAR_CACHE_ENTRIES = 2000

export const TRACK_META_CACHE_LIMITS = {
  maxEntries: MAX_CACHE_ENTRIES,
  maxCoverEntries: MAX_CACHE_COVER_ENTRIES,
  maxAlbumCoverEntries: MAX_ALBUM_COVER_CACHE_ENTRIES,
  maxArtistAvatarEntries: MAX_ARTIST_AVATAR_CACHE_ENTRIES
}

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

function isUnknownMetadataArtistName(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return (
    !normalized ||
    normalized === 'unknown artist' ||
    /^(?:cd|disc|disk)?\s*\d{1,3}(?:\s*[-./_]\s*\d{1,3})?$/.test(normalized)
  )
}

export function satisfiesMetadataHydrateRequirement(entry, requirement = null) {
  const needsCover = requirement?.needsCover === true
  const needsArtist = requirement?.needsArtist === true
  const needsAlbum = requirement?.needsAlbum === true
  if (!needsCover && !needsArtist && !needsAlbum) return true
  if (!entry || typeof entry !== 'object') return false
  if (needsCover) {
    const coverSatisfiedByLocalCover = hasRealTrackCover(entry)
    const coverSatisfiedByCurrentNoCover =
      !entry.cover && requirement?.source === 'visible-row' && hasCurrentEmbeddedCoverCheck(entry)
    if (!coverSatisfiedByLocalCover && !coverSatisfiedByCurrentNoCover) return false
  }
  if (
    needsArtist &&
    isUnknownMetadataArtistName(entry.albumArtist) &&
    isUnknownMetadataArtistName(entry.artist)
  ) {
    return false
  }
  if (needsAlbum && !String(entry.album || '').trim()) return false
  return true
}

export const satisfiesAlbumWallHydrateRequirement = satisfiesMetadataHydrateRequirement

function isNetworkCoverUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isLocalCoverUrl(value = '') {
  const cover = String(value || '').trim()
  return /^(?:data:image\/|file:\/\/)/i.test(cover)
}

function normalizeCoverSource(value = '') {
  const source = normalizeMetadataSource(value)
  if (
    [
      'manual',
      'embedded',
      'embedded-batch',
      'embedded-cue',
      'sidecar',
      'download-sidecar',
      'local-folder-cover',
      'folder',
      'local',
      'network'
    ].includes(source)
  ) {
    return source === 'local-folder-cover' ? 'folder' : source
  }
  return ''
}

export function isLocalCoverEntry(entry = {}) {
  if (!entry?.cover) return false
  const source = normalizeCoverSource(entry.coverSource)
  if (source && source !== 'network') return true
  if (source === 'network') return false
  return isLocalCoverUrl(entry.cover) || !isNetworkCoverUrl(entry.cover)
}

function hasOwnTrackCover(track, entry = null, options = {}) {
  const path = track?.path || ''
  const ownEntries = [
    path ? options.effectiveTrackMetaMap?.[path] : null,
    path ? options.trackMetaMap?.[path] : null,
    entry
  ].filter(Boolean)
  if (ownEntries.some((item) => hasRealTrackCover(item) && isLocalCoverEntry(item))) return true
  return hasRealTrackCover(track)
}

function shouldRefreshDisplayCoverAsThumbnail(track, entry = null) {
  if (entry?.coverThumbnailOnly === true) return false
  const hasThumbnail = [entry, track?.info, track].some((item) => {
    const thumbUrl = typeof item?.coverThumbUrl === 'string' ? item.coverThumbUrl.trim() : ''
    const thumbPath = typeof item?.coverThumbPath === 'string' ? item.coverThumbPath.trim() : ''
    return Boolean(thumbUrl || thumbPath)
  })
  if (hasThumbnail) return false
  return hasRealTrackCover({ cover: entry?.cover || track?.info?.cover || track?.cover || '' })
}

export function hasCurrentEmbeddedCoverCheck(entry = null) {
  if (hasRealTrackCover(entry) && isLocalCoverEntry(entry)) return true
  if (!entry?.cover && Number(entry?.embeddedPictureCount || 0) > 0) return false
  return (
    entry?.coverChecked === true &&
    Number(entry?.coverExtractorVersion) === EMBEDDED_COVER_EXTRACTOR_VERSION
  )
}

function hasVisibleRowArtist(track, entry = null) {
  return !(
    isUnknownMetadataArtistName(entry?.albumArtist) &&
    isUnknownMetadataArtistName(entry?.artist) &&
    isUnknownMetadataArtistName(track?.info?.albumArtist) &&
    isUnknownMetadataArtistName(track?.info?.artist) &&
    isUnknownMetadataArtistName(track?.albumArtist) &&
    isUnknownMetadataArtistName(track?.artist)
  )
}

export function buildVisibleTrackMetaHydrateRequirement(
  track,
  entry = null,
  {
    isLocalTrack = null,
    trackMetaMap = {},
    effectiveTrackMetaMap = {},
    albumCoverMap = {},
    albumTracks = []
  } = {}
) {
  if (!track?.path) return null
  if (typeof isLocalTrack === 'function' && !isLocalTrack(track)) return null

  const hasOwnCover = hasOwnTrackCover(track, entry, {
    trackMetaMap,
    effectiveTrackMetaMap,
    albumCoverMap,
    albumTracks
  })
  const needsThumbnailCover = hasOwnCover && shouldRefreshDisplayCoverAsThumbnail(track, entry)
  const needsCover = needsThumbnailCover || (!hasOwnCover && !hasCurrentEmbeddedCoverCheck(entry))
  const needsArtist = !hasVisibleRowArtist(track, entry)
  if (!needsCover && !needsArtist) return null

  return {
    needsCover,
    needsArtist,
    needsAlbum: false,
    source: 'visible-row'
  }
}

export function buildVisibleRowMetadataRequestOptions() {
  return {
    mode: 'visible-row',
    includeCover: true,
    includeTechnicalProbe: false,
    includeLyrics: false,
    includeBpm: false,
    includeMqa: false,
    coverSize: 'album-thumbnail'
  }
}

export function buildAlbumThumbnailMetadataRequestOptions() {
  return {
    ...buildVisibleRowMetadataRequestOptions(),
    mode: 'album-wall',
    coverSize: 'album-thumbnail'
  }
}

export function buildPlaybackMetadataRequestOptions({ includeCover = true } = {}) {
  return {
    includeCover: includeCover !== false,
    coverSize: 'album-thumbnail'
  }
}

export function buildVisibleCoverHydrationPlan({
  visibleTracks = [],
  aheadTracks = [],
  metadataHydrateRequirementByPath = new Map(),
  trackMetaMap = {},
  effectiveTrackMetaMap = {},
  albumCoverMap = {},
  albumTracksByKey = null,
  isLocalTrack = null,
  maxVisibleTracks = 48,
  maxAheadTracks = 120
} = {}) {
  const tracks = []
  const seen = new Set()

  const getEntry = (track) => {
    const path = track?.path
    if (!path) return null
    return effectiveTrackMetaMap[path] || trackMetaMap[path] || null
  }

  const shouldQueue = (track) => {
    const path = track?.path
    if (!path || seen.has(path)) return false
    const requirement =
      metadataHydrateRequirementByPath.get(path) ||
      buildVisibleTrackMetaHydrateRequirement(track, getEntry(track), {
        isLocalTrack,
        trackMetaMap,
        effectiveTrackMetaMap,
        albumCoverMap,
        albumTracks: albumTracksByKey?.get?.(getTrackAlbumGroupKey(track)) || []
      })
    if (requirement?.source !== 'visible-row') return false
    return !satisfiesMetadataHydrateRequirement(getEntry(track), requirement)
  }

  const pushTrack = (track) => {
    if (!shouldQueue(track)) return false
    seen.add(track.path)
    tracks.push(track)
    return true
  }

  let visibleCount = 0
  const visibleLimit = Math.max(0, Number(maxVisibleTracks) || 0)
  for (const track of visibleTracks || []) {
    if (visibleCount >= visibleLimit) break
    if (pushTrack(track)) visibleCount += 1
  }

  let aheadCount = 0
  const aheadLimit = Math.max(0, Number(maxAheadTracks) || 0)
  for (const track of aheadTracks || []) {
    if (aheadCount >= aheadLimit) break
    if (pushTrack(track)) aheadCount += 1
  }

  return {
    tracks,
    visibleCount,
    aheadCount
  }
}

function mergeMetadataHydrateRequirement(previous = {}, requirement = {}, track = null) {
  return {
    track,
    albumKey: requirement.albumKey || previous.albumKey || '',
    albumName: requirement.albumName || previous.albumName || '',
    needsCover: previous.needsCover === true || requirement.needsCover === true,
    needsArtist: previous.needsArtist === true || requirement.needsArtist === true,
    needsAlbum: previous.needsAlbum === true || requirement.needsAlbum === true,
    source: requirement.source || previous.source || ''
  }
}

export function buildTrackMetadataPrefetchPlan({
  currentTrack = null,
  visibleSidebarTracks = [],
  metadataPrefetchSidebarTracks = [],
  albumWallHydrateTargets = [],
  trackMetaMap = {},
  effectiveTrackMetaMap = {},
  maxTracks = 96,
  visibleAheadLimit = 24,
  isLocalTrack = null,
  albumCoverMap = {},
  albumTracksByKey = null
} = {}) {
  const byPath = new Map()
  const requirementByPath = new Map()

  const pushTrack = (track, requirement = null) => {
    if (!track?.path) return
    if (!byPath.has(track.path)) byPath.set(track.path, track)
    if (requirement) {
      const previous = requirementByPath.get(track.path) || {}
      requirementByPath.set(
        track.path,
        mergeMetadataHydrateRequirement(previous, requirement, track)
      )
    }
  }

  const getTrackEntry = (track) => {
    const path = track?.path
    if (!path) return null
    return effectiveTrackMetaMap[path] || trackMetaMap[path] || null
  }

  const buildRequirement = (track) =>
    buildVisibleTrackMetaHydrateRequirement(track, getTrackEntry(track), {
      isLocalTrack,
      trackMetaMap,
      effectiveTrackMetaMap,
      albumCoverMap,
      albumTracks: albumTracksByKey?.get?.(getTrackAlbumGroupKey(track)) || []
    })

  pushTrack(currentTrack)

  const visiblePaths = new Set()
  for (const track of visibleSidebarTracks || []) {
    if (track?.path) visiblePaths.add(track.path)
    const requirement = buildRequirement(track)
    if (requirement) pushTrack(track, requirement)
  }

  let checkedPrefetchWindow = 0
  const maxVisibleAhead = Math.max(0, Number(visibleAheadLimit) || 0)
  for (const track of metadataPrefetchSidebarTracks || []) {
    if (!track?.path || visiblePaths.has(track.path)) continue
    if (typeof isLocalTrack === 'function' && !isLocalTrack(track)) continue
    if (checkedPrefetchWindow >= maxVisibleAhead) break
    checkedPrefetchWindow += 1
    const requirement = buildRequirement(track)
    if (requirement) pushTrack(track, requirement)
  }

  for (const track of metadataPrefetchSidebarTracks || []) {
    pushTrack(track)
  }

  for (const target of albumWallHydrateTargets || []) {
    pushTrack(target?.track, target)
  }

  const limit = Math.max(0, Number(maxTracks) || 0)
  const tracks = Array.from(byPath.values()).slice(0, limit)
  const limitedPaths = new Set(tracks.map((track) => track?.path).filter(Boolean))
  for (const path of Array.from(requirementByPath.keys())) {
    if (!limitedPaths.has(path)) requirementByPath.delete(path)
  }

  return {
    tracks,
    metadataHydrateRequirementByPath: requirementByPath
  }
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

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeTrackMetaCacheSeed(trackOrSeed) {
  if (typeof trackOrSeed === 'string') {
    return trackOrSeed ? { path: trackOrSeed } : null
  }
  if (!trackOrSeed || typeof trackOrSeed !== 'object') return null

  const path = typeof trackOrSeed.path === 'string' ? trackOrSeed.path : ''
  if (!path) return null

  const info = trackOrSeed.info && typeof trackOrSeed.info === 'object' ? trackOrSeed.info : {}
  return {
    path,
    sizeBytes: toFiniteNumber(trackOrSeed.sizeBytes ?? info.sizeBytes),
    mtimeMs: toFiniteNumber(trackOrSeed.mtimeMs ?? info.mtimeMs)
  }
}

export function buildTrackMetaCacheFingerprint(trackOrSeed) {
  const seed = normalizeTrackMetaCacheSeed(trackOrSeed)
  if (!seed) return null
  if (seed.sizeBytes == null || seed.mtimeMs == null) return null
  return {
    schemaVersion: TRACK_META_CACHE_FINGERPRINT_VERSION,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  }
}

export function isTrackMetaCacheRecordFresh(record, trackOrSeed) {
  const expected = buildTrackMetaCacheFingerprint(trackOrSeed)
  if (!expected) return true
  const actual = record?.fingerprint
  if (!actual || typeof actual !== 'object') {
    return !hasCachedTrackCoverRecord(record)
  }
  return (
    Number(actual.schemaVersion) === expected.schemaVersion &&
    Number(actual.sizeBytes) === expected.sizeBytes &&
    Number(actual.mtimeMs) === expected.mtimeMs
  )
}

export function stripCoverFieldsFromTrackMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta
  const next = { ...meta }
  delete next.cover
  delete next.coverChecked
  delete next.coverScope
  delete next.coverSource
  delete next.coverThumbnailOnly
  delete next.coverMaxDimension
  delete next.coverExtractorVersion
  delete next.coverMemoryTrimmed
  return next
}

export function mergeTrackMetaEntryPreservingCover(existing = {}, incoming = {}) {
  const next = mergeTrackMetaWithPriority(existing || {}, incoming || {})
  const existingCover = typeof existing?.cover === 'string' && existing.cover ? existing.cover : ''
  if (existingCover && next.cover === existingCover && existing.coverMemoryTrimmed === true) {
    delete next.coverMemoryTrimmed
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

export function buildPersistableAlbumCoverCacheItems(items = []) {
  const list = Array.isArray(items) ? items : [items]
  const cacheItems = []

  for (const item of list) {
    const rawAlbum = String(item?.album || item?.albumName || '').trim()
    if (!rawAlbum) continue
    const entry = normalizeAlbumCoverCacheEntry(item)
    if (!entry?.cover || !entry.album) continue
    cacheItems.push({
      album: entry.album,
      artist: isUnknownMetadataArtistName(entry.artist) ? '' : entry.artist,
      cover: entry.cover
    })
  }

  return cacheItems
}

function normalizeTrackMetaEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const next = {}
  for (const key of [
    'title',
    'artist',
    'album',
    'albumArtist',
    'cover',
    'coverKey',
    'coverThumbPath',
    'coverThumbUrl',
    'codec',
    'container',
    'lyrics',
    'genre'
  ]) {
    if (typeof entry[key] === 'string') next[key] = entry[key]
    else if (entry[key] == null) next[key] = null
  }
  if (entry.coverScope === 'track') next.coverScope = 'track'
  else if (entry.coverScope === 'album') next.coverScope = 'album'
  {
    const source = normalizeCoverSource(entry.coverSource)
    if (source) next.coverSource = source
  }
  {
    const source = normalizeMetadataSource(entry.metadataSource)
    if (source) next.metadataSource = source
  }
  if (entry.fieldSources && typeof entry.fieldSources === 'object') {
    const fieldSources = {}
    for (const [field, source] of Object.entries(entry.fieldSources)) {
      const normalized = normalizeMetadataSource(source)
      if (normalized) fieldSources[field] = normalized
    }
    if (Object.keys(fieldSources).length > 0) next.fieldSources = fieldSources
  }
  {
    const value = Number(entry.metadataPriorityVersion)
    next.metadataPriorityVersion =
      Number.isFinite(value) && value > 0
        ? value
        : entry.fieldSources
          ? METADATA_PRIORITY_VERSION
          : null
  }
  for (const key of [
    'trackNo',
    'trackTotal',
    'discNo',
    'discTotal',
    'year',
    'duration',
    'bitrate',
    'bitrateKbps',
    'sampleRate',
    'sampleRateHz',
    'bitDepth',
    'channels',
    'bpm',
    'sizeBytes',
    'mtimeMs',
    'coverCacheVersion',
    'coverThumbBytes',
    'coverThumbWidth',
    'coverThumbHeight'
  ]) {
    const value = Number(entry[key])
    next[key] = Number.isFinite(value) && value > 0 ? value : null
  }
  {
    const value = Number(entry.coverExtractorVersion)
    next.coverExtractorVersion = Number.isFinite(value) && value > 0 ? value : null
  }
  {
    const value = Number(entry.coverMaxDimension)
    next.coverMaxDimension = Number.isFinite(value) && value > 0 ? value : null
  }
  {
    const value = Number(entry.embeddedPictureCount)
    next.embeddedPictureCount = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }
  {
    const value = Number(entry.lyricsExtractorVersion)
    next.lyricsExtractorVersion = Number.isFinite(value) && value > 0 ? value : null
  }
  next.coverChecked = entry.coverChecked === true
  next.coverThumbnailOnly = entry.coverThumbnailOnly === true
  {
    const value = Number(entry.metadataAutoCompleteVersion)
    if (Number.isFinite(value) && value > 0) next.metadataAutoCompleteVersion = value
  }
  next.metadataAutoCompleteEmbeddedChecked = entry.metadataAutoCompleteEmbeddedChecked === true
  next.metadataAutoCompleteNetworkChecked = entry.metadataAutoCompleteNetworkChecked === true
  if (['full', 'visible-row', 'album-wall', 'embedded-batch'].includes(entry.metadataDetailMode)) {
    next.metadataDetailMode = entry.metadataDetailMode
  }
  if (Object.prototype.hasOwnProperty.call(entry, 'metadataAutoCompleteLastError')) {
    if (typeof entry.metadataAutoCompleteLastError === 'string') {
      next.metadataAutoCompleteLastError = entry.metadataAutoCompleteLastError
    } else if (entry.metadataAutoCompleteLastError == null) {
      next.metadataAutoCompleteLastError = null
    }
  }
  if (Object.prototype.hasOwnProperty.call(entry, 'metadataAutoCompleteRetryAfter')) {
    const value = Number(entry.metadataAutoCompleteRetryAfter)
    next.metadataAutoCompleteRetryAfter = Number.isFinite(value) && value > 0 ? value : null
  }
  if (typeof entry.metadataAutoCompleteSource === 'string') {
    next.metadataAutoCompleteSource = entry.metadataAutoCompleteSource
  }
  next.bpmChecked = entry.bpmChecked === true
  next.bpmMeasured = entry.bpmMeasured === true
  next.mqaChecked = entry.mqaChecked === true
  next.isMqa = entry.isMqa === true
  next.lossless = entry.lossless === true
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

export async function readTrackMetaCache(trackSeeds = []) {
  const db = await openTrackMetaDb()
  if (!db || !Array.isArray(trackSeeds) || trackSeeds.length === 0) return {}

  const seeds = trackSeeds.map(normalizeTrackMetaCacheSeed).filter((seed) => seed?.path)
  if (seeds.length === 0) return {}

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const result = {}
    let pending = seeds.length

    const finish = () => {
      pending -= 1
      if (pending <= 0) resolve(result)
    }

    for (const seed of seeds) {
      const request = store.get(seed.path)
      request.onsuccess = () => {
        const record = request.result
        if (!isTrackMetaCacheRecordFresh(record, seed)) {
          finish()
          return
        }
        const normalized = normalizeTrackMetaEntry(record?.meta)
        if (normalized) result[seed.path] = normalized
        finish()
      }
      request.onerror = finish
    }
  })
}

export async function writeTrackMetaCache(entries = {}, options = {}) {
  const db = await openTrackMetaDb()
  if (!db || !entries || typeof entries !== 'object') return
  const shouldMerge = options?.merge !== false

  await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const updatedAt = Date.now()

    for (const [path, entry] of Object.entries(entries)) {
      if (!path) continue
      const meta = normalizeTrackMetaEntry(entry)
      if (!meta) continue
      const fingerprint = buildTrackMetaCacheFingerprint({ path, ...(entry || {}) })
      const putRecord = (existingRecord = null) => {
        const existingMeta = normalizeTrackMetaEntry(existingRecord?.meta) || {}
        const mergedMeta = shouldMerge ? mergeTrackMetaEntryPreservingCover(existingMeta, meta) : meta
        store.put({
          path,
          meta: mergedMeta,
          fingerprint: fingerprint || existingRecord?.fingerprint || null,
          updatedAt,
          hasCover: hasCachedTrackCoverRecord({ meta: mergedMeta }) ? 1 : 0
        })
      }
      const getRequest = store.get(path)
      getRequest.onsuccess = () => putRecord(getRequest.result)
      getRequest.onerror = () => putRecord()
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

function stripOldestTrackMetaCoverRecords(db, overflow) {
  if (!(overflow > 0)) return Promise.resolve(0)

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const source = store.indexNames.contains('updatedAt') ? store.index('updatedAt') : store
    let stripped = 0
    let cursorDone = false

    const finish = () => {
      if (cursorDone) resolve(stripped)
    }

    const request = source.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || stripped >= overflow) {
        cursorDone = true
        return
      }

      const record = cursor.value
      if (!hasCachedTrackCoverRecord(record) || !record?.path) {
        cursor.continue()
        return
      }

      const updateRequest = cursor.update({
        ...record,
        meta: stripCoverFieldsFromTrackMeta(record.meta),
        hasCover: 0
      })
      updateRequest.onsuccess = () => {
        stripped += 1
        cursor.continue()
      }
      updateRequest.onerror = () => cursor.continue()
    }
    request.onerror = () => {
      cursorDone = true
    }
    tx.oncomplete = finish
    tx.onerror = () => resolve(stripped)
    tx.onabort = () => resolve(stripped)
  })
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
      await stripOldestTrackMetaCoverRecords(db, coverOverflow)
    }
  })().finally(() => {
    prunePromise = null
  })

  return prunePromise
}
