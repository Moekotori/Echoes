import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

import Database from 'better-sqlite3'

import {
  getEmbeddedMetadataCacheDbPath,
  readEmbeddedMetadataBatch
} from '../../src/main/utils/embeddedMetadataBatchCache.js'
import {
  COVER_THUMB_CACHE_VERSION,
  getCoverThumbUrl,
  getCoverThumbPath
} from '../../src/main/utils/coverThumbnailCache.js'
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

function writeLegacyCacheShard(userDataPath, fileName, payload) {
  const cacheDir = path.join(userDataPath, 'metadata-cache-v1')
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, fileName), JSON.stringify(payload), 'utf8')
}

function mutateCacheRecord(userDataPath, trackPath, mutate) {
  const db = new Database(getEmbeddedMetadataCacheDbPath(userDataPath))
  try {
    const row = db
      .prepare(
        'SELECT path, sizeBytes, mtimeMs, meta_json, updatedAt FROM embedded_metadata_cache WHERE path = ?'
      )
      .get(trackPath)
    if (!row) return
    const meta = JSON.parse(row.meta_json)
    mutate(meta)
    db.prepare('UPDATE embedded_metadata_cache SET meta_json = ? WHERE path = ?').run(
      JSON.stringify(meta),
      trackPath
    )
  } finally {
    db.close()
  }
}

function readCacheMeta(userDataPath, trackPath) {
  const db = new Database(getEmbeddedMetadataCacheDbPath(userDataPath))
  try {
    const row = db
      .prepare(
        'SELECT path, sizeBytes, mtimeMs, meta_json, updatedAt FROM embedded_metadata_cache WHERE path = ?'
      )
      .get(trackPath)
    return row ? JSON.parse(row.meta_json) : null
  } finally {
    db.close()
  }
}

