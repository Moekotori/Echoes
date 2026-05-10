import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import '../styles/virtual-album-grid.css'

const DEFAULT_MIN_CARD_WIDTH = 160
const DEFAULT_ROW_HEIGHT = 244
const DEFAULT_GAP = 18
const DEFAULT_OVERSCAN_ROWS = 3
const DEFAULT_FALLBACK_VIEWPORT_ROWS = 5
const RENDER_RANGE_IDLE_SHRINK_MS = 1600
const MAX_RENDER_ROWS = 60

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

function normalizeScrollState(value = null) {
  if (!value || typeof value !== 'object') return null
  const scrollTop = Math.max(0, Math.round(Number(value.scrollTop) || 0))
  const relativeScrollTop =
    value.relativeScrollTop == null
      ? scrollTop
      : Math.max(0, Math.round(Number(value.relativeScrollTop) || 0))
  return {
    width: Math.max(0, Math.round(Number(value.width) || 0)),
    viewportHeight: Math.max(0, Math.round(Number(value.viewportHeight) || 0)),
    scrollTop,
    relativeScrollTop,
    startIndex: Math.max(0, Math.round(Number(value.startIndex) || 0)),
    endIndex: Math.max(0, Math.round(Number(value.endIndex) || 0)),
    renderStartIndex: Math.max(0, Math.round(Number(value.renderStartIndex) || 0)),
    renderEndIndex: Math.max(0, Math.round(Number(value.renderEndIndex) || 0)),
    columnCount: Math.max(1, Math.round(Number(value.columnCount) || 1)),
    rowHeight: Math.max(0, Math.round(Number(value.rowHeight) || 0))
  }
}

function clampRowRangeAroundVisible(range, visibleRange, rowCount, maxRows = MAX_RENDER_ROWS) {
  const totalRows = Math.max(0, Number(rowCount) || 0)
  const normalizedMaxRows = Math.max(1, Math.min(totalRows || 1, Number(maxRows) || MAX_RENDER_ROWS))
  const visibleStart = Math.max(
    0,
    Math.min(totalRows, Math.floor(Number(visibleRange?.startRow) || 0))
  )
  const visibleEnd = Math.max(
    visibleStart,
    Math.min(totalRows, Math.ceil(Number(visibleRange?.endRowExclusive) || visibleStart))
  )
  let startRow = Math.max(0, Math.min(totalRows, Math.floor(Number(range?.startRow) || 0)))
  let endRowExclusive = Math.max(
    startRow,
    Math.min(totalRows, Math.ceil(Number(range?.endRowExclusive) || startRow))
  )
  if (endRowExclusive - startRow <= normalizedMaxRows) {
    return { startRow, endRowExclusive }
  }

  const visibleRows = Math.max(1, visibleEnd - visibleStart)
  if (visibleRows >= normalizedMaxRows) {
    return {
      startRow: visibleStart,
      endRowExclusive: Math.min(totalRows, visibleStart + normalizedMaxRows)
    }
  }

  const availableRows = normalizedMaxRows - visibleRows
  const beforeRows = Math.max(0, visibleStart - startRow)
  const afterRows = Math.max(0, endRowExclusive - visibleEnd)
  let keepBefore = Math.min(beforeRows, Math.floor(availableRows / 2))
  let keepAfter = Math.min(afterRows, availableRows - keepBefore)
  const remainingRows = availableRows - keepBefore - keepAfter
  if (remainingRows > 0) {
    const extraBefore = Math.min(beforeRows - keepBefore, remainingRows)
    keepBefore += extraBefore
    keepAfter += Math.min(afterRows - keepAfter, remainingRows - extraBefore)
  }

  startRow = Math.max(0, visibleStart - keepBefore)
  endRowExclusive = Math.min(totalRows, visibleEnd + keepAfter)
  return { startRow, endRowExclusive }
}

