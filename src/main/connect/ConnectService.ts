import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type {
  ConnectDevice,
  ConnectPlaybackTarget,
  ConnectSessionStatus,
  ConnectStartRequest,
} from '../../shared/types/connect';
import type { HqPlayerConnectionTestResult, HqPlayerRemotePlaybackStatus } from '../../shared/types/hqplayer';
import { hqPlayerConnectDeviceId } from '../../shared/types/connect';
import type { LibraryTrack } from '../../shared/types/library';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, type StreamingProviderName } from '../../shared/types/streaming';
import { defaultHqPlayerSettings } from '../app/appSettings';
import { getAudioSession } from '../audio/AudioSession';
import { getHqPlayerService, type HqPlayerService } from '../integrations/hqplayer/HqPlayerService';
import { getLibraryService } from '../library/LibraryService';
import type { CoverVariant } from '../library/libraryTypes';
import { buildDlnaDidlLite, createConnectMetadata, protocolInfoForMime } from './ConnectMetadata';
import { chooseLocalAddressForRemote, ConnectHttpServer, mimeTypeForAudioPath } from './ConnectHttpServer';
import {
  discoverDlnaDevices,
  pauseDlna,
  playDlna,
  seekDlna,
  setDlnaTransportUri,
  setDlnaVolume,
  stopDlna,
  type DlnaDevice,
} from './DlnaClient';

type ConnectEvents = {
  status: [ConnectSessionStatus];
};

type HqPlayerConnectService = Pick<
  HqPlayerService,
  'getSettings' | 'setSettings' | 'getStatus' | 'testConnection' | 'createPlaybackHandoff' | 'sendLastPlaybackControl'
>;

type PlaybackSource = {
  track: ConnectPlaybackTarget | LibraryTrack | null;
  trackId: string | null;
  filePath: string;
  streamUrl: string;
  mimeType: string;
  sizeBytes: number | null;
  metadata: ConnectSessionStatus['metadata'];
  metadataXml: string;
  durationSeconds: number;
};

const idleStatus = (): ConnectSessionStatus => ({
  deviceId: null,
  protocol: null,
  state: 'idle',
  currentTrackId: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  latencyMs: null,
  error: null,
  updatedAt: new Date().toISOString(),
});

const airPlayPlaceholder: ConnectDevice = {
  id: 'airplay:experimental',
  name: 'AirPlay 实验通道',
  protocol: 'airplay',
  model: 'RAOP / AirPlay 2 metadata gate',
  manufacturer: 'Apple ecosystem',
  address: null,
  capabilities: {
    canPlay: false,
    canPause: false,
    canStop: false,
    canSeek: false,
    canSetVolume: false,
    supportsMetadata: false,
    supportsSetNext: false,
    supportedMimeTypes: [],
    requiresTranscode: false,
  },
  state: 'unsupported',
  lastSeenAt: null,
  unsupportedReason: 'AirPlay 需要先完成标题、艺术家、专辑、封面、时长的同步验收；当前不开放静默音频投送。',
};

const hqPlayerDeviceCapabilities: ConnectDevice['capabilities'] = {
  canPlay: false,
  canPause: false,
  canStop: false,
  canSeek: false,
  canSetVolume: false,
  supportsMetadata: true,
  supportsSetNext: false,
  supportedMimeTypes: [],
  requiresTranscode: false,
};

const hqPlayerReasonText = (reason: string | null | undefined): string =>
  reason ? `HQPlayer ${reason}` : 'HQPlayer 发送失败';

const hqPlayerPlaybackConfirmAttempts = 4;
const hqPlayerPlaybackConfirmDelayMs = 250;
const hqPlayerStatusSyncIntervalMs = 2500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value);

