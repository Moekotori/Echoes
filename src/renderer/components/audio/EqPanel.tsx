import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Headphones, Redo2, RotateCcw, Save, ShieldCheck, Shuffle, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react';
import type { AudioStatus, ChannelBalanceMonoMode, ChannelBalanceState } from '../../../shared/types/audio';
import {
  channelBalanceMaxGainDb,
  channelBalanceMinGainDb,
} from '../../../shared/types/audio';
import type { EqBand, EqPreset, EqState } from '../../../shared/types/eq';
import { eqFrequenciesHz, eqMaxFrequencyHz, eqMaxPreampDb, eqMinFrequencyHz, eqMinPreampDb } from '../../../shared/types/eq';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import { getEqBridge } from '../../utils/echoBridge';
import { EqCurveView } from './EqCurveView';
import { EqPresetSelector } from './EqPresetSelector';
import {
  captureEqSnapshot,
  clampChannelBalancePatch,
  computeEffectiveChannelGains,
  computeEstimatedPeakGain,
  computeLoudnessMatchedPreamp,
  computeMaxBandGainDb,
  computeRecommendedPreamp,
  createEqHistorySnapshot,
  describePreset,
  formatDb,
  formatFrequencyLabel,
  resolveBandFrequency,
  type EqSnapshot,
} from './eqPanelUtils';

type EqPanelProps = {
  audioStatus: AudioStatus | null;
  onAudioStatusRefresh?: () => void;
};

const fallbackState: EqState = {
  enabled: false,
  preampDb: 0,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: eqFrequenciesHz.map((frequencyHz) => ({
    frequencyHz,
    gainDb: 0,
    q: 1,
  })),
};

const fallbackChannelBalanceState: ChannelBalanceState = {
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
  clippingRisk: false,
};

const monoModeOptions: ChannelBalanceMonoMode[] = ['off', 'sum', 'left', 'right'];
const monoModeLabelKeys: Record<ChannelBalanceMonoMode, TranslationKey> = {
  off: 'settings.eq.channel.mono.off',
  sum: 'settings.eq.channel.mono.sum',
  left: 'settings.eq.channel.mono.left',
  right: 'settings.eq.channel.mono.right',
};

const maxHistoryLength = 24;

const formatLevelDb = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }

  return formatDb(value);
};

const estimateSlotOutputPeak = (slot: EqSnapshot, inputPeakDb: number | null | undefined): number | null => {
  if (inputPeakDb === null || inputPeakDb === undefined || !Number.isFinite(inputPeakDb)) {
    return null;
  }

  return Math.round((inputPeakDb + computeEstimatedPeakGain(slot)) * 10) / 10;
};

