import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { ChannelBalanceState } from '../../shared/types/audio';
import type { EqState } from '../../shared/types/eq';
import {
  PcmLevelMeterTransform,
  computeDspEstimatedGainDb,
  createAudioLevelTelemetry,
  type PcmLevelSnapshot,
} from './AudioLevelMeter';

const pcmBuffer = (samples: number[]): Buffer => {
  const buffer = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => {
    buffer.writeFloatLE(sample, index * 4);
  });
  return buffer;
};

const runMeter = async (
  samples: number[],
  options: { channels?: number; maxObservedSamplesPerChunk?: number; sampleRateHz?: number } = {},
): Promise<{ snapshot: PcmLevelSnapshot; output: Buffer }> => {
  let snapshot: PcmLevelSnapshot | null = null;
  const meter = new PcmLevelMeterTransform((nextSnapshot) => {
    snapshot = nextSnapshot;
  }, 0, options.maxObservedSamplesPerChunk, options.sampleRateHz, options.channels);
  const outputChunks: Buffer[] = [];
  meter.on('data', (chunk: Buffer) => outputChunks.push(Buffer.from(chunk)));
  const input = pcmBuffer(samples);

  meter.end(input);
  await once(meter, 'end');

  return {
    snapshot: snapshot ?? meter.getSnapshot(),
    output: Buffer.concat(outputChunks),
  };
};

const sineSamples = (frequencyHz: number, sampleRateHz = 44100, frameCount = 2048, channels = 1, amplitude = 0.8): number[] => {
  const samples: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const value = Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRateHz) * amplitude;
    for (let channel = 0; channel < channels; channel += 1) {
      samples.push(value);
    }
  }
  return samples;
};

const eqState = (overrides: Partial<EqState> = {}): EqState => ({
  enabled: false,
  preampDb: 0,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequencyHz) => ({
    frequencyHz,
    gainDb: 0,
    q: 1,
    filterType: 'peaking' as const,
    enabled: true,
  })),
  ...overrides,
});

const channelBalanceState = (overrides: Partial<ChannelBalanceState> = {}): ChannelBalanceState => ({
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
  clippingRisk: false,
  ...overrides,
});

