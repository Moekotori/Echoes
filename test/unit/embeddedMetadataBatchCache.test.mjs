import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

import Database from 'better-sqlite3'

import {
  getEmbeddedMetadataCacheDbPath,
  readEmbeddedMetadataBatch,
  readCoverThumbBatchFromEmbeddedMetadataCache,
  readTrackFullCoverFromEmbeddedMetadataCache
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

function writeRawCacheRecord(userDataPath, record) {
  const db = new Database(getEmbeddedMetadataCacheDbPath(userDataPath))
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedded_metadata_cache (
        path TEXT PRIMARY KEY,
        sizeBytes INTEGER NOT NULL,
        mtimeMs INTEGER NOT NULL,
        meta_json TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `)
    if (Object.prototype.hasOwnProperty.call(record, 'metaJson')) {
      const columns = db.prepare('PRAGMA table_info(embedded_metadata_cache)').all()
      const columnNames = new Set(columns.map((column) => column.name))
      if (!columnNames.has('metaJson')) {
        db.exec('ALTER TABLE embedded_metadata_cache ADD COLUMN metaJson TEXT;')
      }
    }
    db.prepare(
      `INSERT INTO embedded_metadata_cache (path, sizeBytes, mtimeMs, meta_json, updatedAt${
        Object.prototype.hasOwnProperty.call(record, 'metaJson') ? ', metaJson' : ''
      })
       VALUES (?, ?, ?, ?, ?${
         Object.prototype.hasOwnProperty.call(record, 'metaJson') ? ', ?' : ''
       })
       ON CONFLICT(path) DO UPDATE SET
         sizeBytes = excluded.sizeBytes,
         mtimeMs = excluded.mtimeMs,
         meta_json = excluded.meta_json,
         updatedAt = excluded.updatedAt${
           Object.prototype.hasOwnProperty.call(record, 'metaJson')
             ? ', metaJson = excluded.metaJson'
             : ''
         }`
    ).run(
      ...[
        record.path,
        Number(record.sizeBytes || 0),
        Number(record.mtimeMs || 0),
        record.meta_json,
        Number(record.updatedAt || Date.now()),
        ...(Object.prototype.hasOwnProperty.call(record, 'metaJson') ? [record.metaJson] : [])
      ]
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

test('track full cover reads entry cover from sqlite meta_json without reparsing', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/full-cover.flac', sizeBytes: 4096, mtimeMs: 5000 }
  const cover = dataUrlFromText('full-cover-source')
  let readCalls = 0

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    coverThumbnailImageAdapter: createFakeThumbnailAdapter(),
    readMetadata: async () => {
      readCalls += 1
      return createMetadataReader({ common: { cover } }).readMetadata(seed.path)
    }
  })

  const result = await readTrackFullCoverFromEmbeddedMetadataCache({
    userDataPath,
    path: seed.path
  })

  assert.equal(readCalls, 1)
  assert.equal(result.ok, true)
  assert.equal(result.cover, cover)
  assert.equal(result.coverSource, 'embedded-batch')
})

test('track full cover returns a soft miss when sqlite meta_json has no cover', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/no-full-cover.flac', sizeBytes: 4096, mtimeMs: 5000 }

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: async () =>
      createMetadataReader({ common: { cover: null, embeddedPictureCount: 0 } }).readMetadata(seed.path)
  })

  const result = await readTrackFullCoverFromEmbeddedMetadataCache({
    userDataPath,
    path: seed.path
  })

  assert.deepEqual(result, {
    ok: false,
    cover: null,
    error: 'cover_not_found'
  })
})

test('track full cover generates and writes back thumbnail metadata when sqlite cover lacks thumb', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/full-cover-missing-thumb.flac', sizeBytes: 4096, mtimeMs: 5000 }
  const cover = dataUrlFromText('full-cover-needs-thumb')
  const adapter = createFakeThumbnailAdapter()

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    readMetadata: async () => createMetadataReader({ common: { cover } }).readMetadata(seed.path)
  })
  mutateCacheRecord(userDataPath, seed.path, (meta) => {
    delete meta.coverKey
    delete meta.coverThumbPath
    delete meta.coverThumbUrl
    delete meta.coverCacheVersion
    delete meta.coverThumbBytes
    delete meta.coverThumbWidth
    delete meta.coverThumbHeight
  })

  const result = await readTrackFullCoverFromEmbeddedMetadataCache({
    userDataPath,
    path: seed.path,
    coverThumbnailImageAdapter: adapter
  })
  const cached = readCacheMeta(userDataPath, seed.path)

  assert.equal(result.ok, true)
  assert.equal(result.cover, cover)
  assert.equal(result.coverThumbUrl.startsWith('file://'), true)
  assert.equal(result.coverThumbPath.endsWith('.jpg'), true)
  assert.equal(result.coverKey, cached.coverKey)
  assert.equal(cached.cover, cover)
  assert.equal(cached.coverThumbUrl, result.coverThumbUrl)
  assert.equal(cached.coverThumbPath, result.coverThumbPath)
  assert.equal(adapter.encodeCalls.length, 1)
})

test('track full cover reuses existing valid thumbnail metadata', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/full-cover-existing-thumb.flac', sizeBytes: 4096, mtimeMs: 5000 }
  const cover = dataUrlFromText('full-cover-existing-thumb')
  const adapter = createFakeThumbnailAdapter()

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    coverThumbnailImageAdapter: adapter,
    readMetadata: async () => createMetadataReader({ common: { cover } }).readMetadata(seed.path)
  })
  adapter.encodeCalls.length = 0

  const result = await readTrackFullCoverFromEmbeddedMetadataCache({
    userDataPath,
    path: seed.path,
    coverThumbnailImageAdapter: adapter
  })

  assert.equal(result.ok, true)
  assert.equal(result.cover, cover)
  assert.equal(result.coverThumbUrl.startsWith('file://'), true)
  assert.equal(adapter.encodeCalls.length, 0)
})

test('cover thumb batch reads sqlite only and does not return full cover dataURL', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/thumb-only.flac', sizeBytes: 4096, mtimeMs: 5000 }
  const cover = dataUrlFromText('thumb-only-full-cover')
  let readCalls = 0

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    coverThumbnailImageAdapter: createFakeThumbnailAdapter(),
    readMetadata: async () => {
      readCalls += 1
      return createMetadataReader({ common: { cover } }).readMetadata(seed.path)
    }
  })
  readCalls = 0

  const result = readCoverThumbBatchFromEmbeddedMetadataCache({
    userDataPath,
    seeds: [seed]
  })

  assert.equal(readCalls, 0)
  assert.deepEqual(result.hitPaths, [seed.path])
  assert.equal(result.entries[seed.path].path, seed.path)
  assert.equal(result.entries[seed.path].cover, undefined)
  assert.equal(result.entries[seed.path].coverThumbUrl.startsWith('file://'), true)
  assert.equal(result.entries[seed.path].coverThumbPath.endsWith('.jpg'), true)
})

test('cover thumb batch derives file URL when sqlite entry lacks coverThumbUrl', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/thumb-url.flac', sizeBytes: 4096, mtimeMs: 5000 }

  await readEmbeddedMetadataBatch({
    seeds: [seed],
    userDataPath,
    coverThumbnailImageAdapter: createFakeThumbnailAdapter(),
    readMetadata: createMetadataReader().readMetadata
  })
  mutateCacheRecord(userDataPath, seed.path, (meta) => {
    meta.coverThumbUrl = null
  })

  const result = readCoverThumbBatchFromEmbeddedMetadataCache({
    userDataPath,
    seeds: [seed]
  })

  const entry = result.entries[seed.path]
  assert.equal(result.hitPaths.includes(seed.path), true)
  assert.equal(entry.coverThumbUrl, getCoverThumbUrl(entry.coverThumbPath))
})

test('cover thumb batch marks missing or empty thumbnail files as missingThumb', async () => {
  const userDataPath = createTempUserData()
  const missingSeed = { path: 'D:/Music/missing-thumb.flac', sizeBytes: 4096, mtimeMs: 5000 }
  const emptySeed = { path: 'D:/Music/empty-thumb.flac', sizeBytes: 4096, mtimeMs: 5000 }

  await readEmbeddedMetadataBatch({
    seeds: [missingSeed, emptySeed],
    userDataPath,
    coverThumbnailImageAdapter: createFakeThumbnailAdapter(),
    readMetadata: createMetadataReader().readMetadata
  })
  const emptyThumbPath = readCacheMeta(userDataPath, emptySeed.path).coverThumbPath
  fs.writeFileSync(emptyThumbPath, Buffer.alloc(0))
  mutateCacheRecord(userDataPath, missingSeed.path, (meta) => {
    fs.rmSync(meta.coverThumbPath, { force: true })
  })

  const result = readCoverThumbBatchFromEmbeddedMetadataCache({
    userDataPath,
    seeds: [missingSeed, emptySeed]
  })

  assert.deepEqual(result.hitPaths, [])
  assert.equal(result.missingThumbPaths.includes(missingSeed.path), true)
  assert.equal(result.missingThumbPaths.includes(emptySeed.path), true)
  assert.equal(result.missingThumb[missingSeed.path], true)
  assert.equal(result.missingThumb[emptySeed.path], true)
  assert.equal(result.entries[missingSeed.path], undefined)
  assert.equal(result.entries[emptySeed.path], undefined)
})

test('cover thumb batch reports detailed miss reasons without returning cover data', async () => {
  const userDataPath = createTempUserData()
  const validStoredSeed = { path: 'D:/Music/valid-thumb.flac', sizeBytes: 100, mtimeMs: 200 }
  const validSeed = { ...validStoredSeed }
  const mismatchStoredSeed = { path: 'D:/Music/mismatch.flac', sizeBytes: 101, mtimeMs: 201 }
  const mismatchSeed = { ...mismatchStoredSeed, sizeBytes: 999 }
  const noThumbSeed = { path: 'D:/Music/no-thumb.flac', sizeBytes: 102, mtimeMs: 202 }
  const invalidMetaSeed = { path: 'D:/Music/invalid-meta.flac', sizeBytes: 103, mtimeMs: 203 }
  const missingFileSeed = { path: 'D:/Music/missing-file.flac', sizeBytes: 104, mtimeMs: 204 }
  const zeroByteSeed = { path: 'D:/Music/zero-byte.flac', sizeBytes: 105, mtimeMs: 205 }
  const noRecordSeed = { path: 'D:/Music/no-record.flac', sizeBytes: 106, mtimeMs: 206 }
  const missingFingerprintSeed = { path: 'D:/Music/missing-fingerprint.flac', sizeBytes: 0, mtimeMs: 0 }

  const validThumbPath = path.join(userDataPath, 'valid-thumb.jpg')
  fs.writeFileSync(validThumbPath, Buffer.from('valid-thumb'))
  writeRawCacheRecord(userDataPath, {
    path: validStoredSeed.path,
    sizeBytes: validStoredSeed.sizeBytes,
    mtimeMs: validStoredSeed.mtimeMs,
    meta_json: JSON.stringify({
      cover: dataUrlFromText('must-not-return'),
      coverThumbPath: validThumbPath,
      coverKey: sha1Text('valid-thumb'),
      coverChecked: true,
      embeddedPictureCount: 1
    })
  })
  writeRawCacheRecord(userDataPath, {
    path: mismatchStoredSeed.path,
    sizeBytes: mismatchStoredSeed.sizeBytes,
    mtimeMs: mismatchStoredSeed.mtimeMs,
    meta_json: JSON.stringify({
      coverThumbPath: validThumbPath,
      coverChecked: true
    })
  })
  writeRawCacheRecord(userDataPath, {
    path: noThumbSeed.path,
    sizeBytes: noThumbSeed.sizeBytes,
    mtimeMs: noThumbSeed.mtimeMs,
    meta_json: JSON.stringify({
      cover: dataUrlFromText('no-thumb-full-cover'),
      coverChecked: true
    })
  })
  const missingThumbPath = path.join(userDataPath, 'missing-thumb.jpg')
  writeRawCacheRecord(userDataPath, {
    path: missingFileSeed.path,
    sizeBytes: missingFileSeed.sizeBytes,
    mtimeMs: missingFileSeed.mtimeMs,
    meta_json: JSON.stringify({
      coverThumbPath: missingThumbPath,
      coverChecked: true
    })
  })
  const zeroByteThumbPath = path.join(userDataPath, 'zero-byte-thumb.jpg')
  fs.writeFileSync(zeroByteThumbPath, Buffer.alloc(0))
  writeRawCacheRecord(userDataPath, {
    path: zeroByteSeed.path,
    sizeBytes: zeroByteSeed.sizeBytes,
    mtimeMs: zeroByteSeed.mtimeMs,
    meta_json: JSON.stringify({
      coverThumbPath: zeroByteThumbPath,
      coverChecked: true
    })
  })
  writeRawCacheRecord(userDataPath, {
    path: invalidMetaSeed.path,
    sizeBytes: invalidMetaSeed.sizeBytes,
    mtimeMs: invalidMetaSeed.mtimeMs,
    meta_json: '{bad json'
  })

  const result = readCoverThumbBatchFromEmbeddedMetadataCache({
    userDataPath,
    seeds: [
      validSeed,
      mismatchSeed,
      noThumbSeed,
      invalidMetaSeed,
      missingFileSeed,
      zeroByteSeed,
      noRecordSeed,
      missingFingerprintSeed
    ]
  })

  assert.equal(result.hitPaths.includes(validSeed.path), true)
  assert.equal(result.entries[validSeed.path].cover, undefined)
  assert.equal(result.thumbOnlyRequestUniqueCount, 8)
  assert.equal(result.thumbOnlySeedMissingFingerprint, 1)
  assert.equal(result.thumbOnlyMissNoRecord, 2)
  assert.equal(result.thumbOnlyMissFingerprintMismatch, 1)
  assert.equal(result.thumbOnlyMissNoThumbPath, 1)
  assert.equal(result.thumbOnlyMissInvalidMeta, 1)
  assert.equal(result.thumbOnlyMissMissingThumbFile, 1)
  assert.equal(result.thumbOnlyMissZeroByteThumb, 1)
  assert.equal(result.missReasons.noRecord.includes(noRecordSeed.path), true)
  assert.equal(result.missReasons.noRecord.includes(missingFingerprintSeed.path), true)
  assert.deepEqual(result.missReasons.fingerprintMismatch, [mismatchSeed.path])
  assert.deepEqual(result.missReasons.noThumbPath, [noThumbSeed.path])
  assert.deepEqual(result.missReasons.invalidMeta, [invalidMetaSeed.path])
  assert.deepEqual(result.missReasons.missingThumbFile, [missingFileSeed.path])
  assert.deepEqual(result.missReasons.zeroByteThumb, [zeroByteSeed.path])
})

test('cover thumb batch reads valid legacy metaJson when meta_json is empty', async () => {
  const userDataPath = createTempUserData()
  const seed = { path: 'D:/Music/legacy-meta-json.flac', sizeBytes: 700, mtimeMs: 800 }
  const thumbPath = path.join(userDataPath, 'legacy-thumb.jpg')
  fs.writeFileSync(thumbPath, Buffer.from('legacy-thumb'))

  writeRawCacheRecord(userDataPath, {
    path: seed.path,
    sizeBytes: seed.sizeBytes,
    mtimeMs: seed.mtimeMs,
    meta_json: '',
    metaJson: JSON.stringify({
      cover: dataUrlFromText('legacy-full-cover-must-not-return'),
      coverThumbPath: thumbPath,
      coverThumbUrl: getCoverThumbUrl(thumbPath),
      coverKey: sha1Text('legacy-thumb'),
      coverChecked: true,
      embeddedPictureCount: 1
    })
  })

  const result = readCoverThumbBatchFromEmbeddedMetadataCache({
    userDataPath,
    seeds: [seed]
  })

  assert.deepEqual(result.hitPaths, [seed.path])
  assert.equal(result.thumbOnlyMissInvalidMeta, 0)
  assert.equal(result.thumbOnlyMissNoThumbPath, 0)
  assert.equal(result.entries[seed.path].cover, undefined)
  assert.equal(result.entries[seed.path].coverThumbPath, thumbPath)
  assert.equal(result.entries[seed.path].coverThumbUrl, getCoverThumbUrl(thumbPath))
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
