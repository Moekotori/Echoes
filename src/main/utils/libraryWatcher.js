import fs from 'fs'
import { basename, dirname, extname, join } from 'path'
import { createCueVirtualPath, parseCueSheet } from '../../shared/cueTracks.mjs'
import {
  createLimiter,
  getLibraryScanConcurrency,
  getMetadataWorkerCount
} from './concurrency.js'

const SUPPORTED_AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  '.ncm',
  '.dsf',
  '.dff',
  '.opus',
  '.webm',
  '.wma',
  '.alac',
  '.aiff',
  '.m4b',
  '.caf'
])
const RECURSIVE_WATCH_SUPPORTED =
  typeof process !== 'undefined' && (process.platform === 'win32' || process.platform === 'darwin')
const WATCHER_STARTUP_EVENT_WARMUP_MS = 10000
const WATCHER_RESCAN_COOLDOWN_MS = 10000

function normalizeFolderPath(folderPath) {
  if (typeof folderPath !== 'string') return ''
  return folderPath.replace(/[\\/]+$/, '').trim()
}

function normalizeForCompare(itemPath) {
  return normalizeFolderPath(itemPath).replace(/\\/g, '/').toLowerCase()
}

function isPathInsideFolder(itemPath, folderPath) {
  const normalizedPath = normalizeForCompare(itemPath)
  const normalizedFolder = normalizeForCompare(folderPath)
  return (
    !!normalizedPath &&
    !!normalizedFolder &&
    (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`))
  )
}

function toAudioEntry(entryPath, stats) {
  return {
    name: basename(entryPath),
    path: entryPath,
    folder: dirname(entryPath),
    birthtimeMs: stats.birthtimeMs || stats.ctimeMs || 0,
    mtimeMs: stats.mtimeMs || 0,
    sizeBytes: stats.size || 0
  }
}

function createScanMetrics({
  reason = 'manual',
  folderCount = 0,
  existingPathsCount = 0
} = {}) {
  return {
    reason,
    folderCount,
    existingPathsCount,
    scannedDirectoryCount: 0,
    discoveredAudioCount: 0,
    startedAt: Date.now()
  }
}

function logScanSummary(metrics) {
  if (!metrics || metrics.log === false) return
  const elapsedMs = Math.max(0, Date.now() - metrics.startedAt)
  console.info(
    `[libraryWatcher] scan reason=${metrics.reason || 'manual'} folders=${Number(metrics.folderCount) || 0} existingPaths=${Number(metrics.existingPathsCount) || 0} scannedDirs=${Number(metrics.scannedDirectoryCount) || 0} discoveredAudio=${Number(metrics.discoveredAudioCount) || 0} elapsedMs=${elapsedMs}`
  )
}

async function expandAudioEntryWithEmbeddedCue(entry, stats, options = {}) {
  if (!entry?.path || extname(entry.path).toLowerCase() !== '.flac') return [entry]
  try {
    const parseFile =
      typeof options.metadataParser === 'function'
        ? options.metadataParser
        : (await import('music-metadata')).parseFile
    const metadataLimiter =
      typeof options.metadataLimiter === 'function'
        ? options.metadataLimiter
        : createLimiter(getMetadataWorkerCount())
    const metadata = await metadataLimiter(() =>
      parseFile(entry.path, { duration: true, skipCovers: true })
    )
    const nativeTags = Object.values(metadata?.native || {}).flat()
    const cueText =
      nativeTags.find((tag) => String(tag?.id || '').toUpperCase() === 'CUESHEET')?.value ||
      metadata?.common?.cuesheet ||
      ''
    const cueTracks = parseCueSheet(cueText, entry.path, metadata?.format?.duration || 0)
    if (cueTracks.length < 2) return [entry]

    return cueTracks.map((cueTrack) => ({
      ...entry,
      name: cueTrack.title || `${basename(entry.path, extname(entry.path))} #${cueTrack.trackNo}`,
      path: createCueVirtualPath(entry.path, cueTrack),
      folder: dirname(entry.path),
      birthtimeMs: stats.birthtimeMs || stats.ctimeMs || 0,
      mtimeMs: stats.mtimeMs || 0,
      sizeBytes: stats.size || 0,
      cue: {
        audioPath: entry.path,
        trackNo: cueTrack.trackNo,
        start: cueTrack.start,
        end: cueTrack.end,
        duration: cueTrack.duration
      },
      info: {
        ...(entry.info || {}),
        title: cueTrack.title || entry.info?.title,
        artist: cueTrack.artist || entry.info?.artist,
        album: cueTrack.albumTitle || entry.info?.album,
        duration: cueTrack.duration || entry.info?.duration
      }
    }))
  } catch (error) {
    console.warn(`[libraryWatcher] embedded cue parse failed ${entry.path}:`, error?.message || error)
    return [entry]
  }
}

