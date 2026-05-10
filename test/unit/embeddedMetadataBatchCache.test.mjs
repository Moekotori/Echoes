import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readEmbeddedMetadataBatch } from '../../src/main/utils/embeddedMetadataBatchCache.js'
import { METADATA_AUTO_COMPLETE_VERSION } from '../../src/shared/metadataAutoCompleteVersion.mjs'

function createTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'echo-embedded-cache-'))
}

function createMetadataReader({ common: commonOverrides = {} } = {}) {
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
          embeddedPictureCount: 1,
          metadataSource: 'embedded',
          fieldSources: {
            title: 'embedded',
            artist: 'embedded',
            album: 'embedded',
            cover: 'embedded'
          },
          ...commonOverrides
        }
      }
    }
  }
}

function mutateCacheRecords(userDataPath, mutate) {
  const cacheDir = path.join(userDataPath, 'metadata-cache-v1')
  for (const fileName of fs.readdirSync(cacheDir)) {
    if (!fileName.endsWith('.json')) continue
    const filePath = path.join(cacheDir, fileName)
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    for (const record of Object.values(payload)) mutate(record)
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
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
  assert.equal(first.entries[seed.path].metadataAutoCompleteVersion, METADATA_AUTO_COMPLETE_VERSION)
  assert.equal(first.entries[seed.path].embeddedPictureCount, 1)
  assert.equal(first.entries[seed.path].fieldSources.cover, 'embedded-batch')
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

test('embedded metadata batch invalidates stale auto-complete cache versions', async () => {
  const userDataPath = createTempUserData()
  const reader = createMetadataReader()
  const seed = { path: 'D:/Music/version.flac', sizeBytes: 1000, mtimeMs: 2000 }

  await readEmbeddedMetadataBatch({ seeds: [seed], userDataPath, readMetadata: reader.readMetadata })
  mutateCacheRecords(userDataPath, (record) => {
    record.meta.metadataAutoCompleteVersion = METADATA_AUTO_COMPLETE_VERSION - 1
  })

  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(second.parsedPaths, [seed.path])
  assert.deepEqual(second.cachedPaths, [])
  assert.equal(reader.calls.length, 2)
})

test('embedded metadata batch caches true no-cover tracks without embedded pictures', async () => {
  const userDataPath = createTempUserData()
  const reader = createMetadataReader({
    common: {
      cover: null,
      coverSource: null,
      embeddedPictureCount: 0,
      fieldSources: {
        title: 'embedded',
        artist: 'embedded',
        album: 'embedded'
      }
    }
  })
  const seed = { path: 'D:/Music/no-cover.flac', sizeBytes: 1000, mtimeMs: 2000 }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })
  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(first.parsedPaths, [seed.path])
  assert.deepEqual(first.failedPaths, [])
  assert.deepEqual(second.cachedPaths, [seed.path])
  assert.equal(second.entries[seed.path].cover, null)
  assert.equal(second.entries[seed.path].embeddedPictureCount, 0)
  assert.equal(reader.calls.length, 1)
})

test('embedded metadata batch retries picture-present rows when no cover was returned', async () => {
  const userDataPath = createTempUserData()
  const reader = createMetadataReader({
    common: {
      cover: null,
      coverSource: null,
      embeddedPictureCount: 1,
      fieldSources: {
        title: 'embedded',
        artist: 'embedded',
        album: 'embedded'
      }
    }
  })
  const seed = { path: 'D:/Music/picture-missing.flac', sizeBytes: 1000, mtimeMs: 2000 }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })
  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata
  })

  assert.deepEqual(first.parsedPaths, [])
  assert.deepEqual(first.failedPaths, [seed.path])
  assert.equal(first.errors[seed.path], 'embedded_cover_missing')
  assert.deepEqual(second.failedPaths, [seed.path])
  assert.equal(reader.calls.length, 2)
})
