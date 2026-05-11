import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createCoverHydrationManager,
  hasHydratableCoverSource,
  selectListCoverHydrationPrewarmTracks,
  selectAlbumCoverHydrationTracks
} from '../../src/renderer/src/utils/coverHydrationQueue.js'
import {
  buildTrackCoverDebugStats,
  hasRealTrackCover,
  resolveTrackCoverSources,
  getCurrentTrackDisplayCoverDetail
} from '../../src/renderer/src/utils/trackUtils.js'
import { mergeTrackMetaMapPreservingCovers } from '../../src/renderer/src/utils/trackMetaCache.js'

const makeTrack = (path, extra = {}) => ({
  path,
  sizeBytes: extra.sizeBytes ?? 100,
  mtimeMs: extra.mtimeMs ?? 200,
  info: {
    title: extra.title || path,
    artist: extra.artist || 'Artist',
    album: extra.album || 'Album',
    ...(extra.info || {})
  },
  ...extra
})

function createImmediateTimer() {
  let nextId = 1
  const timers = new Map()
  return {
    setTimeoutFn(callback) {
      const id = nextId
      nextId += 1
      timers.set(id, callback)
      return id
    },
    clearTimeoutFn(id) {
      timers.delete(id)
    },
    runAll() {
      const callbacks = Array.from(timers.values())
      timers.clear()
      for (const callback of callbacks) callback()
    }
  }
}

test('cover hydration manager deduplicates requests for the same path', async () => {
  const timer = createImmediateTimer()
  const readCalls = []
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return { entries: {} }
    }
  })

  const first = manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  const second = manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  timer.runAll()
  await manager.whenIdle()

  assert.equal(first.queuedCount, 1)
  assert.equal(second.skippedInFlight, 1)
  assert.equal(readCalls.length, 1)
  assert.equal(readCalls[0].length, 1)
})

test('cover hydration manager skips tracks that already have thumbnail or full cover', () => {
  const timer = createImmediateTimer()
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async () => ({ entries: {} }),
    getCurrentMeta: (path) =>
      path.endsWith('thumb.flac')
        ? { coverThumbUrl: 'file:///thumb.jpg' }
        : path.endsWith('cover.flac')
          ? { cover: 'data:image/jpeg;base64,full-cover' }
          : path.endsWith('default.flac')
            ? { cover: '/assets/default-cover.png' }
          : {}
  })

  const result = manager.requestCoverHydration([
    makeTrack('D:/Music/thumb.flac'),
    makeTrack('D:/Music/cover.flac'),
    makeTrack('D:/Music/default.flac')
  ])

  assert.equal(result.queuedCount, 1)
  assert.equal(result.skippedAlreadyHasCover, 2)
})

test('cover hydration manager merges rapid requests into one batch', async () => {
  const timer = createImmediateTimer()
  const readCalls = []
  const manager = createCoverHydrationManager({
    maxBatchSize: 32,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return { entries: {} }
    }
  })

  manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  manager.requestCoverHydration(makeTrack('D:/Music/b.flac'))
  manager.requestCoverHydration(makeTrack('D:/Music/c.flac'))
  timer.runAll()
  await manager.whenIdle()

  assert.equal(readCalls.length, 1)
  assert.deepEqual(
    readCalls[0].map((seed) => seed.path),
    ['D:/Music/a.flac', 'D:/Music/b.flac', 'D:/Music/c.flac']
  )
})

test('cover hydration manager exposes queue and completion debug stats', async () => {
  const timer = createImmediateTimer()
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async () => ({
      entries: {
        'D:/Music/a.flac': {
          coverThumbUrl: 'file:///thumb.jpg'
        }
      }
    })
  })

  manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  assert.equal(manager.getDebugStats().hydrationQueued, 1)
  timer.runAll()
  await manager.whenIdle()

  assert.equal(manager.getDebugStats().hydrationQueued, 0)
  assert.equal(manager.getDebugStats().hydrationInFlight, 0)
  assert.equal(manager.getDebugStats().hydrationCompleted, 1)
})

