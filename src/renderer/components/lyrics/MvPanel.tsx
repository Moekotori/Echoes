import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { FastForward, Film, Music2, Rewind, RotateCcw } from 'lucide-react';
import type { AudioPlaybackState } from '../../../shared/types/audio';
import type { MvSettings, TrackVideo } from '../../../shared/types/mv';
import type { StreamingMvItem, StreamingProviderName } from '../../../shared/types/streaming';

export type MvAudioClock = {
  positionSeconds: number;
  updatedAtMs: number;
  playbackRate: number;
  durationSeconds: number | null;
  state: AudioPlaybackState;
};

type MvPanelProps = {
  trackId: string | null;
  streamingTarget?: {
    provider: StreamingProviderName;
    providerTrackId: string;
  } | null;
  title: string;
  artist: string;
  coverUrl: string | null;
  hideFallbackTrackInfo?: boolean;
  isAudioPlaying: boolean;
  audioClock: MvAudioClock;
};

type BrowserShaka = {
  Player: new (video: HTMLVideoElement) => {
    load: (url: string) => Promise<void>;
    destroy: () => Promise<void>;
  };
};

type ShakaPlayerInstance = {
  load: (url: string) => Promise<void>;
  destroy: () => Promise<void>;
};

const fallbackMvSettings: MvSettings = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  autoApplyThreshold: 0.7,
  immersiveBackground: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
  lyricsReadabilityEnhanced: false,
  restartAudioOnLoad: false,
  replayAudioOnChange: true,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: 'max',
  allow60fps: true,
};

const isAdaptiveStream = (video: TrackVideo | null): boolean =>
  Boolean(
    video?.mimeType &&
      (video.mimeType.includes('mpegurl') ||
        video.mimeType.includes('dash') ||
        video.mimeType.includes('application/vnd.apple.mpegurl')),
  );

const mvSyncDriftThresholdSeconds = 0.8;
const mvSyncCorrectionCooldownMs = 1000;
const playbackSeekedEvent = 'playback:seeked';
const mvEndedBeforeAudioEvent = 'mv:ended-before-audio';
const mvSettingsKeys = [
  'enabled',
  'autoSearch',
  'autoPreload',
  'autoApplyThreshold',
  'immersiveBackground',
  'immersiveBackgroundScalePercent',
  'immersiveBackgroundOffsetXPercent',
  'immersiveBackgroundOffsetYPercent',
  'immersiveBackgroundBlurPx',
  'immersiveBackgroundBrightnessPercent',
  'immersiveBackgroundOverlayOpacityPercent',
  'lyricsReadabilityEnhanced',
  'restartAudioOnLoad',
  'replayAudioOnChange',
  'enabledProviders',
  'providerOrder',
  'maxQuality',
  'allow60fps',
] satisfies Array<keyof MvSettings>;
const mvReloadSettingsKeys = [
  'enabled',
  'autoSearch',
  'autoPreload',
  'enabledProviders',
  'providerOrder',
  'maxQuality',
  'allow60fps',
] satisfies Array<keyof MvSettings>;

type PlaybackSeekedDetail = {
  positionSeconds?: unknown;
  trackId?: unknown;
};

const isObjectPatch = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isMvSettingsPatch = (value: unknown): value is Partial<MvSettings> => {
  if (!isObjectPatch(value)) {
    return false;
  }

  return Object.keys(value).some((key) => mvSettingsKeys.includes(key as keyof MvSettings));
};

const shouldReloadMvSelection = (value: unknown): boolean => {
  if (!isObjectPatch(value)) {
    return true;
  }

  return Object.keys(value).some((key) =>
    mvReloadSettingsKeys.includes(key as (typeof mvReloadSettingsKeys)[number]),
  );
};

const normalizeAudioPosition = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const normalizePlaybackRate = (value: number | undefined): number => {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
};

const normalizeAudioClock = (clock: MvAudioClock): MvAudioClock => ({
  positionSeconds: normalizeAudioPosition(clock.positionSeconds),
  updatedAtMs: Number.isFinite(clock.updatedAtMs) ? clock.updatedAtMs : performance.now(),
  playbackRate: normalizePlaybackRate(clock.playbackRate),
  durationSeconds:
    clock.durationSeconds && Number.isFinite(clock.durationSeconds) && clock.durationSeconds > 0
      ? clock.durationSeconds
      : null,
  state: clock.state,
});

