import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isImmersiveLyricsMvEnabled,
  isSideLyricsMvEnabled,
  shouldPreloadMvForPlayback,
  shouldSearchMvForPlayback,
  shouldLoadMvForSurface
} from '../../src/renderer/src/utils/mvVisibility.js'

test('lyrics MV master switch gates side and immersive lyrics MV modes', () => {
  assert.equal(isSideLyricsMvEnabled({ enableMV: false, mvAsBackground: false }), false)
  assert.equal(isImmersiveLyricsMvEnabled({ enableMV: false, mvAsBackground: true }), false)
  assert.equal(isSideLyricsMvEnabled({ enableMV: true, mvAsBackground: false }), true)
  assert.equal(isImmersiveLyricsMvEnabled({ enableMV: true, mvAsBackground: true }), true)
})

test('MV loading follows the active visible surface', () => {
  assert.equal(
    shouldLoadMvForSurface(
      { enableMV: false, mvAsBackground: true, mvAsBackgroundMain: false },
      { view: 'player', showLyrics: true }
    ),
    false
  )
  assert.equal(
    shouldLoadMvForSurface(
      { enableMV: true, mvAsBackground: true, mvAsBackgroundMain: false },
      { view: 'player', showLyrics: true }
    ),
    true
  )
  assert.equal(
    shouldLoadMvForSurface(
      { enableMV: false, mvAsBackground: false, mvAsBackgroundMain: true },
      { view: 'player', showLyrics: false }
    ),
    true
  )
  assert.equal(
    shouldLoadMvForSurface(
      { enableMV: true, mvAsBackground: false, mvAsBackgroundMain: true },
      { view: 'settings', showLyrics: false }
    ),
    false
  )
})

test('MV preload can opt playback into hidden MV preparation', () => {
  assert.equal(shouldPreloadMvForPlayback({ preloadMV: false }, { view: 'player' }), false)
  assert.equal(shouldPreloadMvForPlayback({ preloadMV: true }, { view: 'player' }), true)
  assert.equal(shouldPreloadMvForPlayback({ preloadMV: true }, { view: 'settings' }), false)
})

test('MV auto search can opt playback into hidden MV lookup', () => {
  assert.equal(shouldSearchMvForPlayback({ autoSearchMV: false, preloadMV: false }, { view: 'player' }), false)
  assert.equal(shouldSearchMvForPlayback({ autoSearchMV: true, preloadMV: false }, { view: 'player' }), true)
  assert.equal(shouldSearchMvForPlayback({ autoSearchMV: false, preloadMV: true }, { view: 'player' }), true)
  assert.equal(shouldSearchMvForPlayback({ autoSearchMV: true, preloadMV: false }, { view: 'settings' }), false)
})
