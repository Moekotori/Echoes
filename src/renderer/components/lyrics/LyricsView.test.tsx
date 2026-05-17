// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { LyricsView } from './LyricsView';
import type { LyricsState } from './lyricsTypes';

const makeRect = (top: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left: 0,
  right: 320,
  top,
  width: 320,
  x: 0,
  y: top,
  toJSON: () => ({}),
});

const lyrics: LyricsState = {
  kind: 'synced',
  source: 'placeholder',
  offsetMs: 0,
  lines: [
    { timeMs: 0, text: 'First line' },
    { timeMs: 1000, text: 'Second line' },
    { timeMs: 2000, text: 'Third line' },
  ],
};

const wordLyrics: LyricsState = {
  kind: 'synced',
  source: 'placeholder',
  offsetMs: 0,
  lines: [
    {
      timeMs: 1000,
      text: 'Hello world',
      words: [
        { text: 'Hello ', startMs: 1000, endMs: 1500 },
        { text: 'world', startMs: 1500, endMs: 2000 },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LyricsView', () => {
  it('aligns word highlight immediately after seeking', async () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.textContent).toBe('Hello ');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('does not advance word highlight while paused', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1750);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackState="paused"
        positionMs={1250}
        positionUpdatedAtMs={0}
        onSeek={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
  });

  it('keeps ordinary line rendering when word highlight is disabled', () => {
    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        positionMs={1250}
        wordHighlightEnabled={false}
        onSeek={vi.fn()}
      />,
    );

    expect(container.querySelector('.lyrics-word')).toBeNull();
    expect(container.textContent).toContain('Hello world');
  });

  it('updates word progress through animation frames while keeping the active line mounted', async () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={wordLyrics}
        playbackRate={1}
        playbackState="playing"
        positionMs={1000}
        positionUpdatedAtMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]');

    vi.mocked(performance.now).mockReturnValue(1250);
    act(() => {
      const callbacks = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of callbacks) {
        callback(1250);
      }
    });

    await waitFor(() => {
      const currentWord = container.querySelector<HTMLElement>('.lyrics-word[data-word-state="current"]');
      expect(currentWord?.style.getPropertyValue('--lyrics-word-progress')).toBe('0.5000');
    });
    expect(container.querySelector('.lyrics-line[data-active="true"]')).toBe(activeLine);
  });

  it('preserves the active lyric screen position when display settings change', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    let activeTop = 200;

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 400));
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(activeTop, 42));
    scrollContainer.scrollTop = 120;

    act(() => {
      window.dispatchEvent(new CustomEvent('lyrics:display-settings-changed', { detail: { lyricsFontSizePx: 44 } }));
    });

    activeTop = 164;
    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(84);
  });

  it('ignores persisted settings payloads because display preview events handle lyric layout changes', () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const { container } = render(
      <LyricsView
        durationMs={3000}
        hideEmptyState={false}
        lyrics={lyrics}
        positionMs={1000}
        onSeek={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector('.lyrics-scroll') as HTMLElement;
    const activeLine = container.querySelector('.lyrics-line[data-active="true"]') as HTMLButtonElement;
    let activeTop = 200;

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    scrollContainer.getBoundingClientRect = vi.fn(() => makeRect(0, 400));
    activeLine.getBoundingClientRect = vi.fn(() => makeRect(activeTop, 42));
    scrollContainer.scrollTop = 120;

    act(() => {
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: { lyricsFontSizePx: 44 } }));
    });

    activeTop = 164;
    act(() => {
      for (const [id, callback] of Array.from(frames.entries())) {
        frames.delete(id);
        callback(16);
      }
    });

    expect(scrollContainer.scrollTop).toBe(120);
  });
});
