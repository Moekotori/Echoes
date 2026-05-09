import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAlbumCoverCacheEntries,
  buildTrackMetaCacheFingerprint,
  buildVisibleTrackMetaHydrateRequirement,
  createAlbumCoverCacheKey,
  createAlbumCoverFallbackKey,
  hasCachedTrackCoverRecord,
  isTrackMetaCacheRecordFresh,
  mergeTrackMetaEntryPreservingCover,
  mergeTrackMetaMapPreservingCovers,
  satisfiesMetadataHydrateRequirement,
  shouldRefreshTrackMetaCacheForAudioQuality,
  stripCoverFieldsFromTrackMeta,
  TRACK_META_CACHE_LIMITS
} from '../../src/renderer/src/utils/trackMetaCache.js'

test('track and album cover cache limits fit large album libraries', () => {
  assert.equal(TRACK_META_CACHE_LIMITS.maxEntries, 50000)
  assert.ok(TRACK_META_CACHE_LIMITS.maxCoverEntries >= 10000)
  assert.ok(TRACK_META_CACHE_LIMITS.maxAlbumCoverEntries >= 10000)
})

test('track meta cache fingerprint accepts unchanged file seeds', () => {
  const seed = { path: 'D:/music/song.flac', sizeBytes: 1024, mtimeMs: 12345.5 }
  const fingerprint = buildTrackMetaCacheFingerprint(seed)

  assert.deepEqual(fingerprint, {
    schemaVersion: 1,
    sizeBytes: 1024,
    mtimeMs: 12345.5
  })
  assert.equal(isTrackMetaCacheRecordFresh({ fingerprint }, seed), true)
})

test('track meta cache fingerprint rejects changed size', () => {
  const fingerprint = buildTrackMetaCacheFingerprint({
    path: 'D:/music/song.flac',
    sizeBytes: 1024,
    mtimeMs: 12345
  })

  assert.equal(
    isTrackMetaCacheRecordFresh(
      { fingerprint },
      { path: 'D:/music/song.flac', sizeBytes: 2048, mtimeMs: 12345 }
    ),
    false
  )
})

test('track meta cache fingerprint rejects changed mtime', () => {
  const fingerprint = buildTrackMetaCacheFingerprint({
    path: 'D:/music/song.flac',
    sizeBytes: 1024,
    mtimeMs: 12345
  })

  assert.equal(
    isTrackMetaCacheRecordFresh(
      { fingerprint },
      { path: 'D:/music/song.flac', sizeBytes: 1024, mtimeMs: 12346 }
    ),
    false
  )
})

test('legacy track meta cache records without fingerprint remain readable', () => {
  assert.equal(
    isTrackMetaCacheRecordFresh(
      { meta: { title: 'Legacy title' } },
      { path: 'D:/music/song.flac', sizeBytes: 1024, mtimeMs: 12345 }
    ),
    true
  )
  assert.equal(isTrackMetaCacheRecordFresh({ meta: { title: 'Path only' } }, 'D:/music/song.flac'), true)
})

test('cover trim strips only cover fields from track metadata', () => {
  const trimmed = stripCoverFieldsFromTrackMeta({
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Album Artist',
    duration: 245,
    codec: 'FLAC',
    bitrateKbps: 920,
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    trackNo: 3,
    discNo: 1,
    lyrics: '[00:00.00]Line',
    bpm: 128,
    genre: 'Pop',
    cover: 'data:image/cover',
    coverChecked: true,
    coverScope: 'track',
    coverExtractorVersion: 2,
    coverMemoryTrimmed: true
  })

  assert.deepEqual(trimmed, {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Album Artist',
    duration: 245,
    codec: 'FLAC',
    bitrateKbps: 920,
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    trackNo: 3,
    discNo: 1,
    lyrics: '[00:00.00]Line',
    bpm: 128,
    genre: 'Pop'
  })
})

