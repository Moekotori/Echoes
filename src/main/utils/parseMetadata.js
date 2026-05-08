import { Worker } from 'worker_threads'

const METADATA_WORKER_TIMEOUT_MS = 20000

export function parseFileInWorker(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let worker = null

    const finish = (err, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (worker) {
        worker.removeAllListeners()
        worker.terminate().catch(() => {})
      }
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    }

    const timer = setTimeout(() => {
      finish(new Error('Metadata worker timed out'))
    }, METADATA_WORKER_TIMEOUT_MS)

    try {
      worker = new Worker(new URL('./parseMetadataWorker.js', import.meta.url), {
        type: 'module',
        workerData: { filePath, options }
      })

      worker.once('message', (msg) => {
        if (msg?.success) {
          finish(null, msg.meta)
        } else {
          const err = new Error(msg?.error || 'Metadata worker failed')
          if (msg?.name) err.name = msg.name
          finish(err)
        }
      })

      worker.once('error', (err) => {
        finish(err)
      })

      worker.once('exit', (code) => {
        if (code !== 0 && !settled) {
          finish(new Error(`Metadata worker exited with code ${code}`))
        }
      })
    } catch (err) {
      finish(err)
    }
  })
}
