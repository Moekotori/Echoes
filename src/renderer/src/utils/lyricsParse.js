/** Heuristic: same-timestamp LRC lines -> main / romaji / translation. */
function classifyLine(t) {
  const s = (t || '').trim()
  if (!s) return 'skip'
  const hasCJK = /[\u4e00-\u9fff]/.test(s)
  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff]/.test(s)
  if (hasCJK && !hasKana) return 'translation'
  const latin = (s.match(/[a-zA-Z]/g) || []).length
  const nonSpace = s.replace(/\s/g, '').length || 1
  if (latin / nonSpace > 0.45 && !hasKana) return 'romaji'
  return 'main'
}

function assignGroupedLines(uniqueTexts) {
  const mainText = uniqueTexts[0]
  const row = { text: mainText }
  const leftovers = []

  for (const extra of uniqueTexts.slice(1)) {
    const kind = classifyLine(extra)
    if (kind === 'romaji' && !row.romaji) row.romaji = extra
    else if (kind === 'translation' && !row.translation) row.translation = extra
    else leftovers.push(extra)
  }

  if (!row.translation && row.romaji && leftovers.length > 0) {
    row.translation = leftovers.shift()
  }

  if (!row.romaji && !row.translation) {
    if (leftovers.length >= 2) {
      row.romaji = leftovers.shift()
      row.translation = leftovers.shift()
    } else if (leftovers.length === 1) {
      const fallback = leftovers[0]
      const kind = classifyLine(fallback)
      if (kind === 'translation') row.translation = fallback
      else if (kind === 'romaji') row.romaji = fallback
    }
  }

  return row
}

function parseLrcTimestamp(match) {
  const minutes = parseInt(match[1], 10)
  const seconds = parseInt(match[2], 10)
  const fraction = parseInt(match[4] || '0', 10)
  return (minutes * 60 + seconds) * 1000 + ((match[4] || '').length === 3 ? fraction : fraction * 10)
}

function parseInlineWordTimings(rawText, fallbackTimeMs) {
  const inlineTimeReg = /<(\d{1,2}):(\d{2})(\.|\:)(\d{2,3})>/g
  const matches = [...String(rawText || '').matchAll(inlineTimeReg)]
  if (matches.length === 0) {
    return { text: String(rawText || '').trim(), words: [] }
  }

  const words = []
  let cleanText = ''
  if (matches[0].index > 0) {
    const prefix = rawText.slice(0, matches[0].index)
    if (prefix) {
      cleanText += prefix
      words.push({ time: fallbackTimeMs / 1000, text: prefix })
    }
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const tokenStart = match.index + match[0].length
    const tokenEnd = i + 1 < matches.length ? matches[i + 1].index : rawText.length
    const token = rawText.slice(tokenStart, tokenEnd)
    if (!token) continue
    cleanText += token
    words.push({ time: parseLrcTimestamp(match) / 1000, text: token })
  }

  return {
    text: cleanText.trim(),
    words: words.filter((word) => String(word.text || '').trim())
  }
}

export function parseLRC(lrcString) {
  const lines = lrcString.split('\n')
  const timeReg = /\[(\d{2}):(\d{2})(\.|\:)(\d{2,3})\]/g
  const raw = []

  for (const line of lines) {
    const matches = [...line.matchAll(timeReg)]
    if (matches.length === 0) continue
    for (const match of matches) {
      const timeMs = parseLrcTimestamp(match)
      const parsedText = parseInlineWordTimings(line.replace(timeReg, '').trim(), timeMs)
      if (!parsedText.text) continue
      raw.push({ timeMs, text: parsedText.text, words: parsedText.words })
    }
  }

  raw.sort((a, b) => a.timeMs - b.timeMs || 0)

  const grouped = new Map()
  for (const row of raw) {
    const bucket = grouped.get(row.timeMs)
    if (bucket) bucket.push(row)
    else grouped.set(row.timeMs, [row])
  }

  const out = []
  for (const [timeMs, rows] of grouped) {
    const uniqueRows = []
    const seen = new Set()
    for (const row of rows) {
      const trimmed = (row.text || '').trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      uniqueRows.push({ ...row, text: trimmed })
    }
    if (uniqueRows.length === 0) continue

    const row = assignGroupedLines(uniqueRows.map((entry) => entry.text))
    const timedMain = uniqueRows.find(
      (entry) => entry.text === row.text && Array.isArray(entry.words) && entry.words.length > 0
    )
    out.push({
      time: timeMs / 1000,
      ...row,
      ...(timedMain ? { words: timedMain.words } : {})
    })
  }

  return out
}

export function parsePlainLyrics(lyricsString) {
  if (!lyricsString) return []

  const lines = lyricsString
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^\[(ar|ti|al|by|offset|re|ve):/i.test(line) &&
        !/^\[\d{2}:\d{2}(?:[.:]\d{2,3})?\]$/i.test(line)
    )

  return lines.map((text, idx) => ({ time: idx * 3.5, text }))
}

export function parseAnyLyrics(lyricsString) {
  if (!lyricsString || !lyricsString.trim()) return []
  const lrcParsed = parseLRC(lyricsString)
  if (lrcParsed.length > 0) return lrcParsed
  return parsePlainLyrics(lyricsString)
}
