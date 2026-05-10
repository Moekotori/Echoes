import {
  getMetadataSourcePriority,
  getTrackMetaFieldSource,
  mergeTrackMetaWithPriority,
  pickHigherPriorityField,
  withManualMetadataSources
} from './metadataPriority.js'

export const stripExtension = (name = '') => name.replace(/\.[^/.]+$/, '')

export function cleanMetadataText(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAudioQualityTitleSuffix(value = '') {
  return String(value || '')
    .replace(
      /\s*[\[(（【]\s*(?=[^\])）】]*(?:\d+(?:\.\d+)?\s*ch|channels?|声道|k(?:hz)?|khz|hz|bit|bits|hi-?res|lossless|flac|alac|dsd|mqa|kbps))[^\])）】]*[\])）】]\s*$/i,
      ''
    )
    .trim()
}

function looksLikeAudioQualityFragment(value = '') {
  return /^(?:\d+(?:\.\d+)?\s*ch|channels?|声道|k(?:hz)?|khz|hz|bit|bits|hi-?res|lossless|flac|alac|dsd|mqa|kbps|[\d\s./-]+(?:ch|khz|hz|bit|kbps)\]?)$/i.test(
    String(value || '').trim()
  )
}

/** Slash in YT/B站 titles is usually 「曲名 / 翻唱署名」, not 「歌手 / 曲名」. */
const SLASH_LIKE = new Set(['/', '／'])

SLASH_LIKE.add('／')

function looksLikeSlashSideCredit(right) {
  const r = (right || '').trim()
  if (!r) return false
  if (/\b(covers?)\b/i.test(r)) return true
  if (/cover\s*$/i.test(r)) return true
  if (/翻唱|カバー|歌ってみた|弾いてみた|试着唱|翻自/i.test(r)) return true
  return false
}

function looksLikeLatinInWordHyphen(value) {
  return /^[\p{Script=Latin}\p{Number}]+(?:-[\p{Script=Latin}\p{Number}]+)+$/u.test(
    String(value || '').trim()
  )
}

function splitOutsideBrackets(value, separator) {
  const text = String(value || '')
  const sep = String(separator || '')
  if (!text || !sep) return null

  let depth = 0
  for (let index = 0; index <= text.length - sep.length; index += 1) {
    const ch = text[index]
    if (ch === '[' || ch === '(' || ch === '{' || ch === '【' || ch === '（') {
      depth += 1
    } else if (ch === ']' || ch === ')' || ch === '}' || ch === '】' || ch === '）') {
      depth = Math.max(0, depth - 1)
    }

    if (depth > 0) continue
    if (text.slice(index, index + sep.length) !== sep) continue
    return [text.slice(0, index), text.slice(index + sep.length)]
  }

  return null
}

export const parseArtistTitleFromName = (name = '') => {
  const separators = [' - ', ' – ', ' — ', '_', '／', '/', '-', '–', '—']
  for (const separator of separators) {
    const parts = splitOutsideBrackets(name, separator)
    if (!parts) continue
    if (separator === '-' && looksLikeLatinInWordHyphen(name)) continue
    const [left, right] = parts
    if (!left || !right) continue
    const leftPart = left.trim()
    const rightPart = right.trim()
    if (!leftPart || !rightPart) continue

    if (SLASH_LIKE.has(separator) && looksLikeSlashSideCredit(rightPart)) {
      return { title: leftPart, artist: undefined }
    }
    if (SLASH_LIKE.has(separator)) continue

    return { artist: leftPart, title: rightPart }
  }
  return null
}

export function normalizeTitleIdentity(value = '') {
  return cleanMetadataText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−－–—]/g, '-')
    .replace(/\s+/g, '')
    .trim()
}

export function canUseFilenameArtistForEmbeddedTitle(parsedFileTitle, embeddedTitle) {
  const parsedIdentity = normalizeTitleIdentity(parsedFileTitle)
  const embeddedIdentity = normalizeTitleIdentity(embeddedTitle)
  return !!parsedIdentity && parsedIdentity === embeddedIdentity
}

export function isUnknownArtistName(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return !normalized || normalized === 'unknown artist' || looksLikeTrackIndexArtistName(normalized)
}

export function looksLikeTrackIndexArtistName(value = '') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
  if (!normalized) return false
  return /^(?:cd|disc|disk)?\s*\d{1,3}(?:\s*[-./_]\s*\d{1,3})?$/.test(normalized)
}

function cleanArtistCandidate(value = '') {
  const cleaned = cleanMetadataText(value)
  return isUnknownArtistName(cleaned) ? '' : cleaned
}

