import type { AudioDeviceInfo, AudioDiagnostics, AudioOutputSettings, AudioStatus, ChannelBalanceState } from '../shared/types/audio';
import type { AppSettings } from '../shared/types/appSettings';
import type { AccountLoginStartResult, AccountProvider, AccountStatus, YouTubeBrowser } from '../shared/types/accounts';
import type { CoverCacheMigrationResult, SetCoverCacheDirectoryRequest } from '../shared/types/coverCache';
import type { EqPreset, EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../shared/types/eq';
import type {
  EmbeddedTrackTagsLoadResult,
  ImportPathClassification,
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryArtist,
  LibraryCacheClearResult,
  LibraryCleanupResult,
  LibraryDiagnostics,
  LibraryTrackTagUpdateRequest,
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
  MissingMetadataScanOptions,
  MissingMetadataScanResult,
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
  UpdatePlaylistRequest,
} from '../shared/types/library';
import type { LocalFileResolveResult, PlaybackMediaStartRequest, PlaybackStartRequest, PlaybackStatus } from '../shared/types/playback';
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
import type { LyricsSearchCandidate, TrackLyrics } from '../shared/types/lyrics';
import type { MvMatchCandidate, MvResolvedStreams, MvSettings, TrackVideo } from '../shared/types/mv';
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
  TestRemoteSourceResult,
} from '../shared/types/remoteSources';
import type {
  StreamingLyricsResult,
  StreamingMvResult,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingProviderDescriptor,
  StreamingProviderName,
  StreamingSearchRequest,
  StreamingSearchResult,
  StreamingTrack,
} from '../shared/types/streaming';

