import { app } from 'electron';
import type { WebContents } from 'electron';
import { getCrashReportService } from './CrashReportService';
import { showCrashRecoveryDialog } from './CrashRecoveryDialog';
import { sanitizeLogPayload } from './Logger';

const errorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  return typeof value === 'string' ? value : JSON.stringify(sanitizeLogPayload(value));
};

const errorStack = (value: unknown): string | undefined => (value instanceof Error ? value.stack : undefined);

const webContentsInfo = (webContents: WebContents): unknown => ({
  id: webContents.id,
  url: webContents.getURL(),
  title: webContents.getTitle(),
  isDestroyed: webContents.isDestroyed(),
});

export const registerCrashHandlers = (): void => {
  process.on('uncaughtException', (error) => {
    getCrashReportService().reportCrash({
      type: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    });
    void showCrashRecoveryDialog('main', error.message);
  });

  process.on('unhandledRejection', (reason) => {
    getCrashReportService().reportCrash({
      type: 'unhandledRejection',
      message: errorMessage(reason),
      stack: errorStack(reason),
      reason: errorMessage(reason),
    });
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    const message = `Renderer process gone: ${details.reason}`;
    getCrashReportService().reportCrash({
      type: 'render-process-gone',
      message,
      reason: details.reason,
      exitCode: details.exitCode,
      details: {
        webContents: webContentsInfo(webContents),
        details,
      },
    });
    void showCrashRecoveryDialog('renderer', message);
  });

  app.on('child-process-gone', (_event, details) => {
    getCrashReportService().reportCrash({
      type: 'child-process-gone',
      message: `Child process gone: ${details.type}`,
      reason: details.reason,
      exitCode: details.exitCode,
      details,
    });
  });
};
