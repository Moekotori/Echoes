import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEmbeddedCoverDataUrl,
  buildJsmediatagsPictureDataUrl,
  normalizeEmbeddedCoverMime
} from '../../src/main/utils/embeddedCover.js'
import {
  normalizeMusicMetadataPicture,
  readMusicMetadataForLocalFile
} from '../../src/main/utils/musicMetadataReader.js'

test('embedded cover mime normalizes image/jpg to image/jpeg', () => {
  assert.equal(normalizeEmbeddedCoverMime('image/jpg'), 'image/jpeg')
  assert.equal(normalizeEmbeddedCoverMime('jpg'), 'image/jpeg')
})

test('jsmediatags picture data converts to a data image URL', () => {
  const dataUrl = buildJsmediatagsPictureDataUrl({
    format: 'image/jpg',
    data: [0xff, 0xd8, 0xff, 0xd9]
  })

  assert.equal(dataUrl, 'data:image/jpeg;base64,/9j/2Q==')
})

test('music-metadata picture normalizes to existing embedded cover shape', () => {
  const picture = normalizeMusicMetadataPicture({
    format: 'image/png',
    data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
  })

  assert.equal(picture.mime, 'image/png')
  assert.equal(picture.bytes, 4)
  assert.equal(Buffer.isBuffer(picture.buffer), true)
})

test('music-metadata reader returns metadata and embedded picture without legacy fallback', async () => {
  let parseCalled = 0
  const result = await readMusicMetadataForLocalFile('D:/Music/song.m4a', {
    parseFile: async (filePath, options) => {
      parseCalled += 1
      assert.equal(filePath, 'D:/Music/song.m4a')
      assert.deepEqual(options, { duration: true, skipCovers: false })
      return {
        common: {
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          albumartist: 'Album Artist',
          track: { no: 2, of: 12 },
          disk: { no: 1, of: 2 },
          picture: [{ format: 'image/jpeg', data: [0xff, 0xd8, 0xff, 0xd9] }]
        },
        format: {
          duration: 123,
          codec: 'alac',
          container: 'M4A',
          lossless: true,
          bitrate: 900000,
          sampleRate: 96000,
          bitsPerSample: 24,
          numberOfChannels: 2
        }
      }
    }
  })

  assert.equal(parseCalled, 1)
  assert.equal(result.error, '')
  assert.equal(result.metadata.title, 'Song')
  assert.equal(result.metadata.albumArtist, 'Album Artist')
  assert.equal(result.metadata.trackNo, 2)
  assert.equal(result.metadata.discTotal, 2)
  assert.equal(result.metadata.codec, 'alac')
  assert.equal(result.metadata.bitDepth, 24)
  assert.equal(result.picture.mime, 'image/jpeg')
})

test('music-metadata reader reports failures without throwing', async () => {
  const result = await readMusicMetadataForLocalFile('D:/Music/bad.flac', {
    parseFile: async () => {
      throw new Error('parse failed')
    }
  })

  assert.equal(result.picture, null)
  assert.equal(result.metadata.title, '')
  assert.match(result.error, /parse failed/)
})

test('empty embedded picture data returns no cover URL', () => {
  assert.equal(buildEmbeddedCoverDataUrl({ format: 'image/png', data: [] }), null)
  assert.equal(buildEmbeddedCoverDataUrl({ format: 'image/png', data: null }), null)
})
