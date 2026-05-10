import { getMetadataSourcePriority, getTrackMetaFieldSource } from './metadataPriority.js'
import { isUnknownArtistName, parseTrackInfo } from './trackUtils.js'

export const METADATA_AUTO_COMPLETE_VERSION = 1

const AUTO_COMPLETE_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'trackNo', 'year', 'genre']

function cleanText(value) {
  return String(value || '').trim()
}

function toPositiveInteger(value) {
  const n = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function hasRealCover(entry = {}, track = {}) {
  return Boolean(cleanText(entry?.cover || track?.info?.cover || track?.cover))
}

function isFieldProtected(entry = {}, field = '') {
  return getMetadataSourcePriority(getTrackMetaFieldSource(entry, field)) >=
    getMetadataSourcePriority('embedded')
}

function getUsefulArtist(entry = {}, track = {}) {
  return cleanText(entry?.albumArtist || entry?.artist || track?.info?.albumArtist || track?.info?.artist)
}

export function isMetadataAutoCompleteTarget(track, entry = {}, options = {}) {
  if (!track?.path) return false
  if (typeof options.isLocalTrack === 'function' && !options.isLocalTrack(track)) return false
  const missingUsefulArtist = isUnknownArtistName(getUsefulArtist(entry, track))
  const missingCover = !hasRealCover(entry, track)
  return missingUsefulArtist || missingCover
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
  const entry = {
    coverChecked: true,
    metadataSource: 'embedded',
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
    entry.coverSource = 'network'
    fieldSources.cover = 'network'
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
