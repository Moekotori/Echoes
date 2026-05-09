export function createPlaybackClockAnchor(positionSec, nowMs, options = {}) {
  const position = Number(positionSec)
  const atMs = Number(nowMs)
  const playbackRate = Number(options.playbackRate)

  return {
    positionSec: Number.isFinite(position) ? Math.max(0, position) : 0,
    atMs: Number.isFinite(atMs) ? atMs : 0,
    isPlaying: options.isPlaying === true,
    playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
  }
}

export function estimatePlaybackClockPosition(anchor, nowMs) {
  if (!anchor || typeof anchor !== 'object') return 0

  const position = Number(anchor.positionSec)
  const basePosition = Number.isFinite(position) ? Math.max(0, position) : 0
  if (anchor.isPlaying !== true) return basePosition

  const anchorMs = Number(anchor.atMs)
  const currentMs = Number(nowMs)
  if (!Number.isFinite(anchorMs) || !Number.isFinite(currentMs)) return basePosition

  const playbackRate = Number(anchor.playbackRate)
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
  const elapsedSec = Math.max(0, currentMs - anchorMs) / 1000

  return basePosition + elapsedSec * rate
}