const estimateAudioClockPositionSeconds = (clock: MvAudioClock, nowMs = performance.now()): number => {
  const normalizedClock = normalizeAudioClock(clock);
  const elapsedSeconds =
    normalizedClock.state === 'playing'
      ? Math.max(0, (nowMs - normalizedClock.updatedAtMs) / 1000) * normalizedClock.playbackRate
      : 0;
  const positionSeconds = normalizedClock.positionSeconds + elapsedSeconds;

  return normalizedClock.durationSeconds
    ? Math.min(positionSeconds, normalizedClock.durationSeconds)
    : positionSeconds;
};

const formatOffset = (offsetMs: number): string => {
  if (offsetMs === 0) {
    return '0ms';
  }

  return `${offsetMs > 0 ? '+' : ''}${offsetMs}ms`;
};

const clampOffset = (value: number): number => Math.max(-10000, Math.min(10000, Math.round(value)));

const targetVideoTimeForAudio = (video: HTMLVideoElement, audioClock: MvAudioClock, offsetMs = 0): number => {
  const position = normalizeAudioPosition(estimateAudioClockPositionSeconds(audioClock));
  const offsetPosition = normalizeAudioPosition(position + offsetMs / 1000);
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) {
    return offsetPosition % duration;
  }

  return offsetPosition;
};

const getVideoDriftSeconds = (video: HTMLVideoElement, targetTime: number): number => {
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const rawDrift = Math.abs(currentTime - targetTime);
  const duration = Number(video.duration);

  if (video.loop && Number.isFinite(duration) && duration > 0) {
    return Math.min(rawDrift, Math.abs(duration - rawDrift));
  }

  return rawDrift;
};

const playVideo = (video: HTMLVideoElement): void => {
  try {
    const result = video.play();
    if (result && typeof result.catch === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // Autoplay or provider failures should degrade only the MV surface.
  }
};

const streamingTrackKey = (target: { provider: StreamingProviderName; providerTrackId: string }): string =>
  `streaming:${target.provider}:${target.providerTrackId}`;

const uniqueCoverUrls = (...urls: Array<string | null | undefined>): string[] =>
  Array.from(new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url))));

const dispatchMvEndedBeforeAudio = (trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(mvEndedBeforeAudioEvent, { detail: { trackId } }));
};

const CoverFallback = ({
  artist,
  coverUrls,
  hideTrackInfo = false,
  status,
  title,
}: {
  artist: string;
  coverUrls: string[];
  hideTrackInfo?: boolean;
  status: string;
  title: string;
}): JSX.Element => {
  const coverKey = coverUrls.join('\n');
  const [failedCoverUrls, setFailedCoverUrls] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFailedCoverUrls(new Set());
  }, [coverKey]);

  const coverUrl = coverUrls.find((url) => !failedCoverUrls.has(url)) ?? null;
  const handleCoverError = useCallback((): void => {
    if (!coverUrl) {
      return;
    }

    setFailedCoverUrls((current) => {
      const next = new Set(current);
      next.add(coverUrl);
      return next;
    });
  }, [coverUrl]);

  return (
    <div className="lyrics-mv-card" data-cover={Boolean(coverUrl)} data-hide-track-info={hideTrackInfo ? 'true' : undefined}>
      <div className="lyrics-mv-card-backdrop" aria-hidden="true">
        {coverUrl ? <img alt="" draggable={false} src={coverUrl} onError={handleCoverError} /> : null}
      </div>
      <div className="lyrics-mv-artwork">
        {coverUrl ? (
          <img alt="" draggable={false} src={coverUrl} onError={handleCoverError} />
        ) : (
          <div className="lyrics-mv-placeholder" aria-hidden="true">
            <Music2 size={46} />
          </div>
        )}
      </div>
      <div className="lyrics-mv-copy">
        <span>
          <Film size={15} />
          {status}
        </span>
        {hideTrackInfo ? null : (
          <>
            <strong>{title}</strong>
            <em>{artist}</em>
          </>
        )}
      </div>
    </div>
  );
};

