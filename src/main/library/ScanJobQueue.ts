import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumMergeStrategy, AlbumService } from './AlbumService';
import type { LibraryStore } from './LibraryStore';
import type {
  CoverResult,
  LibraryFolder,
  LibraryScanStatus,
  MetadataResult,
  ScannedAudioFile,
  ScannedFile,
  ScanJobUpdate,
  StoredTrackCoverState,
} from './libraryTypes';
import type { CoverExtractor } from './workers/CoverExtractor';
import type { FileScanner } from './workers/FileScanner';
import type { MetadataReader } from './workers/MetadataReader';

type ParsedScanItem = {
  file: ScannedAudioFile;
  metadata: MetadataResult;
  cover: CoverResult | null;
  existingTrackId: string | null;
};

type ChangedFile = {
  file: ScannedAudioFile;
  existingTrackId: string | null;
};

type CoverRepairItem = {
  file: ScannedAudioFile;
  state: StoredTrackCoverState;
  cover: CoverResult | null;
};

type ScanJobQueueOptions = {
  coverCacheDir: string;
  metadataConcurrency?: number;
  coverConcurrency?: number;
  getAlbumMergeStrategy?: () => AlbumMergeStrategy;
};

const progressFlushIntervalMs = 300;
const progressFlushFileDelta = 64;
const maxStoredScanErrors = 200;

type ScanProgressReporter = {
  update: (patch: ScanJobUpdate) => LibraryScanStatus | null;
  flushNow: (patch?: ScanJobUpdate) => LibraryScanStatus;
};

class ScanCancelledError extends Error {
  constructor() {
    super('scan_cancelled');
  }
}

export class ScanJobQueue {
  private readonly runningJobs = new Map<string, Promise<void>>();
  private readonly metadataConcurrency: number;
  private readonly coverConcurrency: number;
  private readonly getAlbumMergeStrategy: () => AlbumMergeStrategy;
  private coverCacheDir: string;

  constructor(
    private readonly store: LibraryStore,
    private readonly fileScanner: FileScanner,
    private readonly metadataReader: MetadataReader,
    private readonly coverExtractor: CoverExtractor,
    private readonly albumService: AlbumService,
    options: ScanJobQueueOptions,
  ) {
    this.metadataConcurrency = options.metadataConcurrency ?? 2;
    this.coverConcurrency = options.coverConcurrency ?? 2;
    this.getAlbumMergeStrategy = options.getAlbumMergeStrategy ?? (() => 'standard');
    this.coverCacheDir = options.coverCacheDir;
  }

  hasRunningJobs(): boolean {
    return this.runningJobs.size > 0;
  }

  updateCoverCacheDir(coverCacheDir: string): void {
    this.coverCacheDir = coverCacheDir;
  }

  scanFolder(folder: LibraryFolder): LibraryScanStatus {
    const job = this.store.createScanJob(folder.id);
    const run = this.runJob(job.id, folder).finally(() => {
      this.runningJobs.delete(job.id);
    });

    this.runningJobs.set(job.id, run);

    return job;
  }

  getScanStatus(jobId: string): LibraryScanStatus {
    const job = this.store.getScanJob(jobId);

    if (!job) {
      throw new Error(`Unknown scan job ${jobId}`);
    }

    return job;
  }

  cancelScan(jobId: string): LibraryScanStatus {
    const current = this.getScanStatus(jobId);

    if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
      return current;
    }

