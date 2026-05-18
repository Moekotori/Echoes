import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteLibraryTrack,
  RemoteRuntimeLimits,
} from '../../../shared/types/remoteSources';
import { getLyricsService } from '../../lyrics/LyricsService';
import { getMvService } from '../../mv/MvService';
import type { CoverService } from '../CoverService';
import type { FieldSources, MetadataStatus, ParsedTrackMetadata } from '../libraryTypes';
import type { RemoteLibraryStore } from './RemoteLibraryStore';
import type { RemoteSourceAdapter, RemoteTrackWrite } from './remoteTypes';

type QueueJob = {
  sourceId: string;
  kind: RemoteBackgroundJobKind;
  trackId: string;
  priority: number;
  retry: boolean;
  groupKey?: string;
};

type RunningJob = QueueJob & {
  title: string;
  remotePath: string;
  startedAt: string;
};

type QueueableTrack = Pick<
  RemoteLibraryTrack,
  | 'id'
  | 'sourceId'
  | 'provider'
  | 'remotePath'
  | 'stableKey'
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'trackNo'
  | 'discNo'
  | 'year'
  | 'genre'
  | 'duration'
  | 'codec'
  | 'sampleRate'
  | 'bitDepth'
  | 'bitrate'
  | 'sizeBytes'
  | 'modifiedAt'
  | 'etag'
  | 'coverId'
  | 'coverStatus'
  | 'metadataStatus'
  | 'lyricsStatus'
  | 'mvStatus'
  | 'availability'
  | 'fieldSources'
>;

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill'];
const defaultConcurrency: Record<RemoteBackgroundJobKind, number> = {
  metadata: 2,
  cover: 2,
  lyrics: 1,
  mv: 1,
  'duration-backfill': 1,
};
const maxConcurrentByKind: Record<RemoteBackgroundJobKind, number> = {
  metadata: 4,
  cover: 2,
  lyrics: 2,
  mv: 2,
  'duration-backfill': 2,
};
const maxTotalRunningJobs = 8;
const maxJobsStartedPerDrain = 8;
const maxTracksPerSourceEnqueue = 5000;
const maxCoverOnlyTracksPerSourceEnqueue = 25;
const maxLyricsOnlyTracksPerSourceEnqueue = 50;
const sourceEnqueueChunkSize = 100;
const coverOnlySourceEnqueueChunkSize = 5;
const lyricsOnlySourceEnqueueChunkSize = 10;
const coverOnlyChunkYieldMs = 100;
const lyricsOnlyChunkYieldMs = 75;
const coverJobCooldownMs = 150;
const lyricsJobCooldownMs = 150;

const limitKeys: Record<RemoteBackgroundJobKind, keyof RemoteRuntimeLimits> = {
  metadata: 'metadataConcurrency',
  cover: 'coverConcurrency',
  lyrics: 'lyricsConcurrency',
  mv: 'mvConcurrency',
  'duration-backfill': 'metadataConcurrency',
};

const zeroCounts = (): Record<RemoteBackgroundJobKind, number> => ({
  metadata: 0,
  cover: 0,
  lyrics: 0,
  mv: 0,
  'duration-backfill': 0,
});
const emptyPendingQueues = (): Record<RemoteBackgroundJobKind, QueueJob[]> => ({
  metadata: [],
  cover: [],
  lyrics: [],
  mv: [],
  'duration-backfill': [],
});

const nowIso = (): string => new Date().toISOString();

export class RemoteBackgroundJobQueue {
  private readonly pendingByKind = emptyPendingQueues();
  private readonly running = new Map<string, RunningJob>();
  private readonly pendingBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly runningBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly pausedSources = new Set<string>();
  private readonly completedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly failedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly skippedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly lastErrors = new Map<string, string>();
  private readonly queuedKeys = new Set<string>();
  private readonly runtimeLimits = new Map<string, RemoteRuntimeLimits>();
  private readonly syncingSources = new Set<string>();
  private readonly sourceEnqueueingKeys = new Set<string>();
  private readonly coverIdsByKey = new Map<string, string | null>();
  private readonly coverPromisesByKey = new Map<string, Promise<string | null>>();
  private globalPaused = false;
  private playbackActive = false;
  private scheduling = false;
  private updatedAt: string | null = null;

