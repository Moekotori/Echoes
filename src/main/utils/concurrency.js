import os from 'os'

function normalizeConcurrency(value, fallback, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback
  return Math.min(max, Math.max(min, normalized))
}

export function getAvailableParallelism(fallback = 4) {
  try {
    const count =
      typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus()?.length
    return normalizeConcurrency(count, fallback, { min: 1 })
  } catch {
    return fallback
  }
}

export function getLibraryScanConcurrency() {
  const fallback = Math.min(8, Math.max(2, getAvailableParallelism(4)))
  return normalizeConcurrency(process.env.ECHO_LIBRARY_SCAN_CONCURRENCY, fallback, {
    min: 1,
    max: 64
  })
}

export function getMetadataWorkerCount() {
  const fallback = Math.min(4, Math.max(1, getAvailableParallelism(4) - 1))
  return normalizeConcurrency(process.env.ECHO_METADATA_WORKERS, fallback, {
    min: 1,
    max: 16
  })
}

export function getCoverConcurrency() {
  return normalizeConcurrency(process.env.ECHO_COVER_CONCURRENCY, 2, {
    min: 1,
    max: 8
  })
}

export function createLimiter(maxConcurrency = 1) {
  const concurrency = normalizeConcurrency(maxConcurrency, 1, { min: 1 })
  const queue = []
  let active = 0

  const runNext = () => {
    while (active < concurrency && queue.length > 0) {
      const task = queue.shift()
      active += 1
      Promise.resolve()
        .then(task.fn)
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1
          runNext()
        })
    }
  }

  const limit = (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      runNext()
    })

  Object.defineProperties(limit, {
    activeCount: {
      get: () => active
    },
    pendingCount: {
      get: () => queue.length
    }
  })

  return limit
}
