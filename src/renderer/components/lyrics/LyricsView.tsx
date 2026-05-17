import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { LyricsLine } from './LyricsLine';
import type { LyricsState } from './lyricsTypes';

type LyricScrollMode = 'animated' | 'instant' | 'recenter';
const lyricsLayoutSettingKeys = new Set([
  'lyricsFontSizePx',
  'lyricsSecondaryFontSizePx',
  'lyricsLineSpacingPercent',
  'lyricsRomanizationEnabled',
  'lyricsTranslationEnabled',
  'lyricsContextOpacityPercent',
]);

type LyricsViewProps = {
  lyrics: LyricsState;
  durationMs?: number | null;
  positionMs: number;
  playbackRate?: number;
  playbackState?: string;
  positionUpdatedAtMs?: number;
  onSeek: (timeMs: number) => void;
  hideEmptyState?: boolean;
  showRomanization?: boolean;
  showTranslation?: boolean;
  wordHighlightEnabled?: boolean;
};

export const getActiveLyricIndex = (lines: LyricsState['lines'], positionMs: number, offsetMs: number): number => {
  if (lines.length === 0 || lines.every((line) => line.timeMs < 0)) {
    return -1;
  }

  const adjustedPositionMs = Math.max(0, positionMs + offsetMs);
  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const timeMs = lines[index].timeMs;
    if (timeMs < 0) {
      continue;
    }

    if (timeMs > adjustedPositionMs) {
      break;
    }

    activeIndex = index;
  }

  return activeIndex;
};

export const getEstimatedPlainLyricIndex = (
  lines: LyricsState['lines'],
  positionMs: number,
  durationMs?: number | null,
): number => {
  if (lines.length === 0 || !durationMs || durationMs <= 0 || !Number.isFinite(durationMs)) {
    return lines.length > 0 ? 0 : -1;
  }

  const progress = Math.max(0, Math.min(0.999999, positionMs / durationMs));
  return Math.max(0, Math.min(lines.length - 1, Math.floor(progress * lines.length)));
};

const easeInOutCubic = (progress: number): number =>
  progress < 0.5
    ? 4 * progress ** 3
    : 1 - ((-2 * progress + 2) ** 3) / 2;

const getAnimationNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const requestLyricAnimationFrame = (callback: FrameRequestCallback): number => {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => {
    callback(getAnimationNow());
  }, 16);
};

