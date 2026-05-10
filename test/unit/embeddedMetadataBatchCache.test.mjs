import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readEmbeddedMetadataBatch } from '../../src/main/utils/embeddedMetadataBatchCache.js'

function createTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'echo-embedded-cache-'))
}

function createMetadataReader() {
  const calls = []
  return {
    calls,
    readMetadata: async (filePath) => {
      calls.push(filePath)
      return {
        success: true,
        technical: {
          duration: 180,
          codec: 'FLAC',
          bitrate: 900000,
          sampleRate: 48000,
          bitDepth: 24,
          channels: 2
        },
        common: {
          title: `Title ${path.basename(filePath)}`,
          artist: 'Embedded Artist',
          album: 'Embedded Album',
          albumArtist: 'Embedded Album Artist',
          trackNo: 3,
          year: 2024,
          genre: 'Pop',
          cover: 'data:image/png;base64,abc',
          coverSource: 'embedded',
          coverScope: 'album',
          coverChecked: true,
          coverThumbnailOnly: true,
          coverMaxDimension: 320,
          metadataSource: 'embedded',
          fieldSources: {
            title: 'embedded',
            artist: 'embedded',
            album: 'embedded',
            cover: 'embedded'
          }
        }
      }
    }
  }
}

test('embedded metadata batch caches parsed entries by path fingerprint', async () => {
  const userDataPath = createTempUserData()
  const reader = createMetadataReader()
  const seed = { path: 'D:/Music/a.flac', sizeBytes: 1000, mtimeMs: 2000 }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(first.parsedPaths, [seed.path])
  assert.deepEqual(first.cachedPaths, [])
  assert.equal(first.entries[seed.path].artist, 'Embedded Artist')
  assert.equal(first.entries[seed.path].coverThumbnailOnly, true)
  assert.equal(reader.calls.length, 1)

  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(second.parsedPaths, [])
  assert.deepEqual(second.cachedPaths, [seed.path])
  assert.equal(second.entries[seed.path].artist, 'Embedded Artist')
  assert.equal(reader.calls.length, 1)
})

test('embedded metadata batch re-parses when size or mtime changes', async () => {
  const userDataPath = createTempUserData()
  const reader = createMetadataReader()
  const seed = { path: 'D:/Music/b.flac', sizeBytes: 1000, mtimeMs: 2000 }

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  const changed = await readEmbeddedMetadataBatch({
    seeds: [{ ...seed, mtimeMs: 3000 }],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(changed.parsedPaths, [seed.path])
  assert.deepEqual(changed.cachedPaths, [])
  assert.equal(reader.calls.length, 2)
})

test('embedded metadata batch reports per-path failures without caching them as success', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/fail.flac', sizeBytes: 1000, mtimeMs: 2000 }
  let calls = 0
  const readMetadata = async () => {
    calls += 1
    return { success: false, error: 'parse_failed' }
  }

  const first = await readEmbeddedMetadataBatch({ seeds: [seed], userDataPath, readMetadata })
  const second = await readEmbeddedMetadataBatch({ seeds: [seed], userDataPath, readMetadata })

  assert.deepEqual(first.failedPaths, [seed.path])
  assert.deepEqual(second.failedPaths, [seed.path])
  assert.equal(first.errors[seed.path], 'parse_failed')
  assert.equal(calls, 2)
})
