import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessByStdio, SpawnOptionsWithStdioTuple } from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';
import readline from 'node:readline';
import { parseFile } from 'music-metadata';
import type { AudioProbeResult, AudioResamplerEngine, DecoderRun, PcmDecodeRequest } from './audioTypes';
import { readTagLibAudioTechnicalMetadata, shouldPreferTagLibForAlacTechnicalFields } from './AlacTechnicalMetadata';
import {
  resolveFfmpegToolchain,
  resolveFfmpegToolchainPath,
  type FfmpegToolchainDependencies,
  type FfmpegToolchainInfo,
} from './FfmpegToolchain';
import { resolveCueTrack } from './CueSheet';
import { isDsdProbe, readDsdNativeSampleRate, shouldProbeDsdNativeSampleRate } from './DsdProbe';

type DecoderChildProcess = ChildProcessByStdio<null, Readable, Readable>;
type DecoderSpawnOptions = SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'> & {
  windowsHide: boolean;
};
type DecoderSpawner = (file: string, args: string[], options: DecoderSpawnOptions) => DecoderChildProcess;
export type FfmpegDecodeErrorKind =
  | 'soxr_or_filter_error'
  | 'network_error'
  | 'http_expired_or_forbidden'
  | 'input_invalid'
  | 'unsupported_codec'
  | 'pcm_start_timeout'
  | 'process_missing'
  | 'unknown';
type DecoderPipelineError = Error & {
  decoderReason?: string;
  ffmpegErrorKind?: FfmpegDecodeErrorKind;
  stderrLines?: string[];
};

export type DecoderPipelineDependencies = {
  ffmpegPath?: string | null;
  env?: NodeJS.ProcessEnv;
  systemFfmpegPath?: string | null;
  resourcesPath?: string | null;
  cwd?: string;
  existsSync?: FfmpegToolchainDependencies['existsSync'];
  execFileSync?: FfmpegToolchainDependencies['execFileSync'];
  spawn?: DecoderSpawner;
  logger?: (message: string) => void;
  requireHealthyFfmpeg?: boolean;
};

const normalizePositiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null;
};

const defaultLogger = (message: string): void => {
  console.warn(message);
};

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

export const classifyFfmpegDecodeError = (stderrLines: string[], reason = ''): FfmpegDecodeErrorKind => {
  const text = `${reason}\n${stderrLines.join('\n')}`;

  if (/ffmpeg_missing|ENOENT/iu.test(text)) {
    return 'process_missing';
  }

  if (/ffmpeg_pcm_start_timeout/iu.test(text)) {
    return 'pcm_start_timeout';
  }

  if (/soxr|aresample|no such filter|error initializing filter|error reinitializing filters|option not found|error applying option|filter not found/iu.test(text)) {
    return 'soxr_or_filter_error';
  }

  if (/\b(401|403|404)\b|http\/[12](?:\.\d)?\s+4\d\d|server returned 4\d\d|unauthorized|forbidden/iu.test(text)) {
    return 'http_expired_or_forbidden';
  }

  if (/connection (reset|refused|timed out)|network is unreachable|immediate exit requested|end of file|i\/o error|error reading|tls|ssl|timeout|timed out/iu.test(text)) {
    return 'network_error';
  }

  if (/invalid data found when processing input|moov atom not found|error while decoding stream|could not find codec parameters|invalid argument/iu.test(text)) {
    return 'input_invalid';
  }

  if (/unknown decoder|decoder .* not found|unsupported codec|codec not supported|could not find decoder/iu.test(text)) {
    return 'unsupported_codec';
  }

  return 'unknown';
};

const createDecoderError = (
  reason: string,
  ffmpegPath: string,
  args: string[],
  stderrLines: string[],
): Error => {
  const kind = classifyFfmpegDecodeError(stderrLines, reason);
  const redactedStderrLines = stderrLines.map(redactFfmpegDiagnosticLine);
  const stderr = redactedStderrLines.join(' | ');
  const details = [`ffmpeg="${ffmpegPath}"`, `args="${redactFfmpegArgs(args).join(' ')}"`];

  details.push(`kind="${kind}"`);

  if (stderr) {
    details.push(`stderr="${stderr}"`);
  }

  const error = new Error(`${reason}; ${details.join('; ')}`) as DecoderPipelineError;
  error.decoderReason = reason;
  error.ffmpegErrorKind = kind;
  error.stderrLines = redactedStderrLines;
  return error;
};

