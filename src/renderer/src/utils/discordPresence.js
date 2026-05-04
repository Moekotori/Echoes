function stripExtension(name = '') {
  return String(name || '').replace(/\.[^/.]+$/, '')
}

function cleanText(value) {
  return String(value || '').trim()
}

function normalizeRate(value) {
  const rate = Number(value)
  return Number.isFinite(rate) && rate > 0 ? rate : 1
}

function buildTimestampMs(value) {
  return Math.floor(Number(value || 0) / 1000) * 1000
}

export function buildDiscordPresenceActivity({
  track,
  title,
  artist,
  artistFallback,
  isPlaying,
  playbackRate,
  coverUrl,
  currentTime,
  duration,
  now = Date.now()
} = {}) {
  if (!track) return null

  const rate = normalizeRate(playbackRate)
  const resolvedTitle =
    cleanText(title) ||
    cleanText(track?.info?.title) ||
    stripExtension(track?.name) ||
    'Unknown Track'
  const resolvedArtist =
    cleanText(artist) || cleanText(artistFallback) || cleanText(track?.info?.artist) || 'ECHO'
  const safeCurrentTime = Math.max(0, Number(currentTime) || 0)
  const safeDuration = Math.max(0, Number(duration || track?.info?.duration) || 0)
  const activity = {
    trackId: `${track?.path || ''}`,
    title: resolvedTitle,
    artist: resolvedArtist,
    isPlaying: isPlaying === true,
    playbackRate: Math.abs(rate - 1) > 0.01 ? rate.toFixed(2) : '',
    coverUrl: cleanText(coverUrl),
    positionBucket: Math.floor(safeCurrentTime / 10)
  }

  if (activity.isPlaying) {
    activity.startTimestamp = buildTimestampMs(now - (safeCurrentTime * 1000) / rate)
    if (safeDuration > 0 && safeDuration >= safeCurrentTime) {
      activity.endTimestamp = buildTimestampMs(
        now + ((safeDuration - safeCurrentTime) * 1000) / rate
      )
    }
  }

  return activity
}

export function buildDiscordPresenceSignature(activity) {
  if (!activity) return ''
  return [
    activity.trackId || '',
    activity.title || '',
    activity.artist || '',
    activity.isPlaying ? 'playing' : 'paused',
    activity.playbackRate || '1',
    activity.coverUrl || '',
    activity.positionBucket ?? '',
    activity.startTimestamp || '',
    activity.endTimestamp || ''
  ].join('\u001f')
}
