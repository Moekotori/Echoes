import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Import, Loader2 } from 'lucide-react';
import type { AudioStatus } from '../../../shared/types/audio';
import { isReliableBpmAnalysis } from '../../../shared/constants/audioAnalysis';
import type { ConnectReceiverStatus } from '../../../shared/types/connect';
import type { DownloadJob, DownloadJobStatus } from '../../../shared/types/downloads';
import type { PlaybackStatus } from '../../../shared/types/playback';
import { streamingProviderNames, type StreamingProviderName } from '../../../shared/types/streaming';
import { likedChangedEvent, likedTracksChangedEvent } from '../../hooks/useLikedMedia';
import {
  isSpotifyTrack,
  pauseSpotifyPlayback,
  resumeSpotifyPlayback,
  seekSpotifyPlayback,
  setSpotifyVolume,
} from '../../integrations/spotify/spotifyPlayback';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { getVisualPlaybackState, refreshPlaybackStatus, setPlaybackStatusSnapshot, useSharedPlaybackStatus } from '../../stores/playbackStatusStore';
import { PlayerProgress } from './PlayerProgress';
import { PlayerSpeedControl } from './PlayerSpeedControl';
import { PlayerStatusChips } from './PlayerStatusChips';
import { PlayerTransport } from './PlayerTransport';
import { PlayerVolumeControl } from './PlayerVolumeControl';
import { formatAudioHostError, shouldSuppressAudioHostError } from './audioErrorFormat';
import { applyMediaSessionSnapshot } from './mediaSession';
import { titleFromPath } from './playerFormat';

type PlayerBarProps = {
  onOpenAudioSettings?: () => void;
};

const progressRenderIntervalMs = 250;
const bpmAnalysisStatusPollMs = 1500;
const playbackSeekedEvent = 'playback:seeked';
const lyricsViewModeMemoryKey = 'echo:lyrics:view-mode';
const maxInterpolatedStatusGapSeconds = 1.6;
const maxStaleStatusRegressionSeconds = 2.5;
const seekAnchorMaxAgeSeconds = 3;
const playbackRateChangeDiscontinuitySeconds = 0.35;
const isStreamingProviderName = (provider: string | null | undefined): provider is StreamingProviderName =>
  streamingProviderNames.includes(provider as StreamingProviderName);
const activeDownloadStatuses = new Set<DownloadJobStatus>([
  'queued',
  'probing',
  'downloading',
  'extracting_audio',
  'importing',
  'binding_mv',
]);
const terminalDownloadStatuses = new Set<DownloadJobStatus>(['completed', 'failed', 'cancelled']);
const unsupportedPlayerDownloadProviders = new Set<StreamingProviderName>(['mock', 'spotify']);
const unsupportedStreamingBpmAnalysisProviders = new Set<StreamingProviderName>(['spotify', 'soundcloud']);
const downloadStatusLabels: Record<DownloadJobStatus, string> = {
  queued: '排队中',
  probing: '解析链接',
  downloading: '下载中',
  extracting_audio: '提取音频',
  importing: '导入曲库',
  binding_mv: '绑定 MV',
  completed: '下载完成',
  failed: '下载失败',
  cancelled: '已取消',
};
const isVerifiedAudioAnalysisBpm = (track: { bpm?: number | null; bpmConfidence?: number | null; analysisStatus?: string | null; fieldSources?: Record<string, string> } | null): boolean =>
  Boolean(track?.fieldSources?.bpm === 'audio_analysis' && isReliableBpmAnalysis(track.bpm, track.bpmConfidence, track.analysisStatus));
const readAudioAnalysisEnabled = (settings: unknown): boolean => {
  if (!settings || typeof settings !== 'object') {
    return true;
  }

  return (settings as { audioAnalysisEnabled?: unknown }).audioAnalysisEnabled !== false;
};
const readAudioAnalysisEnabledPatch = (patch: unknown): boolean | null => {
  if (!patch || typeof patch !== 'object') {
    return null;
  }

  const value = (patch as { audioAnalysisEnabled?: unknown }).audioAnalysisEnabled;
  return typeof value === 'boolean' ? value : null;
};

type PlayerDownloadNotice = {
  tone: 'info' | 'success' | 'error';
  title: string;
  detail: string;
  progress: number | null;
};

const streamingTrackWebUrl = (provider: StreamingProviderName, providerTrackId: string): string | null => {
  switch (provider) {
    case 'netease':
      return `https://music.163.com/#/song?id=${encodeURIComponent(providerTrackId)}`;
    case 'qqmusic':
      return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(providerTrackId)}`;
    case 'spotify':
      return `https://open.spotify.com/track/${encodeURIComponent(providerTrackId)}`;
    case 'soundcloud':
      return providerTrackId.startsWith('http')
        ? providerTrackId
        : `https://soundcloud.com/search/sounds?q=${encodeURIComponent(providerTrackId)}`;
    default:
      return null;
  }
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value);

const shouldUseDirectAudioDownload = (source: {
  provider: StreamingProviderName;
  url: string;
  mimeType: string | null;
  codec: string | null;
}): boolean =>
  source.provider !== 'm3u8' &&
  isHttpUrl(source.url) &&
  (source.mimeType?.toLocaleLowerCase().startsWith('audio/') === true || Boolean(source.codec));

const clampDownloadProgress = (progress: number): number => Math.max(0, Math.min(100, Math.round(progress)));

const downloadNoticeFromJob = (job: DownloadJob, fallbackTitle: string | null): PlayerDownloadNotice => {
  const trackTitle = job.title ?? fallbackTitle ?? '当前流媒体';
  const progress = clampDownloadProgress(job.progress);

  if (job.status === 'completed') {
    return {
      tone: 'success',
      title: `下载完成：${trackTitle}`,
      detail: job.outputPath ?? '已保存到下载文件夹',
      progress: 100,
    };
  }

  if (job.status === 'failed') {
    return {
      tone: 'error',
      title: `下载失败：${trackTitle}`,
      detail: job.error ?? '请稍后重试',
      progress: null,
    };
  }

  if (job.status === 'cancelled') {
    return {
      tone: 'error',
      title: `下载已取消：${trackTitle}`,
      detail: '任务已停止',
      progress: null,
    };
  }

  return {
    tone: 'info',
    title: `正在下载：${trackTitle}`,
    detail: `${downloadStatusLabels[job.status]} · ${progress}%`,
    progress,
  };
};

const deferNonCriticalPlaybackTask = (callback: () => void): (() => void) => {
  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;
  const requestIdleCallback = window.requestIdleCallback;
  const cancelIdleCallback = window.cancelIdleCallback;

  const frameId = window.requestAnimationFrame(() => {
    if (cancelled) {
      return;
    }

    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(() => {
        if (!cancelled) {
          callback();
        }
      }, { timeout: 800 });
      return;
    }

    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        callback();
      }
    }, 80);
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frameId);
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
};

