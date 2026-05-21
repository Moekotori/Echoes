import { describe, expect, it, vi } from 'vitest';
import {
  createStartupDiagnosticsTracker,
  openSafeModeStartupConsoleIfEnabled,
  recordSafeModeStartupBanner,
} from './StartupDiagnostics';

const safeModeContext = {
  appVersion: '1.2.3',
  platform: 'win32' as NodeJS.Platform,
  arch: 'x64',
  userDataPath: 'D:\\Users\\mochi\\AppData\\Roaming\\ECHO NEXT',
};

describe('createStartupDiagnosticsTracker', () => {
  it('records ordered startup stages with elapsed time and slow flags', () => {
    const messages: string[] = [];
    const times = [1000, 1250, 3500, 3600];
    const tracker = createStartupDiagnosticsTracker(() => times.shift() ?? 3600, (message) => messages.push(message));

    const first = tracker.mark('main:module-loaded');
    const second = tracker.mark('data-protection:startup:complete', { databasePath: 'D:\\Music\\echo.sqlite' });
    const third = tracker.mark('startup:ready');

    expect(first).toMatchObject({ index: 1, stage: 'main:module-loaded', elapsedMs: 250, deltaMs: 250, slow: false });
    expect(second).toMatchObject({ index: 2, stage: 'data-protection:startup:complete', elapsedMs: 2500, deltaMs: 2250, slow: true });
    expect(second.details).toEqual({ databasePath: { basename: 'echo.sqlite', pathHash: expect.any(String) } });
    expect(third).toMatchObject({ index: 3, stage: 'startup:ready', elapsedMs: 2600, deltaMs: 100, slow: false });
    expect(tracker.snapshot()).toHaveLength(3);
    expect(messages[1]).toContain('SLOW');
  });
});

describe('safe mode startup console', () => {
  it('opens the debug console and records a banner when enabled', () => {
    const openConsole = vi.fn();

    expect(openSafeModeStartupConsoleIfEnabled({ safeModeEnabled: true }, safeModeContext, openConsole)).toBe(true);
    expect(openConsole).toHaveBeenCalledTimes(1);
  });

  it('does not open the debug console when disabled', () => {
    const openConsole = vi.fn();

    expect(openSafeModeStartupConsoleIfEnabled({ safeModeEnabled: false }, safeModeContext, openConsole)).toBe(false);
    expect(openConsole).not.toHaveBeenCalled();
  });

  it('redacts the userData path in the safe mode banner', () => {
    expect(() => recordSafeModeStartupBanner(safeModeContext)).not.toThrow();
  });
});
