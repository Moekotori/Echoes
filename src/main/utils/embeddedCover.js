export function normalizeEmbeddedCoverMime(format = '') {
  const raw = String(format || '').trim().toLowerCase()
  const mime = raw.includes('/') ? raw : `image/${raw || 'jpeg'}`
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}

export function bufferFromEmbeddedPictureData(data) {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data.length ? data : null
  if (data instanceof Uint8Array) {
    const buffer = Buffer.from(data)
    return buffer.length ? buffer : null
  }
  if (data instanceof ArrayBuffer) {
    const buffer = Buffer.from(data)
    return buffer.length ? buffer : null
  }
  if (Array.isArray(data)) {
    const buffer = Buffer.from(data)
    return buffer.length ? buffer : null
  }
  return null
}

export function normalizeEmbeddedCoverPicture(picture = null) {
  const buffer = bufferFromEmbeddedPictureData(picture?.data)
  if (!buffer) return null
  const mime = normalizeEmbeddedCoverMime(picture?.format || picture?.mimeType)
  return {
    buffer,
    mime,
    bytes: buffer.length
  }
}

export function buildEmbeddedCoverDataUrl(picture = null) {
  const normalized = normalizeEmbeddedCoverPicture(picture)
  if (!normalized) return null
  return `data:${normalized.mime};base64,${normalized.buffer.toString('base64')}`
}

export function buildJsmediatagsPictureDataUrl(picture = null) {
  return buildEmbeddedCoverDataUrl({
    data: picture?.data,
    format: picture?.format || picture?.type || picture?.mimeType
  })
}
