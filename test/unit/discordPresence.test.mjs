import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDiscordPresenceActivity,
  buildDiscordPresenceSignature
} from '../../src/renderer/src/utils/discordPresence.js'

test('buildDiscordPresenceActivity prefers current displayed track text', () => {
  const activity = buildDiscordPresenceActivity({
    track: {
      path: 'D:\\Music\\new.flac',
      name: 'New File.flac',
      info: { title: 'Cached Title', artist: 'Cached Artist', duration: 200 }
    },
    title: 'Displayed Title',
    artist: 'Displayed Artist',
    isPlaying: true,
    playbackRate: 1,
    currentTime: 20,
    duration: 200,
    now: 100_000
  })

  assert.equal(activity.title, 'Displayed Title')
  assert.equal(activity.artist, 'Displayed Artist')
  assert.equal(activity.trackId, 'D:\\Music\\new.flac')
  assert.equal(activity.playbackRate, '')
  assert.equal(activity.startTimestamp, 80_000)
  assert.equal(activity.endTimestamp, 280_000)
})

test('buildDiscordPresenceSignature changes immediately when the track changes', () => {
  const first = buildDiscordPresenceActivity({
    track: { path: 'D:\\Music\\old.flac', name: 'Old.flac' },
    title: 'Old',
    artist: 'Artist',
    isPlaying: true,
    currentTime: 10,
    duration: 120,
    now: 100_000
  })
  const second = buildDiscordPresenceActivity({
    track: { path: 'D:\\Music\\new.flac', name: 'New.flac' },
    title: 'New',
    artist: 'Artist',
    isPlaying: true,
    currentTime: 0,
    duration: 120,
    now: 101_000
  })

  assert.notEqual(buildDiscordPresenceSignature(first), buildDiscordPresenceSignature(second))
})