async function collectAudioFilesFromRoots(rootPaths, out, options = {}, metrics) {
  const pending = Array.isArray(rootPaths) ? rootPaths.filter(Boolean) : []
  const maxConcurrency = Math.max(1, Number(options.scanConcurrency) || getLibraryScanConcurrency())
  const metadataLimiter =
    typeof options.metadataLimiter === 'function'
      ? options.metadataLimiter
      : createLimiter(Math.max(1, Number(options.metadataConcurrency) || getMetadataWorkerCount()))
  let cursor = 0
  let active = 0

  await new Promise((resolve) => {
    const maybeDone = () => {
      if (active === 0 && cursor >= pending.length) resolve()
    }

    const processPath = async (entryPath) => {
      try {
        const stats = await fs.promises.stat(entryPath)
        if (!stats.isDirectory()) {
          const ext = extname(entryPath).toLowerCase()
          if (SUPPORTED_AUDIO_EXTS.has(ext)) {
            const entry = toAudioEntry(entryPath, stats)
            const entries =
              options.expandEmbeddedCue === true
                ? await expandAudioEntryWithEmbeddedCue(entry, stats, {
                    ...options,
                    metadataLimiter
                  })
                : [entry]
            out.push(...entries)
            metrics.discoveredAudioCount += entries.length
          }
          return
        }

        metrics.scannedDirectoryCount += 1
        const entries = await fs.promises.readdir(entryPath, { withFileTypes: true })
        for (const entry of entries) {
          const nextPath = join(entryPath, entry.name)
          if (entry.isDirectory()) {
            pending.push(nextPath)
            continue
          }

          if (entry.isFile() && SUPPORTED_AUDIO_EXTS.has(extname(nextPath).toLowerCase())) {
            pending.push(nextPath)
          }
        }
      } catch (e) {
        console.error(`[collectAudioFilesRecursive] ${entryPath}:`, e?.message || e)
      }
    }

    const schedule = () => {
      while (active < maxConcurrency && cursor < pending.length) {
        const currentPath = pending[cursor]
        cursor += 1
        active += 1
        processPath(currentPath)
          .catch(() => {
            /* processPath handles per-path logging */
          })
          .finally(() => {
            active -= 1
            if (cursor > 1024 && cursor * 2 > pending.length) {
              pending.splice(0, cursor)
              cursor = 0
            }
            schedule()
            maybeDone()
          })
      }
      maybeDone()
    }

    schedule()
  })
}

export async function collectAudioFilesRecursive(entryPath, out, options = {}) {
  const ownsMetrics = !options.metrics
  const metrics =
    options.metrics ||
    createScanMetrics({
      reason: options.reason || 'manual',
      folderCount: 1,
      existingPathsCount: Number(options.existingPathsCount) || 0
    })
  if (options.log === false && ownsMetrics) metrics.log = false
  try {
    await collectAudioFilesFromRoots([entryPath], out, options, metrics)
  } catch (e) {
    console.error(`[collectAudioFilesRecursive] ${entryPath}:`, e?.message || e)
  } finally {
    if (ownsMetrics && options.log !== false) logScanSummary(metrics)
  }
}

function collectDirectoriesRecursive(entryPath, out, seen) {
  const normalized = normalizeFolderPath(entryPath)
  if (!normalized || seen.has(normalized)) return

  try {
    const stats = fs.statSync(normalized)
    if (!stats.isDirectory()) return
    seen.add(normalized)
    out.push(normalized)

    for (const name of fs.readdirSync(normalized)) {
      const nextPath = join(normalized, name)
      try {
        if (fs.statSync(nextPath).isDirectory()) {
          collectDirectoriesRecursive(nextPath, out, seen)
        }
      } catch (e) {
        console.warn(`[libraryWatcher] skip dir ${nextPath}:`, e?.message || e)
      }
    }
  } catch (e) {
    console.warn(`[libraryWatcher] skip root ${normalized}:`, e?.message || e)
  }
}

function collectKnownDirectoriesFromPaths(existingPaths = []) {
  const dirs = new Set()
  for (const path of Array.isArray(existingPaths) ? existingPaths : []) {
    if (typeof path !== 'string' || !path) continue
    let dir = dirname(path)
    while (dir && dir !== dirname(dir)) {
      dirs.add(normalizeFolderPath(dir))
      dir = dirname(dir)
    }
  }
  return dirs
}

