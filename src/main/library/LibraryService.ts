import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers';
import { setImmediate as yieldToMainLoop } from 'node:timers/promises';
import electron from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { defaultSettings, getAppSettings } from '../app/appSettings';
import { createDatabase, type EchoDatabase } from '../database/createDatabase';
import { AlbumService } from './AlbumService';
import type { AlbumMergeStrategy } from './AlbumService';
import { getDefaultCoverCacheDir, migrateCoverCache, resolveConfiguredCoverCacheDir, resolveCoverCacheDir } from './CoverCacheManager';
import { LibraryStore } from './LibraryStore';
import { inflateMetadataResult } from './MetadataService';
import { getNcmConverter } from './NcmConverter';
import { getRecommendedScanConcurrency } from './ScanConcurrency';
import { ScanJobQueue } from './ScanJobQueue';
import { NetworkMetadataService, type NetworkCandidateList, type NetworkRepairResult } from './network/NetworkMetadataService';
import { BpmAnalysisJobQueue } from './audioAnalysis/BpmAnalysisJobQueue';
import { ArtistImageCacheService } from './artistImages/ArtistImageCacheService';
import type { ArtistImageLookupInput, ArtistImageProvider } from './artistImages/ArtistImageTypes';
import type { MetadataService } from './MetadataService';
import type {
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryArtist,
  LibraryDiagnostics,
  EditableAlbumTags,
  EditableTrackTags,
  LibraryFolder,
  LibraryFolderChildrenQuery,
  LibraryFolderNode,
  LibraryFolderOverview,
  LibraryFolderPathRequest,
  LibraryFolderTracksQuery,
  LibraryPage,
  LibraryPageQuery,
  LibraryPlaylist,
  LibraryPlaylistItem,
  LibraryScanStatus,
  LibraryScanOptions,
  LibrarySummary,
  LibraryTrack,
  LibraryCleanupResult,
  LibraryMaintenanceCleanupResult,
  LibraryAlbumTagUpdateRequest,
  LibraryTrackTagUpdateRequest,
  CoverVariant,
  MetadataResult,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  StartPlaybackHistoryRequest,
  StartPlaybackHistoryResult,
  FinishPlaybackHistoryRequest,
  CreatePlaylistRequest,
  UpdatePlaylistRequest,
  DuplicateTrackGroup,
  DuplicateTrackIndexSummary,
  DuplicateTrackMember,
  DuplicateTrackMode,
  BpmAnalysisJobStatus,
  BpmAnalysisStartOptions,
  ArtistImageCacheClearResult,
  ArtistImageCacheEntry,
  ArtistImageCacheSummary,
  ArtistImageQueueResult,
  ArtistImageRefreshResult,
} from './libraryTypes';
import type {
  EmbeddedTrackTagsLoadResult,
  LibraryCacheClearResult,
  MissingMetadataField,
  MissingMetadataScanResult,
  NetworkApplyOptions,
  NetworkMetadataScanJobStatus,
  NetworkApplyResult,
  NetworkTagCandidate,
  NetworkTagCandidateSearchRequest,
} from '../../shared/types/library';
import type { AppSettings } from '../../shared/types/appSettings';
import type { CoverCacheMigrationResult } from '../../shared/types/coverCache';
import type { ScanConcurrencyRecommendation } from './ScanConcurrency';
import type { CoverExtractor } from './workers/CoverExtractor';
import type { FileScanner } from './workers/FileScanner';
import type { MetadataReader } from './workers/MetadataReader';
import { TsCoverExtractor } from './workers/TsCoverExtractor';
import { TsFileScanner } from './workers/TsFileScanner';
import { TsMetadataReader } from './workers/TsMetadataReader';
import { getRemoteSourceService } from './remote/RemoteSourceService';
import { writeEmbeddedTrackTags } from './TagWriter';
import { backupPlaylistIfEnabled, type PlaylistBackupReason } from './PlaylistBackup';

type LibraryServiceDependencies = {
  fileScanner?: FileScanner;
  metadataReader?: MetadataReader;
  coverExtractor?: CoverExtractor;
  metadataService?: MetadataService;
  coverCacheDir?: string;
  appSettings?: () => AppSettings;
  metadataConcurrency?: number;
  coverConcurrency?: number;
  artistImageCacheDir?: string;
  artistImageProviders?: ArtistImageProvider[];
};

export class LibraryService {
  private artistsDirty = false;
  private groupingRefreshTimer: NodeJS.Timeout | null = null;
  private groupingRefreshQueued = false;

  constructor(
    private readonly store: LibraryStore,
    private readonly scanJobQueue: ScanJobQueue,
    private readonly albumService: AlbumService,
    private readonly database: EchoDatabase,
    private readonly closeDatabase: () => void,
    private readonly databasePath: string,
    private coverCacheDir: string,
    private readonly coverExtractor: CoverExtractor = new TsCoverExtractor(),
    private readonly metadataReader: MetadataReader = new TsMetadataReader(),
    private readonly networkMetadataService: NetworkMetadataService | null = null,
    private readonly bpmAnalysisJobQueue: BpmAnalysisJobQueue | null = null,
    private readonly artistImageCacheService: ArtistImageCacheService | null = null,
    private readonly readAppSettings: () => AppSettings = getAppSettingsSafe,
    private readonly scanConcurrency: ScanConcurrencyRecommendation = getRecommendedScanConcurrency(),
  ) {}

  addFolder(folderPath: string): LibraryFolder {
    const normalizedPath = resolve(folderPath);
    const pathStat = statSync(normalizedPath);

    if (!pathStat.isDirectory()) {
      throw new Error(`Library folder path is not a directory: ${normalizedPath}`);
    }

    return this.store.addFolder(normalizedPath);
  }

  getFolders(): LibraryFolder[] {
    return this.store.getFolders();
  }

  getFolderOverviews(): LibraryFolderOverview[] {
    return this.store.getFolderOverviews();
  }

  getFolderChildren(query: LibraryFolderChildrenQuery): LibraryFolderNode[] {
    return this.store.getFolderChildren(query);
  }

  getFolderTracks(query: LibraryFolderTracksQuery): LibraryPage<LibraryTrack> {
    return this.store.getFolderTracks(query);
  }

  resolveLibraryFolderPath(request: LibraryFolderPathRequest): string {
    return this.store.resolveLibraryFolderPath(request);
  }

  removeFolder(folderId: string): void {
    this.store.removeFolder(folderId);
  }

  scanFolder(folderId: string, options: LibraryScanOptions = {}): LibraryScanStatus {
    const folder = this.store.getFolder(folderId);

    if (!folder) {
      throw new Error(`Unknown library folder ${folderId}`);
    }

    const job = this.scanJobQueue.scanFolder(folder, options);
    if (this.readAppSettings().audioAnalysisEnabled) {
      void this.scanJobQueue.waitForIdle(job.id).then(() => {
        if (this.readAppSettings().audioAnalysisEnabled) {
          this.startBpmAnalysis({ limit: 500 });
        }
      }).catch(() => undefined);
    }

    return job;
  }

