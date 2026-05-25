import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { app } from 'electron';
import type { AudioOutputSettings, AudioStatus } from '../../shared/types/audio';
import type { AirPlayReceiverStatus, ConnectMetadata, ConnectReceiverClient, ConnectReceiverDebugEvent } from '../../shared/types/connect';
import { getAudioSession } from '../audio/AudioSession';
import { AirPlayMdnsAdvertiser } from './AirPlayMdnsAdvertiser';

type RaopEvent = Record<string, unknown> & {
  type?: string;
  data?: Buffer;
  sampleRate?: number;
  channels?: number;
  title?: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  elapsedMs?: number;
  value?: number;
  remoteAddress?: string;
  address?: string;
  host?: string;
  mimeType?: string;
  contentType?: string;
};

type RaopReceiverOptions = {
  name: string;
  model: string;
  host?: string;
  mac?: string;
  latencies: string;
  metadata: boolean;
  portBase: number;
  portRange: number;
};

type RaopModule = {
  startReceiver: (options: RaopReceiverOptions, handler: (event: RaopEvent) => void) => number | Promise<number>;
  stopReceiver: (handle: number) => void | Promise<void>;
  sendRemoteCommand?: (handle: number, command: 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'previous') => boolean | Promise<boolean>;
  setPcmForwarding?: (enabled: boolean) => boolean | Promise<boolean>;
  setLogHandler?: (handler: ((event: unknown) => void) | null, level?: string, raopLevel?: string, utilLevel?: string) => void;
};

type AirPlayAudioSession = {
  getStatus: () => AudioStatus;
  playPcmStream: (request: {
    stream: PassThrough;
    sourceId: string;
    trackId?: string | null;
    sampleRate: number;
    channels: number;
    durationSeconds?: number;
    output?: AudioOutputSettings;
  }) => Promise<AudioStatus>;
  pause: () => Promise<AudioStatus> | AudioStatus;
  stop: () => Promise<AudioStatus> | AudioStatus;
  setOutput: (settings: { volume: number }) => Promise<AudioStatus> | AudioStatus;
  on: (event: 'status', listener: (status: AudioStatus) => void) => AirPlayAudioSession;
  off?: (event: 'status', listener: (status: AudioStatus) => void) => AirPlayAudioSession;
};

type AirPlayReceiverEvents = {
  status: [AirPlayReceiverStatus];
};

type AirPlayReceiverDependencies = {
  audioSession?: AirPlayAudioSession;
  advertisedName?: string;
  loadRaopModule?: () => Promise<RaopModule>;
  getAdvertiseInterfaces?: () => AirPlayAdvertiseInterface[];
  createMdnsAdvertiser?: () => AirPlayMdnsAdvertiserLike;
  useHttpPcmBridge?: boolean;
  now?: () => number;
};

type AirPlayHelperRuntimeOptions = {
  isPackaged: boolean;
  processExecPath: string;
  npmNodeExecPath?: string | null;
  nodeEnvPath?: string | null;
};

const defaultAdvertisedName = (): string =>
  process.env.ELECTRON_RENDERER_URL ? 'ECHO Next Dev (AirPlay)' : 'ECHO Next (AirPlay)';
const defaultTitle = 'AirPlay stream';
const unknownArtist = 'Unknown Artist';
const debugEventLimit = 24;
const defaultSampleRate = 44_100;
const defaultChannels = 2;
const airPlayModel = 'ECHO-Next-AirPlay-Spike';
const airPlayPcmHighWaterMark = 4 * 1024 * 1024;
const airPlayOutputSampleRate = 48_000;
const airPlayOutputBufferFrames = 8192;
const airPlayHttpPcmFallbackMs = 1_500;
const airPlayHttpPcmReconnectMs = 120;
const airPlayRaopLatencies = '1000:1000';
const shouldUseAirPlayHttpPcmBridge = (): boolean => process.env.ECHO_AIRPLAY_HTTP_PCM === '1';

type AirPlayAdvertiseInterface = {
  name: string;
  address: string;
  mac: string;
};

type AirPlayMdnsAdvertiserLike = Pick<AirPlayMdnsAdvertiser, 'start' | 'stop'>;

const loadDefaultRaopModule = async (): Promise<RaopModule> => {
  return new AirPlayRaopHelperModule();
};

export const resolveAirPlayHelperNodePath = (options: AirPlayHelperRuntimeOptions): string => {
  if (options.isPackaged) {
    return options.processExecPath;
  }

  const explicitRuntime = [
    options.npmNodeExecPath,
    options.nodeEnvPath,
  ].filter((value): value is string => Boolean(value));
  return explicitRuntime[0] ?? options.processExecPath;
};

const prependNodePaths = (env: NodeJS.ProcessEnv, nodePaths: string[]): void => {
  const existing = env.NODE_PATH ? [env.NODE_PATH] : [];
  env.NODE_PATH = [...nodePaths, ...existing].join(delimiter);
};

const trimText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : null;
};

