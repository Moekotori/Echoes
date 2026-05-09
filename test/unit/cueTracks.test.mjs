import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCueVirtualPath,
  getCueAudioPath,
  getCueDuration,
  parseCueSheet,
  parseCueVirtualPath,
  toCueAbsoluteTime
} from '../../src/shared/cueTracks.mjs'

test('parseCueSheet expands embedded FLAC cues into timed tracks', () => {
  const cue = `
TITLE "Album"
PERFORMER "Artist"
TRACK 01 AUDIO
  TITLE "Intro"
  INDEX 01 00:00:00
TRACK 02 AUDIO
  TITLE "Main"
  PERFORMER "Guest"
  INDEX 01 01:10:37
`
  const tracks = parseCueSheet(cue, 'D:/music/album.flac', 180)
  assert.equal(tracks.length, 2)
  assert.equal(tracks[0].title, 'Intro')
  assert.equal(tracks[0].artist, 'Artist')
  assert.equal(tracks[0].duration, 70 + 37 / 75)
  assert.equal(tracks[1].artist, 'Guest')
  assert.equal(tracks[1].duration, 180 - (70 + 37 / 75))
})

test('cue virtual paths preserve the real audio path and translate time', () => {
  const virtualPath = createCueVirtualPath('D:/music/album.flac', {
    trackNo: 2,
    start: 70,
    end: 120,
    title: 'Main',
    artist: 'Artist',
    albumTitle: 'Album'
  })
  const parsed = parseCueVirtualPath(virtualPath)
  assert.equal(getCueAudioPath(virtualPath), 'D:/music/album.flac')
  assert.equal(parsed.title, 'Main')
  assert.equal(getCueDuration(virtualPath), 50)
  assert.equal(toCueAbsoluteTime(virtualPath, 5), 75)
})

test('parseCueSheet preserves external FILE references per track', () => {
  const cue = `
TITLE "Singles"
PERFORMER "Artist"
FILE "disc one.flac" WAVE
  TRACK 01 AUDIO
    TITLE "One"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Two"
    INDEX 01 02:00:00
FILE "disc two.flac" WAVE
  TRACK 03 AUDIO
    TITLE "Three"
    INDEX 01 00:00:00
`
  const tracks = parseCueSheet(cue)
  assert.equal(tracks.length, 3)
  assert.equal(tracks[0].audioPath, 'disc one.flac')
  assert.equal(tracks[0].duration, 120)
  assert.equal(tracks[1].audioPath, 'disc one.flac')
  assert.equal(tracks[1].duration, null)
  assert.equal(tracks[2].audioPath, 'disc two.flac')
})
