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
  assert.match(
    appSource,
    /const albumOverviewRestoring = listMode === 'album' && pendingAlbumOverviewRestoreRef\.current/
  )
  assert.match(
    appSource,
    /const albumOverviewDisplayActive = albumOverviewActive \|\| albumOverviewRestoring/
  )
  assert.match(appSource, /nextScrollTop < savedScrollTop - 2/)
  assert.match(
    appSource,
    /\(pendingAlbumOverviewRestoreRef\.current \|\| pendingAlbumDetailScrollResetRef\.current\) &&[\s\S]*nextScrollTop < savedScrollTop - 2/
  )
  assert.match(appSource, /playlistElement\.scrollTop = restoreTop/)
})

test('album detail entry does not reset scroll before the transition lands', () => {
  const pickStart = appSource.indexOf('const handlePickAlbumFromSidebar = useCallback(')
  const locateStart = appSource.indexOf('const handleLocateTrackAlbum = useCallback(', pickStart)
  const backStart = appSource.indexOf('const handleBackToAlbumOverview = useCallback(', locateStart)
  assert.ok(pickStart > 0)
  assert.ok(locateStart > pickStart)
  assert.ok(backStart > locateStart)

  const pickSource = appSource.slice(pickStart, locateStart)
  const locateSource = appSource.slice(locateStart, backStart)

  assert.match(pickSource, /pendingAlbumDetailScrollResetRef\.current = true/)
  assert.match(locateSource, /pendingAlbumDetailScrollResetRef\.current = true/)
  assert.doesNotMatch(pickSource, /resetSidebarPlaylistScrollNow\(\)/)
  assert.doesNotMatch(locateSource, /resetSidebarPlaylistScrollNow\(\)/)
})

test('album detail clicks reuse pre-sorted album bucket tracks', () => {
  const pickStart = appSource.indexOf('const handlePickAlbumFromSidebar = useCallback(')
  const locateStart = appSource.indexOf('const handleLocateTrackAlbum = useCallback(', pickStart)
  const backStart = appSource.indexOf('const handleBackToAlbumOverview = useCallback(', locateStart)
  assert.ok(pickStart > 0)
  assert.ok(locateStart > pickStart)
  assert.ok(backStart > locateStart)

  const pickSource = appSource.slice(pickStart, locateStart)
  const locateSource = appSource.slice(locateStart, backStart)

  assert.match(pickSource, /const albumBucket = getAlbumBucketForKey\(albumKey\)/)
  assert.match(locateSource, /const albumBucket = getAlbumBucketForKey\(albumKey\)/)
  assert.match(pickSource, /sortedTracks: albumBucket\?\.tracks \|\| detailTracks/)
  assert.match(locateSource, /sortedTracks: albumBucket\?\.tracks \|\| detailTracks/)
})

test('sidebar scroll metrics are coalesced during album wall scrolling', () => {
  assert.match(appSource, /const sidebarScrollMetricsRafRef = useRef\(0\)/)
  assert.match(appSource, /const sidebarScrollMetricsPendingRef = useRef\(null\)/)
  assert.match(appSource, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*applySidebarScrollMetrics\(next\)/)
  assert.match(
    appSource,
    /albumOverviewDisplayActiveRef\.current &&[\s\S]*!pendingAlbumDetailScrollResetRef\.current &&[\s\S]*albumOverviewScrollTopRef\.current = scrollTop/
  )
})

