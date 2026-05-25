import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AudioStatus } from '../../shared/types/audio';
import type { PluginManifest } from '../../shared/types/plugins';
import { PluginService } from './PluginService';

const mocks = vi.hoisted(() => {
  const status = {
    host: 'ready',
    state: 'stopped',
    currentTrackId: null,
    currentFilePath: null,
    durationSeconds: 0,
    positionSeconds: 0,
    volume: 1,
  };
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const fakeAudioSession = {
    getStatus: vi.fn(() => status),
    play: vi.fn(async () => ({ ...status, state: 'playing' })),
    pause: vi.fn(async () => ({ ...status, state: 'paused' })),
    stop: vi.fn(() => ({ ...status, state: 'stopped' })),
    seek: vi.fn(async (positionSeconds: number) => ({ ...status, positionSeconds })),
    on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
      const set = listeners.get(eventName) ?? new Set<(payload: unknown) => void>();
      set.add(listener);
      listeners.set(eventName, set);
      return fakeAudioSession;
    }),
    emit: vi.fn((eventName: string, payload: unknown) => {
      listeners.get(eventName)?.forEach((listener) => listener(payload));
    }),
    removeAllListeners: vi.fn(() => listeners.clear()),
  };
  return {
    fakeAudioSession,
    openPathMock: vi.fn(async () => ''),
    getSummaryMock: vi.fn(() => ({ trackCount: 42, albumCount: 3, artistCount: 2 })),
    getTracksMock: vi.fn(() => ({
      items: [{
        id: 'track-1',
        mediaType: 'local',
        path: 'D:\\Music\\Song.flac',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        coverThumb: 'echo-cover://thumb/cover-1',
        fieldSources: { title: 'embedded' },
        unavailable: false,
      }],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    })),
    getAppSettingsMock: vi.fn(() => ({ smtcEnabled: true })),
    setAppSettingsMock: vi.fn((patch: Record<string, unknown>) => ({ smtcEnabled: true, ...patch })),
    showSaveDialogMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => join(tmpdir(), 'echo-next-plugin-service-userdata'),
  },
  shell: {
    openPath: mocks.openPathMock,
  },
  dialog: {
    showSaveDialog: mocks.showSaveDialogMock,
    showOpenDialog: mocks.showOpenDialogMock,
  },
}));

vi.mock('../audio/AudioSession', () => ({
  getAudioSession: () => mocks.fakeAudioSession,
}));

vi.mock('../library/LibraryService', () => ({
  getLibraryService: () => ({
    getSummary: mocks.getSummaryMock,
    getTracks: mocks.getTracksMock,
  }),
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: mocks.getAppSettingsMock,
  setAppSettings: mocks.setAppSettingsMock,
}));