const formatSeekTarget = (positionSeconds: number): string => {
  const safe = Math.max(0, Math.floor(positionSeconds));
  const hours = Math.floor(safe / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((safe % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const toPlaybackTarget = (value: unknown): ConnectPlaybackTarget | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Partial<ConnectPlaybackTarget>;
  if (typeof input.id !== 'string' || typeof input.path !== 'string') {
    return null;
  }

  return {
    id: input.id,
    path: input.path,
    mediaType: input.mediaType === 'remote' || input.mediaType === 'streaming' ? input.mediaType : 'local',
    title: typeof input.title === 'string' ? input.title : '',
    artist: typeof input.artist === 'string' ? input.artist : '',
    album: typeof input.album === 'string' ? input.album : '',
    albumArtist: typeof input.albumArtist === 'string' ? input.albumArtist : '',
    duration: typeof input.duration === 'number' && Number.isFinite(input.duration) ? input.duration : 0,
    codec: typeof input.codec === 'string' ? input.codec : null,
    coverId: typeof input.coverId === 'string' ? input.coverId : null,
    coverThumb: typeof input.coverThumb === 'string' ? input.coverThumb : null,
    sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : null,
  };
};

export const normalizeConnectStartRequest = (value: unknown): ConnectStartRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('connect request must be an object');
  }

  const input = value as Record<string, unknown>;
  if (typeof input.deviceId !== 'string' || !input.deviceId.trim()) {
    throw new Error('deviceId must be a non-empty string');
  }

  const positionSeconds = Number(input.positionSeconds);
  return {
    deviceId: input.deviceId.trim(),
    track: toPlaybackTarget(input.track),
    filePath: typeof input.filePath === 'string' && input.filePath.trim() ? input.filePath.trim() : null,
    positionSeconds: Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : undefined,
  };
};

export class ConnectService extends EventEmitter<ConnectEvents> {
  private readonly httpServer = new ConnectHttpServer();
  private readonly devices = new Map<string, DlnaDevice>();
  private session: ConnectSessionStatus = idleStatus();
  private refreshInFlight: Promise<ConnectDevice[]> | null = null;
  private hqPlayerStatusTimer: ReturnType<typeof setInterval> | null = null;
  private hqPlayerStatusSyncInFlight = false;

  constructor(private readonly hqPlayerService: HqPlayerConnectService = getHqPlayerService()) {
    super();
  }

  listDevices(): ConnectDevice[] {
    return [...Array.from(this.devices.values(), (device) => this.publicDevice(device)), this.hqPlayerDevice(), airPlayPlaceholder];
  }

  getStatus(): ConnectSessionStatus {
    return this.withInterpolatedPosition(this.session);
  }

  async refreshDevices(): Promise<ConnectDevice[]> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const previous = this.session;
    if (previous.state === 'idle' || previous.state === 'error' || previous.state === 'unsupported') {
      this.setSession({ ...previous, state: 'discovering', error: null });
    }

    this.refreshInFlight = discoverDlnaDevices()
      .then((devices) => {
        this.devices.clear();
        for (const device of devices) {
          this.devices.set(device.id, device);
        }
        if (this.session.state === 'discovering') {
          this.setSession(idleStatus());
        }
        return this.listDevices();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.setSession({ ...idleStatus(), state: 'error', error: message });
        return this.listDevices();
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  async connect(request: ConnectStartRequest): Promise<ConnectSessionStatus> {
    if (request.deviceId === hqPlayerConnectDeviceId) {
      return this.connectHqPlayer(request);
    }

    this.stopHqPlayerStatusSync();
    if (request.deviceId === airPlayPlaceholder.id) {
      const status: ConnectSessionStatus = {
        ...idleStatus(),
        deviceId: request.deviceId,
        protocol: 'airplay',
        state: 'unsupported',
        error: airPlayPlaceholder.unsupportedReason,
      };
      this.setSession(status);
      return status;
    }

    const device = this.devices.get(request.deviceId) ?? (await this.refreshAndFindDevice(request.deviceId));
    if (!device) {
      throw new Error('找不到这个 Connect 设备，请刷新后重试。');
    }

    const startedAt = Date.now();
    this.setSession({
      ...this.session,
      deviceId: device.id,
      protocol: 'dlna',
      state: 'connecting',
      error: null,
      updatedAt: new Date().toISOString(),
    });

    try {
      const source = await this.createPlaybackSource(device, request);
      await setDlnaTransportUri(device, source.streamUrl, source.metadataXml);
      if (request.positionSeconds && request.positionSeconds > 0) {
        await seekDlna(device, formatSeekTarget(request.positionSeconds)).catch(() => undefined);
      }
      await playDlna(device);
      const status = getAudioSession().getStatus();
      if (status.state === 'playing' || status.state === 'loading') {
        await getAudioSession().pause().catch(() => undefined);
      }

      this.setSession({
        deviceId: device.id,
        protocol: 'dlna',
        state: 'playing',
        currentTrackId: source.trackId,
        metadata: source.metadata,
        positionSeconds: request.positionSeconds ?? 0,
        durationSeconds: source.durationSeconds,
        latencyMs: Date.now() - startedAt,
        error: null,
        updatedAt: new Date().toISOString(),
      });
      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setSession({
        ...this.session,
        deviceId: device.id,
        protocol: 'dlna',
        state: 'error',
        error: message,
        latencyMs: Date.now() - startedAt,
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  async disconnect(): Promise<ConnectSessionStatus> {
    this.stopHqPlayerStatusSync();
    const activeDevice = this.activeDlnaDevice();
    if (activeDevice) {
      await stopDlna(activeDevice).catch(() => undefined);
    }

    this.setSession(idleStatus());
    return this.session;
  }

  async play(): Promise<ConnectSessionStatus> {
    const device = this.requireActiveDlnaDevice();
    await playDlna(device);
    this.setSession({ ...this.getStatus(), state: 'playing', error: null, updatedAt: new Date().toISOString() });
    return this.getStatus();
  }

  async pause(): Promise<ConnectSessionStatus> {
    const device = this.requireActiveDlnaDevice();
    await pauseDlna(device);
    this.setSession({ ...this.getStatus(), state: 'paused', error: null, updatedAt: new Date().toISOString() });
    return this.getStatus();
  }

  async stop(): Promise<ConnectSessionStatus> {
    const device = this.requireActiveDlnaDevice();
    await stopDlna(device);
    this.setSession({ ...this.getStatus(), state: 'stopped', positionSeconds: 0, error: null, updatedAt: new Date().toISOString() });
    return this.getStatus();
  }

  async seek(positionSeconds: number): Promise<ConnectSessionStatus> {
    const device = this.requireActiveDlnaDevice();
    const safePosition = Math.max(0, positionSeconds);
    await seekDlna(device, formatSeekTarget(safePosition));
    this.setSession({ ...this.session, positionSeconds: safePosition, error: null, updatedAt: new Date().toISOString() });
    return this.getStatus();
  }

  async setVolume(volume: number): Promise<ConnectSessionStatus> {
    const device = this.requireActiveDlnaDevice();
    await setDlnaVolume(device, volume);
    this.setSession({ ...this.getStatus(), error: null, updatedAt: new Date().toISOString() });
    return this.getStatus();
  }

  async dispose(): Promise<void> {
    this.stopHqPlayerStatusSync();
    await this.disconnect().catch(() => undefined);
    await this.httpServer.close();
    this.devices.clear();
  }

  private setSession(status: ConnectSessionStatus): void {
    this.session = { ...status, updatedAt: status.updatedAt || new Date().toISOString() };
    this.emit('status', this.getStatus());
  }

  private publicDevice(device: DlnaDevice): ConnectDevice {
    const { id, name, protocol, model, manufacturer, address, capabilities, state, lastSeenAt, unsupportedReason } = device;
    return { id, name, protocol, model, manufacturer, address, capabilities, state, lastSeenAt, unsupportedReason };
  }

  private hqPlayerDevice(): ConnectDevice {
    const status = this.hqPlayerService.getStatus();
    const controlInfo = status.controlInfo ?? null;
    const isActive = this.session.protocol === 'hqplayer' && this.session.deviceId === hqPlayerConnectDeviceId;
    const model = controlInfo?.product
      ? [controlInfo.product, controlInfo.version].filter(Boolean).join(' ')
      : 'Local Desktop Control';
    const state: ConnectDevice['state'] = isActive && this.session.state !== 'error'
      ? 'connected'
      : status.state === 'checking'
        ? 'connecting'
        : status.state === 'available'
          ? 'available'
          : 'unavailable';
    return {
      id: hqPlayerConnectDeviceId,
      name: 'HQPlayer Desktop',
      protocol: 'hqplayer',
      model,
      manufacturer: 'Signalyst',
      address: `${status.endpoint.host}:${status.endpoint.port ?? defaultHqPlayerSettings.port}`,
      capabilities: hqPlayerDeviceCapabilities,
      state,
      lastSeenAt: controlInfo?.receivedAt ?? status.playbackStatus?.receivedAt ?? status.lastCheckedAt,
      unsupportedReason: status.lastError,
    };
  }

  private async refreshAndFindDevice(deviceId: string): Promise<DlnaDevice | null> {
    await this.refreshDevices();
    return this.devices.get(deviceId) ?? null;
  }

  private activeDlnaDevice(): DlnaDevice | null {
    if (this.session.protocol !== 'dlna' || !this.session.deviceId) {
      return null;
    }

    return this.devices.get(this.session.deviceId) ?? null;
  }

  private requireActiveDlnaDevice(): DlnaDevice {
    const device = this.activeDlnaDevice();
    if (!device) {
      throw new Error('当前没有已连接的 DLNA 设备。');
    }
    return device;
  }

  private withInterpolatedPosition(status: ConnectSessionStatus): ConnectSessionStatus {
    if (status.protocol !== 'dlna' || status.state !== 'playing' || status.durationSeconds <= 0) {
      return status;
    }

    const updatedAtMs = Date.parse(status.updatedAt);
    if (!Number.isFinite(updatedAtMs)) {
      return status;
    }

    const elapsedSeconds = Math.max(0, (Date.now() - updatedAtMs) / 1000);
    return {
      ...status,
      positionSeconds: Math.min(status.durationSeconds, status.positionSeconds + elapsedSeconds),
    };
  }

  private resolveCoverPath(coverId: string | null | undefined): string | null {
    if (!coverId) {
      return null;
    }

    const variants: CoverVariant[] = ['large', 'album', 'thumb'];
    for (const variant of variants) {
      const asset = getLibraryService().resolveCoverAsset(coverId, variant);
      if (asset?.filePath && existsSync(asset.filePath)) {
        return asset.filePath;
      }
    }

    return null;
  }

  private getTrackFromStatus(request: ConnectStartRequest): ConnectPlaybackTarget | LibraryTrack | null {
    if (request.track) {
      return request.track;
    }

    const status = getAudioSession().getStatus();
    if (!status.currentTrackId) {
      return null;
    }

    try {
      return getLibraryService().getTrack(status.currentTrackId);
    } catch {
      return null;
    }
  }

  private getRichTrack(request: ConnectStartRequest): ConnectPlaybackTarget | LibraryTrack | null {
    const track = this.getTrackFromStatus(request);
    if (!track) {
      return null;
    }

    try {
      return getLibraryService().getTrack(track.id) ?? track;
    } catch {
      return track;
    }
  }

  private createHqPlayerPlayableTrack(request: ConnectStartRequest): PlayableTrack {
    const track = this.getRichTrack(request);
    const status = getAudioSession().getStatus();
    const filePath = request.filePath ?? track?.path ?? status.currentFilePath;
    if (!track || !filePath) {
      throw new Error('没有可交给 HQPlayer 的当前音频。请先播放或选中一首歌。');
    }

    const common = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
    };
    const mediaType = track.mediaType ?? 'local';

    if (mediaType === 'remote') {
      const remoteTrack = track as Partial<LibraryTrack>;
      return {
        ...common,
        mediaType: 'remote',
        sourceId: remoteTrack.sourceId ?? null,
        stableKey: remoteTrack.stableKey ?? null,
        remotePath: remoteTrack.remotePath ?? filePath,
      };
    }

    if (mediaType === 'streaming') {
      const streamingTrack = track as Partial<LibraryTrack>;
      const provider = typeof streamingTrack.provider === 'string' && streamingProviderNames.includes(streamingTrack.provider as StreamingProviderName)
        ? streamingTrack.provider as StreamingProviderName
        : null;
      if (!provider || !streamingTrack.providerTrackId || !streamingTrack.stableKey) {
        throw new Error('当前串流曲目缺少 HQPlayer 交接信息。');
      }

      return {
        ...common,
        mediaType: 'streaming',
        provider,
        providerTrackId: streamingTrack.providerTrackId,
        quality: streamingTrack.streamingQuality,
        stableKey: streamingTrack.stableKey,
        playable: true,
        unavailableReason: null,
      };
    }

    return {
      ...common,
      mediaType: 'local',
      path: filePath,
    };
  }

  private mapHqPlayerPlaybackState(status: HqPlayerRemotePlaybackStatus | null | undefined): ConnectSessionStatus['state'] {
    switch (status?.state) {
      case 'playing':
        return 'playing';
      case 'paused':
        return 'paused';
      case 'stopped':
      case 'stop-requested':
        return 'stopped';
      case 'unknown':
      default:
        return this.session.state === 'playing' || this.session.state === 'paused' ? this.session.state : 'ready';
    }
  }

  private createHqPlayerMetadata(item: PlayableTrack): ConnectSessionStatus['metadata'] {
    return {
      title: item.title,
      artist: item.artist,
      album: item.album,
      albumArtist: item.albumArtist ?? null,
      durationSeconds: item.duration ?? 0,
      coverHttpUrl: item.coverThumb ?? '',
    };
  }

  private async waitForHqPlayerPlayback(
    settings: ReturnType<HqPlayerConnectService['getSettings']>,
  ): Promise<HqPlayerConnectionTestResult> {
    let latest: HqPlayerConnectionTestResult | null = null;
    for (let attempt = 0; attempt < hqPlayerPlaybackConfirmAttempts; attempt += 1) {
      latest = await this.hqPlayerService.testConnection(settings);
      if (!latest.ok) {
        throw new Error(latest.error ?? 'HQPlayer 连接失败');
      }

      if (latest.playbackStatus?.state === 'playing') {
        return latest;
      }

      if (attempt < hqPlayerPlaybackConfirmAttempts - 1) {
        await delay(hqPlayerPlaybackConfirmDelayMs);
      }
    }

    const remoteState = latest?.playbackStatus?.state ?? 'no_status';
    throw new Error(`HQPlayer 未确认播放：${remoteState}`);
  }

  private startHqPlayerStatusSync(): void {
    if (this.hqPlayerStatusTimer) {
      return;
    }

    this.hqPlayerStatusTimer = setInterval(() => {
      void this.syncHqPlayerSessionStatus();
    }, hqPlayerStatusSyncIntervalMs);
    (this.hqPlayerStatusTimer as { unref?: () => void }).unref?.();
  }

  private stopHqPlayerStatusSync(): void {
    if (!this.hqPlayerStatusTimer) {
      return;
    }

    clearInterval(this.hqPlayerStatusTimer);
    this.hqPlayerStatusTimer = null;
    this.hqPlayerStatusSyncInFlight = false;
  }

  private async syncHqPlayerSessionStatus(): Promise<void> {
    if (
      this.hqPlayerStatusSyncInFlight ||
      this.session.protocol !== 'hqplayer' ||
      this.session.deviceId !== hqPlayerConnectDeviceId
    ) {
      return;
    }

    this.hqPlayerStatusSyncInFlight = true;
    try {
      const result = await this.hqPlayerService.testConnection();
      if (this.session.protocol !== 'hqplayer' || this.session.deviceId !== hqPlayerConnectDeviceId) {
        return;
      }

      if (!result.ok) {
        this.setSession({
          ...this.session,
          state: 'error',
          error: result.error ?? 'HQPlayer 连接失败',
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      const playbackStatus = result.playbackStatus ?? null;
      if (!playbackStatus) {
        return;
      }

      this.setSession({
        ...this.session,
        state: this.mapHqPlayerPlaybackState(playbackStatus),
        positionSeconds: playbackStatus.positionSeconds ?? this.session.positionSeconds,
        durationSeconds: playbackStatus.durationSeconds ?? this.session.durationSeconds,
        error: null,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.hqPlayerStatusSyncInFlight = false;
    }
  }

  private async connectHqPlayer(request: ConnectStartRequest): Promise<ConnectSessionStatus> {
    const startedAt = Date.now();
    const item = this.createHqPlayerPlayableTrack(request);
    this.stopHqPlayerStatusSync();
    this.setSession({
      ...this.session,
      deviceId: hqPlayerConnectDeviceId,
      protocol: 'hqplayer',
      state: 'connecting',
      error: null,
      updatedAt: new Date().toISOString(),
    });

    try {
      const currentSettings = this.hqPlayerService.getSettings();
      const settings = currentSettings.enabled
        ? currentSettings
        : this.hqPlayerService.setSettings({ ...currentSettings, enabled: true });
      const connection = await this.hqPlayerService.testConnection(settings);
      if (!connection.ok) {
        throw new Error(connection.error ?? 'HQPlayer 连接失败');
      }

      const handoff = await this.hqPlayerService.createPlaybackHandoff({
        item,
        startSeconds: request.positionSeconds ?? 0,
        confirmed: true,
      });
      if (handoff.state !== 'ready' || handoff.control.state !== 'prepared') {
        throw new Error(hqPlayerReasonText(handoff.reason));
      }

      const send = await this.hqPlayerService.sendLastPlaybackControl();
      if (send.state !== 'sent') {
        throw new Error(send.message ?? hqPlayerReasonText(send.reason));
      }

      const confirmed = await this.waitForHqPlayerPlayback(settings);
      const playbackStatus = confirmed.playbackStatus ?? null;
      const audioStatus = getAudioSession().getStatus();
      if (audioStatus.state === 'playing' || audioStatus.state === 'loading') {
        await getAudioSession().pause().catch(() => undefined);
      }

      this.setSession({
        deviceId: hqPlayerConnectDeviceId,
        protocol: 'hqplayer',
        state: 'playing',
        currentTrackId: item.trackId,
        metadata: this.createHqPlayerMetadata(item),
        positionSeconds: playbackStatus?.positionSeconds ?? request.positionSeconds ?? 0,
        durationSeconds: playbackStatus?.durationSeconds ?? item.duration ?? 0,
        latencyMs: Date.now() - startedAt,
        error: null,
        updatedAt: new Date().toISOString(),
      });
      this.startHqPlayerStatusSync();
      return this.getStatus();
    } catch (error) {
      this.stopHqPlayerStatusSync();
      const message = error instanceof Error ? error.message : String(error);
      this.setSession({
        ...this.session,
        deviceId: hqPlayerConnectDeviceId,
        protocol: 'hqplayer',
        state: 'error',
        error: message,
        latencyMs: Date.now() - startedAt,
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private supportsMimeType(device: DlnaDevice, mimeType: string): boolean {
    const supported = device.capabilities.supportedMimeTypes;
    if (supported.length === 0) {
      return true;
    }

    const lower = mimeType.toLowerCase();
    return supported.some((candidate) => {
      const normalized = candidate.toLowerCase();
      return normalized === lower || normalized === '*/*' || (normalized.endsWith('/*') && lower.startsWith(normalized.slice(0, -1)));
    });
  }

  private async createPlaybackSource(device: DlnaDevice, request: ConnectStartRequest): Promise<PlaybackSource> {
    const status = getAudioSession().getStatus();
    const track = this.getTrackFromStatus(request);
    const sourceUrl = track && 'sourceUrl' in track && typeof track.sourceUrl === 'string' ? track.sourceUrl : null;
    const remotePath = track && 'remotePath' in track && typeof track.remotePath === 'string' ? track.remotePath : null;
    const filePath = request.filePath ?? sourceUrl ?? remotePath ?? track?.path ?? status.currentFilePath;

    if (!filePath) {
      throw new Error('没有可投送的当前音频。请先播放或选中一首歌。');
    }

    const host = chooseLocalAddressForRemote(device.address);
    const coverPath = this.resolveCoverPath(track?.coverId ?? null);
    const coverHttpUrl = await this.httpServer.createCoverUrl(coverPath, { host });
    const metadata = createConnectMetadata({ track, status, coverHttpUrl });
    let streamUrl = filePath;
    let mimeType = mimeTypeForAudioPath(filePath);
    let sizeBytes: number | null = null;

    if (!isHttpUrl(filePath)) {
      if (!existsSync(filePath)) {
        throw new Error(`投送文件不存在：${filePath}`);
      }

      if (this.supportsMimeType(device, mimeType)) {
        const direct = await this.httpServer.createAudioUrl(filePath, { host });
        streamUrl = direct.url;
        mimeType = direct.mimeType;
        sizeBytes = direct.sizeBytes;
      } else {
        const transcoded = await this.httpServer.createTranscodeUrl(filePath, { host });
        streamUrl = transcoded.url;
        mimeType = transcoded.mimeType;
        sizeBytes = transcoded.sizeBytes;
      }
    }

    const metadataXml = buildDlnaDidlLite({
      id: track?.id ?? status.currentTrackId ?? filePath,
      streamUrl,
      metadata,
      mimeType,
      sizeBytes,
    });

    if (!metadata.title || !metadata.artist || !metadata.coverHttpUrl || protocolInfoForMime(mimeType).length === 0) {
      throw new Error('Connect 元数据不完整，已阻止投送。');
    }

    this.setSession({
      ...this.session,
      currentTrackId: track?.id ?? status.currentTrackId ?? null,
      metadata,
      durationSeconds: metadata.durationSeconds,
      positionSeconds: request.positionSeconds ?? Math.max(0, status.positionSeconds || 0),
      error: null,
      updatedAt: new Date().toISOString(),
    });

    return {
      track,
      trackId: track?.id ?? status.currentTrackId ?? null,
      filePath,
      streamUrl,
      mimeType,
      sizeBytes,
      metadata,
      metadataXml,
      durationSeconds: metadata.durationSeconds,
    };
  }
}

let service: ConnectService | null = null;

export const getConnectService = (): ConnectService => {
  service ??= new ConnectService();
  return service;
};

export const disposeConnectService = async (): Promise<void> => {
  await service?.dispose();
  service = null;
};
