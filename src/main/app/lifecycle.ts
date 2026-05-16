import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './createMainWindow';
import { requestAppQuit } from './tray';
import { getMainWindow } from './windowManager';
import { getCrashReportService } from '../diagnostics/CrashReportService';
import { registerCoverProtocolHandler } from '../protocol/coverProtocol';
import { registerVideoProtocolHandler } from '../protocol/videoProtocol';
import { disposeSmtcIntegration, initializeSmtcIntegration } from '../integrations/smtc/SmtcStatusSync';
import { disposeDiscordPresenceIntegration, initializeDiscordPresenceIntegration } from '../integrations/discord/DiscordPresenceStatusSync';
import { disposeLastFmIntegration, initializeLastFmIntegration } from '../integrations/lastfm/LastFmStatusSync';
import { savePlaybackMemoryNow } from '../ipc/playbackIpc';
import { dispatchLocalAudioFilesOpened, parseLocalAudioFileArguments } from './localFileOpen';
import { initializeAutoUpdater } from './autoUpdater';
import { getAppSettings } from './appSettings';
import { ensureDataProtection } from './dataProtection';
import { disposeBackgroundPlaybackShortcuts, initializeBackgroundPlaybackShortcuts } from './backgroundPlaybackShortcuts';
import { getAccountService } from '../accounts/AccountService';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AccountStatus } from '../../shared/types/accounts';

const sendAccountStatusesChanged = (statuses: AccountStatus[]): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    const send = (): void => {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannels.AccountStatusesChanged, statuses);
      }
    };

    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
};

const refreshPreviouslyLoggedInAccountsOnStartup = async (): Promise<void> => {
  const statuses = await getAccountService().checkPreviouslyLoggedInAccounts();
  const disconnectedStatuses = statuses.filter((status) => !status.connected && Boolean(status.error));

  if (disconnectedStatuses.length > 0) {
    sendAccountStatusesChanged(disconnectedStatuses);
  }
};

export const registerAppLifecycle = (): void => {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    let window = getMainWindow();
    if (window === null) {
      window = createMainWindow();
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
    dispatchLocalAudioFilesOpened(parseLocalAudioFileArguments(argv));
  });

  app.whenReady().then(() => {
    ensureDataProtection('startup');
    getCrashReportService().initialize();
    registerCoverProtocolHandler();
    registerVideoProtocolHandler();
    void initializeSmtcIntegration();
    void initializeDiscordPresenceIntegration();
    initializeLastFmIntegration();
    createMainWindow();
    initializeBackgroundPlaybackShortcuts();
    const appSettings = getAppSettings();
    if (appSettings.autoAccountCheckOnStartup !== false) {
      void refreshPreviouslyLoggedInAccountsOnStartup().catch(() => undefined);
    }
    initializeAutoUpdater(appSettings.autoUpdateEnabled !== false);
    dispatchLocalAudioFilesOpened(parseLocalAudioFileArguments(process.argv));

    app.on('activate', () => {
      if (getMainWindow() === null) {
        createMainWindow();
      }
    });
  });

  let gracefulQuitInProgress = false;
  let gracefulQuitCompleted = false;

  const cleanupBeforeQuit = async (): Promise<void> => {
    savePlaybackMemoryNow();
    disposeLastFmIntegration();
    disposeDiscordPresenceIntegration();
    await disposeSmtcIntegration();
    disposeBackgroundPlaybackShortcuts();
    getCrashReportService().closeSession();
    requestAppQuit();
  };

  app.on('before-quit', (event) => {
    if (gracefulQuitCompleted) {
      return;
    }

    event.preventDefault();
    if (gracefulQuitInProgress) {
      return;
    }

    gracefulQuitInProgress = true;
    void cleanupBeforeQuit()
      .catch((error) => {
        getCrashReportService().getLogger()?.warn('main', '[Lifecycle] graceful shutdown cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        gracefulQuitCompleted = true;
        app.quit();
      });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
};
