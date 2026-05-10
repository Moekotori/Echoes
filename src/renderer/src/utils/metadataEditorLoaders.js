function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function normalizeNeteaseCoverUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return ''
  return `${cleanUrl.replace(/\?.*$/, '')}?param=600y600`
}

function normalizeItunesCoverUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return ''
  return cleanUrl.replace(/100x100bb(\.[a-z0-9]+)$/i, '600x600bb$1')
}

function scoreNetworkCandidate(candidate, title, artist, album) {
  const wantedTitle = normalizeLookupText(title)
  const wantedArtist = normalizeLookupText(artist)
  const wantedAlbum = normalizeLookupText(album)
  const candidateTitle = normalizeLookupText(candidate?.name || candidate?.title || candidate?.trackName)
  const candidateArtist = normalizeLookupText(
    candidate?.artists || candidate?.artist || candidate?.artistName
  )
  const candidateAlbum = normalizeLookupText(candidate?.album || candidate?.collectionName)

  if (!wantedTitle || !candidateTitle) return 0
  if (
    candidateTitle !== wantedTitle &&
    !candidateTitle.includes(wantedTitle) &&
    !wantedTitle.includes(candidateTitle)
  ) {
    return 0
  }

  let score = candidateTitle === wantedTitle ? 8 : 5
  if (wantedArtist && candidateArtist) {
    if (candidateArtist === wantedArtist) score += 4
    else if (candidateArtist.includes(wantedArtist) || wantedArtist.includes(candidateArtist)) {
      score += 2
    }
  }
  if (wantedAlbum && candidateAlbum) {
    if (candidateAlbum === wantedAlbum) score += 3
    else if (candidateAlbum.includes(wantedAlbum) || wantedAlbum.includes(candidateAlbum)) score += 1
  }
  return score
}

function normalizeCandidate(candidate, source, base) {
  if (!candidate) return null
  const title = String(candidate.title || candidate.name || candidate.trackName || '').trim()
  const artist = String(candidate.artist || candidate.artists || candidate.artistName || '').trim()
  const album = String(candidate.album || candidate.collectionName || candidate.albumName || '').trim()
  const rawCover = String(candidate.cover || candidate.picUrl || candidate.artworkUrl100 || '').trim()
  const yearText = String(candidate.year || candidate.releaseDate || '').trim()
  const year = Number.parseInt(yearText.slice(0, 4), 10)
  const score = scoreNetworkCandidate({ name: title, artist, artists: artist, album }, base.title, base.artist, base.album)
  if (score < 5) return null
  const cover =
    source === 'netease'
      ? normalizeNeteaseCoverUrl(rawCover)
      : source === 'itunes'
        ? normalizeItunesCoverUrl(rawCover)
        : rawCover

  return {
    title,
    artist,
    album,
    albumArtist: artist,
    trackNumber: candidate.trackNumber || '',
    year: Number.isFinite(year) && year > 0 ? String(year) : '',
    genre: candidate.genre || candidate.primaryGenreName || '',
    coverDataUrl: cover || '',
    score
  }
}

function pickBestCandidate(candidates, source, base) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => normalizeCandidate(candidate, source, base))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(Boolean(b.coverDataUrl)) - Number(Boolean(a.coverDataUrl)))[0]
}

export async function loadNetworkMetadataForEditor({
  title = '',
  artist = '',
  album = '',
  searchNetease = null,
  searchQqMusic = null,
  fetchImpl = null
} = {}) {
  const base = {
    title: String(title || '').trim(),
    artist: String(artist || '').trim(),
    album: String(album || '').trim()
  }
  const query = `${base.title} ${base.artist}`.trim()
  if (!query) return null

  let best = null
  const accept = (candidate) => {
    if (!candidate) return
    if (!best || candidate.score > best.score || (!best.coverDataUrl && candidate.coverDataUrl)) {
      best = candidate
    }
  }

  if (typeof searchNetease === 'function') {
    try {
      const songs = await searchNetease(query)
      accept(pickBestCandidate(songs, 'netease', base))
    } catch (error) {
      console.warn('Netease metadata editor lookup failed:', error)
    }
  }

  if (typeof searchQqMusic === 'function') {
    try {
      const songs = await searchQqMusic(query)
      accept(pickBestCandidate(songs, 'qq', base))
    } catch (error) {
      console.warn('QQ Music metadata editor lookup failed:', error)
    }
  }

  if (typeof fetchImpl === 'function' && (!best || !best.coverDataUrl)) {
    try {
      const response = await fetchImpl(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`
      )
      const data = await response.json()
      accept(
        pickBestCandidate(
          (data?.results || []).map((item) => ({
            ...item,
            name: item.trackName,
            artist: item.artistName,
            album: item.collectionName,
            cover: item.artworkUrl100
          })),
          'itunes',
          base
        )
      )
    } catch (error) {
      console.warn('iTunes metadata editor lookup failed:', error)
    }
  }

  return best
}
