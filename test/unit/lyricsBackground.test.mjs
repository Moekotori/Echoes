import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLyricsBackgroundPresentation,
  normalizeLyricsBackgroundColor,
  normalizeLyricsBackgroundMode,
  normalizeLyricsBackgroundWallpaperBrightness
} from '../../src/renderer/src/utils/lyricsBackground.js'

test('normalizes lyrics background mode and color', () => {
  assert.equal(normalizeLyricsBackgroundMode('custom'), 'custom')
  assert.equal(normalizeLyricsBackgroundMode('unexpected'), 'theme')
  assert.equal(normalizeLyricsBackgroundColor('#abc123'), '#ABC123')
  assert.equal(normalizeLyricsBackgroundColor('not-a-color'), '#101722')
  assert.equal(normalizeLyricsBackgroundWallpaperBrightness(2), 1.4)
  assert.equal(normalizeLyricsBackgroundWallpaperBrightness(0.1), 0.35)
})

test('theme mode is the default lyrics page background', () => {
  const result = buildLyricsBackgroundPresentation({
    themePalette: {
      bgColor: '#FFF8F9',
      bgGradientEnd: '#EEF8F7',
      bgGradientAngle: 138,
      accent1: '#D97691'
    }
  })

  assert.equal(result.mode, 'theme')
  assert.match(result.className, /main-player--lyrics-bg-theme/)
  assert.match(result.style.background, /138deg/)
  assert.equal(result.dockStyle['--lyrics-bg-base'], '#F8F8F8')
})

test('cover mode creates a dark readable background from cover palette', () => {
  const result = buildLyricsBackgroundPresentation({
    mode: 'cover',
    coverPalette: {
      bgColor: '#f7d07a',
      bgGradientEnd: '#fff4c2',
      accent1: '#f28f3b',
      accent2: '#65c7d9'
    }
  })

  assert.equal(result.mode, 'cover')
  assert.equal(result.tone, 'dark')
  assert.match(result.className, /main-player--lyrics-bg-cover/)
  assert.match(result.style.background, /color-mix/)
  assert.equal(result.style['--text-main'], '#f8fbff')
})

test('media lyrics backgrounds expose brightness control', () => {
  const result = buildLyricsBackgroundPresentation({
    mode: 'wallpaper',
    wallpaperUrl: 'file:///cover.jpg',
    wallpaperBrightness: 0.7
  })

  assert.equal(result.style['--lyrics-wallpaper-brightness'], 0.7)
})

test('cover mode does not borrow theme colors while waiting for cover palette', () => {
  const result = buildLyricsBackgroundPresentation({
    mode: 'cover',
    coverPalette: null,
    themePalette: {
      bgColor: '#EAF8E7',
      bgGradientEnd: '#D8F1D1',
      accent1: '#4A9F58',
      accent2: '#6ECF7A'
    }
  })

  assert.equal(result.mode, 'cover')
  assert.equal(result.tone, 'dark')
  assert.doesNotMatch(result.style.background, /#EAF8E7|#D8F1D1|#4A9F58|#6ECF7A/i)
  assert.equal(result.style['--text-main'], '#f8fbff')
})

test('custom light backgrounds opt into dark lyric text', () => {
  const result = buildLyricsBackgroundPresentation({
    mode: 'custom',
    customColor: '#F6F7FA'
  })

  assert.equal(result.mode, 'custom')
  assert.equal(result.tone, 'light')
  assert.match(result.className, /main-player--lyrics-bg-light/)
  assert.equal(result.style['--text-main'], '#182233')
})

test('custom dark backgrounds create matching readable dock colors', () => {
  const result = buildLyricsBackgroundPresentation({
    mode: 'custom',
    customColor: '#4A2A42'
  })

  assert.equal(result.tone, 'dark')
  assert.match(result.dockStyle['--lyrics-dock-background'], /#382135/i)
  assert.equal(result.dockStyle['--lyrics-dock-ink'], '#F8FBFF')
  assert.notEqual(result.dockStyle['--lyrics-dock-fill'], '#8fa0b8')
})
