const DEFAULT_TEXT_ENCODINGS = ['utf-8', 'gb18030', 'big5', 'shift_jis', 'euc-jp', 'windows-1252']
const DECODER_CACHE = new Map()

function toUint8Array(input) {
  if (!input) return new Uint8Array()
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (Array.isArray(input)) return new Uint8Array(input)
  if (Array.isArray(input?.data)) return new Uint8Array(input.data)
  try {
    return new Uint8Array(input)
  } catch {
    return new Uint8Array()
  }
}

function getDecoder(encoding, fatal = false) {
  const key = `${encoding}:${fatal ? 'fatal' : 'soft'}`
  let decoder = DECODER_CACHE.get(key)
  if (!decoder) {
    decoder = new TextDecoder(encoding, { fatal, ignoreBOM: false })
    DECODER_CACHE.set(key, decoder)
  }
  return decoder
}

function decodeBytes(bytes, encoding, fatal = false) {
  try {
    return getDecoder(encoding, fatal).decode(bytes)
  } catch {
    return ''
  }
}

function decodeUtf16Be(bytes) {
  if (bytes.length < 2) return ''
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2))
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1]
    swapped[i + 1] = bytes[i]
  }
  return decodeBytes(swapped, 'utf-16le')
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '')
}

function hasUtf16LeShape(bytes) {
  if (bytes.length < 8) return false
  let oddNulls = 0
  let evenNulls = 0
  const pairs = Math.floor(Math.min(bytes.length, 256) / 2)
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] === 0) evenNulls += 1
    if (bytes[i + 1] === 0) oddNulls += 1
  }
  return oddNulls >= Math.max(2, pairs * 0.35) && evenNulls < pairs * 0.2
}

function hasUtf16BeShape(bytes) {
  if (bytes.length < 8) return false
  let oddNulls = 0
  let evenNulls = 0
  const pairs = Math.floor(Math.min(bytes.length, 256) / 2)
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] === 0) evenNulls += 1
    if (bytes[i + 1] === 0) oddNulls += 1
  }
  return evenNulls >= Math.max(2, pairs * 0.35) && oddNulls < pairs * 0.2
}

const REPLACEMENT_RE = /\uFFFD/g
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const CJK_RE = /[\u3400-\u9FFF]/
const KANA_RE = /[\u3040-\u30FF]/
const HANGUL_RE = /[\uAC00-\uD7AF]/
const FULLWIDTH_RE = /[\uFF00-\uFFEF]/
const HALFWIDTH_KATAKANA_RE = /[\uFF61-\uFF9F]/g
const SIMPLIFIED_CJK_HINT_RE = /[\u4E2A\u4E48\u4F1A\u53F0\u56FD\u5E7F\u5F53\u6765\u7231\u95E8\u98CE\u8BCD]/
const TRADITIONAL_CJK_HINT_RE =
  /[\u500B\u4F86\u570B\u5EE3\u5F8C\u611B\u6703\u7576\u81FA\u8A5E\u9580\u98A8\u9AD4\u9EBC]/
const MOJIBAKE_HINT_RE =
  /[\u00C2\u00C3\u20AC\uFFFD\u3126\u53C6\u546D\u57CD\u590A\u5D84\u5FD3\u5FFD\u6581\u656E\u6944\u6D7C\u6D93\u6F83\u704F\u70BD\u714E\u7567\u7BA0\u7ECB\u7F01\u9225\u9288\u9289\u934F\u9350\u9357\u935B\u93B4\u93BE\u93C3\u93C9\u9416\u9426\u947A\u951B]/u

function scoreDecodedText(text, encoding) {
  const value = stripBom(text)
  if (!value) return -1000

  let score = 0
  score -= (value.match(REPLACEMENT_RE) || []).length * 120
  score -= (value.match(CONTROL_RE) || []).length * 60
  score -= (value.match(MOJIBAKE_HINT_RE) || []).length * 45

  if (CJK_RE.test(value)) score += 40
  if (KANA_RE.test(value)) score += 50
  if (HANGUL_RE.test(value)) score += 30
  if (FULLWIDTH_RE.test(value)) score += 12
  if (encoding === 'gb18030' && SIMPLIFIED_CJK_HINT_RE.test(value)) score += 28
  if (encoding === 'big5' && TRADITIONAL_CJK_HINT_RE.test(value)) score += 28
  if (encoding === 'big5' && CJK_RE.test(value) && !TRADITIONAL_CJK_HINT_RE.test(value)) {
    score -= 18
  }
  const halfwidthKatakanaCount = (value.match(HALFWIDTH_KATAKANA_RE) || []).length
  if (halfwidthKatakanaCount > 0) {
    score -= Math.min(80, halfwidthKatakanaCount * 10)
  }
  if (/[A-Za-z0-9]/.test(value)) score += 6
  if (/^\s*[{[]/.test(value)) score += 8
  if (/^\s*#EXTM3U/i.test(value)) score += 12
  if (/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(value)) score += 12
  if (encoding === 'utf-8') score += 4
  if (encoding === 'windows-1252') score -= 12
  score += Math.min(value.length, 400) / 25
  return score
}

export function decodeTextBytes(input, options = {}) {
  const bytes = toUint8Array(input)
  if (!bytes.length) return ''

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripBom(decodeBytes(bytes.subarray(3), 'utf-8'))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return stripBom(decodeBytes(bytes.subarray(2), 'utf-16le'))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return stripBom(decodeUtf16Be(bytes.subarray(2)))
  }
  if (hasUtf16LeShape(bytes)) return stripBom(decodeBytes(bytes, 'utf-16le'))
  if (hasUtf16BeShape(bytes)) return stripBom(decodeUtf16Be(bytes))

  const encodings = [...new Set([...(options.encodings || []), ...DEFAULT_TEXT_ENCODINGS])]
  let bestText = ''
  let bestScore = -Infinity

  for (const encoding of encodings) {
    const text = decodeBytes(bytes, encoding)
    const score = scoreDecodedText(text, encoding)
    if (score > bestScore) {
      bestText = text
      bestScore = score
    }
  }

  return stripBom(bestText)
}
