import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildTrackMetadataPrefetchPlan } from '../../src/renderer/src/utils/trackMetaCache.js'

const appSource = fs.readFileSync(new URL('../../src/renderer/src/App.jsx', import.meta.url), 'utf8')

function getMetadataPrefetchPlanSource() {
  const start = appSource.indexOf('const metadataPrefetchPlan = useMemo(() => {')
  const end = appSource.indexOf('const metadataPrefetchTracks = metadataPrefetchPlan.tracks', start)
  assert.ok(start > 0, 'metadataPrefetchPlan should exist')
  assert.ok(end > start, 'metadataPrefetchPlan block should be bounded')
  return appSource.slice(start, end)
}

function missingVisibleMetaTrack(path) {
  return {
    path,
    info: {
      artist: 'Unknown Artist',
      cover: ''
    }
  }
}

const isLocalTrack = (track) => String(track?.path || '').startsWith('D:/')

test('metadata prefetch plan keeps visible requirements ahead of ordinary prefetch', () => {
  const planSource = getMetadataPrefetchPlanSource()
  assert.match(planSource, /buildTrackMetadataPrefetchPlan\(/)

  const currentTrack = missingVisibleMetaTrack('D:/Music/current.flac')
  const visibleTrack = missingVisibleMetaTrack('D:/Music/visible.flac')
  const prefetchTracks = [
    missingVisibleMetaTrack('D:/Music/prefetch-1.flac'),
    missingVisibleMetaTrack('D:/Music/prefetch-2.flac'),
    missingVisibleMetaTrack('D:/Music/prefetch-3.flac')
  ]
  const albumTrack = missingVisibleMetaTrack('D:/Music/album-wall.flac')
  const plan = buildTrackMetadataPrefetchPlan({
    currentTrack,
    visibleSidebarTracks: [visibleTrack],
    metadataPrefetchSidebarTracks: prefetchTracks,
    albumWallHydrateTargets: [
      {
        track: albumTrack,
        needsCover: true,
        needsArtist: true,
        needsAlbum: true,
        source: 'album-wall'
      }
    ],
    visibleAheadLimit: 2,
    maxTracks: 10,
    isLocalTrack
  })

  assert.deepEqual(
    plan.tracks.map((track) => track.path),
    [
      currentTrack.path,
      visibleTrack.path,
      prefetchTracks[0].path,
      prefetchTracks[1].path,
      prefetchTracks[2].path,
      albumTrack.path
    ]
  )
  assert.equal(plan.metadataHydrateRequirementByPath.get(visibleTrack.path)?.source, 'visible-row')
  assert.equal(plan.metadataHydrateRequirementByPath.get(prefetchTracks[0].path)?.source, 'visible-row')
  assert.equal(plan.metadataHydrateRequirementByPath.get(prefetchTracks[1].path)?.source, 'visible-row')
  assert.equal(plan.metadataHydrateRequirementByPath.has(prefetchTracks[2].path), false)
})

test('visible-row hydrate requirements are guarded to local non-remote tracks', () => {
  const planSource = getMetadataPrefetchPlanSource()

  assert.match(
    planSource,
    /isLocalAudioFilePath\(candidate\?\.path\)[\s\S]*?!isRemoteTrackPath\(candidate\?\.path\)[\s\S]*?!isStreamingTrackPath\(candidate\?\.path\)/
  )
})
