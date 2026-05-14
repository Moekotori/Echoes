import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { app, dialog, shell } from 'electron';
import type { SaveDialogReturnValue } from 'electron';
import type { AudioStatus } from '../../shared/types/audio';
import type { LastCrashSummary, RendererErrorPayload, CrashSessionInfo } from '../../shared/types/diagnostics';
import { getAppSettings } from '../app/appSettings';
import { getAudioSession } from '../audio/AudioSession';
import { getLibraryService } from '../library/LibraryService';
import { hashText, Logger, sanitizeLogPayload } from './Logger';
import { getAccountService } from '../accounts/AccountService';

type CrashRecord = {
  type: string;
  message?: string;
  stack?: string;
  reason?: string;
  exitCode?: number;
  timestamp: string;
  sessionId: string;
  details?: unknown;
};

export type AudioCrashReportPayload = {
  message: string;
  stack?: string;
  phase: string;
  severity?: 'recoverable' | 'fatal';
  recovered?: boolean;
  details?: unknown;
  audioStatus?: AudioStatus | null;
};

type AudioCrashRecord = Omit<AudioCrashReportPayload, 'audioStatus'> & {
  type: 'audio';
  timestamp: string;
  sessionId: string;
  audioStatus?: unknown;
};

const nowIso = (): string => new Date().toISOString();

const createSessionId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const safeFileSegment = (value: string): string => value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const readJson = <T>(filePath: string): T | null => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
};

