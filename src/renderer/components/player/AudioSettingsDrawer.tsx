import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  AudioLines,
  Check,
  Clipboard,
  EyeOff,
  Gauge,
  Headphones,
  Layers,
  Lock,
  Monitor,
  Music2,
  RefreshCw,
  Route,
  SlidersHorizontal,
  Usb,
  Volume2,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AudioDeviceInfo, AudioDiagnostics, AudioOutputMode, AudioOutputSettings, AudioStatus } from '../../../shared/types/audio';
import { useI18n } from '../../i18n/I18nProvider';
import { createOutputSettings, readRememberedAudioOutput, writeRememberedAudioOutput } from './audioOutputMemory';

type AudioSettingsDrawerProps = {
  isOpen: boolean;
  status: AudioStatus | null;
  onClose: () => void;
  onStatusChange: (status: AudioStatus) => void;
};

type HiddenDeviceMenu = {
  device: AudioDeviceInfo;
  x: number;
  y: number;
} | null;

type AudioDrawerCopy = {
  asioDriver: string;
  balanceDsp: string;
  bitPerfect: string;
  bitPerfectReady: string;
  close: string;
  copyDiagnostics: string;
  copiedDiagnostics: string;
  desktopBridgeUnavailable: string;
  dspActive: string;
  dspOn: string;
  eqOff: string;
  eqOn: string;
  exclusive: string;
  nativeRate: string;
  noActiveSource: string;
  noTrack: string;
  pending: string;
  processed: string;
  ratePending: string;
  resampling: string;
  shared: string;
  sharedMixer: string;
  speedUp: string;
  standardPath: string;
  systemAudio: string;
  systemDefaultOutput: string;
};

const hiddenDeviceStorageKey = 'echo-next.hidden-audio-devices';
const drawerExitAnimationMs = 320;

const getDeviceStorageKey = (device: AudioDeviceInfo): string => `${device.outputMode}:${device.id || device.index}:${device.name}`;

