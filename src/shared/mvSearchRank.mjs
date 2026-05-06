const DECORATOR_WORD_RE =
  /\b(mv|pv|official|music\s*video|video|full|hd|hq|lyrics?|lyric\s*video|audio|version)\b/gi

const BAD_MATCH_RE =
  /\b(reaction|cover|remix|rmx|tutorial|lesson|piano|guitar|drum|bass|karaoke|instrumental|nightcore|slowed|reverb|practice|live|concert|lyrics?|lyric\s*video|audio|gameplay|walkthrough|playthrough|lets\s*play|gaming|roblox|minecraft|simulator|taxi|driving|race|racing|maimai|mai\s*mai|taiko|chunithm|chuni|sdvx|pjsk|phigros|deemo|osu|cytus|arcaea|dance\s*cover|dance\s*practice)\b|\u821e\u840c|\u592a\u9f13|\u8c31\u9762|\u81ea\u5236\u8c31|\u97f3\u6e38|\u8282\u594f\u6e38\u620f|\u8282\u594f\u5927\u5e08|\u4e2d\u4e8c\u8282\u594f|\u8857\u673a|\u7ffb\u5531|\u7ffb\u5f39|\u7ffb\u8df3|\u8df3\u821e|\u821e\u8e48|\u94a2\u7434|\u5409\u4ed6|\u67b6\u5b50\u9f13|\u9f13\u624b|\u6559\u7a0b|\u6559\u5b66|\u4f34\u594f|\u5361\u62c9\s*OK|\u7ec3\u4e60|\u642c\u8fd0|\u8f6c\u8f7d|\u73b0\u573a|\u6f14\u5531\u4f1a|\u7eaf\u97f3\u4e50|\u6e38\u620f|\u624b\u6e38|\u5b9e\u51b5|\u89e3\u8bf4|\u901a\u5173|\u6d4b\u8bc4|\u8d5b\u8f66|\u9a7e\u9a76|\u51fa\u79df\u8f66/i

const POSITIVE_MV_RE =
  /\b(mv|pv|official|music\s*video)\b|\u5b98\u65b9|\u539f\u7248|\u5b8c\u6574\u7248/i
const OFFICIAL_AUTHOR_RE = /\b(official|vevo)\b|\u5b98\u65b9|\u516c\u5f0f/i

const NON_WORD_RE = /[^\p{L}\p{N}]+/gu
const UNKNOWN_ARTIST_RE =
  /^(unknown|unknown artist|unknown singer|artist|various artists|va|n a|na|null|undefined|\u672a\u77e5|\u672a\u77e5\u827a\u672f\u5bb6|\u672a\u77e5\u6b4c\u624b|\u4f5a\u540d|\u4e0d\u660e)$/

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function safeNormalize(value = '') {
  try {
    return String(value || '').normalize('NFKC')
  } catch {
    return String(value || '')
  }
}

