import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../../src/renderer/src/App.jsx', import.meta.url), 'utf8')

test('startup watcher is seeded with existing imported tracks', () => {
  assert.match(
    appSource,
    /watchLibraryFolders\(\{\s*folders:\s*importedFolders,\s*existingTracks/s
  )
})

test('startup with existing library schedules idle incremental scan instead of full startup rescan', () => {
  const branchStart = appSource.indexOf('if (existingPathsForStartupRescan.length > 0) {')
  const fullRescanStart = appSource.indexOf('const doRescan = async () =>', branchStart)

  assert.ok(branchStart > 0, 'existing-library startup branch should exist')
  assert.ok(fullRescanStart > branchStart, 'full startup rescan should be after existing-library branch')

  const existingLibraryBranch = appSource.slice(branchStart, fullRescanStart)
  assert.match(existingLibraryBranch, /reason:\s*'idle'/)
  assert.doesNotMatch(existingLibraryBranch, /reason:\s*'startup'/)
})

test('startup full rescan remains limited to the missing cached-library branch', () => {
  const branchStart = appSource.indexOf('if (existingPathsForStartupRescan.length > 0) {')
  const fullRescanStart = appSource.indexOf('const doRescan = async () =>', branchStart)
  const missingLibraryBranch = appSource.slice(fullRescanStart)

  assert.match(missingLibraryBranch, /reason:\s*'startup'/)
})

test('toolbar missing-track cleanup only removes paths confirmed missing by fresh existence scan', () => {
  const handlerStart = appSource.indexOf('const handleCleanupMissingLibraryFromToolbar')
  assert.ok(handlerStart > 0, 'toolbar cleanup handler should exist')

  const handlerSource = appSource.slice(handlerStart, handlerStart + 1200)
  assert.match(handlerSource, /cleanupMissingLibraryPaths\(\{\s*forceScan:\s*true\s*\}/s)
  assert.doesNotMatch(handlerSource, /includeImportedFolderRescan:\s*true/)
})

test('manual imported-folder cleanup treats changed paths as removed entries', () => {
  const scanStart = appSource.indexOf('const scanImportedFolderMissingPaths')
  const cleanupStart = appSource.indexOf('const cleanupMissingLibraryPaths', scanStart)
  assert.ok(scanStart > 0, 'manual imported-folder cleanup scan should exist')
  assert.ok(cleanupStart > scanStart, 'cleanup callback should follow imported-folder scan')

  const scanSource = appSource.slice(scanStart, cleanupStart)
  assert.match(scanSource, /reason:\s*'manual-cleanup'/)
  assert.match(scanSource, /\.\.\.delta\.removedPaths/)
  assert.match(scanSource, /\.\.\.delta\.renamed\.map\(\(item\)\s*=>\s*item\.from\)/)
})

test('manual album cover loading tries embedded tags before network metadata', () => {
  const effectStart = appSource.indexOf('const targets = albumCoverManualLoadRequest.targets || []')
  assert.ok(effectStart > 0, 'manual album cover loading effect should exist')

  const effectSource = appSource.slice(effectStart, effectStart + 8000)
  const embeddedIndex = effectSource.indexOf('window.api.readTags(path)')
  const networkIndex = effectSource.indexOf('loadNetworkMetadataForEditor')

  assert.ok(embeddedIndex > 0, 'manual album cover loading should read embedded tags')
  assert.ok(networkIndex > embeddedIndex, 'network lookup should happen after embedded tag loading')
  assert.match(effectSource, /buildEmbeddedMetadataAutoCompleteEntry/)
  assert.match(effectSource, /buildNetworkMetadataAutoCompleteEntry/)
})

test('album cover hydrate toolbar button does not render a count badge', () => {
  const buttonStart = appSource.indexOf('browser-toolbar-btn browser-toolbar-btn--album-hydrate')
  assert.ok(buttonStart > 0, 'album hydrate toolbar button should exist')

  const buttonSource = appSource.slice(buttonStart, buttonStart + 700)
  assert.doesNotMatch(buttonSource, /browser-toolbar-badge/)
})
