import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import type { AudioLevelTelemetry, ChannelBalanceState } from '../../shared/types/audio';
import type { EqState } from '../../shared/types/eq';

export type PcmLevelSnapshot = {
  inputPeakDb: number | null;
  inputRmsDb: number | null;
  visualSpectrum: number[];
  visualSpectrumVersion: 2;
  visualEnergy: number;
  visualTransient: number;
  visualTelemetryState: 'pcm' | 'priming' | 'fallback';
  clipCount: number;
  lastClipAt: string | null;
};

export type AudioLevelEstimate = AudioLevelTelemetry;

const meterSource = 'pre_native_estimated_post_dsp' as const;
const defaultMaxObservedSamplesPerChunk = 8192;
const defaultSpectrumSampleRateHz = 44100;
const defaultSpectrumChannels = 2;
const maxSpectrumSamplesPerSnapshot = 2048;
export const visualSpectrumBucketCount = 24;
const visualSpectrumVersion = 2 as const;
const visualSpectrumFloorDb = -78;
const visualSpectrumCeilingDb = -12;
const visualEnergyFloorDb = -64;
const visualEnergyCeilingDb = -10;
const visualSpectrumMinFrequencyHz = 40;
const visualSpectrumMaxFrequencyHz = 18000;
const visualWarmupSnapshotCount = 8;
const emptyVisualSpectrum = (): number[] => Array.from({ length: visualSpectrumBucketCount }, () => 0);
const normalizeVisualSpectrum = (spectrum: number[]): number[] =>
  Array.from({ length: visualSpectrumBucketCount }, (_, index) => {
    const value = spectrum[index] ?? 0;
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  });
const clampUnit = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
const roundUnit = (value: number): number => Math.round(clampUnit(value) * 1000) / 1000;
const smoothUnit = (previous: number, next: number, attack: number, release: number): number => {
  const smoothing = next > previous ? attack : release;
  return roundUnit(previous + (next - previous) * smoothing);
};
const smoothstep = (value: number): number => {
  const unit = clampUnit(value);
  return unit * unit * (3 - 2 * unit);
};
const scaleVisualSpectrum = (spectrum: number[], scale: number): number[] => normalizeVisualSpectrum(spectrum).map((value) => roundUnit(value * scale));
const smoothVisualSpectrum = (previous: number[], next: number[]): number[] =>
  normalizeVisualSpectrum(next).map((value, index) => {
    const previousValue = previous[index] ?? 0;
    return smoothUnit(previousValue, value, 0.68, 0.26);
  });

const dbToVisualUnit = (db: number | null, floorDb: number, ceilingDb: number): number => {
  if (db === null || !Number.isFinite(db)) {
    return 0;
  }

  return clampUnit((db - floorDb) / (ceilingDb - floorDb));
};

const getHannWindow = (() => {
  let cached: Float64Array | null = null;
  return (): Float64Array => {
    if (cached) {
      return cached;
    }

    cached = new Float64Array(maxSpectrumSamplesPerSnapshot);
    for (let index = 0; index < cached.length; index += 1) {
      cached[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (cached.length - 1));
    }
    return cached;
  };
})();

const hannWindowNormalization = (() => {
  const window = getHannWindow();
  let sum = 0;
  for (let index = 0; index < window.length; index += 1) {
    sum += window[index];
  }
  return sum || maxSpectrumSamplesPerSnapshot;
})();

