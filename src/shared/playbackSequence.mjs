import {
  createPlaybackContext,
  dedupePathList,
  normalizePlaybackContext
} from './playbackPersistence.mjs'

export function resolvePlaybackSequence({
  libraryPaths = [],
  currentPath = '',
  playbackContext = null
} = {}) {
  const paths = dedupePathList(libraryPaths)
  const activePath = typeof currentPath === 'string' ? currentPath : ''
  const context = normalizePlaybackContext(playbackContext)

  if (context.kind !== 'library') {
    const libraryPathSet = new Set(paths)
    const contextPaths = dedupePathList(context.trackPaths).filter((path) =>
      libraryPathSet.has(path)
    )

    if (contextPaths.length > 0 && activePath && contextPaths.includes(activePath)) {
      return {
        context,
        currentPath: activePath,
        paths: contextPaths,
        currentSeqIndex: contextPaths.indexOf(activePath)
      }
    }
  }

  const libraryContext = createPlaybackContext('library', 'library', [])
  return {
    context: libraryContext,
    currentPath: activePath,
    paths,
    currentSeqIndex: activePath ? paths.indexOf(activePath) : -1
  }
}

export function getPlaybackSequencePath(
  sequence,
  { direction = 'next', playMode = 'list', random = Math.random } = {}
) {
  const paths = Array.isArray(sequence?.paths) ? sequence.paths : []
  if (paths.length === 0) return null

  const currentPath = typeof sequence?.currentPath === 'string' ? sequence.currentPath : ''
  const currentSeqIndex = Number.isInteger(sequence?.currentSeqIndex)
    ? sequence.currentSeqIndex
    : -1
  const step = direction === 'previous' ? -1 : 1

  if (playMode === 'shuffle') {
    const randomValue = typeof random === 'function' ? Number(random()) : Math.random()
    const boundedRandom = Number.isFinite(randomValue)
      ? Math.max(0, Math.min(0.999999999999, randomValue))
      : Math.random()
    let targetPath = paths[Math.floor(boundedRandom * paths.length)]
    if (targetPath === currentPath && paths.length > 1) {
      const baseIndex = currentSeqIndex >= 0 ? currentSeqIndex : paths.indexOf(currentPath)
      targetPath = paths[((baseIndex >= 0 ? baseIndex : 0) + step + paths.length) % paths.length]
    }
    return targetPath || null
  }

  const baseIndex = currentSeqIndex >= 0 ? currentSeqIndex : 0
  return paths[(baseIndex + step + paths.length) % paths.length] || null
}
