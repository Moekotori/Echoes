import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import { App } from './app/App';
import { DesktopLyricsApp } from './desktop-lyrics/DesktopLyricsApp';
import {
  applyAppearancePreferences,
  loadPersistedAppearancePreferences,
  readAppearancePreferences,
  registerAppearanceFontFile,
} from './preferences/appearancePreferences';
import { applyThemeMode, loadPersistedThemeMode, readThemeMode, watchSystemThemeMode } from './preferences/themePreferences';
import type { AppearancePreferences, AppSettings } from '../shared/types/appSettings';
import { getAppBridge } from './utils/echoBridge';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/app.css';
import './styles/songs.css';
import './styles/folders.css';
import './styles/eq.css';
import './styles/album-detail.css';
import './styles/artist-detail.css';
import './styles/queue.css';
import './styles/lyrics.css';
import './styles/legacy-theme-bridge.css';
import './styles/ui-polish.css';
import './styles/theme-presets.css';
import './styles/desktop-lyrics.css';

const appearancePreferences = readAppearancePreferences();
const themeMode = readThemeMode();
const appBridge = getAppBridge();
applyThemeMode(themeMode);
applyAppearancePreferences(appearancePreferences);

const loadAppearanceFontFiles = (preferences: AppearancePreferences): void => {
  if (preferences.mainFontFilePath && appBridge) {
    void appBridge.loadFontFile(preferences.mainFontFilePath).then((fontFile) => registerAppearanceFontFile('main', fontFile)).catch(() => undefined);
  }

  if (preferences.chineseFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.chineseFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('chinese', fontFile))
      .catch(() => undefined);
  }

  if (preferences.fallbackFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.fallbackFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('fallback', fontFile))
      .catch(() => undefined);
  }
};

const loadLyricsFontFile = (settings: Partial<AppSettings>): void => {
  if (settings.lyricsFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(settings.lyricsFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('lyrics', fontFile))
      .catch(() => undefined);
  }
};

const reportRendererError = (payload: Parameters<NonNullable<Window['echo']['diagnostics']>['reportRendererError']>[0]): void => {
  void window.echo?.diagnostics.reportRendererError(payload).catch(() => undefined);
};

window.addEventListener('error', (event) => {
  reportRendererError({
    message: event.message || 'Renderer error',
    stack: event.error instanceof Error ? event.error.stack : undefined,
    filename: event.filename || undefined,
    lineno: event.lineno,
    colno: event.colno,
    source: 'error',
    timestamp: new Date().toISOString(),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportRendererError({
    message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled renderer rejection'),
    stack: reason instanceof Error ? reason.stack : undefined,
    source: 'unhandledrejection',
    timestamp: new Date().toISOString(),
  });
});

loadAppearanceFontFiles(appearancePreferences);
watchSystemThemeMode(readThemeMode);
void loadPersistedThemeMode().catch(() => undefined);
void loadPersistedAppearancePreferences()
  .then((preferences) => {
    applyAppearancePreferences(preferences);
    loadAppearanceFontFiles(preferences);
  })
  .catch(() => undefined);
void appBridge?.getSettings().then(loadLyricsFontFile).catch(() => undefined);

const isDesktopLyricsWindow = new URLSearchParams(window.location.search).get('desktopLyrics') === '1';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isDesktopLyricsWindow ? <DesktopLyricsApp /> : <App />}
  </React.StrictMode>,
);
