import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEmbeddedCoverDataUrl,
  buildJsmediatagsPictureDataUrl,
  normalizeEmbeddedCoverMime
} from '../../src/main/utils/embeddedCover.js'

test('embedded cover mime normalizes image/jpg to image/jpeg', () => {
  assert.equal(normalizeEmbeddedCoverMime('image/jpg'), 'image/jpeg')
  assert.equal(normalizeEmbeddedCoverMime('jpg'), 'image/jpeg')
})

test('jsmediatags picture data converts to a data image URL', () => {
  const dataUrl = buildJsmediatagsPictureDataUrl({
    format: 'image/jpg',
    data: [0xff, 0xd8, 0xff, 0xd9]
  })

  assert.equal(dataUrl, 'data:image/jpeg;base64,/9j/2Q==')
})

test('empty embedded picture data returns no cover URL', () => {
  assert.equal(buildEmbeddedCoverDataUrl({ format: 'image/png', data: [] }), null)
  assert.equal(buildEmbeddedCoverDataUrl({ format: 'image/png', data: null }), null)
})
