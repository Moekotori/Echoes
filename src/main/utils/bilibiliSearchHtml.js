import { parsePopularityCount } from '../../shared/mvSearchRank.mjs'

const BVID_RE = /BV[0-9A-Za-z]{10}/g
const QUOTED_STRING_RE = /"((?:\\.|[^"\\])*)"/g

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function decodeJsString(value = '') {
  const text = String(value || '')
  try {
    return JSON.parse(`"${text.replace(/\r?\n/g, '\\n')}"`)
  } catch {
    return text
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\u002F/g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
  }
}

function cleanSearchText(value = '') {
  return decodeHtmlEntities(decodeJsString(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\bkeyword">\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsefulSearchText(value = '') {
  const text = String(value || '').trim()
  if (text.length < 2) return false
  if (/^(?:https?:)?\/\//i.test(text)) return false
  if (/\\u002F|bfs\/|\.jpg|\.png|\.webp/i.test(text)) return false
  if (/^\d+$/.test(text)) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return false
  return true
}

function hasPopularityHint(value = '') {
  return /(?:\u64ad\u653e|\u89c2\u770b|views?|plays?|\d+(?:\.\d+)?\s*(?:\u4e07|\u5104|\u4ebf|k|m|b))/i.test(
    String(value || '')
  )
}

function readQuotedStrings(input = '', startIndex = 0, limit = 12) {
  const strings = []
  const regex = new RegExp(QUOTED_STRING_RE.source, 'g')
  regex.lastIndex = Math.max(0, startIndex)
  for (let match = regex.exec(input); match && strings.length < limit; match = regex.exec(input)) {
    strings.push(cleanSearchText(match[1]))
  }
  return strings
}

function pickAuthorBefore(html, bvidIndex) {
  const before = html.slice(Math.max(0, bvidIndex - 600), bvidIndex)
  const strings = readQuotedStrings(before, 0, 24).reverse()
  return (
    strings.find(
      (item) =>
        isUsefulSearchText(item) &&
        item.length <= 80 &&
        !/[{}]/.test(item) &&
        !/^[\d,\s]+$/.test(item) &&
        !/\b(?:aid|bvid|duration|title)\b\s*:/i.test(item)
    ) || ''
  )
}

function pickPlayCountNear(html, bvidIndex, bvidLength) {
  const after = html.slice(bvidIndex + bvidLength)
  const nextBvidOffset = after.search(/BV[0-9A-Za-z]{10}/)
  const end =
    nextBvidOffset >= 0
      ? bvidIndex + bvidLength + nextBvidOffset
      : Math.min(html.length, bvidIndex + 2400)
  const near = html.slice(bvidIndex, end)
  let best = 0

  for (const match of near.matchAll(
    /"(?:play|view|play_count|view_count)"\s*:\s*"?([^",}\]]+)/gi
  )) {
    best = Math.max(best, parsePopularityCount(match[1]))
  }

  const strings = readQuotedStrings(near, bvidLength + 1, 80)
  for (const item of strings) {
    if (!hasPopularityHint(item)) continue
    best = Math.max(best, parsePopularityCount(item))
  }

  return best
}

export function parseBilibiliSearchHtml(html = '', limit = 15) {
  const text = String(html || '')
  const seen = new Set()
  const items = []

  for (const match of text.matchAll(BVID_RE)) {
    const bvid = match[0]
    if (!bvid || seen.has(bvid)) continue
    seen.add(bvid)

    const bvidIndex = match.index || 0
    const afterBvidQuote = text.indexOf('"', bvidIndex + bvid.length)
    const afterStart = afterBvidQuote >= 0 ? afterBvidQuote + 1 : bvidIndex + bvid.length
    const afterStrings = readQuotedStrings(text, afterStart, 18)
    const title = afterStrings.find(isUsefulSearchText) || ''
    if (!title) continue

    const duration =
      afterStrings.find((item) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(item)) ||
      text
        .slice(bvidIndex, Math.min(text.length, bvidIndex + 1400))
        .match(/"(\d{1,2}:\d{2}(?::\d{2})?)"/)?.[1] ||
      ''
    const playCount = pickPlayCountNear(text, bvidIndex, bvid.length)

    items.push({
      bvid,
      title,
      author: pickAuthorBefore(text, bvidIndex),
      duration,
      ...(playCount > 0 ? { playCount } : {}),
      source: 'bilibili'
    })

    if (items.length >= limit) break
  }

  return items
}
