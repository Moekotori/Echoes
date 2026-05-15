import { describe, expect, it } from 'vitest';
import {
  isAdvancedNativeOutputPlatform,
  isNativeSharedOutputPlatform,
  normalizeAudioOutputModeForPlatform,
} from './audioPlatformCapabilities';

describe('audio platform capabilities', () => {
  it('keeps Windows output modes unchanged', () => {
    expect(isAdvancedNativeOutputPlatform('win32')).toBe(true);
    expect(isNativeSharedOutputPlatform('win32')).toBe(true);
    expect(normalizeAudioOutputModeForPlatform('shared', 'win32')).toBe('shared');
    expect(normalizeAudioOutputModeForPlatform('exclusive', 'win32')).toBe('exclusive');
    expect(normalizeAudioOutputModeForPlatform('asio', 'win32')).toBe('asio');
  });

  it('allows Linux shared output and downgrades advanced output modes', () => {
    expect(isAdvancedNativeOutputPlatform('linux')).toBe(false);
    expect(isNativeSharedOutputPlatform('linux')).toBe(true);
    expect(normalizeAudioOutputModeForPlatform('shared', 'linux')).toBe('shared');
    expect(normalizeAudioOutputModeForPlatform('exclusive', 'linux')).toBe('shared');
    expect(normalizeAudioOutputModeForPlatform('asio', 'linux')).toBe('shared');
  });
});
