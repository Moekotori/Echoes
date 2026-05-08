import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildParsedPlaylistWithCache,
  compareTrackFrequent,
  compareTrackRandom,
  parseTrackInfo,
  resolveTrackIdentityFromMetadata
} from '../../src/renderer/src/utils/trackUtils.js'

const makeTrack = (path, fileName) => ({
  path,
  info: {
    fileName,
    title: fileName,
    trackNo: null,
    discNo: null
  }
})

test('compareTrackFrequent sorts by play count then last played time', () => {
  const tracks = [
    makeTrack('D:/Music/a.flac', 'A'),
    makeTrack('D:/Music/b.flac', 'B'),
    makeTrack('D:/Music/c.flac', 'C')
  ]

  const trackStats = {
    'D:/Music/a.flac': { playCount: 2, lastPlayedAt: 100 },
    'D:/Music/b.flac': { playCount: 5, lastPlayedAt: 50 },
    'D:/Music/c.flac': { playCount: 2, lastPlayedAt: 200 }
  }

  const sorted = [...tracks].sort((a, b) => compareTrackFrequent(a, b, trackStats))

  assert.deepEqual(
    sorted.map((track) => track.path),
    ['D:/Music/b.flac', 'D:/Music/c.flac', 'D:/Music/a.flac']
  )
})

test('compareTrackFrequent falls back to album track order', () => {
  const tracks = [
    {
      path: 'D:/Music/02.flac',
      info: { fileName: '02', title: 'Second', trackNo: 2, discNo: 1 }
    },
    {
      path: 'D:/Music/01.flac',
      info: { fileName: '01', title: 'First', trackNo: 1, discNo: 1 }
    }
  ]

  const sorted = [...tracks].sort((a, b) => compareTrackFrequent(a, b, {}))

  assert.deepEqual(
    sorted.map((track) => track.path),
    ['D:/Music/01.flac', 'D:/Music/02.flac']
  )
})

test('compareTrackRandom is stable for a seed and changes with a new seed', () => {
  const tracks = [
    makeTrack('D:/Music/a.flac', 'A'),
    makeTrack('D:/Music/b.flac', 'B'),
    makeTrack('D:/Music/c.flac', 'C'),
    makeTrack('D:/Music/d.flac', 'D'),
    makeTrack('D:/Music/e.flac', 'E')
  ]

  const first = [...tracks].sort((a, b) => compareTrackRandom(a, b, 'seed-a')).map((t) => t.path)
  const second = [...tracks].sort((a, b) => compareTrackRandom(a, b, 'seed-a')).map((t) => t.path)
  const reshuffled = [...tracks]
    .sort((a, b) => compareTrackRandom(a, b, 'seed-b'))
    .map((t) => t.path)

  assert.deepEqual(second, first)
  assert.notDeepEqual(reshuffled, first)
})

test('buildParsedPlaylistWithCache reuses unchanged parsed track objects', () => {
  const playlist = [
    { path: 'D:/Music/a.flac', name: '01 - Alpha.flac' },
    { path: 'D:/Music/b.flac', name: '02 - Beta.flac' },
    { path: 'D:/Music/c.flac', name: '03 - Gamma.flac' }
  ]
  const metaA = { title: 'Alpha' }
  const metaB = { title: 'Beta' }
  const metaC = { title: 'Gamma' }
  const first = buildParsedPlaylistWithCache(null, playlist, {
    'D:/Music/a.flac': metaA,
    'D:/Music/b.flac': metaB,
    'D:/Music/c.flac': metaC
  })
  const second = buildParsedPlaylistWithCache(first.cache, playlist, {
    'D:/Music/a.flac': metaA,
    'D:/Music/b.flac': { title: 'Beta updated' },
    'D:/Music/c.flac': metaC
  })

  assert.equal(second.items[0], first.items[0])
  assert.notEqual(second.items[1], first.items[1])
  assert.equal(second.items[2], first.items[2])
  assert.equal(second.items[1].info.title, 'Beta updated')
})

test('repairs truncated dash-suffix title metadata from the filename', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: 'Lyn - Beneath the Mask -rain-.flac',
    title: 'rain-',
    artist: 'Lyn - Beneath the Mask'
  })

  assert.equal(identity.title, 'Beneath the Mask -rain-')
  assert.equal(identity.artist, 'Lyn')
  assert.equal(identity.source, 'filename')
})

test('parseTrackInfo uses filename identity when tag title is only a trailing version fragment', () => {
  const info = parseTrackInfo(
    {
      path: 'D:/Music/Persona 5/Lyn - Beneath the Mask -rain-.flac',
      name: 'Lyn - Beneath the Mask -rain-.flac'
    },
    {
      title: 'rain-',
      artist: 'Lyn - Beneath the Mask'
    }
  )

  assert.equal(info.title, 'Beneath the Mask -rain-')
  assert.equal(info.artist, 'Lyn')
})

test('keeps normal metadata when it is not a truncated filename suffix', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: 'Lyn - Beneath the Mask -rain-.flac',
    title: 'Beneath the Mask',
    artist: 'Lyn'
  })

  assert.equal(identity.title, 'Beneath the Mask')
  assert.equal(identity.artist, 'Lyn')
  assert.equal(identity.source, 'metadata')
})

test('keeps Latin hyphenated titles intact', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '鹿乃 - Stella-rium.flac',
    title: 'Stella-rium',
    artist: '鹿乃'
  })

  assert.equal(identity.title, 'Stella-rium')
  assert.equal(identity.artist, '鹿乃')
  assert.equal(identity.source, 'metadata')
})
