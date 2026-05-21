import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { DesktopLyricsStylePatch } from '../../shared/types/desktopLyrics';
import {
  getDesktopLyricsState,
  getLastDesktopLyricsAudioStatus,
  hideDesktopLyricsWindow,
  receiveDesktopLyricsRendererAudioStatus,
  resetDesktopLyricsBounds,
  setDesktopLyricsLocked,
  setDesktopLyricsStyle,
  showDesktopLyricsWindow,
} from '../app/desktopLyricsWindow';

const normalizeStylePatch = (value: unknown): DesktopLyricsStylePatch => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    ...(input.desktopLyricsFontSizePx !== undefined ? { desktopLyricsFontSizePx: Number(input.desktopLyricsFontSizePx) } : {}),
    ...(input.desktopLyricsScalePercent !== undefined ? { desktopLyricsScalePercent: Number(input.desktopLyricsScalePercent) } : {}),
    ...(typeof input.desktopLyricsColor === 'string' ? { desktopLyricsColor: input.desktopLyricsColor } : {}),
    ...(typeof input.desktopLyricsStrokeColor === 'string' ? { desktopLyricsStrokeColor: input.desktopLyricsStrokeColor } : {}),
    ...(input.desktopLyricsOpacityPercent !== undefined ? { desktopLyricsOpacityPercent: Number(input.desktopLyricsOpacityPercent) } : {}),
  };
};

export const registerDesktopLyricsIpc = (): void => {
  ipcMain.handle(IpcChannels.DesktopLyricsShow, () => showDesktopLyricsWindow());
  ipcMain.handle(IpcChannels.DesktopLyricsHide, () => hideDesktopLyricsWindow());
  ipcMain.handle(IpcChannels.DesktopLyricsGetState, () => getDesktopLyricsState());
  ipcMain.handle(IpcChannels.DesktopLyricsSetLocked, (_event, locked: unknown) => setDesktopLyricsLocked(locked === true));
  ipcMain.handle(IpcChannels.DesktopLyricsSetStyle, (_event, patch: unknown) => setDesktopLyricsStyle(normalizeStylePatch(patch)));
  ipcMain.handle(IpcChannels.DesktopLyricsResetBounds, () => resetDesktopLyricsBounds());
  ipcMain.handle(IpcChannels.DesktopLyricsGetLastAudioStatus, () => getLastDesktopLyricsAudioStatus());
  ipcMain.on(IpcChannels.DesktopLyricsRendererAudioStatus, receiveDesktopLyricsRendererAudioStatus);
};
