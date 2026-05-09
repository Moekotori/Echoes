import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPlaybackClockAnchor,
  estimatePlaybackClockPosition
} from '../../src/shared/playbackClock.mjs'

test('estimatePlaybackClockPosition advances while playing', () => {
  const anchor = createPlaybackClockAnchor(12, 1000, { isPlaying: true, playbackRate: 1 })
  assert.equal(estimatePlaybackClockPosition(anchor, 1250), 12.25)
})

test('estimatePlaybackClockPosition respects playback rate', () => {
  const anchor = createPlaybackClockAnchor(20, 1000, { isPlaying: true, playbackRate: 1.5 })
  assert.equal(estimatePlaybackClockPosition(anchor, 1400), 20.6)
})

test('estimatePlaybackClockPosition stays fixed while paused', () => {
  const anchor = createPlaybackClockAnchor(33, 1000, { isPlaying: false, playbackRate: 2 })
  assert.equal(estimatePlaybackClockPosition(anchor, 2000), 33)
})
