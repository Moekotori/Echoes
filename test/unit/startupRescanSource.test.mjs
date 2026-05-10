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

test('toolbar missing-track cleanup always performs a fresh scan and imported-folder rescan', () => {
  const handlerStart = appSource.indexOf('const handleCleanupMissingLibraryFromToolbar')
  assert.ok(handlerStart > 0, 'toolbar cleanup handler should exist')

  const handlerSource = appSource.slice(handlerStart, handlerStart + 1200)
  assert.match(handlerSource, /cleanupMissingLibraryPaths\(\{\s*forceScan:\s*true,\s*includeImportedFolderRescan:\s*true\s*\}/s)
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
