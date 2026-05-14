import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import ffmpegStaticPath from 'ffmpeg-static';
import type {
  CreateDownloadUrlJobOptions,
  DownloadJob,
  DownloadJobStatus,
  DownloadSettings,
  DownloadSourceProvider,
  DownloadToolsStatus,
} from '../../shared/types/downloads';
import { isSupportedAudioExtension } from '../../shared/constants/audioExtensions';
import { getLibraryService } from '../library/LibraryService';
import { getMvService } from '../mv/MvService';

const defaultSettings: DownloadSettings = {
  audioStrategy: 'best_available',
  importToLibrary: true,
  bindMvAfterImport: true,
  outputDirectory: null,
};

const terminalStatuses = new Set<DownloadJobStatus>(['completed', 'failed', 'cancelled']);
const cancellableStatuses = new Set<DownloadJobStatus>(['queued', 'probing', 'downloading', 'extracting_audio', 'importing', 'binding_mv']);
const progressEmitIntervalMs = 500;
const maxCommandOutputBytes = 1024 * 1024 * 4;
const ytDlpFileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const outputTemplate = '%(title).180B [%(id)s].%(ext)s';

const inferProvider = (url: string): DownloadSourceProvider => {
  const normalized = url.toLowerCase();

  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) {
    return 'youtube';
  }

  if (normalized.includes('bilibili.com') || normalized.includes('b23.tv')) {
    return 'bilibili';
  }

  return 'unknown';
};

const cloneJob = (job: DownloadJob): DownloadJob => ({ ...job });

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type RunningCommand = {
  promise: Promise<CommandResult>;
  kill: () => void;
};

type CommandRunner = (command: string, args: string[]) => RunningCommand;
type StreamingCommandRunner = (
  command: string,
  args: string[],
  listeners: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  },
) => RunningCommand;

type ToolResolver = () => string | null;

type YtDlpProbeResult = {
  title?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  webpage_url?: unknown;
};

type DownloadJobOptions = Required<Pick<DownloadSettings, 'importToLibrary' | 'bindMvAfterImport'>>;

type DownloadServiceDependencies = {
  importAudioFile?: (filePath: string, options?: { folderPath?: string }) => Promise<{ id: string }>;
  bindMvUrl?: (trackId: string, url: string) => unknown;
  streamingCommandRunner?: StreamingCommandRunner;
};

const getProcessResourcesPath = (): string | null => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof resourcesPath === 'string' && resourcesPath.trim() ? resourcesPath : null;
};

const resolveBundledYtDlpPath: ToolResolver = () => {
  const resourcesPath = getProcessResourcesPath();
  const candidates = [
    resourcesPath ? resolve(resourcesPath, 'tools', ytDlpFileName) : null,
    resourcesPath ? resolve(resourcesPath, ytDlpFileName) : null,
    resolve(process.cwd(), 'electron-app', 'tools', ytDlpFileName),
    resolve(process.cwd(), 'tools', ytDlpFileName),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const normalizeStaticFfmpegPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.replace(`${join('app.asar', 'node_modules')}`, `${join('app.asar.unpacked', 'node_modules')}`);
};

const runCommand: CommandRunner = (command, args) => runStreamingCommand(command, args, {});

const runStreamingCommand: StreamingCommandRunner = (command, args, listeners) => {
  const child = spawn(command, args, {
    windowsHide: true,
    shell: false,
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutRemainder = '';
  let stderrRemainder = '';

  const appendChunk = (chunks: Buffer[], chunk: Buffer, currentBytes: number): number => {
    if (currentBytes >= maxCommandOutputBytes) {
      return currentBytes;
    }

    const remaining = maxCommandOutputBytes - currentBytes;
    const nextChunk = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    chunks.push(nextChunk);
    return currentBytes + nextChunk.byteLength;
  };

  const emitLines = (text: string, stream: 'stdout' | 'stderr'): string => {
    const combined = `${stream === 'stdout' ? stdoutRemainder : stderrRemainder}${text}`;
    const parts = combined.split(/\r?\n/u);
    const remainder = parts.pop() ?? '';
    const handler = stream === 'stdout' ? listeners.onStdout : listeners.onStderr;

    for (const line of parts) {
      handler?.(line);
    }

    return remainder;
  };

  const promise = new Promise<CommandResult>((resolveResult) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes = appendChunk(stdoutChunks, chunk, stdoutBytes);
      stdoutRemainder = emitLines(chunk.toString('utf8'), 'stdout');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes = appendChunk(stderrChunks, chunk, stderrBytes);
      stderrRemainder = emitLines(chunk.toString('utf8'), 'stderr');
    });
    child.on('error', (error) => {
      resolveResult({ stdout: '', stderr: error.message, exitCode: -1 });
    });
    child.on('close', (exitCode) => {
      if (stdoutRemainder) {
        listeners.onStdout?.(stdoutRemainder);
      }
      if (stderrRemainder) {
        listeners.onStderr?.(stderrRemainder);
      }
      resolveResult({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode,
      });
    });
  });

  return {
    promise,
    kill: () => {
      if (!child.killed) {
        child.kill();
      }
    },
  };
};

