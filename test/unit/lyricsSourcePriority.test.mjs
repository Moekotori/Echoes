import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getLocalLyricsSourceOrder,
  normalizeLocalLyricsPriority
} from '../../src/shared/lyricsSourcePriority.mjs'

test('normalizeLocalLyricsPriority defaults to embedded lyrics', () => {
  assert.equal(normalizeLocalLyricsPriority(), 'embedded')
  assert.equal(normalizeLocalLyricsPriority('bad-value'), 'embedded')
  assert.equal(normalizeLocalLyricsPriority('embedded'), 'embedded')
})

test('getLocalLyricsSourceOrder supports lrc-first mode', () => {
  assert.deepEqual(getLocalLyricsSourceOrder('embedded'), ['embedded', 'lrc'])
  assert.deepEqual(getLocalLyricsSourceOrder('lrc'), ['lrc', 'embedded'])
})