export type FontFileAsset = {
  path: string;
  family: string;
  dataUrl: string;
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
  };
  library: {
    chooseFolder: () => Promise<string | null>;
    addFolder: (path: string) => Promise<LibraryFolder>;
    classifyImportPaths: (paths: string[]) => Promise<ImportPathClassification>;
    getFolders: () => Promise<LibraryFolder[]>;
    getFolderOverviews: () => Promise<LibraryFolderOverview[]>;
    getFolderChildren: (query: LibraryFolderChildrenQuery) => Promise<LibraryFolderNode[]>;
    getFolderTracks: (query: LibraryFolderTracksQuery) => Promise<LibraryPage<LibraryTrack>>;
    openLibraryFolderPath: (request: LibraryFolderPathRequest) => Promise<void>;
    removeFolder: (folderId: string) => Promise<void>;
    scanFolder: (folderId: string) => Promise<LibraryScanStatus>;
    getScanStatus: (jobId: string) => Promise<LibraryScanStatus>;
    cancelScan: (jobId: string) => Promise<LibraryScanStatus>;
    getTrack: (trackId: string) => Promise<LibraryTrack | null>;
    getTracks: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    refreshDuplicateTracks: (mode?: DuplicateTrackMode) => Promise<DuplicateTrackIndexSummary>;
    getDuplicateTrackVersions: (trackId: string) => Promise<DuplicateTrackMember[]>;
    getDuplicateIndexSummary: (mode?: DuplicateTrackMode) => Promise<DuplicateTrackIndexSummary>;
    getPlaylists: () => Promise<LibraryPlaylist[]>;
    createPlaylist: (request: CreatePlaylistRequest) => Promise<LibraryPlaylist>;
    updatePlaylist: (request: UpdatePlaylistRequest) => Promise<LibraryPlaylist>;
    deletePlaylist: (playlistId: string) => Promise<void>;
    getPlaylist: (playlistId: string) => Promise<LibraryPlaylist | null>;
    getPlaylistItems: (playlistId: string, query?: Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search'>) => Promise<LibraryPage<LibraryPlaylistItem>>;
    addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<LibraryPlaylistItem>;
    addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<LibraryPlaylistItem[]>;
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
    getArtists: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryArtist>>;
    getArtist: (artistId: string) => Promise<LibraryArtist | null>;
    getArtistTracks: (artistId: string, query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    getArtistAlbums: (artistId: string, query?: LibraryPageQuery) => Promise<LibraryPage<LibraryAlbum>>;
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
    recordTrackPlayback: (trackId: string) => Promise<void>;
    getPlaybackHistory: (query?: PlaybackHistoryQuery) => Promise<LibraryPage<PlaybackHistoryEntry>>;
    getPlaybackHistorySummary: () => Promise<PlaybackHistorySummary>;
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
    pruneMissingTracks: () => Promise<LibraryCleanupResult>;
    clearTracks: () => Promise<LibraryCleanupResult>;
    clearCache: () => Promise<LibraryCacheClearResult>;
    repairMissingMetadata: (trackId: string) => Promise<NetworkRepairResult>;
    scanMissingMetadata: (options?: number | MissingMetadataScanOptions) => Promise<MissingMetadataScanResult>;
    startMissingMetadataScan: (options?: number | MissingMetadataScanOptions) => Promise<NetworkMetadataScanJobStatus>;
    getMissingMetadataScanStatus: (jobId: string) => Promise<NetworkMetadataScanJobStatus>;
    showNetworkCandidates: (trackId: string) => Promise<NetworkCandidateList>;
    searchNetworkTagCandidates: (
      trackId: string,
      options?: Omit<NetworkTagCandidateSearchRequest, 'trackId'>,
    ) => Promise<NetworkTagCandidate[]>;
    applyNetworkMissingOnly: (candidateId: string, options?: NetworkApplyOptions) => Promise<NetworkApplyResult>;
    applyNetworkSelected: (candidateId: string, options?: NetworkApplyOptions) => Promise<NetworkApplyResult>;
    rejectNetworkCandidate: (candidateId: string) => Promise<NetworkApplyResult>;
  };
  playback: {
    getStatus: () => Promise<PlaybackStatus>;
    playLocalFile: (request: PlaybackStartRequest) => Promise<PlaybackStatus>;
    playMediaItem: (request: PlaybackMediaStartRequest) => Promise<PlaybackStatus>;
    play: () => Promise<PlaybackStatus>;
    pause: () => Promise<PlaybackStatus>;
    stop: () => Promise<PlaybackStatus>;
    seek: (positionSeconds: number) => Promise<PlaybackStatus>;
    openLocalAudioFile: () => Promise<string | null>;
    openLocalAudioFiles: () => Promise<string[] | null>;
    resolveLocalAudioFiles: (paths: string[]) => Promise<LocalFileResolveResult>;
    onLocalAudioFilesOpened: (handler: (paths: string[]) => void) => () => void;
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
    startBackgroundJobs: (sourceId: string, kinds?: RemoteBackgroundJobKind[]) => Promise<RemoteBackgroundJobStatus>;
    pauseBackgroundJobs: (sourceId: string) => Promise<RemoteBackgroundJobStatus>;
    getJobStatus: (sourceId: string) => Promise<RemoteBackgroundJobStatus>;
    retryFailedJobs: (sourceId: string, kinds?: RemoteBackgroundJobKind[]) => Promise<RemoteBackgroundJobStatus>;
    setBackgroundPaused: (paused: boolean) => Promise<RemoteBackgroundGlobalStatus>;
    getBackgroundGlobalStatus: () => Promise<RemoteBackgroundGlobalStatus>;
    updateRuntimeLimits: (sourceId: string, limits: RemoteRuntimeLimits) => Promise<RemoteBackgroundJobStatus>;
  };
  streaming: {
    search: (request: StreamingSearchRequest) => Promise<StreamingSearchResult>;
    getTrack: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingTrack>;
    resolvePlayback: (request: StreamingPlaybackRequest) => Promise<StreamingPlaybackSource>;
    getLyrics: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingLyricsResult>;
    getMv: (request: { provider: StreamingProviderName; providerTrackId: string }) => Promise<StreamingMvResult>;
    getProviders: () => Promise<StreamingProviderDescriptor[]>;
  };
  lyrics: {
    getForTrack: (trackId: string) => Promise<TrackLyrics | null>;
    searchCandidates: (trackId: string, searchText?: string) => Promise<LyricsSearchCandidate[]>;
    applyCandidate: (trackId: string, candidateId: string) => Promise<TrackLyrics>;
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
    getCandidates: (trackId: string) => Promise<TrackVideo[]>;
    resolveStreams: (videoId: string) => Promise<MvResolvedStreams>;
    setQuality: (videoId: string, qualityId: string) => Promise<TrackVideo>;
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
    listDevices: () => Promise<AudioDeviceInfo[]>;
    setOutput: (settings: AudioOutputSettings) => Promise<AudioStatus>;
  };
  diagnostics: {
    getLastCrashSummary: () => Promise<LastCrashSummary | null>;
    clearLastCrashSummary: () => Promise<void>;
    exportDiagnostics: () => Promise<string>;
    openDiagnosticsFolder: () => Promise<string>;
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
