import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getLyricsInstrumentalFlagForPath,
  getLyricsOverrideForPath,
  getLyricsSourcePreferenceForPath,
  normalizeLyricsSourcePreference,
  setLyricsInstrumentalFlagForPath,
  setLyricsOverrideForPath,
  setLyricsSourcePreferenceForPath
} from '../../src/renderer/src/utils/lyricsOverrideStorage.js'

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

test('setLyricsSourcePreferenceForPath stores a source without requiring lyric text', () => {
  setLyricsSourcePreferenceForPath('D:/music/a.flac', 'netease')

  assert.equal(getLyricsSourcePreferenceForPath('D:/music/a.flac'), 'netease')
  assert.equal(getLyricsOverrideForPath('D:/music/a.flac'), null)
})

test('manual lyric picks persist as exact manual overrides for the next playback', () => {
  setLyricsOverrideForPath('D:/music/a.flac', '[00:01.00]line', {
    source: 'manual',
    origin: 'lrclib'
  })

  const saved = getLyricsOverrideForPath('D:/music/a.flac')
  assert.equal(saved.raw, '[00:01.00]line')
  assert.equal(saved.source, 'manual')
  assert.equal(saved.origin, 'lrclib')
  assert.equal(getLyricsSourcePreferenceForPath('D:/music/a.flac'), 'manual')
})

test('changing source preference preserves the cached lyric text but changes routing', () => {
  setLyricsOverrideForPath('D:/music/a.flac', '[00:01.00]line', {
    source: 'manual',
    origin: 'netease'
  })
  setLyricsSourcePreferenceForPath('D:/music/a.flac', 'qq')

  assert.equal(getLyricsSourcePreferenceForPath('D:/music/a.flac'), 'qq')
  assert.equal(getLyricsOverrideForPath('D:/music/a.flac')?.raw, '[00:01.00]line')
})

test('instrumental flag persists without deleting saved lyric text', () => {
  setLyricsOverrideForPath('D:/music/a.flac', '[00:01.00]line', {
    source: 'manual',
    origin: 'lrclib'
  })
  setLyricsInstrumentalFlagForPath('D:/music/a.flac', true)

  assert.equal(getLyricsInstrumentalFlagForPath('D:/music/a.flac'), true)
  assert.equal(getLyricsOverrideForPath('D:/music/a.flac')?.raw, '[00:01.00]line')

  setLyricsInstrumentalFlagForPath('D:/music/a.flac', false)

  assert.equal(getLyricsInstrumentalFlagForPath('D:/music/a.flac'), false)
  assert.equal(getLyricsOverrideForPath('D:/music/a.flac')?.raw, '[00:01.00]line')
})

test('normalizeLyricsSourcePreference accepts only routable lyric sources', () => {
  assert.equal(normalizeLyricsSourcePreference('KuGou'), 'kugou')
  assert.equal(normalizeLyricsSourcePreference('embedded'), '')
  assert.equal(normalizeLyricsSourcePreference(''), '')
})
