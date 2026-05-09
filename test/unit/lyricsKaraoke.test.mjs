import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLyricKaraokeState,
  getLyricLineProgress
} from '../../src/shared/lyricsKaraoke.mjs'

test('buildLyricKaraokeState uses enhanced word timings when available', () => {
  const state = buildLyricKaraokeState({
    line: {
      time: 10,
      text: 'hello world',
      words: [
        { time: 10, text: 'hello ' },
        { time: 10.5, text: 'world' }
      ]
    },
    nextLine: { time: 12, text: 'next' },
    positionSec: 10.25
  })

  assert.equal(state.mode, 'enhanced')
  assert.equal(state.tokens.length, 2)
  assert.equal(state.tokens[0].progress, 0.5)
  assert.equal(state.tokens[1].progress, 0)
})

test('buildLyricKaraokeState falls back to sequential text tokens', () => {
  const state = buildLyricKaraokeState({
    line: { time: 10, text: 'abcd' },
    nextLine: { time: 12, text: 'next' },
    positionSec: 10.88,
    fillRatio: 1
  })

  assert.equal(state.mode, 'plain')
  assert.deepEqual(
    state.tokens.map((token) => Math.round(token.progress * 100) / 100),
    [1, 0.76, 0, 0]
  )
})

test('getLyricLineProgress applies global lyric offset and word lead', () => {
  const progress = getLyricLineProgress({
    line: { time: 10, text: 'line' },
    nextLine: { time: 12, text: 'next' },
    positionSec: 9.9,
    offsetMs: -100,
    leadMs: 100,
    fillRatio: 1
  })
  assert.ok(Math.abs(progress - 0.05) < 1e-9)
})
