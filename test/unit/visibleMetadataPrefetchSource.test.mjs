import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../../src/renderer/src/App.jsx', import.meta.url), 'utf8')

function getMetadataPrefetchPlanSource() {
  const start = appSource.indexOf('const metadataPrefetchPlan = useMemo(() => {')
  const end = appSource.indexOf('const metadataPrefetchTracks = metadataPrefetchPlan.tracks', start)
  assert.ok(start > 0, 'metadataPrefetchPlan should exist')
  assert.ok(end > start, 'metadataPrefetchPlan block should be bounded')
  return appSource.slice(start, end)
}

test('metadata prefetch plan pushes visible rows with a hydrate requirement', () => {
  const planSource = getMetadataPrefetchPlanSource()
  const visibleStart = planSource.indexOf('for (const track of visibleSidebarTracks)')
  const sidebarStart = planSource.indexOf(
    'for (const track of metadataPrefetchSidebarTracks) pushTrack(track)'
  )
  const albumWallStart = planSource.indexOf(
    'for (const target of hydrateTargets) pushTrack(target.track, target)'
  )

  assert.ok(visibleStart > 0, 'visible sidebar rows should be considered first')
  assert.ok(sidebarStart > visibleStart, 'ordinary sidebar prefetch should follow visible rows')
  assert.ok(albumWallStart > sidebarStart, 'album wall hydrate targets should follow sidebar rows')
  assert.match(
    planSource,
    /buildVisibleTrackMetaHydrateRequirement\([\s\S]*?pushTrack\(track, requirement\)/
  )
})

test('visible-row hydrate requirements are guarded to local non-remote tracks', () => {
  const planSource = getMetadataPrefetchPlanSource()

  assert.match(
    planSource,
    /isLocalAudioFilePath\(candidate\?\.path\)[\s\S]*?!isRemoteTrackPath\(candidate\?\.path\)[\s\S]*?!isStreamingTrackPath\(candidate\?\.path\)/
  )
})
