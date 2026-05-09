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
