import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteLibraryTrack,
  RemoteRuntimeLimits,
} from '../../../shared/types/remoteSources';
import { getLyricsService } from '../../lyrics/LyricsService';
import { getMvService } from '../../mv/MvService';
import { CoverService } from '../CoverService';
import type { FieldSources, MetadataStatus, ParsedTrackMetadata } from '../libraryTypes';
import type { RemoteLibraryStore } from './RemoteLibraryStore';
import type { RemoteSourceAdapter } from './remoteTypes';

type QueueJob = {
  sourceId: string;
  kind: RemoteBackgroundJobKind;
  trackId: string;
  priority: number;
  retry: boolean;
};

type RunningJob = QueueJob & {
  title: string;
  remotePath: string;
  startedAt: string;
};

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill'];
const defaultConcurrency: Record<RemoteBackgroundJobKind, number> = {
  metadata: 2,
  cover: 2,
  lyrics: 1,
  mv: 1,
  'duration-backfill': 1,
};

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

const nowIso = (): string => new Date().toISOString();

export class RemoteBackgroundJobQueue {
  private readonly pending: QueueJob[] = [];
  private readonly running = new Map<string, RunningJob>();
  private readonly pausedSources = new Set<string>();
  private readonly completedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly failedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly skippedBySource = new Map<string, Record<RemoteBackgroundJobKind, number>>();
  private readonly lastErrors = new Map<string, string>();
  private readonly queuedKeys = new Set<string>();
  private readonly runtimeLimits = new Map<string, RemoteRuntimeLimits>();
  private globalPaused = false;
  private playbackActive = false;
  private scheduling = false;
  private updatedAt: string | null = null;

  constructor(
    private readonly store: RemoteLibraryStore,
    private readonly getAdapter: (provider: string) => RemoteSourceAdapter,
    private readonly coverService: CoverService | null = null,
  ) {}

  enqueueSource(sourceId: string, kinds: RemoteBackgroundJobKind[] = ['metadata', 'lyrics', 'mv'], options: { failedOnly?: boolean; priority?: number } = {}): RemoteBackgroundJobStatus {
    const normalizedKinds = this.normalizeKinds(kinds);
    const tracks = this.store.getTracksForBackgroundJobs(sourceId, normalizedKinds, { failedOnly: options.failedOnly });

    for (const track of tracks) {
      for (const kind of this.kindsForTrack(track, normalizedKinds, options.failedOnly === true)) {
        this.enqueue({ sourceId, kind, trackId: track.id, priority: options.priority ?? 0, retry: options.failedOnly === true });
      }
    }

    this.resume(sourceId);
    this.schedule();
    return this.getStatus(sourceId);
  }

  enqueueTrack(track: RemoteLibraryTrack, kinds: RemoteBackgroundJobKind[] = ['metadata'], priority = 0): void {
    for (const kind of this.kindsForTrack(track, this.normalizeKinds(kinds), false)) {
      this.enqueue({ sourceId: track.sourceId, kind, trackId: track.id, priority, retry: false });
    }

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
    return this.enqueueSource(sourceId, kinds ?? ['metadata', 'lyrics', 'mv'], { failedOnly: true, priority: 5 });
  }

