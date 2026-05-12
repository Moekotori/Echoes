import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { AudioStatus } from '../../../shared/types/audio';
import type { EqPreset, EqState } from '../../../shared/types/eq';
import { EqBandSlider } from './EqBandSlider';
import { EqCurveView } from './EqCurveView';
import { EqPresetSelector } from './EqPresetSelector';

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
  bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequencyHz) => ({
    frequencyHz,
    gainDb: 0,
    q: 1,
  })),
};

export const EqPanel = ({ audioStatus, onAudioStatusRefresh }: EqPanelProps): JSX.Element => {
  const [state, setState] = useState<EqState>(fallbackState);
  const [presets, setPresets] = useState<EqPreset[]>([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const debounceTimers = useRef<Record<number, number>>({});

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextState, nextPresets] = await Promise.all([window.echo.eq.getState(), window.echo.eq.listPresets()]);
      setState(nextState);
      setPresets(nextPresets);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitState = useCallback(
    (nextState: EqState): void => {
      setState(nextState);
      onAudioStatusRefresh?.();
    },
    [onAudioStatusRefresh],
  );

  const setEnabled = (enabled: boolean): void => {
    setState((current) => ({ ...current, enabled }));
    void window.echo.eq.setEnabled(enabled).then(commitState).catch((toggleError: unknown) => {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    });
  };

  const sendBandGain = useCallback(
    (band: number, gainDb: number): void => {
      void window.echo.eq.setBandGain({ band, gainDb }).then(commitState).catch((bandError: unknown) => {
        setError(bandError instanceof Error ? bandError.message : String(bandError));
      });
    },
    [commitState],
  );

  const handleBandChange = (band: number, gainDb: number): void => {
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, gainDb } : item)),
    }));

    window.clearTimeout(debounceTimers.current[band]);
    debounceTimers.current[band] = window.setTimeout(() => sendBandGain(band, gainDb), 45);
  };

  const handleBandCommit = (band: number, gainDb: number): void => {
    window.clearTimeout(debounceTimers.current[band]);
    sendBandGain(band, gainDb);
  };

  const handlePreampChange = (preampDb: number): void => {
    setState((current) => ({ ...current, preampDb, presetId: 'custom', presetName: 'Custom' }));
    void window.echo.eq.setPreamp(preampDb).then(commitState).catch((preampError: unknown) => {
      setError(preampError instanceof Error ? preampError.message : String(preampError));
    });
  };

  const setPreset = (presetId: string): void => {
    void window.echo.eq.setPreset(presetId).then(commitState).catch((presetError: unknown) => {
      setError(presetError instanceof Error ? presetError.message : String(presetError));
    });
  };

  const reset = (): void => {
    void window.echo.eq.reset().then(commitState).catch((resetError: unknown) => {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    });
  };

  const savePreset = async (): Promise<void> => {
    if (!saveName.trim()) {
      setError('Preset name required');
      return;
    }

    try {
      await window.echo.eq.savePreset({
        name: saveName,
        preampDb: state.preampDb,
        bands: state.bands,
      });
      setSaveName('');
      setPresets(await window.echo.eq.listPresets());
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const deletePreset = async (): Promise<void> => {
    try {
      setPresets(await window.echo.eq.deletePreset(state.presetId));
      await reset();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const bitPerfectText =
    state.enabled || audioStatus?.dspActive
      ? 'EQ ON: DSP is active. Output is not bit-perfect, including Exclusive / ASIO.'
      : 'EQ bypassed: bit-perfect can recover when no other DSP or resampling is active.';

  return (
    <section className="eq-panel" aria-label="ECHO Next EQ panel" data-enabled={state.enabled}>
      <header className="eq-panel-header">
        <div>
          <SlidersHorizontal size={18} />
          <span>Studio EQ</span>
          <strong>{state.enabled ? 'EQ is ON' : 'Bypass'}</strong>
        </div>
        <div className="eq-header-actions">
          <label className="eq-enable-toggle">
            <span>{state.enabled ? 'Enabled' : 'Bypass'}</span>
            <input type="checkbox" checked={state.enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
          </label>
          <EqPresetSelector presets={presets} value={state.presetId} onChange={setPreset} />
          <button className="eq-icon-button" type="button" title="Reset to Flat" aria-label="Reset EQ" onClick={reset}>
            <RotateCcw size={16} />
          </button>
          <button className="eq-ab-button" type="button" disabled title="A/B compare">
            A/B
          </button>
        </div>
      </header>

      <EqCurveView
        bands={state.bands}
        preampDb={state.preampDb}
        enabled={state.enabled}
        onBandChange={handleBandChange}
        onBandCommit={handleBandCommit}
      />

      <div className="eq-workbench">
        <label className="eq-preamp-slider">
          <span>Preamp</span>
          <input
            aria-label="EQ preamp"
            type="range"
            min="-12"
            max="6"
            step="0.1"
            value={state.preampDb}
            onChange={(event) => handlePreampChange(Number(event.currentTarget.value))}
          />
          <strong>{state.preampDb > 0 ? `+${state.preampDb.toFixed(1)}` : state.preampDb.toFixed(1)} dB</strong>
        </label>
        <div className="eq-band-bank">
          {state.bands.map((band, index) => (
            <EqBandSlider
              band={band}
              index={index}
              key={band.frequencyHz}
              onChange={handleBandChange}
              onCommit={handleBandCommit}
            />
          ))}
        </div>
      </div>

      <div className="eq-warning-strip" data-risk={state.clippingRisk || audioStatus?.clippingRisk}>
        <strong>{state.clippingRisk || audioStatus?.clippingRisk ? 'Headroom warning' : 'Signal path'}</strong>
        <span>{state.clippingRisk || audioStatus?.clippingRisk ? 'Reduce preamp or boosted bands to avoid clipping.' : bitPerfectText}</span>
      </div>

      <footer className="eq-preset-tools">
        <input
          aria-label="Preset name"
          value={saveName}
          onChange={(event) => setSaveName(event.currentTarget.value)}
          placeholder="Preset name"
        />
        <button type="button" onClick={() => void savePreset()}>
          <Save size={15} />
          Save
        </button>
        <button type="button" disabled={presets.find((preset) => preset.id === state.presetId)?.readonly ?? true} onClick={() => void deletePreset()}>
          <Trash2 size={15} />
          Delete
        </button>
        <button type="button" disabled>Import</button>
        <button type="button" disabled>Export</button>
      </footer>
      {error ? <p className="eq-panel-error">{error}</p> : null}
    </section>
  );
};
