import fs from 'fs'
import { Worker } from 'worker_threads'
import { getMetadataWorkerCount } from './concurrency.js'

const DEFAULT_METADATA_WORKER_TIMEOUT_MS = 15000
const MAX_METADATA_CACHE_ENTRIES = 4096

function normalizeTimeoutMs(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1000, Math.floor(parsed))
    : DEFAULT_METADATA_WORKER_TIMEOUT_MS
}

function normalizeText(value) {
  if (Array.isArray(value))
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(' / ')
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeTrackPart(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function buildLightweightMetadata(metadata = {}) {
  const common = metadata?.common || {}
  const format = metadata?.format || {}
  return {
    title: normalizeText(common.title),
    artist: normalizeText(common.artist || common.artists),
    album: normalizeText(common.album),
    albumArtist: normalizeText(common.albumartist || common.albumArtist),
    year: normalizeTrackPart(common.year),
    genre: normalizeText(common.genre),
    trackNo: normalizeTrackPart(common.track?.no),
    discNo: normalizeTrackPart(common.disk?.no),
    duration: normalizeNumber(format.duration),
    codec: normalizeText(format.codec),
    sampleRate: normalizeNumber(format.sampleRate),
    bitDepth: normalizeNumber(format.bitsPerSample),
    channels: normalizeNumber(format.numberOfChannels),
    lossless: format.lossless === true,
    container: normalizeText(format.container),
    bitrate: normalizeNumber(format.bitrate)
  }
}

async function buildMetadataFingerprint(filePath) {
  const stats = await fs.promises.stat(filePath)
  return {
    sizeBytes: Number(stats.size) || 0,
    mtimeMs: Number(stats.mtimeMs) || 0,
    cacheKey: `${filePath}\u0001${Number(stats.size) || 0}\u0001${Number(stats.mtimeMs) || 0}`
  }
}

function trimCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const firstKey = cache.keys().next().value
    if (firstKey === undefined) break
    cache.delete(firstKey)
  }
}

async function fallbackRead(filePath) {
  try {
    const { parseFile } = await import('music-metadata')
    const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
    return {
      success: true,
      metadata: buildLightweightMetadata(metadata),
      fallback: true
    }
  } catch (error) {
    return {
      success: false,
      metadata: null,
      error: error?.message || String(error || ''),
      fallback: true
    }
  }
}

export class MetadataWorkerPool {
  constructor({
    size = getMetadataWorkerCount(),
    timeoutMs = normalizeTimeoutMs(process.env.ECHO_METADATA_WORKER_TIMEOUT_MS)
  } = {}) {
    this.size = Math.max(1, Math.floor(Number(size) || 1))
    this.timeoutMs = timeoutMs
    this.workers = []
    this.queue = []
    this.nextTaskId = 1
    this.cache = new Map()
    this.inFlightByPath = new Map()
    this.destroyed = false
    this.unavailable = false
    this.started = false
  }

  async read(filePath) {
    const normalizedPath = String(filePath || '').trim()
    if (!normalizedPath) {
      return { success: false, metadata: null, error: 'missing_file_path' }
    }

    let fingerprint
    try {
      fingerprint = await buildMetadataFingerprint(normalizedPath)
    } catch (error) {
      return { success: false, metadata: null, error: error?.message || String(error || '') }
    }

    const cached = this.cache.get(fingerprint.cacheKey)
    if (cached) return cached

    const pending = this.inFlightByPath.get(normalizedPath)
    if (pending) return await pending

    const task = this._readWithFingerprint(normalizedPath, fingerprint)
      .then((result) => {
        const value = {
          ...result,
          sizeBytes: fingerprint.sizeBytes,
          mtimeMs: fingerprint.mtimeMs
        }
        if (value.success) {
          this.cache.set(fingerprint.cacheKey, value)
          trimCache(this.cache, MAX_METADATA_CACHE_ENTRIES)
        }
        return value
      })
      .finally(() => {
        this.inFlightByPath.delete(normalizedPath)
      })

    this.inFlightByPath.set(normalizedPath, task)
    return await task
  }