export class DownloadService extends EventEmitter {
  private jobs: DownloadJob[] = [];

  private settings: DownloadSettings = { ...defaultSettings };

  private runningCommands = new Map<string, RunningCommand>();

  private queuedJobIds: string[] = [];

  private activeJobId: string | null = null;

  private lastProgressEmitAt = new Map<string, number>();

  private jobOptions = new Map<string, DownloadJobOptions>();

  constructor(
    private readonly commandRunner: CommandRunner = runCommand,
    private readonly ytDlpPathResolver: ToolResolver = resolveBundledYtDlpPath,
    private readonly dependencies: DownloadServiceDependencies = {},
  ) {
    super();
  }

  getJobs(): DownloadJob[] {
    return this.jobs.map(cloneJob);
  }

  createUrlJob(url: string, options: CreateDownloadUrlJobOptions = {}): DownloadJob {
    const sourceUrl = url.trim();

    if (!sourceUrl) {
      throw new Error('download URL must be a non-empty string');
    }

    const outputDirectory = this.settings.outputDirectory;
    if (!outputDirectory) {
      throw new Error('请选择下载文件夹');
    }

    const outputStat = existsSync(outputDirectory) ? statSync(outputDirectory) : null;
    if (!outputStat?.isDirectory()) {
      throw new Error(`下载文件夹不可用: ${outputDirectory}`);
    }

    const now = new Date().toISOString();
    const job: DownloadJob = {
      id: randomUUID(),
      sourceUrl,
      provider: inferProvider(sourceUrl),
      audioStrategy: 'best_available',
      status: 'queued',
      title: null,
      durationSeconds: null,
      thumbnailUrl: null,
      webpageUrl: null,
      outputPath: null,
      downloadedBytes: null,
      totalBytes: null,
      speedBytesPerSecond: null,
      etaSeconds: null,
      importedTrackId: null,
      progress: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.jobOptions.set(job.id, {
      importToLibrary: options.importToLibrary ?? this.settings.importToLibrary,
      bindMvAfterImport: options.bindMvAfterImport ?? this.settings.bindMvAfterImport,
    });
    this.jobs = [job, ...this.jobs];
    this.queuedJobIds.push(job.id);
    this.emitJobsNow();
    this.startNextJob();
    return cloneJob(job);
  }

  cancelJob(jobId: string): DownloadJob | null {
    const job = this.jobs.find((item) => item.id === jobId);

    if (!job) {
      return null;
    }

    if (!cancellableStatuses.has(job.status)) {
      return cloneJob(job);
    }

    this.queuedJobIds = this.queuedJobIds.filter((id) => id !== jobId);
    this.clearCommand(jobId);
    this.cleanupPartialFiles(job);
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
    this.updateJob(jobId, {
      status: 'cancelled',
      error: null,
      completedAt: new Date().toISOString(),
    });
    this.startNextJob();
    return cloneJob(this.jobs.find((item) => item.id === jobId)!);
  }

  clearCompleted(): DownloadJob[] {
    for (const job of this.jobs) {
      if (terminalStatuses.has(job.status)) {
        this.clearCommand(job.id);
      }
    }

    this.jobs = this.jobs.filter((job) => !terminalStatuses.has(job.status));
    this.emitJobsNow();
    return this.getJobs();
  }

  getSettings(): DownloadSettings {
    return { ...this.settings };
  }

  setSettings(patch: Partial<DownloadSettings>): DownloadSettings {
    const nextSettings: DownloadSettings = {
      ...this.settings,
      ...patch,
      audioStrategy: 'best_available',
      outputDirectory:
        typeof patch.outputDirectory === 'string'
          ? resolve(patch.outputDirectory.trim())
          : patch.outputDirectory === null
            ? null
            : this.settings.outputDirectory,
      importToLibrary: typeof patch.importToLibrary === 'boolean' ? patch.importToLibrary : this.settings.importToLibrary,
      bindMvAfterImport: typeof patch.bindMvAfterImport === 'boolean' ? patch.bindMvAfterImport : this.settings.bindMvAfterImport,
    };

    if (nextSettings.outputDirectory && (!existsSync(nextSettings.outputDirectory) || !statSync(nextSettings.outputDirectory).isDirectory())) {
      throw new Error(`下载文件夹不可用: ${nextSettings.outputDirectory}`);
    }

    this.settings = nextSettings;
    return this.getSettings();
  }

  async checkTools(): Promise<DownloadToolsStatus> {
    const ffmpegPath = this.getFfmpegPath();
    const ytDlpPath = this.ytDlpPathResolver();
    let ytDlpVersion: string | null = null;

    if (ytDlpPath && existsSync(ytDlpPath)) {
      const result = await this.commandRunner(ytDlpPath, ['--version']).promise;
      if (result.exitCode === 0) {
        ytDlpVersion = result.stdout.trim().split(/\s+/u)[0] || null;
      }
    }

    return {
      ytDlpAvailable: Boolean(ytDlpVersion),
      ffmpegAvailable: Boolean(ffmpegPath && existsSync(ffmpegPath)),
      ytDlpVersion,
      ytDlpPath,
      ffmpegPath,
    };
  }

  dispose(): void {
    for (const command of this.runningCommands.values()) {
      command.kill();
    }
    this.runningCommands.clear();
    this.queuedJobIds = [];
    this.activeJobId = null;
  }

  private startNextJob(): void {
    if (this.activeJobId) {
      return;
    }

    const nextJobId = this.queuedJobIds.shift();
    if (!nextJobId) {
      return;
    }

    const job = this.jobs.find((item) => item.id === nextJobId);
    if (!job || terminalStatuses.has(job.status)) {
      this.startNextJob();
      return;
    }

    this.activeJobId = nextJobId;
    void this.runJob(nextJobId).finally(() => {
      if (this.activeJobId === nextJobId) {
        this.activeJobId = null;
      }
      this.startNextJob();
    });
  }

  private async runJob(jobId: string): Promise<void> {
    try {
      await this.probe(jobId);
      await this.download(jobId);
      await this.importAndBind(jobId);
      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const job = this.jobs.find((item) => item.id === jobId);
      if (!job || terminalStatuses.has(job.status)) {
        return;
      }

      this.cleanupPartialFiles(job);
      this.updateJob(jobId, {
        status: 'failed',
        progress: 100,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async probe(jobId: string): Promise<void> {
    this.updateJob(jobId, { status: 'probing', progress: 0 });

    const ytDlpPath = this.ytDlpPathResolver();
    if (!ytDlpPath || !existsSync(ytDlpPath)) {
      throw new Error('yt-dlp is not installed with the application');
    }

    const job = this.requireJob(jobId);
    const command = this.commandRunner(ytDlpPath, ['--dump-json', '--no-playlist', job.sourceUrl]);
    this.runningCommands.set(jobId, command);
    const result = await command.promise;
    if (this.runningCommands.get(jobId) !== command) {
      return;
    }

    this.runningCommands.delete(jobId);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'yt-dlp probe failed');
    }

    const metadata = this.parseProbeResult(result.stdout);
    this.updateJob(jobId, {
      title: metadata.title,
      durationSeconds: metadata.durationSeconds,
      thumbnailUrl: metadata.thumbnailUrl,
      webpageUrl: metadata.webpageUrl,
    });
  }

  private async download(jobId: string): Promise<void> {
    const job = this.requireJob(jobId);
    const ytDlpPath = this.ytDlpPathResolver();
    const ffmpegPath = this.getFfmpegPath();
    const outputDirectory = this.settings.outputDirectory;

    if (!ytDlpPath || !existsSync(ytDlpPath)) {
      throw new Error('yt-dlp is not installed with the application');
    }

    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      throw new Error('ffmpeg is not available');
    }

    if (!outputDirectory) {
      throw new Error('请选择下载文件夹');
    }

    const args = [
      '--newline',
      '--no-playlist',
      '--no-mtime',
      '--restrict-filenames',
      '-f',
      'bestaudio/best',
      '--extract-audio',
      '--audio-quality',
      '0',
      '--ffmpeg-location',
      dirname(ffmpegPath),
      '--paths',
      outputDirectory,
      '-o',
      outputTemplate,
      '--print',
      'after_move:filepath',
      job.sourceUrl,
    ];
    let printedOutputPath: string | null = null;
    const startedAtMs = Date.now();
    const runner = this.dependencies.streamingCommandRunner ?? runStreamingCommand;
    const command = runner(ytDlpPath, args, {
      onStdout: (line) => {
        const maybePath = this.parseOutputPath(line, outputDirectory);
        if (maybePath) {
          printedOutputPath = maybePath;
          this.updateJob(jobId, { outputPath: printedOutputPath });
          return;
        }
        this.handleDownloadLine(jobId, line);
      },
      onStderr: (line) => this.handleDownloadLine(jobId, line),
    });
    this.runningCommands.set(jobId, command);
    this.updateJob(jobId, { status: 'downloading', progress: Math.max(job.progress, 1) });
    const result = await command.promise;
    if (this.runningCommands.get(jobId) !== command) {
      return;
    }

    this.runningCommands.delete(jobId);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || 'yt-dlp download failed');
    }

    const outputPath = printedOutputPath ?? this.findNewestAudioFile(outputDirectory, startedAtMs);
    if (!outputPath) {
      throw new Error('Download finished but no audio file was produced');
    }

    this.updateJob(jobId, {
      status: 'extracting_audio',
      outputPath,
      progress: 96,
      downloadedBytes: this.safeFileSize(outputPath),
    });
  }

