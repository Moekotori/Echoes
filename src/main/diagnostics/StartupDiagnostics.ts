import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import type { AppSettings } from '../../shared/types/appSettings';
import { sanitizeLogPayload, sanitizePath } from './Logger';
import { openDevConsoleWindow, recordDevConsoleSystemEntry } from './DevConsoleService';
import { attachExceptionRecorderFile, recordDiagnosticException } from './ExceptionRecorder';

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
type StartupShellSpawner = typeof spawn;

const startupSlowStageThresholdMs = 2000;
const startupLogFileName = 'startup-safe-mode.log';
const safeModeShellPollIntervalMs = 250;
let startupLogPath: string | null = null;
let startupShellStarted = false;

const formatMs = (value: number): string => `${Math.max(0, Math.round(value))}ms`;

const escapePowerShellSingleQuotedString = (value: string): string => value.replace(/'/g, "''");

const formatStartupLogLine = (entry: StartupDiagnosticEntry): string => {
  const slowSuffix = entry.slow ? ' SLOW' : '';
  const details = entry.details === undefined ? '' : ` ${JSON.stringify(entry.details)}`;
  return `[${entry.timestamp}] #${entry.index} ${entry.stage} +${formatMs(entry.deltaMs)} total=${formatMs(entry.elapsedMs)}${slowSuffix}${details}`;
};

const appendStartupLogLine = (line: string): void => {
  if (!startupLogPath) {
    return;
  }

  try {
    appendFileSync(startupLogPath, `${line}\n`, 'utf8');
  } catch {
    // Startup logging must never block the app from opening.
  }
};

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
    appendStartupLogLine(formatStartupLogLine(entry));
    if (slow) {
      recordDiagnosticException({
        source: 'startup',
        severity: 'warn',
        type: 'slow-startup-stage',
        message: `${stage} took ${formatMs(deltaMs)}`,
        details: {
          stage,
          elapsedMs,
          deltaMs,
        },
      });
    }

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
  startupLogPath = null;
  startupShellStarted = false;
};

export const getSafeModeStartupLogPath = (userDataPath: string): string =>
  join(userDataPath, 'crash-reports', startupLogFileName);

export const readSafeModeEnabledFromSettingsFile = (userDataPath: string): boolean => {
  try {
    const settingsPath = join(userDataPath, 'echo-settings.json');
    if (!existsSync(settingsPath)) {
      return false;
    }

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<AppSettings>;
    return settings.safeModeEnabled === true;
  } catch {
    return false;
  }
};

export const attachStartupLogFile = (userDataPath: string, context: SafeModeStartupContext): string => {
  const logPath = getSafeModeStartupLogPath(userDataPath);
  startupLogPath = logPath;

  try {
    mkdirSync(dirname(logPath), { recursive: true });
    const safeUserData = sanitizePath(context.userDataPath);
    writeFileSync(
      logPath,
      [
        `ECHO Safe mode early startup shell`,
        `version=${context.appVersion} platform=${context.platform} arch=${context.arch} userData=${safeUserData.basename}#${safeUserData.pathHash}`,
        `startedAt=${new Date().toISOString()}`,
        '',
        ...getStartupTimelineSnapshot().map(formatStartupLogLine),
      ].join('\n') + '\n',
      'utf8',
    );
  } catch {
    // Keep the in-memory timeline even if the file cannot be created.
  }

  return logPath;
};

