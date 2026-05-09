/**
 * Float32 interleaved EQ for the native path.
 * Topology mirrors Web Audio where possible: preamp -> cascaded biquads -> output safety.
 *
 * Hot-path notes:
 *  - Coefficients live in a flat Float64Array so the inner sample loop touches
 *    contiguous memory (much friendlier to V8's optimizer than [{...}] per section).
 *  - Per-channel filter state lives in a flat Float64Array as well.
 *  - Only "active" sections (non-identity) are walked at runtime. With the default
 *    16-band layout sitting at 0 dB, the entire chain auto-bypasses; previously
 *    every sample paid for 32 identity biquads + 2x oversampling + soft-clip on
 *    the main thread, which dominated CPU on 96/192 kHz / DSD-to-PCM streams.
 */

const MIN_EQ_BANDS = 16
const MAX_STAGES_PER_BAND = 2
const COEFFS_PER_SECTION = 5
const STATE_PER_SECTION = 4
const SOFT_LIMIT = 0.999
const SOFT_KNEE = 0.944
const SOFT_DEN = Math.tanh(1.8)
const SOFT_RANGE = SOFT_LIMIT - SOFT_KNEE
const EFFECTIVE_GAIN_EPSILON_DB = 0.005

function clampBiquadQ(type, q) {
  const t = type || 'peaking'
  const n = typeof q === 'number' && !Number.isNaN(q) ? q : 1
  if (t === 'lowshelf' || t === 'highshelf') {
    return Math.max(0.1, Math.min(2, n))
  }
  return Math.max(0.1, Math.min(10, n))
}

function clamp(value, min, max, fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, n))
}

function resolveOversampling(value) {
  if (value === '4x') return 4
  if (value === 'off' || value === '1x') return 1
  return 2
}

function resolveOutputSafety(value) {
  if (value === 'hard' || value === 'limit') return 'hard'
  if (value === 'off') return 'off'
  return 'soft'
}

function shelfSlope(value) {
  return value === 6 || value === 24 ? value : 12
}

function normalizeCoeffs(b0, b1, b2, a0, a1, a2) {
  if (!Number.isFinite(a0) || Math.abs(a0) < 1e-12) {
    return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  }
  const inv = 1 / a0
  return {
    b0: b0 * inv,
    b1: b1 * inv,
    b2: b2 * inv,
    a1: a1 * inv,
    a2: a2 * inv
  }
}

export function computeBiquadCoefficients(type, freqHz, Q, gainDb, sampleRate) {
  const sr = sampleRate > 0 ? sampleRate : 44100
  const f = Math.max(1, Math.min(sr * 0.499, freqHz))
  const w0 = (2 * Math.PI * f) / sr
  const cosw0 = Math.cos(w0)
  const sinw0 = Math.sin(w0)
  const q = Math.max(0.1, Q || 1)

  if (type === 'lowpass' || type === 'highpass' || type === 'notch' || type === 'allpass') {
    const alpha = sinw0 / (2 * q)
    const a0 = 1 + alpha
    const a1 = -2 * cosw0
    const a2 = 1 - alpha

    if (type === 'lowpass') {
      const b0 = (1 - cosw0) / 2
      const b1 = 1 - cosw0
      const b2 = (1 - cosw0) / 2
      return normalizeCoeffs(b0, b1, b2, a0, a1, a2)
    }

    if (type === 'highpass') {
      const b0 = (1 + cosw0) / 2
      const b1 = -(1 + cosw0)
      const b2 = (1 + cosw0) / 2
      return normalizeCoeffs(b0, b1, b2, a0, a1, a2)
    }

    if (type === 'notch') {
      return normalizeCoeffs(1, -2 * cosw0, 1, a0, a1, a2)
    }

    return normalizeCoeffs(1 - alpha, -2 * cosw0, 1 + alpha, a0, a1, a2)
  }

  if (type === 'peaking') {
    const A = Math.pow(10, gainDb / 40)
    const alpha = sinw0 / (2 * q)
    const b0 = 1 + alpha * A
    const b1 = -2 * cosw0
    const b2 = 1 - alpha * A
    const a0 = 1 + alpha / A
    const a1 = -2 * cosw0
    const a2 = 1 - alpha / A
    return normalizeCoeffs(b0, b1, b2, a0, a1, a2)
  }

  const A = Math.pow(10, gainDb / 40)
  const inner = (A + 1 / A) * (1 / q - 1) + 2
  const alpha = (sinw0 / 2) * Math.sqrt(Math.max(0, inner))
  const k = cosw0
  const k2 = 2 * Math.sqrt(A) * alpha

  if (type === 'lowshelf') {
    const ap = A + 1
    const am = A - 1
    const b0 = A * (ap - am * k + k2)
    const b1 = 2 * A * (am - ap * k)
    const b2 = A * (ap - am * k - k2)
    const a0 = ap + am * k + k2
    const a1 = -2 * (am + ap * k)
    const a2 = ap + am * k - k2
    return normalizeCoeffs(b0, b1, b2, a0, a1, a2)
  }

  if (type === 'highshelf') {
    const ap = A + 1
    const am = A - 1
    const b0 = A * (ap + am * k + k2)
    const b1 = -2 * A * (am + ap * k)
    const b2 = A * (ap + am * k - k2)
    const a0 = ap - am * k + k2
    const a1 = 2 * (am - ap * k)
    const a2 = ap - am * k - k2
    return normalizeCoeffs(b0, b1, b2, a0, a1, a2)
  }

  return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
}