  private async importAndBind(jobId: string): Promise<void> {
    const job = this.requireJob(jobId);
    const options = this.jobOptions.get(jobId) ?? {
      importToLibrary: this.settings.importToLibrary,
      bindMvAfterImport: this.settings.bindMvAfterImport,
    };

    if (!options.importToLibrary) {
      return;
    }

    if (!job.outputPath) {
      throw new Error('Download output path is unavailable for import');
    }

    this.updateJob(jobId, { status: 'importing', progress: 98 });
    const importAudioFile = this.dependencies.importAudioFile ?? ((filePath, importOptions) => getLibraryService().importAudioFile(filePath, importOptions));
    const track = await importAudioFile(job.outputPath, { folderPath: this.settings.outputDirectory ?? dirname(job.outputPath) });
    this.updateJob(jobId, { importedTrackId: track.id });

    if (!options.bindMvAfterImport) {
      return;
    }

    this.updateJob(jobId, { status: 'binding_mv', progress: 99 });
    const bindMvUrl = this.dependencies.bindMvUrl ?? ((trackId, url) => getMvService().bindUrl(trackId, url));
    bindMvUrl(track.id, job.webpageUrl ?? job.sourceUrl);
  }

  private handleDownloadLine(jobId: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('[ExtractAudio]') || trimmed.includes('Extracting audio')) {
      this.updateJob(jobId, { status: 'extracting_audio', progress: Math.max(this.requireJob(jobId).progress, 95) });
      return;
    }

