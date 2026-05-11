import {
  isAutoLyricsCandidateAccepted,
  isLikelyInstrumentalTrack,
  isOnlineLyricsOverrideSource,
  pickLyricsFromLrcLibResult,
  rankLrcLibCandidates
} from './lyricsCandidateRank.js'
import { parseAnyLyrics } from './lyricsParse.js'
import {
  clearLyricsOverrideForPath,
  getLyricsInstrumentalFlagForPath,
  getLyricsOverrideForPath,
  getLyricsSourcePreferenceForPath,
  normalizeLyricsSourcePreference,
  setLyricsOverrideForPath
} from './lyricsOverrideStorage.js'

const ONLINE_LYRICS_SOURCES = ['lrclib', 'netease', 'qq', 'kugou', 'kuwo']
const HAS_SYNCED_LRC_TIME_TAGS_RE = /\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.:]\d{2,3})?\]/

export function cleanTitleForLyricsSearch(rawTitle = '') {
  if (!rawTitle) return ''
  let s = String(rawTitle)
  s = s.replace(/\[[^\]]*\]/g, ' ')
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.replace(/\b(cover|remix|live|ver\.?|version|feat\.?|ft\.?)\b/gi, '')
  s = s.replace(/[~`"'.,!?;:|/\\]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function extractBookTitleQuotes(rawTitle = '') {
  const out = []
  const re = /[<\[]([^>\]]+)[>\]]/g
  let m
  while ((m = re.exec(rawTitle)) !== null) {
    const inner = (m[1] || '').trim()
    if (inner && inner.length <= 120) out.push(inner)
  }
  return out
}

function extractCornerQuotes(rawTitle = '') {
  const out = []
  const re = /["']([^"']+)["']/g
  let m
  while ((m = re.exec(rawTitle)) !== null) {
    const inner = (m[1] || '').trim()
    if (inner && inner.length <= 120) out.push(inner)
  }
  return out
}

export function cleanArtistForLyricsSearch(raw = '') {
  let s = (raw || '').trim()
  if (!s) return ''
  s = s.replace(/\s*\/\s*cover\s*/gi, ' ')
  s = s.replace(/\/\s*cover/gi, '')
  s = s.replace(/cover\s*\//gi, '')
  s = s.replace(/cover/gi, '')
  s = s.replace(/\//g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function buildLyricTitleVariantsForPreload(rawTitle = '') {
  const seen = new Set()
  const list = []
  const add = (candidate) => {
    const cleaned = (cleanTitleForLyricsSearch(candidate) || candidate || '').trim()
    if (!cleaned || seen.has(cleaned)) return
    seen.add(cleaned)
    list.push(cleaned)
  }
  const rt = (rawTitle || '').trim()
  if (!rt) return list
  for (const q of extractBookTitleQuotes(rt)) add(q)
  for (const q of extractCornerQuotes(rt)) add(q)
  add(rt)

  const versionMarkerRe = /\b(remix|rmx|live|acoustic|instrumental|inst|cover|edit)\b/i
  if (versionMarkerRe.test(rt)) {
    let withVersion = rt
    withVersion = withVersion.replace(/\[[^\]]*\]/g, ' ')
    withVersion = withVersion.replace(/[~`"'.,!?;:|/\\]+/g, ' ')
    withVersion = withVersion.replace(/\bfeat\.?\b|\bft\.?\b/gi, '')
    withVersion = withVersion.replace(/\s+/g, ' ').trim().toLowerCase()
    if (withVersion && !seen.has(withVersion)) {
      seen.add(withVersion)
      list.push(withVersion)
    }
  }

  return list
}

export function extractParenArtistHintsForPreload(rawTitle = '') {
  if (!rawTitle) return []
  const seen = new Set()
  const out = []
  const re = /\(([^)]+)\)/g
  let m
  while ((m = re.exec(rawTitle)) !== null) {
    const inner = (m[1] || '').trim()
    if (!inner || inner.length > 80) continue
    if (/TV|size|instrumental|inst\.?|karaoke|off\s*vocal|ver\.|cover|MV|mv/i.test(inner)) {
      continue
    }
    const key = inner.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(inner)
  }
  return out
}

function hasUsableLyrics(raw, { requireSynced = false } = {}) {
  const text = String(raw || '')
  if (!text.trim()) return false
  if (requireSynced && !HAS_SYNCED_LRC_TIME_TAGS_RE.test(text)) return false
  return parseAnyLyrics(text).length >= 3
}

function getPreferredCacheSource(filePath, matchedSource, requestedSourcePreference) {
  const requested = normalizeLyricsSourcePreference(requestedSourcePreference)
  if (requested && requested !== 'manual') return requested
  return normalizeLyricsSourcePreference(matchedSource)
}

