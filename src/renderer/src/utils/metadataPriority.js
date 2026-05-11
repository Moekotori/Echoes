export const METADATA_PRIORITY_VERSION = 1

const SOURCE_PRIORITIES = {
  manual: 100,
  'manual-network': 100,
  'embedded-batch': 95,
  embedded: 90,
  'embedded-cue': 88,
  cue: 88,
  sidecar: 70,
  'download-sidecar': 70,
  'local-folder-cover': 60,
  folder: 20,
  filename: 10,
  network: 40,
  remote: 40,
  netease: 40,
  qqmusic: 40,
  external: 40,
  cloud: 40,
  fallback: 0,
  unknown: 0
}

const PROTECTED_META_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'year',
  'genre',
  'trackNo',
  'trackTotal',
  'discNo',
  'discTotal',
  'duration',
  'codec',
  'container',
  'lossless',
  'bitrate',
  'bitrateKbps',
  'sampleRate',
  'sampleRateHz',
  'bitDepth',
  'channels'
]

export function normalizeMetadataSource(source) {
  const value = String(source || '')
    .trim()
    .toLowerCase()
  if (!value) return ''
  if (value === 'cue') return 'embedded-cue'
  if (value === 'cloud') return 'network'
  if (value === 'local') return 'local-folder-cover'
  return Object.prototype.hasOwnProperty.call(SOURCE_PRIORITIES, value) ? value : value
}

export function getMetadataSourcePriority(source) {
  const normalized = normalizeMetadataSource(source)
  if (!normalized) return SOURCE_PRIORITIES.unknown
  return SOURCE_PRIORITIES[normalized] ?? SOURCE_PRIORITIES.unknown
}

function isEmptyMetadataValue(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'number') return !Number.isFinite(value) || value <= 0
  return false
}

function inferCoverSourceFromValue(value) {
  const cover = typeof value === 'string' ? value.trim() : ''
  if (!cover) return ''
  if (/^(?:data:image\/|file:\/\/)/i.test(cover)) return 'local-folder-cover'
  if (/^https?:\/\//i.test(cover)) return 'network'
  return ''
}

export function getTrackMetaFieldSource(entry = {}, field = '') {
  if (!entry || typeof entry !== 'object' || !field) return ''
  const fieldSources =
    entry.fieldSources && typeof entry.fieldSources === 'object' ? entry.fieldSources : {}
  const directSource = normalizeMetadataSource(fieldSources[field])
  if (directSource)
    return field === 'cover' && directSource === 'folder' ? 'local-folder-cover' : directSource
  if (field === 'cover') {
    const source = normalizeMetadataSource(entry.coverSource || entry.metadataSource)
    if (source) return source === 'folder' ? 'local-folder-cover' : source
    return inferCoverSourceFromValue(entry.cover)
  }
  return normalizeMetadataSource(entry.metadataSource)
}

function inferIncomingSource(entry = {}, field = '', fallback = '') {
  return getTrackMetaFieldSource(entry, field) || normalizeMetadataSource(fallback)
}

export function pickHigherPriorityField(
  existingValue,
  existingSource,
  incomingValue,
  incomingSource,
  { allowEqualPriorityOverride = true } = {}
) {
  if (isEmptyMetadataValue(incomingValue)) {
    return { value: existingValue, source: normalizeMetadataSource(existingSource), picked: false }
  }

  const normalizedIncomingSource = normalizeMetadataSource(incomingSource)
  const normalizedExistingSource = normalizeMetadataSource(existingSource)

  if (isEmptyMetadataValue(existingValue)) {
    return { value: incomingValue, source: normalizedIncomingSource, picked: true }
  }

  const existingPriority = getMetadataSourcePriority(normalizedExistingSource)
  const incomingPriority = getMetadataSourcePriority(normalizedIncomingSource)

  if (existingPriority >= SOURCE_PRIORITIES.manual && incomingPriority < SOURCE_PRIORITIES.manual) {
    return { value: existingValue, source: normalizedExistingSource, picked: false }
  }

  if (incomingPriority > existingPriority) {
    return { value: incomingValue, source: normalizedIncomingSource, picked: true }
  }

  if (incomingPriority < existingPriority) {
    return { value: existingValue, source: normalizedExistingSource, picked: false }
  }

  if (!allowEqualPriorityOverride) {
    return { value: existingValue, source: normalizedExistingSource, picked: false }
  }

  if (!normalizedIncomingSource && normalizedExistingSource) {
    return { value: existingValue, source: normalizedExistingSource, picked: false }
  }

  return {
    value: incomingValue,
    source: normalizedIncomingSource || normalizedExistingSource,
    picked: true
  }
}

function mergeFieldSources(existing = {}, incoming = {}) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(incoming && typeof incoming === 'object' ? incoming : {})
  }
}

