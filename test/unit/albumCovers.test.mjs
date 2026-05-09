import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAlbumWallHydrateTargets,
  buildTrackArtworkSources,
  getAlbumCoverCandidates,
  getBestAlbumCover,
  getTrackAlbumGroupKey,
  getTrackAlbumArtist,
  isGenericAlbumFallbackName,
  getTrackAlbumName,
  resolveAlbumWallDisplayInfo
} from '../../src/renderer/src/utils/trackUtils.js'
import {
  buildVisibleTrackMetaHydrateRequirement,
  createAlbumCoverCacheKey,
  createAlbumCoverFallbackKey
} from '../../src/renderer/src/utils/trackMetaCache.js'
import {
  buildAlbumCoverCacheHydrationEntries,
  buildAlbumCoverCacheTargetIndex,
  buildAlbumCoverMapEntryFromCacheTarget,
  buildAlbumCoverBackfillPlan,
  collectAlbumCoverFromMeta,
  mergeAlbumCoverMapEntries
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

test('album wall display info prefers hydrated metadata over scanned Unknown Artist', () => {
  const tracks = [makeTrack('D:/Music/Album A/01.flac', 'Folder Album', '', 'Unknown Artist')]
  const display = resolveAlbumWallDisplayInfo(tracks, {
    trackMetaMap: {
      [tracks[0].path]: {
        album: 'Embedded Album',
        artist: 'Embedded Artist',
        cover: 'data:image/embedded'
      }
    }
  })

  assert.equal(display.name, 'Embedded Album')
  assert.equal(display.artist, 'Embedded Artist')
  assert.equal(display.cover, 'data:image/embedded')
})

test('album wall cover falls back to another track in the same album', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Known Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Known Artist')
  ]
  const display = resolveAlbumWallDisplayInfo(tracks, {
    trackMetaMap: {
      [tracks[0].path]: { album: 'Album A', artist: 'Known Artist', cover: null },
      [tracks[1].path]: { album: 'Album A', artist: 'Known Artist', cover: 'data:image/second' }
    }
  })

  assert.equal(display.cover, 'data:image/second')
})

test('track artwork sources fall back to another track in the same album', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', 'data:image/first', 'Known Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Known Artist')
  ]

  assert.deepEqual(
    buildTrackArtworkSources(tracks[1], {
      albumTracks: tracks
    }),
    ['data:image/first']
  )
})

test('track artwork sources keep current track cover before album fallback', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', 'data:image/album', 'Known Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', 'data:image/self', 'Known Artist')
  ]

  assert.deepEqual(
    buildTrackArtworkSources(tracks[1], {
      albumTracks: tracks,
      albumCoverMap: {
        [getTrackAlbumGroupKey(tracks[1])]: 'data:image/cached-album'
      }
    }),
    ['data:image/self', 'data:image/cached-album', 'data:image/album']
  )
})

test('track artwork sources use album group key cover', () => {
  const track = makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Known Artist')
  const albumKey = getTrackAlbumGroupKey(track)

  assert.deepEqual(
    buildTrackArtworkSources(track, {
      albumCoverMap: {
        [albumKey]: 'data:image/group-cover'
      },
      albumTracks: [track]
    }),
    ['data:image/group-cover']
  )
})

test('track artwork sources do not use loose album name cover', () => {
  const track = makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Known Artist')

  assert.deepEqual(
    buildTrackArtworkSources(track, {
      albumCoverMap: {
        'Album A': 'data:image/name-cover'
      },
      albumTracks: [track]
    }),
    []
  )
})

test('track artwork sources do not share same album name across folders', () => {
  const first = makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', 'data:image/anime', 'Known Artist')
  const second = makeTrack('D:/Music/Gym/Album A/01.flac', 'Album A', '', 'Known Artist')

  assert.notEqual(getTrackAlbumGroupKey(first), getTrackAlbumGroupKey(second))
  assert.deepEqual(
    buildTrackArtworkSources(second, {
      albumTracks: [first, second],
      albumCoverMap: {
        'Album A': 'data:image/loose-name'
      }
    }),
    []
  )
})

