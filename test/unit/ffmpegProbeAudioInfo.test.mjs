import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isLikelyIncorrectAudioMetadata,
  normalizeResolvedAudioCodecLabel,
  parseFfmpegAudioInfoText,
  shouldPreferFfmpegAudioInfo
} from '../../src/main/utils/ffmpegProbeAudioInfo.js'

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

test('parseFfmpegAudioInfoText reads renamed FLAC details and global tags', () => {
  const info = parseFfmpegAudioInfoText(`
Input #0, flac, from 'renamed_as_mp3.mp3':
  Metadata:
    TITLE           : おちゃめ機能
    ARTIST          : 重音テト
    ALBUM           : Cover Album
  Duration: 00:04:08.80, start: 0.000000, bitrate: 1898 kb/s
  Stream #0:0: Audio: flac, 48000 Hz, stereo, s32 (24 bit)
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc), 1600x1600 (attached pic)
`)
  assert.equal(info.codec, 'flac')
  assert.equal(info.sampleRate, 48000)
  assert.equal(info.channels, 2)
  assert.equal(info.bitDepth, 24)
  assert.equal(info.bitrate, 1898000)
  assert.equal(info.duration, 248.8)
  assert.equal(info.tags.title, 'おちゃめ機能')
  assert.equal(info.tags.artist, '重音テト')
  assert.equal(info.tags.album, 'Cover Album')
})

test('suspicious AAC metadata from a large renamed file prefers ffmpeg audio info', () => {
  const metadata = {
    format: {
      container: 'ADTS/MPEG-2',
      codec: 'AAC',
      codecProfile: 'AAC SSR',
      sampleRate: 24000,
      bitrate: 2213848969.25,
      numberOfChannels: 2,
      duration: 0.08533333333333333
    }
  }
  const probed = {
    codec: 'flac',
    sampleRate: 48000,
    channels: 2,
    bitDepth: 24,
    duration: 248.8
  }
  const options = { fileSizeBytes: 59039551, codecLabel: 'AAC' }
  assert.equal(isLikelyIncorrectAudioMetadata('renamed_as_mp3.mp3', metadata, options), true)
  assert.equal(shouldPreferFfmpegAudioInfo('renamed_as_mp3.mp3', metadata, probed, options), true)
})

test('normalizeResolvedAudioCodecLabel does not label every M4A as ALAC', () => {
  assert.equal(
    normalizeResolvedAudioCodecLabel({
      codecLabel: 'AAC',
      filePath: 'D:/music/lossy.m4a',
      probedCodec: 'aac'
    }),
    'AAC'
  )
  assert.equal(
    normalizeResolvedAudioCodecLabel({
      codecLabel: 'MPEG-4',
      filePath: 'D:/music/lossless.m4a',
      probedCodec: 'alac'
    }),
    'ALAC'
  )
})
