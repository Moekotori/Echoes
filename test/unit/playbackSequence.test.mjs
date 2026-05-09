import test from 'node:test'
import assert from 'node:assert/strict'

import { createPlaybackContext } from '../../src/shared/playbackPersistence.mjs'
import {
  getPlaybackSequencePath,
  resolvePlaybackSequence
} from '../../src/shared/playbackSequence.mjs'

const libraryPaths = ['A', 'B', 'C', 'D']

test('user playlist next and previous stay inside playback context', () => {
  const sequence = resolvePlaybackSequence({
    libraryPaths,
    currentPath: 'B',
    playbackContext: createPlaybackContext('userPlaylist', 'playlist-1', ['B', 'D'])
  })

  assert.deepEqual(sequence.paths, ['B', 'D'])
  assert.equal(sequence.currentSeqIndex, 0)
  assert.equal(getPlaybackSequencePath(sequence, { direction: 'next' }), 'D')

  const wrapped = resolvePlaybackSequence({
    libraryPaths,
    currentPath: 'D',
    playbackContext: createPlaybackContext('userPlaylist', 'playlist-1', ['B', 'D'])
  })

  assert.equal(getPlaybackSequencePath(wrapped, { direction: 'next' }), 'B')
  assert.equal(getPlaybackSequencePath(sequence, { direction: 'previous' }), 'D')
})

test('non-library contexts filter out global library tracks', () => {
  for (const kind of ['smartCollection', 'albumGroup', 'folderGroup', 'streaming']) {
    const sequence = resolvePlaybackSequence({
      libraryPaths,
      currentPath: 'D',
      playbackContext: createPlaybackContext(kind, `${kind}-key`, ['B', 'D'])
    })

    assert.deepEqual(sequence.paths, ['B', 'D'])
    assert.equal(getPlaybackSequencePath(sequence, { direction: 'next' }), 'B')
    assert.equal(getPlaybackSequencePath(sequence, { direction: 'previous' }), 'B')
  }
})

test('context removes deleted tracks but keeps valid scoped sequence', () => {
  const sequence = resolvePlaybackSequence({
    libraryPaths: ['A', 'B', 'D'],
    currentPath: 'B',
    playbackContext: createPlaybackContext('userPlaylist', 'playlist-1', ['B', 'C', 'D'])
  })

  assert.deepEqual(sequence.paths, ['B', 'D'])
  assert.equal(getPlaybackSequencePath(sequence, { direction: 'next' }), 'D')
})

test('context falls back to library when current track is outside context', () => {
  const sequence = resolvePlaybackSequence({
    libraryPaths,
    currentPath: 'A',
    playbackContext: createPlaybackContext('userPlaylist', 'playlist-1', ['B', 'D'])
  })

  assert.equal(sequence.context.kind, 'library')
  assert.deepEqual(sequence.paths, libraryPaths)
  assert.equal(getPlaybackSequencePath(sequence, { direction: 'next' }), 'B')
})

test('shuffle picks only from the active playback context', () => {
  const sequence = resolvePlaybackSequence({
    libraryPaths,
    currentPath: 'B',
    playbackContext: createPlaybackContext('smartCollection', 'smart-1', ['B', 'D'])
  })

  assert.equal(
    getPlaybackSequencePath(sequence, {
      direction: 'next',
      playMode: 'shuffle',
      random: () => 0.99
    }),
    'D'
  )
  assert.equal(
    getPlaybackSequencePath(sequence, {
      direction: 'next',
      playMode: 'shuffle',
      random: () => 0
    }),
    'D'
  )
})
