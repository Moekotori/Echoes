import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { app } from 'electron';
import type { SmtcCommand, SmtcEnabledActions, SmtcPlaybackState, SmtcService, SmtcTrackMetadata } from './SmtcService';
import { SmtcCoverCache } from './SmtcCoverCache';

type SmtcLogger = {
  warn: (message: string, payload?: unknown) => void;
  info: (message: string, payload?: unknown) => void;
};

const defaultLogger: SmtcLogger = {
  warn: (message, payload) => console.warn(message, payload ?? ''),
  info: () => undefined,
};

type SmtcHostProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'on' | 'once' | 'kill' | 'killed' | 'exitCode'>;
type SpawnSmtcHost = (command: string, args?: readonly string[], options?: SpawnOptionsWithoutStdio) => SmtcHostProcess;
type CoverCacheLike = Pick<SmtcCoverCache, 'resolve'>;

export type WindowsSmtcServiceOptions = {
  logger?: SmtcLogger;
  spawnHost?: SpawnSmtcHost;
  resolveHostPath?: () => string;
  hostExists?: (hostPath: string) => boolean;
  coverCache?: CoverCacheLike;
};

const helperName = 'echo-smtc-host.exe';

export const resolveDefaultSmtcHostPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, helperName);
  }

  return join(app.getAppPath(), 'electron-app', 'build', helperName);
};

export class WindowsSmtcService implements SmtcService {
  private readonly commands = new EventEmitter();
  private readonly logger: SmtcLogger;
  private readonly spawnHost: SpawnSmtcHost;
  private readonly resolveHostPath: () => string;
  private readonly hostExists: (hostPath: string) => boolean;
  private readonly coverCache: CoverCacheLike;
  private host: SmtcHostProcess | null = null;
  private initialized = false;
  private disposed = false;
  private unavailable = false;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private pendingGracefulStop: Promise<void> | null = null;
  private stoppingGracefully = false;

  constructor(options: WindowsSmtcServiceOptions | SmtcLogger = {}) {
    if ('info' in options && 'warn' in options) {
      this.logger = options;
      this.spawnHost = spawn;
      this.resolveHostPath = resolveDefaultSmtcHostPath;
      this.hostExists = existsSync;
      this.coverCache = new SmtcCoverCache();
      return;
    }

    this.logger = options.logger ?? defaultLogger;
    this.spawnHost = options.spawnHost ?? spawn;
    this.resolveHostPath = options.resolveHostPath ?? resolveDefaultSmtcHostPath;
    this.hostExists = options.hostExists ?? existsSync;
    this.coverCache = options.coverCache ?? new SmtcCoverCache();
  }

  async initialize(): Promise<void> {
    if (this.initialized || this.unavailable || this.disposed) {
      return;
    }

    const hostPath = this.resolveHostPath();
    if (!this.hostExists(hostPath)) {
      this.unavailable = true;
      this.logger.warn('[SMTC] Windows SMTC host binary is missing; using no-op bridge mode', { hostPath });
      return;
    }

    this.initialized = true;
    try {
      this.host = this.spawnHost(hostPath, [], {
        windowsHide: true,
        stdio: 'pipe',
      });
      this.bindHostProcess(this.host, hostPath);
      this.logger.info('[SMTC] Windows SMTC host initialized', { hostPath });
    } catch (error) {
      this.initialized = false;
      this.unavailable = true;
      this.logger.warn('[SMTC] Failed to start Windows SMTC host; using no-op bridge mode', {
        hostPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stopGracefullyImpl();
    this.commands.removeAllListeners();
    this.initialized = false;
  }

  async stopGracefullyImpl(timeoutMs = 1000): Promise<void> {
    if (this.pendingGracefulStop) {
      return this.pendingGracefulStop;
    }

    const host = this.host;
    if (!host || host.killed || host.exitCode !== null) {
      this.host = null;
      return;
    }

    this.stoppingGracefully = true;
    this.pendingGracefulStop = this.stopHostProcess(host, timeoutMs).finally(() => {
      if (this.host === host) {
        this.host = null;
      }
      this.stoppingGracefully = false;
      this.pendingGracefulStop = null;
    });

    return this.pendingGracefulStop;
  }

  private async stopHostProcess(host: SmtcHostProcess, timeoutMs: number): Promise<void> {
    try {
      this.writeRawToHost(host, { type: 'dispose' });
    } catch {
      // Best-effort child cleanup.
    }

    try {
      if (!host.stdin.destroyed && !host.stdin.writableEnded) {
        host.stdin.end();
      }
    } catch {
      // ignore process teardown races
    }

    const exited = await Promise.race([
      new Promise<boolean>((resolve) => host.once('exit', () => resolve(true))),
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), Math.max(1, timeoutMs));
        timer.unref?.();
      }),
    ]);