test('cover hydration manager merges completed entries while preserving existing fields', async () => {
  const timer = createImmediateTimer()
  let metaMap = {
    'D:/Music/a.flac': {
      title: 'Existing',
      artist: 'Existing Artist',
      fieldSources: { title: 'manual' }
    }
  }
  const cover = 'data:image/jpeg;base64,hydrated-cover'
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: (path) => metaMap[path] || {},
    mergeEntries: (entries) => {
      metaMap = mergeTrackMetaMapPreservingCovers(metaMap, entries)
    },
    readEmbeddedMetadataBatch: async () => ({
      entries: {
        'D:/Music/a.flac': {
          title: 'Hydrated',
          album: 'Album',
          cover,
          coverThumbUrl: 'file:///thumb.jpg',
          fieldSources: { cover: 'embedded-batch' }
        }
      }
    })
  })

  manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  timer.runAll()
  await manager.whenIdle()

  assert.equal(metaMap['D:/Music/a.flac'].title, 'Existing')
  assert.equal(metaMap['D:/Music/a.flac'].artist, 'Existing Artist')
  assert.equal(metaMap['D:/Music/a.flac'].cover, cover)
  assert.equal(metaMap['D:/Music/a.flac'].coverThumbUrl, 'file:///thumb.jpg')
})

test('hydrated thumbnail url is preferred by list cover resolver', () => {
  const entry = {
    cover: 'data:image/jpeg;base64,full-cover',
    coverThumbUrl: 'file:///thumb.jpg'
  }

  assert.deepEqual(resolveTrackCoverSources(entry), [
    'file:///thumb.jpg',
    'data:image/jpeg;base64,full-cover'
  ])
})

test('album cover hydration picks several candidates and does not permanently miss after first failure', () => {
  const album = {
    key: 'album-key',
    name: 'Album',
    tracks: [
      makeTrack('D:/Music/01.flac'),
      makeTrack('D:/Music/02.flac'),
      makeTrack('D:/Music/03.flac'),
      makeTrack('D:/Music/04.flac'),
      makeTrack('D:/Music/05.flac'),
      makeTrack('D:/Music/06.flac')
    ]
  }

  const first = selectAlbumCoverHydrationTracks(album, { maxTracks: 5 })
  const second = selectAlbumCoverHydrationTracks(album, { maxTracks: 5 })

  assert.deepEqual(
    first.map((track) => track.path),
    [
      'D:/Music/01.flac',
      'D:/Music/02.flac',
      'D:/Music/03.flac',
      'D:/Music/04.flac',
      'D:/Music/05.flac'
    ]
  )
  assert.deepEqual(second.map((track) => track.path), first.map((track) => track.path))
})

test('album cover hydration skips albums that already have a ready cover source', () => {
  const album = {
    key: 'album-key',
    name: 'Album',
    tracks: [makeTrack('D:/Music/01.flac'), makeTrack('D:/Music/02.flac')]
  }

  assert.equal(
    selectAlbumCoverHydrationTracks(album, {
      trackMetaMap: {
        'D:/Music/01.flac': { coverThumbUrl: 'file:///thumb.jpg' }
      }
    }).length,
    0
  )
})

test('cover hydration debug logging does not include full data urls', async () => {
  const timer = createImmediateTimer()
  const logs = []
  const cover = 'data:image/jpeg;base64,secret-cover-payload'
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    isDebugEnabled: true,
    logger: (...args) => logs.push(args),
    readEmbeddedMetadataBatch: async () => ({
      entries: {
        'D:/Music/a.flac': {
          cover,
          coverThumbUrl: 'file:///thumb.jpg'
        }
      }
    })
  })

  manager.requestCoverHydration(makeTrack('D:/Music/a.flac'))
  timer.runAll()
  await manager.whenIdle()

  const serialized = JSON.stringify(logs)
  assert.equal(serialized.includes(cover), false)
  assert.equal(serialized.includes('secret-cover-payload'), false)
})

