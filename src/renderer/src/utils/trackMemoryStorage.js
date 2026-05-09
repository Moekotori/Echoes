/**
 * Per-audio-file MV override (Bilibili / YouTube id), persisted in localStorage.
 * Keyed by absolute file path (same as lyrics override).
 */
const STORAGE_KEY = 'echoes_mv_override_v1'
const VALID_ORIGINS = new Set(['manual', 'auto', 'source'])

function normalizeMvOverrideEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) return null
  const source = entry.source
  if (source !== 'bilibili' && source !== 'youtube') return null
  const origin =
    typeof entry.origin === 'string' && VALID_ORIGINS.has(entry.origin)
      ? entry.origin
      : 'manual'
  return {
    id: entry.id.trim(),
    source,
    title: typeof entry.title === 'string' ? entry.title : '',
    author: typeof entry.author === 'string' ? entry.author : '',
    origin,
    savedAt: entry.savedAt
  }
}

export function getMvOverrideForPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    return normalizeMvOverrideEntry(map[filePath])
  } catch {
    return null
  }
}

export function setMvOverrideForPath(
  filePath,
  { id, source, title = '', author = '', origin = 'manual' }
) {
  if (!filePath || typeof filePath !== 'string') return
  if (!id || typeof id !== 'string') return
  if (source !== 'bilibili' && source !== 'youtube') return
  const normalizedOrigin = VALID_ORIGINS.has(origin) ? origin : 'manual'
  try {
    const prev = localStorage.getItem(STORAGE_KEY)
    const map = prev ? JSON.parse(prev) : {}
    map[filePath] = {
      id: id.trim(),
      source,
      title: String(title || '').trim(),
      author: String(author || '').trim(),
      origin: normalizedOrigin,
      savedAt: Date.now()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

export function clearMvOverrideForPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const map = JSON.parse(raw)
    delete map[filePath]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function remapMvOverrides(pathMap = {}, removedPaths = []) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const map = JSON.parse(raw)
    let changed = false

    for (const [fromPath, toPath] of Object.entries(pathMap || {})) {
      if (!fromPath || !toPath || fromPath === toPath || !map[fromPath]) continue
      if (!map[toPath]) {
        map[toPath] = map[fromPath]
      }
      delete map[fromPath]
      changed = true
    }

    for (const removedPath of removedPaths || []) {
      if (!removedPath || !map[removedPath]) continue
      delete map[removedPath]
      changed = true
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    }
  } catch {
    /* ignore */
  }
}
