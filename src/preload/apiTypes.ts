import type { AudioDeviceInfo, AudioOutputSettings, AudioStatus, ChannelBalanceState } from '../shared/types/audio';
import type { AppSettings } from '../shared/types/appSettings';
import type { CoverCacheMigrationResult, SetCoverCacheDirectoryRequest } from '../shared/types/coverCache';
import type { EqPreset, EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../shared/types/eq';
import type {
  EmbeddedTrackTagsLoadResult,
  LibraryAlbum,
  LibraryArtist,
  LibraryCleanupResult,
  LibraryDiagnostics,
  LibraryTrackTagUpdateRequest,
  LibraryFolder,
  LibraryPage,
  LibraryPageQuery,
  LibraryScanStatus,
  LibrarySummary,
  LibraryTrack,
  MissingMetadataScanOptions,
  MissingMetadataScanResult,
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
} from '../shared/types/library';
import type { PlaybackStartRequest, PlaybackStatus } from '../shared/types/playback';

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
    chooseFontFile: () => Promise<FontFileAsset | null>;
    loadFontFile: (path: string) => Promise<FontFileAsset>;
    chooseCacheDirectory: () => Promise<string | null>;
    getDefaultCacheDirectory: () => Promise<string>;
    setCoverCacheDirectory: (request: SetCoverCacheDirectoryRequest) => Promise<CoverCacheMigrationResult | null>;
  };
  library: {
    chooseFolder: () => Promise<string | null>;
    addFolder: (path: string) => Promise<LibraryFolder>;
    getFolders: () => Promise<LibraryFolder[]>;
    removeFolder: (folderId: string) => Promise<void>;
    scanFolder: (folderId: string) => Promise<LibraryScanStatus>;
    getScanStatus: (jobId: string) => Promise<LibraryScanStatus>;
    cancelScan: (jobId: string) => Promise<LibraryScanStatus>;
    getTracks: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    getAlbums: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryAlbum>>;
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
    openTrackWithSystem: (trackId: string) => Promise<void>;
    copyTrackPath: (trackId: string) => Promise<void>;
    copyTrackNameArtist: (trackId: string) => Promise<void>;
    copyTrackCover: (trackId: string) => Promise<boolean>;
    saveTrackCover: (trackId: string) => Promise<string | null>;
    deleteTrackFile: (trackId: string) => Promise<void>;
    pruneMissingTracks: () => Promise<LibraryCleanupResult>;
    clearTracks: () => Promise<LibraryCleanupResult>;
    repairMissingMetadata: (trackId: string) => Promise<NetworkRepairResult>;
    scanMissingMetadata: (options?: number | MissingMetadataScanOptions) => Promise<MissingMetadataScanResult>;
    startMissingMetadataScan: (options?: number | MissingMetadataScanOptions) => Promise<NetworkMetadataScanJobStatus>;
    getMissingMetadataScanStatus: (jobId: string) => Promise<NetworkMetadataScanJobStatus>;
    showNetworkCandidates: (trackId: string) => Promise<NetworkCandidateList>;
    searchNetworkTagCandidates: (
      trackId: string,
      options?: Omit<NetworkTagCandidateSearchRequest, 'trackId'>,
    ) => Promise<NetworkTagCandidate[]>;
    applyNetworkMissingOnly: (candidateId: string) => Promise<NetworkApplyResult>;
    applyNetworkSelected: (candidateId: string) => Promise<NetworkApplyResult>;
    rejectNetworkCandidate: (candidateId: string) => Promise<NetworkApplyResult>;
  };
  playback: {
    getStatus: () => Promise<PlaybackStatus>;
    playLocalFile: (request: PlaybackStartRequest) => Promise<PlaybackStatus>;
    play: () => Promise<PlaybackStatus>;
    pause: () => Promise<PlaybackStatus>;
    stop: () => Promise<PlaybackStatus>;
    seek: (positionSeconds: number) => Promise<PlaybackStatus>;
    openLocalAudioFile: () => Promise<string | null>;
  };
  audio: {
    getStatus: () => Promise<AudioStatus>;
    listDevices: () => Promise<AudioDeviceInfo[]>;
    setOutput: (settings: AudioOutputSettings) => Promise<AudioStatus>;
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
