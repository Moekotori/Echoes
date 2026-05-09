import test from 'node:test'
import assert from 'node:assert/strict'
import { EMBEDDED_COVER_EXTRACTOR_VERSION } from '../../src/shared/embeddedCoverVersion.mjs'
import { EMBEDDED_LYRICS_EXTRACTOR_VERSION } from '../../src/shared/embeddedLyricsVersion.mjs'
import {
  buildVisibleCoverEntry,
  runVisibleCoverHydrationQueue
} from '../../src/renderer/src/utils/visibleCoverHydration.js'

function makeTrack(index) {
  return {
    path: `D:/Music/Album/${String(index).padStart(2, '0')}.flac`,
    sizeBytes: 1000 + index,
    mtimeMs: 2000 + index
  }
}

function makeMetadataForPath(path) {
  const match = String(path || '').match(/(\d+)\.flac$/)
  const index = Number(match?.[1] || 0)
  return {
    success: true,
    common: {
      title: `Title ${index}`,
      artist: `Artist ${index}`,
      album: 'Album',
      albumArtist: 'Album Artist',
      trackNo: index,
      discNo: 1,
      cover: `data:image/jpeg;base64,cover-${index}`,
      coverSource: 'embedded',
      coverExtractorVersion: EMBEDDED_COVER_EXTRACTOR_VERSION
    },
    technical: {
      duration: 180 + index,
      codec: 'FLAC',
      bitrate: 921000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2
    }
  }
}

test('visible cover hydration batches parsed apply entries as deltas', async () => {
  const coverQueue = Array.from({ length: 7 }, (_, index) => makeTrack(index + 1))
  const applyCalls = []
  const requestedOptions = []

  await runVisibleCoverHydrationQueue({
    coverQueue,
    visibleCount: 2,
    workerCount: 1,
    immediateApplyLimit: 2,
    flushBatchSize: 3,
    flushIntervalMs: 999999,
    readTrackMetaCache: async () => ({}),
    writeTrackMetaCache: () => {},
    getExtendedMetadata: async (path, options) => {
      requestedOptions.push(options)
      return makeMetadataForPath(path)
    },
    applyEntries: (entries) => {
      applyCalls.push(entries)
    }
  })

  assert.equal(applyCalls.length, 4)
  assert.deepEqual(
    applyCalls.map((entries) => Object.keys(entries)),
    [
      [coverQueue[0].path],
      [coverQueue[1].path],
      coverQueue.slice(2, 5).map((track) => track.path),
      coverQueue.slice(5, 7).map((track) => track.path)
    ]
  )
  assert.equal(Object.keys(applyCalls[2]).includes(coverQueue[0].path), false)
  assert.deepEqual(requestedOptions[0], {
    mode: 'visible-row',
    includeCover: true,
    includeTechnicalProbe: false,
    includeLyrics: false,
    includeBpm: false,
    includeMqa: false
  })
})

test('visible cover hydration force flushes remaining entries and writes all fresh cache entries', async () => {
  const coverQueue = [makeTrack(1), makeTrack(2), makeTrack(3)]
  const applyCalls = []
  const clearedPaths = []
  let writtenEntries = null

  await runVisibleCoverHydrationQueue({
    coverQueue,
    visibleCount: 0,
    workerCount: 1,
    immediateApplyLimit: 0,
    flushBatchSize: 10,
    flushIntervalMs: 999999,
    readTrackMetaCache: async () => ({}),
    writeTrackMetaCache: (entries) => {
      writtenEntries = entries
    },
    getExtendedMetadata: async (path) => {
      if (path === coverQueue[1].path) throw new Error('probe failed')
      return makeMetadataForPath(path)
    },
    applyEntries: (entries) => {
      applyCalls.push(entries)
    },
    clearInFlightPath: (path) => {
      clearedPaths.push(path)
    }
  })

  assert.equal(applyCalls.length, 1)
  assert.deepEqual(
    Object.keys(applyCalls[0]),
    coverQueue.map((track) => track.path)
  )
  assert.deepEqual(
    Object.keys(writtenEntries),
    coverQueue.map((track) => track.path)
  )
  assert.equal(writtenEntries[coverQueue[0].path].sizeBytes, coverQueue[0].sizeBytes)
  assert.equal(writtenEntries[coverQueue[0].path].mtimeMs, coverQueue[0].mtimeMs)
  assert.equal(writtenEntries[coverQueue[1].path].cover, null)
  assert.equal(writtenEntries[coverQueue[1].path].coverChecked, true)
  assert.deepEqual(
    clearedPaths,
    coverQueue.map((track) => track.path)
  )
})

test('visible cover hydration does not apply after cancellation', async () => {
  const coverQueue = [makeTrack(1), makeTrack(2)]
  const applyCalls = []
  const clearedPaths = []
  let cancelled = false

  await runVisibleCoverHydrationQueue({
    coverQueue,
    visibleCount: 2,
    workerCount: 1,
    immediateApplyLimit: 2,
    readTrackMetaCache: async () => ({}),
    writeTrackMetaCache: () => {},
    getExtendedMetadata: async (path) => {
      cancelled = true
      return makeMetadataForPath(path)
    },
    applyEntries: (entries) => {
      applyCalls.push(entries)
    },
    clearInFlightPath: (path) => {
      clearedPaths.push(path)
    },
    isCancelled: () => cancelled
  })

  assert.deepEqual(applyCalls, [])
  assert.deepEqual(clearedPaths, [coverQueue[0].path])
})

test('buildVisibleCoverEntry preserves renderer metadata fields', () => {
  const cachedMeta = {
    title: 'Cached title',
    artist: 'Cached artist',
    album: 'Cached album',
    albumArtist: 'Cached album artist',
    trackNo: 9,
    discNo: 2,
    cover: 'data:image/jpeg;base64,cached',
    coverSource: 'folder',
    coverExtractorVersion: EMBEDDED_COVER_EXTRACTOR_VERSION,
    duration: 123,
    bpmMeasured: true,
    bpm: 128
  }

  assert.deepEqual(
    buildVisibleCoverEntry(
      {
        success: true,
        common: {
          title: 'Parsed title',
          artist: 'Parsed artist',
          album: 'Parsed album',
          albumArtist: 'Parsed album artist',
          trackNo: 1,
          discNo: 1,
          cover: 'data:image/jpeg;base64,parsed',
          coverSource: 'embedded'
        },
        technical: {
          duration: 245,
          codec: 'FLAC',
          bitrate: 921000,
          sampleRate: 96000,
          bitDepth: 24,
          channels: 2,
          isMqa: true
        }
      },
      cachedMeta
    ),
    {
      title: 'Parsed title',
      artist: 'Parsed artist',
      album: 'Parsed album',
      albumArtist: 'Parsed album artist',
      trackNo: 1,
      discNo: 1,
      cover: 'data:image/jpeg;base64,parsed',
      coverScope: null,
      coverSource: 'embedded',
      coverExtractorVersion: EMBEDDED_COVER_EXTRACTOR_VERSION,
      lyricsExtractorVersion: EMBEDDED_LYRICS_EXTRACTOR_VERSION,
      duration: 245,
      coverChecked: true,
      bpmChecked: true,
      bpmMeasured: true,
      mqaChecked: true,
      codec: 'FLAC',
      bitrateKbps: 921,
      sampleRateHz: 96000,
      bitDepth: 24,
      channels: 2,
      isMqa: true,
      bpm: 128
    }
  )
})