const fftInPlace = (real: Float64Array, imaginary: Float64Array): void => {
  const size = real.length;
  let swapIndex = 0;

  for (let index = 1; index < size; index += 1) {
    let bit = size >> 1;
    for (; (swapIndex & bit) !== 0; bit >>= 1) {
      swapIndex ^= bit;
    }
    swapIndex ^= bit;

    if (index < swapIndex) {
      const realValue = real[index];
      real[index] = real[swapIndex];
      real[swapIndex] = realValue;
      const imaginaryValue = imaginary[index];
      imaginary[index] = imaginary[swapIndex];
      imaginary[swapIndex] = imaginaryValue;
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    const halfLength = length >> 1;

    for (let offset = 0; offset < size; offset += length) {
      let currentReal = 1;
      let currentImaginary = 0;

      for (let index = 0; index < halfLength; index += 1) {
        const evenIndex = offset + index;
        const oddIndex = evenIndex + halfLength;
        const oddReal = real[oddIndex] * currentReal - imaginary[oddIndex] * currentImaginary;
        const oddImaginary = real[oddIndex] * currentImaginary + imaginary[oddIndex] * currentReal;

        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;

        const nextReal = currentReal * stepReal - currentImaginary * stepImaginary;
        currentImaginary = currentReal * stepImaginary + currentImaginary * stepReal;
        currentReal = nextReal;
      }
    }
  }
};

const buildLogSpectrumBands = (sampleRateHz: number): Array<{ startBin: number; endBin: number }> => {
  const nyquistHz = sampleRateHz / 2;
  const binFrequencyHz = sampleRateHz / maxSpectrumSamplesPerSnapshot;
  const maxFrequencyHz = Math.max(visualSpectrumMinFrequencyHz * 1.5, Math.min(visualSpectrumMaxFrequencyHz, nyquistHz * 0.92));
  const minLog = Math.log10(visualSpectrumMinFrequencyHz);
  const maxLog = Math.log10(maxFrequencyHz);

  return Array.from({ length: visualSpectrumBucketCount }, (_, index) => {
    const lowerHz = 10 ** (minLog + (maxLog - minLog) * (index / visualSpectrumBucketCount));
    const upperHz = 10 ** (minLog + (maxLog - minLog) * ((index + 1) / visualSpectrumBucketCount));
    const startBin = Math.max(1, Math.floor(lowerHz / binFrequencyHz));
    const endBin = Math.max(startBin, Math.min(maxSpectrumSamplesPerSnapshot / 2, Math.ceil(upperHz / binFrequencyHz)));
    return { startBin, endBin };
  });
};

const dbFromLinear = (value: number): number | null => {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(20 * Math.log10(value) * 10) / 10;
};

const linearGainToDb = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return -Infinity;
  }

  return 20 * Math.log10(value);
};

const computeChannelBalanceGainDb = (state: ChannelBalanceState): number => {
  const balance = Math.max(-1, Math.min(1, state.balance));

  if (!state.constantPower) {
    const left = state.leftGainDb + linearGainToDb(balance > 0 ? 1 - balance : 1);
    const right = state.rightGainDb + linearGainToDb(balance < 0 ? 1 + balance : 1);
    return Math.max(0, left, right);
  }

  const pan = (balance + 1) * Math.PI * 0.25;
  const compensation = Math.sqrt(2);
  const left = state.leftGainDb + linearGainToDb(Math.min(1, Math.cos(pan) * compensation));
  const right = state.rightGainDb + linearGainToDb(Math.min(1, Math.sin(pan) * compensation));
  return Math.max(0, left, right);
};

export const computeDspEstimatedGainDb = (eqState: EqState, channelBalanceState: ChannelBalanceState): number => {
  const eqGainDb = eqState.enabled
    ? eqState.preampDb + Math.max(0, ...eqState.bands.map((band) => (band.enabled === false ? 0 : band.gainDb)))
    : 0;
  const channelGainDb = channelBalanceState.enabled ? computeChannelBalanceGainDb(channelBalanceState) : 0;

  return Math.round((eqGainDb + channelGainDb) * 10) / 10;
};

const addDb = (value: number | null, gainDb: number): number | null =>
  value === null ? null : Math.round((value + gainDb) * 10) / 10;

