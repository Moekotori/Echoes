import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCuePlaylist, parseM3UPlaylist } from '../../src/renderer/src/utils/playlistFileImport.js'

test('parseM3UPlaylist resolves relative paths and file URLs', () => {
  const paths = parseM3UPlaylist(
    `
#EXTM3U
song one.flac
file:///D:/Music/song%20two.flac
`,
    'D:/Music/list.m3u8'
  )

  assert.deepEqual(paths, ['D:/Music/song one.flac', 'D:\\Music\\song two.flac'])
})

test('parseCuePlaylist resolves external cue FILE entries', () => {
  const tracks = parseCuePlaylist(
    `
TITLE "Album"
PERFORMER "Artist"
FILE "album.flac" WAVE
  TRACK 01 AUDIO
    TITLE "Intro"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Main"
    INDEX 01 01:00:00
`,
    'D:/Music/Album/album.cue'
  )

  assert.equal(tracks.length, 2)
  assert.equal(tracks[0].audioPath, 'D:/Music/Album/album.flac')
  assert.equal(tracks[0].title, 'Intro')
  assert.equal(tracks[0].duration, 60)
})
