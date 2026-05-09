import { decodeTextBytes } from '../../../shared/textEncoding.mjs'

const LYRICS_FILE_EXT_RE = /\.(lrc|lrcx)$/i

function getFileName(file) {
  return String(file?.name || file?.path || '')
}

export function isDroppedLyricsFile(file) {
  return LYRICS_FILE_EXT_RE.test(getFileName(file))
}

export function getDroppedLyricsFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files || [])
  return files.find(isDroppedLyricsFile) || null
}

export function hasDroppedFiles(dataTransfer) {
  const types = Array.from(dataTransfer?.types || [])
  return types.includes('Files') || Number(dataTransfer?.files?.length || 0) > 0
}

function toUint8Array(bufferLike) {
  if (!bufferLike) return null
  if (bufferLike instanceof Uint8Array) return bufferLike
  if (bufferLike instanceof ArrayBuffer) return new Uint8Array(bufferLike)
  if (Array.isArray(bufferLike)) return new Uint8Array(bufferLike)
  if (Array.isArray(bufferLike?.data)) return new Uint8Array(bufferLike.data)
  try {
    return new Uint8Array(bufferLike)
  } catch {
    return null
  }
}

export async function readDroppedLyricsFile(file, api = null) {
  if (!isDroppedLyricsFile(file)) return ''

  if (file?.path && api?.readBufferHandler) {
    const buffer = await api.readBufferHandler(file.path)
    const bytes = toUint8Array(buffer)
    if (bytes) return decodeTextBytes(bytes)
  }

  if (typeof file?.text === 'function') {
    return String(await file.text()).replace(/^\uFEFF/, '')
  }

  return ''
}
