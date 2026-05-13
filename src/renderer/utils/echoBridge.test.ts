// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('renderer EQ bridge fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    delete (window as unknown as { echo?: unknown }).echo;
  });

  it('persists EQ presets and channel balance without the Electron preload bridge', async () => {
    const { getEqBridge } = await import('./echoBridge');
    const eq = getEqBridge();

    expect(eq).toBeTruthy();

    await eq?.setBandGain({ band: 2, gainDb: 4.5 });
    const savedPreset = await eq?.savePreset({
      name: 'Browser Bright',
      preampDb: -4,
      bands: (await eq.getState()).bands,
    });
    await eq?.setPreset(savedPreset?.id ?? '');
    await eq?.setChannelBalanceState({ enabled: true, balance: 0.25, monoMode: 'sum' });

    vi.resetModules();
    const { getEqBridge: getReloadedEqBridge } = await import('./echoBridge');
    const reloaded = getReloadedEqBridge();
    const presets = await reloaded?.listPresets();
    const state = await reloaded?.getState();
    const channelBalance = await reloaded?.getChannelBalanceState();

    expect(presets?.some((preset) => preset.id === 'browser-bright')).toBe(true);
    expect(state).toMatchObject({ presetId: 'browser-bright', presetName: 'Browser Bright', preampDb: -4 });
    expect(channelBalance).toMatchObject({ enabled: true, balance: 0.25, monoMode: 'sum' });
  });
});