    return this.store.updateScanJob(jobId, {
      cancelRequested: true,
      status: current.status === 'queued' ? 'cancelled' : current.status,
      phase: current.status === 'queued' ? 'cancelled' : current.phase,
      finishedAt: current.status === 'queued' ? new Date().toISOString() : current.finishedAt,
    });
  }

  async waitForIdle(jobId: string): Promise<void> {
    await this.runningJobs.get(jobId);
  }

  private async runJob(jobId: string, folder: LibraryFolder): Promise<void> {
    const startedAt = new Date().toISOString();
    let processedFiles = 0;
    let skippedFiles = 0;
    let addedTracks = 0;
    let updatedTracks = 0;
    let removedTracks = 0;
    let coverCount = 0;
    const errors: string[] = [];
    const progress = this.createProgressReporter(jobId);

    try {
      progress.flushNow({
        status: 'running',
        phase: 'discovering',
        startedAt,
      });

      const files = await this.discoverFiles(jobId, folder, errors, progress);
      progress.flushNow({
        phase: 'checking_cache',
        totalFiles: files.length,
        errors,
      });

      const changedFiles: ChangedFile[] = [];
      const coverRepairItems: CoverRepairItem[] = [];
      const cacheStatesByPath = this.store.getTrackCacheStatesByFolder(folder.id);

      for (const file of files) {
        this.throwIfCancelled(jobId);

        const existing = cacheStatesByPath.get(resolve(file.path)) ?? null;

        if (existing && existing.sizeBytes === file.sizeBytes && existing.mtimeMs === file.mtimeMs) {
          if (this.hasCompleteCoverCache(existing)) {
            processedFiles += 1;
            skippedFiles += 1;
            progress.update({
              processedFiles,
              skippedFiles,
            });
            continue;
          }

          if (this.canRepairCoverCache(existing)) {
            coverRepairItems.push({
              file,
              state: existing,
              cover: null,
            });
            continue;
          }

          changedFiles.push({
            file,
            existingTrackId: existing.id,
          });
          continue;
        }

        changedFiles.push({
          file,
          existingTrackId: existing?.id ?? null,
        });
      }

      progress.flushNow({
        phase: 'reading_metadata',
        processedFiles,
        skippedFiles,
        errors,
      });

      const parsedItems: ParsedScanItem[] = [];
      const coverTimestamp = new Date().toISOString();

      await this.processWithConcurrency(changedFiles, this.metadataConcurrency, async (item) => {
        this.throwIfCancelled(jobId);

        try {
          const metadata = await this.metadataReader.read(item.file.path);
          this.collectWorkerMessages(errors, item.file.path, 'metadata', metadata.warnings, metadata.errors);
          let cover: CoverResult | null = null;

          try {
            cover = await this.coverExtractor.extract(item.file.path, {
              cacheRoot: this.coverCacheDir,
              metadata,
              now: coverTimestamp,
            });
            this.collectWorkerMessages(errors, item.file.path, 'cover', cover.warnings, cover.errors);
            coverCount += 1;
          } catch (error) {
            errors.push(`${item.file.path}: cover: ${error instanceof Error ? error.message : String(error)}`);
          }

          parsedItems.push({
            ...item,
            metadata: this.stripEmbeddedCoverData(metadata),
            cover,
          });
        } catch (error) {
          errors.push(`${item.file.path}: metadata: ${error instanceof Error ? error.message : String(error)}`);
        }

        processedFiles += 1;
        progress.update({
          phase: 'reading_metadata',
          processedFiles,
          skippedFiles,
          coverCount,
          errors,
        });
      });

      this.throwIfCancelled(jobId);

      progress.flushNow({
        phase: 'extracting_covers',
        processedFiles,
        skippedFiles,
        coverCount,
        errors,
      });

      await this.processWithConcurrency(coverRepairItems, this.coverConcurrency, async (item) => {
        this.throwIfCancelled(jobId);

        try {
          if (!this.coverExtractor.repairCachedCover) {
            throw new Error('cover extractor does not support cached cover repair');
          }

          const cover = await this.coverExtractor.repairCachedCover({
            cacheRoot: this.coverCacheDir,
            source: item.state.coverSource!,
            sourceHash: item.state.sourceHash!,
            mimeType: item.state.mimeType,
            originalRef: item.state.originalRef!,
            thumbPath: item.state.thumbPath,
            albumPath: item.state.albumPath,
            largePath: item.state.largePath,
            now: coverTimestamp,
          });
          this.collectWorkerMessages(errors, item.file.path, 'cover', cover.warnings, cover.errors);
          item.cover = cover;
          coverCount += 1;
        } catch (error) {
          errors.push(`${item.file.path}: cover: ${error instanceof Error ? error.message : String(error)}`);
        }

        processedFiles += 1;
        progress.update({
          phase: 'extracting_covers',
          processedFiles,
          skippedFiles,
          coverCount,
          errors,
        });
      });

      this.throwIfCancelled(jobId);

      this.store.transaction(() => {
        const timestamp = new Date().toISOString();

        removedTracks = this.store.markTracksMissingFromFolder(
          folder.id,
          files.map((file) => file.path),
          timestamp,
        );

        for (const item of coverRepairItems) {
          if (item.cover) {
            const repairedCoverId = this.store.upsertCover(item.cover, timestamp);

            if (repairedCoverId && repairedCoverId !== item.state.coverId) {
              this.store.updateTrackCover(item.state.id, repairedCoverId, timestamp);
              updatedTracks += 1;
            }
          }
        }

        for (const item of parsedItems) {
          const coverId = item.cover ? this.store.upsertCover(item.cover, timestamp) : null;
          const result = this.store.upsertTrack({
            ...item.file,
            ...item.metadata.fields,
            id: item.existingTrackId ?? randomUUID(),
            coverId,
            fieldSources: item.metadata.fieldSources,
            embeddedMetadataStatus: item.metadata.embeddedMetadataStatus,
            embeddedCoverStatus: item.metadata.embeddedCoverStatus,
            metadataStatus: item.metadata.status,
            warnings: item.metadata.warnings,
            errors: item.metadata.errors,
            updatedAt: timestamp,
          });

          if (result === 'added') {
            addedTracks += 1;
          } else {
            updatedTracks += 1;
          }
        }

        progress.flushNow({
          phase: 'grouping_albums',
          processedFiles,
          skippedFiles,
          addedTracks,
          updatedTracks,
          removedTracks,
          coverCount,
          errors,
        });
        this.store.refreshAlbums(this.albumService, timestamp, { albumMergeStrategy: this.getAlbumMergeStrategy() });
        this.store.refreshArtists();
        progress.flushNow({
          phase: 'writing_database',
          processedFiles,
          skippedFiles,
          addedTracks,
          updatedTracks,
          removedTracks,
          coverCount,
          errors,
        });
        this.store.finishFolderScan(folder.id, timestamp);
        progress.flushNow({
          status: 'completed',
          phase: 'finished',
          processedFiles,
          skippedFiles,
          addedTracks,
          updatedTracks,
          removedTracks,
          coverCount,
          errors,
          finishedAt: new Date().toISOString(),
        });
      });
    } catch (error) {
      if (error instanceof ScanCancelledError) {
        progress.flushNow({
          status: 'cancelled',
          phase: 'cancelled',
          processedFiles,
          skippedFiles,
          addedTracks,
          updatedTracks,
          removedTracks,
          coverCount,
          errors,
          finishedAt: new Date().toISOString(),
        });
        return;
      }

      errors.push(error instanceof Error ? error.message : String(error));
      progress.flushNow({
        status: 'failed',
        phase: 'failed',
        processedFiles,
        skippedFiles,
        addedTracks,
        updatedTracks,
        removedTracks,
        coverCount,
        errors,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  private async discoverFiles(
    jobId: string,
    folder: LibraryFolder,
    errors: string[],
    progress: ScanProgressReporter,
  ): Promise<ScannedAudioFile[]> {
    const files: ScannedAudioFile[] = [];

    try {
      for await (const file of this.fileScanner.scanFolder(folder.path)) {
        this.throwIfCancelled(jobId);
        files.push(this.withFolderId(file, folder.id));

        if (files.length % 100 === 0) {
          progress.update({
            phase: 'discovering',
            totalFiles: files.length,
            errors,
          });
        }
      }
    } catch (error) {
      errors.push(`${folder.path}: scanner: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    return files;
  }

  private createProgressReporter(jobId: string): ScanProgressReporter {
    let pending: ScanJobUpdate = {};
    let lastFlushAt = 0;
    let lastProcessedFiles = 0;
    let lastCoverCount = 0;
    let lastTotalFiles = 0;

    const mergePatch = (patch?: ScanJobUpdate): void => {
      if (!patch) {
        return;
      }

      pending = {
        ...pending,
        ...patch,
        errors: patch.errors ?? pending.errors,
      };
    };

    const sanitizePatch = (patch: ScanJobUpdate): ScanJobUpdate => {
      if (!patch.errors) {
        return patch;
      }

      return {
        ...patch,
        errorCount: patch.errorCount ?? patch.errors.length,
        errors: patch.errors.slice(0, maxStoredScanErrors),
      };
    };

    const flush = (): LibraryScanStatus => {
      const patch = sanitizePatch(pending);
      pending = {};
      const status = this.store.updateScanJob(jobId, patch);
      lastFlushAt = Date.now();
      lastProcessedFiles = status.processedFiles;
      lastCoverCount = status.coverCount ?? lastCoverCount;
      lastTotalFiles = status.totalFiles;
      return status;
    };

    return {
      update: (patch: ScanJobUpdate): LibraryScanStatus | null => {
        mergePatch(patch);

        const now = Date.now();
        const nextProcessedFiles = pending.processedFiles ?? lastProcessedFiles;
        const nextCoverCount = pending.coverCount ?? lastCoverCount;
        const nextTotalFiles = pending.totalFiles ?? lastTotalFiles;
        const shouldFlush =
          now - lastFlushAt >= progressFlushIntervalMs ||
          nextProcessedFiles - lastProcessedFiles >= progressFlushFileDelta ||
          nextCoverCount - lastCoverCount >= progressFlushFileDelta ||
          nextTotalFiles - lastTotalFiles >= progressFlushFileDelta;

        return shouldFlush ? flush() : null;
      },
      flushNow: (patch?: ScanJobUpdate): LibraryScanStatus => {
        mergePatch(patch);
        return flush();
      },
    };
  }

  private stripEmbeddedCoverData(metadata: MetadataResult): MetadataResult {
    if (!metadata.embeddedCover) {
      return metadata;
    }

    const lightweightMetadata = { ...metadata };
    delete lightweightMetadata.embeddedCover;
    return lightweightMetadata;
  }

  private withFolderId(file: ScannedFile, folderId: string): ScannedAudioFile {
    return {
      ...file,
      folderId,
    };
  }

  private throwIfCancelled(jobId: string): void {
    if (this.store.isScanCancelled(jobId)) {
      throw new ScanCancelledError();
    }
  }

  private collectWorkerMessages(
    errors: string[],
    filePath: string,
    workerName: string,
    warnings: string[],
    workerErrors: string[],
  ): void {
    for (const warning of warnings) {
      errors.push(`${filePath}: ${workerName} warning: ${warning}`);
    }

    for (const error of workerErrors) {
      errors.push(`${filePath}: ${workerName}: ${error}`);
    }
  }

  private hasCompleteCoverCache(state: StoredTrackCoverState): boolean {
    return Boolean(
      state.coverId &&
        state.thumbPath &&
        state.albumPath &&
        state.largePath &&
        existsSync(state.thumbPath) &&
        existsSync(state.albumPath) &&
        existsSync(state.largePath),
    );
  }

  private canRepairCoverCache(state: StoredTrackCoverState): boolean {
    return Boolean(
      state.coverId &&
        state.coverSource &&
        state.sourceHash &&
        state.originalRef &&
        existsSync(state.originalRef),
    );
  }

  private async processWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await worker(items[currentIndex]);
        }
      }),
    );
  }
}
