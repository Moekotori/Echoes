// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AudioSettingsDrawer } from './AudioSettingsDrawer';
import type { AudioDeviceInfo, AudioStatus } from '../../../shared/types/audio';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const value = key.split('.').at(-1) ?? key;

      if (value === 'value' && options?.value !== undefined) {
        return `${options.value} ms`;
      }

      if (value === 'status') {
        return `Requested ${options?.requested ?? 'Auto'} frames / opened ${options?.opened ?? 'n/a'} frames`;
      }

      return value;
    },
  }),
}));

const baseStatus: AudioStatus = {
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: null,
  activeOutputBackendImpl: null,
  outputMode: 'shared',
  useJuceOutputRequested: false,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: null,
  currentTrackId: null,
  durationSeconds: 0,
  positionSeconds: 0,
  channels: 2,
  codec: 'flac',
  bitDepth: 16,
  bitrate: 900000,
  fileSampleRate: 48000,
  decoderOutputSampleRate: 48000,
  requestedOutputSampleRate: 48000,
  actualDeviceSampleRate: 48000,
  sharedDeviceSampleRate: null,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  latencyProfile: 'lowLatency',
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: 'Flat',
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  nativeRequestedBufferFrames: null,
  nativeActualBufferFrames: null,
  nativeOutputLatencyMs: null,
  warnings: [],
  error: null,
};

const asioDevice: AudioDeviceInfo = {
  id: 'asio:0',
  index: 0,
  name: 'TEAC ASIO',
  outputMode: 'asio',
  sampleRate: null,
  sharedDeviceSampleRate: 48000,
  isDefault: true,
};

const renderDrawer = (status: AudioStatus, setOutput = vi.fn().mockResolvedValue(status)): void => {
  window.echo = {
    app: {
      getSettings: vi.fn().mockResolvedValue({ rememberedAudioOutput: { enabled: false } }),
      setSettings: vi.fn().mockResolvedValue({}),
    },
    audio: {
      listDevices: vi.fn().mockResolvedValue([asioDevice]),
      getStatus: vi.fn().mockResolvedValue(status),
      getDiagnostics: vi.fn().mockResolvedValue(status),
      setOutput,
    },
  } as unknown as Window['echo'];

  render(
    <AudioSettingsDrawer
      isOpen
      status={status}
      onClose={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  );
};

const setNavigatorUserAgent = (userAgent: string): void => {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: userAgent.includes('Linux') ? 'Linux x86_64' : 'Win32',
  });
};

beforeEach(() => {
  window.localStorage.clear();
  setNavigatorUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => window.clearTimeout(id),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as Partial<Window>).echo;
});