const originalCoverUrlFromThumb = (coverUrl: string | null): string | null =>
  coverUrl?.replace(/^echo-cover:\/\/(?:thumb|album|large)\//u, 'echo-cover://original/') ?? null;

const playerArtworkUrl = (track: { coverId: string | null; coverThumb: string | null } | null): string | null =>
  track?.coverId ? `echo-cover://original/${encodeURIComponent(track.coverId)}` : originalCoverUrlFromThumb(track?.coverThumb ?? null);

const isAudioStatusForPlayback = (audioStatus: AudioStatus, playbackStatus: PlaybackStatus | null): boolean => {
  if (!playbackStatus?.currentTrackId && !playbackStatus?.filePath) {
    return true;
  }

  return (
    Boolean(playbackStatus.currentTrackId && audioStatus.currentTrackId === playbackStatus.currentTrackId) ||
    Boolean(playbackStatus.filePath && audioStatus.currentFilePath === playbackStatus.filePath)
  );
};

const isSpotifyPlaybackStatus = (status: PlaybackStatus | null | undefined): boolean =>
  typeof status?.filePath === 'string' && status.filePath.startsWith('streaming:spotify:');

const receiverStateToPlaybackState = (status: ConnectReceiverStatus): AudioStatus['state'] => {
  switch (status.state) {
    case 'loading':
    case 'playing':
    case 'paused':
    case 'stopped':
    case 'error':
      return status.state;
    case 'ready':
      return 'stopped';
    default:
      return 'idle';
  }
};

const isProviderLikedStreamingProvider = (provider: string | null | undefined): provider is Extract<StreamingProviderName, 'netease' | 'qqmusic'> =>
  provider === 'netease' || provider === 'qqmusic';

const dispatchPlaybackSeeked = (positionSeconds: number, trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(playbackSeekedEvent, { detail: { positionSeconds, trackId } }));
};

const rememberLyricsViewMode = (mode: 'lyrics' | 'mv'): void => {
  try {
    window.sessionStorage.setItem(lyricsViewModeMemoryKey, mode);
  } catch {
    // Best-effort navigation preference only.
  }
};

const PlayerMarqueeText = ({ kind, text }: { kind: 'title' | 'subtitle'; text: string }): JSX.Element => {
  const textRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    const innerElement = innerRef.current;
    if (!element || !innerElement) {
      return undefined;
    }

    let frameId: number | null = null;
    const updateOverflow = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const distance = Math.max(0, innerElement.scrollWidth - element.clientWidth);
        const shouldScroll = distance > 2;
        element.style.setProperty('--player-marquee-distance', `${distance + 18}px`);
        element.style.setProperty('--player-marquee-duration', `${Math.min(22, Math.max(8, distance / 18 + 6))}s`);
        setIsOverflowing(shouldScroll);
      });
    };

    updateOverflow();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(element);
    resizeObserver?.observe(innerElement);
    window.addEventListener('resize', updateOverflow);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [text]);

  const content = <span className="player-marquee-inner" ref={innerRef}>{text}</span>;
  const commonProps = {
    className: 'player-marquee',
    'data-overflow': isOverflowing ? 'true' : undefined,
    ref: textRef,
    title: text,
  };

  return kind === 'title' ? <strong {...commonProps}>{content}</strong> : <span {...commonProps}>{content}</span>;
};

const isTextEditingElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableTarget = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
  if (editableTarget) {
    return true;
  }

  return target instanceof HTMLElement && target.isContentEditable;
};

const isPlaybackShortcutTextTarget = (event: KeyboardEvent): boolean => {
  const path = event.composedPath();
  if (path.some((target) => isTextEditingElement(target))) {
    return true;
  }

  return isTextEditingElement(document.activeElement);
};

