import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { clipboard, dialog, ipcMain, nativeImage, shell } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  EditableTrackTags,
  FinishPlaybackHistoryRequest,
  LibraryPageQuery,
  LibrarySort,
  LibraryTrackTagUpdateRequest,
  MissingMetadataField,
  MissingMetadataScanOptions,
  NetworkTagCandidateSearchRequest,
  NetworkTagProvider,
  PlaybackHistoryQuery,
  StartPlaybackHistoryRequest,
} from '../../shared/types/library';
import { getAppSettings } from '../app/appSettings';
import { getLibraryService } from '../library/LibraryService';
import { SongCardRenderer } from '../library/SongCardRenderer';

const sortValues = new Set<LibrarySort>([
  'default',
  'createdAsc',
  'createdDesc',
  'titleAsc',
  'titleDesc',
  'durationAsc',
  'durationDesc',
  'qualityAsc',
  'qualityDesc',
  'frequent',
  'random',
  'title',
  'artist',
  'album',
  'recent',
]);
const songCardRenderer = new SongCardRenderer();

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
};

const normalizeQuery = (value: unknown): LibraryPageQuery => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const query: LibraryPageQuery = {};

  if (typeof input.page === 'number') {
    query.page = input.page;
  }

  if (typeof input.pageSize === 'number') {
    query.pageSize = input.pageSize;
  }

  if (typeof input.search === 'string') {
    query.search = input.search;
  }

  if (typeof input.sort === 'string' && sortValues.has(input.sort as LibrarySort)) {
    query.sort = input.sort as LibrarySort;
  }

  return query;
};

const normalizePlaybackHistoryQuery = (value: unknown): PlaybackHistoryQuery => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const query: PlaybackHistoryQuery = {};

  if (typeof input.page === 'number') {
    query.page = input.page;
  }

  if (typeof input.pageSize === 'number') {
    query.pageSize = input.pageSize;
  }

  if (typeof input.search === 'string') {
    query.search = input.search;
  }

  if (typeof input.from === 'string') {
    query.from = input.from;
  }

  if (typeof input.to === 'string') {
    query.to = input.to;
  }

  if (typeof input.completedOnly === 'boolean') {
    query.completedOnly = input.completedOnly;
  }

  return query;
};

const normalizeStartPlaybackHistoryRequest = (value: unknown): StartPlaybackHistoryRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('playback history start request must be an object');
  }

  const input = value as Record<string, unknown>;

  return {
    trackId: requireText(input.trackId, 'trackId'),
    sourceType: typeof input.sourceType === 'string' && input.sourceType.trim() ? input.sourceType : null,
    sourceLabel: typeof input.sourceLabel === 'string' && input.sourceLabel.trim() ? input.sourceLabel : null,
    queueId: typeof input.queueId === 'string' && input.queueId.trim() ? input.queueId : null,
  };
};

const normalizeFinishPlaybackHistoryRequest = (value: unknown): FinishPlaybackHistoryRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('playback history finish request must be an object');
  }

  const input = value as Record<string, unknown>;
  const playedSeconds = Number(input.playedSeconds);

  if (!Number.isFinite(playedSeconds) || playedSeconds < 0) {
    throw new Error('playedSeconds must be a non-negative number');
  }

  return {
    historyId: requireText(input.historyId, 'historyId'),
    playedSeconds,
    completed: typeof input.completed === 'boolean' ? input.completed : undefined,
    endedAt: typeof input.endedAt === 'string' && input.endedAt.trim() ? input.endedAt : undefined,
  };
};

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const optionalLimit = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(500, Math.floor(parsed))) : fallback;
};

const networkTagProviders = new Set<NetworkTagProvider>(['mock', 'musicbrainz', 'cover-art-archive', 'netease-cloud-music', 'qq-music']);
const missingMetadataFields = new Set<MissingMetadataField>([
  'cover',
  'title',
  'artist',
  'album',
  'albumArtist',
  'trackNo',
  'discNo',
  'year',
  'genre',
]);

