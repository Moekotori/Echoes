import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import {
  getMiniPlayerState,
  hideMiniPlayerWindow,
  resetMiniPlayerBounds,
  setMiniPlayerLocked,
  setMiniPlayerQueueOpen,
  showMiniPlayerWindow,
} from '../app/miniPlayerWindow';

export const registerMiniPlayerIpc = (): void => {
  ipcMain.handle(IpcChannels.MiniPlayerShow, () => showMiniPlayerWindow());
  ipcMain.handle(IpcChannels.MiniPlayerHide, () => hideMiniPlayerWindow());
  ipcMain.handle(IpcChannels.MiniPlayerGetState, () => getMiniPlayerState());
  ipcMain.handle(IpcChannels.MiniPlayerSetLocked, (_event, locked: unknown) => setMiniPlayerLocked(locked === true));
  ipcMain.handle(IpcChannels.MiniPlayerSetQueueOpen, (_event, open: unknown) => setMiniPlayerQueueOpen(open === true));
  ipcMain.handle(IpcChannels.MiniPlayerResetBounds, () => resetMiniPlayerBounds());
};
