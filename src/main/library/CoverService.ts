import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { EchoDatabase } from '../database/createDatabase';
import { COVER_CACHE_VERSION } from './libraryTypes';
import type { CoverResult, CoverSource, ParsedTrackMetadata } from './libraryTypes';
import { TsCoverExtractor } from './workers/TsCoverExtractor';

const coverSourceRank: Record<CoverSource, number> = {
  default: 0,
  network: 1,
  folder: 2,
  embedded: 3,
  manual: 4,
};

const coverSourceOrNull = (value: unknown): CoverSource | null =>
  value === 'manual' || value === 'embedded' || value === 'folder' || value === 'network' || value === 'default' ? value : null;

const preferredCoverSource = (current: unknown, next: CoverSource): CoverSource => {
  const currentSource = coverSourceOrNull(current);
  return currentSource && coverSourceRank[currentSource] > coverSourceRank[next] ? currentSource : next;
};

const remoteCoverWorkerSource = String.raw`
const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const sharp = require('sharp');

const hashBytes = (data) => createHash('sha256').update(data).digest('hex');
const extensionForMimeType = (mimeType) => {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '.bin';
  }
};

const readMeta = async (filePath) => {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const writeIfMissing = async (filePath, data) => {
  if (!existsSync(filePath)) {
    await writeFile(filePath, data);
  }
};

(async () => {
  const data = Buffer.from(workerData.data);
  const sourceHash = hashBytes(data);
  const coverDirectory = join(workerData.cacheRoot, sourceHash.slice(0, 2), sourceHash);
  const thumbPath = join(coverDirectory, 'thumb.webp');
  const albumPath = join(coverDirectory, 'album.webp');
  const largePath = join(coverDirectory, 'large.webp');
  const originalRef = join(coverDirectory, 'original' + extensionForMimeType(workerData.mimeType));
  const metaPath = join(coverDirectory, 'meta.json');

  sharp.concurrency(Math.max(1, Math.min(2, workerData.sharpConcurrency || 1)));
  await mkdir(coverDirectory, { recursive: true });
  await writeIfMissing(originalRef, data);

  const meta = await readMeta(metaPath);
  const current = Boolean(meta && meta.version === workerData.cacheVersion && meta.sourceHash === sourceHash);
  const missingThumb = !current || !existsSync(thumbPath);
  const missingAlbum = !current || !existsSync(albumPath);
  const missingLarge = !current || !existsSync(largePath);

  if (missingThumb) {
    await sharp(data).rotate().resize(96, 96, { fit: 'cover', position: 'centre' }).webp({ quality: 75, effort: 4 }).toFile(thumbPath);
  }
  if (missingAlbum) {
    await sharp(data).rotate().resize(320, 320, { fit: 'cover', position: 'centre' }).webp({ quality: 82, effort: 4 }).toFile(albumPath);
  }
  if (missingLarge) {
    await sharp(data).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toFile(largePath);
  }

  if (!current || !existsSync(metaPath)) {
    await writeFile(metaPath, JSON.stringify({
      version: workerData.cacheVersion,
      sourceHash,
      source: 'embedded',
      mimeType: workerData.mimeType,
    }, null, 2) + '\n');
  }

  parentPort.postMessage({
    ok: true,
    result: {
      source: 'embedded',
      thumbPath,
      albumPath,
      largePath,
      originalRef,
      sourceHash,
      mimeType: workerData.mimeType,
      warnings: workerData.warnings || [],
      errors: workerData.errors || [],
    },
  });
})().catch((error) => {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  });
});
`;

export class CoverService {
  private readonly extractor = new TsCoverExtractor();

  constructor(
    private readonly database: EchoDatabase,
    private readonly cacheRoot: string,
  ) {}

  async ensureCover(filePath: string, metadata: ParsedTrackMetadata, now = new Date().toISOString()): Promise<string | null> {
    const result =
      filePath.startsWith('remote://') && metadata.embeddedCover
        ? await this.extractRemoteCover(metadata)
        : await this.extractor.extract(filePath, {
            cacheRoot: this.cacheRoot,
            metadata,
            now,
          });

    return this.upsertCover(result, now);
  }

  private extractRemoteCover(metadata: ParsedTrackMetadata): Promise<CoverResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(remoteCoverWorkerSource, {
        eval: true,
        workerData: {
          cacheRoot: this.cacheRoot,
          cacheVersion: COVER_CACHE_VERSION,
          data: metadata.embeddedCover?.data,
          mimeType: metadata.embeddedCover?.mimeType ?? null,
          warnings: metadata.warnings,
          errors: metadata.errors,
          sharpConcurrency: 1,
        },
      });

      worker.once('message', (message: { ok: boolean; result?: CoverResult; message?: string }) => {
        if (message.ok && message.result) {
          resolve(message.result);
        } else {
          reject(new Error(message.message ?? 'Remote cover worker failed'));
        }
      });
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Remote cover worker exited with code ${code}`));
        }
      });
    });
  }

  private upsertCover(result: CoverResult, now: string): string | null {
    const existing = this.database.prepare<unknown[], { id: string; source_type: string }>('SELECT id, source_type FROM covers WHERE source_hash = ?').get(result.sourceHash);
    const source = preferredCoverSource(existing?.source_type, result.source);

    if (existing?.id) {
      this.database
        .prepare(
          `UPDATE covers SET
            source_type = ?,
            mime_type = ?,
            thumb_path = ?,
            album_path = ?,
            large_path = ?,
            original_ref = ?,
            cache_version = ?,
            warnings_json = ?,
            errors_json = ?,
            cover_thumb = ?,
            cover_large = ?,
            cover_original = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          source,
          result.mimeType,
          result.thumbPath,
          result.albumPath,
          result.largePath,
          result.originalRef,
          COVER_CACHE_VERSION,
          JSON.stringify(result.warnings),
          JSON.stringify(result.errors),
          result.thumbPath,
          result.largePath,
          result.originalRef,
          now,
          existing.id,
        );
      return existing.id;
    }

    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO covers (
          id, source_type, source_hash, mime_type,
          thumb_path, album_path, large_path, original_ref,
          cache_version, warnings_json, errors_json,
          cover_thumb, cover_large, cover_original,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        source,
        result.sourceHash,
        result.mimeType,
        result.thumbPath,
        result.albumPath,
        result.largePath,
        result.originalRef,
        COVER_CACHE_VERSION,
        JSON.stringify(result.warnings),
        JSON.stringify(result.errors),
        result.thumbPath,
        result.largePath,
        result.originalRef,
        now,
        now,
      );

    return id;
  }
}