export const EqPanel = ({ audioStatus, onAudioStatusRefresh }: EqPanelProps): JSX.Element => {
  const { t } = useI18n();
  const [state, setState] = useState<EqState>(fallbackState);
  const [channelBalance, setChannelBalance] = useState<ChannelBalanceState>(fallbackChannelBalanceState);
  const [presets, setPresets] = useState<EqPreset[]>([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedBandIndex, setSelectedBandIndex] = useState(0);
  const [bypassSnapshot, setBypassSnapshot] = useState<boolean | null>(null);
  const [frequencyUnlocked, setFrequencyUnlocked] = useState(false);
  const [abSlots, setAbSlots] = useState<{ a: EqSnapshot | null; b: EqSnapshot | null }>({ a: null, b: null });
  const [undoStack, setUndoStack] = useState<EqSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EqSnapshot[]>([]);
  const [loudnessMatchedAb, setLoudnessMatchedAb] = useState(false);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const debounceTimers = useRef<Record<number, number>>({});
  const frequencyDebounceTimers = useRef<Record<number, number>>({});
  const editStartSnapshot = useRef<EqSnapshot | null>(null);

  const selectedPreset = presets.find((preset) => preset.id === state.presetId);
  const selectedPresetReadonly = selectedPreset?.readonly ?? true;
  const canOverwritePreset = Boolean(selectedPreset && !selectedPreset.readonly);
  const frequencyEditUnlocked = showAdvancedTools && frequencyUnlocked;
  const audioLevels = audioStatus?.audioLevels ?? null;
  const estimatedOutputPeakDb = audioLevels?.estimatedOutputPeakDb ?? null;
  const realtimeLevelClippingRisk = estimatedOutputPeakDb !== null && estimatedOutputPeakDb >= 0;
  const realtimeLevelClipped = (audioLevels?.clipCount ?? 0) > 0;
  const clippingRisk = Boolean(state.clippingRisk || channelBalance.clippingRisk || audioStatus?.clippingRisk || realtimeLevelClippingRisk || realtimeLevelClipped);
  const eqOrBalanceEnabled = state.enabled || channelBalance.enabled;
  const dspActive = Boolean(audioStatus?.dspActive || eqOrBalanceEnabled);
  const recommendedPreampDb = computeRecommendedPreamp(state);
  const maxBandGainDb = computeMaxBandGainDb(state.bands);
  const estimatedPeakGainDb = computeEstimatedPeakGain(state);
  const canAutoPreamp = Math.abs(state.preampDb - recommendedPreampDb) > 0.05;
  const selectedBand = state.bands[selectedBandIndex] ?? state.bands[0];
  const selectedPresetMetadata = describePreset(state.presetId);
  const needsSafePreamp = estimatedPeakGainDb > 0 || clippingRisk;

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const eq = getEqBridge();

      if (!eq) {
        setPresets([]);
        setError(t('settings.eq.error.bridgeControlEq'));
        return;
      }

      const [nextState, nextPresets, nextChannelBalance] = await Promise.all([eq.getState(), eq.listPresets(), eq.getChannelBalanceState()]);
      setState(nextState);
      setPresets(nextPresets);
      setChannelBalance(nextChannelBalance);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showAdvancedTools && frequencyUnlocked) {
      setFrequencyUnlocked(false);
    }
  }, [frequencyUnlocked, showAdvancedTools]);

  const commitState = useCallback(
    (nextState: EqState): void => {
      setState(nextState);
      onAudioStatusRefresh?.();
    },
    [onAudioStatusRefresh],
  );

  const commitChannelBalance = useCallback(
    (nextState: ChannelBalanceState): void => {
      setChannelBalance(nextState);
      onAudioStatusRefresh?.();
    },
    [onAudioStatusRefresh],
  );

  const pushUndoSnapshot = useCallback((snapshot: EqSnapshot): void => {
    setUndoStack((current) => [...current, snapshot].slice(-maxHistoryLength));
    setRedoStack([]);
  }, []);

  const clearGainDebounce = (band: number): void => {
    window.clearTimeout(debounceTimers.current[band]);
    delete debounceTimers.current[band];
  };

  const clearFrequencyDebounce = (band: number): void => {
    window.clearTimeout(frequencyDebounceTimers.current[band]);
    delete frequencyDebounceTimers.current[band];
  };

  const clearAllGainDebounces = (): void => {
    Object.keys(debounceTimers.current).forEach((band) => clearGainDebounce(Number(band)));
  };

  const clearAllFrequencyDebounces = (): void => {
    Object.keys(frequencyDebounceTimers.current).forEach((band) => clearFrequencyDebounce(Number(band)));
  };

  const beginEqEdit = (): void => {
    if (!editStartSnapshot.current) {
      editStartSnapshot.current = createEqHistorySnapshot(state);
    }
  };

  const commitEqEdit = (): void => {
    if (editStartSnapshot.current) {
      pushUndoSnapshot(editStartSnapshot.current);
      editStartSnapshot.current = null;
    }
  };

  const setEnabled = (enabled: boolean): void => {
    const eq = getEqBridge();
    setState((current) => ({ ...current, enabled }));

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    void eq.setEnabled(enabled).then(commitState).catch((toggleError: unknown) => {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    });
  };

  const sendBandGain = useCallback(
    (band: number, gainDb: number): void => {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeControlEq'));
        return;
      }

      void eq.setBandGain({ band, gainDb }).then(commitState).catch((bandError: unknown) => {
        setError(bandError instanceof Error ? bandError.message : String(bandError));
      });
    },
    [commitState, t],
  );

  const handleBandChange = (band: number, gainDb: number): void => {
    beginEqEdit();
    setSelectedBandIndex(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, gainDb } : item)),
    }));

    clearGainDebounce(band);
    debounceTimers.current[band] = window.setTimeout(() => sendBandGain(band, gainDb), 45);
  };

  const handleBandCommit = (band: number, gainDb: number): void => {
    commitEqEdit();
    setSelectedBandIndex(band);
    clearGainDebounce(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, gainDb } : item)),
    }));
    sendBandGain(band, gainDb);
  };

  const sendBandFrequency = useCallback(
    (band: number, frequencyHz: number): void => {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeControlEq'));
        return;
      }

      void eq.setBandFrequency({ band, frequencyHz }).then(commitState).catch((bandError: unknown) => {
        setError(bandError instanceof Error ? bandError.message : String(bandError));
      });
    },
    [commitState, t],
  );

  const handleBandFrequencyChange = (band: number, frequencyHz: number): void => {
    beginEqEdit();
    const safeFrequencyHz = resolveBandFrequency(frequencyHz, frequencyEditUnlocked);
    setSelectedBandIndex(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, frequencyHz: safeFrequencyHz } : item)),
    }));

    clearFrequencyDebounce(band);
    frequencyDebounceTimers.current[band] = window.setTimeout(() => sendBandFrequency(band, safeFrequencyHz), 45);
  };

  const handleBandFrequencyCommit = (band: number, frequencyHz: number): void => {
    commitEqEdit();
    const safeFrequencyHz = resolveBandFrequency(frequencyHz, frequencyEditUnlocked);
    setSelectedBandIndex(band);
    clearFrequencyDebounce(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, frequencyHz: safeFrequencyHz } : item)),
    }));
    sendBandFrequency(band, safeFrequencyHz);
  };

  const handlePreampChange = (preampDb: number): void => {
    const eq = getEqBridge();
    pushUndoSnapshot(createEqHistorySnapshot(state));
    setState((current) => ({ ...current, preampDb, presetId: 'custom', presetName: 'Custom' }));

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    void eq.setPreamp(preampDb).then(commitState).catch((preampError: unknown) => {
      setError(preampError instanceof Error ? preampError.message : String(preampError));
    });
  };

  const applyEqSnapshot = async (
    snapshot: EqSnapshot,
    options: { recordHistory?: boolean; loudnessMatch?: boolean } = {},
  ): Promise<void> => {
    const eq = getEqBridge();

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    const nextBands = snapshot.bands.map((band): EqBand => ({ ...band }));
    const nextPreampDb = options.loudnessMatch ? computeLoudnessMatchedPreamp(state, snapshot) : snapshot.preampDb;
    const nextState: EqState = {
      ...state,
      preampDb: nextPreampDb,
      presetId: options.loudnessMatch ? 'custom' : snapshot.presetId,
      presetName: options.loudnessMatch ? 'Custom' : snapshot.presetName,
      clippingRisk: snapshot.clippingRisk,
      bands: nextBands,
    };

    if (options.recordHistory !== false) {
      pushUndoSnapshot(createEqHistorySnapshot(state));
    }
    setState(nextState);

    try {
      await eq.setPreamp(nextPreampDb);
      for (const [band, nextBand] of nextBands.entries()) {
        await eq.setBandFrequency({ band, frequencyHz: nextBand.frequencyHz });
        await eq.setBandGain({ band, gainDb: nextBand.gainDb });
      }
      commitState(nextState);
      setError(null);
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
    }
  };

  const storeAbSlot = (slot: 'a' | 'b'): void => {
    setAbSlots((current) => ({ ...current, [slot]: captureEqSnapshot(state) }));
  };

  const restoreAbSlot = (slot: 'a' | 'b'): void => {
    const snapshot = abSlots[slot];

    if (!snapshot) {
      return;
    }

    void applyEqSnapshot(snapshot, { loudnessMatch: loudnessMatchedAb });
  };

  const undoEq = (): void => {
    const snapshot = undoStack.at(-1);

    if (!snapshot) {
      return;
    }

    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, createEqHistorySnapshot(state)].slice(-maxHistoryLength));
    void applyEqSnapshot(snapshot, { recordHistory: false });
  };

  const redoEq = (): void => {
    const snapshot = redoStack.at(-1);

    if (!snapshot) {
      return;
    }

    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, createEqHistorySnapshot(state)].slice(-maxHistoryLength));
    void applyEqSnapshot(snapshot, { recordHistory: false });
  };

  const resetSelectedBand = (): void => {
    pushUndoSnapshot(createEqHistorySnapshot(state));
    clearGainDebounce(selectedBandIndex);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === selectedBandIndex ? { ...item, gainDb: 0 } : item)),
    }));
    sendBandGain(selectedBandIndex, 0);
  };

  const resetAllGains = (): void => {
    const eq = getEqBridge();
    const nextBands = state.bands.map((band) => ({ ...band, gainDb: 0 }));
    const nextState = { ...state, presetId: 'custom', presetName: 'Custom', bands: nextBands };
    pushUndoSnapshot(createEqHistorySnapshot(state));
    clearAllGainDebounces();
    setState(nextState);

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    void Promise.all(nextBands.map((_band, band) => eq.setBandGain({ band, gainDb: 0 })))
      .then(() => commitState(nextState))
      .catch((resetError: unknown) => setError(resetError instanceof Error ? resetError.message : String(resetError)));
  };

  const resetStandardFrequencies = (): void => {
    const eq = getEqBridge();
    const nextBands = state.bands.map((band, index) => ({ ...band, frequencyHz: eqFrequenciesHz[index] ?? band.frequencyHz }));
    const nextState = { ...state, presetId: 'custom', presetName: 'Custom', bands: nextBands };
    pushUndoSnapshot(createEqHistorySnapshot(state));
    clearAllFrequencyDebounces();
    setState(nextState);

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    void Promise.all(nextBands.map((band, index) => eq.setBandFrequency({ band: index, frequencyHz: band.frequencyHz })))
      .then(() => commitState(nextState))
      .catch((resetError: unknown) => setError(resetError instanceof Error ? resetError.message : String(resetError)));
  };

  const adjustSelectedGain = (deltaDb: number): void => {
    const nextGainDb = Math.round(Math.max(-12, Math.min(12, (selectedBand?.gainDb ?? 0) + deltaDb)) * 10) / 10;
    pushUndoSnapshot(createEqHistorySnapshot(state));
    handleBandCommit(selectedBandIndex, nextGainDb);
  };

  const adjustSelectedFrequency = (direction: -1 | 1, fine: boolean): void => {
    if (!selectedBand || !frequencyEditUnlocked) {
      return;
    }

    const ratio = fine ? 2 ** (1 / 24) : 2 ** (1 / 12);
    const nextFrequencyHz = Math.round(direction > 0 ? selectedBand.frequencyHz * ratio : selectedBand.frequencyHz / ratio);
    pushUndoSnapshot(createEqHistorySnapshot(state));
    handleBandFrequencyCommit(selectedBandIndex, nextFrequencyHz);
  };

  const setPreset = (presetId: string): void => {
    const eq = getEqBridge();

    if (!eq) {
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    pushUndoSnapshot(createEqHistorySnapshot(state));
    const preset = presets.find((item) => item.id === presetId);
    if (preset) {
      setState((current) => ({
        ...current,
        preampDb: preset.preampDb,
        bands: preset.bands.map((band) => ({ ...band })),
        presetId: preset.id,
        presetName: preset.name,
        clippingRisk: false,
      }));
    }
    void eq.setPreset(presetId).then(commitState).catch((presetError: unknown) => {
      setError(presetError instanceof Error ? presetError.message : String(presetError));
    });
  };

  const reset = (): void => {
    const eq = getEqBridge();

    if (!eq) {
      setState(fallbackState);
      setError(t('settings.eq.error.bridgeControlEq'));
      return;
    }

    pushUndoSnapshot(createEqHistorySnapshot(state));
    clearAllGainDebounces();
    clearAllFrequencyDebounces();
    setState({
      ...fallbackState,
      enabled: state.enabled,
      bands: fallbackState.bands.map((band) => ({ ...band })),
    });
    void eq.reset().then(commitState).catch((resetError: unknown) => {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    });
  };

  const savePreset = async (): Promise<void> => {
    if (!saveName.trim()) {
      setError(t('settings.eq.error.presetName'));
      return;
    }

    try {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeSavePreset'));
        return;
      }

      const savedPreset = await eq.savePreset({
        name: saveName,
        preampDb: state.preampDb,
        bands: state.bands,
      });
      setSaveName('');
      setPresets(await eq.listPresets());
      commitState({
        ...state,
        presetId: savedPreset.id,
        presetName: savedPreset.name,
        preampDb: savedPreset.preampDb,
        bands: savedPreset.bands.map((band) => ({ ...band })),
      });
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const overwritePreset = async (): Promise<void> => {
    if (!canOverwritePreset || !selectedPreset) {
      return;
    }

    try {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeSavePreset'));
        return;
      }

      await eq.savePreset({
        id: selectedPreset.id,
        name: selectedPreset.name,
        preampDb: state.preampDb,
        bands: state.bands,
      });
      setPresets(await eq.listPresets());
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const duplicateCurrentPreset = async (): Promise<void> => {
    try {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeSavePreset'));
        return;
      }

      const duplicated = await eq.savePreset({
        name: t('settings.eq.preset.copyName', { name: state.presetName }),
        preampDb: state.preampDb,
        bands: state.bands,
      });
      setPresets(await eq.listPresets());
      setSaveName('');
      commitState({
        ...state,
        presetId: duplicated.id,
        presetName: duplicated.name,
        preampDb: duplicated.preampDb,
        bands: duplicated.bands.map((band) => ({ ...band })),
      });
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const revertCurrentUserPreset = (): void => {
    if (!canOverwritePreset) {
      return;
    }

    setPreset(state.presetId);
  };

  const deletePreset = async (): Promise<void> => {
    if (selectedPresetReadonly) {
      return;
    }

    try {
      const eq = getEqBridge();

      if (!eq) {
        setError(t('settings.eq.error.bridgeDeletePreset'));
        return;
      }

      setPresets(await eq.deletePreset(state.presetId));
      reset();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const patchChannelBalance = (patch: Partial<ChannelBalanceState>): void => {
    const safePatch = clampChannelBalancePatch(patch);
    const eq = getEqBridge();
    setChannelBalance((current) => ({ ...current, ...safePatch }));

    if (!eq) {
      setError(t('settings.eq.error.bridgeChannelBalance'));
      return;
    }

    void eq.setChannelBalanceState(safePatch).then(commitChannelBalance).catch((balanceError: unknown) => {
      setError(balanceError instanceof Error ? balanceError.message : String(balanceError));
    });
  };

  const resetChannelBalance = (): void => {
    const eq = getEqBridge();

    if (!eq) {
      setChannelBalance(fallbackChannelBalanceState);
      setError(t('settings.eq.error.bridgeChannelBalance'));
      return;
    }

    void eq.resetChannelBalance().then(commitChannelBalance).catch((balanceError: unknown) => {
      setError(balanceError instanceof Error ? balanceError.message : String(balanceError));
    });
  };

  const resetMonitorTools = (): void => {
    patchChannelBalance({
      monoMode: 'off',
      swapLeftRight: false,
      invertLeft: false,
      invertRight: false,
      constantPower: true,
    });
  };

  const resetTrimsOnly = (): void => {
    patchChannelBalance({
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
    });
  };

  const applyMonitorTool = (tool: 'mono' | 'left' | 'right' | 'swap' | 'phase'): void => {
    if (tool === 'mono') {
      patchChannelBalance({ monoMode: 'sum' });
      return;
    }

    if (tool === 'left' || tool === 'right') {
      patchChannelBalance({ monoMode: tool });
      return;
    }

    if (tool === 'swap') {
      patchChannelBalance({ swapLeftRight: !channelBalance.swapLeftRight });
      return;
    }

    patchChannelBalance({ invertRight: !channelBalance.invertRight });
  };

  const holdBypass = (): void => {
    if (bypassSnapshot !== null) {
      return;
    }

    setBypassSnapshot(state.enabled);
    setEnabled(false);
  };

  const releaseBypass = (): void => {
    if (bypassSnapshot === null) {
      return;
    }

    setEnabled(bypassSnapshot);
    setBypassSnapshot(null);
  };

  const { leftDb: leftTotalDb, rightDb: rightTotalDb } = computeEffectiveChannelGains(channelBalance);
  const channelBalanceRisk = leftTotalDb > 0 || rightTotalDb > 0 || Boolean(channelBalance.clippingRisk);
  const dspSource = state.enabled && channelBalance.enabled
    ? t('settings.eq.bitPerfect.sourceBoth')
    : state.enabled
      ? t('settings.eq.bitPerfect.sourceEq')
      : channelBalance.enabled
        ? t('settings.eq.bitPerfect.sourceChannel')
        : audioStatus?.bitPerfectDisabledReason?.replaceAll('_', ' ') ?? '';
  const bitPerfectText = dspActive
    ? t('settings.eq.bitPerfect.disabled', { reason: dspSource ? ` (${dspSource})` : '' })
    : t('settings.eq.bitPerfect.readyPath');
  const balanceReadout = channelBalance.balance === 0
    ? t('settings.eq.channel.center')
    : `${channelBalance.balance < 0 ? 'L' : 'R'} ${Math.round(Math.abs(channelBalance.balance) * 100)}%`;

  return (
    <section className="eq-panel" aria-label="ECHO Next EQ panel" data-enabled={state.enabled}>
      <header className="eq-header">
        <div className="eq-title-block">
          <span className="eq-title-icon">
            <SlidersHorizontal size={18} />
          </span>
          <div>
            <h2>{t('settings.eq.title')}</h2>
            <p>{t('settings.eq.subtitle')}</p>
          </div>
        </div>

        <div className="eq-header-actions">
          <label className="eq-enable-pill">
            <input type="checkbox" checked={state.enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
            <span>{state.enabled ? t('settings.eq.state.eqEnabled') : t('settings.eq.state.eqDisabled')}</span>
          </label>
          <EqPresetSelector presets={presets} value={state.presetId} onChange={setPreset} />
          <button className="eq-soft-button" type="button" data-active={showAdvancedTools} onClick={() => setShowAdvancedTools((current) => !current)}>
            {showAdvancedTools ? t('settings.eq.action.hideAdvanced') : t('settings.eq.action.showAdvanced')}
          </button>
          {showAdvancedTools ? (
            <>
              <button className="eq-icon-action" type="button" aria-label={t('settings.eq.action.undo')} title={t('settings.eq.action.undo')} disabled={undoStack.length === 0} onClick={undoEq}>
                <Undo2 size={15} />
              </button>
              <button className="eq-icon-action" type="button" aria-label={t('settings.eq.action.redo')} title={t('settings.eq.action.redo')} disabled={redoStack.length === 0} onClick={redoEq}>
                <Redo2 size={15} />
              </button>
            </>
          ) : null}
          <button className="eq-icon-action" type="button" aria-label={t('settings.eq.action.resetEq')} title={t('settings.eq.action.resetEq')} onClick={reset}>
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <div className="eq-status-cards">
        <div className="eq-status-card">
          <span>{t('settings.eq.status.eq')}</span>
          <strong>{state.enabled ? t('common.enabled') : t('common.disabled')}</strong>
        </div>
        <div className="eq-status-card">
          <span>{t('settings.eq.status.preset')}</span>
          <strong>{state.presetId === 'custom' ? t('settings.eq.preset.modified') : state.presetName}</strong>
        </div>
        <div className="eq-status-card">
          <span>{t('settings.eq.status.estimatedPeak')}</span>
          <strong>{formatDb(estimatedPeakGainDb)}</strong>
        </div>
        <div className="eq-status-card" data-risk={clippingRisk}>
          <span>{clippingRisk ? t('settings.eq.status.clippingRisk') : t('settings.eq.status.headroom')}</span>
          <strong>{clippingRisk ? t('settings.eq.status.warning') : t('settings.eq.status.safe')}</strong>
        </div>
        <div className="eq-status-card" data-active={dspActive}>
          <span>{t('settings.eq.status.bitPerfect')}</span>
          <strong>{dspActive ? t('common.disabled') : t('common.ready')}</strong>
        </div>
      </div>

      {selectedPresetMetadata && showAdvancedTools ? (
        <aside className="eq-preset-metadata" data-category={selectedPresetMetadata.category}>
          <span>{t(selectedPresetMetadata.targetTypeKey as TranslationKey)}</span>
          {selectedPresetMetadata.approximation ? <strong>{t('settings.eq.preset.approximation')}</strong> : null}
          <p>{t(selectedPresetMetadata.purposeKey as TranslationKey)}</p>
          <p>{t(selectedPresetMetadata.scenarioKey as TranslationKey)}</p>
          <em>{t(selectedPresetMetadata.cautionKey as TranslationKey)}</em>
        </aside>
      ) : null}

      <div className="eq-workbench">
        <div className="eq-curve-column">
          <div className="eq-preamp-bar">
            <div>
              <span>{t('settings.eq.preamp.inputSafety')}</span>
              <strong>{formatDb(state.preampDb)}</strong>
            </div>
            <div className="eq-preamp-metrics" aria-label={t('settings.eq.preamp.metricsAria')}>
              <span>{t('settings.eq.preamp.recommended')}</span>
              <strong>{formatDb(recommendedPreampDb)}</strong>
              <span>{t('settings.eq.preamp.maxBoost')}</span>
              <strong>{formatDb(maxBandGainDb)}</strong>
              <span>{t('settings.eq.status.estimatedPeak')}</span>
              <strong>{formatDb(estimatedPeakGainDb)}</strong>
            </div>
            <div className="eq-level-meter" data-risk={clippingRisk}>
              <span>
                <em>{t('settings.eq.level.inputPeak')}</em>
                <strong>{formatLevelDb(audioLevels?.inputPeakDb)}</strong>
              </span>
              <span>
                <em>{t('settings.eq.level.inputRms')}</em>
                <strong>{formatLevelDb(audioLevels?.inputRmsDb)}</strong>
              </span>
              <span>
                <em>{t('settings.eq.level.estimatedOutputPeak')}</em>
                <strong>{formatLevelDb(audioLevels?.estimatedOutputPeakDb)}</strong>
              </span>
              <span>
                <em>{t('settings.eq.level.headroom')}</em>
                <strong>{formatLevelDb(audioLevels?.headroomDb)}</strong>
              </span>
              <p>
                {t('settings.eq.level.sourceEstimate')}
                {(audioLevels?.clipCount ?? 0) > 0 ? ` / ${t('settings.eq.level.clips', { count: String(audioLevels?.clipCount ?? 0) })}` : ''}
              </p>
            </div>
            <input
              aria-label={t('settings.eq.preamp.aria')}
              type="range"
              min={eqMinPreampDb}
              max={eqMaxPreampDb}
              step="0.1"
              value={state.preampDb}
              onChange={(event) => handlePreampChange(Number(event.currentTarget.value))}
            />
            <button className="eq-soft-button" data-risk={needsSafePreamp} type="button" disabled={!canAutoPreamp && !needsSafePreamp} onClick={() => handlePreampChange(recommendedPreampDb)}>
              {needsSafePreamp ? t('settings.eq.action.applySafePreamp') : t('settings.eq.action.autoPreamp', { value: formatDb(recommendedPreampDb) })}
            </button>
          </div>
          <EqCurveView
            bands={state.bands}
            enabled={state.enabled}
            frequencyUnlocked={frequencyEditUnlocked}
            selectedBandIndex={selectedBandIndex}
            onBandSelect={setSelectedBandIndex}
            onBandChange={handleBandChange}
            onBandCommit={handleBandCommit}
            onBandFrequencyChange={handleBandFrequencyChange}
            onBandFrequencyCommit={handleBandFrequencyCommit}
          />
          {showAdvancedTools ? (
          <div className="eq-inspector">
            <div className="eq-inspector-title">
              <span>{t('settings.eq.band.inspector')}</span>
              <strong>{selectedBand ? formatFrequencyLabel(selectedBand.frequencyHz) : t('settings.eq.band.fallback')}</strong>
            </div>
            <label>
              <span>{t('settings.eq.band.frequency')}</span>
              <input
                aria-label={t('settings.eq.band.frequency')}
                type="number"
                min={eqMinFrequencyHz}
                max={eqMaxFrequencyHz}
                step={frequencyEditUnlocked ? 1 : undefined}
                value={Math.round(selectedBand?.frequencyHz ?? eqFrequenciesHz[selectedBandIndex] ?? 1000)}
                onChange={(event) => handleBandFrequencyChange(selectedBandIndex, Number(event.currentTarget.value))}
                onBlur={(event) => handleBandFrequencyCommit(selectedBandIndex, Number(event.currentTarget.value))}
              />
              <em>{frequencyEditUnlocked ? t('settings.eq.band.frequencyUnlocked') : t('settings.eq.band.frequencySnapped')}</em>
            </label>
            <label>
              <span>{t('settings.eq.band.gain')}</span>
              <input
                aria-label={t('settings.eq.band.gain')}
                type="number"
                min="-12"
                max="12"
                step="0.1"
                value={selectedBand?.gainDb ?? 0}
                onChange={(event) => handleBandChange(selectedBandIndex, Number(event.currentTarget.value))}
                onBlur={(event) => handleBandCommit(selectedBandIndex, Number(event.currentTarget.value))}
              />
            </label>
            <div className="eq-stepper-group" aria-label={t('settings.eq.band.gainStepper')}>
              <button className="eq-soft-button" type="button" onClick={() => adjustSelectedGain(-0.5)}>-0.5</button>
              <button className="eq-soft-button" type="button" onClick={() => adjustSelectedGain(-0.1)}>-0.1</button>
              <button className="eq-soft-button" type="button" onClick={() => adjustSelectedGain(0.1)}>+0.1</button>
              <button className="eq-soft-button" type="button" onClick={() => adjustSelectedGain(0.5)}>+0.5</button>
            </div>
            <div className="eq-stepper-group" aria-label={t('settings.eq.band.frequencyStepper')}>
              <button className="eq-soft-button" type="button" disabled={!frequencyEditUnlocked} onClick={() => adjustSelectedFrequency(-1, false)}>
                {t('settings.eq.action.freqDown')}
              </button>
              <button className="eq-soft-button" type="button" disabled={!frequencyEditUnlocked} onClick={() => adjustSelectedFrequency(-1, true)}>
                {t('settings.eq.action.freqFineDown')}
              </button>
              <button className="eq-soft-button" type="button" disabled={!frequencyEditUnlocked} onClick={() => adjustSelectedFrequency(1, true)}>
                {t('settings.eq.action.freqFineUp')}
              </button>
              <button className="eq-soft-button" type="button" disabled={!frequencyEditUnlocked} onClick={() => adjustSelectedFrequency(1, false)}>
                {t('settings.eq.action.freqUp')}
              </button>
            </div>
            <label className="eq-inspector-toggle">
              <input type="checkbox" checked={frequencyUnlocked} onChange={(event) => setFrequencyUnlocked(event.currentTarget.checked)} />
              <span>{t('settings.eq.action.unlockFrequency')}</span>
            </label>
            <button className="eq-soft-button" type="button" onClick={resetSelectedBand}>
              {t('settings.eq.action.resetBand', { frequency: selectedBand ? formatFrequencyLabel(selectedBand.frequencyHz) : t('settings.eq.band.fallback') })}
            </button>
          </div>
          ) : null}
          <div className="eq-band-strip" aria-label={t('settings.eq.band.readoutsAria')}>
            {state.bands.map((band, index) => (
              <button
                className="eq-band-chip"
                data-selected={selectedBandIndex === index}
                type="button"
                key={`${band.frequencyHz}-${index}`}
                onClick={() => setSelectedBandIndex(index)}
                onDoubleClick={() => handleBandCommit(index, 0)}
              >
                <span>{formatFrequencyLabel(band.frequencyHz)}</span>
                <strong>{formatDb(band.gainDb)}</strong>
              </button>
            ))}
            <button className="eq-soft-button" type="button" onClick={resetSelectedBand}>
              {t('settings.eq.action.resetSelected')}
            </button>
            <button className="eq-soft-button" type="button" onClick={resetAllGains}>
              {t('settings.eq.action.resetAllGains')}
            </button>
            {showAdvancedTools ? (
              <button className="eq-soft-button" type="button" onClick={resetStandardFrequencies}>
                {t('settings.eq.action.resetFrequencies')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {showAdvancedTools ? (
      <div className="eq-compare-row">
        <span className="eq-compare-label">{t('settings.eq.ab.title')}</span>
        <label className="eq-compare-toggle">
          <input type="checkbox" checked={loudnessMatchedAb} onChange={(event) => setLoudnessMatchedAb(event.currentTarget.checked)} />
          <span>{t('settings.eq.ab.loudnessMatched')}</span>
        </label>
        <button className="eq-soft-button" type="button" onClick={() => storeAbSlot('a')}>
          {t('settings.eq.action.storeA')}
        </button>
        <span className="eq-ab-summary">{abSlots.a ? t('settings.eq.ab.summary', {
          output: formatLevelDb(estimateSlotOutputPeak(abSlots.a, audioLevels?.inputPeakDb)),
          peak: formatDb(computeEstimatedPeakGain(abSlots.a)),
          preamp: formatDb(abSlots.a.preampDb),
          preset: abSlots.a.presetName,
        }) : t('settings.eq.ab.emptySlot')}</span>
        <button className="eq-soft-button" type="button" disabled={!abSlots.a} onClick={() => restoreAbSlot('a')}>
          {t('settings.eq.action.applyA')}
        </button>
        <button className="eq-soft-button" type="button" onClick={() => storeAbSlot('b')}>
          {t('settings.eq.action.storeB')}
        </button>
        <span className="eq-ab-summary">{abSlots.b ? t('settings.eq.ab.summary', {
          output: formatLevelDb(estimateSlotOutputPeak(abSlots.b, audioLevels?.inputPeakDb)),
          peak: formatDb(computeEstimatedPeakGain(abSlots.b)),
          preamp: formatDb(abSlots.b.preampDb),
          preset: abSlots.b.presetName,
        }) : t('settings.eq.ab.emptySlot')}</span>
        <button className="eq-soft-button" type="button" disabled={!abSlots.b} onClick={() => restoreAbSlot('b')}>
          {t('settings.eq.action.applyB')}
        </button>
        <button
          className="eq-soft-button"
          type="button"
          onPointerDown={holdBypass}
          onPointerUp={releaseBypass}
          onPointerCancel={releaseBypass}
          onBlur={releaseBypass}
        >
          {t('settings.eq.action.holdBypass')}
        </button>
        <button className="eq-soft-button" type="button" onClick={() => setEnabled(!state.enabled)}>
          {state.enabled ? t('settings.eq.action.toggleBypassOn') : t('settings.eq.action.toggleBypassOff')}
        </button>
        <span>{bitPerfectText}</span>
        {clippingRisk ? <strong>{t('settings.eq.warning.lowerPreamp')}</strong> : <strong><ShieldCheck size={14} /> {t('settings.eq.status.safeHeadroomShort')}</strong>}
      </div>
      ) : null}

      <section className="channel-balance-panel" aria-label="Channel balance panel" data-enabled={channelBalance.enabled}>
        <header className="channel-balance-header">
          <div className="eq-title-block">
            <span className="eq-title-icon">
              <Headphones size={18} />
            </span>
            <div>
              <h3>{t('settings.eq.channel.title')}</h3>
              <p>{t('settings.eq.channel.description')}</p>
            </div>
          </div>
          <div className="channel-balance-actions">
            <label className="eq-enable-pill">
              <input
                type="checkbox"
                checked={calibrationMode}
                onChange={(event) => setCalibrationMode(event.currentTarget.checked)}
              />
              <span>{t('settings.eq.channel.calibrationMode')}</span>
            </label>
            <label className="eq-enable-pill">
              <input
                type="checkbox"
                checked={channelBalance.enabled}
                onChange={(event) => patchChannelBalance({ enabled: event.currentTarget.checked })}
              />
              <span>{channelBalance.enabled ? t('common.enabled') : t('settings.eq.action.bypass')}</span>
            </label>
            <button className="eq-icon-action" type="button" aria-label={t('settings.eq.action.resetChannelBalance')} title={t('settings.eq.action.resetChannelBalance')} onClick={resetChannelBalance}>
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="channel-balance-grid">
          <section className="channel-tool-group channel-balance-wide">
            <header>
              <span>{t('settings.eq.channel.group.balance')}</span>
              <strong>{balanceReadout}</strong>
            </header>
            <div className="channel-balance-meter" aria-hidden="true">
              <span style={{ left: `${50 + channelBalance.balance * 50}%` }} />
            </div>
            <label>
              <em>L</em>
              <input
                aria-label={t('settings.eq.channel.balance')}
                type="range"
                min="-100"
                max="100"
                step="1"
                value={Math.round(channelBalance.balance * 100)}
                onChange={(event) => patchChannelBalance({ balance: Number(event.currentTarget.value) / 100 })}
              />
              <em>R</em>
            </label>
          </section>

          <section className="channel-tool-group">
            <header>
              <span>{t('settings.eq.channel.group.gainTrim')}</span>
              <strong>{formatDb(Math.max(leftTotalDb, rightTotalDb))}</strong>
            </header>
            {calibrationMode ? (
              <div className="channel-calibration-readout">
                <span>
                  <em>{t('settings.eq.channel.effectiveLeft')}</em>
                  <strong>{Number.isFinite(leftTotalDb) ? formatDb(leftTotalDb) : '-inf dB'}</strong>
                </span>
                <span>
                  <em>{t('settings.eq.channel.effectiveRight')}</em>
                  <strong>{Number.isFinite(rightTotalDb) ? formatDb(rightTotalDb) : '-inf dB'}</strong>
                </span>
                <span>
                  <em>{t('settings.eq.level.headroom')}</em>
                  <strong>{formatLevelDb(audioLevels?.headroomDb)}</strong>
                </span>
              </div>
            ) : null}
            <label>
              <span>{t('settings.eq.channel.leftGain')}</span>
              <input
                aria-label={t('settings.eq.channel.leftGain')}
                type="range"
                min={channelBalanceMinGainDb}
                max={channelBalanceMaxGainDb}
                step="0.1"
                value={channelBalance.leftGainDb}
                onChange={(event) => patchChannelBalance({ leftGainDb: Number(event.currentTarget.value) })}
              />
              <strong>{formatDb(channelBalance.leftGainDb)}</strong>
            </label>
            <label>
              <span>{t('settings.eq.channel.rightGain')}</span>
              <input
                aria-label={t('settings.eq.channel.rightGain')}
                type="range"
                min={channelBalanceMinGainDb}
                max={channelBalanceMaxGainDb}
                step="0.1"
                value={channelBalance.rightGainDb}
                onChange={(event) => patchChannelBalance({ rightGainDb: Number(event.currentTarget.value) })}
              />
              <strong>{formatDb(channelBalance.rightGainDb)}</strong>
            </label>
            <button className="eq-soft-button" type="button" onClick={resetTrimsOnly}>
              {t('settings.eq.action.resetTrimsOnly')}
            </button>
          </section>

          <section className="channel-tool-group">
            <header>
              <span>{t('settings.eq.channel.group.monitorTools')}</span>
              <button className="eq-soft-button" type="button" onClick={resetMonitorTools}>
                {t('settings.eq.action.resetMonitorTools')}
              </button>
            </header>
            <div className="channel-balance-segmented" role="group" aria-label={t('settings.eq.channel.monoMode')}>
              {monoModeOptions.map((option) => (
                <button
                  className="eq-soft-button"
                  data-active={channelBalance.monoMode === option}
                  type="button"
                  key={option}
                  onClick={() => patchChannelBalance({ monoMode: option })}
                >
                  {t(monoModeLabelKeys[option])}
                </button>
              ))}
            </div>
            <div className="channel-balance-switches" role="group" aria-label={t('settings.eq.channel.quickTools')}>
              <button className="eq-soft-button" type="button" onClick={() => applyMonitorTool('mono')}>
                {t('settings.eq.channel.quick.monoCheck')}
              </button>
              <button className="eq-soft-button" type="button" onClick={() => applyMonitorTool('left')}>
                {t('settings.eq.channel.quick.leftSolo')}
              </button>
              <button className="eq-soft-button" type="button" onClick={() => applyMonitorTool('right')}>
                {t('settings.eq.channel.quick.rightSolo')}
              </button>
              <button className="eq-soft-button" type="button" onClick={() => applyMonitorTool('swap')}>
                {t('settings.eq.channel.quick.swapCheck')}
              </button>
              <button className="eq-soft-button" type="button" onClick={() => applyMonitorTool('phase')}>
                {t('settings.eq.channel.quick.phaseCheck')}
              </button>
            </div>
            <button className="eq-soft-button" data-active={channelBalance.swapLeftRight} type="button" onClick={() => patchChannelBalance({ swapLeftRight: !channelBalance.swapLeftRight })}>
              <Shuffle size={14} />
              {t('settings.eq.channel.swap')}
            </button>
          </section>

          <section className="channel-tool-group">
            <header>
              <span>{t('settings.eq.channel.group.phaseTools')}</span>
            </header>
            <div className="channel-balance-switches">
              <button className="eq-soft-button" data-active={channelBalance.invertLeft} type="button" onClick={() => patchChannelBalance({ invertLeft: !channelBalance.invertLeft })}>
                {t('settings.eq.channel.invertLeft')}
              </button>
              <button className="eq-soft-button" data-active={channelBalance.invertRight} type="button" onClick={() => patchChannelBalance({ invertRight: !channelBalance.invertRight })}>
                {t('settings.eq.channel.invertRight')}
              </button>
              <button className="eq-soft-button" data-active={channelBalance.constantPower} type="button" onClick={() => patchChannelBalance({ constantPower: !channelBalance.constantPower })}>
                {t('settings.eq.channel.constantPower')}
              </button>
            </div>
          </section>
        </div>

        <div className="channel-balance-readout" data-risk={channelBalanceRisk || clippingRisk}>
          <span>
            <em>{t('settings.eq.channel.leftTotal')}</em>
            <strong>{Number.isFinite(leftTotalDb) ? formatDb(leftTotalDb) : '-inf dB'}</strong>
          </span>
          <span>
            <em>{t('settings.eq.channel.rightTotal')}</em>
            <strong>{Number.isFinite(rightTotalDb) ? formatDb(rightTotalDb) : '-inf dB'}</strong>
          </span>
          <span>
            <em>{t('settings.eq.channel.dsp')}</em>
            <strong>{channelBalance.enabled ? t('settings.eq.channel.active') : t('settings.eq.channel.bypassed')}</strong>
          </span>
          <span>
            <em>{t('settings.eq.level.headroom')}</em>
            <strong>{formatLevelDb(audioLevels?.headroomDb)}</strong>
          </span>
          {channelBalanceRisk || clippingRisk ? <p>{t('settings.eq.warning.channelClipping')}</p> : null}
          {channelBalance.enabled ? <p>{t('settings.eq.bitPerfect.channelDisabled')}</p> : null}
        </div>
      </section>

      <footer className="eq-preset-tools">
        <input aria-label={t('settings.eq.preset.nameAria')} value={saveName} onChange={(event) => setSaveName(event.currentTarget.value)} placeholder={t('settings.eq.preset.savePlaceholder')} />
        <button type="button" onClick={() => void savePreset()}>
          <Save size={15} />
          {t('settings.eq.action.saveAs')}
        </button>
        <button type="button" onClick={() => void duplicateCurrentPreset()}>
          <Copy size={15} />
          {t('settings.eq.action.duplicatePreset')}
        </button>
        <button type="button" disabled={!canOverwritePreset} onClick={() => void overwritePreset()}>
          <Save size={15} />
          {t('settings.eq.action.overwrite')}
        </button>
        <button type="button" disabled={!canOverwritePreset} onClick={revertCurrentUserPreset}>
          <RotateCcw size={15} />
          {t('settings.eq.action.revertUserPreset')}
        </button>
        <button type="button" disabled={selectedPresetReadonly} onClick={() => void deletePreset()}>
          <Trash2 size={15} />
          {t('settings.eq.action.delete')}
        </button>
        {selectedPresetReadonly ? <span>{t('settings.eq.preset.readonly')}</span> : null}
      </footer>

      {error ? <p className="eq-panel-error">{error}</p> : null}
    </section>
  );
};
