import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../shared/constants/ipcChannels';
import type { EchoApi } from './apiTypes';
import { ipcRenderer } from 'electron';

const listeners = new Map<string, (...args: unknown[]) => void>();
let exposedApi: EchoApi | null = null;
let fakeAudioInstances: FakeAudio[] = [];
let queuedAudioPlayFailures: Error[] = [];

const createTestLocalStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, String(value))),
  };
};

class FakeAudio {
  preload = '';
  src = '';
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  duration = 12;
  networkState = 1;
  readyState = 0;
  error: MediaError | null = null;
  readonly play = vi.fn(async () => {
    const failure = queuedAudioPlayFailures.shift();
    if (failure) {
      throw failure;
    }
    this.emit('playing');
  });
  readonly pause = vi.fn(() => {
    this.emit('pause');
  });
  readonly load = vi.fn(() => {
    this.emit('loadstart');
    this.emit('loadedmetadata');
  });
  private readonly eventListeners = new Map<string, Set<() => void>>();

  constructor() {
    fakeAudioInstances.push(this);
  }

  addEventListener(event: string, listener: () => void): void {
    const listenersForEvent = this.eventListeners.get(event) ?? new Set<() => void>();
    listenersForEvent.add(listener);
    this.eventListeners.set(event, listenersForEvent);
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = '';
    }
  }

  triggerError(message = 'system_audio_playback_failed', code = 4): void {
    this.error = { code, message } as MediaError;
    this.networkState = 3;
    this.emit('error');
  }

  emit(event: string): void {
    this.eventListeners.get(event)?.forEach((listener) => listener());
  }
}