  getStatus(sourceId: string): RemoteBackgroundJobStatus {
    const pending = zeroCounts();
    const running = zeroCounts();

    for (const job of this.pending) {
      if (job.sourceId === sourceId) {
        pending[job.kind] += 1;
      }
    }

    const current = Array.from(this.running.values())
      .filter((job) => job.sourceId === sourceId)
      .map((job) => {
        running[job.kind] += 1;
        return {
          kind: job.kind,
          trackId: job.trackId,
          title: job.title,
          remotePath: job.remotePath,
          startedAt: job.startedAt,
        };
      });

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

  private enqueue(job: QueueJob): void {
    const key = this.jobKey(job);
    if (this.queuedKeys.has(key) || this.running.has(key)) {
      this.increment(this.skippedBySource, job.sourceId, job.kind);
      return;
    }

    this.queuedKeys.add(key);
    this.pending.push(job);
    this.pending.sort((left, right) => right.priority - left.priority);
    this.touch();
  }

  private schedule(): void {
    if (this.scheduling) {
      return;
    }

    this.scheduling = true;
    queueMicrotask(() => {
      this.scheduling = false;
      this.drain();
    });
  }

  private drain(): void {
    if (this.globalPaused) {
      return;
    }

    let started = false;

    for (const kind of jobKinds) {
      while (true) {
        const index = this.pending.findIndex((job) => job.kind === kind && this.canStart(job));
        if (index < 0) {
          break;
        }

        const [job] = this.pending.splice(index, 1);
        this.queuedKeys.delete(this.jobKey(job));
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
        void this.run(job, track).finally(() => {
          this.running.delete(this.jobKey(job));
          this.touch();
          this.schedule();
        });
        started = true;
      }
    }

    if (started) {
      this.touch();
    }
  }

  private async run(job: QueueJob, track: RemoteLibraryTrack): Promise<void> {
    try {
      if (job.kind === 'metadata' || job.kind === 'duration-backfill') {
        const updated = await this.runMetadataJob(track, job.kind);
        if (updated) {
          this.enqueueTrack(updated, ['cover']);
        }
        if (updated && this.hasMatchableMetadata(updated)) {
          this.enqueueTrack(updated, ['lyrics', 'mv']);
        }
      } else if (job.kind === 'cover') {
        const covered = await this.runCoverJob(track);
        if (!covered) {
          this.increment(this.skippedBySource, job.sourceId, job.kind);
          return;
        }
      } else if (job.kind === 'lyrics') {
        this.store.updateTrackJobStatus(track.id, 'lyrics', 'searching');
        const lyrics = await getLyricsService().getLyricsForTrack(track.id);
        this.store.updateTrackJobStatus(track.id, 'lyrics', lyrics ? 'ok' : 'not_found');
      } else if (job.kind === 'mv') {
        this.store.updateTrackJobStatus(track.id, 'mv', 'searching');
        const candidates = await getMvService().searchNetworkCandidates(track.id);
        this.store.updateTrackJobStatus(track.id, 'mv', candidates.length > 0 ? 'ok' : 'not_found');
      } else {
        this.increment(this.skippedBySource, job.sourceId, job.kind);
        return;
      }

      this.increment(this.completedBySource, job.sourceId, job.kind);
    } catch (error) {
      this.lastErrors.set(job.sourceId, error instanceof Error ? error.message : String(error));
      if (job.kind === 'lyrics' || job.kind === 'mv' || job.kind === 'metadata' || job.kind === 'duration-backfill') {
        this.store.updateTrackJobStatus(track.id, job.kind, 'error');
      }
      this.increment(this.failedBySource, job.sourceId, job.kind);
    }
  }

  private async runCoverJob(track: RemoteLibraryTrack): Promise<boolean> {
    if (track.coverId || !this.coverService) {
      return false;
    }

    const source = this.store.getSourceWithSecret(track.sourceId);
    if (!source) {
      throw new Error(`Unknown remote source ${track.sourceId}`);
    }

    const adapter = this.getAdapter(source.provider);
    if (!adapter.readCover) {
      return false;
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
      return false;
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
    const coverId = await this.coverService.ensureCover(`remote://${track.sourceId}${track.remotePath}`, metadata);
    this.store.updateTrackCover(track.id, coverId);
    return Boolean(coverId);
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

  private kindsForTrack(track: RemoteLibraryTrack, kinds: RemoteBackgroundJobKind[], failedOnly: boolean): RemoteBackgroundJobKind[] {
    return kinds.filter((kind) => {
      if (kind === 'metadata') {
        return failedOnly ? track.metadataStatus === 'error' : track.metadataStatus === 'pending' || track.metadataStatus === 'partial';
      }
      if (kind === 'duration-backfill') {
        return failedOnly ? track.metadataStatus === 'error' : (!track.duration || track.duration <= 0 || track.metadataStatus === 'pending') && track.metadataStatus !== 'error';
      }
      if (kind === 'cover') {
        return !track.coverId && track.metadataStatus !== 'error';
      }
      if (kind === 'lyrics') {
        return this.hasMatchableMetadata(track) && (failedOnly ? track.lyricsStatus === 'error' : track.lyricsStatus === 'pending' || track.lyricsStatus === 'not_found' || track.lyricsStatus === 'error');
      }
      if (kind === 'mv') {
        return this.hasMatchableMetadata(track) && (failedOnly ? track.mvStatus === 'error' : track.mvStatus === 'pending' || track.mvStatus === 'not_found' || track.mvStatus === 'error');
      }
      return false;
    });
  }

  private hasMatchableMetadata(track: RemoteLibraryTrack): boolean {
    return Boolean(track.title.trim() && track.artist.trim() && track.artist !== 'Unknown Artist');
  }

  private normalizeKinds(kinds: RemoteBackgroundJobKind[]): RemoteBackgroundJobKind[] {
    const unique = new Set<RemoteBackgroundJobKind>();
    for (const kind of kinds) {
      if (jobKinds.includes(kind)) {
        unique.add(kind);
      }
    }

    return unique.size > 0 ? Array.from(unique) : ['metadata', 'lyrics', 'mv'];
  }

  private jobKey(job: Pick<QueueJob, 'sourceId' | 'trackId' | 'kind'>): string {
    return `${job.sourceId}:${job.trackId}:${job.kind}`;
  }

  private canStart(job: QueueJob): boolean {
    if (this.globalPaused || this.pausedSources.has(job.sourceId)) {
      return false;
    }

    const limit = this.effectiveConcurrency(job.sourceId)[job.kind];
    const runningForSource = Array.from(this.running.values()).filter((running) => running.sourceId === job.sourceId && running.kind === job.kind).length;
    return runningForSource < limit;
  }

  private effectiveConcurrency(sourceId: string | null): Record<RemoteBackgroundJobKind, number> {
    const concurrency = { ...defaultConcurrency };
    const sourceConfig = sourceId ? this.store.getSource(sourceId)?.config : null;
    const runtimeLimits = sourceId ? this.runtimeLimits.get(sourceId) : null;

    for (const kind of jobKinds) {
      const configKey = limitKeys[kind];
      const configured = sourceConfig?.[configKey];
      const runtime = runtimeLimits?.[configKey];
      concurrency[kind] = this.clampLimit(runtime ?? configured, concurrency[kind]);
    }

    if (this.playbackActive) {
      concurrency.metadata = Math.min(concurrency.metadata, 1);
      concurrency.cover = Math.min(concurrency.cover, 1);
    }

    return concurrency;
  }

  private normalizeRuntimeLimits(limits: RemoteRuntimeLimits): RemoteRuntimeLimits {
    return {
      scanConcurrency: limits.scanConcurrency === undefined ? undefined : this.clampLimit(limits.scanConcurrency, 3, 1, 6),
      metadataConcurrency: limits.metadataConcurrency === undefined ? undefined : this.clampLimit(limits.metadataConcurrency, defaultConcurrency.metadata),
      coverConcurrency: limits.coverConcurrency === undefined ? undefined : this.clampLimit(limits.coverConcurrency, defaultConcurrency.cover),
      lyricsConcurrency: limits.lyricsConcurrency === undefined ? undefined : this.clampLimit(limits.lyricsConcurrency, defaultConcurrency.lyrics),
      mvConcurrency: limits.mvConcurrency === undefined ? undefined : this.clampLimit(limits.mvConcurrency, defaultConcurrency.mv),
    };
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

  private touch(): void {
    this.updatedAt = nowIso();
  }
}
