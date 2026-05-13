import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
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

export const registerLyricsIpc = (): void => {
  ipcMain.handle(IpcChannels.LyricsGetForTrack, (_event, trackId: unknown) =>
    getLyricsService().getLyricsForTrack(requireText(trackId, 'trackId')),
  );
  ipcMain.handle(IpcChannels.LyricsSearchCandidates, (_event, trackId: unknown, searchText?: unknown) =>
    getLyricsService().searchLyricsCandidates(
      requireText(trackId, 'trackId'),
      typeof searchText === 'string' ? searchText : null,
    ),
  );
  ipcMain.handle(IpcChannels.LyricsApplyCandidate, (_event, trackId: unknown, candidateId: unknown) =>
    getLyricsService().applyLyricsCandidate(requireText(trackId, 'trackId'), requireText(candidateId, 'candidateId')),
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
