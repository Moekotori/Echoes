import { execFile } from 'child_process'
import { extname } from 'path'
import { getResolvedFfmpegStaticPath } from './resolveFfmpegStaticPath.js'

function parseBitDepth(sampleFormat, explicitDepth) {
  const explicit = Number(explicitDepth)
  if (Number.isFinite(explicit) && explicit > 0) return explicit

  const text = String(sampleFormat || '').toLowerCase()
  if (/s32|u32|f32/.test(text)) return 32
  if (/s24|u24/.test(text)) return 24
  if (/s16|u16/.test(text)) return 16
  if (/s8|u8/.test(text)) return 8
  return null
}

function parseDurationSeconds(value) {
  const match = String(value || '').match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(Number.isFinite)) return null
  return hours * 3600 + minutes * 60 + seconds
}

function parseGlobalMetadataTags(source) {
  const tags = {}
  let inMetadata = false
  for (const line of String(source || '').split(/\r?\n/)) {
    if (!inMetadata) {
      if (/^\s*Metadata:\s*$/i.test(line)) inMetadata = true
      continue
    }
    if (/^\s*(Duration|Stream|Chapters):/i.test(line)) break
    const match = line.match(/^\s{4,}([^:]+?)\s*:\s*(.*)$/)
    if (!match) continue
    const key = String(match[1] || '').trim().toLowerCase()
    const value = String(match[2] || '').trim()
    if (key && value && tags[key] == null) tags[key] = value
  }
  return {
    title: tags.title || '',
    artist: tags.artist || '',
    artists: tags.artists || '',
    author: tags.author || tags.authors || '',
    performer: tags.performer || '',
    composer: tags.composer || '',
    album: tags.album || '',
    albumArtist: tags.albumartist || tags.album_artist || ''
  }
}

function normalizeCodecIdentity(value) {
  const text = String(value || '').toLowerCase()
  if (!text) return ''
  if (/alac/.test(text)) return 'alac'
  if (/flac/.test(text)) return 'flac'
  if (/aac|adts/.test(text)) return 'aac'
  if (/mp3|mpeg\s*audio|mpa/.test(text)) return 'mp3'
  if (/opus/.test(text)) return 'opus'
  if (/vorbis|ogg/.test(text)) return 'vorbis'
  if (/wav|pcm|aiff/.test(text)) return 'pcm'
  return text.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)[0] || text
}

function getMetadataCodecIdentity(metadata, codecLabel = '') {
  return normalizeCodecIdentity(
    [
      codecLabel,
      metadata?.format?.codec,
      metadata?.format?.codecProfile,
      metadata?.format?.container
    ]
      .filter(Boolean)
      .join(' ')
  )
}

export function isLikelyIncorrectAudioMetadata(filePath, metadata, { fileSizeBytes = 0 } = {}) {
  const ext = extname(String(filePath || '')).toLowerCase()
  const format = metadata?.format || {}
  const duration = Number(format.duration || 0)
  const bitrate = Number(format.bitrate || 0)
  const codecIdentity = getMetadataCodecIdentity(metadata)
  const largeFile = Number(fileSizeBytes || 0) > 1024 * 1024
  const implausiblyShortLargeFile = largeFile && duration > 0 && duration < 1
  const implausibleBitrate = bitrate > 20000000
  const mp3NamedAacAdts = ext === '.mp3' && codecIdentity === 'aac'
  return implausiblyShortLargeFile || implausibleBitrate || mp3NamedAacAdts
}

export function shouldUseFfmpegAudioInfo(
  filePath,
  metadata,
  codecLabel = '',
  { fileSizeBytes = 0 } = {}
) {
  const ext = extname(String(filePath || '')).toLowerCase()
  const sampleRate = Number(metadata?.format?.sampleRate || 0)
  const bitDepth = Number(metadata?.format?.bitsPerSample || 0)
  return (
    sampleRate <= 0 ||
    bitDepth <= 0 ||
    /alac/i.test(codecLabel || '') ||
    ['.m4a', '.m4b', '.mp4', '.alac'].includes(ext) ||
    isLikelyIncorrectAudioMetadata(filePath, metadata, { fileSizeBytes })
  )
}

