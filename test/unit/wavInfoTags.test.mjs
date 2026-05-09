import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readWavInfoTags } from '../../src/main/utils/wavInfoTags.js'

function chunk(id, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const header = Buffer.alloc(8)
  header.write(id, 0, 4, 'ascii')
  header.writeUInt32LE(payload.length, 4)
  return payload.length % 2 ? Buffer.concat([header, payload, Buffer.from([0])]) : Buffer.concat([header, payload])
}

function makeInfoWav(tags) {
  const tagChunks = Object.entries(tags).map(([id, value]) =>
    chunk(id, Buffer.isBuffer(value) ? Buffer.concat([value, Buffer.from([0])]) : Buffer.from(`${value}\0`, 'utf8'))
  )
  const listPayload = Buffer.concat([Buffer.from('INFO', 'ascii'), ...tagChunks])
  const listChunk = chunk('LIST', listPayload)
  const fmtChunk = chunk(
    'fmt ',
    Buffer.from([1, 0, 2, 0, 0x80, 0xbb, 0, 0, 0, 0xee, 2, 0, 4, 0, 16, 0])
  )
  const dataChunk = chunk('data', Buffer.alloc(4))
  const body = Buffer.concat([fmtChunk, listChunk, dataChunk])
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 4, 'ascii')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WAVE', 8, 4, 'ascii')
  return Buffer.concat([header, body])
}

function writeTempWav(buffer) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'echo-wav-info-'))
  const filePath = join(dir, 'sample.wav')
  fs.writeFileSync(filePath, buffer)
  return filePath
}

test('readWavInfoTags decodes UTF-8 RIFF INFO tags', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      IART: 'Kano',
      INAM: '\u5f8c\u3067\u308f\u304b\u308b\u3053\u3068',
      IPRD: '\u5f8c\u3067\u308f\u304b\u308b\u3053\u3068'
    })
  )

  assert.deepEqual(readWavInfoTags(filePath), {
    artist: 'Kano',
    title: '\u5f8c\u3067\u308f\u304b\u308b\u3053\u3068',
    album: '\u5f8c\u3067\u308f\u304b\u308b\u3053\u3068'
  })
})

test('readWavInfoTags decodes Shift-JIS RIFF INFO tags', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.from([0x82, 0xc7, 0x82, 0xeb, 0x82, 0xf1]),
      IPRD: Buffer.from([0x8c, 0xe3, 0x82, 0xc5, 0x82, 0xed, 0x82, 0xa9, 0x82, 0xe9, 0x82, 0xb1, 0x82, 0xc6])
    })
  )

  assert.equal(readWavInfoTags(filePath).title, '\u3069\u308d\u3093')
  assert.equal(readWavInfoTags(filePath).album, '\u5f8c\u3067\u308f\u304b\u308b\u3053\u3068')
})

test('readWavInfoTags decodes UTF-16LE RIFF INFO tags', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('\u3069\u308d\u3093', 'utf16le')])
    })
  )

  assert.equal(readWavInfoTags(filePath).title, '\u3069\u308d\u3093')
})

test('readWavInfoTags decodes EUC-JP RIFF INFO tags (would be Latin-1 mojibake before)', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.from([0xa4, 0xc9, 0xa4, 0xed, 0xa4, 0xf3])
    })
  )

  assert.equal(readWavInfoTags(filePath).title, '\u3069\u308d\u3093')
})

test('readWavInfoTags decodes GBK Chinese RIFF INFO tags', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.from([0xd6, 0xd0, 0xb9, 0xfa])
    })
  )

  assert.equal(readWavInfoTags(filePath).title, '\u4e2d\u56fd')
})

test('readWavInfoTags returns plain ASCII tags untouched', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.from('Hello World', 'ascii'),
      IART: Buffer.from('Some Artist', 'ascii')
    })
  )

  const tags = readWavInfoTags(filePath)
  assert.equal(tags.title, 'Hello World')
  assert.equal(tags.artist, 'Some Artist')
})

test('readWavInfoTags ignores question-mark placeholders from lossy WAV INFO tags', () => {
  const filePath = writeTempWav(
    makeInfoWav({
      INAM: Buffer.from('???2', 'ascii'),
      IART: Buffer.from('RADWIMPS', 'ascii'),
      IPRD: Buffer.from('??????????????????', 'ascii')
    })
  )

  const tags = readWavInfoTags(filePath)
  assert.equal(tags.title, undefined)
  assert.equal(tags.artist, 'RADWIMPS')
  assert.equal(tags.album, undefined)
})
