import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMiniPlayerPayload,
  buildMiniPlayerPayloadSignature
} from '../../src/renderer/src/utils/miniPlayerPayload.js'

test('buildMiniPlayerPayload preserves an already built mini-player payload', () => {
  const payload = buildMiniPlayerPayload({
    track: {
      path: 'D:\\Music\\Song.flac',
      title: 'Real Song',
      artist: 'Real Artist',
      album: 'Real Album',
      cover: 'file:///D:/Music/cover.jpg',
      liked: true
    },
    playback: {
      isPlaying: true,
      volume: 0.42,
      position: 31,
      duration: 180,
      updatedAtMs: 123456
    }
  })

  assert.deepEqual(payload, {
    track: {
      path: 'D:\\Music\\Song.flac',
      title: 'Real Song',
      artist: 'Real Artist',
      album: 'Real Album',
      cover: 'file:///D:/Music/cover.jpg',
      liked: true
    },
    playback: {
      isPlaying: true,
      volume: 0.42,
      position: 31,
      duration: 180,
      updatedAtMs: 123456
    }
  })
})

test('buildMiniPlayerPayload still accepts flat app-state values', () => {
  const payload = buildMiniPlayerPayload({
    trackPath: 'D:\\Music\\Flat.mp3',
    title: 'Flat Song',
    artist: 'Flat Artist',
    isPlaying: true,
    volume: 2,
    position: -4,
    duration: 200
  })

  assert.equal(payload.track.path, 'D:\\Music\\Flat.mp3')
  assert.equal(payload.track.title, 'Flat Song')
  assert.equal(payload.track.artist, 'Flat Artist')
  assert.equal(payload.playback.isPlaying, true)
  assert.equal(payload.playback.volume, 1)
  assert.equal(payload.playback.position, 0)
  assert.equal(payload.playback.duration, 200)
})

test('buildMiniPlayerPayloadSignature buckets playback position', () => {
  const base = buildMiniPlayerPayload({
    trackPath: 'D:\\Music\\Song.flac',
    title: 'Song',
    artist: 'Artist',
    cover: 'data:image/jpeg;base64,abc',
    isPlaying: true,
    volume: 0.5,
    position: 21,
    duration: 180
  })
  const sameBucket = buildMiniPlayerPayload({
    ...base,
    playback: {
      ...base.playback,
      position: 29
    }
  })
  const nextBucket = buildMiniPlayerPayload({
    ...base,
    playback: {
      ...base.playback,
      position: 31
    }
  })

  assert.equal(buildMiniPlayerPayloadSignature(base), buildMiniPlayerPayloadSignature(sameBucket))
  assert.notEqual(
    buildMiniPlayerPayloadSignature(base),
    buildMiniPlayerPayloadSignature(nextBucket)
  )
})
