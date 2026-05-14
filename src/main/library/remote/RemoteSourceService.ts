import { join } from 'node:path';
import electron from 'electron';
import { getAppSettings } from '../../app/appSettings';
import { createDatabase } from '../../database/createDatabase';
import type { EchoDatabase } from '../../database/createDatabase';
import type { LibraryTrack } from '../../../shared/types/library';
import type {
  RemoteDirectoryItem,
  RemoteBackgroundJobKind,
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobStatus,
  RemoteLibraryTrack,
  RemoteRuntimeLimits,
  RemoteSource,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceUpdate,
  RemoteStreamUrlResult,
  RemoteSyncStatus,
  TestRemoteSourceResult,
} from '../../../shared/types/remoteSources';
import { RemoteLibraryStore } from './RemoteLibraryStore';
import { RemoteBackgroundJobQueue } from './RemoteBackgroundJobQueue';
import { RemoteLibrarySyncService } from './RemoteLibrarySyncService';
import { RemoteStreamProxyService } from './RemoteStreamProxyService';
import type { RemoteSourceAdapter } from './remoteTypes';
import { WebDavRemoteSourceAdapter } from './adapters/WebDavRemoteSourceAdapter';
import { EmbyRemoteSourceAdapter, JellyfinRemoteSourceAdapter } from './adapters/MediaServerRemoteSourceAdapter';
import { SubsonicRemoteSourceAdapter } from './adapters/SubsonicRemoteSourceAdapter';
import { RemoteFileSystemAdapter } from './adapters/RemoteFileSystemAdapter';
import { CoverService } from '../CoverService';
import { resolveConfiguredCoverCacheDir } from '../CoverCacheManager';

export class RemoteSourceService {
  private readonly store: RemoteLibraryStore;
  private readonly webdavAdapter = new WebDavRemoteSourceAdapter();
  private readonly jellyfinAdapter = new JellyfinRemoteSourceAdapter();
  private readonly embyAdapter = new EmbyRemoteSourceAdapter();
  private readonly subsonicAdapter = new SubsonicRemoteSourceAdapter();
  private readonly smbAdapter = new RemoteFileSystemAdapter('smb');
  private readonly sshfsAdapter = new RemoteFileSystemAdapter('sshfs');
  private readonly proxy: RemoteStreamProxyService;
  private readonly backgroundQueue: RemoteBackgroundJobQueue;
  private readonly syncService: RemoteLibrarySyncService;

  constructor(
    private readonly database: EchoDatabase,
    private readonly closeDatabase: () => void = () => undefined,
    coverCacheDir: string | null = null,
  ) {
    this.store = new RemoteLibraryStore(database);
    this.proxy = new RemoteStreamProxyService((provider) => this.getAdapter(provider));
    for (const adapter of [this.webdavAdapter, this.jellyfinAdapter, this.embyAdapter, this.subsonicAdapter, this.smbAdapter, this.sshfsAdapter]) {
      adapter.setStreamUrlResolver((input) =>
        this.proxy.createStreamUrl(input.source, input.remotePath, input.stableKey, input.expiresInSeconds),
      );
    }
    this.backgroundQueue = new RemoteBackgroundJobQueue(
      this.store,
      (provider) => this.getAdapter(provider),
      coverCacheDir ? new CoverService(database, coverCacheDir) : null,
    );
    this.syncService = new RemoteLibrarySyncService(this.store, (provider) => this.getAdapter(provider), (_sourceId, tracks) => {
      for (const indexed of tracks) {
        const track = this.store.getTrack(indexed.id);
        if (track) {
          this.backgroundQueue.enqueueTrack(track, ['metadata']);
        }
      }
    });
  }

  listSources(): RemoteSource[] {
    return this.store.listSources();
  }

  createSource(input: RemoteSourceInput): RemoteSource {
    return this.store.createSource(input);
  }

  updateSource(input: RemoteSourceUpdate): RemoteSource {
    return this.store.updateSource(input);
  }

  deleteSource(id: string): void {
    this.proxy.clearSourceTokens(id);
    this.store.deleteSource(id);
  }

  async testSource(sourceIdOrInput: string | RemoteSourceInput): Promise<TestRemoteSourceResult> {
    const source = typeof sourceIdOrInput === 'string' ? this.store.getSourceWithSecret(sourceIdOrInput) : this.inputToTransientSource(sourceIdOrInput);
    if (!source) {
      throw new Error(`Unknown remote source ${sourceIdOrInput}`);
    }

    const adapter = this.getAdapter(source.provider);
    const result = await adapter.testConnection({ source });
    if (typeof sourceIdOrInput === 'string') {
      this.store.updateSourceTestResult(source.id, result.ok, result.message, result.testedAt);
    }
    return result;
  }

  async browse(sourceId: string, path?: string | null): Promise<RemoteDirectoryItem[]> {
    const source = this.requireSource(sourceId);
    return this.getAdapter(source.provider).browse({ source, path });
  }

  syncSource(sourceId: string): RemoteSyncStatus {
    return this.syncService.syncSource(sourceId);
  }

  cancelSync(sourceId: string): RemoteSyncStatus {
    return this.syncService.cancelSync(sourceId);
  }

  getSyncStatus(sourceId: string): RemoteSyncStatus {
    return this.syncService.getSyncStatus(sourceId);
  }

  rescanChanged(sourceId: string): RemoteSyncStatus {
    return this.syncService.rescanChanged(sourceId);
  }

  removeMissingTracks(sourceId: string): number {
    return this.syncService.removeMissingTracks(sourceId);
  }

