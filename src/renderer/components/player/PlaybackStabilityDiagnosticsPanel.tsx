import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, RefreshCw } from 'lucide-react';
import type { AudioDiagnostics, AudioStatus } from '../../../shared/types/audio';
import { useI18n } from '../../i18n/I18nProvider';
import { getAudioBridge } from '../../utils/echoBridge';

type AudioDiagnosticsFallback = Partial<AudioDiagnostics> & Partial<AudioStatus>;

const formatValue = (value: unknown, unknownValue = 'N/A'): string => {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : unknownValue;
  }

  if (value === null || value === undefined || value === '') {
    return unknownValue;
  }

  return String(value);
};

const createFallbackDiagnostics = (status: AudioStatus | null): AudioDiagnosticsFallback => ({
  state: status?.state ?? 'idle',
  host: status?.host ?? 'not-initialized',
  outputMode: status?.outputMode ?? 'shared',
  outputBackend: status?.outputBackend ?? null,
  outputDeviceName: status?.outputDeviceName ?? null,
  currentFilePath: status?.currentFilePath ?? null,
  currentTrackId: status?.currentTrackId ?? null,
  durationSeconds: status?.durationSeconds ?? 0,
  positionSeconds: status?.positionSeconds ?? 0,
  playbackRate: status?.playbackRate ?? 1,
  fileSampleRate: status?.fileSampleRate ?? null,
  decoderOutputSampleRate: status?.decoderOutputSampleRate ?? null,
  requestedOutputSampleRate: status?.requestedOutputSampleRate ?? null,
  actualDeviceSampleRate: status?.actualDeviceSampleRate ?? null,
  resampling: status?.resampling ?? false,
  bitPerfectCandidate: status?.bitPerfectCandidate ?? false,
  sampleRateMismatch: status?.sampleRateMismatch ?? false,
  warnings: status?.warnings ?? [],
  error: status?.error ?? null,
  sharedStabilityTier: status?.sharedStabilityTier ?? null,
  nativeDeviceBufferFrames: status?.nativeDeviceBufferFrames ?? null,
  nativeFifoCapacityFrames: status?.nativeFifoCapacityFrames ?? null,
  nativeStartupPrebufferFrames: status?.nativeStartupPrebufferFrames ?? null,
  nativeBufferedFrames: status?.nativeBufferedFrames ?? null,
  nativeBufferedMs: status?.nativeBufferedMs ?? null,
  nativeUnderrunCallbacks: status?.nativeUnderrunCallbacks ?? 0,
  nativeUnderrunFrames: status?.nativeUnderrunFrames ?? 0,
  lastSharedStabilityRecoveryAt: status?.lastSharedStabilityRecoveryAt ?? null,
  watchdogStatus: status?.state === 'playing' ? 'monitoring' : 'idle',
  recentWatchdogRecoveryCount: 0,
  lastWatchdogRecoveryTime: null,
});

export const formatPlaybackDiagnosticsText = (diagnostics: AudioDiagnosticsFallback): string => {
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

  return ['ECHO Next Playback Stability Diagnostics', ...rows.map(([label, value]) => `${label}: ${formatValue(value)}`)].join('\n');
};

export const PlaybackStabilityDiagnosticsPanel = (): JSX.Element => {
  const { t } = useI18n();
  const desktopBridgeUnavailable = t('settings.playback.stability.error.desktopBridgeUnavailable');
  const [diagnostics, setDiagnostics] = useState<AudioDiagnosticsFallback>(() => createFallbackDiagnostics(null));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshDiagnostics = useCallback(async (): Promise<void> => {
    try {
      const audio = getAudioBridge();

      if (!audio) {
        setDiagnostics(createFallbackDiagnostics(null));
        setError(desktopBridgeUnavailable);
        return;
      }

      if ('getDiagnostics' in audio && typeof audio.getDiagnostics === 'function') {
        setDiagnostics(await audio.getDiagnostics());
      } else {
        setDiagnostics(createFallbackDiagnostics(await audio.getStatus()));
      }
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, [desktopBridgeUnavailable]);

  useEffect(() => {
    void refreshDiagnostics();
    const interval = window.setInterval(() => {
      void refreshDiagnostics();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [refreshDiagnostics]);

  const rows = useMemo(
    () => [
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
      [t('settings.playback.stability.field.sharedStabilityTier'), diagnostics.sharedStabilityTier],
      [t('settings.playback.stability.field.nativeDeviceBufferFrames'), diagnostics.nativeDeviceBufferFrames],
      [t('settings.playback.stability.field.nativeFifoCapacityFrames'), diagnostics.nativeFifoCapacityFrames],
      [t('settings.playback.stability.field.nativeStartupPrebufferFrames'), diagnostics.nativeStartupPrebufferFrames],
      [t('settings.playback.stability.field.nativeBufferedFrames'), diagnostics.nativeBufferedFrames],
      [t('settings.playback.stability.field.nativeBufferedMs'), diagnostics.nativeBufferedMs],
      [t('settings.playback.stability.field.nativeUnderrunCallbacks'), diagnostics.nativeUnderrunCallbacks],
      [t('settings.playback.stability.field.nativeUnderrunFrames'), diagnostics.nativeUnderrunFrames],
      [t('settings.playback.stability.field.lastSharedStabilityRecoveryAt'), diagnostics.lastSharedStabilityRecoveryAt],
      ['warnings', diagnostics.warnings],
      ['error', diagnostics.error],
      [t('settings.playback.stability.field.watchdogStatus'), diagnostics.watchdogStatus],
      [t('settings.playback.stability.field.recentWatchdogRecoveryCount'), diagnostics.recentWatchdogRecoveryCount],
      [t('settings.playback.stability.field.lastWatchdogRecoveryTime'), diagnostics.lastWatchdogRecoveryTime],
    ],
    [diagnostics, t],
  );

  const copyDiagnostics = useCallback(async (): Promise<void> => {
    try {
      await window.navigator.clipboard.writeText(formatPlaybackDiagnosticsText(diagnostics));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      setError(null);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }, [diagnostics]);

  return (
    <section className="audio-dev-panel playback-stability-panel" aria-label={t('settings.playback.stability.title')}>
      <div className="audio-dev-header">
        <div>
          <span className="panel-kicker">Audio</span>
          <h2>{t('settings.playback.stability.title')}</h2>
        </div>
        <div className="playback-stability-actions">
          <button className="settings-action-button" type="button" onClick={() => void copyDiagnostics()}>
            <Clipboard size={15} />
            {copied ? t('settings.playback.stability.action.copied') : t('settings.playback.stability.action.copy')}
          </button>
          <button
            className="tool-button"
            type="button"
            aria-label={t('settings.playback.stability.action.refresh')}
            title={t('settings.playback.stability.action.refresh')}
            onClick={() => void refreshDiagnostics()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      <div className="settings-status-grid playback-stability-grid">
        {rows.map(([label, value]) => (
          <span key={String(label)}>
            <em>{label}</em>
            <strong title={formatValue(value, t('settings.playback.stability.value.unknown'))}>
              {formatValue(value, t('settings.playback.stability.value.unknown'))}
            </strong>
          </span>
        ))}
      </div>

      {error ? <p className="settings-inline-error">{error}</p> : null}
    </section>
  );
};
