import {
  getTrackAlbumGroupKey,
  getTrackAlbumArtist,
  getTrackExplicitAlbumArtist,
  isGenericAlbumFallbackName,
  isUnknownArtistName
} from './trackUtils.js'
import { isTrackScopedCoverEntry } from './trackMetaCache.js'

export function getAlbumCoverFailureKey(album) {
  const albumName = String(album?.name || '').trim()
  const albumKey = String(album?.key || '').trim()
  const coverCandidates =
    Array.isArray(album?.coverCandidates) && album.coverCandidates.length > 0
      ? album.coverCandidates
      : album?.cover
        ? [album.cover]
        : []
  const coverKey = coverCandidates.join('\u0001')
  return (albumKey || albumName) && coverKey ? `${albumKey || albumName}\u0001${coverKey}` : ''
}

export function buildAlbumCoverBackfillPlan({
  enabled = false,
  albumGroups = [],
  albumCoverMap = {},
  failedAlbumCoverKeys = new Set(),
  trackMetaMap = {},
  albumCoverProbePaths = new Set(),
  albumArtistProbePaths = new Set()
} = {}) {
  if (!enabled) return { key: '', targets: [] }

  const hasKnownArtist = (track, entry = {}) => {
    const artist =
      entry?.albumArtist ||
      entry?.artist ||
      track?.info?.albumArtist ||
      track?.info?.artist ||
      track?.albumArtist ||
      track?.artist ||
      ''
    return Boolean(artist && !isUnknownArtistName(artist))
  }

  const shouldBackfillTrack = (track, entry = {}, { needsCover, needsArtist }) => {
    if (!track?.path) return false
    if (needsCover && entry?.coverThumbnailOnly !== true && !albumCoverProbePaths.has(track.path)) {
      return true
    }
    if (needsArtist && !hasKnownArtist(track, entry) && !albumArtistProbePaths.has(track.path)) {
      return true
    }
    return false
  }

  const hasThumbnailCoverEntry = (track) => {
    const entry = trackMetaMap?.[track?.path]
    return Boolean(entry?.cover && entry.coverThumbnailOnly === true)
  }

  const targets = []
  for (const album of albumGroups) {
    const albumName = String(album?.name || '').trim()
    const albumKey = String(album?.key || '').trim()
    const coverFailed = failedAlbumCoverKeys.has(getAlbumCoverFailureKey(album))
    if (!albumName || !albumKey) continue
    const tracks = Array.isArray(album?.tracks) ? album.tracks : []
    const cachedAlbumCover = albumCoverMap[albumKey] || ''
    const rawAlbumCover = album?.cover || cachedAlbumCover || ''
    const hasAlbumCover = Boolean(rawAlbumCover && !coverFailed)
    const hasAlbumCoverCacheHit = Boolean(cachedAlbumCover)
    const isDataImageCover = /^data:image\//i.test(String(rawAlbumCover || ''))
    const hasDisplayThumbnailCover =
      hasAlbumCover &&
      (hasAlbumCoverCacheHit || !isDataImageCover || tracks.some(hasThumbnailCoverEntry))
    const hasAlbumArtist =
      (album?.cacheArtist && !isUnknownArtistName(album.cacheArtist)) ||
      (album?.artist && !isUnknownArtistName(album.artist)) ||
      tracks.some((track) => hasKnownArtist(track, trackMetaMap[track.path] || {}))

    if (hasDisplayThumbnailCover && hasAlbumArtist) continue
    const needs = {
      needsCover: !hasDisplayThumbnailCover,
      needsArtist: !hasAlbumArtist
    }
    const representativeTrack =
      tracks.find(
        (track) => track?.path && shouldBackfillTrack(track, trackMetaMap[track.path] || {}, needs)
      ) || null

    if (!representativeTrack?.path) continue
    targets.push({
      albumName,
      albumKey,
      track: representativeTrack,
      coverFailed,
      needsCover: needs.needsCover,
      needsArtist: needs.needsArtist
    })
  }

  return {
    key: targets
      .map(
        (target) =>
          `${target.albumKey}\u0001${target.track.path}\u0001${target.needsCover ? 'cover' : ''}:${target.needsArtist ? 'artist' : ''}`
      )
      .join('\n'),
    targets
  }
}

export function buildParsedAlbumCoverMetaEntry(track, data, cachedMeta = {}) {
  if (!data?.success) return null
  const common = data.common || {}
  const technical = data.technical || {}
  const fieldSources = {
    ...(cachedMeta.fieldSources || {}),
    ...(common.fieldSources || {})
  }
  return {
    title: common.title || cachedMeta.title || null,
    artist: common.artist || cachedMeta.artist || null,
    album: common.album || cachedMeta.album || track?.info?.album || null,
    albumArtist: common.albumArtist || cachedMeta.albumArtist || null,
    trackNo: common.trackNo ?? cachedMeta.trackNo ?? null,
    discNo: common.discNo ?? cachedMeta.discNo ?? null,
    cover: common.cover || cachedMeta.cover || null,
    coverScope: common.coverScope || cachedMeta.coverScope || null,
    coverSource: common.coverSource || cachedMeta.coverSource || null,
    ...(common.metadataSource || cachedMeta.metadataSource
      ? { metadataSource: common.metadataSource || cachedMeta.metadataSource }
      : {}),
    ...(Object.keys(fieldSources).length > 0 ? { fieldSources } : {}),
    coverThumbnailOnly:
      common.coverThumbnailOnly === true || cachedMeta.coverThumbnailOnly === true,
    coverMaxDimension: common.coverMaxDimension ?? cachedMeta.coverMaxDimension ?? null,
    metadataDetailMode: 'album-wall',
    duration: technical.duration || cachedMeta.duration || null,
    coverChecked: true,
    bpmChecked: true,
    bpmMeasured: cachedMeta.bpmMeasured === true,
    mqaChecked: true,
    codec: technical.codec || cachedMeta.codec || null,
    bitrateKbps: technical.bitrate
      ? Math.round(technical.bitrate / 1000)
      : cachedMeta.bitrateKbps || null,
    sampleRateHz: technical.sampleRate || cachedMeta.sampleRateHz || null,
    bitDepth: technical.bitDepth || cachedMeta.bitDepth || null,
    channels: technical.channels || cachedMeta.channels || null,
    isMqa: technical.isMqa === true || cachedMeta.isMqa === true,
    bpm: cachedMeta.bpmMeasured ? cachedMeta.bpm || null : null
  }
}