test('shouldRefreshTrackMetaCacheForAudioQuality refreshes stale ALAC quality data', () => {
  assert.equal(
    shouldRefreshTrackMetaCacheForAudioQuality('D:/music/song.m4a', {
      codec: 'ALAC',
      sampleRateHz: 0,
      bitDepth: 16
    }),
    true
  )
  assert.equal(
    shouldRefreshTrackMetaCacheForAudioQuality('D:/music/song.m4a', {
      codec: 'ALAC',
      sampleRateHz: 96000,
      bitDepth: 24
    }),
    false
  )
})

test('shouldRefreshTrackMetaCacheForAudioQuality refreshes suspicious AAC data on MP3 paths', () => {
  assert.equal(
    shouldRefreshTrackMetaCacheForAudioQuality('D:/music/renamed-flac.mp3', {
      codec: 'AAC',
      sampleRateHz: 24000,
      bitrateKbps: 2213849,
      duration: 0.085
    }),
    true
  )
  assert.equal(
    shouldRefreshTrackMetaCacheForAudioQuality('D:/music/normal-mp3.mp3', {
      codec: 'MP3',
      sampleRateHz: 44100,
      bitrateKbps: 256,
      duration: 248
    }),
    false
  )
})

test('mergeTrackMetaEntryPreservingCover keeps an existing fetched cover', () => {
  const merged = mergeTrackMetaEntryPreservingCover(
    {
      title: 'Old title',
      cover: 'https://example.test/cover.jpg',
      coverChecked: true,
      coverExtractorVersion: 2
    },
    {
      title: 'Parsed title',
      artist: 'Parsed artist',
      cover: null,
      coverChecked: true
    }
  )

  assert.equal(merged.title, 'Parsed title')
  assert.equal(merged.artist, 'Parsed artist')
  assert.equal(merged.cover, 'https://example.test/cover.jpg')
  assert.equal(merged.coverChecked, true)
  assert.equal(merged.coverExtractorVersion, 2)
})

test('mergeTrackMetaEntryPreservingCover keeps fetched cover when BPM result writes back', () => {
  const merged = mergeTrackMetaEntryPreservingCover(
    {
      title: 'Song',
      artist: 'Artist',
      cover: 'https://example.test/cloud-cover.jpg',
      coverChecked: true
    },
    {
      title: 'Song',
      artist: 'Artist',
      cover: null,
      coverChecked: true,
      bpm: 128,
      bpmChecked: true,
      bpmMeasured: true,
      bpmDetectorVersion: 1
    }
  )

  assert.equal(merged.cover, 'https://example.test/cloud-cover.jpg')
  assert.equal(merged.bpm, 128)
  assert.equal(merged.bpmMeasured, true)
})

test('mergeTrackMetaMapPreservingCovers prevents stale no-cover batches from wiping covers', () => {
  const merged = mergeTrackMetaMapPreservingCovers(
    {
      'D:/music/a.flac': {
        cover: 'https://example.test/a.jpg',
        coverChecked: true
      }
    },
    {
      'D:/music/a.flac': {
        album: 'Album A',
        cover: null,
        coverChecked: true
      },
      'D:/music/b.flac': {
        album: 'Album B',
        cover: null,
        coverChecked: true
      }
    }
  )

  assert.equal(merged['D:/music/a.flac'].cover, 'https://example.test/a.jpg')
  assert.equal(merged['D:/music/a.flac'].album, 'Album A')
  assert.equal(merged['D:/music/b.flac'].cover, null)
})

test('hasCachedTrackCoverRecord accepts numeric and legacy boolean cover markers', () => {
  assert.equal(hasCachedTrackCoverRecord({ meta: { cover: 'data:image/cover' } }), true)
  assert.equal(hasCachedTrackCoverRecord({ meta: { cover: null }, hasCover: 1 }), true)
  assert.equal(hasCachedTrackCoverRecord({ meta: { cover: null }, hasCover: true }), true)
  assert.equal(hasCachedTrackCoverRecord({ meta: { cover: null }, hasCover: 0 }), false)
})

