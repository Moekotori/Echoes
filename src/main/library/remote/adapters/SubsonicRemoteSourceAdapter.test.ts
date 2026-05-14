import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteStreamProxyService } from '../RemoteStreamProxyService';
import type { RemoteSourceSecret } from '../remoteTypes';
import { SubsonicRemoteSourceAdapter } from './SubsonicRemoteSourceAdapter';

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

const md5 = (value: string): string => createHash('md5').update(value).digest('hex');

const envelope = (body: Record<string, unknown>): string => JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } });

const source = (port: number): RemoteSourceSecret => ({
  id: 'source-subsonic',
  provider: 'subsonic',
  displayName: 'Navidrome',
  status: 'enabled',
  baseUrl: `http://127.0.0.1:${port}`,
  username: 'user',
  authType: 'basic',
  config: { apiVersion: '1.16.1', authMode: 'token' },
  syncMode: 'index',
  lastTestAt: null,
  lastSyncAt: null,
  lastError: null,
  indexedTrackCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  secret: 'password',
});

describe('SubsonicRemoteSourceAdapter', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await close(server);
    }
  });

  it('pings, scans album songs, and proxies streams without leaking credentials', async () => {
    const audio = Buffer.from('subsonic-audio');
    const assertAuth = (url: URL): void => {
      expect(url.searchParams.get('u')).toBe('user');
      const salt = url.searchParams.get('s') ?? '';
      expect(url.searchParams.get('t')).toBe(md5(`password${salt}`));
      expect(url.searchParams.get('p')).toBeNull();
    };
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      assertAuth(url);
      if (url.pathname === '/rest/ping.view') {
        response.setHeader('Content-Type', 'application/json');
        response.end(envelope({}));
        return;
      }
      if (url.pathname === '/rest/getAlbumList2.view') {
        response.setHeader('Content-Type', 'application/json');
        response.end(envelope({ albumList2: { album: [{ id: 'album-1', name: 'Echo Album' }] } }));
        return;
      }
      if (url.pathname === '/rest/getAlbum.view') {
        response.setHeader('Content-Type', 'application/json');
        response.end(envelope({
          album: {
            id: 'album-1',
            song: [{
              id: 'song-1',
              title: 'Echo Song',
              artist: 'Echo Artist',
              album: 'Echo Album',
              albumArtist: 'Echo Artist',
              duration: 188,
              suffix: 'flac',
              bitRate: 900,
              size: 12345,
              coverArt: 'cover-1',
            }],
          },
        }));
        return;
      }
      if (url.pathname === '/rest/stream.view') {
        expect(url.searchParams.get('id')).toBe('song-1');
        response.writeHead(200, {
          'Content-Type': 'audio/flac',
          'Content-Length': String(audio.length),
        });
        response.end(audio);
        return;
      }
      response.writeHead(404);
      response.end();
    });
    servers.push(server);
    const port = await listen(server);
    const adapter = new SubsonicRemoteSourceAdapter();
    const proxy = new RemoteStreamProxyService(() => adapter);
    adapter.setStreamUrlResolver((input) => proxy.createStreamUrl(input.source, input.remotePath, input.stableKey, input.expiresInSeconds));

    const result = await adapter.testConnection({ source: source(port) });
    expect(result.ok).toBe(true);

    const scanned = [];
    for await (const item of adapter.scan({ source: source(port) })) {
      scanned.push(item);
    }
    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toEqual(expect.objectContaining({
      path: 'subsonic:song:song-1',
      stableKey: 'song-1',
      metadata: expect.objectContaining({ title: 'Echo Song', artist: 'Echo Artist', duration: 188 }),
    }));

    const stream = await adapter.createStreamUrl({ source: source(port), remotePath: 'subsonic:song:song-1', stableKey: 'song-1' });
    expect(stream.url).not.toContain('password');
    const proxied = await fetch(stream.url);
    expect(proxied.status).toBe(200);
    expect(Buffer.from(await proxied.arrayBuffer()).equals(audio)).toBe(true);
    await proxy.close();
  });
});
