import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Lock, Minus, Palette, Plus, RotateCcw, X } from 'lucide-react';
import type { AudioStatus } from '../../shared/types/audio';
import type { AppSettings } from '../../shared/types/appSettings';
import type { DesktopLyricsState, DesktopLyricsStylePatch } from '../../shared/types/desktopLyrics';
import type { LibraryTrack } from '../../shared/types/library';
import type { LyricLine, LyricsKind, TrackLyrics } from '../../shared/types/lyrics';
import type { PlaybackStatus } from '../../shared/types/playback';
import type { StreamingLyricsResult, StreamingProviderName } from '../../shared/types/streaming';
import { streamingProviderNames } from '../../shared/types/streaming';
import { getActiveLyricIndex } from '../components/lyrics/LyricsView';

type DesktopLyricsSettings = Required<Pick<
  AppSettings,
  | 'desktopLyricsEnabled'
  | 'desktopLyricsLocked'
  | 'desktopLyricsFontSizePx'
  | 'desktopLyricsScalePercent'
  | 'desktopLyricsColor'
  | 'desktopLyricsStrokeColor'
  | 'desktopLyricsOpacityPercent'
>> & Pick<AppSettings, 'desktopLyricsBounds'>;

type DesktopLyricsStateSnapshot = {
  kind: LyricsKind;
  lines: LyricLine[];
  offsetMs: number;
};

type PlaybackClock = {
  currentTrackId: string | null;
  filePath: string | null;
  state: string;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  updatedAtMs: number;
};

const fallbackSettings: DesktopLyricsSettings = {
  desktopLyricsEnabled: false,
  desktopLyricsLocked: false,
  desktopLyricsFontSizePx: 34,
  desktopLyricsScalePercent: 100,
  desktopLyricsColor: '#FFFFFF',
  desktopLyricsStrokeColor: '#111827',
  desktopLyricsOpacityPercent: 96,
  desktopLyricsBounds: null,
};

const colorSwatches = ['#FFFFFF', '#FFD166', '#6EE7B7', '#7DD3FC', '#F0ABFC', '#FB7185'];
const forwardedStatusMaxAgeMs = 45_000;

const emptyLyrics = (offsetMs = 0): DesktopLyricsStateSnapshot => ({
  kind: 'empty',
  lines: [],
  offsetMs,
});

const trackLyricsToState = (lyrics: TrackLyrics | null, fallbackOffsetMs = 0): DesktopLyricsStateSnapshot => {
  if (!lyrics) {
    return emptyLyrics(fallbackOffsetMs);
  }

  return {
    kind: lyrics.kind,
    lines: lyrics.lines,
    offsetMs: lyrics.offsetMs,
  };
};

const streamingLyricsToState = (result: StreamingLyricsResult, fallbackOffsetMs = 0): DesktopLyricsStateSnapshot => {
  const directLines = result.lines
    .map((line) => ({
      timeMs: line.timeMs ?? -1,
      text: line.text.trim(),
      ...(line.translation ? { translation: line.translation } : {}),
      ...(line.romanization ? { romanization: line.romanization } : {}),
    }))
    .filter((line) => line.text.length > 0);
  const fallbackLines = (result.plainLyrics ?? result.syncedLyrics ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ timeMs: -1, text }));
  const lines = directLines.length ? directLines : fallbackLines;

  return {
    kind: lines.some((line) => line.timeMs >= 0) ? 'synced' : lines.length ? 'plain' : 'empty',
    lines,
    offsetMs: fallbackOffsetMs,
  };
};

const pickDesktopLyricsSettings = (settings: Partial<AppSettings> | null | undefined): DesktopLyricsSettings => ({
  desktopLyricsEnabled: settings?.desktopLyricsEnabled === true,
  desktopLyricsLocked: settings?.desktopLyricsLocked === true,
  desktopLyricsFontSizePx: settings?.desktopLyricsFontSizePx ?? fallbackSettings.desktopLyricsFontSizePx,
  desktopLyricsScalePercent: settings?.desktopLyricsScalePercent ?? fallbackSettings.desktopLyricsScalePercent,
  desktopLyricsColor: settings?.desktopLyricsColor ?? fallbackSettings.desktopLyricsColor,
  desktopLyricsStrokeColor: settings?.desktopLyricsStrokeColor ?? fallbackSettings.desktopLyricsStrokeColor,
  desktopLyricsOpacityPercent: settings?.desktopLyricsOpacityPercent ?? fallbackSettings.desktopLyricsOpacityPercent,
  desktopLyricsBounds: settings?.desktopLyricsBounds ?? null,
});

