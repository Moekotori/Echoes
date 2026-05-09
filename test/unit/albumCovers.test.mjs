import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAlbumCoverCandidates,
  getBestAlbumCover,
  getTrackAlbumName
} from '../../src/renderer/src/utils/trackUtils.js'

const makeTrack = (path, album, cover = '') => ({
  path,
  info: {
    album,
    cover
  }
})

test('album cover candidates include cached, metadata, and track covers without duplicates', () => {
  const tracks = [
    makeTrack('a.flac', 'Album A', 'data:image/track-a'),
    makeTrack('b.flac', 'Album A', 'data:image/track-b')
  ]

  const candidates = getAlbumCoverCandidates(tracks, {
    albumName: 'Album A',
    albumCoverMap: {
      'Album A': 'data:image/cached'
    },
    trackMetaMap: {
      'a.flac': { cover: 'data:image/cached', coverScope: 'album' },
      'b.flac': { cover: 'data:image/meta-b', coverScope: 'album' }
    }
  })

  assert.deepEqual(candidates, [
    'data:image/cached',
    'data:image/meta-b',
    'data:image/track-a',
    'data:image/track-b'
  ])
})

test('album cover candidates skip track-scoped metadata covers', () => {
  const tracks = [
    makeTrack('single.flac', 'Album A', 'data:image/album-track'),
    makeTrack('bonus.flac', 'Album A', 'data:image/bonus')
  ]

  const candidates = getAlbumCoverCandidates(tracks, {
    albumName: 'Album A',
    trackMetaMap: {
      'single.flac': { cover: 'data:image/single-only', coverScope: 'track' }
    }
  })

  assert.deepEqual(candidates, ['data:image/album-track', 'data:image/bonus'])
})

test('album cover candidates use track-scoped metadata as a last resort', () => {
  const tracks = [makeTrack('single.flac', 'Album A', ''), makeTrack('bonus.flac', 'Album A', '')]

  const candidates = getAlbumCoverCandidates(tracks, {
    albumName: 'Album A',
    trackMetaMap: {
      'single.flac': { cover: 'data:image/single-only', coverScope: 'track' },
      'bonus.flac': { cover: 'data:image/bonus-only', coverScope: 'track' }
    }
  })

  assert.deepEqual(candidates, ['data:image/single-only', 'data:image/bonus-only'])
})

test('album cover candidates include top-level track covers', () => {
  const tracks = [
    {
      path: 'top-level.flac',
      cover: 'data:image/top-level',
      info: {
        album: 'Album A',
        cover: ''
      }
    }
  ]

  assert.deepEqual(getAlbumCoverCandidates(tracks, { albumName: 'Album A' }), ['data:image/top-level'])
})

test('best album cover falls back to another song in the same album', () => {
  const tracks = [makeTrack('missing.flac', 'Album A', ''), makeTrack('with-cover.flac', 'Album A', 'data:image/album')]

  assert.equal(getBestAlbumCover(tracks, { albumName: 'Album A' }), 'data:image/album')
})

test('track album name normalizes empty metadata to Singles', () => {
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '')), 'Singles')
  assert.equal(getTrackAlbumName({ album: 'Raw Album' }), 'Raw Album')
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '1970 - Atom Heart Mother')), 'Atom Heart Mother')
})
