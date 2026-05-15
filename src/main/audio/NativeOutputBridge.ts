import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithStdioTuple } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import electron from 'electron';
import { getEqBridge } from './EqBridge';
import type {
  NativeBridgeReadyMessage,
  NativeBridgeReadyResult,
  NativeOutputTelemetry,
  NativeOutputStartOptions,
} from './audioTypes';

type BridgeSpawnOptions = SpawnOptionsWithStdioTuple<'pipe', 'pipe', 'pipe'> & {
  windowsHide: boolean;
};

export type HostSpawner = (
  file: string,
  args: string[],
  options: BridgeSpawnOptions,
) => ChildProcessWithoutNullStreams;

export type NativeOutputBridgeDependencies = {
  hostBinary?: string | null;
  spawn?: HostSpawner;
  readyTimeoutMs?: number;
  logger?: (message: string) => void;
};

export type HostBinaryResolveOptions = {
  cwd?: string;
  appPath?: string | null;
  resourcesPath?: string;
  exists?: (path: string) => boolean;
  includeMigrationFallback?: boolean;
};

const getElectronAppPath = (): string | null => {
  const electronApp = (electron as unknown as { app?: { getAppPath: () => string } }).app;

  try {
    return electronApp?.getAppPath?.() ?? null;
  } catch {
    return null;
  }
};

const defaultLogger = (message: string): void => {
  console.warn(message);
};

const sharedReadyTimeoutMs = 15_000;
const slowNativeModeReadyTimeoutMs = 45_000;
const maxPositionExtrapolationMs = 250;

const appendTailLine = (lines: string[], line: string): void => {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  lines.push(trimmed);
  if (lines.length > 8) {
    lines.shift();
  }
};

const createHostError = (
  reason: string,
  hostBinary: string,
  args: string[],
  stderrLines: string[],
  metadata: { elapsedMs: number; mode: 'shared' | 'exclusive' | 'asio' },
): Error => {
  const stderr = stderrLines.join(' | ');
  const details = [
    `host="${hostBinary}"`,
    `args="${args.join(' ')}"`,
    `mode="${metadata.mode}"`,
    `elapsedMs=${Math.max(0, Math.round(metadata.elapsedMs))}`,
  ];

  if (stderr) {
    details.push(`stderrTail="${stderr}"`);
  }

  return new Error(`echo-audio-host ${reason}; ${details.join('; ')}`);
};

export const resolveHostBinary = (options: HostBinaryResolveOptions = {}): string | null => {
  const exe = process.platform === 'win32' ? 'echo-audio-host.exe' : 'echo-audio-host';
  const appPath = options.appPath === undefined ? getElectronAppPath() : options.appPath;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const includeMigrationFallback = options.includeMigrationFallback ?? true;
  const candidates: string[] = [];

  if (resourcesPath) {
    candidates.push(join(resourcesPath, exe));
  }

  if (appPath) {
    candidates.push(join(appPath, '..', exe));
    candidates.push(join(appPath, '..', '..', 'electron-app', 'build', exe));
    candidates.push(join(appPath, 'electron-app', 'build', exe));
  }

  candidates.push(join(cwd, 'electron-app', 'build', exe));
  candidates.push(join(cwd, 'build', exe));

  if (includeMigrationFallback) {
    // Local migration fallback only. Dev and production should use ECHO Next's
    // own electron-app/build copy or the packaged resourcesPath binary.
    candidates.push(join(cwd, '..', 'ECHO', 'electron-app', 'build', exe));
  }

  return candidates.find((candidate) => exists(candidate)) ?? null;
};

export const isNativeOutputBridgeAvailable = (): boolean => resolveHostBinary() !== null;

class BridgeWritable extends Writable {
  private isClosed = false;

  constructor(private readonly target: Writable) {
    super();

    target.on('error', () => {
      this.isClosed = true;
    });
    target.on('close', () => {
      this.isClosed = true;
    });
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.isClosed || this.target.destroyed || this.target.writableEnded || !this.target.writable) {
      this.isClosed = true;
      callback();
      return;
    }

    try {
      this.target.write(chunk, (error: Error | null | undefined) => {
        if (error) {
          this.isClosed = true;
        }

        callback();
      });
    } catch {
      this.isClosed = true;
      callback();
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.isClosed || this.target.destroyed || this.target.writableEnded || !this.target.writable) {
      callback();
      return;
    }

    try {
      this.target.end(callback);
    } catch {
      this.isClosed = true;
      callback();
    }
  }
}

const framedMagic = 'ECNP';
const framedVersion = 1;
const frameTypeBeginSession = 1;
const frameTypePcmF32Le = 2;
const frameTypeEndSession = 3;
const frameTypeShutdown = 4;

