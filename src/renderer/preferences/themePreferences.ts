import type { AppThemeMode, AppThemePreset, AppThemePresetOverride, AppThemePresetOverrides, AppThemeToneOverride } from '../../shared/types/appSettings';
import { getAppBridge } from '../utils/echoBridge';
import { applyAppearancePreferences, readAppearancePreferences } from './appearancePreferences';

export type EffectiveTheme = 'light' | 'dark';
export type ThemeApplyOptions = {
  animate?: boolean;
};

const storageKey = 'echo-next:appearance-theme';
const presetStorageKey = 'echo-next:appearance-theme-preset';
const presetOverridesStorageKey = 'echo-next:appearance-theme-preset-overrides';
const systemThemeQuery = '(prefers-color-scheme: dark)';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const validThemeModes: AppThemeMode[] = ['light', 'dark', 'system'];
const validThemePresets: AppThemePreset[] = [
  'classic',
  'echoTwilight',
  'sakuraMilk',
  'peachSoda',
  'mintCandy',
  'berryDream',
  'matchaCream',
  'lemonMochi',
  'cottonCloud',
  'melonCream',
  'seaSaltJelly',
  'caramelPudding',
  'neonCandy',
  'wisteriaBubble',
  'strawberryCookie',
  'graphiteAurora',
  'amberNoir',
  'oceanStudio',
  'rosewoodVinyl',
  'darkSideMoon',
  'shibuyaNight',
  'kyotoKurenai',
  'ukiyoIndigo',
  'fujiSnow',
  'matsuriLantern',
  'ginzaNoir',
  'frostJazz',
];
const themeTransitionMs = 220;
const themeOverrideColorKeys: Array<keyof Pick<
  AppThemeToneOverride,
  'appBg' | 'appBg2' | 'appBg3' | 'panel' | 'panelSoft' | 'accent' | 'accentStrong' | 'secondary' | 'heading' | 'text' | 'muted' | 'border' | 'onAccent' | 'buttonText'
>> = ['appBg', 'appBg2', 'appBg3', 'panel', 'panelSoft', 'accent', 'accentStrong', 'secondary', 'heading', 'text', 'muted', 'border', 'onAccent', 'buttonText'];

const customThemeStyleProperties = [
  '--preset-app-bg',
  '--preset-app-bg-2',
  '--preset-app-bg-3',
  '--preset-panel-rgb',
  '--preset-soft-rgb',
  '--preset-border-rgb',
  '--preset-shadow-rgb',
  '--preset-text',
  '--preset-heading',
  '--preset-muted',
  '--preset-subtle',
  '--preset-accent',
  '--preset-accent-strong',
  '--preset-accent-rgb',
  '--preset-secondary',
  '--preset-secondary-rgb',
  '--preset-success-text',
  '--preset-on-accent',
  '--color-bg',
  '--color-bg-elevated',
  '--color-bg-soft',
  '--color-surface',
  '--color-surface-strong',
  '--color-border',
  '--color-border-strong',
  '--color-text',
  '--color-muted',
  '--color-subtle',
  '--echo-heading-text',
  '--color-accent',
  '--color-accent-soft',
  '--color-accent-strong',
  '--color-teal',
  '--color-blue',
  '--color-blue-soft',
  '--theme-app-bg',
  '--theme-page-bg',
  '--theme-page-text',
  '--theme-heading-text',
  '--theme-muted-text',
  '--theme-subtle-text',
  '--theme-panel-bg',
  '--theme-panel-bg-strong',
  '--theme-panel-bg-muted',
  '--theme-panel-border',
  '--theme-panel-border-strong',
  '--theme-field-bg',
  '--theme-field-bg-strong',
  '--theme-field-border',
  '--theme-field-placeholder',
  '--theme-button-bg',
  '--theme-button-bg-hover',
  '--theme-button-border',
  '--theme-button-text',
  '--theme-button-muted-bg',
  '--theme-button-muted-text',
  '--theme-list-row-bg',
  '--theme-list-row-bg-hover',
  '--theme-list-row-bg-active',
  '--theme-list-row-border',
  '--theme-chip-bg',
  '--theme-chip-bg-active',
  '--theme-chip-text',
  '--theme-player-bg',
  '--theme-player-border',
  '--theme-control-bg',
  '--theme-control-bg-hover',
  '--theme-control-bg-active',
  '--theme-focus-ring',
  '--theme-accent-bg',
  '--theme-accent-bg-strong',
  '--theme-accent-border',
  '--theme-accent-solid-bg',
  '--theme-accent-text',
  '--theme-accent-text-strong',
  '--theme-on-accent',
  '--theme-scrollbar-thumb',
  '--theme-scrollbar-thumb-hover',
  '--theme-shadow-soft',
  '--theme-shadow-panel',
  '--echo-polish-app-bg',
  '--echo-polish-app-bg-layer',
  '--echo-polish-titlebar-bg',
  '--echo-polish-sidebar-bg',
  '--echo-polish-page-bg',
  '--echo-polish-player-bg',
  '--echo-polish-surface',
  '--echo-polish-surface-strong',
  '--echo-polish-surface-muted',
  '--echo-polish-field-bg',
  '--echo-polish-button-bg',
  '--echo-polish-button-bg-hover',
  '--echo-polish-row-bg',
  '--echo-polish-row-bg-hover',
  '--echo-polish-row-bg-active',
  '--echo-polish-border',
  '--echo-polish-border-strong',
  '--echo-polish-hairline',
  '--echo-polish-accent-text',
  '--echo-polish-accent-bg',
  '--echo-polish-on-accent',
  '--echo-polish-active-bg',
  '--echo-polish-active-border',
  '--echo-polish-play-bg',
  '--echo-polish-shadow-soft',
  '--echo-polish-shadow-panel',
  '--echo-polish-shadow-row',
  '--echo-polish-shadow-player',
];

