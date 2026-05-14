import { existsSync, readFileSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { protocol } from 'electron';
import type { CoverVariant } from '../library/libraryTypes';
import { getAppSettings, getAppWallpaperDirectory, getLyricsWallpaperDirectory } from '../app/appSettings';
import { getLibraryService } from '../library/LibraryService';
import { defaultCoverSvg } from '../library/workers/TsCoverExtractor';

const cacheControlHeader = 'public, max-age=31536000, immutable';
const wallpaperCacheControlHeader = 'no-store';
const remoteImageCacheControlHeader = 'public, max-age=86400';
const allowedRemoteImageHosts = new Set([
  'i0.hdslb.com',
  'i1.hdslb.com',
  'i2.hdslb.com',
  'archive.biliimg.com',
  'p.music.126.net',
  'p1.music.126.net',
  'p2.music.126.net',
  'p3.music.126.net',
  'p4.music.126.net',
  'y.gtimg.cn',
  'qpic.y.qq.com',
]);

const isCoverVariant = (value: string): value is CoverVariant =>
  value === 'thumb' || value === 'album' || value === 'large' || value === 'original';

const contentTypeForPath = (filePath: string, fallback: string | null): string => {
  switch (extname(filePath).toLocaleLowerCase()) {
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    default:
      return fallback ?? 'application/octet-stream';
  }
};

const isPathInsideDirectory = (directory: string, filePath: string): boolean => {
  const relativePath = relative(resolve(directory), resolve(filePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
};

const defaultSvgResponse = (): Response =>
  new Response(defaultCoverSvg, {
    headers: {
      'Content-Type': 'image/svg+xml',
    },
  });

const missingCoverResponse = (): Response => new Response('', { status: 404 });

const passthroughImageHeaders = (response: Response): Headers => {
  const headers = new Headers({
    'Cache-Control': remoteImageCacheControlHeader,
  });
  const contentType = response.headers.get('content-type');
  if (contentType?.startsWith('image/')) {
    headers.set('Content-Type', contentType);
  }

  return headers;
};

export const registerCoverProtocolScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'echo-cover',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
    {
      scheme: 'echo-video',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
    {
      scheme: 'echo-mv',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
    {
      scheme: 'echo-wallpaper',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
    {
      scheme: 'echo-image',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
};

export const registerCoverProtocolHandler = (): void => {
  protocol.handle('echo-cover', async (request) => {
    try {
      const url = new URL(request.url);
      const variant = url.hostname;
      const coverId = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

      if (!isCoverVariant(variant) || !coverId) {
        return defaultSvgResponse();
      }

      const asset = getLibraryService().resolveCoverAsset(coverId, variant);

      if (!asset || !existsSync(asset.filePath)) {
        return variant === 'large' || variant === 'original' ? missingCoverResponse() : defaultSvgResponse();
      }

      return new Response(readFileSync(asset.filePath), {
        headers: {
          'Content-Type': contentTypeForPath(asset.filePath, asset.mimeType),
          'Cache-Control': cacheControlHeader,
        },
      });
    } catch {
      return defaultSvgResponse();
    }
  });
  protocol.handle('echo-wallpaper', async (request) => {
    try {
      const url = new URL(request.url);

      if (url.pathname.replace(/^\/+/, '') !== 'custom') {
        return missingCoverResponse();
      }

      const settings = getAppSettings();
      const wallpaperPath = url.hostname === 'lyrics'
        ? settings.lyricsCustomWallpaperPath
        : url.hostname === 'app'
          ? settings.appCustomWallpaperPath
          : null;
      const wallpaperDirectory = url.hostname === 'lyrics'
        ? getLyricsWallpaperDirectory()
        : url.hostname === 'app'
          ? getAppWallpaperDirectory()
          : null;

      if (!wallpaperPath || !wallpaperDirectory || !isPathInsideDirectory(wallpaperDirectory, wallpaperPath) || !existsSync(wallpaperPath)) {
        return missingCoverResponse();
      }

      return new Response(readFileSync(wallpaperPath), {
        headers: {
          'Content-Type': contentTypeForPath(wallpaperPath, null),
          'Cache-Control': wallpaperCacheControlHeader,
        },
      });
    } catch {
      return missingCoverResponse();
    }
  });
  protocol.handle('echo-image', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'remote') {
        return missingCoverResponse();
      }

      const targetUrl = new URL(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
      if (targetUrl.protocol !== 'https:' || !allowedRemoteImageHosts.has(targetUrl.hostname)) {
        return missingCoverResponse();
      }

      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          referer: url.searchParams.get('referer') ?? 'https://www.bilibili.com/',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });
      if (!upstream.ok) {
        return missingCoverResponse();
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: passthroughImageHeaders(upstream),
      });
    } catch {
      return missingCoverResponse();
    }
  });
};
