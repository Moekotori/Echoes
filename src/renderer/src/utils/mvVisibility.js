export function isLyricsMvEnabled(config = {}) {
  return config?.enableMV === true
}

export function isImmersiveLyricsMvEnabled(config = {}) {
  return isLyricsMvEnabled(config) && config?.mvAsBackground === true
}

export function isSideLyricsMvEnabled(config = {}) {
  return isLyricsMvEnabled(config) && config?.mvAsBackground !== true
}

export function isMainMvBackgroundEnabled(config = {}) {
  return config?.mvAsBackgroundMain === true
}

export function shouldPreloadMvForPlayback(config = {}, { view = 'player' } = {}) {
  return view === 'player' && config?.preloadMV === true
}

export function shouldSearchMvForPlayback(config = {}, { view = 'player' } = {}) {
  return view === 'player' && (config?.autoSearchMV === true || config?.preloadMV === true)
}

export function shouldLoadMvForSurface(config = {}, { view = 'player', showLyrics = false } = {}) {
  if (view !== 'player') return false
  return showLyrics ? isLyricsMvEnabled(config) : isMainMvBackgroundEnabled(config)
}
