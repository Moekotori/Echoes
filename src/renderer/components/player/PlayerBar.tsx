import { useCallback, useEffect, useRef, useState } from 'react';
import { Import } from 'lucide-react';
import type { AudioStatus } from '../../../shared/types/audio';
import type { PlaybackStatus } from '../../../shared/types/playback';
import { likedChangedEvent, likedTracksChangedEvent } from '../../hooks/useLikedMedia';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { PlayerProgress } from './PlayerProgress';
import { PlayerSpeedControl } from './PlayerSpeedControl';
import { PlayerStatusChips } from './PlayerStatusChips';
import { PlayerTransport } from './PlayerTransport';
import { PlayerVolumeControl } from './PlayerVolumeControl';
import { formatAudioHostError } from './audioErrorFormat';
import { applyMediaSessionSnapshot, bindMediaSessionActions, clearMediaSession } from './mediaSession';
import { titleFromPath } from './playerFormat';

type PlayerBarProps = {
  onOpenAudioSettings?: () => void;
};

const idlePollingStates = new Set(['paused', 'stopped', 'idle', 'error']);
const activePollingIntervalMs = 500;
const idlePollingIntervalMs = 2000;
const playbackSeekedEvent = 'playback:seeked';

const playerArtworkUrl = (track: { coverId: string | null; coverThumb: string | null } | null): string | null =>
  track?.coverId ? `echo-cover://album/${encodeURIComponent(track.coverId)}` : (track?.coverThumb ?? null);

const dispatchPlaybackSeeked = (positionSeconds: number, trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(playbackSeekedEvent, { detail: { positionSeconds, trackId } }));
};

const isPlaybackShortcutTextTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableTarget = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
  if (editableTarget) {
    return true;
  }

  return target instanceof HTMLElement && target.isContentEditable;
};

