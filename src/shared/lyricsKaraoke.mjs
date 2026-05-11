function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function getOffsetSec(offsetMs) {
  const offset = Number(offsetMs)
  return Number.isFinite(offset) ? offset / 1000 : 0
}

function getLeadSec(leadMs) {
  const lead = Number(leadMs)
  return Number.isFinite(lead) ? lead / 1000 : 0
}

function splitPlainText(text) {
  return Array.from(String(text || ''))
}

function createPlainTokens(text, progress) {
  const chars = splitPlainText(text)
  if (chars.length === 0) return []

  const cursor = clamp01(progress) * chars.length
  return chars.map((char, index) => ({
    text: char,
    progress: clamp01(cursor - index)
  }))
}

function createEnhancedTokens(words, renderSec, offsetSec, nextLineTime, fallbackEndSec) {
  const validWords = Array.isArray(words)
    ? words
        .map((word) => ({
          text: String(word?.text || ''),
          time: Number(word?.time)
        }))
        .filter((word) => word.text && Number.isFinite(word.time))
    : []

  return validWords.map((word, index) => {
    const startSec = word.time + offsetSec
    const nextWordTime = validWords[index + 1]?.time
    const endFromNextWord = Number.isFinite(nextWordTime) ? nextWordTime + offsetSec : NaN
    const endFromNextLine = Number.isFinite(nextLineTime) ? nextLineTime + offsetSec : NaN
    const endSec = Number.isFinite(endFromNextWord)
      ? endFromNextWord
      : Number.isFinite(endFromNextLine) && endFromNextLine > startSec
        ? endFromNextLine
        : fallbackEndSec
    const safeEndSec = Math.max(startSec + 0.08, endSec)

    return {
      text: word.text,
      progress: clamp01((renderSec - startSec) / (safeEndSec - startSec))
    }
  })
}

export function getLyricLineProgress({
  line,
  nextLine,
  positionSec,
  durationSec,
  offsetMs = 0,
  leadMs = 0,
  fillRatio = 0.88
} = {}) {
  const currentSec = Number(positionSec)
  const renderSec = (Number.isFinite(currentSec) ? currentSec : 0) + getLeadSec(leadMs)
  const offsetSec = getOffsetSec(offsetMs)
  const startSec = Number(line?.time) + offsetSec
  if (!Number.isFinite(startSec)) return 0

  const nextLineTime = Number(nextLine?.time)
  const nextSec = Number.isFinite(nextLineTime) ? nextLineTime + offsetSec : NaN
  const totalDuration = Number(durationSec)
  const fallbackTail = Math.max(1.8, Number.isFinite(totalDuration) && totalDuration > 0 ? 2.4 : 3.2)
  const baseSpan = Number.isFinite(nextSec)
    ? Math.max(0.12, nextSec - startSec)
    : Number.isFinite(totalDuration) && totalDuration > startSec
      ? Math.max(0.8, totalDuration - startSec)
      : fallbackTail
  const safeFillRatio = Math.max(0.7, Math.min(1, Number(fillRatio) || 0.88))
  const endSec = startSec + baseSpan * safeFillRatio

  return clamp01((renderSec - startSec) / Math.max(0.08, endSec - startSec))
}

export function buildLyricKaraokeState({
  line,
  nextLine,
  positionSec,
  durationSec,
  offsetMs = 0,
  leadMs = 0,
  fillRatio = 0.88
} = {}) {
  const progress = getLyricLineProgress({
    line,
    nextLine,
    positionSec,
    durationSec,
    offsetMs,
    leadMs,
    fillRatio
  })
  const currentSec = Number(positionSec)
  const renderSec = (Number.isFinite(currentSec) ? currentSec : 0) + getLeadSec(leadMs)
  const offsetSec = getOffsetSec(offsetMs)
  const nextLineTime = Number(nextLine?.time)
  const fallbackEndSec =
    (Number(line?.time) || 0) + offsetSec + Math.max(1.8, String(line?.text || '').length * 0.12)
  const enhancedTokens = createEnhancedTokens(
    line?.words,
    renderSec,
    offsetSec,
    nextLineTime,
    fallbackEndSec
  )

  return {
    progress,
    mode: enhancedTokens.length > 0 ? 'enhanced' : 'plain',
    tokens: enhancedTokens.length > 0 ? enhancedTokens : createPlainTokens(line?.text || '', progress)
  }
}
