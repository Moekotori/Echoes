import { extractVideoId } from './mvUrlParse.js'

const SOURCE_URL_KEYS = [
  'mvOriginUrl',
  'sourceUrl',
  'webpage_url',
  'original_url',
  'url',
  'webpage_url_basename'
]

const SOURCE_HINT_KEYS = [
  'extractor',
  'extractor_key',
  'ie_key',
  'source',
  'provider',
  'webpage_url',
  'original_url',
  'sourceUrl',
  'mvOriginUrl'
]

const ID_KEYS = ['id', 'display_id', 'video_id']

function readString(info, key) {
  const value = info?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBilibiliId(value) {
  const match = value.match(/(BV[a-zA-Z0-9]{10})/i)
  return match ? match[1] : ''
}

export function resolveDownloadedSourceMv(info = {}) {
  if (!info || typeof info !== 'object') return null

  for (const key of SOURCE_URL_KEYS) {
    const candidate = readString(info, key)
    if (!candidate) continue
    const parsed = extractVideoId(candidate)
    if (parsed) return parsed
  }

  const sourceText = SOURCE_HINT_KEYS.map((key) => readString(info, key))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const isYoutube = /youtube|youtu\.be/.test(sourceText)
  const isBilibili = /bilibili|(^|[^a-z])bili([^a-z]|$)/.test(sourceText)

  for (const key of ID_KEYS) {
    const candidate = readString(info, key)
    if (!candidate) continue

    if (isBilibili) {
      const bvId = normalizeBilibiliId(candidate)
      if (bvId) return { id: bvId, source: 'bilibili' }
    }

    if (isYoutube && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
      return { id: candidate, source: 'youtube' }
    }
  }

  return null
}
