import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isLikelyInstrumentalTrack,
  pickLyricsFromLrcLibResult
} from '../../src/renderer/src/utils/lyricsCandidateRank.js'

test('detects instrumental tracks before online lyric matching', () => {
  assert.equal(isLikelyInstrumentalTrack({ title: 'Blue Planet (Instrumental)' }), true)
  assert.equal(isLikelyInstrumentalTrack({ title: '\u591c\u660e\u3051\u306e\u7eaf\u97f3\u4e50' }), true)
  assert.equal(isLikelyInstrumentalTrack({ title: 'Blue Planet', artist: 'Miku' }), false)
})

test('rejects weak automatic lyric candidates even with close duration', () => {
  const raw = pickLyricsFromLrcLibResult(
    [
      {
        trackName: 'Completely Different Song',
        artistName: 'Other Artist',
        duration: 180,
        syncedLyrics: '[00:10.00]wrong line\n[00:20.00]wrong line two\n[02:55.00]wrong end'
      }
    ],
    180,
    {
      titleCandidates: ['Blue Planet'],
      artistCandidates: ['Miku']
    }
  )

  assert.equal(raw, '')
})

test('accepts a strong title and artist lyric candidate', () => {
  const raw = pickLyricsFromLrcLibResult(
    [
      {
        trackName: 'Blue Planet',
        artistName: 'Miku',
        duration: 180,
        syncedLyrics: '[00:10.00]first line\n[00:20.00]second line\n[02:55.00]last line'
      }
    ],
    180,
    {
      titleCandidates: ['Blue Planet'],
      artistCandidates: ['Miku']
    }
  )

  assert.match(raw, /first line/)
})
