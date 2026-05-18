import type {
  AudioDeviceInfo,
  AudioDiagnostics,
  AudioOutputSettings,
  AudioSessionResetEvent,
  AudioStatus,
  ChannelBalanceState,
} from '../shared/types/audio';
import type { AppSettings } from '../shared/types/appSettings';
import type { UpdateStatus } from '../shared/types/updates';
import type { AccountLoginStartResult, AccountProvider, AccountStatus, YouTubeBrowser } from '../shared/types/accounts';
import type { CoverCacheMigrationResult, SetCoverCacheDirectoryRequest } from '../shared/types/coverCache';
import type { AirPlayReceiverStatus, ConnectDevice, ConnectReceiverStatus, ConnectSessionStatus, ConnectStartRequest } from '../shared/types/connect';
import type { EqPreset, EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../shared/types/eq';
import type { GlobalShortcutAction, GlobalShortcutValidationResult } from '../shared/types/globalShortcuts';
import type {
  AddLocalAudioFilesToPlaylistResult,
  EmbeddedTrackTagsLoadResult,
  ImportPathClassification,
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryAlbumTagUpdateRequest,
  LibraryArtist,
  LibraryCacheClearResult,
  LibraryCleanupResult,
  LibraryDatabaseDeleteResult,
  LibraryDatabaseRepairResult,
  LibraryMaintenanceCleanupResult,
  LibraryDiagnostics,
  LibraryTrackTagUpdateRequest,
  LibraryFolder,
  LibraryFolderChildrenQuery,
  LibraryFolderNode,
  LibraryFolderOverview,
  LibraryFolderPathRequest,
  LibraryFolderTracksQuery,
  ImportPlaylistFileResult,
  LibraryPage,
  LibraryPageQuery,
  LibraryPlaylist,
  LibraryPlaylistItem,
  LibraryScanStatus,
  LibraryScanMode,
  LibrarySummary,
  LibraryTrack,
  LibraryTrackLocateResult,
  ArtistImageCacheClearResult,
  ArtistImageCacheEntry,
  ArtistImageCacheSummary,
  ArtistImageJobStatus,
  ArtistImageQueueResult,
  ArtistImageRefreshResult,
  MissingMetadataScanOptions,
  MissingMetadataScanResult,
  BpmAnalysisResult,
  BpmAnalysisJobStatus,
  BpmAnalysisStartOptions,
  ReplayGainAnalysisJobStatus,
  ReplayGainAnalysisStartOptions,
  LyricsBackgroundCoverResult,
  NetworkApplyOptions,
  NetworkApplyResult,
  NetworkCandidateList,
  NetworkMetadataScanJobStatus,
  NetworkRepairResult,
  NetworkTagCandidate,
  NetworkTagCandidateSearchRequest,
  PlaybackHistoryEntry,
  PlaybackHistoryQuery,
  PlaybackHistorySummary,
  StartPlaybackHistoryRequest,
  StartPlaybackHistoryResult,
  FinishPlaybackHistoryRequest,
  TrackCoverSelection,
  CreatePlaylistRequest,
  DuplicateTrackIndexSummary,
  DuplicateTrackMember,
  DuplicateTrackMode,
  ExportPlaylistRequest,
  UpdatePlaylistRequest,
} from '../shared/types/library';
import type {
  LocalFileResolveResult,
  PlaybackMediaStartRequest,
  PlaybackPrepareLocalFileRequest,
  PlaybackStartRequest,
  PlaybackStatus,
} from '../shared/types/playback';
import type { LastCrashSummary, RendererErrorPayload } from '../shared/types/diagnostics';
import type { DiscordPresenceStatus } from '../shared/types/discordPresence';
import type {
  CreateDownloadUrlJobOptions,
  DownloadJob,
  DownloadSearchRequest,
  DownloadSearchResponse,
  DownloadSettings,
  DownloadToolsStatus,
} from '../shared/types/downloads';
import type { LastFmAuthStartResult, LastFmStatus } from '../shared/types/lastfm';
import type { SmtcCommand } from '../shared/types/smtc';
import type { LyricsProviderId, LyricsSearchCandidate, LyricsTrackSnapshotRequest, TrackLyrics } from '../shared/types/lyrics';
import type { MvMatchCandidate, MvResolvedStreams, MvSettings, MvTrackSnapshotSearchRequest, TrackVideo } from '../shared/types/mv';
import type {
  RemoteDirectoryItem,
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteRuntimeLimits,
  RemoteSource,
  RemoteSourceInput,
  RemoteSourceUpdate,
  RemoteStreamUrlResult,
  RemoteSyncStatus,
  RemoteVisibleHydrationOptions,
  TestRemoteSourceResult,
} from '../shared/types/remoteSources';
import type {
  StreamingLyricsResult,
  StreamingAlbumDetail,
  StreamingArtistDetail,
  StreamingLikedSongsSyncResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingPlaylistImportResult,
  StreamingProviderDescriptor,
  StreamingProviderName,
  StreamingSearchRequest,
  StreamingSearchResult,
  StreamingTrack,
  StreamingTrackLikedResult,
} from '../shared/types/streaming';

export type FontFileAsset = {
  path: string;
  family: string;
  dataUrl: string;
};

export type DroppedFileImportResult = {
  importedCount: number;
  ignoredCount: number;
  failedCount: number;
  importedTrackIds: string[];
  outputDirectory: string;
};

export type EchoApi = {
  app: {
    getVersion: () => Promise<string>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    getSettings: () => Promise<AppSettings>;
    setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
    resetSettings: () => Promise<AppSettings>;
    chooseFontFile: () => Promise<FontFileAsset | null>;
    chooseLyricsWallpaper: () => Promise<string | null>;
    chooseAppWallpaper: () => Promise<string | null>;
    loadFontFile: (path: string) => Promise<FontFileAsset>;
    chooseCacheDirectory: () => Promise<string | null>;
    getDefaultCacheDirectory: () => Promise<string>;
    setCoverCacheDirectory: (request: SetCoverCacheDirectoryRequest) => Promise<CoverCacheMigrationResult | null>;
    getUpdateStatus: () => Promise<UpdateStatus>;
    checkForUpdates: () => Promise<UpdateStatus>;
    onUpdateStatus: (handler: (status: UpdateStatus) => void) => () => void;
    openRepository: () => Promise<void>;
    openExternalUrl: (url: string) => Promise<void>;
    validateGlobalShortcut: (accelerator: string) => Promise<GlobalShortcutValidationResult>;
    onGlobalShortcutCommand: (handler: (action: GlobalShortcutAction) => void) => () => void;
  };
  library: {
    chooseFolder: () => Promise<string | null>;
    addFolder: (path: string) => Promise<LibraryFolder>;
    classifyImportPaths: (paths: string[]) => Promise<ImportPathClassification>;
    importDroppedFiles: (files: File[]) => Promise<DroppedFileImportResult>;
    getFolders: () => Promise<LibraryFolder[]>;
    getFolderOverviews: () => Promise<LibraryFolderOverview[]>;
    getFolderChildren: (query: LibraryFolderChildrenQuery) => Promise<LibraryFolderNode[]>;
    getFolderTracks: (query: LibraryFolderTracksQuery) => Promise<LibraryPage<LibraryTrack>>;
    openLibraryFolderPath: (request: LibraryFolderPathRequest) => Promise<void>;
    removeFolder: (folderId: string) => Promise<void>;
    scanFolder: (folderId: string) => Promise<LibraryScanStatus>;
    rescanEmbeddedTags: (mode: Exclude<LibraryScanMode, 'normal'>) => Promise<LibraryScanStatus[]>;
    getScanStatus: (jobId: string) => Promise<LibraryScanStatus>;
    cancelScan: (jobId: string) => Promise<LibraryScanStatus>;
    getTrack: (trackId: string) => Promise<LibraryTrack | null>;
    getTracks: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    locateTrackInTracks: (trackId: string, query?: LibraryPageQuery) => Promise<LibraryTrackLocateResult>;
    refreshDuplicateTracks: (mode?: DuplicateTrackMode) => Promise<DuplicateTrackIndexSummary>;
    getDuplicateTrackVersions: (trackId: string) => Promise<DuplicateTrackMember[]>;
    getDuplicateHiddenCounts: (trackIds: string[], mode?: DuplicateTrackMode) => Promise<Record<string, number>>;
    getDuplicateIndexSummary: (mode?: DuplicateTrackMode) => Promise<DuplicateTrackIndexSummary>;
    getPlaylists: () => Promise<LibraryPlaylist[]>;
    createPlaylist: (request: CreatePlaylistRequest) => Promise<LibraryPlaylist>;
    updatePlaylist: (request: UpdatePlaylistRequest) => Promise<LibraryPlaylist>;
    deletePlaylist: (playlistId: string) => Promise<void>;
    getPlaylist: (playlistId: string) => Promise<LibraryPlaylist | null>;
    getPlaylistItems: (playlistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search'>) => Promise<LibraryPage<LibraryPlaylistItem>>;
    importPlaylistFile: () => Promise<ImportPlaylistFileResult | null>;
    exportPlaylist: (request: ExportPlaylistRequest) => Promise<string | null>;
    addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<LibraryPlaylistItem>;
    addStreamingTrackToPlaylist: (playlistId: string, track: LibraryTrack) => Promise<LibraryPlaylistItem>;
    addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<LibraryPlaylistItem[]>;
    addLocalAudioFilesToPlaylist: (playlistId: string, paths: string[]) => Promise<AddLocalAudioFilesToPlaylistResult>;
    removePlaylistItem: (itemId: string) => Promise<void>;
    movePlaylistItem: (playlistId: string, itemId: string, targetPosition: number) => Promise<void>;
    clearPlaylist: (playlistId: string) => Promise<void>;
    getLikedSongsPlaylist: () => Promise<LibraryPlaylist>;
    getLikedAlbumsPlaylist: () => Promise<LibraryPlaylist>;
    getLikedTracks: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryPlaylistItem>>;
    getLikedAlbums: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryPlaylistItem>>;
    isTrackLiked: (trackId: string) => Promise<boolean>;
    isAlbumLiked: (albumId: string) => Promise<boolean>;
    getLikedTrackIds: (trackIds: string[]) => Promise<Record<string, boolean>>;
    getLikedAlbumIds: (albumIds: string[]) => Promise<Record<string, boolean>>;
    likeTrack: (trackId: string) => Promise<LibraryPlaylistItem>;
    unlikeTrack: (trackId: string) => Promise<void>;
    toggleTrackLiked: (trackId: string) => Promise<{ liked: boolean; item?: LibraryPlaylistItem }>;
    likeAlbum: (albumId: string) => Promise<LibraryPlaylistItem>;
    unlikeAlbum: (albumId: string) => Promise<void>;
    toggleAlbumLiked: (albumId: string) => Promise<{ liked: boolean; item?: LibraryPlaylistItem }>;
    clearLikedTracks: () => Promise<void>;
    clearLikedAlbums: () => Promise<void>;
    getAlbums: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryAlbum>>;
    getAlbum: (albumId: string) => Promise<LibraryAlbumDetail | null>;
    getAlbumForTrack: (trackId: string) => Promise<LibraryAlbum | null>;
    getArtists: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryArtist>>;
    getArtist: (artistId: string) => Promise<LibraryArtist | null>;
    getArtistTracks: (artistId: string, query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    getArtistAlbums: (artistId: string, query?: LibraryPageQuery) => Promise<LibraryPage<LibraryAlbum>>;
    enqueueMissingArtistImages: (
      request?: { artists?: Array<Pick<LibraryArtist, 'id' | 'name'>>; force?: boolean; limit?: number } | Array<Pick<LibraryArtist, 'id' | 'name'>>,
    ) => Promise<ArtistImageQueueResult>;
    refreshArtistImage: (artistId: string, force?: boolean) => Promise<ArtistImageRefreshResult>;
    refreshVisibleArtistImages: (artists: Array<Pick<LibraryArtist, 'id' | 'name'>>) => Promise<ArtistImageQueueResult>;
    getArtistImageStatus: (artistId: string) => Promise<ArtistImageCacheEntry | null>;
    getArtistImageCacheSummary: () => Promise<ArtistImageCacheSummary>;
    getArtistImageJobStatus: () => Promise<ArtistImageJobStatus>;
    setArtistImageJobsPaused: (paused: boolean) => Promise<ArtistImageJobStatus>;
    kickoffArtistImageBackfill: (options?: { force?: boolean; limit?: number }) => Promise<ArtistImageJobStatus>;
    clearArtistImageCache: () => Promise<ArtistImageCacheClearResult>;
    onArtistImagesUpdated: (handler: (payload: { artistId: string | null; artistKey: string; status: string }) => void) => () => void;
    getAlbumTracks: (
      albumId: string,
      query?: Pick<LibraryPageQuery, 'page' | 'pageSize'>,
    ) => Promise<LibraryPage<LibraryTrack>>;
    getSummary: () => Promise<LibrarySummary>;
    refreshAlbumGrouping: () => Promise<LibrarySummary>;
    getDiagnostics: () => Promise<LibraryDiagnostics>;
    chooseTrackCover: () => Promise<TrackCoverSelection | null>;
    loadEmbeddedTrackTags: (trackId: string) => Promise<EmbeddedTrackTagsLoadResult>;
    updateTrackTags: (request: LibraryTrackTagUpdateRequest) => Promise<LibraryTrack>;
    updateAlbumTags: (request: LibraryAlbumTagUpdateRequest) => Promise<LibraryAlbum>;
    recordTrackPlayback: (trackId: string) => Promise<void>;
    getPlaybackHistory: (query?: PlaybackHistoryQuery) => Promise<LibraryPage<PlaybackHistoryEntry>>;
    getPlaybackHistorySummary: (query?: PlaybackHistoryQuery) => Promise<PlaybackHistorySummary>;
    deletePlaybackHistoryEntry: (id: string) => Promise<void>;
    clearPlaybackHistory: () => Promise<void>;
    startPlaybackHistory: (request: StartPlaybackHistoryRequest) => Promise<StartPlaybackHistoryResult>;
    finishPlaybackHistory: (request: FinishPlaybackHistoryRequest) => Promise<PlaybackHistoryEntry | null>;
    openTrackInFolder: (trackId: string) => Promise<void>;
    openPathInFolder: (path: string) => Promise<void>;
    openTrackWithSystem: (trackId: string) => Promise<void>;
    copyTrackPath: (trackId: string) => Promise<void>;
    copyTrackNameArtist: (trackId: string) => Promise<void>;
    copyTrackCover: (trackId: string) => Promise<boolean>;
    saveTrackCover: (trackId: string) => Promise<string | null>;
    deleteTrackFile: (trackId: string) => Promise<void>;
    copyAlbumInfo: (albumId: string) => Promise<void>;
    copyAlbumCover: (albumId: string) => Promise<boolean>;
    saveAlbumCover: (albumId: string) => Promise<string | null>;
    deleteAlbumFiles: (albumId: string) => Promise<void>;
    pruneMissingTracks: () => Promise<LibraryCleanupResult>;
    pruneInvalidTracks: () => Promise<LibraryMaintenanceCleanupResult>;
    clearTracks: () => Promise<LibraryCleanupResult>;
    clearCache: () => Promise<LibraryCacheClearResult>;
    repairDatabase: () => Promise<LibraryDatabaseRepairResult>;
    deleteDatabase: () => Promise<LibraryDatabaseDeleteResult>;
    repairMissingMetadata: (trackId: string) => Promise<NetworkRepairResult>;
    scanMissingMetadata: (options?: number | MissingMetadataScanOptions) => Promise<MissingMetadataScanResult>;
    startMissingMetadataScan: (options?: number | MissingMetadataScanOptions) => Promise<NetworkMetadataScanJobStatus>;
    getMissingMetadataScanStatus: (jobId: string) => Promise<NetworkMetadataScanJobStatus>;
    showNetworkCandidates: (trackId: string) => Promise<NetworkCandidateList>;
    searchNetworkTagCandidates: (
      trackId: string,
      options?: Omit<NetworkTagCandidateSearchRequest, 'trackId'>,
    ) => Promise<NetworkTagCandidate[]>;
    resolveLyricsBackgroundCover: (trackId: string) => Promise<LyricsBackgroundCoverResult | null>;
    applyNetworkMissingOnly: (candidateId: string, options?: NetworkApplyOptions) => Promise<NetworkApplyResult>;
    applyNetworkSelected: (candidateId: string, options?: NetworkApplyOptions) => Promise<NetworkApplyResult>;
    rejectNetworkCandidate: (candidateId: string) => Promise<NetworkApplyResult>;
    startBpmAnalysis: (options?: BpmAnalysisStartOptions) => Promise<BpmAnalysisJobStatus>;
    getBpmAnalysisStatus: (jobId: string) => Promise<BpmAnalysisJobStatus>;
    startReplayGainAnalysis: (options?: ReplayGainAnalysisStartOptions) => Promise<ReplayGainAnalysisJobStatus>;
    getReplayGainAnalysisStatus: (jobId: string) => Promise<ReplayGainAnalysisJobStatus>;
  };
  playback: {
    getStatus: () => Promise<PlaybackStatus>;
    playLocalFile: (request: PlaybackStartRequest) => Promise<PlaybackStatus>;
    prepareLocalFile: (request: PlaybackPrepareLocalFileRequest) => Promise<void>;
    playMediaItem: (request: PlaybackMediaStartRequest) => Promise<PlaybackStatus>;
    prepareMediaItem: (request: PlaybackMediaStartRequest) => Promise<void>;
    play: () => Promise<PlaybackStatus>;
    pause: () => Promise<PlaybackStatus>;
    stop: () => Promise<PlaybackStatus>;
    seek: (positionSeconds: number) => Promise<PlaybackStatus>;
    openLocalAudioFile: () => Promise<string | null>;
    openLocalAudioFiles: () => Promise<string[] | null>;
    resolveLocalAudioFiles: (paths: string[]) => Promise<LocalFileResolveResult>;
    onLocalAudioFilesOpened: (handler: (paths: string[]) => void) => () => void;
    onAutomixAdvance?: (handler: (event: {
      fromTrackId: string | null;
      toTrackId: string;
      transitionSeconds: number;
      mode?: 'smartCrossfade' | 'beatAligned' | 'energyFade' | 'gaplessFallback';
      fallbackReason?: string | null;
      beatAligned?: boolean;
      skipIntroSilence?: boolean;
      nextStartSeconds?: number;
    }) => void) => () => void;
  };
  remoteSources: {
    list: () => Promise<RemoteSource[]>;
    create: (input: RemoteSourceInput) => Promise<RemoteSource>;
    update: (input: RemoteSourceUpdate) => Promise<RemoteSource>;
    delete: (sourceId: string) => Promise<void>;
    test: (sourceIdOrInput: string | RemoteSourceInput) => Promise<TestRemoteSourceResult>;
    browse: (sourceId: string, path?: string | null) => Promise<RemoteDirectoryItem[]>;
    sync: (sourceId: string) => Promise<RemoteSyncStatus>;
    cancelSync: (sourceId: string) => Promise<RemoteSyncStatus>;
    getSyncStatus: (sourceId: string) => Promise<RemoteSyncStatus>;
    createStreamUrl: (input: { trackId?: string; sourceId?: string; remotePath?: string; stableKey?: string }) => Promise<RemoteStreamUrlResult>;
    hydrateVisibleTracks: (trackIds: string[], options?: RemoteVisibleHydrationOptions) => Promise<LibraryTrack[]>;
    startBackgroundJobs: (sourceId: string, kinds?: RemoteBackgroundJobKind[]) => Promise<RemoteBackgroundJobStatus>;
    pauseBackgroundJobs: (sourceId: string) => Promise<RemoteBackgroundJobStatus>;
    resumeBackgroundJobs: (sourceId: string) => Promise<RemoteBackgroundJobStatus>;
    getJobStatus: (sourceId: string) => Promise<RemoteBackgroundJobStatus>;
    retryFailedJobs: (sourceId: string, kinds?: RemoteBackgroundJobKind[]) => Promise<RemoteBackgroundJobStatus>;
    setBackgroundPaused: (paused: boolean) => Promise<RemoteBackgroundGlobalStatus>;
    getBackgroundGlobalStatus: () => Promise<RemoteBackgroundGlobalStatus>;
    updateRuntimeLimits: (sourceId: string, limits: RemoteRuntimeLimits) => Promise<RemoteBackgroundJobStatus>;
  };
  connect: {
    listDevices: () => Promise<ConnectDevice[]>;
    refresh: () => Promise<ConnectDevice[]>;
    getStatus: () => Promise<ConnectSessionStatus>;
    connect: (request: ConnectStartRequest) => Promise<ConnectSessionStatus>;
    disconnect: () => Promise<ConnectSessionStatus>;
    play: () => Promise<ConnectSessionStatus>;
    pause: () => Promise<ConnectSessionStatus>;
    stop: () => Promise<ConnectSessionStatus>;
    seek: (positionSeconds: number) => Promise<ConnectSessionStatus>;
    setVolume: (volumePercent: number) => Promise<ConnectSessionStatus>;
    onStatus: (handler: (status: ConnectSessionStatus) => void) => () => void;
    getReceiverStatus: () => Promise<ConnectReceiverStatus>;
    setReceiverEnabled: (enabled: boolean) => Promise<ConnectReceiverStatus>;
    stopReceiverPlayback: () => Promise<ConnectReceiverStatus>;
    onReceiverStatus: (handler: (status: ConnectReceiverStatus) => void) => () => void;
    getAirPlayReceiverStatus: () => Promise<AirPlayReceiverStatus>;
    setAirPlayReceiverEnabled: (enabled: boolean) => Promise<AirPlayReceiverStatus>;
    stopAirPlayReceiverPlayback: () => Promise<AirPlayReceiverStatus>;
    onAirPlayReceiverStatus: (handler: (status: AirPlayReceiverStatus) => void) => () => void;
  };
  streaming: {
    search: (request: StreamingSearchRequest) => Promise<StreamingSearchResult>;
    getTrack: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingTrack>;
    getAlbum: (request: { provider: StreamingProviderName; providerAlbumId: string }) => Promise<StreamingAlbumDetail>;
    getArtist: (request: { provider: StreamingProviderName; providerArtistId: string }) => Promise<StreamingArtistDetail>;
    resolvePlayback: (request: StreamingPlaybackRequest) => Promise<StreamingPlaybackSource>;
    analyzeBpm: (request: StreamingPlaybackRequest) => Promise<BpmAnalysisResult>;
    getLyrics: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingLyricsResult>;
    getMv: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingMvResult>;
    getProviders: () => Promise<StreamingProviderDescriptor[]>;
    importPlaylistFromUrl: (url: string) => Promise<StreamingPlaylistImportResult>;
    syncLikedSongs: (provider?: Extract<StreamingProviderName, 'netease' | 'qqmusic'>) => Promise<StreamingLikedSongsSyncResult>;
    setTrackLiked: (request: { provider: Extract<StreamingProviderName, 'netease' | 'qqmusic'>; providerTrackId: string; liked: boolean }) => Promise<StreamingTrackLikedResult>;
    refreshNeteaseDailyRecommend: () => Promise<StreamingPlaylistImportResult>;
  };
  lyrics: {
    getForTrack: (trackId: string) => Promise<TrackLyrics | null>;
    getForSnapshot?: (request: LyricsTrackSnapshotRequest) => Promise<TrackLyrics | null>;
    searchCandidates: (trackId: string, searchText?: string, providerId?: LyricsProviderId) => Promise<LyricsSearchCandidate[]>;
    searchCandidatesForSnapshot?: (
      request: LyricsTrackSnapshotRequest,
      searchText?: string,
      providerId?: LyricsProviderId,
    ) => Promise<LyricsSearchCandidate[]>;
    applyCandidate: (trackId: string, candidateId: string) => Promise<TrackLyrics>;
    applyCandidateForSnapshot?: (request: LyricsTrackSnapshotRequest, candidateId: string) => Promise<TrackLyrics>;
    applyCustomLrc?: (trackId: string, lrcText: string, fileName?: string) => Promise<TrackLyrics>;
    markInstrumental: (trackId: string) => Promise<TrackLyrics>;
    rejectCandidate: (candidateId: string) => Promise<void>;
    setOffset: (trackId: string, offsetMs: number) => Promise<TrackLyrics | null>;
    clearCache: (trackId: string) => Promise<void>;
  };
  mv: {
    getSelected: (trackId: string) => Promise<TrackVideo | null>;
    getSettings: () => Promise<MvSettings>;
    setSettings: (patch: Partial<MvSettings>) => Promise<MvSettings>;
    findLocalCandidates: (trackId: string) => Promise<MvMatchCandidate[]>;
    searchNetworkCandidates: (trackId: string, query?: string) => Promise<MvMatchCandidate[]>;
    searchNetworkCandidatesForSnapshot: (request: MvTrackSnapshotSearchRequest) => Promise<MvMatchCandidate[]>;
    getCandidates: (trackId: string) => Promise<TrackVideo[]>;
    resolveStreams: (videoId: string) => Promise<MvResolvedStreams>;
    setQuality: (videoId: string, qualityId: string) => Promise<TrackVideo>;
    setOffset: (trackId: string, offsetMs: number) => Promise<TrackVideo | null>;
    chooseLocalVideo: (trackId: string) => Promise<TrackVideo | null>;
    bindLocalVideo: (trackId: string, filePath: string) => Promise<TrackVideo>;
    bindUrl: (trackId: string, url: string) => Promise<TrackVideo>;
    selectVideo: (trackId: string, videoId: string) => Promise<TrackVideo>;
    clearSelected: (trackId: string) => Promise<void>;
    openExternal: (videoId: string) => Promise<void>;
  };
  smtc: {
    onCommand: (handler: (command: SmtcCommand) => void) => () => void;
  };
  discordPresence: {
    getStatus: () => Promise<DiscordPresenceStatus>;
    setEnabled: (enabled: boolean) => Promise<DiscordPresenceStatus>;
  };
  lastfm: {
    getStatus: () => Promise<LastFmStatus>;
    setEnabled: (enabled: boolean) => Promise<LastFmStatus>;
    setNowPlayingEnabled: (enabled: boolean) => Promise<LastFmStatus>;
    setScrobbleEnabled: (enabled: boolean) => Promise<LastFmStatus>;
    createAuthToken: () => Promise<LastFmAuthStartResult>;
    openAuthUrl: (token: string) => Promise<void>;
    completeAuth: (token: string) => Promise<LastFmStatus>;
    authenticatePassword: (username: string, password: string) => Promise<LastFmStatus>;
    disconnect: () => Promise<LastFmStatus>;
  };
  audio: {
    getStatus: () => Promise<AudioStatus>;
    getDiagnostics: () => Promise<AudioDiagnostics>;
    onStatus: (handler: (status: AudioStatus) => void) => () => void;
    onSessionReset: (handler: (event: AudioSessionResetEvent) => void) => () => void;
    listDevices: () => Promise<AudioDeviceInfo[]>;
    setOutput: (settings: AudioOutputSettings) => Promise<AudioStatus>;
    openAsioControlPanel?: (settings: Pick<AudioOutputSettings, 'deviceIndex' | 'deviceName'>) => Promise<void>;
    resetEngine: () => Promise<AudioStatus>;
    forceRestart: (reason?: string) => Promise<AudioStatus>;
    restartWindowsAudioService: () => Promise<AudioStatus>;
  };
  diagnostics: {
    getLastCrashSummary: () => Promise<LastCrashSummary | null>;
    clearLastCrashSummary: () => Promise<void>;
    exportDiagnostics: () => Promise<string>;
    openDiagnosticsFolder: () => Promise<string>;
    openCrashReport: () => Promise<string>;
    openAudioCrashReport: () => Promise<string>;
    reportRendererError: (payload: RendererErrorPayload) => Promise<void>;
  };
  downloads: {
    getJobs: () => Promise<DownloadJob[]>;
    createUrlJob: (url: string, options?: CreateDownloadUrlJobOptions) => Promise<DownloadJob>;
    cancelJob: (jobId: string) => Promise<DownloadJob | null>;
    clearCompleted: () => Promise<DownloadJob[]>;
    getSettings: () => Promise<DownloadSettings>;
    setSettings: (patch: Partial<DownloadSettings>) => Promise<DownloadSettings>;
    chooseOutputDirectory: () => Promise<DownloadSettings | null>;
    search: (request: string | DownloadSearchRequest) => Promise<DownloadSearchResponse>;
    checkTools: () => Promise<DownloadToolsStatus>;
    onJobsUpdated: (handler: (jobs: DownloadJob[]) => void) => () => void;
  };
  accounts: {
    getStatuses: () => Promise<AccountStatus[]>;
    getStatus: (provider: AccountProvider) => Promise<AccountStatus>;
    saveCookie: (provider: AccountProvider, cookie: string) => Promise<AccountStatus>;
    startLogin?: (provider: AccountProvider) => Promise<AccountLoginStartResult>;
    clear: (provider: AccountProvider) => Promise<AccountStatus>;
    check: (provider: AccountProvider) => Promise<AccountStatus>;
    checkAll: () => Promise<AccountStatus[]>;
    setYouTubeBrowser: (browser: YouTubeBrowser) => Promise<AccountStatus>;
    onStatusesChanged: (handler: (statuses: AccountStatus[]) => void) => () => void;
  };
  spotify: {
    getAccessToken: () => Promise<string>;
    getDevices: () => Promise<Array<{ id: string; name: string; type: string; isActive: boolean; isRestricted: boolean; volumePercent: number | null }>>;
    getPlaybackState: () => Promise<{ isPlaying: boolean; progressMs: number | null; itemUri: string | null; deviceId: string | null; deviceName: string | null }>;
    ensureConnectDevice: (request: { uri: string; webUrl: string; preferredDeviceId?: string | null }) => Promise<{ deviceId: string; deviceName: string; launched: 'none' | 'desktop' | 'web'; waitedMs: number }>;
    startPlayback: (request: { deviceId: string; uri: string; positionMs?: number }) => Promise<void>;
    transferPlayback: (request: { deviceId: string; play?: boolean }) => Promise<void>;
    pause: (deviceId?: string | null) => Promise<void>;
    resume: (deviceId?: string | null) => Promise<void>;
    seek: (positionMs: number, deviceId?: string | null) => Promise<void>;
    setVolume: (volume: number, deviceId?: string | null) => Promise<void>;
  };
  eq: {
    getState: () => Promise<EqState>;
    setEnabled: (enabled: boolean) => Promise<EqState>;
    setBandGain: (request: EqSetBandGainRequest) => Promise<EqState>;
    setBandFrequency: (request: EqSetBandFrequencyRequest) => Promise<EqState>;
    setPreamp: (preampDb: number) => Promise<EqState>;
    setPreset: (presetId: string) => Promise<EqState>;
    reset: () => Promise<EqState>;
    listPresets: () => Promise<EqPreset[]>;
    savePreset: (request: EqSavePresetRequest) => Promise<EqPreset>;
    exportPreset: (request: EqSavePresetRequest) => Promise<string | null>;
    deletePreset: (presetId: string) => Promise<EqPreset[]>;
    getChannelBalanceState: () => Promise<ChannelBalanceState>;
    setChannelBalanceState: (patch: Partial<ChannelBalanceState>) => Promise<ChannelBalanceState>;
    resetChannelBalance: () => Promise<ChannelBalanceState>;
  };
};

declare global {
  interface Window {
    echo: EchoApi;
  }
}