  rescanEmbeddedTags(mode: Exclude<NonNullable<LibraryScanOptions['mode']>, 'normal'>): LibraryScanStatus[] {
    const folders = this.getFolders();
    return folders.map((folder) => this.scanFolder(folder.id, { mode }));
  }

  getScanStatus(jobId: string): LibraryScanStatus {
    return this.scanJobQueue.getScanStatus(jobId);
  }

  cancelScan(jobId: string): LibraryScanStatus {
    return this.scanJobQueue.cancelScan(jobId);
  }

  getTracks(query?: LibraryPageQuery): LibraryPage<LibraryTrack> {
    return this.store.getTracks(query);
  }

  refreshDuplicateTracks(mode: DuplicateTrackMode = 'strict'): DuplicateTrackIndexSummary {
    return this.store.refreshDuplicateTracks(mode);
  }

  getDuplicateTrackGroup(trackId: string): DuplicateTrackGroup | null {
    return this.store.getDuplicateTrackGroup(trackId);
  }

  getDuplicateTrackVersions(trackId: string): DuplicateTrackMember[] {
    return this.store.getDuplicateTrackVersions(trackId);
  }

  getDuplicateHiddenCounts(trackIds: string[], mode: DuplicateTrackMode = 'strict'): Record<string, number> {
    return this.store.getDuplicateHiddenCounts(trackIds, mode);
  }

  getDuplicateIndexSummary(mode: DuplicateTrackMode = 'strict'): DuplicateTrackIndexSummary {
    return this.store.getDuplicateIndexSummary(mode);
  }

  getPlaylists(): LibraryPlaylist[] {
    return this.store.getPlaylists();
  }

  createPlaylist(request: CreatePlaylistRequest): LibraryPlaylist {
    return this.store.createPlaylist(request);
  }

  updatePlaylist(request: UpdatePlaylistRequest): LibraryPlaylist {
    return this.store.updatePlaylist(request);
  }

  async updatePlaylistArtwork(request: UpdatePlaylistRequest): Promise<LibraryPlaylist> {
    const coverPath = cleanNullableText(request.coverPath ?? null);

    if (!coverPath) {
      return this.updatePlaylist(request);
    }

    const coverData = readCoverImage(coverPath);
    const coverResult = await this.coverExtractor.extract(coverPath, {
      cacheRoot: this.coverCacheDir,
      metadata: metadataWithEmbeddedCover(coverData.data, coverData.mimeType),
    });
    const coverId = this.store.upsertCover({ ...coverResult, source: 'manual' });

    return this.store.updatePlaylist({
      ...request,
      coverId,
    });
  }

  deletePlaylist(playlistId: string): void {
    this.backupPlaylist(playlistId, 'delete');
    this.store.deletePlaylist(playlistId);
  }

  getPlaylist(playlistId: string): LibraryPlaylist | null {
    return this.store.getPlaylist(playlistId);
  }

  getPlaylistItems(playlistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search'>): LibraryPage<LibraryPlaylistItem> {
    return this.store.getPlaylistItems(playlistId, query);
  }

  addTrackToPlaylist(playlistId: string, trackId: string): LibraryPlaylistItem {
    return this.store.addTrackToPlaylist(playlistId, trackId);
  }

  addStreamingTrackToPlaylist(
    playlistId: string,
    track: Pick<LibraryTrack, 'id' | 'provider' | 'providerTrackId' | 'stableKey' | 'title' | 'artist' | 'album' | 'duration' | 'unavailable'>,
  ): LibraryPlaylistItem {
    return this.store.addStreamingTrackToPlaylist(playlistId, track);
  }

  addTracksToPlaylist(playlistId: string, trackIds: string[]): LibraryPlaylistItem[] {
    return this.store.addTracksToPlaylist(playlistId, trackIds);
  }

  removePlaylistItem(itemId: string): void {
    const item = this.store.getPlaylistItem(itemId);
    if (item) {
      this.backupPlaylist(item.playlistId, 'remove-item');
    }
    this.store.removePlaylistItem(itemId);
  }

  movePlaylistItem(playlistId: string, itemId: string, targetPosition: number): void {
    this.store.movePlaylistItem(playlistId, itemId, targetPosition);
  }

  clearPlaylist(playlistId: string): void {
    this.backupPlaylist(playlistId, 'clear');
    this.store.clearPlaylist(playlistId);
  }

  getLikedSongsPlaylist(): LibraryPlaylist {
    return this.store.getLikedSongsPlaylist();
  }

  getLikedAlbumsPlaylist(): LibraryPlaylist {
    return this.store.getLikedAlbumsPlaylist();
  }

  getLikedTracks(query?: LibraryPageQuery): LibraryPage<LibraryPlaylistItem> {
    return this.store.getLikedTracks(query);
  }

  getLikedAlbums(query?: LibraryPageQuery): LibraryPage<LibraryPlaylistItem> {
    return this.store.getLikedAlbums(query);
  }

  isTrackLiked(trackId: string): boolean {
    return this.store.isTrackLiked(trackId);
  }

  isAlbumLiked(albumId: string): boolean {
    return this.store.isAlbumLiked(albumId);
  }

  getLikedTrackIds(trackIds: string[]): Record<string, boolean> {
    return this.store.getLikedTrackIds(trackIds);
  }

  getLikedAlbumIds(albumIds: string[]): Record<string, boolean> {
    return this.store.getLikedAlbumIds(albumIds);
  }

  likeTrack(trackId: string): LibraryPlaylistItem {
    const localTrack = this.store.getTrack(trackId);
    if (localTrack) {
      return this.store.likeTrack(trackId);
    }

    const remoteTrack = getRemoteTrackSafe(trackId);
    if (!remoteTrack) {
      throw new Error(`Unknown track ${trackId}`);
    }

    return this.store.likeRemoteTrack(remoteTrack);
  }

  unlikeTrack(trackId: string): void {
    this.store.unlikeTrack(trackId);
  }

  toggleTrackLiked(trackId: string): { liked: boolean; item?: LibraryPlaylistItem } {
    return this.store.toggleTrackLiked(trackId);
  }

  likeAlbum(albumId: string): LibraryPlaylistItem {
    return this.store.likeAlbum(albumId);
  }

  unlikeAlbum(albumId: string): void {
    this.store.unlikeAlbum(albumId);
  }

  toggleAlbumLiked(albumId: string): { liked: boolean; item?: LibraryPlaylistItem } {
    return this.store.toggleAlbumLiked(albumId);
  }

  clearLikedTracks(): void {
    this.store.clearLikedTracks();
  }

