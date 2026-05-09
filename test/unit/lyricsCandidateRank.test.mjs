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

test('rejects same title with unrelated artist when duration gap is large', () => {
  const raw = pickLyricsFromLrcLibResult(
    [
      {
        trackName: 'Stay',
        artistName: 'Justin Bieber',
        duration: 240,
        syncedLyrics: '[00:10.00]wrong song line\n[00:30.00]wrong song line two\n[03:55.00]wrong end'
      }
    ],
    180,
    {
      titleCandidates: ['Stay'],
      artistCandidates: ['Rihanna']
    }
  )

  assert.equal(raw, '')
})

test('still accepts a cover with same title and similar duration even when artist differs', () => {
  const raw = pickLyricsFromLrcLibResult(
    [
      {
        trackName: 'Crystalline',
        artistName: 'Cover Artist',
        duration: 305,
        syncedLyrics:
          '[00:08.00]cover first line\n[00:25.00]cover second line\n[05:00.00]cover last line'
      }
    ],
    310,
    {
      titleCandidates: ['Crystalline'],
      artistCandidates: ['Bjork']
    }
  )

  assert.match(raw, /cover first line/)
})

test('untagged artist files keep matching by title only even with duration gap', () => {
  const raw = pickLyricsFromLrcLibResult(
    [
      {
        trackName: 'Crystalline',
        artistName: 'Some Artist',
        duration: 240,
        syncedLyrics:
          '[00:10.00]title-only first line\n[00:25.00]title-only second line\n[03:55.00]title-only last line'
      }
    ],
    180,
    {
      titleCandidates: ['Crystalline'],
      artistCandidates: ['Unknown Artist']
    }
  )

  assert.match(raw, /title-only first line/)
})
