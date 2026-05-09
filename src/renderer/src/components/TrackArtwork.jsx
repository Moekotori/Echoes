import { useEffect, useMemo, useState } from 'react'
import { Music } from 'lucide-react'

const LOCAL_ABSOLUTE_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\)/
const SUPPORTED_URL_RE = /^(?:data:image\/|https?:\/\/|file:\/\/|blob:)/i

export function normalizeArtworkSource(source) {
  const value = typeof source === 'string' ? source.trim() : ''
  if (!value) return ''
  if (SUPPORTED_URL_RE.test(value)) return value
  if (LOCAL_ABSOLUTE_PATH_RE.test(value)) {
    const href =
      typeof window !== 'undefined' && typeof window.api?.pathToFileURL === 'function'
        ? window.api.pathToFileURL(value)
        : ''
    return href || `file:///${value.replace(/\\/g, '/')}`
  }
  return value
}

export default function TrackArtwork({
  sources = [],
  isPlaying = false,
  className = '',
  fallbackSize = 17
}) {
  const coverSources = useMemo(() => {
    const seen = new Set()
    const unique = []
    for (const source of sources) {
      const value = normalizeArtworkSource(source)
      if (!value || seen.has(value)) continue
      seen.add(value)
      unique.push(value)
    }
    return unique
  }, [sources])

  const [sourceIndex, setSourceIndex] = useState(0)
  const sourceKey = coverSources.join('\u0001')

  useEffect(() => {
    setSourceIndex(0)
  }, [sourceKey])

  const currentSource = coverSources[sourceIndex] || ''

  return (
    <div className={`track-art${isPlaying ? ' track-art--playing' : ''} ${className}`.trim()} aria-hidden>
      {currentSource ? (
        <img
          src={currentSource}
          alt=""
          draggable={false}
          onError={() => {
            setSourceIndex((index) => (index + 1 < coverSources.length ? index + 1 : coverSources.length))
          }}
        />
      ) : (
        <Music size={fallbackSize} />
      )}
    </div>
  )
}