const readHiddenDeviceKeys = (): string[] => {
  try {
    const raw = window.localStorage.getItem(hiddenDeviceStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const writeHiddenDeviceKeys = (keys: string[]): void => {
  try {
    window.localStorage.setItem(hiddenDeviceStorageKey, JSON.stringify(Array.from(new Set(keys))));
  } catch {
    // UI preference only; failure should never block audio settings.
  }
};

const formatRate = (value: number | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value >= 1000 ? `${Math.round(value / 1000)} kHz` : `${value} Hz`;
};

const formatBitrate = (value: number | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return `${Math.round(value / 1000)} kbps`;
};

const formatMode = (mode: AudioOutputMode | null | undefined, copy: AudioDrawerCopy): string => {
  if (mode === 'asio') {
    return 'ASIO';
  }

  if (mode === 'exclusive') {
    return copy.exclusive;
  }

  return copy.shared;
};

const formatCodecLine = (status: AudioStatus | null, copy: AudioDrawerCopy): string => {
  const bitrate = formatBitrate(status?.bitrate);
  const codec = status?.codec?.toUpperCase() ?? copy.noTrack;

  return [codec, bitrate].filter(Boolean).join(' / ');
};

const isHiResAudio = (status: AudioStatus | null): boolean =>
  status?.outputMode !== 'shared' && Boolean((status?.bitDepth && status.bitDepth >= 24) || (status?.fileSampleRate && status.fileSampleRate >= 88200));

const isLosslessCodec = (status: AudioStatus | null): boolean => {
  const codec = status?.codec?.toLocaleLowerCase();

  return Boolean(codec && ['flac', 'wav', 'wave', 'alac', 'aiff', 'ape'].some((losslessCodec) => codec.includes(losslessCodec)));
};

const formatSourceQuality = (status: AudioStatus | null, copy: AudioDrawerCopy): string => {
  const parts = [
    status?.codec?.toUpperCase() ?? null,
    status?.bitDepth ? `${status.bitDepth} bit` : null,
    formatRate(status?.fileSampleRate) || null,
  ].filter(Boolean);

  return parts.length ? parts.join(' / ') : copy.noActiveSource;
};

const getOutputSampleRate = (status: AudioStatus | null, deviceSampleRate?: number | null): number | null => {
  if (status?.outputMode === 'shared') {
    return deviceSampleRate ?? status.sharedDeviceSampleRate ?? status.actualDeviceSampleRate ?? status.requestedOutputSampleRate ?? null;
  }

  return status?.actualDeviceSampleRate ?? status?.requestedOutputSampleRate ?? status?.sharedDeviceSampleRate ?? null;
};

const hasInferredRateMismatch = (status: AudioStatus | null, deviceSampleRate?: number | null): boolean => {
  const fileSampleRate = status?.fileSampleRate ?? null;
  const outputSampleRate = getOutputSampleRate(status, deviceSampleRate);

  return Boolean(fileSampleRate && outputSampleRate && fileSampleRate !== outputSampleRate);
};

const formatRatePath = (status: AudioStatus | null, deviceSampleRate: number | null | undefined, copy: AudioDrawerCopy): string => {
  const sourceRate = formatRate(status?.fileSampleRate);
  const outputRate = formatRate(getOutputSampleRate(status, deviceSampleRate));

  if (sourceRate && outputRate && sourceRate !== outputRate) {
    return `${sourceRate} -> ${outputRate}`;
  }

  return outputRate || sourceRate || copy.ratePending;
};

const getEqSignalText = (status: AudioStatus | null, copy: AudioDrawerCopy): string => {
  if (status?.eqEnabled) {
    return status.eqPresetName ? `${copy.eqOn} / ${status.eqPresetName}` : copy.eqOn;
  }

  if (status?.channelBalanceEnabled) {
    return copy.balanceDsp;
  }

  if (status?.dspActive) {
    return copy.dspOn;
  }

  return copy.eqOff;
};

const getResampleSignalText = (status: AudioStatus | null, deviceSampleRate: number | null | undefined, copy: AudioDrawerCopy): string => {
  if (status?.resampling || status?.sampleRateMismatch || hasInferredRateMismatch(status, deviceSampleRate)) {
    return formatRatePath(status, deviceSampleRate, copy);
  }

  if (status?.outputMode === 'shared') {
    return copy.sharedMixer;
  }

  return copy.nativeRate;
};

const getDirectSignalText = (status: AudioStatus | null, deviceSampleRate: number | null | undefined, copy: AudioDrawerCopy): string => {
  if (status?.outputMode === 'shared') {
    return copy.sharedMixer;
  }

  if (status?.bitPerfectCandidate) {
    return copy.bitPerfect;
  }

  if (status?.bitPerfectDisabledReason) {
    return status.bitPerfectDisabledReason.replaceAll('_', ' ');
  }

  if (
    status?.resampling ||
    status?.sampleRateMismatch ||
    hasInferredRateMismatch(status, deviceSampleRate) ||
    status?.dspActive ||
    status?.eqEnabled ||
    status?.channelBalanceEnabled
  ) {
    return copy.processed;
  }

  return copy.pending;
};

const getSharedStabilityText = (status: AudioStatus | null, unknownValue: string): string => {
  if (status?.outputMode !== 'shared') {
    return 'n/a';
  }

  const tier = status.sharedStabilityTier ?? unknownValue;
  const buffered = status.nativeBufferedMs !== null && status.nativeBufferedMs !== undefined ? `${status.nativeBufferedMs} ms` : unknownValue;
  const recovery = status.lastSharedStabilityRecoveryAt ? 'recovered' : 'auto';
  return `${tier} / ${buffered} / ${recovery}`;
};

const deviceMatchesStatus = (device: AudioDeviceInfo, status: AudioStatus | null, mode: AudioOutputMode): boolean => {
  if (!status || status.outputMode !== mode) {
    return false;
  }

  return status.outputDeviceId === device.id || status.outputDeviceName === device.name;
};

const getDeviceIcon = (deviceName: string, outputMode: AudioOutputMode | AudioDeviceInfo['outputMode']): LucideIcon => {
  const name = deviceName.toLocaleLowerCase();

  if (outputMode === 'asio' || name.includes('asio')) {
    return Zap;
  }

  if (name.includes('default') || name.includes('system')) {
    return Waves;
  }

  if (name.includes('hdmi') || name.includes('monitor') || name.includes('display')) {
    return Monitor;
  }

  if (name.includes('headphone') || name.includes('headset') || name.includes('earphone') || name.includes('earbud')) {
    return Headphones;
  }

  if (name.includes('speaker') || name.includes('realtek')) {
    return Volume2;
  }

  if (
    name.includes('usb') ||
    name.includes('dac') ||
    name.includes('digital') ||
    name.includes('teac') ||
    name.includes('topping') ||
    name.includes('fiio')
  ) {
    return name.includes('usb') ? Usb : AudioLines;
  }

  if (name.includes('virtual') || name.includes('voicemeeter') || name.includes('motiv mix')) {
    return name.includes('virtual') ? Route : Layers;
  }

  return Music2;
};

const getCurrentOutputName = (status: AudioStatus | null, fallbackDeviceName: string | null | undefined, copy: AudioDrawerCopy): string =>
  status?.outputDeviceName || fallbackDeviceName || copy.systemDefaultOutput;

const getCurrentBackend = (status: AudioStatus | null, copy: AudioDrawerCopy): string => status?.outputBackend || status?.outputDeviceType || copy.systemAudio;

const formatDiagnosticsValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '[]';
  }

  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }

  return String(value);
};