export const PlayerBar = ({ onOpenAudioSettings }: PlayerBarProps): JSX.Element => {
  const queue = usePlaybackQueue();
  const sharedPlaybackStatus = useSharedPlaybackStatus();
  const setQueueCurrentTrackId = queue.setCurrentTrackId;
  const appendToQueue = queue.appendToQueue;
  const updateTrackSnapshot = queue.updateTrackSnapshot;
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [receiverStatus, setReceiverStatus] = useState<ConnectReceiverStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [openPopover, setOpenPopover] = useState<'volume' | 'speed' | null>(null);
  const [isCurrentTrackLiked, setIsCurrentTrackLiked] = useState(false);
  const [smtcEnabled, setSmtcEnabled] = useState(true);
  const [audioAnalysisEnabled, setAudioAnalysisEnabled] = useState<boolean | null>(null);
  const [streamingDownloadJobId, setStreamingDownloadJobId] = useState<string | null>(null);
  const [streamingDownloadNotice, setStreamingDownloadNotice] = useState<PlayerDownloadNotice | null>(null);
  const [isStreamingDownloadResolving, setIsStreamingDownloadResolving] = useState(false);
  const handledEndedTrackRef = useRef<string | null>(null);
  const hydratedTrackIdsRef = useRef(new Set<string>());
  const bpmAnalysisJobIdsRef = useRef(new Map<string, string | 'done'>());
  const streamingBpmAnalysisTrackIdsRef = useRef(new Set<string>());
  const streamingDownloadTitleRef = useRef<string | null>(null);
  const streamingDownloadNoticeTimerRef = useRef<number | null>(null);
  const mvPreloadTrackRef = useRef<string | null>(null);
  const seekAnchorRef = useRef<{ positionSeconds: number; trackKey: string | null; updatedAtMs: number } | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const lastPlaybackActionStatusRef = useRef<{ state: PlaybackStatus['state']; trackId: string | null; filePath: string | null; updatedAtMs: number } | null>(null);
  const progressClockRef = useRef({
    durationSeconds: 0,
    playbackRate: 1,
    positionSeconds: 0,
    sourcePositionSeconds: 0,
    state: 'idle',
    trackKey: null as string | null,
    updatedAtMs: performance.now(),
  });

  const shouldIgnoreAudioStatus = useCallback((nextAudioStatus: AudioStatus): boolean => {
    const lastAction = lastPlaybackActionStatusRef.current;
    if (!lastAction) {
      return false;
    }

    const elapsedMs = performance.now() - lastAction.updatedAtMs;
    const samePlayback =
      Boolean(lastAction.trackId && nextAudioStatus.currentTrackId === lastAction.trackId) ||
      Boolean(lastAction.filePath && nextAudioStatus.currentFilePath === lastAction.filePath);

    if (elapsedMs < 1200 && !samePlayback && (nextAudioStatus.currentTrackId || nextAudioStatus.currentFilePath)) {
      return true;
    }

    if (elapsedMs < 1200 && samePlayback && nextAudioStatus.state !== lastAction.state) {
      return true;
    }

    if (nextAudioStatus.state === lastAction.state || elapsedMs >= 1200) {
      lastPlaybackActionStatusRef.current = null;
    }

    return false;
  }, []);

  const applyAudioStatus = useCallback(
    (nextAudioStatus: AudioStatus): void => {
      if (shouldIgnoreAudioStatus(nextAudioStatus)) {
        return;
      }

      setAudioStatus(nextAudioStatus);
      if (nextAudioStatus.currentTrackId) {
        setQueueCurrentTrackId(nextAudioStatus.currentTrackId);
      }
      setPlaybackStatus((current) =>
        current
          ? {
              ...current,
              state: nextAudioStatus.state,
              currentTrackId: nextAudioStatus.currentTrackId,
              filePath: nextAudioStatus.currentFilePath,
              positionMs: Math.round(nextAudioStatus.positionSeconds * 1000),
              durationMs: Math.round(nextAudioStatus.durationSeconds * 1000),
            }
          : current,
      );
      setError(formatAudioHostError(nextAudioStatus.error));
    },
    [setQueueCurrentTrackId, shouldIgnoreAudioStatus],
  );

  const applySharedPlaybackStatus = useCallback(
    (snapshot: { playbackStatus: PlaybackStatus | null; audioStatus: AudioStatus | null; error: string | null }): void => {
      if (snapshot.playbackStatus) {
        setPlaybackStatus(snapshot.playbackStatus);
      }

      const snapshotAudioStatus = snapshot.audioStatus;
      if (isSpotifyPlaybackStatus(snapshot.playbackStatus) && !snapshotAudioStatus) {
        setAudioStatus(null);
      }
      const shouldApplyAudioStatus = snapshotAudioStatus
        ? isAudioStatusForPlayback(snapshotAudioStatus, snapshot.playbackStatus)
        : false;
      if (snapshotAudioStatus && shouldApplyAudioStatus) {
        applyAudioStatus(snapshotAudioStatus);
      }

      const nextTrackId =
        snapshot.playbackStatus?.currentTrackId ??
        (snapshotAudioStatus && shouldApplyAudioStatus ? snapshotAudioStatus.currentTrackId : null) ??
        null;
      if (nextTrackId) {
        setQueueCurrentTrackId(nextTrackId);
      }

      setError(formatAudioHostError(snapshot.error));
    },
    [applyAudioStatus, setQueueCurrentTrackId],
  );

  const refreshStatus = useCallback(async (): Promise<void> => {
    applySharedPlaybackStatus(await refreshPlaybackStatus());
  }, [applySharedPlaybackStatus]);

  const baseState = audioStatus?.state ?? playbackStatus?.state ?? 'idle';
  const baseVisualState = getVisualPlaybackState({
    audioStatus,
    playbackStatus,
    playbackVisualIntent: sharedPlaybackStatus.playbackVisualIntent,
  });
  const statusTrackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack = queue.currentTrack ?? queue.tracks.find((track) => track.id === trackId) ?? null;
  const filePath = currentTrack?.path ?? audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
  const receiverCurrentUri = receiverStatus?.currentUri ?? null;
  const receiverHasCurrentMedia = Boolean(
    receiverCurrentUri && receiverStatus && ['ready', 'loading', 'playing', 'paused', 'stopped'].includes(receiverStatus.state),
  );
  const isReceiverPlaybackActive = Boolean(
    receiverHasCurrentMedia &&
      (audioStatus?.currentFilePath === receiverCurrentUri ||
        playbackStatus?.filePath === receiverCurrentUri ||
        !currentTrack),
  );
  const receiverPlaybackState = receiverStatus ? receiverStateToPlaybackState(receiverStatus) : 'idle';
  const state = isReceiverPlaybackActive ? receiverPlaybackState : baseState;
  const visualState = isReceiverPlaybackActive ? receiverPlaybackState : baseVisualState;
  const isPlaying = visualState === 'playing';
  const endedStatusTrackId =
    audioStatus?.state === 'ended'
      ? audioStatus.currentTrackId
      : playbackStatus?.state === 'ended'
        ? playbackStatus.currentTrackId
        : null;
  const endedStatusFilePath =
    audioStatus?.state === 'ended'
      ? audioStatus.currentFilePath
      : playbackStatus?.state === 'ended'
        ? playbackStatus.filePath
        : null;
  const sourcePositionSeconds = isReceiverPlaybackActive
    ? receiverStatus?.positionSeconds ?? audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000
    : audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const durationSeconds = isReceiverPlaybackActive
    ? Math.max(receiverStatus?.durationSeconds ?? 0, audioStatus?.durationSeconds ?? 0, (playbackStatus?.durationMs ?? 0) / 1000)
    : audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const [realtimePositionSeconds, setRealtimePositionSeconds] = useState(sourcePositionSeconds);
  const positionSeconds = seekPreviewSeconds ?? realtimePositionSeconds;
  const receiverMetadata = isReceiverPlaybackActive ? receiverStatus?.metadata ?? null : null;
  const title = receiverMetadata?.title ?? currentTrack?.title ?? titleFromPath(filePath);
  const artist = receiverMetadata?.artist ?? currentTrack?.artist ?? currentTrack?.albumArtist ?? (filePath ? 'DLNA stream' : 'Ready');
  const artworkUrl = receiverMetadata?.coverHttpUrl || playerArtworkUrl(currentTrack);
  const isLibraryCurrentTrack = Boolean(currentTrack && !currentTrack.isTemporary && currentTrack.mediaType !== 'streaming');
  const streamingTrackId = currentTrack?.id ?? null;
  const streamingTrackMediaType = currentTrack?.mediaType ?? null;
  const streamingTrackProvider = currentTrack?.provider ?? null;
  const streamingTrackProviderTrackId = currentTrack?.providerTrackId ?? null;
  const currentStreamingDownloadProvider =
    streamingTrackMediaType === 'streaming' && isStreamingProviderName(streamingTrackProvider) ? streamingTrackProvider : null;
  const isCurrentStreamingTrack = Boolean(currentStreamingDownloadProvider && streamingTrackProviderTrackId);
  const canDownloadCurrentStreamingTrack = Boolean(
    currentStreamingDownloadProvider &&
      streamingTrackProviderTrackId &&
      !unsupportedPlayerDownloadProviders.has(currentStreamingDownloadProvider),
  );
  const isCurrentStreamingDownloadBusy = isStreamingDownloadResolving || Boolean(streamingDownloadJobId);
  const isProviderLikedStreamingTrack =
    streamingTrackMediaType === 'streaming' &&
    isProviderLikedStreamingProvider(streamingTrackProvider) &&
    Boolean(streamingTrackProviderTrackId);
  const streamingTrackQuality = currentTrack?.streamingQuality;
  const streamingTrackBpm = currentTrack?.bpm ?? null;
  const streamingTrackBpmConfidence = currentTrack?.bpmConfidence ?? null;
  const streamingTrackAnalysisStatus = currentTrack?.analysisStatus ?? null;
  const isSpotifyCurrentTrack = isSpotifyTrack(currentTrack);

  const clearStreamingDownloadNoticeTimer = useCallback((): void => {
    if (streamingDownloadNoticeTimerRef.current !== null) {
      window.clearTimeout(streamingDownloadNoticeTimerRef.current);
      streamingDownloadNoticeTimerRef.current = null;
    }
  }, []);

  const showStreamingDownloadNotice = useCallback(
    (notice: PlayerDownloadNotice, autoHideMs?: number): void => {
      clearStreamingDownloadNoticeTimer();
      setStreamingDownloadNotice(notice);

      if (autoHideMs) {
        streamingDownloadNoticeTimerRef.current = window.setTimeout(() => {
          setStreamingDownloadNotice(null);
          streamingDownloadNoticeTimerRef.current = null;
        }, autoHideMs);
      }
    },
    [clearStreamingDownloadNoticeTimer],
  );

  useEffect(() => () => clearStreamingDownloadNoticeTimer(), [clearStreamingDownloadNoticeTimer]);

  useEffect(() => {
    const downloads = window.echo?.downloads;
    if (!downloads?.onJobsUpdated || !streamingDownloadJobId) {
      return undefined;
    }

    const applyJobsSnapshot = (jobs: DownloadJob[]): void => {
      const job = jobs.find((item) => item.id === streamingDownloadJobId);
      if (!job) {
        return;
      }

      const notice = downloadNoticeFromJob(job, streamingDownloadTitleRef.current);
      const isTerminal = terminalDownloadStatuses.has(job.status);
      const isActive = activeDownloadStatuses.has(job.status);
      showStreamingDownloadNotice(notice, isTerminal ? (job.status === 'completed' ? 4500 : 7000) : undefined);
      if (!isActive && isTerminal) {
        setStreamingDownloadJobId(null);
      }
    };

    void downloads.getJobs?.().then(applyJobsSnapshot).catch(() => undefined);
    return downloads.onJobsUpdated(applyJobsSnapshot);
  }, [showStreamingDownloadNotice, streamingDownloadJobId]);

  const handleDownloadCurrentStreamingTrack = useCallback(async (): Promise<void> => {
    if (!currentTrack || !currentStreamingDownloadProvider || !streamingTrackProviderTrackId) {
      return;
    }

    if (unsupportedPlayerDownloadProviders.has(currentStreamingDownloadProvider)) {
      const detail =
        currentStreamingDownloadProvider === 'spotify'
          ? 'Spotify 由官方播放器播放，不提供可下载音频 URL。'
          : 'Mock 流媒体用于开发预览，不写入下载任务。';
      showStreamingDownloadNotice(
        {
          tone: 'error',
          title: '当前平台不支持下载',
          detail,
          progress: null,
        },
        6500,
      );
      return;
    }

    const downloads = window.echo?.downloads;
    const streaming = window.echo?.streaming;
    if (!downloads?.createUrlJob || !streaming?.resolvePlayback) {
      showStreamingDownloadNotice(
        {
          tone: 'error',
          title: '下载服务不可用',
          detail: '请在 ECHO Next 桌面端中使用下载功能。',
          progress: null,
        },
        6500,
      );
      return;
    }

    const trackTitle = currentTrack.title || '当前流媒体';
    streamingDownloadTitleRef.current = trackTitle;
    setIsStreamingDownloadResolving(true);
    showStreamingDownloadNotice({
      tone: 'info',
      title: `准备下载：${trackTitle}`,
      detail: '正在解析流媒体地址...',
      progress: 0,
    });

    try {
      const source = await streaming.resolvePlayback({
        provider: currentStreamingDownloadProvider,
        providerTrackId: streamingTrackProviderTrackId,
        quality: currentTrack.streamingQuality,
      });
      const directAudio = shouldUseDirectAudioDownload(source);
      const webpageUrl =
        streamingTrackWebUrl(currentStreamingDownloadProvider, streamingTrackProviderTrackId) ??
        (currentStreamingDownloadProvider === 'm3u8' ? source.url : undefined);
      const job = await downloads.createUrlJob(source.url, {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        albumArtist: currentTrack.albumArtist || currentTrack.artist,
        coverUrl: currentTrack.coverThumb,
        webpageUrl,
        bindMvAfterImport: false,
        requestHeaders: source.headers,
        directAudio,
        directAudioMimeType: source.mimeType,
        directAudioExtension: source.codec,
        streamingProvider: currentStreamingDownloadProvider,
        streamingProviderTrackId: streamingTrackProviderTrackId,
        streamingStableKey: currentTrack.stableKey ?? currentTrack.id,
      });
      setStreamingDownloadJobId(job.id);
      showStreamingDownloadNotice(downloadNoticeFromJob(job, trackTitle));
    } catch (downloadError) {
      setStreamingDownloadJobId(null);
      showStreamingDownloadNotice(
        {
          tone: 'error',
          title: `下载失败：${trackTitle}`,
          detail: downloadError instanceof Error ? downloadError.message : String(downloadError),
          progress: null,
        },
        7000,
      );
    } finally {
      setIsStreamingDownloadResolving(false);
    }
  }, [currentStreamingDownloadProvider, currentTrack, showStreamingDownloadNotice, streamingTrackProviderTrackId]);

  useEffect(() => {
    if (!isSpotifyCurrentTrack || !currentTrack?.providerTrackId || !window.echo?.spotify?.getPlaybackState) {
      return;
    }

    let cancelled = false;
    const expectedUri = `spotify:track:${currentTrack.providerTrackId}`;
    const track = currentTrack;

    const syncSpotifyProgress = async (): Promise<void> => {
      try {
        const spotifyState = await window.echo.spotify.getPlaybackState();
        if (cancelled || spotifyState.itemUri !== expectedUri) {
          return;
        }

        const status: PlaybackStatus = {
          state: spotifyState.isPlaying ? 'playing' : 'paused',
          currentTrackId: track.id,
          positionMs: spotifyState.progressMs ?? 0,
          durationMs: Math.round(Math.max(0, track.duration) * 1000),
          filePath: track.stableKey ?? track.path,
        };
        setPlaybackStatusSnapshot({ playbackStatus: status, audioStatus: null, error: null });
      } catch {
        // Spotify progress polling is best-effort; transport actions surface actionable errors.
      }
    };

    void syncSpotifyProgress();
    const interval = window.setInterval(() => {
      void syncSpotifyProgress();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentTrack, isSpotifyCurrentTrack]);

  useEffect(() => {
    activeTrackIdRef.current = currentTrack?.id ?? trackId ?? null;
  }, [currentTrack?.id, trackId]);

  useEffect(() => {
    let cancelled = false;

    const refreshAudioAnalysisSetting = (): void => {
      const getSettings = window.echo?.app?.getSettings;
      if (typeof getSettings !== 'function') {
        setAudioAnalysisEnabled(true);
        return;
      }

      void getSettings()
        .then((settings) => {
          if (!cancelled) {
            setAudioAnalysisEnabled(readAudioAnalysisEnabled(settings));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAudioAnalysisEnabled(true);
          }
        });
    };

    const handleSettingsChanged = (event: Event): void => {
      if (event instanceof CustomEvent) {
        const patchedValue = readAudioAnalysisEnabledPatch(event.detail);
        if (patchedValue !== null) {
          setAudioAnalysisEnabled(patchedValue);
        }
      }

      refreshAudioAnalysisSetting();
    };

    refreshAudioAnalysisSetting();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  const refreshCurrentTrackLiked = useCallback(async (): Promise<void> => {
    if (!trackId || (!isLibraryCurrentTrack && !isProviderLikedStreamingTrack) || !window.echo?.library) {
      setIsCurrentTrackLiked(false);
      return;
    }

    try {
      const result = await window.echo.library.getLikedTrackIds([trackId]);
      setIsCurrentTrackLiked(result[trackId] === true);
    } catch {
      setIsCurrentTrackLiked(false);
    }
  }, [isLibraryCurrentTrack, isProviderLikedStreamingTrack, trackId]);

  useEffect(() => {
    queue.syncPlaybackState(state);
  }, [queue, state]);

  useEffect(() => {
    const now = performance.now();
    const trackKey = trackId ?? filePath ?? null;
    const previous = progressClockRef.current;
    const samePlayback = previous.trackKey === trackKey;
    const stateChanged = previous.state !== state;
    const playbackRate = audioStatus?.playbackRate ?? 1;
    const durationLimit = durationSeconds > 0 ? durationSeconds : Number.POSITIVE_INFINITY;
    const boundedSourcePosition = Math.min(Math.max(0, sourcePositionSeconds), durationLimit);
    let nextPositionSeconds = boundedSourcePosition;
    const seekAnchor = seekAnchorRef.current;

    if (seekAnchor) {
      if (seekAnchor.trackKey && trackKey && seekAnchor.trackKey !== trackKey) {
        seekAnchorRef.current = null;
      } else {
        const elapsedSeconds = Math.max(0, (now - seekAnchor.updatedAtMs) / 1000);
        const expectedSeekPosition = Math.min(
          seekAnchor.positionSeconds + (state === 'playing' ? elapsedSeconds * playbackRate : 0),
          durationLimit,
        );
        const isStaleStatusAfterSeek =
          elapsedSeconds < seekAnchorMaxAgeSeconds && Math.abs(boundedSourcePosition - expectedSeekPosition) > 2;

        if (isStaleStatusAfterSeek) {
          nextPositionSeconds = expectedSeekPosition;
        } else {
          seekAnchorRef.current = null;
        }
      }
    }

    if (!seekAnchorRef.current && samePlayback && !stateChanged && state === 'playing') {
      const wallElapsedSeconds = Math.max(0, (now - previous.updatedAtMs) / 1000);
      const mediaElapsedSeconds = wallElapsedSeconds * previous.playbackRate;
      const estimatedPositionSeconds = Math.min(previous.positionSeconds + mediaElapsedSeconds, durationLimit);
      const sourceJumpedBackward = boundedSourcePosition + 1 < previous.sourcePositionSeconds;
      const sourceCaughtUp = boundedSourcePosition + 0.35 >= estimatedPositionSeconds;
      const sourceJumpedForward = boundedSourcePosition > estimatedPositionSeconds + 0.35;
      const canBridgeSourceLag = wallElapsedSeconds <= maxInterpolatedStatusGapSeconds;
      const playbackRateChanged = Math.abs(previous.playbackRate - playbackRate) > 0.001;
      const rateChangeSourceDiscontinuity =
        playbackRateChanged && Math.abs(boundedSourcePosition - estimatedPositionSeconds) > playbackRateChangeDiscontinuitySeconds;
      const staleRegressionSeconds = previous.positionSeconds - boundedSourcePosition;
      const canIgnoreStaleRegression =
        canBridgeSourceLag && staleRegressionSeconds > 0.35 && staleRegressionSeconds <= maxStaleStatusRegressionSeconds;
      const canIgnoreStaleForwardJump = canBridgeSourceLag && sourceJumpedForward && Math.abs(previous.playbackRate - 1) > 0.001;

      if (rateChangeSourceDiscontinuity) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleRegression) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleForwardJump) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canBridgeSourceLag && !sourceJumpedBackward && !sourceCaughtUp && !sourceJumpedForward && estimatedPositionSeconds > boundedSourcePosition) {
        nextPositionSeconds = estimatedPositionSeconds;
      }
    }

    progressClockRef.current = {
      durationSeconds,
      playbackRate,
      positionSeconds: nextPositionSeconds,
      sourcePositionSeconds: boundedSourcePosition,
      state,
      trackKey,
      updatedAtMs: now,
    };
    setRealtimePositionSeconds(nextPositionSeconds);
  }, [audioStatus?.playbackRate, durationSeconds, filePath, sourcePositionSeconds, state, trackId]);

  useEffect(() => {
    if (state !== 'playing' || seekPreviewSeconds !== null) {
      return;
    }

    const timer = window.setInterval(() => {
      const clock = progressClockRef.current;
      if (clock.state !== 'playing') {
        return;
      }

      const durationLimit = clock.durationSeconds > 0 ? clock.durationSeconds : Number.POSITIVE_INFINITY;
      const elapsedSeconds = Math.max(0, (performance.now() - clock.updatedAtMs) / 1000) * clock.playbackRate;
      setRealtimePositionSeconds(Math.min(clock.positionSeconds + elapsedSeconds, durationLimit));
    }, progressRenderIntervalMs);

    return () => window.clearInterval(timer);
  }, [seekPreviewSeconds, state]);

  useEffect(() => {
    if (!currentTrack || currentTrack.mediaType !== 'streaming') {
      return;
    }

    const patch = {
      ...(currentTrack.duration <= 0 && durationSeconds > 0 ? { duration: durationSeconds } : {}),
      ...(!currentTrack.codec && audioStatus?.codec ? { codec: audioStatus.codec } : {}),
      ...(!currentTrack.sampleRate && audioStatus?.fileSampleRate ? { sampleRate: audioStatus.fileSampleRate } : {}),
      ...(!currentTrack.bitDepth && audioStatus?.bitDepth ? { bitDepth: audioStatus.bitDepth } : {}),
      ...(!currentTrack.bitrate && audioStatus?.bitrate ? { bitrate: audioStatus.bitrate } : {}),
    };

    if (Object.keys(patch).length === 0) {
      return;
    }

    queue.updateCurrentTrackSnapshot(patch);
  }, [
    audioStatus?.bitDepth,
    audioStatus?.bitrate,
    audioStatus?.codec,
    audioStatus?.fileSampleRate,
    currentTrack,
    durationSeconds,
    queue,
  ]);

  useEffect(() => {
    const library = window.echo?.library;
    const analysisTrack = currentTrack;
    const existingJobId = analysisTrack ? bpmAnalysisJobIdsRef.current.get(analysisTrack.id) : undefined;
    const canAnalyzeCurrentTrack =
      analysisTrack &&
      !analysisTrack.isTemporary &&
      (analysisTrack.mediaType ?? 'local') === 'local' &&
      analysisTrack.analysisStatus !== 'analyzing' &&
      !isVerifiedAudioAnalysisBpm(analysisTrack);
    const shouldStartAnalysis = isPlaying;
    const canStartAnalysis = audioAnalysisEnabled === true;
    const shouldContinueAnalysis = Boolean(existingJobId && existingJobId !== 'done');

    if (
      !library?.startBpmAnalysis ||
      !library.getBpmAnalysisStatus ||
      !library.getTrack
    ) {
      return;
    }

    if (!analysisTrack) {
      return undefined;
    }

    if (existingJobId === 'done') {
      return undefined;
    }

    if ((!canAnalyzeCurrentTrack && !shouldContinueAnalysis) || ((!shouldStartAnalysis || !canStartAnalysis) && !shouldContinueAnalysis)) {
      return undefined;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let cancelDeferredTask: (() => void) | null = null;

    const refreshAnalyzedTrack = async (): Promise<void> => {
      const refreshed = await library.getTrack(analysisTrack.id);
      if (cancelled || !refreshed || refreshed.id !== analysisTrack.id) {
        return;
      }

      updateTrackSnapshot(analysisTrack.id, {
        bpm: refreshed.bpm,
        bpmConfidence: refreshed.bpmConfidence,
        beatOffsetMs: refreshed.beatOffsetMs,
        analysisStatus: refreshed.analysisStatus,
        analysisUpdatedAt: refreshed.analysisUpdatedAt,
      });
    };

    const pollJob = (jobId: string): void => {
      pollTimer = window.setTimeout(() => {
        void (async () => {
          try {
            const status = await library.getBpmAnalysisStatus(jobId);
            if (cancelled) {
              return;
            }

            if (status.status === 'queued' || status.status === 'running') {
              pollJob(jobId);
              return;
            }

            await refreshAnalyzedTrack();
            bpmAnalysisJobIdsRef.current.set(analysisTrack.id, 'done');
          } catch {
            // Playback should not surface background BPM analysis failures.
          }
        })();
      }, bpmAnalysisStatusPollMs);
    };

    if (existingJobId) {
      pollJob(existingJobId);
    } else {
      cancelDeferredTask = deferNonCriticalPlaybackTask(() => {
        void (async () => {
          try {
            const job = await library.startBpmAnalysis({ trackIds: [analysisTrack.id] });
            if (cancelled) {
              return;
            }

            updateTrackSnapshot(analysisTrack.id, {
              analysisStatus: 'analyzing',
            });

            if (job.status === 'queued' || job.status === 'running') {
              bpmAnalysisJobIdsRef.current.set(analysisTrack.id, job.id);
              pollJob(job.id);
              return;
            }

            await refreshAnalyzedTrack();
            bpmAnalysisJobIdsRef.current.set(analysisTrack.id, 'done');
          } catch {
            // Disabled analysis or analyzer errors should never interrupt playback.
          }
        })();
      });
    }

    return () => {
      cancelled = true;
      cancelDeferredTask?.();
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [audioAnalysisEnabled, currentTrack, isPlaying, updateTrackSnapshot]);

  useEffect(() => {
    const streaming = window.echo?.streaming;
    const canAnalyzeCurrentTrack =
      audioAnalysisEnabled === true &&
      isPlaying &&
      streamingTrackMediaType === 'streaming' &&
      !unsupportedStreamingBpmAnalysisProviders.has(streamingTrackProvider as StreamingProviderName) &&
      !isReliableBpmAnalysis(streamingTrackBpm, streamingTrackBpmConfidence, streamingTrackAnalysisStatus) &&
      streamingTrackAnalysisStatus !== 'analyzing' &&
      (streamingTrackAnalysisStatus !== 'complete' ||
        !isReliableBpmAnalysis(streamingTrackBpm, streamingTrackBpmConfidence, streamingTrackAnalysisStatus)) &&
      isStreamingProviderName(streamingTrackProvider) &&
      Boolean(streamingTrackProviderTrackId);

    if (!streaming?.analyzeBpm || !canAnalyzeCurrentTrack || !streamingTrackProviderTrackId || !streamingTrackId) {
      return;
    }

    const provider = streamingTrackProvider;
    const providerTrackId = streamingTrackProviderTrackId;
    if (!isStreamingProviderName(provider)) {
      return;
    }

    const quality = streamingTrackQuality;
    const analysisKey = `${provider}:${providerTrackId}:${quality ?? 'standard'}`;
    const pendingAnalysisKeys = streamingBpmAnalysisTrackIdsRef.current;
    if (pendingAnalysisKeys.has(analysisKey)) {
      return;
    }

    const analyzedStreamingTrackId = streamingTrackId;
    pendingAnalysisKeys.add(analysisKey);
    let started = false;
    const cancelDeferredTask = deferNonCriticalPlaybackTask(() => {
      started = true;
      void streaming
        .analyzeBpm({
          provider,
          providerTrackId,
          quality,
        })
        .then((result) => {
          if (activeTrackIdRef.current !== analyzedStreamingTrackId) {
            return;
          }

          updateTrackSnapshot(analyzedStreamingTrackId, {
            bpm: result.bpm,
            bpmConfidence: result.confidence,
            beatOffsetMs: result.beatOffsetMs,
            analysisStatus: result.status,
            analysisUpdatedAt: result.updatedAt,
          });
        })
        .catch(() => {
          pendingAnalysisKeys.delete(analysisKey);
        });
    });

    return () => {
      cancelDeferredTask();
      if (!started) {
        pendingAnalysisKeys.delete(analysisKey);
      }
    };
  }, [
    audioAnalysisEnabled,
    isPlaying,
    streamingTrackAnalysisStatus,
    streamingTrackBpm,
    streamingTrackBpmConfidence,
    streamingTrackId,
    streamingTrackMediaType,
    streamingTrackProvider,
    streamingTrackProviderTrackId,
    streamingTrackQuality,
    updateTrackSnapshot,
  ]);

  useEffect(() => {
    void refreshCurrentTrackLiked();
  }, [refreshCurrentTrackLiked]);

  useEffect(() => {
    if (!trackId || currentTrack || hydratedTrackIdsRef.current.has(trackId)) {
      return;
    }

    const getTrack = window.echo?.library?.getTrack;
    if (typeof getTrack !== 'function') {
      return;
    }

    hydratedTrackIdsRef.current.add(trackId);
    let cancelled = false;
    void getTrack(trackId)
      .then((track) => {
        if (cancelled || !track) {
          return;
        }

        appendToQueue(track, { type: 'manual', label: 'Restored playback' });
        setQueueCurrentTrackId(track.id);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [appendToQueue, currentTrack, setQueueCurrentTrackId, trackId]);

  useEffect(() => {
    const mv = window.echo?.mv;

    if (!isPlaying || !trackId || currentTrack?.mediaType === 'streaming' || !mv || mvPreloadTrackRef.current === trackId) {
      return;
    }

    let cancelled = false;

    const cancelDeferredTask = deferNonCriticalPlaybackTask(() => {
      void (async () => {
        try {
          const settings = await mv.getSettings();
          if (cancelled || settings.enabled === false || !settings.autoPreload) {
            return;
          }

          mvPreloadTrackRef.current = trackId;
          const selected = await mv.getSelected(trackId);
          if (cancelled || selected) {
            return;
          }

          if (
            (currentTrack?.isTemporary || trackId.startsWith('dlna-receiver:') || trackId.startsWith('airplay-receiver:')) &&
            mv.searchNetworkCandidatesForSnapshot
          ) {
            await mv.searchNetworkCandidatesForSnapshot({
              trackId: currentTrack?.id ?? trackId,
              title: currentTrack?.title?.trim() || title,
              artist: currentTrack?.artist?.trim() || currentTrack?.albumArtist?.trim() || artist || 'Unknown Artist',
              album: currentTrack?.album || null,
              albumArtist: currentTrack?.albumArtist || null,
              durationSeconds: currentTrack?.duration && currentTrack.duration > 0 ? currentTrack.duration : null,
              coverThumb: currentTrack?.coverThumb ?? artworkUrl ?? null,
              mediaType: currentTrack?.mediaType ?? 'remote',
              query: [currentTrack?.title || title, currentTrack?.artist || currentTrack?.albumArtist || artist].filter(Boolean).join(' '),
            });
          } else {
            await mv.searchNetworkCandidates(trackId);
          }
          if (!cancelled && (await mv.getSelected(trackId))) {
            window.dispatchEvent(new CustomEvent('mv:changed', { detail: { trackId } }));
          }
        } catch {
          // MV preload should never interrupt audio playback.
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelDeferredTask();
    };
  }, [
    artist,
    artworkUrl,
    currentTrack?.album,
    currentTrack?.albumArtist,
    currentTrack?.artist,
    currentTrack?.coverThumb,
    currentTrack?.duration,
    currentTrack?.id,
    currentTrack?.isTemporary,
    currentTrack?.mediaType,
    currentTrack?.title,
    isPlaying,
    title,
    trackId,
  ]);

  useEffect(() => {
    let cancelled = false;
    const refreshSmtcSetting = (): void => {
      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            setSmtcEnabled(settings.smtcEnabled !== false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSmtcEnabled(true);
          }
        });
    };

    refreshSmtcSetting();
    window.addEventListener('settings:changed', refreshSmtcSetting);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshSmtcSetting);
    };
  }, []);

  useEffect(() => {
    window.addEventListener(likedTracksChangedEvent, refreshCurrentTrackLiked);
    return () => window.removeEventListener(likedTracksChangedEvent, refreshCurrentTrackLiked);
  }, [refreshCurrentTrackLiked]);

  useEffect(() => {
    applySharedPlaybackStatus(sharedPlaybackStatus);
  }, [applySharedPlaybackStatus, sharedPlaybackStatus]);

  useEffect(() => {
    let disposed = false;
    const connect = window.echo?.connect;
    const receiverStatusPromise = connect?.getReceiverStatus?.();
    void receiverStatusPromise?.then((status) => {
      if (!disposed) {
        setReceiverStatus(status);
      }
    }).catch(() => undefined);

    const unsubscribe = connect?.onReceiverStatus?.((status) => {
      setReceiverStatus(status);
      if (status.currentUri && ['ready', 'loading', 'playing', 'paused'].includes(status.state)) {
        setQueueCurrentTrackId(null);
      }
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [setQueueCurrentTrackId]);

  const runPlaybackAction = useCallback(
    async (action: () => Promise<PlaybackStatus | null>): Promise<void> => {
      try {
        const status = await action();
        if (status) {
          lastPlaybackActionStatusRef.current = {
            state: status.state,
            trackId: status.currentTrackId,
            filePath: status.filePath,
            updatedAtMs: performance.now(),
          };
          setPlaybackStatus(status);
          setAudioStatus((current) =>
            current
              ? {
                  ...current,
                  state: status.state,
                  currentTrackId: status.currentTrackId,
                  currentFilePath: status.filePath,
                  positionSeconds: status.positionMs / 1000,
                  durationSeconds: status.durationMs / 1000,
                }
              : current,
          );
          setQueueCurrentTrackId(status.currentTrackId);
          setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
          return;
        }
        await refreshStatus();
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        setError(formatAudioHostError(message));
        setPlaybackStatusSnapshot({ error: shouldSuppressAudioHostError(message) ? null : message });
      }
    },
    [refreshStatus, setQueueCurrentTrackId],
  );

  const handlePlayPause = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;

    if (isSpotifyCurrentTrack && currentTrack) {
      await runPlaybackAction(() =>
        visualState === 'playing' || visualState === 'loading'
          ? pauseSpotifyPlayback(currentTrack)
          : resumeSpotifyPlayback(currentTrack),
      );
      return;
    }

    if (!playback) {
      setError('Desktop bridge unavailable');
      return;
    }

    await runPlaybackAction(async () => {
      const latestStatus = await playback.getStatus();
      return latestStatus.state === 'playing' || latestStatus.state === 'loading' ? playback.pause() : playback.play();
    });
  }, [currentTrack, isSpotifyCurrentTrack, runPlaybackAction, visualState]);

  const handlePrevious = useCallback((): void => {
    void runPlaybackAction(queue.playPrevious);
  }, [queue.playPrevious, runPlaybackAction]);

  const handleNext = useCallback((): void => {
    void runPlaybackAction(queue.playNext);
  }, [queue.playNext, runPlaybackAction]);

  useEffect(() => {
    applyMediaSessionSnapshot({
      enabled: smtcEnabled && Boolean(filePath || currentTrack),
      title,
      artist,
      album: currentTrack?.album ?? null,
      artworkUrl,
      state: visualState,
      positionSeconds,
      durationSeconds,
      playbackRate: audioStatus?.playbackRate ?? 1,
    });
  }, [
    artist,
    audioStatus?.playbackRate,
    currentTrack,
    durationSeconds,
    filePath,
    artworkUrl,
    positionSeconds,
    smtcEnabled,
    visualState,
    title,
  ]);

  const handleCycleRepeatMode = useCallback((): void => {
    queue.setRepeatMode(queue.repeatMode === 'one' ? 'off' : 'one');
  }, [queue]);

  const handleOpenQueue = useCallback((): void => {
    window.dispatchEvent(new Event('app:navigate:queue'));
  }, []);

  const handleOpenLyrics = useCallback((): void => {
    rememberLyricsViewMode('lyrics');
    window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'lyrics' } }));
  }, []);

  const handleOpenMv = useCallback((): void => {
    rememberLyricsViewMode('mv');
    window.dispatchEvent(new CustomEvent('app:navigate:lyrics', { detail: { mode: 'mv' } }));
  }, []);

  const handleToggleCurrentTrackLiked = useCallback(async (): Promise<void> => {
    if (!trackId || (!isLibraryCurrentTrack && !isProviderLikedStreamingTrack) || !window.echo?.library) {
      return;
    }

    try {
      const previous = isCurrentTrackLiked;
      setIsCurrentTrackLiked(!previous);
      const result =
        isProviderLikedStreamingTrack && streamingTrackProviderTrackId && isProviderLikedStreamingProvider(streamingTrackProvider)
          ? await window.echo.streaming.setTrackLiked({
              provider: streamingTrackProvider,
              providerTrackId: streamingTrackProviderTrackId,
              liked: !previous,
            })
          : await window.echo.library.toggleTrackLiked(trackId);
      setIsCurrentTrackLiked(result.liked);
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : String(likeError));
      void refreshCurrentTrackLiked();
    }
  }, [
    isCurrentTrackLiked,
    isLibraryCurrentTrack,
    isProviderLikedStreamingTrack,
    refreshCurrentTrackLiked,
    streamingTrackProvider,
    streamingTrackProviderTrackId,
    trackId,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) {
        return;
      }

      if (isPlaybackShortcutTextTarget(event)) {
        return;
      }

      event.preventDefault();
      void handlePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handlePlayPause]);

  useEffect(() => {
    const currentQueueTrackId = queue.currentTrack?.id ?? queue.currentTrackId ?? null;
    const currentQueueFilePath = queue.currentTrack?.path ?? null;
    const endedMatchesCurrent =
      Boolean(endedStatusTrackId && currentQueueTrackId && endedStatusTrackId === currentQueueTrackId) ||
      Boolean(endedStatusFilePath && currentQueueFilePath && endedStatusFilePath === currentQueueFilePath) ||
      (!currentQueueTrackId && !currentQueueFilePath);
    const endedPlaybackKey = endedStatusTrackId ?? endedStatusFilePath ?? queue.currentQueueId ?? null;

    if (state !== 'ended' || !endedPlaybackKey || !endedMatchesCurrent || handledEndedTrackRef.current === endedPlaybackKey) {
      return;
    }

    handledEndedTrackRef.current = endedPlaybackKey;
    void runPlaybackAction(queue.playNext);
  }, [
    endedStatusFilePath,
    endedStatusTrackId,
    queue.currentQueueId,
    queue.currentTrack?.id,
    queue.currentTrack?.path,
    queue.currentTrackId,
    queue.playNext,
    runPlaybackAction,
    state,
  ]);

  useEffect(() => {
    if (state === 'playing') {
      handledEndedTrackRef.current = null;
    }
  }, [state, trackId]);

  const displayError = formatAudioHostError(error);

  const commitSeek = useCallback(
    async (nextPositionSeconds: number): Promise<void> => {
      const playback = window.echo?.playback;

      if (!playback || durationSeconds <= 0) {
        setSeekPreviewSeconds(null);
        return;
      }

      const safePositionSeconds = Math.min(durationSeconds, Math.max(0, nextPositionSeconds));

      try {
        setSeekPreviewSeconds(safePositionSeconds);
        seekAnchorRef.current = {
          positionSeconds: safePositionSeconds,
          trackKey: trackId ?? filePath ?? null,
          updatedAtMs: performance.now(),
        };
        if (isSpotifyCurrentTrack && currentTrack) {
          const status = await seekSpotifyPlayback(currentTrack, safePositionSeconds);
          setPlaybackStatus(status);
          setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
          dispatchPlaybackSeeked(safePositionSeconds, status.currentTrackId ?? trackId ?? null);
          return;
        }

        const status = await playback.seek(safePositionSeconds);
        const nextStatus = {
          ...status,
          positionMs: Math.round(safePositionSeconds * 1000),
        };
        setPlaybackStatus(nextStatus);
        setAudioStatus((current) =>
          current
            ? {
                ...current,
                state: status.state,
                currentTrackId: status.currentTrackId,
                currentFilePath: status.filePath,
                positionSeconds: safePositionSeconds,
                durationSeconds: status.durationMs / 1000,
              }
            : current,
        );
        setPlaybackStatusSnapshot({ playbackStatus: nextStatus, error: null });
        dispatchPlaybackSeeked(safePositionSeconds, status.currentTrackId ?? trackId ?? null);
        await refreshStatus();
      } catch (seekError) {
        const message = seekError instanceof Error ? seekError.message : String(seekError);
        setError(formatAudioHostError(message));
        setPlaybackStatusSnapshot({ error: shouldSuppressAudioHostError(message) ? null : message });
      } finally {
        setSeekPreviewSeconds(null);
      }
    },
    [currentTrack, durationSeconds, filePath, isSpotifyCurrentTrack, refreshStatus, trackId],
  );

  return (
    <footer className="player-bar" data-playback-state={visualState} aria-label="播放控制">
      {streamingDownloadNotice ? (
        <div className={`player-download-notice player-download-notice--${streamingDownloadNotice.tone}`} role="status" aria-live="polite">
          <div className="player-download-notice-copy">
            <strong>{streamingDownloadNotice.title}</strong>
            <span>{streamingDownloadNotice.detail}</span>
          </div>
          {streamingDownloadNotice.progress !== null ? (
            <div
              className="player-download-notice-progress"
              role="progressbar"
              aria-label="流媒体下载进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={streamingDownloadNotice.progress}
            >
              <span style={{ width: `${streamingDownloadNotice.progress}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="player-now">
        <button
          className="player-cover"
          data-empty={!artworkUrl}
          type="button"
          aria-label="打开歌词"
          title="打开歌词"
          onClick={handleOpenLyrics}
        >
          {artworkUrl ? (
            <img alt="" src={artworkUrl} />
          ) : (
            <div className="player-cover-placeholder">
              <span className="player-cover-disc" />
              <span className="player-cover-note" />
            </div>
          )}
          <div className="cover-sheen" />
        </button>
        <div className="player-track-copy">
          <PlayerMarqueeText kind="title" text={title} />
          <PlayerMarqueeText kind="subtitle" text={artist} />
          <PlayerStatusChips status={audioStatus} state={state} track={currentTrack} />
        </div>
      </div>

      <div className="player-center">
        <PlayerTransport
          canGoNext={queue.canGoNext}
          canGoPrevious={queue.canGoPrevious}
          isPlaying={isPlaying}
          isShuffleEnabled={queue.isShuffleEnabled}
          repeatMode={queue.repeatMode}
          onNext={handleNext}
          onPlayPause={() => void handlePlayPause()}
          onPrevious={handlePrevious}
          onCycleRepeatMode={handleCycleRepeatMode}
          onOpenQueue={handleOpenQueue}
          onOpenLyrics={handleOpenLyrics}
          onOpenMv={handleOpenMv}
          onToggleShuffle={queue.toggleShuffle}
          isCurrentTrackLiked={isCurrentTrackLiked}
          canLikeCurrentTrack={Boolean(trackId && (isLibraryCurrentTrack || isProviderLikedStreamingTrack))}
          onToggleCurrentTrackLiked={() => void handleToggleCurrentTrackLiked()}
        />
        <PlayerProgress
          disabled={!filePath && !isSpotifyCurrentTrack}
          durationSeconds={durationSeconds}
          positionSeconds={positionSeconds}
          onCommit={(nextPositionSeconds) => void commitSeek(nextPositionSeconds)}
        />
        {displayError ? <span className="player-error">{displayError}</span> : null}
      </div>

      <div className="output-status">
        <PlayerVolumeControl
          status={audioStatus}
          isOpen={openPopover === 'volume'}
          onError={setError}
          onOpenChange={(isOpen) => setOpenPopover(isOpen ? 'volume' : null)}
          onStatusChange={setAudioStatus}
          onCommitVolume={isSpotifyCurrentTrack ? setSpotifyVolume : undefined}
        />
        {!isSpotifyCurrentTrack ? (
          <PlayerSpeedControl
            status={audioStatus}
            isOpen={openPopover === 'speed'}
            onError={setError}
            onOpenChange={(isOpen) => setOpenPopover(isOpen ? 'speed' : null)}
            onStatusChange={setAudioStatus}
          />
        ) : null}
        {isCurrentStreamingTrack ? (
          <button
            className="icon-button"
            type="button"
            aria-label="下载当前流媒体"
            title={
              canDownloadCurrentStreamingTrack
                ? isCurrentStreamingDownloadBusy
                  ? '正在准备或下载'
                  : '下载当前流媒体'
                : currentStreamingDownloadProvider === 'spotify'
                  ? 'Spotify 不支持下载'
                  : '当前流媒体源不支持下载'
            }
            disabled={!canDownloadCurrentStreamingTrack || isCurrentStreamingDownloadBusy}
            onClick={() => void handleDownloadCurrentStreamingTrack()}
          >
            {isStreamingDownloadResolving || streamingDownloadJobId ? (
              <Loader2 className="spinning-icon" size={17} />
            ) : (
              <Download size={17} />
            )}
          </button>
        ) : null}
        <button className="icon-button" type="button" aria-label="音频控制" title="音频控制" onClick={onOpenAudioSettings}>
          <Import size={17} />
        </button>
      </div>
    </footer>
  );
};