function setFieldSource(fieldSources, field, source) {
  const normalized = normalizeMetadataSource(source)
  if (normalized) fieldSources[field] = normalized
  else delete fieldSources[field]
}

export function withManualMetadataSources(entry = {}) {
  if (!entry || typeof entry !== 'object') return entry
  const fieldSources = { ...(entry.fieldSources || {}) }
  for (const field of [...PROTECTED_META_FIELDS, 'cover']) {
    if (!isEmptyMetadataValue(entry[field])) fieldSources[field] = 'manual'
  }
  return {
    ...entry,
    metadataSource: 'manual',
    ...(entry.cover ? { coverSource: 'manual' } : {}),
    fieldSources
  }
}

export function mergeTrackMetaWithPriority(existing = {}, incoming = {}, options = {}) {
  if (!incoming || typeof incoming !== 'object') return existing || {}
  if (!existing || typeof existing !== 'object') return { ...incoming }

  const next = { ...existing }
  const fieldSources = mergeFieldSources(existing.fieldSources, incoming.fieldSources)
  const incomingDefaultSource = normalizeMetadataSource(
    options.incomingSource || incoming.metadataSource
  )

  for (const [key, value] of Object.entries(incoming)) {
    if (
      key === 'fieldSources' ||
      key === 'metadataSource' ||
      key === 'coverSource' ||
      key === 'cover' ||
      PROTECTED_META_FIELDS.includes(key)
    ) {
      continue
    }
    if (value !== undefined) next[key] = value
  }

  for (const field of PROTECTED_META_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue
    const picked = pickHigherPriorityField(
      existing[field],
      getTrackMetaFieldSource(existing, field),
      incoming[field],
      inferIncomingSource(incoming, field, incomingDefaultSource),
      options
    )
    if (picked.picked || isEmptyMetadataValue(existing[field])) {
      next[field] = picked.value
      setFieldSource(fieldSources, field, picked.source)
    } else if (!isEmptyMetadataValue(existing[field])) {
      setFieldSource(fieldSources, field, picked.source)
    }
  }

  if (Object.prototype.hasOwnProperty.call(incoming, 'cover')) {
    const picked = pickHigherPriorityField(
      existing.cover,
      getTrackMetaFieldSource(existing, 'cover'),
      incoming.cover,
      inferIncomingSource(incoming, 'cover', incoming.coverSource || incomingDefaultSource),
      options
    )
    if (isEmptyMetadataValue(incoming.cover) && isEmptyMetadataValue(existing.cover)) {
      next.cover = incoming.cover
    } else if (picked.picked || isEmptyMetadataValue(existing.cover)) {
      next.cover = picked.value
      setFieldSource(fieldSources, 'cover', picked.source)
      if (picked.source) next.coverSource = picked.source
      for (const key of [
        'coverScope',
        'coverChecked',
        'coverThumbnailOnly',
        'coverMaxDimension',
        'coverExtractorVersion',
        'coverKey',
        'coverThumbPath',
        'coverThumbUrl',
        'coverCacheVersion',
        'coverThumbBytes',
        'coverThumbWidth',
        'coverThumbHeight'
      ]) {
        if (incoming[key] != null) next[key] = incoming[key]
      }
    } else if (!isEmptyMetadataValue(existing.cover)) {
      setFieldSource(fieldSources, 'cover', picked.source)
      if (picked.source && !next.coverSource) next.coverSource = picked.source
    }
  }

  if (
    !Object.prototype.hasOwnProperty.call(incoming, 'cover') &&
    (incoming.coverThumbUrl || incoming.coverThumbPath || incoming.coverKey)
  ) {
    const thumbCoverSource = normalizeMetadataSource(incoming.coverSource || incomingDefaultSource)
    if (thumbCoverSource) {
      next.coverSource = thumbCoverSource
      setFieldSource(fieldSources, 'cover', thumbCoverSource)
    }
  }

  const selectedSources = Object.values(fieldSources).filter(Boolean)
  const strongestSource = selectedSources.sort(
    (a, b) => getMetadataSourcePriority(b) - getMetadataSourcePriority(a)
  )[0]
  if (strongestSource) next.metadataSource = strongestSource
  if (Object.keys(fieldSources).length > 0) next.fieldSources = fieldSources
  next.metadataPriorityVersion = METADATA_PRIORITY_VERSION
  return next
}
