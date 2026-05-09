const INLINE_TIMING_TAG_RE = /<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g
const KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/
const CJK_RE = /[\u4e00-\u9fff]/
const LATIN_RE = /[a-zA-Z]/
const JAPANESE_HINT_RE = /[\u3040-\u30ff\u31f0-\u31ff\u3005\u3006\u30fc]/

export function sanitizeRomajiSourceText(value) {
  return String(value || '')
    .replace(INLINE_TIMING_TAG_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function shouldRequestGeneratedRomaji(value) {
  const text = sanitizeRomajiSourceText(value)
  if (!text) return false
  if (JAPANESE_HINT_RE.test(text)) return true
  if (!CJK_RE.test(text)) return false
  const latinCount = (text.match(LATIN_RE) || []).length
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const compactLength = text.replace(/\s/g, '').length || 1
  if (cjkCount >= 2 && latinCount / compactLength < 0.65) return true
  return latinCount / compactLength < 0.35
}

export function buildRomajiConversionPlan(lyrics, options = {}) {
  const lines = Array.isArray(lyrics) ? lyrics : []
  const cache = options?.cache instanceof Map ? options.cache : null
  const noneLabel = String(options?.noneLabel || '').trim()
  const focusIndex = Number.isFinite(Number(options?.focusIndex)) ? Number(options.focusIndex) : 0
  const merged = new Array(lines.length).fill('')
  const pending = []

  lines.forEach((line, index) => {
    const existing = typeof line?.romaji === 'string' ? line.romaji.trim() : ''
    if (existing) {
      merged[index] = existing
      return
    }

    const text = sanitizeRomajiSourceText(line?.text)
    if (!text || (noneLabel && text === noneLabel) || !shouldRequestGeneratedRomaji(text)) return

    const cached = cache?.get(text)
    if (typeof cached === 'string') {
      merged[index] = cached
      return
    }

    pending.push({ index, text })
  })

  const center = Math.max(0, Math.min(lines.length - 1, focusIndex))
  pending.sort((a, b) => Math.abs(a.index - center) - Math.abs(b.index - center))

  return { merged, pending }
}

export function rememberRomajiCacheValue(cache, key, value, maxEntries = 1600) {
  if (!(cache instanceof Map) || !key) return
  cache.set(key, typeof value === 'string' ? value : '')
  if (cache.size <= maxEntries) return
  const overflow = cache.size - maxEntries
  let removed = 0
  for (const cacheKey of cache.keys()) {
    cache.delete(cacheKey)
    removed += 1
    if (removed >= overflow) break
  }
}