const cancelLyricAnimationFrame = (frameId: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampPositionMs = (positionMs: number, durationMs?: number | null): number => {
  const safePositionMs = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return durationMs && durationMs > 0 && Number.isFinite(durationMs)
    ? Math.min(safePositionMs, durationMs)
    : safePositionMs;
};

const getInterpolatedPositionMs = ({
  durationMs,
  playbackRate,
  playbackState,
  positionMs,
  positionUpdatedAtMs,
}: {
  durationMs?: number | null;
  playbackRate: number;
  playbackState: string;
  positionMs: number;
  positionUpdatedAtMs: number;
}): number => {
  if (playbackState !== 'playing') {
    return clampPositionMs(positionMs, durationMs);
  }

  const elapsedMs = Math.max(0, getAnimationNow() - positionUpdatedAtMs);
  return clampPositionMs(positionMs + elapsedMs * playbackRate, durationMs);
};

const getLinePlaybackPositionMs = (
  line: LyricsState['lines'][number],
  nextLine: LyricsState['lines'][number] | undefined,
  adjustedPositionMs: number,
): number => {
  if (!line.words?.length) {
    return adjustedPositionMs;
  }

  const firstWord = line.words[0];
  const lastWord = line.words[line.words.length - 1];
  const naturalEndMs = lastWord.endMs ?? nextLine?.timeMs ?? lastWord.startMs;

  return Math.max(firstWord.startMs, Math.min(adjustedPositionMs, naturalEndMs));
};

const getCurrentWordIndex = (line: LyricsState['lines'][number], adjustedPositionMs: number): number => {
  const words = line.words ?? [];
  if (words.length === 0 || adjustedPositionMs < words[0].startMs) {
    return -1;
  }

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const endMs = word.endMs ?? words[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    if (adjustedPositionMs < endMs) {
      return index;
    }
  }

  return words.length - 1;
};

const getWordProgress = (
  line: LyricsState['lines'][number],
  wordIndex: number,
  adjustedPositionMs: number,
): number => {
  const word = line.words?.[wordIndex];
  if (!word) {
    return 0;
  }

  const endMs = word.endMs ?? line.words?.[wordIndex + 1]?.startMs ?? word.startMs;
  if (endMs <= word.startMs) {
    return adjustedPositionMs >= word.startMs ? 1 : 0;
  }

  return Math.max(0, Math.min(1, (adjustedPositionMs - word.startMs) / (endMs - word.startMs)));
};

const calculateActiveIndex = (
  lines: LyricsState['lines'],
  positionMs: number,
  offsetMs: number,
  durationMs: number | null | undefined,
  isSynced: boolean,
  isPlain: boolean,
): number =>
  isSynced
    ? getActiveLyricIndex(lines, positionMs, offsetMs)
    : isPlain
      ? getEstimatedPlainLyricIndex(lines, positionMs, durationMs)
      : -1;

export const LyricsView = ({
  durationMs,
  hideEmptyState = false,
  lyrics,
  onSeek,
  playbackRate = 1,
  playbackState = 'idle',
  positionMs,
  positionUpdatedAtMs = getAnimationNow(),
  showRomanization = true,
  showTranslation = true,
  wordHighlightEnabled = true,
}: LyricsViewProps): JSX.Element | null => {
  const scrollRef = useRef<HTMLElement | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const activeCenterFrameRef = useRef<number | null>(null);
  const layoutPreserveFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const wordAnimationFrameRef = useRef<number | null>(null);
  const activeIndexRef = useRef(-1);
  const wordProgressRef = useRef<{ lineKey: string; wordIndex: number } | null>(null);
  const isSynced = lyrics.kind === 'synced';
  const isPlain = lyrics.kind === 'plain';
  const [activeIndex, setActiveIndex] = useState(() =>
    calculateActiveIndex(
      lyrics.lines,
      positionMs,
      lyrics.offsetMs,
      durationMs,
      isSynced,
      isPlain,
    ),
  );
  activeIndexRef.current = activeIndex;

  const stopScrollAnimation = useCallback((): void => {
    if (scrollAnimationFrameRef.current !== null) {
      cancelLyricAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
  }, []);

  const stopWordAnimation = useCallback((): void => {
    if (wordAnimationFrameRef.current !== null) {
      cancelLyricAnimationFrame(wordAnimationFrameRef.current);
      wordAnimationFrameRef.current = null;
    }
  }, []);

  const syncActiveWordHighlight = useCallback((currentPositionMs: number): void => {
    if (!wordHighlightEnabled || prefersReducedMotion()) {
      return;
    }

    const scrollContainer = scrollRef.current;
    const currentIndex = activeIndexRef.current;
    const line = lyrics.lines[currentIndex];
    const words = line?.words ?? [];
    if (!scrollContainer || !line || words.length < 2) {
      wordProgressRef.current = null;
      return;
    }

    const activeLine = scrollContainer.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    const wordElements = activeLine?.querySelectorAll<HTMLElement>('.lyrics-word') ?? [];
    if (!activeLine || wordElements.length !== words.length) {
      wordProgressRef.current = null;
      return;
    }

    const adjustedPositionMs = getLinePlaybackPositionMs(
      line,
      lyrics.lines[currentIndex + 1],
      currentPositionMs + lyrics.offsetMs,
    );
    const wordIndex = getCurrentWordIndex(line, adjustedPositionMs);
    const lineKey = `${line.timeMs}-${currentIndex}`;
    const previous = wordProgressRef.current;
    const changedWord = !previous || previous.lineKey !== lineKey || previous.wordIndex !== wordIndex;

    if (changedWord) {
      wordElements.forEach((element, index) => {
        const state = wordIndex < 0
          ? 'future'
          : index < wordIndex
            ? 'passed'
            : index === wordIndex
              ? 'current'
              : 'future';
        element.dataset.wordState = state;
        element.style.setProperty('--lyrics-word-progress', state === 'passed' ? '1' : '0');
      });
      wordProgressRef.current = { lineKey, wordIndex };
    }

    if (wordIndex >= 0) {
      const currentWord = wordElements[wordIndex];
      currentWord?.style.setProperty('--lyrics-word-progress', getWordProgress(line, wordIndex, adjustedPositionMs).toFixed(4));
    }
  }, [lyrics.lines, lyrics.offsetMs, wordHighlightEnabled]);

  const syncPlaybackPosition = useCallback((): void => {
    const currentPositionMs = getInterpolatedPositionMs({
      durationMs,
      playbackRate,
      playbackState,
      positionMs,
      positionUpdatedAtMs,
    });
    const nextActiveIndex = calculateActiveIndex(
      lyrics.lines,
      currentPositionMs,
      lyrics.offsetMs,
      durationMs,
      isSynced,
      isPlain,
    );

    if (activeIndexRef.current !== nextActiveIndex) {
      activeIndexRef.current = nextActiveIndex;
      wordProgressRef.current = null;
      setActiveIndex(nextActiveIndex);
    } else {
      syncActiveWordHighlight(currentPositionMs);
    }
  }, [
    durationMs,
    isPlain,
    isSynced,
    lyrics.lines,
    lyrics.offsetMs,
    playbackRate,
    playbackState,
    positionMs,
    positionUpdatedAtMs,
    syncActiveWordHighlight,
  ]);

  const animateScrollTop = useCallback(
    (scrollContainer: HTMLElement, targetTop: number, durationMs: number): void => {
      stopScrollAnimation();

      const startTop = scrollContainer.scrollTop;
      const distance = targetTop - startTop;
      if (Math.abs(distance) < 1 || durationMs <= 0 || prefersReducedMotion()) {
        scrollContainer.scrollTop = targetTop;
        return;
      }

      const startedAt = getAnimationNow();
      const tick = (now: number): void => {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        scrollContainer.scrollTop = startTop + distance * easeInOutCubic(progress);

        if (progress < 1) {
          scrollAnimationFrameRef.current = requestLyricAnimationFrame(tick);
          return;
        }

        scrollAnimationFrameRef.current = null;
        scrollContainer.scrollTop = targetTop;
      };

      scrollAnimationFrameRef.current = requestLyricAnimationFrame(tick);
    },
    [stopScrollAnimation],
  );

  const centerActiveLyric = useCallback((mode: LyricScrollMode = 'animated'): void => {
    if (activeIndex < 0) {
      return;
    }

    const scrollContainer = scrollRef.current;
    const activeLine = scrollContainer?.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    if (!scrollContainer || !activeLine) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const activeRect = activeLine.getBoundingClientRect();
    const activeCenter = activeRect.top - containerRect.top + scrollContainer.scrollTop + activeRect.height / 2;
    const targetCenter = scrollContainer.clientHeight * 0.52;
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, activeCenter - targetCenter));

    if (mode === 'instant') {
      stopScrollAnimation();
      scrollContainer.scrollTop = nextScrollTop;
      return;
    }

    animateScrollTop(scrollContainer, nextScrollTop, mode === 'recenter' ? 260 : 880);
  }, [activeIndex, animateScrollTop, stopScrollAnimation]);

  const preserveActiveLyricPosition = useCallback((event: Event): void => {
    if (event.type === 'settings:changed' && event instanceof CustomEvent) {
      return;
    }

    if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && !Array.isArray(event.detail)) {
      const hasLayoutSetting = Object.keys(event.detail as Record<string, unknown>).some((key) => lyricsLayoutSettingKeys.has(key));
      if (!hasLayoutSetting) {
        return;
      }
    }

    const scrollContainer = scrollRef.current;
    const activeLine = scrollContainer?.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
    if (!scrollContainer || !activeLine) {
      return;
    }

    const previousTop = activeLine.getBoundingClientRect().top;
    stopScrollAnimation();
    if (activeCenterFrameRef.current !== null) {
      cancelLyricAnimationFrame(activeCenterFrameRef.current);
      activeCenterFrameRef.current = null;
    }
    if (layoutPreserveFrameRef.current !== null) {
      cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
    }

    layoutPreserveFrameRef.current = requestLyricAnimationFrame(() => {
      layoutPreserveFrameRef.current = null;
      const nextActiveLine = scrollContainer.querySelector<HTMLButtonElement>('.lyrics-line[data-active="true"]');
      if (!nextActiveLine) {
        return;
      }

      const deltaTop = nextActiveLine.getBoundingClientRect().top - previousTop;
      if (Math.abs(deltaTop) > 0.5) {
        scrollContainer.scrollTop += deltaTop;
      }
    });
  }, [stopScrollAnimation]);

  useEffect(() => {
    stopWordAnimation();
    syncPlaybackPosition();

    if (playbackState !== 'playing') {
      return undefined;
    }

    const tick = (): void => {
      syncPlaybackPosition();
      wordAnimationFrameRef.current = requestLyricAnimationFrame(tick);
    };

    wordAnimationFrameRef.current = requestLyricAnimationFrame(tick);
    return stopWordAnimation;
  }, [playbackState, stopWordAnimation, syncPlaybackPosition]);

  useEffect(() => {
    const currentPositionMs = getInterpolatedPositionMs({
      durationMs,
      playbackRate,
      playbackState,
      positionMs,
      positionUpdatedAtMs,
    });
    syncActiveWordHighlight(currentPositionMs);
  }, [
    activeIndex,
    durationMs,
    playbackRate,
    playbackState,
    positionMs,
    positionUpdatedAtMs,
    syncActiveWordHighlight,
  ]);

  useEffect(() => {
    if (activeCenterFrameRef.current !== null) {
      cancelLyricAnimationFrame(activeCenterFrameRef.current);
    }

    activeCenterFrameRef.current = requestLyricAnimationFrame(() => {
      activeCenterFrameRef.current = null;
      centerActiveLyric('animated');
    });

    return () => {
      if (activeCenterFrameRef.current !== null) {
        cancelLyricAnimationFrame(activeCenterFrameRef.current);
        activeCenterFrameRef.current = null;
      }
    };
  }, [centerActiveLyric]);

  useEffect(() => {
    window.addEventListener('settings:changed', preserveActiveLyricPosition);
    window.addEventListener('lyrics:display-settings-changed', preserveActiveLyricPosition);
    return () => {
      window.removeEventListener('settings:changed', preserveActiveLyricPosition);
      window.removeEventListener('lyrics:display-settings-changed', preserveActiveLyricPosition);
      if (layoutPreserveFrameRef.current !== null) {
        cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
        layoutPreserveFrameRef.current = null;
      }
    };
  }, [preserveActiveLyricPosition]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || activeIndex < 0) {
      return undefined;
    }

    const scheduleRecenter = (): void => {
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = requestLyricAnimationFrame(() => {
        resizeFrameRef.current = null;
        centerActiveLyric('recenter');
      });
    };

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleRecenter)
        : null;
    observer?.observe(scrollContainer);
    window.addEventListener('resize', scheduleRecenter);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleRecenter);
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [activeIndex, centerActiveLyric]);

  useEffect(
    () => () => {
      stopScrollAnimation();
      stopWordAnimation();
      if (activeCenterFrameRef.current !== null) {
        cancelLyricAnimationFrame(activeCenterFrameRef.current);
        activeCenterFrameRef.current = null;
      }
      if (resizeFrameRef.current !== null) {
        cancelLyricAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (layoutPreserveFrameRef.current !== null) {
        cancelLyricAnimationFrame(layoutPreserveFrameRef.current);
        layoutPreserveFrameRef.current = null;
      }
    },
    [stopScrollAnimation, stopWordAnimation],
  );

  if (lyrics.lines.length === 0) {
    if (hideEmptyState) {
      return null;
    }

    return (
      <section className="lyrics-empty" aria-label="Lyrics">
        <Music2 size={26} />
        <strong>{lyrics.kind === 'instrumental' ? '纯音乐，请欣赏' : '暂无歌词'}</strong>
        {lyrics.kind === 'instrumental' ? <span>Instrumental track</span> : null}
      </section>
    );
  }

  return (
    <section className="lyrics-scroll" aria-label="Lyrics" data-kind={lyrics.kind} ref={scrollRef}>
      {lyrics.lines.map((line, index) => (
        <LyricsLine
          active={index === activeIndex}
          focusDistance={activeIndex >= 0 ? Math.abs(index - activeIndex) : 4}
          key={`${line.timeMs}-${index}`}
          line={line}
          past={activeIndex >= 0 && index < activeIndex}
          showRomanization={showRomanization}
          showTranslation={showTranslation}
          wordHighlightEnabled={wordHighlightEnabled && !prefersReducedMotion()}
          onSeek={onSeek}
          seekable={isSynced && line.timeMs >= 0}
        />
      ))}
    </section>
  );
};
