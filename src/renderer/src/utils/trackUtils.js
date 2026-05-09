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

function normalizeIdentityText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, '')
    .trim()
}

export function isUnknownArtistName(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
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
    String(value || '').normalize('NFKC').trim()
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

  const parentDirectory = getTrackParentDirectory(track)
  const albumDirectory = looksLikeDiscSubdirectoryName(getPathBasename(parentDirectory))
    ? getPathParentDirectory(parentDirectory)
    : parentDirectory
  const folderKey = normalizeAlbumFolderKey(albumDirectory)
  if (folderKey) return `${albumKey}\u0001folder:${folderKey}`

  const artistKey = normalizeArtistNameKey(getTrackExplicitAlbumArtist(track))
  if (artistKey) return `${albumKey}\u0001artist:${artistKey}`

  return `${albumKey}\u0001folder:unknown`
}

function looksLikeTrailingDashTitleFragment(metaTitle = '', fileTitle = '') {
  const title = String(metaTitle || '').trim()
  const parsedTitle = String(fileTitle || '').trim()
  if (!title || !parsedTitle) return false

  const normalizedTitle = normalizeIdentityText(title)
  const normalizedParsedTitle = normalizeIdentityText(parsedTitle)
  if (!normalizedTitle || !normalizedParsedTitle) return false
  if (normalizedTitle.length >= normalizedParsedTitle.length) return false
  if (!normalizedParsedTitle.endsWith(normalizedTitle)) return false

  const prefix = normalizedParsedTitle.slice(0, -normalizedTitle.length)
  if (!prefix.endsWith('-')) return false

  return /-$/.test(title) || normalizedTitle.length <= 18
}

export function resolveTrackIdentityFromMetadata({
  fileName = '',
  title = '',
  artist = '',
  albumArtist = ''
} = {}) {
  const strippedFileName = stripExtension(fileName || '')
  const displayFileName = stripAudioQualityTitleSuffix(strippedFileName)
  const displayTitle = stripAudioQualityTitleSuffix(title)
  const parsedFromFile = parseArtistTitleFromName(displayFileName)
  const parsedFromMetaTitle = displayTitle ? parseArtistTitleFromName(displayTitle) : null

  const validMetaArtist = cleanArtistCandidate(artist)
  const validAlbumArtist = cleanArtistCandidate(albumArtist)
  const parsedMetaArtist = cleanArtistCandidate(parsedFromMetaTitle?.artist)
  const parsedFileArtist = cleanArtistCandidate(parsedFromFile?.artist)
  const resolvedTitle =
    parsedFromMetaTitle?.title || displayTitle || parsedFromFile?.title || displayFileName
  const resolvedArtist =
    validMetaArtist ||
    validAlbumArtist ||
    parsedMetaArtist ||
    parsedFileArtist ||
    'Unknown Artist'

  if (
    parsedFromFile?.title &&
    parsedFileArtist &&
    looksLikeTrailingDashTitleFragment(title, parsedFromFile.title)
  ) {
    const normalizedArtist = normalizeIdentityText(validMetaArtist || validAlbumArtist)
    const normalizedFileArtist = normalizeIdentityText(parsedFileArtist)
    const keepMetaArtist = normalizedArtist && normalizedArtist === normalizedFileArtist

    return {
      title: parsedFromFile.title,
      artist: keepMetaArtist ? validMetaArtist || validAlbumArtist : parsedFileArtist,
      source: 'filename'
    }
  }

  return {
    title: resolvedTitle,
    artist: resolvedArtist,
    source: title || validMetaArtist || validAlbumArtist ? 'metadata' : 'filename'
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
    String(albumName || getTrackAlbumName(tracks.find((track) => getTrackAlbumName(track))) || '').trim() ||
    getTrackAlbumName(tracks[0])
  const covers = []
  const seen = new Set()
  const normalizedAlbumKey = String(albumKey || '').trim()

  pushUniqueCover(covers, seen, normalizedAlbumKey ? albumCoverMap?.[normalizedAlbumKey] : null)
  if (!normalizedAlbumKey) pushUniqueCover(covers, seen, albumCoverMap?.[normalizedAlbumName])

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

export function getBestAlbumCover(tracks = [], options = {}) {
  return getAlbumCoverCandidates(tracks, options)[0] || null
}

export const parseTrackInfo = (track, meta) => {
  const rawName = track?.name || ''
  const fileName = stripExtension(rawName)
  const pathParts = (track?.path || '').split(/[/\\]/).filter(Boolean)
  const folderAlbum = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Album'

  const discTrackPrefix = fileName.match(/^\s*(\d{1,3})\.(\d{1,3})\s+/)
  const trackNoFromName =
    discTrackPrefix?.[2] || fileName.match(/^\s*(\d{1,3})[.)\-\s_]+/)?.[1] || null
  const noTrackNo = discTrackPrefix
    ? fileName.slice(discTrackPrefix[0].length).trim()
    : fileName.replace(/^\s*\d+[.)\-\s_]+/, '').trim()
  const normalized = noTrackNo || fileName
  const parsedFromMeta = meta?.title ? parseArtistTitleFromName(meta.title) : null
  /** Slash+cover 启发式时只返回 title，不把左侧当歌手 */
  const metaTitleForUi =
    parsedFromMeta && parsedFromMeta.artist === undefined && parsedFromMeta.title
      ? parsedFromMeta.title
      : null

  const resolvedIdentity = resolveTrackIdentityFromMetadata({
    fileName: normalized,
    title: cleanMetadataText(metaTitleForUi || meta?.title || ''),
    artist: cleanMetadataText(meta?.artist || ''),
    albumArtist: cleanMetadataText(meta?.albumArtist || '')
  })
  const artist = resolvedIdentity.artist || 'Unknown Artist'
  const fallbackFromFileName = stripAudioQualityTitleSuffix(normalized) || normalized
  const repairedTechnicalFragmentTitle =
    looksLikeAudioQualityFragment(resolvedIdentity.title) && fallbackFromFileName
      ? fallbackFromFileName
      : resolvedIdentity.title
  const title = repairedTechnicalFragmentTitle || fallbackFromFileName || 'Unknown Track'

  return {
    fileName,
    title,
    artist,
    albumArtist: cleanMetadataText(meta?.albumArtist || track?.albumArtist || ''),
    album:
      normalizeAlbumDisplayName(meta?.album || track?.album || folderAlbum) || 'Unknown Album',
    cover: meta?.cover || null,
    trackNo: meta?.trackNo ?? (trackNoFromName ? Number(trackNoFromName) : null),
    discNo: meta?.discNo ?? null,
    duration: meta?.duration || 0,
    sizeBytes: track?.sizeBytes || 0
  }
}

export function getEffectiveTrackMeta(trackMetaMap = {}, displayMetadataOverrides = {}, path = '') {
  const baseMeta = path ? trackMetaMap?.[path] || null : null
  const override = path ? displayMetadataOverrides?.[path] || null : null
  if (!override) return baseMeta
  return {
    ...(baseMeta || {}),
    ...override,
    cover: override?.cover || baseMeta?.cover || null
  }
}

export function buildParsedPlaylistWithCache(
  previousCache,
  playlist = [],
  trackMetaMap = {},
  displayMetadataOverrides = {}
) {
  const previousEntries =
    previousCache?.entries instanceof Map ? previousCache.entries : new Map()
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

    const meta = override
      ? {
          ...(baseMeta || {}),
          ...override,
          cover: override?.cover || baseMeta?.cover || null
        }
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
