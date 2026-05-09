import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAlbumCoverCandidates,
  getBestAlbumCover,
  getTrackAlbumGroupKey,
  getTrackAlbumArtist,
  getTrackAlbumName
} from '../../src/renderer/src/utils/trackUtils.js'
import {
  buildAlbumCoverBackfillPlan,
  collectAlbumCoverFromMeta
} from '../../src/renderer/src/utils/albumCoverBackfill.js'

const makeTrack = (path, album, cover = '', artist = 'Artist', albumArtist = '') => ({
  path,
  info: {
    album,
    artist,
    albumArtist,
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

test('album group keys separate unknown-artist albums by folder', () => {
  const animeTrack = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Unknown Artist')
  const gymTrack = makeTrack('D:/Music/Gym/Album A/01.flac', 'Album A', '', 'Unknown Artist')

  assert.notEqual(getTrackAlbumGroupKey(animeTrack), getTrackAlbumGroupKey(gymTrack))
})

test('album group keys prefer album artist for multi-artist albums', () => {
  const first = makeTrack('D:/Music/OST/01.flac', 'Album A', '', 'Singer A', 'Various Artists')
  const second = makeTrack('D:/Music/OST/02.flac', 'Album A', '', 'Singer B', 'Various Artists')

  assert.equal(getTrackAlbumArtist(first), 'Various Artists')
  assert.equal(getTrackAlbumGroupKey(first), getTrackAlbumGroupKey(second))
})

test('album group keys stay stable when only some tracks have album artist metadata', () => {
  const parsed = makeTrack('D:/Music/OST/01.flac', 'Album A', '', 'Singer A', 'Various Artists')
  const pending = makeTrack('D:/Music/OST/02.flac', 'Album A', '', 'Unknown Artist')

  assert.equal(getTrackAlbumGroupKey(parsed), getTrackAlbumGroupKey(pending))
})

test('album group keys keep same-folder compilation tracks together without album artist', () => {
  const first = makeTrack('D:/Music/D4DJ Cover Tracks Vol.8/01.flac', 'D4DJ Groovy Mix Cover Tracks Vol.8', '', 'Happy Around!')
  const second = makeTrack('D:/Music/D4DJ Cover Tracks Vol.8/02.flac', 'D4DJ Groovy Mix Cover Tracks Vol.8', '', 'Peaky P-key')

  assert.equal(getTrackAlbumGroupKey(first), getTrackAlbumGroupKey(second))
})

test('album group keys still separate same-name albums in different folders', () => {
  const first = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Known Artist')
  const second = makeTrack('D:/Music/Gym/Album A/01.flac', 'Album A', '', 'Known Artist')

  assert.notEqual(getTrackAlbumGroupKey(first), getTrackAlbumGroupKey(second))
})

test('album cover candidates prefer the selected album group cover over legacy album-name covers', () => {
  const tracks = [makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Unknown Artist')]
  const albumKey = getTrackAlbumGroupKey(tracks[0])

  assert.deepEqual(
    getAlbumCoverCandidates(tracks, {
      albumName: 'Album A',
      albumKey,
      albumCoverMap: {
        'Album A': 'data:image/wrong-legacy-cover',
        [albumKey]: 'data:image/right-group-cover'
      }
    }),
    ['data:image/right-group-cover']
  )
})

test('album cover backfill plan picks the next unprobed album track', () => {
  const firstTrack = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Known Artist')
  const secondTrack = makeTrack('D:/Music/Anime/Album A/02.flac', 'Album A', '', 'Known Artist')
  const albumKey = getTrackAlbumGroupKey(firstTrack)
  const plan = buildAlbumCoverBackfillPlan({
    enabled: true,
    albumGroups: [{ key: albumKey, name: 'Album A', tracks: [firstTrack, secondTrack] }],
    albumCoverProbePaths: new Set([firstTrack.path])
  })

  assert.equal(plan.targets.length, 1)
  assert.equal(plan.targets[0].track.path, secondTrack.path)
})

test('album cover backfill plan includes albums with cover but unknown artist', () => {
  const track = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Unknown Artist')
  const albumKey = getTrackAlbumGroupKey(track)
  const plan = buildAlbumCoverBackfillPlan({
    enabled: true,
    albumGroups: [
      {
        key: albumKey,
        name: 'Album A',
        artist: 'Unknown Artist',
        cover: 'data:image/existing-cover',
        tracks: [track]
      }
    ],
    albumCoverMap: {
      [albumKey]: 'data:image/existing-cover'
    },
    albumCoverProbePaths: new Set([track.path])
  })

  assert.equal(plan.targets.length, 1)
  assert.equal(plan.targets[0].needsArtist, true)
})

test('album cover backfill plan stops retrying artist after artist probe', () => {
  const track = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Unknown Artist')
  const albumKey = getTrackAlbumGroupKey(track)
  const plan = buildAlbumCoverBackfillPlan({
    enabled: true,
    albumGroups: [
      {
        key: albumKey,
        name: 'Album A',
        artist: 'Unknown Artist',
        cover: 'data:image/existing-cover',
        tracks: [track]
      }
    ],
    albumCoverMap: {
      [albumKey]: 'data:image/existing-cover'
    },
    albumArtistProbePaths: new Set([track.path])
  })

  assert.equal(plan.targets.length, 0)
})

test('album cover backfill entries use the album group key', () => {
  const track = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Unknown Artist')
  const albumKey = getTrackAlbumGroupKey(track)
  const entry = collectAlbumCoverFromMeta(
    {
      albumName: 'Album A',
      albumKey,
      track,
      coverFailed: false
    },
    {
      album: 'Album A',
      artist: 'Unknown Artist',
      cover: 'data:image/backfilled'
    }
  )

  assert.equal(entry.albumKey, albumKey)
  assert.equal(entry.cover, 'data:image/backfilled')
})

test('track album name normalizes empty metadata to Singles', () => {
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '')), 'Singles')
  assert.equal(getTrackAlbumName({ album: 'Raw Album' }), 'Raw Album')
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '1970 - Atom Heart Mother')), 'Atom Heart Mother')
})
