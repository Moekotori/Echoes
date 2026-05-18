import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  RemoteBackgroundJobKind,
  RemoteRuntimeLimits,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceSyncMode,
  RemoteSourceUpdate,
  RemoteVisibleHydrationOptions,
} from '../../shared/types/remoteSources';
import { getRemoteSourceService } from '../library/remote/RemoteSourceService';

const providers = new Set<RemoteSourceProvider>(['webdav', 'jellyfin', 'emby', 'smb', 'sshfs', 'subsonic']);
const syncModes = new Set<RemoteSourceSyncMode>(['browse', 'index', 'mirror']);
const backgroundJobKinds = new Set<RemoteBackgroundJobKind>(['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill']);

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
};

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const normalizeConfig = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const normalizeJobKinds = (value: unknown): RemoteBackgroundJobKind[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const kinds = value.filter((item): item is RemoteBackgroundJobKind => typeof item === 'string' && backgroundJobKinds.has(item as RemoteBackgroundJobKind));
  return kinds.length > 0 ? Array.from(new Set(kinds)) : undefined;
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeTrackIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).slice(0, 40);
};

const normalizeVisibleHydrationOptions = (value: unknown): RemoteVisibleHydrationOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    metadata: typeof input.metadata === 'boolean' ? input.metadata : undefined,
    cover: typeof input.cover === 'boolean' ? input.cover : undefined,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : undefined,
  };
};

const normalizeRuntimeLimits = (value: unknown): RemoteRuntimeLimits => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const limitKeys: Array<keyof RemoteRuntimeLimits> = [
    'scanConcurrency',
    'metadataConcurrency',
    'coverConcurrency',
    'lyricsConcurrency',
    'mvConcurrency',
  ];
  const output: RemoteRuntimeLimits = {};

  for (const key of limitKeys) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
      output[key] = input[key];
    }
  }

  return output;
};

const normalizeInput = (value: unknown): RemoteSourceInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('remote source input must be an object');
  }

  const input = value as Record<string, unknown>;
  const provider = providers.has(input.provider as RemoteSourceProvider) ? (input.provider as RemoteSourceProvider) : 'webdav';
  const syncMode = syncModes.has(input.syncMode as RemoteSourceSyncMode) ? (input.syncMode as RemoteSourceSyncMode) : 'index';
  const requestedAuthType = input.authType === 'none' || input.authType === 'token' || input.authType === 'apiKey' ? input.authType : 'basic';
  const username = optionalText(input.username);
  const secret = typeof input.secret === 'string' ? input.secret : null;
  const authType = provider === 'webdav' && requestedAuthType === 'basic' && !username && !secret ? 'none' : requestedAuthType;

  if (provider === 'webdav' && authType === 'basic' && !username) {
    throw new Error('WebDAV password authentication requires a username.');
  }
  if (provider === 'webdav' && (authType === 'token' || authType === 'apiKey') && !secret) {
    throw new Error('WebDAV token authentication requires a token or API key.');
  }

  return {
    provider,
    displayName: requireText(input.displayName, 'displayName'),
    baseUrl: optionalText(input.baseUrl),
    username: authType === 'none' || authType === 'token' || authType === 'apiKey' ? null : username,
    secret: authType === 'none' ? null : secret,
    authType,
    config: normalizeConfig(input.config),
    syncMode,
    status: input.status === 'disabled' || input.status === 'error' ? input.status : 'enabled',
  };
};

const normalizeUpdate = (value: unknown): RemoteSourceUpdate => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('remote source update must be an object');
  }

  const input = value as Record<string, unknown>;
  const update: RemoteSourceUpdate = {
    id: requireText(input.id, 'id'),
  };

  if (input.provider !== undefined) {
    update.provider = providers.has(input.provider as RemoteSourceProvider) ? (input.provider as RemoteSourceProvider) : 'webdav';
  }
  if (input.displayName !== undefined) {
    update.displayName = requireText(input.displayName, 'displayName');
  }
  if (input.baseUrl !== undefined) {
    update.baseUrl = optionalText(input.baseUrl);
  }
  if (input.username !== undefined) {
    update.username = optionalText(input.username);
  }
  if (input.secret !== undefined) {
    update.secret = typeof input.secret === 'string' ? input.secret : null;
  }
  if (input.authType !== undefined) {
    update.authType = input.authType === 'none' || input.authType === 'token' || input.authType === 'apiKey' ? input.authType : 'basic';
  }
  if (input.config !== undefined) {
    update.config = normalizeConfig(input.config);
  }
  if (input.syncMode !== undefined) {
    update.syncMode = syncModes.has(input.syncMode as RemoteSourceSyncMode) ? (input.syncMode as RemoteSourceSyncMode) : 'index';
  }
  if (input.status !== undefined) {
    update.status = input.status === 'disabled' || input.status === 'error' ? input.status : 'enabled';
  }

  if (update.authType === 'none') {
    update.username = null;
    update.secret = null;
  }

  return update;
};

