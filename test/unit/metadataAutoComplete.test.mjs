import test from 'node:test'
import assert from 'node:assert/strict'

import {
  METADATA_AUTO_COMPLETE_VERSION,
  buildEmbeddedMetadataAutoCompleteEntry,
  buildFailedEmbeddedMetadataAutoCompleteEntry,
  buildMetadataAutoCompleteTargets,
  buildNetworkMetadataAutoCompleteEntry,
  shouldSkipEmbeddedMetadataAutoComplete,
  shouldRunNetworkMetadataAutoComplete
} from '../../src/renderer/src/utils/metadataAutoComplete.js'

test('metadata auto-complete targets unknown artist or missing cover tracks', () => {
  const tracks = [
    { path: 'D:/Music/a.flac', info: { artist: 'Unknown Artist' } },
    { path: 'D:/Music/b.flac', info: { artist: 'Aimer', cover: 'data:image/png;base64,abc' } },
    { path: 'D:/Music/c.flac', info: { artist: 'Aimer' } }
  ]
  const trackMetaMap = {
    'D:/Music/b.flac': {
      metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
      metadataAutoCompleteEmbeddedChecked: true,
      title: 'Complete Title',
      artist: 'Aimer',
      album: 'Complete Album',
      cover: 'data:image/png;base64,abc'
    }
  }

  const targets = buildMetadataAutoCompleteTargets(tracks, trackMetaMap, { isLocalTrack: () => true })

  assert.deepEqual(
    targets.map((target) => target.path),
    ['D:/Music/a.flac', 'D:/Music/c.flac']
  )
})

test('embedded metadata wins over network and network is lower priority', () => {
  const embedded = buildEmbeddedMetadataAutoCompleteEntry({
    artist: 'Embedded Artist',
    coverDataUrl: 'data:image/png;base64,embedded'
  })
  const network = buildNetworkMetadataAutoCompleteEntry(
    {
      artist: 'Network Artist',
      coverDataUrl: 'https://example.test/cover.jpg'
    },
    embedded
  )

  assert.equal(embedded.artist, 'Embedded Artist')
  assert.equal(embedded.coverSource, 'embedded')
  assert.equal(network.artist, undefined)
  assert.equal(network.cover, undefined)
})

test('old embedded checked markers do not permanently skip incomplete tracks', () => {
  const track = {
    path: 'D:/Music/needs-retry.flac',
    sizeBytes: 1200,
    mtimeMs: 2000,
    info: { artist: 'Unknown Artist' }
  }
  const entry = {
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION - 1,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: 1200,
    mtimeMs: 2000
  }

  assert.equal(shouldSkipEmbeddedMetadataAutoComplete(track, entry, { now: 5000 }), false)
  assert.deepEqual(
    buildMetadataAutoCompleteTargets([track], { [track.path]: entry }, { now: 5000 }).map(
      (target) => target.path
    ),
    [track.path]
  )
})

test('embedded checked markers are invalidated when the file fingerprint changes', () => {
  const track = {
    path: 'D:/Music/changed.flac',
    sizeBytes: 2400,
    mtimeMs: 8000,
    info: { title: 'Title', artist: 'Artist', album: 'Album', cover: 'data:image/png;base64,a' }
  }
  const entry = {
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    cover: 'data:image/png;base64,a',
    sizeBytes: 1200,
    mtimeMs: 2000
  }

  assert.equal(shouldSkipEmbeddedMetadataAutoComplete(track, entry, { now: 5000 }), false)
  assert.equal(
    buildMetadataAutoCompleteTargets([track], { [track.path]: entry }, { now: 5000 }).length,
    1
  )
})

test('broad embedded source without field sources does not protect empty or fallback fields', () => {
  const entry = buildEmbeddedMetadataAutoCompleteEntry(
    {
      title: 'Embedded Title',
      artist: 'Embedded Artist',
      album: 'Embedded Album',
      coverDataUrl: 'data:image/png;base64,embedded'
    },
    {
      metadataSource: 'embedded',
      title: '',
      artist: 'Unknown Artist',
      album: ''
    }
  )

  assert.equal(entry.title, 'Embedded Title')
  assert.equal(entry.artist, 'Embedded Artist')
  assert.equal(entry.album, 'Embedded Album')
  assert.equal(entry.cover, 'data:image/png;base64,embedded')
})

test('failed embedded reads wait for retryAfter instead of becoming completed', () => {
  const track = {
    path: 'D:/Music/transient.flac',
    sizeBytes: 1200,
    mtimeMs: 2000,
    info: { artist: 'Unknown Artist' }
  }
  const failed = buildFailedEmbeddedMetadataAutoCompleteEntry(
    {},
    { now: 1000, retryDelayMs: 60_000, sizeBytes: 1200, mtimeMs: 2000 }
  )

  assert.equal(failed.metadataAutoCompleteEmbeddedChecked, false)
  assert.equal(shouldSkipEmbeddedMetadataAutoComplete(track, failed, { now: 30_000 }), true)
  assert.equal(shouldSkipEmbeddedMetadataAutoComplete(track, failed, { now: 61_000 }), false)
  assert.deepEqual(
    buildMetadataAutoCompleteTargets([track], { [track.path]: failed }, { now: 61_000 }).map(
      (target) => target.path
    ),
    [track.path]
  )
})

test('fresh embedded batch misses do not keep occupying the local batch queue', () => {
  const track = {
    path: 'D:/Music/no-tags.flac',
    sizeBytes: 1200,
    mtimeMs: 2000,
    info: { artist: 'Unknown Artist' }
  }
  const entry = {
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    metadataAutoCompleteSource: 'embedded-batch',
    artist: 'Unknown Artist',
    sizeBytes: 1200,
    mtimeMs: 2000
  }

  assert.equal(shouldSkipEmbeddedMetadataAutoComplete(track, entry, { now: 5000 }), true)
})

test('network auto-complete runs only while useful artist or cover is still missing', () => {
  const track = { path: 'D:/Music/a.flac', info: { artist: 'Unknown Artist' } }

  assert.equal(shouldRunNetworkMetadataAutoComplete(track, {}), true)
  assert.equal(
    shouldRunNetworkMetadataAutoComplete(track, {
      artist: 'Aimer',
      cover: 'data:image/png;base64,abc'
    }),
    false
  )
})
