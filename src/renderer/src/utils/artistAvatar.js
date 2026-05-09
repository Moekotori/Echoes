const GENERIC_ALBUM_ARTIST_NAMES = new Set([
  '',
  'unknown',
  'unknownartist',
  'various',
  'variousartists',
  'va',
  'v.a',
  'compilation',
  'compilations',
  'soundtrack',
  'originalsoundtrack',
  'ost'
])

function choosePreferredArtistName(currentName, candidateName, currentCount, candidateCount) {
  if (!currentName) return candidateName
  if (candidateCount > currentCount) return candidateName
  return currentName
}

const NETEASE_DEFAULT_ARTIST_AVATAR_IDS = new Set([
  '5639395138885805',
  '109951168529049969'
])

const QQ_DEFAULT_ARTIST_AVATAR_RE = /\/music\/photo_new\/T001R\d+x\d+M0000+(?:\.(?:jpg|jpeg|png|webp))?$/i

export function isNeteaseDefaultArtistAvatarUrl(url) {
  const value = String(url || '').trim()
  if (!value) return false
  if (!/(^|\/\/)(p\d+|music)\.music\.126\.net\//i.test(value)) return false
  const cleanPath = value.split('?')[0]
  const match = cleanPath.match(/\/(\d+)\.(?:jpg|jpeg|png|webp)$/i)
  if (match && NETEASE_DEFAULT_ARTIST_AVATAR_IDS.has(match[1])) return true
  return /(?:default|avatar_default|artist_default|user_default)/i.test(cleanPath)
}

export function isQqMusicDefaultArtistAvatarUrl(url) {
  const value = String(url || '').trim()
  if (!value) return false
  if (!/(^|\/\/)(y|qpic)\.qq\.com\//i.test(value)) return false
  const cleanPath = value.split('?')[0]
  return (
    QQ_DEFAULT_ARTIST_AVATAR_RE.test(cleanPath) ||
    /(?:default|avatar_default|singer_default)/i.test(cleanPath)
  )
}

export function isPlatformDefaultArtistAvatarUrl(url) {
  return isNeteaseDefaultArtistAvatarUrl(url) || isQqMusicDefaultArtistAvatarUrl(url)
}

export function isTransientArtistAvatarFailure(value) {
  if (!value || typeof value !== 'object') return false
  if (value.transient === true || value.rateLimited === true) return true

  const status = Number(value.status || value.httpStatus || 0)
  if (status === 403 || status === 408 || status === 425 || status === 429 || status >= 500) {
    return true
  }

  const errorText = String(value.error || value.message || value.reason || '').toLowerCase()
  return (
    errorText.includes('rate') ||
    errorText.includes('limit') ||
    errorText.includes('timeout') ||
    errorText.includes('abort') ||
    errorText.includes('network') ||
    errorText.includes('econn') ||
    errorText.includes('etimedout') ||
    errorText.includes('操作频繁') ||
    errorText.includes('限速') ||
    errorText.includes('限流')
  )
}

export function getArtistAvatarRetryAfterMs(value, fallbackMs = 0) {
  const retryAfterMs = Number(value?.retryAfterMs || value?.retryAfter || 0)
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs
  return Math.max(0, Number(fallbackMs) || 0)
}

export function normalizeArtistAvatarSearchResponse(response) {
  if (Array.isArray(response)) {
    return { candidates: response, transient: false, retryAfterMs: 0 }
  }

  if (!response || typeof response !== 'object') {
    return { candidates: [], transient: false, retryAfterMs: 0 }
  }

  const candidates =
    response.artists ||
    response.items ||
    response.result ||
    response.results ||
    response.data ||
    []

  return {
    candidates: Array.isArray(candidates) ? candidates : [],
    transient: isTransientArtistAvatarFailure(response),
    retryAfterMs: getArtistAvatarRetryAfterMs(response)
  }
}

function normalizeArtistToken(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function normalizeAlbumKey(value) {
  return String(value || 'Singles')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}

function getTrackCoverCandidate(track, trackMetaMap = {}, albumCoverMap = {}) {
  const meta = trackMetaMap[track?.path] || {}
  const albumName = meta.album || track?.info?.album || 'Singles'
  const cover =
    meta.cover ||
    track?.info?.cover ||
    (albumName && typeof albumCoverMap[albumName] === 'string' ? albumCoverMap[albumName] : '') ||
    null
  if (!cover) return null
  return {
    cover,
    source: meta.cover ? 'trackMeta' : track?.info?.cover ? 'trackInfo' : 'album'
  }
}

function coverFingerprint(cover) {
  const value = String(cover || '')
  if (!value) return ''
  return `${value.length}:${value.slice(0, 128)}:${value.slice(-128)}`
}

function isGenericAlbumArtist(value) {
  return GENERIC_ALBUM_ARTIST_NAMES.has(normalizeArtistToken(value))
}

function getArtistAvatarInitials(name) {
  const normalized = String(name || '')
    .normalize('NFKC')
    .trim()
  const letters = Array.from(normalized.replace(/[^\p{L}\p{N}]+/gu, ''))
  if (letters.length === 0) return '?'
  return letters.slice(0, 2).join('').toUpperCase()
}

function getArtistAvatarHue(name) {
  const value = String(name || '')
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360
  }
  return hash
}

function getArtistTrackScore(track, artistName, trackMetaMap, albumArtistCountByAlbum) {
  const meta = trackMetaMap[track?.path] || {}
  const artistToken = normalizeArtistToken(artistName)
  const trackArtistToken = normalizeArtistToken(meta.artist || track?.info?.artist)
  const albumArtist = meta.albumArtist || track?.info?.albumArtist || ''
  const albumArtistToken = normalizeArtistToken(albumArtist)
  const albumKey = normalizeAlbumKey(meta.album || track?.info?.album || 'Singles')
  const albumArtistCount = albumArtistCountByAlbum.get(albumKey) || 0

  if (albumArtistToken && !isGenericAlbumArtist(albumArtist)) {
    return albumArtistToken === artistToken ? 80 : -100
  }
  if (trackArtistToken !== artistToken) return -100
  if (albumArtistCount > 1) return 10
  return 50
}

export function buildArtistBucketsWithAvatars(
  tracks,
  {
    unknownArtist = 'Unknown Artist',
    trackMetaMap = {},
    albumCoverMap = {},
    artistAvatarMap = {}
  } = {}
) {
  const groups = new Map()
  const albumArtistSets = new Map()
  const coverArtistSets = new Map()

  for (const track of Array.isArray(tracks) ? tracks : []) {
    const artistName = track?.info?.artist || unknownArtist
    const artistToken = normalizeArtistToken(artistName)
    const unknown = artistName === unknownArtist || isGenericAlbumArtist(artistName)
    const groupKey = unknown ? `unknown:${normalizeArtistToken(unknownArtist)}` : artistToken || artistName
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        name: artistName,
        tracks: [],
        variantCounts: new Map([[artistName, 0]])
      })
    }
    const group = groups.get(groupKey)
    const previousCount = group.variantCounts.get(group.name) || 0
    const nextCount = (group.variantCounts.get(artistName) || 0) + 1
    group.variantCounts.set(artistName, nextCount)
    group.name = choosePreferredArtistName(group.name, artistName, previousCount, nextCount)
    group.tracks.push(track)

    const albumKey = normalizeAlbumKey(track?.info?.album || 'Singles')
    if (!albumArtistSets.has(albumKey)) albumArtistSets.set(albumKey, new Set())
    if (artistToken && !unknown) albumArtistSets.get(albumKey).add(artistToken)

    const coverCandidate = getTrackCoverCandidate(track, trackMetaMap, albumCoverMap)
    const fingerprint = coverFingerprint(coverCandidate?.cover)
    if (fingerprint && artistToken && !unknown) {
      if (!coverArtistSets.has(fingerprint)) coverArtistSets.set(fingerprint, new Set())
      coverArtistSets.get(fingerprint).add(artistToken)
    }
  }

  const albumArtistCountByAlbum = new Map(
    Array.from(albumArtistSets.entries()).map(([albumKey, artistSet]) => [albumKey, artistSet.size])
  )

  const buckets = Array.from(groups.values()).map((artist) => {
    const { variantCounts, ...artistBucket } = artist
    let best = null

    for (const track of artistBucket.tracks) {
      const coverCandidate = getTrackCoverCandidate(track, trackMetaMap, albumCoverMap)
      if (!coverCandidate?.cover) continue
      const fingerprint = coverFingerprint(coverCandidate.cover)
      const sharedArtistCount = coverArtistSets.get(fingerprint)?.size || 0
      if (sharedArtistCount > 1) continue

      const ownershipScore = getArtistTrackScore(
        track,
        artistBucket.name,
        trackMetaMap,
        albumArtistCountByAlbum
      )
      if (ownershipScore < 0) continue

      const score =
        ownershipScore +
        (coverCandidate.source === 'trackMeta'
          ? 12
          : coverCandidate.source === 'trackInfo'
            ? 8
            : 4)
      if (!best || score > best.score) {
        best = { cover: coverCandidate.cover, source: coverCandidate.source, score }
      }
    }

    const fallbackCover = best?.cover || null
    const remoteAvatar = artistAvatarMap[artistBucket.name] || ''
    const usableRemoteAvatar = isPlatformDefaultArtistAvatarUrl(remoteAvatar) ? '' : remoteAvatar

    return {
      ...artistBucket,
      cover: usableRemoteAvatar || fallbackCover,
      fallbackCover,
      coverSource: usableRemoteAvatar
        ? 'remote'
        : best?.cover
          ? best.source === 'album'
            ? 'album'
            : 'track'
          : 'initials',
      hasLocalCover: !!fallbackCover,
      hasRemoteAvatar: !!usableRemoteAvatar,
      isUnknownArtist: artistBucket.name === unknownArtist || isGenericAlbumArtist(artistBucket.name),
      avatarInitials: getArtistAvatarInitials(artistBucket.name),
      avatarHue: getArtistAvatarHue(artistBucket.name)
    }
  })

  return buckets.sort(
    (a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name)
  )
}