export const createSafeModePowerShellTailArgs = (exceptionLogPath: string, startupLogPath: string): string[] => {
  const escapedExceptionPath = escapePowerShellSingleQuotedString(exceptionLogPath);
  const escapedStartupPath = escapePowerShellSingleQuotedString(startupLogPath);
  const script = [
    "$Host.UI.RawUI.WindowTitle = 'ECHO Safe Mode Bug Watch'",
    "$host.PrivateData.ProgressBackgroundColor = 'Black'",
    "$host.PrivateData.ProgressForegroundColor = 'Green'",
    `Write-Host 'ECHO Safe Mode Bug Watch' -ForegroundColor Cyan`,
    `Write-Host 'Exceptions: ${escapedExceptionPath}' -ForegroundColor DarkGray`,
    `Write-Host 'Startup timeline: ${escapedStartupPath}' -ForegroundColor DarkGray`,
    `Write-Host 'Watching exceptions, renderer errors, audio errors, slow startup stages, and startup timeline changes.' -ForegroundColor Yellow`,
    `Write-Host ''`,
    `$exceptionLog = '${escapedExceptionPath}'`,
    `$startupLog = '${escapedStartupPath}'`,
    `$positions = @{}`,
    `$lastColor = 'Gray'`,
    `function Write-EchoWatchLine { param([string]$label,[string]$line) if ([string]::IsNullOrWhiteSpace($line)) { return } $prefix = '[' + $label + '] '; if ($line -match '\\[(fatal|error)\\]' -or $line -match '\\b(?:error|exception|failed|fatal|crash|timeout|denied|unhandled|corrupt|unavailable|not found|exit_code|spawn_error)\\b') { $script:lastColor = 'Red'; Write-Host ($prefix + $line) -ForegroundColor Red } elseif ($line -match '\\[warn\\]' -or $line -match '\\b(?:warn|warning|slow|SLOW|fallback|retry|recover|mismatch|degraded|blocked)\\b') { $script:lastColor = 'Yellow'; Write-Host ($prefix + $line) -ForegroundColor Yellow } elseif ($line -match '^\\s+stack=') { Write-Host ($prefix + $line) -ForegroundColor $script:lastColor } elseif ($label -eq 'startup') { Write-Host ($prefix + $line) -ForegroundColor DarkCyan } else { $script:lastColor = 'Gray'; Write-Host ($prefix + $line) -ForegroundColor Gray } }`,
    `function Read-EchoNewLines { param([string]$label,[string]$path) if (-not (Test-Path -LiteralPath $path)) { return } $stream = $null; $reader = $null; try { $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); $position = 0; if ($positions.ContainsKey($path)) { $position = [int64]$positions[$path] } if ($position -gt $stream.Length) { $position = 0 } $stream.Seek($position, [System.IO.SeekOrigin]::Begin) | Out-Null; $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true, 4096, $true); $text = $reader.ReadToEnd(); $positions[$path] = $stream.Position; if ($text.Length -gt 0) { $text -split "\\r?\\n|\\r" | ForEach-Object { Write-EchoWatchLine $label $_ } } } catch { Write-Host ('[watcher] failed to read ' + $label + ': ' + $_.Exception.Message) -ForegroundColor Yellow } finally { if ($reader) { $reader.Dispose() }; if ($stream) { $stream.Dispose() } } }`,
    `while ($true) { Read-EchoNewLines 'exception' $exceptionLog; Read-EchoNewLines 'startup' $startupLog; Start-Sleep -Milliseconds ${safeModeShellPollIntervalMs} }`,
  ].join('; ');

  return ['-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script];
};

export const openEarlySafeModeShellIfEnabled = (
  context: SafeModeStartupContext,
  spawner: StartupShellSpawner = spawn,
): boolean => {
  if (startupShellStarted || context.platform !== 'win32' || !readSafeModeEnabledFromSettingsFile(context.userDataPath)) {
    return false;
  }

  startupShellStarted = true;
  const startupLogPath = attachStartupLogFile(context.userDataPath, context);
  const exceptionLogPath = attachExceptionRecorderFile(context.userDataPath, context);
  markStartupStage('safe-mode:early-shell:launching', {
    exceptionLogPath,
    startupLogPath,
    surface: 'powershell',
  });

  try {
    const child = spawner('powershell.exe', createSafeModePowerShellTailArgs(exceptionLogPath, startupLogPath), {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    markStartupStage('safe-mode:early-shell:launched', { surface: 'powershell' });
    return true;
  } catch (error) {
    recordDiagnosticException({
      source: 'startup',
      severity: 'error',
      type: 'safe-mode-shell-open-failed',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      phase: 'safe-mode:early-shell:launch',
    });
    markStartupStage('safe-mode:early-shell:failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
