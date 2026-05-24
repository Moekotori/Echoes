import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { LyricsEmbedToTrackRequest, LyricsTrackSnapshotRequest } from '../../shared/types/lyrics';
import { getLyricsService } from '../lyrics/LyricsService';

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
};

const requireOffset = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('offsetMs must be a number');
  }

  return parsed;
};

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const normalizeSnapshotRequest = (value: unknown): LyricsTrackSnapshotRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lyrics snapshot request must be an object');
  }

  const input = value as Record<string, unknown>;
  const durationSeconds = Number(input.durationSeconds);
  return {
    trackId: requireText(input.trackId, 'trackId'),
    title: requireText(input.title, 'title'),
    artist: optionalText(input.artist) ?? 'Unknown Artist',
    album: optionalText(input.album),
    albumArtist: optionalText(input.albumArtist),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    mediaType: input.mediaType === 'local' || input.mediaType === 'streaming' || input.mediaType === 'remote' ? input.mediaType : 'remote',
    sourceId: optionalText(input.sourceId),
    stableKey: optionalText(input.stableKey),
  };
};

const normalizeEmbedRequest = (value: unknown): LyricsEmbedToTrackRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    candidateId: optionalText(input.candidateId),
    preferSynced: input.preferSynced === false ? false : true,
  };
};

export const registerLyricsIpc = (): void => {
  ipcMain.handle(IpcChannels.LyricsGetForTrack, (_event, trackId: unknown) =>
    getLyricsService().getLyricsForTrack(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LyricsGetForSnapshot, (_event, request: unknown) =>
    getLyricsService().getLyricsForSnapshot(normalizeSnapshotRequest(request)),
  );
  ipcMain.handle(IpcChannels.LyricsSearchCandidates, (_event, trackId: unknown, searchText?: unknown, providerId?: unknown) =>
    getLyricsService().searchLyricsCandidates(
      requireText(trackId, 'trackId'),
      typeof searchText === 'string' ? searchText : null,
      typeof providerId === 'string' ? providerId : null,
    ),
  );
  ipcMain.handle(IpcChannels.LyricsSearchCandidatesForSnapshot, (_event, request: unknown, searchText?: unknown, providerId?: unknown) =>
    getLyricsService().searchLyricsCandidatesForSnapshot(
      normalizeSnapshotRequest(request),
      typeof searchText === 'string' ? searchText : null,
      typeof providerId === 'string' ? providerId : null,
    ),
  );
  ipcMain.handle(IpcChannels.LyricsApplyCandidate, (_event, trackId: unknown, candidateId: unknown) =>
    getLyricsService().applyLyricsCandidate(requireText(trackId, 'trackId'), requireText(candidateId, 'candidateId')),
  );
  ipcMain.handle(IpcChannels.LyricsApplyCandidateForSnapshot, (_event, request: unknown, candidateId: unknown) =>
    getLyricsService().applyLyricsCandidateForSnapshot(
      normalizeSnapshotRequest(request),
      requireText(candidateId, 'candidateId'),
    ),
  );
  ipcMain.handle(IpcChannels.LyricsEmbedToTrack, (_event, trackId: unknown, request?: unknown) =>
    getLyricsService().embedLyricsToTrack(requireText(trackId, 'trackId'), normalizeEmbedRequest(request)),
  );
  ipcMain.handle(IpcChannels.LyricsApplyCustomLrc, (_event, trackId: unknown, lrcText: unknown, fileName?: unknown) =>
    getLyricsService().applyCustomLrc(
      requireText(trackId, 'trackId'),
      requireText(lrcText, 'lrcText'),
      typeof fileName === 'string' ? fileName : null,
    ),
  );
  ipcMain.handle(IpcChannels.LyricsMarkInstrumental, (_event, trackId: unknown) =>
    getLyricsService().markTrackInstrumental(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LyricsRejectCandidate, (_event, candidateId: unknown) =>
    getLyricsService().rejectLyricsCandidate(requireText(candidateId, 'candidateId')),
  );
  ipcMain.handle(IpcChannels.LyricsSetOffset, (_event, trackId: unknown, offsetMs: unknown) =>
    getLyricsService().setLyricsOffset(requireText(trackId, 'trackId'), requireOffset(offsetMs)),
  );
  ipcMain.handle(IpcChannels.LyricsClearCache, (_event, trackId: unknown) =>
    getLyricsService().clearLyricsCache(requireText(trackId, 'trackId')),
  );
};