function collectDirectoriesForFolders(folders) {
  const allDirectories = []
  const seenDirectories = new Set()
  for (const folder of folders) {
    collectDirectoriesRecursive(folder, allDirectories, seenDirectories)
  }
  return allDirectories
}

function resolveRecursiveWatchScanRoot(rootPath, filename) {
  const root = normalizeFolderPath(rootPath)
  if (!filename) return root
  const changedPath = normalizeFolderPath(join(root, String(filename)))
  if (!changedPath) return root
  const ext = extname(changedPath).toLowerCase()
  return SUPPORTED_AUDIO_EXTS.has(ext) ? dirname(changedPath) : changedPath
}

function collectUnknownDirectoriesForRescan(entryPath, knownDirectories, out, seen, metrics = null) {
  const normalized = normalizeFolderPath(entryPath)
  if (!normalized || seen.has(normalized)) return

  try {
    const stats = fs.statSync(normalized)
    if (!stats.isDirectory()) return
    if (metrics) metrics.scannedDirectoryCount += 1
    seen.add(normalized)

    const isKnown = knownDirectories.has(normalized)
    if (!isKnown) out.push(normalized)

    for (const name of fs.readdirSync(normalized)) {
      const nextPath = normalizeFolderPath(join(normalized, name))
      try {
        if (!fs.statSync(nextPath).isDirectory()) continue
        if (isKnown && knownDirectories.has(nextPath)) continue
        collectUnknownDirectoriesForRescan(nextPath, knownDirectories, out, seen, metrics)
      } catch (e) {
        console.warn(`[libraryWatcher] skip rescan dir ${nextPath}:`, e?.message || e)
      }
    }
  } catch (e) {
    console.warn(`[libraryWatcher] skip rescan root ${normalized}:`, e?.message || e)
  }
}

function collectUnknownDirectoriesForFolders(folders, knownDirectories, metrics = null) {
  const allDirectories = []
  const seenDirectories = new Set()
  for (const folder of folders) {
    collectUnknownDirectoriesForRescan(
      folder,
      knownDirectories,
      allDirectories,
      seenDirectories,
      metrics
    )
  }
  return allDirectories
}

function uniqueByPath(entries) {
  const seen = new Set()
  const next = []
  for (const entry of entries) {
    const path = entry?.path
    if (!path || seen.has(path)) continue
    seen.add(path)
    next.push(entry)
  }
  return next
}

function normalizeAudioEntrySeed(entry) {
  if (!entry?.path || typeof entry.path !== 'string') return null
  return {
    name: entry.name || basename(entry.path),
    path: entry.path,
    folder: entry.folder || dirname(entry.path),
    birthtimeMs: Number(entry.birthtimeMs) || 0,
    mtimeMs: Number(entry.mtimeMs) || 0,
    sizeBytes: Number(entry.sizeBytes) || 0
  }
}

function buildSnapshot(entries) {
  const map = new Map()
  for (const entry of uniqueByPath(entries)) {
    map.set(entry.path, entry)
  }
  return map
}

function buildFingerprint(entry) {
  if (!entry?.path) return ''
  const ext = extname(entry.path).toLowerCase()
  return [entry.birthtimeMs || 0, entry.sizeBytes || 0, entry.mtimeMs || 0, ext].join(':')
}

function pairRenamedEntries(removedEntries, addedEntries) {
  const renamed = []
  const removedByFingerprint = new Map()
  const addedByFingerprint = new Map()

  const pushGroup = (map, entry) => {
    const key = buildFingerprint(entry)
    if (!key) return
    const group = map.get(key)
    if (group) group.push(entry)
    else map.set(key, [entry])
  }

  removedEntries.forEach((entry) => pushGroup(removedByFingerprint, entry))
  addedEntries.forEach((entry) => pushGroup(addedByFingerprint, entry))

  for (const [fingerprint, removedGroup] of removedByFingerprint) {
    const addedGroup = addedByFingerprint.get(fingerprint)
    if (!addedGroup || removedGroup.length !== 1 || addedGroup.length !== 1) continue
    renamed.push({
      from: removedGroup[0].path,
      to: addedGroup[0].path,
      entry: addedGroup[0]
    })
  }

  if (!renamed.length) {
    return {
      renamed,
      remainingRemoved: removedEntries,
      remainingAdded: addedEntries
    }
  }

  const renamedFromSet = new Set(renamed.map((item) => item.from))
  const renamedToSet = new Set(renamed.map((item) => item.to))
  return {
    renamed,
    remainingRemoved: removedEntries.filter((entry) => !renamedFromSet.has(entry.path)),
    remainingAdded: addedEntries.filter((entry) => !renamedToSet.has(entry.path))
  }
}