  constructor(
    private readonly store: RemoteLibraryStore,
    private readonly getAdapter: (provider: string) => RemoteSourceAdapter,
    private readonly coverService: CoverService | null = null,
  ) {}

  enqueueSource(sourceId: string, kinds: RemoteBackgroundJobKind[] = ['metadata', 'lyrics'], options: { failedOnly?: boolean; priority?: number } = {}): RemoteBackgroundJobStatus {
    const normalizedKinds = this.normalizeKinds(kinds);
    this.resume(sourceId);
    this.scheduleSourceEnqueue(sourceId, normalizedKinds, options);
    return this.getStatus(sourceId);
  }

  enqueueTrack(track: QueueableTrack, kinds: RemoteBackgroundJobKind[] = ['metadata'], priority = 0): void {
    const jobs = this.kindsForTrack(track, this.normalizeKinds(kinds), false).map((kind) => ({
      sourceId: track.sourceId,
      kind,
      trackId: track.id,
      priority,
      retry: false,
      groupKey: this.jobGroupKey(track, kind),
    }));

    this.enqueueMany(jobs);
    this.schedule();
  }

  enqueueTrackWrite(track: RemoteTrackWrite, kinds: RemoteBackgroundJobKind[] = ['metadata'], priority = 0): void {
    this.enqueueTrack(track, kinds, priority);
  }

  enqueueTrackWrites(tracks: RemoteTrackWrite[], kinds: RemoteBackgroundJobKind[] = ['metadata'], priority = 0): void {
    const normalizedKinds = this.normalizeKinds(kinds);
    const jobs: QueueJob[] = [];
    for (const track of tracks) {
      for (const kind of this.kindsForTrack(track, normalizedKinds, false)) {
        jobs.push({ sourceId: track.sourceId, kind, trackId: track.id, priority, retry: false, groupKey: this.jobGroupKey(track, kind) });
      }
    }

    this.enqueueMany(jobs);
    this.schedule();
  }

  pause(sourceId: string): RemoteBackgroundJobStatus {
    this.pausedSources.add(sourceId);
    this.touch();
    return this.getStatus(sourceId);
  }

  setGlobalPaused(paused: boolean): RemoteBackgroundGlobalStatus {
    this.globalPaused = paused;
    this.touch();
    if (!paused) {
      this.schedule();
    }
    return this.getGlobalStatus();
  }

  setPlaybackActive(active: boolean): RemoteBackgroundGlobalStatus {
    this.playbackActive = active;
    this.touch();
    if (!active) {
      this.schedule();
    }
    return this.getGlobalStatus();
  }

  setSourceSyncActive(sourceId: string, active: boolean): RemoteBackgroundJobStatus {
    if (active) {
      this.syncingSources.add(sourceId);
    } else {
      this.syncingSources.delete(sourceId);
    }
    this.touch();
    if (!active) {
      this.schedule();
    }
    return this.getStatus(sourceId);
  }

  updateRuntimeLimits(sourceId: string, limits: RemoteRuntimeLimits): RemoteBackgroundJobStatus {
    this.runtimeLimits.set(sourceId, this.normalizeRuntimeLimits(limits));
    this.touch();
    this.schedule();
    return this.getStatus(sourceId);
  }

  resume(sourceId: string): RemoteBackgroundJobStatus {
    this.pausedSources.delete(sourceId);
    this.touch();
    this.schedule();
    return this.getStatus(sourceId);
  }

  retryFailed(sourceId: string, kinds?: RemoteBackgroundJobKind[]): RemoteBackgroundJobStatus {
    return this.enqueueSource(sourceId, kinds ?? ['metadata', 'duration-backfill'], { failedOnly: true, priority: 5 });
  }

