import { useEffect, useMemo, useRef, useState } from 'react'
import { Music } from 'lucide-react'
import { requestTrackFullCover } from '../utils/fullCoverRequest'

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
    return href || ''
  }
  return value
}

export default function TrackArtwork({
  sources = [],
  isPlaying = false,
  className = '',
  fallbackSize = 17,
  observeVisibility = false,
  onVisible,
  fullCoverSeed = null,
  allowFullCoverRequest = false
}) {
  const rootRef = useRef(null)
  const onVisibleRef = useRef(onVisible)
  const fullCoverRequestKeyRef = useRef('')
  const [asyncFallbackSource, setAsyncFallbackSource] = useState('')
  const coverSources = useMemo(() => {
    const seen = new Set()
    const unique = []
    for (const source of [...sources, asyncFallbackSource]) {
      const value = normalizeArtworkSource(source)
      if (!value || seen.has(value)) continue
      seen.add(value)
      unique.push(value)
    }
    return unique
  }, [asyncFallbackSource, sources])

  const [sourceIndex, setSourceIndex] = useState(0)
  const sourceKey = coverSources.join('\u0001')
  const fullCoverSeedPath =
    typeof fullCoverSeed === 'string'
      ? fullCoverSeed.trim()
      : typeof fullCoverSeed?.path === 'string'
        ? fullCoverSeed.path.trim()
        : ''

  const requestAsyncFallback = useMemo(() => {
    return async () => {
      if (!allowFullCoverRequest || !fullCoverSeedPath) return ''
      if (fullCoverRequestKeyRef.current === fullCoverSeedPath) return ''
      fullCoverRequestKeyRef.current = fullCoverSeedPath
      const cover = await requestTrackFullCover(fullCoverSeed || fullCoverSeedPath)
      if (cover) setAsyncFallbackSource(cover)
      return cover
    }
  }, [allowFullCoverRequest, fullCoverSeed, fullCoverSeedPath])

  useEffect(() => {
    setSourceIndex(0)
  }, [sourceKey])

  useEffect(() => {
    setAsyncFallbackSource('')
    fullCoverRequestKeyRef.current = ''
  }, [fullCoverSeedPath])

  const currentSource = coverSources[sourceIndex] || ''

  useEffect(() => {
    onVisibleRef.current = onVisible
  }, [onVisible])

  useEffect(() => {
    if (!observeVisibility || typeof onVisibleRef.current !== 'function') return undefined
    const element = rootRef.current
    if (!element) return undefined
    let called = false
    const notifyVisible = () => {
      if (called) return
      called = true
      onVisibleRef.current?.()
    }
    if (typeof IntersectionObserver !== 'function') {
      const timer = window.setTimeout(notifyVisible, 0)
      return () => window.clearTimeout(timer)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          notifyVisible()
          observer.disconnect()
        }
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [observeVisibility])

  useEffect(() => {
    if (!allowFullCoverRequest || !fullCoverSeedPath) return undefined
    if (coverSources.length > 0) return undefined
    void requestAsyncFallback()
  }, [allowFullCoverRequest, coverSources.length, fullCoverSeedPath, requestAsyncFallback])

  return (
    <div
      ref={rootRef}
      className={`track-art${isPlaying ? ' track-art--playing' : ''} ${className}`.trim()}
      aria-hidden
    >
      {currentSource ? (
        <img
          src={currentSource}
          alt=""
          draggable={false}
          onError={() => {
            setSourceIndex((index) => {
              if (index + 1 < coverSources.length) return index + 1
              void requestAsyncFallback()
              return coverSources.length
            })
          }}
        />
      ) : (
        <Music size={fallbackSize} />
      )}
    </div>
  )
}
