import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashReportService } from './CrashReportService';
import { sanitizeLogPayload } from './Logger';

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'downloads' ? tmpdir() : tmpdir()),
    getVersion: () => '1.0.1-test',
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
  },
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: () => ({
    networkMetadataEnabled: true,
    token: 'secret-token',
    nested: { cookie: 'session-cookie' },
  }),
}));

vi.mock('../audio/AudioSession', () => ({
  getAudioSession: () => ({
    getStatus: () => ({
      host: 'ready',
      state: 'playing',
      outputDeviceId: 'device-1',
      outputDeviceName: 'Speakers',
      outputDeviceType: null,
      outputBackend: 'native',
      outputMode: 'shared',
      volume: 1,
      playbackRate: 1,
      playbackSpeedMode: 'nightcore',
      currentFilePath: 'D:\\Music\\private-song.flac',
      currentTrackId: 'track-1',
      durationSeconds: 120,
      positionSeconds: 12,
      channels: 2,
      codec: 'flac',
      bitDepth: 16,
      bitrate: null,
      fileSampleRate: 44100,
      decoderOutputSampleRate: 44100,
      requestedOutputSampleRate: null,
      actualDeviceSampleRate: 44100,
      sharedDeviceSampleRate: 44100,
      resampling: false,
      bitPerfectCandidate: true,
      sampleRateMismatch: false,
      eqEnabled: false,
      channelBalanceEnabled: false,
      dspActive: false,
      preampDb: 0,
      eqPresetName: null,
      clippingRisk: false,
      bitPerfectDisabledReason: null,
      warnings: [],
      error: null,
    }),
  }),
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: () => ({
    getDiagnostics: () => ({
      foldersCount: 1,
      tracksCount: 2,
      albumsCount: 1,
      artistsCount: 1,
      coversCount: 1,
      lastScan: null,
      lastQueryMs: { getTracks: null, getAlbums: null },
      averageAlbumPayloadBytes: null,
      databasePath: 'D:\\Music\\echo.db',
      databaseSizeBytes: 1024,
      coverCachePath: 'D:\\Music\\covers',
      coverCacheSizeBytes: 2048,
      coverCacheVersion: 1,
    }),
  }),
}));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const unzipEntries = (zipPath: string): Record<string, string> => {
  const buffer = readFileSync(zipPath);
  const entries: Record<string, string> = {};
  let offset = 0;

  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries[name] = method === 8 ? inflateRawSync(compressed).toString('utf8') : compressed.toString('utf8');
    offset = dataStart + compressedSize;
  }

  return entries;
};

describe('CrashReportService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'echo-diagnostics-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a running session', () => {
    const service = new CrashReportService(tempDir);

    service.initialize();

    const sessionPath = join(service.getSessionDir()!, 'session.json');
    const session = readJson<{ status: string; appVersion: string }>(sessionPath);
    expect(session.status).toBe('running');
    expect(session.appVersion).toBe('1.0.1-test');
  });

  it('marks the session closed on normal shutdown', () => {
    const service = new CrashReportService(tempDir);

    service.initialize();
    service.closeSession();

    const session = readJson<{ status: string; endedAt?: string }>(join(service.getSessionDir()!, 'session.json'));
    expect(session.status).toBe('closed');
    expect(session.endedAt).toBeTruthy();
  });

  it('detects a previous running session as an abnormal exit', () => {
    const sessionsDir = join(tempDir, 'crash-reports', 'sessions');
    const previousDir = join(sessionsDir, '0001');
    mkdirSync(previousDir, { recursive: true });
    writeFileSync(
      join(previousDir, 'session.json'),
      JSON.stringify({
        sessionId: '0001',
        appVersion: '1.0.1-test',
        electronVersion: 'test',
        chromeVersion: 'test',
        nodeVersion: 'test',
        platform: 'win32',
        arch: 'x64',
        startedAt: '2026-05-13T00:00:00.000Z',
        status: 'running',
      }),
    );

    const service = new CrashReportService(tempDir);
    service.initialize();

    expect(service.getLastCrashSummary()).toEqual(expect.objectContaining({ sessionId: '0001', reason: 'abnormalExit' }));
    expect(readJson<{ status: string }>(join(previousDir, 'session.json')).status).toBe('abnormalExit');
  });

  it('writes renderer errors to renderer and crash logs', () => {
    const service = new CrashReportService(tempDir);
    service.initialize();

    service.reportRendererError({
      message: 'White screen',
      stack: 'stack',
      filename: 'D:\\Project\\secret.tsx',
      lineno: 10,
      colno: 2,
      source: 'error',
      timestamp: '2026-05-13T00:00:00.000Z',
    });

    expect(readFileSync(join(service.getSessionDir()!, 'renderer.log'), 'utf8')).toContain('White screen');
    expect(readFileSync(join(service.getSessionDir()!, 'crash.log'), 'utf8')).toContain('White screen');
  });

  it('redacts sensitive log payload fields', () => {
    const sanitized = sanitizeLogPayload({
      token: 'abc',
      cookie: 'def',
      password: 'ghi',
      authorization: 'Bearer secret',
      nested: { normal: 'ok' },
    });

    expect(sanitized).toEqual({
      token: '[redacted]',
      cookie: '[redacted]',
      password: '[redacted]',
      authorization: '[redacted]',
      nested: { normal: 'ok' },
    });
  });

  it('exports a safe diagnostics zip without media files, cover binaries, lyrics, or secrets', async () => {
    const service = new CrashReportService(tempDir);
    const outputPath = join(tempDir, 'diagnostics.zip');
    service.initialize();
    service.reportCrash({ type: 'test', message: 'Synthetic crash' });

    await service.exportDiagnosticsZip(outputPath);

    const entries = unzipEntries(outputPath);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        'session.json',
        'crash.json',
        'main.log',
        'crash.log',
        'app-settings.safe.json',
        'library-diagnostics.safe.json',
        'playback-status.safe.json',
        'audio-status.safe.json',
        'package-version-info.json',
      ]),
    );
    expect(Object.keys(entries).some((name) => /\.(flac|mp3|jpg|jpeg|png|lrc)$/i.test(name))).toBe(false);
    const combined = Object.values(entries).join('\n');
    expect(combined).not.toContain('secret-token');
    expect(combined).not.toContain('session-cookie');
    expect(combined).not.toContain('D:\\Music\\private-song.flac');
    expect(combined).not.toContain('full lyrics');
  });
});