export const createAudioLevelTelemetry = (
  snapshot: PcmLevelSnapshot,
  eqState: EqState,
  channelBalanceState: ChannelBalanceState,
): AudioLevelEstimate => {
  const estimatedGainDb = computeDspEstimatedGainDb(eqState, channelBalanceState);
  const estimatedOutputPeakDb = addDb(snapshot.inputPeakDb, estimatedGainDb);
  const estimatedOutputRmsDb = addDb(snapshot.inputRmsDb, estimatedGainDb);

  return {
    inputPeakDb: snapshot.inputPeakDb,
    inputRmsDb: snapshot.inputRmsDb,
    estimatedOutputPeakDb,
    estimatedOutputRmsDb,
    visualSpectrum: normalizeVisualSpectrum(snapshot.visualSpectrum),
    visualSpectrumVersion,
    visualEnergy: roundUnit(snapshot.visualEnergy),
    visualTransient: roundUnit(snapshot.visualTransient),
    visualTelemetryState: snapshot.visualTelemetryState,
    headroomDb: estimatedOutputPeakDb === null ? null : Math.round(-estimatedOutputPeakDb * 10) / 10,
    clipCount: snapshot.clipCount,
    lastClipAt: snapshot.lastClipAt,
    meterSource,
  };
};

export class PcmLevelMeterTransform extends Transform {
  private readonly intervalMs: number;
  private readonly onSnapshot: (snapshot: PcmLevelSnapshot) => void;
  private readonly maxObservedSamplesPerChunk: number;
  private remainder = Buffer.alloc(0);
  private gain = 1;
  private peakAbs = 0;
  private sumSquares = 0;
  private sampleCount = 0;
  private clipCount = 0;
  private lastClipAt: string | null = null;
  private lastEmitAt = 0;
  private readonly sampleRateHz: number;
  private readonly channels: number;
  private spectrumSamples: number[] = [];
  private lastVisualSpectrum: number[] = emptyVisualSpectrum();
  private lastVisualEnergy = 0;
  private lastVisualTransient = 0;
  private lastVisualTelemetryState: PcmLevelSnapshot['visualTelemetryState'] = 'fallback';
  private visualSnapshotCount = 0;

  constructor(
    onSnapshot: (snapshot: PcmLevelSnapshot) => void,
    intervalMs = 100,
    maxObservedSamplesPerChunk = defaultMaxObservedSamplesPerChunk,
    sampleRateHz = defaultSpectrumSampleRateHz,
    channels = defaultSpectrumChannels,
  ) {
    super();
    this.onSnapshot = onSnapshot;
    this.intervalMs = intervalMs;
    this.maxObservedSamplesPerChunk = Math.max(1, Math.round(maxObservedSamplesPerChunk));
    this.sampleRateHz = Number.isFinite(sampleRateHz) && sampleRateHz > 0 ? Math.round(sampleRateHz) : defaultSpectrumSampleRateHz;
    this.channels = Number.isFinite(channels) && channels > 0 ? Math.max(1, Math.round(channels)) : defaultSpectrumChannels;
  }

  setGain(gain: number): void {
    this.gain = Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 1;
  }

  getSnapshot(): PcmLevelSnapshot {
    const visualAnalysis = this.spectrumSamples.length > 0 ? this.computeVisualAnalysis() : null;
    const visualSnapshotIndex = visualAnalysis ? this.visualSnapshotCount + 1 : this.visualSnapshotCount;
    const visualConfidence = visualAnalysis ? smoothstep(visualSnapshotIndex / visualWarmupSnapshotCount) : 1;
    const visualTelemetryState = visualAnalysis ? (visualConfidence >= 0.995 ? 'pcm' : 'priming') : this.lastVisualTelemetryState;
    const nextVisualSpectrum = visualAnalysis ? scaleVisualSpectrum(visualAnalysis.spectrum, visualConfidence) : [...this.lastVisualSpectrum];

    return {
      inputPeakDb: dbFromLinear(this.peakAbs),
      inputRmsDb: this.sampleCount > 0 ? dbFromLinear(Math.sqrt(this.sumSquares / this.sampleCount)) : null,
      visualSpectrum: visualAnalysis ? smoothVisualSpectrum(this.lastVisualSpectrum, nextVisualSpectrum) : [...this.lastVisualSpectrum],
      visualSpectrumVersion,
      visualEnergy: visualAnalysis ? roundUnit(visualAnalysis.energy * visualConfidence) : this.lastVisualEnergy,
      visualTransient: visualAnalysis ? roundUnit(visualAnalysis.transient * visualConfidence) : this.lastVisualTransient,
      visualTelemetryState,
      clipCount: this.clipCount,
      lastClipAt: this.lastClipAt,
    };
  }

