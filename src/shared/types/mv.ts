export type MvProvider = 'local' | 'bilibili' | 'youtube' | 'netease' | 'qqmusic';

export type MvProviderId = MvProvider;

export type MvSourceType = 'sidecar' | 'manual' | 'search_candidate' | 'stream';

export type NetworkMvProviderId = Extract<MvProviderId, 'bilibili' | 'youtube'>;

export type MvQualityTier = 'auto' | '720p' | '1080p' | '1440p' | '2160p';
export type MvMaxQuality = Exclude<MvQualityTier, 'auto'> | 'max';

export type MvStreamProtocol = 'direct' | 'dash' | 'hls' | 'external';

export type MvQualityVariant = {
  id: string;
  label: string;
  qualityTier: MvQualityTier;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  container: string | null;
  mimeType: string | null;
  protocol: MvStreamProtocol;
  playableInApp: boolean;
  requiresAccount: boolean;
  expiresAt: string | null;
};

export type MvSettings = {
  autoSearch: boolean;
  autoPreload: boolean;
  restartAudioOnLoad: boolean;
  enabledProviders: NetworkMvProviderId[];
  providerOrder: NetworkMvProviderId[];
  maxQuality: MvMaxQuality;
  allow60fps: boolean;
};

export type MvResolvedStreams = {
  video: TrackVideo;
  variants: MvQualityVariant[];
};

export type TrackVideo = {
  id: string;
  trackId: string;
  provider: MvProviderId;
  sourceType: MvSourceType;
  sourceId: string | null;
  title: string | null;
  artist: string | null;
  url: string | null;
  providerUrl: string | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  selectedQualityId: string | null;
  qualityLabel: string | null;
  fps: number | null;
  score: number;
  selected: boolean;
  playableInApp: boolean;
  rawProviderJson: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type MvMatchCandidate = {
  id: string;
  provider: MvProviderId;
  sourceType: MvSourceType;
  title: string;
  artist: string | null;
  filePath: string | null;
  url: string | null;
  providerUrl: string | null;
  thumbnailUrl: string | null;
  uploader: string | null;
  viewCount?: number | null;
  availableQualities: MvQualityVariant[];
  durationSeconds: number | null;
  score: number;
  playableInApp: boolean;
  reasons: string[];
};

export type MvMatchSummary = {
  trackId: string;
  selected: TrackVideo | null;
  candidates: MvMatchCandidate[];
};

export type MvOnlineProvider = {
  id: NetworkMvProviderId;
  search: (track: unknown, queryOverride?: string) => Promise<MvMatchCandidate[]>;
  resolve: (video: TrackVideo, settings: MvSettings) => Promise<MvQualityVariant[]>;
};
