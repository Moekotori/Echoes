import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BrowserWindow } from 'electron';
import { getAppSettings } from './appSettings';
import { ensureTray, isAppQuitRequested } from './tray';
import { clearMainWindow, setMainWindow } from './windowManager';

export const resolvePreloadPath = (baseDir = __dirname): string => {
  const mjsPreload = join(baseDir, '../preload/index.mjs');

  if (existsSync(mjsPreload)) {
    return mjsPreload;
  }

  return join(baseDir, '../preload/index.js');
};

export const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 1120,
    minHeight: 760,
    title: 'ECHO Next',
    backgroundColor: '#f7f9fc',
    frame: false,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('close', (event) => {
    if (!isAppQuitRequested() && getAppSettings().hideToTrayOnClose) {
      event.preventDefault();
      ensureTray();
      window.hide();
    }
  });

  window.on('closed', () => {
    clearMainWindow();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  setMainWindow(window);

  return window;
};
