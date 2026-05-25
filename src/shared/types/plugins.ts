import type { LibraryPage, LibraryPageQuery, LibraryTrack } from './library';

export const pluginApiVersion = 1;

export const pluginPermissions = [
  'playback:read',
  'playback:control',
  'library:read',
  'library:write',
  'settings:read',
  'settings:write',
  'network',
  'fs:plugin',
] as const;

export type PluginPermission = (typeof pluginPermissions)[number];

export type PluginPermissionRisk = 'low' | 'medium' | 'high';
export type PluginPermissionAvailability = 'active' | 'reserved' | 'limited';

export type PluginPermissionDescriptor = {
  permission: PluginPermission;
  label: string;
  description: string;
  risk: PluginPermissionRisk;
  availability: PluginPermissionAvailability;
};

export const pluginPermissionDescriptors: Record<PluginPermission, PluginPermissionDescriptor> = {
  'playback:read': {
    permission: 'playback:read',
    label: '读取播放状态',
    description: '可读取当前播放状态、曲目 id、进度和音频状态快照。',
    risk: 'low',
    availability: 'active',
  },
  'playback:control': {
    permission: 'playback:control',
    label: '控制播放',
    description: '可触发播放、暂停、停止和跳转位置。',
    risk: 'medium',
    availability: 'active',
  },
  'library:read': {
    permission: 'library:read',
    label: '读取曲库',
    description: '可分页读取曲库摘要和公开曲目信息。',
    risk: 'medium',
    availability: 'active',
  },
  'library:write': {
    permission: 'library:write',
    label: '修改曲库（预留）',
    description: '预留给未来曲库写入能力；v1 不提供实际写入 API。',
    risk: 'high',
    availability: 'reserved',
  },
  'settings:read': {
    permission: 'settings:read',
    label: '读取设置',
    description: '可读取应用设置快照。',
    risk: 'medium',
    availability: 'active',
  },
  'settings:write': {
    permission: 'settings:write',
    label: '修改设置',
    description: '可写入小型设置 patch，属于高风险能力。',
    risk: 'high',
    availability: 'active',
  },
  network: {
    permission: 'network',
    label: '访问网络（预留）',
    description: '预留给未来网络访问能力；v1 不提供实际网络 API。',
    risk: 'high',
    availability: 'reserved',
  },
  'fs:plugin': {
    permission: 'fs:plugin',
    label: '插件目录文件（受限）',
    description: 'v1 仅通过 storage API 读写插件自身存储，不开放任意文件 API。',
    risk: 'medium',
    availability: 'limited',
  },
};

export type PluginPanelContribution = {
  id: string;
  title: string;
  path: string;
};

export type PluginCommandContribution = {
  id: string;
  title: string;
  description?: string;
};

export type PluginMetadataProviderContribution = {
  id: string;
  title: string;
  description?: string;
};

export type PluginManifestContributes = {
  commands?: PluginCommandContribution[];
  panels?: PluginPanelContribution[];
  metadataProviders?: PluginMetadataProviderContribution[];
  settings?: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  entry?: string;
  panel?: string;
  permissions?: PluginPermission[];
  contributes?: PluginManifestContributes;
};

export const pluginEventNames = [
  'playback:status',
  'library:changed',
] as const;

export type PluginEventName = (typeof pluginEventNames)[number];

export const pluginLibraryTrackFields = [
  'id',
  'mediaType',
  'path',
  'sourceId',
  'provider',
  'remotePath',
  'stableKey',
  'title',
  'artist',
  'album',
  'albumArtist',
  'trackNo',
  'discNo',
  'year',
  'genre',
  'duration',
  'codec',
  'sampleRate',
  'bitDepth',
  'bitrate',
  'bpm',
  'coverId',
  'coverThumb',
  'metadataStatus',
  'embeddedMetadataStatus',
  'embeddedCoverStatus',
  'networkMetadataStatus',
  'fieldSources',
  'unavailable',
] as const satisfies ReadonlyArray<keyof LibraryTrack>;

export type PluginLibraryTrackField = (typeof pluginLibraryTrackFields)[number];

export type PluginLibraryTracksQuery = Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search' | 'sort' | 'sourceProvider'> & {
  fields?: PluginLibraryTrackField[];
};

export type PluginLibraryTrack = Partial<Pick<LibraryTrack, PluginLibraryTrackField>>;

