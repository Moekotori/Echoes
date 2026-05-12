export type LibrarySummary = {
  songCount: number;
  albumCount: number;
  artistCount: number;
  folderCount: number;
  totalDuration: number;
  lastScanAt: string | null;
};

export type LibraryCleanupResult = {
  scannedCount: number;
  removedCount: number;
};

export type LibraryDiagnostics = {
  foldersCount: number;
  tracksCount: number;
  albumsCount: number;
  artistsCount: number;
  coversCount: number;
  lastScan: {
    status: LibraryScanStatus['status'];
    phase: LibraryScanStatus['phase'];
    discoveredCount: number;
    parsedCount: number;
    skippedCount: number;
    coverCount: number;
    errorCount: number;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
  lastQueryMs: {
    getTracks: number | null;
    getAlbums: number | null;
  };
  averageAlbumPayloadBytes: number | null;
  databasePath: string | null;
  databaseSizeBytes: number | null;
  coverCachePath: string | null;
  coverCacheSizeBytes: number | null;
  coverCacheVersion: number;
};

export type LibraryFolder = {
  id: string;
  path: string;
  name: string;
  status: 'active' | 'removed';
  createdAt: string;
  updatedAt: string;
};

export type LibraryScanStatus = {
  id: string;
  folderId: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  phase:
    | 'queued'
    | 'discovering'
    | 'checking_cache'
    | 'reading_metadata'
    | 'extracting_covers'
    | 'grouping_albums'
    | 'writing_database'
    | 'finished'
    | 'failed'
    | 'cancelled';
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  addedTracks: number;
  updatedTracks: number;
  removedTracks: number;
  coverCount?: number;
  errorCount: number;
  errors: string[];
  startedAt: string | null;
  finishedAt: string | null;
};

export type LibrarySort =
  | 'default'
  | 'createdAsc'
  | 'createdDesc'
  | 'titleAsc'
  | 'titleDesc'
  | 'durationAsc'
  | 'durationDesc'
  | 'qualityAsc'
  | 'qualityDesc'
  | 'frequent'
  | 'random'
  | 'title'
  | 'artist'
  | 'album'
  | 'recent';

export type LibraryPageQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: LibrarySort;
};

export type PlaybackHistoryEntry = {
  id: string;
  trackId: string | null;
  trackPath: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  coverId: string | null;
  coverThumb: string | null;
  startedAt: string;
  endedAt: string | null;
  playedSeconds: number;
  durationSeconds: number;
  playCount: number;
  completed: boolean;
  sourceType: string | null;
  sourceLabel: string | null;
  queueId: string | null;
};

export type PlaybackHistoryQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  completedOnly?: boolean;
};

export type StartPlaybackHistoryRequest = {
  trackId: string;
  sourceType?: string | null;
  sourceLabel?: string | null;
  queueId?: string | null;
};

export type StartPlaybackHistoryResult = {
  historyId: string;
};

export type FinishPlaybackHistoryRequest = {
  historyId: string;
  playedSeconds: number;
  completed?: boolean;
  endedAt?: string;
};

export type PlaybackHistorySummary = {
  todayCount: number;
  todayPlayedSeconds: number;
  totalCount: number;
  latestPlayedAt: string | null;
};

export type LibraryTrack = {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  duration: number;
  codec: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  coverId: string | null;
  // Small list thumbnail: echo-cover://thumb/* resolves to thumb.webp (96x96).
  coverThumb: string | null;
  metadataStatus?: string;
  embeddedMetadataStatus?: 'pending' | 'reading' | 'present' | 'missing' | 'error';
  embeddedCoverStatus?: 'pending' | 'reading' | 'present' | 'missing' | 'error';
  networkMetadataStatus?: 'none' | 'pending' | 'candidate_found' | 'applied_missing_only' | 'rejected' | 'error';
  fieldSources: Record<string, string>;
};

export type EditableTrackTags = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
};

export type TrackCoverSelection = {
  path: string;
  mimeType: string;
  dataUrl: string;
};

export type EmbeddedTrackTagsLoadResult = {
  tags: EditableTrackTags;
  coverId: string | null;
  coverThumb: string | null;
};

export type LibraryTrackTagUpdateRequest = {
  trackId: string;
  tags: EditableTrackTags;
  coverPath?: string | null;
  coverUrl?: string | null;
  coverMimeType?: string | null;
};

export type NetworkTagProvider = 'netease-cloud-music' | 'qq-music' | 'musicbrainz' | 'cover-art-archive' | 'mock';

export type NetworkTagCandidate = {
  id: string;
  provider: NetworkTagProvider;
  confidence: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  duration: number | null;
  coverUrl?: string | null;
  coverMimeType?: string | null;
  coverPreviewUrl?: string | null;
  raw?: unknown;
};

export type NetworkTagCandidateSearchRequest = {
  trackId: string;
  query?: string;
  providers?: NetworkTagProvider[];
};

export type LibraryAlbum = {
  id: string;
  albumKey: string;
  title: string;
  albumArtist: string;
  year: number | null;
  trackCount: number;
  duration: number;
  coverId: string | null;
  // Album wall thumbnail: echo-cover://album/* resolves to album.webp (320x320).
  coverThumb: string | null;
};

export type LibraryArtist = {
  id: string;
  name: string;
  sortName: string;
  role: 'track' | 'album' | 'both';
  trackCount: number;
  albumCount: number;
  coverId: string | null;
  coverThumb: string | null;
};

export type LibraryPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type NetworkMetadataCandidate = {
  id: string;
  trackId: string;
  albumId: string | null;
  provider: string;
  providerItemId: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
  genre: string | null;
  duration: number | null;
  trackNo: number | null;
  discNo: number | null;
  coverUrl: string | null;
  score: number;
  createdAt: string;
};

export type NetworkCoverCandidate = {
  id: string;
  trackId: string | null;
  albumId: string | null;
  provider: string;
  coverUrl: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  score: number;
  cachedThumbPath: string | null;
  cachedLargePath: string | null;
  createdAt: string;
};

export type NetworkCandidateList = {
  metadata: NetworkMetadataCandidate[];
  covers: NetworkCoverCandidate[];
};

export type NetworkApplyResult = {
  status: 'none' | 'pending' | 'candidate_found' | 'applied_missing_only' | 'rejected' | 'error';
  appliedFields: Record<string, string | number | null>;
  reason?: string;
};

export type NetworkRepairResult = NetworkCandidateList & {
  applied: NetworkApplyResult[];
  errors: string[];
};

export type MissingMetadataField =
  | 'cover'
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'trackNo'
  | 'discNo'
  | 'year'
  | 'genre';

export type MissingMetadataScanOptions = {
  limit?: number;
  fields?: MissingMetadataField[];
};

export type MissingMetadataReason =
  | 'missing_cover'
  | 'missing_title'
  | 'missing_artist'
  | 'missing_album'
  | 'missing_album_artist'
  | 'missing_track_no'
  | 'missing_disc_no'
  | 'missing_year'
  | 'missing_genre'
  | 'unknown_artist'
  | 'filename_fallback'
  | 'unknown_field';

export type MissingMetadataScanItem = {
  track: LibraryTrack;
  reasons: MissingMetadataReason[];
  candidates: NetworkCandidateList;
};

export type MissingMetadataScanResult = {
  items: MissingMetadataScanItem[];
  scannedCount: number;
  candidateCount: number;
  errors: string[];
};

export type NetworkMetadataScanJobStatus = MissingMetadataScanResult & {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  totalTracks: number;
  processedTracks: number;
  startedAt: string;
  finishedAt: string | null;
  currentTrackTitle: string | null;
};
