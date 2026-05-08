import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPlaybackClockAnchor,
  estimatePlaybackClockPosition
} from '../../../shared/playbackClock.mjs'

const PROGRESS_VISUAL_TICK_MS = 250

function formatTime(time) {
  if (Number.isNaN(time)) return '0:00'
  const safeTime = Math.max(0, Number(time) || 0)
  const min = Math.floor(safeTime / 60)
  const sec = Math.floor(safeTime % 60)
  return `${min}:${sec < 10 ? '0' : ''}${sec}`
}

function clampTime(value, duration) {
  const time = Math.max(0, Number(value) || 0)
  const limit = Number(duration)
  return Number.isFinite(limit) && limit > 0 ? Math.min(time, limit) : time
}

export default function PlayerProgressControl({
  variant = 'main',
  position = 0,
  duration = 0,
  isPlaying = false,
  playbackRate = 1,
  isDragging = false,
  disabled = false,
  unknownDuration = false,
  onSeekStart,
  onSeekChange,
  onSeekCommit
}) {
  const safeDuration = Math.max(0, Number(duration) || 0)
  const anchorRef = useRef(createPlaybackClockAnchor(position, performance.now(), {
    isPlaying,
    playbackRate
  }))
  const [livePosition, setLivePosition] = useState(() => clampTime(position, safeDuration))

  useEffect(() => {
    const nextPosition = clampTime(position, safeDuration)
    anchorRef.current = createPlaybackClockAnchor(nextPosition, performance.now(), {
      isPlaying,
      playbackRate
    })
    setLivePosition(nextPosition)
  }, [position, safeDuration, isPlaying, playbackRate])

  useEffect(() => {
    if (isDragging || disabled || !isPlaying) return undefined

    const sync = () => {
      const nextPosition = clampTime(
        estimatePlaybackClockPosition(anchorRef.current, performance.now()),
        safeDuration
      )
      setLivePosition((prev) => (Math.abs(prev - nextPosition) >= 0.05 ? nextPosition : prev))
    }

    sync()
    const timer = window.setInterval(sync, PROGRESS_VISUAL_TICK_MS)
    return () => window.clearInterval(timer)
  }, [disabled, isDragging, isPlaying, safeDuration])

  const shownPosition = isDragging ? clampTime(position, safeDuration) : livePosition
  const rangeMax = safeDuration || Math.max(shownPosition, 0)
  const seekPct = useMemo(() => {
    if (safeDuration <= 0) return '0%'
    return `${Math.min(100, Math.max(0, (shownPosition / safeDuration) * 100))}%`
  }, [safeDuration, shownPosition])

  const handleSeekStart = () => {
    onSeekStart?.(shownPosition)
  }

  const handleSeekCommit = (event) => {
    onSeekCommit?.(parseFloat(event.currentTarget.value))
  }

  const input = (
    <input
      type="range"
      className={`player-progress ${isDragging ? 'is-dragging' : ''}`}
      min={0}
      max={rangeMax}
      value={shownPosition}
      onChange={onSeekChange}
      onMouseDown={handleSeekStart}
      onMouseUp={handleSeekCommit}
      onTouchStart={handleSeekStart}
      onTouchEnd={handleSeekCommit}
      disabled={disabled}
      style={{
        padding: 0,
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : undefined,
        ['--seek-pct']: seekPct
      }}
    />
  )

  const durationLabel = unknownDuration ? '--:--' : formatTime(safeDuration)

  if (variant === 'bottom') {
    return (
      <div className="bottom-bar-progress">
        <span className="bottom-bar-time">{formatTime(shownPosition)}</span>
        {input}
        <span className="bottom-bar-time">{durationLabel}</span>
      </div>
    )
  }

  return (
    <div className="progress-area">
      {input}
      <div className="time-info">
        <span>{formatTime(shownPosition)}</span>
        <span>{durationLabel}</span>
      </div>
    </div>
  )
}