  clearLikedAlbums(): void {
    this.store.clearLikedAlbums();
  }

  getAlbums(query?: LibraryPageQuery): LibraryPage<LibraryAlbum> {
    return this.store.getAlbums(query);
  }

  getAlbum(albumId: string): LibraryAlbumDetail | null {
    return this.store.getAlbum(albumId);
  }

  getAlbumForTrack(trackId: string): LibraryAlbum | null {
    return this.store.getAlbumForTrack(trackId);
  }

  getArtists(query?: LibraryPageQuery): LibraryPage<LibraryArtist> {
    this.refreshArtistsIfDirty();
    return this.store.getArtists(query);
  }

  getArtist(artistId: string): LibraryArtist | null {
    return this.store.getArtist(artistId);
  }

  getArtistTracks(artistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'sort'>): LibraryPage<LibraryTrack> {
    return this.store.getArtistTracks(artistId, query);
  }

  getArtistAlbums(artistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'sort'>): LibraryPage<LibraryAlbum> {
    return this.store.getArtistAlbums(artistId, query);
  }

  getArtistImage(artistIdOrKey: string): ArtistImageCacheEntry | null {
    if (!this.artistImageCacheService) {
      return null;
    }

    return this.artistImageCacheService.getArtistImage(artistIdOrKey);
  }

  getArtistImageCacheSummary(): ArtistImageCacheSummary {
    if (!this.artistImageCacheService) {
      return {
        total: 0,
        matched: 0,
        pending: 0,
        loading: 0,
        notFound: 0,
        error: 0,
        rateLimited: 0,
      };
    }

    return this.artistImageCacheService.getSummary();
  }

  enqueueMissingArtistImages(
    artists: ArtistImageLookupInput[] = [],
    options: { force?: boolean; limit?: number } = {},
  ): ArtistImageQueueResult {
    if (!this.artistImagesNetworkEnabled() || !this.artistImageCacheService) {
      return { queued: 0, skipped: artists.length, disabled: true };
    }

    return this.artistImageCacheService.enqueueMissingArtistImages(artists, options);
  }

  refreshVisibleArtistImages(artists: ArtistImageLookupInput[]): ArtistImageQueueResult {
    if (!this.artistImagesNetworkEnabled() || !this.artistImageCacheService) {
      return { queued: 0, skipped: artists.length, disabled: true };
    }

    return this.artistImageCacheService.refreshVisibleArtistImages(artists);
  }

  refreshArtistImage(artistIdOrKey: string, force = false): Promise<ArtistImageRefreshResult> {
    if (!this.artistImagesNetworkEnabled() || !this.artistImageCacheService) {
      return Promise.resolve({ queued: false, disabled: true, entry: this.getArtistImage(artistIdOrKey) });
    }

    return this.artistImageCacheService.refreshArtistImage(artistIdOrKey, force);
  }

  clearArtistImageCache(): ArtistImageCacheClearResult {
    if (!this.artistImageCacheService) {
      return { removedRows: 0, deletedFiles: 0, freedBytes: 0 };
    }

    return this.artistImageCacheService.clearCache();
  }

  getAlbumTracks(albumId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize'>): LibraryPage<LibraryTrack> {
    return this.store.getAlbumTracks(albumId, query);
  }

  getAllAlbumTracks(albumId: string): LibraryTrack[] {
    const tracks: LibraryTrack[] = [];
    let page = 1;
    const pageSize = 500;

    for (;;) {
      const result = this.store.getAlbumTracks(albumId, { page, pageSize });
      tracks.push(...result.items);
      if (!result.hasMore) {
        return tracks;
      }
      page += 1;
    }
  }

  getSummary(): LibrarySummary {
    return this.store.getSummary();
  }

  getDiagnostics(): LibraryDiagnostics {
    return this.store.getDiagnostics({
      databasePath: this.databasePath,
      databaseSizeBytes: pathSize(this.databasePath),
      coverCachePath: this.coverCacheDir,
      coverCacheSizeBytes: directorySize(this.coverCacheDir),
      cpuCount: this.scanConcurrency.cpuCount,
      scanPerformanceMode: this.scanConcurrency.mode === 'custom' ? 'balanced' : this.scanConcurrency.mode,
      metadataConcurrency: this.scanConcurrency.metadataConcurrency,
      coverConcurrency: this.scanConcurrency.coverConcurrency,
      audioAnalysisEnabled: this.readAppSettings().audioAnalysisEnabled,
    });
  }

  resolveCoverAsset(coverId: string, variant: CoverVariant): { filePath: string; mimeType: string | null } | null {
    return this.store.resolveCoverAsset(coverId, variant);
  }

  resolveArtistImageAsset(
    artistKey: string,
    variant: 'thumb' | 'medium' | 'large',
  ): { filePath: string; mimeType: string | null } | null {
    return this.artistImageCacheService?.resolveAsset(artistKey, variant) ?? null;
  }

  getTrack(trackId: string): LibraryTrack | null {
    const localTrack = this.store.getTrack(trackId);
    if (localTrack) {
      return localTrack;
    }

    try {
      return getRemoteSourceService().getTrackAsLibraryTrack(trackId);
    } catch {
      return null;
    }
  }

  getTrackByPath(filePath: string): LibraryTrack | null {
    return this.store.getTrackByPath(filePath);
  }

