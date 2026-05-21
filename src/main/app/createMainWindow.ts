import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BrowserWindow } from 'electron';
import type { AppSettings, RememberedWindowSize } from '../../shared/types/appSettings';
import { getAppSettings, setAppSettings } from './appSettings';
import { bindBackgroundPlaybackShortcutsToWindow } from './backgroundPlaybackShortcuts';
import { bindTaskbarPlaybackIntegration } from './taskbarPlaybackIntegration';
import { ensureTray, isAppQuitRequested } from './tray';
import { clearMainWindow, setMainWindow } from './windowManager';
import { getCrashReportService } from '../diagnostics/CrashReportService';
import { recordRendererConsoleMessage } from '../diagnostics/DevConsoleService';
import { markStartupStage } from '../diagnostics/StartupDiagnostics';

const mainOutputDir = import.meta.dirname;
const appIconPath = join(mainOutputDir, '../../software.ico');
export const defaultMainWindowSize = {
  width: 1680,
  height: 1050,
} as const;
export const mainWindowMinimumSize = {
  width: 360,
  height: 620,
} as const;
const rememberWindowSizeDebounceMs = 350;

export const resolvePreloadPath = (baseDir = mainOutputDir): string => {
  const mjsPreload = join(baseDir, '../preload/index.mjs');

  if (existsSync(mjsPreload)) {
    return mjsPreload;
  }

  return join(baseDir, '../preload/index.js');
};

export const createMainWindowWebPreferences = (): Electron.BrowserWindowConstructorOptions['webPreferences'] => ({
  preload: resolvePreloadPath(),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  backgroundThrottling: false,
});

export const resolveInitialMainWindowSize = (settings: AppSettings = getAppSettings()): RememberedWindowSize => {
  const rememberedSize = settings.rememberWindowSizeEnabled === false ? null : settings.rememberedWindowSize;

  return {
    width: Math.max(mainWindowMinimumSize.width, rememberedSize?.width ?? defaultMainWindowSize.width),
    height: Math.max(mainWindowMinimumSize.height, rememberedSize?.height ?? defaultMainWindowSize.height),
  };
};

const rememberMainWindowSize = (window: BrowserWindow): void => {
  if (window.isDestroyed() || window.isMinimized() || window.isMaximized() || window.isFullScreen()) {
    return;
  }

  if (getAppSettings().rememberWindowSizeEnabled === false) {
    return;
  }

  const [width, height] = window.getSize();
  setAppSettings({
    rememberedWindowSize: {
      width,
      height,
    },
  });
};

export const createMainWindow = (): BrowserWindow => {
  markStartupStage('main-window:create:start');
  const initialSize = resolveInitialMainWindowSize();
  const window = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: mainWindowMinimumSize.width,
    minHeight: mainWindowMinimumSize.height,
    title: 'ECHO NEXT',
    icon: existsSync(appIconPath) ? appIconPath : undefined,
    backgroundColor: '#f7f9fc',
    frame: false,
    show: false,
    webPreferences: createMainWindowWebPreferences(),
  });
  let rememberSizeTimer: ReturnType<typeof setTimeout> | null = null;

  window.webContents.on('console-message', (details) => {
    recordRendererConsoleMessage(details);
    const { level, message, lineNumber, sourceId } = details;

    if (!message.includes('[SpotifySDK]')) {
      return;
    }

    getCrashReportService().getLogger()?.info('renderer', 'renderer console', {
      level,
      message,
      line: lineNumber,
      sourceId,
    });
  });

  const scheduleRememberSize = (): void => {
    if (rememberSizeTimer !== null) {
      clearTimeout(rememberSizeTimer);
    }

    rememberSizeTimer = setTimeout(() => {
      rememberSizeTimer = null;
      rememberMainWindowSize(window);
    }, rememberWindowSizeDebounceMs);
  };

  window.once('ready-to-show', () => {
    window.show();
    markStartupStage('main-window:ready-to-show');
  });

  window.on('resize', scheduleRememberSize);

  window.on('close', (event) => {
    if (rememberSizeTimer !== null) {
      clearTimeout(rememberSizeTimer);
      rememberSizeTimer = null;
    }

    rememberMainWindowSize(window);

    if (!isAppQuitRequested() && getAppSettings().hideToTrayOnClose) {
      event.preventDefault();
      ensureTray();
      window.hide();
    }
  });

  window.on('closed', () => {
    if (rememberSizeTimer !== null) {
      clearTimeout(rememberSizeTimer);
      rememberSizeTimer = null;
    }

    clearMainWindow();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(mainOutputDir, '../renderer/index.html'));
  }

  setMainWindow(window);
  bindBackgroundPlaybackShortcutsToWindow();
  bindTaskbarPlaybackIntegration(window);
  markStartupStage('main-window:create:complete', initialSize);

  return window;
};
