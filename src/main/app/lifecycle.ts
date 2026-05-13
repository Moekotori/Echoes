import { app } from 'electron';
import { createMainWindow } from './createMainWindow';
import { requestAppQuit } from './tray';
import { getMainWindow } from './windowManager';
import { getCrashReportService } from '../diagnostics/CrashReportService';
import { registerCoverProtocolHandler } from '../protocol/coverProtocol';
import { disposeSmtcIntegration, initializeSmtcIntegration } from '../integrations/smtc/SmtcStatusSync';

export const registerAppLifecycle = (): void => {
  app.whenReady().then(() => {
    getCrashReportService().initialize();
    registerCoverProtocolHandler();
    void initializeSmtcIntegration();
    createMainWindow();

    app.on('activate', () => {
      if (getMainWindow() === null) {
        createMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    disposeSmtcIntegration();
    getCrashReportService().closeSession();
    requestAppQuit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
};
