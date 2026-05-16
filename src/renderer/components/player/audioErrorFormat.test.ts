import { describe, expect, it } from 'vitest';
import { formatAudioHostError, shouldSuppressAudioHostError } from './audioErrorFormat';

describe('audio error formatting', () => {
  it('suppresses non-actionable playback control errors', () => {
    const messages = [
      "Error invoking remote method 'playback:play-local-file': Error: eq_control_disconnected",
      'eq_control_closed',
      'eq_control_sync_skipped',
      'audio_session_run_cancelled',
    ];

    for (const message of messages) {
      expect(shouldSuppressAudioHostError(message)).toBe(true);
      expect(formatAudioHostError(message)).toBeNull();
    }
  });

  it('keeps actionable playback errors visible', () => {
    const message = 'echo-audio-host spawn_error: missing binary';

    expect(shouldSuppressAudioHostError(message)).toBe(false);
    expect(formatAudioHostError(message)).toBeTruthy();
  });
});
