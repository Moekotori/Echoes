const COMBINING_MARKS_REG = /[\u0300-\u036f]/g
const SEPARATOR_REG = /[\p{P}\p{S}\s_]+/gu

export function normalizeLibrarySearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS_REG, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(SEPARATOR_REG, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function createSearchQuery(query) {
  const normalized = normalizeLibrarySearchText(query)
  const compact = normalized.replace(/\s+/g, '')
  const terms = normalized.split(' ').filter(Boolean)
  return { raw: String(query || '').trim(), normalized, compact, terms }
}

function createField(value, weight) {
  const normalized = normalizeLibrarySearchText(value)
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ''),
    tokens: normalized.split(' ').filter(Boolean),
    weight
  }
}

function isOrderedFuzzyMatch(text, term) {
  if (!text || !term || term.length < 4 || term.length > 24) return false
  if (Math.abs(text.length - term.length) > 2) return false
  let cursor = 0
  let gaps = 0
  let matched = 0
  for (const char of term) {
    const foundAt = text.indexOf(char, cursor)
    if (foundAt === -1) continue
    gaps += Math.max(0, foundAt - cursor)
    cursor = foundAt + 1
    matched += 1
  }
  return matched >= term.length - 1 && gaps <= Math.max(2, Math.floor(term.length * 1.2))
}

function scoreTermAgainstField(term, field) {
  if (!term || !field.normalized) return 0
  const compactTerm = term.replace(/\s+/g, '')
  if (field.tokens.includes(term)) return 90 * field.weight
  if (field.tokens.some((token) => token.startsWith(term))) return 68 * field.weight
  if (field.normalized.includes(term)) return 48 * field.weight
  if (compactTerm && field.compact.includes(compactTerm)) return 44 * field.weight
  if (field.tokens.some((token) => isOrderedFuzzyMatch(token, term))) return 22 * field.weight
  return 0
}

export function getTrackSearchScore(track, query) {
  const parsedQuery = typeof query === 'string' ? createSearchQuery(query) : query
  if (!parsedQuery?.terms?.length) return 1

  const info = track?.info || {}
  const fields = [
    createField(info.title, 6),
    createField(info.fileName || track?.name, 5),
    createField(info.artist, 4),
    createField(info.album, 2),
    createField(track?.path, 1)
  ]

  let score = 0
  for (const term of parsedQuery.terms) {
    const best = Math.max(...fields.map((field) => scoreTermAgainstField(term, field)))
    if (best <= 0) return 0
    score += best
  }

  const phrase = parsedQuery.normalized
  const compactPhrase = parsedQuery.compact
  if (phrase) {
    if (fields[0].normalized === phrase) score += 1200
    else if (fields[0].tokens.includes(phrase)) score += 760
    else if (fields[0].normalized.startsWith(phrase)) score += 700
    else if (fields[0].normalized.includes(phrase)) score += 480
    else if (compactPhrase && fields[0].compact.includes(compactPhrase)) score += 420

    if (fields[1].normalized === phrase) score += 800
    else if (fields[1].tokens.includes(phrase)) score += 560
    else if (fields[1].normalized.startsWith(phrase)) score += 480
    else if (fields[1].normalized.includes(phrase)) score += 260

    if (fields[2].normalized.startsWith(phrase)) score += 180
  }

  return score
}

export function filterAndRankTracksBySearch(tracks, query, { limit = Infinity } = {}) {
  const parsedQuery = createSearchQuery(query)
  const source = Array.isArray(tracks) ? tracks : []
  if (!parsedQuery.terms.length) return source

  return source
    .map((track, index) => ({
      track,
      index,
      score: getTrackSearchScore(track, parsedQuery)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.track)
}
