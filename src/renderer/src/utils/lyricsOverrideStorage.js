const STORAGE_KEY = 'echoes_lyrics_override_v1'
const LYRICS_SOURCE_PREFERENCE_VALUES = new Set([
  'manual',
  'local',
  'lrclib',
  'netease',
  'qq',
  'kugou',
  'kuwo'
])

export function normalizeLyricsSourcePreference(value) {
  const source = String(value || '').trim().toLowerCase()
  return LYRICS_SOURCE_PREFERENCE_VALUES.has(source) ? source : ''
}

export function getLyricsOverrideForPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    const entry = map[filePath]
    if (!entry || typeof entry.raw !== 'string' || !entry.raw.trim()) return null
    return entry
  } catch {
    return null
  }
}

export function getLyricsSourcePreferenceForPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const map = JSON.parse(raw)
    return normalizeLyricsSourcePreference(map?.[filePath]?.preferredSource)
  } catch {
    return ''
  }
}

export function getLyricsInstrumentalFlagForPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const map = JSON.parse(raw)
    return map?.[filePath]?.instrumental === true
  } catch {
    return false
  }
}

export function setLyricsInstrumentalFlagForPath(filePath, instrumental) {
  if (!filePath || typeof filePath !== 'string') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const prev = map[filePath] && typeof map[filePath] === 'object' ? map[filePath] : {}
    map[filePath] = {
      ...prev,
      instrumental: instrumental === true,
      instrumentalSavedAt: Date.now()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function setLyricsSourcePreferenceForPath(filePath, source) {
  if (!filePath || typeof filePath !== 'string') return
  const preferredSource = normalizeLyricsSourcePreference(source)
  if (!preferredSource) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const prev = map[filePath] && typeof map[filePath] === 'object' ? map[filePath] : {}
    map[filePath] = {
      ...prev,
      preferredSource,
      preferenceSavedAt: Date.now()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function setLyricsOverrideForPath(filePath, rawLrcText, meta = {}) {
  if (!filePath || typeof filePath !== 'string') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const prev = map[filePath] && typeof map[filePath] === 'object' ? map[filePath] : {}
    const source = typeof meta.source === 'string' ? meta.source : ''
    const origin = typeof meta.origin === 'string' ? meta.origin : ''
    const preferredSource =
      normalizeLyricsSourcePreference(meta.preferredSource) ||
      (source === 'manual' || source === 'link'
        ? 'manual'
        : normalizeLyricsSourcePreference(source) || normalizeLyricsSourcePreference(origin))
    map[filePath] = {
      ...prev,
      raw: rawLrcText,
      savedAt: Date.now(),
      source,
      origin,
      preferredSource: preferredSource || prev.preferredSource || ''
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function clearLyricsOverrideForPath(filePath) {
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

export function remapLyricsOverrides(pathMap = {}, removedPaths = []) {
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
    /* ignore quota */
  }
}