function pushAlbumCoverMapKey(keys, value) {
  const key = String(value || '').trim()
  if (key && !keys.includes(key)) keys.push(key)
}

function getAlbumCoverMapValuePriority(value = '') {
  const cover = String(value || '').trim()
  if (!cover) return 0
  if (/^(?:data:image\/|file:\/\/)/i.test(cover)) return 3
  if (/^https?:\/\//i.test(cover)) return 1
  return 2
}

export function getAlbumCoverMapKeys(
  entry = {},
  sourceKey = '',
  { includeLooseAlbumNameKeys = false } = {}
) {
  const keys = []
  pushAlbumCoverMapKey(keys, sourceKey)
  pushAlbumCoverMapKey(keys, entry?.albumKey)
  if (includeLooseAlbumNameKeys) {
    for (const value of [entry?.displayAlbumName, entry?.albumName, entry?.album]) {
      if (!isGenericAlbumFallbackName(value)) pushAlbumCoverMapKey(keys, value)
    }
  }
  return keys
}

export function mergeAlbumCoverMapEntries(
  prev = {},
  entries = {},
  { includeLooseAlbumNameKeys = false } = {}
) {
  const items = Object.entries(entries || {})
  if (items.length === 0) return prev

  let changed = false
  const next = { ...(prev || {}) }
  for (const [sourceKey, entry] of items) {
    if (!entry?.cover) continue
    for (const key of getAlbumCoverMapKeys(entry, sourceKey, { includeLooseAlbumNameKeys })) {
      if (
        next[key] &&
        getAlbumCoverMapValuePriority(next[key]) >= getAlbumCoverMapValuePriority(entry.cover)
      ) {
        continue
      }
      next[key] = entry.cover
      changed = true
    }
  }
  return changed ? next : prev
}

export function buildAlbumCoverCacheTargetIndex(targets = []) {
  const keys = []
  const keyToTargets = new Map()
  const addKeyTarget = (key, target, kind) => {
    if (!key || !target?.albumKey) return
    if (kind === 'fallback' && isGenericAlbumFallbackName(target.albumName)) return
    if (!keys.includes(key)) keys.push(key)
    const matches = keyToTargets.get(key) || []
    matches.push({ target, kind })
    keyToTargets.set(key, matches)
  }

  for (const target of Array.isArray(targets) ? targets : []) {
    addKeyTarget(target?.exactKey, target, 'exact')
    addKeyTarget(target?.fallbackKey, target, 'fallback')
  }

  return { keys, keyToTargets }
}

export function buildAlbumCoverCacheHydrationEntries(cached = {}, keyToTargets = new Map()) {
  const entries = {}
  for (const [key, entry] of Object.entries(cached || {})) {
    if (!entry?.cover) continue
    const matches = keyToTargets.get(key) || []
    const exactMatches = matches.filter((match) => match.kind === 'exact')
    const fallbackMatches = matches.filter((match) => match.kind === 'fallback')
    const allowedMatches =
      exactMatches.length > 0 ? exactMatches : fallbackMatches.length === 1 ? fallbackMatches : []
    for (const match of allowedMatches) {
      const coverEntry = buildAlbumCoverMapEntryFromCacheTarget(match.target, entry)
      if (!coverEntry) continue
      entries[match.target.albumKey] = coverEntry
    }
  }
  return entries
}

export function buildAlbumCoverMapEntryFromCacheTarget(target, cachedEntry) {
  if (!target?.albumKey || !cachedEntry?.cover) return null
  const albumName = String(cachedEntry.album || target.albumName || '').trim()
  const displayAlbumName = String(target.albumName || albumName || '').trim()
  if (!displayAlbumName && !albumName) return null
  return {
    albumKey: target.albumKey,
    album: albumName || displayAlbumName,
    albumName: displayAlbumName || albumName,
    displayAlbumName: displayAlbumName || albumName,
    artist: cachedEntry.artist || target.artist || '',
    cover: cachedEntry.cover
  }
}

export function collectAlbumCoverFromMeta(target, entry) {
  if (!entry?.cover) return null
  if (isTrackScopedCoverEntry(entry)) return null

  const albumName = entry.album || target?.albumName || target?.track?.info?.album || 'Singles'
  const displayAlbumName = target?.albumName || albumName
  const albumTrack = {
    ...(target?.track || {}),
    info: {
      ...(target?.track?.info || {}),
      album: albumName,
      artist: entry.artist || target?.track?.info?.artist || '',
      albumArtist: entry.albumArtist || target?.track?.info?.albumArtist || ''
    }
  }
  const albumKey = target?.albumKey || getTrackAlbumGroupKey(albumTrack) || ''
  if (!albumName || !albumKey) return null

  return {
    albumKey,
    album: albumName,
    albumName: displayAlbumName,
    displayAlbumName,
    artist: getTrackExplicitAlbumArtist(albumTrack) || getTrackAlbumArtist(albumTrack),
    cover: entry.cover,
    coverFailed: target?.coverFailed === true
  }
}
