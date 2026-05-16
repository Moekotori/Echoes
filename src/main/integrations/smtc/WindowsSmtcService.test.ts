import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { WindowsSmtcService, resolveDefaultSmtcHostPath } from './WindowsSmtcService';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'D:\\Project\\ECHONext',
    getPath: () => 'D:\\Echo',
    isPackaged: false,
  },
}));

const createFakeHost = () => {
  const events = new EventEmitter();
  const host = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    exitCode: null as number | null,
    kill: vi.fn(() => {
      host.killed = true;
      return true;
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      events.on(event, listener);
      return host;
    }),
    once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      events.once(event, listener);
      return host;
    }),
    emit: (event: string, ...args: unknown[]) => {
      if (event === 'exit') {
        host.exitCode = typeof args[0] === 'number' ? args[0] : null;
      }
      return events.emit(event, ...args);
    },
  };

  return host;
};

describe('WindowsSmtcService', () => {
  it('resolves the development helper path from the Electron app path', () => {
    expect(resolveDefaultSmtcHostPath()).toBe('D:\\Project\\ECHONext\\electron-app\\build\\echo-smtc-host.exe');
  });

  it('spawns the helper and writes JSONL updates', async () => {
    const host = createFakeHost();
    const writes: string[] = [];
    host.stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const spawnHost = vi.fn(() => host as never);
    const service = new WindowsSmtcService({
      spawnHost,
      hostExists: () => true,
      resolveHostPath: () => 'D:\\Echo\\echo-smtc-host.exe',
      coverCache: { resolve: vi.fn(async () => 'D:\\Echo\\cover.png') },
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    await service.initialize();
    await service.setMetadata({
      trackId: 'track-1',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Album Artist',
      durationSeconds: 120,
      positionSeconds: 5,
      coverPath: 'D:\\Echo\\cover.webp',
      coverUrl: null,
    });
    await service.setPlaybackState('playing');

    expect(spawnHost).toHaveBeenCalledWith('D:\\Echo\\echo-smtc-host.exe', [], expect.objectContaining({ windowsHide: true }));
    expect(writes.join('')).toContain('"type":"setMetadata"');
    expect(writes.join('')).toContain('"coverPath":"D:\\\\Echo\\\\cover.png"');
    expect(writes.join('')).toContain('"type":"setPlaybackState"');
  });

  it('maps helper stdout commands back to SMTC handlers', async () => {
    const host = createFakeHost();
    const service = new WindowsSmtcService({
      spawnHost: vi.fn(() => host as never),
      hostExists: () => true,
      resolveHostPath: () => 'D:\\Echo\\echo-smtc-host.exe',
      coverCache: { resolve: vi.fn(async () => null) },
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const handler = vi.fn();
    service.onCommand(handler);

    await service.initialize();
    host.stdout.write('{"type":"command","command":"next"}\n');

    expect(handler).toHaveBeenCalledWith('next');
  });

  it('falls back quietly when the helper binary is missing', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const spawnHost = vi.fn();
    const service = new WindowsSmtcService({
      spawnHost,
      hostExists: () => false,
      resolveHostPath: () => 'D:\\Echo\\missing.exe',
      coverCache: { resolve: vi.fn(async () => null) },
      logger,
    });

    await service.setPlaybackState('playing');

    expect(spawnHost).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[SMTC] Windows SMTC host binary is missing; using no-op bridge mode',
      expect.objectContaining({ hostPath: 'D:\\Echo\\missing.exe' }),
    );
  });

  it('disposes the helper gracefully without force killing when it exits', async () => {
    const host = createFakeHost();
    const writes: string[] = [];
    host.stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const service = new WindowsSmtcService({
      spawnHost: vi.fn(() => host as never),
      hostExists: () => true,
      resolveHostPath: () => 'D:\\Echo\\echo-smtc-host.exe',
      coverCache: { resolve: vi.fn(async () => null) },
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    await service.initialize();
    const disposed = service.dispose();
    host.emit('exit', 0, null);
    await disposed;

    expect(writes.join('')).toContain('"type":"dispose"');
    expect(host.kill).not.toHaveBeenCalled();
  });

  it('force kills the helper when graceful dispose times out', async () => {
    vi.useFakeTimers();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const host = createFakeHost();
    const service = new WindowsSmtcService({
      spawnHost: vi.fn(() => host as never),
      hostExists: () => true,
      resolveHostPath: () => 'D:\\Echo\\echo-smtc-host.exe',
      coverCache: { resolve: vi.fn(async () => null) },
      logger,
    });

    await service.initialize();
    const stopped = service.stopGracefullyImpl(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await stopped;

    expect(host.kill).toHaveBeenCalledWith('SIGKILL');
    expect(logger.warn).toHaveBeenCalledWith('[SMTC] graceful shutdown timed out, force killing');
    vi.useRealTimers();
  });
});
