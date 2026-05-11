import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFullCoverRequestStats,
  requestTrackFullCover
} from '../../src/renderer/src/utils/fullCoverRequest.js'

test('requestTrackFullCover invokes window.api.getTrackFullCover', async () => {
  const calls = []
  const cover = 'data:image/jpeg;base64,full-cover'
  globalThis.window = {
    api: {
      getTrackFullCover: async (seed) => {
        calls.push(seed)
        return { ok: true, cover }
      }
    }
  }

  try {
    const result = await requestTrackFullCover({
      path: 'D:/Music/full-cover-request.flac',
      sizeBytes: 1234,
      mtimeMs: 5678
    })

    assert.equal(result, cover)
    assert.deepEqual(calls, [
      {
        path: 'D:/Music/full-cover-request.flac',
        sizeBytes: 1234,
        mtimeMs: 5678
      }
    ])
    assert.equal(getFullCoverRequestStats().requestCount >= 1, true)
  } finally {
    delete globalThis.window
  }
})

test('requestTrackFullCover treats soft no-cover responses as empty covers', async () => {
  const calls = []
  globalThis.window = {
    api: {
      getTrackFullCover: async (seed) => {
        calls.push(seed)
        return { ok: false, cover: null }
      }
    }
  }

  try {
    const result = await requestTrackFullCover('D:/Music/no-full-cover-request.flac')

    assert.equal(result, '')
    assert.deepEqual(calls, [{ path: 'D:/Music/no-full-cover-request.flac' }])
  } finally {
    delete globalThis.window
  }
})