const normalizeMissingMetadataScanOptions = (value: unknown, fallback: number): Required<MissingMetadataScanOptions> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { limit: optionalLimit(value, fallback), fields: [] };
  }

  const input = value as Record<string, unknown>;
  const fields = Array.isArray(input.fields)
    ? input.fields.filter((field): field is MissingMetadataField => typeof field === 'string' && missingMetadataFields.has(field as MissingMetadataField))
    : [];

  return {
    limit: optionalLimit(input.limit, fallback),
    fields: [...new Set(fields)],
  };
};

const normalizeTagUpdateRequest = (value: unknown): LibraryTrackTagUpdateRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('tag update request must be an object');
  }

  const input = value as Record<string, unknown>;
  const tagsInput = input.tags;

  if (!tagsInput || typeof tagsInput !== 'object' || Array.isArray(tagsInput)) {
    throw new Error('tags must be an object');
  }

  const tagsRecord = tagsInput as Record<string, unknown>;
  const readText = (key: keyof EditableTrackTags): string => {
    const fieldValue = tagsRecord[key];
    return typeof fieldValue === 'string' ? fieldValue : '';
  };

  return {
    trackId: requireText(input.trackId, 'trackId'),
    tags: {
      title: readText('title'),
      artist: readText('artist'),
      album: readText('album'),
      albumArtist: readText('albumArtist'),
      trackNo: optionalNumber(tagsRecord.trackNo),
      discNo: optionalNumber(tagsRecord.discNo),
      year: optionalNumber(tagsRecord.year),
      genre: typeof tagsRecord.genre === 'string' && tagsRecord.genre.trim().length > 0 ? tagsRecord.genre : null,
    },
    coverPath: typeof input.coverPath === 'string' && input.coverPath.trim().length > 0 ? input.coverPath : null,
    coverUrl: typeof input.coverUrl === 'string' && input.coverUrl.trim().length > 0 ? input.coverUrl : null,
    coverMimeType: typeof input.coverMimeType === 'string' && input.coverMimeType.trim().length > 0 ? input.coverMimeType : null,
  };
};

const normalizeNetworkTagCandidateSearchRequest = (value: unknown): NetworkTagCandidateSearchRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { trackId: requireText(value, 'trackId') };
  }

  const input = value as Record<string, unknown>;
  const providers = Array.isArray(input.providers)
    ? input.providers.filter((provider): provider is NetworkTagProvider => typeof provider === 'string' && networkTagProviders.has(provider as NetworkTagProvider))
    : undefined;

  return {
    trackId: requireText(input.trackId, 'trackId'),
    query: typeof input.query === 'string' && input.query.trim().length > 0 ? input.query.trim() : undefined,
    providers,
  };
};

const coverMimeType = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLocaleLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      throw new Error(`Unsupported cover image type: ${filePath}`);
  }
};

const getExistingTrack = (trackId: unknown) => {
  const id = requireText(trackId, 'trackId');
  const track = getLibraryService().getTrack(id);

  if (!track) {
    throw new Error(`Unknown track ${id}`);
  }

  return track;
};

const renderTrackCard = async (trackId: unknown) => {
  const track = getExistingTrack(trackId);
  const asset = track.coverId ? getLibraryService().resolveCoverAsset(track.coverId, 'large') : null;

  return songCardRenderer.render({
    track,
    coverPath: asset?.filePath && existsSync(asset.filePath) ? asset.filePath : null,
    coverMimeType: asset?.mimeType ?? null,
  });
};

