import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import '../styles/virtual-album-grid.css'

const DEFAULT_MIN_CARD_WIDTH = 160
const DEFAULT_ROW_HEIGHT = 244
const DEFAULT_GAP = 18
const DEFAULT_OVERSCAN_ROWS = 3
const DEFAULT_FALLBACK_VIEWPORT_ROWS = 5

function getAlbumItemKey(album, index) {
  return (
    album?.key ||
    album?.albumKey ||
    `${album?.name || 'album'}\u0001${album?.artist || ''}\u0001${index}`
  )
}

function rangesEqual(a, b) {
  return (
    a?.startIndex === b?.startIndex &&
    a?.endIndex === b?.endIndex &&
    a?.columnCount === b?.columnCount &&
    a?.rowHeight === b?.rowHeight
  )
}

const VirtualAlbumGrid = memo(function VirtualAlbumGrid({
  items = [],
  renderItem,
  getItemKey = getAlbumItemKey,
  scrollElementRef = null,
  className = '',
  minCardWidth = DEFAULT_MIN_CARD_WIDTH,
  minRowHeight = DEFAULT_ROW_HEIGHT,
  gap = DEFAULT_GAP,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
  onVisibleRangeChange
}) {
  const containerRef = useRef(null)
  const rafRef = useRef(0)
  const lastRangeRef = useRef(null)
  const [metrics, setMetrics] = useState({
    width: 0,
    viewportHeight: 0,
    scrollTop: 0
  })

  const itemCount = Array.isArray(items) ? items.length : 0
  const normalizedGap = Math.max(0, Number(gap) || 0)
  const normalizedMinWidth = Math.max(120, Number(minCardWidth) || DEFAULT_MIN_CARD_WIDTH)
  const columnCount = Math.max(
    1,
    Math.floor((Math.max(0, metrics.width) + normalizedGap) / (normalizedMinWidth + normalizedGap))
  )
  const columnWidth =
    columnCount > 0
      ? Math.max(
          normalizedMinWidth,
          Math.floor((Math.max(0, metrics.width) - normalizedGap * (columnCount - 1)) / columnCount)
        )
      : normalizedMinWidth
  const rowHeight = Math.max(
    Number(minRowHeight) || DEFAULT_ROW_HEIGHT,
    Math.round(columnWidth + 84)
  )
  const rowStride = rowHeight + normalizedGap
  const rowCount = Math.ceil(itemCount / columnCount)
  const totalHeight = rowCount > 0 ? rowCount * rowHeight + (rowCount - 1) * normalizedGap : 0
  const viewportHeight = Math.max(
    metrics.viewportHeight,
    rowStride * DEFAULT_FALLBACK_VIEWPORT_ROWS
  )
  const startRow = Math.max(
    0,
    Math.floor(Math.max(0, metrics.scrollTop) / Math.max(1, rowStride)) -
      Math.max(0, Number(overscanRows) || 0)
  )
  const endRowExclusive = Math.min(
    rowCount,
    Math.ceil((Math.max(0, metrics.scrollTop) + viewportHeight) / Math.max(1, rowStride)) +
      Math.max(0, Number(overscanRows) || 0)
  )
  const startIndex = Math.min(itemCount, startRow * columnCount)
  const endIndex = Math.min(itemCount, Math.max(startIndex, endRowExclusive * columnCount))
  const visibleItems = useMemo(
    () => (Array.isArray(items) ? items.slice(startIndex, endIndex) : []),
    [endIndex, items, startIndex]
  )

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const externalScrollElement = scrollElementRef?.current || null
    const scrollElement = externalScrollElement || container
    const containerRect = container.getBoundingClientRect()
    const scrollRect = scrollElement.getBoundingClientRect?.() || containerRect
    const scrollTop = externalScrollElement
      ? Math.max(0, scrollRect.top - containerRect.top)
      : scrollElement.scrollTop || 0
    const viewportHeight = externalScrollElement
      ? Math.max(0, scrollRect.bottom - Math.max(containerRect.top, scrollRect.top))
      : scrollElement.clientHeight || containerRect.height || 0
    const width = container.clientWidth || containerRect.width || 0

    setMetrics((prev) => {
      const next = {
        width: Math.round(width),
        viewportHeight: Math.round(viewportHeight),
        scrollTop: Math.round(scrollTop)
      }
      return prev.width === next.width &&
        prev.viewportHeight === next.viewportHeight &&
        prev.scrollTop === next.scrollTop
        ? prev
        : next
    })
  }, [scrollElementRef])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      measure()
    })
  }, [measure])

  useLayoutEffect(() => {
    measure()
  }, [itemCount, measure])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const externalScrollElement = scrollElementRef?.current || null
    const scrollElement = externalScrollElement || container
    scrollElement.addEventListener('scroll', scheduleMeasure, { passive: true })

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure)
      resizeObserver.observe(container)
      if (externalScrollElement) resizeObserver.observe(externalScrollElement)
    } else {
      window.addEventListener('resize', scheduleMeasure)
    }

    scheduleMeasure()
    return () => {
      scrollElement.removeEventListener('scroll', scheduleMeasure)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [scheduleMeasure, scrollElementRef])

  useEffect(() => {
    if (typeof onVisibleRangeChange !== 'function') return
    const nextRange = { startIndex, endIndex, columnCount, rowHeight }
    if (rangesEqual(lastRangeRef.current, nextRange)) return
    lastRangeRef.current = nextRange
    onVisibleRangeChange(nextRange)
  }, [columnCount, endIndex, onVisibleRangeChange, rowHeight, startIndex])

  return (
    <div
      ref={containerRef}
      className={`virtual-album-grid${scrollElementRef ? ' virtual-album-grid--external-scroll' : ''}${className ? ` ${className}` : ''}`}
    >
      <div
        className="virtual-album-grid__spacer"
        style={{ height: `${totalHeight}px` }}
        aria-hidden={itemCount === 0}
      >
        {visibleItems.map((item, offset) => {
          const absoluteIndex = startIndex + offset
          const row = Math.floor(absoluteIndex / columnCount)
          const column = absoluteIndex % columnCount
          return (
            <div
              key={getItemKey(item, absoluteIndex)}
              className="virtual-album-grid__cell"
              style={{
                width: `${columnWidth}px`,
                height: `${rowHeight}px`,
                transform: `translate3d(${column * (columnWidth + normalizedGap)}px, ${row * rowStride}px, 0)`
              }}
            >
              {renderItem(item, absoluteIndex)}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default VirtualAlbumGrid
