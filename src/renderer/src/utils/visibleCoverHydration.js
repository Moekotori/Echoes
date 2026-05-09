import { EMBEDDED_COVER_EXTRACTOR_VERSION } from '../../../shared/embeddedCoverVersion.mjs'
import { EMBEDDED_LYRICS_EXTRACTOR_VERSION } from '../../../shared/embeddedLyricsVersion.mjs'
import {
  buildVisibleRowMetadataRequestOptions,
  mergeTrackMetaEntryPreservingCover,
  satisfiesMetadataHydrateRequirement
} from './trackMetaCache.js'
import { isUnknownArtistName } from './trackUtils.js'

const DEBUG_VISIBLE_COVER_HYDRATION = false

function logVisibleCoverHydration(message, details = {}) {
  if (!DEBUG_VISIBLE_COVER_HYDRATION) return
  console.debug('[visible-cover-hydration]', message, details)
}

export function getVisibleCoverHydrationPathExtension(path) {
  const match = String(path || '').match(/\.([^.\\/]+)(?:[#?].*)?$/)
  return match ? `.${match[1].toLowerCase()}` : ''
}

export function buildEmptyVisibleCoverEntry() {
  return {
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    cover: null,
    coverSource: null,
    duration: null,
    coverChecked: true,
    coverExtractorVersion: EMBEDDED_COVER_EXTRACTOR_VERSION,
    lyricsExtractorVersion: EMBEDDED_LYRICS_EXTRACTOR_VERSION,
    bpmChecked: true,
    bpmMeasured: true,
    mqaChecked: true,
    codec: null,
    bitrateKbps: null,
    sampleRateHz: null,
    bitDepth: null,
    channels: null,
    isMqa: false,
    bpm: null
  }
}

export function buildVisibleCoverEntry(data, cachedMeta = {}) {
  if (!data?.success) return buildEmptyVisibleCoverEntry()
  const common = data.common || {}
  const technical = data.technical || {}
  return {
    title: common.title || cachedMeta.title || null,
    artist: common.artist || cachedMeta.artist || null,
    album: common.album || cachedMeta.album || null,
    albumArtist: common.albumArtist || cachedMeta.albumArtist || null,
    trackNo: common.trackNo ?? cachedMeta.trackNo ?? null,
    discNo: common.discNo ?? cachedMeta.discNo ?? null,
    cover: common.cover || cachedMeta.cover || null,
    coverScope: common.coverScope || cachedMeta.coverScope || null,
    coverSource: common.coverSource || cachedMeta.coverSource || null,
    coverExtractorVersion:
      common.coverExtractorVersion ??
      cachedMeta.coverExtractorVersion ??
      EMBEDDED_COVER_EXTRACTOR_VERSION,
    lyricsExtractorVersion:
      common.lyricsExtractorVersion ??
      cachedMeta.lyricsExtractorVersion ??
      EMBEDDED_LYRICS_EXTRACTOR_VERSION,
    duration: technical.duration || cachedMeta.duration || null,
    coverChecked: true,
    bpmChecked: true,
    bpmMeasured: cachedMeta.bpmMeasured === true,
    mqaChecked: true,
    codec: technical.codec || cachedMeta.codec || null,
    bitrateKbps: technical.bitrate
      ? Math.round(technical.bitrate / 1000)
      : cachedMeta.bitrateKbps || null,
    sampleRateHz: technical.sampleRate || cachedMeta.sampleRateHz || null,
    bitDepth: technical.bitDepth || cachedMeta.bitDepth || null,
    channels: technical.channels || cachedMeta.channels || null,
    isMqa: technical.isMqa === true || cachedMeta.isMqa === true,
    bpm: cachedMeta.bpmMeasured ? cachedMeta.bpm || null : null
  }
}

export async function runVisibleCoverHydrationQueue({
  coverQueue = [],
  visibleCount = 0,
  aheadCount = 0,
  workerCount = 4,
  immediateApplyLimit = 8,
  flushBatchSize = 8,
  flushIntervalMs = 120,
  metadataHydrateRequirementByPath = new Map(),
  readTrackMetaCache,
  writeTrackMetaCache,
  getExtendedMetadata,
  getCurrentMeta = () => ({}),
  applyEntries = () => {},
  markCoverProbed = () => {},
  markArtistProbed = () => {},
  clearInFlightPath = () => {},
  isCancelled = () => false,
  shouldApply = () => true
} = {}) {
  if (!Array.isArray(coverQueue) || coverQueue.length === 0) return
  if (typeof readTrackMetaCache !== 'function') return
  if (typeof getExtendedMetadata !== 'function') return
  const batchStartedAt = Date.now()
  logVisibleCoverHydration('queue start', {
    queueLength: coverQueue.length,
    visibleCount,
    aheadCount,
    workers: workerCount
  })

  const cached = await readTrackMetaCache(coverQueue)
  if (isCancelled()) return

  const cachedEntries = {}
  const parseQueue = []
  for (const track of coverQueue) {
    const path = track?.path
    if (!path) continue
    const requirement = metadataHydrateRequirementByPath.get(path)
    const cachedMeta = cached[path]
    if (cachedMeta && satisfiesMetadataHydrateRequirement(cachedMeta, requirement)) {
      cachedEntries[path] = cachedMeta
      markCoverProbed(path, !cachedMeta.cover)
      markArtistProbed(path, isUnknownArtistName(cachedMeta.albumArtist || cachedMeta.artist || ''))
      clearInFlightPath(path)
      continue
    }
    parseQueue.push(track)
  }
  if (Object.keys(cachedEntries).length > 0 && shouldApply() && !isCancelled()) {
    applyEntries(cachedEntries)
  }
  if (parseQueue.length === 0) return

  let nextIndex = 0
  const pendingParsedEntries = {}
  const freshCacheEntries = {}
  let appliedParsedCount = 0
  let lastFlushAt = Date.now()
  const normalizedImmediateApplyLimit = Math.max(
    0,
    Math.min(
      Number(immediateApplyLimit) || 0,
      Math.max(0, Number(visibleCount) || 0) || Number(immediateApplyLimit) || 0
    )
  )
  const normalizedFlushBatchSize = Math.max(1, Number(flushBatchSize) || 8)
  const normalizedFlushIntervalMs = Math.max(0, Number(flushIntervalMs) || 0)

  const flushPendingParsedEntries = ({ force = false } = {}) => {
    if (isCancelled() || !shouldApply()) return
    const pendingPaths = Object.keys(pendingParsedEntries)
    if (pendingPaths.length === 0) return
    const now = Date.now()
    const shouldFlush =
      force ||
      appliedParsedCount < normalizedImmediateApplyLimit ||
      pendingPaths.length >= normalizedFlushBatchSize ||
      now - lastFlushAt >= normalizedFlushIntervalMs
    if (!shouldFlush) return
    const deltaEntries = {}
    for (const path of pendingPaths) {
      deltaEntries[path] = pendingParsedEntries[path]
      delete pendingParsedEntries[path]
    }
    appliedParsedCount += pendingPaths.length
    lastFlushAt = now
    applyEntries(deltaEntries)
  }

  const parseNextCover = async () => {
    while (!isCancelled()) {
      const track = parseQueue[nextIndex]
      nextIndex += 1
      if (!track?.path) return
      const path = track.path
      const startedAt = Date.now()
      const ext = getVisibleCoverHydrationPathExtension(path)
      const cachedMeta = cached[path] || getCurrentMeta(path) || {}
      try {
        const data = await getExtendedMetadata(path, buildVisibleRowMetadataRequestOptions())
        const entry = buildVisibleCoverEntry(data, cachedMeta)
        pendingParsedEntries[path] = entry
        freshCacheEntries[path] = mergeTrackMetaEntryPreservingCover(getCurrentMeta(path) || {}, {
          ...entry,
          sizeBytes: track.sizeBytes,
          mtimeMs: track.mtimeMs
        })
        const requirement = metadataHydrateRequirementByPath.get(path)
        if (requirement?.needsCover) markCoverProbed(path, !entry.cover)
        if (requirement?.needsArtist) {
          markArtistProbed(path, isUnknownArtistName(entry.albumArtist || entry.artist || ''))
        }
        logVisibleCoverHydration('extracted', {
          ext,
          metadataCacheHit: Boolean(cached[path]),
          hasCover: Boolean(entry.cover),
          coverChecked: entry.coverChecked === true,
          coverExtractorVersion: entry.coverExtractorVersion,
          elapsedMs: Date.now() - startedAt,
          queueRemaining: Math.max(0, parseQueue.length - nextIndex)
        })
      } catch (error) {
        const entry = buildEmptyVisibleCoverEntry()
        pendingParsedEntries[path] = entry
        freshCacheEntries[path] = {
          ...entry,
          sizeBytes: track.sizeBytes,
          mtimeMs: track.mtimeMs
        }
        markCoverProbed(path, true)
        logVisibleCoverHydration('extracted', {
          ext,
          metadataCacheHit: Boolean(cached[path]),
          hasCover: false,
          coverChecked: true,
          coverExtractorVersion: EMBEDDED_COVER_EXTRACTOR_VERSION,
          elapsedMs: Date.now() - startedAt,
          error: error?.message || String(error || ''),
          queueRemaining: Math.max(0, parseQueue.length - nextIndex)
        })
      } finally {
        clearInFlightPath(path)
        flushPendingParsedEntries()
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(workerCount, parseQueue.length) }, () => parseNextCover())
  )
  flushPendingParsedEntries({ force: true })
  if (Object.keys(freshCacheEntries).length > 0 && typeof writeTrackMetaCache === 'function') {
    writeTrackMetaCache(freshCacheEntries)
  }
  logVisibleCoverHydration('queue complete', {
    queueLength: coverQueue.length,
    parsedLength: parseQueue.length,
    elapsedMs: Date.now() - batchStartedAt
  })
}
