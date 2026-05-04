import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLastFmTrackIdentity,
  buildLastFmTrackPayload,
  getLastFmScrobbleThresholdSec
} from '../../src/renderer/src/utils/lastfmTrackPayload.js'

test('buildLastFmTrackPayload uses embedded metadata first', () => {
  const payload = buildLastFmTrackPayload({
    path: 'D:\\Music\\File.flac',
    name: 'Fallback Artist - Fallback Title.flac',
    info: {
      title: 'Real Title',
      artist: 'Real Artist',
      album: 'Real Album',
      duration: 181.4
    }
  })

  assert.deepEqual(payload, {
    artist: 'Real Artist',
    title: 'Real Title',
    album: 'Real Album',
    duration: 181.4
  })
})

test('buildLastFmTrackPayload falls back to filename artist and title', () => {
  const payload = buildLastFmTrackPayload({
    path: 'D:\\Music\\Artist Name - Track Name.mp3',
    name: 'Artist Name - Track Name.mp3',
    info: {}
  })

  assert.equal(payload.artist, 'Artist Name')
  assert.equal(payload.title, 'Track Name')
})

test('buildLastFmTrackPayload still returns a scrobbleable track when artist is missing', () => {
  const payload = buildLastFmTrackPayload({
    path: 'D:\\Music\\Loose Track.wav',
    name: 'Loose Track.wav',
    info: { title: 'Loose Track', artist: 'Unknown Artist' }
  })

  assert.equal(payload.artist, 'Unknown Artist')
  assert.equal(payload.title, 'Loose Track')
})

test('buildLastFmTrackIdentity separates playlist entries that share one file path', () => {
  const first = buildLastFmTrackIdentity(
    {
      path: 'D:\\Music\\Album.flac',
      name: 'Album.flac',
      info: { title: 'Intro', artist: 'Artist' }
    },
    0
  )
  const second = buildLastFmTrackIdentity(
    {
      path: 'D:\\Music\\Album.flac',
      name: 'Album.flac',
      info: { title: 'Main', artist: 'Artist' }
    },
    1
  )

  assert.notEqual(first, second)
})

test('buildLastFmTrackPayload prefers the currently displayed player metadata', () => {
  const payload = buildLastFmTrackPayload(
    {
      path: 'D:\\Music\\Faded.flac',
      name: 'Faded.flac',
      info: {}
    },
    {
      title: 'Faded',
      artist: 'Alan Walker',
      album: 'Different World',
      duration: 212
    }
  )

  assert.deepEqual(payload, {
    artist: 'Alan Walker',
    title: 'Faded',
    album: 'Different World',
    duration: 212
  })
})

test('getLastFmScrobbleThresholdSec follows Last.fm timing bounds', () => {
  assert.equal(getLastFmScrobbleThresholdSec(0), 30)
  assert.equal(getLastFmScrobbleThresholdSec(80), 40)
  assert.equal(getLastFmScrobbleThresholdSec(800), 240)
})