const writeJson = (filePath: string, value: unknown): void => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()): { date: number; time: number } => ({
  date: (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
});

const createZip = (entries: Array<{ name: string; content: Buffer }>): Buffer => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'));
    const compressed = deflateRawSync(entry.content);
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const safePathValue = (value: string | null): unknown => (value ? { basename: basename(value), pathHash: hashText(value) } : null);

const safeAudioStatus = (status: AudioStatus): unknown => ({
  ...status,
  currentFilePath: safePathValue(status.currentFilePath),
});

export class CrashReportService {
  private session: CrashSessionInfo | null = null;
  private sessionDir: string | null = null;
  private lastCrashSummary: LastCrashSummary | null = null;
  private logger: Logger | null = null;

  constructor(private readonly userDataPath = app.getPath('userData')) {}

  initialize(): void {
    const rootDir = this.getCrashReportsRoot();
    const sessionsDir = this.getSessionsDir();
    mkdirSync(sessionsDir, { recursive: true });
    this.detectLastAbnormalSession(sessionsDir);

    const sessionId = createSessionId();
    const sessionDir = join(sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });

    this.session = {
      sessionId,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      startedAt: nowIso(),
      status: 'running',
    };
    this.sessionDir = sessionDir;
    this.logger = new Logger(sessionDir);
    writeJson(join(sessionDir, 'session.json'), this.session);
    mkdirSync(rootDir, { recursive: true });
    // TODO: Evaluate Electron crashReporter with uploadToServer: false after validating dump behavior in the packaged app.
    this.logger.info('main', 'diagnostics session started', { sessionId });
  }

  closeSession(): void {
    if (!this.session || !this.sessionDir || this.session.status !== 'running') {
      return;
    }

    this.session = {
      ...this.session,
      status: 'closed',
      endedAt: nowIso(),
    };
    writeJson(join(this.sessionDir, 'session.json'), this.session);
    this.logger?.info('main', 'diagnostics session closed', { sessionId: this.session.sessionId });
  }

  getLogger(): Logger | null {
    return this.logger;
  }

  getSessionDir(): string | null {
    return this.sessionDir;
  }

  getCrashReportsRoot(): string {
    return join(this.userDataPath, 'crash-reports');
  }

  getSessionsDir(): string {
    return join(this.getCrashReportsRoot(), 'sessions');
  }

  getLastCrashSummary(): LastCrashSummary | null {
    return this.lastCrashSummary;
  }

  clearLastCrashSummary(): void {
    this.lastCrashSummary = null;
  }

  openDiagnosticsFolder(): Promise<string> {
    return shell.openPath(this.getCrashReportsRoot());
  }

  reportCrash(record: Omit<CrashRecord, 'timestamp' | 'sessionId'>): void {
    if (!this.sessionDir || !this.session) {
      return;
    }

    const crashRecord: CrashRecord = {
      ...record,
      timestamp: nowIso(),
      sessionId: this.session.sessionId,
      details: sanitizeLogPayload(record.details),
    };
    writeJson(join(this.sessionDir, 'crash.json'), crashRecord);
    this.logger?.error('crash', record.type, crashRecord);
  }

  reportRendererError(payload: RendererErrorPayload): void {
    const safePayload = sanitizeLogPayload(payload);
    this.logger?.error('renderer', payload.message, safePayload);
    this.logger?.error('crash', 'renderer error', safePayload);
  }

  reportAudioError(payload: AudioCrashReportPayload): void {
    if (!this.sessionDir || !this.session) {
      return;
    }

    const timestamp = nowIso();
    const record: AudioCrashRecord = {
      ...payload,
      type: 'audio',
      timestamp,
      sessionId: this.session.sessionId,
      severity: payload.severity ?? 'fatal',
      details: sanitizeLogPayload(payload.details),
      audioStatus: payload.audioStatus ? safeAudioStatus(payload.audioStatus) : null,
    };
    const fileName = `audio-crash-${timestamp.replace(/[:.]/g, '-')}-${safeFileSegment(payload.phase || 'audio')}.json`;
    const audioCrashDir = join(this.sessionDir, 'audio-crashes');
    mkdirSync(audioCrashDir, { recursive: true });
    writeJson(join(audioCrashDir, fileName), record);
    writeJson(join(this.sessionDir, 'audio-crash.latest.json'), record);
    this.logger?.error('audio', payload.message, record);
    this.logger?.error('crash', 'audio error', record);
  }

  async exportDiagnosticsZip(destinationPath?: string): Promise<string> {
    if (!this.sessionDir) {
      throw new Error('Diagnostics session has not been initialized.');
    }

    const outputPath = destinationPath ?? (await this.chooseDiagnosticsZipPath());

    if (!outputPath) {
      throw new Error('Diagnostics export was cancelled.');
    }

    const entries = this.collectDiagnosticEntries();
    writeFileSync(outputPath, createZip(entries));
    this.logger?.info('main', 'diagnostics zip exported', { outputPath });
    return outputPath;
  }

  private async chooseDiagnosticsZipPath(): Promise<string | null> {
    const defaultPath = join(
      app.getPath('downloads'),
      `ECHO-Next-Diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`,
    );
    const result: SaveDialogReturnValue = await dialog.showSaveDialog({
      title: 'Export ECHO diagnostics',
      defaultPath,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });

    return result.canceled ? null : (result.filePath ?? null);
  }

  private collectDiagnosticEntries(): Array<{ name: string; content: Buffer }> {
    if (!this.sessionDir) {
      return [];
    }

    const entries: Array<{ name: string; content: Buffer }> = [];
    for (const fileName of [
      'session.json',
      'crash.json',
      'main.log',
      'renderer.log',
      'library.log',
      'audio.log',
      'crash.log',
      'audio-crash.latest.json',
    ]) {
      const filePath = join(this.sessionDir, fileName);
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        entries.push({ name: fileName, content: readFileSync(filePath) });
      }
    }

    const audioCrashDir = join(this.sessionDir, 'audio-crashes');
    if (existsSync(audioCrashDir) && statSync(audioCrashDir).isDirectory()) {
      for (const fileName of readdirSync(audioCrashDir).filter((name) => name.endsWith('.json')).sort().slice(-20)) {
        const filePath = join(audioCrashDir, fileName);
        if (statSync(filePath).isFile()) {
          entries.push({ name: `audio-crashes/${fileName}`, content: readFileSync(filePath) });
        }
      }
    }

    entries.push({ name: 'app-settings.safe.json', content: this.toJsonBuffer(sanitizeLogPayload(getAppSettings())) });
    entries.push({ name: 'accounts-status.safe.json', content: this.toJsonBuffer(this.getSafeAccountStatus()) });
    entries.push({ name: 'library-diagnostics.safe.json', content: this.toJsonBuffer(this.getSafeLibraryDiagnostics()) });
    entries.push({ name: 'playback-status.safe.json', content: this.toJsonBuffer(this.getSafePlaybackStatus()) });
    entries.push({ name: 'audio-status.safe.json', content: this.toJsonBuffer(this.getSafeAudioStatus()) });
    entries.push({ name: 'package-version-info.json', content: this.toJsonBuffer(this.getPackageVersionInfo()) });
    entries.push({
      name: 'privacy-notice.txt',
      content: Buffer.from(
        'Diagnostics are generated locally. This package intentionally excludes music files, cover image binaries, lyric contents, tokens, cookies, and authentication secrets.\n',
      ),
    });

    return entries;
  }

  private getSafeLibraryDiagnostics(): unknown {
    try {
      const diagnostics = getLibraryService().getDiagnostics();
      return {
        ...diagnostics,
        databasePath: safePathValue(diagnostics.databasePath),
        coverCachePath: safePathValue(diagnostics.coverCachePath),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private getSafeAccountStatus(): unknown {
    try {
      return {
        storagePath: safePathValue(getAccountService().getStoragePath()),
        statuses: getAccountService().getStatuses(),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private getSafePlaybackStatus(): unknown {
    try {
      const status = getAudioSession().getStatus();
      return {
        state: status.state,
        currentTrackId: status.currentTrackId,
        positionSeconds: status.positionSeconds,
        durationSeconds: status.durationSeconds,
        currentFilePath: safePathValue(status.currentFilePath),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private getSafeAudioStatus(): unknown {
    try {
      return safeAudioStatus(getAudioSession().getStatus());
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private getPackageVersionInfo(): unknown {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    };
  }

  private toJsonBuffer(value: unknown): Buffer {
    return Buffer.from(`${JSON.stringify(sanitizeLogPayload(value), null, 2)}\n`);
  }

  private detectLastAbnormalSession(sessionsDir: string): void {
    const sessionNames = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const previousSessionName = sessionNames.at(-1);
    if (!previousSessionName) {
      return;
    }

    const previousSessionDir = join(sessionsDir, previousSessionName);
    const sessionFilePath = join(previousSessionDir, 'session.json');
    const previousSession = readJson<CrashSessionInfo>(sessionFilePath);

    if (previousSession?.status !== 'running') {
      return;
    }

    const detectedAt = nowIso();
    const abnormalSession: CrashSessionInfo = {
      ...previousSession,
      status: 'abnormalExit',
      endedAt: detectedAt,
    };
    writeJson(sessionFilePath, abnormalSession);
    this.lastCrashSummary = {
      sessionId: previousSession.sessionId,
      startedAt: previousSession.startedAt,
      endedAt: detectedAt,
      detectedAt,
      sessionBasename: basename(previousSessionDir),
      sessionPathHash: hashText(previousSessionDir),
      reason: 'abnormalExit',
    };
  }
}

let crashReportService: CrashReportService | null = null;

export const getCrashReportService = (): CrashReportService => {
  crashReportService ??= new CrashReportService();
  return crashReportService;
};

export const resetCrashReportServiceForTests = (): void => {
  crashReportService = null;
};