  getStatus(sourceId: string): RemoteBackgroundJobStatus {
    const pending = { ...this.getCounts(this.pendingBySource, sourceId) };
    const running = { ...this.getCounts(this.runningBySource, sourceId) };

    const current = Array.from(this.running.values())
      .filter((job) => job.sourceId === sourceId)
      .map((job) => ({
        kind: job.kind,
        trackId: job.trackId,
        title: job.title,
        remotePath: job.remotePath,
        startedAt: job.startedAt,
      }));

    return {
      sourceId,
      paused: this.pausedSources.has(sourceId),
      concurrency: this.effectiveConcurrency(sourceId),
      pending,
      running,
      completed: { ...this.getCounts(this.completedBySource, sourceId) },
      failed: { ...this.getCounts(this.failedBySource, sourceId) },
      skipped: { ...this.getCounts(this.skippedBySource, sourceId) },
      current,
      lastError: this.lastErrors.get(sourceId) ?? null,
      updatedAt: this.updatedAt,
    };
  }

  getGlobalStatus(): RemoteBackgroundGlobalStatus {
    return {
      paused: this.globalPaused,
      playbackActive: this.playbackActive,
      concurrency: this.effectiveConcurrency(null),
      updatedAt: this.updatedAt,
    };
  }

  async runTrackMetadataNow(trackId: string): Promise<RemoteLibraryTrack | null> {
    const track = this.store.getTrack(trackId);
    if (!track) {
      return null;
    }

    await this.runMetadataJob(track, 'duration-backfill');
    return this.store.getTrack(trackId);
  }

  private scheduleSourceEnqueue(
    sourceId: string,
    kinds: RemoteBackgroundJobKind[],
    options: { failedOnly?: boolean; priority?: number },
  ): void {
    const key = `${sourceId}:${kinds.join(',')}:${options.failedOnly === true ? 'failed' : 'all'}`;
    if (this.sourceEnqueueingKeys.has(key)) {
      return;
    }

    this.sourceEnqueueingKeys.add(key);
    this.touch();
    setImmediate(() => {
      void this.enqueueSourceInChunks(sourceId, kinds, options)
        .catch((error) => {
          this.lastErrors.set(sourceId, error instanceof Error ? error.message : String(error));
          this.touch();
        })
        .finally(() => {
          this.sourceEnqueueingKeys.delete(key);
          this.touch();
        });
    });
  }

  private async enqueueSourceInChunks(
    sourceId: string,
    kinds: RemoteBackgroundJobKind[],
    options: { failedOnly?: boolean; priority?: number },
  ): Promise<void> {
    const coverOnly = kinds.length === 1 && kinds[0] === 'cover';
    const lyricsOnly = kinds.length === 1 && kinds[0] === 'lyrics';
    const trackIds = this.getBackgroundJobTrackIds(sourceId, kinds, {
      failedOnly: options.failedOnly,
      limit: coverOnly ? maxCoverOnlyTracksPerSourceEnqueue : lyricsOnly ? maxLyricsOnlyTracksPerSourceEnqueue : maxTracksPerSourceEnqueue,
    });
    const chunkSize = coverOnly ? coverOnlySourceEnqueueChunkSize : lyricsOnly ? lyricsOnlySourceEnqueueChunkSize : sourceEnqueueChunkSize;

    for (let index = 0; index < trackIds.length; index += chunkSize) {
      const tracks = this.getBackgroundJobTracks(trackIds.slice(index, index + chunkSize));
      const jobs: QueueJob[] = [];

      for (const track of tracks) {
        for (const kind of this.kindsForTrack(track, kinds, options.failedOnly === true)) {
          jobs.push({
            sourceId,
            kind,
            trackId: track.id,
            priority: options.priority ?? 0,
            retry: options.failedOnly === true,
            groupKey: this.jobGroupKey(track, kind),
          });
        }
      }

      this.enqueueMany(jobs);
      this.schedule();
      await this.yieldToEventLoop(coverOnly ? coverOnlyChunkYieldMs : lyricsOnly ? lyricsOnlyChunkYieldMs : 0);
    }
  }

