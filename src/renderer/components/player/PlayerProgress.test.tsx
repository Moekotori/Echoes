// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerProgress } from './PlayerProgress';

describe('PlayerProgress', () => {
  it('previews drag position locally and commits only when released', () => {
    const onCommit = vi.fn();

    render(
      <PlayerProgress
        disabled={false}
        durationSeconds={180}
        positionSeconds={4}
        onCommit={onCommit}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Seek position' });
    expect(screen.getByText('0:04')).toBeTruthy();

    fireEvent.change(slider, { target: { value: '30' } });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('0:30')).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe('30');

    fireEvent.pointerUp(slider);

    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it('keeps the Dark Side theme prism progress treatment scoped to that preset', () => {
    const css = readFileSync('src/renderer/styles/theme-presets.css', 'utf8');

    expect(css).toContain('The Dark Side of the Moon theme, a tribute to Pink Floyd.');
    expect(css).toContain('html[data-theme-preset="darkSideMoon"] .player-bar .progress-track');
    expect(css).toContain('html[data-theme-preset="darkSideMoon"] .player-bar .progress-fill');
    expect(css).toContain('html[data-theme-preset="darkSideMoon"] .player-bar .progress-thumb');
    expect(css).toContain('#ed2f3b');
    expect(css).toContain('#f6d93b');
    expect(css).toContain('#26a8ed');
    expect(css).toContain('clip-path: polygon(50% 0, 100% 100%, 0 100%);');
  });
});