function cachePreloadedLyrics(filePath, raw, matchedSource, requestedSourcePreference) {
  if (!filePath || !hasUsableLyrics(raw)) return false
  setLyricsOverrideForPath(filePath, raw, {
    source: matchedSource,
    origin: '',
    preferredSource: getPreferredCacheSource(filePath, matchedSource, requestedSourcePreference)
  })
  return true
}

function getOnlineSourceOrder(preferredSource) {
  const preferred = normalizeLyricsSourcePreference(preferredSource)
  return [
    preferred,
    'netease',
    'qq',
    'kugou',
    'kuwo',
    'lrclib'
  ].filter((source, index, arr) => ONLINE_LYRICS_SOURCES.includes(source) && arr.indexOf(source) === index)
}

async function preloadStreamingLyrics({ api, filePath, track, title, artist, durationSec }) {
  if (!api?.streaming?.fetchLyrics) return false
  const streamingTrack = {
    ...(track || {}),
    ...(track?.info || {}),
    provider: track?.provider || track?.streamingProvider || track?.info?.streamingProvider || '',
    providerLabel: track?.providerLabel || track?.info?.source || track?.streamingProvider || '',
    sourceId: track?.sourceId || track?.raw?.id || '',
    title,
    artist,
    album: track?.album || track?.info?.album || '',
    duration: durationSec || track?.duration || track?.info?.duration || 0
  }
  const res = await api.streaming.fetchLyrics(streamingTrack)
  if (!res?.ok || !hasUsableLyrics(res.lrc)) return false
  return cachePreloadedLyrics(filePath, res.lrc, res.source || streamingTrack.provider || 'streaming')
}

