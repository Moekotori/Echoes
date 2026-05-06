import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
