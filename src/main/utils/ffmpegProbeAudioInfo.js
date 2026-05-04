import { execFile } from 'child_process'
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

export function parseFfmpegAudioInfoText(text) {
  const source = String(text || '')
  const streamLine = source
    .split(/\r?\n/)
    .find((line) => /Stream #.*Audio:/i.test(line))
  if (!streamLine) return null

  const codec = streamLine.match(/Audio:\s*([^,\s]+)/i)?.[1] || null
  const sampleRate = Number(streamLine.match(/,\s*(\d+)\s*Hz/i)?.[1] || 0) || null
  const bitrateKbps = Number(streamLine.match(/,\s*(\d+)\s*kb\/s/i)?.[1] || 0) || null
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
    bitDepth: parseBitDepth(sampleFormat, explicitDepth)
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
