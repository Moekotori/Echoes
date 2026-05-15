import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebDavRemoteSourceAdapter } from './WebDavRemoteSourceAdapter';
import type { RemoteSourceSecret } from '../remoteTypes';

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not bind'));
        return;
      }
      resolve(address.port);
    });
  });

const close = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const xml = (responses: string[]): string => `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${responses.join('')}</d:multistatus>`;

const item = (href: string, collection = false, size = 123): string => `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        ${collection ? '<d:resourcetype><d:collection /></d:resourcetype>' : '<d:resourcetype />'}
        <d:getcontentlength>${size}</d:getcontentlength>
        <d:getlastmodified>Thu, 01 Jan 2026 00:00:00 GMT</d:getlastmodified>
        <d:getetag>"etag-${size}"</d:getetag>
      </d:prop>
    </d:propstat>
  </d:response>`;

const makeSource = (port: number, config: Record<string, unknown> = {}, overrides: Partial<RemoteSourceSecret> = {}): RemoteSourceSecret => ({
  id: 'source-1',
  provider: 'webdav',
  displayName: 'WebDAV',
  status: 'enabled',
  baseUrl: `http://127.0.0.1:${port}/dav`,
  username: null,
  authType: 'none',
  config,
  syncMode: 'index',
  lastTestAt: null,
  lastSyncAt: null,
  lastError: null,
  indexedTrackCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  secret: null,
  ...overrides,
});