function dataUrlFromText(value, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(value).toString('base64')}`
}

function sha1Text(value) {
  return createHash('sha1').update(Buffer.from(value)).digest('hex')
}

function createFakeThumbnailAdapter({ fail = false, width = 320, height = 240 } = {}) {
  const encodeCalls = []
  const readCalls = []
  return {
    encodeCalls,
    readCalls,
    async encodeJpegThumbnail(buffer, options) {
      encodeCalls.push({ buffer: Buffer.from(buffer), options })
      if (fail) throw new Error('thumbnail failed')
      return {
        buffer: Buffer.from(`jpeg-thumb:${buffer.toString('utf8')}`),
        width,
        height
      }
    },
    async readMetadata(filePath) {
      readCalls.push(filePath)
      return { width, height }
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
  assert.deepEqual(second.entries[seed.path], first.entries[seed.path])
  assert.equal(reader.calls.length, 1)
})

test('embedded metadata batch round-trips complex entries through sqlite without mutation', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/roundtrip.m4a', sizeBytes: 2048, mtimeMs: 4096 }
  const expected = {
    title: 'Round Trip',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNo: 1,
    year: 2024,
    genre: 'Ambient',
    duration: 321,
    codec: 'ALAC',
    bitrateKbps: 512,
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    cover: 'data:image/jpeg;base64,roundtrip-cover',
    coverScope: 'album',
    coverSource: 'embedded-batch',
    coverChecked: true,
    coverExtractorVersion: 7,
    coverThumbnailOnly: true,
    coverMaxDimension: 320,
    embeddedPictureCount: 1,
    metadataSource: 'embedded-batch',
    fieldSources: {
      title: 'embedded-batch',
      artist: 'embedded-batch',
      album: 'embedded-batch',
      albumArtist: 'embedded-batch',
      trackNo: 'embedded-batch',
      year: 'embedded-batch',
      genre: 'embedded-batch',
      duration: 'embedded-batch',
      codec: 'embedded-batch',
      sampleRateHz: 'embedded-batch',
      cover: 'embedded-batch'
    },
    metadataDetailMode: 'embedded-batch',
    metadataAutoCompleteSource: 'embedded-batch',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  }
  const reader = {
    calls: 0,
    readMetadata: async () => {
      reader.calls += 1
      return {
        success: true,
        technical: {
          duration: expected.duration,
          codec: expected.codec,
          bitrate: expected.bitrateKbps * 1000,
          sampleRate: expected.sampleRateHz,
          bitDepth: expected.bitDepth,
          channels: expected.channels
        },
        common: {
          title: expected.title,
          artist: expected.artist,
          album: expected.album,
          albumArtist: expected.albumArtist,
          trackNo: expected.trackNo,
          year: expected.year,
          genre: expected.genre,
          cover: expected.cover,
          coverSource: expected.coverSource,
          coverScope: expected.coverScope,
          coverChecked: expected.coverChecked,
          coverExtractorVersion: expected.coverExtractorVersion,
          coverThumbnailOnly: expected.coverThumbnailOnly,
          coverMaxDimension: expected.coverMaxDimension,
          embeddedPictureCount: expected.embeddedPictureCount,
          metadataSource: expected.metadataSource,
          fieldSources: expected.fieldSources
        }
      }
    }
  }

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

  assert.equal(reader.calls, 1)
  assert.deepEqual(first.entries[seed.path], expected)
  assert.deepEqual(second.entries[seed.path], expected)
  assert.deepEqual(second.entries[seed.path], first.entries[seed.path])
})

test('embedded metadata batch keeps cover data url and records disk thumbnail fields', async () => {
  const userDataPath = createTempUserData()
  const adapter = createFakeThumbnailAdapter()
  const coverPayload = 'phase-2a-cover'
  const cover = dataUrlFromText(coverPayload)
  const coverKey = sha1Text(coverPayload)
  const seed = { path: 'D:/Music/thumb.flac', sizeBytes: 2048, mtimeMs: 4096 }
  const reader = createMetadataReader({
    common: {
      cover,
      coverSource: 'embedded',
      embeddedPictureCount: 1,
      fieldSources: {
        title: 'embedded',
        cover: 'embedded'
      }
    }
  })

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata,
    coverThumbnailImageAdapter: adapter
  })
  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata,
    coverThumbnailImageAdapter: adapter
  })

  assert.equal(first.entries[seed.path].cover, cover)
  assert.equal(first.entries[seed.path].coverKey, coverKey)
  assert.equal(first.entries[seed.path].coverThumbPath, getCoverThumbPath(userDataPath, coverKey))
  assert.equal(first.entries[seed.path].coverThumbUrl, getCoverThumbUrl(getCoverThumbPath(userDataPath, coverKey)))
  assert.equal(first.entries[seed.path].coverCacheVersion, COVER_THUMB_CACHE_VERSION)
  assert.equal(first.entries[seed.path].coverThumbBytes > 0, true)
  assert.equal(first.entries[seed.path].coverThumbWidth, 320)
  assert.equal(first.entries[seed.path].coverThumbHeight, 240)
  assert.deepEqual(second.entries[seed.path], first.entries[seed.path])
  assert.equal(reader.calls.length, 1)
  assert.equal(adapter.encodeCalls.length, 1)
  assert.equal(fs.existsSync(first.entries[seed.path].coverThumbPath), true)
})

test('embedded metadata batch deduplicates identical cover buffers by cover key', async () => {
  const userDataPath = createTempUserData()
  const adapter = createFakeThumbnailAdapter()
  const coverPayload = 'same-cover-buffer'
  const cover = dataUrlFromText(coverPayload)
  const coverKey = sha1Text(coverPayload)
  const seeds = [
    { path: 'D:/Music/same-a.flac', sizeBytes: 1000, mtimeMs: 2000 },
    { path: 'D:/Music/same-b.flac', sizeBytes: 1001, mtimeMs: 2001 }
  ]
  const readMetadata = async () => ({
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
      title: 'Same Cover',
      artist: 'Artist',
      album: 'Album',
      cover,
      coverSource: 'embedded',
      coverChecked: true,
      embeddedPictureCount: 1,
      fieldSources: { cover: 'embedded' }
    }
  })

  const result = await readEmbeddedMetadataBatch({
    seeds,
    userDataPath,
    readMetadata,
    coverThumbnailImageAdapter: adapter
  })

  assert.equal(result.entries[seeds[0].path].coverKey, coverKey)
  assert.equal(result.entries[seeds[1].path].coverKey, coverKey)
  assert.equal(result.entries[seeds[0].path].coverThumbPath, result.entries[seeds[1].path].coverThumbPath)
  assert.equal(adapter.encodeCalls.length, 1)
})

test('embedded metadata batch reuses an existing thumbnail file without rewriting it', async () => {
  const userDataPath = createTempUserData()
  const adapter = createFakeThumbnailAdapter()
  const coverPayload = 'preexisting-thumb-cover'
  const cover = dataUrlFromText(coverPayload)
  const coverKey = sha1Text(coverPayload)
  const coverThumbPath = getCoverThumbPath(userDataPath, coverKey)
  fs.mkdirSync(path.dirname(coverThumbPath), { recursive: true })
  fs.writeFileSync(coverThumbPath, Buffer.from('existing-jpeg'))
  const before = fs.statSync(coverThumbPath).mtimeMs
  const seed = { path: 'D:/Music/existing-thumb.flac', sizeBytes: 2000, mtimeMs: 3000 }
  const reader = createMetadataReader({
    common: {
      cover,
      coverSource: 'folder',
      embeddedPictureCount: 0,
      fieldSources: { cover: 'folder' }
    }
  })

  const result = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata,
    coverThumbnailImageAdapter: adapter
  })

  assert.equal(result.entries[seed.path].cover, cover)
  assert.equal(result.entries[seed.path].coverKey, coverKey)
  assert.equal(result.entries[seed.path].coverThumbPath, coverThumbPath)
  assert.equal(result.entries[seed.path].coverThumbBytes, Buffer.byteLength('existing-jpeg'))
  assert.equal(adapter.encodeCalls.length, 0)
  assert.equal(fs.statSync(coverThumbPath).mtimeMs, before)
})

test('embedded metadata batch keeps cover when thumbnail generation fails', async () => {
  const userDataPath = createTempUserData()
  const adapter = createFakeThumbnailAdapter({ fail: true })
  const cover = dataUrlFromText('thumb-failure-cover')
  const seed = { path: 'D:/Music/thumb-fail.flac', sizeBytes: 3000, mtimeMs: 4000 }
  const reader = createMetadataReader({
    common: {
      cover,
      coverSource: 'embedded',
      embeddedPictureCount: 1,
      fieldSources: { cover: 'embedded' }
    }
  })

  const result = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: reader.readMetadata,
    coverThumbnailImageAdapter: adapter
  })

  assert.deepEqual(result.parsedPaths, [seed.path])
  assert.deepEqual(result.failedPaths, [])
  assert.equal(result.entries[seed.path].cover, cover)
  assert.equal(result.entries[seed.path].coverKey, undefined)
})

test('embedded metadata batch keeps DSD fields unchanged across sqlite hits', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/dsd.dsf', sizeBytes: 5120, mtimeMs: 10240 }
  const expected = {
    title: 'DSD Track',
    artist: 'DSD Artist',
    album: 'DSD Album',
    albumArtist: 'DSD Album Artist',
    trackNo: 2,
    year: 2023,
    genre: 'Classical',
    duration: 612,
    codec: 'DSD',
    bitrateKbps: null,
    sampleRateHz: 2822400,
    bitDepth: null,
    channels: 2,
    cover: 'data:image/jpeg;base64,dsd-cover',
    coverScope: 'album',
    coverSource: 'embedded-batch',
    coverChecked: true,
    coverExtractorVersion: 8,
    coverThumbnailOnly: true,
    coverMaxDimension: 320,
    embeddedPictureCount: 1,
    metadataSource: 'embedded-batch',
    fieldSources: {
      codec: 'embedded-batch',
      sampleRateHz: 'embedded-batch',
      cover: 'embedded-batch'
    },
    metadataDetailMode: 'embedded-batch',
    metadataAutoCompleteSource: 'embedded-batch',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  }
  let calls = 0
  const readMetadata = async () => {
    calls += 1
    return {
      success: true,
      technical: {
        duration: expected.duration,
        codec: expected.codec,
        bitrate: null,
        sampleRate: expected.sampleRateHz,
        bitDepth: null,
        channels: expected.channels
      },
      common: {
        title: expected.title,
        artist: expected.artist,
        album: expected.album,
        albumArtist: expected.albumArtist,
        trackNo: expected.trackNo,
        year: expected.year,
        genre: expected.genre,
        cover: expected.cover,
        coverSource: expected.coverSource,
        coverScope: expected.coverScope,
        coverChecked: expected.coverChecked,
        coverExtractorVersion: expected.coverExtractorVersion,
        coverThumbnailOnly: expected.coverThumbnailOnly,
        coverMaxDimension: expected.coverMaxDimension,
        embeddedPictureCount: expected.embeddedPictureCount,
        metadataSource: expected.metadataSource,
        fieldSources: expected.fieldSources
      }
    }
  }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })
  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })

  assert.equal(calls, 1)
  assert.deepEqual(first.entries[seed.path], expected)
  assert.deepEqual(second.entries[seed.path], expected)
  assert.deepEqual(second.entries[seed.path], first.entries[seed.path])
})

test('embedded metadata batch caches DFF no-cover tracks without mutating fields', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/dff.dff', sizeBytes: 6144, mtimeMs: 12288 }
  const expected = {
    title: 'No Cover DSD',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNo: 3,
    year: 2022,
    genre: 'Electronic',
    duration: 745,
    codec: 'DSD',
    bitrateKbps: null,
    sampleRateHz: 5644800,
    bitDepth: null,
    channels: 2,
    cover: null,
    coverScope: null,
    coverSource: null,
    coverChecked: true,
    coverExtractorVersion: null,
    coverThumbnailOnly: true,
    coverMaxDimension: 320,
    embeddedPictureCount: 0,
    metadataSource: 'embedded-batch',
    fieldSources: {
      codec: 'embedded-batch',
      sampleRateHz: 'embedded-batch'
    },
    metadataDetailMode: 'embedded-batch',
    metadataAutoCompleteSource: 'embedded-batch',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  }
  let calls = 0
  const readMetadata = async () => {
    calls += 1
    return {
      success: true,
      technical: {
        duration: expected.duration,
        codec: expected.codec,
        bitrate: null,
        sampleRate: expected.sampleRateHz,
        bitDepth: null,
        channels: expected.channels
      },
      common: {
        title: expected.title,
        artist: expected.artist,
        album: expected.album,
        albumArtist: expected.albumArtist,
        trackNo: expected.trackNo,
        year: expected.year,
        genre: expected.genre,
        cover: expected.cover,
        coverSource: expected.coverSource,
        coverScope: expected.coverScope,
        coverChecked: expected.coverChecked,
        coverExtractorVersion: expected.coverExtractorVersion,
        coverThumbnailOnly: expected.coverThumbnailOnly,
        coverMaxDimension: expected.coverMaxDimension,
        embeddedPictureCount: expected.embeddedPictureCount,
        metadataSource: expected.metadataSource,
        fieldSources: expected.fieldSources
      }
    }
  }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })
  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })

  assert.equal(calls, 1)
  assert.deepEqual(first.entries[seed.path], expected)
  assert.deepEqual(second.entries[seed.path], expected)
})

test('embedded metadata batch imports legacy json shards into sqlite on first read', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/legacy.flac', sizeBytes: 4096, mtimeMs: 8192 }
  const legacyEntry = {
    title: 'Legacy Title',
    artist: 'Legacy Artist',
    album: 'Legacy Album',
    albumArtist: 'Legacy Album Artist',
    trackNo: 7,
    year: 2024,
    genre: 'Pop',
    duration: 180,
    codec: null,
    bitrateKbps: null,
    sampleRateHz: null,
    bitDepth: null,
    channels: null,
    cover: 'data:image/png;base64,legacy',
    coverScope: 'album',
    coverSource: 'embedded-batch',
    coverChecked: true,
    coverExtractorVersion: null,
    coverThumbnailOnly: true,
    coverMaxDimension: 320,
    embeddedPictureCount: 1,
    metadataSource: 'embedded-batch',
    fieldSources: {
      title: 'embedded-batch',
      artist: 'embedded-batch',
      album: 'embedded-batch',
      cover: 'embedded-batch'
    },
    metadataDetailMode: 'embedded-batch',
    metadataAutoCompleteSource: 'embedded-batch',
    metadataAutoCompleteVersion: METADATA_AUTO_COMPLETE_VERSION,
    metadataAutoCompleteEmbeddedChecked: true,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs
  }

  writeLegacyCacheShard(userDataPath, '00.json', {
    [seed.path]: {
      path: seed.path,
      fingerprint: { sizeBytes: seed.sizeBytes, mtimeMs: seed.mtimeMs },
      meta: legacyEntry,
      updatedAt: 123456789
    }
  })

  let calls = 0
  const readMetadata = async () => {
    calls += 1
    throw new Error('legacy cache import should avoid parsing')
  }

  const result = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })

  assert.equal(calls, 0)
  assert.deepEqual(result.cachedPaths, [seed.path])
  assert.deepEqual(result.entries[seed.path], legacyEntry)

  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata
  })

  assert.equal(calls, 0)
  assert.deepEqual(second.cachedPaths, [seed.path])
  assert.deepEqual(second.entries[seed.path], legacyEntry)
  assert.deepEqual(readCacheMeta(userDataPath, seed.path), legacyEntry)
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
  mutateCacheRecord(userDataPath, seed.path, (meta) => {
    meta.metadataAutoCompleteVersion = METADATA_AUTO_COMPLETE_VERSION - 1
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
  assert.equal(readCacheMeta(userDataPath, seed.path), null)
})

test('embedded metadata batch recovers missing embedded cover before caching and retries after recovery failure', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/recover.flac', sizeBytes: 1000, mtimeMs: 2000 }
  const adapter = createFakeThumbnailAdapter()
  let readCalls = 0
  let recoverCalls = 0
  const readMetadata = async () => {
    readCalls += 1
    return {
      success: true,
      technical: {
        duration: 240,
        codec: 'FLAC',
        bitrate: 800000,
        sampleRate: 48000,
        bitDepth: 24,
        channels: 2
      },
      common: {
        title: 'Recover Track',
        artist: 'Artist',
        album: 'Album',
        cover: null,
        coverSource: null,
        coverChecked: true,
        embeddedPictureCount: 1,
        fieldSources: {
          title: 'embedded',
          artist: 'embedded',
          album: 'embedded'
        }
      }
    }
  }
  const successRecovery = async () => {
    recoverCalls += 1
    return {
      ok: true,
      cover: dataUrlFromText('recovered-cover'),
      coverSource: 'embedded-batch',
      coverScope: 'album',
      coverBytes: 2048,
      coverWidth: 320,
      coverHeight: 240,
      recoveryStats: {
        embeddedCoverRecoveryAttempted: 1,
        embeddedCoverRecoverySucceeded: 1,
        embeddedCoverRecoveryMusicMetadataSucceeded: 1
      }
    }
  }

  const first = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata,
    recoverCover: successRecovery,
    coverThumbnailImageAdapter: adapter
  })

  assert.deepEqual(first.parsedPaths, [seed.path])
  assert.deepEqual(first.failedPaths, [])
  assert.equal(readCalls, 1)
  assert.equal(recoverCalls, 1)
  assert.equal(first.entries[seed.path].cover, dataUrlFromText('recovered-cover'))
  assert.equal(first.entries[seed.path].coverThumbUrl.startsWith('file://'), true)
  assert.equal(readCacheMeta(userDataPath, seed.path).cover, dataUrlFromText('recovered-cover'))
  assert.equal(adapter.encodeCalls.length, 1)

  mutateCacheRecord(userDataPath, seed.path, (meta) => {
    meta.cover = null
    meta.coverThumbPath = null
    meta.coverThumbUrl = null
    meta.embeddedPictureCount = 1
    meta.metadataAutoCompleteVersion = METADATA_AUTO_COMPLETE_VERSION
  })

  const failingRecovery = async () => {
    recoverCalls += 1
    return {
      ok: false,
      recoveryStats: {
        embeddedCoverRecoveryAttempted: 1,
        embeddedCoverRecoveryFailed: 1
      },
      error: 'recover_failed'
    }
  }

  const second = await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata,
    recoverCover: failingRecovery,
    coverThumbnailImageAdapter: adapter
  })

  assert.deepEqual(second.failedPaths, [seed.path])
  assert.equal(second.errors[seed.path], 'embedded_cover_missing')
  assert.equal(readCalls, 2)
  assert.equal(recoverCalls, 2)
  assert.equal(readCacheMeta(userDataPath, seed.path), null)
})

test('embedded metadata batch logs a lightweight summary per batch', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/logs.flac', sizeBytes: 1000, mtimeMs: 2000 }
  const adapter = createFakeThumbnailAdapter()
  const cover = dataUrlFromText('secret-data-url-marker')
  const originalDebug = console.debug
  const calls = []
  console.debug = (...args) => {
    calls.push(args)
  }
  try {
    await readEmbeddedMetadataBatch({
      seeds: [seed],
      userDataPath,
      coverThumbnailImageAdapter: adapter,
      readMetadata: async () => ({
        success: true,
        technical: {
          duration: 1,
          codec: 'FLAC',
          bitrate: 320000,
          sampleRate: 44100,
          bitDepth: 16,
          channels: 2
        },
        common: {
          title: 'Log Track',
          artist: 'Artist',
          album: 'Album',
          cover,
          coverSource: 'embedded',
          embeddedPictureCount: 1,
          fieldSources: { title: 'embedded' }
        }
      })
    })
  } finally {
    console.debug = originalDebug
  }

  assert.equal(calls.length > 0, true)
  const summaryCall = calls.find((args) => String(args[0] || '').includes('batch summary'))
  assert.ok(summaryCall)
  const stats = summaryCall[1]
  assert.equal(typeof stats.sqliteHitCount, 'number')
  assert.equal(typeof stats.legacyImportedCount, 'number')
  assert.equal(typeof stats.parsedCount, 'number')
  assert.equal(typeof stats.failedCount, 'number')
  assert.equal(typeof stats.retryableEmbeddedCoverMissingCount, 'number')
  assert.equal(typeof stats.sqliteErrorCount, 'number')
  assert.equal(typeof stats.elapsedMs, 'number')
  assert.equal(JSON.stringify(calls).includes(cover), false)
  assert.equal(JSON.stringify(calls).includes('secret-data-url-marker'), false)
})