const fallbackToneDefaults: Record<EffectiveTheme, {
  appBg: string;
  appBg2: string;
  appBg3: string;
  panelRgb: string;
  panelSoftRgb: string;
  borderRgb: string;
  shadowRgb: string;
  text: string;
  heading: string;
  muted: string;
  subtle: string;
  accent: string;
  accentStrong: string;
  accentRgb: string;
  secondary: string;
  secondaryRgb: string;
  onAccent: string;
}> = {
  light: {
    appBg: '#f8fbfd',
    appBg2: '#eef3f7',
    appBg3: '#dfe8f2',
    panelRgb: '255 255 255',
    panelSoftRgb: '239 245 252',
    borderRgb: '40 62 88',
    shadowRgb: '31 47 69',
    text: '#32455d',
    heading: '#1c2735',
    muted: '#65758a',
    subtle: '#8b98a8',
    accent: '#2f6da8',
    accentStrong: '#164b7d',
    accentRgb: '47 109 168',
    secondary: '#42b3a8',
    secondaryRgb: '66 179 168',
    onAccent: '#ffffff',
  },
  dark: {
    appBg: '#101318',
    appBg2: '#151a22',
    appBg3: '#111827',
    panelRgb: '28 34 43',
    panelSoftRgb: '22 27 35',
    borderRgb: '100 124 150',
    shadowRgb: '0 0 0',
    text: '#d8e0ea',
    heading: '#f8fbff',
    muted: '#a8b5c4',
    subtle: '#7f8b9a',
    accent: '#75b7ff',
    accentStrong: '#cce6ff',
    accentRgb: '117 183 255',
    secondary: '#7dd7cb',
    secondaryRgb: '125 215 203',
    onAccent: '#0f1720',
  },
};

type ThemeTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished?: Promise<unknown> };
};

export const defaultThemeMode: AppThemeMode = 'dark';
export const defaultThemePreset: AppThemePreset = 'classic';

export const normalizeThemeMode = (value: unknown): AppThemeMode =>
  validThemeModes.includes(value as AppThemeMode) ? (value as AppThemeMode) : defaultThemeMode;

export const normalizeThemePreset = (value: unknown): AppThemePreset =>
  validThemePresets.includes(value as AppThemePreset) ? (value as AppThemePreset) : defaultThemePreset;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeThemeHexColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : undefined;
};