  async importAudioFile(
    filePath: string,
    options: {
      folderPath?: string;
      metadata?: Partial<Pick<EditableTrackTags, 'title' | 'artist' | 'album' | 'albumArtist'>>;
      coverUrl?: string | null;
    } = {},
  ): Promise<LibraryTrack> {
    const normalizedPath = await getNcmConverter().convertIfNeeded(resolve(filePath));

    if (!existsSync(normalizedPath)) {
      throw new Error(`Track file is missing: ${normalizedPath}`);
    }

    const initialFileStat = statSync(normalizedPath);
    if (!initialFileStat.isFile()) {
      throw new Error(`Track path is not a file: ${normalizedPath}`);
    }

    const folder = this.store.addFolder(resolve(options.folderPath ?? dirname(normalizedPath)));
    const metadata = await this.metadataReader.read(normalizedPath);
    const metadataOverrides = {
      title: cleanNullableText(options.metadata?.title ?? null) ?? undefined,
      artist: cleanNullableText(options.metadata?.artist ?? null) ?? undefined,
      album: cleanNullableText(options.metadata?.album ?? null) ?? undefined,
      albumArtist: cleanNullableText(options.metadata?.albumArtist ?? null) ?? undefined,
    };
    const metadataFields = {
      ...metadata.fields,
      ...Object.fromEntries(Object.entries(metadataOverrides).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    };
    const fieldSources: MetadataResult['fieldSources'] = {
      ...metadata.fieldSources,
      ...Object.fromEntries(Object.keys(metadataOverrides).filter((key) => metadataOverrides[key as keyof typeof metadataOverrides]).map((key) => [key, 'technical'])),
    };
    let coverId: string | null = null;
    let coverErrors: string[] = [];
    const coverUrl = cleanNullableText(options.coverUrl ?? null);
    const coverData = coverUrl ? await readCoverImageFromUrl(coverUrl, null).catch(() => null) : null;
    const hasMetadataOverrides = hasImportMetadataOverrides(metadataOverrides);
    const embeddedWriteErrors = await writeImportedEmbeddedTags(normalizedPath, metadataFields, coverData, hasMetadataOverrides || Boolean(coverData));
    const fileStat = statSync(normalizedPath);

    try {
      const cover = await this.coverExtractor.extract(normalizedPath, {
        cacheRoot: this.coverCacheDir,
        metadata: coverData ? metadataWithEmbeddedCover(coverData.data, coverData.mimeType) : metadata,
      });
      coverId = this.store.upsertCover(cover);
      coverErrors = cover.errors;
    } catch (error) {
      coverErrors = [error instanceof Error ? error.message : String(error)];
    }

    const timestamp = new Date().toISOString();
    const trackId = randomUUID();

    return this.store.transaction(() => {
      this.store.upsertTrack({
        path: normalizedPath,
        folderId: folder.id,
        sizeBytes: fileStat.size,
        mtimeMs: Math.round(fileStat.mtimeMs),
        ...metadataFields,
        id: trackId,
        coverId,
        fieldSources,
        embeddedMetadataStatus: hasMetadataOverrides ? 'present' : metadata.embeddedMetadataStatus,
        embeddedCoverStatus: coverData ? 'present' : metadata.embeddedCoverStatus,
        metadataStatus: metadata.status,
        warnings: metadata.warnings,
        errors: [...metadata.errors, ...embeddedWriteErrors, ...coverErrors],
        updatedAt: timestamp,
      });
      this.store.refreshAlbums(this.albumService, timestamp, this.albumRefreshOptions());
      this.store.refreshArtists();

      const track = this.store.getTrack(trackId) ?? this.store.getTrackByPath(normalizedPath);
      if (!track) {
        throw new Error(`Failed to import audio file: ${normalizedPath}`);
      }

      if (this.readAppSettings().audioAnalysisEnabled) {
        this.startBpmAnalysis({ trackIds: [track.id], force: true });
      }

      return track;
    });
  }

  recordTrackPlayback(trackId: string): void {
    this.store.recordTrackPlayback(trackId);
  }

  startPlaybackHistory(request: StartPlaybackHistoryRequest): StartPlaybackHistoryResult {
    const track = request.trackId ? this.store.getTrack(request.trackId) : null;

    if (!track) {
      const remoteTrack = request.trackId ? getRemoteTrackSafe(request.trackId) : null;
      if (!remoteTrack) {
        if (!request.trackPath || !request.title || !request.artist) {
          throw new Error(`Unknown track ${request.trackId ?? 'snapshot'}`);
        }

        const entry = this.store.createPlaybackHistoryEntry({
          trackId: request.trackId ?? null,
          trackPath: request.trackPath,
          mediaType: request.mediaType ?? 'local',
          provider: request.provider,
          providerTrackId: request.providerTrackId,
          stableKey: request.stableKey,
          title: request.title,
          artist: request.artist,
          album: request.album ?? '',
          albumArtist: request.albumArtist ?? request.artist,
          coverId: request.coverId ?? null,
          coverSnapshot: request.mediaType === 'streaming' ? request.coverSnapshot ?? null : null,
          durationSeconds: request.durationSeconds ?? 0,
          durationSnapshot: request.durationSeconds ?? null,
          sourceType: request.sourceType ?? request.mediaType ?? null,
          sourceLabel: request.sourceLabel,
          queueId: request.queueId,
        });

        return { historyId: entry.id };
      }

      const entry = this.store.createPlaybackHistoryEntry({
        trackId: remoteTrack.id,
        trackPath: remoteTrack.path,
        mediaType: 'remote',
        provider: remoteTrack.provider,
        stableKey: remoteTrack.stableKey,
        title: remoteTrack.title,
        artist: remoteTrack.artist,
        album: remoteTrack.album,
        albumArtist: remoteTrack.albumArtist,
        coverId: remoteTrack.coverId,
        durationSeconds: remoteTrack.duration,
        sourceType: request.sourceType ?? 'remote',
        sourceLabel: request.sourceLabel,
        queueId: request.queueId,
      });

      return { historyId: entry.id };
    }

    if (!track) {
      throw new Error(`Unknown track ${request.trackId}`);
    }

    const entry = this.store.createPlaybackHistoryEntry({
      trackId: track.id,
      trackPath: track.path,
      mediaType: track.mediaType ?? 'local',
      provider: track.provider,
      providerTrackId: track.providerTrackId,
      stableKey: track.stableKey,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      coverId: track.coverId,
      durationSeconds: track.duration,
      sourceType: request.sourceType,
      sourceLabel: request.sourceLabel,
      queueId: request.queueId,
    });

    return { historyId: entry.id };
  }

  finishPlaybackHistory(request: FinishPlaybackHistoryRequest): PlaybackHistoryEntry | null {
    return this.store.finishPlaybackHistoryEntry(request.historyId, {
      playedSeconds: request.playedSeconds,
      durationSeconds: request.durationSeconds,
      completed: request.completed,
      endedAt: request.endedAt,
    });
  }

  getPlaybackHistory(query?: PlaybackHistoryQuery): LibraryPage<PlaybackHistoryEntry> {
    return this.store.getPlaybackHistory(query);
  }

  getPlaybackHistorySummary(): PlaybackHistorySummary {
    return this.store.getPlaybackHistorySummary();
  }

  deletePlaybackHistoryEntry(id: string): void {
    this.store.deletePlaybackHistoryEntry(id);
  }

  clearPlaybackHistory(): void {
    this.store.clearPlaybackHistory();
  }

  refreshAlbumGrouping(): LibrarySummary {
    if (this.hasRunningJobs()) {
      throw new Error('Cannot refresh album grouping while a library scan is running.');
    }

    return this.store.transaction(() => {
      this.store.refreshAlbums(this.albumService, new Date().toISOString(), this.albumRefreshOptions());
      this.store.refreshArtists();
      return this.store.getSummary();
    });
  }

  async loadEmbeddedTrackTags(trackId: string): Promise<EmbeddedTrackTagsLoadResult> {
    const currentTrack = this.store.getTrack(trackId);

    if (!currentTrack) {
      throw new Error(`Unknown track ${trackId}`);
    }

    if (!existsSync(currentTrack.path)) {
      throw new Error(`Track file is missing: ${currentTrack.path}`);
    }

    const metadata = await this.metadataReader.read(currentTrack.path);
    let coverId = currentTrack.coverId;

    if (metadata.embeddedCover) {
      const coverResult = await this.coverExtractor.extract(currentTrack.path, {
        cacheRoot: this.coverCacheDir,
        metadata,
      });
      coverId = this.store.transaction(() => {
        const nextCoverId = this.store.upsertCover({ ...coverResult, source: 'embedded' });
        this.store.updateTrackCover(trackId, nextCoverId);
        this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
        return nextCoverId;
      });
    }

    return {
      tags: {
        title: metadata.fields.title,
        artist: metadata.fields.artist,
        album: metadata.fields.album,
        albumArtist: metadata.fields.albumArtist,
        trackNo: metadata.fields.trackNo,
        discNo: metadata.fields.discNo,
        year: metadata.fields.year,
        genre: metadata.fields.genre,
      },
      coverId,
      coverThumb: coverId ? `echo-cover://thumb/${encodeURIComponent(coverId)}` : null,
    };
  }

  async updateTrackTags(request: LibraryTrackTagUpdateRequest): Promise<LibraryTrack> {
    const currentTrack = this.store.getTrack(request.trackId);

    if (!currentTrack) {
      throw new Error(`Unknown track ${request.trackId}`);
    }

    if (!existsSync(currentTrack.path)) {
      throw new Error(`Track file is missing: ${currentTrack.path}`);
    }

    const tags = normalizeEditableTags(request.tags, currentTrack);
    const coverPath = cleanNullableText(request.coverPath ?? null);
    const coverUrl = cleanNullableText(request.coverUrl ?? null);
    let coverData: { data: Uint8Array; mimeType: string } | null = null;
    if (coverPath) {
      coverData = readCoverImage(coverPath);
    } else if (coverUrl) {
      // Network cover failures should not block confirmed text tag edits.
      coverData = await readCoverImageFromUrl(coverUrl, request.coverMimeType ?? null).catch(() => null);
    }

    const fileStat = statSync(currentTrack.path);
    const fieldSources = {
      ...currentTrack.fieldSources,
      title: 'manual',
      artist: 'manual',
      album: 'manual',
      albumArtist: 'manual',
      trackNo: 'manual',
      discNo: 'manual',
      year: 'manual',
      genre: 'manual',
    };

    let manualCoverId: string | null | undefined;
    if (coverData) {
      const coverResult = await this.coverExtractor.extract(currentTrack.path, {
        cacheRoot: this.coverCacheDir,
        metadata: metadataWithEmbeddedCover(coverData.data, coverData.mimeType),
      });
      manualCoverId = this.store.upsertCover({ ...coverResult, source: coverUrl && !coverPath ? 'network' : 'manual' });
    }

    const updatedTrack = this.store.transaction(() => {
      const updated = this.store.updateTrackTags(request.trackId, {
        ...tags,
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        fieldSources,
      });
      if (manualCoverId !== undefined) {
        this.store.updateTrackCover(request.trackId, manualCoverId);
      }
      return manualCoverId !== undefined ? this.store.getTrack(request.trackId) ?? updated : updated;
    });

    this.scheduleEmbeddedTagWrite({
      trackId: request.trackId,
      filePath: currentTrack.path,
      tags,
      coverData,
      errorPrefix: 'Failed to write embedded tags',
    });
    this.scheduleGroupingRefresh();

    return updatedTrack;
  }

  async updateAlbumTags(request: LibraryAlbumTagUpdateRequest): Promise<LibraryAlbum> {
    const album = this.store.getAlbum(request.albumId);

    if (!album) {
      throw new Error(`Unknown album ${request.albumId}`);
    }

    const tracks = this.getAllAlbumTracks(request.albumId);
    if (tracks.length === 0) {
      throw new Error(`Album has no active tracks: ${album.title}`);
    }

    const missingTrack = tracks.find((track) => !existsSync(track.path));
    if (missingTrack) {
      throw new Error(`Track file is missing: ${missingTrack.path}`);
    }

    const tags = normalizeEditableAlbumTags(request.tags, album);
    const coverPath = cleanNullableText(request.coverPath ?? null);
    const coverUrl = cleanNullableText(request.coverUrl ?? null);
    let coverData: { data: Uint8Array; mimeType: string } | null = null;
    if (coverPath) {
      coverData = readCoverImage(coverPath);
    } else if (coverUrl) {
      // Network cover failures should not block confirmed text tag edits.
      coverData = await readCoverImageFromUrl(coverUrl, request.coverMimeType ?? null).catch(() => null);
    }

    const updates: Array<{
      track: LibraryTrack;
      sizeBytes: number;
      mtimeMs: number;
      fieldSources: Record<string, string>;
      coverId?: string | null;
    }> = [];

    for (const track of tracks) {
      const fileStat = statSync(track.path);
      const fieldSources = {
        ...track.fieldSources,
        album: 'manual',
        albumArtist: 'manual',
        year: 'manual',
        genre: 'manual',
      };

      let coverId: string | null | undefined;
      if (coverData) {
        const coverResult = await this.coverExtractor.extract(track.path, {
          cacheRoot: this.coverCacheDir,
          metadata: metadataWithEmbeddedCover(coverData.data, coverData.mimeType),
        });
        coverId = this.store.upsertCover({ ...coverResult, source: coverUrl && !coverPath ? 'network' : 'manual' });
      }

      updates.push({
        track,
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        fieldSources,
        coverId,
      });
    }

    const nextAlbum = this.store.transaction(() => {
      for (const update of updates) {
        this.store.updateTrackTags(update.track.id, {
          title: update.track.title,
          artist: update.track.artist,
          album: tags.album,
          albumArtist: tags.albumArtist,
          trackNo: update.track.trackNo,
          discNo: update.track.discNo,
          year: tags.year,
          genre: tags.genre,
          sizeBytes: update.sizeBytes,
          mtimeMs: update.mtimeMs,
          fieldSources: update.fieldSources,
        });
        if (update.coverId !== undefined) {
          this.store.updateTrackCover(update.track.id, update.coverId);
        }
      }

      const nextAlbum = this.store.getAlbumForTrack(tracks[0]!.id);
      if (!nextAlbum) {
        throw new Error(`Album update completed but refreshed album could not be found for ${album.title}`);
      }
      return nextAlbum;
    });

    for (const update of updates) {
      this.scheduleEmbeddedTagWrite({
        trackId: update.track.id,
        filePath: update.track.path,
        coverData,
        tags: {
          title: update.track.title,
          artist: update.track.artist,
          album: tags.album,
          albumArtist: tags.albumArtist,
          trackNo: update.track.trackNo,
          discNo: update.track.discNo,
          year: tags.year,
          genre: tags.genre,
        },
        errorPrefix: 'Failed to write album tags',
      });
    }
    this.scheduleGroupingRefresh();

    return nextAlbum;
  }

  async repairMissingMetadata(trackId: string, providerNames?: AppSettings['networkMetadataProviders']): Promise<NetworkRepairResult> {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.repairMissingMetadata(trackId, providerNames);
  }

  async scanMissingMetadata(
    limit: number,
    providerNames?: AppSettings['networkMetadataProviders'],
    fields?: MissingMetadataField[],
  ): Promise<MissingMetadataScanResult> {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.scanMissingMetadata(limit, providerNames, fields);
  }

  startMissingMetadataScan(
    limit: number,
    providerNames?: AppSettings['networkMetadataProviders'],
    fields?: MissingMetadataField[],
  ): NetworkMetadataScanJobStatus {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.startMissingMetadataScan(limit, providerNames, fields);
  }

  getMissingMetadataScanStatus(jobId: string): NetworkMetadataScanJobStatus {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.getMissingMetadataScanStatus(jobId);
  }

  showNetworkCandidates(trackId: string): NetworkCandidateList {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.showCandidates(trackId);
  }

  async searchNetworkTagCandidates(request: NetworkTagCandidateSearchRequest): Promise<NetworkTagCandidate[]> {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.searchNetworkTagCandidates(request);
  }

  applyNetworkMissingOnly(candidateId: string, options?: NetworkApplyOptions): NetworkApplyResult {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.applyMissingOnly(candidateId, options);
  }

  async applyNetworkSelected(candidateId: string, options?: NetworkApplyOptions): Promise<NetworkApplyResult> {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    const candidate = this.networkMetadataService.getMetadataCandidate(candidateId);
    const result = this.networkMetadataService.applySelected(candidateId, options);
    if (!candidate?.coverUrl || (options?.fields?.length && !options.fields.includes('cover'))) {
      return result;
    }

    const track = this.store.getTrack(candidate.trackId);
    if (!track || track.coverId || track.embeddedCoverStatus === 'present' || track.embeddedCoverStatus === 'pending' || track.embeddedCoverStatus === 'reading') {
      return result;
    }

    const coverData = await readCoverImageFromUrl(candidate.coverUrl, null).catch(() => null);
    if (!coverData) {
      return result;
    }

    const coverResult = await this.coverExtractor.extract(track.path, {
      cacheRoot: this.coverCacheDir,
      metadata: metadataWithEmbeddedCover(coverData.data, coverData.mimeType),
    });
    const coverId = this.store.transaction(() => {
      const nextCoverId = this.store.upsertCover({ ...coverResult, source: 'network' });
      this.store.updateTrackCover(track.id, nextCoverId);
      this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
      return nextCoverId;
    });

    return {
      ...result,
      appliedFields: {
        ...result.appliedFields,
        coverId,
      },
    };
  }

  rejectNetworkCandidate(candidateId: string): NetworkApplyResult {
    if (!this.networkMetadataService) {
      throw new Error('Network metadata service is unavailable');
    }

    return this.networkMetadataService.reject(candidateId);
  }

  deleteTrack(trackId: string): void {
    this.store.transaction(() => {
      this.store.deleteTrackAndCompactAlbums(trackId);
    });
    this.artistsDirty = true;
  }

  deleteAlbumTracks(albumId: string): number {
    const tracks = this.getAllAlbumTracks(albumId);
    const trackIds = tracks.map((track) => track.id);

    if (trackIds.length === 0) {
      return 0;
    }

    return this.store.transaction(() => {
      const changed = this.store.deleteTracks(trackIds);
      if (changed > 0) {
        this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
        this.store.refreshArtists();
      }
      return changed;
    });
  }

  pruneMissingTracks(): LibraryCleanupResult {
    const tracks = this.store.getActiveTracks();
    const missingTrackIds = tracks.filter((track) => !existsSync(track.path)).map((track) => track.id);

    const removedCount = this.store.transaction(() => {
      const changed = this.store.deleteTracks(missingTrackIds);
      if (changed > 0) {
        this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
        this.store.refreshArtists();
      }
      return changed;
    });

    return {
      scannedCount: tracks.length,
      removedCount,
    };
  }

  async pruneInvalidTracks(shortDurationThresholdSeconds = 5): Promise<LibraryMaintenanceCleanupResult> {
    const tracks = this.store.getActiveTracks();
    const missingTrackIds: string[] = [];
    const shortTrackIds: string[] = [];
    const normalizedShortDurationThresholdSeconds = Math.max(0, shortDurationThresholdSeconds);

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];

      if (!existsSync(track.path)) {
        missingTrackIds.push(track.id);
      } else if (track.duration > 0 && track.duration <= normalizedShortDurationThresholdSeconds) {
        shortTrackIds.push(track.id);
      }

      if (index % 100 === 99) {
        await yieldToMainLoop();
      }
    }