const compactAirPlayText = (value: string | null): string =>
  (value ?? '')
    .replace(/[\s"'`.,!?，。！？、:：;；-]+/gu, '')
    .toLocaleLowerCase();

const comparableAirPlayText = (value: string | null): string =>
  compactAirPlayText(value?.replace(/\s*[(（][^()（）]*[)）]\s*/gu, '') ?? null);

const isGenericAirPlayTitle = (title: string | null): boolean => {
  if (!title) {
    return true;
  }

  const normalized = compactAirPlayText(title);
  return normalized === '纯音乐' || normalized === '纯音乐请欣赏' || normalized === 'airplaystream';
};

const sameText = (left: string | null, right: string | null): boolean => {
  if (!left || !right) {
    return false;
  }
  return comparableAirPlayText(left) === comparableAirPlayText(right);
};

const isAlbumLikeArtistPart = (part: string | null, album: string | null): boolean => {
  const normalizedPart = comparableAirPlayText(part);
  const normalizedAlbum = comparableAirPlayText(album);
  return Boolean(normalizedPart && normalizedAlbum && (normalizedPart === normalizedAlbum || normalizedPart.startsWith(normalizedAlbum)));
};

const looksLikeAirPlayLyricLine = (title: string | null): boolean =>
  Boolean(
    title &&
      title.length >= 8 &&
      (/\s/u.test(title) || /[,'"!?，。！？、…]/u.test(title) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(title)),
  );

const shouldKeepCurrentMetadataForLyricLine = (title: string | null, current: ConnectMetadata | null): boolean =>
  Boolean(
    current?.title &&
      !isGenericAirPlayTitle(current.title) &&
      looksLikeAirPlayLyricLine(title) &&
      !sameText(title, current.title),
  );

const normalizeAirPlayMetadataText = (
  title: string | null,
  artist: string | null,
  album: string | null,
): { title: string | null; artist: string | null; album: string | null } => {
  if (!album) {
    return { title, artist, album };
  }

  const artistParts = artist?.split(/[/／]/u).map((part) => part.trim()).filter(Boolean) ?? [];
  const albumPartIndex = artistParts.findIndex((part) => isAlbumLikeArtistPart(part, album));
  const shouldPreferAlbumTitle =
    isGenericAirPlayTitle(title) || (albumPartIndex >= 0 && !sameText(title, album) && looksLikeAirPlayLyricLine(title));

  if (!shouldPreferAlbumTitle) {
    return { title, artist, album };
  }

  return {
    title: album,
    artist: albumPartIndex > 0 ? artistParts.slice(0, albumPartIndex).join(' / ') : artist,
    album,
  };
};

const normalizeVolume = (value: unknown): number => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 100;
  }

  if (numberValue <= 0) {
    if (numberValue <= -144) {
      return 0;
    }

    const dbValue = Math.max(-30, numberValue);
    return Math.max(1, Math.min(100, Math.round(10 ** (dbValue / 20) * 100)));
  }

  if (numberValue <= 1 && numberValue >= 0) {
    return Math.round(numberValue * 100);
  }

  return Math.max(0, Math.min(100, Math.round(numberValue)));
};

const eventAddress = (event: RaopEvent): string | null =>
  trimText(event.remoteAddress) ?? trimText(event.address) ?? trimText(event.host);

const normalizeMac = (mac: string | null | undefined): string | null => {
  const cleaned = (mac ?? '').replace(/[^a-fA-F0-9]/gu, '').toUpperCase();
  if (cleaned.length !== 12 || cleaned === '000000000000') {
    return null;
  }
  return cleaned.match(/.{1,2}/gu)?.join(':') ?? null;
};

const isBenchmarkIpv4 = (address: string): boolean => /^198\.(?:18|19)\./u.test(address);

const isApipaIpv4 = (address: string): boolean => address.startsWith('169.254.');

const isPrivateLanIpv4 = (address: string): boolean =>
  address.startsWith('10.') ||
  address.startsWith('192.168.') ||
  /^172\.(?:1[6-9]|2\d|3[0-1])\./u.test(address);

const isLikelyVirtualAirPlayInterface = (name: string): boolean =>
  /(?:mihomo|clash|vpn|wireguard|tailscale|zerotier|vmware|virtualbox|hyper-v|docker|wsl|loopback|vethernet|tap|tun|npcap|bluetooth)/iu.test(name);

const scoreAdvertiseInterface = (item: AirPlayAdvertiseInterface): number => {
  let score = isPrivateLanIpv4(item.address) ? 0 : 20;
  if (/wi-?fi|wlan|ethernet|以太网/iu.test(item.name)) {
    score -= 5;
  }
  if (isLikelyVirtualAirPlayInterface(item.name)) {
    score += 50;
  }
  if (item.mac === '02:45:43:48:4F:00') {
    score += 10;
  }
  return score;
};

const getAdvertiseInterfaces = (): AirPlayAdvertiseInterface[] => {
  const candidates = Object.entries(networkInterfaces())
    .flatMap(([name, items]) => (items ?? []).map((item) => ({ name, item })))
    .filter(({ item }) => item.family === 'IPv4' && !item.internal)
    .map(({ name, item }) => ({
      name,
      address: item.address,
      mac: normalizeMac(item.mac) ?? '02:45:43:48:4F:00',
    }))
    .filter((item) => !isBenchmarkIpv4(item.address) && !isApipaIpv4(item.address));
  const realLanCandidates = candidates.filter((item) => !isLikelyVirtualAirPlayInterface(item.name));
  return (realLanCandidates.length > 0 ? realLanCandidates : candidates)
    .sort((left, right) => {
      const scoreDelta = scoreAdvertiseInterface(left) - scoreAdvertiseInterface(right);
      return scoreDelta || left.name.localeCompare(right.name) || left.address.localeCompare(right.address);
    });
};

const findAvailableTcpPort = async (host: string | null, basePort: number, portRange: number): Promise<number> => {
  for (let offset = 0; offset < portRange; offset += 1) {
    const port = basePort + offset;
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, host ?? undefined, () => {
        server.close(() => resolve(true));
      });
    });
    if (available) {
      return port;
    }
  }
  throw new Error(`No available AirPlay port in ${basePort}-${basePort + portRange - 1}`);
};

type HelperRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class AirPlayRaopHelperModule implements RaopModule {
  private child: ChildProcessWithoutNullStreams | null = null;
  private handler: ((event: RaopEvent) => void) | null = null;
  private logHandler: ((event: unknown) => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, HelperRequest>();

  setLogHandler(handler: ((event: unknown) => void) | null): void {
    this.logHandler = handler;
  }

  async startReceiver(options: RaopReceiverOptions, handler: (event: RaopEvent) => void): Promise<number> {
    this.handler = handler;
    await this.ensureHelper();
    const response = await this.sendRequest('start', { options });
    const handle = Number((response as { handle?: unknown }).handle);
    if (!Number.isInteger(handle)) {
      throw new Error('AirPlay helper did not return a receiver handle.');
    }
    return handle;
  }

  async stopReceiver(): Promise<void> {
    if (!this.child) {
      return;
    }
    await this.sendRequest('stop', {}).catch(() => undefined);
    await this.shutdownHelper();
  }

  async sendRemoteCommand(_handle: number, command: 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'previous'): Promise<boolean> {
    if (!this.child) {
      return false;
    }
    const response = await this.sendRequest('remote', { command }).catch(() => ({ ok: false }));
    return Boolean((response as { ok?: unknown }).ok);
  }

  async setPcmForwarding(enabled: boolean): Promise<boolean> {
    if (!this.child) {
      return false;
    }
    const response = await this.sendRequest('pcm-forwarding', { enabled }).catch(() => ({ ok: false }));
    return Boolean((response as { ok?: unknown }).ok);
  }

  private async ensureHelper(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    const nodePath = this.resolveNodePath();
    const helperPath = this.resolveHelperPath();
    if (!existsSync(helperPath)) {
      throw new Error(`AirPlay helper script is missing: ${helperPath}`);
    }
    const env = { ...process.env };
    if (this.shouldRunAsNode(nodePath)) {
      env.ELECTRON_RUN_AS_NODE = '1';
    } else {
      delete env.ELECTRON_RUN_AS_NODE;
    }
    if (app.isPackaged) {
      prependNodePaths(env, [
        join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        join(app.getAppPath(), 'node_modules'),
      ]);
    }

    this.child = spawn(nodePath, [helperPath], {
      cwd: dirname(helperPath),
      env,
      stdio: 'pipe',
      windowsHide: true,
    });

    const child = this.child;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const readyTimeout = setTimeout(() => reject(new Error('AirPlay helper did not become ready.')), 10_000);
      child.once('error', (error) => {
        clearTimeout(readyTimeout);
        reject(error);
      });
      child.stdin.on('error', (error: Error) => {
        this.handleHelperWriteFailure(child, error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(readyTimeout);
        this.rejectAll(new Error(`AirPlay helper exited (${code ?? signal ?? 'unknown'}).`));
        this.child = null;
        this.readyPromise = null;
        if (code !== 0) {
          this.logHandler?.({ source: 'helper', level: 'error', line: `helper exited (${code ?? signal ?? 'unknown'})` });
        }
      });

      const rl = readline.createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const message = this.parseMessage(line);
        if (!message) {
          return;
        }
        if (message.type === 'ready') {
          clearTimeout(readyTimeout);
          resolve();
          return;
        }
        this.handleHelperMessage(message);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        this.logHandler?.({ source: 'helper', level: 'warn', line: chunk.toString('utf8').trim() });
      });
    });

    await this.readyPromise;
  }

  private parseMessage(line: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(line) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      this.logHandler?.({ source: 'helper', level: 'warn', line });
      return null;
    }
  }

  private handleHelperMessage(message: Record<string, unknown>): void {
    if (message.type === 'event') {
      const event = message.event;
      if (event && typeof event === 'object' && !Array.isArray(event)) {
        const nextEvent = { ...(event as RaopEvent) };
        if (nextEvent.data && !(nextEvent.data instanceof Buffer)) {
          const data = nextEvent.data as { type?: unknown; data?: unknown };
          if (data.type === 'Buffer' && Array.isArray(data.data)) {
            nextEvent.data = Buffer.from(data.data as number[]);
          }
        }
        this.handler?.(nextEvent);
      }
      return;
    }

    if (message.type === 'log') {
      this.logHandler?.({ source: 'helper', level: message.level, line: message.message });
      return;
    }

    if (message.type === 'fatal') {
      const error = new Error(trimText(message.message) ?? 'AirPlay helper crashed.');
      this.rejectAll(error);
      this.logHandler?.({ source: 'helper', level: 'error', line: error.message });
      return;
    }

    const requestId = Number(message.requestId);
    if (!Number.isInteger(requestId)) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (message.type === 'error') {
      pending.reject(new Error(trimText(message.message) ?? 'AirPlay helper request failed.'));
    } else {
      pending.resolve(message);
    }
  }

  private sendRequest(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed) {
      return Promise.reject(new Error('AirPlay helper is not running.'));
    }
    if (child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
      return Promise.reject(new Error('AirPlay helper stdin is not writable.'));
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`AirPlay helper request timed out: ${type}`));
      }, 10_000);
      this.pending.set(requestId, { resolve, reject, timer });
      const message = `${JSON.stringify({ ...payload, type, requestId })}\n`;
      const fail = (error: unknown): void => {
        const request = this.pending.get(requestId);
        if (request) {
          clearTimeout(request.timer);
          this.pending.delete(requestId);
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.handleHelperWriteFailure(child, error);
      };

      try {
        child.stdin.write(message, (error: Error | null | undefined) => {
          if (error) {
            fail(error);
          }
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  private rejectAll(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private handleHelperWriteFailure(child: ChildProcessWithoutNullStreams, error: unknown): void {
    if (this.child !== child) {
      return;
    }

    const nextError = error instanceof Error ? error : new Error(String(error));
    this.logHandler?.({ source: 'helper', level: 'error', line: `helper stdin closed: ${nextError.message}` });
    this.child = null;
    this.readyPromise = null;
    this.rejectAll(nextError);
    try {
      if (!child.killed) {
        child.kill();
      }
    } catch {
      // Best-effort cleanup after helper pipe failure.
    }
  }

  private async shutdownHelper(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    if (!child || child.killed) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        if (!child.stdin.destroyed && !child.stdin.writableEnded) {
          child.stdin.end();
        }
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  private resolveNodePath(): string {
    return resolveAirPlayHelperNodePath({
      isPackaged: app.isPackaged,
      processExecPath: process.execPath,
      npmNodeExecPath: process.env.npm_node_execpath,
      nodeEnvPath: process.env.NODE,
    });
  }

  private shouldRunAsNode(nodePath: string): boolean {
    return nodePath === process.execPath;
  }

  private resolveHelperPath(): string {
    const appPath = app.getAppPath();
    const candidates = [
      join(appPath, 'src', 'main', 'connect', 'airplayRaopHelper.cjs'),
      join(appPath, 'out', 'main', 'airplayRaopHelper.cjs'),
      join(process.resourcesPath, 'airplayRaopHelper.cjs'),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }
}

export const convertS16leToF32le = (input: Buffer): Buffer => {
  const sampleCount = Math.floor(input.length / 2);
  const output = Buffer.allocUnsafe(sampleCount * 4);

  for (let index = 0; index < sampleCount; index += 1) {
    output.writeFloatLE(input.readInt16LE(index * 2) / 32768, index * 4);
  }

  return output;
};

const createAirPlayOutputSettings = (): NonNullable<Parameters<AirPlayAudioSession['playPcmStream']>[0]['output']> => ({
  outputMode: 'shared',
  sharedBackend: 'auto',
  requestedOutputSampleRate: airPlayOutputSampleRate,
  latencyProfile: 'stable',
  bufferSizeFrames: airPlayOutputBufferFrames,
  useJuceDecode: false,
  dsdOutputMode: 'pcm',
  asioNativeDsdExperimentalEnabled: false,
  releaseExclusiveOnPauseExperimentalEnabled: false,
});

const airPlayStateFromAudioStatus = (audioStatus: AudioStatus, currentState: AirPlayReceiverStatus['state']): AirPlayReceiverStatus['state'] => {
  if (currentState === 'playing' && audioStatus.state === 'paused') {
    return currentState;
  }
  if (currentState === 'paused' && audioStatus.state === 'playing') {
    return currentState;
  }
  return audioStatus.state === 'playing' || audioStatus.state === 'paused' || audioStatus.state === 'stopped' || audioStatus.state === 'error'
    ? audioStatus.state
    : currentState;
};

const metadataIdentityKey = (metadata: ConnectMetadata | null): string | null => {
  if (!metadata) {
    return null;
  }
  return [
    comparableAirPlayText(metadata.title),
    comparableAirPlayText(metadata.artist),
    comparableAirPlayText(metadata.album),
    metadata.durationSeconds > 0 ? Math.round(metadata.durationSeconds).toString() : '',
  ].join('|');
};

const metadataFromEvent = (event: RaopEvent, current: ConnectMetadata | null, artworkUrl: string | null): ConnectMetadata => {
  const durationSeconds = Number(event.durationMs);
  const eventDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds / 1000) : 0;
  const currentDurationSeconds = current?.durationSeconds ?? 0;
  const eventTitle = trimText(event.title);
  const keepCurrentMetadata =
    shouldKeepCurrentMetadataForLyricLine(eventTitle, current) &&
    (!eventDurationSeconds || !currentDurationSeconds || Math.abs(eventDurationSeconds - currentDurationSeconds) <= 2);
  const title = keepCurrentMetadata ? current?.title ?? null : eventTitle ?? current?.title ?? null;
  const artist = keepCurrentMetadata ? current?.artist ?? null : trimText(event.artist) ?? current?.artist ?? null;
  const album = keepCurrentMetadata ? current?.album ?? null : trimText(event.album) ?? current?.album ?? null;
  const normalized = normalizeAirPlayMetadataText(title, artist, album);
  return {
    title: normalized.title ?? defaultTitle,
    artist: normalized.artist ?? unknownArtist,
    album: normalized.album,
    albumArtist: current?.albumArtist ?? normalized.artist ?? unknownArtist,
    durationSeconds: eventDurationSeconds || (current?.durationSeconds ?? 0),
    coverHttpUrl: artworkUrl ?? current?.coverHttpUrl ?? '',
  };
};

export class AirPlayReceiverSpikeService extends EventEmitter<AirPlayReceiverEvents> {
  private readonly audioSession: AirPlayAudioSession;
  private readonly advertisedName: string;
  private readonly loadRaopModule: () => Promise<RaopModule>;
  private readonly getAdvertiseInterfaces: () => AirPlayAdvertiseInterface[];
  private readonly createMdnsAdvertiser: () => AirPlayMdnsAdvertiserLike;
  private readonly useHttpPcmBridge: boolean;
  private readonly now: () => number;
  private raopModule: RaopModule | null = null;
  private receiverHandle: number | null = null;
  private advertisedInterface: AirPlayAdvertiseInterface | null = null;
  private mdnsAdvertisers: AirPlayMdnsAdvertiserLike[] = [];
  private pcmStream: PassThrough | null = null;
  private httpPcmRequest: ClientRequest | null = null;
  private readonly intentionalHttpPcmRequestCloses = new WeakSet<ClientRequest>();
  private httpPcmTransform: Transform | null = null;
  private httpPcmFallbackTimer: NodeJS.Timeout | null = null;
  private httpPcmReconnectTimer: NodeJS.Timeout | null = null;
  private httpPcmBytesReceived = 0;
  private lastHttpPcmPort: number | null = null;
  private pcmPlaybackStarted = false;
  private currentSourceId: string | null = null;
  private ignorePcmUntilNextStream = false;
  private audioSessionClaimedCurrentSource = false;
  private currentMetadataIdentityKey: string | null = null;
  private positionAnchorSeconds = 0;
  private positionAnchorUpdatedAtMs = 0;
  private sessionCounter = 0;
  private status: AirPlayReceiverStatus;

  constructor(dependencies: AirPlayReceiverDependencies = {}) {
    super();
    this.audioSession = dependencies.audioSession ?? getAudioSession();
    this.advertisedName = dependencies.advertisedName ?? defaultAdvertisedName();
    this.loadRaopModule = dependencies.loadRaopModule ?? loadDefaultRaopModule;
    this.getAdvertiseInterfaces = dependencies.getAdvertiseInterfaces ?? getAdvertiseInterfaces;
    this.createMdnsAdvertiser = dependencies.createMdnsAdvertiser ?? (() => new AirPlayMdnsAdvertiser());
    this.useHttpPcmBridge = dependencies.useHttpPcmBridge ?? shouldUseAirPlayHttpPcmBridge();
    this.now = dependencies.now ?? Date.now;
    this.status = this.createDisabledStatus();
    this.audioSession.on('status', this.handleAudioStatus);
    if (!dependencies.loadRaopModule) {
      void this.refreshNativeAvailability();
    }
  }

  getStatus(): AirPlayReceiverStatus {
    return this.withAudioPosition(this.status);
  }

  async setEnabled(enabled: boolean): Promise<AirPlayReceiverStatus> {
    if (enabled) {
      await this.start();
    } else {
      await this.stop();
    }

    return this.getStatus();
  }

  async stopPlayback(): Promise<AirPlayReceiverStatus> {
    this.sendRemoteCommand('stop');
    const currentSourceId = this.currentSourceId;
    if (currentSourceId && this.audioSession.getStatus().currentFilePath === currentSourceId) {
      await Promise.resolve(this.audioSession.stop()).catch(() => undefined);
    }
    this.ignorePcmUntilNextStream = true;
    this.clearCurrentSession('stopped by ECHO');
    this.setStatus({
      state: this.status.enabled ? 'idle' : 'disabled',
      currentSourceId: null,
      currentClient: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
    });
    return this.getStatus();
  }

  isCurrentSource(sourceId: string | null | undefined): boolean {
    return Boolean(sourceId && this.currentSourceId === sourceId);
  }

  async playPlayback(): Promise<AirPlayReceiverStatus> {
    this.sendRemoteCommand('play');
    this.setPositionAnchor(this.estimatePosition(this.status));
    this.setStatus({ state: 'playing' });
    return this.getStatus();
  }

  async pausePlayback(): Promise<AirPlayReceiverStatus> {
    this.sendRemoteCommand('pause');
    this.setPositionAnchor(this.estimatePosition(this.status));
    this.setStatus({ state: 'paused' });
    return this.getStatus();
  }

  async seekPlayback(_positionSeconds?: number): Promise<AirPlayReceiverStatus> {
    this.addDebugEvent('seek', 'AirPlay receiver seek is not supported by the native backend');
    return this.getStatus();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.audioSession.off?.('status', this.handleAudioStatus);
    this.removeAllListeners();
  }

  private createDisabledStatus(): AirPlayReceiverStatus {
    return {
      enabled: false,
      state: 'disabled',
      advertisedName: this.advertisedName,
      nativeAvailable: false,
      currentSourceId: null,
      currentClient: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      volume: Math.round((this.audioSession.getStatus().volume ?? 1) * 100),
      error: null,
      debugEvents: [],
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private async start(): Promise<void> {
    if (this.status.enabled && this.receiverHandle !== null) {
      return;
    }

    this.setStatus({ enabled: false, state: 'starting', error: null });
    try {
      this.raopModule ??= await this.loadRaopModule();
      this.raopModule.setLogHandler?.((event) => this.handleNativeLog(event), 'info', 'info', 'warn');
      const advertiseInterfaces = this.getAdvertiseInterfaces();
      const advertiseInterface = advertiseInterfaces[0] ?? null;
      const advertisedMac = advertiseInterface?.mac ?? '02:45:43:48:4F:00';
      this.advertisedInterface = advertiseInterface;
      const portBase = await findAvailableTcpPort(null, 6000, 100);
      this.receiverHandle = await this.raopModule.startReceiver(
        {
          name: this.advertisedName,
          model: airPlayModel,
          mac: advertisedMac,
          latencies: airPlayRaopLatencies,
          metadata: true,
          portBase,
          portRange: 100,
        },
        (event) => this.handleRaopEvent(event),
      );
      const advertisedAddresses: string[] = [];
      for (const item of advertiseInterfaces) {
        try {
          const mdnsAdvertiser = this.createMdnsAdvertiser();
          await mdnsAdvertiser.start({
            name: this.advertisedName,
            model: airPlayModel,
            address: item.address,
            mac: advertisedMac,
            port: portBase,
          });
          this.mdnsAdvertisers.push(mdnsAdvertiser);
          advertisedAddresses.push(`${item.address} (${item.name})`);
        } catch (error) {
          this.addDebugEvent('mdns', `${item.address}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.addDebugEvent(
        'mdns',
        advertisedAddresses.length > 0
          ? `fallback advertisers on ${advertisedAddresses.join(', ')}`
          : 'AirPlay mDNS advertiser did not start on any eligible LAN IPv4 interface',
      );
      this.addDebugEvent(
        'start',
        advertiseInterface
          ? `RAOP receiver started on 0.0.0.0:${portBase}; primary advertisement ${advertiseInterface.address} (${advertiseInterface.mac})`
          : `RAOP receiver started on 0.0.0.0:${portBase}; no LAN IPv4 interface found`,
      );
      this.setStatus({
        enabled: true,
        state: 'idle',
        nativeAvailable: true,
        error: advertisedAddresses.length > 0 ? null : 'AirPlay discovery unavailable: mDNS advertiser did not start on any LAN interface.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.receiverHandle = null;
      this.raopModule = null;
      this.clearCurrentSession('native module unavailable');
      this.setStatus({
        enabled: false,
        state: 'unavailable',
        nativeAvailable: false,
        error: `AirPlay native backend unavailable: ${message}`,
      });
      this.addDebugEvent('error', message);
    }
  }

  private async refreshNativeAvailability(): Promise<void> {
    if (this.status.enabled || this.status.state === 'starting') {
      return;
    }

    try {
      this.raopModule ??= await this.loadRaopModule();
      if (!this.status.enabled) {
        this.setStatus({
          nativeAvailable: true,
          error: null,
        });
      }
    } catch (error) {
      if (!this.status.enabled) {
        const message = error instanceof Error ? error.message : String(error);
        this.setStatus({
          nativeAvailable: false,
          error: `AirPlay native backend unavailable: ${message}`,
        });
      }
    }
  }

  private async stop(): Promise<void> {
    const hadAirPlayPlayback = Boolean(this.currentSourceId);
    if (hadAirPlayPlayback) {
      await this.stopPlayback().catch(() => undefined);
    } else {
      this.clearCurrentSession('');
    }
    if (this.mdnsAdvertisers.length > 0) {
      const mdnsAdvertisers = this.mdnsAdvertisers;
      this.mdnsAdvertisers = [];
      await Promise.all(
        mdnsAdvertisers.map((mdnsAdvertiser) =>
          mdnsAdvertiser.stop().catch((error) => {
            this.addDebugEvent('mdns', error instanceof Error ? error.message : String(error));
          }),
        ),
      );
    }
    if (this.receiverHandle !== null && this.raopModule) {
      try {
        await this.raopModule.stopReceiver(this.receiverHandle);
      } catch (error) {
        this.addDebugEvent('error', error instanceof Error ? error.message : String(error));
      }
    }
    this.receiverHandle = null;
    this.raopModule = null;
    this.advertisedInterface = null;
    this.setStatus({
      enabled: false,
      state: 'disabled',
      currentClient: null,
      currentSourceId: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      error: null,
    });
  }

  private handleRaopEvent(event: RaopEvent): void {
    const type = trimText(event.type) ?? 'unknown';
    this.addDebugEvent(type, eventAddress(event) ?? '');

    switch (type) {
      case 'stream':
        this.clearHttpPcmReconnectTimer();
        this.prepareIncomingStream(event);
        if (this.useHttpPcmBridge) {
          this.startHttpPcmPlayback(event);
        } else {
          this.addDebugEvent('stream', 'using direct PCM events');
        }
        break;
      case 'metadata':
        this.applyMetadataEvent(event);
        break;
      case 'artwork':
        this.applyArtworkEvent(event);
        break;
      case 'pcm':
        this.handlePcmEvent(event);
        break;
      case 'play':
        this.setPositionAnchor(this.estimatePosition(this.status));
        this.setStatus({ state: 'playing' });
        break;
      case 'pause':
      case 'flush':
        this.setPositionAnchor(this.estimatePosition(this.status));
        this.setStatus({ state: 'paused' });
        if (type === 'flush') {
          this.handleFlushEvent();
        }
        break;
      case 'stop':
        void this.stopPlayback();
        break;
      case 'volume':
        void Promise.resolve(this.audioSession.setOutput({ volume: normalizeVolume(event.value) / 100 })).catch(() => undefined);
        this.setStatus({ volume: normalizeVolume(event.value) });
        break;
      default:
        break;
    }
  }

  private prepareIncomingStream(event: RaopEvent): void {
    this.clearCurrentSession('new AirPlay stream');
    this.ignorePcmUntilNextStream = false;
    this.sessionCounter += 1;
    this.currentSourceId = `airplay-receiver:${this.now().toString(36)}-${this.sessionCounter.toString(36)}`;
    this.pcmStream = new PassThrough({ highWaterMark: airPlayPcmHighWaterMark });
    this.pcmPlaybackStarted = false;
    this.audioSessionClaimedCurrentSource = false;
    this.setPositionAnchor(0);
    const address = eventAddress(event);
    const client: ConnectReceiverClient | null = address
      ? {
          address,
          userAgent: 'AirPlay',
          lastSeenAt: new Date(this.now()).toISOString(),
        }
      : null;
    const metadata = metadataFromEvent(event, this.status.metadata, this.status.artworkUrl);
    this.currentMetadataIdentityKey = metadataIdentityKey(metadata);
    this.setStatus({
      state: 'ready',
      currentClient: client,
      currentSourceId: this.currentSourceId,
      metadata,
      currentLyricLine: null,
      positionSeconds: 0,
      durationSeconds: 0,
      error: null,
    });
  }

  private applyMetadataEvent(event: RaopEvent): void {
    const eventTitle = trimText(event.title);
    const metadata = metadataFromEvent(event, this.status.metadata, this.status.artworkUrl);
    const elapsedMs = Number(event.elapsedMs);
    const nextMetadataIdentityKey = metadataIdentityKey(metadata);
    const metadataChanged = Boolean(nextMetadataIdentityKey && nextMetadataIdentityKey !== this.currentMetadataIdentityKey);
    const nextLyricLine =
      !metadataChanged && shouldKeepCurrentMetadataForLyricLine(eventTitle, this.status.metadata) ? eventTitle : null;
    const nextPositionSeconds =
      Number.isFinite(elapsedMs) && elapsedMs >= 0
        ? elapsedMs / 1000
        : metadataChanged
          ? 0
          : this.estimatePosition(this.status);
    this.currentMetadataIdentityKey = nextMetadataIdentityKey;
    this.setPositionAnchor(nextPositionSeconds, metadata.durationSeconds);
    this.setStatus({
      metadata,
      currentLyricLine: nextLyricLine ?? (metadataChanged ? null : this.status.currentLyricLine),
      durationSeconds: metadata.durationSeconds,
      positionSeconds: nextPositionSeconds,
    });
  }

  private applyArtworkEvent(event: RaopEvent): void {
    const data = Buffer.isBuffer(event.data) ? event.data : null;
    if (!data || data.length === 0) {
      return;
    }

    const mimeType = trimText(event.mimeType) ?? trimText(event.contentType) ?? 'image/jpeg';
    const artworkUrl = `data:${mimeType};base64,${data.toString('base64')}`;
    const metadata = metadataFromEvent(event, this.status.metadata, artworkUrl);
    this.setStatus({
      artworkUrl,
      metadata,
      durationSeconds: metadata.durationSeconds,
    });
  }

  private handlePcmEvent(event: RaopEvent): void {
    if (this.httpPcmRequest || this.httpPcmTransform) {
      if (this.httpPcmBytesReceived > 0) {
        return;
      }
      this.addDebugEvent('pcm', 'fallback to direct PCM events before HTTP audio arrived');
      this.destroyHttpPcmPlayback();
      this.pcmStream = null;
      this.pcmPlaybackStarted = false;
    }

    const data = Buffer.isBuffer(event.data) ? event.data : null;
    if (!data || data.length < 2) {
      return;
    }

    if (this.ignorePcmUntilNextStream && !this.currentSourceId) {
      return;
    }

    if (!this.currentSourceId || !this.pcmStream) {
      this.prepareIncomingStream(event);
    }

    if (!this.currentSourceId || !this.pcmStream) {
      return;
    }

    if (!this.pcmPlaybackStarted) {
      this.pcmPlaybackStarted = true;
      const stream = this.pcmStream;
      const sampleRate = Number(event.sampleRate) || defaultSampleRate;
      const channels = Number(event.channels) || defaultChannels;
      void this.audioSession
        .playPcmStream({
          stream,
          sourceId: this.currentSourceId,
          trackId: this.currentSourceId,
          sampleRate,
          channels,
          durationSeconds: this.status.durationSeconds,
          output: createAirPlayOutputSettings(),
        })
        .then(() => this.setStatus({ state: 'playing', error: null }))
        .catch((error) => {
          this.setStatus({
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    const converted = convertS16leToF32le(data);
    if (!this.pcmStream.write(converted)) {
      this.addDebugEvent('pcm', 'backpressure');
    }
  }

  private startHttpPcmPlayback(event: RaopEvent): void {
    const port = Number(event.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      this.addDebugEvent('stream', `invalid PCM HTTP port: ${String(event.port)}`);
      return;
    }

    if (!this.currentSourceId) {
      this.prepareIncomingStream(event);
    }

    if (!this.currentSourceId) {
      return;
    }

    this.destroyHttpPcmPlayback();
    const sourceId = this.currentSourceId;
    const stream = this.createHttpPcmTransform();
    this.pcmStream = stream;
    this.pcmPlaybackStarted = true;
    this.httpPcmBytesReceived = 0;
    this.lastHttpPcmPort = port;
    // The RAOP helper exposes PCM HTTP as a local bridge for this process; using
    // loopback avoids Windows adapter/firewall hairpin failures on LAN addresses.
    const host = '127.0.0.1';

    this.setStatus({ state: 'ready', error: null });
    this.addDebugEvent('stream', `pull PCM from http://${host}:${port}/`);
    this.httpPcmFallbackTimer = setTimeout(() => {
      if (this.currentSourceId !== sourceId || this.httpPcmBytesReceived > 0) {
        return;
      }
      this.enableDirectPcmFallback(sourceId, 'HTTP PCM produced no audio');
    }, airPlayHttpPcmFallbackMs);

    const request = httpRequest(
      {
        host,
        port,
        path: '/',
        method: 'GET',
        headers: {
          Connection: 'close',
        },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          this.setStatus({ state: 'error', error: `AirPlay PCM HTTP ${response.statusCode}` });
          response.resume();
          return;
        }
        response.on('error', (error) => {
          if (this.intentionalHttpPcmRequestCloses.has(request)) {
            stream.destroy();
            return;
          }
          this.addDebugEvent('stream', error.message);
          stream.destroy(error);
        });
        response.pipe(stream);
      },
    );

    request.on('socket', (socket) => {
      socket.setNoDelay(true);
    });
    request.once('error', (error) => {
      if (this.intentionalHttpPcmRequestCloses.has(request)) {
        stream.destroy();
        return;
      }
      if (this.currentSourceId === sourceId) {
        this.enableDirectPcmFallback(sourceId, `AirPlay PCM HTTP failed: ${error.message}`);
      }
      stream.destroy(error);
    });
    request.once('close', () => {
      this.intentionalHttpPcmRequestCloses.delete(request);
      if (this.httpPcmRequest === request) {
        this.httpPcmRequest = null;
      }
    });
    this.httpPcmRequest = request;
    request.end();

    void this.audioSession
      .playPcmStream({
        stream,
        sourceId,
        trackId: sourceId,
        sampleRate: defaultSampleRate,
        channels: defaultChannels,
        durationSeconds: this.status.durationSeconds,
        output: createAirPlayOutputSettings(),
      })
      .then(() => {
        if (this.currentSourceId === sourceId) {
          this.setStatus({ state: 'playing', error: null });
        }
      })
      .catch((error) => {
        if (this.currentSourceId === sourceId) {
          this.setStatus({
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }

  private createHttpPcmTransform(): Transform {
    let carry: Buffer | null = null;
    const transform = new Transform({
      highWaterMark: airPlayPcmHighWaterMark,
      transform: (chunk: Buffer, _encoding, callback) => {
        const input = carry ? Buffer.concat([carry, chunk]) : chunk;
        const evenLength = input.length - (input.length % 2);
        carry = evenLength === input.length ? null : input.subarray(evenLength);
        if (evenLength > 0) {
          const hadAudio = this.httpPcmBytesReceived > 0;
          this.httpPcmBytesReceived += evenLength;
          if (!hadAudio) {
            this.clearHttpPcmFallbackTimer();
            this.addDebugEvent('pcm', 'HTTP PCM started');
          }
          transform.push(convertS16leToF32le(input.subarray(0, evenLength)));
        }
        callback();
      },
      flush: (callback) => {
        carry = null;
        callback();
      },
    });
    this.httpPcmTransform = transform;
    return transform;
  }

  private clearHttpPcmFallbackTimer(): void {
    if (this.httpPcmFallbackTimer) {
      clearTimeout(this.httpPcmFallbackTimer);
      this.httpPcmFallbackTimer = null;
    }
  }

  private clearHttpPcmReconnectTimer(): void {
    if (this.httpPcmReconnectTimer) {
      clearTimeout(this.httpPcmReconnectTimer);
      this.httpPcmReconnectTimer = null;
    }
  }

  private scheduleHttpPcmReconnect(reason: string): void {
    if (!this.useHttpPcmBridge) {
      return;
    }

    const sourceId = this.currentSourceId;
    const port = this.lastHttpPcmPort;
    if (!sourceId || !port) {
      return;
    }

    this.clearHttpPcmReconnectTimer();
    this.destroyHttpPcmPlayback();
    this.pcmStream = null;
    this.pcmPlaybackStarted = false;
    this.addDebugEvent('stream', `restart PCM HTTP after ${reason}`);
    this.httpPcmReconnectTimer = setTimeout(() => {
      this.httpPcmReconnectTimer = null;
      if (this.currentSourceId !== sourceId || this.lastHttpPcmPort !== port) {
        return;
      }
      this.startHttpPcmPlayback({ type: 'stream', port });
    }, airPlayHttpPcmReconnectMs);
  }

  private handleFlushEvent(): void {
    if (this.httpPcmRequest && this.httpPcmTransform && this.httpPcmBytesReceived > 0) {
      this.addDebugEvent('stream', 'keep PCM HTTP alive after flush');
      return;
    }

    this.scheduleHttpPcmReconnect('flush');
  }

  private enableDirectPcmFallback(sourceId: string, reason: string): void {
    if (this.currentSourceId !== sourceId) {
      return;
    }
    this.addDebugEvent('pcm', `${reason}; switching to direct PCM events`);
    this.destroyHttpPcmPlayback();
    this.pcmStream = null;
    this.pcmPlaybackStarted = false;
    void Promise.resolve(this.raopModule?.setPcmForwarding?.(true)).catch((error) => {
      this.addDebugEvent('pcm', error instanceof Error ? error.message : String(error));
    });
  }

  private destroyHttpPcmPlayback(): void {
    this.clearHttpPcmFallbackTimer();
    if (this.httpPcmRequest) {
      this.intentionalHttpPcmRequestCloses.add(this.httpPcmRequest);
      this.httpPcmRequest.destroy();
    }
    this.httpPcmRequest = null;
    if (this.httpPcmTransform) {
      this.httpPcmTransform.destroy();
    }
    this.httpPcmTransform = null;
    this.httpPcmBytesReceived = 0;
  }

  private clearCurrentSession(reason: string): void {
    this.clearHttpPcmReconnectTimer();
    this.destroyHttpPcmPlayback();
    if (this.pcmStream) {
      this.pcmStream.destroy();
    }
    this.pcmStream = null;
    this.lastHttpPcmPort = null;
    this.pcmPlaybackStarted = false;
    this.currentSourceId = null;
    this.audioSessionClaimedCurrentSource = false;
    this.currentMetadataIdentityKey = null;
    this.setPositionAnchor(0);
    if (reason) {
      this.addDebugEvent('clear', reason);
    }
  }

  private sendRemoteCommand(command: 'play' | 'pause' | 'stop'): void {
    if (this.receiverHandle === null || !this.raopModule?.sendRemoteCommand) {
      return;
    }

    try {
      this.raopModule.sendRemoteCommand(this.receiverHandle, command);
    } catch (error) {
      this.addDebugEvent('remote', error instanceof Error ? error.message : String(error));
    }
  }

  private withAudioPosition(status: AirPlayReceiverStatus): AirPlayReceiverStatus {
    const audioStatus = this.audioSession.getStatus();
    if (!this.currentSourceId || audioStatus.currentFilePath !== this.currentSourceId) {
      return {
        ...status,
        positionSeconds: this.estimatePosition(status),
        updatedAt: new Date(this.now()).toISOString(),
      };
    }

    const nextState = airPlayStateFromAudioStatus(audioStatus, status.state);
    return {
      ...status,
      state: nextState,
      positionSeconds: this.estimatePosition({ ...status, state: nextState }),
      durationSeconds: audioStatus.durationSeconds || status.durationSeconds,
      volume: Math.round(audioStatus.volume * 100),
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private readonly handleAudioStatus = (audioStatus: AudioStatus): void => {
    if (!this.currentSourceId) {
      return;
    }

    if (audioStatus.currentFilePath === this.currentSourceId) {
      this.audioSessionClaimedCurrentSource = true;
    }

    if (
      this.audioSessionClaimedCurrentSource &&
      audioStatus.currentFilePath &&
      audioStatus.currentFilePath !== this.currentSourceId &&
      (audioStatus.state === 'loading' || audioStatus.state === 'playing')
    ) {
      this.sendRemoteCommand('stop');
      this.ignorePcmUntilNextStream = true;
      this.clearCurrentSession('local playback took over');
      this.setStatus({
        state: this.status.enabled ? 'idle' : 'disabled',
        currentClient: null,
        currentSourceId: null,
        metadata: null,
        currentLyricLine: null,
        artworkUrl: null,
        positionSeconds: 0,
        durationSeconds: 0,
      });
      return;
    }

    if (audioStatus.currentFilePath !== this.currentSourceId) {
      return;
    }

    const nextState = airPlayStateFromAudioStatus(audioStatus, this.status.state);
    this.setStatus({
      state: nextState,
      positionSeconds: this.estimatePosition({ ...this.status, state: nextState }),
      durationSeconds: audioStatus.durationSeconds || this.status.durationSeconds,
      volume: Math.round(audioStatus.volume * 100),
      error: audioStatus.error ?? this.status.error,
    });
  };

  private setPositionAnchor(positionSeconds: number, durationSeconds = this.status.durationSeconds): void {
    const safePositionSeconds = Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0);
    this.positionAnchorSeconds = durationSeconds > 0 ? Math.min(durationSeconds, safePositionSeconds) : safePositionSeconds;
    this.positionAnchorUpdatedAtMs = this.now();
  }

  private estimatePosition(status: Pick<AirPlayReceiverStatus, 'durationSeconds' | 'state'>): number {
    const durationSeconds = status.durationSeconds > 0 ? status.durationSeconds : Number.POSITIVE_INFINITY;
    const elapsedSeconds = status.state === 'playing' ? Math.max(0, (this.now() - this.positionAnchorUpdatedAtMs) / 1000) : 0;
    return Math.min(durationSeconds, Math.max(0, this.positionAnchorSeconds + elapsedSeconds));
  }

  private setStatus(next: Partial<AirPlayReceiverStatus>): void {
    this.status = {
      ...this.status,
      ...next,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.emit('status', this.getStatus());
  }

  private addDebugEvent(action: string, message: string | null): void {
    const event: ConnectReceiverDebugEvent = {
      id: `${this.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      at: new Date(this.now()).toISOString(),
      remoteAddress: this.status.currentClient?.address ?? null,
      method: 'RAOP',
      path: '/airplay/receiver',
      action,
      statusCode: null,
      message,
    };
    this.status = {
      ...this.status,
      debugEvents: [event, ...this.status.debugEvents].slice(0, debugEventLimit),
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private formatNativeLog(event: unknown): string {
    if (event && typeof event === 'object') {
      const entry = event as { line?: unknown; source?: unknown; level?: unknown };
      return [entry.source, entry.level, entry.line].map((value) => trimText(value)).filter(Boolean).join(' ');
    }
    return String(event ?? '');
  }

  private handleNativeLog(event: unknown): void {
    const message = this.formatNativeLog(event);
    this.addDebugEvent('log', message);
    if (/unknown\/unhandled method POST/iu.test(message)) {
      this.setStatus({
        state: this.status.enabled ? 'error' : this.status.state,
        error: 'AirPlay connection failed: iPhone requested an unsupported AirPlay RTSP POST flow.',
      });
    }
  }
}

let airPlayReceiverService: AirPlayReceiverSpikeService | null = null;

export const getAirPlayReceiverSpikeService = (): AirPlayReceiverSpikeService => {
  airPlayReceiverService ??= new AirPlayReceiverSpikeService();
  return airPlayReceiverService;
};

export const disposeAirPlayReceiverSpikeService = async (): Promise<void> => {
  if (airPlayReceiverService) {
    await airPlayReceiverService.dispose();
    airPlayReceiverService = null;
  }
};