  private getBackgroundJobTrackIds(
    sourceId: string,
    kinds: RemoteBackgroundJobKind[],
    options: { failedOnly?: boolean; limit?: number },
  ): string[] {
    const store = this.store as RemoteLibraryStore & {
      getTrackIdsForBackgroundJobs?: (sourceId: string, kinds: RemoteBackgroundJobKind[], options?: { failedOnly?: boolean; limit?: number }) => string[];
    };

    if (typeof store.getTrackIdsForBackgroundJobs === 'function') {
      return store.getTrackIdsForBackgroundJobs(sourceId, kinds, options);
    }

    return this.store.getTracksForBackgroundJobs(sourceId, kinds, options).map((track) => track.id);
  }

  private getBackgroundJobTracks(trackIds: string[]): RemoteLibraryTrack[] {
    const store = this.store as RemoteLibraryStore & {
      getTracksByIds?: (trackIds: string[]) => RemoteLibraryTrack[];
    };

    if (typeof store.getTracksByIds === 'function') {
      return store.getTracksByIds(trackIds);
    }

    return trackIds
      .map((trackId) => this.store.getTrack(trackId))
      .filter((track): track is RemoteLibraryTrack => Boolean(track));
  }

  private async yieldToEventLoop(delayMs = 0): Promise<void> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  private enqueueMany(jobs: QueueJob[]): void {
    if (jobs.length === 0) {
      return;
    }

    const touchedKinds = new Set<RemoteBackgroundJobKind>();
    let changed = false;

    for (const job of jobs) {
      const key = this.jobKey(job);
      if (this.queuedKeys.has(key) || this.running.has(key)) {
        this.adjust(this.skippedBySource, job.sourceId, job.kind, 1);
        changed = true;
        continue;
      }

      this.queuedKeys.add(key);
      this.pendingByKind[job.kind].push(job);
      this.adjust(this.pendingBySource, job.sourceId, job.kind, 1);
      touchedKinds.add(job.kind);
      changed = true;
    }

    for (const kind of touchedKinds) {
      this.pendingByKind[kind].sort((left, right) => right.priority - left.priority);
    }

    if (changed) {
      this.touch();
    }
  }

  private schedule(): void {
    if (this.scheduling) {
      return;
    }

    this.scheduling = true;
    setImmediate(() => {
      this.scheduling = false;
      this.drain();
    });
  }

  private drain(): void {
    if (this.globalPaused) {
      return;
    }

    let startedCount = 0;

    for (const kind of jobKinds) {
      const pending = this.pendingByKind[kind];
      while (pending.length > 0 && startedCount < maxJobsStartedPerDrain) {
        const index = pending.findIndex((job) => this.canStart(job));
        if (index < 0) {
          break;
        }

        const [job] = pending.splice(index, 1);
        this.queuedKeys.delete(this.jobKey(job));
        this.adjust(this.pendingBySource, job.sourceId, job.kind, -1);
        const track = this.store.getTrack(job.trackId);
        if (!track || track.availability === 'missing') {
          this.increment(this.skippedBySource, job.sourceId, job.kind);
          continue;
        }

        const runningJob: RunningJob = {
          ...job,
          title: track.title,
          remotePath: track.remotePath,
          startedAt: nowIso(),
        };
        this.running.set(this.jobKey(job), runningJob);
        this.adjust(this.runningBySource, job.sourceId, job.kind, 1);
        void this.run(job, track).finally(() => {
          this.running.delete(this.jobKey(job));
          this.adjust(this.runningBySource, job.sourceId, job.kind, -1);
          this.touch();
          this.schedule();
        });
        startedCount += 1;
      }

      if (startedCount >= maxJobsStartedPerDrain) {
        break;
      }
    }

    if (startedCount > 0) {
      this.touch();
    }

    if (startedCount >= maxJobsStartedPerDrain && this.hasStartablePendingJob()) {
      this.schedule();
    }
  }

