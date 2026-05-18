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
import { checkpointProtectedLibrary, ensureDataProtection } from './dataProtection';
import { disposeBackgroundPlaybackShortcuts, initializeBackgroundPlaybackShortcuts } from './backgroundPlaybackShortcuts';
import { getAccountService } from '../accounts/AccountService';
import { disposeAirPlayReceiverSpikeService } from '../connect/AirPlayReceiverSpikeService';
import { disposeConnectReceiverService } from '../connect/ConnectReceiverService';
import { disposeConnectService } from '../connect/ConnectService';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AccountStatus } from '../../shared/types/accounts';
import { closeDefaultLibraryService } from '../library/LibraryService';
import { closeDefaultRemoteSourceService } from '../library/remote/RemoteSourceService';
import { closeDefaultLyricsService } from '../lyrics/LyricsService';
import { closeDefaultMvService } from '../mv/MvService';
import { closeDefaultStreamingService } from '../streaming/StreamingService';
import { disposeDefaultAudioSessionGracefully } from '../audio/AudioSession';

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

  app.whenReady().then(async () => {
    getCrashReportService().initialize();
    const dataProtection = await ensureDataProtection('startup');
    registerCoverProtocolHandler();
    registerVideoProtocolHandler();
    if (dataProtection.libraryHealth.status === 'ok') {
      void initializeSmtcIntegration();
      initializeLastFmIntegration();
      void initializeDiscordPresenceIntegration();
    } else {
      getCrashReportService().getLogger()?.warn('main', '[Lifecycle] library database is unhealthy; starting without library-backed integrations', {
        status: dataProtection.libraryHealth.status,
        error: dataProtection.libraryHealth.message,
      });
    }
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
  }).catch((error) => {
    getCrashReportService().getLogger()?.warn('main', '[Lifecycle] startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    createMainWindow();
  });

  let gracefulQuitInProgress = false;
  let gracefulQuitCompleted = false;

  const cleanupBeforeQuit = async (): Promise<void> => {
    savePlaybackMemoryNow();
    disposeLastFmIntegration();
    disposeDiscordPresenceIntegration();
    await disposeAirPlayReceiverSpikeService();
    await disposeConnectReceiverService();
    await disposeConnectService();
    await disposeSmtcIntegration();
    await disposeDefaultAudioSessionGracefully('app-quit');
    disposeBackgroundPlaybackShortcuts();
    closeDefaultLyricsService();
    closeDefaultMvService();
    closeDefaultStreamingService();
    closeDefaultRemoteSourceService();
    closeDefaultLibraryService();
    const checkpoint = checkpointProtectedLibrary();
    if (checkpoint.status !== 'ok') {
      getCrashReportService().getLogger()?.warn('main', '[Lifecycle] library WAL checkpoint failed during shutdown', {
        status: checkpoint.status,
        error: checkpoint.message,
      });
    }
    getCrashReportService().closeSession();
    requestAppQuit();
  };

  const cleanupBeforeQuitWithTimeout = async (): Promise<void> => {
    let timeout: NodeJS.Timeout | null = null;
    let timedOut = false;
    try {
      await Promise.race([
        cleanupBeforeQuit(),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            timedOut = true;
            resolve();
          }, 2000);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (timedOut) {
        getCrashReportService().getLogger()?.warn('main', '[Lifecycle] graceful shutdown cleanup timed out');
      }
    }
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
    void cleanupBeforeQuitWithTimeout()
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
