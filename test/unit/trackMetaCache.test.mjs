import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAlbumCoverCacheEntries,
  createAlbumCoverCacheKey,
  createAlbumCoverFallbackKey,
  hasCachedTrackCoverRecord,
  mergeTrackMetaEntryPreservingCover,
  mergeTrackMetaMapPreservingCovers,
  shouldRefreshTrackMetaCacheForAudioQuality
} from '../../src/renderer/src/utils/trackMetaCache.js'

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

test('album cover cache entries avoid album-only fallback for known artists', () => {
  const entries = buildAlbumCoverCacheEntries([
    {
      album: 'Same Album',
      artist: 'Artist A',
      cover: 'data:image/artist-a'
    }
  ])

  assert.equal(entries[createAlbumCoverCacheKey('Same Album', 'Artist A')]?.cover, 'data:image/artist-a')
  assert.equal(entries[createAlbumCoverFallbackKey('Same Album')], undefined)
})