const isStreamingProviderName = (value: string | null | undefined): value is StreamingProviderName =>
  streamingProviderNames.includes(value as StreamingProviderName);

const isStreamingTrack = (
  track: LibraryTrack | null,
): track is LibraryTrack & { provider: StreamingProviderName; providerTrackId: string } =>
  track?.mediaType === 'streaming' &&
  isStreamingProviderName(track.provider) &&
  typeof track.providerTrackId === 'string' &&
  track.providerTrackId.trim().length > 0;

const parseStreamingTrackId = (trackId: string | null): { provider: StreamingProviderName; providerTrackId: string } | null => {
  const match = /^streaming:([^:]+):(.+)$/u.exec(trackId ?? '');
  if (!match || !isStreamingProviderName(match[1])) {
    return null;
  }

  return {
    provider: match[1],
    providerTrackId: match[2],
  };
};

const playbackStatusToClock = (status: PlaybackStatus, updatedAtMs: number): PlaybackClock => ({
  currentTrackId: status.currentTrackId,
  filePath: status.filePath,
  state: status.state,
  positionMs: status.positionMs,
  durationMs: status.durationMs,
  playbackRate: 1,
  updatedAtMs,
});

const audioStatusToClock = (status: AudioStatus, updatedAtMs: number): PlaybackClock => ({
  currentTrackId: status.currentTrackId,
  filePath: status.currentFilePath,
  state: status.state,
  positionMs: Math.round(status.positionSeconds * 1000),
  durationMs: Math.round(status.durationSeconds * 1000),
  playbackRate: status.playbackRate ?? 1,
  updatedAtMs,
});

const clockHasIdentity = (clock: PlaybackClock | null): boolean => Boolean(clock?.currentTrackId || clock?.filePath);

const getEstimatedPlainLyricIndex = (lines: LyricLine[], positionMs: number, durationMs: number): number => {
  if (!lines.length) {
    return -1;
  }

  if (!durationMs || durationMs <= 0) {
    return 0;
  }

  const progress = Math.max(0, Math.min(0.999999, positionMs / durationMs));
  return Math.max(0, Math.min(lines.length - 1, Math.floor(progress * lines.length)));
};

const getInterpolatedPositionMs = (clock: PlaybackClock): number => {
  if (clock.state !== 'playing') {
    return Math.max(0, clock.positionMs);
  }

  const elapsedMs = Math.max(0, performance.now() - clock.updatedAtMs);
  const durationLimit = clock.durationMs > 0 ? clock.durationMs : Number.POSITIVE_INFINITY;
  return Math.min(durationLimit, Math.max(0, clock.positionMs + elapsedMs * clock.playbackRate));
};

const getActiveIndex = (lyrics: DesktopLyricsStateSnapshot, clock: PlaybackClock): number => {
  const positionMs = getInterpolatedPositionMs(clock);
  if (lyrics.kind === 'synced') {
    return getActiveLyricIndex(lyrics.lines, positionMs, lyrics.offsetMs);
  }

  if (lyrics.kind === 'plain') {
    return getEstimatedPlainLyricIndex(lyrics.lines, positionMs, clock.durationMs);
  }

  return -1;
};

const lineText = (line: LyricLine | null | undefined): string => line?.text.trim() ?? '';

const secondaryLineText = (line: LyricLine | null | undefined, nextLine: LyricLine | null | undefined): string =>
  line?.translation?.trim() || line?.romanization?.trim() || nextLine?.text.trim() || '';

