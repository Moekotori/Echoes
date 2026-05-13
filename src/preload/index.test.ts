import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../shared/constants/ipcChannels';
import type { EchoApi } from './apiTypes';

const listeners = new Map<string, (...args: unknown[]) => void>();
let exposedApi: EchoApi | null = null;

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: EchoApi) => {
      exposedApi = api;
    },
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, listener);
    }),
    off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      if (listeners.get(channel) === listener) {
        listeners.delete(channel);
      }
    }),
  },
}));

describe('preload SMTC API', () => {
  beforeEach(async () => {
    listeners.clear();
    exposedApi = null;
    vi.resetModules();
    await import('./index');
  });

  it('subscribes to SMTC commands and unsubscribes cleanly', () => {
    const handler = vi.fn();
    const unsubscribe = exposedApi!.smtc.onCommand(handler);
    const listener = listeners.get(IpcChannels.SmtcCommand);

    expect(listener).toBeTruthy();
    listener?.({}, 'playPause');
    expect(handler).toHaveBeenCalledWith('playPause');

    unsubscribe();
    expect(listeners.has(IpcChannels.SmtcCommand)).toBe(false);
  });
});
