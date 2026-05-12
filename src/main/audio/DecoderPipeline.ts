import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessByStdio, SpawnOptionsWithStdioTuple } from 'node:child_process';
import type { Readable } from 'node:stream';
import readline from 'node:readline';
import ffmpegStatic from 'ffmpeg-static';
import { parseFile } from 'music-metadata';
import type { AudioProbeResult, DecoderRun, PcmDecodeRequest } from './audioTypes';

type DecoderChildProcess = ChildProcessByStdio<null, Readable, Readable>;
type DecoderSpawnOptions = SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'> & {
  windowsHide: boolean;
};
type DecoderSpawner = (file: string, args: string[], options: DecoderSpawnOptions) => DecoderChildProcess;

export type DecoderPipelineDependencies = {
  ffmpegPath?: string | null;
  env?: NodeJS.ProcessEnv;
  staticFfmpegPath?: string | null;
  systemFfmpegPath?: string | null;
  spawn?: DecoderSpawner;
  logger?: (message: string) => void;
};

const normalizePositiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null;
};

const normalizePath = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

const normalizeAsarUnpackedPath = (path: string): string => {
  return path.includes('app.asar') && !path.includes('app.asar.unpacked')
    ? path.replace('app.asar', 'app.asar.unpacked')
    : path;
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

const createDecoderError = (
  reason: string,
  ffmpegPath: string,
  args: string[],
  stderrLines: string[],
): Error => {
  const stderr = stderrLines.join(' | ');
  const details = [`ffmpeg="${ffmpegPath}"`, `args="${args.join(' ')}"`];

  if (stderr) {
    details.push(`stderr="${stderr}"`);
  }

  return new Error(`${reason}; ${details.join('; ')}`);
};

export const resolveDecoderFfmpegPath = (dependencies: DecoderPipelineDependencies = {}): string => {
  const explicitPath = normalizePath(dependencies.ffmpegPath);
  if (explicitPath) {
    return normalizeAsarUnpackedPath(explicitPath);
  }

  const envPath = normalizePath(dependencies.env?.ECHO_FFMPEG_PATH ?? process.env.ECHO_FFMPEG_PATH);
  if (envPath) {
    return normalizeAsarUnpackedPath(envPath);
  }

  const staticPath =
    dependencies.staticFfmpegPath === undefined ? normalizePath(ffmpegStatic) : normalizePath(dependencies.staticFfmpegPath);
  if (staticPath) {
    return normalizeAsarUnpackedPath(staticPath);
  }

  const systemPath = normalizePath(dependencies.systemFfmpegPath) ?? 'ffmpeg';
  return normalizeAsarUnpackedPath(systemPath);
};

const normalizeSpawnError = (error: Error & { code?: string }): Error => {
  if (error.code === 'ENOENT' || error.message.includes('ENOENT')) {
    return new Error('ffmpeg_missing');
  }

  return error;
};

export class DecoderPipeline {
  private readonly ffmpegPath: string;
  private readonly spawn: DecoderSpawner;
  private readonly logger: (message: string) => void;

  constructor(dependencies: DecoderPipelineDependencies = {}) {
    this.ffmpegPath = resolveDecoderFfmpegPath(dependencies);
    this.spawn = dependencies.spawn ?? (nodeSpawn as DecoderSpawner);
    this.logger = dependencies.logger ?? defaultLogger;
    this.logger(`[DecoderPipeline] ffmpeg: ${this.ffmpegPath}`);
  }

  async probeLocalFile(filePath: string): Promise<AudioProbeResult> {
    const metadata = await parseFile(filePath, {
      duration: true,
      skipCovers: true,
    });
    const format = metadata.format;
    const result = {
      filePath,
      durationSeconds: Math.max(0, Number(format.duration ?? 0)),
      fileSampleRate: normalizePositiveInteger(format.sampleRate),
      channels: Math.max(1, Math.min(8, normalizePositiveInteger(format.numberOfChannels) ?? 2)),
      codec: typeof format.codec === 'string' && format.codec.trim() ? format.codec : null,
      bitDepth: normalizePositiveInteger(format.bitsPerSample),
      bitrate: normalizePositiveInteger(format.bitrate),
    };

    this.logger(
      `[DecoderPipeline] probe: file="${filePath}" codec=${result.codec ?? 'n/a'} sampleRate=${
        result.fileSampleRate ?? 'n/a'
      } channels=${result.channels} duration=${result.durationSeconds}`,
    );

    return result;
  }

  decodeLocalFile(request: PcmDecodeRequest): DecoderRun {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-ss',
      String(Math.max(0, request.startSeconds)),
      '-i',
      request.filePath,
      '-vn',
      '-f',
      'f32le',
      '-ac',
      String(request.channels),
      '-ar',
      String(request.decoderOutputSampleRate),
      'pipe:1',
    ];
    let proc: DecoderChildProcess;

    try {
      this.logger(`[DecoderPipeline] spawn: ${this.ffmpegPath} ${args.join(' ')}`);
      proc = this.spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      throw normalizeSpawnError(error instanceof Error ? error : new Error(String(error)));
    }
    let stopped = false;
    const stderrLines: string[] = [];

    const stderr = readline.createInterface({ input: proc.stderr });
    stderr.on('line', (line) => {
      appendTailLine(stderrLines, line);
      this.logger(`[ffmpeg] ${line}`);
    });

    const done = new Promise<void>((resolve, reject) => {
      proc.on('error', (error: Error & { code?: string }) => {
        if (stopped) {
          resolve();
          return;
        }

        const normalized = normalizeSpawnError(error);
        reject(
          normalized.message === 'ffmpeg_missing'
            ? normalized
            : createDecoderError(`ffmpeg_error:${normalized.message}`, this.ffmpegPath, args, stderrLines),
        );
      });

      proc.on('exit', (code, signal) => {
        if (stopped || code === 0) {
          resolve();
          return;
        }

        const reason = code != null ? `ffmpeg_exit_code_${code}` : `ffmpeg_exit_signal_${signal ?? '?'}`;
        reject(createDecoderError(reason, this.ffmpegPath, args, stderrLines));
      });
    });

    return {
      stream: proc.stdout,
      done,
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
}
