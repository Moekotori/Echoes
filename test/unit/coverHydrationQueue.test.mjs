import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createCoverThumbOnlyPrewarmManager,
  createCoverHydrationManager,
  DEFAULT_COVER_HYDRATION_BATCH_SIZE,
  DEFAULT_COVER_HYDRATION_CONCURRENCY,
  DEFAULT_COVER_HYDRATION_DEBOUNCE_MS,
  DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT,
  DEFAULT_LIST_COVER_PREWARM_WINDOW_LIMIT,
  hasHydratableCoverSource,
  scheduleListCoverHydrationIdlePrewarm,
  selectListCoverHydrationIdlePrewarmTracks,
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

test('cover hydration defaults use faster phase 2c tuning', async () => {
  assert.equal(DEFAULT_COVER_HYDRATION_BATCH_SIZE, 24)
  assert.equal(DEFAULT_COVER_HYDRATION_CONCURRENCY, 3)
  assert.equal(DEFAULT_COVER_HYDRATION_DEBOUNCE_MS, 100)

  const timer = createImmediateTimer()
  const readCalls = []
  const tracks = Array.from({ length: 70 }, (_, index) =>
    makeTrack(`D:/Music/tuned-${String(index + 1).padStart(2, '0')}.flac`)
  )
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return { entries: {} }
    }
  })

  manager.requestCoverHydration(tracks, { reason: 'list-prewarm' })
  timer.runAll()
  await manager.whenIdle()

  assert.deepEqual(
    readCalls.map((batch) => batch.length),
    [24, 24, 22]
  )
  assert.equal(manager.getDebugStats().hydrationQueuePeakSize, 70)
})

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

test('thumb-only prewarm merges cached thumbs and skips heavy hydration hits', async () => {
  const trackWithThumb = makeTrack('D:/Music/thumb-hit.flac')
  const trackWithoutThumb = makeTrack('D:/Music/thumb-miss.flac')
  let metaMap = {}
  const manager = createCoverThumbOnlyPrewarmManager({
    readCoverThumbBatch: async () => ({
      entries: {
        [trackWithThumb.path]: {
          path: trackWithThumb.path,
          coverThumbUrl: 'file:///thumb-hit.jpg',
          coverThumbPath: 'D:/Cache/thumb-hit.jpg',
          coverKey: 'thumb-key',
          coverChecked: true
        }
      },
      hitPaths: [trackWithThumb.path],
      missPaths: [trackWithoutThumb.path],
      missingThumbPaths: [],
      elapsedMs: 3
    }),
    getCurrentMeta: (path) => metaMap[path] || {},
    mergeEntries: (entries) => {
      metaMap = mergeTrackMetaMapPreservingCovers(metaMap, entries)
      return { mergedCount: Object.keys(entries).length }
    }
  })

  const result = await manager.prewarmThumbsBeforeHydration(
    [trackWithThumb, trackWithoutThumb],
    {
      runKey: 'list-a',
      reason: 'list-prewarm',
      scope: 'list-prewarm'
    }
  )

  assert.deepEqual(
    result.tracksToHydrate.map((track) => track.path),
    [trackWithoutThumb.path]
  )
  assert.equal(resolveTrackCoverSources(metaMap[trackWithThumb.path])[0], 'file:///thumb-hit.jpg')
  assert.equal(metaMap[trackWithThumb.path].cover, undefined)
  assert.deepEqual(manager.getDebugStats(), {
    thumbOnlyRequestCount: 1,
    thumbOnlyHitCount: 1,
    thumbOnlyMissCount: 1,
    thumbOnlyMissingFileCount: 0,
    thumbOnlyMergedCount: 1,
    thumbOnlyElapsedMs: 3,
    heavyHydrationAvoidedCount: 1,
    thumbOnlyMissNoRecord: 0,
    thumbOnlyMissFingerprintMismatch: 0,
    thumbOnlyMissNoThumbPath: 0,
    thumbOnlyMissInvalidMeta: 0,
    thumbOnlyMissMissingThumbFile: 0,
    thumbOnlyMissZeroByteThumb: 0,
    thumbOnlySeedMissingFingerprint: 0,
    thumbOnlyRequestUniqueCount: 2
  })
})

