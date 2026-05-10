import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  getLibraryDetailCacheEntry,
  makeLibraryDetailCacheKey,
  setLibraryDetailCacheEntry
} from '../../src/renderer/src/utils/libraryDetailCache.js'

const appSource = fs.readFileSync(
  new URL('../../src/renderer/src/App.jsx', import.meta.url),
  'utf8'
)
const virtualGridSource = fs.readFileSync(
  new URL('../../src/renderer/src/components/VirtualAlbumGrid.jsx', import.meta.url),
  'utf8'
)

test('VirtualAlbumGrid exposes scroll restoration state hooks', () => {
  assert.match(virtualGridSource, /initialScrollTop = 0/)
  assert.match(virtualGridSource, /scrollRestorationKey = ''/)
  assert.match(virtualGridSource, /onScrollStateChange/)
  assert.match(virtualGridSource, /preserveMeasurements = null/)
  assert.match(virtualGridSource, /scrollElement\.scrollTop = nextScrollTop/)
})

test('album visible range hydrate is delayed and deduped', () => {
  assert.match(appSource, /albumOverviewVisibleRangeKeyRef/)
  assert.match(appSource, /albumOverviewHydrateTimerRef/)
  assert.match(appSource, /window\.setTimeout\(\(\) => \{[\s\S]*setVisibleAlbumRange/)
})

test('album overview return keeps scroll memory during restoration', () => {
  assert.match(appSource, /pendingAlbumOverviewRestoreRef\.current = true/)
  assert.match(appSource, /nextScrollTop < savedScrollTop - 2/)
  assert.match(appSource, /playlistElement\.scrollTop = restoreTop/)
})

test('album overview keeps visible cover paths while detail is open', () => {
  assert.match(appSource, /albumOverviewVisibleCoverKeepPathsRef/)
  assert.match(appSource, /albumOverviewVisibleCoverKeepPathsRef\.current = keepPaths/)
  assert.match(appSource, /for \(const path of albumOverviewVisibleCoverKeepPathsRef\.current/)
})

test('artist bucket grouping does not depend on cover-only maps', () => {
  const start = appSource.indexOf('const artistBucketBase = useMemo(() => {')
  const end = appSource.indexOf('const artistBuckets = useMemo(() => {', start)
  assert.ok(start > 0)
  assert.ok(end > start)
  const source = appSource.slice(start, end)
  assert.doesNotMatch(source, /albumCoverMap/)
  assert.match(source, /trackMetaMapRef\.current/)
  assert.match(source, /parseTrackInfo\(track, identityMeta\)/)
  assert.doesNotMatch(source.slice(source.lastIndexOf('}, [')), /trackMetaMap/)
  assert.match(source, /buildArtistBucketsWithAvatars/)
})

test('album bucket grouping reads identity metadata without cover-only dependencies', () => {
  const start = appSource.indexOf('const albumBuckets = useMemo(() => {')
  const end = appSource.indexOf('const albumGroups = listMode ===', start)
  assert.ok(start > 0)
  assert.ok(end > start)
  const source = appSource.slice(start, end)

  assert.match(source, /trackMetaMapRef\.current/)
  assert.match(source, /parseTrackInfo\(track, identityMeta\)/)
  assert.match(source, /displayMetadataOverrides/)
  assert.match(source, /folderAlbumIdentities/)
  assert.match(source, /getTrackAlbumFolderKey/)
  assert.doesNotMatch(source.slice(source.lastIndexOf('}, [')), /albumCoverMap/)
})

test('album detail cache hits under the same library metadata versions', () => {
  const cache = new Map()
  const key = makeLibraryDetailCacheKey('album', 'real album', 'library-v1', 3)
  const detail = {
    tracks: [{ path: 'D:/Music/a.flac' }],
    sortedTracks: [{ path: 'D:/Music/a.flac' }]
  }

  setLibraryDetailCacheEntry(cache, key, detail)

  assert.equal(getLibraryDetailCacheEntry(cache, key)?.tracks, detail.tracks)
})

test('album detail cache invalidates when library version changes', () => {
  const cache = new Map()
  const oldKey = makeLibraryDetailCacheKey('album', 'real album', 'library-v1', 3)
  const nextKey = makeLibraryDetailCacheKey('album', 'real album', 'library-v2', 3)

  setLibraryDetailCacheEntry(cache, oldKey, { tracks: [{ path: 'D:/Music/a.flac' }] })

  assert.equal(getLibraryDetailCacheEntry(cache, nextKey), null)
})
