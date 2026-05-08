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

function scoreDecodedText(value) {
  const text = cleanupTagText(value)
  if (!text) return -1000
  let score = 0
  const replacementCount = (text.match(/\ufffd/g) || []).length
  const controlCount = (text.match(/[\u0001-\u001f\u007f]/g) || []).length
  score -= replacementCount * 80
  score -= controlCount * 30
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) score += 40
  if (/[A-Za-z0-9]/.test(text)) score += 4
  score += Math.min(text.length, 80) / 8
  return score
}

function decodeInfoText(buffer) {
  const trimmed = trimTagBuffer(buffer)
  if (!trimmed.length) return ''

  const candidates = []
  if (trimmed[0] === 0xff && trimmed[1] === 0xfe) {
    candidates.push(trimmed.subarray(2).toString('utf16le'))
  } else if (looksLikeUtf16Le(trimmed)) {
    candidates.push(trimmed.toString('utf16le'))
  }
  candidates.push(trimmed.toString('utf8'))
  candidates.push(trimmed.toString('latin1'))

  let best = ''
  let bestScore = -1000
  for (const candidate of candidates) {
    const text = cleanupTagText(candidate)
    const score = scoreDecodedText(text)
    if (score > bestScore) {
      best = text
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
