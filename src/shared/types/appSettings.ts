import type { ChannelBalanceState, PlaybackSpeedMode } from './audio';

export type AppSettings = {
  albumMergeStrategy: 'standard' | 'sameTitleAndCover';
  artistWallAlbumArtwork: boolean;
  coverCacheDir: string | null;
  hideToTrayOnClose: boolean;
  networkMetadataEnabled: boolean;
  networkMetadataProviders: Array<'mock' | 'musicbrainz' | 'cover-art-archive' | 'netease-cloud-music' | 'qq-music'>;
  channelBalance: ChannelBalanceState;
  playerVolume: number;
  playbackSpeed: number;
  playbackSpeedMode: PlaybackSpeedMode;
};