const formatAudioDiagnostics = (diagnostics: AudioDiagnostics): string => {
  const rows: Array<[string, unknown]> = [
    ['state', diagnostics.state],
    ['host', diagnostics.host],
    ['outputMode', diagnostics.outputMode],
    ['outputBackend', diagnostics.outputBackend],
    ['outputDeviceName', diagnostics.outputDeviceName],
    ['currentFilePath', diagnostics.currentFilePath],
    ['currentTrackId', diagnostics.currentTrackId],
    ['durationSeconds', diagnostics.durationSeconds],
    ['positionSeconds', diagnostics.positionSeconds],
    ['playbackRate', diagnostics.playbackRate],
    ['fileSampleRate', diagnostics.fileSampleRate],
    ['decoderOutputSampleRate', diagnostics.decoderOutputSampleRate],
    ['requestedOutputSampleRate', diagnostics.requestedOutputSampleRate],
    ['actualDeviceSampleRate', diagnostics.actualDeviceSampleRate],
    ['resampling', diagnostics.resampling],
    ['bitPerfectCandidate', diagnostics.bitPerfectCandidate],
    ['sampleRateMismatch', diagnostics.sampleRateMismatch],
    ['sharedStabilityTier', diagnostics.sharedStabilityTier],
    ['nativeDeviceBufferFrames', diagnostics.nativeDeviceBufferFrames],
    ['nativeFifoCapacityFrames', diagnostics.nativeFifoCapacityFrames],
    ['nativeStartupPrebufferFrames', diagnostics.nativeStartupPrebufferFrames],
    ['nativeBufferedFrames', diagnostics.nativeBufferedFrames],
    ['nativeBufferedMs', diagnostics.nativeBufferedMs],
    ['nativeUnderrunCallbacks', diagnostics.nativeUnderrunCallbacks],
    ['nativeUnderrunFrames', diagnostics.nativeUnderrunFrames],
    ['lastSharedStabilityRecoveryAt', diagnostics.lastSharedStabilityRecoveryAt],
    ['warnings', diagnostics.warnings],
    ['error', diagnostics.error],
    ['watchdogStatus', diagnostics.watchdogStatus],
    ['recentWatchdogRecoveryCount', diagnostics.recentWatchdogRecoveryCount],
    ['lastWatchdogRecoveryTime', diagnostics.lastWatchdogRecoveryTime],
  ];

  return ['ECHO Next Audio Diagnostics', ...rows.map(([label, value]) => `${label}: ${formatDiagnosticsValue(value)}`)].join('\n');
};