export const MvPanel = ({
  artist,
  audioClock,
  coverUrl,
  hideFallbackTrackInfo = false,
  isAudioPlaying,
  streamingTarget = null,
  title,
  trackId,
}: MvPanelProps): JSX.Element => {
  const [selectedVideo, setSelectedVideo] = useState<TrackVideo | null>(null);
  const [settings, setSettings] = useState<MvSettings>(fallbackMvSettings);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(() => !window.echo?.mv);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [isMvOffsetSaving, setIsMvOffsetSaving] = useState(false);
  const requestRef = useRef(0);
  const preloadAttemptRef = useRef<string | null>(null);
  const lastVideoSyncAtRef = useRef(0);
  const videoSeekingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundDragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const isAudioPlayingRef = useRef(isAudioPlaying);
  const previousAudioPlayingRef = useRef(isAudioPlaying);
  const previousAudioSyncPlayingRef = useRef(isAudioPlaying);
  const audioClockRef = useRef(normalizeAudioClock(audioClock));
  const previousAudioClockRef = useRef(normalizeAudioClock(audioClock));
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    audioClockRef.current = normalizeAudioClock(audioClock);
  }, [audioClock]);

  const applyVideoPlaybackRate = useCallback((video: HTMLVideoElement): void => {
    try {
      video.playbackRate = audioClockRef.current.playbackRate;
    } catch {
      // Video rate support varies by stream/provider; MV failures must not interrupt audio.
    }
  }, []);

  useEffect(() => {
    audioClockRef.current = normalizeAudioClock(audioClock);
    if (videoRef.current) {
      applyVideoPlaybackRate(videoRef.current);
    }
    if (backgroundVideoRef.current) {
      applyVideoPlaybackRate(backgroundVideoRef.current);
    }
  }, [applyVideoPlaybackRate, audioClock]);

  const loadSettings = useCallback(async (): Promise<MvSettings> => {
    if (!window.echo?.mv?.getSettings) {
      setSettings(fallbackMvSettings);
      setHasLoadedSettings(true);
      return fallbackMvSettings;
    }

    try {
      const nextSettings = await window.echo.mv.getSettings();
      setSettings(nextSettings);
      setHasLoadedSettings(true);
      return nextSettings;
    } catch {
      setSettings(fallbackMvSettings);
      setHasLoadedSettings(true);
      return fallbackMvSettings;
    }
  }, []);

  const patchSettings = useCallback(
    async (patch: Partial<MvSettings>): Promise<void> => {
      setSettings((current) => ({ ...current, ...patch }));
      try {
        if (window.echo?.mv?.setSettings) {
          setSettings(await window.echo.mv.setSettings(patch));
          window.dispatchEvent(new CustomEvent('settings:changed', { detail: patch }));
        }
      } catch {
        void loadSettings();
      }
    },
    [loadSettings],
  );

  const resolveNetworkVideo = useCallback(async (video: TrackVideo | null): Promise<TrackVideo | null> => {
    if (!video || video.provider === 'local' || !window.echo?.mv?.resolveStreams) {
      return video;
    }

    try {
      const resolved = await window.echo.mv.resolveStreams(video.id);
      return resolved.video;
    } catch {
      return video;
    }
  }, []);

  const loadSelected = useCallback(async (options: { preserveCurrent?: boolean } = {}): Promise<void> => {
    if (streamingTarget) {
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!options.preserveCurrent) {
      setSelectedVideo(null);
    }
    setIsLoading(Boolean(trackId && window.echo?.mv));
    setError(null);
    setVideoError(false);

    if (!trackId || !window.echo?.mv) {
      setIsLoading(false);
      return;
    }

    try {
      const nextSettings = await loadSettings();
      if (nextSettings.enabled === false) {
        if (requestRef.current !== requestId) {
          return;
        }
        setSelectedVideo(null);
        setIsLoading(false);
        return;
      }
      let video = await window.echo.mv.getSelected(trackId);
      if (!video && nextSettings.autoPreload && isAudioPlayingRef.current && preloadAttemptRef.current !== trackId) {
        preloadAttemptRef.current = trackId;
        await window.echo.mv.searchNetworkCandidates?.(trackId);
        video = await window.echo.mv.getSelected(trackId);
      }
      const resolvedVideo = await resolveNetworkVideo(video);
      if (requestRef.current !== requestId) {
        return;
      }
      setSelectedVideo(resolvedVideo);
    } catch (loadError) {
      if (requestRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setSelectedVideo(null);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [loadSettings, resolveNetworkVideo, streamingTarget, trackId]);

  useEffect(() => {
    if (!streamingTarget) {
      return;
    }

    const effectiveTrackId = trackId ?? streamingTrackKey(streamingTarget);
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSelectedVideo(null);
    setIsLoading(true);
    setError(null);
    setVideoError(false);

    void (async () => {
      const nextSettings = await loadSettings();
      if (requestRef.current !== requestId || nextSettings.enabled === false) {
        return;
      }

      const mvApi = window.echo?.mv;
      let video = await mvApi?.getSelected?.(effectiveTrackId) ?? null;
      if (!video && mvApi?.searchNetworkCandidatesForSnapshot && mvApi.selectVideo) {
        let streamingMvItems: StreamingMvItem[] = [];
        try {
          const streamingMv = await window.echo?.streaming?.getMv?.(streamingTarget);
          streamingMvItems = streamingMv?.status === 'available' ? streamingMv.items : [];
        } catch {
          streamingMvItems = [];
        }

        const searchTargets =
          streamingMvItems.length > 0
            ? streamingMvItems
            : [
                {
                  title,
                  artist,
                  duration: audioClockRef.current.durationSeconds,
                  thumbnailUrl: coverUrl,
                },
              ];

        for (const item of searchTargets) {
          const candidates = await mvApi.searchNetworkCandidatesForSnapshot({
            trackId: effectiveTrackId,
            title: item.title,
            artist: item.artist || artist,
            durationSeconds: item.duration ?? audioClockRef.current.durationSeconds,
            coverThumb: item.thumbnailUrl ?? coverUrl,
            mediaType: 'streaming',
            query: [item.title, item.artist || artist].filter(Boolean).join(' '),
          });
          const candidate = candidates.find((entry) => entry.playableInApp) ?? candidates[0] ?? null;
          if (candidate) {
            video = await mvApi.selectVideo(effectiveTrackId, candidate.id);
            break;
          }
        }
      }

      const resolvedVideo = await resolveNetworkVideo(video);
      if (requestRef.current === requestId) {
        setSelectedVideo(resolvedVideo);
      }
    })()
      .catch((loadError) => {
        if (requestRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          setSelectedVideo(null);
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setIsLoading(false);
        }
      });
  }, [artist, coverUrl, loadSettings, resolveNetworkVideo, streamingTarget, title, trackId]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  useEffect(() => {
    const wasAudioPlaying = previousAudioPlayingRef.current;
    previousAudioPlayingRef.current = isAudioPlaying;

    if (!isAudioPlaying || wasAudioPlaying || selectedVideo || !trackId || preloadAttemptRef.current === trackId) {
      return;
    }

    void loadSelected();
  }, [isAudioPlaying, loadSelected, selectedVideo, trackId]);

  useEffect(() => {
    const handleMvChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ trackId?: string | null }>).detail;
      if (!detail?.trackId || detail.trackId === trackId) {
        void loadSelected({ preserveCurrent: true });
      }
    };

    window.addEventListener('mv:changed', handleMvChanged);
    return () => window.removeEventListener('mv:changed', handleMvChanged);
  }, [loadSelected, trackId]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event): void => {
      const patch = event instanceof CustomEvent ? event.detail : null;
      if (patch && !isMvSettingsPatch(patch)) {
        return;
      }

      void loadSettings().then((nextSettings) => {
        if (nextSettings.enabled === false) {
          setSelectedVideo(null);
          setVideoError(false);
          return;
        }

        if (shouldReloadMvSelection(patch)) {
          void loadSelected();
        }
      });
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, [loadSelected, loadSettings]);

  const isMvEnabled = settings.enabled !== false;
  const selectedMvOffsetMs = clampOffset(Number(selectedVideo?.offsetMs ?? 0));
  const videoMediaUrl = isMvEnabled && selectedVideo?.playableInApp && selectedVideo.mediaUrl && !videoError ? selectedVideo.mediaUrl : null;
  const showVideo = Boolean(videoMediaUrl);
  const shouldSurfaceSelectedFallback = Boolean(
    selectedVideo && (videoError || selectedVideo.playableInApp || selectedVideo.sourceType === 'manual'),
  );
  const adaptiveStream = isAdaptiveStream(selectedVideo);
  const showImmersiveBackground = Boolean(settings.immersiveBackground !== false && showVideo);
  const immersiveBackgroundStyle = useMemo(
    () =>
      ({
        '--mv-immersive-scale': ((settings.immersiveBackgroundScalePercent ?? 115) / 100).toFixed(2),
        '--mv-immersive-position-x': `${settings.immersiveBackgroundOffsetXPercent ?? 50}%`,
        '--mv-immersive-position-y': `${settings.immersiveBackgroundOffsetYPercent ?? 50}%`,
        '--mv-immersive-blur': `${settings.immersiveBackgroundBlurPx ?? 0}px`,
        '--mv-immersive-brightness': `${settings.immersiveBackgroundBrightnessPercent ?? 100}%`,
        '--mv-immersive-overlay-opacity': ((settings.immersiveBackgroundOverlayOpacityPercent ?? 0) / 100).toFixed(2),
      }) as CSSProperties,
    [
      settings.immersiveBackgroundBlurPx,
      settings.immersiveBackgroundBrightnessPercent,
      settings.immersiveBackgroundOffsetXPercent,
      settings.immersiveBackgroundOffsetYPercent,
      settings.immersiveBackgroundOverlayOpacityPercent,
      settings.immersiveBackgroundScalePercent,
    ],
  );

  const updateImmersiveOffsetFromDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>, shouldPersist = false): void => {
      const drag = backgroundDragRef.current;
      if (!drag) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const nextX = Math.max(0, Math.min(100, Math.round(drag.offsetX + ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100)));
      const nextY = Math.max(0, Math.min(100, Math.round(drag.offsetY + ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100)));
      setSettings((current) => ({
        ...current,
        immersiveBackgroundOffsetXPercent: nextX,
        immersiveBackgroundOffsetYPercent: nextY,
      }));

      if (shouldPersist) {
        void patchSettings({
          immersiveBackgroundOffsetXPercent: nextX,
          immersiveBackgroundOffsetYPercent: nextY,
        });
      }
    },
    [patchSettings],
  );

  useEffect(() => {
    isAudioPlayingRef.current = isAudioPlaying;
  }, [isAudioPlaying]);

  useEffect(() => {
    preloadAttemptRef.current = null;
    lastVideoSyncAtRef.current = 0;
    videoSeekingRef.current = false;
    previousAudioClockRef.current = normalizeAudioClock(audioClockRef.current);
  }, [trackId]);

  const syncVideoElementToAudio = useCallback((video: HTMLVideoElement | null, options: { force?: boolean; bypassCooldown?: boolean; recordCooldown?: boolean } = {}): boolean => {
    const followMusicProgress = settingsRef.current.restartAudioOnLoad;
    if (!followMusicProgress || !video || videoSeekingRef.current) {
      return false;
    }

    const targetTime = targetVideoTimeForAudio(video, audioClockRef.current, selectedVideo?.offsetMs ?? 0);
    const drift = getVideoDriftSeconds(video, targetTime);
    const now = Date.now();

    if (!options.force && drift <= mvSyncDriftThresholdSeconds) {
      return false;
    }

    if (!options.force && !options.bypassCooldown && now - lastVideoSyncAtRef.current < mvSyncCorrectionCooldownMs) {
      return false;
    }

    try {
      video.currentTime = targetTime;
      if (options.recordCooldown !== false) {
        lastVideoSyncAtRef.current = now;
      }
      return true;
    } catch {
      return false;
    }
  }, [selectedVideo?.offsetMs]);

  const syncVideoToAudio = useCallback((options: { force?: boolean; bypassCooldown?: boolean } = {}): boolean => {
    const foregroundSynced = syncVideoElementToAudio(videoRef.current, options);
    const backgroundSynced = syncVideoElementToAudio(backgroundVideoRef.current, { ...options, recordCooldown: false });
    return foregroundSynced || backgroundSynced;
  }, [syncVideoElementToAudio]);

  const handleMvOffsetChange = useCallback(
    async (nextOffsetMs: number): Promise<void> => {
      const mvApi = window.echo?.mv;
      if (!mvApi?.setOffset || !trackId) {
        return;
      }

      const clampedOffset = clampOffset(nextOffsetMs);
      setSelectedVideo((current) => (current ? { ...current, offsetMs: clampedOffset } : current));
      try {
        setIsMvOffsetSaving(true);
        const nextVideo = await mvApi.setOffset(trackId, clampedOffset);
        if (nextVideo) {
          setSelectedVideo(await resolveNetworkVideo(nextVideo));
        }
        syncVideoToAudio({ force: true, bypassCooldown: true });
      } catch {
        void loadSelected();
      } finally {
        setIsMvOffsetSaving(false);
      }
    },
    [loadSelected, resolveNetworkVideo, syncVideoToAudio, trackId],
  );

  const mvOffsetControls = useMemo(() => {
    if (!trackId || !selectedVideo || !showVideo || settings.restartAudioOnLoad !== true) {
      return null;
    }

    const offsetSteps = [-500, -100, 100, 500];
    return (
      <section className="mv-offset-controls" aria-label="MV sync">
        <span className="mv-offset-label">本歌曲 MV 延迟</span>
        <span className="mv-offset-value">{formatOffset(selectedMvOffsetMs)}</span>
        <div className="mv-offset-buttons">
          {offsetSteps.map((step) => {
            const nextOffsetMs = clampOffset(selectedMvOffsetMs + step);
            const isForward = step > 0;
            return (
              <button
                type="button"
                key={step}
                disabled={isMvOffsetSaving || nextOffsetMs === selectedMvOffsetMs}
                title={step > 0 ? `MV earlier ${step}ms` : `MV later ${Math.abs(step)}ms`}
                onClick={() => void handleMvOffsetChange(nextOffsetMs)}
              >
                {isForward ? <FastForward size={14} /> : <Rewind size={14} />}
                <span>{step > 0 ? '+' : ''}{step}ms</span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={isMvOffsetSaving || selectedMvOffsetMs === 0}
            title="Reset MV offset"
            onClick={() => void handleMvOffsetChange(0)}
          >
            <RotateCcw size={14} />
            <span>0ms</span>
          </button>
        </div>
        <p>只保存到当前这首歌的 MV；换歌后不会影响其他歌曲。</p>
      </section>
    );
  }, [handleMvOffsetChange, isMvOffsetSaving, selectedMvOffsetMs, selectedVideo, settings.restartAudioOnLoad, showVideo, trackId]);

  useEffect(() => {
    const wasAudioPlaying = previousAudioSyncPlayingRef.current;
    previousAudioSyncPlayingRef.current = isAudioPlaying;

    if (showVideo && isAudioPlaying && !wasAudioPlaying) {
      syncVideoToAudio({ force: true, bypassCooldown: true });
    }
  }, [isAudioPlaying, showVideo, syncVideoToAudio]);

  useEffect(() => {
    if (!showVideo || !videoRef.current) {
      return;
    }

    applyVideoPlaybackRate(videoRef.current);

    if (isAudioPlaying) {
      syncVideoToAudio({ force: true, bypassCooldown: true });
      playVideo(videoRef.current);
      return;
    }

    videoRef.current.pause();
  }, [applyVideoPlaybackRate, isAudioPlaying, showVideo, syncVideoToAudio, videoMediaUrl]);

  useEffect(() => {
    if (!showImmersiveBackground || !backgroundVideoRef.current) {
      return;
    }

    applyVideoPlaybackRate(backgroundVideoRef.current);

    if (isAudioPlaying) {
      syncVideoToAudio({ force: true, bypassCooldown: true });
      playVideo(backgroundVideoRef.current);
      return;
    }

    backgroundVideoRef.current.pause();
  }, [applyVideoPlaybackRate, isAudioPlaying, showImmersiveBackground, syncVideoToAudio, videoMediaUrl]);

  useEffect(() => {
    const nextClock = normalizeAudioClock(audioClock);
    const positionJumped = Math.abs(nextClock.positionSeconds - previousAudioClockRef.current.positionSeconds) > 2;
    audioClockRef.current = nextClock;
    previousAudioClockRef.current = nextClock;

    if (!showVideo) {
      return;
    }

    syncVideoToAudio({ bypassCooldown: positionJumped });
  }, [audioClock, showVideo, syncVideoToAudio]);

  useEffect(() => {
    const handlePlaybackSeeked = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as PlaybackSeekedDetail | null) : null;
      const eventTrackId = typeof detail?.trackId === 'string' && detail.trackId.trim() ? detail.trackId : null;
      if (eventTrackId && eventTrackId !== trackId) {
        return;
      }

      const positionSeconds = Number(detail?.positionSeconds);
      if (!Number.isFinite(positionSeconds)) {
        return;
      }

      const nextPosition = normalizeAudioPosition(positionSeconds);
      const nextClock = normalizeAudioClock({
        ...audioClockRef.current,
        positionSeconds: nextPosition,
        updatedAtMs: performance.now(),
      });
      audioClockRef.current = nextClock;
      previousAudioClockRef.current = nextClock;
      syncVideoToAudio({ force: true, bypassCooldown: true });
    };

    window.addEventListener(playbackSeekedEvent, handlePlaybackSeeked);
    return () => window.removeEventListener(playbackSeekedEvent, handlePlaybackSeeked);
  }, [syncVideoToAudio, trackId]);

  useEffect(() => {
    lastVideoSyncAtRef.current = 0;
    videoSeekingRef.current = false;
  }, [videoMediaUrl]);

  useEffect(() => {
    if (showVideo) {
      syncVideoToAudio({ force: true, bypassCooldown: true });
    }
  }, [selectedMvOffsetMs, showVideo, syncVideoToAudio]);

  useEffect(() => {
    if (!showVideo || !adaptiveStream || !videoMediaUrl || !videoRef.current) {
      return undefined;
    }

    let disposed = false;
    let player: ShakaPlayerInstance | null = null;
    const videoElement = videoRef.current;

    void import('shaka-player')
      .then((module) => {
        const shaka = ((module as { default?: BrowserShaka }).default ?? module) as BrowserShaka;
        if (disposed || !shaka?.Player) {
          return;
        }

        player = new shaka.Player(videoElement);
        return player.load(videoMediaUrl).then(() => {
          applyVideoPlaybackRate(videoElement);
          syncVideoToAudio({ force: true, bypassCooldown: true });
          if (isAudioPlayingRef.current) {
            playVideo(videoElement);
            return undefined;
          }

          videoElement.pause();
          return undefined;
        });
      })
      .catch(() => setVideoError(true));

    return () => {
      disposed = true;
      if (player) {
        void player.destroy();
      }
    };
  }, [adaptiveStream, applyVideoPlaybackRate, showVideo, syncVideoToAudio, videoMediaUrl]);

  useEffect(() => {
    if (!showImmersiveBackground || !adaptiveStream || !videoMediaUrl || !backgroundVideoRef.current) {
      return undefined;
    }

    let disposed = false;
    let player: ShakaPlayerInstance | null = null;
    const videoElement = backgroundVideoRef.current;

    void import('shaka-player')
      .then((module) => {
        const shaka = ((module as { default?: BrowserShaka }).default ?? module) as BrowserShaka;
        if (disposed || !shaka?.Player) {
          return;
        }

        player = new shaka.Player(videoElement);
        return player.load(videoMediaUrl).then(() => {
          applyVideoPlaybackRate(videoElement);
          syncVideoToAudio({ force: true, bypassCooldown: true });
          if (isAudioPlayingRef.current) {
            playVideo(videoElement);
            return undefined;
          }

          videoElement.pause();
          return undefined;
        });
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (player) {
        void player.destroy();
      }
    };
  }, [adaptiveStream, applyVideoPlaybackRate, showImmersiveBackground, syncVideoToAudio, videoMediaUrl]);

  if (!hasLoadedSettings || !isMvEnabled) {
    return <section className="lyrics-mv-panel" aria-label="MV" data-mv-enabled="false" />;
  }

  return (
    <>
      {showImmersiveBackground ? (
        <div
          className="lyrics-mv-background"
          aria-hidden="true"
          data-lyrics-readability={settings.lyricsReadabilityEnhanced === true ? 'true' : undefined}
          style={immersiveBackgroundStyle}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            backgroundDragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              offsetX: settings.immersiveBackgroundOffsetXPercent ?? 50,
              offsetY: settings.immersiveBackgroundOffsetYPercent ?? 50,
            };
            event.currentTarget.dataset.dragging = 'true';
          }}
          onPointerMove={(event) => updateImmersiveOffsetFromDrag(event)}
          onPointerUp={(event) => {
            updateImmersiveOffsetFromDrag(event, true);
            event.currentTarget.releasePointerCapture(event.pointerId);
            event.currentTarget.dataset.dragging = 'false';
            backgroundDragRef.current = null;
          }}
          onPointerCancel={(event) => {
            event.currentTarget.dataset.dragging = 'false';
            backgroundDragRef.current = null;
          }}
        >
          <video
            ref={backgroundVideoRef}
            className="lyrics-mv-background-video"
            src={!adaptiveStream ? (videoMediaUrl ?? undefined) : undefined}
            autoPlay={isAudioPlaying}
            loop
            muted
            onLoadedMetadata={(event) => {
              applyVideoPlaybackRate(event.currentTarget);
              syncVideoToAudio({ force: true, bypassCooldown: true });
              if (isAudioPlayingRef.current) {
                playVideo(event.currentTarget);
                return;
              }

              event.currentTarget.pause();
            }}
            playsInline
          />
        </div>
      ) : null}

      <section className="lyrics-mv-panel" aria-label="MV" data-immersive-active={showImmersiveBackground} data-mv-enabled="true">
      <div className="lyrics-mv-ambient" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />

      {showVideo ? (
        <div className="lyrics-mv-player">
          <video
            ref={videoRef}
            className="lyrics-mv-video"
            src={!adaptiveStream ? (videoMediaUrl ?? undefined) : undefined}
            autoPlay={isAudioPlaying}
            muted
            onError={() => setVideoError(true)}
            onEnded={() => {
              if (isAudioPlayingRef.current) {
                dispatchMvEndedBeforeAudio(trackId);
              }
            }}
            onLoadedMetadata={(event) => {
              applyVideoPlaybackRate(event.currentTarget);
              syncVideoToAudio({ force: true, bypassCooldown: true });
              if (isAudioPlayingRef.current) {
                playVideo(event.currentTarget);
                return;
              }

              event.currentTarget.pause();
            }}
            onSeeking={() => {
              videoSeekingRef.current = true;
            }}
            onSeeked={() => {
              videoSeekingRef.current = false;
            }}
            playsInline
          />
        </div>
      ) : (
        <CoverFallback
          artist={artist}
          coverUrls={uniqueCoverUrls(shouldSurfaceSelectedFallback ? selectedVideo?.thumbnailUrl : null, coverUrl)}
          hideTrackInfo={hideFallbackTrackInfo}
          status={
            isMvEnabled
              ? selectedVideo
                ? videoError && shouldSurfaceSelectedFallback
                  ? 'Playback failed'
                  : shouldSurfaceSelectedFallback
                    ? 'External player required'
                    : 'MV unavailable'
                : isLoading
                  ? 'Loading MV'
                  : 'MV unavailable'
              : 'MV disabled'
          }
          title={(shouldSurfaceSelectedFallback ? selectedVideo?.title : null) ?? title}
        />
      )}

      {mvOffsetControls}
      {error ? <p className="lyrics-mv-error">{error}</p> : null}
      </section>
    </>
  );
};
