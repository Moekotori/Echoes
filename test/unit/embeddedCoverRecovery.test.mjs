import test from 'node:test'
import assert from 'node:assert/strict'

import { recoverEmbeddedCoverForBatch } from '../../src/main/utils/embeddedCoverRecovery.js'

function createNativeImageStub({ width = 640, height = 480 } = {}) {
  const jpeg = Buffer.from('jpeg-bytes')
  return {
    createFromBuffer() {
      return {
        isEmpty: () => false,
        getSize: () => ({ width, height }),
        resize: ({ width: nextWidth, height: nextHeight }) => ({
          isEmpty: () => false,
          getSize: () => ({ width: nextWidth, height: nextHeight }),
          toJPEG: () => Buffer.from('resized-jpeg')
        }),
        toJPEG: () => jpeg
      }
    }
  }
}

test('embedded cover recovery uses music-metadata picture data first', async () => {
  const result = await recoverEmbeddedCoverForBatch('D:/Music/recover.flac', {
    parseFile: async (filePath, options) => {
      assert.equal(filePath, 'D:/Music/recover.flac')
      assert.deepEqual(options, { duration: false, skipCovers: false })
      return {
        common: {
          picture: [{ data: Buffer.from('picture-bytes'), format: 'image/jpg' }]
        }
      }
    },
    imageAdapter: {
      nativeImage: createNativeImageStub()
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, 'music-metadata')
  assert.equal(result.coverSource, 'embedded-batch')
  assert.equal(result.cover.startsWith('data:image/jpeg;base64,'), true)
  assert.equal(result.recoveryStats.embeddedCoverRecoveryAttempted, 1)
  assert.equal(result.recoveryStats.embeddedCoverRecoveryMusicMetadataSucceeded, 1)
  assert.equal(result.recoveryStats.embeddedCoverRecoverySucceeded, 1)
})

test('embedded cover recovery falls back to jsmediatags for mp3-like files', async () => {
  const result = await recoverEmbeddedCoverForBatch('D:/Music/recover.mp3', {
    parseFile: async () => ({
      common: {
        picture: []
      }
    }),
    readJsmediatagsPicture: async () => ({
      picture: {
        data: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        format: 'image/jpg'
      }
    }),
    imageAdapter: {
      nativeImage: createNativeImageStub({ width: 320, height: 240 })
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, 'jsmediatags')
  assert.equal(result.coverSource, 'embedded-batch')
  assert.equal(result.recoveryStats.embeddedCoverRecoveryJsmediatagsSucceeded, 1)
  assert.equal(result.recoveryStats.embeddedCoverRecoverySucceeded, 1)
})

test('embedded cover recovery keeps raw data url when native image decode is unavailable', async () => {
  const result = await recoverEmbeddedCoverForBatch('D:/Music/raw.flac', {
    parseFile: async () => ({
      common: {
        picture: [{ data: Buffer.from('raw-picture'), format: 'image/png' }]
      }
    }),
    imageAdapter: {
      disableNativeImage: true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, 'music-metadata')
  assert.equal(result.cover.startsWith('data:image/png;base64,'), true)
  assert.equal(result.nativeImageEmpty, true)
  assert.equal(result.recoveryStats.embeddedCoverRecoveryNativeImageFailed, 1)
})

test('embedded cover recovery falls back to folder cover after embedded readers miss', async () => {
  const result = await recoverEmbeddedCoverForBatch('D:/Music/folder.flac', {
    parseFile: async () => ({
      common: {
        picture: []
      }
    }),
    readJsmediatagsPicture: async () => ({ picture: null, error: '' }),
    findFolderCoverDataUrl: async () => 'data:image/jpeg;base64,folder-cover'
  })

  assert.equal(result.ok, true)
  assert.equal(result.source, 'folder')
  assert.equal(result.coverSource, 'folder')
  assert.equal(result.cover, 'data:image/jpeg;base64,folder-cover')
  assert.equal(result.recoveryStats.embeddedCoverRecoveryFolderSucceeded, 1)
  assert.equal(result.recoveryStats.embeddedCoverRecoverySucceeded, 1)
})
