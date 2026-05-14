import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { Film, Music2 } from 'lucide-react';
import type { AudioPlaybackState } from '../../../shared/types/audio';
import type { MvSettings, TrackVideo } from '../../../shared/types/mv';
import type { StreamingMvResult, StreamingProviderName } from '../../../shared/types/streaming';

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
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
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

type PlaybackSeekedDetail = {
  positionSeconds?: unknown;
  trackId?: unknown;
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

const targetVideoTimeForAudio = (video: HTMLVideoElement, audioClock: MvAudioClock): number => {
  const position = normalizeAudioPosition(estimateAudioClockPositionSeconds(audioClock));
  const duration = Number(video.duration);
  if (video.loop && Number.isFinite(duration) && duration > 0) {
    return position % duration;
  }

  return position;
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

const CoverFallback = ({
  artist,
  coverUrl,
  status,
  title,
}: {
  artist: string;
  coverUrl: string | null;
  status: string;
  title: string;
}): JSX.Element => (
  <div className="lyrics-mv-card" data-cover={Boolean(coverUrl)}>
    <div className="lyrics-mv-card-backdrop" aria-hidden="true">
      {coverUrl ? <img alt="" draggable={false} src={coverUrl} /> : null}
    </div>
    <div className="lyrics-mv-artwork">
      {coverUrl ? (
        <img alt="" draggable={false} src={coverUrl} />
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
      <strong>{title}</strong>
      <em>{artist}</em>
    </div>
  </div>
);

export const MvPanel = ({
  artist,
  audioClock,
  coverUrl,
  isAudioPlaying,
  streamingTarget = null,
  title,
  trackId,
}: MvPanelProps): JSX.Element => {
  const [selectedVideo, setSelectedVideo] = useState<TrackVideo | null>(null);
  const [streamingMv, setStreamingMv] = useState<StreamingMvResult | null>(null);
  const [isStreamingMvLoading, setIsStreamingMvLoading] = useState(false);
  const [settings, setSettings] = useState<MvSettings>(fallbackMvSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const requestRef = useRef(0);
  const streamingMvRequestRef = useRef(0);
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
      return fallbackMvSettings;
    }

    try {
      const nextSettings = await window.echo.mv.getSettings();
      setSettings(nextSettings);
      return nextSettings;
    } catch {
      setSettings(fallbackMvSettings);
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

  const loadSelected = useCallback(async (): Promise<void> => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSelectedVideo(null);
    setIsLoading(Boolean(trackId && window.echo?.mv));
    setError(null);
    setVideoError(false);

    if (streamingTarget) {
      setIsLoading(false);
      return;
    }

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
    const requestId = streamingMvRequestRef.current + 1;
    streamingMvRequestRef.current = requestId;
    setStreamingMv(null);
    setIsStreamingMvLoading(Boolean(streamingTarget));

    if (!streamingTarget) {
      setIsStreamingMvLoading(false);
      return;
    }

    const streamingApi = window.echo?.streaming;
    if (!streamingApi?.getMv) {
      setIsStreamingMvLoading(false);
      return;
    }

    void streamingApi
      .getMv(streamingTarget)
      .then((result) => {
        if (streamingMvRequestRef.current === requestId) {
          setStreamingMv(result);
        }
      })
      .catch(() => {
        if (streamingMvRequestRef.current === requestId) {
          setStreamingMv(null);
        }
      })
      .finally(() => {
        if (streamingMvRequestRef.current === requestId) {
          setIsStreamingMvLoading(false);
        }
      });
  }, [streamingTarget]);

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
        void loadSelected();
      }
    };

    window.addEventListener('mv:changed', handleMvChanged);
    return () => window.removeEventListener('mv:changed', handleMvChanged);
  }, [loadSelected, trackId]);

  useEffect(() => {
    const handleSettingsChanged = (): void => {
      void loadSettings().then((nextSettings) => {
        if (nextSettings.enabled === false) {
          setSelectedVideo(null);
          setVideoError(false);
          return;
        }

        void loadSelected();
      });
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, [loadSelected, loadSettings]);

  const isMvEnabled = settings.enabled !== false;
  const streamingMvItem = streamingMv?.items[0] ?? null;
  const videoMediaUrl = isMvEnabled && selectedVideo?.playableInApp && selectedVideo.mediaUrl && !videoError ? selectedVideo.mediaUrl : null;
  const showVideo = Boolean(videoMediaUrl);
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

    const targetTime = targetVideoTimeForAudio(video, audioClockRef.current);
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
  }, []);

  const syncVideoToAudio = useCallback((options: { force?: boolean; bypassCooldown?: boolean } = {}): boolean => {
    const foregroundSynced = syncVideoElementToAudio(videoRef.current, options);
    const backgroundSynced = syncVideoElementToAudio(backgroundVideoRef.current, { ...options, recordCooldown: false });
    return foregroundSynced || backgroundSynced;
  }, [syncVideoElementToAudio]);

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

      <section className="lyrics-mv-panel" aria-label="MV" data-immersive-active={showImmersiveBackground}>
      <div className="lyrics-mv-ambient" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />

      {showVideo ? (
        <div className="lyrics-mv-player">
          <video
            ref={videoRef}
            className="lyrics-mv-video"
            src={!adaptiveStream ? (videoMediaUrl ?? undefined) : undefined}
            autoPlay={isAudioPlaying}
            loop
            muted
            onError={() => setVideoError(true)}
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
          coverUrl={streamingMvItem?.thumbnailUrl ?? coverUrl}
          status={
            isMvEnabled
              ? selectedVideo
                ? videoError
                  ? 'Playback failed'
                  : 'External player required'
                : isLoading || isStreamingMvLoading
                  ? 'Loading MV'
                  : streamingMvItem
                    ? 'MV available'
                    : 'MV unavailable'
              : 'MV disabled'
          }
          title={streamingMvItem?.title ?? selectedVideo?.title ?? title}
        />
      )}

      {error ? <p className="lyrics-mv-error">{error}</p> : null}
      </section>
    </>
  );
};
