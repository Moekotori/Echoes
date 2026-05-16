import { writeFileSync } from 'node:fs';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { normalizeAudioOutputModeForPlatform, normalizeAudioSharedBackendForPlatform } from '../../shared/utils/audioPlatformCapabilities';
import type {
  AudioDiagnostics,
  AudioDeviceInfo,
  AudioLatencyProfile,
  AudioOutputMode,
  AudioOutputSettings,
  AudioSharedBackend,
  AudioStatus,
  ChannelBalanceState,
  PlaybackSpeedMode,
} from '../../shared/types/audio';
import type { EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../../shared/types/eq';
import { getAudioSession } from '../audio/AudioSession';
import { getEqBridge } from '../audio/EqBridge';
import { restartWindowsAudioService } from '../audio/WindowsAudioServiceManager';
import { getCrashReportService } from '../diagnostics/CrashReportService';

const outputModes = new Set<AudioOutputMode>(['shared', 'exclusive', 'asio']);
const sharedBackends = new Set<AudioSharedBackend>(['auto', 'windows', 'directsound']);
const latencyProfiles = new Set<AudioLatencyProfile>(['stable', 'balanced', 'lowLatency']);
const playbackSpeedModes = new Set<PlaybackSpeedMode>(['nightcore', 'daycore', 'speed']);

const safeExportFileName = (value: string): string => {
  const trimmed = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 96) : 'ECHO Next EQ Preset';
};