  private async run(job: QueueJob, track: RemoteLibraryTrack): Promise<void> {
    try {
      let shouldCooldownCover = false;
      let shouldCooldownLyrics = false;
      if (job.kind === 'metadata' || job.kind === 'duration-backfill') {
        const updated = await this.runMetadataJob(track, job.kind);
        if (updated) {
          this.enqueueTrack(updated, ['lyrics']);
        }
      } else if (job.kind === 'cover') {
        const covered = await this.runCoverJob(track);
        if (!covered) {
          this.increment(this.skippedBySource, job.sourceId, job.kind);
          return;
        }
        shouldCooldownCover = true;
      } else if (job.kind === 'lyrics') {
        this.store.updateTrackJobStatus(track.id, 'lyrics', 'searching');
        const lyrics = await getLyricsService().getLyricsForTrack(track.id);
        this.store.updateTrackJobStatus(track.id, 'lyrics', lyrics ? 'ok' : 'not_found');
        shouldCooldownLyrics = true;
      } else if (job.kind === 'mv') {
        this.increment(this.skippedBySource, job.sourceId, job.kind);
        return;
      } else {
        this.increment(this.skippedBySource, job.sourceId, job.kind);
        return;
      }

      this.increment(this.completedBySource, job.sourceId, job.kind);
      if (shouldCooldownCover) {
        await this.yieldToEventLoop(coverJobCooldownMs);
      }
      if (shouldCooldownLyrics) {
        await this.yieldToEventLoop(lyricsJobCooldownMs);
      }
    } catch (error) {
      this.lastErrors.set(job.sourceId, error instanceof Error ? error.message : String(error));
      if (job.kind === 'cover' || job.kind === 'lyrics' || job.kind === 'mv' || job.kind === 'metadata' || job.kind === 'duration-backfill') {
        this.store.updateTrackJobStatus(track.id, job.kind, 'error');
      }
      this.increment(this.failedBySource, job.sourceId, job.kind);
    }
  }

  private async runCoverJob(track: RemoteLibraryTrack): Promise<boolean> {
    if (track.coverId || !this.coverService) {
      return false;
    }

    const coverKey = this.coverCacheKey(track);
    if (coverKey && this.coverIdsByKey.has(coverKey)) {
      const coverId = this.coverIdsByKey.get(coverKey) ?? null;
      if (coverId) {
        this.applyCoverId(track, coverId);
      } else {
        this.store.updateTrackJobStatus(track.id, 'cover', 'not_found');
      }
      return Boolean(coverId);
    }

    if (coverKey) {
      const existingPromise = this.coverPromisesByKey.get(coverKey);
      if (existingPromise) {
        const coverId = await existingPromise;
        if (coverId) {
          this.applyCoverId(track, coverId);
        } else {
          this.store.updateTrackJobStatus(track.id, 'cover', 'not_found');
        }
        return Boolean(coverId);
      }
    }

    this.store.updateTrackJobStatus(track.id, 'cover', 'searching');
    const coverPromise = this.readAndCacheCover(track, this.coverService);
    if (coverKey) {
      this.coverPromisesByKey.set(coverKey, coverPromise);
    }

    try {
      const coverId = await coverPromise;
      if (coverKey) {
        this.coverIdsByKey.set(coverKey, coverId);
      }
      if (coverId) {
        this.applyCoverId(track, coverId);
      } else {
        this.store.updateTrackJobStatus(track.id, 'cover', 'not_found');
      }
      return Boolean(coverId);
    } finally {
      if (coverKey) {
        this.coverPromisesByKey.delete(coverKey);
      }
    }
  }

  private applyCoverId(track: RemoteLibraryTrack, coverId: string): void {
    const coverArt = track.fieldSources.coverArt;
    if (coverArt) {
      this.store.updateTrackCoversByCoverArt(track.sourceId, coverArt, coverId);
      return;
    }

    this.store.updateTrackCover(track.id, coverId);
  }

