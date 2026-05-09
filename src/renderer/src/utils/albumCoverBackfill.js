import {
  getTrackAlbumGroupKey,
  getTrackExplicitAlbumArtist,
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
    if (needsCover && !entry?.cover && !albumCoverProbePaths.has(track.path)) return true
    if (needsArtist && !hasKnownArtist(track, entry) && !albumArtistProbePaths.has(track.path)) {
      return true
    }
    return false
  }

  const targets = []
  for (const album of albumGroups) {
    const albumName = String(album?.name || '').trim()
    const albumKey = String(album?.key || '').trim()
    const coverFailed = failedAlbumCoverKeys.has(getAlbumCoverFailureKey(album))
    if (!albumName || !albumKey) continue
    const hasAlbumCover = Boolean((album?.cover || albumCoverMap[albumKey]) && !coverFailed)
    const tracks = Array.isArray(album?.tracks) ? album.tracks : []
    const hasAlbumArtist =
      (album?.cacheArtist && !isUnknownArtistName(album.cacheArtist)) ||
      (album?.artist && !isUnknownArtistName(album.artist)) ||
      tracks.some((track) => hasKnownArtist(track, trackMetaMap[track.path] || {}))

    if (hasAlbumCover && hasAlbumArtist) continue
    const needs = {
      needsCover: !hasAlbumCover,
      needsArtist: !hasAlbumArtist
    }
    const representativeTrack =
      tracks.find(
        (track) =>
          track?.path &&
          shouldBackfillTrack(track, trackMetaMap[track.path] || {}, needs)
      ) ||
      null

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
  return {
    title: common.title || cachedMeta.title || null,
    artist: common.artist || cachedMeta.artist || null,
    album: common.album || cachedMeta.album || track?.info?.album || null,
    albumArtist: common.albumArtist || cachedMeta.albumArtist || null,
    trackNo: common.trackNo ?? cachedMeta.trackNo ?? null,
    discNo: common.discNo ?? cachedMeta.discNo ?? null,
    cover: common.cover || cachedMeta.cover || null,
    coverScope: common.coverScope || cachedMeta.coverScope || null,
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

export function collectAlbumCoverFromMeta(target, entry) {
  if (!entry?.cover) return null
  if (isTrackScopedCoverEntry(entry)) return null

  const albumName = entry.album || target?.albumName || target?.track?.info?.album || 'Singles'
  const albumTrack = {
    ...(target?.track || {}),
    info: {
      ...(target?.track?.info || {}),
      album: albumName,
      artist: entry.artist || target?.track?.info?.artist || '',
      albumArtist: entry.albumArtist || target?.track?.info?.albumArtist || ''
    }
  }
  const albumKey = getTrackAlbumGroupKey(albumTrack) || target?.albumKey || ''
  if (!albumName || !albumKey) return null

  return {
    albumKey,
    album: albumName,
    artist: getTrackExplicitAlbumArtist(albumTrack),
    cover: entry.cover,
    coverFailed: target?.coverFailed === true
  }
}
