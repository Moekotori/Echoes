import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../../src/renderer/src/App.jsx', import.meta.url), 'utf8')
const preloadSource = fs.readFileSync(new URL('../../src/preload/index.js', import.meta.url), 'utf8')
const mainSource = fs.readFileSync(new URL('../../src/main/index.js', import.meta.url), 'utf8')

test('visible-row metadata hydrate calls getExtendedMetadata with light-mode options', () => {
  assert.match(appSource, /buildVisibleRowMetadataRequestOptions\(\)/)
  assert.match(
    appSource,
    /getExtendedMetadataHandler\(track\.path,\s*metadataOptions\)/
  )
  assert.match(
    preloadSource,
    /getExtendedMetadataHandler:\s*\(path,\s*options\)[\s\S]*file:getExtendedMetadata'[\s\S]*path,\s*options/
  )
})

test('main metadata light mode gates heavy probes and extras', () => {
  assert.match(
    mainSource,
    /const mode = options\?\.mode === 'visible-row' \? 'visible-row' : 'full'[\s\S]*includeTechnicalProbe:\s*isVisibleRowMode\s*\?\s*false/
  )
  assert.match(
    mainSource,
    /shouldRunTechnicalProbe[\s\S]*getFfmpegAudioInfo\(filePath\)/
  )
  assert.match(
    mainSource,
    /requestOptions\.includeLyrics\s*===\s*false\s*\?\s*null\s*:\s*extractEmbeddedLyricsText\(metadata\)/
  )
  assert.match(
    mainSource,
    /requestOptions\.includeBpm\s*===\s*false[\s\S]*extractBpmMetadataValue\(metadata\)/
  )
  assert.match(
    mainSource,
    /requestOptions\.includeMqa\s*===\s*false\s*\?\s*false\s*:\s*hasMqaMetadata\(metadata\)/
  )
})