const writePlugin = (root: string, manifest: PluginManifest, script: string): void => {
  const directory = join(root, manifest.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'echo.plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, manifest.entry ?? 'plugin.js'), `${script}\n`, 'utf8');
};

describe('PluginService', () => {
  let pluginRoot: string;
  let service: PluginService;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fakeAudioSession.removeAllListeners();
    mocks.fakeAudioSession.getStatus.mockClear();
    mocks.fakeAudioSession.play.mockClear();
    mocks.fakeAudioSession.pause.mockClear();
    mocks.fakeAudioSession.stop.mockClear();
    mocks.fakeAudioSession.seek.mockClear();
    mocks.getSummaryMock.mockClear();
    mocks.getTracksMock.mockClear();
    mocks.getAppSettingsMock.mockClear();
    mocks.setAppSettingsMock.mockClear();
    mocks.openPathMock.mockClear();
    mocks.showSaveDialogMock.mockReset();
    mocks.showOpenDialogMock.mockReset();
    pluginRoot = mkdtempSync(join(tmpdir(), 'echo-next-plugin-service-'));
    service = new PluginService(pluginRoot);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('creates editable example plugins disabled by default', () => {
    const created = service.createExample('playback-panel');
    const result = service.list();

    expect(created.pluginId).toBe('echo.playback-panel');
    expect(existsSync(join(created.directory, 'echo.plugin.json'))).toBe(true);
    expect(existsSync(join(created.directory, 'plugin.js'))).toBe(true);
    expect(result.plugins[0]).toMatchObject({
      id: 'echo.playback-panel',
      enabled: false,
      status: 'disabled',
      permissions: ['playback:read'],
    });
  });

  it('requires explicit permission trust before enabling a plugin', () => {
    service.createExample('playback-panel');

    expect(() => service.enable({ pluginId: 'echo.playback-panel' })).toThrow('plugin_permission_confirmation_required');
    expect(service.list().plugins[0].enabled).toBe(false);
  });

  it('starts trusted plugins and runs registered commands through the sandbox API', async () => {
    service.createExample('playback-panel');
    service.enable({ pluginId: 'echo.playback-panel', trustedPermissions: ['playback:read'] });

    await service.runCommand({ pluginId: 'echo.playback-panel', commandId: 'show-status' });

    expect(mocks.fakeAudioSession.getStatus).toHaveBeenCalled();
    const summary = service.list().plugins[0];
    expect(summary.activity.commandRunCount).toBe(1);
    expect(summary.activity.lastCommandAt).toBeTruthy();
    expect(summary.security.sandboxedPanel).toBe(true);
    expect(service.getLogs('echo.playback-panel').some((entry) => entry.message.includes('当前播放状态'))).toBe(true);
  });

  it('throttles playback status events and writes only plugin-owned storage', async () => {
    const manifest: PluginManifest = {
      id: 'echo.status-cache',
      name: 'Status Cache',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['playback:read'],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.events.on('playback:status', async (status) => {",
      "  await echo.storage.set('lastStatus', { state: status.state, trackId: status.currentTrackId });",
      '});',
    ].join('\n'));

    service.enable({ pluginId: 'echo.status-cache', trustedPermissions: ['playback:read'] });
    mocks.fakeAudioSession.emit('status', { state: 'playing', currentTrackId: 'track-old' });
    mocks.fakeAudioSession.emit('status', { state: 'playing', currentTrackId: 'track-new' });
    await vi.advanceTimersByTimeAsync(499);
    expect(existsSync(join(pluginRoot, 'echo.status-cache', 'plugin-storage.json'))).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const storage = JSON.parse(readFileSync(join(pluginRoot, 'echo.status-cache', 'plugin-storage.json'), 'utf8')) as {
      lastStatus: { state: string; trackId: string };
    };
    expect(storage.lastStatus).toEqual({ state: 'playing', trackId: 'track-new' });
  });

  it('caps library track queries and returns only requested fields', async () => {
    const manifest: PluginManifest = {
      id: 'echo.library-reader',
      name: 'Library Reader',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['library:read'],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.commands.register('cache-tracks', async () => {",
      "  const page = await echo.library.getTracks({",
      '    pageSize: 500,',
      "    search: 'x'.repeat(140),",
      "    fields: ['id', 'title', 'fieldSources', 'unknown']",
      '  });',
      "  await echo.storage.set('tracksPage', page);",
      '});',
    ].join('\n'));

    service.enable({ pluginId: 'echo.library-reader', trustedPermissions: ['library:read'] });
    await service.runCommand({ pluginId: 'echo.library-reader', commandId: 'cache-tracks' });

    expect(mocks.getTracksMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      search: 'x'.repeat(120),
    });
    const storage = JSON.parse(readFileSync(join(pluginRoot, 'echo.library-reader', 'plugin-storage.json'), 'utf8')) as {
      tracksPage: { items: Array<Record<string, unknown>>; pageSize: number };
    };
    expect(storage.tracksPage.pageSize).toBe(100);
    expect(storage.tracksPage.items[0]).toEqual({
      id: 'track-1',
      title: 'Song',
      fieldSources: { title: 'embedded' },
    });
  });

  it('exports and imports plugin packages without runtime storage', async () => {
    service.createExample('command-tool');
    writeFileSync(join(pluginRoot, 'echo.command-tool', 'plugin-storage.json'), '{"secret":"nope"}\n', 'utf8');
    const packagePath = join(pluginRoot, 'echo.command-tool.echo-plugin.json');

    await expect(service.exportPluginPackage('echo.command-tool', packagePath)).resolves.toBe(packagePath);

    const payload = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      type: string;
      files: Array<{ path: string; content: string }>;
    };
    expect(payload.type).toBe('echo-next-plugin-package');
    expect(payload.files.map((file) => file.path)).toEqual(expect.arrayContaining(['echo.plugin.json', 'plugin.js']));
    expect(payload.files.map((file) => file.path)).not.toContain('plugin-storage.json');

    const importRoot = mkdtempSync(join(tmpdir(), 'echo-next-plugin-import-'));
    try {
      const importService = new PluginService(importRoot);
      await expect(importService.importPluginPackage(packagePath)).resolves.toMatchObject({
        pluginId: 'echo.command-tool',
        importedFileCount: 2,
      });
      expect(existsSync(join(importRoot, 'echo.command-tool', 'echo.plugin.json'))).toBe(true);
      expect(existsSync(join(importRoot, 'echo.command-tool', 'plugin.js'))).toBe(true);
      expect(existsSync(join(importRoot, 'echo.command-tool', 'plugin-storage.json'))).toBe(false);
      expect(importService.list().plugins[0]).toMatchObject({ id: 'echo.command-tool', enabled: false });
    } finally {
      rmSync(importRoot, { recursive: true, force: true });
    }
  });

  it('isolates a plugin after repeated startup crashes', async () => {
    const manifest: PluginManifest = {
      id: 'echo.crasher',
      name: 'Crasher',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: [],
    };
    writePlugin(pluginRoot, manifest, "throw new Error('boom');");
    writeFileSync(join(pluginRoot, 'plugin-state.json'), JSON.stringify({
      plugins: {
        'echo.crasher': {
          enabled: true,
          trustedPermissions: [],
          crashTimestamps: [new Date().toISOString(), new Date().toISOString()],
        },
      },
    }, null, 2), 'utf8');

    service.scheduleAutoStart();
    await vi.advanceTimersByTimeAsync(1_200);
    await Promise.resolve();

    const summary = service.list().plugins[0];
    expect(summary.enabled).toBe(false);
    expect(summary.disabledByHost).toBe(true);
    expect(summary.status).toBe('disabled');
    expect(summary.error).toContain('boom');
    expect(service.getLogs('echo.crasher').some((entry) => entry.message.includes('plugin_disabled_after_repeated_errors'))).toBe(true);
  });

  it('rejects oversized storage writes and permissionless event subscriptions', async () => {
    const manifest: PluginManifest = {
      id: 'echo.guardrails',
      name: 'Guardrails',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: [],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.commands.register('subscribe-library', () => {",
      "  echo.events.on('library:changed', () => {});",
      '});',
      "echo.commands.register('write-large', async () => {",
      "  await echo.storage.set('large', 'x'.repeat(70 * 1024));",
      '});',
    ].join('\n'));

    service.enable({ pluginId: 'echo.guardrails', trustedPermissions: [] });

    await expect(service.runCommand({ pluginId: 'echo.guardrails', commandId: 'subscribe-library' })).rejects.toThrow('plugin_permission_denied:library:read');
    await expect(service.runCommand({ pluginId: 'echo.guardrails', commandId: 'write-large' })).rejects.toThrow('plugin_storage_value_too_large');
  });

  it('rejects oversized command args and command results with stable log codes', async () => {
    const manifest: PluginManifest = {
      id: 'echo.command-limits',
      name: 'Command Limits',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: [],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.commands.register('count-args', (...args) => args.length);",
      "echo.commands.register('large-result', () => 'x'.repeat(260 * 1024));",
    ].join('\n'));

    service.enable({ pluginId: 'echo.command-limits', trustedPermissions: [] });

    await expect(service.runCommand({
      pluginId: 'echo.command-limits',
      commandId: 'count-args',
      args: ['x'.repeat(70 * 1024)],
    })).rejects.toThrow('plugin_command_args_too_large');
    await expect(service.runCommand({ pluginId: 'echo.command-limits', commandId: 'large-result' })).rejects.toThrow('plugin_command_result_too_large');

    const messages = service.getLogs('echo.command-limits').map((entry) => entry.message);
    expect(messages.some((message) => message.includes('plugin_command_args_too_large'))).toBe(true);
    expect(messages.some((message) => message.includes('plugin_command_result_too_large'))).toBe(true);
  });

  it('times out async event handlers without blocking other handlers or plugin summaries', async () => {
    const manifest: PluginManifest = {
      id: 'echo.event-timeout',
      name: 'Event Timeout',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['playback:read'],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.events.on('playback:status', () => new Promise(() => undefined));",
      "echo.events.on('playback:status', async (status) => {",
      "  await echo.storage.set('lastStatus', status.currentTrackId);",
      '});',
    ].join('\n'));

    service.enable({ pluginId: 'echo.event-timeout', trustedPermissions: ['playback:read'] });
    mocks.fakeAudioSession.emit('status', { state: 'playing', currentTrackId: 'track-timeout' });

    await vi.advanceTimersByTimeAsync(500);
    const storage = JSON.parse(readFileSync(join(pluginRoot, 'echo.event-timeout', 'plugin-storage.json'), 'utf8')) as { lastStatus: string };
    expect(storage.lastStatus).toBe('track-timeout');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(service.getLogs('echo.event-timeout').some((entry) => entry.message.includes('plugin_event_handler_timeout'))).toBe(true);
    expect(service.list().plugins[0]).toMatchObject({ id: 'echo.event-timeout', status: 'running' });
  });

  it('marks reserved and limited permissions in the security summary without adding APIs', () => {
    const manifest: PluginManifest = {
      id: 'echo.reserved-permissions',
      name: 'Reserved Permissions',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['network', 'library:write', 'fs:plugin'],
    };
    writePlugin(pluginRoot, manifest, '');

    service.enable({ pluginId: 'echo.reserved-permissions', trustedPermissions: ['network', 'library:write', 'fs:plugin'] });

    const summary = service.list().plugins[0];
    expect(summary.security.reservedPermissions).toEqual(['network', 'library:write']);
    expect(summary.security.limitedPermissions).toEqual(['fs:plugin']);
    expect(summary.security.highRiskPermissions).toEqual(['network', 'library:write']);
  });

  it('registers metadata providers and returns bounded candidates without writing library data', async () => {
    const manifest: PluginManifest = {
      id: 'echo.metadata-provider',
      name: 'Metadata Provider',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['library:read'],
      contributes: {
        metadataProviders: [{ id: 'tags', title: 'Tag Helper' }],
      },
    };
    writePlugin(pluginRoot, manifest, [
      "echo.metadata.registerProvider('tags', { title: 'Tag Helper' }, async ({ track }) => ({",
      '  candidates: [{',
      "    title: `${track.title} Remastered`,",
      "    artist: 'Plugin Artist',",
      "    album: 'Plugin Album',",
      "    genre: 'Plugin Genre',",
      '    year: 2026,',
      '    trackNo: 9999,',
      '    confidence: 2,',
      "    ignored: 'nope'",
      '  }]',
      '}));',
    ].join('\n'));

    service.enable({ pluginId: 'echo.metadata-provider', trustedPermissions: ['library:read'] });

    const result = await service.queryMetadata({ track: { id: 'track-1', title: 'Song', artist: 'Artist', duration: 180 } });

    expect(result.providers).toEqual([{ id: 'tags', title: 'Tag Helper', pluginId: 'echo.metadata-provider' }]);
    expect(result.candidates).toEqual([{
      title: 'Song Remastered',
      artist: 'Plugin Artist',
      album: 'Plugin Album',
      genre: 'Plugin Genre',
      year: 2026,
      trackNo: 999,
      confidence: 1,
      pluginId: 'echo.metadata-provider',
      providerId: 'tags',
    }]);
    const summary = service.list().plugins[0];
    expect(summary.security.metadataProviderCount).toBe(1);
    expect(summary.metadataProviders).toEqual([{ id: 'tags', title: 'Tag Helper', pluginId: 'echo.metadata-provider' }]);
    expect(mocks.getTracksMock).not.toHaveBeenCalled();
  });

  it('can query one metadata provider without invoking the others', async () => {
    const manifest: PluginManifest = {
      id: 'echo.metadata-filter',
      name: 'Metadata Filter',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['library:read'],
    };
    writePlugin(pluginRoot, manifest, [
      "echo.metadata.registerProvider('first', () => ({ candidates: [{ title: 'First' }] }));",
      "echo.metadata.registerProvider('second', () => { throw new Error('second should not run'); });",
    ].join('\n'));

    service.enable({ pluginId: 'echo.metadata-filter', trustedPermissions: ['library:read'] });

    await expect(service.queryMetadata({
      track: { title: 'Song' },
      provider: { pluginId: 'echo.metadata-filter', providerId: 'first' },
    })).resolves.toMatchObject({
      providers: [{ id: 'first', title: 'first', pluginId: 'echo.metadata-filter' }],
      candidates: [{ title: 'First', pluginId: 'echo.metadata-filter', providerId: 'first' }],
    });
    expect(service.getLogs('echo.metadata-filter').some((entry) => entry.message.includes('second should not run'))).toBe(false);
  });

  it('requires library read permission and logs metadata provider timeout failures', async () => {
    const noPermissionManifest: PluginManifest = {
      id: 'echo.metadata-denied',
      name: 'Metadata Denied',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: [],
    };
    writePlugin(pluginRoot, noPermissionManifest, [
      "echo.metadata.registerProvider('denied', () => ({ candidates: [{ title: 'Nope' }] }));",
    ].join('\n'));

    service.enable({ pluginId: 'echo.metadata-denied', trustedPermissions: [] });
    await expect(service.queryMetadata({ track: { title: 'Song' } })).resolves.toEqual({ providers: [], candidates: [] });
    expect(service.getLogs('echo.metadata-denied').some((entry) => entry.message.includes('plugin_permission_denied:library:read'))).toBe(true);

    const timeoutManifest: PluginManifest = {
      id: 'echo.metadata-timeout',
      name: 'Metadata Timeout',
      version: '0.0.1',
      apiVersion: 1,
      entry: 'plugin.js',
      permissions: ['library:read'],
    };
    writePlugin(pluginRoot, timeoutManifest, [
      "echo.metadata.registerProvider('slow', () => new Promise(() => undefined));",
    ].join('\n'));
    service.enable({ pluginId: 'echo.metadata-timeout', trustedPermissions: ['library:read'] });

    const resultPromise = service.queryMetadata({ track: { title: 'Song' } });
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(resultPromise).resolves.toMatchObject({
      providers: [{ id: 'slow', title: 'slow', pluginId: 'echo.metadata-timeout' }],
      candidates: [],
    });
    expect(service.getLogs('echo.metadata-timeout').some((entry) => entry.message.includes('plugin_metadata_provider_timeout'))).toBe(true);
  });
});
