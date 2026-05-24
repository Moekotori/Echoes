import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cable,
  Cast,
  Loader2,
  Pause,
  Play,
  Power,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Smartphone,
  Square,
  Unplug,
  Volume2,
  Wifi,
} from 'lucide-react';
import type { AppSettings } from '../../shared/types/appSettings';
import type { AirPlayReceiverStatus, ConnectDevice, ConnectReceiverStatus, ConnectSessionStatus } from '../../shared/types/connect';
import type {
  HqPlayerConnectionMode,
  HqPlayerConnectionTestResult,
  HqPlayerDefaultPlaybackBackend,
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackControlSendReason,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerPlaybackHandoffReason,
  HqPlayerRemotePlaybackStatus,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../shared/types/hqplayer';
import type { LibraryTrack } from '../../shared/types/library';
import type { PlayableTrack } from '../../shared/types/remoteSources';
import { streamingProviderNames, type StreamingProviderName } from '../../shared/types/streaming';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useSharedPlaybackStatus } from '../stores/playbackStatusStore';

const defaultStatus: ConnectSessionStatus = {
  deviceId: null,
  protocol: null,
  state: 'idle',
  currentTrackId: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  latencyMs: null,
  error: null,
  updatedAt: new Date(0).toISOString(),
};

const defaultReceiverStatus: ConnectReceiverStatus = {
  enabled: false,
  state: 'disabled',
  advertisedName: 'ECHO Next',
  addresses: [],
  currentClient: null,
  currentUri: null,
  metadata: null,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 100,
  error: null,
  debugEvents: [],
  updatedAt: new Date(0).toISOString(),
};

const defaultAirPlayReceiverStatus: AirPlayReceiverStatus = {
  enabled: false,
  state: 'disabled',
  advertisedName: 'ECHO Next (AirPlay)',
  nativeAvailable: false,
  currentSourceId: null,
  currentClient: null,
  metadata: null,
  currentLyricLine: null,
  artworkUrl: null,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 100,
  error: null,
  debugEvents: [],
  updatedAt: new Date(0).toISOString(),
};

const stateLabel: Record<ConnectSessionStatus['state'], string> = {
  idle: '待机',
  discovering: '扫描设备',
  connecting: '连接中',
  ready: '就绪',
  playing: '投送中',
  paused: '已暂停',
  stopped: '已停止',
  error: '错误',
  unsupported: '暂不可用',
};

const deviceStateLabel: Record<ConnectDevice['state'], string> = {
  available: '可用',
  connecting: '连接中',
  connected: '已连接',
  unavailable: '离线',
  unsupported: '实验',
};

const receiverStateLabel: Record<ConnectReceiverStatus['state'], string> = {
  disabled: '未开启',
  idle: '等待手机',
  ready: '已接收媒体',
  loading: '加载中',
  playing: '手机投送中',
  paused: '已暂停',
  stopped: '已停止',
  error: '错误',
};

const airPlayStateLabel: Record<AirPlayReceiverStatus['state'], string> = {
  disabled: '未开启',
  unavailable: '原生后端不可用',
  idle: '等待 iPhone',
  starting: '启动中',
  ready: '已连接',
  playing: 'AirPlay 播放中',
  paused: '已暂停',
  stopped: '已停止',
  error: '错误',
};

const defaultHqPlayerSettings: HqPlayerSettings = {
  enabled: false,
  connectionMode: 'localDesktop',
  host: '127.0.0.1',
  port: 4321,
  executablePath: null,
  allowLaunch: false,
  mediaServerEnabled: false,
  mediaServerPort: null,
  defaultPlaybackBackend: 'ask',
  profileName: null,
};

const hqPlayerLocalHost = '127.0.0.1';
const hqPlayerDefaultPort = 4321;

const hqPlayerConnectionModes: HqPlayerConnectionMode[] = ['localDesktop', 'remote'];
const hqPlayerDefaultBackends: HqPlayerDefaultPlaybackBackend[] = ['echoNative', 'ask', 'hqplayer'];

const hqPlayerStateLabel: Record<HqPlayerStatus['state'], string> = {
  disabled: '未启用',
  'not-configured': '未配置端口',
  checking: '检测中',
  available: '可连接',
  unavailable: '不可用',
};

const hqPlayerModeLabel: Record<HqPlayerConnectionMode, string> = {
  localDesktop: '本机 Desktop',
  remote: '远程 HQPlayer',
};

const hqPlayerBackendLabel: Record<HqPlayerDefaultPlaybackBackend, string> = {
  echoNative: '继续用 ECHO',
  ask: '每次询问',
  hqplayer: '优先 HQPlayer',
};

const hqPlayerHandoffReasonLabel: Record<HqPlayerPlaybackHandoffReason, string> = {
  hqplayer_disabled: 'HQPlayer 未启用',
  hqplayer_control_port_not_configured: '控制端口未配置',
  hqplayer_confirmation_required: '需要确认',
  echo_native_selected: '当前选择 ECHO 输出',
  remote_hqplayer_requires_media_server: '远程模式需要媒体服务',
  media_server_not_ready: '媒体服务未就绪',
  spotify_sdk_required: 'Spotify 需要 SDK 播放',
  streaming_item_unplayable: '串流曲目不可播放',
  streaming_proxy_required: '需要代理播放',
  source_requires_headers: '音源需要请求头',
  source_resolution_failed: '音源解析失败',
  unsupported_media_type: '暂不支持的媒体类型',
};

const hqPlayerSendReasonLabel: Record<HqPlayerPlaybackControlSendReason, string> = {
  control_plan_missing: '还没有可发送的交接计划',
  handoff_not_ready: '交接未就绪',
  source_missing: '音源缺失',
  source_requires_headers: '音源需要私密请求头',
  hqplayer_control_port_not_configured: '控制端口未配置',
  hqplayer_connection_timeout: '连接超时',
  hqplayer_connection_refused: '连接被拒绝',
  hqplayer_connection_failed: '连接失败',
  hqplayer_protocol_error: '协议响应异常',
  hqplayer_response_error: 'HQPlayer 返回错误',
};

