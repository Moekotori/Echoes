import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { SmtcDiagnostics } from '../../shared/types/smtc';
import { getSmtcDiagnostics } from '../integrations/smtc/SmtcStatusSync';

export const registerSmtcIpc = (): void => {
  ipcMain.handle(IpcChannels.SmtcGetDiagnostics, (): SmtcDiagnostics => getSmtcDiagnostics());
};
