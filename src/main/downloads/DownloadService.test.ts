import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DownloadService } from './DownloadService';

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-download-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const makeToolPath = (): string => {
  const root = makeTempRoot();
  const toolPath = join(root, 'yt-dlp.exe');
  writeFileSync(toolPath, 'stub');
  return toolPath;
};

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('DownloadService', () => {
  it('checks the bundled yt-dlp path with --version', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn(() => ({
      promise: Promise.resolve({ stdout: '2026.05.01\n', stderr: '', exitCode: 0 }),
      kill: vi.fn(),
    }));
    const service = new DownloadService(commandRunner, () => ytDlpPath);

    const tools = await service.checkTools();

    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, ['--version']);
    expect(tools.ytDlpAvailable).toBe(true);
    expect(tools.ytDlpVersion).toBe('2026.05.01');
    expect(tools.ytDlpPath).toBe(ytDlpPath);
  });

  it('rejects real download jobs until an output directory is selected', () => {
    const service = new DownloadService();

    expect(() => service.createUrlJob('https://www.youtube.com/watch?v=probe')).toThrow('请选择下载文件夹');
  });

  it('probes URL metadata, downloads, and completes without importing when disabled', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const outputPath = join(outputDirectory, 'Probe Song [probe].m4a');
    const commandRunner = vi.fn(() => ({
      promise: Promise.resolve({
        stdout: JSON.stringify({
          title: 'Probe Song',
          duration: 245,
          thumbnail: 'https://img.example/cover.jpg',
          webpage_url: 'https://www.youtube.com/watch?v=probe',
        }),
        stderr: '',
        exitCode: 0,
      }),
      kill: vi.fn(),
    }));
    const streamingCommandRunner = vi.fn((_command, _args, listeners) => {
      listeners.onStdout?.('[download]  50.0% of 10.00MiB at 1.00MiB/s ETA 00:05');
      writeFileSync(outputPath, 'audio');
      listeners.onStdout?.(outputPath);
      return {
        promise: Promise.resolve({ stdout: outputPath, stderr: '', exitCode: 0 }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, { streamingCommandRunner });
    service.setSettings({ outputDirectory, importToLibrary: false });

    const job = service.createUrlJob('https://www.youtube.com/watch?v=probe', { importToLibrary: false });
    await flushMicrotasks();

    const completedJob = service.getJobs().find((item) => item.id === job.id)!;
    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, ['--dump-json', '--no-playlist', 'https://www.youtube.com/watch?v=probe']);
    expect(streamingCommandRunner).toHaveBeenCalled();
    expect(completedJob.title).toBe('Probe Song');
    expect(completedJob.durationSeconds).toBe(245);
    expect(completedJob.thumbnailUrl).toBe('https://img.example/cover.jpg');
    expect(completedJob.status).toBe('completed');
    expect(completedJob.outputPath).toBe(outputPath);
  });

  it('marks the job failed when yt-dlp probe fails', async () => {
    const ytDlpPath = makeToolPath();
    const service = new DownloadService(
      () => ({
        promise: Promise.resolve({ stdout: '', stderr: 'Unsupported URL', exitCode: 1 }),
        kill: vi.fn(),
      }),
      () => ytDlpPath,
    );
    service.setSettings({ outputDirectory: makeTempRoot() });

    const job = service.createUrlJob('https://example.com/video');
    await flushMicrotasks();

    const failedJob = service.getJobs().find((item) => item.id === job.id)!;
    expect(failedJob.status).toBe('failed');
    expect(failedJob.error).toBe('Unsupported URL');
  });

  it('kills an active probe process when the job is cancelled', async () => {
    const ytDlpPath = makeToolPath();
    const kill = vi.fn();
    const service = new DownloadService(
      () => ({
        promise: new Promise(() => {}),
        kill,
      }),
      () => ytDlpPath,
    );
    service.setSettings({ outputDirectory: makeTempRoot() });

    const job = service.createUrlJob('https://www.bilibili.com/video/BV1ECHO');
    const cancelledJob = service.cancelJob(job.id);

    expect(kill).toHaveBeenCalledTimes(1);
    expect(cancelledJob?.status).toBe('cancelled');
  });

  it('imports the downloaded file and binds the source URL after import', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const outputPath = join(outputDirectory, 'Bound Song [bound].m4a');
    const importAudioFile = vi.fn(async () => ({ id: 'track-1' }));
    const bindMvUrl = vi.fn();
    const service = new DownloadService(
      () => ({
        promise: Promise.resolve({
          stdout: JSON.stringify({
            title: 'Bound Song',
            webpage_url: 'https://www.bilibili.com/video/BV1ECHO',
          }),
          stderr: '',
          exitCode: 0,
        }),
        kill: vi.fn(),
      }),
      () => ytDlpPath,
      {
        importAudioFile,
        bindMvUrl,
        streamingCommandRunner: (_command, _args, listeners) => {
          writeFileSync(outputPath, 'audio');
          listeners.onStdout?.(outputPath);
          return {
            promise: Promise.resolve({ stdout: outputPath, stderr: '', exitCode: 0 }),
            kill: vi.fn(),
          };
        },
      },
    );
    service.setSettings({ outputDirectory, importToLibrary: true, bindMvAfterImport: true });

    const job = service.createUrlJob('https://www.bilibili.com/video/BV1ECHO');
    await flushMicrotasks();

    const completedJob = service.getJobs().find((item) => item.id === job.id)!;
    expect(completedJob.status).toBe('completed');
    expect(completedJob.importedTrackId).toBe('track-1');
    expect(importAudioFile).toHaveBeenCalledWith(outputPath, { folderPath: outputDirectory });
    expect(bindMvUrl).toHaveBeenCalledWith('track-1', 'https://www.bilibili.com/video/BV1ECHO');
  });
});