  private async readAndCacheCover(track: RemoteLibraryTrack, coverService: CoverService): Promise<string | null> {
    const source = this.store.getSourceWithSecret(track.sourceId);
    if (!source) {
      throw new Error(`Unknown remote source ${track.sourceId}`);
    }

    const adapter = this.getAdapter(source.provider);
    if (!adapter.readCover) {
      return null;
    }

    const result = await adapter.readCover({
      source,
      item: {
        sourceId: track.sourceId,
        provider: track.provider,
        path: track.remotePath,
        name: track.remotePath.split('/').filter(Boolean).pop() ?? track.title,
        kind: 'file',
        sizeBytes: track.sizeBytes,
        modifiedAt: track.modifiedAt,
        etag: track.etag,
        contentType: null,
        audio: true,
        remoteUrlHash: '',
        stableKey: track.stableKey,
        metadata: {
          status: track.metadataStatus,
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumArtist: track.albumArtist,
          trackNo: track.trackNo,
          discNo: track.discNo,
          year: track.year,
          genre: track.genre,
          duration: track.duration,
          codec: track.codec,
          sampleRate: track.sampleRate,
          bitDepth: track.bitDepth,
          bitrate: track.bitrate,
          fieldSources: track.fieldSources,
          warnings: [],
          errors: [],
        },
      },
    });

    if (!result.data) {
      return null;
    }

    const metadata: ParsedTrackMetadata = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      trackNo: track.trackNo,
      discNo: track.discNo,
      year: track.year,
      genre: track.genre,
      duration: track.duration ?? 0,
      codec: track.codec,
      sampleRate: track.sampleRate,
      bitDepth: track.bitDepth,
      bitrate: track.bitrate,
      fieldSources: track.fieldSources as FieldSources,
      embeddedCover: {
        data: result.data,
        mimeType: result.mimeType,
      },
      warnings: result.warnings,
      errors: result.errors,
      metadataStatus: this.toLocalMetadataStatus(track.metadataStatus),
    };
    const coverId = await coverService.ensureCover(`remote://${track.sourceId}${track.remotePath}`, metadata);
    return coverId;
  }

  private coverCacheKey(track: Pick<RemoteLibraryTrack, 'sourceId' | 'fieldSources'>): string | null {
    const coverArt = track.fieldSources.coverArt;
    return coverArt ? `${track.sourceId}:${coverArt}` : null;
  }

  private async runMetadataJob(track: RemoteLibraryTrack, kind: RemoteBackgroundJobKind): Promise<RemoteLibraryTrack | null> {
    const source = this.store.getSourceWithSecret(track.sourceId);
    if (!source) {
      throw new Error(`Unknown remote source ${track.sourceId}`);
    }

    const adapter = this.getAdapter(source.provider);
    this.store.updateTrackJobStatus(track.id, kind, 'searching');
    const metadata = await adapter.readMetadata({
      source,
      item: {
        sourceId: track.sourceId,
        provider: track.provider,
        path: track.remotePath,
        name: track.remotePath.split('/').filter(Boolean).pop() ?? track.title,
        kind: 'file',
        sizeBytes: track.sizeBytes,
        modifiedAt: track.modifiedAt,
        etag: track.etag,
        contentType: null,
        audio: true,
        remoteUrlHash: '',
        stableKey: track.stableKey,
      },
    });

    const mergedFieldSources = {
      ...track.fieldSources,
      ...metadata.fieldSources,
    };

    return this.store.updateTrackMetadata(track.id, {
      title: metadata.title || track.title,
      artist: metadata.artist || track.artist,
      album: metadata.album,
      albumArtist: metadata.albumArtist || metadata.artist || track.albumArtist,
      trackNo: metadata.trackNo,
      discNo: metadata.discNo,
      year: metadata.year,
      genre: metadata.genre,
      duration: metadata.duration ?? track.duration,
      codec: metadata.codec ?? track.codec,
      sampleRate: metadata.sampleRate,
      bitDepth: metadata.bitDepth,
      bitrate: metadata.bitrate,
      metadataStatus: metadata.status,
      fieldSources: mergedFieldSources,
    });
  }

  private kindsForTrack(track: QueueableTrack, kinds: RemoteBackgroundJobKind[], failedOnly: boolean): RemoteBackgroundJobKind[] {
    const metadataEligible = failedOnly ? track.metadataStatus === 'error' : track.metadataStatus === 'pending' || track.metadataStatus === 'partial';

    return kinds.filter((kind) => {
      if (kind === 'metadata') {
        return metadataEligible;
      }
      if (kind === 'duration-backfill') {
        if (kinds.includes('metadata') && metadataEligible) {
          return false;
        }
        return failedOnly ? track.metadataStatus === 'error' : (!track.duration || track.duration <= 0 || track.metadataStatus === 'pending') && track.metadataStatus !== 'error';
      }
      if (kind === 'cover') {
        const coverStatus = track.coverStatus ?? 'pending';
        const coverEligible = failedOnly ? coverStatus === 'error' : coverStatus === 'pending' || coverStatus === 'error';
        return !track.coverId && coverEligible && track.metadataStatus !== 'error' && this.canAttemptCover(track);
      }
      if (kind === 'lyrics') {
        return this.hasMatchableMetadata(track) && (failedOnly ? track.lyricsStatus === 'error' : track.lyricsStatus === 'pending' || track.lyricsStatus === 'not_found' || track.lyricsStatus === 'error');
      }
      if (kind === 'mv') {
        return false;
      }
      return false;
    });
  }

  private hasMatchableMetadata(track: QueueableTrack): boolean {
    return Boolean(track.title.trim() && track.artist.trim() && track.artist !== 'Unknown Artist');
  }

  private canAttemptCover(track: QueueableTrack): boolean {
    if (track.provider === 'jellyfin' || track.provider === 'emby' || track.provider === 'subsonic') {
      return Boolean(track.fieldSources.coverArt);
    }

    return true;
  }

  private canRunCoverDuringPlayback(job: QueueJob): boolean {
    if (job.kind !== 'cover') {
      return true;
    }

    const track = this.store.getTrack(job.trackId);
    if (!track) {
      return false;
    }

    return (track.provider === 'jellyfin' || track.provider === 'emby' || track.provider === 'subsonic') && Boolean(track.fieldSources.coverArt);
  }

  private normalizeKinds(kinds: RemoteBackgroundJobKind[]): RemoteBackgroundJobKind[] {
    const unique = new Set<RemoteBackgroundJobKind>();
    for (const kind of kinds) {
      if (jobKinds.includes(kind)) {
        unique.add(kind);
      }
    }

    return unique.size > 0 ? Array.from(unique) : ['metadata', 'lyrics'];
  }

  private jobKey(job: Pick<QueueJob, 'sourceId' | 'trackId' | 'kind' | 'groupKey'>): string {
    return `${job.sourceId}:${job.kind}:${job.groupKey ?? job.trackId}`;
  }

  private jobGroupKey(track: QueueableTrack, kind: RemoteBackgroundJobKind): string | undefined {
    if (kind !== 'cover') {
      return undefined;
    }

    return this.coverCacheKey(track) ?? undefined;
  }

  private canStart(job: QueueJob): boolean {
    if (this.globalPaused || this.pausedSources.has(job.sourceId)) {
      return false;
    }

    if (job.kind === 'cover' && this.syncingSources.has(job.sourceId)) {
      return false;
    }

    if (job.kind === 'cover' && this.playbackActive && !this.canRunCoverDuringPlayback(job)) {
      return false;
    }

    if (this.running.size >= maxTotalRunningJobs || this.runningCountForKind(job.kind) >= maxConcurrentByKind[job.kind]) {
      return false;
    }

    const limit = this.effectiveConcurrency(job.sourceId)[job.kind];
    const runningForSource = this.getCounts(this.runningBySource, job.sourceId)[job.kind];
    return runningForSource < limit;
  }

  private effectiveConcurrency(sourceId: string | null): Record<RemoteBackgroundJobKind, number> {
    const concurrency = { ...defaultConcurrency };
    const sourceConfig = sourceId ? this.store.getSource(sourceId)?.config : null;
    const runtimeLimits = sourceId ? this.runtimeLimits.get(sourceId) : null;

    for (const kind of jobKinds) {
      const configKey = limitKeys[kind];
      const configured =
        kind === 'cover' && sourceConfig?.coverConcurrency === undefined
          ? sourceConfig?.metadataConcurrency
          : sourceConfig?.[configKey];
      const runtime = runtimeLimits?.[configKey];
      const max = maxConcurrentByKind[kind];
      concurrency[kind] = this.clampLimit(runtime ?? configured, concurrency[kind], 1, max);
    }

    if (sourceId && this.syncingSources.has(sourceId)) {
      concurrency.cover = 0;
    }

    if (this.playbackActive) {
      concurrency.metadata = Math.min(concurrency.metadata, 1);
      concurrency.cover = Math.min(concurrency.cover, 1);
    }

    return concurrency;
  }

  private normalizeRuntimeLimits(limits: RemoteRuntimeLimits): RemoteRuntimeLimits {
    return {
      scanConcurrency: limits.scanConcurrency === undefined ? undefined : this.clampLimit(limits.scanConcurrency, 3, 1, 8),
      metadataConcurrency: limits.metadataConcurrency === undefined ? undefined : this.clampLimit(limits.metadataConcurrency, defaultConcurrency.metadata, 1, maxConcurrentByKind.metadata),
      coverConcurrency: limits.coverConcurrency === undefined ? undefined : this.clampLimit(limits.coverConcurrency, defaultConcurrency.cover, 1, maxConcurrentByKind.cover),
      lyricsConcurrency: limits.lyricsConcurrency === undefined ? undefined : this.clampLimit(limits.lyricsConcurrency, defaultConcurrency.lyrics, 1, maxConcurrentByKind.lyrics),
      mvConcurrency: limits.mvConcurrency === undefined ? undefined : this.clampLimit(limits.mvConcurrency, defaultConcurrency.mv, 1, maxConcurrentByKind.mv),
    };
  }

  private hasStartablePendingJob(): boolean {
    return jobKinds.some((kind) => this.pendingByKind[kind].some((job) => this.canStart(job)));
  }

  private runningCountForKind(kind: RemoteBackgroundJobKind): number {
    let count = 0;
    for (const job of this.running.values()) {
      if (job.kind === kind) {
        count += 1;
      }
    }
    return count;
  }

  private clampLimit(value: unknown, fallback: number, min = 1, max = 6): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
  }

  private toLocalMetadataStatus(status: RemoteLibraryTrack['metadataStatus']): MetadataStatus {
    if (status === 'ok') {
      return 'ok';
    }
    if (status === 'error') {
      return 'error';
    }
    return 'fallback';
  }

  private getCounts(map: Map<string, Record<RemoteBackgroundJobKind, number>>, sourceId: string): Record<RemoteBackgroundJobKind, number> {
    let counts = map.get(sourceId);
    if (!counts) {
      counts = zeroCounts();
      map.set(sourceId, counts);
    }
    return counts;
  }

  private increment(map: Map<string, Record<RemoteBackgroundJobKind, number>>, sourceId: string, kind: RemoteBackgroundJobKind): void {
    const counts = this.getCounts(map, sourceId);
    counts[kind] += 1;
    this.touch();
  }

  private adjust(map: Map<string, Record<RemoteBackgroundJobKind, number>>, sourceId: string, kind: RemoteBackgroundJobKind, delta: number): void {
    const counts = this.getCounts(map, sourceId);
    counts[kind] = Math.max(0, counts[kind] + delta);
  }

  private touch(): void {
    this.updatedAt = nowIso();
  }
}
