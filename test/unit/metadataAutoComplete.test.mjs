import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEmbeddedMetadataAutoCompleteEntry,
  buildMetadataAutoCompleteTargets,
  buildNetworkMetadataAutoCompleteEntry,
  shouldRunNetworkMetadataAutoComplete
} from '../../src/renderer/src/utils/metadataAutoComplete.js'

test('metadata auto-complete targets unknown artist or missing cover tracks', () => {
  const tracks = [
    { path: 'D:/Music/a.flac', info: { artist: 'Unknown Artist' } },
    { path: 'D:/Music/b.flac', info: { artist: 'Aimer', cover: 'data:image/png;base64,abc' } },
    { path: 'D:/Music/c.flac', info: { artist: 'Aimer' } }
  ]

  const targets = buildMetadataAutoCompleteTargets(tracks, {}, { isLocalTrack: () => true })

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