export function normalizeAlbumDisplayName(value = '') {
  const cleaned = cleanMetadataText(value).normalize('NFKC')
  return (
    cleaned
      .replace(/^\s*[\[(]\s*(?:19|20)\d{2}\s*[\])]\s*[-_.:：]?\s*/, '')
      .replace(/^\s*(?:19|20)\d{2}\s*[-_.:：]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim() || cleaned
  )
}

export function normalizeAlbumNameKey(value = '') {
  return normalizeAlbumDisplayName(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const GENERIC_ALBUM_FALLBACK_NAMES = new Set([
  'music',
  'songs',
  'single',
  'singles',
  'unknown album',
  'unknown',
  'album',
  'misc',
  'other'
])

export function isGenericAlbumFallbackName(albumName) {
  return GENERIC_ALBUM_FALLBACK_NAMES.has(normalizeAlbumNameKey(albumName))
}

export function normalizeArtistNameKey(value = '') {
  return cleanMetadataText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim()
}

function getTrackParentDirectory(track) {
  const value = String(track?.path || '')
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  return index > 0 ? value.slice(0, index) : ''
}

function getPathBasename(value = '') {
  const text = String(value || '').replace(/[\\/]+$/, '')
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return index >= 0 ? text.slice(index + 1) : text
}

function getPathParentDirectory(value = '') {
  const text = String(value || '').replace(/[\\/]+$/, '')
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return index > 0 ? text.slice(0, index) : ''
}

function looksLikeDiscSubdirectoryName(value) {
  return /^(?:cd|disc|disk|dvd|bd|vol|volume)?\s*\d{1,3}$/i.test(
    String(value || '')
      .normalize('NFKC')
      .trim()
  )
}

function normalizeAlbumFolderKey(value = '') {
  return cleanMetadataText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\\/]+/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getTrackAlbumFolderKey(track) {
  const parentDirectory = getTrackParentDirectory(track)
  const albumDirectory = looksLikeDiscSubdirectoryName(getPathBasename(parentDirectory))
    ? getPathParentDirectory(parentDirectory)
    : parentDirectory
  return normalizeAlbumFolderKey(albumDirectory)
}

export function getTrackAlbumArtist(track) {
  const albumArtist =
    cleanArtistCandidate(track?.info?.albumArtist) || cleanArtistCandidate(track?.albumArtist)
  if (albumArtist) return albumArtist
  return (
    cleanArtistCandidate(track?.info?.artist) ||
    cleanArtistCandidate(track?.artist) ||
    'Unknown Artist'
  )
}

export function getTrackExplicitAlbumArtist(track) {
  return cleanArtistCandidate(track?.info?.albumArtist) || cleanArtistCandidate(track?.albumArtist)
}

export function getTrackAlbumGroupKey(track) {
  const albumKey = normalizeAlbumNameKey(getTrackAlbumName(track))
  if (!albumKey) return ''

  const folderKey = getTrackAlbumFolderKey(track)
  const albumSourcePriority = getMetadataSourcePriority(
    getTrackMetaFieldSource(track?.info, 'album')
  )
  const albumArtistSourcePriority = getMetadataSourcePriority(
    getTrackMetaFieldSource(track?.info, 'albumArtist')
  )
  const artistSourcePriority = getMetadataSourcePriority(
    getTrackMetaFieldSource(track?.info, 'artist')
  )
  const albumIsEmbeddedOrBetter = albumSourcePriority >= getMetadataSourcePriority('embedded-cue')
  const artistIsReliable =
    albumArtistSourcePriority >= getMetadataSourcePriority('embedded-cue') ||
    artistSourcePriority >= getMetadataSourcePriority('embedded-cue')
  const artistKey = normalizeArtistNameKey(
    getTrackExplicitAlbumArtist(track) || getTrackAlbumArtist(track)
  )

  if (
    albumIsEmbeddedOrBetter &&
    artistIsReliable &&
    artistKey &&
    !isGenericAlbumFallbackName(albumKey)
  ) {
    return `${albumKey}\u0001artist:${artistKey}`
  }

  if (folderKey) return `${albumKey}\u0001folder:${folderKey}`

  if (artistKey) return `${albumKey}\u0001artist:${artistKey}`

  return `${albumKey}\u0001folder:unknown`
}

export function resolveTrackIdentityFromMetadata({
  fileName = '',
  title = '',
  artist = '',
  albumArtist = ''
} = {}) {
  const strippedFileName = stripExtension(fileName || '')
  const displayFileName = stripAudioQualityTitleSuffix(strippedFileName)
  const embeddedTitle = cleanMetadataText(title)
  const parsedFromFile = parseArtistTitleFromName(displayFileName)

  const validMetaArtist = cleanArtistCandidate(artist)
  const validAlbumArtist = cleanArtistCandidate(albumArtist)
  const parsedFileArtist = cleanArtistCandidate(parsedFromFile?.artist)

  if (embeddedTitle) {
    let resolvedArtist = validMetaArtist || validAlbumArtist || ''
    if (
      !resolvedArtist &&
      parsedFileArtist &&
      parsedFromFile?.title &&
      canUseFilenameArtistForEmbeddedTitle(parsedFromFile.title, embeddedTitle)
    ) {
      resolvedArtist = parsedFileArtist
    }
    return {
      title: stripAudioQualityTitleSuffix(embeddedTitle) || embeddedTitle,
      artist: resolvedArtist || 'Unknown Artist',
      source: 'metadata'
    }
  }

  if (validMetaArtist || validAlbumArtist) {
    return {
      title: parsedFromFile?.title || displayFileName || 'Unknown Track',
      artist: validMetaArtist || validAlbumArtist,
      source: 'metadata'
    }
  }

  if (parsedFromFile?.title || parsedFromFile?.artist) {
    return {
      title: parsedFromFile?.title || displayFileName || 'Unknown Track',
      artist: parsedFileArtist || 'Unknown Artist',
      source: 'filename'
    }
  }

  return {
    title: displayFileName || 'Unknown Track',
    artist: 'Unknown Artist',
    source: 'filename'
  }
}

export const toOrderNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER
}

export const compareTrackOrder = (a, b) => {
  const discDiff = toOrderNumber(a.info.discNo) - toOrderNumber(b.info.discNo)
  if (discDiff !== 0) return discDiff

  const trackDiff = toOrderNumber(a.info.trackNo) - toOrderNumber(b.info.trackNo)
  if (trackDiff !== 0) return trackDiff

  return a.info.fileName.localeCompare(b.info.fileName, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

export const compareTrackFrequent = (a, b, trackStats = {}) => {
  const statA = trackStats?.[a?.path] || {}
  const statB = trackStats?.[b?.path] || {}
  const playDelta = Number(statB.playCount || 0) - Number(statA.playCount || 0)
  if (playDelta !== 0) return playDelta

  const lastPlayedDelta = Number(statB.lastPlayedAt || 0) - Number(statA.lastPlayedAt || 0)
  if (lastPlayedDelta !== 0) return lastPlayedDelta

  return compareTrackOrder(a, b)
}

function hashTrackRandomKey(value) {
  const text = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hashTrackRandomRank(value) {
  const high = hashTrackRandomKey(`h:${value}`) & 0x1fffff
  const low = hashTrackRandomKey(`l:${value}`)
  return high * 0x100000000 + low
}

export const compareTrackRandom = (a, b, seed = 0) => {
  const seedText = String(seed || 0)
  const aKey = hashTrackRandomRank(`${seedText}:${a?.path || a?.info?.fileName || ''}`)
  const bKey = hashTrackRandomRank(`${seedText}:${b?.path || b?.info?.fileName || ''}`)
  if (aKey !== bKey) return aKey - bKey
  return compareTrackOrder(a, b)
}

export function getTrackAlbumName(track) {
  return normalizeAlbumDisplayName(track?.info?.album || track?.album || 'Singles') || 'Singles'
}

function pushUniqueCover(covers, seen, cover) {
  const value = typeof cover === 'string' ? cover.trim() : ''
  if (!value || seen.has(value)) return
  seen.add(value)
  covers.push(value)
}

export function getAlbumCoverCandidates(
  tracks = [],
  { albumName = '', albumKey = '', albumCoverMap = {}, trackMetaMap = {} } = {}
) {
  const normalizedAlbumName =
    String(
      albumName || getTrackAlbumName(tracks.find((track) => getTrackAlbumName(track))) || ''
    ).trim() || getTrackAlbumName(tracks[0])
  const covers = []
  const seen = new Set()
  const normalizedAlbumKey = String(albumKey || '').trim()

  pushUniqueCover(covers, seen, normalizedAlbumKey ? albumCoverMap?.[normalizedAlbumKey] : null)
  pushUniqueCover(covers, seen, albumCoverMap?.[normalizedAlbumName])

  const trackScopedMetaCovers = []
  for (const track of tracks) {
    const entry = trackMetaMap?.[track?.path]
    if (entry?.coverScope === 'track') {
      pushUniqueCover(trackScopedMetaCovers, seen, entry?.cover)
    } else {
      pushUniqueCover(covers, seen, entry?.cover)
    }
  }

  for (const track of tracks) {
    pushUniqueCover(covers, seen, track?.cover)
    pushUniqueCover(covers, seen, track?.info?.cover)
  }

  if (covers.length === 0) covers.push(...trackScopedMetaCovers)

  return covers
}

export function buildTrackArtworkSources(
  track,
  { trackMetaMap = {}, effectiveTrackMetaMap = {}, albumCoverMap = {}, albumTracks = [] } = {}
) {
  if (!track) return []
  const sources = []
  const seen = new Set()
  const path = track?.path || ''
  const albumName = getTrackAlbumName(track)
  const albumKey = getTrackAlbumGroupKey(track)
  const allowAlbumFallback = albumKey && !isGenericAlbumFallbackName(albumName)
  const effectiveMetaCover =
    (path ? effectiveTrackMetaMap?.[path]?.cover || trackMetaMap?.[path]?.cover : '') || ''

  pushUniqueCover(sources, seen, effectiveMetaCover)
  pushUniqueCover(sources, seen, track?.info?.cover)
  pushUniqueCover(sources, seen, track?.cover)
  if (!allowAlbumFallback) return sources

  pushUniqueCover(sources, seen, albumKey ? albumCoverMap?.[albumKey] : null)

  const candidateTracks = Array.isArray(albumTracks) ? albumTracks : []
  for (const candidate of candidateTracks) {
    if (!candidate?.path || candidate.path === path) continue
    if (getTrackAlbumGroupKey(candidate) !== albumKey) continue
    const candidateEntry =
      effectiveTrackMetaMap?.[candidate.path] || trackMetaMap?.[candidate.path] || null
    if (candidateEntry?.coverScope !== 'track') {
      pushUniqueCover(sources, seen, candidateEntry?.cover)
    }
    pushUniqueCover(sources, seen, candidate?.info?.cover)
    pushUniqueCover(sources, seen, candidate?.cover)
  }

  return sources
}

export function getBestAlbumCover(tracks = [], options = {}) {
  return getAlbumCoverCandidates(tracks, options)[0] || null
}

export function isUnknownArtistDisplay(value = '') {
  return isUnknownArtistName(value)
}

export function getArtworkFingerprint(value = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  return `${text.length}:${text.slice(0, 160)}:${text.slice(-160)}`
}

export function isDisplayableTrackCoverUrl(value = '') {
  const cover = String(value || '').trim()
  return /^(?:data:image\/|file:\/\/|https?:\/\/)/i.test(cover)
}

export function hasReusableTrackCoverMeta(entry = {}) {
  const cover = typeof entry?.cover === 'string' ? entry.cover.trim() : ''
  if (!cover || entry?.coverChecked !== true) return false
  return entry.coverThumbnailOnly === true || isDisplayableTrackCoverUrl(cover)
}

export function getCurrentTrackDisplayCover({
  currentTrack = null,
  currentTrackMeta = null,
  albumCoverMap = {}
} = {}) {
  const normalizeCover = (value) => {
    const cover = typeof value === 'string' ? value.trim() : ''
    return cover || ''
  }
  const metaCover = normalizeCover(currentTrackMeta?.cover)
  if (metaCover) return metaCover

  const infoCover = normalizeCover(currentTrack?.info?.cover)
  if (infoCover) return infoCover

  const trackCover = normalizeCover(currentTrack?.cover)
  if (trackCover) return trackCover

  const albumKey = currentTrack ? getTrackAlbumGroupKey(currentTrack) : ''
  return normalizeCover(albumKey ? albumCoverMap?.[albumKey] : '')
}

function pushUniqueTracks(target, source) {
  const seen = new Set(target.map((track) => track?.path || track?.info?.fileName || track))
  for (const track of Array.isArray(source) ? source : []) {
    const key = track?.path || track?.info?.fileName || track
    if (seen.has(key)) continue
    seen.add(key)
    target.push(track)
  }
}

function mergeCoverCandidates(existing = [], incoming = []) {
  const merged = []
  const seen = new Set()
  for (const cover of [...(existing || []), ...(incoming || [])]) {
    pushUniqueCover(merged, seen, cover)
  }
  return merged
}

function preferAlbumBucketName(current, incoming) {
  const currentName = normalizeAlbumDisplayName(current?.name || '')
  const incomingName = normalizeAlbumDisplayName(incoming?.name || '')
  if (!incomingName) return currentName
  if (!currentName) return incomingName
  if (isGenericAlbumFallbackName(currentName) && !isGenericAlbumFallbackName(incomingName)) {
    return incomingName
  }
  return currentName
}

export function mergeAlbumBucketsByCoverAndArtist(buckets = [], { enabled = false } = {}) {
  const source = Array.isArray(buckets) ? buckets.filter(Boolean) : []
  if (!enabled) return source

  const merged = []
  const byMergeKey = new Map()

  for (const bucket of source) {
    const cover = bucket.cover || bucket.coverCandidates?.[0] || ''
    const coverKey = getArtworkFingerprint(cover)
    const artist = bucket.cacheArtist || bucket.artist || ''
    const artistKey = normalizeArtistNameKey(artist)

    if (!coverKey || !artistKey || isUnknownArtistDisplay(artist)) {
      merged.push(bucket)
      continue
    }

    const mergeKey = `${artistKey}\u0001cover:${coverKey}`
    const existing = byMergeKey.get(mergeKey)
    if (!existing) {
      const next = {
        ...bucket,
        tracks: [...(bucket.tracks || [])],
        coverCandidates: [...(bucket.coverCandidates || [])],
        mergedAlbumKeys: bucket.key ? [bucket.key] : []
      }
      byMergeKey.set(mergeKey, next)
      merged.push(next)
      continue
    }

    const preferredName = preferAlbumBucketName(existing, bucket)
    const preferredIncoming = preferredName === normalizeAlbumDisplayName(bucket.name || '')
    pushUniqueTracks(existing.tracks, bucket.tracks)
    existing.coverCandidates = mergeCoverCandidates(
      existing.coverCandidates,
      bucket.coverCandidates
    )
    existing.cover = existing.cover || bucket.cover || existing.coverCandidates[0] || null
    existing.artist = existing.artist || bucket.artist || artist
    existing.cacheArtist = existing.cacheArtist || bucket.cacheArtist || ''
    existing.name = preferredName
    if (preferredIncoming && bucket.key) existing.key = bucket.key
    existing.mergedAlbumKeys = Array.from(
      new Set([...(existing.mergedAlbumKeys || []), ...(bucket.key ? [bucket.key] : [])])
    )
  }

  return merged
}

export function buildAlbumWallBuckets(
  tracks = [],
  {
    trackMetaMap = {},
    displayMetadataOverrides = {},
    albumCoverMap = {},
    mergeAlbumsByCoverAndAlbumArtist = false
  } = {}
) {
  const identityTrackMetaMap = trackMetaMap || {}
  const identityTracks = (Array.isArray(tracks) ? tracks : []).map((track) => {
    const identityMeta = getEffectiveTrackMeta(
      identityTrackMetaMap,
      displayMetadataOverrides,
      track?.path || ''
    )
    return identityMeta
      ? {
          ...track,
          info: parseTrackInfo(track, identityMeta)
        }
      : track
  })
  const folderAlbumIdentities = new Map()
  for (const track of identityTracks) {
    const folderKey = getTrackAlbumFolderKey(track)
    if (!folderKey) continue
    const albumSourcePriority = getMetadataSourcePriority(
      getTrackMetaFieldSource(track?.info, 'album')
    )
    if (albumSourcePriority < getMetadataSourcePriority('embedded-cue')) continue
    const albumName = getTrackAlbumName(track)
    if (!albumName || isGenericAlbumFallbackName(albumName)) continue
    const albumArtist = track?.info?.albumArtist || ''
    const artist = track?.info?.artist || ''
    const artistName = albumArtist || artist
    const artistKey = normalizeArtistNameKey(artistName)
    if (!artistKey) continue
    const identityKey = `${normalizeAlbumNameKey(albumName)}\u0001artist:${artistKey}`
    const identity = {
      album: albumName,
      artist,
      albumArtist,
      artistName,
      identityKey,
      fieldSources: {
        ...(track?.info?.fieldSources || {}),
        album: track?.info?.fieldSources?.album || 'embedded',
        ...(albumArtist
          ? { albumArtist: track?.info?.fieldSources?.albumArtist || 'embedded' }
          : {}),
        ...(artist ? { artist: track?.info?.fieldSources?.artist || 'embedded' } : {})
      }
    }
    if (!folderAlbumIdentities.has(folderKey)) {
      folderAlbumIdentities.set(folderKey, identity)
    } else {
      const existing = folderAlbumIdentities.get(folderKey)
      if (existing && existing.identityKey !== identityKey) {
        folderAlbumIdentities.set(folderKey, null)
      }
    }
  }

  const groupingTracks = identityTracks.map((track) => {
    const albumSourcePriority = getMetadataSourcePriority(
      getTrackMetaFieldSource(track?.info, 'album')
    )
    if (albumSourcePriority >= getMetadataSourcePriority('embedded-cue')) return track
    const identity = folderAlbumIdentities.get(getTrackAlbumFolderKey(track))
    if (!identity) return track
    const nextInfo = {
      ...(track.info || {}),
      album: identity.album,
      albumArtist: identity.albumArtist || track?.info?.albumArtist || '',
      artist:
        track?.info?.artist && track.info.artist !== 'Unknown Artist'
          ? track.info.artist
          : identity.artistName || track?.info?.artist || '',
      metadataSource: 'embedded',
      fieldSources: {
        ...(track.info?.fieldSources || {}),
        ...(identity.fieldSources || {})
      }
    }
    return {
      ...track,
      info: nextInfo
    }
  })

  const groups = groupingTracks.reduce((acc, identityTrack) => {
    const name = getTrackAlbumName(identityTrack)
    const key = getTrackAlbumGroupKey(identityTrack) || normalizeAlbumNameKey(name)
    if (!acc.has(key)) acc.set(key, { key, name, tracks: [] })
    acc.get(key).tracks.push(identityTrack)
    return acc
  }, new Map())

  const buckets = Array.from(groups.values()).map(({ key, name, tracks: albumTracks }) => {
    const display = resolveAlbumWallDisplayInfo(albumTracks, {
      albumName: name,
      albumKey: key,
      albumCoverMap,
      trackMetaMap: identityTrackMetaMap
    })
    return {
      key,
      name: display.name,
      tracks: albumTracks,
      artist: display.artist,
      cacheArtist: display.cacheArtist,
      cover: display.cover,
      coverCandidates: display.coverCandidates
    }
  })

  return mergeAlbumBucketsByCoverAndArtist(buckets, {
    enabled: mergeAlbumsByCoverAndAlbumArtist === true
  })
}

function isLocalAlbumWallTrack(track, isLocalTrack) {
  if (!track?.path || typeof track.path !== 'string') return false
  if (typeof isLocalTrack === 'function') return isLocalTrack(track)
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(track.path)
}

export function resolveAlbumWallTrackMeta(track, trackMetaMap = {}) {
  const entry = track?.path ? trackMetaMap?.[track.path] || null : null
  const info = parseTrackInfo(track, entry)
  const fieldSources = {
    ...(entry?.fieldSources && typeof entry.fieldSources === 'object' ? entry.fieldSources : {}),
    ...(info.fieldSources && typeof info.fieldSources === 'object' ? info.fieldSources : {})
  }
  return {
    ...(entry || {}),
    title: info.title || entry?.title || null,
    artist: info.artist || entry?.artist || null,
    albumArtist: info.albumArtist || entry?.albumArtist || null,
    album: info.album || entry?.album || null,
    cover: info.cover || entry?.cover || track?.info?.cover || track?.cover || null,
    duration: info.duration || entry?.duration || null,
    trackNo: info.trackNo ?? entry?.trackNo ?? null,
    discNo: info.discNo ?? entry?.discNo ?? null,
    metadataSource: info.metadataSource || entry?.metadataSource || null,
    coverSource: info.coverSource || entry?.coverSource || null,
    fieldSources: Object.keys(fieldSources).length > 0 ? fieldSources : null
  }
}

export function resolveAlbumWallDisplayInfo(
  albumTracks = [],
  { trackMetaMap = {}, albumCoverMap = {}, albumName = '', albumKey = '' } = {}
) {
  const tracks = Array.isArray(albumTracks) ? albumTracks.filter(Boolean) : []
  const resolved = tracks.map((track) => ({
    track,
    meta: resolveAlbumWallTrackMeta(track, trackMetaMap)
  }))
  const displayMeta =
    resolved.find((item) => typeof item.meta.album === 'string' && item.meta.album.trim())?.meta ||
    resolved[0]?.meta ||
    {}
  const displayName =
    normalizeAlbumDisplayName(displayMeta.album || albumName || getTrackAlbumName(tracks[0])) ||
    'Singles'
  const albumArtist =
    resolved
      .map((item) => item.meta.albumArtist)
      .find((value) => value && !isUnknownArtistDisplay(value)) || ''
  const artist =
    albumArtist ||
    resolved
      .map((item) => item.meta.artist)
      .find((value) => value && !isUnknownArtistDisplay(value)) ||
    'Unknown Artist'
  const coverCandidates = getAlbumCoverCandidates(tracks, {
    albumName: displayName,
    albumKey,
    albumCoverMap,
    trackMetaMap
  })

  return {
    name: displayName,
    artist,
    cacheArtist: albumArtist,
    cover: coverCandidates[0] || null,
    coverCandidates
  }
}

export function hasUsefulAlbumWallMeta(track, trackMetaMap = {}, options = {}) {
  if (!track?.path) return false
  const meta = resolveAlbumWallTrackMeta(track, trackMetaMap)
  const album = String(meta.album || '').trim()
  const albumSourcePriority = getMetadataSourcePriority(getTrackMetaFieldSource(meta, 'album'))
  const artist = meta.albumArtist || meta.artist || ''
  const cover =
    meta.cover ||
    (options.albumKey ? options.albumCoverMap?.[options.albumKey] : null) ||
    (album ? options.albumCoverMap?.[album] : null)
  return Boolean(
    album &&
      albumSourcePriority >= getMetadataSourcePriority('embedded-cue') &&
      artist &&
      !isUnknownArtistDisplay(artist) &&
      cover
  )
}

function scoreAlbumWallHydrateTrack(track, trackMetaMap = {}) {
  const meta = resolveAlbumWallTrackMeta(track, trackMetaMap)
  let score = 0
  if (meta.cover) score += 8
  if (meta.albumArtist && !isUnknownArtistDisplay(meta.albumArtist)) score += 4
  if (meta.artist && !isUnknownArtistDisplay(meta.artist)) score += 3
  if (meta.album) score += 2
  if (Number(meta.trackNo) > 0) score += 1
  return score
}

export function buildAlbumWallHydrateTargets(
  tracks = [],
  trackMetaMap = {},
  albumCoverMap = {},
  {
    maxTracksPerAlbum = 2,
    maxAlbums = 80,
    maxTargets = 160,
    isLocalTrack = null,
    albumCoverProbePaths = new Set(),
    albumArtistProbePaths = new Set()
  } = {}
) {
  const groups = new Map()
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!isLocalAlbumWallTrack(track, isLocalTrack)) continue
    const name = getTrackAlbumName(track)
    const key = getTrackAlbumGroupKey(track) || normalizeAlbumNameKey(name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, { key, name, tracks: [] })
    groups.get(key).tracks.push(track)
  }

  const targets = []
  let albumCount = 0
  for (const group of groups.values()) {
    if (albumCount >= maxAlbums || targets.length >= maxTargets) break
    const display = resolveAlbumWallDisplayInfo(group.tracks, {
      trackMetaMap,
      albumCoverMap,
      albumName: group.name,
      albumKey: group.key
    })
    if (display.cover && display.artist && !isUnknownArtistDisplay(display.artist)) continue

    const rankedTracks = group.tracks
      .map((track, index) => ({
        track,
        index,
        score: scoreAlbumWallHydrateTrack(track, trackMetaMap)
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)

    let picked = 0
    for (const item of rankedTracks) {
      if (picked >= maxTracksPerAlbum || targets.length >= maxTargets) break
      const track = item.track
      if (hasUsefulAlbumWallMeta(track, trackMetaMap, { albumCoverMap, albumKey: group.key })) {
        continue
      }
      const meta = resolveAlbumWallTrackMeta(track, trackMetaMap)
      const artist = meta.albumArtist || meta.artist || ''
      const albumSourcePriority = getMetadataSourcePriority(getTrackMetaFieldSource(meta, 'album'))
      const needsCover = !display.cover && !meta.cover
      const needsArtist = !artist || isUnknownArtistDisplay(artist)
      const needsAlbum =
        !meta.album || albumSourcePriority < getMetadataSourcePriority('embedded-cue')
      const coverProbeDone =
        needsCover && meta.coverChecked === true && albumCoverProbePaths.has(track.path)
      const artistProbeDone = needsArtist && albumArtistProbePaths.has(track.path)
      const albumProbeDone =
        needsAlbum && meta.coverChecked === true && albumCoverProbePaths.has(track.path)
      if (
        (needsCover ? coverProbeDone : true) &&
        (needsArtist ? artistProbeDone : true) &&
        (needsAlbum ? albumProbeDone : true)
      ) {
        continue
      }
      targets.push({
        albumKey: group.key,
        albumName: display.name || group.name,
        track,
        needsCover,
        needsArtist,
        needsAlbum,
        source: 'album-wall'
      })
      picked += 1
    }
    if (picked > 0) albumCount += 1
  }

  return targets
}

function resolvePriorityField(trackInfo = {}, meta = {}, field = '') {
  const trackInfoSource = getTrackMetaFieldSource(trackInfo, field)
  const metaSource = getTrackMetaFieldSource(meta, field)
  const trackInfoPriority = getMetadataSourcePriority(trackInfoSource)
  const metaPriority = getMetadataSourcePriority(metaSource)
  const keepCurrentEmbeddedOnTie =
    trackInfoPriority >= getMetadataSourcePriority('embedded-cue') &&
    metaPriority <= trackInfoPriority
  const picked = pickHigherPriorityField(
    trackInfo?.[field],
    trackInfoSource,
    meta?.[field],
    metaSource,
    { allowEqualPriorityOverride: !keepCurrentEmbeddedOnTie }
  )
  return picked
}

function setResolvedFieldSource(fieldSources, field, source, fallbackSource = '') {
  const resolvedSource = source || fallbackSource
  if (resolvedSource) fieldSources[field] = resolvedSource
}

function getStrongestMetadataSource(fieldSources = {}, fallbackSource = '') {
  const sources = Object.values(fieldSources || {}).filter(Boolean)
  if (fallbackSource) sources.push(fallbackSource)
  return (
    sources.sort((a, b) => getMetadataSourcePriority(b) - getMetadataSourcePriority(a))[0] || null
  )
}

export const parseTrackInfo = (track, meta) => {
  const rawName = track?.name || ''
  const fileName = stripExtension(rawName)
  const pathParts = (track?.path || '').split(/[/\\]/).filter(Boolean)
  const folderAlbum = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Album'
  const trackInfo = track?.info && typeof track.info === 'object' ? track.info : {}

  const discTrackPrefix = fileName.match(/^\s*(\d{1,3})\.(\d{1,3})\s+/)
  const trackNoFromName =
    discTrackPrefix?.[2] || fileName.match(/^\s*(\d{1,3})[.)\-\s_]+/)?.[1] || null
  const noTrackNo = discTrackPrefix
    ? fileName.slice(discTrackPrefix[0].length).trim()
    : fileName.replace(/^\s*\d+[.)\-\s_]+/, '').trim()
  const normalized = noTrackNo || fileName
  const titlePick = resolvePriorityField(trackInfo, meta, 'title')
  const artistPick = resolvePriorityField(trackInfo, meta, 'artist')
  const albumArtistPick = resolvePriorityField(trackInfo, meta, 'albumArtist')
  const albumPick = resolvePriorityField(trackInfo, meta, 'album')
  const coverPick = resolvePriorityField(trackInfo, meta, 'cover')
  const trackNoPick = resolvePriorityField(trackInfo, meta, 'trackNo')
  const discNoPick = resolvePriorityField(trackInfo, meta, 'discNo')
  const durationPick = resolvePriorityField(trackInfo, meta, 'duration')
  const metaTitle = cleanMetadataText(titlePick.value || '')
  const metaArtist = cleanMetadataText(artistPick.value || '')
  const metaAlbumArtist = cleanMetadataText(albumArtistPick.value || '')
  const metaAlbum = cleanMetadataText(albumPick.value || '')
  const trackAlbum = cleanMetadataText(track?.album || '')
  const resolvedIdentity = resolveTrackIdentityFromMetadata({
    fileName: normalized,
    title: metaTitle,
    artist: metaArtist,
    albumArtist: metaAlbumArtist
  })
  const artist = resolvedIdentity.artist || 'Unknown Artist'
  const fallbackFromFileName = stripAudioQualityTitleSuffix(normalized) || normalized
  const repairedTechnicalFragmentTitle =
    looksLikeAudioQualityFragment(resolvedIdentity.title) && fallbackFromFileName
      ? fallbackFromFileName
      : resolvedIdentity.title
  const title = repairedTechnicalFragmentTitle || fallbackFromFileName || 'Unknown Track'
  const album = normalizeAlbumDisplayName(metaAlbum || trackAlbum || folderAlbum) || 'Unknown Album'
  const fieldSources = {}
  setResolvedFieldSource(fieldSources, 'title', titlePick.source, metaTitle ? 'unknown' : 'filename')
  setResolvedFieldSource(
    fieldSources,
    'artist',
    artistPick.source || albumArtistPick.source,
    metaArtist || metaAlbumArtist ? 'unknown' : 'filename'
  )
  if (metaAlbumArtist) {
    setResolvedFieldSource(fieldSources, 'albumArtist', albumArtistPick.source, 'unknown')
  }
  setResolvedFieldSource(fieldSources, 'album', albumPick.source, metaAlbum ? 'unknown' : 'folder')
  setResolvedFieldSource(
    fieldSources,
    'trackNo',
    trackNoPick.source,
    trackNoPick.value != null ? 'unknown' : 'filename'
  )
  if (discNoPick.value != null) {
    setResolvedFieldSource(fieldSources, 'discNo', discNoPick.source, 'unknown')
  }
  if (durationPick.value != null) {
    setResolvedFieldSource(fieldSources, 'duration', durationPick.source, 'unknown')
  }
  if (coverPick.value) {
    setResolvedFieldSource(fieldSources, 'cover', coverPick.source, 'unknown')
  }

  return {
    fileName,
    title,
    artist,
    albumArtist: metaAlbumArtist || cleanMetadataText(track?.albumArtist || ''),
    album,
    cover: coverPick.value || null,
    trackNo: trackNoPick.value ?? (trackNoFromName ? Number(trackNoFromName) : null),
    discNo: discNoPick.value ?? null,
    duration: durationPick.value || 0,
    sizeBytes: track?.sizeBytes || 0,
    metadataSource: getStrongestMetadataSource(
      fieldSources,
      meta?.metadataSource || trackInfo?.metadataSource || ''
    ),
    coverSource: coverPick.source || meta?.coverSource || trackInfo?.coverSource || null,
    fieldSources
  }
}

export function getEffectiveTrackMeta(trackMetaMap = {}, displayMetadataOverrides = {}, path = '') {
  const baseMeta = path ? trackMetaMap?.[path] || null : null
  const override = path ? displayMetadataOverrides?.[path] || null : null
  if (!override) return baseMeta
  const manualOverride = withManualMetadataSources(override)
  return mergeTrackMetaWithPriority(baseMeta || {}, manualOverride || {})
}

export function buildParsedPlaylistWithCache(
  previousCache,
  playlist = [],
  trackMetaMap = {},
  displayMetadataOverrides = {}
) {
  const previousEntries = previousCache?.entries instanceof Map ? previousCache.entries : new Map()
  const nextEntries = new Map()
  const hasOverrides =
    displayMetadataOverrides &&
    typeof displayMetadataOverrides === 'object' &&
    Object.keys(displayMetadataOverrides).length > 0

  const items = playlist.map((track, originalIdx) => {
    const path = track?.path || ''
    const baseMeta = path ? trackMetaMap?.[path] || null : null
    const override = hasOverrides && path ? displayMetadataOverrides?.[path] || null : null
    const cacheKey = `${path || '__missing_path__'}\u0000${originalIdx}`
    const previous = previousEntries.get(cacheKey)

    if (
      previous &&
      previous.track === track &&
      previous.baseMeta === baseMeta &&
      previous.override === override
    ) {
      nextEntries.set(cacheKey, previous)
      return previous.item
    }

    const manualOverride = override ? withManualMetadataSources(override) : null
    const meta = manualOverride
      ? mergeTrackMetaWithPriority(baseMeta || {}, manualOverride || {})
      : baseMeta
    const item = {
      ...track,
      originalIdx,
      info: parseTrackInfo(track, meta)
    }
    nextEntries.set(cacheKey, {
      track,
      baseMeta,
      override,
      item
    })
    return item
  })

  return {
    items,
    cache: {
      entries: nextEntries
    }
  }
}