describe('AudioLevelMeter', () => {
  it('computes peak and RMS for float32 PCM without changing bytes', async () => {
    const input = pcmBuffer([0.5, -0.25]);
    const result = await runMeter([0.5, -0.25]);

    expect(result.snapshot.inputPeakDb).toBe(-6);
    expect(result.snapshot.inputRmsDb).toBe(-8.1);
    expect(result.snapshot.clipCount).toBe(0);
    expect(result.output.equals(input)).toBe(true);
  });

  it('returns null levels for silence without throwing', async () => {
    const result = await runMeter([0, 0, 0, 0]);

    expect(result.snapshot.inputPeakDb).toBeNull();
    expect(result.snapshot.inputRmsDb).toBeNull();
    expect(result.snapshot.clipCount).toBe(0);
    expect(result.snapshot.visualSpectrum.every((value) => value === 0)).toBe(true);
  });

  it('computes a low-frequency visual spectrum bucket from PCM samples', async () => {
    const result = await runMeter(sineSamples(110), { channels: 1, sampleRateHz: 44100 });

    const lowBand = Math.max(...result.snapshot.visualSpectrum.slice(0, 6));
    const highBand = Math.max(...result.snapshot.visualSpectrum.slice(16));

    expect(result.snapshot.visualSpectrum).toHaveLength(24);
    expect(result.snapshot.visualSpectrumVersion).toBe(2);
    expect(result.snapshot.visualTelemetryState).toBe('pcm');
    expect(lowBand).toBeGreaterThan(0.5);
    expect(lowBand).toBeGreaterThan(highBand);
  });

  it('computes a high-frequency visual spectrum bucket from PCM samples', async () => {
    const result = await runMeter(sineSamples(9000), { channels: 1, sampleRateHz: 44100 });

    const lowBand = Math.max(...result.snapshot.visualSpectrum.slice(0, 6));
    const highBand = Math.max(...result.snapshot.visualSpectrum.slice(16));

    expect(result.snapshot.visualSpectrum).toHaveLength(24);
    expect(highBand).toBeGreaterThan(0.5);
    expect(highBand).toBeGreaterThan(lowBand);
  });

  it('keeps visual spectrum amplitude tied to PCM loudness', async () => {
    const quiet = await runMeter(sineSamples(440, 44100, 2048, 1, 0.05), { channels: 1, sampleRateHz: 44100 });
    const loud = await runMeter(sineSamples(440, 44100, 2048, 1, 0.8), { channels: 1, sampleRateHz: 44100 });

    expect(loud.snapshot.visualEnergy).toBeGreaterThan(quiet.snapshot.visualEnergy);
    expect(Math.max(...loud.snapshot.visualSpectrum)).toBeGreaterThan(Math.max(...quiet.snapshot.visualSpectrum));
  });

  it('raises visual transient on a sudden PCM energy increase', async () => {
    const snapshots: PcmLevelSnapshot[] = [];
    const meter = new PcmLevelMeterTransform((nextSnapshot) => {
      snapshots.push(nextSnapshot);
    }, 0, undefined, 44100, 1);
    meter.resume();

    meter.write(pcmBuffer(sineSamples(440, 44100, 2048, 1, 0.04)));
    meter.write(pcmBuffer(sineSamples(440, 44100, 2048, 1, 0.8)));
    meter.end();
    await once(meter, 'end');

    expect(snapshots.at(-1)?.visualTransient ?? 0).toBeGreaterThan(snapshots[0]?.visualTransient ?? 0);
  });

  it('tracks clipping samples and last clip timestamp', async () => {
    const result = await runMeter([1, -1.1, 0.2]);

    expect(result.snapshot.clipCount).toBe(2);
    expect(result.snapshot.lastClipAt).toEqual(expect.any(String));
  });

  it('samples large chunks without changing playback bytes', async () => {
    const samples = [0.1, 0.2, 1.2, 0.3, 0.4];
    const input = pcmBuffer(samples);
    const result = await runMeter(samples, { maxObservedSamplesPerChunk: 3 });

    expect(result.snapshot.inputPeakDb).toBe(1.6);
    expect(result.snapshot.clipCount).toBe(1);
    expect(result.output.equals(input)).toBe(true);
  });

  it('adds conservative EQ and channel balance gain to the output estimate', () => {
    const eq = eqState({
      enabled: true,
      preampDb: -4,
      bands: eqState().bands.map((band, index) => (index === 5 ? { ...band, gainDb: 6 } : band)),
    });
    const channelBalance = channelBalanceState({ enabled: true, rightGainDb: 2 });

    expect(computeDspEstimatedGainDb(eq, channelBalance)).toBe(4);
    expect(
      createAudioLevelTelemetry(
        {
          inputPeakDb: -5,
          inputRmsDb: -18,
          visualSpectrum: [],
          visualSpectrumVersion: 2,
          visualEnergy: 0,
          visualTransient: 0,
          visualTelemetryState: 'fallback',
          clipCount: 0,
          lastClipAt: null,
        },
        eq,
        channelBalance,
      ),
    ).toMatchObject({
      estimatedOutputPeakDb: -1,
      estimatedOutputRmsDb: -14,
      headroomDb: 1,
      visualSpectrumVersion: 2,
      visualTelemetryState: 'fallback',
    });
  });

  it('ignores bypassed EQ bands when estimating DSP output gain', () => {
    const eq = eqState({
      enabled: true,
      preampDb: -2,
      bands: eqState().bands.map((band, index) => (index === 5 ? { ...band, gainDb: 10, enabled: false } : band)),
    });

    expect(computeDspEstimatedGainDb(eq, channelBalanceState())).toBe(-2);
  });
});
