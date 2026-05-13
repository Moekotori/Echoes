import type { ChannelBalanceMonoMode, ChannelBalanceState } from '../../shared/types/audio';
import {
  channelBalanceMaxBalance,
  channelBalanceMaxGainDb,
  channelBalanceMinBalance,
  channelBalanceMinGainDb,
} from '../../shared/types/audio';
import type { EqBand, EqPreset, EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../../shared/types/eq';
import {
  eqBandCount,
  eqFrequenciesHz,
  eqMaxFrequencyHz,
  eqMaxGainDb,
  eqMaxPreampDb,
  eqMinFrequencyHz,
  eqMinGainDb,
  eqMinPreampDb,
} from '../../shared/types/eq';

export const getEchoBridge = (): Window['echo'] | null => window.echo ?? null;

export const getAppBridge = (): Window['echo']['app'] | null => getEchoBridge()?.app ?? null;

export const getAudioBridge = (): Window['echo']['audio'] | null => getEchoBridge()?.audio ?? null;

export const getAccountsBridge = (): Window['echo']['accounts'] | null => getEchoBridge()?.accounts ?? null;

export const getDiagnosticsBridge = (): Window['echo']['diagnostics'] | null => getEchoBridge()?.diagnostics ?? null;

export const getDiscordPresenceBridge = (): Window['echo']['discordPresence'] | null => getEchoBridge()?.discordPresence ?? null;

const browserEqStorageKey = 'echo-next.browser-eq';

type BrowserEqStorage = {
  state: EqState;
  channelBalance: ChannelBalanceState;
  userPresets: EqPreset[];
};

type EqBridgeApi = NonNullable<Window['echo']>['eq'];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const nowIso = (): string => new Date().toISOString();

const createBands = (gains: number[] = []): EqBand[] =>
  eqFrequenciesHz.map((frequencyHz, index) => ({
    frequencyHz,
    gainDb: clamp(Number(gains[index] ?? 0), eqMinGainDb, eqMaxGainDb),
    q: 1,
  }));

const browserBuiltInPresets: EqPreset[] = [
  { id: 'flat', name: 'Flat', preampDb: 0, bands: createBands(), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'bass-boost', name: 'Bass Boost', preampDb: -8, bands: createBands([7.5, 6.8, 5, 2.3, 0.5, -0.4, -1, -1.6, -2.2, -2.8]), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'vocal-clear', name: 'Vocal Clear', preampDb: -6, bands: createBands([-6, -5, -3, 0.5, 2.8, 4.5, 3.8, 2, -0.8, -2.8]), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'treble-sparkle', name: 'Treble Sparkle', preampDb: -7, bands: createBands([-3, -2.5, -1.8, -0.8, 0, 0.8, 2.8, 4.8, 6.2, 5.5]), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'rock', name: 'Rock', preampDb: -6, bands: createBands([5.5, 4.6, 1.8, -2, -3, -0.6, 2.2, 4.5, 3.8, 2]), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'harman-target', name: 'Harman Target', preampDb: -6, bands: createBands([6, 5.8, 4.5, 2, 0.5, 0, 2.5, 3.5, 2, 0.5]), createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
];

const defaultBrowserEqState = (): EqState => ({
  enabled: false,
  preampDb: 0,
  bands: createBands(),
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
});

const defaultBrowserChannelBalance = (): ChannelBalanceState => ({
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
});

const cloneBands = (bands: EqBand[]): EqBand[] => bands.map((band) => ({ ...band }));

const clonePreset = (preset: EqPreset): EqPreset => ({ ...preset, bands: cloneBands(preset.bands) });

const cloneState = (state: EqState): EqState => ({ ...state, bands: cloneBands(state.bands) });

const sanitizePresetId = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `preset-${Date.now()}`;

const normalizeBands = (bands: unknown, fallback = createBands()): EqBand[] => {
  if (!Array.isArray(bands) || bands.length !== eqBandCount) {
    return cloneBands(fallback);
  }

  return bands.map((value, index) => {
    const input = value as Partial<EqBand> | null;
    const frequencyHz = Number(input?.frequencyHz ?? eqFrequenciesHz[index]);
    const gainDb = Number(input?.gainDb ?? 0);
    const q = Number(input?.q ?? 1);

    return {
      frequencyHz: Number.isFinite(frequencyHz) ? clamp(frequencyHz, eqMinFrequencyHz, eqMaxFrequencyHz) : eqFrequenciesHz[index],
      gainDb: Number.isFinite(gainDb) ? clamp(gainDb, eqMinGainDb, eqMaxGainDb) : 0,
      q: Number.isFinite(q) && q > 0 ? clamp(q, 0.1, 12) : 1,
    };
  });
};

const normalizeState = (value: unknown): EqState => {
  if (!value || typeof value !== 'object') {
    return defaultBrowserEqState();
  }

  const input = value as Partial<EqState>;
  const preampDb = Number(input.preampDb ?? 0);

  return {
    enabled: Boolean(input.enabled),
    preampDb: Number.isFinite(preampDb) ? clamp(preampDb, eqMinPreampDb, eqMaxPreampDb) : 0,
    bands: normalizeBands(input.bands),
    presetId: typeof input.presetId === 'string' && input.presetId ? input.presetId : 'flat',
    presetName: typeof input.presetName === 'string' && input.presetName ? input.presetName : 'Flat',
    clippingRisk: Boolean(input.clippingRisk),
  };
};

const normalizeChannelBalance = (patch: Partial<ChannelBalanceState>, fallback = defaultBrowserChannelBalance()): ChannelBalanceState => {
  const balance = Number(patch.balance ?? fallback.balance);
  const leftGainDb = Number(patch.leftGainDb ?? fallback.leftGainDb);
  const rightGainDb = Number(patch.rightGainDb ?? fallback.rightGainDb);
  const monoModes = new Set<ChannelBalanceMonoMode>(['off', 'sum', 'left', 'right']);

  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : fallback.enabled,
    balance: Number.isFinite(balance) ? clamp(balance, channelBalanceMinBalance, channelBalanceMaxBalance) : fallback.balance,
    leftGainDb: Number.isFinite(leftGainDb) ? clamp(leftGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb) : fallback.leftGainDb,
    rightGainDb: Number.isFinite(rightGainDb) ? clamp(rightGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb) : fallback.rightGainDb,
    swapLeftRight: typeof patch.swapLeftRight === 'boolean' ? patch.swapLeftRight : fallback.swapLeftRight,
    monoMode: typeof patch.monoMode === 'string' && monoModes.has(patch.monoMode) ? patch.monoMode : fallback.monoMode,
    invertLeft: typeof patch.invertLeft === 'boolean' ? patch.invertLeft : fallback.invertLeft,
    invertRight: typeof patch.invertRight === 'boolean' ? patch.invertRight : fallback.invertRight,
    constantPower: typeof patch.constantPower === 'boolean' ? patch.constantPower : fallback.constantPower,
    clippingRisk: typeof patch.clippingRisk === 'boolean' ? patch.clippingRisk : fallback.clippingRisk,
  };
};

const normalizePreset = (value: unknown): EqPreset | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Partial<EqPreset>;
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 64) : null;
  const id = typeof input.id === 'string' && input.id.trim() ? sanitizePresetId(input.id) : name ? sanitizePresetId(name) : null;
  const preampDb = Number(input.preampDb ?? 0);

  if (!id || !name || !Number.isFinite(preampDb)) {
    return null;
  }

  return {
    id,
    name,
    preampDb: clamp(preampDb, eqMinPreampDb, eqMaxPreampDb),
    bands: normalizeBands(input.bands),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : nowIso(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : nowIso(),
    readonly: Boolean(input.readonly),
  };
};

const canUseLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

class BrowserEqBridge implements EqBridgeApi {
  private storage: BrowserEqStorage = {
    state: defaultBrowserEqState(),
    channelBalance: defaultBrowserChannelBalance(),
    userPresets: [],
  };

  constructor() {
    this.storage = this.readStorage();
  }

  async getState(): Promise<EqState> {
    return cloneState(this.storage.state);
  }

  async setEnabled(enabled: boolean): Promise<EqState> {
    this.storage.state = { ...this.storage.state, enabled };
    this.writeStorage();
    return this.getState();
  }

  async setBandGain({ band, gainDb }: EqSetBandGainRequest): Promise<EqState> {
    this.assertBandIndex(band);
    const safeGainDb = clamp(Number(gainDb), eqMinGainDb, eqMaxGainDb);
    this.storage.state = {
      ...this.storage.state,
      presetId: 'custom',
      presetName: 'Custom',
      bands: this.storage.state.bands.map((item, index) => (index === band ? { ...item, gainDb: safeGainDb } : item)),
    };
    this.writeStorage();
    return this.getState();
  }

  async setBandFrequency({ band, frequencyHz }: EqSetBandFrequencyRequest): Promise<EqState> {
    this.assertBandIndex(band);
    const safeFrequencyHz = clamp(Number(frequencyHz), eqMinFrequencyHz, eqMaxFrequencyHz);
    this.storage.state = {
      ...this.storage.state,
      presetId: 'custom',
      presetName: 'Custom',
      bands: this.storage.state.bands.map((item, index) => (index === band ? { ...item, frequencyHz: safeFrequencyHz } : item)),
    };
    this.writeStorage();
    return this.getState();
  }

