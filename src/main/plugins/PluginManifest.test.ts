import { describe, expect, it } from 'vitest';
import { normalizePluginManifest } from './PluginManifest';

describe('plugin manifest validation', () => {
  it('normalizes a valid editable local plugin manifest', () => {
    const manifest = normalizePluginManifest({
      id: 'Echo.Tools',
      name: '工具插件',
      version: '1.0.0',
      apiVersion: 1,
      entry: 'plugin.js',
      panel: 'panel.html',
      permissions: ['playback:read', 'network', 'network', 'unknown'],
      contributes: {
        commands: [{ id: 'Show_Status', title: '显示状态', description: '读取当前播放状态' }],
        panels: [{ id: 'Main', title: '主面板', path: 'panel.html' }],
        metadataProviders: [{ id: 'Online_Tags', title: '在线标签', description: '补充曲目信息' }],
        settings: [{ id: 'Mode', title: '模式' }],
      },
    }, 'echo.tools');

    expect(manifest).toMatchObject({
      id: 'echo.tools',
      entry: 'plugin.js',
      panel: 'panel.html',
      permissions: ['playback:read', 'network'],
    });
    expect(manifest.contributes?.commands?.[0]).toMatchObject({ id: 'show_status', title: '显示状态' });
    expect(manifest.contributes?.panels?.[0]).toMatchObject({ id: 'main', path: 'panel.html' });
    expect(manifest.contributes?.metadataProviders?.[0]).toMatchObject({ id: 'online_tags', title: '在线标签' });
    expect(manifest.contributes?.settings?.[0]).toMatchObject({ id: 'mode', title: '模式' });
  });

  it('rejects paths outside the plugin folder and unsupported entry types', () => {
    expect(() =>
      normalizePluginManifest({
        id: 'echo.bad',
        name: 'Bad',
        version: '1.0.0',
        apiVersion: 1,
        entry: '../plugin.js',
      }),
    ).toThrow('entry must be a file name inside the plugin folder');

    expect(() =>
      normalizePluginManifest({
        id: 'echo.bad',
        name: 'Bad',
        version: '1.0.0',
        apiVersion: 1,
        entry: 'plugin.ts',
      }),
    ).toThrow('entry must be a .js file');
  });

  it('marks invalid plugin ids and api versions as unusable instead of guessing', () => {
    expect(() =>
      normalizePluginManifest({
        id: 'ECHO Plugin!',
        name: 'Bad',
        version: '1.0.0',
        apiVersion: 1,
      }),
    ).toThrow('id must use lowercase letters');

    expect(() =>
      normalizePluginManifest({
        id: 'echo.future',
        name: 'Future',
        version: '1.0.0',
        apiVersion: 999,
      }),
    ).toThrow('apiVersion must be between 1 and 1');
  });
});
