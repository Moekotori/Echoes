import { useCallback, useEffect, useRef, useState } from 'react';
import { Import } from 'lucide-react';
import type { AudioStatus } from '../../../shared/types/audio';
import { isReliableBpmAnalysis } from '../../../shared/constants/audioAnalysis';
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
const maxInterpolatedStatusGapSeconds = 1.6;
const maxStaleStatusRegressionSeconds = 2.5;
const seekAnchorMaxAgeSeconds = 3;
const playbackRateChangeDiscontinuitySeconds = 0.35;
const isStreamingProviderName = (provider: string | null | undefined): provider is StreamingProviderName =>
  streamingProviderNames.includes(provider as StreamingProviderName);
const isVerifiedAudioAnalysisBpm = (track: { bpm?: number | null; bpmConfidence?: number | null; analysisStatus?: string | null; fieldSources?: Record<string, string> } | null): boolean =>
  Boolean(track?.fieldSources?.bpm === 'audio_analysis' && isReliableBpmAnalysis(track.bpm, track.bpmConfidence, track.analysisStatus));

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

const isProviderLikedStreamingProvider = (provider: string | null | undefined): provider is Extract<StreamingProviderName, 'netease' | 'qqmusic'> =>
  provider === 'netease' || provider === 'qqmusic';

const dispatchPlaybackSeeked = (positionSeconds: number, trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(playbackSeekedEvent, { detail: { positionSeconds, trackId } }));
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
  const [error, setError] = useState<string | null>(null);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [openPopover, setOpenPopover] = useState<'volume' | 'speed' | null>(null);
  const [isCurrentTrackLiked, setIsCurrentTrackLiked] = useState(false);
  const [smtcEnabled, setSmtcEnabled] = useState(true);
  const handledEndedTrackRef = useRef<string | null>(null);
  const hydratedTrackIdsRef = useRef(new Set<string>());
  const bpmAnalysisJobIdsRef = useRef(new Map<string, string | 'done'>());
  const streamingBpmAnalysisTrackIdsRef = useRef(new Set<string>());
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

  const state = audioStatus?.state ?? playbackStatus?.state ?? 'idle';
  const visualState = getVisualPlaybackState({
    audioStatus,
    playbackStatus,
    playbackVisualIntent: sharedPlaybackStatus.playbackVisualIntent,
  });
  const isPlaying = visualState === 'playing';
  const statusTrackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack = queue.currentTrack ?? queue.tracks.find((track) => track.id === trackId) ?? null;
  const filePath = currentTrack?.path ?? audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
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
  const sourcePositionSeconds = audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const durationSeconds = audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const [realtimePositionSeconds, setRealtimePositionSeconds] = useState(sourcePositionSeconds);
  const positionSeconds = seekPreviewSeconds ?? realtimePositionSeconds;
  const title = currentTrack?.title ?? titleFromPath(filePath);
  const artist = currentTrack?.artist || currentTrack?.albumArtist || (filePath ? 'Local file' : 'Ready');
  const artworkUrl = playerArtworkUrl(currentTrack);
  const isLibraryCurrentTrack = Boolean(currentTrack && !currentTrack.isTemporary && currentTrack.mediaType !== 'streaming');
  const streamingTrackId = currentTrack?.id ?? null;
  const streamingTrackMediaType = currentTrack?.mediaType ?? null;
  const streamingTrackProvider = currentTrack?.provider ?? null;
  const streamingTrackProviderTrackId = currentTrack?.providerTrackId ?? null;
  const isProviderLikedStreamingTrack =
    streamingTrackMediaType === 'streaming' &&
    isProviderLikedStreamingProvider(streamingTrackProvider) &&
    Boolean(streamingTrackProviderTrackId);
  const streamingTrackQuality = currentTrack?.streamingQuality;
  const streamingTrackBpm = currentTrack?.bpm ?? null;
  const streamingTrackBpmConfidence = currentTrack?.bpmConfidence ?? null;
  const streamingTrackAnalysisStatus = currentTrack?.analysisStatus ?? null;
  const isSpotifyCurrentTrack = isSpotifyTrack(currentTrack);

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

      if (rateChangeSourceDiscontinuity) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleRegression) {
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

    if ((!canAnalyzeCurrentTrack && !shouldContinueAnalysis) || (!shouldStartAnalysis && !shouldContinueAnalysis)) {
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
  }, [currentTrack, isPlaying, updateTrackSnapshot]);

  useEffect(() => {
    const streaming = window.echo?.streaming;
    const canAnalyzeCurrentTrack =
      isPlaying &&
      streamingTrackMediaType === 'streaming' &&
      streamingTrackProvider !== 'spotify' &&
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

          await mv.searchNetworkCandidates(trackId);
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
  }, [currentTrack?.mediaType, isPlaying, trackId]);

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
    window.dispatchEvent(new Event('app:navigate:lyrics'));
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
    <footer className="player-bar" aria-label="播放控制">
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
          <strong>{title}</strong>
          <span>{artist}</span>
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
        {error ? <span className="player-error">{error}</span> : null}
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
        <button className="icon-button" type="button" aria-label="音频控制" title="音频控制" onClick={onOpenAudioSettings}>
          <Import size={17} />
        </button>
      </div>
    </footer>
  );
};
