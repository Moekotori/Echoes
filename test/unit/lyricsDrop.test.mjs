import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDroppedLyricsFile,
  hasDroppedFiles,
  isDroppedLyricsFile,
  readDroppedLyricsFile
} from '../../src/renderer/src/utils/lyricsDrop.js'

test('isDroppedLyricsFile accepts lrc and lrcx files only', () => {
  assert.equal(isDroppedLyricsFile({ name: 'song.lrc' }), true)
  assert.equal(isDroppedLyricsFile({ name: 'song.LRCX' }), true)
  assert.equal(isDroppedLyricsFile({ name: 'song.txt' }), false)
})

test('getDroppedLyricsFile picks the first lyrics file from the transfer', () => {
  const lrc = { name: 'line.lrc' }
  assert.equal(
    getDroppedLyricsFile({
      files: [{ name: 'cover.png' }, lrc]
    }),
    lrc
  )
})

test('hasDroppedFiles detects file drags before filenames are available', () => {
  assert.equal(hasDroppedFiles({ types: ['Files'], files: [] }), true)
  assert.equal(hasDroppedFiles({ types: ['text/plain'], files: [] }), false)
})

test('readDroppedLyricsFile reads renderer File text', async () => {
  const text = await readDroppedLyricsFile({
    name: 'song.lrc',
    text: async () => '\uFEFF[00:01.00]hello'
  })

  assert.equal(text, '[00:01.00]hello')
})

test('readDroppedLyricsFile reads Electron file path through preload api', async () => {
  const text = await readDroppedLyricsFile(
    { name: 'song.lrc', path: 'D:\\Music\\song.lrc' },
    {
      readBufferHandler: async () => Array.from(new TextEncoder().encode('[00:02.00]world'))
    }
  )

  assert.equal(text, '[00:02.00]world')
})
