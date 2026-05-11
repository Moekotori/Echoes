import test from 'node:test'
import assert from 'node:assert/strict'

import { createEqFloatProcessor } from '../../src/main/audio/eqFloatProcessor.js'

const SAMPLE_RATE = 48000
const CHANNELS = 2

function makeRamp(length) {
  const buf = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin((i / length) * Math.PI * 2) * 0.5
  }
  return buf
}

test('processInterleaved is a no-op when EQ is disabled', () => {
  const proc = createEqFloatProcessor(
    { useEQ: false, preamp: 0, eqBands: [] },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.bypass, true)
  const data = makeRamp(64)
  const original = Float32Array.from(data)
  proc.processInterleaved(data)
  assert.deepEqual(Array.from(data), Array.from(original))
})

test('auto-bypasses when EQ is on but every band sits at 0 dB (default safety)', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: 0,
      eqOversampling: '2x',
      eqOutputSafety: 'soft',
      eqBands: Array.from({ length: 16 }, (_, i) => ({
        type: i === 0 ? 'lowshelf' : i === 15 ? 'highshelf' : 'peaking',
        freq: 100 * (i + 1),
        gain: 0,
        q: 1,
        enabled: true
      }))
    },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.bypass, true, 'flat 0 dB chain should auto-bypass even with soft safety')
  assert.equal(proc.activeCount, 0)
})

test('auto-bypasses when EQ is on but every band sits at 0 dB and safety is off', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: 0,
      eqOversampling: '2x',
      eqOutputSafety: 'off',
      eqBands: Array.from({ length: 16 }, () => ({
        type: 'peaking',
        freq: 1000,
        gain: 0,
        q: 1,
        enabled: true
      }))
    },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.bypass, true)
  assert.equal(proc.activeCount, 0)
})

test('preamp-only path scales the buffer without running biquads', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: -6,
      eqOversampling: '1x',
      eqOutputSafety: 'off',
      eqBands: []
    },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.activeCount, 0)
  assert.equal(proc.bypass, false, 'non-unity preamp must keep the loop alive')
  const data = makeRamp(8)
  const original = Float32Array.from(data)
  proc.processInterleaved(data)
  for (let i = 0; i < data.length; i++) {
    assert.ok(
      Math.abs(data[i] - original[i] * proc.preampLin) < 1e-6,
      `sample ${i} should be preamp-scaled`
    )
  }
})

test('active band path produces a non-trivial output and stays bounded', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: 0,
      eqOversampling: '2x',
      eqOutputSafety: 'soft',
      eqBands: [
        { type: 'peaking', freq: 1000, gain: 6, q: 1, enabled: true }
      ]
    },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.bypass, false)
  assert.equal(proc.activeCount, 1)

  const data = makeRamp(2048)
  proc.processInterleaved(data)

  let touched = false
  for (let i = 0; i < data.length; i++) {
    assert.ok(Number.isFinite(data[i]), 'output must be finite')
    assert.ok(Math.abs(data[i]) <= 1, 'soft safety must keep |x| <= 1')
    if (Math.abs(data[i]) > 1e-4) touched = true
  }
  assert.ok(touched, 'active EQ should produce non-trivial output')
})

test('disabled bands are dropped from the active section list', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: 0,
      eqOversampling: '1x',
      eqOutputSafety: 'off',
      eqBands: [
        { type: 'peaking', freq: 100, gain: 6, q: 1, enabled: false },
        { type: 'peaking', freq: 1000, gain: 4, q: 1, enabled: true },
        { type: 'peaking', freq: 5000, gain: -3, q: 1, enabled: true }
      ]
    },
    SAMPLE_RATE,
    CHANNELS
  )
  assert.equal(proc.activeCount, 2, 'only enabled non-zero bands should be active')
})

test('update keeps state arrays consistent when active count changes', () => {
  const proc = createEqFloatProcessor(
    {
      useEQ: true,
      preamp: 0,
      eqOversampling: '1x',
      eqOutputSafety: 'off',
      eqBands: [
        { type: 'peaking', freq: 1000, gain: 6, q: 1, enabled: true }
      ]
    },
    SAMPLE_RATE,
    CHANNELS
  )
  proc.processInterleaved(makeRamp(64))

  proc.update({
    useEQ: true,
    preamp: 0,
    eqOversampling: '1x',
    eqOutputSafety: 'off',
    eqBands: [{ type: 'peaking', freq: 1000, gain: 0, q: 1, enabled: true }]
  })
  assert.equal(proc.bypass, true, 'flat config must re-enter bypass')
  assert.equal(proc.activeCount, 0)

  // Subsequent calls must still produce finite output without leftover state.
  const data = makeRamp(64)
  const original = Float32Array.from(data)
  proc.processInterleaved(data)
  assert.deepEqual(Array.from(data), Array.from(original))
})
