import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../shared/constants/ipcChannels';
import type { EchoApi } from './apiTypes';
import { ipcRenderer } from 'electron';

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

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.LibraryClassifyImportPaths, ['D:\\Music']);
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

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppGetUpdateStatus);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppCheckForUpdates);
    expect(handler).toHaveBeenCalledWith(status);
    expect(listeners.has(IpcChannels.AppUpdateStatusChanged)).toBe(false);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AppOpenRepository);
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

  it('exposes account status APIs without cookie readback helpers', async () => {
    await exposedApi!.accounts.saveCookie('netease', 'MUSIC_U=secret');
    await exposedApi!.accounts.startLogin?.('netease');
    await exposedApi!.accounts.getStatuses();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountSaveCookie, 'netease', 'MUSIC_U=secret');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountStartLogin, 'netease');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannels.AccountGetStatuses);
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