export function shouldPreferFfmpegAudioInfo(
  filePath,
  metadata,
  probedInfo = null,
  { fileSizeBytes = 0, codecLabel = '' } = {}
) {
  if (!probedInfo) return false
  const metadataCodec = getMetadataCodecIdentity(metadata, codecLabel)
  const probedCodec = normalizeCodecIdentity(probedInfo.codec)
  const codecDisagrees = Boolean(metadataCodec && probedCodec && metadataCodec !== probedCodec)
  const metadataLooksWrong = isLikelyIncorrectAudioMetadata(filePath, metadata, { fileSizeBytes })
  const metadataSampleRate = Number(metadata?.format?.sampleRate || 0)
  const probedSampleRate = Number(probedInfo.sampleRate || 0)
  const sampleRateDisagrees =
    metadataSampleRate > 0 && probedSampleRate > 0 && Math.abs(metadataSampleRate - probedSampleRate) >= 1000

  return metadataLooksWrong || (codecDisagrees && sampleRateDisagrees)
}

export function normalizeResolvedAudioCodecLabel({
  codecLabel = '',
  filePath = '',
  probedCodec = '',
  preferProbed = false
} = {}) {
  const explicit = String(codecLabel || '').trim()
  const probed = String(probedCodec || '').trim()
  if (/alac/i.test(explicit) || /alac/i.test(probed) || /\.alac$/i.test(String(filePath || ''))) {
    return 'ALAC'
  }
  if (preferProbed && probed) return probed
  return explicit || probed || 'unknown'
}

export function parseFfmpegAudioInfoText(text) {
  const source = String(text || '')
  const streamLine = source
    .split(/\r?\n/)
    .find((line) => /Stream #.*Audio:/i.test(line))
  if (!streamLine) return null

  const durationLine = source.split(/\r?\n/).find((line) => /\bDuration:/i.test(line)) || ''
  const codec = streamLine.match(/Audio:\s*([^,\s]+)/i)?.[1] || null
  const sampleRate = Number(streamLine.match(/,\s*(\d+)\s*Hz/i)?.[1] || 0) || null
  const bitrateKbps =
    Number(streamLine.match(/,\s*(\d+)\s*kb\/s/i)?.[1] || 0) ||
    Number(durationLine.match(/bitrate:\s*(\d+)\s*kb\/s/i)?.[1] || 0) ||
    null
  const sampleFormat = streamLine.match(/Audio:\s*[^,]+,\s*([^,\s]+)/i)?.[1] || ''
  const explicitDepth =
    streamLine.match(/\((\d+)\s*bit\)/i)?.[1] ||
    streamLine.match(/\b(?:s|u)(8|16|24|32)(?:p)?\b/i)?.[1] ||
    null
  const channelsText = streamLine.match(/,\s*([^,]*?(?:mono|stereo|channels?))/i)?.[1] || ''
  let channels = null
  if (/mono/i.test(channelsText)) channels = 1
  else if (/stereo/i.test(channelsText)) channels = 2
  else channels = Number(channelsText.match(/(\d+)\s*channels?/i)?.[1] || 0) || null

  return {
    codec,
    sampleRate,
    bitrate: bitrateKbps ? bitrateKbps * 1000 : null,
    channels,
    bitDepth: parseBitDepth(sampleFormat, explicitDepth),
    duration: parseDurationSeconds(durationLine),
    tags: parseGlobalMetadataTags(source)
  }
}

export function getFfmpegAudioInfo(filePath) {
  return new Promise((resolve) => {
    const ffmpegPath = getResolvedFfmpegStaticPath()
    execFile(ffmpegPath, ['-hide_banner', '-i', filePath], { timeout: 12000 }, (_error, _stdout, stderr) => {
      resolve(parseFfmpegAudioInfoText(stderr))
    })
  })
}
