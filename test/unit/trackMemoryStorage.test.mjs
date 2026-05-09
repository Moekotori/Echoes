import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getMvOverrideForPath,
  remapMvOverrides,
  setMvOverrideForPath
} from '../../src/renderer/src/utils/trackMemoryStorage.js'

function installLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  global.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    }
  }
  return store
}

test('manual MV overrides are persisted with manual origin by default', () => {
  installLocalStorage()

  setMvOverrideForPath('D:/Music/song.flac', {
    id: 'BV1Manual999',
    source: 'bilibili',
    title: 'Picked MV',
    author: 'Uploader'
  })

  assert.deepEqual(getMvOverrideForPath('D:/Music/song.flac'), {
    id: 'BV1Manual999',
    source: 'bilibili',
    title: 'Picked MV',
    author: 'Uploader',
    origin: 'manual',
    savedAt: getMvOverrideForPath('D:/Music/song.flac').savedAt
  })
})

test('auto MV matches keep a separate origin marker', () => {
  installLocalStorage()

  setMvOverrideForPath('D:/Music/song.flac', {
    id: 'youtube-id1',
    source: 'youtube',
    origin: 'auto'
  })

  assert.equal(getMvOverrideForPath('D:/Music/song.flac').origin, 'auto')
})

test('legacy MV overrides without origin are treated as manual user choices', () => {
  installLocalStorage({
    echoes_mv_override_v1: JSON.stringify({
      'D:/Music/song.flac': {
        id: 'BV1Legacy999',
        source: 'bilibili'
      }
    })
  })

  assert.equal(getMvOverrideForPath('D:/Music/song.flac').origin, 'manual')
})

test('remapping MV overrides preserves origin metadata', () => {
  installLocalStorage()
  setMvOverrideForPath('D:/Music/old.flac', {
    id: 'BV1Auto999',
    source: 'bilibili',
    origin: 'auto'
  })

  remapMvOverrides({ 'D:/Music/old.flac': 'D:/Music/new.flac' })

  assert.equal(getMvOverrideForPath('D:/Music/old.flac'), null)
  assert.equal(getMvOverrideForPath('D:/Music/new.flac').origin, 'auto')
})