export const PlayerBar = ({ onOpenAudioSettings }: PlayerBarProps): JSX.Element => {
  const queue = usePlaybackQueue();
  const setQueueCurrentTrackId = queue.setCurrentTrackId;
  const playQueueTrack = queue.playTrack;
  const appendToQueue = queue.appendToQueue;
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [openPopover, setOpenPopover] = useState<'volume' | 'speed' | null>(null);
  const [isCurrentTrackLiked, setIsCurrentTrackLiked] = useState(false);
  const [isWindowVisible, setIsWindowVisible] = useState(() => document.visibilityState !== 'hidden');
  const [smtcEnabled, setSmtcEnabled] = useState(true);
  const handledEndedTrackRef = useRef<string | null>(null);
  const hydratedTrackIdsRef = useRef(new Set<string>());
  const mvPreloadTrackRef = useRef<string | null>(null);
  const refreshRequestRef = useRef(0);

  const refreshStatus = useCallback(async (): Promise<void> => {
    const echo = window.echo;

    if (!echo) {
      setError('Desktop bridge unavailable');
      return;
    }

    try {
      const requestId = refreshRequestRef.current + 1;
      refreshRequestRef.current = requestId;
      const [nextPlaybackStatus, nextAudioStatus] = await Promise.all([
        echo.playback.getStatus(),
        echo.audio.getStatus(),
      ]);

      if (refreshRequestRef.current !== requestId) {
        return;
      }

      setPlaybackStatus(nextPlaybackStatus);
      setAudioStatus(nextAudioStatus);
      const nextTrackId = nextPlaybackStatus.currentTrackId ?? nextAudioStatus.currentTrackId ?? null;
      if (nextTrackId) {
        setQueueCurrentTrackId(nextTrackId);
      }
      setError(formatAudioHostError(nextAudioStatus.error));
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
      setError(formatAudioHostError(message));
    }
  }, [setQueueCurrentTrackId]);

  const state = audioStatus?.state ?? playbackStatus?.state ?? 'idle';
  const isPlaying = state === 'playing';
  const pollIntervalMs =
    !isWindowVisible || (idlePollingStates.has(state) && seekPreviewSeconds === null)
      ? idlePollingIntervalMs
      : activePollingIntervalMs;
  const statusTrackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack = queue.currentTrack ?? queue.tracks.find((track) => track.id === trackId) ?? null;
  const filePath = currentTrack?.path ?? audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
  const positionSeconds = audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const durationSeconds = audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const displayedPositionSeconds = seekPreviewSeconds ?? positionSeconds;
  const title = currentTrack?.title ?? titleFromPath(filePath);
  const artist = currentTrack?.artist || currentTrack?.albumArtist || (filePath ? 'Local file' : 'Ready');
  const artworkUrl = playerArtworkUrl(currentTrack);
  const isLibraryCurrentTrack = Boolean(currentTrack && !currentTrack.isTemporary && currentTrack.mediaType !== 'streaming');

  const refreshCurrentTrackLiked = useCallback(async (): Promise<void> => {
    if (!trackId || !isLibraryCurrentTrack || !window.echo?.library) {
      setIsCurrentTrackLiked(false);
      return;
    }

    try {
      const result = await window.echo.library.getLikedTrackIds([trackId]);
      setIsCurrentTrackLiked(result[trackId] === true);
    } catch {
      setIsCurrentTrackLiked(false);
    }
  }, [isLibraryCurrentTrack, trackId]);

  useEffect(() => {
    queue.syncPlaybackState(state);
  }, [queue, state]);

  useEffect(() => {
    if (!currentTrack || currentTrack.mediaType !== 'streaming' || currentTrack.duration > 0 || durationSeconds <= 0) {
      return;
    }

    queue.updateCurrentTrackSnapshot({ duration: durationSeconds });
  }, [currentTrack, durationSeconds, queue]);

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

    if (!isPlaying || !trackId || !mv || mvPreloadTrackRef.current === trackId) {
      return;
    }

    let cancelled = false;

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

    return () => {
      cancelled = true;
    };
  }, [isPlaying, trackId]);

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
    const unsubscribe = window.echo?.audio?.onStatus?.((nextAudioStatus) => {
      refreshRequestRef.current += 1;
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
    });

    return () => unsubscribe?.();
  }, [setQueueCurrentTrackId]);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      const nextVisible = document.visibilityState !== 'hidden';
      setIsWindowVisible(nextVisible);

      if (nextVisible) {
        void refreshStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshStatus]);

  useEffect(() => {
    void refreshStatus();
    // TODO: Keep this as a lower-frequency fallback once all playback status surfaces use push IPC.
    // Position updates must be throttled and must not cause SongsPage or TrackList rerenders.
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refreshStatus]);

  const runPlaybackAction = useCallback(
    async (action: () => Promise<PlaybackStatus | null>): Promise<void> => {
      try {
        refreshRequestRef.current += 1;
        const status = await action();
        if (status) {
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
        }
        await refreshStatus();
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        setError(formatAudioHostError(message));
      }
    },
    [refreshStatus, setQueueCurrentTrackId],
  );

  const handlePlayPause = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;

    if (!playback) {
      setError('Desktop bridge unavailable');
      return;
    }

    await runPlaybackAction(() => (isPlaying ? playback.pause() : playback.play()));
  }, [isPlaying, runPlaybackAction]);

  const handlePrevious = useCallback((): void => {
    void runPlaybackAction(queue.playPrevious);
  }, [queue.playPrevious, runPlaybackAction]);

  const handleNext = useCallback((): void => {
    void runPlaybackAction(queue.playNext);
  }, [queue.playNext, runPlaybackAction]);

  const handleSmtcCommand = useCallback(
    (command: 'play' | 'pause' | 'playPause' | 'previous' | 'next' | 'stop'): void => {
      const playback = window.echo?.playback;

      if (!playback) {
        setError('Desktop bridge unavailable');
        return;
      }

      if (command === 'playPause') {
        void handlePlayPause();
        return;
      }

      if (command === 'play') {
        if (!isPlaying) {
          void runPlaybackAction(() =>
            (state === 'idle' || state === 'stopped') && currentTrack ? playQueueTrack(currentTrack) : playback.play(),
          );
        }
        return;
      }

      if (command === 'pause') {
        if (isPlaying) {
          void runPlaybackAction(() => playback.pause());
        }
        return;
      }

      if (command === 'previous') {
        handlePrevious();
        return;
      }

      if (command === 'next') {
        handleNext();
        return;
      }

      if (command === 'stop') {
        void runPlaybackAction(() => playback.stop());
      }
    },
    [currentTrack, handleNext, handlePlayPause, handlePrevious, isPlaying, playQueueTrack, runPlaybackAction, state],
  );

  useEffect(() => {
    const unsubscribe = window.echo?.smtc?.onCommand(handleSmtcCommand);
    return () => unsubscribe?.();
  }, [handleSmtcCommand]);

  useEffect(() => {
    applyMediaSessionSnapshot({
      enabled: smtcEnabled && Boolean(filePath || currentTrack),
      title,
      artist,
      album: currentTrack?.album ?? null,
      artworkUrl,
      state,
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
    state,
    title,
  ]);

  const handleCycleRepeatMode = useCallback((): void => {
    queue.setRepeatMode(queue.repeatMode === 'one' ? 'off' : 'one');
  }, [queue]);

  const handleOpenQueue = useCallback((): void => {
    window.dispatchEvent(new Event('app:navigate:queue'));
  }, []);

  const handleOpenNowPlaying = useCallback((): void => {
    window.dispatchEvent(new Event('app:navigate:now-playing'));
  }, []);

  const handleOpenLyrics = useCallback((): void => {
    window.dispatchEvent(new Event('app:navigate:lyrics'));
  }, []);

  const handleToggleCurrentTrackLiked = useCallback(async (): Promise<void> => {
    if (!trackId || !isLibraryCurrentTrack || !window.echo?.library) {
      return;
    }

    try {
      const previous = isCurrentTrackLiked;
      setIsCurrentTrackLiked(!previous);
      const result = await window.echo.library.toggleTrackLiked(trackId);
      setIsCurrentTrackLiked(result.liked);
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : String(likeError));
      void refreshCurrentTrackLiked();
    }
  }, [isCurrentTrackLiked, isLibraryCurrentTrack, refreshCurrentTrackLiked, trackId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) {
        return;
      }

      if (isPlaybackShortcutTextTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void handlePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handlePlayPause]);

  useEffect(() => {
    const endedPlaybackKey = trackId ?? filePath ?? queue.currentQueueId ?? null;

    if (state !== 'ended' || !endedPlaybackKey || handledEndedTrackRef.current === endedPlaybackKey) {
      return;
    }

    handledEndedTrackRef.current = endedPlaybackKey;
    void runPlaybackAction(queue.playNext);
  }, [filePath, queue.currentQueueId, queue.playNext, runPlaybackAction, state, trackId]);

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
        const status = await playback.seek(safePositionSeconds);
        setPlaybackStatus(status);
        dispatchPlaybackSeeked(status.positionMs / 1000, status.currentTrackId ?? trackId ?? null);
        await refreshStatus();
      } catch (seekError) {
        setError(seekError instanceof Error ? seekError.message : String(seekError));
      } finally {
        setSeekPreviewSeconds(null);
      }
    },
    [durationSeconds, refreshStatus, trackId],
  );

  useEffect(() => {
    if (!smtcEnabled) {
      clearMediaSession();
      return () => undefined;
    }

    return bindMediaSessionActions({
      onPlay: () => handleSmtcCommand('play'),
      onPause: () => handleSmtcCommand('pause'),
      onPrevious: () => handleSmtcCommand('previous'),
      onNext: () => handleSmtcCommand('next'),
      onStop: () => handleSmtcCommand('stop'),
      onSeek: (positionSeconds) => void commitSeek(positionSeconds),
      getPositionSeconds: () => positionSeconds,
    });
  }, [commitSeek, handleSmtcCommand, positionSeconds, smtcEnabled]);

  return (
    <footer className="player-bar" aria-label="播放控制">
      <div className="player-now">
        <button
          className="player-cover"
          data-empty={!artworkUrl}
          type="button"
          aria-label="Open Now Playing"
          title="Open Now Playing"
          onClick={handleOpenNowPlaying}
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
          canLikeCurrentTrack={Boolean(trackId && isLibraryCurrentTrack)}
          onToggleCurrentTrackLiked={() => void handleToggleCurrentTrackLiked()}
        />
        <PlayerProgress
          disabled={!filePath}
          durationSeconds={durationSeconds}
          positionSeconds={displayedPositionSeconds}
          onCommit={(nextPositionSeconds) => void commitSeek(nextPositionSeconds)}
          onPreview={setSeekPreviewSeconds}
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
        />
        <PlayerSpeedControl
          status={audioStatus}
          isOpen={openPopover === 'speed'}
          onError={setError}
          onOpenChange={(isOpen) => setOpenPopover(isOpen ? 'speed' : null)}
          onStatusChange={setAudioStatus}
        />
        <button className="icon-button" type="button" aria-label="音频控制" title="音频控制" onClick={onOpenAudioSettings}>
          <Import size={17} />
        </button>
      </div>
    </footer>
  );
};