test('thumb-only miss is the only path forwarded to heavy hydration', async () => {
  const hit = makeTrack('D:/Music/hit.flac')
  const miss = makeTrack('D:/Music/miss.flac')
  const manager = createCoverThumbOnlyPrewarmManager({
    readCoverThumbBatch: async () => ({
      entries: {
        [hit.path]: {
          path: hit.path,
          coverThumbUrl: 'file:///hit.jpg',
          coverThumbPath: 'D:/Cache/hit.jpg'
        }
      },
      hitPaths: [hit.path],
      missPaths: [miss.path],
      missingThumbPaths: [miss.path],
      thumbOnlyMissMissingThumbFile: 1,
      thumbOnlyRequestUniqueCount: 2,
      elapsedMs: 1
    }),
    getCurrentMeta: () => ({}),
    mergeEntries: () => ({ mergedCount: 1 })
  })

  const result = await manager.prewarmThumbsBeforeHydration([hit, miss], {
    runKey: 'album-a',
    reason: 'album-prewarm',
    scope: 'album-prewarm'
  })

  assert.deepEqual(result.tracksToHydrate, [miss])
  assert.equal(manager.getDebugStats().thumbOnlyMissingFileCount, 1)
  assert.equal(manager.getDebugStats().thumbOnlyMissMissingThumbFile, 1)
  assert.equal(manager.getDebugStats().thumbOnlyRequestUniqueCount, 2)
})

test('cover hydration skips tracks that already have network thumbnails', async () => {
  const timer = createImmediateTimer()
  const track = makeTrack('D:/Music/network-thumb.flac')
  const readCalls = []
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: () => ({
      coverThumbUrl: 'file:///network-thumb.jpg',
      coverSource: 'network',
      coverChecked: true
    }),
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return { entries: {} }
    }
  })

  const result = manager.requestCoverHydration(track, { reason: 'list-prewarm' })
  timer.runAll()
  await manager.whenIdle()

  assert.equal(result.queuedCount, 0)
  assert.equal(readCalls.length, 0)
  assert.equal(manager.getDebugStats().hydrationSkippedHasNetworkCover, 1)
})

test('cover hydration skips tracks with no embedded cover already checked', async () => {
  const timer = createImmediateTimer()
  const track = makeTrack('D:/Music/no-embedded-cover.flac')
  const readCalls = []
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCurrentMeta: () => ({
      coverChecked: true,
      embeddedPictureCount: 0
    }),
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return { entries: {} }
    }
  })

  const result = manager.requestCoverHydration(track, { reason: 'list-prewarm' })
  timer.runAll()
  await manager.whenIdle()

  assert.equal(result.queuedCount, 0)
  assert.equal(readCalls.length, 0)
  assert.equal(manager.getDebugStats().hydrationSkippedNoEmbeddedCoverChecked, 1)
})

test('thumb-only stale result is ignored after search or sort switches scope key', async () => {
  const oldTrack = makeTrack('D:/Music/old.flac')
  const newTrack = makeTrack('D:/Music/new.flac')
  let resolveOld = null
  let merged = {}
  const manager = createCoverThumbOnlyPrewarmManager({
    readCoverThumbBatch: async (seeds) => {
      if (seeds[0].path === oldTrack.path) {
        return await new Promise((resolve) => {
          resolveOld = resolve
        })
      }
      return {
        entries: {
          [newTrack.path]: { path: newTrack.path, coverThumbUrl: 'file:///new.jpg' }
        },
        hitPaths: [newTrack.path],
        missPaths: [],
        missingThumbPaths: [],
        elapsedMs: 1
      }
    },
    getCurrentMeta: () => ({}),
    mergeEntries: (entries) => {
      merged = { ...merged, ...entries }
      return { mergedCount: Object.keys(entries).length }
    }
  })

  const oldRun = manager.prewarmThumbsBeforeHydration([oldTrack], {
    runKey: 'query:old',
    reason: 'list-prewarm',
    scope: 'list-prewarm'
  })
  const newRun = await manager.prewarmThumbsBeforeHydration([newTrack], {
    runKey: 'query:new',
    reason: 'list-prewarm',
    scope: 'list-prewarm'
  })
  resolveOld({
    entries: {
      [oldTrack.path]: { path: oldTrack.path, coverThumbUrl: 'file:///old.jpg' }
    },
    hitPaths: [oldTrack.path],
    missPaths: [],
    missingThumbPaths: [],
    elapsedMs: 10
  })
  const oldResult = await oldRun

  assert.equal(newRun.stale, false)
  assert.equal(oldResult.stale, true)
  assert.equal(merged[newTrack.path].coverThumbUrl, 'file:///new.jpg')
  assert.equal(merged[oldTrack.path], undefined)
})

