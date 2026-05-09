import { createRequire } from 'module'

const require = createRequire(import.meta.url)

let iconvLite = null
try {
  iconvLite = require('iconv-lite')
} catch {
  iconvLite = null
}

const MOJIBAKE_QUERY_HINT_REG =
  /[\u00c2\u00c3\u20ac\ufffd\u3126\u57cd\u66e0\u6d7c\u6f83\u704f\u5fd3\u590a\u656e\u70bd\u7567\u7ba0\u9288\u9289\u9357\u935b\u93b4\u93c9\u9416\u9426\u947a\u5120\u5135\u5142]/

function cleanupRepairedSearchQuery(value) {
  return String(value || '')
    .replace(/[\ufffd?]+(?=\s|$|MV\b|mv\b)/g, '')
    .replace(/[\ufffd?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function countMojibakeHints(value) {
  const text = String(value || '')
  let count = 0
  for (const char of text) {
    if (MOJIBAKE_QUERY_HINT_REG.test(char)) count += 1
  }
  return count
}

function decodeMojibakeSearchQueryBytes(value, encoding) {
  if (!iconvLite?.encode) return ''
  const chunks = []
  for (const char of String(value || '')) {
    if (char === '\u20ac') {
      chunks.push(Buffer.from([0x80]))
    } else {
      chunks.push(iconvLite.encode(char, encoding))
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

function scoreSearchQueryRepair(candidate, original) {
  const text = cleanupRepairedSearchQuery(candidate)
  if (!text || text.includes('\ufffd')) return -1000

  const originalText = cleanupRepairedSearchQuery(original)
  let score = 0
  score += (countMojibakeHints(originalText) - countMojibakeHints(text)) * 12
  score -= (text.match(/\?/g) || []).length * 8

  const asciiTokens = originalText.match(/[a-z0-9]{2,}/gi) || []
  for (const token of asciiTokens) {
    if (text.toLowerCase().includes(token.toLowerCase())) score += 2
  }
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) score += 4
  if (text === originalText) score -= 1
  return score
}

export function repairPossiblyMojibakeSearchQuery(value) {
  const text = String(value || '').trim()
  if (!text || !MOJIBAKE_QUERY_HINT_REG.test(text) || !iconvLite?.encode) return text

  try {
    const cleanedOriginal = cleanupRepairedSearchQuery(text)
    const candidates = [
      cleanedOriginal,
      iconvLite.encode(text, 'cp936').toString('utf8'),
      iconvLite.encode(text, 'gb18030').toString('utf8'),
      decodeMojibakeSearchQueryBytes(text, 'cp936'),
      decodeMojibakeSearchQueryBytes(text, 'gb18030')
    ]
      .map(cleanupRepairedSearchQuery)
      .filter(Boolean)

    let best = cleanedOriginal || text
    let bestScore = scoreSearchQueryRepair(best, text)
    for (const candidate of [...new Set(candidates)]) {
      const score = scoreSearchQueryRepair(candidate, text)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    return best || cleanedOriginal || text
  } catch {
    return cleanupRepairedSearchQuery(text) || text
  }
}