  reset(): void {
    this.remainder = Buffer.alloc(0);
    this.peakAbs = 0;
    this.sumSquares = 0;
    this.sampleCount = 0;
    this.clipCount = 0;
    this.lastClipAt = null;
    this.lastEmitAt = 0;
    this.spectrumSamples = [];
    this.lastVisualSpectrum = emptyVisualSpectrum();
    this.lastVisualEnergy = 0;
    this.lastVisualTransient = 0;
    this.lastVisualTelemetryState = 'fallback';
    this.visualSnapshotCount = 0;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.observe(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    if (this.remainder.length >= 4) {
      this.observe(Buffer.alloc(0));
    }
    this.emitSnapshot(true);
    callback();
  }

  private observe(chunk: Buffer): void {
    const input = this.remainder.length > 0 ? Buffer.concat([this.remainder, chunk]) : chunk;
    const completeBytes = input.length - (input.length % 4);
    this.remainder = completeBytes < input.length ? Buffer.from(input.subarray(completeBytes)) : Buffer.alloc(0);

    this.observeSamples(input, completeBytes);
    this.observeSpectrum(input, completeBytes);

    this.emitSnapshot(false);
  }

  private observeSamples(input: Buffer, completeBytes: number): void {
    const totalSamples = completeBytes / 4;
    if (totalSamples <= 0) {
      return;
    }

    if (totalSamples <= this.maxObservedSamplesPerChunk) {
      for (let index = 0; index < totalSamples; index += 1) {
        this.observeSample(input, index * 4);
      }
      return;
    }

    if (this.maxObservedSamplesPerChunk === 1) {
      this.observeSample(input, 0);
      return;
    }

    const step = (totalSamples - 1) / (this.maxObservedSamplesPerChunk - 1);
    let previousIndex = -1;
    for (let sample = 0; sample < this.maxObservedSamplesPerChunk; sample += 1) {
      const sampleIndex = Math.min(totalSamples - 1, Math.round(sample * step));
      if (sampleIndex === previousIndex) {
        continue;
      }
      previousIndex = sampleIndex;
      this.observeSample(input, sampleIndex * 4);
    }
  }

  private observeSample(input: Buffer, offset: number): void {
    const sample = input.readFloatLE(offset) * this.gain;

    if (!Number.isFinite(sample)) {
      return;
    }

    const absSample = Math.abs(sample);
    this.peakAbs = Math.max(this.peakAbs, absSample);
    this.sumSquares += sample * sample;
    this.sampleCount += 1;

    if (absSample >= 1) {
      this.clipCount += 1;
      this.lastClipAt = new Date().toISOString();
    }
  }

  private observeSpectrum(input: Buffer, completeBytes: number): void {
    if (this.spectrumSamples.length >= maxSpectrumSamplesPerSnapshot) {
      return;
    }

    const totalSamples = completeBytes / 4;
    const totalFrames = Math.floor(totalSamples / this.channels);
    if (totalFrames <= 0) {
      return;
    }

    const availableSlots = maxSpectrumSamplesPerSnapshot - this.spectrumSamples.length;
    const framesToObserve = Math.min(totalFrames, availableSlots);
    const step = totalFrames <= framesToObserve ? 1 : totalFrames / framesToObserve;

    for (let frame = 0; frame < framesToObserve; frame += 1) {
      const frameIndex = Math.min(totalFrames - 1, Math.floor(frame * step));
      let mono = 0;
      let observedChannels = 0;

      for (let channel = 0; channel < this.channels; channel += 1) {
        const sampleIndex = frameIndex * this.channels + channel;
        const offset = sampleIndex * 4;
        if (offset + 4 > completeBytes) {
          break;
        }

        const sample = input.readFloatLE(offset) * this.gain;
        if (!Number.isFinite(sample)) {
          continue;
        }

        mono += sample;
        observedChannels += 1;
      }

      this.spectrumSamples.push(observedChannels > 0 ? mono / observedChannels : 0);
    }
  }

  private computeVisualAnalysis(): { spectrum: number[]; energy: number; transient: number } {
    const samples = this.spectrumSamples;
    if (samples.length < 32) {
      return {
        spectrum: emptyVisualSpectrum(),
        energy: smoothUnit(this.lastVisualEnergy, 0, 0.74, 0.22),
        transient: smoothUnit(this.lastVisualTransient, 0, 0.9, 0.42),
      };
    }

    const window = getHannWindow();
    const real = new Float64Array(maxSpectrumSamplesPerSnapshot);
    const imaginary = new Float64Array(maxSpectrumSamplesPerSnapshot);
    const observedSamples = Math.min(samples.length, maxSpectrumSamplesPerSnapshot);
    let sumSquares = 0;
    let peak = 0;

    for (let index = 0; index < observedSamples; index += 1) {
      const sample = Number.isFinite(samples[index]) ? samples[index] : 0;
      real[index] = sample * window[index];
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    fftInPlace(real, imaginary);

    const binMagnitudes = new Float64Array(maxSpectrumSamplesPerSnapshot / 2 + 1);
    for (let bin = 1; bin < binMagnitudes.length; bin += 1) {
      binMagnitudes[bin] = (2 * Math.hypot(real[bin], imaginary[bin])) / hannWindowNormalization;
    }

    const bands = buildLogSpectrumBands(this.sampleRateHz);
    const spectrum = bands.map(({ startBin, endBin }) => {
      let power = 0;
      for (let bin = startBin; bin <= endBin; bin += 1) {
        const magnitude = binMagnitudes[bin] ?? 0;
        power += magnitude * magnitude;
      }

      const amplitude = Math.sqrt(power);
      const db = dbFromLinear(amplitude);
      return roundUnit(dbToVisualUnit(db, visualSpectrumFloorDb, visualSpectrumCeilingDb) ** 1.18);
    });

    const rms = observedSamples > 0 ? Math.sqrt(sumSquares / observedSamples) : 0;
    const rawEnergy = dbToVisualUnit(dbFromLinear(rms), visualEnergyFloorDb, visualEnergyCeilingDb);
    const crestDb = rms > 0 && peak > 0 ? 20 * Math.log10(peak / rms) : 0;
    const crestImpact = clampUnit((crestDb - 3) / 13);
    const positiveDelta = Math.max(0, rawEnergy - this.lastVisualEnergy);
    const rawTransient = clampUnit(positiveDelta * 3.2 + crestImpact * rawEnergy * 0.42);
    const energy = smoothUnit(this.lastVisualEnergy, rawEnergy, 0.62, 0.18);
    const transient = smoothUnit(this.lastVisualTransient, rawTransient, 0.72, 0.3);

    return { spectrum, energy, transient };
  }

  private emitSnapshot(force: boolean): void {
    const now = Date.now();

    if (!force && now - this.lastEmitAt < this.intervalMs) {
      return;
    }

    this.lastEmitAt = now;
    const snapshot = this.getSnapshot();
    this.lastVisualSpectrum = snapshot.visualSpectrum;
    this.lastVisualEnergy = snapshot.visualEnergy;
    this.lastVisualTransient = snapshot.visualTransient;
    this.lastVisualTelemetryState = snapshot.visualTelemetryState;
    if (snapshot.visualTelemetryState === 'priming' || snapshot.visualTelemetryState === 'pcm') {
      this.visualSnapshotCount += 1;
    }
    this.spectrumSamples = [];
    this.onSnapshot(snapshot);
  }
}