    if (!exited && !host.killed && host.exitCode === null) {
      this.logger.warn('[SMTC] graceful shutdown timed out, force killing');
      try {
        host.kill('SIGKILL');
      } catch {
        // Best-effort emergency cleanup.
      }
    }
  }

  async setPlaybackState(state: SmtcPlaybackState): Promise<void> {
    await this.writeMessage({ type: 'setPlaybackState', state });
  }

  async setMetadata(metadata: SmtcTrackMetadata): Promise<void> {
    const coverPath = await this.coverCache.resolve(metadata.coverPath);
    await this.writeMessage({
      type: 'setMetadata',
      ...metadata,
      coverPath,
    });
  }

  async setTimeline(positionSeconds: number, durationSeconds: number): Promise<void> {
    await this.writeMessage({
      type: 'setTimeline',
      positionSeconds: this.safeNumber(positionSeconds),
      durationSeconds: this.safeNumber(durationSeconds),
    });
  }

  async setEnabledActions(actions: SmtcEnabledActions): Promise<void> {
    await this.writeMessage({
      type: 'setEnabledActions',
      play: actions.play,
      pause: actions.pause,
      previous: actions.previous,
      next: actions.next,
      seek: false,
    });
  }

  onCommand(handler: (command: SmtcCommand) => void): () => void {
    this.commands.on('command', handler);
    return () => this.commands.off('command', handler);
  }

  protected emitCommand(command: SmtcCommand): void {
    this.commands.emit('command', command);
  }

  private bindHostProcess(host: SmtcHostProcess, hostPath: string): void {
    host.stdout.on('data', (chunk: Buffer | string) => {
      this.stdoutBuffer = this.consumeLines(this.stdoutBuffer + chunk.toString(), (line) => this.handleStdoutLine(line));
    });

    host.stderr.on('data', (chunk: Buffer | string) => {
      this.stderrBuffer = this.consumeLines(this.stderrBuffer + chunk.toString(), (line) => {
        if (line.trim()) {
          this.logger.warn('[SMTC] Windows SMTC host stderr', { line });
        }
      });
    });

    host.on('error', (error: Error) => {
      this.unavailable = true;
      this.logger.warn('[SMTC] Windows SMTC host process error', {
        hostPath,
        error: error.message,
      });
    });

    host.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.host = null;
      this.initialized = false;
      if (!this.disposed && !this.stoppingGracefully) {
        this.unavailable = true;
        this.logger.warn('[SMTC] Windows SMTC host exited unexpectedly', { hostPath, code, signal });
      }
    });
  }

  private consumeLines(buffer: string, onLine: (line: string) => void): string {
    const lines = buffer.split(/\r?\n/u);
    const nextBuffer = lines.pop() ?? '';

    for (const line of lines) {
      onLine(line);
    }

    return nextBuffer;
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const message = JSON.parse(line) as { type?: unknown; command?: unknown; message?: unknown };
      if (message.type === 'command' && this.isCommand(message.command)) {
        this.emitCommand(message.command);
      } else if (message.type === 'error') {
        this.logger.warn('[SMTC] Windows SMTC host reported an error', { message: String(message.message ?? '') });
      }
    } catch (error) {
      this.logger.warn('[SMTC] Failed to parse Windows SMTC host output', {
        line,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async writeMessage(message: Record<string, unknown>): Promise<void> {
    await this.initialize();
    this.writeRaw(message);
  }

  private writeRaw(message: Record<string, unknown>): void {
    if (!this.host || this.disposed || this.unavailable || this.host.stdin.destroyed || !this.host.stdin.writable) {
      return;
    }

    this.writeRawToHost(this.host, message);
  }

  private writeRawToHost(host: SmtcHostProcess, message: Record<string, unknown>): void {
    if (host.stdin.destroyed || !host.stdin.writable) {
      return;
    }

    host.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private safeNumber(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private isCommand(value: unknown): value is SmtcCommand {
    return value === 'play' || value === 'pause' || value === 'playPause' || value === 'previous' || value === 'next' || value === 'stop';
  }
}