function diffSnapshots(previousSnapshot, nextSnapshot) {
  const removedEntries = []
  const addedEntries = []

  for (const [path, entry] of previousSnapshot) {
    if (!nextSnapshot.has(path)) removedEntries.push(entry)
  }

  for (const [path, entry] of nextSnapshot) {
    if (!previousSnapshot.has(path)) addedEntries.push(entry)
  }

  const { renamed, remainingRemoved, remainingAdded } = pairRenamedEntries(
    removedEntries,
    addedEntries
  )

  return {
    renamed,
    removedPaths: remainingRemoved.map((entry) => entry.path),
    added: remainingAdded
  }
}

async function scanFolders(folders, options = {}) {
  const normalizedFolders = Array.isArray(folders)
    ? [...new Set(folders.map(normalizeFolderPath).filter(Boolean))]
    : []
  const metrics =
    options.metrics ||
    createScanMetrics({
      reason: options.reason || 'manual',
      folderCount: normalizedFolders.length,
      existingPathsCount: Number(options.existingPathsCount) || 0
    })
  if (options.log === false && !options.metrics) metrics.log = false
  const files = []
  try {
    await collectAudioFilesFromRoots(normalizedFolders, files, options, metrics)
    return uniqueByPath(files)
  } finally {
    if (!options.metrics && options.log !== false) logScanSummary(metrics)
  }
}

export async function rescanImportedFolders(folders, existingPaths = [], options = {}) {
  const normalizedFolders = Array.isArray(folders)
    ? [...new Set(folders.map(normalizeFolderPath).filter(Boolean))]
    : []
  const existingPathSet = new Set(
    Array.isArray(existingPaths) ? existingPaths.filter((item) => typeof item === 'string') : []
  )
  const metrics = createScanMetrics({
    reason: options.reason || 'manual',
    folderCount: normalizedFolders.length,
    existingPathsCount: existingPathSet.size
  })
  if (options.log === false) metrics.log = false
  try {
    if (existingPathSet.size > 0) {
      const knownDirectories = collectKnownDirectoriesFromPaths(existingPaths)
      const candidateDirectories = collectUnknownDirectoriesForFolders(
        normalizedFolders,
        knownDirectories,
        metrics
      )
      return (await scanFolders(candidateDirectories, { ...options, metrics, log: false })).filter(
        (entry) => !existingPathSet.has(entry.path)
      )
    }
    return (await scanFolders(normalizedFolders, { ...options, metrics, log: false })).filter(
      (entry) => !existingPathSet.has(entry.path)
    )
  } finally {
    if (options.log !== false) logScanSummary(metrics)
  }
}

