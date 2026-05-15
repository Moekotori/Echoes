import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  AudioDiagnostics,
  AudioDeviceInfo,
  AudioLatencyProfile,
  AudioOutputMode,
  AudioOutputSettings,
  AudioStatus,
  ChannelBalanceState,
  PlaybackSpeedMode,
} from '../../shared/types/audio';
import type { EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../../shared/types/eq';
import { getAudioSession } from '../audio/AudioSession';
import { getEqBridge } from '../audio/EqBridge';

const outputModes = new Set<AudioOutputMode>(['shared', 'exclusive', 'asio']);
const latencyProfiles = new Set<AudioLatencyProfile>(['stable', 'balanced', 'lowLatency']);
const playbackSpeedModes = new Set<PlaybackSpeedMode>(['nightcore', 'daycore', 'speed']);

const normalizeOutputSettings = (value: unknown): AudioOutputSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('audio output settings must be an object');
  }

  const input = value as Record<string, unknown>;
  const output: AudioOutputSettings = {};

  if (typeof input.outputMode === 'string' && outputModes.has(input.outputMode as AudioOutputMode)) {
    output.outputMode = input.outputMode as AudioOutputMode;
  }

  if (typeof input.deviceIndex === 'number' && Number.isInteger(input.deviceIndex)) {
    output.deviceIndex = input.deviceIndex;
  }

  if (typeof input.deviceName === 'string' && input.deviceName.trim()) {
    output.deviceName = input.deviceName;
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

  if (typeof input.bufferSizeFrames === 'number' && Number.isFinite(input.bufferSizeFrames) && input.bufferSizeFrames > 0) {
    output.bufferSizeFrames = Math.round(input.bufferSizeFrames);
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

export const registerAudioIpc = (): void => {
  getAudioSession().on('status', (status: AudioStatus) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.AudioStatus, status);
    }
  });

  ipcMain.handle(IpcChannels.AudioGetStatus, (): AudioStatus => getAudioSession().getStatus());
  ipcMain.handle(IpcChannels.AudioGetDiagnostics, (): AudioDiagnostics => getAudioSession().getDiagnostics());
  ipcMain.handle(IpcChannels.AudioListDevices, async (): Promise<AudioDeviceInfo[]> => getAudioSession().listDevicesAsync());
  ipcMain.handle(IpcChannels.AudioSetOutput, async (_event, settings: unknown): Promise<AudioStatus> =>
    getAudioSession().setOutput(normalizeOutputSettings(settings)),
  );
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
  ipcMain.handle(IpcChannels.EqDeletePreset, (_event, presetId: unknown) => getEqBridge().deletePreset(String(presetId)));
  ipcMain.handle(IpcChannels.ChannelBalanceGetState, (): ChannelBalanceState => getEqBridge().getChannelBalanceState());
  ipcMain.handle(IpcChannels.ChannelBalanceSetState, async (_event, patch: Partial<ChannelBalanceState>): Promise<ChannelBalanceState> =>
    getEqBridge().setChannelBalanceState(patch),
  );
  ipcMain.handle(IpcChannels.ChannelBalanceReset, async (): Promise<ChannelBalanceState> => getEqBridge().resetChannelBalance());
};
