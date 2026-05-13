import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import { App } from './app/App';
import { applyAppearancePreferences, readAppearancePreferences, registerAppearanceFontFile } from './preferences/appearancePreferences';
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

const appearancePreferences = readAppearancePreferences();
const appBridge = getAppBridge();
applyAppearancePreferences(appearancePreferences);

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

if (appearancePreferences.mainFontFilePath && appBridge) {
  void appBridge.loadFontFile(appearancePreferences.mainFontFilePath).then((fontFile) => registerAppearanceFontFile('main', fontFile)).catch(() => undefined);
}

if (appearancePreferences.chineseFontFilePath && appBridge) {
  void appBridge
    .loadFontFile(appearancePreferences.chineseFontFilePath)
    .then((fontFile) => registerAppearanceFontFile('chinese', fontFile))
    .catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
