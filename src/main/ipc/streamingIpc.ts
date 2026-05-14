import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  StreamingMediaType,
  StreamingPlaybackRequest,
  StreamingPlaybackSource,
  StreamingProviderName,
  StreamingSearchRequest,
} from '../../shared/types/streaming';
import { streamingProviderNames } from '../../shared/types/streaming';
import { getStreamingService } from '../streaming/StreamingService';

const providerNames = new Set<StreamingProviderName>(streamingProviderNames);
const mediaTypes = new Set<StreamingMediaType>(['track', 'album', 'artist', 'playlist', 'mv']);
const sensitiveHeaderPattern = /^(authorization|cookie|x-api-key|x-auth-token|set-cookie)$/iu;

const friendlyError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

const requireObject = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value as Record<string, unknown>;
};

const requireProvider = (value: unknown): StreamingProviderName => {
  if (typeof value !== 'string' || !providerNames.has(value as StreamingProviderName)) {
    throw new Error('Streaming provider is not supported.');
  }

  return value as StreamingProviderName;
};

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
};

const optionalPage = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;

const optionalMediaTypes = (value: unknown): StreamingMediaType[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.filter((item): item is StreamingMediaType => typeof item === 'string' && mediaTypes.has(item as StreamingMediaType));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
};

const normalizeSearchRequest = (value: unknown): StreamingSearchRequest => {
  const input = requireObject(value, 'streaming search request');

  return {
    provider: requireProvider(input.provider),
    query: requireText(input.query, 'query'),
    mediaTypes: optionalMediaTypes(input.mediaTypes),
    page: optionalPage(input.page, 1),
    pageSize: Math.min(50, optionalPage(input.pageSize, 20)),
  };
};

const normalizeTrackRequest = (value: unknown): { provider: StreamingProviderName; providerTrackId: string } => {
  const input = requireObject(value, 'streaming track request');

  return {
    provider: requireProvider(input.provider),
    providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
  };
};

const normalizePlaybackRequest = (value: unknown): StreamingPlaybackRequest => {
  const input = requireObject(value, 'streaming playback request');
  const quality = input.quality;

  return {
    provider: requireProvider(input.provider),
    providerTrackId: requireText(input.providerTrackId, 'providerTrackId'),
    quality:
      quality === 'standard' || quality === 'high' || quality === 'lossless' || quality === 'hires' ? quality : undefined,
  };
};

const sanitizePlaybackSource = (source: StreamingPlaybackSource): StreamingPlaybackSource => ({
  ...source,
  headers: Object.fromEntries(Object.entries(source.headers).filter(([name]) => !sensitiveHeaderPattern.test(name))),
});

export const registerStreamingIpc = (): void => {
  ipcMain.handle(IpcChannels.StreamingGetProviders, () => getStreamingService().getProviders());
  ipcMain.handle(IpcChannels.StreamingSearch, async (_event, request: unknown) => {
    try {
      return await getStreamingService().search(normalizeSearchRequest(request));
    } catch (error) {
      throw friendlyError(error, 'Streaming search failed.');
    }
  });
  ipcMain.handle(IpcChannels.StreamingGetTrack, async (_event, request: unknown) => {
    try {
      const { provider, providerTrackId } = normalizeTrackRequest(request);
      return await getStreamingService().getTrack(provider, providerTrackId);
    } catch (error) {
      throw friendlyError(error, 'Streaming track lookup failed.');
    }
  });
  ipcMain.handle(IpcChannels.StreamingResolvePlayback, async (_event, request: unknown) => {
    try {
      return sanitizePlaybackSource(await getStreamingService().resolvePlayback(normalizePlaybackRequest(request)));
    } catch (error) {
      throw friendlyError(error, 'Streaming playback URL could not be resolved.');
    }
  });
  ipcMain.handle(IpcChannels.StreamingGetLyrics, async (_event, request: unknown) => {
    try {
      return await getStreamingService().getLyrics(normalizeTrackRequest(request));
    } catch (error) {
      throw friendlyError(error, 'Streaming lyrics lookup failed.');
    }
  });
  ipcMain.handle(IpcChannels.StreamingGetMv, async (_event, request: unknown) => {
    try {
      return await getStreamingService().getMv(normalizeTrackRequest(request));
    } catch (error) {
      throw friendlyError(error, 'Streaming MV lookup failed.');
    }
  });
};
