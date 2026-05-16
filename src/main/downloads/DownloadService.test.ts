import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

const waitForJob = async (service: DownloadService, jobId: string): Promise<ReturnType<DownloadService['getJobs']>[number]> => {
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const job = service.getJobs().find((item) => item.id === jobId);
    if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
      return job;
    }
  }

  const job = service.getJobs().find((item) => item.id === jobId);
  if (!job) {
    throw new Error(`Missing job ${jobId}`);
  }
  return job;
};

const waitForCondition = async (condition: () => boolean, describeFailure: string | (() => string) = 'Timed out waiting for condition'): Promise<void> => {
  for (let index = 0; index < 40; index += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(typeof describeFailure === 'function' ? describeFailure() : describeFailure);
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('DownloadService', () => {
  it('checks the bundled yt-dlp path with --version', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, _args: string[]) => ({
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

  it('rejects Spotify URLs before creating a download job', () => {
    const service = new DownloadService();

    expect(() => service.createUrlJob('https://open.spotify.com/track/spotify-track-id')).toThrow(
      'Spotify streams are playback-only in ECHO Next',
    );
    expect(() => service.createUrlJob('https://example.com/audio.mp3', { webpageUrl: 'spotify:track:spotify-track-id' })).toThrow(
      'Spotify streams are playback-only in ECHO Next',
    );
  });

  it('loads and saves download settings through the settings store', () => {
    const outputDirectory = makeTempRoot();
    const saveSettings = vi.fn();
    const addLibraryFolder = vi.fn();
    const service = new DownloadService(undefined, undefined, {
      addLibraryFolder,
      loadSettings: () => ({ outputDirectory, importToLibrary: false, bindMvAfterImport: false }),
      saveSettings,
    });

    expect(service.getSettings()).toMatchObject({
      outputDirectory,
      importToLibrary: false,
      bindMvAfterImport: false,
    });

    const next = service.setSettings({ importToLibrary: true });

    expect(next.importToLibrary).toBe(true);
    expect(addLibraryFolder).toHaveBeenCalledWith(outputDirectory);
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ outputDirectory, importToLibrary: true }));
  });

  it('registers the selected download directory as a library folder', () => {
    const outputDirectory = makeTempRoot();
    const addLibraryFolder = vi.fn();
    const service = new DownloadService(undefined, undefined, {
      addLibraryFolder,
      loadSettings: () => ({ outputDirectory: null }),
      saveSettings: vi.fn(),
    });

    service.setSettings({ outputDirectory });

    expect(addLibraryFolder).toHaveBeenCalledWith(outputDirectory);
  });

  it('searches YouTube and Bilibili with yt-dlp and maps results', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, args: string[]) => {
      const searchUrl = args.at(-1);
      const providerEntry =
        typeof searchUrl === 'string' && searchUrl.startsWith('ytsearch')
          ? {
              id: 'yt-1',
              title: 'YouTube Song',
              url: 'https://www.youtube.com/watch?v=yt-1',
              uploader: 'YT Artist',
              duration: 123,
              thumbnails: [{ url: 'https://img.youtube/thumb-small.jpg' }, { url: 'https://img.youtube/thumb.jpg' }],
              view_count: 1000,
              upload_date: '20260514',
            }
          : {
              id: 'BV1ECHO',
              title: 'Bilibili Song',
              url: 'https://www.bilibili.com/video/BV1ECHO',
              uploader: 'Bili Artist',
              duration: 234,
              thumbnail: 'https://img.bilibili/thumb.jpg',
              view_count: 2000,
            };

      return {
        promise: Promise.resolve({ stdout: JSON.stringify({ entries: [providerEntry] }), stderr: '', exitCode: 0 }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      getAccountCredentials: (provider) => ({ provider }),
    });

    const response = await service.search({ query: 'echo', limitPerProvider: 1 });

    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, expect.arrayContaining(['--playlist-end', '1', 'ytsearch1:echo']));
    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, expect.arrayContaining(['--playlist-end', '1', 'bilisearch1:echo']));
    expect(response.errors).toEqual([]);
    expect(response.results).toEqual([
      expect.objectContaining({
        provider: 'youtube',
        id: 'yt-1',
        title: 'YouTube Song',
        uploader: 'YT Artist',
        webpageUrl: 'https://www.youtube.com/watch?v=yt-1',
        thumbnailUrl: 'https://img.youtube/thumb.jpg',
        publishedAt: '2026-05-14',
      }),
      expect.objectContaining({
        provider: 'bilibili',
        id: 'BV1ECHO',
        title: 'Bilibili Song',
        uploader: 'Bili Artist',
        webpageUrl: 'https://www.bilibili.com/video/BV1ECHO',
        thumbnailUrl: 'https://img.bilibili/thumb.jpg',
      }),
    ]);
  });

  it('searches only the selected provider when requested', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, args: string[]) => ({
      promise: Promise.resolve({
        stdout: JSON.stringify({
          entries: [{ id: 'BV1ECHO', title: 'Bilibili Song', url: 'https://www.bilibili.com/video/BV1ECHO' }],
        }),
        stderr: '',
        exitCode: 0,
      }),
      kill: vi.fn(),
    }));
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      getAccountCredentials: (provider) => ({ provider }),
    });

    const response = await service.search({ query: 'echo', limitPerProvider: 1, provider: 'bilibili' });

    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, expect.arrayContaining(['bilisearch1:echo']));
    expect(commandRunner.mock.calls[0][1]).not.toContain('ytsearch1:echo');
    expect(response.results).toEqual([expect.objectContaining({ provider: 'bilibili', title: 'Bilibili Song' })]);
  });

  it('uses account cookies for search and removes temporary cookie files', async () => {
    const ytDlpPath = makeToolPath();
    const cookiePaths: string[] = [];
    const commandRunner = vi.fn((_command: string, args: string[]) => {
      const cookieIndex = args.indexOf('--cookies');
      if (cookieIndex >= 0) {
        cookiePaths.push(args[cookieIndex + 1]);
      }

      return {
        promise: Promise.resolve({ stdout: JSON.stringify({ entries: [] }), stderr: '', exitCode: 0 }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      getAccountCredentials: (provider) => ({
        provider,
        cookie: provider === 'youtube' ? 'SID=abc; HSID=def' : 'SESSDATA=bili',
      }),
    });

    await service.search('echo');

    expect(cookiePaths).toHaveLength(2);
    expect(cookiePaths.every((cookiePath) => !existsSync(cookiePath))).toBe(true);
  });

  it('uses YouTube browser cookies when no saved YouTube cookie exists', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, _args: string[]) => ({
      promise: Promise.resolve({ stdout: JSON.stringify({ entries: [] }), stderr: '', exitCode: 0 }),
      kill: vi.fn(),
    }));
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      getAccountCredentials: (provider) => ({
        provider,
        browser: provider === 'youtube' ? 'edge' : undefined,
      }),
    });

    await service.search({ query: 'echo', limitPerProvider: 1 });

    const youtubeCall = commandRunner.mock.calls.find((call) => call[1].includes('ytsearch1:echo'));
    expect(youtubeCall?.[1] ?? []).toEqual(expect.arrayContaining(['--cookies-from-browser', 'edge']));
  });

  it('retries search without account cookies when authenticated search fails', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, args: string[]) => {
      const searchUrl = args.at(-1);
      if (typeof searchUrl === 'string' && searchUrl.startsWith('ytsearch') && args.includes('--cookies-from-browser')) {
        return {
          promise: Promise.resolve({
            stdout: '',
            stderr: 'ERROR: Could not copy Chrome cookie database. See https://github.com/yt-dlp/yt-dlp/issues/7271 for more info',
            exitCode: 1,
          }),
          kill: vi.fn(),
        };
      }

      const entries =
        typeof searchUrl === 'string' && searchUrl.startsWith('ytsearch')
          ? [{ id: 'yt-fallback', title: 'Fallback Song', url: 'https://www.youtube.com/watch?v=yt-fallback' }]
          : [];
      return {
        promise: Promise.resolve({ stdout: JSON.stringify({ entries }), stderr: '', exitCode: 0 }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      fetch: vi.fn(async () => ({ ok: false })) as unknown as typeof fetch,
      getAccountCredentials: (provider) => ({
        provider,
        browser: provider === 'youtube' ? 'chrome' : undefined,
      }),
    });

    const response = await service.search({ query: 'echo', limitPerProvider: 1 });

    const youtubeCalls = commandRunner.mock.calls.filter((call) => call[1].includes('ytsearch1:echo'));
    expect(youtubeCalls).toHaveLength(2);
    expect(youtubeCalls[0][1]).toEqual(expect.arrayContaining(['--cookies-from-browser', 'chrome']));
    expect(youtubeCalls[1][1]).not.toContain('--cookies-from-browser');
    expect(response.errors).toEqual([]);
    expect(response.results).toEqual([
      expect.objectContaining({
        provider: 'youtube',
        id: 'yt-fallback',
        title: 'Fallback Song',
      }),
    ]);
  });

  it('falls back to the Bilibili web search API when yt-dlp bilisearch is blocked', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, args: string[]) => {
      const searchUrl = args.at(-1);
      return {
        promise: Promise.resolve({
          stdout: '',
          stderr:
            typeof searchUrl === 'string' && searchUrl.startsWith('bilisearch')
              ? 'ERROR: Unable to download JSON metadata: HTTP Error 412: Precondition Failed'
              : '',
          exitCode: 1,
        }),
        kill: vi.fn(),
      };
    });
    const fetchRunner = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          result: [
            {
              bvid: 'BV1ECHO',
              title: '<em class="keyword">籽岷</em> Bilibili Song',
              author: 'Bili Artist',
              duration: '18:01',
              pic: '//i0.hdslb.com/bfs/archive/cover.jpg',
              arcurl: 'https://www.bilibili.com/video/BV1ECHO',
              play: 33000,
              pubdate: 1778729958,
            },
          ],
        },
      }),
    })) as unknown as typeof fetch;
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      fetch: fetchRunner,
      getAccountCredentials: (provider) => ({ provider, cookie: provider === 'bilibili' ? 'SESSDATA=bili' : undefined }),
    });

    const response = await service.search({ query: '籽岷', limitPerProvider: 1, provider: 'bilibili' });

    expect(fetchRunner).toHaveBeenCalledWith(
      expect.stringContaining('api.bilibili.com/x/web-interface/search/type'),
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: 'SESSDATA=bili',
          referer: 'https://www.bilibili.com/',
        }),
      }),
    );
    expect(response.errors).toEqual([]);
    expect(response.results).toEqual([
      expect.objectContaining({
        provider: 'bilibili',
        id: 'BV1ECHO',
        title: '籽岷 Bilibili Song',
        durationSeconds: 1081,
        thumbnailUrl: 'echo-image://remote/https%3A%2F%2Fi0.hdslb.com%2Fbfs%2Farchive%2Fcover.jpg?referer=https%3A%2F%2Fwww.bilibili.com%2F',
        webpageUrl: 'https://www.bilibili.com/video/BV1ECHO',
      }),
    ]);
  });

  it('falls back to the Bilibili web search API when yt-dlp bilisearch returns no entries', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, _args: string[]) => ({
      promise: Promise.resolve({ stdout: JSON.stringify({ entries: [] }), stderr: '', exitCode: 0 }),
      kill: vi.fn(),
    }));
    const fetchRunner = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          result: [
            {
              bvid: 'BVEMPTY',
              title: 'API Fallback Song',
              author: 'Bili Artist',
              duration: '03:54',
              pic: '//i1.hdslb.com/bfs/archive/fallback.jpg',
              arcurl: 'http://www.bilibili.com/video/av98648582',
              play: 12570563,
            },
          ],
        },
      }),
    })) as unknown as typeof fetch;
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      fetch: fetchRunner,
      getAccountCredentials: (provider) => ({ provider }),
      writeEmbeddedTrackTags: vi.fn(async () => undefined),
    });

    const response = await service.search({ query: '籽岷', limitPerProvider: 1, provider: 'bilibili' });

    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, expect.arrayContaining(['bilisearch1:籽岷']));
    expect(fetchRunner).toHaveBeenCalled();
    expect(response.errors).toEqual([]);
    expect(response.results).toEqual([
      expect.objectContaining({
        provider: 'bilibili',
        id: 'BVEMPTY',
        title: 'API Fallback Song',
        durationSeconds: 234,
        webpageUrl: 'http://www.bilibili.com/video/av98648582',
      }),
    ]);
  });

  it('keeps successful provider search results when another provider fails', async () => {
    const ytDlpPath = makeToolPath();
    const commandRunner = vi.fn((_command: string, args: string[]) => {
      const searchUrl = args.at(-1);
      if (typeof searchUrl === 'string' && searchUrl.startsWith('bilisearch')) {
        return {
          promise: Promise.resolve({ stdout: '', stderr: 'HTTP Error 412', exitCode: 1 }),
          kill: vi.fn(),
        };
      }

      return {
        promise: Promise.resolve({
          stdout: JSON.stringify({ entries: [{ id: 'yt-1', title: 'YouTube Song', url: 'https://www.youtube.com/watch?v=yt-1' }] }),
          stderr: '',
          exitCode: 0,
        }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      fetch: vi.fn(async () => ({ ok: false })) as unknown as typeof fetch,
      getAccountCredentials: (provider) => ({ provider }),
    });

    const response = await service.search('echo');

    expect(response.results).toHaveLength(1);
    expect(response.results[0].provider).toBe('youtube');
    expect(response.errors).toEqual([{ provider: 'bilibili', error: 'HTTP Error 412' }]);
  });

  it('rejects empty search queries', async () => {
    const service = new DownloadService();

    await expect(service.search('   ')).rejects.toThrow('search query must be a non-empty string');
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
    const completedJob = await waitForJob(service, job.id);
    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, ['--dump-json', '--no-playlist', 'https://www.youtube.com/watch?v=probe']);
    expect(streamingCommandRunner).toHaveBeenCalled();
    expect(completedJob.title).toBe('Probe Song');
    expect(completedJob.durationSeconds).toBe(245);
    expect(completedJob.thumbnailUrl).toBe('https://img.example/cover.jpg');
    expect(completedJob.status).toBe('completed');
    expect(completedJob.outputPath).toBe(outputPath);
  });

  it('passes direct streaming headers to yt-dlp and keeps the suggested source metadata', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const outputPath = join(outputDirectory, 'Streaming Song [direct].m4a');
    const commandRunner = vi.fn(() => ({
      promise: Promise.resolve({
        stdout: JSON.stringify({
          duration: 180,
          webpage_url: 'https://cdn.example/audio.m4a',
        }),
        stderr: '',
        exitCode: 0,
      }),
      kill: vi.fn(),
    }));
    const streamingCommandRunner = vi.fn((_command, _args, listeners) => {
      writeFileSync(outputPath, 'audio');
      listeners.onStdout?.(outputPath);
      return {
        promise: Promise.resolve({ stdout: outputPath, stderr: '', exitCode: 0 }),
        kill: vi.fn(),
      };
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, { streamingCommandRunner });
    service.setSettings({ outputDirectory, importToLibrary: false });

    const job = service.createUrlJob('https://cdn.example/audio.m4a?token=abc', {
      importToLibrary: false,
      title: 'Streaming Song - Artist',
      webpageUrl: 'https://music.163.com/#/song?id=123',
      requestHeaders: {
        Referer: 'https://music.163.com/',
        'User-Agent': 'ECHO Test',
      },
    });
    const completedJob = await waitForJob(service, job.id);
    expect(commandRunner).toHaveBeenCalledWith(ytDlpPath, [
      '--add-header',
      'Referer: https://music.163.com/',
      '--add-header',
      'User-Agent: ECHO Test',
      '--dump-json',
      '--no-playlist',
      'https://cdn.example/audio.m4a?token=abc',
    ]);
    expect(streamingCommandRunner).toHaveBeenCalledWith(
      ytDlpPath,
      expect.arrayContaining(['--add-header', 'Referer: https://music.163.com/', '--add-header', 'User-Agent: ECHO Test']),
      expect.any(Object),
    );
    expect(completedJob.title).toBe('Streaming Song - Artist');
    expect(completedJob.webpageUrl).toBe('https://music.163.com/#/song?id=123');
    expect(completedJob.status).toBe('completed');
  });

  it('downloads direct streaming audio without probing through yt-dlp', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const commandRunner = vi.fn(() => ({
      promise: Promise.resolve({ stdout: '', stderr: 'should not run', exitCode: 1 }),
      kill: vi.fn(),
    }));
    const fetchRunner = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          'content-length': '4',
          'content-type': 'audio/flac',
        },
      });
    });
    const service = new DownloadService(commandRunner, () => ytDlpPath, {
      fetch: fetchRunner,
      getAccountCredentials: (provider) => ({ provider }),
    });
    service.setSettings({ outputDirectory, importToLibrary: false });

    const job = service.createUrlJob('https://cdn.example/audio?token=abc', {
      importToLibrary: false,
      title: 'Streaming Song - Artist',
      webpageUrl: 'https://music.163.com/#/song?id=123',
      requestHeaders: {
        Referer: 'https://music.163.com/',
      },
      directAudio: true,
      directAudioMimeType: 'audio/flac',
      directAudioExtension: 'flac',
    });
    const completedJob = await waitForJob(service, job.id);
    expect(commandRunner).not.toHaveBeenCalled();
    expect(fetchRunner).toHaveBeenCalledWith(
      'https://cdn.example/audio?token=abc',
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'https://music.163.com',
          Referer: 'https://music.163.com/',
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
        }),
      }),
    );
    expect(completedJob.status).toBe('completed');
    expect(completedJob.outputPath).toContain('Streaming Song - Artist');
    expect(completedJob.outputPath).toMatch(/\.flac$/u);
    expect(completedJob.downloadedBytes).toBe(4);
    expect(existsSync(completedJob.outputPath!)).toBe(true);
  });

  it('adds provider auth headers to direct NetEase audio downloads in the main process', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const fetchRunner = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          'content-length': '4',
          'content-type': 'audio/mpeg',
        },
      });
    });
    const service = new DownloadService(
      vi.fn(() => ({
        promise: Promise.resolve({ stdout: '', stderr: 'should not run', exitCode: 1 }),
        kill: vi.fn(),
      })),
      () => ytDlpPath,
      {
        fetch: fetchRunner,
        getAccountCredentials: (provider) => (provider === 'netease' ? { provider, cookie: 'MUSIC_U=secret' } : { provider }),
        writeEmbeddedTrackTags: vi.fn(async () => undefined),
      },
    );
    service.setSettings({ outputDirectory, importToLibrary: false });

    const job = service.createUrlJob('https://m801.music.126.net/audio.mp3', {
      importToLibrary: false,
      title: 'Streaming Song - Artist',
      webpageUrl: 'https://music.163.com/#/song?id=123',
      directAudio: true,
      directAudioMimeType: 'audio/mpeg',
      directAudioExtension: 'mp3',
    });
    const completedJob = await waitForJob(service, job.id);

    expect(fetchRunner).toHaveBeenCalledWith(
      'https://m801.music.126.net/audio.mp3',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'MUSIC_U=secret',
          Origin: 'https://music.163.com',
          Referer: 'https://music.163.com/',
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
        }),
      }),
    );
    expect(completedJob.status).toBe('completed');
  });

  it('does not bind MV links for imported direct streaming audio', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const bindMvUrl = vi.fn(() => {
      throw new Error('Unsupported MV link. Paste a YouTube or Bilibili video URL.');
    });
    const importAudioFile = vi.fn(async () => ({ id: 'track-1' }));
    const writeEmbeddedTrackTags = vi.fn(async () => undefined);
    const coverBytes = new Uint8Array([137, 80, 78, 71]);
    const service = new DownloadService(
      vi.fn(() => ({
        promise: Promise.resolve({ stdout: '', stderr: 'should not run', exitCode: 1 }),
        kill: vi.fn(),
      })),
      () => ytDlpPath,
      {
        bindMvUrl,
        fetch: vi.fn(async (url: string | URL | Request) => {
          const rawUrl = String(url);
          return new Response(rawUrl.includes('cover.jpg') ? coverBytes : new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { 'content-type': rawUrl.includes('cover.jpg') ? 'image/png' : 'audio/mpeg' },
          });
        }) as unknown as typeof fetch,
        importAudioFile,
        getAccountCredentials: (provider) => ({ provider }),
        writeEmbeddedTrackTags,
      },
    );
    service.setSettings({ outputDirectory, importToLibrary: true, bindMvAfterImport: true });

    const job = service.createUrlJob('https://m801.music.126.net/audio.mp3', {
      title: 'Streaming Song',
      artist: 'Artist',
      album: 'Streaming Album',
      albumArtist: 'Artist',
      coverUrl: 'echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F',
      webpageUrl: 'https://music.163.com/#/song?id=123',
      bindMvAfterImport: false,
      directAudio: true,
      directAudioMimeType: 'audio/mpeg',
      directAudioExtension: 'mp3',
    });
    const completedJob = await waitForJob(service, job.id);

    expect(completedJob.status).toBe('completed');
    expect(completedJob.importedTrackId).toBe('track-1');
    expect(completedJob.outputPath).toContain('Artist - Streaming Song');
    expect(service.getJobs()[0].thumbnailUrl).toBe('echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F');
    expect(service.getJobs()[0].title).toBe('Streaming Song');
    expect(service.getJobs()[0].outputPath).not.toContain(completedJob.id);
    expect(writeEmbeddedTrackTags).toHaveBeenCalledWith({
      filePath: completedJob.outputPath,
      coverData: { data: coverBytes, mimeType: 'image/png' },
      tags: {
        title: 'Streaming Song',
        artist: 'Artist',
        album: 'Streaming Album',
        albumArtist: 'Artist',
        trackNo: null,
        discNo: null,
        year: null,
        genre: null,
      },
    });
    expect(importAudioFile).toHaveBeenCalledWith(
      completedJob.outputPath,
      expect.objectContaining({
        folderPath: outputDirectory,
        metadata: {
          title: 'Streaming Song',
          artist: 'Artist',
          album: 'Streaming Album',
          albumArtist: 'Artist',
        },
        coverUrl: 'echo-image://remote/https%3A%2F%2Fp.music.126.net%2Fcover.jpg?referer=https%3A%2F%2Fmusic.163.com%2F',
      }),
    );
    expect(bindMvUrl).not.toHaveBeenCalled();
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
    const addLibraryFolder = vi.fn();
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
        addLibraryFolder,
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
    expect(addLibraryFolder).toHaveBeenCalledWith(outputDirectory);
    expect(importAudioFile).toHaveBeenCalledWith(outputPath, { folderPath: outputDirectory });
    expect(bindMvUrl).toHaveBeenCalledWith('track-1', 'https://www.bilibili.com/video/BV1ECHO');
  });

  it('defers library import while audio playback is active', async () => {
    const ytDlpPath = makeToolPath();
    const outputDirectory = makeTempRoot();
    const outputPath = join(outputDirectory, 'Deferred Song [deferred].m4a');
    let playbackState = 'playing';
    const importAudioFile = vi.fn(async () => ({ id: 'track-deferred' }));
    const bindMvUrl = vi.fn();
    const service = new DownloadService(
      () => ({
        promise: Promise.resolve({
          stdout: JSON.stringify({
            title: 'Deferred Song',
            webpage_url: 'https://www.youtube.com/watch?v=deferred',
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
        getPlaybackState: () => playbackState,
        postDownloadImportRetryMs: 5,
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

    const job = service.createUrlJob('https://www.youtube.com/watch?v=deferred');
    const completedJob = await waitForJob(service, job.id);

    expect(completedJob.status).toBe('completed');
    expect(completedJob.importedTrackId).toBeNull();
    expect(importAudioFile).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(importAudioFile).not.toHaveBeenCalled();

    playbackState = 'paused';
    await waitForCondition(() => service.getJobs()[0]?.importedTrackId === 'track-deferred');

    expect(service.getJobs()[0]).toMatchObject({
      status: 'completed',
      importedTrackId: 'track-deferred',
    });
    expect(bindMvUrl).toHaveBeenCalledWith('track-deferred', 'https://www.youtube.com/watch?v=deferred');
  });
});