export const AudioSettingsDrawer = ({
  isOpen,
  status,
  onClose,
  onStatusChange,
}: AudioSettingsDrawerProps): JSX.Element | null => {
  const { t } = useI18n();
  const copy = useMemo<AudioDrawerCopy>(
    () => ({
      asioDriver: t('audioDrawer.device.asioDriver'),
      balanceDsp: t('audioDrawer.signal.balanceDsp'),
      bitPerfect: t('audioDrawer.signal.bitPerfect'),
      bitPerfectReady: t('audioDrawer.badge.bitPerfectReady'),
      close: t('audioDrawer.action.close'),
      copyDiagnostics: t('audioDrawer.action.copyDiagnostics'),
      copiedDiagnostics: t('audioDrawer.action.copiedDiagnostics'),
      desktopBridgeUnavailable: t('audioDrawer.error.desktopBridgeUnavailable'),
      dspActive: t('audioDrawer.badge.dspActive'),
      dspOn: t('audioDrawer.signal.dspOn'),
      eqOff: t('audioDrawer.signal.eqOff'),
      eqOn: t('audioDrawer.signal.eqOn'),
      exclusive: t('audioDrawer.mode.exclusive'),
      nativeRate: t('audioDrawer.signal.nativeRate'),
      noActiveSource: t('audioDrawer.signal.noActiveSource'),
      noTrack: t('audioDrawer.status.noTrack'),
      pending: t('audioDrawer.signal.pending'),
      processed: t('audioDrawer.signal.processed'),
      ratePending: t('audioDrawer.status.ratePending'),
      resampling: t('audioDrawer.badge.resampling'),
      shared: t('audioDrawer.mode.shared'),
      sharedMixer: t('audioDrawer.signal.sharedMixer'),
      speedUp: t('audioDrawer.badge.speedUp'),
      standardPath: t('audioDrawer.signal.standardPath'),
      systemAudio: t('audioDrawer.device.systemAudio'),
      systemDefaultOutput: t('audioDrawer.device.systemDefaultOutput'),
    }),
    [t],
  );
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputMode, setOutputMode] = useState<AudioOutputMode>(status?.outputMode ?? 'shared');
  const [rememberOutput, setRememberOutput] = useState(() => readRememberedAudioOutput().enabled);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isMotionOpen, setIsMotionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hiddenDeviceKeys, setHiddenDeviceKeys] = useState<string[]>(() => readHiddenDeviceKeys());
  const [hiddenDeviceMenu, setHiddenDeviceMenu] = useState<HiddenDeviceMenu>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);

  const hiddenDeviceKeySet = useMemo(() => new Set(hiddenDeviceKeys), [hiddenDeviceKeys]);
  const visibleDevices = useMemo(
    () => devices.filter((device) => !hiddenDeviceKeySet.has(getDeviceStorageKey(device))),
    [devices, hiddenDeviceKeySet],
  );
  const hiddenDevices = useMemo(
    () => devices.filter((device) => hiddenDeviceKeySet.has(getDeviceStorageKey(device))),
    [devices, hiddenDeviceKeySet],
  );
  const allSharedDevices = useMemo(() => devices.filter((device) => device.outputMode === 'shared'), [devices]);
  const defaultSharedDevice = useMemo(() => allSharedDevices.find((device) => device.isDefault) ?? null, [allSharedDevices]);
  const sharedDevices = useMemo(() => visibleDevices.filter((device) => device.outputMode === 'shared'), [visibleDevices]);
  const asioDevices = useMemo(() => visibleDevices.filter((device) => device.outputMode === 'asio'), [visibleDevices]);
  const wasapiExclusive = outputMode === 'exclusive';
  const statusDevice = useMemo(() => {
    if (!status) {
      return null;
    }

    return devices.find((device) => {
      const modeMatches = status.outputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared';
      return modeMatches && (status.outputDeviceId === device.id || status.outputDeviceName === device.name);
    }) ?? null;
  }, [devices, status]);
  const effectiveSharedSampleRate = status?.outputMode === 'shared' ? statusDevice?.sharedDeviceSampleRate ?? statusDevice?.sampleRate ?? null : null;

  const engineBadges = useMemo(() => {
    const badges: Array<{ label: string; tone: 'ready' | 'warning' | 'neutral' | 'gold' }> = [];
    const hasEq = status?.dspActive || status?.eqEnabled || status?.warnings.some((warning) => /eq|equalizer/i.test(warning));

    if (hasEq) {
      badges.push({ label: copy.dspActive, tone: 'neutral' });
    }

    if (isHiResAudio(status)) {
      badges.push({ label: 'Hi-Res', tone: 'gold' });
    } else if (isLosslessCodec(status)) {
      badges.push({ label: 'Lossless', tone: 'gold' });
    }

    if ((status?.playbackRate ?? 1) > 1.0001) {
      badges.push({ label: copy.speedUp, tone: 'warning' });
    }

    if (status?.bitPerfectCandidate) {
      badges.push({ label: copy.bitPerfectReady, tone: 'ready' });
    }

    if (status?.resampling || status?.sampleRateMismatch) {
      badges.push({ label: copy.resampling, tone: 'warning' });
    }

    if (hasInferredRateMismatch(status, effectiveSharedSampleRate) && !badges.some((badge) => badge.label === copy.resampling)) {
      badges.push({ label: copy.resampling, tone: 'warning' });
    }

    return badges;
  }, [copy, effectiveSharedSampleRate, status]);

  const engineSignalDetails = useMemo(
    () => [
      { label: t('audioDrawer.meter.source'), value: formatSourceQuality(status, copy) },
      { label: 'EQ', value: getEqSignalText(status, copy) },
      { label: t('audioDrawer.meter.resample'), value: getResampleSignalText(status, effectiveSharedSampleRate, copy) },
      { label: t('audioDrawer.meter.direct'), value: getDirectSignalText(status, effectiveSharedSampleRate, copy) },
      { label: t('settings.playback.stability.field.sharedStabilityTier'), value: getSharedStabilityText(status, t('settings.playback.stability.value.unknown')) },
    ],
    [copy, effectiveSharedSampleRate, status, t],
  );
  const engineRatePath = useMemo(() => formatRatePath(status, effectiveSharedSampleRate, copy), [copy, effectiveSharedSampleRate, status]);
  const currentOutputName = useMemo(
    () => getCurrentOutputName(status, statusDevice?.name ?? defaultSharedDevice?.name, copy),
    [copy, defaultSharedDevice?.name, status, statusDevice?.name],
  );

  const currentOutput = useMemo(() => {
    const currentMode = status?.outputMode ?? outputMode;
    const name = currentOutputName;

    return {
      name,
      mode: currentMode,
      backend: getCurrentBackend(status, copy),
      sampleRate: formatRate(getOutputSampleRate(status, effectiveSharedSampleRate)),
      bitPerfect: status?.bitPerfectCandidate ? copy.bitPerfectReady : status?.bitPerfectDisabledReason ?? copy.standardPath,
      Icon: getDeviceIcon(name, currentMode),
    };
  }, [copy, currentOutputName, effectiveSharedSampleRate, outputMode, status]);

  const refresh = useCallback(async (): Promise<void> => {
    const audio = window.echo?.audio;

    if (!audio) {
      setError(copy.desktopBridgeUnavailable);
      setDevices([]);
      return;
    }

    try {
      const [nextDevices, nextStatus] = await Promise.all([audio.listDevices(), audio.getStatus()]);
      setDevices(nextDevices);
      setOutputMode(nextStatus.outputMode);
      onStatusChange(nextStatus);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, [copy.desktopBridgeUnavailable, onStatusChange]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsMotionOpen(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setIsMotionOpen(false);

    if (!shouldRender) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShouldRender(false), drawerExitAnimationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setRememberOutput(readRememberedAudioOutput().enabled);
    setHiddenDeviceKeys(readHiddenDeviceKeys());
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (status?.outputMode) {
      setOutputMode(status.outputMode);
    }
  }, [status?.outputMode]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !hiddenDeviceMenu) {
      return undefined;
    }

    const closeMenu = (): void => setHiddenDeviceMenu(null);

    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [hiddenDeviceMenu, isOpen]);

  const persistOutput = useCallback(
    (settings: AudioOutputSettings, enabled = rememberOutput): void => {
      writeRememberedAudioOutput({
        enabled,
        outputMode: settings.outputMode ?? 'shared',
        deviceIndex: settings.deviceIndex,
        deviceName: settings.deviceName,
      });
    },
    [rememberOutput],
  );

  const applyOutput = useCallback(
    async (settings: AudioOutputSettings): Promise<void> => {
      const audio = window.echo?.audio;

      if (!audio) {
        setError(copy.desktopBridgeUnavailable);
        return;
      }

      setIsBusy(true);
      setError(null);
      try {
        if (rememberOutput) {
          persistOutput(settings);
        }
        const nextStatus = await audio.setOutput(settings);
        setOutputMode(nextStatus.outputMode);
        onStatusChange(nextStatus);
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : String(applyError));
      } finally {
        setIsBusy(false);
      }
    },
    [copy.desktopBridgeUnavailable, onStatusChange, persistOutput, rememberOutput],
  );

  const applyDevice = (mode: AudioOutputMode, device: AudioDeviceInfo | null): void => {
    const settings = createOutputSettings(mode, device);
    setOutputMode(mode);
    void applyOutput(settings);
  };

  const toggleExclusive = (enabled: boolean): void => {
    const nextMode: AudioOutputMode = enabled ? 'exclusive' : 'shared';
    const currentDevice = allSharedDevices.find((device) => deviceMatchesStatus(device, status, outputMode)) ?? null;
    applyDevice(nextMode, currentDevice);
  };

  const toggleRememberOutput = (enabled: boolean): void => {
    setRememberOutput(enabled);
    writeRememberedAudioOutput({
      enabled,
      outputMode: status?.outputMode ?? outputMode,
      deviceName: status?.outputDeviceName ?? undefined,
    });
  };

  const hideDevice = (device: AudioDeviceInfo): void => {
    setHiddenDeviceKeys((currentKeys) => {
      const nextKeys = Array.from(new Set([...currentKeys, getDeviceStorageKey(device)]));
      writeHiddenDeviceKeys(nextKeys);
      return nextKeys;
    });
    setHiddenDeviceMenu(null);
  };

  const restoreDevice = (device: AudioDeviceInfo): void => {
    setHiddenDeviceKeys((currentKeys) => {
      const nextKeys = currentKeys.filter((key) => key !== getDeviceStorageKey(device));
      writeHiddenDeviceKeys(nextKeys);
      return nextKeys;
    });
  };

  const openDeviceMenu = (event: MouseEvent<HTMLButtonElement>, device: AudioDeviceInfo): void => {
    event.preventDefault();
    event.stopPropagation();
    setHiddenDeviceMenu({
      device,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 72)),
    });
  };

  const suppressNativeDeviceMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.button !== 2) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const copyDiagnostics = useCallback(async (): Promise<void> => {
    const audio = window.echo?.audio;

    if (!audio) {
      setError(copy.desktopBridgeUnavailable);
      return;
    }

    try {
      const diagnostics = await audio.getDiagnostics();
      await window.navigator.clipboard.writeText(formatAudioDiagnostics(diagnostics));
      setDiagnosticsCopied(true);
      window.setTimeout(() => setDiagnosticsCopied(false), 1800);
      setError(null);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }, [copy.desktopBridgeUnavailable]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="audio-drawer-root no-drag" role="presentation" data-open={isMotionOpen}>
      <button className="audio-drawer-scrim" type="button" aria-label={copy.close} onClick={onClose} />
      <aside className="audio-drawer" aria-label={t('audioDrawer.title')}>
        <header className="audio-drawer-header">
          <div>
            <SlidersHorizontal size={18} />
            <h2>{t('audioDrawer.title')}</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label={copy.close} title={copy.close} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <button className="audio-engine-meter" type="button" onClick={() => void refresh()} disabled={isBusy}>
          <div className="audio-engine-meter__top">
            <span className="audio-engine-meter__icon">
              <Zap size={17} />
            </span>
            <div>
              <span>HiFi Engine</span>
              <strong>{formatCodecLine(status, copy)}</strong>
            </div>
            <RefreshCw size={15} />
          </div>
          <div className="audio-engine-meter__grid">
            <span>
              <em>{t('audioDrawer.meter.output')}</em>
              <strong title={currentOutputName}>{currentOutputName}</strong>
            </span>
            <span>
              <em>{t('audioDrawer.meter.mode')}</em>
              <strong>{formatMode(status?.outputMode ?? outputMode, copy)}</strong>
            </span>
            <span>
              <em>{t('audioDrawer.meter.rate')}</em>
              <strong>{engineRatePath}</strong>
            </span>
          </div>
          <div className="audio-engine-meter__details">
            {engineSignalDetails.map((detail) => (
              <span key={detail.label}>
                <em>{detail.label}</em>
                <strong title={detail.value}>{detail.value}</strong>
              </span>
            ))}
          </div>
          {engineBadges.length ? (
            <div className="audio-engine-meter__badges">
              {engineBadges.map((badge) => (
                <em data-tone={badge.tone} key={badge.label}>
                  {badge.label}
                </em>
              ))}
            </div>
          ) : null}
        </button>

        <section className="audio-drawer-section audio-current-output-section">
          <div className="audio-drawer-section-title">
            <Headphones size={17} />
            <h3>{t('audioDrawer.section.currentOutput')}</h3>
          </div>
          <div className="audio-current-output-card">
            <span className="audio-current-output-card__icon">
              <currentOutput.Icon size={22} />
            </span>
            <div className="audio-current-output-card__body">
              <strong title={currentOutput.name}>{currentOutput.name}</strong>
              <span>
                {formatMode(currentOutput.mode, copy)} / {currentOutput.sampleRate || copy.ratePending}
              </span>
              <span>
                {currentOutput.backend} / {currentOutput.bitPerfect}
              </span>
            </div>
            <em>{t('audioDrawer.device.selected')}</em>
          </div>
        </section>

        <section className="audio-drawer-section">
          <div className="audio-drawer-section-title">
            <Waves size={17} />
            <h3>{t('audioDrawer.section.systemDevices')}</h3>
          </div>
          <button
            className={`audio-device-pill ${!status?.outputDeviceName && outputMode !== 'asio' ? 'active' : ''}`}
            type="button"
            title={copy.systemDefaultOutput}
            disabled={isBusy}
            onClick={() => applyDevice(wasapiExclusive ? 'exclusive' : 'shared', null)}
          >
            <Waves size={15} />
            <span>
              <strong>{t('audioDrawer.device.systemDefault')}</strong>
              <small>{wasapiExclusive ? t('audioDrawer.mode.exclusiveCandidate') : copy.shared} / {t('audioDrawer.device.systemSelectedRoute')}</small>
            </span>
            <em>{wasapiExclusive ? copy.exclusive : copy.shared}</em>
            {outputMode !== 'asio' && !status?.outputDeviceName ? <Check size={15} /> : null}
          </button>
          {sharedDevices.length === 0 ? <p className="audio-drawer-empty">{t('audioDrawer.empty.systemDevices')}</p> : null}
          {sharedDevices.map((device) => {
            const isActive = deviceMatchesStatus(device, status, outputMode);
            const DeviceIcon = getDeviceIcon(device.name, wasapiExclusive ? 'exclusive' : 'shared');
            const sampleRate = formatRate(device.sharedDeviceSampleRate ?? device.sampleRate);

            return (
              <button
                className={`audio-device-pill ${isActive ? 'active' : ''}`}
                key={device.id}
                type="button"
                title={device.name}
                disabled={isBusy}
                onMouseDown={suppressNativeDeviceMenu}
                onContextMenu={(event) => openDeviceMenu(event, device)}
                onClick={() => applyDevice(wasapiExclusive ? 'exclusive' : 'shared', device)}
              >
                <DeviceIcon size={15} />
                <span>
                  <strong>{device.name}</strong>
                  <small>{wasapiExclusive ? t('audioDrawer.mode.exclusiveCandidate') : copy.shared} / {sampleRate || t('audioDrawer.status.sampleRatePending')}</small>
                </span>
                <em>{sampleRate || (wasapiExclusive ? copy.exclusive : copy.shared)}</em>
                {isActive ? <Check size={15} /> : null}
              </button>
            );
          })}
        </section>

        <section className="audio-drawer-section">
          <div className="audio-drawer-section-title">
            <Zap size={17} />
            <h3>{t('audioDrawer.section.asioDevices')}</h3>
          </div>
          <p className="audio-section-note">{t('audioDrawer.note.asio')}</p>
          {asioDevices.length === 0 ? <p className="audio-drawer-empty">{t('audioDrawer.empty.asioDevices')}</p> : null}
          {asioDevices.map((device) => {
            const isActive = deviceMatchesStatus(device, status, 'asio');
            const DeviceIcon = getDeviceIcon(device.name, 'asio');

            return (
              <button
                className={`audio-device-pill audio-device-pill--asio ${isActive ? 'active' : ''}`}
                key={device.id}
                type="button"
                title={device.name}
                disabled={isBusy}
                onMouseDown={suppressNativeDeviceMenu}
                onContextMenu={(event) => openDeviceMenu(event, device)}
                onClick={() => applyDevice('asio', device)}
              >
                <DeviceIcon size={15} />
                <span>
                  <strong>{device.name}</strong>
                  <small>{copy.asioDriver} / {t('audioDrawer.device.lowLatency')}</small>
                </span>
                <em>ASIO</em>
                {isActive ? <Check size={15} /> : null}
              </button>
            );
          })}
        </section>

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Gauge size={17} />
            <h3>{t('audioDrawer.section.advancedOutput')}</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Lock size={17} />
              <strong>{t('audioDrawer.option.wasapiExclusive')}</strong>
            </span>
            <input
              type="checkbox"
              checked={wasapiExclusive}
              onChange={(event) => toggleExclusive(event.currentTarget.checked)}
            />
          </label>
          <p>{t('audioDrawer.option.wasapiExclusiveDescription')}</p>

          <label className="audio-toggle-row">
            <span>
              <RefreshCw size={17} />
              <strong>{t('audioDrawer.option.rememberOutput')}</strong>
            </span>
            <input
              type="checkbox"
              checked={rememberOutput}
              onChange={(event) => toggleRememberOutput(event.currentTarget.checked)}
            />
          </label>
          <p>{t('audioDrawer.option.rememberOutputDescription')}</p>

          <button className="audio-diagnostics-copy-button" type="button" onClick={() => void copyDiagnostics()}>
            <Clipboard size={16} />
            <span>{diagnosticsCopied ? copy.copiedDiagnostics : copy.copyDiagnostics}</span>
          </button>

          <div className="audio-advanced-todo">
            <strong>{t('audioDrawer.todo.outputControls')}</strong>
            <span>{t('audioDrawer.todo.outputControlsDescription')}</span>
          </div>
        </section>

        {error ? <p className="audio-drawer-error">{error}</p> : null}

        <details className="audio-drawer-section audio-hidden-devices">
          <summary>
            <EyeOff size={17} />
            <span>{t('audioDrawer.section.hiddenDevices')}</span>
            <em>{hiddenDevices.length}</em>
          </summary>
          {hiddenDevices.length === 0 ? <p className="audio-drawer-empty">{t('audioDrawer.empty.hiddenDevices')}</p> : null}
          {hiddenDevices.map((device) => {
            const DeviceIcon = getDeviceIcon(device.name, device.outputMode);
            const sampleRate = formatRate(device.sharedDeviceSampleRate ?? device.sampleRate);

            return (
              <div className={`audio-hidden-device ${device.outputMode === 'asio' ? 'audio-hidden-device--asio' : ''}`} key={getDeviceStorageKey(device)}>
                <DeviceIcon size={15} />
                <span>
                  <strong title={device.name}>{device.name}</strong>
                  <small>{device.outputMode === 'asio' ? copy.asioDriver : t('audioDrawer.device.systemOutput')} / {sampleRate || t('audioDrawer.status.sampleRatePending')}</small>
                </span>
                <button type="button" onClick={() => restoreDevice(device)}>
                  {t('audioDrawer.action.restore')}
                </button>
              </div>
            );
          })}
        </details>

      </aside>
      {hiddenDeviceMenu ? (
        <div
          className="audio-device-context-menu"
          role="menu"
          style={{ left: hiddenDeviceMenu.x, top: hiddenDeviceMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => hideDevice(hiddenDeviceMenu.device)}>
            <EyeOff size={14} />
            <span>{t('audioDrawer.action.hideDevice')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};