    const progress = this.parseDownloadProgress(trimmed);
    if (!progress) {
      return;
    }

    this.updateJob(
      jobId,
      {
        status: 'downloading',
        progress: progress.percent,
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes,
        speedBytesPerSecond: progress.speedBytesPerSecond,
        etaSeconds: progress.etaSeconds,
      },
      false,
    );
  }

  private updateJob(jobId: string, patch: Partial<DownloadJob>, immediate = true): void {
    this.jobs = this.jobs.map((job) =>
      job.id === jobId
        ? {
            ...job,
            ...patch,
            progress: Math.max(0, Math.min(100, patch.progress ?? job.progress)),
            updatedAt: new Date().toISOString(),
          }
        : job,
    );

    if (immediate || terminalStatuses.has(patch.status as DownloadJobStatus)) {
      this.emitJobsNow();
      return;
    }

    const now = Date.now();
    const lastEmitAt = this.lastProgressEmitAt.get(jobId) ?? 0;
    if (now - lastEmitAt >= progressEmitIntervalMs) {
      this.lastProgressEmitAt.set(jobId, now);
      this.emitJobsNow();
    }
  }

  private emitJobsNow(): void {
    this.emit('jobs-updated', this.getJobs());
  }

  private clearCommand(jobId: string): void {
    const command = this.runningCommands.get(jobId);

    if (command) {
      command.kill();
      this.runningCommands.delete(jobId);
    }
  }

  private requireJob(jobId: string): DownloadJob {
    const job = this.jobs.find((item) => item.id === jobId);

    if (!job) {
      throw new Error(`Unknown download job ${jobId}`);
    }

    if (terminalStatuses.has(job.status)) {
      throw new Error(`Download job ${jobId} is no longer active`);
    }

    return job;
  }

  private parseProbeResult(stdout: string): Pick<DownloadJob, 'title' | 'durationSeconds' | 'thumbnailUrl' | 'webpageUrl'> {
    try {
      const parsed = JSON.parse(stdout) as YtDlpProbeResult;
      const duration = Number(parsed.duration);

      return {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Untitled download',
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
        thumbnailUrl: typeof parsed.thumbnail === 'string' && parsed.thumbnail.trim() ? parsed.thumbnail.trim() : null,
        webpageUrl: typeof parsed.webpage_url === 'string' && parsed.webpage_url.trim() ? parsed.webpage_url.trim() : null,
      };
    } catch {
      return {
        title: 'Untitled download',
        durationSeconds: null,
        thumbnailUrl: null,
        webpageUrl: null,
      };
    }
  }

  private parseDownloadProgress(line: string): {
    percent: number;
    downloadedBytes: number | null;
    totalBytes: number | null;
    speedBytesPerSecond: number | null;
    etaSeconds: number | null;
  } | null {
    const percentMatch = line.match(/\[download\]\s+([0-9.]+)%/u);
    if (!percentMatch) {
      return null;
    }

    const downloadedMatch = line.match(/\[download\]\s+([0-9.]+\s*[A-Za-z]+)\s+of\s+~?[0-9.]+\s*[A-Za-z]+/u);
    const totalMatch = line.match(/\bof\s+~?([0-9.]+\s*[A-Za-z]+)\b/u);
    const prefixMatch = line.match(/%\s+of\s+~?([0-9.]+\s*[A-Za-z]+)\s+at/u);
    const speedMatch = line.match(/\bat\s+([0-9.]+\s*[A-Za-z]+\/s)/u);
    const etaMatch = line.match(/\bETA\s+([0-9:]+)/u);
    const percent = Number(percentMatch[1]);

    const totalBytes = this.parseByteText(totalMatch?.[1] ?? prefixMatch?.[1] ?? null);
    const downloadedBytes = this.parseByteText(downloadedMatch?.[1] ?? null) ?? (totalBytes ? Math.round((totalBytes * percent) / 100) : null);

    return {
      percent: Number.isFinite(percent) ? percent : 0,
      downloadedBytes,
      totalBytes,
      speedBytesPerSecond: this.parseByteText(speedMatch?.[1]?.replace(/\/s$/u, '') ?? null),
      etaSeconds: this.parseEta(etaMatch?.[1] ?? null),
    };
  }

  private parseByteText(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const match = value.trim().match(/^([0-9.]+)\s*([KMGTPE]?i?B)$/iu);
    if (!match) {
      return null;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return null;
    }

    const unit = match[2].toLowerCase();
    const factor =
      unit === 'kb'
        ? 1000
        : unit === 'mb'
          ? 1000 ** 2
          : unit === 'gb'
            ? 1000 ** 3
            : unit === 'kib'
              ? 1024
              : unit === 'mib'
                ? 1024 ** 2
                : unit === 'gib'
                  ? 1024 ** 3
                  : 1;

    return Math.round(amount * factor);
  }

  private parseEta(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const parts = value.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) {
      return null;
    }

    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  private parseOutputPath(line: string, outputDirectory: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const candidate = resolve(trimmed);
    const relativePath = relative(resolve(outputDirectory), candidate);
    if (relativePath.startsWith('..') || relativePath === '' || candidate.endsWith('.part')) {
      return null;
    }

    return this.isSupportedAudioPath(candidate) ? candidate : null;
  }

  private findNewestAudioFile(outputDirectory: string, startedAtMs: number): string | null {
    const entries = readdirSync(outputDirectory)
      .map((entry) => resolve(outputDirectory, entry))
      .filter((entryPath) => {
        try {
          const entryStat = statSync(entryPath);
          return entryStat.isFile() && entryStat.mtimeMs >= startedAtMs - 1000 && this.isSupportedAudioPath(entryPath);
        } catch {
          return false;
        }
      })
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

    return entries[0] ?? null;
  }

  private isSupportedAudioPath(filePath: string): boolean {
    return isSupportedAudioExtension(filePath);
  }

  private safeFileSize(filePath: string): number | null {
    try {
      return statSync(filePath).size;
    } catch {
      return null;
    }
  }

  private cleanupPartialFiles(job: DownloadJob): void {
    const outputDirectory = this.settings.outputDirectory;
    if (!outputDirectory || !existsSync(outputDirectory)) {
      return;
    }

    const jobIdMatch = job.outputPath?.match(/\[([^\]]+)\]\.[^.]+$/u)?.[1] ?? null;
    const createdAtMs = Date.parse(job.createdAt);
    for (const entry of readdirSync(outputDirectory)) {
      const entryPath = join(outputDirectory, entry);
      const entryStat = statSync(entryPath);
      const isRecentPartial =
        Number.isFinite(createdAtMs) &&
        entryStat.isFile() &&
        entryStat.mtimeMs >= createdAtMs - 1000 &&
        (entry.endsWith('.part') || entry.endsWith('.ytdl'));
      const shouldDelete = isRecentPartial || (jobIdMatch ? entry.includes(`[${jobIdMatch}]`) && !this.isSupportedAudioPath(entryPath) : false);
      if (shouldDelete) {
        rmSync(entryPath, { force: true, recursive: true, maxRetries: 3, retryDelay: 50 });
      }
    }
  }

  private getFfmpegPath(): string | null {
    return normalizeStaticFfmpegPath(ffmpegStaticPath);
  }
}

let downloadService: DownloadService | null = null;

export const getDownloadService = (): DownloadService => {
  downloadService ??= new DownloadService();
  return downloadService;
};
