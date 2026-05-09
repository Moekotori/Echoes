import { parseCueSheet } from '../../../shared/cueTracks.mjs'

function getPathDirname(filePath) {
  const normalized = String(filePath || '')
  const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

function isAbsolutePlaylistPath(value) {
  const path = String(value || '').trim()
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith('\\\\') ||
    path.startsWith('/') ||
    /^https?:\/\//i.test(path)
  )
}

export function resolvePlaylistEntryPath(entry, playlistFilePath) {
  const raw = String(entry || '').trim()
  if (!raw) return ''
  if (/^file:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const decoded = decodeURIComponent(url.pathname || '')
      if (url.host) return `\\\\${url.host}${decoded.replace(/\//g, '\\')}`
      return decoded.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
    } catch {
      return raw
    }
  }
  if (isAbsolutePlaylistPath(raw)) return raw
  const baseDir = getPathDirname(playlistFilePath)
  if (!baseDir) return raw
  const separator = baseDir.includes('\\') ? '\\' : '/'
  return `${baseDir.replace(/[\\/]+$/, '')}${separator}${raw.replace(/^[\\/]+/, '')}`
}

export function parseM3UPlaylist(content, filePath) {
  const paths = []
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    paths.push(resolvePlaylistEntryPath(line, filePath))
  }
  return [...new Set(paths.filter(Boolean))]
}

export function parseCuePlaylist(content, filePath) {
  const cueTracks = parseCueSheet(content)
  return cueTracks
    .map((track) => {
      const audioPath = resolvePlaylistEntryPath(track.audioPath, filePath)
      if (!audioPath) return null
      return {
        ...track,
        audioPath
      }
    })
    .filter(Boolean)
}