test('metadata hydrate requirement rejects incomplete cached metadata', () => {
  const requirement = {
    needsCover: true,
    needsArtist: true,
    needsAlbum: true
  }

  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: 'Album A',
        artist: 'Known Artist',
        cover: 'data:image/cover'
      },
      requirement
    ),
    true
  )
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: 'Album A',
        artist: 'Known Artist',
        cover: null
      },
      requirement
    ),
    false
  )
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: 'Album A',
        artist: 'Unknown Artist',
        cover: 'data:image/cover'
      },
      requirement
    ),
    false
  )
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: '',
        albumArtist: 'Known Artist',
        cover: 'data:image/cover'
      },
      requirement
    ),
    false
  )
})

test('metadata hydrate requirement only checks requested fields', () => {
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: '',
        artist: 'Unknown Artist',
        cover: null
      },
      { needsCover: false, needsArtist: false, needsAlbum: false }
    ),
    true
  )
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        album: '',
        albumArtist: 'Unknown Artist',
        artist: 'Known Artist',
        cover: null
      },
      { needsArtist: true }
    ),
    true
  )
})

test('visible-row hydrate requirement rejects cached metadata missing requested cover', () => {
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        artist: 'Known Artist',
        cover: null
      },
      { needsCover: true, needsArtist: false, needsAlbum: false, source: 'visible-row' }
    ),
    false
  )
})

test('visible-row hydrate requirement rejects cached Unknown Artist metadata', () => {
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        artist: 'Unknown Artist',
        albumArtist: '',
        cover: 'data:image/cover'
      },
      { needsCover: false, needsArtist: true, needsAlbum: false, source: 'visible-row' }
    ),
    false
  )
})

test('visible-row hydrate requirement accepts cached cover and useful artist', () => {
  assert.equal(
    satisfiesMetadataHydrateRequirement(
      {
        artist: 'Known Artist',
        cover: 'data:image/cover'
      },
      { needsCover: true, needsArtist: true, needsAlbum: false, source: 'visible-row' }
    ),
    true
  )
})

test('visible-row hydrate requirement is only created for missing displayed fields', () => {
  const track = {
    path: 'D:/Music/Album/01.flac',
    info: {
      artist: 'Unknown Artist',
      cover: ''
    }
  }
  const requirement = buildVisibleTrackMetaHydrateRequirement(track, {}, {
    isLocalTrack: () => true
  })

  assert.deepEqual(requirement, {
    needsCover: true,
    needsArtist: true,
    needsAlbum: false,
    source: 'visible-row'
  })

  assert.equal(
    buildVisibleTrackMetaHydrateRequirement(
      track,
      { artist: 'Known Artist', cover: 'data:image/cover' },
      { isLocalTrack: () => true }
    ),
    null
  )
})

test('visible-row hydrate requirement respects local-track and probe guards', () => {
  const track = {
    path: 'streaming://netease/track/1',
    info: {
      artist: 'Unknown Artist',
      cover: ''
    }
  }

  assert.equal(
    buildVisibleTrackMetaHydrateRequirement(track, {}, { isLocalTrack: () => false }),
    null
  )

  const coverProbePaths = new Set(['D:/Music/Album/01.flac'])
  const artistProbePaths = new Set(['D:/Music/Album/01.flac'])
  assert.equal(
    buildVisibleTrackMetaHydrateRequirement(
      {
        ...track,
        path: 'D:/Music/Album/01.flac'
      },
      {},
      {
        isLocalTrack: () => true,
        coverProbePaths,
        artistProbePaths
      }
    ),
    null
  )
})

test('album cover cache entries write exact and album-only fallback keys', () => {
  const entries = buildAlbumCoverCacheEntries([
    {
      album: 'Same Album',
      artist: 'Artist A',
      cover: 'data:image/artist-a'
    }
  ])

  assert.equal(entries[createAlbumCoverCacheKey('Same Album', 'Artist A')]?.cover, 'data:image/artist-a')
  assert.equal(entries[createAlbumCoverFallbackKey('Same Album')]?.cover, 'data:image/artist-a')
})