const flushPromises = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
};

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
    fakeAudioInstances = [];
    queuedAudioPlayFailures = [];
    exposedApi = null;
    vi.stubGlobal('window', {
      localStorage: createTestLocalStorage(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    window.localStorage.clear();
    vi.stubGlobal('Audio', FakeAudio);
    vi.mocked(ipcRenderer.invoke).mockReset();
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

  it('subscribes to audio status updates and unsubscribes cleanly', () => {
    const handler = vi.fn();
    const unsubscribe = exposedApi!.audio.onStatus(handler);
    const listener = listeners.get(IpcChannels.AudioStatus);
    const status = { state: 'ended', currentTrackId: 'track-1' };

    expect(listener).toBeTruthy();
    listener?.({}, status);
    expect(handler).toHaveBeenCalledWith(status);

    unsubscribe();
    expect(listeners.has(IpcChannels.AudioStatus)).toBe(false);
  });

  it('exposes audio diagnostics through IPC', async () => {
    await exposedApi!.audio.getDiagnostics();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioGetDiagnostics);
  });

  it('exposes audio engine reset through IPC', async () => {
    await exposedApi!.audio.resetEngine();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioResetEngine);
  });

  it('exposes audio force restart and Windows audio service restart through IPC', async () => {
    await exposedApi!.audio.forceRestart('settings');
    await exposedApi!.audio.restartWindowsAudioService();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioForceRestart, 'settings');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioRestartWindowsAudioService);
  });

  it('subscribes to audio session reset events and unsubscribes cleanly', () => {
    const handler = vi.fn();
    const unsubscribe = exposedApi!.audio.onSessionReset(handler);
    const listener = listeners.get(IpcChannels.AudioSessionReset);
    const event = { reason: 'force-restart', status: { state: 'stopped' } };

    expect(listener).toBeTruthy();
    listener?.({}, event);
    expect(handler).toHaveBeenCalledWith(event);

    unsubscribe();
    expect(listeners.has(IpcChannels.AudioSessionReset)).toBe(false);
  });

  it('exposes crash report file opening through IPC', async () => {
    await exposedApi!.diagnostics.openCrashReport();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.DiagnosticsOpenCrashReport);
  });

  it('exposes audio crash report file opening through IPC', async () => {
    await exposedApi!.diagnostics.openAudioCrashReport();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.DiagnosticsOpenAudioCrashReport);
  });

  it('exposes the dropped import path classifier', async () => {
    await exposedApi!.library.classifyImportPaths(['D:\\Music']);
    await exposedApi!.library.resolveLyricsBackgroundCover('track-1');
    await exposedApi!.library.getLibraryInboxBatches();
    await exposedApi!.library.getLibraryInboxTracks({ scope: 'latest', filter: 'all' });
    await exposedApi!.library.createPlaylistFromLibraryInbox({ scope: 'latest', filter: 'missing_cover' });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryClassifyImportPaths, ['D:\\Music']);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryResolveLyricsBackgroundCover, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryGetInboxBatches);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryGetInboxTracks, { scope: 'latest', filter: 'all' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryCreateInboxPlaylist, { scope: 'latest', filter: 'missing_cover' });
  });

  it('serializes dropped files for library import', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'song.flac', { type: 'audio/flac' });
    await exposedApi!.library.importDroppedFiles([file]);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.LibraryImportDroppedFiles,
      [{ name: 'song.flac', type: 'audio/flac', bytes: new Uint8Array([1, 2, 3]) }],
    );
  });

  it('exposes local audio file opening helpers through IPC', async () => {
    await exposedApi!.playback.openLocalAudioFiles();
    await exposedApi!.playback.resolveLocalAudioFiles(['D:\\Music\\song.flac']);
    await exposedApi!.library.openPathInFolder('D:\\Music\\song.flac');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PlaybackOpenLocalAudioFiles);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PlaybackResolveLocalAudioFiles, ['D:\\Music\\song.flac']);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryOpenPathInFolder, 'D:\\Music\\song.flac');
  });

  it('routes remembered system audio playback through HTMLAudio instead of native IPC', async () => {
    vi.resetModules();
    exposedApi = null;
    fakeAudioInstances = [];
    window.localStorage.setItem('echo-next.audio-output-memory', JSON.stringify({ enabled: true, outputMode: 'system' }));
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === IpcChannels.AudioCreateSystemStreamUrl) {
        return Promise.resolve('echo-audio://system/test-token');
      }
      return Promise.resolve(null);
    });
    await import('./index');

    const status = await exposedApi!.playback.playLocalFile({
      filePath: 'D:\\Music\\song.mp3',
      trackId: 'track-1',
      probe: { durationSeconds: 10 },
    });

    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(
      IpcChannels.PlaybackPlayLocalFile,
      expect.anything(),
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioCreateSystemStreamUrl, {
      url: 'D:\\Music\\song.mp3',
      headers: undefined,
      mimeType: null,
    });
    expect(fakeAudioInstances).toHaveLength(1);
    expect(fakeAudioInstances[0].src).toBe('echo-audio://system/test-token');
    expect(fakeAudioInstances[0].play).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      state: 'playing',
      currentTrackId: 'track-1',
      durationMs: 12_000,
      filePath: 'D:\\Music\\song.mp3',
    });
  });

  it('applies ReplayGain on remembered system audio playback', async () => {
    vi.resetModules();
    exposedApi = null;
    fakeAudioInstances = [];
    window.localStorage.setItem('echo-next.audio-output-memory', JSON.stringify({ enabled: true, outputMode: 'system' }));
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === IpcChannels.AppGetSettings) {
        return Promise.resolve({
          replayGainEnabled: true,
          replayGainMode: 'track',
          replayGainPreampDb: 0,
          replayGainPreventClipping: true,
        });
      }
      if (channel === IpcChannels.AudioCreateSystemStreamUrl) {
        return Promise.resolve('echo-audio://system/replaygain-token');
      }
      return Promise.resolve(null);
    });
    await import('./index');

    await exposedApi!.playback.playLocalFile({
      filePath: 'D:\\Music\\song.mp3',
      trackId: 'track-rg',
      probe: { durationSeconds: 10 },
      replayGain: { trackGainDb: -6, trackPeak: 0.8 },
    });

    expect(fakeAudioInstances[0].volume).toBeCloseTo(0.501, 3);
    await expect(exposedApi!.audio.getStatus()).resolves.toMatchObject({
      outputMode: 'system',
      replayGainEnabled: true,
      replayGainMode: 'track',
      replayGainAppliedDb: -6,
    });
  });

  it('refreshes a system media source after the initial HTMLAudio play fails', async () => {
    vi.resetModules();
    exposedApi = null;
    fakeAudioInstances = [];
    queuedAudioPlayFailures = [new Error('expired stream')];
    window.localStorage.setItem('echo-next.audio-output-memory', JSON.stringify({ enabled: true, outputMode: 'system' }));
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string, request?: unknown) => {
      if (channel === IpcChannels.PlaybackResolveMediaItem) {
        const playbackRequest = request as { forceRefresh?: boolean };
        return Promise.resolve(
          playbackRequest.forceRefresh
            ? {
                filePath: 'https://cdn.example.test/refreshed.mp3',
                inputHeaders: { Referer: 'https://music.example.test/' },
                mimeType: 'audio/mpeg',
                durationSeconds: 180,
              }
            : {
                filePath: 'https://cdn.example.test/expired.flac',
                inputHeaders: { Referer: 'https://music.example.test/' },
                mimeType: 'audio/flac',
                durationSeconds: 180,
              },
        );
      }
      if (channel === IpcChannels.AudioCreateSystemStreamUrl) {
        const streamRequest = request as { url: string };
        return Promise.resolve(streamRequest.url.includes('refreshed') ? 'echo-audio://system/fresh' : 'echo-audio://system/stale');
      }
      if (channel === IpcChannels.AudioReportSystemPlaybackError) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(null);
    });
    await import('./index');

    const status = await exposedApi!.playback.playMediaItem({
      item: {
        mediaType: 'streaming',
        trackId: 'streaming-track',
        provider: 'netease',
        providerTrackId: 'provider-track',
        quality: 'high',
        stableKey: 'netease:provider-track',
        title: 'Streaming',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        coverThumb: null,
        playable: true,
      },
    });

    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(IpcChannels.PlaybackPlayMediaItem, expect.anything());
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.PlaybackResolveMediaItem,
      expect.objectContaining({ forceRefresh: true }),
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioCreateSystemStreamUrl, {
      url: 'https://cdn.example.test/expired.flac',
      headers: { Referer: 'https://music.example.test/' },
      mimeType: 'audio/flac',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AudioCreateSystemStreamUrl, {
      url: 'https://cdn.example.test/refreshed.mp3',
      headers: { Referer: 'https://music.example.test/' },
      mimeType: 'audio/mpeg',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.AudioReportSystemPlaybackError,
      expect.objectContaining({
        phase: 'system-audio-htmlaudio-error',
        recovered: true,
        mediaType: 'streaming',
        provider: 'netease',
      }),
    );
    expect(fakeAudioInstances[0].play).toHaveBeenCalledTimes(2);
    expect(fakeAudioInstances[0].src).toBe('echo-audio://system/fresh');
    expect(status.filePath).toBe('https://cdn.example.test/refreshed.mp3');
  });

  it('recovers an asynchronous HTMLAudio error without leaving system output mode', async () => {
    vi.resetModules();
    exposedApi = null;
    fakeAudioInstances = [];
    window.localStorage.setItem('echo-next.audio-output-memory', JSON.stringify({ enabled: true, outputMode: 'system' }));
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel: string, request?: unknown) => {
      if (channel === IpcChannels.PlaybackResolveMediaItem) {
        const playbackRequest = request as { forceRefresh?: boolean };
        return Promise.resolve(
          playbackRequest.forceRefresh
            ? {
                filePath: 'https://cdn.example.test/recovered.mp3',
                inputHeaders: undefined,
                mimeType: 'audio/mpeg',
                durationSeconds: 90,
              }
            : {
                filePath: 'https://cdn.example.test/initial.mp3',
                inputHeaders: undefined,
                mimeType: 'audio/mpeg',
                durationSeconds: 90,
              },
        );
      }
      if (channel === IpcChannels.AudioCreateSystemStreamUrl) {
        const streamRequest = request as { url: string };
        return Promise.resolve(streamRequest.url.includes('recovered') ? 'echo-audio://system/recovered' : 'echo-audio://system/initial');
      }
      if (channel === IpcChannels.AudioReportSystemPlaybackError) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(null);
    });
    await import('./index');

    await exposedApi!.playback.playMediaItem({
      item: {
        mediaType: 'streaming',
        trackId: 'streaming-track',
        provider: 'soundcloud',
        providerTrackId: 'provider-track',
        stableKey: 'soundcloud:provider-track',
        title: 'Streaming',
        artist: 'Artist',
        album: 'Album',
        duration: 90,
        coverThumb: null,
        playable: true,
      },
    });

    fakeAudioInstances[0].currentTime = 12;
    fakeAudioInstances[0].triggerError('media element decode failed', 3);
    await flushPromises();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.PlaybackResolveMediaItem,
      expect.objectContaining({ forceRefresh: true, startSeconds: 12 }),
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      IpcChannels.AudioReportSystemPlaybackError,
      expect.objectContaining({
        phase: 'system-audio-htmlaudio-error',
        recovered: true,
        mediaType: 'streaming',
        provider: 'soundcloud',
        htmlAudio: expect.objectContaining({
          errorCode: 3,
          errorMessage: 'media element decode failed',
        }),
      }),
    );
    expect(fakeAudioInstances[0].play).toHaveBeenCalledTimes(2);
    expect(fakeAudioInstances[0].src).toBe('echo-audio://system/recovered');
    await expect(exposedApi!.audio.getStatus()).resolves.toMatchObject({
      outputMode: 'system',
      state: 'playing',
      currentTrackId: 'streaming-track',
    });
  });

  it('subscribes to system local audio file open events and unsubscribes cleanly', () => {
    const handler = vi.fn();
    const listener = listeners.get(IpcChannels.PlaybackLocalAudioFilesOpened);

    expect(listener).toBeTruthy();
    listener?.({}, ['D:\\Music\\queued-before-subscribe.flac']);
    const unsubscribe = exposedApi!.playback.onLocalAudioFilesOpened(handler);
    expect(handler).toHaveBeenCalledWith(['D:\\Music\\queued-before-subscribe.flac']);

    listener?.({}, ['D:\\Music\\song.flac', 12, 'D:\\Music\\two.opus']);
    expect(handler).toHaveBeenCalledWith(['D:\\Music\\song.flac', 'D:\\Music\\two.opus']);

    unsubscribe();
    listener?.({}, ['D:\\Music\\after-unsubscribe.flac']);
    expect(handler).not.toHaveBeenCalledWith(['D:\\Music\\after-unsubscribe.flac']);
  });

  it('exposes lyrics wallpaper picker through IPC', async () => {
    await exposedApi!.app.chooseLyricsWallpaper();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppChooseLyricsWallpaper);
  });

  it('exposes app wallpaper picker through IPC', async () => {
    await exposedApi!.app.chooseAppWallpaper();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppChooseAppWallpaper);
  });

  it('exposes app update helpers through IPC', async () => {
    const handler = vi.fn();
    await exposedApi!.app.getUpdateStatus();
    await exposedApi!.app.checkForUpdates();
    const unsubscribe = exposedApi!.app.onUpdateStatus(handler);
    const listener = listeners.get(IpcChannels.AppUpdateStatusChanged);
    const status = { state: 'downloading', downloadPercent: 42 };
    listener?.({}, status);
    unsubscribe();
    await exposedApi!.app.openRepository();
    await exposedApi!.app.openExternalUrl('https://discord.gg/g7v4WMRq3K');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppGetUpdateStatus);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppCheckForUpdates);
    expect(handler).toHaveBeenCalledWith(status);
    expect(listeners.has(IpcChannels.AppUpdateStatusChanged)).toBe(false);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppOpenRepository);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppOpenExternalUrl, 'https://discord.gg/g7v4WMRq3K');
  });

  it('exposes global shortcut validation and command events', async () => {
    const handler = vi.fn();
    await exposedApi!.app.validateGlobalShortcut('Ctrl+Alt+Space');
    const unsubscribe = exposedApi!.app.onGlobalShortcutCommand(handler);
    const listener = listeners.get(IpcChannels.AppGlobalShortcutCommand);

    listener?.({}, 'playPause');
    unsubscribe();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppValidateGlobalShortcut, 'Ctrl+Alt+Space');
    expect(handler).toHaveBeenCalledWith('playPause');
    expect(listeners.has(IpcChannels.AppGlobalShortcutCommand)).toBe(false);
  });

  it('exposes duplicate track APIs through IPC', async () => {
    await exposedApi!.library.refreshDuplicateTracks('strict');
    await exposedApi!.library.getDuplicateTrackVersions('track-1');
    await exposedApi!.library.getDuplicateHiddenCounts(['track-1'], 'strict');
    await exposedApi!.library.getDuplicateIndexSummary('strict');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryRefreshDuplicateTracks, 'strict');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryGetDuplicateTrackVersions, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryGetDuplicateHiddenCounts, ['track-1'], 'strict');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryGetDuplicateIndexSummary, 'strict');
  });

  it('exposes database recovery discard action through IPC', async () => {
    await exposedApi!.library.discardQuarantinedProblemTracks();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryDiscardQuarantinedProblemTracks);
  });

  it('exposes plugin management APIs through IPC', async () => {
    await exposedApi!.plugins.list();
    await exposedApi!.plugins.createExample('playback-panel');
    await exposedApi!.plugins.enable({ pluginId: 'echo.playback-panel', trustedPermissions: ['playback:read'] });
    await exposedApi!.plugins.disable('echo.playback-panel');
    await exposedApi!.plugins.reload('echo.playback-panel');
    await exposedApi!.plugins.openDirectory('echo.playback-panel');
    await exposedApi!.plugins.runCommand({ pluginId: 'echo.playback-panel', commandId: 'show-status' });
    await exposedApi!.plugins.getLogs('echo.playback-panel');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsList);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsCreateExample, 'playback-panel');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsEnable, {
      pluginId: 'echo.playback-panel',
      trustedPermissions: ['playback:read'],
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsDisable, 'echo.playback-panel');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsReload, 'echo.playback-panel');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsOpenDirectory, 'echo.playback-panel');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsRunCommand, {
      pluginId: 'echo.playback-panel',
      commandId: 'show-status',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.PluginsGetLogs, 'echo.playback-panel');
  });

  it('exposes account status APIs without cookie readback helpers', async () => {
    const handler = vi.fn();
    await exposedApi!.accounts.saveCookie('netease', 'MUSIC_U=secret');
    await exposedApi!.accounts.startLogin?.('netease');
    await exposedApi!.accounts.getStatuses();
    const unsubscribe = exposedApi!.accounts.onStatusesChanged(handler);
    const listener = listeners.get(IpcChannels.AccountStatusesChanged);
    const statuses = [{ provider: 'bilibili', connected: false, error: 'expired' }];
    listener?.({}, statuses);
    unsubscribe();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountSaveCookie, 'netease', 'MUSIC_U=secret');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountStartLogin, 'netease');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountGetStatuses);
    expect(handler).toHaveBeenCalledWith(statuses);
    expect(listeners.has(IpcChannels.AccountStatusesChanged)).toBe(false);
    expect(Object.keys(exposedApi!.accounts)).not.toContain('getCookie');
  });

  it('exposes lyrics APIs through IPC', async () => {
    await exposedApi!.lyrics.getForTrack('track-1');
    await exposedApi!.lyrics.searchCandidates('track-1');
    await exposedApi!.lyrics.applyCandidate('track-1', 'candidate-1');
    await exposedApi!.lyrics.applyCustomLrc?.('track-1', '[00:01.00]Line', 'custom.lrc');
    await exposedApi!.lyrics.markInstrumental('track-1');
    await exposedApi!.lyrics.rejectCandidate('candidate-1');
    await exposedApi!.lyrics.setOffset('track-1', 500);
    await exposedApi!.lyrics.clearCache('track-1');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsGetForTrack, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsSearchCandidates, 'track-1', undefined, undefined);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsApplyCandidate, 'track-1', 'candidate-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsApplyCustomLrc, 'track-1', '[00:01.00]Line', 'custom.lrc');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsMarkInstrumental, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsRejectCandidate, 'candidate-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsSetOffset, 'track-1', 500);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LyricsClearCache, 'track-1');
  });

  it('exposes MV APIs through IPC', async () => {
    await exposedApi!.mv.getSelected('track-1');
    await exposedApi!.mv.getSettings();
    await exposedApi!.mv.setSettings({ maxQuality: '2160p' });
    await exposedApi!.mv.findLocalCandidates('track-1');
    await exposedApi!.mv.searchNetworkCandidates('track-1');
    await exposedApi!.mv.getTemporaryPlayableForSnapshot({
      trackId: 'track-1',
      title: 'Song',
      artist: 'Artist',
      mediaType: 'local',
    });
    await exposedApi!.mv.getCandidates('track-1');
    await exposedApi!.mv.resolveStreams('video-1');
    await exposedApi!.mv.setQuality('video-1', 'auto');
    await exposedApi!.mv.setOffset('track-1', 250);
    await exposedApi!.mv.chooseLocalVideo('track-1');
    await exposedApi!.mv.bindLocalVideo('track-1', 'D:\\Music\\Song.mp4');
    await exposedApi!.mv.bindUrl('track-1', 'https://www.bilibili.com/video/BV1ECHO');
    await exposedApi!.mv.selectVideo('track-1', 'video-1');
    await exposedApi!.mv.clearSelected('track-1');
    await exposedApi!.mv.openExternal('video-1');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvGetSelected, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvGetSettings);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvSetSettings, { maxQuality: '2160p' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvFindLocalCandidates, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvSearchNetworkCandidates, 'track-1', undefined);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvGetTemporaryPlayableForSnapshot, {
      trackId: 'track-1',
      title: 'Song',
      artist: 'Artist',
      mediaType: 'local',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvGetCandidates, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvResolveStreams, 'video-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvSetQuality, 'video-1', 'auto');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvSetOffset, 'track-1', 250);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvChooseLocalVideo, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvBindLocalVideo, 'track-1', 'D:\\Music\\Song.mp4');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvBindUrl, 'track-1', 'https://www.bilibili.com/video/BV1ECHO');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvSelectVideo, 'track-1', 'video-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvClearSelected, 'track-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.MvOpenExternal, 'video-1');
  });
});
