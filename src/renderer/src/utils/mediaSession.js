const SUPPORTED_ACTIONS = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto'
]

const ARTWORK_SIZES = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']

function getMediaSession() {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return null
  return navigator.mediaSession
}

function getArtworkType(coverUrl) {
  const dataUrlMatch = coverUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);/i)
  if (dataUrlMatch) return dataUrlMatch[1].toLowerCase()
  if (/\.png(?:[?#]|$)/i.test(coverUrl)) return 'image/png'
  if (/\.webp(?:[?#]|$)/i.test(coverUrl)) return 'image/webp'
  return 'image/jpeg'
}

function buildArtwork(coverUrl) {
  if (typeof coverUrl !== 'string' || !coverUrl.trim()) return []
  const src = coverUrl.trim()
  const type = getArtworkType(src)
  return ARTWORK_SIZES.map((sizes) => ({ src, sizes, type }))
}

function setPlaybackState(session, state) {
  try {
    session.playbackState = state
  } catch {
    /* ignore */
  }
}

function setActionHandler(session, action, handler) {
  try {
    session.setActionHandler(action, typeof handler === 'function' ? handler : null)
  } catch {
    // Electron/Chromium may expose only part of the Media Session action set.
  }
}

export function clearMediaSessionHandlers() {
  const session = getMediaSession()
  if (!session) return

  for (const action of SUPPORTED_ACTIONS) {
    setActionHandler(session, action, null)
  }
}

export function clearMediaSession() {
  const session = getMediaSession()
  if (!session) return false

  clearMediaSessionHandlers()
  try {
    session.metadata = null
  } catch {
    /* ignore */
  }
  setPlaybackState(session, 'none')
  return true
}

export function installMediaSessionHandlers(handlers = {}) {
  const session = getMediaSession()
  if (!session) return false

  for (const action of SUPPORTED_ACTIONS) {
    setActionHandler(session, action, handlers[action])
  }

  return true
}

export function syncMediaSessionMetadata({ title, artist, album, coverUrl }) {
  if (typeof window === 'undefined' || typeof window.MediaMetadata !== 'function') return false
  const session = getMediaSession()
  if (!session) return false

  try {
    session.metadata = new window.MediaMetadata({
      title: title || 'ECHO',
      artist: artist || '',
      album: album || '',
      artwork: buildArtwork(coverUrl)
    })
    return true
  } catch {
    return false
  }
}

export function syncMediaSessionPlayback({ isPlaying, position, duration, playbackRate }) {
  const session = getMediaSession()
  if (!session) return false

  setPlaybackState(session, isPlaying ? 'playing' : 'paused')

  const durationSec = Number(duration)
  const positionSec = Number(position)
  const rate = Number(playbackRate)
  if (
    typeof session.setPositionState === 'function' &&
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    Number.isFinite(positionSec)
  ) {
    try {
      session.setPositionState({
        duration: durationSec,
        position: Math.max(0, Math.min(durationSec, positionSec)),
        playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1
      })
    } catch {
      /* ignore */
    }
  }

  return true
}
