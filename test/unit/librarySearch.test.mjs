import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterAndRankTracksBySearch,
  getTrackSearchScore,
  normalizeLibrarySearchText
} from '../../src/renderer/src/utils/librarySearch.js'

const tracks = [
  {
    path: 'D:/Music/Other.flac',
    name: 'Other.flac',
    info: { title: 'Other', artist: 'Someone', album: 'Singles', fileName: 'Other' }
  },
  {
    path: "D:/Music/I can't wait.flac",
    name: "I can't wait.flac",
    info: {
      title: "I can't wait",
      artist: 'Akira Complex',
      album: 'ECHO',
      fileName: "I can't wait"
    }
  },
  {
    path: 'D:/Music/Waiting Room.flac',
    name: 'Waiting Room.flac',
    info: { title: 'Waiting Room', artist: 'Band', album: 'ECHO', fileName: 'Waiting Room' }
  }
]

test('normalizeLibrarySearchText ignores punctuation and apostrophes', () => {
  assert.equal(normalizeLibrarySearchText("I can't wait"), 'i can t wait')
  assert.equal(normalizeLibrarySearchText('I-can_wait'), 'i can wait')
})

test('filterAndRankTracksBySearch finds inner title words', () => {
  const result = filterAndRankTracksBySearch(tracks, 'wait')

  assert.equal(result[0].info.title, "I can't wait")
  assert.equal(result[1].info.title, 'Waiting Room')
})

test('filterAndRankTracksBySearch matches compact apostrophe-free queries', () => {
  const result = filterAndRankTracksBySearch(tracks, 'cant wait')

  assert.equal(result.length, 1)
  assert.equal(result[0].info.title, "I can't wait")
})

test('getTrackSearchScore allows small fuzzy typing mistakes', () => {
  const score = getTrackSearchScore(tracks[1], 'wate')

  assert.ok(score > 0)
})