test('hasRealTrackCover does not count placeholders or default paths as real covers', () => {
  assert.equal(hasRealTrackCover({ coverThumbUrl: 'file:///thumb.jpg' }), true)
  assert.equal(hasRealTrackCover({ coverThumbPath: 'C:/thumb.jpg' }), true)
  assert.equal(hasRealTrackCover({ cover: 'data:image/jpeg;base64,abc' }), true)
  assert.equal(hasRealTrackCover({ cover: '/assets/default-cover.png' }), false)
  assert.equal(hasRealTrackCover({ cover: 'placeholder' }), false)
  assert.equal(hasRealTrackCover({ cover: 'https://example.com/cover.jpg' }), false)
  assert.equal(hasRealTrackCover({ cover: '' }), false)
})

test('cover debug stats use the same real-cover missing logic for total and visible samples', () => {
  const tracks = [
    makeTrack('D:/Music/thumb.flac'),
    makeTrack('D:/Music/full.flac'),
    makeTrack('D:/Music/default.flac')
  ]
  const trackMetaMap = {
    'D:/Music/thumb.flac': { coverThumbUrl: 'file:///thumb.jpg' },
    'D:/Music/full.flac': { cover: 'data:image/jpeg;base64,full' },
    'D:/Music/default.flac': { cover: '/assets/default-cover.png' }
  }

  const totalStats = buildTrackCoverDebugStats(tracks, { trackMetaMap })
  const visibleStats = buildTrackCoverDebugStats(tracks, { trackMetaMap })

  assert.equal(totalStats.missingCover, 1)
  assert.equal(visibleStats.missingCover, totalStats.missingCover)
})

test('list cover hydration prewarm scans the first 64 tracks instead of only visible DOM rows', () => {
  const tracks = Array.from({ length: 100 }, (_, index) =>
    makeTrack(`D:/Music/${String(index + 1).padStart(2, '0')}.flac`)
  )
  const trackMetaMap = {}
  for (let index = 54; index < 100; index += 1) {
    trackMetaMap[tracks[index].path] = { coverThumbUrl: `file:///thumb-${index}.jpg` }
  }

  const candidates = selectListCoverHydrationPrewarmTracks(tracks, {
    visibleRange: { startIndex: 0, endIndex: 9 },
    trackMetaMap,
    maxInitialTracks: 64,
    maxWindowTracks: 32
  })

  assert.equal(candidates.length, 54)
  assert.equal(candidates.length > 9, true)
})

test('cover hydration continues queued candidates after a failed batch', async () => {
  const timer = createImmediateTimer()
  const readCalls = []
  let metaMap = {}
  const tracks = Array.from({ length: 34 }, (_, index) =>
    makeTrack(`D:/Music/${String(index + 1).padStart(2, '0')}.flac`)
  )
  const manager = createCoverHydrationManager({
    maxBatchSize: 16,
    maxConcurrentBatches: 1,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: (path) => metaMap[path] || {},
    mergeEntries: (entries) => {
      metaMap = mergeTrackMetaMapPreservingCovers(metaMap, entries)
      return { mergedCount: Object.keys(entries).length, mergeMissCount: 0 }
    },
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds.map((seed) => seed.path))
      if (readCalls.length === 1) {
        return {
          entries: {},
          failedPaths: seeds.map((seed) => seed.path),
          errors: Object.fromEntries(seeds.map((seed) => [seed.path, 'embedded_cover_missing']))
        }
      }
      return {
        entries: Object.fromEntries(
          seeds.map((seed) => [
            seed.path,
            { cover: 'data:image/jpeg;base64,full', coverThumbUrl: `file:///${seed.path}.jpg` }
          ])
        )
      }
    }
  })

  manager.requestCoverHydration(tracks, { reason: 'list-prewarm' })
  timer.runAll()
  await manager.whenIdle()

  assert.equal(readCalls.length, 3)
  assert.equal(manager.getDebugStats().hydrationFailedEmbeddedCoverMissing, 16)
  assert.equal(manager.getDebugStats().hydrationCompleted, 18)
})

