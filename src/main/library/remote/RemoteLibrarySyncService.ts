import type { RemoteSyncStatus } from '../../../shared/types/remoteSources';
import type { RemoteLibraryStore } from './RemoteLibraryStore';
import type { RemoteSourceAdapter, RemoteTrackWrite } from './remoteTypes';
import { remoteTrackIdFor } from './remoteIdentity';

const batchSize = 100;
const nowIso = (): string => new Date().toISOString();

const initialStatus = (sourceId: string): RemoteSyncStatus => ({
  sourceId,
  status: 'idle',
  phase: 'idle',
  discoveredCount: 0,
  parsedCount: 0,
  writtenCount: 0,
  skippedCount: 0,
  missingCount: 0,
  failedCount: 0,
  currentPath: null,
  errors: [],
  startedAt: null,
  finishedAt: null,
});

export class RemoteLibrarySyncService {
  private readonly statuses = new Map<string, RemoteSyncStatus>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly store: RemoteLibraryStore,
    private readonly getAdapter: (provider: string) => RemoteSourceAdapter,
    private readonly onTracksIndexed: (sourceId: string, tracks: RemoteTrackWrite[]) => void = () => undefined,
  ) {}

  syncSource(sourceId: string): RemoteSyncStatus {
    if (this.controllers.has(sourceId)) {
      return this.getSyncStatus(sourceId);
    }

    const controller = new AbortController();
    this.controllers.set(sourceId, controller);
    this.setStatus(sourceId, {
      ...initialStatus(sourceId),
      status: 'running',
      phase: 'testing',
      startedAt: nowIso(),
    });

    void this.runSync(sourceId, controller).finally(() => {
      this.controllers.delete(sourceId);
    });

    return this.getSyncStatus(sourceId);
  }

  cancelSync(sourceId: string): RemoteSyncStatus {
    this.controllers.get(sourceId)?.abort();
    return this.getSyncStatus(sourceId);
  }

  getSyncStatus(sourceId: string): RemoteSyncStatus {
    return this.statuses.get(sourceId) ?? initialStatus(sourceId);
  }

  rescanChanged(sourceId: string): RemoteSyncStatus {
    return this.syncSource(sourceId);
  }

  removeMissingTracks(sourceId: string): number {
    return this.store.removeMissingTracks(sourceId);
  }

  private async runSync(sourceId: string, controller: AbortController): Promise<void> {
    const source = this.store.getSourceWithSecret(sourceId);
    if (!source) {
      this.fail(sourceId, `Unknown remote source ${sourceId}`);
      return;
    }

    const adapter = this.getAdapter(source.provider);
    const errors: string[] = [];
    const seenPaths = new Set<string>();
    let batch: RemoteTrackWrite[] = [];

    try {
      const test = await adapter.testConnection({ source, signal: controller.signal });
      this.store.updateSourceTestResult(sourceId, test.ok, test.message, test.testedAt);
      if (!test.ok) {
        this.fail(sourceId, test.message);
        return;
      }

      this.patchStatus(sourceId, { phase: 'scanning' });

      for await (const item of adapter.scan({
        source,
        signal: controller.signal,
        onError: (path, error) => {
          const message = `${path}: ${error.message}`;
          errors.push(message);
          this.patchStatus(sourceId, {
            failedCount: this.getSyncStatus(sourceId).failedCount + 1,
            errors: errors.slice(-20),
            currentPath: path,
          });
        },
      })) {
        if (controller.signal.aborted) {
          this.cancelled(sourceId);
          return;
        }

        seenPaths.add(item.path);
        this.patchStatus(sourceId, {
          discoveredCount: this.getSyncStatus(sourceId).discoveredCount + 1,
          currentPath: item.path,
        });

        const existing = this.store.getComparableFingerprint(sourceId, item.path);
        const unchanged =
          existing &&
          existing.etag === item.etag &&
          existing.modifiedAt === item.modifiedAt &&
          existing.sizeBytes === item.sizeBytes;

        if (unchanged) {
          this.patchStatus(sourceId, { skippedCount: this.getSyncStatus(sourceId).skippedCount + 1 });
          continue;
        }

        const metadata = item.metadata ?? this.createLayeredIndexMetadata(item.name);
        this.patchStatus(sourceId, { parsedCount: this.getSyncStatus(sourceId).parsedCount + 1 });
        batch.push({
          id: remoteTrackIdFor(sourceId, item.stableKey),
          sourceId,
          provider: source.provider,
          remotePath: item.path,
          remoteUrlHash: item.remoteUrlHash,
          stableKey: item.stableKey,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          albumArtist: metadata.albumArtist,
          trackNo: metadata.trackNo,
          discNo: metadata.discNo,
          year: metadata.year,
          genre: metadata.genre,
          duration: metadata.duration,
          codec: metadata.codec,
          sampleRate: metadata.sampleRate,
          bitDepth: metadata.bitDepth,
          bitrate: metadata.bitrate,
          sizeBytes: item.sizeBytes,
          modifiedAt: item.modifiedAt,
          etag: item.etag,
          coverId: null,
          metadataStatus: metadata.status,
          lyricsStatus: 'pending',
          mvStatus: 'pending',
          availability: 'available',
          fieldSources: metadata.fieldSources,
        });

        if (batch.length >= batchSize) {
          this.flush(sourceId, batch);
          batch = [];
        }
      }

      this.flush(sourceId, batch);
      this.patchStatus(sourceId, { phase: 'marking_missing' });
      const missingCount = this.store.markMissingExcept(sourceId, seenPaths);
      const finishedAt = nowIso();
      this.patchStatus(sourceId, {
        status: 'completed',
        phase: 'finished',
        missingCount,
        failedCount: errors.length,
        errors: errors.slice(-20),
        currentPath: null,
        finishedAt,
      });
      this.store.updateSourceSyncResult(sourceId, errors.length === 0, errors[0] ?? null, finishedAt);
    } catch (error) {
      if (controller.signal.aborted) {
        this.cancelled(sourceId);
        return;
      }

      this.fail(sourceId, error instanceof Error ? error.message : String(error));
    }
  }

  private flush(sourceId: string, batch: RemoteTrackWrite[]): void {
    if (batch.length === 0) {
      return;
    }

    this.patchStatus(sourceId, { phase: 'writing_database' });
    this.store.upsertTracks(batch);
    this.onTracksIndexed(sourceId, batch);
    this.patchStatus(sourceId, { writtenCount: this.getSyncStatus(sourceId).writtenCount + batch.length });
  }

  private createLayeredIndexMetadata(fileName: string): {
    status: 'pending';
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    trackNo: null;
    discNo: null;
    year: null;
    genre: null;
    duration: null;
    codec: null;
    sampleRate: null;
    bitDepth: null;
    bitrate: null;
    fieldSources: Record<string, string>;
  } {
    const title = fileName.replace(/\.[^.]+$/u, '').replace(/[_-]+/g, ' ').trim() || fileName;

    return {
      status: 'pending',
      title,
      artist: 'Unknown Artist',
      album: '',
      albumArtist: 'Unknown Artist',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: null,
      codec: null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      fieldSources: {
        title: 'filename_fallback',
        artist: 'filename_fallback',
        album: 'filename_fallback',
        albumArtist: 'filename_fallback',
      },
    };
  }

  private fail(sourceId: string, message: string): void {
    const finishedAt = nowIso();
    this.patchStatus(sourceId, {
      status: 'failed',
      phase: 'failed',
      failedCount: this.getSyncStatus(sourceId).failedCount + 1,
      errors: [...this.getSyncStatus(sourceId).errors, message].slice(-20),
      currentPath: null,
      finishedAt,
    });
    this.store.updateSourceSyncResult(sourceId, false, message, finishedAt);
  }

  private cancelled(sourceId: string): void {
    this.patchStatus(sourceId, {
      status: 'cancelled',
      phase: 'cancelled',
      currentPath: null,
      finishedAt: nowIso(),
    });
  }

  private patchStatus(sourceId: string, patch: Partial<RemoteSyncStatus>): void {
    this.setStatus(sourceId, {
      ...this.getSyncStatus(sourceId),
      ...patch,
    });
  }

  private setStatus(sourceId: string, status: RemoteSyncStatus): void {
    this.statuses.set(sourceId, status);
  }
}
