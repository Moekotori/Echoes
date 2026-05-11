import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRemoteCoverThumbMetaEntry,
  cacheExternalCoverThumbForTrack
} from '../../src/renderer/src/utils/coverThumbMetadata.js'

test('metadata editor network load helper returns thumb-only cache fields', async () => {
  const calls = []
  globalThis.window = {
    api: {
      cacheExternalCoverForTrack: async (payload) => {
        calls.push(payload)
        return {
          ok: true,
          cover: 'data:image/png;base64,full-cover',
          coverKey: 'thumb-key',
          coverThumbUrl: 'file:///manual-network-thumb.jpg',
          coverThumbPath: 'D:/Cache/manual-network-thumb.jpg',
          coverSource: 'manual-network',
          coverChecked: true,
          coverThumbBytes: 123,
          coverThumbWidth: 320,
          coverThumbHeight: 320
        }
      }
    }
  }

  try {
    const entry = await cacheExternalCoverThumbForTrack(
      {
        path: 'D:/Music/manual-network.flac',
        sizeBytes: 44,
        mtimeMs: 55
      },
      'data:image/png;base64,full-cover',
      { coverSource: 'manual-network' }
    )

    assert.deepEqual(calls, [
      {
        path: 'D:/Music/manual-network.flac',
        coverDataUrl: 'data:image/png;base64,full-cover',
        coverSource: 'manual-network',
        sizeBytes: 44,
        mtimeMs: 55
      }
    ])
    assert.equal(entry.cover, undefined)
    assert.equal(entry.coverSource, 'manual-network')
    assert.equal(entry.coverThumbUrl, 'file:///manual-network-thumb.jpg')
    assert.equal(entry.coverThumbBytes, 123)
  } finally {
    delete globalThis.window
  }
})

test('metadata editor network load helper sends http artwork as coverUrl', async () => {
  const calls = []
  globalThis.window = {
    api: {
      cacheExternalCoverForTrack: async (payload) => {
        calls.push(payload)
        return {
          ok: true,
          coverKey: 'url-thumb-key',
          coverThumbUrl: 'file:///network-url-thumb.jpg',
          coverThumbPath: 'D:/Cache/network-url-thumb.jpg',
          coverSource: 'manual-network',
          coverChecked: true
        }
      }
    }
  }

  try {
    const entry = await cacheExternalCoverThumbForTrack(
      {
        path: 'D:/Music/network-url.flac',
        sizeBytes: 44,
        mtimeMs: 55
      },
      'https://example.test/cover.jpg?param=600y600',
      { coverSource: 'manual-network' }
    )

    assert.deepEqual(calls, [
      {
        path: 'D:/Music/network-url.flac',
        coverUrl: 'https://example.test/cover.jpg?param=600y600',
        coverSource: 'manual-network',
        sizeBytes: 44,
        mtimeMs: 55
      }
    ])
    assert.equal(entry.cover, undefined)
    assert.equal(entry.coverSource, 'manual-network')
    assert.equal(entry.coverThumbUrl, 'file:///network-url-thumb.jpg')
  } finally {
    delete globalThis.window
  }
})

test('metadata editor network load helper falls back to remote thumb url when cache fails', async () => {
  const calls = []
  globalThis.window = {
    api: {
      cacheExternalCoverForTrack: async (payload) => {
        calls.push(payload)
        return {
          ok: false,
          error: 'cover_fetch_failed'
        }
      }
    }
  }

  try {
    const entry = await cacheExternalCoverThumbForTrack(
      {
        path: 'D:/Music/network-url.flac',
        sizeBytes: 44,
        mtimeMs: 55
      },
      'https://example.test/cover.jpg',
      { coverSource: 'manual-network' }
    )

    assert.equal(calls.length, 1)
    assert.equal(entry.cover, undefined)
    assert.equal(entry.coverSource, 'manual-network')
    assert.equal(entry.coverThumbUrl, 'https://example.test/cover.jpg')
    assert.equal(entry.coverChecked, true)
    assert.equal(entry.sizeBytes, 44)
    assert.equal(entry.mtimeMs, 55)
  } finally {
    delete globalThis.window
  }
})

test('remote thumb fallback only accepts network urls', () => {
  assert.equal(
    buildRemoteCoverThumbMetaEntry('D:/Music/local.flac', 'data:image/png;base64,full-cover'),
    null
  )
  const entry = buildRemoteCoverThumbMetaEntry('D:/Music/remote.flac', 'https://example.test/a.jpg', {
    coverSource: 'network'
  })
  assert.equal(entry.coverThumbUrl, 'https://example.test/a.jpg')
  assert.equal(entry.cover, undefined)
})
