import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, PointerEvent } from 'react';
import { ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react';
import type { AudioPlaybackState, AudioStatus } from '../../shared/types/audio';
import type { MiniPlayerState } from '../../shared/types/miniPlayer';
import type { PlaybackStatus } from '../../shared/types/playback';
import { isSpotifyTrack, pauseSpotifyPlayback, resumeSpotifyPlayback, seekSpotifyPlayback } from '../integrations/spotify/spotifyPlayback';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { getVisualPlaybackState, refreshPlaybackStatus, setPlaybackStatusSnapshot, useSharedPlaybackStatus } from '../stores/playbackStatusStore';
import { formatTime, titleFromPath } from '../components/player/playerFormat';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';

type ForwardedAudioStatus = {
  status: AudioStatus;
  updatedAtMs: number;
};

type MiniPlaybackClock = {
  durationSeconds: number;
  playbackRate: number;
  positionSeconds: number;
  sourcePositionSeconds: number;
  state: AudioPlaybackState;
  trackKey: string | null;
  updatedAtMs: number;
};

type PlaybackVisualIntentSnapshot = {
  currentTrackId: string | null;
  filePath: string | null;
  expectedPositionMs: number;
  startedAtMs: number;
};

const progressRenderIntervalMs = 500;
const forwardedSystemStatusMaxAgeMs = 30_000;
const trackSwitchVisualIntentPositionToleranceMs = 1500;
const activeStates = new Set<AudioPlaybackState>(['loading', 'playing']);
const restartStates = new Set<AudioPlaybackState>(['idle', 'stopped', 'ended']);

const defaultMiniPlayerState: MiniPlayerState = {
  visible: true,
  locked: false,
  bounds: null,
  settings: {
    miniPlayerEnabled: true,
    miniPlayerLocked: false,
    miniPlayerAutoHideMainWindow: false,
    miniPlayerBounds: null,
  },
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const playbackTrackKey = (audioStatus: AudioStatus | null, playbackStatus: PlaybackStatus | null, fallbackTrackId: string | null): string | null =>
  audioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? fallbackTrackId ?? audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;

const lightweightArtworkUrl = (track: { coverThumb: string | null } | null, audioStatus: AudioStatus | null): string | null =>
  track?.coverThumb ?? audioStatus?.currentTrackCoverUrl ?? null;

const audioStatusMatchesPlaybackStatus = (audioStatus: AudioStatus, playbackStatus: PlaybackStatus | null): boolean => {
  if (!playbackStatus?.currentTrackId && !playbackStatus?.filePath) {
    return true;
  }

  return (
    Boolean(playbackStatus.currentTrackId && audioStatus.currentTrackId === playbackStatus.currentTrackId) ||
    Boolean(playbackStatus.filePath && audioStatus.currentFilePath === playbackStatus.filePath)
  );
};

const audioStatusMatchesVisualIntent = (status: AudioStatus, intent: PlaybackVisualIntentSnapshot | null | undefined): boolean => {
  if (!intent) {
    return true;
  }

  const matchesIntent =
    Boolean(intent.currentTrackId && status.currentTrackId === intent.currentTrackId) ||
    Boolean(intent.filePath && status.currentFilePath === intent.filePath);
  if (!matchesIntent) {
    return false;
  }

  const playbackRate = Number.isFinite(status.playbackRate) ? Math.max(0.25, Math.min(4, status.playbackRate)) : 1;
  const elapsedMs = status.state === 'playing' || status.state === 'paused' ? Math.max(0, Date.now() - intent.startedAtMs) : 0;
  const expectedPositionMs = intent.expectedPositionMs + elapsedMs * playbackRate;
  return Math.round(Math.max(0, status.positionSeconds) * 1000) <= expectedPositionMs + trackSwitchVisualIntentPositionToleranceMs;
};

const isUsableAudioStatus = (
  audioStatus: AudioStatus | null | undefined,
  playbackStatus: PlaybackStatus | null,
  playbackVisualIntent: PlaybackVisualIntentSnapshot | null | undefined,
): audioStatus is AudioStatus =>
  Boolean(
    audioStatus &&
      audioStatusMatchesPlaybackStatus(audioStatus, playbackStatus) &&
      audioStatusMatchesVisualIntent(audioStatus, playbackVisualIntent),
  );

const requestMiniPlayerQueueBounds = (open: boolean): void => {
  void window.echo?.miniPlayer?.setQueueOpen?.(open).catch(() => undefined);

  try {
    window.resizeTo(window.outerWidth || 388, open ? 324 : 74);
  } catch {
    // Electron IPC is the primary resize path; resizeTo is only a renderer fallback.
  }
};

export const MiniPlayerApp = (): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const queue = usePlaybackQueue();
  const setQueueCurrentTrackId = queue.setCurrentTrackId;
  const syncQueuePlaybackState = queue.syncPlaybackState;
  const sharedPlaybackStatus = useSharedPlaybackStatus();
  const [, setMiniPlayerState] = useState<MiniPlayerState>(defaultMiniPlayerState);
  const [forwardedAudioStatus, setForwardedAudioStatus] = useState<ForwardedAudioStatus | null>(null);
  const [realtimePositionSeconds, setRealtimePositionSeconds] = useState(0);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clockRef = useRef<MiniPlaybackClock>({
    durationSeconds: 0,
    playbackRate: 1,
    positionSeconds: 0,
    sourcePositionSeconds: 0,
    state: 'idle',
    trackKey: null,
    updatedAtMs: performance.now(),
  });

  useEffect(() => {
    let cancelled = false;
    const miniPlayer = window.echo?.miniPlayer;
    if (!miniPlayer) {
      return undefined;
    }

    void miniPlayer.getState().then((state) => {
      if (!cancelled) {
        setMiniPlayerState(state);
      }
    }).catch(() => undefined);

    const unsubscribe = miniPlayer.onStateChanged?.((state) => {
      setMiniPlayerState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const desktopLyrics = window.echo?.desktopLyrics;
    if (!desktopLyrics) {
      return undefined;
    }

    const getLastAudioStatus = desktopLyrics.getLastAudioStatus;
    if (getLastAudioStatus) {
      void getLastAudioStatus().then((status) => {
        if (!cancelled && status) {
          setForwardedAudioStatus({ status, updatedAtMs: Date.now() });
        }
      }).catch(() => undefined);
    }

    const unsubscribe = desktopLyrics.onAudioStatus?.((status) => {
      setForwardedAudioStatus({ status, updatedAtMs: Date.now() });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const activeAudioStatus = useMemo(() => {
    const forwarded = forwardedAudioStatus;
    const playbackVisualIntent = sharedPlaybackStatus.playbackVisualIntent;
    if (
      forwarded?.status.outputMode === 'system' &&
      Date.now() - forwarded.updatedAtMs <= forwardedSystemStatusMaxAgeMs &&
      isUsableAudioStatus(forwarded.status, sharedPlaybackStatus.playbackStatus, playbackVisualIntent)
    ) {
      return forwarded.status;
    }

    return isUsableAudioStatus(sharedPlaybackStatus.audioStatus, sharedPlaybackStatus.playbackStatus, playbackVisualIntent)
      ? sharedPlaybackStatus.audioStatus
      : null;
  }, [
    forwardedAudioStatus,
    sharedPlaybackStatus.audioStatus,
    sharedPlaybackStatus.playbackStatus,
    sharedPlaybackStatus.playbackVisualIntent,
  ]);

  const playbackStatus = sharedPlaybackStatus.playbackStatus;
  const visualState = getVisualPlaybackState({
    audioStatus: activeAudioStatus,
    playbackStatus,
    playbackVisualIntent: sharedPlaybackStatus.playbackVisualIntent,
  });
  const statusTrackId = activeAudioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? null;
  const statusFilePath = activeAudioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
  const statusMatchedTrack =
    (statusTrackId
      ? queue.tracks.find((track) => track.id === statusTrackId) ??
        (queue.currentTrack?.id === statusTrackId ? queue.currentTrack : null) ??
        (queue.lastPlayedTrack?.id === statusTrackId ? queue.lastPlayedTrack : null)
      : null) ??
    (statusFilePath
      ? queue.tracks.find((track) => track.path === statusFilePath) ??
        (queue.currentTrack?.path === statusFilePath ? queue.currentTrack : null) ??
        (queue.lastPlayedTrack?.path === statusFilePath ? queue.lastPlayedTrack : null)
      : null);
  const trackId = statusTrackId ?? statusMatchedTrack?.id ?? queue.currentTrackId ?? null;
  const currentTrack =
    statusMatchedTrack ??
    (!statusTrackId && !statusFilePath
      ? queue.currentTrack ??
        queue.tracks.find((track) => track.id === trackId) ??
        (queue.lastPlayedTrack?.id === trackId ? queue.lastPlayedTrack : null)
      : null);
  const filePath = currentTrack?.path ?? statusFilePath;
  const title = currentTrack?.title?.trim() || activeAudioStatus?.currentTrackTitle?.trim() || titleFromPath(filePath);
  const artist =
    currentTrack?.artist?.trim() ||
    currentTrack?.albumArtist?.trim() ||
    activeAudioStatus?.currentTrackArtist?.trim() ||
    activeAudioStatus?.currentTrackAlbumArtist?.trim() ||
    (filePath ? t('miniPlayer.artist.unknown') : t('miniPlayer.status.ready'));
  const artworkUrl = lightweightArtworkUrl(currentTrack, activeAudioStatus);
  const isSpotifyCurrentTrack = isSpotifyTrack(currentTrack);
  const playbackRate = activeAudioStatus?.playbackRate ?? 1;
  const durationSeconds = Math.max(
    0,
    activeAudioStatus?.durationSeconds ??
      (playbackStatus?.durationMs ? playbackStatus.durationMs / 1000 : currentTrack?.duration ?? 0),
  );
  const sourcePositionSeconds = Math.max(0, activeAudioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000);
  const progressTrackKey = playbackTrackKey(activeAudioStatus, playbackStatus, currentTrack?.id ?? trackId);
  const positionSeconds = seekPreviewSeconds ?? realtimePositionSeconds;
  const progress = durationSeconds > 0 ? clamp(positionSeconds / durationSeconds, 0, 1) : 0;
  const hasPlayableTarget = Boolean(filePath || currentTrack || playbackStatus || activeAudioStatus);
  const queueItems = queue.items;
  const activeQueueId = queue.currentQueueId ?? queueItems.find((item) => item.track.id === trackId)?.queueId ?? null;
  const hasQueuePreview = queueItems.length > 0 || Boolean(currentTrack || title);

  useEffect(() => {
    if (trackId) {
      setQueueCurrentTrackId(trackId);
    }
  }, [setQueueCurrentTrackId, trackId]);

  useEffect(() => {
    syncQueuePlaybackState(visualState);
  }, [syncQueuePlaybackState, visualState]);

  useEffect(() => {
    const now = performance.now();
    const previous = clockRef.current;
    const samePlayback = previous.trackKey === progressTrackKey;
    const boundedSourcePosition = durationSeconds > 0 ? clamp(sourcePositionSeconds, 0, durationSeconds) : Math.max(0, sourcePositionSeconds);
    let nextPositionSeconds = boundedSourcePosition;

    if (samePlayback && previous.state === 'playing' && visualState === 'playing') {
      const estimatedPositionSeconds = previous.positionSeconds + ((now - previous.updatedAtMs) / 1000) * previous.playbackRate;
      const boundedEstimate = durationSeconds > 0 ? clamp(estimatedPositionSeconds, 0, durationSeconds) : Math.max(0, estimatedPositionSeconds);
      if (boundedSourcePosition + 1.25 < boundedEstimate) {
        nextPositionSeconds = boundedEstimate;
      }
    }

    clockRef.current = {
      durationSeconds,
      playbackRate,
      positionSeconds: nextPositionSeconds,
      sourcePositionSeconds: boundedSourcePosition,
      state: visualState,
      trackKey: progressTrackKey,
      updatedAtMs: now,
    };
    setRealtimePositionSeconds(nextPositionSeconds);
  }, [durationSeconds, playbackRate, progressTrackKey, sourcePositionSeconds, visualState]);

  useEffect(() => {
    if (visualState !== 'playing' || seekPreviewSeconds !== null) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const clock = clockRef.current;
      if (clock.state !== 'playing') {
        return;
      }
      const elapsedSeconds = ((performance.now() - clock.updatedAtMs) / 1000) * clock.playbackRate;
      const nextPosition = clock.positionSeconds + elapsedSeconds;
      setRealtimePositionSeconds(clock.durationSeconds > 0 ? clamp(nextPosition, 0, clock.durationSeconds) : Math.max(0, nextPosition));
    }, progressRenderIntervalMs);

    return () => window.clearInterval(timer);
  }, [seekPreviewSeconds, visualState]);

  useEffect(() => {
    requestMiniPlayerQueueBounds(isQueueOpen);

    return () => {
      if (isQueueOpen) {
        requestMiniPlayerQueueBounds(false);
      }
    };
  }, [isQueueOpen]);

  const runPlaybackAction = useCallback(async (action: () => Promise<PlaybackStatus | null | void>): Promise<void> => {
    try {
      setError(null);
      const status = await action();
      if (status) {
        setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
      }
      void refreshPlaybackStatus();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : String(actionError);
      setError(message);
      setPlaybackStatusSnapshot({ error: message });
    }
  }, []);

  const handlePlayPause = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;

    if (queue.hqPlayerTakeoverEnabled) {
      if (activeStates.has(visualState)) {
        setError(t('miniPlayer.status.hqPlayerTakeover'));
        return;
      }

      await runPlaybackAction(queue.activateHqPlayerTakeover);
      return;
    }

    if (isSpotifyCurrentTrack && currentTrack) {
      await runPlaybackAction(() => (activeStates.has(visualState) ? pauseSpotifyPlayback(currentTrack) : resumeSpotifyPlayback(currentTrack)));
      return;
    }

    if (!playback) {
      setError('Desktop bridge unavailable');
      return;
    }

    await runPlaybackAction(async () => {
      if (activeStates.has(visualState)) {
        return playback.pause();
      }

      const latestStatus = await playback.getStatus();
      if (activeStates.has(latestStatus.state)) {
        return playback.pause();
      }
      if (restartStates.has(latestStatus.state) && queue.currentItem) {
        return queue.playQueueItem(queue.currentItem.queueId);
      }
      if (restartStates.has(latestStatus.state) && currentTrack) {
        return queue.playTrack(currentTrack);
      }
      return playback.play();
    });
  }, [currentTrack, isSpotifyCurrentTrack, queue, runPlaybackAction, t, visualState]);

  const handlePrevious = useCallback((): void => {
    void runPlaybackAction(queue.playPrevious);
  }, [queue.playPrevious, runPlaybackAction]);

  const handleNext = useCallback((): void => {
    void runPlaybackAction(queue.playNext);
  }, [queue.playNext, runPlaybackAction]);

  const commitSeek = useCallback(
    async (nextPositionSeconds: number): Promise<void> => {
      const safePositionSeconds = durationSeconds > 0 ? clamp(nextPositionSeconds, 0, durationSeconds) : Math.max(0, nextPositionSeconds);

      await runPlaybackAction(async () => {
        if (isSpotifyCurrentTrack && currentTrack) {
          return seekSpotifyPlayback(currentTrack, safePositionSeconds);
        }

        if (queue.hqPlayerTakeoverEnabled) {
          const connectStatus = await window.echo?.connect?.seek?.(safePositionSeconds);
          if (connectStatus) {
            return {
              state: connectStatus.state === 'playing' ? 'playing' : connectStatus.state === 'paused' ? 'paused' : 'loading',
              currentTrackId: connectStatus.currentTrackId ?? trackId,
              positionMs: Math.round(Math.max(0, connectStatus.positionSeconds) * 1000),
              durationMs: Math.round(Math.max(0, connectStatus.durationSeconds) * 1000),
              filePath,
            };
          }
        }

        return window.echo?.playback?.seek?.(safePositionSeconds);
      });
      setRealtimePositionSeconds(safePositionSeconds);
      setSeekPreviewSeconds(null);
    },
    [currentTrack, durationSeconds, filePath, isSpotifyCurrentTrack, queue.hqPlayerTakeoverEnabled, runPlaybackAction, trackId],
  );

  const handleProgressChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSeekPreviewSeconds(Number(event.currentTarget.value));
  };

  const handleProgressPointerUp = (event: PointerEvent<HTMLInputElement>): void => {
    void commitSeek(Number(event.currentTarget.value));
  };

  const handleResetBounds = useCallback((): void => {
    setIsQueueOpen(false);
    void window.echo?.miniPlayer?.resetBounds?.().then(setMiniPlayerState).catch(() => undefined);
  }, []);

  const handleToggleQueue = useCallback((): void => {
    setIsQueueOpen((open) => {
      const nextOpen = !open;
      requestMiniPlayerQueueBounds(nextOpen);
      return nextOpen;
    });
  }, []);

  const handlePlayQueueItem = useCallback(
    (queueId: string): void => {
      void runPlaybackAction(() => queue.playQueueItem(queueId));
    },
    [queue, runPlaybackAction],
  );

  const style = {
    '--mini-player-progress': `${progress * 100}%`,
  } as CSSProperties;

  return (
    <main
      className={`mini-player-app ${isQueueOpen ? 'mini-player-app--queue-open' : ''}`}
      data-has-artwork={Boolean(artworkUrl)}
      data-playback-state={visualState}
      style={style}
    >
      <section className="mini-player-shell" aria-label={t('miniPlayer.aria.shell')}>
        <div className="mini-player-cover" data-empty={!artworkUrl}>
          {artworkUrl ? (
            <img alt="" draggable={false} src={artworkUrl} />
          ) : (
            <span className="mini-player-cover-mark" />
          )}
        </div>

        <div className="mini-player-main">
          <div className="mini-player-title-row">
            <div className="mini-player-copy">
              <strong title={title}>{title}</strong>
              <span title={artist}>{artist}</span>
            </div>
            <div className="mini-player-transport">
              <button
                aria-label={t('miniPlayer.action.previous')}
                className="mini-player-icon-button mini-player-icon-button--transport"
                disabled={!queue.canGoPrevious}
                title={t('miniPlayer.action.previous')}
                type="button"
                onClick={handlePrevious}
              >
                <SkipBack size={15} />
              </button>
              <button
                aria-label={activeStates.has(visualState) ? t('miniPlayer.action.pause') : t('miniPlayer.action.play')}
                className="mini-player-icon-button mini-player-icon-button--play"
                disabled={!hasPlayableTarget}
                title={activeStates.has(visualState) ? t('miniPlayer.action.pause') : t('miniPlayer.action.play')}
                type="button"
                onClick={() => void handlePlayPause()}
              >
                {activeStates.has(visualState) ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                aria-label={t('miniPlayer.action.next')}
                className="mini-player-icon-button mini-player-icon-button--transport"
                disabled={!queue.canGoNext}
                title={t('miniPlayer.action.next')}
                type="button"
                onClick={handleNext}
              >
                <SkipForward size={15} />
              </button>
            </div>
            <button
              aria-label={t('miniPlayer.action.resetPosition')}
              className="mini-player-icon-button mini-player-reset-button"
              title={t('miniPlayer.action.resetPosition')}
              type="button"
              onClick={handleResetBounds}
            >
              <RotateCcw size={13} />
            </button>
            <button
              aria-label={isQueueOpen ? t('miniPlayer.action.closeQueue') : t('miniPlayer.action.openQueue')}
              aria-pressed={isQueueOpen}
              className={`mini-player-icon-button mini-player-queue-toggle ${isQueueOpen ? 'is-active' : ''}`}
              disabled={!hasQueuePreview}
              title={isQueueOpen ? t('miniPlayer.action.closeQueue') : t('miniPlayer.action.openQueue')}
              type="button"
              onClick={handleToggleQueue}
            >
              <ListMusic size={14} />
            </button>
            <button
              aria-label={t('miniPlayer.action.close')}
              className="mini-player-icon-button mini-player-close-button"
              title={t('miniPlayer.action.closeShort')}
              type="button"
              onClick={() => {
                setIsQueueOpen(false);
                void window.echo?.miniPlayer?.hide?.();
              }}
            >
              <X size={12} />
            </button>
          </div>

          <div className="mini-player-progress-row">
            <span>{formatTime(positionSeconds)}</span>
            <input
              aria-label={t('miniPlayer.aria.progress')}
              disabled={!durationSeconds || !hasPlayableTarget}
              max={Math.max(1, durationSeconds)}
              min={0}
              step={0.5}
              type="range"
              value={clamp(positionSeconds, 0, Math.max(1, durationSeconds))}
              onChange={handleProgressChange}
              onPointerUp={handleProgressPointerUp}
            />
            <span>{formatTime(durationSeconds)}</span>
          </div>
          {error ? <p className="mini-player-error" title={error}>{error}</p> : null}
        </div>
        {isQueueOpen ? (
          <div className="mini-player-queue-panel" role="listbox" aria-label={t('miniPlayer.aria.queue')}>
            {queueItems.length > 0 ? (
              queueItems.map((item) => {
                const isActive = item.queueId === activeQueueId || item.track.id === trackId;
                const itemTitle = item.track.title || titleFromPath(item.track.path);
                const itemArtist = item.track.artist?.trim() || item.track.albumArtist?.trim();

                return (
                  <button
                    key={item.queueId}
                    aria-current={isActive ? 'true' : undefined}
                    className="mini-player-queue-item"
                    title={itemArtist ? `${itemTitle} - ${itemArtist}` : itemTitle}
                    type="button"
                    onClick={() => handlePlayQueueItem(item.queueId)}
                  >
                    <span className="mini-player-queue-playing" aria-hidden="true">
                      {isActive ? '||' : ''}
                    </span>
                    <span className="mini-player-queue-title">{itemTitle}</span>
                  </button>
                );
              })
            ) : currentTrack || title ? (
              <div className="mini-player-queue-item mini-player-queue-item--static" aria-current="true">
                <span className="mini-player-queue-playing" aria-hidden="true">||</span>
                <span className="mini-player-queue-title">{title}</span>
              </div>
            ) : (
              <p className="mini-player-queue-empty">{t('miniPlayer.status.queueEmpty')}</p>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
};