const createFrameHeader = (type: number, sessionId: number, payloadBytes: number): Buffer => {
  const header = Buffer.alloc(16);
  header.write(framedMagic, 0, 'ascii');
  header.writeUInt8(framedVersion, 4);
  header.writeUInt8(type, 5);
  header.writeUInt32LE(sessionId >>> 0, 8);
  header.writeUInt32LE(Math.max(0, payloadBytes) >>> 0, 12);
  return header;
};

const normalizeOutputMode = (options: NativeOutputStartOptions): 'shared' | 'exclusive' | 'asio' =>
  options.asio ? 'asio' : options.exclusive ? 'exclusive' : 'shared';

const normalizePositiveInteger = (value: unknown): number | null => {
  const numeric = Number(value);

  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
};

const createReuseKey = (options: NativeOutputStartOptions): string => {
  const outputMode = normalizeOutputMode(options);
  const sampleRate =
    outputMode === 'shared'
      ? normalizePositiveInteger(options.sharedMixSampleRate) ?? normalizePositiveInteger(options.requestedOutputSampleRate)
      : normalizePositiveInteger(options.requestedOutputSampleRate);

  return JSON.stringify({
    outputMode: options.asio ? 'asio' : options.exclusive ? 'exclusive' : 'shared',
    deviceIndex: Number.isInteger(Number(options.deviceIndex)) ? Number(options.deviceIndex) : null,
    deviceName: options.deviceName ?? null,
    sampleRate,
    channels: options.channels,
    asio: options.asio === true,
    exclusive: options.exclusive === true,
    bufferSizeFrames: Number.isFinite(Number(options.bufferSizeFrames)) ? Math.round(Number(options.bufferSizeFrames)) : null,
    latencyProfile: options.latencyProfile ?? null,
    playbackSpeedMode: options.playbackSpeedMode ?? null,
  });
};

class FramedSessionWritable extends Writable {
  private sessionClosed = false;

  constructor(
    private readonly owner: NativeOutputBridge,
    private readonly sessionId: number,
  ) {
    super();
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.sessionClosed) {
      callback();
      return;
    }

    this.owner.writePcmFrame(this.sessionId, chunk, callback);
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.sessionClosed) {
      callback();
      return;
    }

    this.sessionClosed = true;
    this.owner.endSession(this.sessionId, callback);
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.sessionClosed = true;
    callback(error);
  }
}

export class NativeOutputBridge extends EventEmitter {
  private readonly spawn: HostSpawner;
  private readonly readyTimeoutMs: number;
  private readonly logger: (message: string) => void;
  private hostBinary: string | null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private bridgeWritable: BridgeWritable | null = null;
  private sessionWritable: FramedSessionWritable | null = null;
  private sessionIdCounter = 0;
  private currentSessionId = 0;
  private currentSessionHasPcm = false;
  private reuseKey: string | null = null;
  private framesConsumed = 0;
  private frameOffset = 0;
  private requestedOutputSampleRate = 44100;
  private actualDeviceSampleRate: number | null = null;
  private durationSeconds: number | null = null;
  private lastPositionReportedAtMs: number | null = null;
  private telemetry: NativeOutputTelemetry = {
    positionFrames: 0,
    bufferedFrames: null,
    underrunCallbacks: 0,
    underrunFrames: 0,
    reportedAtMs: null,
    nativePositionStalenessMs: null,
  };
  private startSeconds = 0;
  private playbackRate = 1;
  private ready = false;
  private ended = false;
  private stopRequested = false;
  private readyTimer: NodeJS.Timeout | null = null;
  private readyMessage: NativeBridgeReadyMessage | null = null;
  private eqControlPort: number | null = null;

  constructor(dependencies: NativeOutputBridgeDependencies = {}) {
    super();
    this.hostBinary = dependencies.hostBinary ?? null;
    this.spawn = dependencies.spawn ?? nodeSpawn;
    this.readyTimeoutMs = dependencies.readyTimeoutMs ?? sharedReadyTimeoutMs;
    this.logger = dependencies.logger ?? defaultLogger;
    this.on('error', () => undefined);
  }