  async setPreamp(preampDb: number): Promise<EqState> {
    const safePreampDb = clamp(Number(preampDb), eqMinPreampDb, eqMaxPreampDb);
    this.storage.state = { ...this.storage.state, preampDb: safePreampDb, presetId: 'custom', presetName: 'Custom' };
    this.writeStorage();
    return this.getState();
  }

  async setPreset(presetId: string): Promise<EqState> {
    const preset = this.allPresets().find((item) => item.id === presetId);

    if (!preset) {
      throw new Error('eq_preset_not_found');
    }

    this.storage.state = {
      enabled: this.storage.state.enabled,
      preampDb: preset.preampDb,
      bands: cloneBands(preset.bands),
      presetId: preset.id,
      presetName: preset.name,
      clippingRisk: false,
    };
    this.writeStorage();
    return this.getState();
  }

  async reset(): Promise<EqState> {
    return this.setPreset('flat');
  }

  async listPresets(): Promise<EqPreset[]> {
    return this.allPresets().map(clonePreset);
  }

  async savePreset(request: EqSavePresetRequest): Promise<EqPreset> {
    const normalized = normalizePreset({
      id: request.id ?? sanitizePresetId(request.name),
      name: request.name,
      preampDb: request.preampDb,
      bands: request.bands,
      readonly: false,
    });

    if (!normalized) {
      throw new Error('invalid_eq_preset');
    }

    if (browserBuiltInPresets.some((preset) => preset.id === normalized.id)) {
      throw new Error('cannot_overwrite_builtin_eq_preset');
    }

    const existingIndex = this.storage.userPresets.findIndex((preset) => preset.id === normalized.id);
    const existing = existingIndex >= 0 ? this.storage.userPresets[existingIndex] : null;
    const preset: EqPreset = {
      ...normalized,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      readonly: false,
    };

    if (existingIndex >= 0) {
      this.storage.userPresets[existingIndex] = preset;
    } else {
      this.storage.userPresets.push(preset);
    }

    this.writeStorage();
    return clonePreset(preset);
  }

  async deletePreset(presetId: string): Promise<EqPreset[]> {
    if (browserBuiltInPresets.some((preset) => preset.id === presetId)) {
      throw new Error('cannot_delete_builtin_eq_preset');
    }

    this.storage.userPresets = this.storage.userPresets.filter((preset) => preset.id !== presetId);
    this.writeStorage();
    return this.listPresets();
  }

  async getChannelBalanceState(): Promise<ChannelBalanceState> {
    return { ...this.storage.channelBalance };
  }

  async setChannelBalanceState(patch: Partial<ChannelBalanceState>): Promise<ChannelBalanceState> {
    this.storage.channelBalance = normalizeChannelBalance(patch, this.storage.channelBalance);
    this.writeStorage();
    return this.getChannelBalanceState();
  }

  async resetChannelBalance(): Promise<ChannelBalanceState> {
    this.storage.channelBalance = defaultBrowserChannelBalance();
    this.writeStorage();
    return this.getChannelBalanceState();
  }

  private allPresets(): EqPreset[] {
    return [...browserBuiltInPresets, ...this.storage.userPresets];
  }

  private assertBandIndex(band: number): void {
    if (!Number.isInteger(band) || band < 0 || band >= eqBandCount) {
      throw new Error('invalid_eq_band_index');
    }
  }

  private readStorage(): BrowserEqStorage {
    if (!canUseLocalStorage()) {
      return this.storage;
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(browserEqStorageKey) ?? '{}') as Partial<BrowserEqStorage>;
      return {
        state: normalizeState(parsed.state),
        channelBalance: normalizeChannelBalance(parsed.channelBalance ?? {}, defaultBrowserChannelBalance()),
        userPresets: Array.isArray(parsed.userPresets)
          ? parsed.userPresets.map(normalizePreset).filter((preset): preset is EqPreset => Boolean(preset && !preset.readonly))
          : [],
      };
    } catch {
      return this.storage;
    }
  }

  private writeStorage(): void {
    if (!canUseLocalStorage()) {
      return;
    }

    window.localStorage.setItem(browserEqStorageKey, JSON.stringify(this.storage));
  }
}

let browserEqBridge: EqBridgeApi | null = null;

const getBrowserEqBridge = (): EqBridgeApi => {
  browserEqBridge ??= new BrowserEqBridge();
  return browserEqBridge;
};

export const getEqBridge = (): Window['echo']['eq'] | null => getEchoBridge()?.eq ?? getBrowserEqBridge();

export const getLibraryBridge = (): Window['echo']['library'] | null => getEchoBridge()?.library ?? null;

export const getLastFmBridge = (): Window['echo']['lastfm'] | null => getEchoBridge()?.lastfm ?? null;

export const getMvBridge = (): Window['echo']['mv'] | null => getEchoBridge()?.mv ?? null;

export const getPlaybackBridge = (): Window['echo']['playback'] | null => getEchoBridge()?.playback ?? null;
