import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/constants/ipcChannels';
import type { EchoApi } from './apiTypes';
import type { SmtcCommand } from '../shared/types/smtc';
import type { UpdateStatus } from '../shared/types/updates';

const sanitizePathList = (paths: unknown): string[] =>
  Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [];

const localAudioFileOpenHandlers = new Set<(paths: string[]) => void>();
const pendingLocalAudioFileOpenEvents: string[][] = [];

ipcRenderer.on(IpcChannels.PlaybackLocalAudioFilesOpened, (_event: Electron.IpcRendererEvent, paths: unknown): void => {
  const safePaths = sanitizePathList(paths);
  if (safePaths.length === 0) {
    return;
  }

  if (localAudioFileOpenHandlers.size === 0) {
    pendingLocalAudioFileOpenEvents.push(safePaths);
    return;
  }

  for (const handler of localAudioFileOpenHandlers) {
    handler(safePaths);
  }
});

const echoApi: EchoApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannels.AppGetVersion),
    minimize: () => ipcRenderer.invoke(IpcChannels.AppWindowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IpcChannels.AppWindowToggleMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.AppWindowClose),
    getSettings: () => ipcRenderer.invoke(IpcChannels.AppGetSettings),
    setSettings: (patch) => ipcRenderer.invoke(IpcChannels.AppSetSettings, patch),
    resetSettings: () => ipcRenderer.invoke(IpcChannels.AppResetSettings),
    chooseFontFile: () => ipcRenderer.invoke(IpcChannels.AppChooseFontFile),
    chooseLyricsWallpaper: () => ipcRenderer.invoke(IpcChannels.AppChooseLyricsWallpaper),
    chooseAppWallpaper: () => ipcRenderer.invoke(IpcChannels.AppChooseAppWallpaper),
    loadFontFile: (path) => ipcRenderer.invoke(IpcChannels.AppLoadFontFile, path),
    chooseCacheDirectory: () => ipcRenderer.invoke(IpcChannels.AppChooseCacheDirectory),
    getDefaultCacheDirectory: () => ipcRenderer.invoke(IpcChannels.AppGetDefaultCacheDirectory),
    setCoverCacheDirectory: (request) => ipcRenderer.invoke(IpcChannels.AppSetCoverCacheDirectory, request),
    getUpdateStatus: () => ipcRenderer.invoke(IpcChannels.AppGetUpdateStatus),
    checkForUpdates: () => ipcRenderer.invoke(IpcChannels.AppCheckForUpdates),
    onUpdateStatus: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown): void => {
        handler(status as UpdateStatus);
      };
      ipcRenderer.on(IpcChannels.AppUpdateStatusChanged, listener);
      return () => ipcRenderer.off(IpcChannels.AppUpdateStatusChanged, listener);
    },
    openRepository: () => ipcRenderer.invoke(IpcChannels.AppOpenRepository),
  },
  library: {
    chooseFolder: () => ipcRenderer.invoke(IpcChannels.LibraryChooseFolder),
    addFolder: (path) => ipcRenderer.invoke(IpcChannels.LibraryAddFolder, path),
    classifyImportPaths: (paths) => ipcRenderer.invoke(IpcChannels.LibraryClassifyImportPaths, paths),
    getFolders: () => ipcRenderer.invoke(IpcChannels.LibraryGetFolders),
    getFolderOverviews: () => ipcRenderer.invoke(IpcChannels.LibraryGetFolderOverviews),
    getFolderChildren: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetFolderChildren, query),
    getFolderTracks: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetFolderTracks, query),
    openLibraryFolderPath: (request) => ipcRenderer.invoke(IpcChannels.LibraryOpenLibraryFolderPath, request),
    removeFolder: (folderId) => ipcRenderer.invoke(IpcChannels.LibraryRemoveFolder, folderId),
    scanFolder: (folderId) => ipcRenderer.invoke(IpcChannels.LibraryScanFolder, folderId),
    getScanStatus: (jobId) => ipcRenderer.invoke(IpcChannels.LibraryGetScanStatus, jobId),
    cancelScan: (jobId) => ipcRenderer.invoke(IpcChannels.LibraryCancelScan, jobId),
    getTrack: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryGetTrack, trackId),
    getTracks: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetTracks, query),
    refreshDuplicateTracks: (mode) => ipcRenderer.invoke(IpcChannels.LibraryRefreshDuplicateTracks, mode),
    getDuplicateTrackVersions: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryGetDuplicateTrackVersions, trackId),
    getDuplicateHiddenCounts: (trackIds, mode) => ipcRenderer.invoke(IpcChannels.LibraryGetDuplicateHiddenCounts, trackIds, mode),
    getDuplicateIndexSummary: (mode) => ipcRenderer.invoke(IpcChannels.LibraryGetDuplicateIndexSummary, mode),
    getPlaylists: () => ipcRenderer.invoke(IpcChannels.LibraryGetPlaylists),
    createPlaylist: (request) => ipcRenderer.invoke(IpcChannels.LibraryCreatePlaylist, request),
    updatePlaylist: (request) => ipcRenderer.invoke(IpcChannels.LibraryUpdatePlaylist, request),
    deletePlaylist: (playlistId) => ipcRenderer.invoke(IpcChannels.LibraryDeletePlaylist, playlistId),
    getPlaylist: (playlistId) => ipcRenderer.invoke(IpcChannels.LibraryGetPlaylist, playlistId),
    getPlaylistItems: (playlistId, query) => ipcRenderer.invoke(IpcChannels.LibraryGetPlaylistItems, playlistId, query),
    exportPlaylist: (request) => ipcRenderer.invoke(IpcChannels.LibraryExportPlaylist, request),
    addTrackToPlaylist: (playlistId, trackId) => ipcRenderer.invoke(IpcChannels.LibraryAddTrackToPlaylist, playlistId, trackId),
    addStreamingTrackToPlaylist: (playlistId, track) => ipcRenderer.invoke(IpcChannels.LibraryAddStreamingTrackToPlaylist, playlistId, track),
    addTracksToPlaylist: (playlistId, trackIds) => ipcRenderer.invoke(IpcChannels.LibraryAddTracksToPlaylist, playlistId, trackIds),
    removePlaylistItem: (itemId) => ipcRenderer.invoke(IpcChannels.LibraryRemovePlaylistItem, itemId),
    movePlaylistItem: (playlistId, itemId, targetPosition) =>
      ipcRenderer.invoke(IpcChannels.LibraryMovePlaylistItem, playlistId, itemId, targetPosition),
    clearPlaylist: (playlistId) => ipcRenderer.invoke(IpcChannels.LibraryClearPlaylist, playlistId),
    getLikedSongsPlaylist: () => ipcRenderer.invoke(IpcChannels.LibraryGetLikedSongsPlaylist),
    getLikedAlbumsPlaylist: () => ipcRenderer.invoke(IpcChannels.LibraryGetLikedAlbumsPlaylist),
    getLikedTracks: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetLikedTracks, query),
    getLikedAlbums: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetLikedAlbums, query),
    isTrackLiked: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryIsTrackLiked, trackId),
    isAlbumLiked: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryIsAlbumLiked, albumId),
    getLikedTrackIds: (trackIds) => ipcRenderer.invoke(IpcChannels.LibraryGetLikedTrackIds, trackIds),
    getLikedAlbumIds: (albumIds) => ipcRenderer.invoke(IpcChannels.LibraryGetLikedAlbumIds, albumIds),
    likeTrack: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryLikeTrack, trackId),
    unlikeTrack: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryUnlikeTrack, trackId),
    toggleTrackLiked: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryToggleTrackLiked, trackId),
    likeAlbum: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryLikeAlbum, albumId),
    unlikeAlbum: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryUnlikeAlbum, albumId),
    toggleAlbumLiked: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryToggleAlbumLiked, albumId),
    clearLikedTracks: () => ipcRenderer.invoke(IpcChannels.LibraryClearLikedTracks),
    clearLikedAlbums: () => ipcRenderer.invoke(IpcChannels.LibraryClearLikedAlbums),
    getAlbums: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetAlbums, query),
    getAlbum: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryGetAlbum, albumId),
    getArtists: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetArtists, query),
    getArtist: (artistId) => ipcRenderer.invoke(IpcChannels.LibraryGetArtist, artistId),
    getArtistTracks: (artistId, query) => ipcRenderer.invoke(IpcChannels.LibraryGetArtistTracks, artistId, query),
    getArtistAlbums: (artistId, query) => ipcRenderer.invoke(IpcChannels.LibraryGetArtistAlbums, artistId, query),
    getAlbumTracks: (albumId, query) => ipcRenderer.invoke(IpcChannels.LibraryGetAlbumTracks, albumId, query),
    getSummary: () => ipcRenderer.invoke(IpcChannels.LibraryGetSummary),
    refreshAlbumGrouping: () => ipcRenderer.invoke(IpcChannels.LibraryRefreshAlbumGrouping),
    getDiagnostics: () => ipcRenderer.invoke(IpcChannels.LibraryGetDiagnostics),
    chooseTrackCover: () => ipcRenderer.invoke(IpcChannels.LibraryChooseTrackCover),
    loadEmbeddedTrackTags: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryLoadEmbeddedTrackTags, trackId),
    updateTrackTags: (request) => ipcRenderer.invoke(IpcChannels.LibraryUpdateTrackTags, request),
    updateAlbumTags: (request) => ipcRenderer.invoke(IpcChannels.LibraryUpdateAlbumTags, request),
    recordTrackPlayback: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryRecordTrackPlayback, trackId),
    getPlaybackHistory: (query) => ipcRenderer.invoke(IpcChannels.LibraryGetPlaybackHistory, query),
    getPlaybackHistorySummary: () => ipcRenderer.invoke(IpcChannels.LibraryGetPlaybackHistorySummary),
    deletePlaybackHistoryEntry: (id) => ipcRenderer.invoke(IpcChannels.LibraryDeletePlaybackHistoryEntry, id),
    clearPlaybackHistory: () => ipcRenderer.invoke(IpcChannels.LibraryClearPlaybackHistory),
    startPlaybackHistory: (request) => ipcRenderer.invoke(IpcChannels.LibraryStartPlaybackHistory, request),
    finishPlaybackHistory: (request) => ipcRenderer.invoke(IpcChannels.LibraryFinishPlaybackHistory, request),
    openTrackInFolder: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryOpenTrackInFolder, trackId),
    openPathInFolder: (path) => ipcRenderer.invoke(IpcChannels.LibraryOpenPathInFolder, path),
    openTrackWithSystem: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryOpenTrackWithSystem, trackId),
    copyTrackPath: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryCopyTrackPath, trackId),
    copyTrackNameArtist: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryCopyTrackNameArtist, trackId),
    copyTrackCover: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryCopyTrackCover, trackId),
    saveTrackCover: (trackId) => ipcRenderer.invoke(IpcChannels.LibrarySaveTrackCover, trackId),
    deleteTrackFile: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryDeleteTrackFile, trackId),
    copyAlbumInfo: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryCopyAlbumInfo, albumId),
    copyAlbumCover: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryCopyAlbumCover, albumId),
    saveAlbumCover: (albumId) => ipcRenderer.invoke(IpcChannels.LibrarySaveAlbumCover, albumId),
    deleteAlbumFiles: (albumId) => ipcRenderer.invoke(IpcChannels.LibraryDeleteAlbumFiles, albumId),
    pruneMissingTracks: () => ipcRenderer.invoke(IpcChannels.LibraryPruneMissingTracks),
    clearTracks: () => ipcRenderer.invoke(IpcChannels.LibraryClearTracks),
    clearCache: () => ipcRenderer.invoke(IpcChannels.LibraryClearCache),
    repairMissingMetadata: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryNetworkRepairMissingMetadata, trackId),
    scanMissingMetadata: (options) => ipcRenderer.invoke(IpcChannels.LibraryNetworkScanMissingMetadata, options),
    startMissingMetadataScan: (options) => ipcRenderer.invoke(IpcChannels.LibraryNetworkStartMissingMetadataScan, options),
    getMissingMetadataScanStatus: (jobId) => ipcRenderer.invoke(IpcChannels.LibraryNetworkGetMissingMetadataScanStatus, jobId),
    showNetworkCandidates: (trackId) => ipcRenderer.invoke(IpcChannels.LibraryNetworkShowCandidates, trackId),
    searchNetworkTagCandidates: (trackId, options) =>
      ipcRenderer.invoke(IpcChannels.LibrarySearchNetworkTagCandidates, { trackId, ...options }),
    applyNetworkMissingOnly: (candidateId, options) =>
      ipcRenderer.invoke(IpcChannels.LibraryNetworkApplyMissingOnly, { candidateId, ...options }),
    applyNetworkSelected: (candidateId, options) =>
      ipcRenderer.invoke(IpcChannels.LibraryNetworkApplySelected, { candidateId, ...options }),
    rejectNetworkCandidate: (candidateId) => ipcRenderer.invoke(IpcChannels.LibraryNetworkRejectCandidate, candidateId),
    startBpmAnalysis: (options) => ipcRenderer.invoke(IpcChannels.LibraryStartBpmAnalysis, options),
    getBpmAnalysisStatus: (jobId) => ipcRenderer.invoke(IpcChannels.LibraryGetBpmAnalysisStatus, jobId),
  },
  playback: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.PlaybackGetStatus),
    playLocalFile: (request) => ipcRenderer.invoke(IpcChannels.PlaybackPlayLocalFile, request),
    playMediaItem: (request) => ipcRenderer.invoke(IpcChannels.PlaybackPlayMediaItem, request),
    prepareMediaItem: (request) => ipcRenderer.invoke(IpcChannels.PlaybackPrepareMediaItem, request),
    prepareLocalFile: (request) => ipcRenderer.invoke(IpcChannels.PlaybackPrepareLocalFile, request),
    play: () => ipcRenderer.invoke(IpcChannels.PlaybackPlay),
    pause: () => ipcRenderer.invoke(IpcChannels.PlaybackPause),
    stop: () => ipcRenderer.invoke(IpcChannels.PlaybackStop),
    seek: (positionSeconds) => ipcRenderer.invoke(IpcChannels.PlaybackSeek, positionSeconds),
    openLocalAudioFile: () => ipcRenderer.invoke(IpcChannels.PlaybackOpenLocalAudioFile),
    openLocalAudioFiles: () => ipcRenderer.invoke(IpcChannels.PlaybackOpenLocalAudioFiles),
    resolveLocalAudioFiles: (paths) => ipcRenderer.invoke(IpcChannels.PlaybackResolveLocalAudioFiles, paths),
    onLocalAudioFilesOpened: (handler) => {
      localAudioFileOpenHandlers.add(handler);
      for (const paths of pendingLocalAudioFileOpenEvents.splice(0)) {
        handler(paths);
      }

      return () => {
        localAudioFileOpenHandlers.delete(handler);
      };
    },
  },
  remoteSources: {
    list: () => ipcRenderer.invoke(IpcChannels.RemoteSourcesList),
    create: (input) => ipcRenderer.invoke(IpcChannels.RemoteSourcesCreate, input),
    update: (input) => ipcRenderer.invoke(IpcChannels.RemoteSourcesUpdate, input),
    delete: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesDelete, sourceId),
    test: (sourceIdOrInput) => ipcRenderer.invoke(IpcChannels.RemoteSourcesTest, sourceIdOrInput),
    browse: (sourceId, path) => ipcRenderer.invoke(IpcChannels.RemoteSourcesBrowse, sourceId, path),
    sync: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesSync, sourceId),
    cancelSync: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesCancelSync, sourceId),
    getSyncStatus: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesGetSyncStatus, sourceId),
    createStreamUrl: (input) => ipcRenderer.invoke(IpcChannels.RemoteSourcesCreateStreamUrl, input),
    startBackgroundJobs: (sourceId, kinds) => ipcRenderer.invoke(IpcChannels.RemoteSourcesStartBackgroundJobs, sourceId, kinds),
    pauseBackgroundJobs: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesPauseBackgroundJobs, sourceId),
    getJobStatus: (sourceId) => ipcRenderer.invoke(IpcChannels.RemoteSourcesGetJobStatus, sourceId),
    retryFailedJobs: (sourceId, kinds) => ipcRenderer.invoke(IpcChannels.RemoteSourcesRetryFailedJobs, sourceId, kinds),
    setBackgroundPaused: (paused) => ipcRenderer.invoke(IpcChannels.RemoteSourcesSetBackgroundPaused, paused),
    getBackgroundGlobalStatus: () => ipcRenderer.invoke(IpcChannels.RemoteSourcesGetBackgroundGlobalStatus),
    updateRuntimeLimits: (sourceId, limits) => ipcRenderer.invoke(IpcChannels.RemoteSourcesUpdateRuntimeLimits, sourceId, limits),
  },
  streaming: {
    search: (request) => ipcRenderer.invoke(IpcChannels.StreamingSearch, request),
    getTrack: (request) => ipcRenderer.invoke(IpcChannels.StreamingGetTrack, request),
    resolvePlayback: (request) => ipcRenderer.invoke(IpcChannels.StreamingResolvePlayback, request),
    analyzeBpm: (request) => ipcRenderer.invoke(IpcChannels.StreamingAnalyzeBpm, request),
    getLyrics: (request) => ipcRenderer.invoke(IpcChannels.StreamingGetLyrics, request),
    getMv: (request) => ipcRenderer.invoke(IpcChannels.StreamingGetMv, request),
    getProviders: () => ipcRenderer.invoke(IpcChannels.StreamingGetProviders),
    importPlaylistFromUrl: (url) => ipcRenderer.invoke(IpcChannels.StreamingImportPlaylistFromUrl, url),
    refreshNeteaseDailyRecommend: () => ipcRenderer.invoke(IpcChannels.StreamingRefreshNeteaseDailyRecommend),
  },
  lyrics: {
    getForTrack: (trackId) => ipcRenderer.invoke(IpcChannels.LyricsGetForTrack, trackId),
    searchCandidates: (trackId, searchText) => ipcRenderer.invoke(IpcChannels.LyricsSearchCandidates, trackId, searchText),
    applyCandidate: (trackId, candidateId) => ipcRenderer.invoke(IpcChannels.LyricsApplyCandidate, trackId, candidateId),
    applyCustomLrc: (trackId, lrcText, fileName) => ipcRenderer.invoke(IpcChannels.LyricsApplyCustomLrc, trackId, lrcText, fileName),
    rejectCandidate: (candidateId) => ipcRenderer.invoke(IpcChannels.LyricsRejectCandidate, candidateId),
    setOffset: (trackId, offsetMs) => ipcRenderer.invoke(IpcChannels.LyricsSetOffset, trackId, offsetMs),
    clearCache: (trackId) => ipcRenderer.invoke(IpcChannels.LyricsClearCache, trackId),
  },
  mv: {
    getSelected: (trackId) => ipcRenderer.invoke(IpcChannels.MvGetSelected, trackId),
    getSettings: () => ipcRenderer.invoke(IpcChannels.MvGetSettings),
    setSettings: (patch) => ipcRenderer.invoke(IpcChannels.MvSetSettings, patch),
    findLocalCandidates: (trackId) => ipcRenderer.invoke(IpcChannels.MvFindLocalCandidates, trackId),
    searchNetworkCandidates: (trackId, query) => ipcRenderer.invoke(IpcChannels.MvSearchNetworkCandidates, trackId, query),
    searchNetworkCandidatesForSnapshot: (request) => ipcRenderer.invoke(IpcChannels.MvSearchNetworkCandidatesForSnapshot, request),
    getCandidates: (trackId) => ipcRenderer.invoke(IpcChannels.MvGetCandidates, trackId),
    resolveStreams: (videoId) => ipcRenderer.invoke(IpcChannels.MvResolveStreams, videoId),
    setQuality: (videoId, qualityId) => ipcRenderer.invoke(IpcChannels.MvSetQuality, videoId, qualityId),
    chooseLocalVideo: (trackId) => ipcRenderer.invoke(IpcChannels.MvChooseLocalVideo, trackId),
    bindLocalVideo: (trackId, filePath) => ipcRenderer.invoke(IpcChannels.MvBindLocalVideo, trackId, filePath),
    bindUrl: (trackId, url) => ipcRenderer.invoke(IpcChannels.MvBindUrl, trackId, url),
    selectVideo: (trackId, videoId) => ipcRenderer.invoke(IpcChannels.MvSelectVideo, trackId, videoId),
    clearSelected: (trackId) => ipcRenderer.invoke(IpcChannels.MvClearSelected, trackId),
    openExternal: (videoId) => ipcRenderer.invoke(IpcChannels.MvOpenExternal, videoId),
  },
  smtc: {
    onCommand: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, command: SmtcCommand): void => {
        handler(command);
      };
      ipcRenderer.on(IpcChannels.SmtcCommand, listener);
      return () => ipcRenderer.off(IpcChannels.SmtcCommand, listener);
    },
  },
  discordPresence: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.DiscordPresenceGetStatus),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.DiscordPresenceSetEnabled, enabled),
  },
  lastfm: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.LastFmGetStatus),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.LastFmSetEnabled, enabled),
    setNowPlayingEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.LastFmSetNowPlayingEnabled, enabled),
    setScrobbleEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.LastFmSetScrobbleEnabled, enabled),
    createAuthToken: () => ipcRenderer.invoke(IpcChannels.LastFmCreateAuthToken),
    openAuthUrl: (token) => ipcRenderer.invoke(IpcChannels.LastFmOpenAuthUrl, token),
    completeAuth: (token) => ipcRenderer.invoke(IpcChannels.LastFmCompleteAuth, token),
    authenticatePassword: (username, password) => ipcRenderer.invoke(IpcChannels.LastFmAuthenticatePassword, username, password),
    disconnect: () => ipcRenderer.invoke(IpcChannels.LastFmDisconnect),
  },
  audio: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.AudioGetStatus),
    getDiagnostics: () => ipcRenderer.invoke(IpcChannels.AudioGetDiagnostics),
    onStatus: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown): void => {
        handler(status as Awaited<ReturnType<EchoApi['audio']['getStatus']>>);
      };
      ipcRenderer.on(IpcChannels.AudioStatus, listener);
      return () => ipcRenderer.off(IpcChannels.AudioStatus, listener);
    },
    listDevices: () => ipcRenderer.invoke(IpcChannels.AudioListDevices),
    setOutput: (settings) => ipcRenderer.invoke(IpcChannels.AudioSetOutput, settings),
  },
  diagnostics: {
    getLastCrashSummary: () => ipcRenderer.invoke(IpcChannels.DiagnosticsGetLastCrashSummary),
    clearLastCrashSummary: () => ipcRenderer.invoke(IpcChannels.DiagnosticsClearLastCrashSummary),
    exportDiagnostics: () => ipcRenderer.invoke(IpcChannels.DiagnosticsExport),
    openDiagnosticsFolder: () => ipcRenderer.invoke(IpcChannels.DiagnosticsOpenFolder),
    openCrashReport: () => ipcRenderer.invoke(IpcChannels.DiagnosticsOpenCrashReport),
    openAudioCrashReport: () => ipcRenderer.invoke(IpcChannels.DiagnosticsOpenAudioCrashReport),
    reportRendererError: (payload) => ipcRenderer.invoke(IpcChannels.DiagnosticsReportRendererError, payload),
  },
  downloads: {
    getJobs: () => ipcRenderer.invoke(IpcChannels.DownloadsGetJobs),
    createUrlJob: (url, options) => ipcRenderer.invoke(IpcChannels.DownloadsCreateUrlJob, url, options),
    cancelJob: (jobId) => ipcRenderer.invoke(IpcChannels.DownloadsCancelJob, jobId),
    clearCompleted: () => ipcRenderer.invoke(IpcChannels.DownloadsClearCompleted),
    getSettings: () => ipcRenderer.invoke(IpcChannels.DownloadsGetSettings),
    setSettings: (patch) => ipcRenderer.invoke(IpcChannels.DownloadsSetSettings, patch),
    chooseOutputDirectory: () => ipcRenderer.invoke(IpcChannels.DownloadsChooseOutputDirectory),
    search: (request) => ipcRenderer.invoke(IpcChannels.DownloadsSearch, request),
    checkTools: () => ipcRenderer.invoke(IpcChannels.DownloadsCheckTools),
    onJobsUpdated: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, jobs: unknown): void => {
        handler(jobs as Awaited<ReturnType<EchoApi['downloads']['getJobs']>>);
      };
      ipcRenderer.on(IpcChannels.DownloadsJobsUpdated, listener);
      return () => ipcRenderer.off(IpcChannels.DownloadsJobsUpdated, listener);
    },
  },
  accounts: {
    getStatuses: () => ipcRenderer.invoke(IpcChannels.AccountGetStatuses),
    getStatus: (provider) => ipcRenderer.invoke(IpcChannels.AccountGetStatus, provider),
    saveCookie: (provider, cookie) => ipcRenderer.invoke(IpcChannels.AccountSaveCookie, provider, cookie),
    startLogin: (provider) => ipcRenderer.invoke(IpcChannels.AccountStartLogin, provider),
    clear: (provider) => ipcRenderer.invoke(IpcChannels.AccountClear, provider),
    check: (provider) => ipcRenderer.invoke(IpcChannels.AccountCheck, provider),
    checkAll: () => ipcRenderer.invoke(IpcChannels.AccountCheckAll),
    setYouTubeBrowser: (browser) => ipcRenderer.invoke(IpcChannels.AccountSetYouTubeBrowser, browser),
  },
  eq: {
    getState: () => ipcRenderer.invoke(IpcChannels.EqGetState),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannels.EqSetEnabled, enabled),
    setBandGain: (request) => ipcRenderer.invoke(IpcChannels.EqSetBandGain, request),
    setBandFrequency: (request) => ipcRenderer.invoke(IpcChannels.EqSetBandFrequency, request),
    setPreamp: (preampDb) => ipcRenderer.invoke(IpcChannels.EqSetPreamp, preampDb),
    setPreset: (presetId) => ipcRenderer.invoke(IpcChannels.EqSetPreset, presetId),
    reset: () => ipcRenderer.invoke(IpcChannels.EqReset),
    listPresets: () => ipcRenderer.invoke(IpcChannels.EqListPresets),
    savePreset: (request) => ipcRenderer.invoke(IpcChannels.EqSavePreset, request),
    deletePreset: (presetId) => ipcRenderer.invoke(IpcChannels.EqDeletePreset, presetId),
    getChannelBalanceState: () => ipcRenderer.invoke(IpcChannels.ChannelBalanceGetState),
    setChannelBalanceState: (patch) => ipcRenderer.invoke(IpcChannels.ChannelBalanceSetState, patch),
    resetChannelBalance: () => ipcRenderer.invoke(IpcChannels.ChannelBalanceReset),
  },
};

contextBridge.exposeInMainWorld('echo', echoApi);