describe('WebDavRemoteSourceAdapter', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await close(server);
    }
  });

  it('parses PROPFIND entries and identifies supported audio files', async () => {
    const server = createServer((request, response) => {
      expect(request.method).toBe('PROPFIND');
      response.writeHead(207, { 'Content-Type': 'application/xml' });
      response.end(xml([item('/dav/', true), item('/dav/Album/', true), item('/dav/Album/song.flac'), item('/dav/Album/odd.tak'), item('/dav/notes.txt')]));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const items = await adapter.browse({ source: makeSource(port), path: '/' });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/Album/', kind: 'directory', audio: false }),
        expect.objectContaining({ path: '/Album/song.flac', kind: 'file', audio: true }),
        expect.objectContaining({ path: '/Album/odd.tak', kind: 'file', audio: true }),
        expect.objectContaining({ path: '/notes.txt', kind: 'file', audio: false }),
      ]),
    );
  });

  it('uses configured root paths and encodes spaces and non-ASCII path segments', async () => {
    const requested: string[] = [];
    const server = createServer((request, response) => {
      requested.push(request.url ?? '');
      response.writeHead(207, { 'Content-Type': 'application/xml' });
      response.end(xml([item('/dav/%E9%9F%B3%E4%B9%90%20Space/', true), item('/dav/%E9%9F%B3%E4%B9%90%20Space/Echo%20Song.flac')]));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const source = makeSource(port, { rootPath: '/音乐 Space' });
    const test = await adapter.testConnection({ source });
    const items = await adapter.browse({ source });

    expect(test.ok).toBe(true);
    expect(requested[0]).toBe('/dav/%E9%9F%B3%E4%B9%90%20Space');
    expect(requested[1]).toBe('/dav/%E9%9F%B3%E4%B9%90%20Space');
    expect(items).toEqual([
      expect.objectContaining({ path: '/音乐 Space/Echo Song.flac', kind: 'file', audio: true }),
    ]);
  });

  it('sends expected auth headers for Basic and token WebDAV sources', async () => {
    const seenAuth: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      seenAuth.push(request.headers.authorization);
      response.writeHead(207, { 'Content-Type': 'application/xml' });
      response.end(xml([item('/dav/', true)]));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    await adapter.testConnection({
      source: makeSource(port, {}, { authType: 'basic', username: 'alice', secret: 'wonderland' }),
    });
    await adapter.testConnection({
      source: makeSource(port, {}, { authType: 'token', secret: 'token-secret' }),
    });
    await adapter.testConnection({
      source: makeSource(port, {}, { authType: 'none', username: null, secret: null }),
    });

    expect(seenAuth).toEqual([
      `Basic ${Buffer.from('alice:wonderland', 'utf8').toString('base64')}`,
      'Bearer token-secret',
      undefined,
    ]);
  });

  it('supports Basic WebDAV accounts with an empty password', async () => {
    const seenAuth: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      seenAuth.push(request.headers.authorization);
      response.writeHead(207, { 'Content-Type': 'application/xml' });
      response.end(xml([item('/dav/', true)]));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const result = await adapter.testConnection({
      source: makeSource(port, {}, { authType: 'basic', username: 'empty-pass-user', secret: null }),
    });

    expect(result.ok).toBe(true);
    expect(seenAuth).toEqual([
      `Basic ${Buffer.from('empty-pass-user:', 'utf8').toString('base64')}`,
    ]);
  });

  it('retries 429/503 responses and reports missing roots with a friendly error', async () => {
    let retryAttempts = 0;
    const server = createServer((request, response) => {
      if (request.url?.includes('/missing')) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('missing');
        return;
      }

      retryAttempts += 1;
      response.writeHead(retryAttempts < 3 ? (retryAttempts === 1 ? 429 : 503) : 207, { 'Content-Type': 'application/xml' });
      response.end(retryAttempts < 3 ? 'busy' : xml([item('/dav/', true)]));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const retryResult = await adapter.testConnection({ source: makeSource(port) });
    const missingResult = await adapter.testConnection({ source: makeSource(port, { rootPath: '/missing' }) });

    expect(retryResult.ok).toBe(true);
    expect(retryAttempts).toBe(3);
    expect(missingResult).toEqual(expect.objectContaining({
      ok: false,
      status: 'error',
      message: expect.stringContaining('路径不存在'),
    }));
  });

  it('scans directories concurrently and continues when one directory fails', async () => {
    let active = 0;
    let maxActive = 0;
    const errors: string[] = [];
    const server = createServer(async (request, response) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const requestPath = request.url?.replace(/\/$/u, '') || '';
      await new Promise((resolve) => setTimeout(resolve, requestPath === '/dav' ? 0 : 20));
      try {
        response.writeHead(requestPath === '/dav/fail' ? 503 : 207, { 'Content-Type': 'application/xml' });
        if (requestPath === '/dav') {
          response.end(xml([item('/dav/', true), item('/dav/a/', true), item('/dav/b/', true), item('/dav/fail/', true)]));
        } else if (requestPath === '/dav/a') {
          response.end(xml([item('/dav/a/', true), item('/dav/a/one.mp3')]));
        } else if (requestPath === '/dav/b') {
          response.end(xml([item('/dav/b/', true), item('/dav/b/two.flac')]));
        } else {
          response.end('busy');
        }
      } finally {
        active -= 1;
      }
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const scanned = [];
    for await (const track of adapter.scan({
      source: makeSource(port, { scanConcurrency: 3 }),
      onError: (path, error) => errors.push(`${path}: ${error.message}`),
    })) {
      scanned.push(track.path);
    }

    expect(scanned.sort()).toEqual(['/a/one.mp3', '/b/two.flac']);
    expect(errors[0]).toContain('/fail/');
    expect(maxActive).toBeGreaterThan(1);
  });

  it('uses filename fallback when a backend ignores Range for large files', async () => {
    const server = createServer((request, response) => {
      if (request.method === 'PROPFIND') {
        response.writeHead(207, { 'Content-Type': 'application/xml' });
        response.end(xml([item('/dav/song.mp3')]));
        return;
      }

      expect(request.headers.range).toBe('bytes=0-262143');
      response.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(10 * 1024 * 1024),
      });
      response.end('range ignored');
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    const metadata = await adapter.readMetadata({
      source: makeSource(port),
      item: {
        sourceId: 'source-1',
        provider: 'webdav',
        path: '/song.mp3',
        name: 'song.mp3',
        kind: 'file',
        sizeBytes: 10 * 1024 * 1024,
        modifiedAt: null,
        etag: null,
        contentType: 'audio/mpeg',
        audio: true,
        remoteUrlHash: 'hash',
        stableKey: 'stable',
      },
    });

    expect(metadata.status).toBe('partial');
    expect(metadata.title).toBe('song');
    expect(metadata.warnings).toContain('metadata_fallback');
  });

  it('uses a larger range when reading embedded WebDAV covers', async () => {
    const seenRanges: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      seenRanges.push(request.headers.range);
      response.writeHead(206, {
        'Content-Type': 'audio/flac',
        'Content-Length': '16',
      });
      response.end(Buffer.alloc(16));
    });
    servers.push(server);
    const port = await listen(server);

    const adapter = new WebDavRemoteSourceAdapter();
    await adapter.readCover({
      source: makeSource(port),
      item: {
        sourceId: 'source-1',
        provider: 'webdav',
        path: '/Album/large-cover.flac',
        name: 'large-cover.flac',
        kind: 'file',
        sizeBytes: 8 * 1024 * 1024,
        modifiedAt: null,
        etag: null,
        contentType: 'audio/flac',
        audio: true,
        remoteUrlHash: 'hash',
        stableKey: 'stable',
      },
    });

    expect(seenRanges[0]).toBe('bytes=0-2097151');
  });
});