test('cover hydration manager skips thumbnail hits but still hydrates full-cover-only cache entries', () => {
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

  assert.equal(result.queuedCount, 2)
  assert.equal(result.skippedAlreadyHasCover, 1)
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

test('list cover hydration prewarm scans the first 120 tracks and visible window without full-library scan', () => {
  const tracks = Array.from({ length: 260 }, (_, index) =>
    makeTrack(`D:/Music/${String(index + 1).padStart(2, '0')}.flac`)
  )
  const trackMetaMap = {}
  for (let index = 110; index < 260; index += 1) {
    trackMetaMap[tracks[index].path] = { coverThumbUrl: `file:///thumb-${index}.jpg` }
  }

  const candidates = selectListCoverHydrationPrewarmTracks(tracks, {
    visibleRange: { startIndex: 160, endIndex: 170 },
    trackMetaMap,
    maxInitialTracks: DEFAULT_LIST_COVER_PREWARM_INITIAL_LIMIT,
    maxWindowTracks: DEFAULT_LIST_COVER_PREWARM_WINDOW_LIMIT
  })

  assert.equal(candidates.length, 110)
  assert.equal(candidates.length > 64, true)
  assert.equal(candidates.some((track) => track.path.endsWith('260.flac')), false)
})

test('idle prewarm selects a capped low-priority window after the visible range', () => {
  const tracks = Array.from({ length: 1000 }, (_, index) =>
    makeTrack(`D:/Music/idle-${String(index + 1).padStart(4, '0')}.flac`)
  )
  const candidates = selectListCoverHydrationIdlePrewarmTracks(tracks, {
    visibleRange: { startIndex: 0, endIndex: 20 },
    maxTracks: 160,
    maxScanTracks: 200,
    excludePaths: new Set([tracks[20].path])
  })

  assert.equal(candidates.length, 160)
  assert.equal(candidates[0].path, tracks[21].path)
  assert.equal(candidates.at(-1).path, tracks[180].path)
  assert.equal(candidates.some((track) => track.path === tracks[999].path), false)
})

test('idle prewarm scheduler fires after inactivity and can be cancelled', () => {
  const timer = createImmediateTimer()
  const requests = []
  const cancel = scheduleListCoverHydrationIdlePrewarm({
    delayMs: 2000,
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    getCandidates: () => [makeTrack('D:/Music/idle-a.flac')],
    requestHydration: (tracks, options) => requests.push({ tracks, options })
  })

  timer.runAll()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.reason, 'list-idle-prewarm')
  cancel()

  const timer2 = createImmediateTimer()
  const cancelledRequests = []
  const cancelBeforeRun = scheduleListCoverHydrationIdlePrewarm({
    delayMs: 2000,
    setTimeoutFn: timer2.setTimeoutFn,
    clearTimeoutFn: timer2.clearTimeoutFn,
    getCandidates: () => [makeTrack('D:/Music/idle-b.flac')],
    requestHydration: (tracks) => cancelledRequests.push(tracks)
  })
  cancelBeforeRun()
  timer2.runAll()
  assert.equal(cancelledRequests.length, 0)
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

test('idle prewarm reuses queue dedupe and reports throughput debug stats', async () => {
  const timer = createImmediateTimer()
  const readCalls = []
  const manager = createCoverHydrationManager({
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
    readEmbeddedMetadataBatch: async (seeds) => {
      readCalls.push(seeds)
      return {
        entries: Object.fromEntries(
          seeds.map((seed) => [seed.path, { coverThumbUrl: `file:///${seed.path}.jpg` }])
        )
      }
    }
  })

  manager.requestCoverHydration(
    [makeTrack('D:/Music/idle-a.flac'), makeTrack('D:/Music/idle-a.flac')],
    { reason: 'list-idle-prewarm' }
  )
  timer.runAll()
  await manager.whenIdle()
  const stats = manager.getDebugStats()

  assert.equal(readCalls.length, 1)
  assert.equal(readCalls[0].length, 1)
  assert.equal(stats.hydrationIdlePrewarmCandidateCount, 2)
  assert.equal(stats.hydrationIdlePrewarmQueuedCount, 1)
  assert.equal(stats.hydrationAverageBatchElapsedMs >= 0, true)
  assert.equal(stats.hydrationTotalElapsedMs >= 0, true)
  assert.equal(stats.hydrationThroughputPerSecond >= 0, true)
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
