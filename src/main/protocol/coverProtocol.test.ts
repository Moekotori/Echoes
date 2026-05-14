import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();
const getAppSettingsMock = vi.fn();
let wallpaperDirectory = '';
const tempRoots: string[] = [];

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: handleMock,
  },
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: getAppSettingsMock,
  getAppWallpaperDirectory: () => wallpaperDirectory,
  getLyricsWallpaperDirectory: () => wallpaperDirectory,
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: () => ({
    resolveCoverAsset: vi.fn(),
  }),
}));

vi.mock('../library/workers/TsCoverExtractor', () => ({
  defaultCoverSvg: '<svg />',
}));

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-wallpaper-protocol-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const getWallpaperHandler = (): ((request: Request) => Promise<Response>) => {
  const call = handleMock.mock.calls.find(([scheme]) => scheme === 'echo-wallpaper');
  return call?.[1] as (request: Request) => Promise<Response>;
};

const getImageHandler = (): ((request: Request) => Promise<Response>) => {
  const call = handleMock.mock.calls.find(([scheme]) => scheme === 'echo-image');
  return call?.[1] as (request: Request) => Promise<Response>;
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('echo-wallpaper protocol', () => {
  beforeEach(async () => {
    vi.resetModules();
    handleMock.mockClear();
    getAppSettingsMock.mockReset();
    wallpaperDirectory = makeTempRoot();
    const module = await import('./coverProtocol');
    module.registerCoverProtocolHandler();
  });

  it('serves the configured lyrics wallpaper from the app wallpaper directory', async () => {
    const wallpaperPath = join(wallpaperDirectory, 'custom.png');
    writeFileSync(wallpaperPath, 'wallpaper');
    getAppSettingsMock.mockReturnValue({ lyricsCustomWallpaperPath: wallpaperPath });

    const response = await getWallpaperHandler()(new Request('echo-wallpaper://lyrics/custom'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('wallpaper');
  });

  it('serves the configured app wallpaper from the app wallpaper directory', async () => {
    const wallpaperPath = join(wallpaperDirectory, 'app-wallpaper.webp');
    writeFileSync(wallpaperPath, 'app-wallpaper');
    getAppSettingsMock.mockReturnValue({ appCustomWallpaperPath: wallpaperPath });

    const response = await getWallpaperHandler()(new Request('echo-wallpaper://app/custom'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(await response.text()).toBe('app-wallpaper');
  });

  it('does not serve wallpaper paths outside the app wallpaper directory', async () => {
    const outsideRoot = makeTempRoot();
    const wallpaperPath = join(outsideRoot, 'outside.png');
    writeFileSync(wallpaperPath, 'outside');
    getAppSettingsMock.mockReturnValue({ lyricsCustomWallpaperPath: wallpaperPath });

    const response = await getWallpaperHandler()(new Request('echo-wallpaper://lyrics/custom'));

    expect(response.status).toBe(404);
  });

  it('proxies allowed Bilibili images with a referer header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      }),
    );
    const imageUrl = 'https://i0.hdslb.com/bfs/archive/cover.jpg';

    const response = await getImageHandler()(new Request(`echo-image://remote/${encodeURIComponent(imageUrl)}?referer=${encodeURIComponent('https://www.bilibili.com/')}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await response.text()).toBe('image');
    expect(fetchMock).toHaveBeenCalledWith(
      imageUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          referer: 'https://www.bilibili.com/',
        }),
        redirect: 'follow',
      }),
    );
  });
});
