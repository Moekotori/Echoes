import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFfmpegAudioInfoText } from '../../src/main/utils/ffmpegProbeAudioInfo.js'

test('parseFfmpegAudioInfoText reads 24/96 ALAC stream details', () => {
  const info = parseFfmpegAudioInfoText(`
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'alac_24_96.m4a':
  Stream #0:0[0x1](und): Audio: alac (alac / 0x63616C61), 96000 Hz, stereo, s32p (24 bit), 2874 kb/s
`)
  assert.equal(info.codec, 'alac')
  assert.equal(info.sampleRate, 96000)
  assert.equal(info.channels, 2)
  assert.equal(info.bitDepth, 24)
  assert.equal(info.bitrate, 2874000)
})

test('parseFfmpegAudioInfoText derives bit depth from sample format', () => {
  const info = parseFfmpegAudioInfoText(`
  Stream #0:0: Audio: pcm_s16le, 44100 Hz, mono, s16, 705 kb/s
`)
  assert.equal(info.sampleRate, 44100)
  assert.equal(info.channels, 1)
  assert.equal(info.bitDepth, 16)
})