const hqPlayerExposureLabel: Record<NonNullable<HqPlayerPlaybackControlPlan['source']>['exposure'], string> = {
  'local-file': '本地文件',
  'loopback-http': '本机流地址',
  'direct-http': '直连 HTTP',
  'media-server': 'ECHO 媒体服务',
};

const hqPlayerRemoteStateLabel: Record<HqPlayerRemotePlaybackStatus['state'], string> = {
  stopped: '已停止',
  paused: '已暂停',
  playing: '播放中',
  'stop-requested': '正在停止',
  unknown: '未知',
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const formatProtocol = (device: Pick<ConnectDevice, 'protocol'>): string =>
  device.protocol === 'dlna' ? 'DLNA / UPnP' : device.protocol === 'hqplayer' ? 'HQPlayer' : 'AirPlay';

const formatReceiverAddress = (value: string): string => {
  try {
    const url = new URL(value);
    return `${url.hostname}:${url.port}`;
  } catch {
    return value;
  }
};

const parsePort = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return '未检测';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatHqEndpoint = (settings: Pick<HqPlayerSettings, 'host' | 'port'>): string =>
  settings.port ? `${settings.host}:${settings.port}` : `${settings.host}:未配置`;

const withHqPlayerFriendlyDefaults = (settings: HqPlayerSettings): HqPlayerSettings => {
  const isLocal = settings.connectionMode !== 'remote';
  return {
    ...settings,
    connectionMode: isLocal ? 'localDesktop' : 'remote',
    host: isLocal ? hqPlayerLocalHost : settings.host,
    port: settings.port ?? hqPlayerDefaultPort,
  };
};

const createHqPlayerConnectSettings = (settings: HqPlayerSettings): HqPlayerSettings => ({
  ...withHqPlayerFriendlyDefaults(settings),
  enabled: true,
});

const shouldAutoProbeLocalHqPlayer = (settings: HqPlayerSettings, status: HqPlayerStatus): boolean => {
  const effective = withHqPlayerFriendlyDefaults(settings);
  return (
    settings.enabled &&
    effective.connectionMode === 'localDesktop' &&
    effective.port === hqPlayerDefaultPort &&
    status.state !== 'available' &&
    status.state !== 'checking'
  );
};

const createHqPlayerStatusFromConnectionTest = (
  settings: HqPlayerSettings,
  result: HqPlayerConnectionTestResult,
): HqPlayerStatus => ({
  enabled: settings.enabled,
  state: result.state,
  endpoint: result.endpoint,
  mediaServerEnabled: settings.mediaServerEnabled,
  defaultPlaybackBackend: settings.defaultPlaybackBackend,
  profileName: settings.profileName,
  lastCheckedAt: result.checkedAt,
  lastError: result.error,
  controlInfo: result.controlInfo ?? null,
  playbackStatus: result.playbackStatus ?? null,
});

const formatHqPlayerSendMessage = (plan: HqPlayerPlaybackControlPlan | null): string => {
  const send = plan?.send ?? null;
  if (!send) {
    return '未发送';
  }

  if (send.state === 'sent') {
    return `已发送 · ${send.elapsedMs}ms`;
  }

  if (send.state === 'prepared') {
    return '已准备';
  }

  const reason = send.reason ? hqPlayerSendReasonLabel[send.reason] : send.message;
  return `${send.state === 'failed' ? '发送失败' : '未发送'} · ${reason ?? '未知原因'}`;
};

const formatHqPlayerProduct = (
  controlInfo: HqPlayerConnectionTestResult['controlInfo'] | HqPlayerStatus['controlInfo'] | null | undefined,
): string =>
  controlInfo?.product
    ? [controlInfo.product, controlInfo.version].filter(Boolean).join(' ')
    : '待检测';

const formatHqPlayerEngine = (
  controlInfo: HqPlayerConnectionTestResult['controlInfo'] | HqPlayerStatus['controlInfo'] | null | undefined,
): string =>
  controlInfo?.engine ?? controlInfo?.platform ?? '待检测';

const formatHqPlayerRemotePosition = (status: HqPlayerRemotePlaybackStatus | null): string => {
  if (!status) {
    return '待检测';
  }

  const position = status.positionSeconds ?? 0;
  const duration = status.durationSeconds ?? 0;
  return `${hqPlayerRemoteStateLabel[status.state]} · ${formatTime(position)} / ${formatTime(duration)}`;
};

const formatHqPlayerSignal = (status: HqPlayerRemotePlaybackStatus | null): string => {
  if (!status) {
    return '待检测';
  }

  const format = status.activeRate && status.activeBits && status.activeChannels
    ? `${status.activeRate}Hz / ${status.activeBits}bit / ${status.activeChannels}ch`
    : '格式待回读';
  const dsp = [status.activeMode, status.activeFilter, status.activeShaper].filter(Boolean).join(' · ');
  return dsp ? `${format} · ${dsp}` : format;
};

const isStreamingProviderName = (value: string | null | undefined): value is StreamingProviderName =>
  streamingProviderNames.includes(value as StreamingProviderName);

const toHqPlayerPlayableTrack = (track: LibraryTrack | null, fallbackPath: string | null): PlayableTrack | null => {
  if (!track) {
    if (!fallbackPath) {
      return null;
    }

    const title = fallbackPath.split(/[\\/]/u).pop() || 'Local Track';
    return {
      mediaType: 'local',
      trackId: `file:${fallbackPath}`,
      path: fallbackPath,
      title,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: null,
    };
  }

  if (track.mediaType === 'remote') {
    return {
      mediaType: 'remote',
      trackId: track.id,
      sourceId: track.sourceId ?? null,
      stableKey: track.stableKey ?? null,
      remotePath: track.remotePath ?? null,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
    };
  }

  if (track.mediaType === 'streaming') {
    const provider = isStreamingProviderName(track.provider) ? track.provider : 'mock';
    const providerTrackId = track.providerTrackId ?? track.id;
    return {
      mediaType: 'streaming',
      trackId: track.id,
      provider,
      providerTrackId,
      quality: track.streamingQuality,
      stableKey: track.stableKey ?? `${provider}:${providerTrackId}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      coverThumb: track.coverThumb,
      playable: track.unavailable !== true,
      unavailableReason: track.unavailable ? 'This streaming track is unavailable.' : null,
    };
  }

  return {
    mediaType: 'local',
    trackId: track.id,
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    coverThumb: track.coverThumb,
  };
};

export const ConnectPage = (): JSX.Element => {
  const queue = usePlaybackQueue();
  const playbackStatus = useSharedPlaybackStatus();
  const [devices, setDevices] = useState<ConnectDevice[]>([]);
  const [status, setStatus] = useState<ConnectSessionStatus>(defaultStatus);
  const [receiverStatus, setReceiverStatus] = useState<ConnectReceiverStatus>(defaultReceiverStatus);
  const [airPlayReceiverStatus, setAirPlayReceiverStatus] = useState<AirPlayReceiverStatus>(defaultAirPlayReceiverStatus);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReceiverBusy, setIsReceiverBusy] = useState(false);
  const [isAirPlayReceiverBusy, setIsAirPlayReceiverBusy] = useState(false);
  const [isAutoStartBusy, setIsAutoStartBusy] = useState(false);
  const [autoStartReceiversEnabled, setAutoStartReceiversEnabled] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [isCommandBusy, setIsCommandBusy] = useState(false);
  const [volumePercent, setVolumePercent] = useState(80);
  const [hqPlayerDraft, setHqPlayerDraft] = useState<HqPlayerSettings>(defaultHqPlayerSettings);
  const [hqPlayerStatus, setHqPlayerStatus] = useState<HqPlayerStatus | null>(null);
  const [hqPlayerTestResult, setHqPlayerTestResult] = useState<HqPlayerConnectionTestResult | null>(null);
  const [hqPlayerLastHandoff, setHqPlayerLastHandoff] = useState<HqPlayerPlaybackHandoffPlan | null>(null);
  const [hqPlayerLastControl, setHqPlayerLastControl] = useState<HqPlayerPlaybackControlPlan | null>(null);
  const [hqPlayerBusy, setHqPlayerBusy] = useState<'test' | null>(null);

  const activeDevice = useMemo(
    () => devices.find((device) => device.id === status.deviceId) ?? null,
    [devices, status.deviceId],
  );
  const currentTrack = queue.currentTrack ?? queue.lastPlayedTrack ?? null;
  const currentFilePath =
    currentTrack?.path ??
    playbackStatus.audioStatus?.currentFilePath ??
    playbackStatus.playbackStatus?.filePath ??
    null;
  const currentPositionSeconds =
    playbackStatus.audioStatus?.positionSeconds ??
    (playbackStatus.playbackStatus?.positionMs ?? 0) / 1000;
  const previewTitle = status.metadata?.title ?? currentTrack?.title ?? (currentFilePath ? currentFilePath.split(/[\\/]/u).pop() : '没有当前歌曲');
  const previewArtist = status.metadata?.artist ?? currentTrack?.artist ?? currentTrack?.albumArtist ?? 'Unknown Artist';
  const previewAlbum = status.metadata?.album ?? currentTrack?.album ?? null;
  const previewCover = status.metadata?.coverHttpUrl ?? currentTrack?.coverThumb ?? null;
  const progressPercent =
    status.durationSeconds > 0 ? Math.min(100, Math.max(0, (status.positionSeconds / status.durationSeconds) * 100)) : 0;
  const receiverTitle =
    receiverStatus.metadata?.title ??
    (receiverStatus.currentUri ? receiverStatus.currentUri.split(/[?#]/u)[0]?.split(/[\\/]/u).pop() : null) ??
    '等待手机投送';
  const receiverArtist = receiverStatus.metadata?.artist ?? 'Unknown Artist';
  const receiverAlbum = receiverStatus.metadata?.album ?? null;
  const receiverCover = receiverStatus.metadata?.coverHttpUrl || null;
  const receiverProgressPercent =
    receiverStatus.durationSeconds > 0
      ? Math.min(100, Math.max(0, (receiverStatus.positionSeconds / receiverStatus.durationSeconds) * 100))
      : 0;
  const airPlayTitle = airPlayReceiverStatus.metadata?.title ?? '等待 iPhone 投送';
  const airPlayArtist = airPlayReceiverStatus.metadata?.artist ?? 'Unknown Artist';
  const airPlayAlbum = airPlayReceiverStatus.metadata?.album ?? null;
  const airPlayCover = airPlayReceiverStatus.artworkUrl || airPlayReceiverStatus.metadata?.coverHttpUrl || null;
  const airPlayProgressPercent =
    airPlayReceiverStatus.durationSeconds > 0
      ? Math.min(100, Math.max(0, (airPlayReceiverStatus.positionSeconds / airPlayReceiverStatus.durationSeconds) * 100))
      : 0;
  const hqPlayerEffectiveDraft = useMemo(
    () => withHqPlayerFriendlyDefaults(hqPlayerDraft),
    [hqPlayerDraft],
  );
  const hqPlayerState: HqPlayerStatus['state'] =
    hqPlayerStatus?.state ?? (hqPlayerDraft.enabled ? (hqPlayerEffectiveDraft.port ? 'unavailable' : 'not-configured') : 'disabled');
  const hqPlayerEndpointLabel = formatHqEndpoint({
    host: hqPlayerStatus?.endpoint.host ?? hqPlayerEffectiveDraft.host,
    port: hqPlayerStatus?.endpoint.port ?? hqPlayerEffectiveDraft.port,
  });
  const hqPlayerControlPlan = hqPlayerLastControl ?? hqPlayerLastHandoff?.control ?? null;
  const hqPlayerLastReason = hqPlayerLastHandoff?.reason ? hqPlayerHandoffReasonLabel[hqPlayerLastHandoff.reason] : null;
  const hqPlayerCurrentPlayable = useMemo(
    () => toHqPlayerPlayableTrack(currentTrack, currentFilePath),
    [currentFilePath, currentTrack],
  );
  const hqPlayerSendMessage = formatHqPlayerSendMessage(hqPlayerControlPlan);
  const hqPlayerControlInfo = hqPlayerTestResult?.controlInfo ?? hqPlayerStatus?.controlInfo ?? null;
  const hqPlayerPlaybackStatus = hqPlayerTestResult?.playbackStatus ?? hqPlayerStatus?.playbackStatus ?? null;
  const hqPlayerProductLabel = formatHqPlayerProduct(hqPlayerControlInfo);
  const hqPlayerEngineLabel = formatHqPlayerEngine(hqPlayerControlInfo);
  const hqPlayerRemotePositionLabel = formatHqPlayerRemotePosition(hqPlayerPlaybackStatus);
  const hqPlayerSignalLabel = formatHqPlayerSignal(hqPlayerPlaybackStatus);
  const hqPlayerMediaServerLabel = hqPlayerLastHandoff?.source?.mediaServer
    ? `${hqPlayerLastHandoff.source.mediaServer.publicHost ?? 'unknown'}:${hqPlayerLastHandoff.source.mediaServer.port ?? 'auto'}`
    : null;
  const activeDeviceCapabilities = activeDevice?.capabilities ?? null;

  const refreshDevices = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端使用 Connect。');
      return;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      setDevices(await connect.refresh());
      setStatus(await connect.getStatus());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const refreshHqPlayer = useCallback(async (): Promise<void> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      return;
    }

    try {
      const [settings, nextStatus, lastHandoff, lastControl] = await Promise.all([
        hqPlayer.getSettings(),
        hqPlayer.getStatus(),
        hqPlayer.getLastPlaybackHandoff(),
        hqPlayer.getLastPlaybackControl(),
      ]);
      const effectiveSettings = withHqPlayerFriendlyDefaults(settings);
      let displayStatus = nextStatus;
      if (shouldAutoProbeLocalHqPlayer(effectiveSettings, nextStatus)) {
        const result = await hqPlayer.testConnection(effectiveSettings);
        displayStatus = createHqPlayerStatusFromConnectionTest(effectiveSettings, result);
        setHqPlayerTestResult(result);
        const nextDevices = await window.echo?.connect?.listDevices?.();
        if (nextDevices) {
          setDevices(nextDevices);
        }
      }

      setHqPlayerDraft(effectiveSettings);
      setHqPlayerStatus(displayStatus);
      setHqPlayerLastHandoff(lastHandoff);
      setHqPlayerLastControl(lastControl);
    } catch {
      // Keep Connect usable when running against an older preload bridge.
    }
  }, []);

  useEffect(() => {
    const connect = window.echo?.connect;
    if (!connect) {
      return;
    }

    let disposed = false;
    void connect
      .listDevices()
      .then((items) => {
        if (!disposed) {
          setDevices(items);
        }
      })
      .catch(() => undefined);
    void connect
      .getStatus()
      .then((nextStatus) => {
        if (!disposed) {
          setStatus(nextStatus);
        }
      })
      .catch(() => undefined);
    if (connect.getReceiverStatus) {
      void connect.getReceiverStatus().then((nextStatus) => {
        if (!disposed) {
          setReceiverStatus(nextStatus);
        }
      }).catch(() => undefined);
    }
    if (connect.getAirPlayReceiverStatus) {
      void connect.getAirPlayReceiverStatus().then((nextStatus) => {
        if (!disposed) {
          setAirPlayReceiverStatus(nextStatus);
        }
      }).catch(() => undefined);
    }
    void window.echo?.app?.getSettings?.().then((settings: AppSettings) => {
      if (!disposed) {
        setAutoStartReceiversEnabled(settings.connectAutoStartReceiversEnabled === true);
      }
    }).catch(() => undefined);
    void refreshDevices();
    void refreshHqPlayer();
    const unsubscribe = connect.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    });
    const unsubscribeReceiver = connect.onReceiverStatus?.((nextStatus) => {
      setReceiverStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    }) ?? (() => undefined);
    const unsubscribeAirPlayReceiver = connect.onAirPlayReceiverStatus?.((nextStatus) => {
      setAirPlayReceiverStatus(nextStatus);
      if (nextStatus.error) {
        setError(nextStatus.error);
      }
    }) ?? (() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeReceiver();
      unsubscribeAirPlayReceiver();
    };
  }, [refreshDevices, refreshHqPlayer]);

  const toggleAutoStartReceivers = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    if (!app?.setSettings) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端保存 Connect 设置。');
      return;
    }

    const connectAutoStartReceiversEnabled = !autoStartReceiversEnabled;
    setIsAutoStartBusy(true);
    setError(null);
    try {
      const settings = await app.setSettings({ connectAutoStartReceiversEnabled });
      setAutoStartReceiversEnabled(settings.connectAutoStartReceiversEnabled === true);
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { connectAutoStartReceiversEnabled } }));
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setIsAutoStartBusy(false);
    }
  }, [autoStartReceiversEnabled]);

  const patchHqPlayerDraft = useCallback((patch: Partial<HqPlayerSettings>): void => {
    setHqPlayerDraft((current) => withHqPlayerFriendlyDefaults({ ...current, ...patch }));
    setHqPlayerTestResult(null);
  }, []);

  const saveHqPlayerSettings = useCallback(async (settings: HqPlayerSettings = hqPlayerEffectiveDraft): Promise<HqPlayerSettings | null> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端配置 HQPlayer。');
      return null;
    }

    const saved = await hqPlayer.setSettings(withHqPlayerFriendlyDefaults(settings));
    setHqPlayerDraft(withHqPlayerFriendlyDefaults(saved));
    setHqPlayerStatus(await hqPlayer.getStatus());
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: { hqPlayer: saved } }));
    return saved;
  }, [hqPlayerEffectiveDraft]);

  const handleHqPlayerTestConnection = useCallback(async (): Promise<void> => {
    const hqPlayer = window.echo?.hqPlayer;
    if (!hqPlayer) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端测试 HQPlayer。');
      return;
    }

    setHqPlayerBusy('test');
    setError(null);
    try {
      const saved = await saveHqPlayerSettings(createHqPlayerConnectSettings(hqPlayerEffectiveDraft));
      if (!saved) {
        return;
      }
      const result = await hqPlayer.testConnection(saved);
      setHqPlayerTestResult(result);
      setHqPlayerStatus(await hqPlayer.getStatus());
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setHqPlayerBusy(null);
    }
  }, [hqPlayerEffectiveDraft, saveHqPlayerSettings]);

  const toggleReceiver = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setReceiverEnabled) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端使用 Connect。');
      return;
    }

    setIsReceiverBusy(true);
    setError(null);
    try {
      setReceiverStatus(await connect.setReceiverEnabled(!receiverStatus.enabled));
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsReceiverBusy(false);
    }
  }, [receiverStatus.enabled]);

  const stopReceiverPlayback = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    setIsReceiverBusy(true);
    setError(null);
    try {
      if (connect?.stopReceiverPlayback) {
        setReceiverStatus(await connect.stopReceiverPlayback());
      } else {
        await window.echo?.playback.stop();
        if (connect?.getReceiverStatus) {
          setReceiverStatus(await connect.getReceiverStatus());
        }
      }
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsReceiverBusy(false);
    }
  }, []);

  const toggleAirPlayReceiver = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.setAirPlayReceiverEnabled) {
      setError('AirPlay receiver bridge unavailable.');
      return;
    }

    setIsAirPlayReceiverBusy(true);
    setError(null);
    try {
      setAirPlayReceiverStatus(await connect.setAirPlayReceiverEnabled(!airPlayReceiverStatus.enabled));
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsAirPlayReceiverBusy(false);
    }
  }, [airPlayReceiverStatus.enabled]);

  const stopAirPlayReceiverPlayback = useCallback(async (): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect?.stopAirPlayReceiverPlayback) {
      setError('AirPlay receiver bridge unavailable.');
      return;
    }

    setIsAirPlayReceiverBusy(true);
    setError(null);
    try {
      setAirPlayReceiverStatus(await connect.stopAirPlayReceiverPlayback());
    } catch (receiverError) {
      setError(receiverError instanceof Error ? receiverError.message : String(receiverError));
    } finally {
      setIsAirPlayReceiverBusy(false);
    }
  }, []);

  const connectDevice = useCallback(
    async (device: ConnectDevice): Promise<void> => {
      const connect = window.echo?.connect;
      if (!connect) {
        setError('Desktop bridge unavailable. 请在 Electron 桌面端使用 Connect。');
        return;
      }

      if (!currentTrack && !currentFilePath) {
        setError('请先播放或选中一首歌，Connect 不允许空元数据投送。');
        return;
      }

      setBusyDeviceId(device.id);
      setError(null);
      try {
        const nextStatus = await connect.connect({
          deviceId: device.id,
          track: currentTrack,
          filePath: currentFilePath,
          positionSeconds: currentPositionSeconds,
        });
        setStatus(nextStatus);
      } catch (connectError) {
        setError(connectError instanceof Error ? connectError.message : String(connectError));
      } finally {
        setBusyDeviceId(null);
      }
    },
    [currentFilePath, currentPositionSeconds, currentTrack],
  );

  const runCommand = useCallback(async (command: 'play' | 'pause' | 'stop' | 'disconnect'): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      setError('Desktop bridge unavailable. 请在 Electron 桌面端使用 Connect。');
      return;
    }

    setIsCommandBusy(true);
    setError(null);
    try {
      const nextStatus = await connect[command]();
      setStatus(nextStatus);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    } finally {
      setIsCommandBusy(false);
    }
  }, []);

  const commitVolume = useCallback(async (nextVolume: number): Promise<void> => {
    const connect = window.echo?.connect;
    if (!connect) {
      return;
    }

    setVolumePercent(nextVolume);
    try {
      setStatus(await connect.setVolume(nextVolume));
    } catch (volumeError) {
      setError(volumeError instanceof Error ? volumeError.message : String(volumeError));
    }
  }, []);

  return (
    <div className="connect-page">
      <header className="connect-header">
        <div>
          <p className="section-kicker">Wireless Playback</p>
          <h1>Connect</h1>
          <p>DLNA / AirPlay / HQPlayer 外部播放集中管理；HQPlayer 当前以安全交接预演为主。</p>
        </div>
        <div className="connect-header-actions">
          <div className="settings-inline-toggle connect-autostart-toggle">
            <span>启动时自动开启 AirPlay / DLNA</span>
            <button
              aria-label="启动时自动开启 AirPlay / DLNA"
              aria-pressed={autoStartReceiversEnabled}
              className={`toggle-btn ${autoStartReceiversEnabled ? 'active' : ''}`}
              disabled={isAutoStartBusy}
              type="button"
              onClick={() => void toggleAutoStartReceivers()}
            >
              <span />
            </button>
          </div>
          <button className="settings-action-button" type="button" onClick={() => void refreshDevices()} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="spinning-icon" size={16} /> : <RefreshCw size={16} />}
            刷新设备
          </button>
        </div>
      </header>

      {error ? (
        <div className="connect-alert" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="connect-hqplayer-panel" aria-label="HQPlayer Connect">
        <div className="connect-hqplayer-header">
          <div className="connect-hqplayer-title">
            <div className="connect-hqplayer-icon">
              <Cable size={24} />
            </div>
            <div>
              <span>External Renderer</span>
              <h2>HQPlayer</h2>
            </div>
          </div>
          <div className="connect-hqplayer-actions">
            <span className="connect-hqplayer-state" data-state={hqPlayerState}>{hqPlayerStateLabel[hqPlayerState]}</span>
            <button
              className="settings-action-button"
              type="button"
              disabled={hqPlayerBusy === 'test'}
              onClick={() => void handleHqPlayerTestConnection()}
            >
              <RefreshCw className={hqPlayerBusy === 'test' ? 'spinning-icon' : undefined} size={15} />
              检测 HQPlayer
            </button>
          </div>
        </div>

        <div className="connect-hqplayer-layout">
          <div className="connect-hqplayer-config">
            <div className="connect-hqplayer-local-card">
              <strong>本机 HQPlayer Desktop</strong>
              <span>{formatHqEndpoint({ host: hqPlayerLocalHost, port: hqPlayerDefaultPort })}</span>
            </div>
            <div className="connect-hqplayer-toggle-row">
              <div className="settings-inline-toggle">
                <span>启用 HQPlayer</span>
                <button
                  aria-label="启用 HQPlayer"
                  aria-pressed={hqPlayerDraft.enabled}
                  className={`toggle-btn ${hqPlayerDraft.enabled ? 'active' : ''}`}
                  type="button"
                  onClick={() => patchHqPlayerDraft(
                    hqPlayerDraft.enabled ? { enabled: false } : createHqPlayerConnectSettings(hqPlayerEffectiveDraft),
                  )}
                >
                  <span />
                </button>
              </div>
              <div className="settings-inline-toggle">
                <span>串流保护</span>
                <button
                  aria-label="HQPlayer 媒体服务"
                  aria-pressed={hqPlayerDraft.mediaServerEnabled}
                  className={`toggle-btn ${hqPlayerDraft.mediaServerEnabled ? 'active' : ''}`}
                  type="button"
                  onClick={() => patchHqPlayerDraft({ mediaServerEnabled: !hqPlayerDraft.mediaServerEnabled })}
                >
                  <span />
                </button>
              </div>
            </div>

            <details className="connect-hqplayer-advanced">
              <summary>高级设置</summary>
              <div className="connect-hqplayer-segments" aria-label="HQPlayer 连接模式">
                {hqPlayerConnectionModes.map((mode) => (
                  <button
                    className="connect-hqplayer-chip"
                    data-active={hqPlayerEffectiveDraft.connectionMode === mode ? 'true' : undefined}
                    key={mode}
                    type="button"
                    onClick={() => patchHqPlayerDraft({
                      connectionMode: mode,
                      host: mode === 'localDesktop' ? hqPlayerLocalHost : hqPlayerDraft.host,
                      port: hqPlayerEffectiveDraft.port,
                    })}
                  >
                    {hqPlayerModeLabel[mode]}
                  </button>
                ))}
              </div>

              <div className="connect-hqplayer-segments" aria-label="HQPlayer 默认交接">
                {hqPlayerDefaultBackends.map((backend) => (
                  <button
                    className="connect-hqplayer-chip"
                    data-active={hqPlayerEffectiveDraft.defaultPlaybackBackend === backend ? 'true' : undefined}
                    key={backend}
                    type="button"
                    onClick={() => patchHqPlayerDraft({ defaultPlaybackBackend: backend })}
                  >
                    {hqPlayerBackendLabel[backend]}
                  </button>
                ))}
              </div>

              <div className="connect-hqplayer-fields">
                <label className="connect-hqplayer-field">
                  <span>Host</span>
                  <input
                    type="text"
                    value={hqPlayerEffectiveDraft.host}
                    onChange={(event) => patchHqPlayerDraft({ host: event.currentTarget.value })}
                  />
                </label>
                <label className="connect-hqplayer-field">
                  <span>控制端口</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={hqPlayerEffectiveDraft.port ?? ''}
                    onChange={(event) => patchHqPlayerDraft({ port: parsePort(event.currentTarget.value) })}
                  />
                </label>
                <label className="connect-hqplayer-field">
                  <span>媒体端口</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={hqPlayerDraft.mediaServerPort ?? ''}
                    onChange={(event) => patchHqPlayerDraft({ mediaServerPort: parsePort(event.currentTarget.value) })}
                  />
                </label>
                <label className="connect-hqplayer-field connect-hqplayer-field--wide">
                  <span>Profile</span>
                  <input
                    type="text"
                    value={hqPlayerDraft.profileName ?? ''}
                    onChange={(event) => patchHqPlayerDraft({ profileName: event.currentTarget.value.trim() || null })}
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="connect-hqplayer-status-grid">
            <span>
              <em>控制端点</em>
              <strong>{hqPlayerEndpointLabel}</strong>
            </span>
            <span>
              <em>默认交接</em>
              <strong>{hqPlayerBackendLabel[hqPlayerEffectiveDraft.defaultPlaybackBackend]}</strong>
            </span>
            <span>
              <em>串流保护</em>
              <strong>{hqPlayerDraft.mediaServerEnabled ? (hqPlayerDraft.mediaServerPort ? `ECHO:${hqPlayerDraft.mediaServerPort}` : '自动端口') : '关闭'}</strong>
            </span>
            <span>
              <em>上次检测</em>
              <strong>{formatTimestamp(hqPlayerStatus?.lastCheckedAt ?? null)}</strong>
            </span>
            {hqPlayerTestResult ? (
              <span className={hqPlayerTestResult.ok ? 'is-ok' : 'is-error'}>
                <em>检测结果</em>
                <strong>{hqPlayerTestResult.ok ? `可用 · ${hqPlayerTestResult.elapsedMs}ms` : hqPlayerTestResult.error ?? '不可用'}</strong>
              </span>
            ) : null}
            <span>
              <em>HQPlayer</em>
              <strong>{hqPlayerProductLabel}</strong>
            </span>
            <span>
              <em>Engine</em>
              <strong>{hqPlayerEngineLabel}</strong>
            </span>
            <span>
              <em>远端状态</em>
              <strong>{hqPlayerRemotePositionLabel}</strong>
            </span>
            <span className="connect-hqplayer-status-grid__wide">
              <em>信号路径</em>
              <strong>{hqPlayerSignalLabel}</strong>
            </span>
          </div>

          <div className="connect-hqplayer-plan">
            <div className="connect-hqplayer-plan-header">
              <SlidersHorizontal size={16} />
              <span>最近交接计划</span>
            </div>
            <div className="connect-hqplayer-plan-row">
              <em>Handoff</em>
              <strong>{hqPlayerLastHandoff ? (hqPlayerLastReason ?? hqPlayerLastHandoff.state) : '暂无'}</strong>
            </div>
            <div className="connect-hqplayer-plan-row">
              <em>Control</em>
              <strong>{hqPlayerControlPlan ? `${hqPlayerControlPlan.action} · ${hqPlayerControlPlan.transport}` : '暂无'}</strong>
            </div>
            <div className="connect-hqplayer-plan-row">
              <em>Send</em>
              <strong>{hqPlayerSendMessage}</strong>
            </div>
            <div className="connect-hqplayer-plan-row">
              <em>Source</em>
              <strong>
                {hqPlayerControlPlan?.source
                  ? `${hqPlayerExposureLabel[hqPlayerControlPlan.source.exposure]} · ${hqPlayerControlPlan.source.mimeType ?? 'audio'}`
                  : '暂无'}
              </strong>
            </div>
            {hqPlayerMediaServerLabel ? (
              <div className="connect-hqplayer-plan-row">
                <em>Media URL</em>
                <strong>{hqPlayerMediaServerLabel}</strong>
              </div>
            ) : null}
            <div className="connect-hqplayer-plan-row">
              <em>Track</em>
              <strong>{hqPlayerControlPlan?.metadata?.title ?? hqPlayerCurrentPlayable?.title ?? '暂无当前歌曲'}</strong>
            </div>
            <div className="connect-hqplayer-plan-row">
              <em>Headers</em>
              <strong>{hqPlayerControlPlan?.source?.hasHeaders ? '需要媒体服务隐藏' : '不暴露请求头'}</strong>
            </div>
            <div className="connect-hqplayer-plan-footer">
              <Server size={15} />
              <span>{hqPlayerEffectiveDraft.connectionMode === 'remote' ? '远程模式会优先使用 ECHO 媒体服务' : '本机模式可直接交接本地文件或本机流地址'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="connect-receiver-panel" aria-label="接收来自手机">
        <div className="connect-section-title">
          <div>
            <span>Receiver</span>
            <h2>接收来自手机</h2>
          </div>
          <button className="settings-action-button" type="button" onClick={() => void toggleReceiver()} disabled={isReceiverBusy}>
            {isReceiverBusy ? <Loader2 className="spinning-icon" size={16} /> : <Power size={16} />}
            {receiverStatus.enabled ? '关闭接收' : '开启接收'}
          </button>
        </div>
        <div className="connect-receiver-body">
          <div className="connect-artwork" data-empty={!receiverCover}>
            {receiverCover ? <img alt="" src={receiverCover} /> : <Smartphone size={42} />}
          </div>
          <div className="connect-now-copy">
            <span>{receiverStateLabel[receiverStatus.state]}</span>
            <h2>{receiverTitle}</h2>
            <p>{receiverArtist}{receiverAlbum ? ` · ${receiverAlbum}` : ''}</p>
            <div className="connect-progress" aria-label="接收播放进度">
              <span style={{ width: `${receiverProgressPercent}%` }} />
            </div>
            <small>
              {formatTime(receiverStatus.positionSeconds)} / {formatTime(receiverStatus.durationSeconds)}
            </small>
          </div>
          <div className="connect-receiver-meta">
            <span>{receiverStatus.advertisedName}</span>
            <small>{receiverStatus.currentClient ? `来自 ${receiverStatus.currentClient.address}` : '未连接手机'}</small>
            <small>
              {receiverStatus.addresses.length > 0
                ? receiverStatus.addresses.map(formatReceiverAddress).join(' / ')
                : receiverStatus.enabled
                  ? '正在准备局域网地址'
                  : '开启后手机可发现'}
            </small>
          </div>
          <button
            className="settings-action-button"
            type="button"
            onClick={() => void stopReceiverPlayback()}
            disabled={isReceiverBusy || !receiverStatus.currentUri}
          >
            <Square size={15} />
            停止接收播放
          </button>
        </div>
        <details className="connect-receiver-debug" aria-label="DLNA request log">
          <summary>
            <span>DLNA Debug</span>
            <small>{receiverStatus.debugEvents.length > 0 ? `${receiverStatus.debugEvents.length} recent` : 'No requests'}</small>
          </summary>
          <div className="connect-receiver-debug__items">
            {receiverStatus.debugEvents.length > 0 ? (
              receiverStatus.debugEvents.slice(0, 6).map((event) => (
                <code key={event.id}>
                  {new Date(event.at).toLocaleTimeString()} {event.remoteAddress ?? '-'} {event.method} {event.path}
                  {event.action ? ` #${event.action}` : ''} {event.statusCode ?? '-'}
                  {event.message ? ` ${event.message}` : ''}
                </code>
              ))
            ) : (
              <small>No DLNA requests yet</small>
            )}
          </div>
        </details>
      </section>

      <section className="connect-receiver-panel" aria-label="AirPlay 实验接收">
        <div className="connect-section-title">
          <div>
            <span>AirPlay Spike</span>
            <h2>接收来自 iPhone</h2>
          </div>
          <button className="settings-action-button" type="button" onClick={() => void toggleAirPlayReceiver()} disabled={isAirPlayReceiverBusy}>
            {isAirPlayReceiverBusy ? <Loader2 className="spinning-icon" size={16} /> : <Power size={16} />}
            {airPlayReceiverStatus.enabled ? '关闭 AirPlay' : '开启 AirPlay'}
          </button>
        </div>
        <div className="connect-receiver-body">
          <div className="connect-artwork" data-empty={!airPlayCover}>
            {airPlayCover ? <img alt="" src={airPlayCover} /> : <Cast size={42} />}
          </div>
          <div className="connect-now-copy">
            <span>{airPlayStateLabel[airPlayReceiverStatus.state]}</span>
            <h2>{airPlayTitle}</h2>
            <p>{airPlayArtist}{airPlayAlbum ? ` 路 ${airPlayAlbum}` : ''}</p>
            <div className="connect-progress" aria-label="AirPlay 播放进度">
              <span style={{ width: `${airPlayProgressPercent}%` }} />
            </div>
            <small>
              {formatTime(airPlayReceiverStatus.positionSeconds)} / {formatTime(airPlayReceiverStatus.durationSeconds)}
            </small>
          </div>
          <div className="connect-receiver-meta">
            <span>{airPlayReceiverStatus.advertisedName}</span>
            <small>{airPlayReceiverStatus.currentClient ? `来自 ${airPlayReceiverStatus.currentClient.address}` : '等待 iPhone / iPad'}</small>
            <small>
              {airPlayReceiverStatus.nativeAvailable
                ? 'RAOP 后端已加载'
                : airPlayReceiverStatus.error ?? '需要可用的 AirPlay 原生后端'}
            </small>
            <small>使用 AirPlay 后进度条将被锁定</small>
          </div>
          <button
            className="settings-action-button"
            type="button"
            onClick={() => void stopAirPlayReceiverPlayback()}
            disabled={isAirPlayReceiverBusy || !airPlayReceiverStatus.currentSourceId}
          >
            <Square size={15} />
            停止 AirPlay
          </button>
        </div>
        <details className="connect-receiver-debug" aria-label="AirPlay receiver log">
          <summary>
            <span>AirPlay Debug</span>
            <small>{airPlayReceiverStatus.debugEvents.length > 0 ? `${airPlayReceiverStatus.debugEvents.length} recent` : 'No requests'}</small>
          </summary>
          <div className="connect-receiver-debug__items">
            {airPlayReceiverStatus.debugEvents.length > 0 ? (
              airPlayReceiverStatus.debugEvents.slice(0, 6).map((event) => (
                <code key={event.id}>
                  {new Date(event.at).toLocaleTimeString()} {event.method} {event.action ?? '-'}
                  {event.message ? ` ${event.message}` : ''}
                </code>
              ))
            ) : (
              <small>No AirPlay events yet</small>
            )}
          </div>
        </details>
      </section>

      <section className="connect-now" aria-label="当前投送">
        <div className="connect-artwork" data-empty={!previewCover}>
          {previewCover ? <img alt="" src={previewCover} /> : <Cast size={42} />}
        </div>
        <div className="connect-now-copy">
          <span>{stateLabel[status.state]}</span>
          <h2>{previewTitle}</h2>
          <p>{previewArtist}{previewAlbum ? ` · ${previewAlbum}` : ''}</p>
          <div className="connect-progress" aria-label="投送进度">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <small>{formatTime(status.positionSeconds)} / {formatTime(status.durationSeconds || currentTrack?.duration || 0)}</small>
        </div>
        <div className="connect-controls" aria-label="Connect 控制">
          <button className="icon-button" type="button" aria-label="播放" title="播放" onClick={() => void runCommand('play')} disabled={isCommandBusy || !status.deviceId || activeDeviceCapabilities?.canPlay !== true}>
            <Play size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="暂停" title="暂停" onClick={() => void runCommand('pause')} disabled={isCommandBusy || !status.deviceId || activeDeviceCapabilities?.canPause !== true}>
            <Pause size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="停止" title="停止" onClick={() => void runCommand('stop')} disabled={isCommandBusy || !status.deviceId || activeDeviceCapabilities?.canStop !== true}>
            <Square size={16} />
          </button>
          <button className="icon-button" type="button" aria-label="断开" title="断开" onClick={() => void runCommand('disconnect')} disabled={isCommandBusy || !status.deviceId}>
            <Unplug size={17} />
          </button>
          <label className="connect-volume">
            <Volume2 size={16} />
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(event) => setVolumePercent(Number(event.currentTarget.value))}
              onMouseUp={() => void commitVolume(volumePercent)}
              onKeyUp={(event) => {
                if (event.key === 'Enter') {
                  void commitVolume(volumePercent);
                }
              }}
              disabled={activeDeviceCapabilities?.canSetVolume !== true}
              aria-label="投送音量"
            />
          </label>
        </div>
      </section>

      <section className="connect-device-section" aria-label="设备列表">
        <div className="connect-section-title">
          <div>
            <span>Devices</span>
            <h2>可连接设备</h2>
          </div>
          <small>{devices.length} 个入口</small>
        </div>
        <div className="connect-device-list">
          {devices.map((device) => {
            const isActive = device.id === status.deviceId;
            const isBusy = busyDeviceId === device.id;
            const disabled = device.state === 'unsupported' || device.state === 'unavailable' || isBusy || (!currentTrack && !currentFilePath);
            return (
              <article className="connect-device-row" data-active={isActive ? 'true' : undefined} key={device.id}>
                <div className="connect-device-icon" data-protocol={device.protocol}>
                  {device.protocol === 'dlna' ? <Wifi size={20} /> : device.protocol === 'hqplayer' ? <Cable size={20} /> : <Cast size={20} />}
                </div>
                <div className="connect-device-copy">
                  <strong>{device.name}</strong>
                  <span>{formatProtocol(device)} · {device.model ?? device.manufacturer ?? 'Unknown device'}</span>
                  {device.unsupportedReason ? <small>{device.unsupportedReason}</small> : null}
                </div>
                <div className="connect-device-meta">
                  <span data-state={device.state}>{isActive ? stateLabel[status.state] : deviceStateLabel[device.state]}</span>
                  <small>{device.capabilities.supportsMetadata ? 'Metadata OK' : 'No metadata'}</small>
                </div>
                <button
                  className="settings-action-button"
                  type="button"
                  disabled={disabled}
                  onClick={() => void connectDevice(device)}
                >
                  {isBusy ? <Loader2 className="spinning-icon" size={15} /> : device.protocol === 'hqplayer' ? <Cable size={15} /> : <Cast size={15} />}
                  {isActive ? '重新投送' : '连接'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
