export type StreamingProviderName = 'mock' | 'netease' | 'qqmusic' | 'bilibili';

export type StreamingMediaType = 'track' | 'album' | 'artist' | 'playlist' | 'mv';

export type StreamingAudioQuality = 'standard' | 'high' | 'lossless' | 'hires';

export type StreamingLyricsStatus = 'unknown' | 'available' | 'missing';
export type StreamingMvStatus = 'unknown' | 'available' | 'missing';

export const streamingProviderNames: StreamingProviderName[] = [
  'mock',
  'netease',
  'qqmusic',
  'bilibili',
];

export const streamingStableKey = (provider: StreamingProviderName, providerTrackId: string): string =>
  `streaming:${provider}:${providerTrackId}`;

export type StreamingArtistRef = {
  id: string;
  provider: StreamingProviderName;
  providerArtistId: string;
  name: string;
};

export type StreamingTrack = {
  id: string;
  provider: StreamingProviderName;
  providerTrackId: string;
  stableKey: string;
  title: string;
  artist: string;
  artists: StreamingArtistRef[];
  album: string;
  albumId: string | null;
  albumArtist: string | null;
  duration: number | null;
  coverUrl: string | null;
  coverThumb: string | null;
  qualities: StreamingAudioQuality[];
  explicit: boolean;
  playable: boolean;
  unavailableReason: string | null;
  lyricsStatus: StreamingLyricsStatus;
  mvStatus: StreamingMvStatus;
};

export type StreamingAlbum = {
  id: string;
  provider: StreamingProviderName;
  providerAlbumId: string;
  title: string;
  artist: string;
  artists: StreamingArtistRef[];
  coverUrl: string | null;
  coverThumb: string | null;
  releaseDate: string | null;
  trackCount: number | null;
};

export type StreamingAlbumDetail = StreamingAlbum & {
  tracks: StreamingTrack[];
};

export type StreamingArtist = {
  id: string;
  provider: StreamingProviderName;
  providerArtistId: string;
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
};

export type StreamingArtistDetail = StreamingArtist & {
  topTracks: StreamingTrack[];
  albums: StreamingAlbum[];
};

export type StreamingPlaylist = {
  id: string;
  provider: StreamingProviderName;
  providerPlaylistId: string;
  title: string;
  description: string | null;
  creator: string | null;
  coverUrl: string | null;
  coverThumb: string | null;
  trackCount: number | null;
};

export type StreamingPlaylistDetail = StreamingPlaylist & {
  tracks: StreamingTrack[];
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
};

export type StreamingSearchRequest = {
  provider: StreamingProviderName;
  query: string;
  mediaTypes?: StreamingMediaType[];
  page?: number;
  pageSize?: number;
};

export type StreamingSearchResult = {
  provider: StreamingProviderName;
  query: string;
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  tracks: StreamingTrack[];
  albums: StreamingAlbum[];
  artists: StreamingArtist[];
  playlists: StreamingPlaylist[];
  mvs: StreamingMvItem[];
  cached?: boolean;
};

export type StreamingPlaybackRequest = {
  provider: StreamingProviderName;
  providerTrackId: string;
  quality?: StreamingAudioQuality;
};

export type StreamingPlaybackSource = {
  provider: StreamingProviderName;
  providerTrackId: string;
  url: string;
  expiresAt: string | null;
  mimeType: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  codec: string | null;
  headers: Record<string, string>;
  requiresProxy: boolean;
  supportsRange: boolean;
};

export type StreamingLyricsLine = {
  timeMs: number | null;
  text: string;
};

export type StreamingLyricsResult = {
  provider: StreamingProviderName;
  providerTrackId: string;
  status: StreamingLyricsStatus;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  lines: StreamingLyricsLine[];
  sourceLabel: string | null;
};

export type StreamingMvItem = {
  id: string;
  provider: StreamingProviderName;
  providerMvId: string;
  providerTrackId: string | null;
  title: string;
  artist: string;
  duration: number | null;
  thumbnailUrl: string | null;
};

export type StreamingMvResult = {
  provider: StreamingProviderName;
  providerTrackId: string;
  status: StreamingMvStatus;
  items: StreamingMvItem[];
};

export type StreamingProviderDescriptor = {
  name: StreamingProviderName;
  displayName: string;
  enabled: boolean;
  supportsSearch: boolean;
  supportsPlayback?: boolean;
  supportsLyrics: boolean;
  supportsMv: boolean;
  requiresAccount: boolean;
  accountConnected?: boolean;
  accountDisplayName?: string | null;
  accountUsername?: string | null;
  accountAvatarUrl?: string | null;
  status?: 'ready' | 'needs_account' | 'disabled' | 'error';
  statusMessage?: string | null;
};
