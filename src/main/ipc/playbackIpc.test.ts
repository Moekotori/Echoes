import { EventEmitter } from 'node:events';
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
      headers: {
        Referer: 'https://music.163.com/',
        Cookie: 'MUSIC_U=secret',
      },
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
      inputHeaders: expect.objectContaining({
        Referer: 'https://music.163.com/',
        Cookie: 'MUSIC_U=secret',
      }),
      trackId: 'streaming-track',
      probe: expect.objectContaining({
        durationSeconds: 120,
        fileSampleRate: 44100,
        channels: 2,
      }),
    }));
  });

  it('refreshes an active streaming source when FFmpeg reports an expired CDN URL after playback started', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const reportAudioError = vi.fn();
    const recovery = {
      handler: null as ((error: Error, status: unknown) => boolean) | null,
    };
    let status = {
      state: 'playing',
      currentTrackId: null as string | null,
      positionSeconds: 0,
      durationSeconds: 239.932,
      currentFilePath: null as string | null,
    };
    const playLocalFile = vi.fn(async (request: {
      filePath: string;
      trackId?: string;
      startSeconds?: number;
      probe?: { durationSeconds?: number };
    }) => {
      status = {
        state: 'playing',
        currentTrackId: request.trackId ?? null,
        positionSeconds: request.startSeconds ?? 0,
        durationSeconds: request.probe?.durationSeconds ?? status.durationSeconds,
        currentFilePath: request.filePath,
      };
      return status;
    });
    const audioSession = Object.assign(new EventEmitter(), {
      getStatus: () => status,
      restorePlaybackMemory: vi.fn(),
      playLocalFile,
      setAudioErrorRecoveryHandler: vi.fn((handler: (error: Error, status: unknown) => boolean) => {
        recovery.handler = handler;
      }),
    });
    const invalidatePlayback = vi.fn();
    const resolvePlayback = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://m801.music.126.net/token/song.mp3?auth=old',
        sampleRate: 44100,
        codec: 'mp3',
        bitDepth: null,
        bitrate: 320000,
        headers: {
          Referer: 'https://music.163.com/',
        },
        requiresProxy: false,
      })
      .mockResolvedValueOnce({
        url: 'https://m701.music.126.net/token/song.mp3?auth=fresh',
        sampleRate: 44100,
        codec: 'mp3',
        bitDepth: null,
        bitrate: 320000,
        headers: {
          Referer: 'https://music.163.com/',
        },
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
      getAudioSession: () => audioSession,
    }));
    vi.doMock('../audio/PlaybackMemoryStore', () => ({
      getPlaybackMemoryStore: () => ({
        load: vi.fn(() => null),
        save: vi.fn(),
        clear: vi.fn(),
      }),
    }));
    vi.doMock('../diagnostics/CrashReportService', () => ({
      getCrashReportService: () => ({ reportAudioError }),
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
        invalidatePlayback,
      }),
    }));
    vi.doMock('../app/localFileOpen', () => ({ resolveLocalAudioFiles: vi.fn() }));

    const { IpcChannels } = await import('../../shared/constants/ipcChannels');
    const { registerPlaybackIpc } = await import('./playbackIpc');
    registerPlaybackIpc();

    const request = {
      item: {
        mediaType: 'streaming',
        trackId: 'streaming:netease:1442466883',
        provider: 'netease',
        providerTrackId: '1442466883',
        stableKey: 'streaming:netease:1442466883',
        quality: 'high',
        title: 'Expired CDN',
        artist: 'Artist',
        album: 'Album',
        duration: 239.932,
      },
    };

    await handlers.get(IpcChannels.PlaybackPlayMediaItem)?.({}, request);
    expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'https://m801.music.126.net/token/song.mp3?auth=old',
    }));

    status = { ...status, positionSeconds: 0.09039979999978096 };
    const expiredError = Object.assign(
      new Error('ffmpeg_exit_code_3436169992; kind="http_expired_or_forbidden"; stderr="Server returned 403 Forbidden"'),
      { ffmpegErrorKind: 'http_expired_or_forbidden' },
    );

    expect(recovery.handler?.(expiredError, status)).toBe(true);

    await expect.poll(() => playLocalFile.mock.calls.length).toBe(2);
    expect(invalidatePlayback).toHaveBeenCalledWith({
      provider: 'netease',
      providerTrackId: '1442466883',
      quality: 'high',
    });
    expect(playLocalFile).toHaveBeenLastCalledWith(expect.objectContaining({
      filePath: 'https://m701.music.126.net/token/song.mp3?auth=fresh',
      startSeconds: 0.09039979999978096,
      trackId: 'streaming:netease:1442466883',
    }));
    expect(reportAudioError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('ffmpeg_exit_code_3436169992'),
      phase: 'play-media-item-expired-url-retry',
      severity: 'recoverable',
      recovered: true,
    }));
  });

  it('refreshes missing remote duration and reuses the prepared proxy URL for playback', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const playLocalFile = vi.fn().mockResolvedValue(undefined);
    const setPlaybackActive = vi.fn();
    const refreshTrackMetadata = vi.fn().mockResolvedValue({ duration: 188.5 });
    const createStreamUrl = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:19000/remote-stream/token',
      expiresAt: '2026-01-01T06:00:00.000Z',
    });
    const backfillDuration = vi.fn();

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
          currentTrackId: 'remote-track',
          positionSeconds: 0,
          durationSeconds: 188.5,
          currentFilePath: 'http://127.0.0.1:19000/remote-stream/token',
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
        setPlaybackActive,
        refreshTrackMetadata,
        createStreamUrl,
        backfillDuration,
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

    const request = {
      item: {
        mediaType: 'remote',
        trackId: 'remote-track',
        sourceId: 'source-1',
        remotePath: '/音乐 Space/Echo Song.mp3',
        stableKey: 'stable-1',
        title: 'Echo Song',
        artist: 'Echo Artist',
        album: 'Echo Album',
        duration: null,
      },
    };

    await handlers.get(IpcChannels.PlaybackPrepareMediaItem)?.({}, request);
    await handlers.get(IpcChannels.PlaybackPlayMediaItem)?.({}, request);

    expect(setPlaybackActive).toHaveBeenCalledWith(true);
    expect(refreshTrackMetadata).toHaveBeenCalledWith('remote-track');
    expect(createStreamUrl).toHaveBeenCalledTimes(1);
    expect(createStreamUrl).toHaveBeenCalledWith({
      trackId: 'remote-track',
      sourceId: 'source-1',
      remotePath: '/音乐 Space/Echo Song.mp3',
      stableKey: 'stable-1',
    });
    expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'http://127.0.0.1:19000/remote-stream/token',
      trackId: 'remote-track',
      probe: { durationSeconds: 188.5 },
    }));
    expect(backfillDuration).toHaveBeenCalledWith('remote-track', 188.5);
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
