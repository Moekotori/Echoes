import test from 'node:test'
import assert from 'node:assert/strict'

import { getActiveLyricIndex } from '../../src/shared/lyricsTimeline.mjs'

const sampleLyrics = [
  { time: 8.5, text: 'first vocal line' },
  { time: 12, text: 'second vocal line' },
  { time: 18.25, text: 'third vocal line' }
]

test('getActiveLyricIndex stays inactive during instrumental intro', () => {
  assert.equal(getActiveLyricIndex(sampleLyrics, 0), -1)
  assert.equal(getActiveLyricIndex(sampleLyrics, 8.49), -1)
})

test('getActiveLyricIndex jumps directly to the seek target line', () => {
  assert.equal(getActiveLyricIndex(sampleLyrics, 8.5), 0)
  assert.equal(getActiveLyricIndex(sampleLyrics, 14), 1)
  assert.equal(getActiveLyricIndex(sampleLyrics, 120), 2)
})

test('getActiveLyricIndex applies lyric offset in milliseconds', () => {
  assert.equal(getActiveLyricIndex(sampleLyrics, 8.6, 500), -1)
  assert.equal(getActiveLyricIndex(sampleLyrics, 9, 500), 0)
  assert.equal(getActiveLyricIndex(sampleLyrics, 8, -500), 0)
})
