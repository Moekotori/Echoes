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
const trackUtilsSource = fs.readFileSync(
  new URL('../../src/renderer/src/utils/trackUtils.js', import.meta.url),
  'utf8'
)
const indexCssSource = fs.readFileSync(
  new URL('../../src/renderer/src/index.css', import.meta.url),
  'utf8'
)

test('VirtualAlbumGrid exposes scroll restoration state hooks', () => {
  assert.match(virtualGridSource, /initialScrollTop = 0/)
  assert.match(virtualGridSource, /scrollRestorationKey = ''/)
  assert.match(virtualGridSource, /onScrollStateChange/)
  assert.match(virtualGridSource, /preserveMeasurements = null/)
  assert.match(virtualGridSource, /suppressScrollRestore = false/)
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
  assert.match(appSource, /collectAlbumOverviewCoverKeepPaths/)
  assert.match(appSource, /for \(const path of albumOverviewVisibleCoverKeepPathsRef\.current/)
})

test('VirtualAlbumGrid restores from relative scroll state with row clamps', () => {
  assert.match(virtualGridSource, /const scrollTop = Math\.max\(0, Math\.round\(Number\(value\.scrollTop\) \|\| 0\)\)/)
  assert.match(virtualGridSource, /value\.relativeScrollTop == null\s*\?\s*scrollTop/)
  assert.match(
    virtualGridSource,
    /scrollTop: preservedMetrics\?\.relativeScrollTop \?\? preservedMetrics\?\.scrollTop \?\? 0/
  )
  assert.match(
    virtualGridSource,
    /absoluteScrollTop: preservedMetrics\?\.scrollTop \?\? preservedMetrics\?\.relativeScrollTop \?\? 0/
  )
  assert.match(virtualGridSource, /const rawVisibleStartRow = Math\.max/)
  assert.match(virtualGridSource, /Math\.min\(rowCount - 1, rawVisibleStartRow\)/)
  assert.match(virtualGridSource, /Math\.max\(visibleStartRow \+ 1, Math\.min\(rowCount, rawVisibleEndRowExclusive\)\)/)
})

test('VirtualAlbumGrid freezes render range and restores scroll by signature', () => {
  assert.match(virtualGridSource, /const wasFrozenRef = useRef\(freezeMeasurements\)/)
  assert.match(virtualGridSource, /if \(freezeMeasurements\) return undefined/)
  assert.match(virtualGridSource, /const wasFrozen = wasFrozenRef\.current/)
  assert.match(virtualGridSource, /scrollElement\.scrollTop = Math\.max\(0, Number\(initialScrollTop\) \|\| 0\)/)
  assert.match(virtualGridSource, /measure\(\)\s*scheduleMeasure\(\)/)
  assert.match(
    virtualGridSource,
    /const restoreSignature = `\$\{restoreKey\}\\u0001\$\{Math\.round\(Number\(initialScrollTop\) \|\| 0\)\}`/
  )
  assert.match(virtualGridSource, /restoredKeyRef\.current === restoreSignature/)
})

test('VirtualAlbumGrid suppresses external scroll restoration while hidden', () => {
  assert.match(virtualGridSource, /if \(freezeMeasurements \|\| suppressScrollRestore\) return/)
  assert.match(
    virtualGridSource,
    /if \(freezeMeasurements \|\| suppressScrollRestore \|\| !wasFrozen\) return/
  )
  assert.match(appSource, /scrollElementRef=\{albumOverviewActive \? sidebarPlaylistRef : null\}/)
  assert.match(appSource, /freezeMeasurements=\{!albumOverviewActive\}/)
  assert.match(appSource, /const albumOverviewScrollRestoreActive =[\s\S]*albumOverviewActive && pendingAlbumOverviewRestoreRef\.current/)
  assert.match(appSource, /suppressScrollRestore=\{!albumOverviewScrollRestoreActive\}/)
  assert.match(
    appSource,
    /scrollRestorationKey=\{[\s\S]*albumOverviewScrollRestoreActive[\s\S]*\? `albums-\$\{metadataIdentityVersion\}-\$\{albumGroupsFiltered\.length\}`[\s\S]*: ''[\s\S]*\}/
  )
})

test('VirtualAlbumGrid stays passive while album overview is frozen', () => {
  assert.match(
    virtualGridSource,
    /useEffect\(\(\) => \{\s*if \(freezeMeasurements\) return undefined[\s\S]*scrollElement\.addEventListener\('scroll', scheduleMeasure/
  )
  assert.match(
    virtualGridSource,
    /useEffect\(\(\) => \{\s*if \(freezeMeasurements\) return\s*if \(typeof onVisibleRangeChange !== 'function'\) return/
  )
  assert.match(
    virtualGridSource,
    /useEffect\(\(\) => \{\s*if \(freezeMeasurements\) return\s*if \(typeof onScrollStateChange !== 'function'\) return/
  )
})

test('album wall hidden layer stays mounted without display none', () => {
  const match = indexCssSource.match(/\.album-browser--hidden\s*\{([\s\S]*?)\n\}/)
  assert.ok(match, 'album-browser--hidden rule should exist')
  assert.doesNotMatch(match[1], /display\s*:\s*none/i)
  assert.match(match[1], /position\s*:\s*absolute/)
  assert.doesNotMatch(match[1], /inset\s*:\s*0/i)
  assert.match(match[1], /width\s*:\s*1px/)
  assert.match(match[1], /height\s*:\s*1px/)
  assert.match(match[1], /opacity\s*:\s*0/)
  assert.match(match[1], /visibility\s*:\s*hidden/)
  assert.match(match[1], /pointer-events\s*:\s*none/)
  assert.match(match[1], /z-index\s*:\s*-?[\w-]+/)
  assert.match(match[1], /contain\s*:[^;]*(layout|paint)/)
  assert.match(appSource, /className=\{`album-browser no-drag/)
  assert.match(appSource, /const albumOverviewMounted =[\s\S]*albumOverviewActive \|\| albumDetailLeaving \|\| pendingAlbumOverviewRestoreRef\.current/)
  assert.match(appSource, /playlist\.length > 0 && listMode === 'album' && albumOverviewMounted/)
  assert.match(appSource, /aria-hidden=\{!albumOverviewActive\}/)
  assert.match(appSource, /inert=\{!albumOverviewActive \? '' : undefined\}/)
})

test('album detail scroll reset is one-shot', () => {
  const start = appSource.lastIndexOf(
    'useLayoutEffect(() => {',
    appSource.indexOf('!pendingAlbumDetailScrollResetRef.current')
  )
  const end = appSource.indexOf('const handlePickFolderFromSidebar', start)
  assert.ok(start > 0)
  assert.ok(end > start)
  const source = appSource.slice(start, end)
  assert.match(source, /pendingAlbumDetailScrollResetRef\.current = false[\s\S]*resetSidebarPlaylistScrollNow\(\)/)
  assert.doesNotMatch(source.slice(source.lastIndexOf('}, [')), /sidebarScrollTop|visibleAlbumRange/)
  assert.match(appSource, /const rangeScrollTop =[\s\S]*pendingAlbumDetailScrollResetRef\.current[\s\S]*\? 0[\s\S]*: sidebarScrollTop/)
  assert.match(appSource, /albumDetailScrollResetIgnoreUntilRef/)
  assert.match(appSource, /const \[albumDetailScrollResetVersion, setAlbumDetailScrollResetVersion\]/)
  assert.match(appSource, /setAlbumDetailScrollResetVersion\(\(version\) => version \+ 1\)/)
  assert.match(appSource, /if \(ignoreUntil > now\) \{[\s\S]*event\.currentTarget\.scrollTop = 0[\s\S]*setSidebarScrollTop\(0\)/)
  assert.match(appSource, /pendingAlbumDetailScrollResetRef\.current = true[\s\S]*resetSidebarPlaylistScrollNow\(\)/)
})

test('album cover backfill waits for album cover cache hydration', () => {
  assert.match(appSource, /const \[albumCoverCacheHydratedKey, setAlbumCoverCacheHydratedKey\]/)
  assert.match(appSource, /const albumCoverCacheHydrated =/)
  assert.match(appSource, /setAlbumCoverCacheHydratedKey\(albumCoverCacheTargetsKey\)/)
  assert.match(
    appSource,
    /enabled:\s*albumCoverCacheHydrated &&[\s\S]*listMode === 'album' &&[\s\S]*selectedAlbum === 'all'/
  )
})

test('album detail layer is isolated above the preserved album wall', () => {
  const match = indexCssSource.match(/\.album-detail-layer\s*\{([\s\S]*?)\n\}/)
  assert.ok(match, 'album-detail-layer rule should exist')
  assert.match(match[1], /position\s*:\s*relative/)
  assert.match(match[1], /z-index\s*:\s*1/)
  assert.match(match[1], /isolation\s*:\s*isolate/)
  assert.match(indexCssSource, /\.playlist-virtual-list\.album-detail-layer\s*\{[\s\S]*background\s*:/)
  assert.match(appSource, /library-list-header--album-detail album-detail-layer/)
  assert.match(appSource, /playlist-virtual-list--album-enter album-detail-layer/)
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

test('album bucket grouping delegates identity metadata resolution', () => {
  const start = appSource.indexOf('const albumBuckets = useMemo(() => {')
  const end = appSource.indexOf('const albumGroups = listMode ===', start)
  assert.ok(start > 0)
  assert.ok(end > start)
  const source = appSource.slice(start, end)

  assert.match(source, /trackMetaMapRef\.current/)
  assert.match(source, /displayMetadataOverrides/)
  assert.match(source, /buildAlbumWallBuckets/)

  const helperStart = trackUtilsSource.indexOf('export function buildAlbumWallBuckets(')
  const helperEnd = trackUtilsSource.indexOf('function resolvePriorityField', helperStart)
  assert.ok(helperStart > 0)
  assert.ok(helperEnd > helperStart)
  const helperSource = trackUtilsSource.slice(helperStart, helperEnd)
  assert.match(helperSource, /parseTrackInfo\(track, identityMeta\)/)
  assert.match(helperSource, /folderAlbumIdentities/)
  assert.match(helperSource, /getTrackAlbumFolderKey/)
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