export const registerLibraryIpc = (): void => {
  ipcMain.handle(IpcChannels.LibraryChooseFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择音乐文件夹',
      properties: ['openDirectory'],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IpcChannels.LibraryAddFolder, (_event, folderPath: unknown) =>
    getLibraryService().addFolder(requireText(folderPath, 'folderPath')),
  );
  ipcMain.handle(IpcChannels.LibraryGetFolders, () => getLibraryService().getFolders());
  ipcMain.handle(IpcChannels.LibraryRemoveFolder, (_event, folderId: unknown) =>
    getLibraryService().removeFolder(requireText(folderId, 'folderId')),
  );
  ipcMain.handle(IpcChannels.LibraryScanFolder, (_event, folderId: unknown) =>
    getLibraryService().scanFolder(requireText(folderId, 'folderId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetScanStatus, (_event, jobId: unknown) =>
    getLibraryService().getScanStatus(requireText(jobId, 'jobId')),
  );
  ipcMain.handle(IpcChannels.LibraryCancelScan, (_event, jobId: unknown) =>
    getLibraryService().cancelScan(requireText(jobId, 'jobId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetTracks, (_event, query: unknown) =>
    getLibraryService().getTracks(normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetAlbums, (_event, query: unknown) =>
    getLibraryService().getAlbums(normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetArtists, (_event, query: unknown) =>
    getLibraryService().getArtists(normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetArtist, (_event, artistId: unknown) =>
    getLibraryService().getArtist(requireText(artistId, 'artistId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetArtistTracks, (_event, artistId: unknown, query: unknown) =>
    getLibraryService().getArtistTracks(requireText(artistId, 'artistId'), normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetArtistAlbums, (_event, artistId: unknown, query: unknown) =>
    getLibraryService().getArtistAlbums(requireText(artistId, 'artistId'), normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetAlbumTracks, (_event, albumId: unknown, query: unknown) =>
    getLibraryService().getAlbumTracks(requireText(albumId, 'albumId'), normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetSummary, () => getLibraryService().getSummary());
  ipcMain.handle(IpcChannels.LibraryRefreshAlbumGrouping, () => getLibraryService().refreshAlbumGrouping());
  ipcMain.handle(IpcChannels.LibraryGetDiagnostics, () => getLibraryService().getDiagnostics());
  ipcMain.handle(IpcChannels.LibraryChooseTrackCover, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择封面',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });

    if (result.canceled) {
      return null;
    }

    const filePath = result.filePaths[0];
    if (!filePath) {
      return null;
    }

    const mimeType = coverMimeType(filePath);
    const dataUrl = `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`;
    return { path: filePath, mimeType, dataUrl };
  });
  ipcMain.handle(IpcChannels.LibraryLoadEmbeddedTrackTags, (_event, trackId: unknown) =>
    getLibraryService().loadEmbeddedTrackTags(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LibraryUpdateTrackTags, (_event, request: unknown) =>
    getLibraryService().updateTrackTags(normalizeTagUpdateRequest(request)),
  );
  ipcMain.handle(IpcChannels.LibraryRecordTrackPlayback, (_event, trackId: unknown) =>
    getLibraryService().recordTrackPlayback(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetPlaybackHistory, (_event, query: unknown) =>
    getLibraryService().getPlaybackHistory(normalizePlaybackHistoryQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetPlaybackHistorySummary, () => getLibraryService().getPlaybackHistorySummary());
  ipcMain.handle(IpcChannels.LibraryDeletePlaybackHistoryEntry, (_event, id: unknown) =>
    getLibraryService().deletePlaybackHistoryEntry(requireText(id, 'historyId')),
  );
  ipcMain.handle(IpcChannels.LibraryClearPlaybackHistory, () => getLibraryService().clearPlaybackHistory());
  ipcMain.handle(IpcChannels.LibraryStartPlaybackHistory, (_event, request: unknown) =>
    getLibraryService().startPlaybackHistory(normalizeStartPlaybackHistoryRequest(request)),
  );
  ipcMain.handle(IpcChannels.LibraryFinishPlaybackHistory, (_event, request: unknown) =>
    getLibraryService().finishPlaybackHistory(normalizeFinishPlaybackHistoryRequest(request)),
  );
  ipcMain.handle(IpcChannels.LibraryOpenTrackInFolder, (_event, trackId: unknown): void => {
    shell.showItemInFolder(getExistingTrack(trackId).path);
  });
  ipcMain.handle(IpcChannels.LibraryOpenTrackWithSystem, async (_event, trackId: unknown): Promise<void> => {
    const result = await shell.openPath(getExistingTrack(trackId).path);

    if (result) {
      throw new Error(result);
    }
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackPath, (_event, trackId: unknown): void => {
    clipboard.writeText(getExistingTrack(trackId).path);
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackNameArtist, (_event, trackId: unknown): void => {
    const track = getExistingTrack(trackId);
    clipboard.writeText(`${track.title} - ${track.artist}`);
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackCover, async (_event, trackId: unknown): Promise<boolean> => {
    const card = await renderTrackCard(trackId);
    const image = nativeImage.createFromBuffer(card.pngBuffer);
    if (image.isEmpty()) {
      return false;
    }

    clipboard.writeImage(image);
    return true;
  });
  ipcMain.handle(IpcChannels.LibrarySaveTrackCover, async (_event, trackId: unknown): Promise<string | null> => {
    const card = await renderTrackCard(trackId);
    const result = await dialog.showSaveDialog({
      title: '保存歌曲卡片图片',
      defaultPath: card.suggestedFileName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    writeFileSync(result.filePath, card.pngBuffer);
    return result.filePath;
  });
  ipcMain.handle(IpcChannels.LibraryDeleteTrackFile, async (_event, trackId: unknown): Promise<void> => {
    const track = getExistingTrack(trackId);

    if (existsSync(track.path)) {
      await shell.trashItem(track.path);
    }

    getLibraryService().deleteTrack(track.id);
  });
  ipcMain.handle(IpcChannels.LibraryPruneMissingTracks, () => getLibraryService().pruneMissingTracks());
  ipcMain.handle(IpcChannels.LibraryClearTracks, () => getLibraryService().clearTracks());
  ipcMain.handle(IpcChannels.LibraryNetworkRepairMissingMetadata, (_event, trackId: unknown) =>
    {
      const settings = getAppSettings();
      if (!settings.networkMetadataEnabled) {
        throw new Error('Network metadata completion is disabled in Settings');
      }

      return getLibraryService().repairMissingMetadata(requireText(trackId, 'trackId'), settings.networkMetadataProviders);
    },
  );
  ipcMain.handle(IpcChannels.LibraryNetworkScanMissingMetadata, (_event, request: unknown) =>
    {
      const settings = getAppSettings();
      if (!settings.networkMetadataEnabled) {
        throw new Error('Network metadata completion is disabled in Settings');
      }

      const options = normalizeMissingMetadataScanOptions(request, 25);
      return getLibraryService().scanMissingMetadata(options.limit, settings.networkMetadataProviders, options.fields);
    },
  );
  ipcMain.handle(IpcChannels.LibraryNetworkStartMissingMetadataScan, (_event, request: unknown) =>
    {
      const settings = getAppSettings();
      if (!settings.networkMetadataEnabled) {
        throw new Error('Network metadata completion is disabled in Settings');
      }

      const options = normalizeMissingMetadataScanOptions(request, 25);
      return getLibraryService().startMissingMetadataScan(options.limit, settings.networkMetadataProviders, options.fields);
    },
  );
  ipcMain.handle(IpcChannels.LibraryNetworkGetMissingMetadataScanStatus, (_event, jobId: unknown) =>
    getLibraryService().getMissingMetadataScanStatus(requireText(jobId, 'jobId')),
  );
  ipcMain.handle(IpcChannels.LibraryNetworkShowCandidates, (_event, trackId: unknown) =>
    getLibraryService().showNetworkCandidates(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LibrarySearchNetworkTagCandidates, (_event, request: unknown) =>
    {
      const settings = getAppSettings();
      if (!settings.networkMetadataEnabled) {
        throw new Error('网络来源暂时不可用，请稍后再试。');
      }

      const normalized = normalizeNetworkTagCandidateSearchRequest(request);
      return getLibraryService().searchNetworkTagCandidates({
        ...normalized,
        providers: normalized.providers?.length ? normalized.providers : settings.networkMetadataProviders,
      });
    },
  );
  ipcMain.handle(IpcChannels.LibraryNetworkApplyMissingOnly, (_event, candidateId: unknown) =>
    getLibraryService().applyNetworkMissingOnly(requireText(candidateId, 'candidateId')),
  );
  ipcMain.handle(IpcChannels.LibraryNetworkApplySelected, (_event, candidateId: unknown) =>
    getLibraryService().applyNetworkSelected(requireText(candidateId, 'candidateId')),
  );
  ipcMain.handle(IpcChannels.LibraryNetworkRejectCandidate, (_event, candidateId: unknown) =>
    getLibraryService().rejectNetworkCandidate(requireText(candidateId, 'candidateId')),
  );
};
