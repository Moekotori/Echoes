import { useEffect, useMemo, useRef } from 'react';
import { Music2 } from 'lucide-react';
import { LyricsLine } from './LyricsLine';
import type { LyricsState } from './lyricsTypes';

type LyricsViewProps = {
  lyrics: LyricsState;
  durationMs?: number | null;
  positionMs: number;
  onSeek: (timeMs: number) => void;
  hideEmptyState?: boolean;
  showRomanization?: boolean;
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

export const LyricsView = ({
  durationMs,
  hideEmptyState = false,
  lyrics,
  onSeek,
  positionMs,
  showRomanization = true,
}: LyricsViewProps): JSX.Element => {
  const scrollRef = useRef<HTMLElement | null>(null);
  const isSynced = lyrics.kind === 'synced';
  const isPlain = lyrics.kind === 'plain';
  const activeIndex = useMemo(
    () =>
      isSynced
        ? getActiveLyricIndex(lyrics.lines, positionMs, lyrics.offsetMs)
        : isPlain
          ? getEstimatedPlainLyricIndex(lyrics.lines, positionMs, durationMs)
          : -1,
    [durationMs, isPlain, isSynced, lyrics.lines, lyrics.offsetMs, positionMs],
  );

  useEffect(() => {
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
    const nextScrollTop = activeCenter - targetCenter;
    const top = Math.max(0, nextScrollTop);
    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top, behavior: 'smooth' });
    } else {
      scrollContainer.scrollTop = top;
    }
  }, [activeIndex]);

  if (lyrics.lines.length === 0) {
    if (hideEmptyState) {
      return <section className="lyrics-empty lyrics-empty--hidden" aria-label="Lyrics" />;
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
          key={`${line.timeMs}-${index}`}
          line={line}
          past={activeIndex >= 0 && index < activeIndex}
          showRomanization={showRomanization}
          onSeek={onSeek}
          seekable={isSynced && line.timeMs >= 0}
        />
      ))}
    </section>
  );
};