export const DesktopLyricsApp = (): JSX.Element => {
  const [settings, setSettings] = useState<DesktopLyricsSettings>(fallbackSettings);
  const [playbackClock, setPlaybackClock] = useState<PlaybackClock | null>(null);
  const [forwardedClock, setForwardedClock] = useState<PlaybackClock | null>(null);
  const [forwardedUpdatedAtMs, setForwardedUpdatedAtMs] = useState(0);
  const [lyrics, setLyrics] = useState<DesktopLyricsStateSnapshot>(() => emptyLyrics());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const lyricsRequestRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const activeClock = useMemo(() => {
    if (
      forwardedClock &&
      clockHasIdentity(forwardedClock) &&
      performance.now() - forwardedUpdatedAtMs <= forwardedStatusMaxAgeMs
    ) {
      return forwardedClock;
    }

    return playbackClock;
  }, [forwardedClock, forwardedUpdatedAtMs, playbackClock]);

  const activeTrackId = activeClock?.currentTrackId ?? null;

  const refreshPlaybackClock = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;
    if (!playback?.getStatus) {
      return;
    }

    try {
      const status = await playback.getStatus();
      setPlaybackClock(playbackStatusToClock(status, performance.now()));
    } catch {
      setPlaybackClock(null);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadSettings = async (): Promise<void> => {
      try {
        const [appSettings, desktopState] = await Promise.all([
          window.echo?.app?.getSettings?.(),
          window.echo?.desktopLyrics?.getState?.(),
        ]);
        if (disposed) {
          return;
        }

        setSettings(pickDesktopLyricsSettings(desktopState?.settings ?? appSettings));
      } catch {
        if (!disposed) {
          setSettings(fallbackSettings);
        }
      }
    };

    void loadSettings();
    const unsubscribe = window.echo?.desktopLyrics?.onStateChanged?.((state: DesktopLyricsState) => {
      setSettings(pickDesktopLyricsSettings(state.settings));
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const desktopLyrics = window.echo?.desktopLyrics;
    void desktopLyrics?.getLastAudioStatus?.().then((status) => {
      if (status) {
        setForwardedClock(audioStatusToClock(status, performance.now()));
        setForwardedUpdatedAtMs(performance.now());
      }
    }).catch(() => undefined);

    const unsubscribe = desktopLyrics?.onAudioStatus?.((status) => {
      setForwardedClock(audioStatusToClock(status, performance.now()));
      setForwardedUpdatedAtMs(performance.now());
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    void refreshPlaybackClock();
    const timer = window.setInterval(() => {
      void refreshPlaybackClock();
    }, 700);

    return () => window.clearInterval(timer);
  }, [refreshPlaybackClock]);

  useEffect(() => {
    const requestId = lyricsRequestRef.current + 1;
    lyricsRequestRef.current = requestId;

    if (!activeTrackId) {
      setLyrics(emptyLyrics());
      return;
    }

    const loadLyrics = async (): Promise<void> => {
      const lyricsApi = window.echo?.lyrics;
      const libraryApi = window.echo?.library;
      const streamingApi = window.echo?.streaming;
      let track: LibraryTrack | null = null;

      try {
        track = await libraryApi?.getTrack?.(activeTrackId) ?? null;
      } catch {
        track = null;
      }

      if (lyricsRequestRef.current !== requestId) {
        return;
      }

      const streamingTarget = isStreamingTrack(track)
        ? { provider: track.provider, providerTrackId: track.providerTrackId }
        : parseStreamingTrackId(activeTrackId);

      try {
        if (streamingTarget && streamingApi?.getLyrics) {
          const streamingLyrics = await streamingApi.getLyrics(streamingTarget);
          if (lyricsRequestRef.current === requestId) {
            setLyrics(streamingLyricsToState(streamingLyrics));
          }
          return;
        }

        const trackLyrics = await lyricsApi?.getForTrack?.(activeTrackId);
        if (lyricsRequestRef.current === requestId) {
          setLyrics(trackLyricsToState(trackLyrics ?? null));
        }
      } catch {
        if (lyricsRequestRef.current === requestId) {
          setLyrics(emptyLyrics());
        }
      }
    };

    setLyrics(emptyLyrics());
    void loadLyrics();
  }, [activeTrackId]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (!activeClock) {
      setActiveIndex(-1);
      return undefined;
    }

    const sync = (): void => {
      const nextIndex = getActiveIndex(lyrics, activeClock);
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    sync();
    if (activeClock.state !== 'playing') {
      return undefined;
    }

    const tick = (): void => {
      sync();
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [activeClock, lyrics]);

  const patchStyle = useCallback(async (patch: DesktopLyricsStylePatch): Promise<void> => {
    setSettings((current) => pickDesktopLyricsSettings({ ...current, ...patch }));
    try {
      const state = await window.echo?.desktopLyrics?.setStyle?.(patch);
      if (state) {
        setSettings(pickDesktopLyricsSettings(state.settings));
      }
    } catch {
      setSettings((current) => current);
    }
  }, []);

  const setLocked = useCallback(async (): Promise<void> => {
    try {
      const state = await window.echo?.desktopLyrics?.setLocked?.(true);
      if (state) {
        setSettings(pickDesktopLyricsSettings(state.settings));
      }
    } catch {
      setSettings((current) => current);
    }
  }, []);

  const hideWindow = useCallback((): void => {
    void window.echo?.desktopLyrics?.hide?.();
  }, []);

  const resetBounds = useCallback((): void => {
    void window.echo?.desktopLyrics?.resetBounds?.();
  }, []);

  const currentLine = activeIndex >= 0 ? lyrics.lines[activeIndex] : lyrics.lines[0];
  const nextLine = activeIndex >= 0 ? lyrics.lines[activeIndex + 1] : lyrics.lines[1];
  const primaryText =
    lyrics.kind === 'instrumental'
      ? '纯音乐，请欣赏'
      : lineText(currentLine) || (clockHasIdentity(activeClock) ? '暂无歌词' : 'ECHO NEXT');
  const secondaryText =
    lyrics.kind === 'instrumental'
      ? ''
      : secondaryLineText(currentLine, nextLine) || (clockHasIdentity(activeClock) ? 'Desktop Lyrics' : '等待播放');

  const style = {
    '--desktop-lyrics-font-size': `${settings.desktopLyricsFontSizePx}px`,
    '--desktop-lyrics-scale': (settings.desktopLyricsScalePercent / 100).toFixed(2),
    '--desktop-lyrics-color': settings.desktopLyricsColor,
    '--desktop-lyrics-stroke-color': settings.desktopLyricsStrokeColor,
    '--desktop-lyrics-opacity': (settings.desktopLyricsOpacityPercent / 100).toFixed(2),
  } as CSSProperties;

  return (
    <main
      className="desktop-lyrics-app"
      data-locked={settings.desktopLyricsLocked}
      style={style}
      onMouseEnter={() => setIsMenuOpen(true)}
      onMouseLeave={() => setIsMenuOpen(false)}
    >
      <section className="desktop-lyrics-stage" aria-label="Desktop lyrics">
        <div className="desktop-lyrics-lines">
          <strong>{primaryText}</strong>
          <span>{secondaryText}</span>
        </div>

        {!settings.desktopLyricsLocked && isMenuOpen ? (
          <div className="desktop-lyrics-menu">
            <button
              type="button"
              title="减小字号"
              aria-label="减小字号"
              onClick={() => void patchStyle({ desktopLyricsFontSizePx: settings.desktopLyricsFontSizePx - 2 })}
            >
              <Minus size={14} />
            </button>
            <output>{settings.desktopLyricsFontSizePx}px</output>
            <button
              type="button"
              title="增大字号"
              aria-label="增大字号"
              onClick={() => void patchStyle({ desktopLyricsFontSizePx: settings.desktopLyricsFontSizePx + 2 })}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              title="缩小"
              aria-label="缩小"
              onClick={() => void patchStyle({ desktopLyricsScalePercent: settings.desktopLyricsScalePercent - 5 })}
            >
              <Minus size={14} />
            </button>
            <output>{settings.desktopLyricsScalePercent}%</output>
            <button
              type="button"
              title="放大"
              aria-label="放大"
              onClick={() => void patchStyle({ desktopLyricsScalePercent: settings.desktopLyricsScalePercent + 5 })}
            >
              <Plus size={14} />
            </button>
            <Palette size={15} aria-hidden="true" />
            <div className="desktop-lyrics-swatches">
              {colorSwatches.map((color) => (
                <button
                  aria-label={`颜色 ${color}`}
                  aria-pressed={settings.desktopLyricsColor.toUpperCase() === color}
                  key={color}
                  style={{ background: color }}
                  title={color}
                  type="button"
                  onClick={() => void patchStyle({ desktopLyricsColor: color })}
                />
              ))}
            </div>
            <input
              aria-label="自定义颜色"
              title="自定义颜色"
              type="color"
              value={settings.desktopLyricsColor}
              onChange={(event) => void patchStyle({ desktopLyricsColor: event.currentTarget.value })}
            />
            <button type="button" title="锁定" aria-label="锁定" onClick={() => void setLocked()}>
              <Lock size={14} />
            </button>
            <button type="button" title="重置位置" aria-label="重置位置" onClick={resetBounds}>
              <RotateCcw size={14} />
            </button>
            <button type="button" title="关闭" aria-label="关闭" onClick={hideWindow}>
              <X size={14} />
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
};
