import fs from 'fs'

const RIFF_HEADER_SIZE = 12
const CHUNK_HEADER_SIZE = 8
const INFO_TAG_MAP = {
  INAM: 'title',
  IART: 'artist',
  IPRD: 'album',
  ICMT: 'comment',
  IGNR: 'genre',
  ICRD: 'year',
  ISFT: 'software'
}

const FALLBACK_ENCODINGS = ['utf-8', 'shift_jis', 'gb18030', 'euc-jp', 'big5']
const TEXT_DECODER_CACHE = new Map()

function getDecoder(encoding) {
  let decoder = TEXT_DECODER_CACHE.get(encoding)
  if (!decoder) {
    decoder = new TextDecoder(encoding, { fatal: false, ignoreBOM: false })
    TEXT_DECODER_CACHE.set(encoding, decoder)
  }
  return decoder
}

function isWaveBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= RIFF_HEADER_SIZE &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  )
}

function trimTagBuffer(buffer) {
  let start = 0
  let end = buffer.length
  while (start < end && buffer[start] === 0) start += 1
  while (end > start && buffer[end - 1] === 0) end -= 1
  return buffer.subarray(start, end)
}

function looksLikeUtf16Le(buffer) {
  if (buffer.length < 4) return false
  let oddNulls = 0
  let evenNulls = 0
  const pairs = Math.floor(buffer.length / 2)
  for (let i = 0; i < pairs * 2; i += 2) {
    if (buffer[i] === 0) evenNulls += 1
    if (buffer[i + 1] === 0) oddNulls += 1
  }
  return oddNulls >= Math.max(2, pairs * 0.45) && evenNulls < pairs * 0.2
}

function cleanupTagText(value) {
  return String(value || '')
    .replace(/\0+/g, '')
    .replace(/[\u0001-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeQuestionMarkPlaceholder(value) {
  const stripped = String(value || '').replace(/\s+/g, '')
  if (stripped.length < 2) return false
  if (/[\p{L}\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(stripped)) return false
  const questionCount = (stripped.match(/[?\uff1f]/g) || []).length
  return questionCount >= 2 && questionCount / stripped.length >= 0.6
}

const REPLACEMENT_CHAR_RE = /\ufffd/g
const CONTROL_CHAR_RE = /[\u0001-\u001f\u007f]/g
const LATIN1_HIGH_BIT_RE = /[\u0080-\u00ff]/g
const KANA_RE = /[\u3040-\u30ff]/
const CJK_IDEOGRAPH_RE = /[\u3400-\u9fff]/
const HANGUL_RE = /[\uac00-\ud7af]/
const FULLWIDTH_RE = /[\uff00-\uffef]/
const MOJIBAKE_HINT_RE = /[\u00c2\u00c3\u20ac\ufffd\u3126\u57cd\u5d84\u5fd3\u5ffd\u590a\u656e\u66e0\u6d7c\u6f83\u704f\u70bd\u7567\u7ba0\u9288\u9289\u9357\u935b\u93b4\u93c9\u9416\u9426\u947a]/

function looksLikeLatin1MojibakeOfCjk(text) {
  const stripped = String(text || '').replace(/\s+/g, '')
  if (stripped.length < 2) return false
  const matches = stripped.match(LATIN1_HIGH_BIT_RE) || []
  return matches.length / stripped.length > 0.5
}

function scoreDecodedText(text, encoding) {
  if (!text) return -1000

  let score = 0
  const replacementCount = (text.match(REPLACEMENT_CHAR_RE) || []).length
  const controlCount = (text.match(CONTROL_CHAR_RE) || []).length
  score -= replacementCount * 80
  score -= controlCount * 30

  if (KANA_RE.test(text)) score += 70
  if (CJK_IDEOGRAPH_RE.test(text)) score += 40
  if (HANGUL_RE.test(text)) score += 30
  if (FULLWIDTH_RE.test(text)) score += 10
  if (/[A-Za-z0-9]/.test(text)) score += 4
  score += Math.min(text.length, 80) / 8

  if (looksLikeLatin1MojibakeOfCjk(text)) score -= 200
  if (MOJIBAKE_HINT_RE.test(text)) score -= 35
  if (encoding === 'utf-8') score += 1
  if (encoding === 'latin1') score -= 10
  return score
}

function tryDecode(buffer, encoding) {
  try {
    if (encoding === 'latin1') return buffer.toString('latin1')
    return getDecoder(encoding).decode(buffer)
  } catch {
    return ''
  }
}

function decodeInfoText(buffer) {
  const trimmed = trimTagBuffer(buffer)
  if (!trimmed.length) return ''

  const candidates = []
  if (trimmed[0] === 0xff && trimmed[1] === 0xfe) {
    candidates.push({ encoding: 'utf-16le', text: trimmed.subarray(2).toString('utf16le') })
  } else if (looksLikeUtf16Le(trimmed)) {
    candidates.push({ encoding: 'utf-16le', text: trimmed.toString('utf16le') })
  }

  for (const encoding of FALLBACK_ENCODINGS) {
    candidates.push({ encoding, text: tryDecode(trimmed, encoding) })
  }
  candidates.push({ encoding: 'latin1', text: tryDecode(trimmed, 'latin1') })

  let best = ''
  let bestScore = -Infinity
  for (const { encoding, text } of candidates) {
    const cleaned = cleanupTagText(text)
    if (looksLikeQuestionMarkPlaceholder(cleaned)) continue
    const score = scoreDecodedText(cleaned, encoding)
    if (score > bestScore) {
      best = cleaned
      bestScore = score
    }
  }
  return best
}

function readChunkSize(buffer, offset) {
  if (offset + CHUNK_HEADER_SIZE > buffer.length) return -1
  return buffer.readUInt32LE(offset + 4)
}

export function readWavInfoTags(filePath) {
  if (typeof filePath !== 'string' || !/\.wav$/i.test(filePath)) return {}

  try {
    const buffer = fs.readFileSync(filePath)
    if (!isWaveBuffer(buffer)) return {}

    const tags = {}
    let offset = RIFF_HEADER_SIZE
    while (offset + CHUNK_HEADER_SIZE <= buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4)
      const chunkSize = readChunkSize(buffer, offset)
      if (chunkSize < 0) break
      const chunkDataStart = offset + CHUNK_HEADER_SIZE
      const chunkDataEnd = Math.min(chunkDataStart + chunkSize, buffer.length)

      if (chunkId === 'LIST' && chunkDataEnd - chunkDataStart >= 4) {
        const listType = buffer.toString('ascii', chunkDataStart, chunkDataStart + 4)
        if (listType === 'INFO') {
          let tagOffset = chunkDataStart + 4
          while (tagOffset + CHUNK_HEADER_SIZE <= chunkDataEnd) {
            const tagId = buffer.toString('ascii', tagOffset, tagOffset + 4)
            const tagSize = readChunkSize(buffer, tagOffset)
            if (tagSize < 0) break
            const tagDataStart = tagOffset + CHUNK_HEADER_SIZE
            const tagDataEnd = Math.min(tagDataStart + tagSize, chunkDataEnd)
            const key = INFO_TAG_MAP[tagId]
            if (key) {
              const value = decodeInfoText(buffer.subarray(tagDataStart, tagDataEnd))
              if (value) tags[key] = value
            }
            tagOffset = tagDataStart + tagSize + (tagSize % 2)
          }
        }
      }

      offset = chunkDataStart + chunkSize + (chunkSize % 2)
    }
    return tags
  } catch {
    return {}
  }
}
