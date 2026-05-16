import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessByStdio, SpawnOptionsWithStdioTuple } from 'node:child_process';
import type { Readable } from 'node:stream';
import readline from 'node:readline';
import { resolveFfmpegToolchainPath } from '../../audio/FfmpegToolchain';

type AnalyzerProcess = ChildProcessByStdio<null, Readable, Readable>;
type AnalyzerSpawnOptions = SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'> & {
  windowsHide: boolean;
};
type AnalyzerSpawner = (file: string, args: string[], options: AnalyzerSpawnOptions) => AnalyzerProcess;

export type BpmAnalyzerDependencies = {
  ffmpegPath?: string;
  spawn?: AnalyzerSpawner;
  logger?: (message: string) => void;
};

export type BpmAnalyzerResult = {
  bpm: number;
  confidence: number;
  beatOffsetMs: number;
};

export type BpmAnalyzerOptions = {
  headers?: Record<string, string>;
};

const sampleRate = 11025;
const maxAnalyzeSeconds = 90;
const minAnalyzeSeconds = 20;
const frameSize = 1024;
const hopSize = 512;
const minBpm = 60;
const maxBpm = 200;

const defaultLogger = (message: string): void => {
  console.warn(message);
};

const appendTailLine = (lines: string[], line: string): void => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  lines.push(trimmed);
  if (lines.length > 8) {
    lines.shift();
  }
};

const normalizeBpm = (bpm: number): number => {
  let normalized = bpm;
  while (normalized < 80) {
    normalized *= 2;
  }
  while (normalized > 180) {
    normalized /= 2;
  }
  return normalized;
};

const median = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const readInt16Pcm = (buffer: Buffer): Float32Array => {
  const sampleCount = Math.floor(buffer.length / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return samples;
};

const onsetEnvelope = (samples: Float32Array): Float32Array => {
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hopSize));
  const energy = new Float32Array(frameCount);
  const envelope = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sum = 0;
    for (let offset = 0; offset < frameSize; offset += 1) {
      const sample = samples[start + offset] ?? 0;
      sum += sample * sample;
    }
    energy[frame] = Math.sqrt(sum / frameSize);
  }

  for (let frame = 1; frame < frameCount; frame += 1) {
    const historyStart = Math.max(0, frame - 8);
    const baseline = median(Array.from(energy.slice(historyStart, frame)));
    envelope[frame] = Math.max(0, energy[frame] - baseline * 1.12);
  }

  const peak = Math.max(...envelope);
  if (peak > 0) {
    for (let frame = 0; frame < envelope.length; frame += 1) {
      envelope[frame] /= peak;
    }
  }

  return envelope;
};

const estimateTempo = (envelope: Float32Array): BpmAnalyzerResult => {
  const envelopeRate = sampleRate / hopSize;
  const minLag = Math.max(1, Math.floor((60 * envelopeRate) / maxBpm));
  const maxLag = Math.ceil((60 * envelopeRate) / minBpm);
  let bestLag = minLag;
  let bestScore = 0;
  let secondScore = 0;
  const lagScores: number[] = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      score += envelope[index] * envelope[index - lag];
    }
    lagScores.push(score);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const rawBpm = 60 * envelopeRate / bestLag;
  const bpm = normalizeBpm(rawBpm);
  const beatPeriodFrames = Math.max(1, Math.round((60 / bpm) * envelopeRate));
  const phaseScores = new Float32Array(beatPeriodFrames);

  for (let index = 0; index < envelope.length; index += 1) {
    phaseScores[index % beatPeriodFrames] += envelope[index];
  }

  let bestPhase = 0;
  let bestPhaseScore = 0;
  for (let phase = 0; phase < phaseScores.length; phase += 1) {
    if (phaseScores[phase] > bestPhaseScore) {
      bestPhaseScore = phaseScores[phase];
      bestPhase = phase;
    }
  }

  const scoreMean = lagScores.reduce((total, score) => total + score, 0) / Math.max(1, lagScores.length);
  const peakRatio = bestScore > 0 ? Math.max(0, Math.min(1, (bestScore - Math.max(secondScore, scoreMean)) / bestScore)) : 0;
  const onsetDensity = Array.from(envelope).filter((value) => value > 0.2).length / Math.max(1, envelope.length);
  const confidence = Math.max(0, Math.min(1, peakRatio * 0.75 + Math.min(0.25, onsetDensity)));

  return {
    bpm: Math.round(bpm * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    beatOffsetMs: Math.round((bestPhase / envelopeRate) * 1000),
  };
};

export class BpmAnalyzer {
  private readonly ffmpegPath: string;
  private readonly spawn: AnalyzerSpawner;
  private readonly logger: (message: string) => void;

  constructor(dependencies: BpmAnalyzerDependencies = {}) {
    this.ffmpegPath = dependencies.ffmpegPath ?? resolveFfmpegToolchainPath();
    this.spawn = dependencies.spawn ?? (nodeSpawn as AnalyzerSpawner);
    this.logger = dependencies.logger ?? defaultLogger;
  }

  async analyze(filePath: string, durationSeconds = maxAnalyzeSeconds, options: BpmAnalyzerOptions = {}): Promise<BpmAnalyzerResult> {
    const analyzeSeconds = Math.max(minAnalyzeSeconds, Math.min(maxAnalyzeSeconds, durationSeconds || maxAnalyzeSeconds));
    const inputHeaders = Object.entries(options.headers ?? {})
      .filter(([name, value]) => name.trim() && value.trim())
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('');
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      ...(inputHeaders ? ['-headers', inputHeaders] : []),
      '-i',
      filePath,
      '-vn',
      '-t',
      String(analyzeSeconds),
      '-f',
      's16le',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      'pipe:1',
    ];
    const stderrLines: string[] = [];
    const proc = this.spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    const stderr = readline.createInterface({ input: proc.stderr });
    stderr.on('line', (line) => {
      appendTailLine(stderrLines, line);
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      proc.on('error', reject);
      proc.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ffmpeg_exit_${code ?? signal ?? 'unknown'}: ${stderrLines.join(' | ')}`));
      });
    });

    const samples = readInt16Pcm(Buffer.concat(chunks));
    if (samples.length < sampleRate * 10) {
      throw new Error('audio_too_short_for_bpm_analysis');
    }

    const result = estimateTempo(onsetEnvelope(samples));
    this.logger(
      `[BpmAnalyzer] file="${filePath}" bpm=${result.bpm} confidence=${result.confidence} offsetMs=${result.beatOffsetMs}`,
    );
    return result;
  }
}