const exportEqPreset = async (request: EqSavePresetRequest): Promise<string | null> => {
  const savedName = typeof request.name === 'string' && request.name.trim() ? request.name.trim() : 'ECHO Next EQ Preset';
  const result = await dialog.showSaveDialog({
    title: 'Export EQ Preset',
    defaultPath: `${safeExportFileName(savedName)}.json`,
    filters: [{ name: 'ECHO Next EQ Preset', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  writeFileSync(
    result.filePath,
    `${JSON.stringify(
      {
        type: 'echo-next-eq-preset',
        version: 1,
        exportedAt: new Date().toISOString(),
        preset: {
          name: savedName,
          preampDb: request.preampDb,
          bands: request.bands,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return result.filePath;
};

const normalizeOutputSettings = (value: unknown): AudioOutputSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('audio output settings must be an object');
  }

  const input = value as Record<string, unknown>;
  const output: AudioOutputSettings = {};

  if (typeof input.outputMode === 'string' && outputModes.has(input.outputMode as AudioOutputMode)) {
    output.outputMode = normalizeAudioOutputModeForPlatform(input.outputMode as AudioOutputMode, process.platform);
  }

  if (typeof input.sharedBackend === 'string' && sharedBackends.has(input.sharedBackend as AudioSharedBackend)) {
    output.sharedBackend = normalizeAudioSharedBackendForPlatform(input.sharedBackend as AudioSharedBackend, process.platform);
  }

  if (typeof input.deviceIndex === 'number' && Number.isInteger(input.deviceIndex)) {
    output.deviceIndex = input.deviceIndex;
  }

  if (typeof input.deviceName === 'string' && input.deviceName.trim()) {
    output.deviceName = input.deviceName;
  }

  if (
    typeof input.asioOutputChannelStart === 'number' &&
    Number.isInteger(input.asioOutputChannelStart) &&
    input.asioOutputChannelStart >= 0
  ) {
    output.asioOutputChannelStart = input.asioOutputChannelStart;
  }

  if (
    typeof input.requestedOutputSampleRate === 'number' &&
    Number.isFinite(input.requestedOutputSampleRate) &&
    input.requestedOutputSampleRate > 0
  ) {
    output.requestedOutputSampleRate = Math.round(input.requestedOutputSampleRate);
  }

  if (typeof input.latencyProfile === 'string' && latencyProfiles.has(input.latencyProfile as AudioLatencyProfile)) {
    output.latencyProfile = input.latencyProfile as AudioLatencyProfile;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'bufferSizeFrames')) {
    output.bufferSizeFrames =
      typeof input.bufferSizeFrames === 'number' && Number.isFinite(input.bufferSizeFrames) && input.bufferSizeFrames > 0
        ? Math.round(input.bufferSizeFrames)
        : null;
  }

  if (typeof input.useJuceOutput === 'boolean') {
    output.useJuceOutput = input.useJuceOutput;
  }

  if (typeof input.asioUnavailableFallbackEnabled === 'boolean') {
    output.asioUnavailableFallbackEnabled = input.asioUnavailableFallbackEnabled;
  }

  if (typeof input.soxrFallbackEnabled === 'boolean') {
    output.soxrFallbackEnabled = input.soxrFallbackEnabled;
  }

  if (typeof input.volume === 'number' && Number.isFinite(input.volume)) {
    output.volume = Math.max(0, Math.min(1, input.volume));
  }

  if (typeof input.playbackRate === 'number' && Number.isFinite(input.playbackRate)) {
    output.playbackRate = Math.max(0.5, Math.min(2, input.playbackRate));
  }

  if (typeof input.playbackSpeedMode === 'string' && playbackSpeedModes.has(input.playbackSpeedMode as PlaybackSpeedMode)) {
    output.playbackSpeedMode = input.playbackSpeedMode as PlaybackSpeedMode;
  }

  return output;
};

const reportAudioIpcError = (error: unknown, phase: string, details?: unknown): void => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const status = getAudioSession().getStatus();

  if (status.error === normalized.message) {
    return;
  }

  getCrashReportService().reportAudioError({
    message: normalized.message,
    stack: normalized.stack,
    phase,
    severity: 'fatal',
    details,
    audioStatus: status,
  });
};

export const registerAudioIpc = (): void => {
  getAudioSession().on('status', (status: AudioStatus) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.AudioStatus, status);
    }
  });
  getAudioSession().on('session-reset', (event: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.AudioSessionReset, event);
    }
  });

  ipcMain.handle(IpcChannels.AudioGetStatus, (): AudioStatus => getAudioSession().getStatus());
  ipcMain.handle(IpcChannels.AudioGetDiagnostics, (): AudioDiagnostics => getAudioSession().getDiagnostics());
  ipcMain.handle(IpcChannels.AudioListDevices, async (): Promise<AudioDeviceInfo[]> => getAudioSession().listDevicesAsync());
  ipcMain.handle(IpcChannels.AudioSetOutput, async (_event, settings: unknown): Promise<AudioStatus> => {
    try {
      const normalized = normalizeOutputSettings(settings);
      return await getAudioSession().setOutput(normalized);
    } catch (error) {
      reportAudioIpcError(error, 'set-output-ipc', { settings });
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.AudioOpenAsioControlPanel, async (_event, settings: unknown): Promise<void> => {
    try {
      const normalized = normalizeOutputSettings({ ...(typeof settings === 'object' && settings ? settings : {}), outputMode: 'asio' });
      await getAudioSession().openAsioControlPanel(normalized);
    } catch (error) {
      reportAudioIpcError(error, 'open-asio-control-panel-ipc', { settings });
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.AudioResetEngine, async (): Promise<AudioStatus> => {
    try {
      return await getAudioSession().forceRestart('reset-audio-engine');
    } catch (error) {
      reportAudioIpcError(error, 'reset-engine-ipc');
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.AudioForceRestart, async (_event, reason: unknown): Promise<AudioStatus> => {
    try {
      const resetReason = typeof reason === 'string' && reason.trim() ? reason : 'force-restart';
      return await getAudioSession().forceRestart(resetReason);
    } catch (error) {
      reportAudioIpcError(error, 'force-restart-ipc', { reason });
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.AudioRestartWindowsAudioService, async (): Promise<AudioStatus> => {
    try {
      const session = getAudioSession();
      await session.stopForWindowsAudioServiceRestart();
      await restartWindowsAudioService();
      return await session.forceRestart('windows-audio-service-restart');
    } catch (error) {
      reportAudioIpcError(error, 'restart-windows-audio-service-ipc');
      throw error;
    }
  });
  ipcMain.handle(IpcChannels.EqGetState, (): EqState => getEqBridge().getState());
  ipcMain.handle(IpcChannels.EqSetEnabled, async (_event, enabled: unknown): Promise<EqState> =>
    getEqBridge().setEnabled(Boolean(enabled)),
  );
  ipcMain.handle(IpcChannels.EqSetBandGain, async (_event, request: EqSetBandGainRequest): Promise<EqState> =>
    getEqBridge().setBandGain(request),
  );
  ipcMain.handle(IpcChannels.EqSetBandFrequency, async (_event, request: EqSetBandFrequencyRequest): Promise<EqState> =>
    getEqBridge().setBandFrequency(request),
  );
  ipcMain.handle(IpcChannels.EqSetPreamp, async (_event, preampDb: unknown): Promise<EqState> =>
    getEqBridge().setPreamp(Number(preampDb)),
  );
  ipcMain.handle(IpcChannels.EqSetPreset, async (_event, presetId: unknown): Promise<EqState> =>
    getEqBridge().setPreset(String(presetId)),
  );
  ipcMain.handle(IpcChannels.EqReset, async (): Promise<EqState> => getEqBridge().reset());
  ipcMain.handle(IpcChannels.EqListPresets, () => getEqBridge().listPresets());
  ipcMain.handle(IpcChannels.EqSavePreset, (_event, request: EqSavePresetRequest) => getEqBridge().savePreset(request));
  ipcMain.handle(IpcChannels.EqExportPreset, (_event, request: EqSavePresetRequest) => exportEqPreset(request));
  ipcMain.handle(IpcChannels.EqDeletePreset, (_event, presetId: unknown) => getEqBridge().deletePreset(String(presetId)));
  ipcMain.handle(IpcChannels.ChannelBalanceGetState, (): ChannelBalanceState => getEqBridge().getChannelBalanceState());
  ipcMain.handle(IpcChannels.ChannelBalanceSetState, async (_event, patch: Partial<ChannelBalanceState>): Promise<ChannelBalanceState> =>
    getEqBridge().setChannelBalanceState(patch),
  );
  ipcMain.handle(IpcChannels.ChannelBalanceReset, async (): Promise<ChannelBalanceState> => getEqBridge().resetChannelBalance());
};
