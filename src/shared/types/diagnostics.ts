export type DiagnosticScope = 'main' | 'renderer' | 'library' | 'audio' | 'playback' | 'network' | 'crash';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export type CrashSessionStatus = 'running' | 'closed' | 'abnormalExit';

export type CrashSessionInfo = {
  sessionId: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  startedAt: string;
  endedAt?: string;
  status: CrashSessionStatus;
};

export type LastCrashSummary = {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  detectedAt: string;
  sessionBasename: string;
  sessionPathHash: string;
  reason: 'abnormalExit';
};

export type RendererErrorPayload = {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  source: 'error' | 'unhandledrejection';
  timestamp: string;
};