test('cover hydration records missing seed fingerprint instead of failing silently', () => {
  const manager = createCoverHydrationManager({
    readEmbeddedMetadataBatch: async () => ({ entries: {} })
  })

  const result = manager.requestCoverHydration({
    path: 'D:/Music/missing-stat.flac',
    info: { title: 'No Stat' }
  })
  const stats = manager.getDebugStats()

  assert.equal(result.queuedCount, 0)
  assert.equal(stats.hydrationFailedNoSeedInfo, 1)
  assert.equal(stats.hydrationLastErrors.length, 1)
})

test('hydration merge stats increase and hydrated thumb is immediately resolvable', async () => {
  const timer = createImmediateTimer()
  let metaMap = {}
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: (path) => metaMap[path] || {},
    mergeEntries: (entries) => {
      metaMap = mergeTrackMetaMapPreservingCovers(metaMap, entries)
      return { mergedCount: Object.keys(entries).length, mergeMissCount: 0 }
    },
    readEmbeddedMetadataBatch: async () => ({
      entries: {
        'D:/Music/a.flac': {
          cover: 'data:image/jpeg;base64,full',
          coverThumbUrl: 'file:///thumb.jpg'
        }
      }
    })
  })

  manager.requestCoverHydration(makeTrack('D:/Music/a.flac'), { reason: 'list-prewarm' })
  timer.runAll()
  await manager.whenIdle()

  assert.equal(manager.getDebugStats().hydrationMergedCount, 1)
  assert.equal(resolveTrackCoverSources(metaMap['D:/Music/a.flac'])[0], 'file:///thumb.jpg')
})

test('album hydration keeps trying later candidates when the first candidate fails', async () => {
  const timer = createImmediateTimer()
  let metaMap = {}
  const album = {
    tracks: [
      makeTrack('D:/Music/01.flac'),
      makeTrack('D:/Music/02.flac'),
      makeTrack('D:/Music/03.flac')
    ]
  }
  const manager = createCoverHydrationManager({
    maxBatchSize: 1,
    maxConcurrentBatches: 1,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: (path) => metaMap[path] || {},
    mergeEntries: (entries) => {
      metaMap = mergeTrackMetaMapPreservingCovers(metaMap, entries)
      return { mergedCount: Object.keys(entries).length, mergeMissCount: 0 }
    },
    readEmbeddedMetadataBatch: async (seeds) => {
      const seed = seeds[0]
      if (seed.path.endsWith('01.flac')) {
        return {
          entries: {},
          failedPaths: [seed.path],
          errors: { [seed.path]: 'metadata_read_failed' }
        }
      }
      return {
        entries: {
          [seed.path]: {
            cover: 'data:image/jpeg;base64,album-cover',
            coverThumbUrl: 'file:///album-thumb.jpg'
          }
        }
      }
    }
  })

  manager.requestCoverHydration(selectAlbumCoverHydrationTracks(album, { maxTracks: 3 }), {
    reason: 'album-prewarm'
  })
  timer.runAll()
  await manager.whenIdle()

  assert.equal(manager.getDebugStats().hydrationFailed, 1)
  assert.equal(manager.getDebugStats().hydrationCompleted, 2)
  assert.equal(resolveTrackCoverSources(metaMap['D:/Music/02.flac'])[0], 'file:///album-thumb.jpg')
})

test('current playback full cover preference is not affected by thumbnail hydration', () => {
  const detail = getCurrentTrackDisplayCoverDetail({
    currentTrack: makeTrack('D:/Music/a.flac'),
    currentTrackMeta: {
      cover: 'data:image/jpeg;base64,full-cover',
      coverThumbUrl: 'file:///thumb.jpg'
    }
  })

  assert.equal(detail.cover, 'data:image/jpeg;base64,full-cover')
})

test('cover source detection recognizes current meta, track info, and top-level covers', () => {
  assert.equal(hasHydratableCoverSource(makeTrack('a.flac'), { coverThumbPath: 'thumb.jpg' }), true)
  assert.equal(
    hasHydratableCoverSource(
      makeTrack('a.flac', { info: { cover: 'data:image/jpeg;base64,full' } })
    ),
    true
  )
  assert.equal(hasHydratableCoverSource(makeTrack('a.flac', { cover: 'default.png' })), false)
  assert.equal(hasHydratableCoverSource(makeTrack('a.flac')), false)
})