  startBackgroundJobs(sourceId: string, kinds?: RemoteBackgroundJobKind[]): RemoteBackgroundJobStatus {
    this.requireSource(sourceId);
    return this.backgroundQueue.enqueueSource(sourceId, kinds);
  }

  pauseBackgroundJobs(sourceId: string): RemoteBackgroundJobStatus {
    this.requireSource(sourceId);
    return this.backgroundQueue.pause(sourceId);
  }

  getJobStatus(sourceId: string): RemoteBackgroundJobStatus {
    this.requireSource(sourceId);
    return this.backgroundQueue.getStatus(sourceId);
  }

  retryFailedJobs(sourceId: string, kinds?: RemoteBackgroundJobKind[]): RemoteBackgroundJobStatus {
    this.requireSource(sourceId);
    return this.backgroundQueue.retryFailed(sourceId, kinds);
  }

  setBackgroundPaused(paused: boolean): RemoteBackgroundGlobalStatus {
    return this.backgroundQueue.setGlobalPaused(paused);
  }

  getBackgroundGlobalStatus(): RemoteBackgroundGlobalStatus {
    return this.backgroundQueue.getGlobalStatus();
  }

  updateRuntimeLimits(sourceId: string, limits: RemoteRuntimeLimits): RemoteBackgroundJobStatus {
    this.requireSource(sourceId);
    return this.backgroundQueue.updateRuntimeLimits(sourceId, limits);
  }

  setPlaybackActive(active: boolean): RemoteBackgroundGlobalStatus {
    return this.backgroundQueue.setPlaybackActive(active);
  }

  refreshTrackMetadata(trackId: string): Promise<RemoteLibraryTrack | null> {
    return this.backgroundQueue.runTrackMetadataNow(trackId);
  }

  backfillDuration(trackId: string, durationSeconds: number): RemoteLibraryTrack | null {
    this.store.updateTrackDuration(trackId, durationSeconds);
    return this.store.getTrack(trackId);
  }

  async createStreamUrl(input: { trackId?: string; sourceId?: string; remotePath?: string; stableKey?: string }): Promise<RemoteStreamUrlResult> {
    const track = input.trackId ? this.store.getTrack(input.trackId) : input.sourceId && input.remotePath ? this.store.getTrackBySourcePath(input.sourceId, input.remotePath) : null;
    const sourceId = track?.sourceId ?? input.sourceId;
    const remotePath = track?.remotePath ?? input.remotePath;
    if (!sourceId || !remotePath) {
      throw new Error('sourceId and remotePath are required');
    }

    const source = this.requireSource(sourceId);
    return this.getAdapter(source.provider).createStreamUrl({ source, remotePath, stableKey: track?.stableKey ?? input.stableKey ?? null });
  }

  getTrack(trackId: string): RemoteLibraryTrack | null {
    return this.store.getTrack(trackId);
  }

  getTrackAsLibraryTrack(trackId: string): LibraryTrack | null {
    const track = this.store.getTrack(trackId);
    return track ? this.store.toLibraryTrack(track) : null;
  }

  toLibraryTrack(track: RemoteLibraryTrack): LibraryTrack {
    return this.store.toLibraryTrack(track);
  }

  close(): void {
    void this.proxy.close();
    this.closeDatabase();
  }

  private requireSource(sourceId: string) {
    const source = this.store.getSourceWithSecret(sourceId);
    if (!source) {
      throw new Error(`Unknown remote source ${sourceId}`);
    }
    return source;
  }

  private getAdapter(provider: string): RemoteSourceAdapter {
    if (provider === 'webdav') {
      return this.webdavAdapter;
    }
    if (provider === 'jellyfin') {
      return this.jellyfinAdapter;
    }
    if (provider === 'emby') {
      return this.embyAdapter;
    }
    if (provider === 'subsonic') {
      return this.subsonicAdapter;
    }
    if (provider === 'smb') {
      return this.smbAdapter;
    }
    if (provider === 'sshfs') {
      return this.sshfsAdapter;
    }

    throw new Error(`Remote source provider ${provider} is not supported yet`);
  }

  private inputToTransientSource(input: RemoteSourceInput) {
    return {
      id: '__test__',
      provider: input.provider as RemoteSourceProvider,
      displayName: input.displayName || 'Remote source',
      status: input.status ?? 'enabled',
      baseUrl: input.baseUrl ?? null,
      username: input.username ?? null,
      authType: input.authType ?? 'basic',
      config: input.config ?? {},
      syncMode: input.syncMode ?? 'index',
      lastTestAt: null,
      lastSyncAt: null,
      lastError: null,
      indexedTrackCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      secret: input.secret ?? null,
    };
  }
}

export const createRemoteSourceService = (databasePath: string): RemoteSourceService => {
  const database = createDatabase(databasePath);
  const coverCacheDir = databasePath === ':memory:' ? null : resolveConfiguredCoverCacheDir(databasePath, getAppSettingsSafe());
  return new RemoteSourceService(database, () => database.close(), coverCacheDir);
};

const getAppSettingsSafe = () => {
  try {
    return getAppSettings();
  } catch {
    return { coverCacheDir: null };
  }
};

let defaultRemoteSourceService: RemoteSourceService | null = null;

export const getRemoteSourceService = (): RemoteSourceService => {
  if (!defaultRemoteSourceService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;

    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultRemoteSourceService = createRemoteSourceService(join(electronApp.getPath('userData'), 'echo-library.sqlite'));
  }

  return defaultRemoteSourceService;
};