const redactUrlSecrets = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.search) {
      url.search = '?redacted';
    }

    return url.toString();
  } catch {
    return value;
  }
};

const sensitiveHeaderPattern = /^(authorization|cookie|proxy-authorization|set-cookie|x-api-key|x-auth-token):/iu;

const normalizeInputHeaders = (headers: Record<string, string> | undefined): string | null => {
  if (!headers) {
    return null;
  }

  const lines = Object.entries(headers)
    .map(([name, value]) => [name.trim(), String(value).trim()] as const)
    .filter(([name, value]) => name.length > 0 && value.length > 0 && !/[\r\n:]/u.test(name) && !/[\r\n]/u.test(value))
    .map(([name, value]) => `${name}: ${value}`);

  return lines.length > 0 ? `${lines.join('\r\n')}\r\n` : null;
};

const redactHeaderBlock = (value: string): string =>
  value
    .split(/\r?\n/u)
    .map((line) => (sensitiveHeaderPattern.test(line) ? `${line.slice(0, line.indexOf(':') + 1)} <redacted>` : line))
    .join('\\r\\n');

const redactFfmpegDiagnosticLine = (value: string): string =>
  redactHeaderBlock(value).replace(/https?:\/\/[^\s"'<>]+/giu, (url) => redactUrlSecrets(url));

const redactFfmpegArgs = (args: string[]): string[] =>
  args.map((arg, index) => {
    if (index > 0 && args[index - 1] === '-headers') {
      return `"${redactHeaderBlock(arg)}"`;
    }

    return redactUrlSecrets(arg);
  });

export const resolveDecoderFfmpegPath = (dependencies: DecoderPipelineDependencies = {}): string =>
  resolveFfmpegToolchainPath(dependencies as FfmpegToolchainDependencies);

const normalizeSpawnError = (error: Error & { code?: string }): Error => {
  if (error.code === 'ENOENT' || error.message.includes('ENOENT')) {
    return new Error('ffmpeg_missing');
  }

  return error;
};

const remotePcmStartupTimeoutMs = 30_000;

const isHttpInputPath = (value: string): boolean => /^https?:\/\//iu.test(value.trim());

const createRemoteInputArgs = (decodePath: string): string[] =>
  isHttpInputPath(decodePath)
    ? [
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_at_eof',
        '1',
        '-reconnect_on_network_error',
        '1',
        '-reconnect_delay_max',
        '2',
        '-rw_timeout',
        '30000000',
      ]
    : [];

const getPcmStartupTimeoutMs = (decodePath: string): number | null => (isHttpInputPath(decodePath) ? remotePcmStartupTimeoutMs : null);

export class DecoderPipeline {
  private readonly ffmpegPath: string;
  private readonly toolchainInfo: FfmpegToolchainInfo;
  private readonly spawn: DecoderSpawner;
  private readonly logger: (message: string) => void;

  constructor(dependencies: DecoderPipelineDependencies = {}) {
    this.toolchainInfo = resolveFfmpegToolchain({
      ...(dependencies as FfmpegToolchainDependencies),
      requireHealthy: dependencies.requireHealthyFfmpeg ?? !dependencies.spawn,
    });
    this.ffmpegPath = this.toolchainInfo.path;
    this.spawn = dependencies.spawn ?? (nodeSpawn as DecoderSpawner);
    this.logger = dependencies.logger ?? defaultLogger;
    this.logger(
      `[DecoderPipeline] ffmpeg: ${this.ffmpegPath} source=${this.toolchainInfo.source} version=${
        this.toolchainInfo.version ?? 'n/a'
      } soxr=${this.toolchainInfo.soxrAvailable}`,
    );
  }

  getToolchainInfo(): FfmpegToolchainInfo {
    return this.toolchainInfo;
  }

  async probeLocalFile(filePath: string): Promise<AudioProbeResult> {
    const cueTrack = resolveCueTrack(filePath);
    const probePath = cueTrack?.audioPath ?? filePath;
    const metadata = await parseFile(probePath, {
      duration: true,
      skipCovers: true,
    });
    const format = metadata.format;
    const sourceDuration = Math.max(0, Number(format.duration ?? 0));
    const cueEndSeconds = cueTrack?.endSeconds ?? (cueTrack ? sourceDuration : null);
    const durationSeconds =
      cueTrack && cueEndSeconds !== null ? Math.max(0, cueEndSeconds - cueTrack.startSeconds) : sourceDuration;
    const result = {
      filePath,
      durationSeconds,
      fileSampleRate: normalizePositiveInteger(format.sampleRate),
      channels: Math.max(1, Math.min(8, normalizePositiveInteger(format.numberOfChannels) ?? 2)),
      codec: typeof format.codec === 'string' && format.codec.trim() ? format.codec : null,
      bitDepth: normalizePositiveInteger(format.bitsPerSample),
      bitrate: normalizePositiveInteger(format.bitrate),
    };
    if (shouldPreferTagLibForAlacTechnicalFields(probePath, result.codec)) {
      try {
        const tagLibTechnical = await readTagLibAudioTechnicalMetadata(probePath);
        if (tagLibTechnical && shouldPreferTagLibForAlacTechnicalFields(probePath, result.codec, tagLibTechnical.codec)) {
          result.fileSampleRate = tagLibTechnical.sampleRate ?? result.fileSampleRate;
          result.bitDepth = tagLibTechnical.bitDepth ?? result.bitDepth;
          result.bitrate = tagLibTechnical.bitrate ?? result.bitrate;
          result.channels = Math.max(1, Math.min(8, tagLibTechnical.channels ?? result.channels));
        }
      } catch (error) {
        this.logger(`[DecoderPipeline] ALAC TagLib probe unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (isDsdProbe(result) && shouldProbeDsdNativeSampleRate(result)) {
      const nativeSampleRate = await readDsdNativeSampleRate(probePath);
      if (nativeSampleRate) {
        result.fileSampleRate = nativeSampleRate;
        result.bitDepth = result.bitDepth ?? 1;
      }
    }

    this.logger(
      `[DecoderPipeline] probe: file="${redactUrlSecrets(filePath)}" codec=${result.codec ?? 'n/a'} sampleRate=${
        result.fileSampleRate ?? 'n/a'
      } channels=${result.channels} duration=${result.durationSeconds}`,
    );

    return result;
  }

  decodeLocalFile(request: PcmDecodeRequest): DecoderRun {
    const cueTrack = resolveCueTrack(request.filePath);
    const decodePath = cueTrack?.audioPath ?? request.filePath;
    const cueRelativeStart = Math.max(0, request.startSeconds);
    const decodeStart = cueTrack ? cueTrack.startSeconds + cueRelativeStart : cueRelativeStart;
    const inputHeaders = normalizeInputHeaders(request.inputHeaders);
    const cueDuration =
      cueTrack?.endSeconds !== null && cueTrack?.endSeconds !== undefined
        ? Math.max(0, cueTrack.endSeconds - cueTrack.startSeconds - cueRelativeStart)
        : null;
    const pcmStartupTimeoutMs = getPcmStartupTimeoutMs(decodePath);
    const baseArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-ss',
      String(decodeStart),
      ...(inputHeaders ? ['-headers', inputHeaders] : []),
      ...createRemoteInputArgs(decodePath),
      '-i',
      decodePath,
      '-vn',
      ...(cueDuration !== null ? ['-t', String(cueDuration)] : []),
      '-f',
      'f32le',
      '-ac',
      String(request.channels),
    ];
    const outputArgs = [
      '-ar',
      String(request.decoderOutputSampleRate),
      'pipe:1',
    ];

    const createArgs = (resamplerEngine: AudioResamplerEngine): string[] => [
      ...baseArgs,
      ...(resamplerEngine === 'soxr' ? ['-af', 'aresample=resampler=soxr:precision=20'] : []),
      ...outputArgs,
    ];
    const requestedResampler = request.resamplerEngine ?? 'default';
    const fallbackAllowed = request.allowResamplerFallback === true;

    if (requestedResampler === 'soxr' && !this.toolchainInfo.soxrAvailable) {
      if (!fallbackAllowed) {
        throw createDecoderError('soxr_unavailable', this.ffmpegPath, createArgs('soxr'), [
          `ffmpeg does not report libsoxr support: source=${this.toolchainInfo.source}`,
        ]);
      }

      request.onResamplerFallback?.('soxr_unavailable_fallback_to_default');
      return this.spawnSimpleDecode(createArgs('default'), 'default', true, pcmStartupTimeoutMs);
    }

    if (requestedResampler !== 'soxr') {
      return this.spawnSimpleDecode(createArgs('default'), 'default', false, pcmStartupTimeoutMs);
    }

    return this.spawnSoxrDecodeWithFallback(
      createArgs('soxr'),
      createArgs('default'),
      fallbackAllowed,
      request.onResamplerFallback,
      pcmStartupTimeoutMs,
    );
  }

  private spawnProcess(args: string[]): DecoderChildProcess {
    try {
      this.logger(`[DecoderPipeline] spawn: ${this.ffmpegPath} ${redactFfmpegArgs(args).join(' ')}`);
      return this.spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      throw normalizeSpawnError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private spawnSimpleDecode(
    args: string[],
    resamplerEngine: AudioResamplerEngine,
    resamplerFallbackActive: boolean,
    pcmStartupTimeoutMs: number | null,
  ): DecoderRun {
    const proc = this.spawnProcess(args);
    const stderrLines: string[] = [];
    let stopped = false;

    const stderr = readline.createInterface({ input: proc.stderr });
    stderr.on('line', (line) => {
      if (stopped) {
        return;
      }

      appendTailLine(stderrLines, line);
      this.logger(`[ffmpeg] ${line}`);
    });

    const done = new Promise<void>((resolve, reject) => {
      let settled = false;
      let watchdog: NodeJS.Timeout | null = null;
      const clearWatchdog = (): void => {
        if (watchdog) {
          clearTimeout(watchdog);
          watchdog = null;
        }
      };
      const resolveOnce = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearWatchdog();
        resolve();
      };
      const rejectOnce = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearWatchdog();
        reject(error);
      };

      proc.stdout.once('readable', clearWatchdog);
      if (pcmStartupTimeoutMs !== null) {
        watchdog = setTimeout(() => {
          if (stopped || settled) {
            return;
          }

          rejectOnce(createDecoderError('ffmpeg_pcm_start_timeout', this.ffmpegPath, args, stderrLines));
          try {
            proc.kill('SIGKILL');
          } catch {
            // Best-effort decoder cleanup.
          }
        }, pcmStartupTimeoutMs);
      }

      proc.on('error', (error: Error & { code?: string }) => {
        if (stopped) {
          resolveOnce();
          return;
        }

        const normalized = normalizeSpawnError(error);
        rejectOnce(
          normalized.message === 'ffmpeg_missing'
            ? normalized
            : createDecoderError(`ffmpeg_error:${normalized.message}`, this.ffmpegPath, args, stderrLines),
        );
      });

      proc.on('exit', (code, signal) => {
        if (stopped || code === 0) {
          resolveOnce();
          return;
        }

        const reason = code != null ? `ffmpeg_exit_code_${code}` : `ffmpeg_exit_signal_${signal ?? '?'}`;
        rejectOnce(createDecoderError(reason, this.ffmpegPath, args, stderrLines));
      });
    });

    return {
      stream: proc.stdout,
      done,
      resamplerEngine,
      resamplerFallbackActive,
      stop: () => {
        stopped = true;
        try {
          proc.stdout.destroy();
        } catch {
          // Best-effort decoder cleanup.
        }

        try {
          proc.kill('SIGKILL');
        } catch {
          // Best-effort decoder cleanup.
        }
      },
    };
  }

  private spawnSoxrDecodeWithFallback(
    soxrArgs: string[],
    fallbackArgs: string[],
    fallbackAllowed: boolean,
    onFallback?: (reason: string) => void,
    pcmStartupTimeoutMs?: number | null,
  ): DecoderRun {
    const output = new PassThrough();
    const stderrLines: string[] = [];
    let stopped = false;
    let activeProc: DecoderChildProcess | null = null;
    let sawPcmData = false;
    let fallbackActive = false;
    let resolved = false;

    const cleanupProc = (proc: DecoderChildProcess): void => {
      try {
        proc.stdout.unpipe(output);
      } catch {
        // Best-effort stream cleanup.
      }
    };

    const attachProc = (proc: DecoderChildProcess, args: string[], resamplerEngine: AudioResamplerEngine): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        let watchdog: NodeJS.Timeout | null = null;
        const clearWatchdog = (): void => {
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
        };
        const resolveOnce = (): void => {
          if (settled) {
            return;
          }

          settled = true;
          clearWatchdog();
          resolve();
        };
        const rejectOnce = (error: Error): void => {
          if (settled) {
            return;
          }

          settled = true;
          clearWatchdog();
          reject(error);
        };

        activeProc = proc;
        const stderr = readline.createInterface({ input: proc.stderr });
        stderr.on('line', (line) => {
          if (stopped) {
            return;
          }

          appendTailLine(stderrLines, line);
          this.logger(`[ffmpeg] ${line}`);
        });
        proc.stdout.on('data', () => {
          sawPcmData = true;
          clearWatchdog();
        });
        proc.stdout.pipe(output, { end: false });
        if (pcmStartupTimeoutMs !== null && pcmStartupTimeoutMs !== undefined) {
          watchdog = setTimeout(() => {
            if (stopped || settled) {
              return;
            }

            cleanupProc(proc);
            rejectOnce(createDecoderError('ffmpeg_pcm_start_timeout', this.ffmpegPath, args, stderrLines));
            try {
              proc.kill('SIGKILL');
            } catch {
              // Best-effort decoder cleanup.
            }
          }, pcmStartupTimeoutMs);
        }

        proc.on('error', (error: Error & { code?: string }) => {
          cleanupProc(proc);
          if (stopped) {
            resolveOnce();
            return;
          }

          const normalized = normalizeSpawnError(error);
          rejectOnce(
            normalized.message === 'ffmpeg_missing'
              ? normalized
              : createDecoderError(`ffmpeg_error:${normalized.message}`, this.ffmpegPath, args, stderrLines),
          );
        });

        proc.on('exit', (code, signal) => {
          cleanupProc(proc);
          if (stopped || code === 0) {
            resolveOnce();
            return;
          }

          const reason = code != null ? `ffmpeg_exit_code_${code}` : `ffmpeg_exit_signal_${signal ?? '?'}`;
          rejectOnce(createDecoderError(reason, this.ffmpegPath, args, stderrLines));
        });
      }).finally(() => {
        if (activeProc === proc && resamplerEngine === 'default') {
          activeProc = null;
        }
      });

    const done = (async (): Promise<void> => {
      try {
        await attachProc(this.spawnProcess(soxrArgs), soxrArgs, 'soxr');
      } catch (error) {
        if (
          stopped ||
          sawPcmData ||
          !fallbackAllowed ||
          !isLikelySoxrStartupError(error)
        ) {
          throw error;
        }

        fallbackActive = true;
        onFallback?.('soxr_decode_failed_fallback_to_default');
        stderrLines.length = 0;
        await attachProc(this.spawnProcess(fallbackArgs), fallbackArgs, 'default');
      } finally {
        resolved = true;
        output.end();
      }
    })();

    return {
      stream: output,
      done,
      get resamplerEngine() {
        return fallbackActive ? 'default' : 'soxr';
      },
      get resamplerFallbackActive() {
        return fallbackActive;
      },
      stop: () => {
        stopped = true;
        try {
          output.destroy();
        } catch {
          // Best-effort decoder cleanup.
        }

        if (!resolved && activeProc) {
          try {
            activeProc.stdout.destroy();
          } catch {
            // Best-effort decoder cleanup.
          }

          try {
            activeProc.kill('SIGKILL');
          } catch {
            // Best-effort decoder cleanup.
          }
        }
      },
    };
  }
}

const isLikelySoxrStartupError = (error: unknown): boolean => {
  const decoderError = error as DecoderPipelineError;
  return decoderError.ffmpegErrorKind === 'soxr_or_filter_error';
};
