import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { EchoDatabase } from '../database/createDatabase';
import { CoverService } from './CoverService';
import type { ParsedTrackMetadata } from './libraryTypes';

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-cover-service-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const makeCover = (): Promise<Buffer> =>
  sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: '#d45588',
    },
  }).jpeg().toBuffer();

const metadataWithCover = async (): Promise<ParsedTrackMetadata> => ({
  title: 'Remote Song',
  artist: 'Remote Artist',
  album: 'Remote Album',
  albumArtist: 'Remote Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 120,
  codec: 'mp3',
  sampleRate: 44100,
  bitDepth: null,
  bitrate: 320000,
  fieldSources: { cover: 'network' },
  embeddedCover: {
    data: await makeCover(),
    mimeType: 'image/jpeg',
  },
  warnings: [],
  errors: [],
  metadataStatus: 'ok',
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('CoverService', () => {
  it('generates remote cover cache variants through the worker path', async () => {
    const root = makeTempRoot();
    const coversByHash = new Map<string, { id: string; source_type: string }>();
    const coversById = new Map<string, { thumb_path: string; album_path: string; large_path: string; source_type: string }>();
    const database = {
      prepare: (sql: string) => {
        if (sql.includes('SELECT id, source_type FROM covers WHERE source_hash = ?')) {
          return {
            get: (sourceHash: string) => coversByHash.get(sourceHash),
          };
        }
        if (sql.includes('INSERT INTO covers')) {
          return {
            run: (
              id: string,
              sourceType: string,
              sourceHash: string,
              _mimeType: string,
              thumbPath: string,
              albumPath: string,
              largePath: string,
            ) => {
              coversByHash.set(sourceHash, { id, source_type: sourceType });
              coversById.set(id, { thumb_path: thumbPath, album_path: albumPath, large_path: largePath, source_type: sourceType });
            },
          };
        }
        if (sql.includes('UPDATE covers SET')) {
          return { run: () => undefined };
        }
        if (sql.includes('SELECT thumb_path, album_path, large_path, source_type FROM covers WHERE id = ?')) {
          return {
            get: (id: string) => coversById.get(id),
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    } as unknown as EchoDatabase;
    const service = new CoverService(database, join(root, 'covers'));

    const coverId = await service.ensureCover('remote://source-1/subsonic:song:1', await metadataWithCover());

    expect(coverId).toEqual(expect.any(String));
    const row = database
      .prepare<[string], { thumb_path: string; album_path: string; large_path: string; source_type: string }>(
        'SELECT thumb_path, album_path, large_path, source_type FROM covers WHERE id = ?',
      )
      .get(coverId ?? '');
    expect(row?.source_type).toBe('embedded');
    expect(existsSync(row?.thumb_path ?? '')).toBe(true);
    expect(existsSync(row?.album_path ?? '')).toBe(true);
    expect(existsSync(row?.large_path ?? '')).toBe(true);
  });
});