test('track artwork sources do not share generic Music albums across groups', () => {
  const first = makeTrack('D:/Music/Anime/01.flac', 'Music', 'data:image/anime', 'Known Artist')
  const second = makeTrack('D:/Music/Gym/01.flac', 'Music', '', 'Known Artist')

  assert.equal(isGenericAlbumFallbackName('Music'), true)
  assert.notEqual(getTrackAlbumGroupKey(first), getTrackAlbumGroupKey(second))
  assert.deepEqual(
    buildTrackArtworkSources(second, {
      albumTracks: [first, second],
      albumCoverMap: {
        Music: 'data:image/loose-music'
      }
    }),
    []
  )
})

test('track artwork sources do not share generic Music tracks in the same folder group', () => {
  const first = makeTrack('D:/Loose/01.flac', 'Music', 'data:image/first', 'Known Artist')
  const second = makeTrack('D:/Loose/02.flac', 'Music', '', 'Known Artist')
  const albumKey = getTrackAlbumGroupKey(second)

  assert.equal(isGenericAlbumFallbackName('Music'), true)
  assert.equal(getTrackAlbumGroupKey(first), albumKey)
  assert.deepEqual(
    buildTrackArtworkSources(second, {
      albumTracks: [first, second],
      albumCoverMap: {
        [albumKey]: 'data:image/group-cover'
      }
    }),
    []
  )
})

test('visible-row hydrate still probes own cover when album fallback is available', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', 'data:image/first', 'Known Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Known Artist')
  ]

  assert.deepEqual(
    buildVisibleTrackMetaHydrateRequirement(tracks[1], {}, {
      isLocalTrack: () => true,
      albumTracks: tracks
    }),
    {
      needsCover: true,
      needsArtist: false,
      needsAlbum: false,
      source: 'visible-row'
    }
  )
})

test('visible-row hydrate ignores generic album group artwork fallback', () => {
  const tracks = [
    makeTrack('D:/Loose/01.flac', 'Music', 'data:image/first', 'Known Artist'),
    makeTrack('D:/Loose/02.flac', 'Music', '', 'Known Artist')
  ]
  const albumKey = getTrackAlbumGroupKey(tracks[1])

  assert.deepEqual(
    buildVisibleTrackMetaHydrateRequirement(tracks[1], {}, {
      isLocalTrack: () => true,
      albumCoverMap: {
        [albumKey]: 'data:image/group-cover'
      },
      albumTracks: tracks
    }),
    {
      needsCover: true,
      needsArtist: false,
      needsAlbum: false,
      source: 'visible-row'
    }
  )
})

test('visible-row hydrate ignores loose album name artwork fallback', () => {
  const track = makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Known Artist')

  assert.deepEqual(
    buildVisibleTrackMetaHydrateRequirement(track, {}, {
      isLocalTrack: () => true,
      albumCoverMap: {
        'Album A': 'data:image/loose-name'
      },
      albumTracks: [track]
    }),
    {
      needsCover: true,
      needsArtist: false,
      needsAlbum: false,
      source: 'visible-row'
    }
  )
})

test('visible-row hydrate still parses unknown artist when album fallback is available', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', 'data:image/first', 'Known Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Unknown Artist')
  ]

  assert.deepEqual(
    buildVisibleTrackMetaHydrateRequirement(tracks[1], {}, {
      isLocalTrack: () => true,
      albumTracks: tracks
    }),
    {
      needsCover: true,
      needsArtist: true,
      needsAlbum: false,
      source: 'visible-row'
    }
  )
})

