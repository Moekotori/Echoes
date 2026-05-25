type EchoPluginPermission =
  /** Active: read the current playback state snapshot. */
  | 'playback:read'
  /** Active: play, pause, stop, or seek. */
  | 'playback:control'
  /** Active: read library summaries and paged public track fields. */
  | 'library:read'
  /** Reserved in v1: declared for forward compatibility, but no write API is exposed. */
  | 'library:write'
  /** Active: read an application settings snapshot. */
  | 'settings:read'
  /** Active high-risk permission: write a small settings patch, not a full settings object. */
  | 'settings:write'
  /** Reserved in v1: declared for forward compatibility, but no network API is exposed. */
  | 'network'
  /** Limited in v1: use echo.storage only; no arbitrary file API is exposed. */
  | 'fs:plugin';

type EchoPluginEventName = 'playback:status' | 'library:changed';

type EchoPlaybackStatus = {
  host?: string;
  state: string;
  currentTrackId: string | null;
  currentFilePath?: string | null;
  durationSeconds?: number;
  positionSeconds?: number;
  volume?: number;
};

type EchoPluginTrackField =
  | 'id'
  | 'mediaType'
  | 'path'
  | 'sourceId'
  | 'provider'
  | 'remotePath'
  | 'stableKey'
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'trackNo'
  | 'discNo'
  | 'year'
  | 'genre'
  | 'duration'
  | 'codec'
  | 'sampleRate'
  | 'bitDepth'
  | 'bitrate'
  | 'bpm'
  | 'coverId'
  | 'coverThumb'
  | 'metadataStatus'
  | 'embeddedMetadataStatus'
  | 'embeddedCoverStatus'
  | 'networkMetadataStatus'
  | 'fieldSources'
  | 'unavailable';

type EchoPluginTrack = Partial<Record<EchoPluginTrackField, unknown>> & {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverThumb?: string | null;
  unavailable?: boolean;
};

type EchoPluginMetadataLookupTrack = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  duration?: number;
};

type EchoPluginMetadataLookupRequest = {
  track: EchoPluginMetadataLookupTrack;
  provider?: {
    pluginId: string;
    providerId: string;
  };
};

type EchoPluginMetadataCandidate = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  year?: number;
  trackNo?: number;
  discNo?: number;
  bpm?: number;
  confidence?: number;
  source?: string;
  sourceUrl?: string;
};

type EchoPluginMetadataProviderResult = {
  candidates?: EchoPluginMetadataCandidate[];
};

type EchoPluginMetadataProviderOptions = {
  title?: string;
  description?: string;
};

type EchoPluginTrackQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'default' | 'titleAsc' | 'titleDesc' | 'artist' | 'album' | 'recent' | 'durationAsc' | 'durationDesc' | 'qualityAsc' | 'qualityDesc' | 'frequent';
  sourceProvider?: 'local' | 'netease' | 'qqmusic' | 'spotify' | 'remote';
  fields?: EchoPluginTrackField[];
};

type EchoPluginPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

type EchoPluginCommandOptions = {
  title?: string;
  description?: string;
};

/**
 * ECHO Next plugin API v1.
 *
 * Runtime guardrails:
 * - command args are limited to 64 KB serialized JSON
 * - command results are limited to 256 KB serialized JSON
 * - commands time out after 2 seconds
 * - async event handlers that exceed 2 seconds are logged as timeouts
 * - metadata providers return candidates only; the host decides whether and how to apply them
 * - plugins do not get Node, Electron, SQLite, app DOM, decoder, DSP, or output access
 */
type EchoPluginApi = {
  events: {
    on(eventName: 'playback:status', handler: (status: EchoPlaybackStatus) => void | Promise<void>): () => void;
    on(eventName: 'library:changed', handler: (payload: unknown) => void | Promise<void>): () => void;
    on(eventName: EchoPluginEventName, handler: (payload: unknown) => void | Promise<void>): () => void;
  };
  commands: {
    register(commandId: string, handler: (...args: unknown[]) => unknown): void;
    register(commandId: string, options: EchoPluginCommandOptions, handler: (...args: unknown[]) => unknown): void;
  };
  metadata: {
    registerProvider(providerId: string, handler: (request: EchoPluginMetadataLookupRequest) => EchoPluginMetadataProviderResult | Promise<EchoPluginMetadataProviderResult>): void;
    registerProvider(providerId: string, options: EchoPluginMetadataProviderOptions, handler: (request: EchoPluginMetadataLookupRequest) => EchoPluginMetadataProviderResult | Promise<EchoPluginMetadataProviderResult>): void;
  };
  playback: {
    getStatus(): Promise<EchoPlaybackStatus>;
    play(): Promise<unknown>;
    pause(): Promise<unknown>;
    stop(): Promise<unknown>;
    seek(positionSeconds: number): Promise<unknown>;
  };
  library: {
    getSummary(): Promise<Record<string, unknown>>;
    getTracks(query?: EchoPluginTrackQuery): Promise<EchoPluginPage<EchoPluginTrack>>;
  };
  settings: {
    get(): Promise<Record<string, unknown>>;
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  ui: {
    notify(message: string): Promise<void>;
  };
};

type EchoPluginPanelAction = 'plugin:getSummary' | 'plugin:getLogs' | 'plugin:runCommand';

type EchoPluginPanelRequest = {
  channel: 'echo:plugin-panel';
  version: 1;
  type: 'request';
  requestId: string;
  pluginId: string;
  action: EchoPluginPanelAction;
  payload?: unknown;
};

type EchoPluginPanelResponse =
  | {
      channel: 'echo:plugin-panel';
      version: 1;
      type: 'response';
      requestId: string;
      pluginId: string;
      ok: true;
      result: unknown;
    }
  | {
      channel: 'echo:plugin-panel';
      version: 1;
      type: 'response';
      requestId: string;
      pluginId: string;
      ok: false;
      error: string;
    };

declare const echo: EchoPluginApi;
