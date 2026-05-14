export type DownloadJobStatus =
  | 'queued'
  | 'probing'
  | 'downloading'
  | 'extracting_audio'
  | 'importing'
  | 'binding_mv'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DownloadSourceProvider = 'youtube' | 'bilibili' | 'unknown';

export type DownloadAudioStrategy = 'best_available';

export type DownloadSettings = {
  audioStrategy: DownloadAudioStrategy;
  importToLibrary: boolean;
  bindMvAfterImport: boolean;
  outputDirectory: string | null;
};

export type DownloadJob = {
  id: string;
  sourceUrl: string;
  provider: DownloadSourceProvider;
  audioStrategy: DownloadAudioStrategy;
  status: DownloadJobStatus;
  title: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  webpageUrl: string | null;
  outputPath: string | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
  importedTrackId: string | null;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateDownloadUrlJobOptions = Partial<Pick<DownloadSettings, 'importToLibrary' | 'bindMvAfterImport'>>;

export type DownloadToolsStatus = {
  ytDlpAvailable: boolean;
  ffmpegAvailable: boolean;
  ytDlpVersion: string | null;
  ytDlpPath: string | null;
  ffmpegPath: string | null;
};
