// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LyricsLine } from './LyricsLine';

afterEach(() => {
  cleanup();
});

describe('LyricsLine', () => {
  const line = { timeMs: 1000, text: 'さくら', romanization: 'sakura' };

  it('shows romanization when enabled', () => {
    render(<LyricsLine active={false} line={line} past={false} onSeek={vi.fn()} />);

    expect(screen.getByText('sakura')).toBeTruthy();
  });

  it('hides romanization when disabled', () => {
    render(<LyricsLine active={false} line={line} past={false} showRomanization={false} onSeek={vi.fn()} />);

    expect(screen.queryByText('sakura')).toBeNull();
    expect(screen.getByText('さくら')).toBeTruthy();
  });
});