const normalizeOverridePercent = (value: unknown, min: number, max: number): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(clamp(numeric, min, max)) : undefined;
};

export const normalizeThemeToneOverride = (value: unknown): AppThemeToneOverride | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Partial<AppThemeToneOverride>;
  const output: AppThemeToneOverride = {};

  for (const key of themeOverrideColorKeys) {
    const color = normalizeThemeHexColor(input[key]);
    if (color) {
      output[key] = color;
    }
  }

  const panelOpacityPercent = normalizeOverridePercent(input.panelOpacityPercent, 40, 100);
  const glassPercent = normalizeOverridePercent(input.glassPercent, 0, 80);
  const shadowPercent = normalizeOverridePercent(input.shadowPercent, 0, 100);

  if (panelOpacityPercent !== undefined) {
    output.panelOpacityPercent = panelOpacityPercent;
  }
  if (glassPercent !== undefined) {
    output.glassPercent = glassPercent;
  }
  if (shadowPercent !== undefined) {
    output.shadowPercent = shadowPercent;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

export const normalizeThemePresetOverride = (value: unknown): AppThemePresetOverride | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Partial<AppThemePresetOverride>;
  const light = normalizeThemeToneOverride(input.light);
  const dark = normalizeThemeToneOverride(input.dark);
  const output: AppThemePresetOverride = {};

  if (light) {
    output.light = light;
  }
  if (dark) {
    output.dark = dark;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

export const normalizeThemePresetOverrides = (value: unknown): AppThemePresetOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Partial<Record<string, unknown>>;
  const output: AppThemePresetOverrides = {};

  for (const preset of validThemePresets) {
    const override = normalizeThemePresetOverride(input[preset]);
    if (override) {
      output[preset] = override;
    }
  }

  return output;
};

const hexToRgbTriplet = (value: string): string => {
  const normalized = normalizeThemeHexColor(value);
  if (!normalized) {
    return '0 0 0';
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ].join(' ');
};

const rgb = (triplet: string, alpha: number): string => `rgb(${triplet} / ${clamp(alpha, 0, 1).toFixed(3)})`;

const readCssVariable = (root: HTMLElement, property: string): string => {
  try {
    return window.getComputedStyle(root).getPropertyValue(property).trim();
  } catch {
    return '';
  }
};

const clearCustomThemeProperties = (root: HTMLElement): void => {
  for (const property of customThemeStyleProperties) {
    root.style.removeProperty(property);
  }
};

const applyThemeToneOverride = (root: HTMLElement, tone: EffectiveTheme, override: AppThemeToneOverride): void => {
  const fallback = fallbackToneDefaults[tone];
  const readColor = (key: keyof AppThemeToneOverride, property: string, fallbackValue: string): string => {
    const cssValue = readCssVariable(root, property) || fallbackValue;
    return normalizeThemeHexColor(override[key]) ?? cssValue;
  };
  const readTriplet = (key: keyof AppThemeToneOverride, property: string, fallbackValue: string): string => {
    const color = normalizeThemeHexColor(override[key]);
    return color ? hexToRgbTriplet(color) : readCssVariable(root, property) || fallbackValue;
  };

  const appBg = readColor('appBg', '--preset-app-bg', fallback.appBg);
  const appBg2 = readColor('appBg2', '--preset-app-bg-2', fallback.appBg2);
  const appBg3 = readColor('appBg3', '--preset-app-bg-3', fallback.appBg3);
  const panelRgb = readTriplet('panel', '--preset-panel-rgb', fallback.panelRgb);
  const panelSoftRgb = readTriplet('panelSoft', '--preset-soft-rgb', fallback.panelSoftRgb);
  const borderRgb = readTriplet('border', '--preset-border-rgb', fallback.borderRgb);
  const accent = readColor('accent', '--preset-accent', fallback.accent);
  const accentStrong = readColor('accentStrong', '--preset-accent-strong', fallback.accentStrong);
  const normalizedAccent = normalizeThemeHexColor(override.accent);
  const accentRgb = normalizedAccent ? hexToRgbTriplet(normalizedAccent) : readCssVariable(root, '--preset-accent-rgb') || fallback.accentRgb;
  const secondary = readColor('secondary', '--preset-secondary', fallback.secondary);
  const normalizedSecondary = normalizeThemeHexColor(override.secondary);
  const secondaryRgb = normalizedSecondary ? hexToRgbTriplet(normalizedSecondary) : readCssVariable(root, '--preset-secondary-rgb') || fallback.secondaryRgb;
  const text = readColor('text', '--preset-text', fallback.text);
  const heading = readColor('heading', '--preset-heading', fallback.heading);
  const muted = readColor('muted', '--preset-muted', fallback.muted);
  const subtle = readCssVariable(root, '--preset-subtle') || fallback.subtle;
  const onAccent = readColor('onAccent', '--preset-on-accent', fallback.onAccent);
  const buttonText = normalizeThemeHexColor(override.buttonText) ?? text;
  const panelAlpha = (override.panelOpacityPercent ?? 72) / 100;
  const glassAlpha = (override.glassPercent ?? 18) / 100;
  const shadowScale = (override.shadowPercent ?? 100) / 100;
  const panelStrongAlpha = Math.min(0.98, panelAlpha + 0.18);
  const panelMutedAlpha = Math.min(0.92, panelAlpha + 0.02);
  const fieldAlpha = Math.min(0.96, panelAlpha + 0.06);
  const buttonAlpha = Math.min(0.96, Math.max(0.48, panelAlpha - 0.02));
  const shadowSoftAlpha = 0.12 * shadowScale;
  const shadowPanelAlpha = 0.08 * shadowScale;
  const shadowRowAlpha = 0.075 * shadowScale;
  const shadowPlayerAlpha = 0.1 * shadowScale;

  root.style.setProperty('--preset-app-bg', appBg);
  root.style.setProperty('--preset-app-bg-2', appBg2);
  root.style.setProperty('--preset-app-bg-3', appBg3);
  root.style.setProperty('--preset-panel-rgb', panelRgb);
  root.style.setProperty('--preset-soft-rgb', panelSoftRgb);
  root.style.setProperty('--preset-border-rgb', borderRgb);
  root.style.setProperty('--preset-text', text);
  root.style.setProperty('--preset-heading', heading);
  root.style.setProperty('--preset-muted', muted);
  root.style.setProperty('--preset-subtle', subtle);
  root.style.setProperty('--preset-accent', accent);
  root.style.setProperty('--preset-accent-strong', accentStrong);
  root.style.setProperty('--preset-accent-rgb', accentRgb);
  root.style.setProperty('--preset-secondary', secondary);
  root.style.setProperty('--preset-secondary-rgb', secondaryRgb);
  root.style.setProperty('--preset-on-accent', onAccent);

  root.style.setProperty('--color-bg', appBg);
  root.style.setProperty('--color-bg-elevated', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--color-bg-soft', rgb(panelSoftRgb, panelMutedAlpha));
  root.style.setProperty('--color-surface', rgb(panelRgb, panelAlpha));
  root.style.setProperty('--color-surface-strong', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--color-border', rgb(borderRgb, 0.15 + glassAlpha * 0.12));
  root.style.setProperty('--color-border-strong', rgb(borderRgb, 0.24 + glassAlpha * 0.12));
  root.style.setProperty('--color-text', text);
  root.style.setProperty('--color-muted', muted);
  root.style.setProperty('--color-subtle', subtle);
  root.style.setProperty('--echo-heading-text', heading);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-accent-soft', rgb(accentRgb, 0.13 + glassAlpha * 0.08));
  root.style.setProperty('--color-accent-strong', accentStrong);
  root.style.setProperty('--color-teal', secondary);
  root.style.setProperty('--color-blue', accent);
  root.style.setProperty('--color-blue-soft', rgb(secondaryRgb, 0.18 + glassAlpha * 0.08));

  root.style.setProperty('--theme-app-bg', appBg);
  root.style.setProperty(
    '--theme-page-bg',
    `radial-gradient(circle at 14% 10%, ${rgb(accentRgb, 0.12 + glassAlpha * 0.12)}, transparent 32%), radial-gradient(circle at 84% 6%, ${rgb(secondaryRgb, 0.11 + glassAlpha * 0.1)}, transparent 30%), linear-gradient(135deg, ${appBg} 0%, ${appBg2} 52%, ${appBg3} 100%)`,
  );
  root.style.setProperty('--theme-page-text', text);
  root.style.setProperty('--theme-heading-text', heading);
  root.style.setProperty('--theme-muted-text', muted);
  root.style.setProperty('--theme-subtle-text', subtle);
  root.style.setProperty('--theme-panel-bg', rgb(panelRgb, panelAlpha));
  root.style.setProperty('--theme-panel-bg-strong', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--theme-panel-bg-muted', rgb(panelSoftRgb, panelMutedAlpha));
  root.style.setProperty('--theme-panel-border', rgb(borderRgb, 0.14 + glassAlpha * 0.12));
  root.style.setProperty('--theme-panel-border-strong', rgb(borderRgb, 0.24 + glassAlpha * 0.14));
  root.style.setProperty('--theme-field-bg', rgb(panelRgb, fieldAlpha));
  root.style.setProperty('--theme-field-bg-strong', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--theme-field-border', rgb(borderRgb, 0.16 + glassAlpha * 0.12));
  root.style.setProperty('--theme-field-placeholder', subtle);
  root.style.setProperty('--theme-button-bg', rgb(panelRgb, buttonAlpha));
  root.style.setProperty('--theme-button-bg-hover', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--theme-button-border', rgb(borderRgb, 0.14 + glassAlpha * 0.12));
  root.style.setProperty('--theme-button-text', buttonText);
  root.style.setProperty('--theme-button-muted-bg', rgb(panelSoftRgb, panelMutedAlpha));
  root.style.setProperty('--theme-button-muted-text', muted);
  root.style.setProperty('--theme-list-row-bg', rgb(panelRgb, Math.max(0.42, panelAlpha - 0.12)));
  root.style.setProperty('--theme-list-row-bg-hover', rgb(panelRgb, Math.min(0.9, panelAlpha + 0.1)));
  root.style.setProperty('--theme-list-row-bg-active', rgb(accentRgb, 0.16 + glassAlpha * 0.06));
  root.style.setProperty('--theme-list-row-border', rgb(borderRgb, 0.11 + glassAlpha * 0.08));
  root.style.setProperty('--theme-chip-bg', rgb(panelRgb, buttonAlpha));
  root.style.setProperty('--theme-chip-bg-active', rgb(accentRgb, 0.17 + glassAlpha * 0.06));
  root.style.setProperty('--theme-chip-text', muted);
  root.style.setProperty('--theme-player-bg', rgb(panelRgb, Math.min(0.98, panelAlpha + 0.19)));
  root.style.setProperty('--theme-player-border', rgb(borderRgb, 0.18 + glassAlpha * 0.12));
  root.style.setProperty('--theme-control-bg', rgb(borderRgb, 0.12 + glassAlpha * 0.08));
  root.style.setProperty('--theme-control-bg-hover', rgb(borderRgb, 0.18 + glassAlpha * 0.1));
  root.style.setProperty('--theme-control-bg-active', rgb(accentRgb, 0.18 + glassAlpha * 0.08));
  root.style.setProperty('--theme-focus-ring', rgb(accentRgb, 0.32));
  root.style.setProperty('--theme-accent-bg', rgb(accentRgb, 0.13 + glassAlpha * 0.06));
  root.style.setProperty('--theme-accent-bg-strong', rgb(accentRgb, 0.22 + glassAlpha * 0.08));
  root.style.setProperty('--theme-accent-border', rgb(accentRgb, 0.3 + glassAlpha * 0.1));
  root.style.setProperty('--theme-accent-solid-bg', accent);
  root.style.setProperty('--theme-accent-text', accentStrong);
  root.style.setProperty('--theme-accent-text-strong', accentStrong);
  root.style.setProperty('--theme-on-accent', onAccent);
  root.style.setProperty('--theme-scrollbar-thumb', rgb(accentRgb, 0.35 + glassAlpha * 0.08));
  root.style.setProperty('--theme-scrollbar-thumb-hover', rgb(accentRgb, 0.5 + glassAlpha * 0.08));
  root.style.setProperty('--theme-shadow-soft', `0 22px 60px rgb(${fallback.shadowRgb} / ${shadowSoftAlpha.toFixed(3)})`);
  root.style.setProperty('--theme-shadow-panel', `0 12px 30px rgb(${fallback.shadowRgb} / ${shadowPanelAlpha.toFixed(3)})`);

  root.style.setProperty('--echo-polish-app-bg', appBg);
  root.style.setProperty(
    '--echo-polish-app-bg-layer',
    `radial-gradient(circle at 13% 8%, ${rgb(accentRgb, 0.11 + glassAlpha * 0.13)}, transparent 31%), radial-gradient(circle at 88% 3%, ${rgb(secondaryRgb, 0.1 + glassAlpha * 0.12)}, transparent 32%), linear-gradient(135deg, ${appBg} 0%, ${appBg2} 50%, ${appBg3} 100%)`,
  );
  root.style.setProperty('--echo-polish-titlebar-bg', rgb(panelRgb, Math.min(0.96, panelAlpha + 0.08)));
  root.style.setProperty('--echo-polish-sidebar-bg', `linear-gradient(180deg, ${rgb(panelRgb, panelAlpha)}, ${rgb(panelSoftRgb, panelMutedAlpha)} 58%, ${rgb(panelRgb, panelStrongAlpha)})`);
  root.style.setProperty('--echo-polish-page-bg', `radial-gradient(circle at 18% 0%, ${rgb(accentRgb, 0.08 + glassAlpha * 0.08)}, transparent 34%), linear-gradient(180deg, ${rgb(panelRgb, Math.max(0.32, panelAlpha - 0.22))}, ${rgb(panelSoftRgb, panelMutedAlpha)} 54%, ${rgb(panelRgb, panelStrongAlpha)})`);
  root.style.setProperty('--echo-polish-player-bg', `linear-gradient(180deg, ${rgb(panelRgb, panelStrongAlpha)}, ${rgb(panelSoftRgb, Math.min(0.96, panelMutedAlpha + 0.14))})`);
  root.style.setProperty('--echo-polish-surface', rgb(panelRgb, Math.max(0.48, panelAlpha - 0.06)));
  root.style.setProperty('--echo-polish-surface-strong', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--echo-polish-surface-muted', rgb(panelSoftRgb, Math.min(0.92, panelMutedAlpha + 0.1)));
  root.style.setProperty('--echo-polish-field-bg', rgb(panelRgb, fieldAlpha));
  root.style.setProperty('--echo-polish-button-bg', rgb(panelRgb, buttonAlpha));
  root.style.setProperty('--echo-polish-button-bg-hover', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--echo-polish-row-bg', rgb(panelRgb, Math.max(0.4, panelAlpha - 0.16)));
  root.style.setProperty('--echo-polish-row-bg-hover', rgb(panelRgb, Math.min(0.9, panelAlpha + 0.12)));
  root.style.setProperty('--echo-polish-row-bg-active', rgb(accentRgb, 0.17 + glassAlpha * 0.06));
  root.style.setProperty('--echo-polish-border', rgb(borderRgb, 0.14 + glassAlpha * 0.12));
  root.style.setProperty('--echo-polish-border-strong', rgb(borderRgb, 0.24 + glassAlpha * 0.14));
  root.style.setProperty('--echo-polish-hairline', rgb(panelRgb, panelStrongAlpha));
  root.style.setProperty('--echo-polish-accent-text', accentStrong);
  root.style.setProperty('--echo-polish-accent-bg', rgb(accentRgb, 0.13 + glassAlpha * 0.06));
  root.style.setProperty('--echo-polish-on-accent', onAccent);
  root.style.setProperty('--echo-polish-active-bg', rgb(accentRgb, 0.14 + glassAlpha * 0.06));
  root.style.setProperty('--echo-polish-active-border', rgb(accentRgb, 0.28 + glassAlpha * 0.1));
  root.style.setProperty('--echo-polish-play-bg', `linear-gradient(180deg, ${accent}, ${accentStrong})`);
  root.style.setProperty('--echo-polish-shadow-soft', `0 24px 68px rgb(${fallback.shadowRgb} / ${(0.13 * shadowScale).toFixed(3)})`);
  root.style.setProperty('--echo-polish-shadow-panel', `0 14px 34px rgb(${fallback.shadowRgb} / ${shadowPanelAlpha.toFixed(3)})`);
  root.style.setProperty('--echo-polish-shadow-row', `0 9px 22px rgb(${fallback.shadowRgb} / ${shadowRowAlpha.toFixed(3)})`);
  root.style.setProperty('--echo-polish-shadow-player', `0 -18px 46px rgb(${fallback.shadowRgb} / ${shadowPlayerAlpha.toFixed(3)})`);
};

export const readThemeMode = (): AppThemeMode => {
  try {
    return normalizeThemeMode(window.localStorage.getItem(storageKey));
  } catch {
    return defaultThemeMode;
  }
};

export const readThemePreset = (): AppThemePreset => {
  try {
    return normalizeThemePreset(window.localStorage.getItem(presetStorageKey));
  } catch {
    return defaultThemePreset;
  }
};

export const readThemePresetOverrides = (): AppThemePresetOverrides => {
  try {
    const raw = window.localStorage.getItem(presetOverridesStorageKey);
    return raw ? normalizeThemePresetOverrides(JSON.parse(raw) as unknown) : {};
  } catch {
    return {};
  }
};

export const writeThemeMode = (mode: AppThemeMode): AppThemeMode => {
  const normalized = normalizeThemeMode(mode);

  try {
    window.localStorage.setItem(storageKey, normalized);
  } catch {
    return normalized;
  }

  return normalized;
};

export const writeThemePreset = (preset: AppThemePreset): AppThemePreset => {
  const normalized = normalizeThemePreset(preset);

  try {
    window.localStorage.setItem(presetStorageKey, normalized);
  } catch {
    return normalized;
  }

  return normalized;
};

export const writeThemePresetOverrides = (overrides: AppThemePresetOverrides): AppThemePresetOverrides => {
  const normalized = normalizeThemePresetOverrides(overrides);

  try {
    window.localStorage.setItem(presetOverridesStorageKey, JSON.stringify(normalized));
  } catch {
    return normalized;
  }

  return normalized;
};

export const resolveThemeMode = (mode: AppThemeMode): EffectiveTheme => {
  const normalized = normalizeThemeMode(mode);

  if (normalized === 'dark') {
    return 'dark';
  }

  if (normalized === 'system' && typeof window.matchMedia === 'function') {
    return window.matchMedia(systemThemeQuery).matches ? 'dark' : 'light';
  }

  return 'light';
};

const prefersReducedMotion = (): boolean => {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(reducedMotionQuery).matches;
  } catch {
    return false;
  }
};

const runThemeTransition = (callback: () => void, options: ThemeApplyOptions = {}): void => {
  if (!options.animate || prefersReducedMotion()) {
    callback();
    return;
  }

  const root = document.documentElement;
  const clearTransitionState = (): void => {
    window.setTimeout(() => {
      delete root.dataset.themeTransition;
    }, themeTransitionMs);
  };

  root.dataset.themeTransition = 'true';

  const transitionDocument = document as ThemeTransitionDocument;
  if (typeof transitionDocument.startViewTransition === 'function') {
    const transition = transitionDocument.startViewTransition(callback);
    void transition.finished?.finally(clearTransitionState);
    if (!transition.finished) {
      clearTransitionState();
    }
    return;
  }

  callback();
  clearTransitionState();
};

const applyThemeModeNow = (mode: AppThemeMode, preset: AppThemePreset, overrides: AppThemePresetOverrides): EffectiveTheme => {
  const normalized = normalizeThemeMode(mode);
  const normalizedPreset = normalizeThemePreset(preset);
  const normalizedOverrides = normalizeThemePresetOverrides(overrides);
  const effectiveTheme = resolveThemeMode(normalized);
  const root = document.documentElement;
  const toneOverride = normalizedOverrides[normalizedPreset]?.[effectiveTheme];

  clearCustomThemeProperties(root);
  root.dataset.themeMode = normalized;
  root.dataset.themePreset = normalizedPreset;
  root.dataset.theme = effectiveTheme;
  if (toneOverride) {
    root.dataset.themeCustom = 'true';
  } else {
    delete root.dataset.themeCustom;
  }
  root.style.colorScheme = effectiveTheme;
  applyAppearancePreferences(readAppearancePreferences());
  if (toneOverride) {
    applyThemeToneOverride(root, effectiveTheme, toneOverride);
  }

  return effectiveTheme;
};

export const applyThemeMode = (
  mode: AppThemeMode,
  preset: AppThemePreset = readThemePreset(),
  overrides: AppThemePresetOverrides = readThemePresetOverrides(),
  options: ThemeApplyOptions = {},
): EffectiveTheme => {
  const normalized = normalizeThemeMode(mode);
  const normalizedPreset = normalizeThemePreset(preset);
  const normalizedOverrides = normalizeThemePresetOverrides(overrides);
  let effectiveTheme = resolveThemeMode(normalized);

  runThemeTransition(() => {
    effectiveTheme = applyThemeModeNow(normalized, normalizedPreset, normalizedOverrides);
  }, options);

  return effectiveTheme;
};

export const updateThemeMode = (mode: AppThemeMode, options: ThemeApplyOptions = {}): AppThemeMode => {
  const normalized = writeThemeMode(mode);
  applyThemeMode(normalized, readThemePreset(), readThemePresetOverrides(), options);
  return normalized;
};

export const updateThemePreset = (preset: AppThemePreset, options: ThemeApplyOptions = {}): AppThemePreset => {
  const normalized = writeThemePreset(preset);
  applyThemeMode(readThemeMode(), normalized, readThemePresetOverrides(), options);
  return normalized;
};

export const updateThemePresetOverrides = (
  overrides: AppThemePresetOverrides,
  mode: AppThemeMode = readThemeMode(),
  preset: AppThemePreset = readThemePreset(),
  options: ThemeApplyOptions = {},
): AppThemePresetOverrides => {
  const normalizedOverrides = writeThemePresetOverrides(overrides);
  applyThemeMode(mode, preset, normalizedOverrides, options);
  return normalizedOverrides;
};

export const updateThemePreferences = (
  mode: AppThemeMode,
  preset: AppThemePreset,
  overrides: AppThemePresetOverrides = readThemePresetOverrides(),
  options: ThemeApplyOptions = {},
): AppThemeMode => {
  const normalizedMode = writeThemeMode(mode);
  const normalizedPreset = writeThemePreset(preset);
  const normalizedOverrides = writeThemePresetOverrides(overrides);
  applyThemeMode(normalizedMode, normalizedPreset, normalizedOverrides, options);
  return normalizedMode;
};

export const loadPersistedThemeMode = async (): Promise<AppThemeMode> => {
  const appBridge = getAppBridge();

  if (!appBridge) {
    const localThemeMode = readThemeMode();
    applyThemeMode(localThemeMode, readThemePreset(), readThemePresetOverrides());
    return localThemeMode;
  }

  const settings = await appBridge.getSettings();
  const themeMode = updateThemePreferences(
    settings.appearanceTheme ?? defaultThemeMode,
    settings.appearanceThemePreset ?? defaultThemePreset,
    settings.appearanceThemePresetOverrides ?? {},
  );
  return themeMode;
};

export const watchSystemThemeMode = (getThemeMode: () => AppThemeMode = readThemeMode): (() => void) => {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(systemThemeQuery);
  const handleChange = (): void => {
    applyThemeMode(getThemeMode(), readThemePreset(), readThemePresetOverrides());
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }

  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
};
