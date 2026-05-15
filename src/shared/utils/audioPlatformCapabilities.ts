import type { AudioOutputMode } from '../types/audio';

export const isAdvancedNativeOutputPlatform = (platform: string): boolean => platform === 'win32';

export const isNativeSharedOutputPlatform = (platform: string): boolean => platform === 'win32' || platform === 'linux';

export const normalizeAudioOutputModeForPlatform = (
  outputMode: AudioOutputMode,
  platform: string,
): AudioOutputMode => (isAdvancedNativeOutputPlatform(platform) ? outputMode : 'shared');

export const detectRendererPlatform = (navigatorLike: Pick<Navigator, 'platform' | 'userAgent'>): NodeJS.Platform | 'unknown' => {
  const platform = `${navigatorLike.platform} ${navigatorLike.userAgent}`.toLocaleLowerCase();

  if (platform.includes('win')) {
    return 'win32';
  }

  if (platform.includes('linux')) {
    return 'linux';
  }

  if (platform.includes('mac')) {
    return 'darwin';
  }

  return 'unknown';
};
