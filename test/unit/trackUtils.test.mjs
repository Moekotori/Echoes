import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildParsedPlaylistWithCache,
  compareTrackFrequent
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
