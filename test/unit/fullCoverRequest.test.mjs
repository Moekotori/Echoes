import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFullCoverRequestStats,
  requestTrackFullCover
} from '../../src/renderer/src/utils/fullCoverRequest.js'
import { mergeTrackMetaMapPreservingCovers } from '../../src/renderer/src/utils/trackMetaCache.js'
import {
  buildLightweightTrackForList,
  buildTrackCoverDebugStats,
  buildTrackArtworkSources
} from '../../src/renderer/src/utils/trackUtils.js'

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

test('current playback can request full cover from a lightweight track seed', async () => {
  const calls = []
  const fullCover = 'data:image/jpeg;base64,current-full-cover'
  const lightweightTrack = buildLightweightTrackForList(
    {
      path: 'D:/Music/current-lightweight.flac',
      sizeBytes: 2222,
      mtimeMs: 3333,
      info: {
        title: 'Current',
        cover: 'data:image/jpeg;base64,stripped',
        coverThumbUrl: 'file:///current-thumb.jpg'
      }
    },
    {
      cover: 'data:image/jpeg;base64,cache-full-cover',
      coverThumbUrl: 'file:///current-thumb.jpg'
    }
  )
  globalThis.window = {
    api: {
      getTrackFullCover: async (seed) => {
        calls.push(seed)
        return { ok: true, cover: fullCover }
      }
    }
  }

  try {
    const result = await requestTrackFullCover(lightweightTrack)

    assert.equal(lightweightTrack.cover, undefined)
    assert.equal(lightweightTrack.info.cover, undefined)
    assert.equal(result, fullCover)
    assert.deepEqual(calls, [
      {
        path: 'D:/Music/current-lightweight.flac',
        sizeBytes: 2222,
        mtimeMs: 3333
      }
    ])
  } finally {
    delete globalThis.window
  }
})

test('full cover result can merge only thumb metadata back into list cache', async () => {
  const fullCover = 'data:image/jpeg;base64,current-full-cover-with-thumb'
  const lightweightTrack = buildLightweightTrackForList({
    path: 'D:/Music/current-list-sync.flac',
    sizeBytes: 2222,
    mtimeMs: 3333,
    info: {
      title: 'Current',
      cover: 'data:image/jpeg;base64,stripped'
    }
  })
  let metaMap = {}
  globalThis.window = {
    api: {
      getTrackFullCover: async () => ({
        ok: true,
        cover: fullCover,
        coverKey: 'thumb-key',
        coverThumbUrl: 'file:///current-list-sync-thumb.jpg',
        coverThumbPath: 'D:/Cache/current-list-sync-thumb.jpg',
        coverSource: 'embedded-batch'
      })
    }
  }

  try {
    const result = await requestTrackFullCover(lightweightTrack, {
      onResult: (seed, response) => {
        metaMap = mergeTrackMetaMapPreservingCovers(metaMap, {
          [seed.path]: {
            path: seed.path,
            coverKey: response.coverKey,
            coverThumbUrl: response.coverThumbUrl,
            coverThumbPath: response.coverThumbPath,
            coverSource: response.coverSource,
            coverChecked: true
          }
        })
      }
    })
    const listTrack = buildLightweightTrackForList(lightweightTrack, metaMap[lightweightTrack.path])
    const sources = buildTrackArtworkSources(listTrack, {
      trackMetaMap: metaMap,
      allowFullCover: false
    })
    const debugStats = buildTrackCoverDebugStats([listTrack], {
      trackMetaMap: metaMap,
      includeCacheCover: true
    })

    assert.equal(result, fullCover)
    assert.equal(metaMap[lightweightTrack.path].cover, undefined)
    assert.equal(metaMap[lightweightTrack.path].coverSource, 'embedded-batch')
    assert.equal(listTrack.cover, undefined)
    assert.equal(listTrack.info.cover, undefined)
    assert.deepEqual(sources, ['file:///current-list-sync-thumb.jpg'])
    assert.equal(debugStats.listPayloadFullCoverCount, 0)
    assert.equal(debugStats.usingThumbUrl, 1)
  } finally {
    delete globalThis.window
  }
})

test('full cover in-flight callers still receive thumb metadata callback', async () => {
  const path = 'D:/Music/current-list-sync-inflight.flac'
  let resolveRequest
  const pending = new Promise((resolve) => {
    resolveRequest = resolve
  })
  const callbacks = []
  globalThis.window = {
    api: {
      getTrackFullCover: async () => {
        await pending
        return {
          ok: true,
          cover: 'data:image/jpeg;base64,inflight-full-cover',
          coverThumbUrl: 'file:///inflight-thumb.jpg',
          coverThumbPath: 'D:/Cache/inflight-thumb.jpg'
        }
      }
    }
  }

  try {
    const first = requestTrackFullCover(path)
    const second = requestTrackFullCover(path, {
      onResult: (seed, response) => callbacks.push({ seed, response })
    })
    resolveRequest()
    await Promise.all([first, second])

    assert.equal(callbacks.length, 1)
    assert.equal(callbacks[0].seed.path, path)
    assert.equal(callbacks[0].response.coverThumbUrl, 'file:///inflight-thumb.jpg')
  } finally {
    delete globalThis.window
  }
})