export function createLibraryWatchManager({ onChange, scanFoldersImpl = scanFolders } = {}) {
  let watchedFolders = []
  let snapshot = new Map()
  let watchers = new Map()
  let debounceTimer = null
  let scanning = false
  let rescanQueued = false
  let dirtyScanRoots = new Set()
  const lastErrorRescanAtByDir = new Map()
  const lastWatcherRescanAtByDir = new Map()
  let watcherWarmupUntil = 0

  const closeAllWatchers = () => {
    for (const watcher of watchers.values()) {
      try {
        watcher.close()
      } catch {
        /* ignore */
      }
    }
    watchers = new Map()
  }

  const rebuildWatchers = (scanRoots = watchedFolders) => {
    for (const [dirPath, watcher] of watchers) {
      if (watchedFolders.some((folder) => isPathInsideFolder(dirPath, folder))) continue
      try {
        watcher.close()
      } catch {
        /* ignore */
      }
      watchers.delete(dirPath)
    }

    const watchDirectories = RECURSIVE_WATCH_SUPPORTED
      ? watchedFolders
      : collectDirectoriesForFolders(scanRoots)

    const watchDirectory = (dirPath, options = undefined) => {
      if (watchers.has(dirPath)) return
      try {
        const watcher = fs.watch(dirPath, options, (_, filename) => {
          scheduleRescan(
            options?.recursive ? resolveRecursiveWatchScanRoot(dirPath, filename) : dirPath
          )
        })
        watcher.on('error', (error) => {
          console.warn(`[libraryWatcher] ${dirPath}:`, error?.message || error)
          const now = Date.now()
          const lastAt = lastErrorRescanAtByDir.get(dirPath) || 0
          if (now - lastAt >= 1000) {
            lastErrorRescanAtByDir.set(dirPath, now)
            scheduleRescan(dirPath)
          }
        })
        watchers.set(dirPath, watcher)
      } catch (error) {
        console.warn(`[libraryWatcher] failed to watch ${dirPath}:`, error?.message || error)
        if (options?.recursive) {
          for (const fallbackDir of collectDirectoriesForFolders([dirPath])) {
            watchDirectory(fallbackDir)
          }
        }
      }
    }

    for (const dirPath of watchDirectories) {
      watchDirectory(dirPath, RECURSIVE_WATCH_SUPPORTED ? { recursive: true } : undefined)
    }
  }

  const runRescan = async () => {
    if (scanning) {
      rescanQueued = true
      return
    }

    scanning = true
    try {
      const scanRoots = [...dirtyScanRoots].filter((dirPath) =>
        watchedFolders.some((folder) => isPathInsideFolder(dirPath, folder))
      )
      dirtyScanRoots = new Set()
      if (!scanRoots.length) return

      const metrics = createScanMetrics({
        reason: 'watcher',
        folderCount: scanRoots.length,
        existingPathsCount: snapshot.size
      })
      const nextSnapshot = buildSnapshot(
        await scanFoldersImpl(scanRoots, { reason: 'watcher', metrics, log: false })
      )
      logScanSummary(metrics)
      const previousSnapshot = new Map(
        [...snapshot].filter(([path]) =>
          scanRoots.some((rootPath) => isPathInsideFolder(path, rootPath))
        )
      )
      const diff = diffSnapshots(previousSnapshot, nextSnapshot)
      for (const path of previousSnapshot.keys()) snapshot.delete(path)
      for (const [path, entry] of nextSnapshot) snapshot.set(path, entry)
      const scanCompletedAt = Date.now()
      for (const rootPath of scanRoots) {
        lastWatcherRescanAtByDir.set(rootPath, scanCompletedAt)
      }
      rebuildWatchers(scanRoots)
      if (diff.renamed.length || diff.removedPaths.length || diff.added.length) {
        onChange?.(diff)
      }
    } finally {
      scanning = false
      if (rescanQueued) {
        rescanQueued = false
        scheduleRescan()
      }
    }
  }

  const scheduleRescan = (dirPath) => {
    const normalizedDirPath = dirPath ? normalizeFolderPath(dirPath) : ''
    const now = Date.now()
    // Recursive watchers can emit an initial burst for already-known files as they attach.
    // The startup seed snapshot is authoritative for that window, so do not queue scans for it.
    if (normalizedDirPath && now < watcherWarmupUntil) return
    if (normalizedDirPath) dirtyScanRoots.add(normalizedDirPath)
    const lastScannedAt = normalizedDirPath ? lastWatcherRescanAtByDir.get(normalizedDirPath) || 0 : 0
    const cooldownDelay =
      normalizedDirPath && lastScannedAt > 0
        ? Math.max(0, WATCHER_RESCAN_COOLDOWN_MS - (now - lastScannedAt))
        : 0
    const delayMs = Math.max(350, cooldownDelay + 350)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runRescan()
    }, delayMs)
  }

  return {
    async start(folders, existingTracks = []) {
      const nextFolders = Array.isArray(folders)
        ? [...new Set(folders.map(normalizeFolderPath).filter(Boolean))]
        : []
      const seededSnapshot = buildSnapshot(
        (Array.isArray(existingTracks) ? existingTracks : [])
          .map(normalizeAudioEntrySeed)
          .filter((entry) =>
            nextFolders.some((folder) => entry?.path && isPathInsideFolder(entry.path, folder))
          )
      )
      const addedFolders = nextFolders.filter(
        (folder) => !watchedFolders.some((existing) => isPathInsideFolder(folder, existing))
      )
      watchedFolders = nextFolders
      watcherWarmupUntil = Date.now() + WATCHER_STARTUP_EVENT_WARMUP_MS
      snapshot = seededSnapshot
      for (const path of [...snapshot.keys()]) {
        if (!watchedFolders.some((folder) => isPathInsideFolder(path, folder))) {
          snapshot.delete(path)
        }
      }
      rebuildWatchers(addedFolders)
      return {
        ok: true,
        trackedFolders: watchedFolders.slice(),
        seededTracks: snapshot.size
      }
    },
    stop() {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      closeAllWatchers()
      watchedFolders = []
      snapshot = new Map()
      scanning = false
      rescanQueued = false
      dirtyScanRoots = new Set()
      return { ok: true }
    }
  }
}
