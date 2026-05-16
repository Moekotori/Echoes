import type { AudioDeviceInfo, AudioLatencyProfile, AudioOutputMode, AudioOutputSettings, AudioSharedBackend } from '../../../shared/types/audio';
import type { RememberedAudioOutput } from '../../../shared/types/appSettings';
import { getAppBridge } from '../../utils/echoBridge';

const storageKey = 'echo-next.audio-output-memory';
const lowLatencyMaxBufferSizeFrames = 2048;

export const resolveSupportedLatencyProfile = (
  _outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
): AudioLatencyProfile => {
  return latencyProfile;
};

export const normalizeSharedBackend = (value: unknown): AudioSharedBackend =>
  value === 'windows' || value === 'directsound' ? value : 'auto';

const sanitizeBufferSizeFrames = (
  outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
  bufferSizeFrames: unknown,
): number | undefined => {
  const numeric = Number(bufferSizeFrames);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  const rounded = Math.round(numeric);
  if (latencyProfile !== 'lowLatency' || rounded <= lowLatencyMaxBufferSizeFrames) {
    return rounded;
  }

  return outputMode === 'shared' ? undefined : lowLatencyMaxBufferSizeFrames;
};

export const readRememberedAudioOutput = (): RememberedAudioOutput => {
  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return { enabled: false, outputMode: 'shared', sharedBackend: 'auto', latencyProfile: 'balanced' };
    }

    const parsed = JSON.parse(raw) as Partial<RememberedAudioOutput>;
    const outputMode = parsed.outputMode === 'exclusive' || parsed.outputMode === 'asio' ? parsed.outputMode : 'shared';
    const sharedBackend = normalizeSharedBackend(parsed.sharedBackend);
    const latencyProfile =
      parsed.latencyProfile === 'stable' || parsed.latencyProfile === 'balanced' || parsed.latencyProfile === 'lowLatency'
        ? parsed.latencyProfile
        : 'balanced';
    const remembered: RememberedAudioOutput = {
      enabled: parsed.enabled === true,
      outputMode,
      sharedBackend,
      latencyProfile: resolveSupportedLatencyProfile(outputMode, latencyProfile),
      deviceIndex: Number.isInteger(Number(parsed.deviceIndex)) ? Number(parsed.deviceIndex) : undefined,
      deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName.trim() ? parsed.deviceName : undefined,
      asioOutputChannelStart: outputMode === 'asio' && Number.isInteger(Number(parsed.asioOutputChannelStart)) && Number(parsed.asioOutputChannelStart) >= 0
        ? Number(parsed.asioOutputChannelStart)
        : undefined,
    };

    const bufferSizeFrames = sanitizeBufferSizeFrames(outputMode, latencyProfile, parsed.bufferSizeFrames);
    if (bufferSizeFrames !== undefined) {
      remembered.bufferSizeFrames = bufferSizeFrames;
    }

    return remembered;
  } catch {
    return { enabled: false, outputMode: 'shared', sharedBackend: 'auto', latencyProfile: 'balanced' };
  }
};

export const writeRememberedAudioOutput = (settings: RememberedAudioOutput): void => {
  const latencyProfile = settings.latencyProfile ?? 'balanced';
  const sanitized = {
    ...settings,
    latencyProfile,
    bufferSizeFrames: sanitizeBufferSizeFrames(settings.outputMode, latencyProfile, settings.bufferSizeFrames),
  };
  if (sanitized.bufferSizeFrames === undefined) {
    delete sanitized.bufferSizeFrames;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(sanitized));
  void getAppBridge()?.setSettings({ rememberedAudioOutput: sanitized }).catch(() => undefined);
};

export const loadPersistedRememberedAudioOutput = async (): Promise<RememberedAudioOutput> => {
  const appBridge = getAppBridge();
  const localOutput = readRememberedAudioOutput();

  if (!appBridge) {
    return localOutput;
  }

  const settings = await appBridge.getSettings();
  const rawRemembered = (settings.appMemoryVersion ?? 0) < 1 && localOutput.enabled
    ? localOutput
    : (settings.rememberedAudioOutput ?? { enabled: false, outputMode: 'shared', sharedBackend: 'auto', latencyProfile: 'balanced' });
  const outputMode = rawRemembered.outputMode === 'exclusive' || rawRemembered.outputMode === 'asio'
    ? rawRemembered.outputMode
    : 'shared';
  const latencyProfile =
    rawRemembered.latencyProfile === 'stable' || rawRemembered.latencyProfile === 'balanced' || rawRemembered.latencyProfile === 'lowLatency'
      ? rawRemembered.latencyProfile
      : 'balanced';
  const remembered: RememberedAudioOutput = {
    ...rawRemembered,
    outputMode,
    sharedBackend: normalizeSharedBackend(rawRemembered.sharedBackend),
    latencyProfile: resolveSupportedLatencyProfile(outputMode, latencyProfile),
    bufferSizeFrames: sanitizeBufferSizeFrames(outputMode, latencyProfile, rawRemembered.bufferSizeFrames),
    asioOutputChannelStart:
      outputMode === 'asio' &&
      Number.isInteger(Number(rawRemembered.asioOutputChannelStart)) &&
      Number(rawRemembered.asioOutputChannelStart) >= 0
        ? Number(rawRemembered.asioOutputChannelStart)
        : undefined,
  };
  if (remembered.bufferSizeFrames === undefined) {
    delete remembered.bufferSizeFrames;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(remembered));

  if ((settings.appMemoryVersion ?? 0) < 1 && localOutput.enabled) {
    void appBridge.setSettings({ rememberedAudioOutput: remembered }).catch(() => undefined);
  }

  return remembered;
};

export const createOutputSettings = (
  outputMode: AudioOutputMode,
  device: AudioDeviceInfo | null,
  latencyProfile: AudioLatencyProfile = 'balanced',
  sharedBackend: AudioSharedBackend = 'auto',
): AudioOutputSettings => {
  const normalizedSharedBackend = outputMode === 'shared' ? normalizeSharedBackend(sharedBackend) : 'auto';
  const settings: AudioOutputSettings = {
    outputMode,
    latencyProfile: resolveSupportedLatencyProfile(outputMode, latencyProfile),
  };

  if (outputMode === 'shared') {
    settings.sharedBackend = normalizedSharedBackend;
  }

  if (device) {
    if (normalizedSharedBackend !== 'directsound') {
      settings.deviceIndex = device.index;
    }
    settings.deviceName = device.name;
    if (outputMode === 'asio' && Number.isInteger(Number(device.asioOutputChannelStart)) && Number(device.asioOutputChannelStart) >= 0) {
      settings.asioOutputChannelStart = Number(device.asioOutputChannelStart);
    }
  }

  return settings;
};
