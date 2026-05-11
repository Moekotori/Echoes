import { getMetadataSourcePriority, getTrackMetaFieldSource } from './metadataPriority.js'
import { isTrustedDisplayCoverSource, isUnknownArtistName, parseTrackInfo } from './trackUtils.js'
import { METADATA_AUTO_COMPLETE_VERSION } from '../../../shared/metadataAutoCompleteVersion.mjs'

export { METADATA_AUTO_COMPLETE_VERSION }

const AUTO_COMPLETE_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'trackNo', 'year', 'genre']

function cleanText(value) {
  return String(value || '').trim()
}

function toPositiveInteger(value) {
  const n = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toNonNegativeInteger(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function hasRealCover(entry = {}, track = {}) {
  const cover = cleanText(entry?.cover || track?.info?.cover || track?.cover)
  if (!cover) return false
  const coverSource =
    getTrackMetaFieldSource(entry, 'cover') ||
    getTrackMetaFieldSource(track?.info, 'cover') ||
    getTrackMetaFieldSource(track, 'cover')
  return isTrustedDisplayCoverSource(coverSource)
}

export function hasRetryableEmbeddedCoverMiss(entry = {}) {
  return Number(entry?.embeddedPictureCount || 0) > 0 && !cleanText(entry?.cover)
}

export function shouldRefreshEmbeddedAutoComplete(entry = {}) {
  if (!entry || typeof entry !== 'object') return false
  const usesEmbeddedAutoComplete =
    entry.metadataAutoCompleteEmbeddedChecked === true ||
    entry.metadataAutoCompleteSource === 'embedded-batch'
  if (!usesEmbeddedAutoComplete) return false
  return entry.metadataAutoCompleteVersion !== METADATA_AUTO_COMPLETE_VERSION
}

function getTrackFingerprintValue(track = {}, field = '') {
  const value = Number(track?.[field] || track?.info?.[field] || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function hasFileFingerprintChanged(track = {}, entry = {}) {
  const sizeBytes = getTrackFingerprintValue(track, 'sizeBytes')
  const entrySizeBytes = Number(entry?.sizeBytes || 0)
  if (sizeBytes > 0 && entrySizeBytes > 0 && sizeBytes !== entrySizeBytes) return true

  const mtimeMs = getTrackFingerprintValue(track, 'mtimeMs')
  const entryMtimeMs = Number(entry?.mtimeMs || 0)
  return mtimeMs > 0 && entryMtimeMs > 0 && Math.abs(mtimeMs - entryMtimeMs) > 1
}

function hasPendingRetryDelay(entry = {}, now = Date.now()) {
  const retryAfter = Number(entry?.metadataAutoCompleteRetryAfter || 0)
  return Boolean(entry?.metadataAutoCompleteLastError && retryAfter > now)
}

function isFieldProtected(entry = {}, field = '') {
  if (getTrackMetaFieldSource(entry, field) === 'manual') return true
  if (entry?.metadataSource === 'embedded' && !entry?.fieldSources?.[field]) return false
  return getMetadataSourcePriority(getTrackMetaFieldSource(entry, field)) >=
    getMetadataSourcePriority('embedded')
}

function getUsefulArtist(entry = {}, track = {}) {
  return cleanText(entry?.albumArtist || entry?.artist || track?.info?.albumArtist || track?.info?.artist)
}

export function isMetadataAutoCompleteTarget(track, entry = {}, options = {}) {
  if (!track?.path) return false
  if (typeof options.isLocalTrack === 'function' && !options.isLocalTrack(track)) return false
  const now = Number(options.now) || Date.now()
  if (hasFileFingerprintChanged(track, entry)) return true
  if (hasPendingRetryDelay(entry, now)) return false
  if (shouldRetryMetadataAutoComplete(entry, options)) return true
  const missingUsefulArtist = isUnknownArtistName(getUsefulArtist(entry, track))
  const missingTitle = !cleanText(entry?.title || track?.info?.title || track?.title)
  const missingAlbum = !cleanText(entry?.album || track?.info?.album || track?.album)
  const missingCover = !hasRealCover(entry, track)
  return missingUsefulArtist || missingCover || missingTitle || missingAlbum
}

export function shouldRetryMetadataAutoComplete(entry = {}, options = {}) {
  if (!entry || typeof entry !== 'object') return false
  if (entry.metadataAutoCompleteVersion !== METADATA_AUTO_COMPLETE_VERSION) return true
  const retryAfter = Number(entry.metadataAutoCompleteRetryAfter || 0)
  if (retryAfter > 0 && retryAfter <= (Number(options.now) || Date.now())) return true
  return false
}

export function shouldSkipEmbeddedMetadataAutoComplete(track, entry = {}, options = {}) {
  if (!track?.path) return true
  const now = Number(options.now) || Date.now()
  if (hasFileFingerprintChanged(track, entry)) return false
  if (shouldRetryMetadataAutoComplete(entry, options)) return false
  if (hasRetryableEmbeddedCoverMiss(entry)) return false
  if (hasPendingRetryDelay(entry, now)) return true
  if (entry?.metadataAutoCompleteEmbeddedChecked !== true) return false
  if (entry?.metadataAutoCompleteSource === 'embedded-batch') return true
  return !isMetadataAutoCompleteTarget(track, entry, {
    ...options,
    now,
    isLocalTrack: () => true
  })
}

export function buildFailedEmbeddedMetadataAutoCompleteEntry(
  existingEntry = {},
  {
    error = '',
    now = Date.now(),
    retryDelayMs = 10 * 60 * 1000,
    sizeBytes = existingEntry?.sizeBytes,
    mtimeMs = existingEntry?.mtimeMs,
    embeddedPictureCount = existingEntry?.embeddedPictureCount
  } = {}
) {
  return {
    ...existingEntry,
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: false,
    metadataAutoCompleteLastError: String(error || 'metadata_read_failed'),
    metadataAutoCompleteRetryAfter: now + Math.max(30 * 1000, Number(retryDelayMs) || 0),
    embeddedPictureCount: toNonNegativeInteger(embeddedPictureCount),
    sizeBytes,
    mtimeMs
  }
}

export function buildMetadataAutoCompleteTargets(tracks = [], trackMetaMap = {}, options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(0, Number(options.limit)) : 0
  const seen = new Set()
  const targets = []

  for (const track of Array.isArray(tracks) ? tracks : []) {
    const path = track?.path
    if (!path || seen.has(path)) continue
    seen.add(path)
    const entry = trackMetaMap?.[path] || {}
    if (!isMetadataAutoCompleteTarget(track, entry, options)) continue
    targets.push({ track, path, entry })
    if (limit > 0 && targets.length >= limit) break
  }

  return targets
}

export function shouldRunNetworkMetadataAutoComplete(track, entry = {}) {
  if (!track?.path) return false
  const needsArtist = isUnknownArtistName(getUsefulArtist(entry, track))
  const needsCover = !hasRealCover(entry, track)
  return needsArtist || needsCover
}

export function buildEmbeddedMetadataAutoCompleteEntry(response = {}, existingEntry = {}) {
  const cover = cleanText(response.coverDataUrl)
  const title = cleanText(response.title)
  const artist = cleanText(response.artist)
  const album = cleanText(response.album)
  const albumArtist = cleanText(response.albumArtist)
  const genre = cleanText(response.genre)
  const trackNo = toPositiveInteger(response.trackNumber)
  const year = toPositiveInteger(response.year)
  const fieldSources = {}
  const embeddedPictureCount = toNonNegativeInteger(response.embeddedPictureCount)
  const entry = {
    coverChecked: true,
    metadataSource: 'embedded',
    embeddedPictureCount,
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true
  }

  const maybeSet = (field, value) => {
    if (value == null || value === '') return
    if (isFieldProtected(existingEntry, field)) return
    entry[field] = value
    fieldSources[field] = 'embedded'
  }

  maybeSet('title', title)
  maybeSet('artist', artist)
  maybeSet('album', album)
  maybeSet('albumArtist', albumArtist)
  maybeSet('trackNo', trackNo)
  maybeSet('year', year)
  maybeSet('genre', genre)
  if (cover && !isFieldProtected(existingEntry, 'cover')) {
    entry.cover = cover
    entry.coverSource = 'embedded'
    fieldSources.cover = 'embedded'
  }
  if (Object.keys(fieldSources).length > 0) entry.fieldSources = fieldSources
  return entry
}

export function buildNetworkMetadataAutoCompleteEntry(candidate = {}, existingEntry = {}) {
  const cover = cleanText(candidate.coverDataUrl)
  const coverSource = cleanText(candidate.coverSource) || 'network'
  const title = cleanText(candidate.title)
  const artist = cleanText(candidate.artist)
  const album = cleanText(candidate.album)
  const albumArtist = cleanText(candidate.albumArtist || artist)
  const genre = cleanText(candidate.genre)
  const trackNo = toPositiveInteger(candidate.trackNumber)
  const year = toPositiveInteger(candidate.year)
  const fieldSources = {}
  const entry = {
    coverChecked: true,
    metadataSource: 'network',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteNetworkChecked: true
  }

  const maybeSet = (field, value) => {
    if (value == null || value === '') return
    if (isFieldProtected(existingEntry, field)) return
    entry[field] = value
    fieldSources[field] = 'network'
  }

  maybeSet('title', title)
  maybeSet('artist', artist)
  maybeSet('album', album)
  maybeSet('albumArtist', albumArtist)
  maybeSet('trackNo', trackNo)
  maybeSet('year', year)
  maybeSet('genre', genre)
  if (cover && !isFieldProtected(existingEntry, 'cover')) {
    entry.cover = cover
    entry.coverScope = 'album'
    entry.coverSource = coverSource
    fieldSources.cover = coverSource
  }
  if (Object.keys(fieldSources).length > 0) entry.fieldSources = fieldSources
  return entry
}

export function buildNetworkMetadataAutoCompleteQuery(track, entry = {}) {
  const parsed = parseTrackInfo(track, entry)
  const title = cleanText(entry.title || parsed.title || track?.info?.title || track?.title)
  const artist = cleanText(entry.artist || parsed.artist || track?.info?.artist || track?.artist)
  const album = cleanText(entry.album || parsed.album || track?.info?.album || track?.album)
  return { title, artist: isUnknownArtistName(artist) ? '' : artist, album }
}

export function hasAutoCompleteEntryPayload(entry = {}) {
  return AUTO_COMPLETE_FIELDS.some((field) => entry[field] != null && entry[field] !== '') ||
    Boolean(entry.cover)
}