test('sidebar scrollbar thumb follows scroll through a DOM transform hot path', () => {
  assert.match(appSource, /const sidebarScrollbarThumbRef = useRef\(null\)/)
  assert.match(appSource, /const sidebarScrollThumbRafRef = useRef\(0\)/)
  assert.match(appSource, /const updateSidebarScrollbarThumb = useCallback/)
  assert.match(appSource, /thumb\.style\.transform = `translate3d\(0, \$\{thumbTop\}px, 0\)`/)
  assert.match(appSource, /ref=\{sidebarScrollbarThumbRef\}/)
  assert.match(
    appSource,
    /if \(albumOverviewDisplayActiveRef\.current && !sidebarScrollbarDragRef\.current\) \{[\s\S]*sidebarScrollMetricsPendingRef\.current = nextMetrics[\s\S]*return/
  )

  const scrollStart = appSource.indexOf('const handleSidebarScroll = useCallback(')
  const scrollEnd = appSource.indexOf('const sidebarScrollbarMetrics = useMemo', scrollStart)
  assert.ok(scrollStart > 0)
  assert.ok(scrollEnd > scrollStart)
  const scrollSource = appSource.slice(scrollStart, scrollEnd)
  assert.match(scrollSource, /updateSidebarScrollbarThumb\(nextMetrics\)/)
  assert.doesNotMatch(scrollSource, /setSidebarScrollTop/)
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
  assert.match(appSource, /scrollElementRef=\{albumOverviewDisplayActive \? sidebarPlaylistRef : null\}/)
  assert.match(appSource, /freezeMeasurements=\{!albumOverviewDisplayActive\}/)
  assert.match(appSource, /const \[albumOverviewRestoreToken, setAlbumOverviewRestoreToken\]/)
  assert.match(appSource, /const \[albumOverviewRestoreScrollTop, setAlbumOverviewRestoreScrollTop\]/)
  assert.match(appSource, /const albumOverviewScrollRestoreActive =[\s\S]*albumOverviewDisplayActive &&[\s\S]*pendingAlbumOverviewRestoreRef\.current &&[\s\S]*albumOverviewRestoreToken > 0/)
  assert.match(appSource, /suppressScrollRestore=\{!albumOverviewScrollRestoreActive\}/)
  assert.match(appSource, /initialScrollTop=\{[\s\S]*albumOverviewScrollRestoreActive \? albumOverviewRestoreScrollTop : 0[\s\S]*\}/)
  assert.match(
    appSource,
    /scrollRestorationKey=\{[\s\S]*albumOverviewScrollRestoreActive[\s\S]*\? `albums-\$\{metadataIdentityVersion\}-\$\{albumGroupsFiltered\.length\}-\$\{albumOverviewRestoreToken\}`[\s\S]*: ''[\s\S]*\}/
  )
})

test('album overview return restore uses saved scroll state', () => {
  assert.match(appSource, /const captureAlbumOverviewScrollTop = useCallback/)
  assert.match(
    appSource,
    /albumOverviewScrollTopRef\.current = nextScrollTop[\s\S]*setAlbumOverviewRestoreScrollTop\(nextScrollTop\)/
  )
  assert.match(appSource, /captureAlbumOverviewScrollTop\(\)[\s\S]*pendingAlbumDetailScrollResetRef\.current = true/)
  assert.match(
    appSource,
    /setAlbumOverviewRestoreScrollTop\(Math\.max\(0, Number\(albumOverviewScrollTopRef\.current\) \|\| 0\)\)[\s\S]*setAlbumOverviewRestoreToken\(\(token\) => token \+ 1\)[\s\S]*pendingAlbumOverviewRestoreRef\.current = true/
  )
  assert.match(
    appSource,
    /const restoreTop = Math\.max\([\s\S]*Number\(albumOverviewRestoreScrollTop\) \|\| 0[\s\S]*Number\(albumOverviewScrollTopRef\.current\) \|\| 0[\s\S]*\)/
  )
  assert.match(
    appSource,
    /const restoreScroll = \(\) => \{[\s\S]*window\.requestAnimationFrame\(\(\) => \{[\s\S]*playlistElement\.scrollTop = restoreTop[\s\S]*window\.requestAnimationFrame\(\(\) => \{[\s\S]*applySidebarScrollMetrics/
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

test('album wall virtual range keeps a relaxed recycle window', () => {
  assert.match(virtualGridSource, /const RENDER_RANGE_IDLE_SHRINK_MS = 1600/)
  assert.match(virtualGridSource, /const MAX_RENDER_ROWS = 72/)
  assert.match(appSource, /const ALBUM_GRID_OVERSCAN_ROWS = 14/)
  assert.match(appSource, /const ALBUM_GRID_RESTORE_OVERSCAN_ROWS = 28/)
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
  assert.match(appSource, /const albumOverviewMounted =[\s\S]*albumOverviewDisplayActive \|\| albumDetailLeaving/)
  assert.match(appSource, /playlist\.length > 0 && listMode === 'album' && albumOverviewMounted/)
  assert.match(appSource, /aria-hidden=\{!albumOverviewDisplayActive\}/)
  assert.match(appSource, /inert=\{!albumOverviewDisplayActive \? '' : undefined\}/)
})

test('album detail return layers do not push the restored album wall', () => {
  assert.match(appSource, /sidebar-list-stack--album-returning/)
  assert.match(
    appSource,
    /albumDetailLeaving \? ' sidebar-list-stack--album-returning' : ''/
  )
  assert.match(indexCssSource, /\.sidebar-list-stack--album-returning\s*\{[\s\S]*position\s*:\s*relative/)
  assert.match(
    indexCssSource,
    /\.sidebar-list-stack--album-returning \.library-list-header--album-detail,[\s\S]*\.sidebar-list-stack--album-returning \.playlist-virtual-list--album-leaving\s*\{[\s\S]*position\s*:\s*absolute/
  )
  assert.match(
    indexCssSource,
    /\.sidebar-list-stack--album-returning \.playlist-virtual-list--album-leaving\s*\{[\s\S]*overflow\s*:\s*hidden/
  )
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
  assert.match(
    appSource,
    /if \(ignoreUntil > now\) \{[\s\S]*scrollElement\.scrollTop = 0[\s\S]*applySidebarScrollMetrics\(\{[\s\S]*scrollTop: 0/
  )
  assert.match(appSource, /pendingAlbumDetailScrollResetRef\.current = true[\s\S]*resetSidebarPlaylistScrollNow\(\)/)
})

test('album wall buckets are prewarmed outside the album click frame', () => {
  assert.match(appSource, /const albumWallBucketCacheRef = useRef\(\{ key: '', buckets: \[\] \}\)/)
  assert.match(appSource, /const albumWallBucketCacheKey = useMemo/)
  assert.match(appSource, /const buildAlbumBucketsForCache = useCallback/)
  assert.match(appSource, /album-detail-track-sort/)
  assert.match(appSource, /window\.requestIdleCallback\(runPrewarm/)
  assert.match(appSource, /listMode !== 'songs' && listMode !== 'album'/)

  const bucketStart = appSource.indexOf('const albumBuckets = useMemo(() => {')
  const bucketEnd = appSource.indexOf('const albumGroups = listMode ===', bucketStart)
  assert.ok(bucketStart > 0)
  assert.ok(bucketEnd > bucketStart)
  const bucketSource = appSource.slice(bucketStart, bucketEnd)
  assert.match(bucketSource, /const cached = albumWallBucketCacheRef\.current/)
  assert.match(bucketSource, /cached\?\.key === albumWallBucketCacheKey/)
  assert.doesNotMatch(bucketSource, /buildAlbumWallBuckets/)
})

test('album cover backfill waits for album cover cache hydration', () => {
  assert.match(appSource, /const \[albumCoverCacheHydratedKey, setAlbumCoverCacheHydratedKey\]/)
  assert.match(appSource, /const albumCoverCacheHydrated =/)
  assert.match(appSource, /setAlbumCoverCacheHydratedKey\(albumCoverCacheTargetsKey\)/)
  assert.match(
    appSource,
    /enabled:\s*albumCoverCacheHydrated &&[\s\S]*listMode === 'album' &&[\s\S]*albumOverviewDisplayActive/
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
  const start = appSource.indexOf('const buildAlbumBucketsForCache = useCallback(() => {')
  const end = appSource.indexOf('const commitAlbumWallBucketCache', start)
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
