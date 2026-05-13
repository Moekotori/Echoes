import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import type { AudioStatus } from './audioTypes';
import type { PlaybackProbeHint } from '../../shared/types/playback';

export type PlaybackMemory = {
  filePath: string;
  trackId: string | null;
  positionSeconds: number;
  durationSeconds: number;
  probe?: PlaybackProbeHint;
  updatedAt: string;
};

const getMemoryPath = (): string => join(app.getPath('userData'), 'echo-playback-memory.json');

const finiteNonNegative = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
};

const normalizeProbe = (value: unknown): PlaybackProbeHint | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const probe: PlaybackProbeHint = {};
  const durationSeconds = finiteNonNegative(input.durationSeconds);
  const fileSampleRate = input.fileSampleRate === null ? null : finiteNonNegative(input.fileSampleRate);
  const channels = finiteNonNegative(input.channels);
  const bitDepth = input.bitDepth === null ? null : finiteNonNegative(input.bitDepth);
  const bitrate = input.bitrate === null ? null : finiteNonNegative(input.bitrate);

  if (durationSeconds !== null) {
    probe.durationSeconds = durationSeconds;
  }
  if (fileSampleRate !== null) {
    probe.fileSampleRate = input.fileSampleRate === null ? null : Math.round(fileSampleRate);
  }
  if (channels !== null && channels > 0) {
    probe.channels = Math.max(1, Math.min(8, Math.round(channels)));
  }
  if (typeof input.codec === 'string') {
    probe.codec = input.codec;
  }
  if (bitDepth !== null) {
    probe.bitDepth = input.bitDepth === null ? null : Math.round(bitDepth);
  }
  if (bitrate !== null) {
    probe.bitrate = input.bitrate === null ? null : Math.round(bitrate);
  }

  return Object.keys(probe).length > 0 ? probe : undefined;
};

const normalizeMemory = (value: unknown): PlaybackMemory | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const filePath = typeof input.filePath === 'string' && input.filePath.trim() ? input.filePath : null;
  const positionSeconds = finiteNonNegative(input.positionSeconds);
  const durationSeconds = finiteNonNegative(input.durationSeconds);

  if (!filePath || positionSeconds === null) {
    return null;
  }

  return {
    filePath,
    trackId: typeof input.trackId === 'string' && input.trackId.trim() ? input.trackId : null,
    positionSeconds,
    durationSeconds: durationSeconds ?? 0,
    probe: normalizeProbe(input.probe),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
  };
};

export class PlaybackMemoryStore {
  load(): PlaybackMemory | null {
    const memoryPath = getMemoryPath();

    if (!existsSync(memoryPath)) {
      return null;
    }

    try {
      return normalizeMemory(JSON.parse(readFileSync(memoryPath, 'utf8')));
    } catch {
      return null;
    }
  }

  save(status: AudioStatus): void {
    if (!status.currentFilePath || status.state === 'stopped' || status.state === 'idle') {
      this.clear();
      return;
    }

    const memory: PlaybackMemory = {
      filePath: status.currentFilePath,
      trackId: status.currentTrackId,
      positionSeconds: Math.max(0, status.positionSeconds),
      durationSeconds: Math.max(0, status.durationSeconds),
      probe: {
        durationSeconds: Math.max(0, status.durationSeconds),
        fileSampleRate: status.fileSampleRate,
        channels: status.channels ?? undefined,
        codec: status.codec,
        bitDepth: status.bitDepth,
        bitrate: status.bitrate,
      },
      updatedAt: new Date().toISOString(),
    };
    const memoryPath = getMemoryPath();

    mkdirSync(dirname(memoryPath), { recursive: true });
    writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  }

  clear(): void {
    const memoryPath = getMemoryPath();

    try {
      if (existsSync(memoryPath)) {
        rmSync(memoryPath);
      }
    } catch {
      // Playback memory is best-effort and should never break playback controls.
    }
  }
}

let defaultPlaybackMemoryStore: PlaybackMemoryStore | null = null;

export const getPlaybackMemoryStore = (): PlaybackMemoryStore => {
  defaultPlaybackMemoryStore ??= new PlaybackMemoryStore();
  return defaultPlaybackMemoryStore;
};
