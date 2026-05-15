import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePlaybackFilePath } from './playbackPath';

describe('normalizePlaybackFilePath', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const makeTempRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'echo-playback-path-'));
    tempRoots.push(root);
    return root;
  };

  it('decodes percent-encoded local paths only when the decoded path exists', () => {
    const root = makeTempRoot();
    const folder = join(root, 'CloudMusic', '#ncm', 'unlock');
    const title = '\u738b\u83f2 \u6d41\u5e74';
    const decodedPath = join(folder, `${title}.flac`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(decodedPath, 'fake audio');

    const encodedPath = decodedPath.replace(title, encodeURIComponent(title));

    expect(normalizePlaybackFilePath(encodedPath)).toBe(decodedPath);
    expect(normalizePlaybackFilePath(join(folder, '%E7%8E%8B%E8%8F%B2.flac'))).toBe(join(folder, '%E7%8E%8B%E8%8F%B2.flac'));
  });

  it('converts file URLs and leaves streaming URLs untouched', () => {
    const root = makeTempRoot();
    const filePath = join(root, 'space track.flac');
    writeFileSync(filePath, 'fake audio');

    expect(normalizePlaybackFilePath(pathToFileURL(filePath).toString())).toBe(filePath);
    expect(normalizePlaybackFilePath('https://example.test/song.flac?token=%E7%8E%8B')).toBe(
      'https://example.test/song.flac?token=%E7%8E%8B',
    );
  });
});

describe('playback media prepare IPC', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses a prepared streaming playback source without resolving again', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const playLocalFile = vi.fn().mockResolvedValue(undefined);
    const resolvePlayback = vi.fn().mockResolvedValue({
      url: 'https://stream.example.test/song.flac?token=prepared',
      sampleRate: 44100,
      codec: 'flac',
      bitDepth: 16,
      bitrate: 900000,
      requiresProxy: false,
    });

    vi.doMock('electron', () => ({
      dialog: { showOpenDialog: vi.fn() },
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        }),
      },
    }));
    vi.doMock('../audio/AudioSession', () => ({
      getAudioSession: () => ({
        getStatus: () => ({
          state: 'playing',
          currentTrackId: 'streaming-track',
          positionSeconds: 0,
          durationSeconds: 120,
          currentFilePath: 'https://stream.example.test/song.flac?token=prepared',
        }),
        on: vi.fn(),
        restorePlaybackMemory: vi.fn(),
        playLocalFile,
      }),
    }));
    vi.doMock('../audio/PlaybackMemoryStore', () => ({
      getPlaybackMemoryStore: () => ({
        load: vi.fn(() => null),
        save: vi.fn(),
        clear: vi.fn(),
      }),
    }));
    vi.doMock('../integrations/smtc/SmtcStatusSync', () => ({ syncSmtcStatus: vi.fn() }));
    vi.doMock('../library/remote/RemoteSourceService', () => ({
      getRemoteSourceService: () => ({
        setPlaybackActive: vi.fn(),
        refreshTrackMetadata: vi.fn(),
        createStreamUrl: vi.fn(),
        backfillDuration: vi.fn(),
      }),
    }));
    vi.doMock('../streaming/StreamingService', () => ({
      getStreamingService: () => ({
        resolvePlayback,
        invalidatePlayback: vi.fn(),
      }),
    }));
    vi.doMock('../app/localFileOpen', () => ({ resolveLocalAudioFiles: vi.fn() }));

    const { IpcChannels } = await import('../../shared/constants/ipcChannels');
    const { registerPlaybackIpc } = await import('./playbackIpc');
    registerPlaybackIpc();

    const request = {
      item: {
        mediaType: 'streaming',
        trackId: 'streaming-track',
        provider: 'mock',
        providerTrackId: 'provider-track',
        stableKey: 'mock:provider-track',
        title: 'Prepared',
        artist: 'Artist',
        album: 'Album',
        duration: 120,
      },
    };

    await handlers.get(IpcChannels.PlaybackPrepareMediaItem)?.({}, request);
    await handlers.get(IpcChannels.PlaybackPlayMediaItem)?.({}, request);

    expect(resolvePlayback).toHaveBeenCalledTimes(1);
    expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'https://stream.example.test/song.flac?token=prepared',
      trackId: 'streaming-track',
      probe: expect.objectContaining({
        durationSeconds: 120,
        fileSampleRate: 44100,
        channels: 2,
      }),
    }));
  });

  it('forwards local file preparation failures without breaking the IPC call', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const prepareLocalFile = vi.fn().mockRejectedValue(new Error('probe failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.doMock('electron', () => ({
      dialog: { showOpenDialog: vi.fn() },
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        }),
      },
    }));
    vi.doMock('../audio/AudioSession', () => ({
      getAudioSession: () => ({
        getStatus: () => ({
          state: 'idle',
          currentTrackId: null,
          positionSeconds: 0,
          durationSeconds: 0,
          currentFilePath: null,
        }),
        on: vi.fn(),
        restorePlaybackMemory: vi.fn(),
        prepareLocalFile,
      }),
    }));
    vi.doMock('../audio/PlaybackMemoryStore', () => ({
      getPlaybackMemoryStore: () => ({
        load: vi.fn(() => null),
        save: vi.fn(),
        clear: vi.fn(),
      }),
    }));
    vi.doMock('../integrations/smtc/SmtcStatusSync', () => ({ syncSmtcStatus: vi.fn() }));
    vi.doMock('../library/remote/RemoteSourceService', () => ({
      getRemoteSourceService: () => ({
        setPlaybackActive: vi.fn(),
        refreshTrackMetadata: vi.fn(),
        createStreamUrl: vi.fn(),
        backfillDuration: vi.fn(),
      }),
    }));
    vi.doMock('../streaming/StreamingService', () => ({
      getStreamingService: () => ({
        resolvePlayback: vi.fn(),
        invalidatePlayback: vi.fn(),
      }),
    }));
    vi.doMock('../app/localFileOpen', () => ({ resolveLocalAudioFiles: vi.fn() }));

    const { IpcChannels } = await import('../../shared/constants/ipcChannels');
    const { registerPlaybackIpc } = await import('./playbackIpc');
    registerPlaybackIpc();

    await expect(handlers.get(IpcChannels.PlaybackPrepareLocalFile)?.({}, {
      filePath: 'D:\\Music\\next.flac',
      trackId: 'next',
      probe: { durationSeconds: 120, fileSampleRate: 44100, channels: 2 },
    })).resolves.toBeUndefined();

    expect(prepareLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'D:\\Music\\next.flac',
      trackId: 'next',
    }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('prepareLocalFile failed'));
    warn.mockRestore();
  });
});
