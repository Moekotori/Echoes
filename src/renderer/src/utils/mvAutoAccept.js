export function getAutoMvSearchHit(result, fallbackSource = 'bilibili') {
  if (!result) return null

  const normalizedFallback =
    String(fallbackSource || 'bilibili')
      .trim()
      .toLowerCase() || 'bilibili'

  if (typeof result === 'string') {
    if (normalizedFallback === 'bilibili') return null
    const id = result.trim()
    return id ? { id, source: normalizedFallback, result } : null
  }

  const id = String(result.id || '').trim()
  if (!id) return null

  const source =
    String(result.source || normalizedFallback)
      .trim()
      .toLowerCase() || normalizedFallback

  if ((source === 'bilibili' || Object.hasOwn(result, 'autoAccepted')) && result.autoAccepted !== true) {
    return null
  }
  return { id, source, result }
}

function normalizeMvSearchCandidate(candidate, fallbackSource = 'bilibili') {
  if (!candidate) return null

  const normalizedFallback =
    String(fallbackSource || 'bilibili')
      .trim()
      .toLowerCase() || 'bilibili'

  if (typeof candidate === 'string') {
    if (normalizedFallback === 'bilibili') return null
    const id = candidate.trim()
    return id ? { id, source: normalizedFallback, result: candidate, score: 0 } : null
  }

  const id = String(candidate.id || '').trim()
  if (!id) return null

  const source =
    String(candidate.source || normalizedFallback)
      .trim()
      .toLowerCase() || normalizedFallback
  const score = Number(candidate.score)

  return {
    id,
    source,
    result: candidate,
    score: Number.isFinite(score) ? score : 0
  }
}

export function getBestEffortMvSearchHit(result, fallbackSource = 'bilibili') {
  const autoHit = getAutoMvSearchHit(result, fallbackSource)
  if (autoHit) {
    return {
      ...autoHit,
      matchLevel: 'auto',
      score: Number.isFinite(Number(autoHit.result?.score)) ? Number(autoHit.result.score) : 0
    }
  }

  if (!result) return null

  const candidates = Array.isArray(result?.items) && result.items.length > 0 ? result.items : [result]
  let best = null
  for (const candidate of candidates) {
    const hit = normalizeMvSearchCandidate(candidate, fallbackSource)
    if (!hit) continue
    if (!best || hit.score > best.score) {
      best = hit
    }
  }

  return best ? { ...best, matchLevel: 'fallback' } : null
}
