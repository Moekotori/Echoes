import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_CONFIG,
  DEFAULT_EQ_BANDS,
  isNeutralEqConfig
} from '../../src/renderer/src/config/defaultConfig.js'

test('parametric EQ is disabled by default', () => {
  assert.equal(DEFAULT_CONFIG.useEQ, false)
})

test('metadata embedded auto-load defaults on while network fill defaults off', () => {
  assert.equal(DEFAULT_CONFIG.autoLoadEmbeddedMetadata, true)
  assert.equal(DEFAULT_CONFIG.autoCompleteNetworkMetadata, false)
  assert.equal(DEFAULT_CONFIG.albumFolderCoverFallback, true)
})

test('neutral EQ detection treats flat default bands as no audible EQ', () => {
  assert.equal(isNeutralEqConfig({ bands: DEFAULT_EQ_BANDS, preamp: 0 }), true)
})

test('neutral EQ detection preserves non-flat user EQ state', () => {
  const bands = DEFAULT_EQ_BANDS.map((band, index) => ({
    ...band,
    gain: index === 0 ? 3 : band.gain
  }))

  assert.equal(isNeutralEqConfig({ bands, preamp: 0 }), false)
  assert.equal(isNeutralEqConfig({ bands: DEFAULT_EQ_BANDS, preamp: -3 }), false)
})
