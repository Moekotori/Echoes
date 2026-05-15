import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type EchoDatabase } from '../../database/createDatabase';
import { RemoteSourceService } from './RemoteSourceService';
import { remoteTrackIdFor } from './remoteIdentity';

const serviceMocks = vi.hoisted(() => ({
  getLyricsForTrack: vi.fn(),
  searchNetworkCandidates: vi.fn(),
}));

vi.mock('electron', () => ({
  default: {},
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}));

vi.mock('../../lyrics/LyricsService', () => ({
  getLyricsService: () => ({
    getLyricsForTrack: serviceMocks.getLyricsForTrack,
  }),
}));

vi.mock('../../mv/MvService', () => ({
  getMvService: () => ({
    searchNetworkCandidates: serviceMocks.searchNetworkCandidates,
  }),
}));

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

const waitForSync = async (service: RemoteSourceService, sourceId: string): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    const status = service.getSyncStatus(sourceId);
    if (status.status === 'completed') {
      return;
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(`sync ${status.status}: ${status.errors.join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for Subsonic sync');
};

const waitForJobs = async (service: RemoteSourceService, sourceId: string): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    const status = service.getJobStatus(sourceId);
    if (status.completed.lyrics === 1 && status.completed.mv === 1) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for Subsonic background jobs');
};

describe('RemoteSourceService Subsonic integration', () => {
  const servers: Server[] = [];
  let database: EchoDatabase | null = null;
  let service: RemoteSourceService | null = null;

  afterEach(async () => {
    service?.close();
    service = null;
    database = null;
    serviceMocks.getLyricsForTrack.mockReset();
    serviceMocks.searchNetworkCandidates.mockReset();
    for (const server of servers.splice(0)) {
      await close(server);
    }
  });

  it('starts enrichment jobs for Subsonic tracks whose metadata is already complete during sync', async () => {
    serviceMocks.getLyricsForTrack.mockResolvedValue({ id: 'lyrics-1' });
    serviceMocks.searchNetworkCandidates.mockResolvedValue([{ id: 'mv-1' }]);
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const salt = url.searchParams.get('s') ?? '';
      expect(url.searchParams.get('u')).toBe('user');
      expect(url.searchParams.get('t')).toBe(md5(`password${salt}`));
      expect(url.searchParams.get('p')).toBeNull();

      response.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/rest/ping.view') {
        response.end(envelope({}));
        return;
      }
      if (url.pathname === '/rest/getAlbumList2.view') {
        response.end(envelope({ albumList2: { album: [{ id: 'album-1', name: 'Echo Album' }] } }));
        return;
      }
      if (url.pathname === '/rest/getAlbum.view') {
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
              coverArt: 'cover-1',
            }],
          },
        }));
        return;
      }

      response.writeHead(404);
      response.end();
    });
    servers.push(server);
    const port = await listen(server);
    database = createDatabase(':memory:');
    service = new RemoteSourceService(database, () => database?.close());

    const source = service.createSource({
      provider: 'subsonic',
      displayName: 'Navidrome',
      baseUrl: `http://127.0.0.1:${port}`,
      username: 'user',
      secret: 'password',
      authType: 'basic',
      config: { apiVersion: '1.16.1', authMode: 'token' },
      syncMode: 'index',
    });

    service.syncSource(source.id);
    await waitForSync(service, source.id);
    await waitForJobs(service, source.id);

    const trackId = remoteTrackIdFor(source.id, 'song-1');
    const track = service.getTrackAsLibraryTrack(trackId);
    expect(track).toEqual(expect.objectContaining({
      title: 'Echo Song',
      artist: 'Echo Artist',
      album: 'Echo Album',
      albumArtist: 'Echo Artist',
      metadataStatus: 'ok',
    }));
    expect(serviceMocks.getLyricsForTrack).toHaveBeenCalledWith(trackId);
    expect(serviceMocks.searchNetworkCandidates).toHaveBeenCalledWith(trackId);
  });
});
