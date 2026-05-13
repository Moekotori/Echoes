import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { LastCrashSummary, RendererErrorPayload } from '../../shared/types/diagnostics';
import { getCrashReportService } from '../diagnostics/CrashReportService';

const normalizeRendererError = (value: unknown): RendererErrorPayload => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const source = input.source === 'unhandledrejection' ? 'unhandledrejection' : 'error';

  return {
    message: typeof input.message === 'string' && input.message.trim() ? input.message : 'Renderer error',
    stack: typeof input.stack === 'string' ? input.stack : undefined,
    filename: typeof input.filename === 'string' ? input.filename : undefined,
    lineno: typeof input.lineno === 'number' && Number.isFinite(input.lineno) ? input.lineno : undefined,
    colno: typeof input.colno === 'number' && Number.isFinite(input.colno) ? input.colno : undefined,
    source,
    timestamp: typeof input.timestamp === 'string' && input.timestamp.trim() ? input.timestamp : new Date().toISOString(),
  };
};

export const registerDiagnosticsIpc = (): void => {
  ipcMain.handle(IpcChannels.DiagnosticsGetLastCrashSummary, (): LastCrashSummary | null =>
    getCrashReportService().getLastCrashSummary(),
  );
  ipcMain.handle(IpcChannels.DiagnosticsClearLastCrashSummary, (): void => {
    getCrashReportService().clearLastCrashSummary();
  });
  ipcMain.handle(IpcChannels.DiagnosticsExport, (): Promise<string> => getCrashReportService().exportDiagnosticsZip());
  ipcMain.handle(IpcChannels.DiagnosticsOpenFolder, (): Promise<string> => getCrashReportService().openDiagnosticsFolder());
  ipcMain.handle(IpcChannels.DiagnosticsReportRendererError, (_event, payload: unknown): void => {
    getCrashReportService().reportRendererError(normalizeRendererError(payload));
  });
};
