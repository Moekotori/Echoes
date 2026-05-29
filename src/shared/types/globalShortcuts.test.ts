import { describe, expect, it } from 'vitest';
import {
  createRecommendedGlobalShortcuts,
  createRecommendedLocalShortcuts,
  validateGlobalShortcutAccelerator,
} from './globalShortcuts';

describe('recommended shortcuts', () => {
  it('keeps common playback shortcuts simple and valid', () => {
    const localShortcuts = createRecommendedLocalShortcuts();
    const globalShortcuts = createRecommendedGlobalShortcuts();

    expect(localShortcuts.previousTrack).toEqual({ enabled: false, accelerator: 'Ctrl+K' });
    expect(localShortcuts.nextTrack).toEqual({ enabled: false, accelerator: 'Ctrl+J' });
    expect(globalShortcuts.playPause).toEqual({ enabled: false, accelerator: 'Ctrl+Space' });
    expect(globalShortcuts.previousTrack).toEqual({ enabled: false, accelerator: 'Ctrl+K' });
    expect(globalShortcuts.nextTrack).toEqual({ enabled: false, accelerator: 'Ctrl+J' });
    expect(globalShortcuts.openAudioSettings).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openMvSettings).toEqual({ enabled: false, accelerator: null });
    expect(globalShortcuts.openLyricsSettings).toEqual({ enabled: false, accelerator: null });

    for (const binding of [...Object.values(localShortcuts), ...Object.values(globalShortcuts)]) {
      if (binding.accelerator) {
        expect(validateGlobalShortcutAccelerator(binding.accelerator).valid).toBe(true);
      }
    }
  });
});