  close() {
    this.destroyed = true
    const queued = this.queue.splice(0)
    for (const task of queued) {
      task.resolve({ success: false, metadata: null, error: 'metadata_worker_pool_closed' })
    }
    for (const workerState of this.workers.splice(0)) {
      if (workerState.timer) clearTimeout(workerState.timer)
      try {
        workerState.worker.terminate().catch(() => {})
      } catch {
        /* ignore */
      }
    }
  }

  destroy() {
    this.close()
  }

  async _readWithFingerprint(filePath) {
    if (this.destroyed || this.unavailable) return await fallbackRead(filePath)
    try {
      this._ensureWorkers()
      return await this._enqueue(filePath)
    } catch (error) {
      this.unavailable = true
      console.warn('[metadataWorkerPool] falling back to main thread:', error?.message || error)
      return await fallbackRead(filePath)
    }
  }

  _ensureWorkers() {
    if (this.started || this.unavailable || this.destroyed) return
    this.started = true
    for (let i = 0; i < this.size; i += 1) {
      this._spawnWorker()
    }
    if (!this.workers.length) {
      this.unavailable = true
      throw new Error('metadata worker startup failed')
    }
  }

  _spawnWorker() {
    if (this.destroyed || this.unavailable) return null
    let worker
    try {
      worker = new Worker(new URL('./metadataWorker.js', import.meta.url), {
        type: 'module',
        execArgv: process.execArgv.filter((arg) => !String(arg).startsWith('--input-type'))
      })
    } catch (error) {
      this.unavailable = true
      throw error
    }

    const state = {
      worker,
      busy: false,
      task: null,
      timer: null,
      closed: false
    }

    worker.on('message', (message) => this._finishWorkerTask(state, message))
    worker.on('error', (error) => this._failWorker(state, error))
    worker.on('exit', (code) => {
      if (this.destroyed) return
      if (code !== 0) this._failWorker(state, new Error(`metadata worker exited with code ${code}`))
    })

    this.workers.push(state)
    return state
  }

  _enqueue(filePath) {
    return new Promise((resolve) => {
      this.queue.push({
        id: this.nextTaskId++,
        filePath,
        resolve
      })
      this._dispatch()
    })
  }

  _dispatch() {
    if (this.destroyed || this.unavailable) return
    for (const state of this.workers) {
      if (state.busy || this.queue.length === 0) continue
      const task = this.queue.shift()
      state.busy = true
      state.task = task
      state.timer = setTimeout(() => {
        this._failWorker(state, new Error('metadata worker timed out'))
      }, this.timeoutMs)
      try {
        state.worker.postMessage({ id: task.id, filePath: task.filePath })
      } catch (error) {
        this._failWorker(state, error)
      }
    }
  }

  _finishWorkerTask(state, message) {
    const task = state.task
    if (!task || message?.id !== task.id) return
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    state.busy = false
    state.task = null
    task.resolve({
      success: message?.success === true,
      metadata: message?.metadata || null,
      error: message?.success === true ? '' : message?.error || 'metadata_worker_failed'
    })
    this._dispatch()
  }

  _failWorker(state, error) {
    if (state.closed) return
    state.closed = true
    const task = state.task
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    state.busy = false
    state.task = null
    this.workers = this.workers.filter((item) => item !== state)
    try {
      state.worker.terminate().catch(() => {})
    } catch {
      /* ignore */
    }
    if (task) {
      fallbackRead(task.filePath).then(task.resolve)
    }
    if (!this.destroyed && !this.unavailable) {
      try {
        this._spawnWorker()
      } catch {
        this.unavailable = true
      }
    }
    if (!this.unavailable) this._dispatch()
    else {
      const queued = this.queue.splice(0)
      for (const queuedTask of queued) {
        fallbackRead(queuedTask.filePath).then(queuedTask.resolve)
      }
    }
    if (error) {
      console.warn('[metadataWorkerPool] worker issue:', error?.message || error)
    }
  }
}

let sharedPool = null

export function getMetadataWorkerPool() {
  if (!sharedPool || sharedPool.destroyed) {
    sharedPool = new MetadataWorkerPool()
  }
  return sharedPool
}

export function closeMetadataWorkerPool() {
  if (sharedPool) {
    sharedPool.close()
    sharedPool = null
  }
}