async function preloadLrcLibLyrics({
  requestLrcLib,
  filePath,
  titleVariants,
  artistCandidates,
  albumName,
  durationSec,
  rankOptions,
  requestedSourcePreference
}) {
  if (typeof requestLrcLib !== 'function') return false
  const queries = []
  const jobs = []
  for (const title of titleVariants.slice(0, 3)) {
    for (const artist of artistCandidates.slice(0, 3)) {
      const params = new URLSearchParams({ track_name: title })
      if (artist) params.set('artist_name', artist)
      if (albumName) params.set('album_name', albumName)
      jobs.push(requestLrcLib(`https://lrclib.net/api/get?${params.toString()}`))
      queries.push(`${title} ${artist}`.trim())
    }
    queries.push(title)
  }

  for (const query of [...new Set(queries)].filter(Boolean).slice(0, 5)) {
    jobs.push(requestLrcLib(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`))
  }

  const settled = await Promise.allSettled(jobs.slice(0, 8))
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const raw = pickLyricsFromLrcLibResult(result.value, durationSec, rankOptions)
    if (cachePreloadedLyrics(filePath, raw, 'lrclib', requestedSourcePreference)) return true
  }
  return false
}

async function preloadNeteaseLyrics({
  api,
  filePath,
  title,
  titleVariants,
  artistCandidates,
  durationSec,
  rankOptions,
  requestedSourcePreference
}) {
  if (!api?.fetchNeteaseLyrics) return false
  const queries = []
  for (const titleVariant of titleVariants) {
    for (const artist of artistCandidates.slice(0, 3)) queries.push(`${titleVariant} ${artist}`.trim())
    queries.push(titleVariant)
  }

  for (const keywords of [...new Set(queries)].filter(Boolean).slice(0, 6)) {
    const res = await api.fetchNeteaseLyrics({
      keywords,
      rawKeywords: title,
      durationSec
    })
    if (res?.rateLimited || res?.error === 'rate_limited') return false
    if (!res?.ok || !res.lrc) continue
    if (typeof res.confidence === 'number' && res.confidence < 30) continue
    const ranked = rankLrcLibCandidates(
      [
        {
          trackName: res.song?.trackName || '',
          artistName: res.song?.artistName || '',
          duration: Number(res.song?.duration) || 0,
          syncedLyrics: res.lrc
        }
      ],
      durationSec,
      rankOptions
    )[0]
    if (!isAutoLyricsCandidateAccepted(ranked, rankOptions)) continue
    if (cachePreloadedLyrics(filePath, res.lrc, 'netease', requestedSourcePreference)) return true
  }
  return false
}

async function preloadExternalLyrics({
  api,
  filePath,
  source,
  titleVariants,
  artistCandidates,
  durationSec,
  rankOptions,
  requestedSourcePreference
}) {
  if (!api?.searchExternalLyrics) return false
  const queries = []
  for (const titleVariant of titleVariants) {
    for (const artist of artistCandidates.slice(0, 3)) queries.push(`${titleVariant} ${artist}`.trim())
    queries.push(titleVariant)
  }

  for (const keywords of [...new Set(queries)].filter(Boolean).slice(0, 5)) {
    const res = await api.searchExternalLyrics({
      keywords,
      durationSec,
      sources: [source]
    })
    const ranked = rankLrcLibCandidates(Array.isArray(res?.items) ? res.items : [], durationSec, rankOptions)
    const hit = ranked.find((candidate) => {
      const raw =
        candidate?.chosenLyrics ||
        candidate?.item?.syncedLyrics ||
        candidate?.item?.plainLyrics ||
        ''
      return (
        isAutoLyricsCandidateAccepted(candidate, rankOptions) &&
        hasUsableLyrics(raw, { requireSynced: true })
      )
    })
    if (!hit) continue
    const raw = hit.chosenLyrics || hit.item?.syncedLyrics || hit.item?.plainLyrics || ''
    if (cachePreloadedLyrics(filePath, raw, source, requestedSourcePreference)) return true
  }
  return false
}

export async function preloadLyricsForTrack({
  track,
  title,
  artist,
  album = '',
  durationSec = 0,
  api,
  requestLrcLib,
  defaultSource = 'lrclib',
  isStreamingTrack = false
} = {}) {
  const filePath = track?.path || ''
  const resolvedTitle = String(title || '').trim()
  if (!filePath || !resolvedTitle) return { status: 'skipped' }
  if (getLyricsInstrumentalFlagForPath(filePath)) return { status: 'instrumental' }

  const savedOverride = getLyricsOverrideForPath(filePath)
  const savedSourcePreference = getLyricsSourcePreferenceForPath(filePath)
  const configuredSource = String(defaultSource || '').trim().toLowerCase()
  if (!savedSourcePreference && (configuredSource === 'local' || configuredSource === 'manual')) {
    return savedOverride?.raw ? { status: 'cached' } : { status: 'skipped' }
  }
  const preferredSource =
    savedSourcePreference || normalizeLyricsSourcePreference(defaultSource) || 'lrclib'
  const savedOverrideSource = normalizeLyricsSourcePreference(savedOverride?.source)
  const savedOverrideOrigin = normalizeLyricsSourcePreference(savedOverride?.origin)
  const savedOverrideMatchesSource =
    !!savedOverride?.raw &&
    (preferredSource === 'manual' ||
      !savedSourcePreference ||
      savedOverrideSource === preferredSource ||
      savedOverrideOrigin === preferredSource)

  if (savedOverride?.raw && savedOverrideMatchesSource) return { status: 'cached' }

  if (isLikelyInstrumentalTrack({ title: resolvedTitle, artist, filePath })) {
    if (savedOverride?.raw && isOnlineLyricsOverrideSource(savedOverride.source)) {
      clearLyricsOverrideForPath(filePath)
    }
    return { status: 'instrumental' }
  }

  if (isStreamingTrack) {
    return (await preloadStreamingLyrics({
      api,
      filePath,
      track,
      title: resolvedTitle,
      artist,
      durationSec
    }))
      ? { status: 'matched', source: 'streaming' }
      : { status: 'none' }
  }

  const titleVariants = buildLyricTitleVariantsForPreload(resolvedTitle)
  if (titleVariants.length === 0) return { status: 'skipped' }
  const parenHints = extractParenArtistHintsForPreload(resolvedTitle)
  const artistRaw = String(artist || '').trim()
  const artistClean = cleanArtistForLyricsSearch(artistRaw)
  const artistCandidates = [...new Set([...parenHints, artistClean, artistRaw].filter(Boolean))]
  const rankOptions = {
    titleCandidates: titleVariants,
    rawTitle: resolvedTitle,
    artistCandidates
  }
  const sourceOrder = getOnlineSourceOrder(preferredSource)

  for (const source of sourceOrder) {
    if (
      source === 'lrclib' &&
      (await preloadLrcLibLyrics({
        requestLrcLib,
        filePath,
        titleVariants,
        artistCandidates: artistCandidates.length > 0 ? artistCandidates : [''],
        albumName: album,
        durationSec,
        rankOptions,
        requestedSourcePreference: preferredSource
      }))
    ) {
      return { status: 'matched', source }
    }

    if (
      source === 'netease' &&
      (await preloadNeteaseLyrics({
        api,
        filePath,
        title: resolvedTitle,
        titleVariants,
        artistCandidates,
        durationSec,
        rankOptions,
        requestedSourcePreference: preferredSource
      }))
    ) {
      return { status: 'matched', source }
    }

    if (
      ['qq', 'kugou', 'kuwo'].includes(source) &&
      (await preloadExternalLyrics({
        api,
        filePath,
        source,
        titleVariants,
        artistCandidates,
        durationSec,
        rankOptions,
        requestedSourcePreference: preferredSource
      }))
    ) {
      return { status: 'matched', source }
    }
  }

  return { status: 'none' }
}