describe('AudioSettingsDrawer ASIO buffer controls', () => {
  it('shows low latency while WASAPI exclusive mode is selected', () => {
    renderDrawer({
      ...baseStatus,
      outputMode: 'exclusive',
      outputBackend: 'wasapi-exclusive',
      latencyProfile: 'lowLatency',
    });

    expect(screen.getByRole('button', { name: /Low latency/ }).className).toContain('active');
    expect(screen.getByRole('button', { name: /Balanced/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stable/ })).toBeTruthy();
  });

  it('shows Windows-only output controls on Windows', async () => {
    renderDrawer(baseStatus);

    await waitFor(() => expect(screen.getAllByText('TEAC ASIO').length).toBeGreaterThan(0));

    expect(screen.getByRole('heading', { name: 'asioDevices' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /wasapiExclusive/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /TEAC ASIO/ })).toBeTruthy();
  });

  it('does not force low latency when switching WASAPI exclusive on', async () => {
    const setOutput = vi.fn().mockResolvedValue({
      ...baseStatus,
      outputMode: 'exclusive',
      outputBackend: 'wasapi-exclusive',
      latencyProfile: 'balanced',
    });
    renderDrawer({ ...baseStatus, latencyProfile: 'balanced' }, setOutput);

    fireEvent.click(screen.getByRole('checkbox', { name: /wasapiExclusive/ }));

    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({ outputMode: 'exclusive', latencyProfile: 'balanced' }));
  });

  it('shows ASIO buffer controls only in ASIO mode', () => {
    renderDrawer({
      ...baseStatus,
      outputMode: 'asio',
      outputBackend: 'asio',
      outputDeviceName: 'TEAC ASIO',
      nativeRequestedBufferFrames: 128,
      nativeActualBufferFrames: 256,
      nativeOutputLatencyMs: 5,
    });

    expect(screen.getByRole('heading', { name: 'ASIO buffer' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /128/ }).length).toBeGreaterThan(0);
    expect(document.querySelector('.audio-current-output-card--asio')).toBeTruthy();
    expect(screen.getByText('recommended')).toBeTruthy();
    expect(screen.getByText('5 ms')).toBeTruthy();

    cleanup();
    renderDrawer(baseStatus);

    expect(screen.queryByRole('heading', { name: 'ASIO buffer' })).toBeNull();
  });

  it('locks the WASAPI exclusive toggle while ASIO mode is active', async () => {
    const status = {
      ...baseStatus,
      outputMode: 'asio' as const,
      outputBackend: 'asio',
      outputDeviceName: 'TEAC ASIO',
    };
    const setOutput = vi.fn().mockResolvedValue(status);
    renderDrawer(status, setOutput);

    const exclusiveToggle = screen.getByRole('checkbox', { name: /wasapiExclusive/ });

    expect(exclusiveToggle).toHaveProperty('disabled', true);
    fireEvent.click(exclusiveToggle);

    await waitFor(() => expect(setOutput).not.toHaveBeenCalled());
  });

  it('applies an explicit ASIO buffer size', async () => {
    const status = {
      ...baseStatus,
      outputMode: 'asio' as const,
      outputBackend: 'asio',
      nativeRequestedBufferFrames: null,
    };
    const setOutput = vi.fn().mockResolvedValue({ ...status, nativeRequestedBufferFrames: 128 });
    renderDrawer(status, setOutput);

    fireEvent.click(screen.getByRole('button', { name: /128/ }));

    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({ bufferSizeFrames: 128 }));
  });

  it('recovers controls after an ASIO output switch fails', async () => {
    const sharedStatus = {
      ...baseStatus,
      outputMode: 'shared' as const,
      outputBackend: 'wasapi-shared',
    };
    const setOutput = vi
      .fn()
      .mockRejectedValueOnce(new Error('ASIO open failed'))
      .mockResolvedValueOnce(sharedStatus);
    renderDrawer(sharedStatus, setOutput);

    await waitFor(() => expect(screen.getAllByText('TEAC ASIO').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /TEAC ASIO/ }));

    await waitFor(() => expect(screen.getByText('ASIO open failed')).toBeTruthy());

    const asioButton = screen.getByRole('button', { name: /TEAC ASIO/ });
    expect(asioButton).toHaveProperty('disabled', false);
    fireEvent.click(asioButton);

    await waitFor(() => expect(setOutput).toHaveBeenCalledTimes(2));
  });

  it('clears explicit ASIO buffer size when Auto is selected', async () => {
    const status = {
      ...baseStatus,
      outputMode: 'asio' as const,
      outputBackend: 'asio',
      nativeRequestedBufferFrames: 128,
      nativeActualBufferFrames: 256,
    };
    const setOutput = vi.fn().mockResolvedValue({ ...status, nativeRequestedBufferFrames: null });
    renderDrawer(status, setOutput);

    fireEvent.click(screen.getByRole('button', { name: /Auto/ }));

    await waitFor(() => expect(setOutput).toHaveBeenCalledWith({ bufferSizeFrames: null }));
  });

  it('saves current output mode and ASIO buffer when output settings are enabled', async () => {
    renderDrawer({
      ...baseStatus,
      outputMode: 'asio',
      outputBackend: 'asio',
      outputDeviceName: 'TEAC ASIO',
      latencyProfile: 'balanced',
      nativeRequestedBufferFrames: 256,
      nativeActualBufferFrames: 256,
    });

    await waitFor(() => expect(screen.getAllByText('TEAC ASIO').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('checkbox', { name: /rememberOutput/ }));

    const remembered = JSON.parse(window.localStorage.getItem('echo-next.audio-output-memory') ?? '{}');
    expect(remembered).toMatchObject({
      enabled: true,
      outputMode: 'asio',
      latencyProfile: 'balanced',
      deviceIndex: 0,
      deviceName: 'TEAC ASIO',
      bufferSizeFrames: 256,
    });
  });

  it('hides Windows-only output controls on Linux', async () => {
    setNavigatorUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    renderDrawer(baseStatus);

    await waitFor(() => expect(window.echo?.audio?.listDevices).toHaveBeenCalled());

    expect(screen.queryByRole('heading', { name: 'asioDevices' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /wasapiExclusive/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /TEAC ASIO/ })).toBeNull();
  });
});
