import { parentPort, workerData } from 'worker_threads'

async function run() {
  const { filePath, options } = workerData
  try {
    const { parseFile } = await import('music-metadata')
    const meta = await parseFile(filePath, options)
    parentPort.postMessage({ success: true, meta })
  } catch (err) {
    parentPort.postMessage({
      success: false,
      error: err?.message || String(err),
      name: err?.name || null
    })
  }
}

run()