const VirtualAlbumGrid = memo(function VirtualAlbumGrid({
  items = [],
  renderItem,
  getItemKey = getAlbumItemKey,
  scrollElementRef = null,
  initialScrollTop = 0,
  scrollRestorationKey = '',
  onScrollStateChange,
  preserveMeasurements = null,
  className = '',
  minCardWidth = DEFAULT_MIN_CARD_WIDTH,
  minRowHeight = DEFAULT_ROW_HEIGHT,
  gap = DEFAULT_GAP,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
  freezeMeasurements = false,
  suppressScrollRestore = false,
  onVisibleRangeChange
}) {
  const containerRef = useRef(null)
  const rafRef = useRef(0)
  const shrinkTimerRef = useRef(0)
  const lastRangeRef = useRef(null)
  const restoredKeyRef = useRef(null)
  const wasFrozenRef = useRef(freezeMeasurements)
  const lastScrollStateRef = useRef(null)
  const preservedMetrics = normalizeScrollState(preserveMeasurements)
  const [metrics, setMetrics] = useState(() => ({
    width: preservedMetrics?.width || 0,
    viewportHeight: preservedMetrics?.viewportHeight || 0,
    scrollTop: preservedMetrics?.relativeScrollTop ?? preservedMetrics?.scrollTop ?? 0,
    absoluteScrollTop: preservedMetrics?.scrollTop ?? preservedMetrics?.relativeScrollTop ?? 0
  }))
  const [renderRange, setRenderRange] = useState(() => {
    if (!preservedMetrics?.renderEndIndex) return null
    const columnCount = Math.max(1, preservedMetrics.columnCount || 1)
    return {
      startRow: Math.floor((preservedMetrics.renderStartIndex || 0) / columnCount),
      endRowExclusive: Math.ceil((preservedMetrics.renderEndIndex || 0) / columnCount)
    }
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
  const rawVisibleStartRow = Math.max(
    0,
    Math.floor(Math.max(0, metrics.scrollTop) / Math.max(1, rowStride))
  )
  const visibleStartRow =
    rowCount > 0 ? Math.min(rowCount - 1, rawVisibleStartRow) : 0
  const rawVisibleEndRowExclusive = Math.ceil(
    (Math.max(0, metrics.scrollTop) + viewportHeight) / Math.max(1, rowStride)
  )
  const visibleEndRowExclusive =
    rowCount > 0
      ? Math.max(visibleStartRow + 1, Math.min(rowCount, rawVisibleEndRowExclusive))
      : 0
  const desiredStartRow = Math.max(
    0,
    visibleStartRow - Math.max(0, Number(overscanRows) || 0)
  )
  const desiredEndRowExclusive = Math.min(
    rowCount,
    visibleEndRowExclusive + Math.max(0, Number(overscanRows) || 0)
  )
  const startIndex = Math.min(itemCount, visibleStartRow * columnCount)
  const endIndex = Math.min(
    itemCount,
    Math.max(startIndex, visibleEndRowExclusive * columnCount)
  )
  const effectiveRenderRange = clampRowRangeAroundVisible(
    renderRange || { startRow: desiredStartRow, endRowExclusive: desiredEndRowExclusive },
    { startRow: visibleStartRow, endRowExclusive: visibleEndRowExclusive },
    rowCount
  )
  const renderStartIndex = Math.min(itemCount, effectiveRenderRange.startRow * columnCount)
  const renderEndIndex = Math.min(
    itemCount,
    Math.max(renderStartIndex, effectiveRenderRange.endRowExclusive * columnCount)
  )
  const visibleItems = useMemo(
    () => (Array.isArray(items) ? items.slice(renderStartIndex, renderEndIndex) : []),
    [items, renderEndIndex, renderStartIndex]
  )

  const measure = useCallback(() => {
    if (freezeMeasurements) return
    const container = containerRef.current
    if (!container) return
    const externalScrollElement = scrollElementRef?.current || null
    const scrollElement = externalScrollElement || container
    const containerRect = container.getBoundingClientRect()
    const scrollRect = scrollElement.getBoundingClientRect?.() || containerRect
    const relativeScrollTop = externalScrollElement
      ? Math.max(0, scrollRect.top - containerRect.top)
      : scrollElement.scrollTop || 0
    const absoluteScrollTop = externalScrollElement
      ? scrollElement.scrollTop || 0
      : relativeScrollTop
    const viewportHeight = externalScrollElement
      ? Math.max(0, scrollRect.bottom - Math.max(containerRect.top, scrollRect.top))
      : scrollElement.clientHeight || containerRect.height || 0
    const width = container.clientWidth || containerRect.width || 0

    setMetrics((prev) => {
      const next = {
        width: Math.round(width),
        viewportHeight: Math.round(viewportHeight),
        scrollTop: Math.round(relativeScrollTop),
        absoluteScrollTop: Math.round(absoluteScrollTop)
      }
      return prev.width === next.width &&
        prev.viewportHeight === next.viewportHeight &&
        prev.scrollTop === next.scrollTop &&
        prev.absoluteScrollTop === next.absoluteScrollTop
        ? prev
        : next
    })
  }, [freezeMeasurements, scrollElementRef])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      measure()
    })
  }, [measure])

  useLayoutEffect(() => {
    if (freezeMeasurements) return
    measure()
  }, [freezeMeasurements, itemCount, measure])

  useLayoutEffect(() => {
    if (freezeMeasurements || suppressScrollRestore) return
    const restoreKey = String(scrollRestorationKey || '')
    const restoreSignature = `${restoreKey}\u0001${Math.round(Number(initialScrollTop) || 0)}`
    if (!restoreKey || restoredKeyRef.current === restoreSignature) return
    restoredKeyRef.current = restoreSignature

    const container = containerRef.current
    const externalScrollElement = scrollElementRef?.current || null
    const scrollElement = externalScrollElement || container
    if (!scrollElement) return

    const nextScrollTop = Math.max(0, Number(initialScrollTop) || 0)
    scrollElement.scrollTop = nextScrollTop
    scheduleMeasure()
  }, [
    freezeMeasurements,
    initialScrollTop,
    scheduleMeasure,
    scrollElementRef,
    scrollRestorationKey,
    suppressScrollRestore
  ])

  useLayoutEffect(() => {
    const wasFrozen = wasFrozenRef.current
    wasFrozenRef.current = freezeMeasurements

    if (freezeMeasurements || suppressScrollRestore || !wasFrozen) return

    const container = containerRef.current
    const externalScrollElement = scrollElementRef?.current || null
    const scrollElement = externalScrollElement || container

    if (scrollElement) {
      scrollElement.scrollTop = Math.max(0, Number(initialScrollTop) || 0)
    }

    measure()
    scheduleMeasure()
  }, [
    freezeMeasurements,
    initialScrollTop,
    measure,
    scheduleMeasure,
    scrollElementRef,
    suppressScrollRestore
  ])

  useEffect(() => {
    if (freezeMeasurements) return undefined
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
      if (shrinkTimerRef.current) {
        window.clearTimeout(shrinkTimerRef.current)
        shrinkTimerRef.current = 0
      }
    }
  }, [freezeMeasurements, scheduleMeasure, scrollElementRef])

  useEffect(() => {
    if (freezeMeasurements) return undefined
    const desiredRange = { startRow: desiredStartRow, endRowExclusive: desiredEndRowExclusive }
    const visibleRange = { startRow: visibleStartRow, endRowExclusive: visibleEndRowExclusive }
    setRenderRange((prev) => {
      const expanded = prev
        ? {
            startRow: Math.min(prev.startRow, desiredRange.startRow),
            endRowExclusive: Math.max(prev.endRowExclusive, desiredRange.endRowExclusive)
          }
        : desiredRange
      return clampRowRangeAroundVisible(expanded, visibleRange, rowCount)
    })

    if (shrinkTimerRef.current) {
      window.clearTimeout(shrinkTimerRef.current)
      shrinkTimerRef.current = 0
    }
    shrinkTimerRef.current = window.setTimeout(() => {
      shrinkTimerRef.current = 0
      setRenderRange(clampRowRangeAroundVisible(desiredRange, visibleRange, rowCount))
    }, RENDER_RANGE_IDLE_SHRINK_MS)

    return () => {
      if (shrinkTimerRef.current) {
        window.clearTimeout(shrinkTimerRef.current)
        shrinkTimerRef.current = 0
      }
    }
  }, [
    desiredEndRowExclusive,
    desiredStartRow,
    freezeMeasurements,
    rowCount,
    visibleEndRowExclusive,
    visibleStartRow
  ])

  useEffect(() => {
    if (freezeMeasurements) return
    if (typeof onVisibleRangeChange !== 'function') return
    const nextRange = { startIndex, endIndex, columnCount, rowHeight }
    if (rangesEqual(lastRangeRef.current, nextRange)) return
    lastRangeRef.current = nextRange
    onVisibleRangeChange(nextRange)
  }, [columnCount, endIndex, freezeMeasurements, onVisibleRangeChange, rowHeight, startIndex])

  useEffect(() => {
    if (freezeMeasurements) return
    if (typeof onScrollStateChange !== 'function') return
    const nextState = {
      scrollTop: metrics.absoluteScrollTop ?? metrics.scrollTop,
      relativeScrollTop: metrics.scrollTop,
      width: metrics.width,
      viewportHeight: metrics.viewportHeight,
      startIndex,
      endIndex,
      columnCount,
      rowHeight,
      renderStartIndex,
      renderEndIndex
    }
    const previous = lastScrollStateRef.current
    if (
      previous &&
      previous.scrollTop === nextState.scrollTop &&
      previous.relativeScrollTop === nextState.relativeScrollTop &&
      previous.width === nextState.width &&
      previous.viewportHeight === nextState.viewportHeight &&
      previous.startIndex === nextState.startIndex &&
      previous.endIndex === nextState.endIndex &&
      previous.columnCount === nextState.columnCount &&
      previous.rowHeight === nextState.rowHeight &&
      previous.renderStartIndex === nextState.renderStartIndex &&
      previous.renderEndIndex === nextState.renderEndIndex
    ) {
      return
    }
    lastScrollStateRef.current = nextState
    onScrollStateChange(nextState)
  }, [
    columnCount,
    endIndex,
    freezeMeasurements,
    metrics.absoluteScrollTop,
    metrics.scrollTop,
    metrics.viewportHeight,
    metrics.width,
    onScrollStateChange,
    rowHeight,
    renderEndIndex,
    renderStartIndex,
    startIndex
  ])

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
          const absoluteIndex = renderStartIndex + offset
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