export const registerRemoteSourcesIpc = (): void => {
  ipcMain.handle(IpcChannels.RemoteSourcesList, () => getRemoteSourceService().listSources());
  ipcMain.handle(IpcChannels.RemoteSourcesCreate, (_event, input: unknown) => getRemoteSourceService().createSource(normalizeInput(input)));
  ipcMain.handle(IpcChannels.RemoteSourcesUpdate, (_event, input: unknown) => getRemoteSourceService().updateSource(normalizeUpdate(input)));
  ipcMain.handle(IpcChannels.RemoteSourcesDelete, (_event, sourceId: unknown) => getRemoteSourceService().deleteSource(requireText(sourceId, 'sourceId')));
  ipcMain.handle(IpcChannels.RemoteSourcesTest, (_event, input: unknown) =>
    typeof input === 'string' ? getRemoteSourceService().testSource(requireText(input, 'sourceId')) : getRemoteSourceService().testSource(normalizeInput(input)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesBrowse, (_event, sourceId: unknown, path?: unknown) =>
    getRemoteSourceService().browse(requireText(sourceId, 'sourceId'), optionalText(path)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesSync, (_event, sourceId: unknown) => getRemoteSourceService().syncSource(requireText(sourceId, 'sourceId')));
  ipcMain.handle(IpcChannels.RemoteSourcesCancelSync, (_event, sourceId: unknown) => getRemoteSourceService().cancelSync(requireText(sourceId, 'sourceId')));
  ipcMain.handle(IpcChannels.RemoteSourcesGetSyncStatus, (_event, sourceId: unknown) =>
    getRemoteSourceService().getSyncStatus(requireText(sourceId, 'sourceId')),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesCreateStreamUrl, (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('stream URL input must be an object');
    }

    const request = input as Record<string, unknown>;
    return getRemoteSourceService().createStreamUrl({
      trackId: optionalText(request.trackId) ?? undefined,
      sourceId: optionalText(request.sourceId) ?? undefined,
      remotePath: optionalText(request.remotePath) ?? undefined,
      stableKey: optionalText(request.stableKey) ?? undefined,
    });
  });
  ipcMain.handle(IpcChannels.RemoteSourcesHydrateVisibleTracks, (_event, trackIds: unknown, options: unknown) =>
    getRemoteSourceService().hydrateVisibleTracks(normalizeTrackIds(trackIds), normalizeVisibleHydrationOptions(options)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesStartBackgroundJobs, (_event, sourceId: unknown, kinds?: unknown) =>
    getRemoteSourceService().startBackgroundJobs(requireText(sourceId, 'sourceId'), normalizeJobKinds(kinds)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesPauseBackgroundJobs, (_event, sourceId: unknown) =>
    getRemoteSourceService().pauseBackgroundJobs(requireText(sourceId, 'sourceId')),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesResumeBackgroundJobs, (_event, sourceId: unknown) =>
    getRemoteSourceService().resumeBackgroundJobs(requireText(sourceId, 'sourceId')),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesGetJobStatus, (_event, sourceId: unknown) =>
    getRemoteSourceService().getJobStatus(requireText(sourceId, 'sourceId')),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesRetryFailedJobs, (_event, sourceId: unknown, kinds?: unknown) =>
    getRemoteSourceService().retryFailedJobs(requireText(sourceId, 'sourceId'), normalizeJobKinds(kinds)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesSetBackgroundPaused, (_event, paused: unknown) =>
    getRemoteSourceService().setBackgroundPaused(normalizeBoolean(paused)),
  );
  ipcMain.handle(IpcChannels.RemoteSourcesGetBackgroundGlobalStatus, () => getRemoteSourceService().getBackgroundGlobalStatus());
  ipcMain.handle(IpcChannels.RemoteSourcesUpdateRuntimeLimits, (_event, sourceId: unknown, limits: unknown) =>
    getRemoteSourceService().updateRuntimeLimits(requireText(sourceId, 'sourceId'), normalizeRuntimeLimits(limits)),
  );
};