test('album wall display artist prefers albumArtist over track artist', () => {
  const tracks = [makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Track Artist')]
  const display = resolveAlbumWallDisplayInfo(tracks, {
    trackMetaMap: {
      [tracks[0].path]: {
        album: 'Album A',
        artist: 'Track Artist',
        albumArtist: 'Album Artist'
      }
    }
  })

  assert.equal(display.artist, 'Album Artist')
  assert.equal(display.cacheArtist, 'Album Artist')
})

test('album wall empty track covers do not replace album cover cache', () => {
  const tracks = [makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Known Artist')]
  const albumKey = getTrackAlbumGroupKey(tracks[0])
  const display = resolveAlbumWallDisplayInfo(tracks, {
    albumKey,
    albumCoverMap: {
      [albumKey]: 'data:image/cached-album'
    },
    trackMetaMap: {
      [tracks[0].path]: { album: 'Album A', artist: 'Known Artist', cover: null }
    }
  })

  assert.equal(display.cover, 'data:image/cached-album')
})

test('album wall replaces scanned Unknown Artist with hydrated artist', () => {
  const tracks = [makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Unknown Artist')]
  const display = resolveAlbumWallDisplayInfo(tracks, {
    trackMetaMap: {
      [tracks[0].path]: { album: 'Album A', artist: 'Real Artist' }
    }
  })

  assert.equal(display.artist, 'Real Artist')
})

test('album wall hydrate targets cap representative tracks per album', () => {
  const tracks = [
    makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Unknown Artist'),
    makeTrack('D:/Music/Album A/02.flac', 'Album A', '', 'Unknown Artist'),
    makeTrack('D:/Music/Album A/03.flac', 'Album A', '', 'Unknown Artist'),
    makeTrack('D:/Music/Album A/04.flac', 'Album A', '', 'Unknown Artist')
  ]
  const targets = buildAlbumWallHydrateTargets(tracks, {}, {}, { maxTracksPerAlbum: 2 })

  assert.equal(targets.length, 2)
  assert.deepEqual(
    targets.map((target) => target.track.path),
    ['D:/Music/Album A/01.flac', 'D:/Music/Album A/02.flac']
  )
})

test('album wall hydrate skips albums that already have metadata and cover', () => {
  const tracks = [makeTrack('D:/Music/Album A/01.flac', 'Album A', '', 'Unknown Artist')]
  const albumKey = getTrackAlbumGroupKey(tracks[0])
  const targets = buildAlbumWallHydrateTargets(
    tracks,
    {
      [tracks[0].path]: {
        album: 'Album A',
        albumArtist: 'Known Artist',
        cover: 'data:image/cover'
      }
    },
    { [albumKey]: 'data:image/cover' }
  )

  assert.equal(targets.length, 0)
})

test('album wall hydrate skips remote tracks', () => {
  const tracks = [
    makeTrack('streaming://netease/track/1', 'Album A', '', 'Unknown Artist'),
    makeTrack('webdav://server/file/song.flac', 'Album B', '', 'Unknown Artist')
  ]

  assert.equal(buildAlbumWallHydrateTargets(tracks).length, 0)
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
    ['data:image/right-group-cover', 'data:image/wrong-legacy-cover']
  )
})

test('album cover candidates fall back to album name when album key has no cached cover', () => {
  const tracks = [makeTrack('D:/Music/Anime/Album A/01.flac', 'Album A', '', 'Known Artist')]
  const albumKey = getTrackAlbumGroupKey(tracks[0])

  assert.deepEqual(
    getAlbumCoverCandidates(tracks, {
      albumName: 'Album A',
      albumKey,
      albumCoverMap: {
        'Album A': 'data:image/legacy-name-cover'
      }
    }),
    ['data:image/legacy-name-cover']
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

test('album cover backfill cache artist falls back to track artist metadata', () => {
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
      artist: 'Real Artist',
      albumArtist: '',
      cover: 'data:image/backfilled'
    }
  )

  assert.equal(entry.artist, 'Real Artist')
})

test('album cover map entries default to strict album group keys', () => {
  const merged = mergeAlbumCoverMapEntries(
    {},
    {
      'album-group-key': {
        albumKey: 'album-group-key',
        album: 'Embedded Album',
        albumName: 'Visible Album',
        displayAlbumName: 'Visible Album',
        cover: 'data:image/mapped-cover'
      }
    }
  )

  assert.equal(merged['album-group-key'], 'data:image/mapped-cover')
  assert.equal(merged['Visible Album'], undefined)
  assert.equal(merged['Embedded Album'], undefined)
})

test('album cover map entries write loose album name keys only when enabled', () => {
  const merged = mergeAlbumCoverMapEntries(
    {},
    {
      'album-group-key': {
        albumKey: 'album-group-key',
        album: 'Embedded Album',
        albumName: 'Visible Album',
        displayAlbumName: 'Visible Album',
        cover: 'data:image/mapped-cover'
      }
    },
    { includeLooseAlbumNameKeys: true }
  )

  assert.equal(merged['album-group-key'], 'data:image/mapped-cover')
  assert.equal(merged['Visible Album'], 'data:image/mapped-cover')
  assert.equal(merged['Embedded Album'], 'data:image/mapped-cover')
})

test('album cover map lets local artwork replace network artwork', () => {
  const merged = mergeAlbumCoverMapEntries(
    {
      'album-group-key': 'https://example.test/network.jpg'
    },
    {
      'album-group-key': {
        albumKey: 'album-group-key',
        album: 'Album',
        albumName: 'Album',
        displayAlbumName: 'Album',
        cover: 'data:image/jpeg;base64,local'
      }
    }
  )

  assert.equal(merged['album-group-key'], 'data:image/jpeg;base64,local')
})

test('album cover map does not let network artwork replace local artwork', () => {
  const merged = mergeAlbumCoverMapEntries(
    {
      'album-group-key': 'data:image/jpeg;base64,local'
    },
    {
      'album-group-key': {
        albumKey: 'album-group-key',
        album: 'Album',
        albumName: 'Album',
        displayAlbumName: 'Album',
        cover: 'https://example.test/network.jpg'
      }
    }
  )

  assert.equal(merged['album-group-key'], 'data:image/jpeg;base64,local')
})

test('loose album name keys skip generic album names', () => {
  const merged = mergeAlbumCoverMapEntries(
    {},
    {
      'music-group-key': {
        albumKey: 'music-group-key',
        album: 'Music',
        albumName: 'Music',
        displayAlbumName: 'Music',
        cover: 'data:image/music-cover'
      }
    },
    { includeLooseAlbumNameKeys: true }
  )

  assert.equal(merged['music-group-key'], 'data:image/music-cover')
  assert.equal(merged.Music, undefined)
})

test('album cover cache restore maps album-only fallback hits to the current album group key', () => {
  const entry = buildAlbumCoverMapEntryFromCacheTarget(
    {
      albumKey: 'current-album-group-key',
      albumName: 'Current Album Name',
      artist: ''
    },
    {
      album: 'Current Album Name',
      artist: '',
      cover: 'data:image/restored-fallback'
    }
  )
  const merged = mergeAlbumCoverMapEntries(
    {},
    { [entry.albumKey]: entry },
    { includeLooseAlbumNameKeys: true }
  )

  assert.equal(merged['current-album-group-key'], 'data:image/restored-fallback')
  assert.equal(merged['Current Album Name'], 'data:image/restored-fallback')
})

test('album cover cache restore skips ambiguous album-only fallback hits', () => {
  const fallbackKey = createAlbumCoverFallbackKey('Album A')
  const targets = [
    {
      albumKey: 'album-a-folder-1',
      albumName: 'Album A',
      artist: '',
      exactKey: '',
      fallbackKey
    },
    {
      albumKey: 'album-a-folder-2',
      albumName: 'Album A',
      artist: '',
      exactKey: '',
      fallbackKey
    }
  ]
  const { keyToTargets } = buildAlbumCoverCacheTargetIndex(targets)

  assert.deepEqual(
    buildAlbumCoverCacheHydrationEntries(
      {
        [fallbackKey]: {
          album: 'Album A',
          artist: '',
          cover: 'data:image/ambiguous'
        }
      },
      keyToTargets
    ),
    {}
  )
})

test('album cover cache restore still applies exact album keys', () => {
  const exactKey = createAlbumCoverCacheKey('Album A', 'Known Artist')
  const fallbackKey = createAlbumCoverFallbackKey('Album A')
  const target = {
    albumKey: 'album-a-folder-1',
    albumName: 'Album A',
    artist: 'Known Artist',
    exactKey,
    fallbackKey
  }
  const { keyToTargets } = buildAlbumCoverCacheTargetIndex([target])
  const entries = buildAlbumCoverCacheHydrationEntries(
    {
      [exactKey]: {
        album: 'Album A',
        artist: 'Known Artist',
        cover: 'data:image/exact'
      }
    },
    keyToTargets
  )

  assert.equal(entries[target.albumKey].cover, 'data:image/exact')
})

test('track album name normalizes empty metadata to Singles', () => {
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '')), 'Singles')
  assert.equal(getTrackAlbumName({ album: 'Raw Album' }), 'Raw Album')
  assert.equal(getTrackAlbumName(makeTrack('a.flac', '1970 - Atom Heart Mother')), 'Atom Heart Mother')
})
