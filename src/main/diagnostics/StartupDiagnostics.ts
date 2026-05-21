import type { AppSettings } from '../../shared/types/appSettings';
import { sanitizeLogPayload, sanitizePath } from './Logger';
import { openDevConsoleWindow, recordDevConsoleSystemEntry } from './DevConsoleService';

export type StartupDiagnosticEntry = {
  index: number;
  stage: string;
  timestamp: string;
  elapsedMs: number;
  deltaMs: number;
  slow: boolean;
  details?: unknown;
};

export type SafeModeStartupContext = {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  userDataPath: string;
};

type StartupDiagnosticsSink = (message: string) => void;
type StartupDiagnosticsClock = () => number;

const startupSlowStageThresholdMs = 2000;

const formatMs = (value: number): string => `${Math.max(0, Math.round(value))}ms`;

const sanitizeDetails = (details: unknown): unknown => {
  if (details === undefined) {
    return undefined;
  }

  return sanitizeLogPayload(details);
};

export const createStartupDiagnosticsTracker = (
  clock: StartupDiagnosticsClock = () => Date.now(),
  sink: StartupDiagnosticsSink = recordDevConsoleSystemEntry,
) => {
  let bootTimeMs = clock();
  let lastStageMs = bootTimeMs;
  let nextIndex = 1;
  let entries: StartupDiagnosticEntry[] = [];

  const reset = (): void => {
    bootTimeMs = clock();
    lastStageMs = bootTimeMs;
    nextIndex = 1;
    entries = [];
  };

  const mark = (stage: string, details?: unknown): StartupDiagnosticEntry => {
    const nowMs = clock();
    const elapsedMs = Math.max(0, Math.round(nowMs - bootTimeMs));
    const deltaMs = Math.max(0, Math.round(nowMs - lastStageMs));
    const slow = deltaMs >= startupSlowStageThresholdMs;
    const entry: StartupDiagnosticEntry = {
      index: nextIndex,
      stage,
      timestamp: new Date().toISOString(),
      elapsedMs,
      deltaMs,
      slow,
      details: sanitizeDetails(details),
    };

    nextIndex += 1;
    lastStageMs = nowMs;
    entries.push(entry);

    const slowSuffix = slow ? ' SLOW' : '';
    sink(`[Startup] #${entry.index} ${stage} +${formatMs(deltaMs)} total=${formatMs(elapsedMs)}${slowSuffix}`);

    return entry;
  };

  const snapshot = (): StartupDiagnosticEntry[] => entries.map((entry) => ({ ...entry }));

  return {
    mark,
    reset,
    snapshot,
  };
};

const startupDiagnostics = createStartupDiagnosticsTracker();

export const markStartupStage = (stage: string, details?: unknown): StartupDiagnosticEntry =>
  startupDiagnostics.mark(stage, details);

export const getStartupTimelineSnapshot = (): StartupDiagnosticEntry[] => startupDiagnostics.snapshot();

export const resetStartupDiagnosticsForTests = (): void => {
  startupDiagnostics.reset();
};

export const recordSafeModeStartupBanner = (context: SafeModeStartupContext): void => {
  const safeUserData = sanitizePath(context.userDataPath);
  recordDevConsoleSystemEntry(
    [
      '[Safe mode] startup diagnostics enabled.',
      `version=${context.appVersion}`,
      `platform=${context.platform}`,
      `arch=${context.arch}`,
      `userData=${safeUserData.basename}#${safeUserData.pathHash}`,
    ].join(' '),
  );
  markStartupStage('safe-mode:banner', {
    safeModeEnabled: true,
    appVersion: context.appVersion,
    platform: context.platform,
    arch: context.arch,
    userData: safeUserData,
  });
};

export const openSafeModeStartupConsoleIfEnabled = (
  settings: Pick<AppSettings, 'safeModeEnabled'>,
  context: SafeModeStartupContext,
  openConsole: () => void = openDevConsoleWindow,
): boolean => {
  if (settings.safeModeEnabled !== true) {
    markStartupStage('safe-mode:disabled', { safeModeEnabled: false });
    return false;
  }

  recordSafeModeStartupBanner(context);
  openConsole();
  markStartupStage('safe-mode:console-opened', { safeModeEnabled: true });
  return true;
};