export type PluginLibraryTrackPage = Omit<LibraryPage<PluginLibraryTrack>, 'items'> & {
  items: PluginLibraryTrack[];
};

export type PluginMetadataLookupTrack = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  duration?: number;
};

export type PluginMetadataLookupProvider = {
  pluginId: string;
  providerId: string;
};

export type PluginMetadataLookupRequest = {
  track: PluginMetadataLookupTrack;
  provider?: PluginMetadataLookupProvider;
};

export type PluginMetadataCandidate = {
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

export type PluginMetadataProviderResult = {
  candidates?: PluginMetadataCandidate[];
};

export type PluginMetadataProvider = PluginMetadataProviderContribution & {
  pluginId: string;
};

export type PluginMetadataLookupResult = {
  providers: PluginMetadataProvider[];
  candidates: Array<PluginMetadataCandidate & {
    pluginId: string;
    providerId: string;
  }>;
};

export const pluginPanelBridgeChannel = 'echo:plugin-panel';
export const pluginPanelBridgeVersion = 1;

export const pluginPanelBridgeActions = [
  'plugin:getSummary',
  'plugin:getLogs',
  'plugin:runCommand',
] as const;

export type PluginPanelBridgeAction = (typeof pluginPanelBridgeActions)[number];

export type PluginPanelBridgeRequest = {
  channel: typeof pluginPanelBridgeChannel;
  version?: number;
  type: 'request';
  requestId: string;
  pluginId: string;
  action: PluginPanelBridgeAction;
  payload?: unknown;
};

export type PluginPanelBridgeResponse = {
  channel: typeof pluginPanelBridgeChannel;
  version: typeof pluginPanelBridgeVersion;
  type: 'response';
  requestId: string;
  pluginId: string;
} & (
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      error: string;
    }
);

export type PluginRuntimeStatus = 'disabled' | 'enabled' | 'running' | 'error';

export type PluginLogLevel = 'info' | 'warn' | 'error';

export type PluginLogEntry = {
  id: string;
  pluginId: string;
  level: PluginLogLevel;
  message: string;
  createdAt: string;
};

export type PluginActivitySummary = {
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastCommandAt: string | null;
  lastEventAt: string | null;
  lastStorageWriteAt: string | null;
  lastSettingsWriteAt: string | null;
  lastErrorAt: string | null;
  commandRunCount: number;
  eventDispatchCount: number;
  storageWriteCount: number;
  settingsWriteCount: number;
  errorCount: number;
};

export type PluginSecuritySummary = {
  requestedPermissionCount: number;
  trustedPermissionCount: number;
  untrustedPermissions: PluginPermission[];
  highRiskPermissions: PluginPermission[];
  reservedPermissions: PluginPermission[];
  limitedPermissions: PluginPermission[];
  hasEntry: boolean;
  hasPanel: boolean;
  sandboxedPanel: boolean;
  commandCount: number;
  metadataProviderCount: number;
};

export type PluginCommand = PluginCommandContribution & {
  pluginId: string;
};

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  directory: string;
  entry: string | null;
  panel: string | null;
  permissions: PluginPermission[];
  trustedPermissions: PluginPermission[];
  enabled: boolean;
  status: PluginRuntimeStatus;
  error: string | null;
  disabledByHost: boolean;
  activity: PluginActivitySummary;
  security: PluginSecuritySummary;
  contributes: PluginManifestContributes;
  commands: PluginCommand[];
  metadataProviders: PluginMetadataProvider[];
};

export type PluginListResult = {
  plugins: PluginSummary[];
  directory: string;
};

export type PluginEnableRequest = {
  pluginId: string;
  trustedPermissions?: PluginPermission[];
};

export type PluginRunCommandRequest = {
  pluginId: string;
  commandId: string;
  args?: unknown[];
};

export type PluginCreateExampleKind = 'playback-panel' | 'command-tool' | 'library-script';

export type PluginCreateExampleResult = {
  pluginId: string;
  directory: string;
};

export type PluginPackageFile = {
  path: string;
  content: string;
};

export type PluginPackage = {
  type: 'echo-next-plugin-package';
  version: 1;
  exportedAt: string;
  manifest: PluginManifest;
  files: PluginPackageFile[];
};

export type PluginImportPackageResult = {
  pluginId: string;
  directory: string;
  importedFileCount: number;
};