    const trackIds = Array.from(new Set([...missingTrackIds, ...shortTrackIds]));
    const removedCount = this.store.transaction(() => {
      const changed = this.store.deleteTracks(trackIds);
      if (changed > 0) {
        this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
        this.store.refreshArtists();
      }
      return changed;
    });

    return {
      scannedCount: tracks.length,
      removedCount,
      missingRemovedCount: missingTrackIds.length,
      shortRemovedCount: shortTrackIds.length,
      shortDurationThresholdSeconds: normalizedShortDurationThresholdSeconds,
    };
  }

  clearTracks(): LibraryCleanupResult {
    const scannedCount = this.store.getTracks({ pageSize: 1 }).total;
    const removedCount = this.store.transaction(() => this.store.deleteAllTracks());

    return {
      scannedCount,
      removedCount,
    };
  }

  clearCache(): LibraryCacheClearResult {
    if (this.hasRunningJobs()) {
      throw new Error('Cannot clear library cache while a library scan is running.');
    }

    const scannedCount = this.store.getTracks({ pageSize: 1 }).total;
    const cacheStats = directoryStats(this.coverCacheDir);
    const removedCount = this.store.deleteLibraryCache();
    clearDirectoryContents(this.coverCacheDir);

    return {
      scannedCount,
      removedCount,
      deletedCoverCacheFiles: cacheStats.fileCount,
      freedCoverCacheBytes: cacheStats.sizeBytes,
    };
  }

  async waitForScan(jobId: string): Promise<void> {
    await this.scanJobQueue.waitForIdle(jobId);
  }

  hasRunningJobs(): boolean {
    return this.scanJobQueue.hasRunningJobs();
  }

  getCoverCacheDir(): string {
    return this.coverCacheDir;
  }

  startBpmAnalysis(options: BpmAnalysisStartOptions = {}): BpmAnalysisJobStatus {
    if (!this.bpmAnalysisJobQueue) {
      throw new Error('BPM analysis service is unavailable');
    }
    return this.bpmAnalysisJobQueue.start(options);
  }

  getBpmAnalysisStatus(jobId: string): BpmAnalysisJobStatus {
    if (!this.bpmAnalysisJobQueue) {
      throw new Error('BPM analysis service is unavailable');
    }
    return this.bpmAnalysisJobQueue.getStatus(jobId);
  }

  getDefaultCoverCacheDir(): string {
    return getDefaultCoverCacheDir(this.databasePath);
  }

  setCoverCacheDir(coverCacheDir: string): void {
    this.coverCacheDir = resolve(coverCacheDir);
    this.scanJobQueue.updateCoverCacheDir(this.coverCacheDir);
  }

  async migrateCoverCacheDir(newDir: string): Promise<CoverCacheMigrationResult> {
    return migrateCoverCache({
      oldDir: this.coverCacheDir,
      newDir,
      updateCoverPaths: (oldDir, targetDir, warnings) => this.store.updateCoverCachePaths(oldDir, targetDir, warnings),
    });
  }

  close(): void {
    this.closeDatabase();
  }

  private albumRefreshOptions(): { albumMergeStrategy: AlbumMergeStrategy } {
    return { albumMergeStrategy: this.readAppSettings().albumMergeStrategy };
  }

  private refreshArtistsIfDirty(): void {
    if (!this.artistsDirty) {
      return;
    }

    this.store.refreshArtists();
    this.artistsDirty = false;
  }

  private artistImagesNetworkEnabled(): boolean {
    return this.readAppSettings().autoFetchArtistImages === true;
  }

  private backupPlaylist(playlistId: string, reason: PlaylistBackupReason): void {
    backupPlaylistIfEnabled(this.database, playlistId, reason, this.readAppSettings);
  }

  private scheduleGroupingRefresh(): void {
    this.groupingRefreshQueued = true;
    this.artistsDirty = true;

    if (this.groupingRefreshTimer) {
      return;
    }

    this.groupingRefreshTimer = setTimeout(() => {
      this.groupingRefreshTimer = null;
      if (!this.groupingRefreshQueued) {
        return;
      }

      this.groupingRefreshQueued = false;
      try {
        this.store.transaction(() => {
          this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
          this.store.refreshArtists();
        });
        this.artistsDirty = false;
      } catch {
        this.artistsDirty = true;
      }
    }, 1000);
  }

  private scheduleEmbeddedTagWrite(request: {
    trackId: string;
    filePath: string;
    tags: EditableTrackTags;
    coverData: { data: Uint8Array; mimeType: string } | null;
    errorPrefix: string;
  }): void {
    const attemptWrite = async (): Promise<void> => {
      if (await isFileActiveInAudioSession(request.filePath)) {
        setTimeout(() => {
          void attemptWrite();
        }, 5000);
        return;
      }

      try {
        await writeEmbeddedTrackTags({
          filePath: request.filePath,
          tags: request.tags,
          coverData: request.coverData,
        });
        this.syncTrackFileStat(request.trackId);
      } catch (error) {
        console.warn(`${request.errorPrefix} for ${request.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    setTimeout(() => {
      void attemptWrite();
    }, 250);
  }

  private syncTrackFileStat(trackId: string): void {
    const track = this.store.getTrack(trackId);
    if (!track || !existsSync(track.path)) {
      return;
    }

    const fileStat = statSync(track.path);
    this.store.updateTrackTags(track.id, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      trackNo: track.trackNo,
      discNo: track.discNo,
      year: track.year,
      genre: track.genre,
      sizeBytes: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      fieldSources: track.fieldSources,
    });
  }
}

const isFileActiveInAudioSession = async (filePath: string): Promise<boolean> => {
  try {
    const { getAudioSession } = await import('../audio/AudioSession');
    const status = getAudioSession().getStatus();
    return resolve(status.currentFilePath ?? '') === resolve(filePath) && status.state !== 'idle' && status.state !== 'stopped' && status.state !== 'error';
  } catch {
    return false;
  }
};

export const createLibraryService = (
  databasePath: string,
  dependencies: LibraryServiceDependencies = {},
): LibraryService => {
  const database = createDatabase(databasePath);
  const readSettings = dependencies.appSettings ?? getAppSettingsSafe;
  const store = new LibraryStore(database, () => ({
    chineseCrossScriptSearchEnabled: readSettings().chineseCrossScriptSearchEnabled !== false,
  }));
  const fileScanner = dependencies.fileScanner ?? new TsFileScanner();
  const metadataReader =
    dependencies.metadataReader ??
    (dependencies.metadataService
      ? {
          read: async (filePath: string) =>
            inflateMetadataResult(
              await dependencies.metadataService!.read({
                path: filePath,
                folderId: '',
                sizeBytes: 0,
                mtimeMs: 0,
              }),
            ),
        }
      : new TsMetadataReader());
  const coverExtractor = dependencies.coverExtractor ?? new TsCoverExtractor();
  const coverCacheDir = dependencies.coverCacheDir
    ? resolveCoverCacheDir(databasePath, dependencies.coverCacheDir)
    : resolveConfiguredCoverCacheDir(databasePath, (dependencies.appSettings ?? getAppSettingsSafe)());
  const albumService = new AlbumService();
  const appSettings = readSettings();
  const recommendedScanConcurrency = getRecommendedScanConcurrency({
    mode: appSettings.scanPerformanceMode ?? 'balanced',
  });
  const scanConcurrency: ScanConcurrencyRecommendation = {
    ...recommendedScanConcurrency,
    metadataConcurrency: dependencies.metadataConcurrency ?? recommendedScanConcurrency.metadataConcurrency,
    coverConcurrency: dependencies.coverConcurrency ?? recommendedScanConcurrency.coverConcurrency,
  };
  const scanJobQueue = new ScanJobQueue(store, fileScanner, metadataReader, coverExtractor, albumService, {
    coverCacheDir,
    metadataConcurrency: scanConcurrency.metadataConcurrency,
    coverConcurrency: scanConcurrency.coverConcurrency,
    getAlbumMergeStrategy: () => readSettings().albumMergeStrategy,
  });

  const networkMetadataService = new NetworkMetadataService(database);
  const bpmAnalysisJobQueue = new BpmAnalysisJobQueue(store);
  const artistImageCacheDir = resolve(dependencies.artistImageCacheDir ?? join(dirname(databasePath), 'artist-images'));
  const artistImageCacheService = new ArtistImageCacheService(database, {
    cacheRoot: artistImageCacheDir,
    providers: dependencies.artistImageProviders,
    onUpdated: (payload) => {
      const windows = (electron as unknown as {
        BrowserWindow?: {
          getAllWindows: () => Array<{ webContents: { send: (channel: string, payload: unknown) => void } }>;
        };
      }).BrowserWindow?.getAllWindows() ?? [];

      for (const window of windows) {
        window.webContents.send(IpcChannels.LibraryArtistImagesUpdated, payload);
      }
    },
  });

  return new LibraryService(
    store,
    scanJobQueue,
    albumService,
    database,
    () => database.close(),
    databasePath,
    coverCacheDir,
    coverExtractor,
    metadataReader,
    networkMetadataService,
    bpmAnalysisJobQueue,
    artistImageCacheService,
    readSettings,
    scanConcurrency,
  );
};

let defaultLibraryService: LibraryService | null = null;

export const getLibraryService = (): LibraryService => {
  if (!defaultLibraryService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;

    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultLibraryService = createLibraryService(join(electronApp.getPath('userData'), 'echo-library.sqlite'));
  }

  return defaultLibraryService;
};

const pathSize = (targetPath: string): number | null => {
  try {
    return existsSync(targetPath) ? statSync(targetPath).size : null;
  } catch {
    return null;
  }
};

const cleanText = (value: string, fallback = ''): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const cleanNullableText = (value: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mimeTypeForImagePath = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLocaleLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      throw new Error(`Unsupported cover image type: ${filePath}`);
  }
};

const readCoverImage = (filePath: string): { data: Uint8Array; mimeType: string } => {
  const normalizedPath = resolve(filePath);

  if (!existsSync(normalizedPath)) {
    throw new Error(`Cover image is missing: ${normalizedPath}`);
  }

  return {
    data: readFileSync(normalizedPath),
    mimeType: mimeTypeForImagePath(normalizedPath),
  };
};

const hasImportMetadataOverrides = (metadata: {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
}): boolean => Object.values(metadata).some((value) => typeof value === 'string' && value.trim().length > 0);

const writeImportedEmbeddedTags = async (
  filePath: string,
  fields: MetadataResult['fields'],
  coverData: { data: Uint8Array; mimeType: string } | null,
  shouldWrite: boolean,
): Promise<string[]> => {
  if (!shouldWrite) {
    return [];
  }

  try {
    await writeEmbeddedTrackTags({
      filePath,
      coverData,
      tags: {
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        albumArtist: fields.albumArtist,
        trackNo: fields.trackNo,
        discNo: fields.discNo,
        year: fields.year,
        genre: fields.genre,
      },
    });
    return [];
  } catch (error) {
    return [`Failed to write imported embedded tags for ${filePath}: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const supportedImageMimeType = (value: string | null | undefined): string | null => {
  const normalized = value?.split(';')[0]?.trim().toLocaleLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp' ? normalized : null;
};

const mimeTypeForImageUrl = (url: string): string => {
  const path = new URL(url).pathname;
  return mimeTypeForImagePath(path);
};

const readCoverImageFromUrl = async (url: string, mimeTypeHint: string | null): Promise<{ data: Uint8Array; mimeType: string }> => {
  let coverUrl = url;
  let referer = 'https://www.bilibili.com/';
  if (url.startsWith('echo-image://remote/')) {
    const proxied = new URL(url);
    coverUrl = decodeURIComponent(proxied.pathname.replace(/^\/+/u, ''));
    referer = proxied.searchParams.get('referer') ?? referer;
  }

  let response: Response;
  try {
    response = await fetch(coverUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
        Referer: referer,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
  } catch (error) {
    throw new Error(`封面下载失败，但标签信息仍可应用。${error instanceof Error ? ` ${error.message}` : ''}`);
  }

  if (!response.ok) {
    throw new Error('封面下载失败，但标签信息仍可应用。');
  }

  const contentType = response.headers.get('content-type');
  const mimeType = supportedImageMimeType(mimeTypeHint) ?? supportedImageMimeType(contentType) ?? mimeTypeForImageUrl(coverUrl);
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mimeType,
  };
};

const getAppSettingsSafe = (): AppSettings => {
  try {
    return getAppSettings();
  } catch {
    return { ...defaultSettings };
  }
};

const getRemoteTrackSafe = (trackId: string): LibraryTrack | null => {
  try {
    return getRemoteSourceService().getTrackAsLibraryTrack(trackId);
  } catch {
    return null;
  }
};

const metadataWithEmbeddedCover = (data: Uint8Array, mimeType: string): MetadataResult =>
  ({
    fields: {
      title: '',
      artist: '',
      album: '',
      albumArtist: '',
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: 0,
      codec: null,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      bpm: null,
    },
    fieldSources: {},
    embeddedCover: { data, mimeType },
    embeddedMetadataStatus: 'missing',
    embeddedCoverStatus: 'present',
    warnings: [],
    errors: [],
    status: 'ok',
  }) satisfies MetadataResult;

const cleanNullableNumber = (value: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
};

const normalizeEditableTags = (tags: EditableTrackTags, previous: LibraryTrack): EditableTrackTags => {
  const title = cleanText(tags.title, previous.title || 'Untitled');
  const artist = cleanText(tags.artist, previous.artist || 'Unknown Artist');

  return {
    title,
    artist,
    album: cleanText(tags.album),
    albumArtist: cleanText(tags.albumArtist, artist),
    trackNo: cleanNullableNumber(tags.trackNo),
    discNo: cleanNullableNumber(tags.discNo),
    year: cleanNullableNumber(tags.year),
    genre: cleanNullableText(tags.genre),
  };
};

const normalizeEditableAlbumTags = (tags: EditableAlbumTags, previous: LibraryAlbum): EditableAlbumTags => ({
  album: cleanText(tags.album, previous.title || 'Untitled Album'),
  albumArtist: cleanText(tags.albumArtist, previous.albumArtist || 'Unknown Artist'),
  year: cleanNullableNumber(tags.year),
  genre: cleanNullableText(tags.genre),
});

const directorySize = (targetPath: string): number | null => {
  if (!existsSync(targetPath)) {
    return null;
  }

  let total = 0;
  const pending = [targetPath];

  try {
    while (pending.length) {
      const current = pending.pop()!;
      const stat = statSync(current);

      if (stat.isDirectory()) {
        for (const entry of readdirSync(current)) {
          pending.push(join(current, entry));
        }
      } else {
        total += stat.size;
      }
    }
  } catch {
    return null;
  }

  return total;
};

const directoryStats = (targetPath: string): { fileCount: number; sizeBytes: number } => {
  if (!existsSync(targetPath)) {
    return { fileCount: 0, sizeBytes: 0 };
  }

  let fileCount = 0;
  let sizeBytes = 0;
  const pending = [targetPath];

  while (pending.length) {
    const current = pending.pop()!;
    const stat = statSync(current);

    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        pending.push(join(current, entry));
      }
    } else {
      fileCount += 1;
      sizeBytes += stat.size;
    }
  }

  return { fileCount, sizeBytes };
};

const clearDirectoryContents = (targetPath: string): void => {
  mkdirSync(targetPath, { recursive: true });

  for (const entry of readdirSync(targetPath)) {
    rmSync(join(targetPath, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
};
