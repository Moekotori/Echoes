import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDownloadedSourceMv } from '../../src/renderer/src/utils/mvSourceResolve.js'

test('resolves YouTube MV from downloaded source URL', () => {
  assert.deepEqual(
    resolveDownloadedSourceMv({
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }),
    { id: 'dQw4w9WgXcQ', source: 'youtube' }
  )
})

test('resolves Bilibili MV from downloaded source URL', () => {
  assert.deepEqual(
    resolveDownloadedSourceMv({
      mvOriginUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }),
    { id: 'BV1xx411c7mD', source: 'bilibili' }
  )
})

test('resolves YouTube MV from yt-dlp info json fields', () => {
  assert.deepEqual(
    resolveDownloadedSourceMv({
      extractor_key: 'Youtube',
      id: 'dQw4w9WgXcQ'
    }),
    { id: 'dQw4w9WgXcQ', source: 'youtube' }
  )
})

test('resolves Bilibili MV from yt-dlp info json fields', () => {
  assert.deepEqual(
    resolveDownloadedSourceMv({
      extractor: 'BiliBili',
      display_id: 'BV1xx411c7mD'
    }),
    { id: 'BV1xx411c7mD', source: 'bilibili' }
  )
})

test('returns null when source fields do not identify a video', () => {
  assert.equal(
    resolveDownloadedSourceMv({
      extractor: 'generic',
      id: 'not-a-video'
    }),
    null
  )
})
