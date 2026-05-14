import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import electron from 'electron';
import { applyCoverArt, applyTags } from 'taglib-wasm';
import { defaultSettings, getAppSettings } from '../app/appSettings';
import { createDatabase } from '../database/createDatabase';
import { AlbumService } from './AlbumService';
import type { AlbumMergeStrategy } from './AlbumService';
import { getDefaultCoverCacheDir, migrateCoverCache, resolveConfiguredCoverCacheDir, resolveCoverCacheDir } from './CoverCacheManager';
import { LibraryStore } from './LibraryStore';
import { inflateMetadataResult } from './MetadataService';
import { getRecommendedScanConcurrency } from './ScanConcurrency';
import { ScanJobQueue } from './ScanJobQueue';
import { NetworkMetadataService, type NetworkCandidateList, type NetworkRepairResult } from './network/NetworkMetadataService';
import type { MetadataService } from './MetadataService';
import type {
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryArtist,
  LibraryDiagnostics,
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
  LibrarySummary,
  LibraryTrack,
  LibraryCleanupResult,
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

type LibraryServiceDependencies = {
  fileScanner?: FileScanner;
  metadataReader?: MetadataReader;
  coverExtractor?: CoverExtractor;
  metadataService?: MetadataService;
  coverCacheDir?: string;
  appSettings?: () => AppSettings;
  metadataConcurrency?: number;
  coverConcurrency?: number;
};

export class LibraryService {
  constructor(
    private readonly store: LibraryStore,
    private readonly scanJobQueue: ScanJobQueue,
    private readonly albumService: AlbumService,
    private readonly closeDatabase: () => void,
    private readonly databasePath: string,
    private coverCacheDir: string,
    private readonly coverExtractor: CoverExtractor = new TsCoverExtractor(),
    private readonly metadataReader: MetadataReader = new TsMetadataReader(),
    private readonly networkMetadataService: NetworkMetadataService | null = null,
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

  scanFolder(folderId: string): LibraryScanStatus {
    const folder = this.store.getFolder(folderId);

    if (!folder) {
      throw new Error(`Unknown library folder ${folderId}`);
    }

    return this.scanJobQueue.scanFolder(folder);
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

  addTracksToPlaylist(playlistId: string, trackIds: string[]): LibraryPlaylistItem[] {
    return this.store.addTracksToPlaylist(playlistId, trackIds);
  }

  removePlaylistItem(itemId: string): void {
    this.store.removePlaylistItem(itemId);
  }

  movePlaylistItem(playlistId: string, itemId: string, targetPosition: number): void {
    this.store.movePlaylistItem(playlistId, itemId, targetPosition);
  }

  clearPlaylist(playlistId: string): void {
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

  getArtists(query?: LibraryPageQuery): LibraryPage<LibraryArtist> {
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

  getAlbumTracks(albumId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize'>): LibraryPage<LibraryTrack> {
    return this.store.getAlbumTracks(albumId, query);
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
    });
  }

  resolveCoverAsset(coverId: string, variant: CoverVariant): { filePath: string; mimeType: string | null } | null {
    return this.store.resolveCoverAsset(coverId, variant);
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

  async importAudioFile(filePath: string, options: { folderPath?: string } = {}): Promise<LibraryTrack> {
    const normalizedPath = resolve(filePath);

    if (!existsSync(normalizedPath)) {
      throw new Error(`Track file is missing: ${normalizedPath}`);
    }

    const fileStat = statSync(normalizedPath);
    if (!fileStat.isFile()) {
      throw new Error(`Track path is not a file: ${normalizedPath}`);
    }

    const folder = this.store.addFolder(resolve(options.folderPath ?? dirname(normalizedPath)));
    const metadata = await this.metadataReader.read(normalizedPath);
    let coverId: string | null = null;
    let coverErrors: string[] = [];

    try {
      const cover = await this.coverExtractor.extract(normalizedPath, {
        cacheRoot: this.coverCacheDir,
        metadata,
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
        ...metadata.fields,
        id: trackId,
        coverId,
        fieldSources: metadata.fieldSources,
        embeddedMetadataStatus: metadata.embeddedMetadataStatus,
        embeddedCoverStatus: metadata.embeddedCoverStatus,
        metadataStatus: metadata.status,
        warnings: metadata.warnings,
        errors: [...metadata.errors, ...coverErrors],
        updatedAt: timestamp,
      });
      this.store.refreshAlbums(this.albumService, timestamp, this.albumRefreshOptions());
      this.store.refreshArtists();

      const track = this.store.getTrack(trackId) ?? this.store.getTrackByPath(normalizedPath);
      if (!track) {
        throw new Error(`Failed to import audio file: ${normalizedPath}`);
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

    try {
      const sourceAudio = readFileSync(currentTrack.path);
      let updatedAudio = await applyTags(sourceAudio, {
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        albumArtist: tags.albumArtist,
        track: tags.trackNo ?? 0,
        discNumber: tags.discNo ?? 0,
        year: tags.year ?? 0,
        genre: tags.genre ?? '',
      });

      if (coverData) {
        updatedAudio = await applyCoverArt(updatedAudio, coverData.data, coverData.mimeType);
      }

      writeFileSync(currentTrack.path, Buffer.from(updatedAudio));
    } catch (error) {
      throw new Error(`Failed to write embedded tags for ${currentTrack.path}: ${error instanceof Error ? error.message : String(error)}`);
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

    return this.store.transaction(() => {
      const updated = this.store.updateTrackTags(request.trackId, {
        ...tags,
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        fieldSources,
      });
      if (manualCoverId !== undefined) {
        this.store.updateTrackCover(request.trackId, manualCoverId);
      }
      this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
      this.store.refreshArtists();
      return manualCoverId !== undefined ? this.store.getTrack(request.trackId) ?? updated : updated;
    });
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
      this.store.deleteTrack(trackId);
      this.store.refreshAlbums(this.albumService, undefined, this.albumRefreshOptions());
      this.store.refreshArtists();
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
}

export const createLibraryService = (
  databasePath: string,
  dependencies: LibraryServiceDependencies = {},
): LibraryService => {
  const database = createDatabase(databasePath);
  const store = new LibraryStore(database);
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
  const readSettings = dependencies.appSettings ?? getAppSettingsSafe;
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

  return new LibraryService(
    store,
    scanJobQueue,
    albumService,
    () => database.close(),
    databasePath,
    coverCacheDir,
    coverExtractor,
    metadataReader,
    networkMetadataService,
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

const supportedImageMimeType = (value: string | null | undefined): string | null => {
  const normalized = value?.split(';')[0]?.trim().toLocaleLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp' ? normalized : null;
};

const mimeTypeForImageUrl = (url: string): string => {
  const path = new URL(url).pathname;
  return mimeTypeForImagePath(path);
};

const readCoverImageFromUrl = async (url: string, mimeTypeHint: string | null): Promise<{ data: Uint8Array; mimeType: string }> => {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
        'User-Agent': 'ECHO-Next/0.1',
      },
    });
  } catch (error) {
    throw new Error(`封面下载失败，但标签信息仍可应用。${error instanceof Error ? ` ${error.message}` : ''}`);
  }

  if (!response.ok) {
    throw new Error('封面下载失败，但标签信息仍可应用。');
  }

  const contentType = response.headers.get('content-type');
  const mimeType = supportedImageMimeType(mimeTypeHint) ?? supportedImageMimeType(contentType) ?? mimeTypeForImageUrl(url);
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