  get writable(): Writable | null {
    return this.bridgeWritable;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get deviceInfo(): NativeBridgeReadyMessage | null {
    return this.readyMessage;
  }

  get requestedSampleRate(): number {
    return this.requestedOutputSampleRate;
  }

  get actualSampleRate(): number | null {
    return this.actualDeviceSampleRate;
  }

  async start(options: NativeOutputStartOptions): Promise<NativeBridgeReadyResult> {
    return new Promise((resolve, reject) => {
      const bin = this.hostBinary ?? resolveHostBinary();

      if (!bin) {
        reject(new Error('echo-audio-host binary not found'));
        return;
      }

      this.hostBinary = bin;
      this.requestedOutputSampleRate = options.requestedOutputSampleRate;
      this.actualDeviceSampleRate = null;
      this.durationSeconds =
        typeof options.durationSeconds === 'number' && Number.isFinite(options.durationSeconds) && options.durationSeconds > 0
          ? options.durationSeconds
          : null;
      this.lastPositionReportedAtMs = null;
      this.telemetry = {
        positionFrames: 0,
        bufferedFrames: null,
        underrunCallbacks: 0,
        underrunFrames: 0,
        reportedAtMs: null,
        nativePositionStalenessMs: null,
      };
      this.startSeconds = options.startSeconds ?? 0;
      this.playbackRate = options.playbackRate ?? 1;
      this.framesConsumed = 0;
      this.frameOffset = 0;
      this.sessionIdCounter = 0;
      this.currentSessionId = 0;
      this.currentSessionHasPcm = false;
      this.reuseKey = createReuseKey(options);
      this.ready = false;
      this.ended = false;
      this.stopRequested = false;
      this.readyMessage = null;
      this.eqControlPort = getEqBridge().reserveControlPort();

      const args = this.createSpawnArgs(options);
      const stderrLines: string[] = [];
      const startedAtMs = performance.now();
      const mode = options.asio ? 'asio' : options.exclusive ? 'exclusive' : 'shared';
      const createError = (reason: string): Error =>
        createHostError(reason, bin, args, stderrLines, {
          elapsedMs: performance.now() - startedAtMs,
          mode,
        });
      let settled = false;
      const settleResolve = (value: NativeBridgeReadyResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };
      const settleReject = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      };

      this.logger(`[NativeOutputBridge] spawn: ${bin} ${args.join(' ')}`);
      this.proc = this.spawn(bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.bridgeWritable = new BridgeWritable(this.proc.stdin);

      const stdout = readline.createInterface({ input: this.proc.stdout });
      stdout.on('line', (line) => {
        this.handleStdoutLine(line, settleResolve);
      });

      const stderr = readline.createInterface({ input: this.proc.stderr });
      stderr.on('line', (line) => {
        appendTailLine(stderrLines, line);
        this.logger(`[echo-audio-host] ${line}`);
      });

      this.proc.on('error', (error) => {
        const hostError = createError(`spawn_error:${error.message}`);
        settleReject(hostError);
        this.emit('error', hostError);
      });

      this.proc.on('exit', (code, signal) => {
        const wasReady = this.ready;
        const intentional = this.stopRequested;
        this.ready = false;
        this.stopRequested = false;
        this.clearReadyTimer();

        if (intentional || this.ended || code === 0) {
          return;
        }

        const reason =
          code === -2
            ? 'exclusive_denied'
            : code != null ? `exit_code_${code}` : `exit_signal_${signal ?? '?'}`;
        const error = createError(reason);

        if (!wasReady) {
          settleReject(error);
          return;
        }

        this.emit('error', error);
      });

      this.clearReadyTimer();
      const readyTimeoutMs =
        options.exclusive || options.asio
          ? Math.max(this.readyTimeoutMs, slowNativeModeReadyTimeoutMs)
          : this.readyTimeoutMs;
      this.readyTimer = setTimeout(() => {
        this.readyTimer = null;
        if (!this.ready) {
          this.stop();
          settleReject(createError('timeout_waiting_for_ready'));
        }
      }, readyTimeoutMs);
    });
  }

  getPositionSeconds(): number {
    const sampleRate = this.actualDeviceSampleRate ?? this.requestedOutputSampleRate;

    if (sampleRate <= 0) {
      return this.startSeconds;
    }

    const localFrames = Math.max(0, this.framesConsumed - this.frameOffset);
    let positionSeconds = this.startSeconds + (localFrames / sampleRate) * this.playbackRate;

    if (this.ready && !this.ended && this.lastPositionReportedAtMs !== null) {
      const elapsedMs = Math.max(0, performance.now() - this.lastPositionReportedAtMs);
      const extrapolatedMs = Math.min(elapsedMs, maxPositionExtrapolationMs);
      positionSeconds += (extrapolatedMs / 1000) * this.playbackRate;
    }

    return this.durationSeconds !== null ? Math.min(positionSeconds, this.durationSeconds) : positionSeconds;
  }

  getPositionStalenessMs(): number | null {
    if (this.lastPositionReportedAtMs === null) {
      return null;
    }

    return Math.max(0, Math.round(performance.now() - this.lastPositionReportedAtMs));
  }

  resetOutputClock(startSeconds = 0, playbackRate = 1): void {
    this.framesConsumed = 0;
    this.frameOffset = 0;
    this.startSeconds = startSeconds;
    this.playbackRate = playbackRate;
    this.lastPositionReportedAtMs = null;
    this.ended = false;
  }

  canReuseFor(options: NativeOutputStartOptions): boolean {
    return this.ready && this.proc !== null && this.reuseKey === createReuseKey(options);
  }

  beginSession(options: { startSeconds?: number; playbackRate?: number; durationSeconds?: number } = {}): number {
    if (!this.proc || this.proc.stdin.destroyed || this.proc.stdin.writableEnded || !this.proc.stdin.writable) {
      throw new Error('native output bridge is not writable');
    }

    const sessionId = (this.sessionIdCounter + 1) >>> 0;
    this.sessionIdCounter = sessionId;
    this.currentSessionId = sessionId;
    this.currentSessionHasPcm = false;
    this.sessionWritable?.destroy();
    this.sessionWritable = null;
    this.durationSeconds =
      typeof options.durationSeconds === 'number' && Number.isFinite(options.durationSeconds) && options.durationSeconds > 0
        ? options.durationSeconds
        : null;
    this.resetOutputClock(options.startSeconds ?? 0, options.playbackRate ?? 1);
    this.telemetry = {
      positionFrames: 0,
      bufferedFrames: null,
      underrunCallbacks: 0,
      underrunFrames: 0,
      reportedAtMs: null,
      nativePositionStalenessMs: null,
    };
    this.writeFrame(frameTypeBeginSession, sessionId, Buffer.alloc(0));
    return sessionId;
  }

  createSessionWritable(sessionId = this.currentSessionId): Writable {
    if (!sessionId) {
      throw new Error('native output bridge session has not begun');
    }

    const writable = new FramedSessionWritable(this, sessionId);
    this.sessionWritable = writable;
    return writable;
  }

  endSession(sessionId = this.currentSessionId, callback?: (error?: Error | null) => void): void {
    if (!sessionId || !this.proc || this.proc.stdin.destroyed || this.proc.stdin.writableEnded || !this.proc.stdin.writable) {
      callback?.();
      return;
    }

    this.writeFrame(frameTypeEndSession, sessionId, Buffer.alloc(0), callback);
  }

  writePcmFrame(sessionId: number, chunk: Buffer, callback: (error?: Error | null) => void): void {
    if (!chunk.length) {
      callback();
      return;
    }

    if (sessionId === this.currentSessionId) {
      this.currentSessionHasPcm = true;
    }

    this.writeFrame(frameTypePcmF32Le, sessionId, chunk, callback);
  }

  stop(): void {
    this.clearReadyTimer();
    this.stopRequested = true;

    if (this.bridgeWritable) {
      try {
        this.bridgeWritable.destroy();
      } catch {
        // Best-effort child cleanup.
      }
      this.bridgeWritable = null;
    }

    if (this.sessionWritable) {
      try {
        this.sessionWritable.destroy();
      } catch {
        // Best-effort child cleanup.
      }
      this.sessionWritable = null;
    }

    if (this.proc) {
      try {
        this.writeFrame(frameTypeShutdown, 0, Buffer.alloc(0));
      } catch {
        // Best-effort child cleanup.
      }

      try {
        this.proc.stdin.destroy();
      } catch {
        // Best-effort child cleanup.
      }

      try {
        this.proc.kill('SIGKILL');
      } catch {
        // Best-effort child cleanup.
      }

      this.proc = null;
    }

    getEqBridge().disconnect();
    this.eqControlPort = null;
    this.ready = false;
    this.lastPositionReportedAtMs = null;
  }

  private createSpawnArgs(options: NativeOutputStartOptions): string[] {
    const args = ['-sr', String(options.requestedOutputSampleRate), '-ch', String(options.channels)];
    const deviceIndex = Number(options.deviceIndex ?? -1);

    if (options.deviceName) {
      args.push('-device', options.deviceName);
    }

    if (Number.isInteger(deviceIndex) && deviceIndex >= 0) {
      args.push('-device-index', String(deviceIndex));
    }

    if (options.asio) {
      args.push('-asio');
    }

    if (options.exclusive && !options.asio) {
      args.push('-exclusive');
    }

    const volume = Number(options.volume ?? 1);
    if (Number.isFinite(volume) && Math.abs(volume - 1) > 1e-6) {
      args.push('-vol', String(Math.max(0, Math.min(1, volume))));
    }

    const bufferSizeFrames = Number(options.bufferSizeFrames);
    if (Number.isFinite(bufferSizeFrames) && bufferSizeFrames > 0) {
      args.push('-buffer', String(Math.round(bufferSizeFrames)));
    }

    const fifoCapacityMs = Number(options.fifoCapacityMs);
    if (!options.exclusive && !options.asio && Number.isFinite(fifoCapacityMs) && fifoCapacityMs > 0) {
      args.push('-fifo-ms', String(Math.round(fifoCapacityMs)));
    }

    const startupPrebufferMs = Number(options.startupPrebufferMs);
    if (Number.isFinite(startupPrebufferMs) && startupPrebufferMs >= 0) {
      args.push('-prebuffer-ms', String(Math.round(startupPrebufferMs)));
    }

    const startupPrebufferTimeoutMs = Number(options.startupPrebufferTimeoutMs);
    if (Number.isFinite(startupPrebufferTimeoutMs) && startupPrebufferTimeoutMs >= 0) {
      args.push('-prebuffer-timeout-ms', String(Math.round(startupPrebufferTimeoutMs)));
    }

    if (this.eqControlPort) {
      args.push('-eq-port', String(this.eqControlPort));
    }

    args.push('-framed-stdin');

    return args;
  }

  private writeFrame(
    type: number,
    sessionId: number,
    payload: Buffer,
    callback?: (error?: Error | null) => void,
  ): void {
    const target = this.proc?.stdin;

    if (!target || target.destroyed || target.writableEnded || !target.writable) {
      callback?.();
      return;
    }

    const frame = payload.length > 0
      ? Buffer.concat([createFrameHeader(type, sessionId, payload.length), payload])
      : createFrameHeader(type, sessionId, 0);

    try {
      target.write(frame, (error: Error | null | undefined) => {
        callback?.(error ?? null);
      });
    } catch (error) {
      callback?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleStdoutLine(
    line: string,
    resolveReady: (value: NativeBridgeReadyResult) => void,
  ): void {
    let message: NativeBridgeReadyMessage & { pos?: unknown; event?: unknown };

    try {
      message = JSON.parse(line) as NativeBridgeReadyMessage & { pos?: unknown; event?: unknown };
    } catch {
      return;
    }

    if (message.ready) {
      this.ready = true;
      this.readyMessage = message;
      this.clearReadyTimer();

      if (typeof message.sampleRate === 'number' && message.sampleRate > 0) {
        this.actualDeviceSampleRate = message.sampleRate;
      }

      const eqControlPort =
        typeof message.eqControlPort === 'number' && message.eqControlPort > 0
          ? message.eqControlPort
          : this.eqControlPort;
      if (eqControlPort) {
        getEqBridge().connect(eqControlPort);
      }

      const result: NativeBridgeReadyResult = {
        ok: true,
        device: message,
        requestedOutputSampleRate: this.requestedOutputSampleRate,
        actualDeviceSampleRate: this.actualDeviceSampleRate,
      };
      this.emit('ready', result);
      resolveReady(result);
    }

    if (typeof message.pos === 'number') {
      const reportedAtMs = performance.now();
      this.framesConsumed = Math.max(0, message.pos);
      this.lastPositionReportedAtMs = reportedAtMs;
      this.telemetry = {
        positionFrames: this.framesConsumed,
        bufferedFrames:
          typeof message.bufferedFrames === 'number' && Number.isFinite(message.bufferedFrames)
            ? Math.max(0, Math.round(message.bufferedFrames))
            : this.telemetry.bufferedFrames,
        underrunCallbacks:
          typeof message.underrunCallbacks === 'number' && Number.isFinite(message.underrunCallbacks)
            ? Math.max(0, Math.round(message.underrunCallbacks))
            : this.telemetry.underrunCallbacks,
        underrunFrames:
          typeof message.underrunFrames === 'number' && Number.isFinite(message.underrunFrames)
            ? Math.max(0, Math.round(message.underrunFrames))
            : this.telemetry.underrunFrames,
        reportedAtMs,
        nativePositionStalenessMs: 0,
      };
      this.emit('position', this.framesConsumed, this.telemetry);
    }

    if (message.event === 'ended') {
      if (this.stopRequested || this.ended) {
        return;
      }

      if (this.currentSessionId && !this.currentSessionHasPcm) {
        return;
      }

      this.ended = true;
      this.emit('ended');
    }

    if (message.event === 'error') {
      this.emit('error', new Error('echo-audio-host error event'));
    }
  }

  private clearReadyTimer(): void {
    if (!this.readyTimer) {
      return;
    }

    clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }
}
