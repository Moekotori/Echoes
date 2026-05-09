import test from 'node:test'
import assert from 'node:assert/strict'

import { preloadLyricsForTrack } from '../../src/renderer/src/utils/lyricsPreload.js'
import { getLyricsOverrideForPath, setLyricsOverrideForPath } from '../../src/renderer/src/utils/lyricsOverrideStorage.js'

function installLocalStorageMock() {
  const store = new Map()
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    }
  }
}

test.beforeEach(() => {
  installLocalStorageMock()
})

test('preloads a strong LRCLIB match into the existing lyric override cache', async () => {
  const calls = []
  const requestLrcLib = async (url) => {
    calls.push(url)
    return [
      {
        trackName: 'Blue Planet',
        artistName: 'Miku',
        duration: 180,
        syncedLyrics: '[00:01.00]first\n[00:08.00]second\n[02:55.00]last'
      }
    ]
  }

  const result = await preloadLyricsForTrack({
    track: { path: 'D:/music/Blue Planet.flac', name: 'Blue Planet.flac' },
    title: 'Blue Planet',
    artist: 'Miku',
    durationSec: 180,
    requestLrcLib,
    defaultSource: 'lrclib'
  })

  assert.equal(result.status, 'matched')
  assert.equal(result.source, 'lrclib')
  assert.ok(calls.some((url) => url.includes('lrclib.net/api/')))
  const saved = getLyricsOverrideForPath('D:/music/Blue Planet.flac')
  assert.equal(saved.source, 'lrclib')
  assert.equal(saved.preferredSource, 'lrclib')
  assert.match(saved.raw, /first/)
})

test('skips network work when a matching cached lyric already exists', async () => {
  setLyricsOverrideForPath('D:/music/cached.flac', '[00:01.00]cached line', {
    source: 'lrclib',
    preferredSource: 'lrclib'
  })
  let requested = false

  const result = await preloadLyricsForTrack({
    track: { path: 'D:/music/cached.flac', name: 'cached.flac' },
    title: 'Cached',
    artist: 'Miku',
    requestLrcLib: async () => {
      requested = true
      return null
    },
    defaultSource: 'lrclib'
  })

  assert.equal(result.status, 'cached')
  assert.equal(requested, false)
})

test('does not online preload when the configured lyric source is local', async () => {
  let requested = false

  const result = await preloadLyricsForTrack({
    track: { path: 'D:/music/local-first.flac', name: 'local-first.flac' },
    title: 'Local First',
    artist: 'Miku',
    requestLrcLib: async () => {
      requested = true
      return null
    },
    defaultSource: 'local'
  })

  assert.equal(result.status, 'skipped')
  assert.equal(requested, false)
  assert.equal(getLyricsOverrideForPath('D:/music/local-first.flac'), null)
})