function softClipSample(x) {
  const ax = x < 0 ? -x : x
  if (ax <= SOFT_KNEE) return x
  const sign = x < 0 ? -1 : 1
  const t = (ax - SOFT_KNEE) / SOFT_RANGE
  const shaped = SOFT_KNEE + SOFT_RANGE * (Math.tanh(t * 1.8) / SOFT_DEN)
  return sign * (shaped < SOFT_LIMIT ? shaped : SOFT_LIMIT)
}

export function createEqFloatProcessor(eqConfig, sampleRate, channels) {
  const ch = Math.max(1, Math.min(2, channels | 0))
  const bands = Array.isArray(eqConfig?.eqBands) ? eqConfig.eqBands : []
  const bandCount = Math.max(MIN_EQ_BANDS, bands.length)
  const maxSections = bandCount * MAX_STAGES_PER_BAND

  // Coefficients are packed per active section: [b0, b1, b2, a1, a2] x activeCount.
  // Channel state is packed the same way: [x1, x2, y1, y2] x activeCount.
  const coeffs = new Float64Array(maxSections * COEFFS_PER_SECTION)
  const channelState = []
  for (let c = 0; c < ch; c++) {
    channelState.push(new Float64Array(maxSections * STATE_PER_SECTION))
  }

  const state = {
    sampleRate,
    channels: ch,
    coeffs,
    channelState,
    activeCount: 0,
    preampLin: 1,
    bypass: true,
    oversampleFactor: 2,
    outputSafety: 'soft',
    oversamplePrev: new Float32Array(ch),
    oversamplePrimed: false,

    update(cfg) {
      const use = !!cfg?.useEQ
      const pre = typeof cfg?.preamp === 'number' ? cfg.preamp : 0
      const nextFactor = resolveOversampling(cfg?.eqOversampling ?? cfg?.oversampling)
      const factorChanged = nextFactor !== state.oversampleFactor
      state.oversampleFactor = nextFactor
      state.outputSafety = resolveOutputSafety(cfg?.eqOutputSafety ?? cfg?.outputSafety)
      state.preampLin = Math.pow(10, pre / 20)

      const processRate = state.sampleRate * state.oversampleFactor
      const list = Array.isArray(cfg?.eqBands) ? cfg.eqBands : []
      let active = 0

      if (use) {
        for (let i = 0; i < bandCount; i++) {
          const band = list[i]
          if (!band || band.enabled === false) continue

          const typ = band.type || 'peaking'
          const gain = clamp(band.gain, -24, 24, 0)
          const isShelf = typ === 'lowshelf' || typ === 'highshelf'
          const isPeakOrShelf = isShelf || typ === 'peaking'
          // Peaking/shelf bands at ~0 dB are mathematically identity; skip them
          // entirely so the inner loop doesn't pay for no-op biquads.
          if (isPeakOrShelf && Math.abs(gain) < EFFECTIVE_GAIN_EPSILON_DB) continue

          const freq = clamp(band.freq, 20, 20000, 1000)
          const slope = shelfSlope(band.slope)
          const stages = isShelf && slope === 24 ? 2 : 1
          const gainPerStage = stages > 1 ? gain / stages : gain
          const q = clampBiquadQ(typ, isShelf && slope === 6 ? 0.55 : band.q)

          for (let stage = 0; stage < stages; stage++) {
            if (active >= maxSections) break
            const c = computeBiquadCoefficients(typ, freq, q, gainPerStage, processRate)
            const base = active * COEFFS_PER_SECTION
            coeffs[base] = c.b0
            coeffs[base + 1] = c.b1
            coeffs[base + 2] = c.b2
            coeffs[base + 3] = c.a1
            coeffs[base + 4] = c.a2
            active += 1
          }
        }
      }

      const preampUnity = Math.abs(state.preampLin - 1) < 1e-6
      // Auto-bypass when there is nothing audible to do. The safety stage
      // exists to tame EQ/preamp-induced overshoot — when there is no preamp
      // change and no active biquad, the signal is bit-identical to its
      // input, so we can skip the per-sample loop entirely. With the default
      // 16-band / 0 dB layout this is the common case and removes the EQ
      // from the audio thread completely.
      state.bypass = !use || (active === 0 && preampUnity)
      state.activeCount = active

      if (factorChanged) {
        state.reset()
      } else {
        // Keep state arrays aligned with the new active count.
        for (let c = 0; c < ch; c++) {
          channelState[c].fill(0, active * STATE_PER_SECTION)
        }
      }
    },

    processInterleaved(data) {
      if (state.bypass) return
      const n = data.length
      if (n <= 0) return
      const nCh = state.channels
      const active = state.activeCount
      const factor = state.oversampleFactor
      const preamp = state.preampLin
      const safetyMode = state.outputSafety
      const useSoft = safetyMode === 'soft'
      const useHard = safetyMode === 'hard'
      const coeffArr = state.coeffs

      if (!state.oversamplePrimed && n >= nCh) {
        for (let c = 0; c < nCh; c++) state.oversamplePrev[c] = data[c]
        state.oversamplePrimed = true
      }

      // Fast path: no active sections (only preamp / safety remain).
      if (active === 0) {
        if (preamp === 1 && safetyMode === 'off') return
        for (let i = 0; i < n; i++) {
          let y = data[i] * preamp
          if (useSoft) {
            const ay = y < 0 ? -y : y
            if (ay > SOFT_KNEE) y = softClipSample(y)
          } else if (useHard) {
            if (y > SOFT_LIMIT) y = SOFT_LIMIT
            else if (y < -SOFT_LIMIT) y = -SOFT_LIMIT
          }
          data[i] = y
        }
        return
      }

      for (let i = 0; i < n; i += nCh) {
        for (let c = 0; c < nCh; c++) {
          const stateArr = channelState[c]
          const xIn = data[i + c]
          let outSample
          if (factor <= 1) {
            outSample = runChainSample(xIn * preamp, coeffArr, stateArr, active)
          } else {
            const prev = state.oversamplePrev[c]
            let acc = 0
            for (let os = 1; os <= factor; os++) {
              const interp = prev + (xIn - prev) * (os / factor)
              acc += runChainSample(interp * preamp, coeffArr, stateArr, active)
            }
            state.oversamplePrev[c] = xIn
            outSample = acc / factor
          }
          if (useSoft) {
            const ay = outSample < 0 ? -outSample : outSample
            if (ay > SOFT_KNEE) outSample = softClipSample(outSample)
          } else if (useHard) {
            if (outSample > SOFT_LIMIT) outSample = SOFT_LIMIT
            else if (outSample < -SOFT_LIMIT) outSample = -SOFT_LIMIT
          }
          data[i + c] = outSample
        }
      }
    },

    reset() {
      for (let c = 0; c < ch; c++) channelState[c].fill(0)
      state.oversamplePrev.fill(0)
      state.oversamplePrimed = false
    }
  }

  state.update(eqConfig || { useEQ: false, preamp: 0, eqBands: [] })
  return state
}

/**
 * Tight inner kernel: walk the active biquad chain in one contiguous Float64
 * pass per channel sample. Hoisted out of the closure so V8 sees a stable shape
 * and inlines aggressively.
 */
function runChainSample(input, coeffArr, stateArr, activeCount) {
  let y = input
  for (let s = 0; s < activeCount; s++) {
    const cBase = s * COEFFS_PER_SECTION
    const sBase = s * STATE_PER_SECTION
    const x1 = stateArr[sBase]
    const x2 = stateArr[sBase + 1]
    const y1 = stateArr[sBase + 2]
    const y2 = stateArr[sBase + 3]
    const x = y
    y =
      coeffArr[cBase] * x +
      coeffArr[cBase + 1] * x1 +
      coeffArr[cBase + 2] * x2 -
      coeffArr[cBase + 3] * y1 -
      coeffArr[cBase + 4] * y2
    stateArr[sBase] = x
    stateArr[sBase + 1] = x1
    stateArr[sBase + 2] = y
    stateArr[sBase + 3] = y1
  }
  return y
}