function normalizeText(value = '', { removeDecorators = false } = {}) {
  let text = safeNormalize(stripHtml(value))
  if (removeDecorators) text = text.replace(DECORATOR_WORD_RE, ' ')
  return text.toLowerCase().replace(NON_WORD_RE, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeSearchArtist(value = '') {
  const artist = normalizeText(value, { removeDecorators: true })
  return UNKNOWN_ARTIST_RE.test(artist) ? '' : artist
}

function compactText(value = '', options) {
  return normalizeText(value, options).replace(/\s+/g, '')
}

function compactNormalizedText(value = '') {
  return String(value || '').replace(/\s+/g, '')
}

export function parsePopularityCount(value = '') {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  }

  if (value && typeof value === 'object') {
    const candidates = [
      value.view,
      value.play,
      value.views,
      value.plays,
      value.viewCount,
      value.playCount,
      value.view_count,
      value.play_count,
      value.stat?.view,
      value.stat?.play,
      value.viewCountText,
      value.shortViewCountText,
      value.playText
    ]
    return candidates.reduce(
      (best, candidate) => Math.max(best, parsePopularityCount(candidate)),
      0
    )
  }

  const text = stripHtml(value).replace(/,/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return 0

  const plainNumber = text.match(/^\d+(?:\.\d+)?$/)
  if (plainNumber) return Math.max(0, Math.floor(Number(plainNumber[0])))

  let best = 0
  const countPattern =
    /(\d+(?:\.\d+)?)\s*(k|m|b|\u4e07|\u5104|\u4ebf)?\s*(?:views?|plays?|\u64ad\u653e|\u89c2\u770b|\u6b21\u89c2\u770b|\u6b21\u64ad\u653e)?/gi
  for (const match of text.matchAll(countPattern)) {
    const before = match.index > 0 ? text[match.index - 1] : ''
    const after = text[match.index + match[0].length] || ''
    if (/[a-z0-9]/i.test(before) || /[a-z0-9]/i.test(after)) continue
    const raw = Number(match[1])
    if (!Number.isFinite(raw)) continue
    const unit = String(match[2] || '').toLowerCase()
    const suffix = match[0].slice(match[1].length)
    const hasCountHint =
      !!unit ||
      /views?|plays?|\u64ad\u653e|\u89c2\u770b|\u6b21\u89c2\u770b|\u6b21\u64ad\u653e/i.test(suffix)
    if (!hasCountHint) continue
    const multiplier =
      unit === 'k'
        ? 1_000
        : unit === 'm'
          ? 1_000_000
          : unit === 'b'
            ? 1_000_000_000
            : unit === '\u4e07'
              ? 10_000
              : unit === '\u4ebf' || unit === '\u5104'
                ? 100_000_000
                : 1
    best = Math.max(best, Math.floor(raw * multiplier))
  }

  return best
}

function getPopularityScore(count = 0) {
  const normalized = Math.max(0, Number(count) || 0)
  if (normalized <= 0) return 0
  return Math.min(96, Math.log10(normalized + 1) * 10)
}

function getSignificantTerms(value = '') {
  return normalizeText(value, { removeDecorators: true })
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
}

function hasTitleMatch(resultTitleNorm, trackTitleNorm) {
  const resultCompact = compactNormalizedText(resultTitleNorm)
  const trackCompact = compactNormalizedText(trackTitleNorm)
  if (!resultCompact || trackCompact.length < 2) return false
  if (resultCompact.includes(trackCompact)) return true

  if (
    trackCompact.includes(resultCompact) &&
    resultCompact.length >= Math.max(4, Math.floor(trackCompact.length * 0.65))
  ) {
    return true
  }

  const terms = getSignificantTerms(trackTitleNorm)
  if (terms.length === 0) return false
  return terms.every((term) => resultTitleNorm.includes(term))
}

function hasArtistMatch(resultTitleNorm, resultAuthorNorm, artistNorm) {
  const artistCompact = compactNormalizedText(artistNorm)
  if (!artistCompact || artistCompact.length < 2) return true

  const haystack = compactNormalizedText(`${resultTitleNorm} ${resultAuthorNorm}`)
  if (haystack.includes(artistCompact)) return true

  const terms = getSignificantTerms(artistNorm)
  if (terms.length === 0) return true
  const matched = terms.filter((term) => haystack.includes(compactText(term))).length
  return matched >= Math.min(2, terms.length)
}

function hasBadMatchMarker(videoTitle = '', query = '', context = {}) {
  if (!BAD_MATCH_RE.test(videoTitle)) return false
  const requestedText = `${query} ${context.title || ''}`
  return !BAD_MATCH_RE.test(requestedText)
}

export function buildBilibiliAutoMvQueries(title = '', artist = '') {
  const safeTitle = normalizeText(title, { removeDecorators: true })
  const safeArtist = normalizeSearchArtist(artist)
  if (!safeTitle) return []

  const candidates = [
    safeArtist ? `${safeTitle} ${safeArtist}` : '',
    safeArtist ? `${safeTitle} ${safeArtist} MV` : '',
    safeArtist ? `${safeTitle} ${safeArtist} official MV` : '',
    `${safeTitle} MV`,
    `${safeTitle} official MV`,
    safeTitle
  ]

  const seen = new Set()
  return candidates
    .map((query) => query.replace(/\s+/g, ' ').trim())
    .filter((query) => {
      const key = query.toLowerCase()
      if (!query || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildYoutubeAutoMvQueries(title = '', artist = '') {
  const safeTitle = normalizeText(title, { removeDecorators: true })
  const safeArtist = normalizeSearchArtist(artist)
  if (!safeTitle) return []

  const candidates = [
    safeArtist ? `${safeTitle} ${safeArtist}` : '',
    safeArtist ? `${safeTitle} ${safeArtist} official MV` : '',
    safeArtist ? `${safeTitle} ${safeArtist} music video` : '',
    `${safeTitle} official MV`,
    `${safeTitle} music video`,
    safeTitle
  ]

  const seen = new Set()
  return candidates
    .map((query) => query.replace(/\s+/g, ' ').trim())
    .filter((query) => {
      const key = query.toLowerCase()
      if (!query || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function analyzeBilibiliAutoMvMatch(video = {}, query = '', context = {}) {
  const title = stripHtml(video.title || '')
  const author = stripHtml(video.author || '')
  const titleNorm = normalizeText(title, { removeDecorators: true })
  const authorNorm = normalizeText(author, { removeDecorators: true })
  const queryNorm = normalizeText(query, { removeDecorators: true })
  const trackTitleNorm = normalizeText(context.title || query, { removeDecorators: true })
  const artistNorm = normalizeSearchArtist(context.artist || '')
  const trackCompact = compactNormalizedText(trackTitleNorm)
  const titleCompact = compactNormalizedText(titleNorm)

  if (!trackCompact || trackCompact.length < 2) {
    return { accepted: false, reason: 'empty_track_title' }
  }

  if (!titleCompact) {
    return { accepted: false, reason: 'empty_video_title' }
  }

  if (hasBadMatchMarker(title, query, context)) {
    return { accepted: false, reason: 'bad_match_marker' }
  }

  const titleMatchesTrack = hasTitleMatch(titleNorm, trackTitleNorm)
  const titleMatchesQuery = hasTitleMatch(titleNorm, queryNorm)
  if (!titleMatchesTrack && !titleMatchesQuery) {
    return { accepted: false, reason: 'title_mismatch' }
  }

  const positiveMvSignal = POSITIVE_MV_RE.test(title)
  const artistMatches = hasArtistMatch(titleNorm, authorNorm, artistNorm)
  const hasArtist = compactNormalizedText(artistNorm).length >= 2
  const shortOrAmbiguousTitle =
    trackCompact.length <= 10 || getSignificantTerms(trackTitleNorm).length <= 1

  if (hasArtist && !artistMatches && (shortOrAmbiguousTitle || !positiveMvSignal)) {
    return { accepted: false, reason: 'artist_mismatch' }
  }

  if (!positiveMvSignal && !artistMatches) {
    return { accepted: false, reason: 'weak_without_mv_signal' }
  }

  if (!positiveMvSignal && !hasArtist && shortOrAmbiguousTitle) {
    return { accepted: false, reason: 'weak_short_title' }
  }

  return {
    accepted: true,
    reason: positiveMvSignal ? 'positive_mv_signal' : artistMatches ? 'artist_match' : 'title_match'
  }
}

export function scoreBilibiliVideoResult(video = {}, query = '', index = 0, context = {}) {
  const title = stripHtml(video.title || '')
  const author = stripHtml(video.author || '')
  const titleNorm = normalizeText(title)
  const authorNorm = normalizeText(author)
  const queryNorm = normalizeText(query, { removeDecorators: true })
  const queryCompact = queryNorm.replace(/\s+/g, '')
  const titleCompact = compactText(title)
  const rankBonus = Math.max(0, 18 - Math.max(0, index) * 2)
  const autoMatch = analyzeBilibiliAutoMvMatch(video, query, context)
  const popularityCount = parsePopularityCount(video)
  const officialAuthorSignal = OFFICIAL_AUTHOR_RE.test(author)

  let score = rankBonus

  if (queryCompact && titleCompact.includes(queryCompact)) score += 34
  if (queryCompact && titleCompact.startsWith(queryCompact)) score += 8
  if (queryCompact && titleCompact === queryCompact) score += 18

  const terms = queryNorm.split(/\s+/).filter((term) => term.length >= 2)
  for (const term of terms) {
    if (titleNorm.includes(term)) score += 5
    if (authorNorm.includes(term)) score += 1.5
  }

  if (POSITIVE_MV_RE.test(title)) score += 8
  if (officialAuthorSignal) score += 8
  score += getPopularityScore(popularityCount)
  if (autoMatch.accepted) score += 24
  else score -= 24
  if (hasBadMatchMarker(title, query, context)) score -= 28

  return {
    score,
    title,
    author,
    autoAccepted: autoMatch.accepted,
    autoRejectReason: autoMatch.accepted ? '' : autoMatch.reason,
    popularityCount,
    originalIndex: Math.max(0, index)
  }
}

// Within a single accept group (auto-accepted vs not), the most-played video on
// Bilibili / YouTube is in practice almost always the official upload. So once
// we filter out reject keywords (gameplay, cover, rhythm-game, etc.) we sort
// primarily by popularity and only fall back to score for tie-breaks.
function compareByAcceptThenPopularity(a, b, popularityKey) {
  if (a.autoAccepted !== b.autoAccepted) return a.autoAccepted ? -1 : 1
  const aPop = a[popularityKey] || 0
  const bPop = b[popularityKey] || 0
  if (aPop !== bPop) return bPop - aPop
  if (b.score !== a.score) return b.score - a.score
  return a.originalIndex - b.originalIndex
}

export function rankBilibiliVideoResults(videoResults = [], query = '', context = {}) {
  return (Array.isArray(videoResults) ? videoResults : [])
    .slice(0, 15)
    .map((video, index) => {
      const scored = scoreBilibiliVideoResult(video, query, index, context)
      const dim = video?.dimension || {}
      const resolution = dim.height ? `${dim.width || '?'}x${dim.height}` : ''
      return {
        id: video?.bvid || '',
        title: scored.title,
        author: video?.author || '',
        resolution,
        source: 'bilibili',
        score: scored.score,
        autoAccepted: scored.autoAccepted,
        autoRejectReason: scored.autoRejectReason,
        ...(scored.popularityCount > 0 ? { playCount: scored.popularityCount } : {}),
        originalIndex: scored.originalIndex
      }
    })
    .filter((item) => item.id)
    .sort((a, b) => compareByAcceptThenPopularity(a, b, 'playCount'))
}

export function rankYoutubeVideoResults(videoResults = [], query = '', context = {}) {
  return (Array.isArray(videoResults) ? videoResults : [])
    .slice(0, 12)
    .map((video, index) => {
      const scored = scoreBilibiliVideoResult(video, query, index, context)
      return {
        id: video?.id || '',
        title: scored.title,
        author: video?.author || '',
        duration: video?.duration || '',
        source: 'youtube',
        score: scored.score,
        autoAccepted: scored.autoAccepted,
        autoRejectReason: scored.autoAccepted ? '' : scored.autoRejectReason,
        ...(scored.popularityCount > 0 ? { viewCount: scored.popularityCount } : {}),
        originalIndex: scored.originalIndex
      }
    })
    .filter((item) => item.id)
    .sort((a, b) => compareByAcceptThenPopularity(a, b, 'viewCount'))
}
