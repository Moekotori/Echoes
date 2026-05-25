# ECHO Next 插件系统 v1

ECHO Next v1 插件系统面向本地可编辑插件。插件放在用户数据目录的 `plugins/` 下，默认禁用，用户确认权限后才运行。插件能力通过受控 API 进入主程序，不直接接触 Electron、SQLite、主应用 DOM、原生音频 host、解码器、DSP 或输出热路径。

## 目录结构

每个插件是一个独立文件夹：

```text
plugins/
  echo.playback-panel/
    echo.plugin.json
    plugin.js
    panel.html
    plugin-storage.json
```

`plugin-storage.json` 由插件 API 写入，用来保存这个插件自己的数据。用户可以直接编辑 `echo.plugin.json`、`plugin.js`、`panel.html`，编辑后在插件页点击“重载”。

如果希望编辑器有类型提示，可以在插件目录放一个 `jsconfig.json`，并引用仓库里的 SDK 类型：

```json
{
  "compilerOptions": {
    "checkJs": true,
    "types": ["./echo-plugin"]
  }
}
```

然后把 `docs/plugin-sdk/echo-plugin.d.ts` 复制到插件目录，或在编辑器里指向这个文件。

## echo.plugin.json

最小 manifest：

```json
{
  "id": "echo.my-plugin",
  "name": "我的插件",
  "version": "0.0.1",
  "apiVersion": 1,
  "entry": "plugin.js",
  "panel": "panel.html",
  "permissions": ["playback:read"],
  "contributes": {
    "commands": [
      { "id": "show-status", "title": "显示播放状态" }
    ],
    "metadataProviders": [
      { "id": "tags", "title": "标签补全" }
    ],
    "panels": [
      { "id": "main", "title": "插件面板", "path": "panel.html" }
    ]
  }
}
```

字段说明：

- `id`：小写字母、数字、点、短横线或下划线，作为插件唯一标识。
- `name` / `version`：显示名称和版本。
- `apiVersion`：当前为 `1`。
- `entry`：插件脚本文件名，必须是插件目录内的 `.js` 文件。
- `panel`：可选面板文件名，当前作为 sandbox iframe 预览。
- `permissions`：插件请求的权限，启用时由用户确认。
- `contributes.commands`：插件声明或运行时注册的命令。
- `contributes.metadataProviders`：插件声明的元数据候选来源。v1 只返回候选，不自动写库。
- `contributes.panels`：插件声明的面板入口。

## 权限

当前权限列表：

- `playback:read`：读取播放状态。已开放。
- `playback:control`：控制播放、暂停、停止、跳转。已开放。
- `library:read`：分页读取曲库摘要和公开曲目字段。已开放。
- `settings:read`：读取应用设置快照。已开放。
- `settings:write`：写入小型设置 patch。高风险，插件不应该写整份 settings。
- `library:write`：预留给未来曲库写入能力。v1 不提供实际写入 API。
- `network`：预留给未来网络访问能力。v1 不提供实际网络 API。
- `fs:plugin`：受限能力。v1 只通过 `echo.storage` 读写插件自身存储，不开放任意文件 API。

插件默认禁用。缺少已信任权限时，API 会拒绝调用。即使用户信任了预留权限，v1 也不会因此开放 Node、Electron、SQLite、主界面 DOM 或音频热路径。

## 公开 API

`plugin.js` 中可以使用全局 `echo` 对象。API 都是异步或可安全序列化的调用。

```js
echo.events.on('playback:status', async (status) => {
  await echo.storage.set('lastStatus', {
    state: status.state,
    trackId: status.currentTrackId
  });
});

echo.commands.register('show-status', { title: '显示播放状态' }, async () => {
  const status = await echo.playback.getStatus();
  await echo.ui.notify(`当前播放状态：${status.state}`);
});
```

可用分组：

- `echo.events.on(eventName, handler)`：监听宿主事件。当前常用事件是 `playback:status`，播放状态最多 2Hz 合并推送。
- `echo.commands.register(commandId, options, handler)`：注册插件命令。命令有超时和 payload 大小保护，失败会记录日志。
- `echo.metadata.registerProvider(providerId, options, handler)`：注册元数据 provider。需要 `library:read`，只返回候选，不直接写曲库。
- `echo.playback.getStatus()`：需要 `playback:read`。
- `echo.playback.play()` / `pause()` / `stop()` / `seek(seconds)`：需要 `playback:control`。
- `echo.library.getSummary()` / `getTracks(query)`：需要 `library:read`。`getTracks` 默认返回轻量字段，单页最大 100 首。
- `echo.settings.get()` / `set(patch)`：分别需要 `settings:read` / `settings:write`。`set` 只适合小 patch。
- `echo.storage.get(key)` / `set(key, value)`：读写插件自己的存储。
- `echo.ui.notify(message)`：写入插件日志。

## 事件

当前事件白名单：

- `playback:status`：需要 `playback:read`。最多 2Hz 合并推送，payload 是当前播放状态。
- `library:changed`：需要 `library:read`。曲库发生变化时推送，payload 不保证稳定，插件应只把它当成刷新信号。

未知事件会被拒绝，避免插件注册大量无效监听。

## 曲库查询

`echo.library.getTracks(query)` 会先被宿主收紧，再进入曲库服务：

```js
const page = await echo.library.getTracks({
  page: 1,
  pageSize: 50,
  search: 'artist or title',
  sort: 'recent',
  sourceProvider: 'local',
  fields: ['id', 'title', 'artist', 'album', 'duration', 'coverThumb']
});
```

限制：

- `pageSize` 最大 100，默认 50。
- `search` 最大 120 个字符。
- `fields` 只能选择公开字段；不传时返回 `id`、`mediaType`、`path`、`title`、`artist`、`album`、`duration`、`coverThumb`、`unavailable`。
- 不要一次性拉完整曲库；批量脚本应分页处理，并在每页之间让出事件循环。

## Metadata Provider

Metadata Provider 是 v1 的第一个受控扩展点。它让插件根据宿主传入的轻量曲目信息返回候选 metadata，由宿主决定是否展示、合并或写入。插件不能直接改曲库。
当前宿主只在用户手动触发时查询候选，例如标签编辑器的“插件候选”按钮；候选进入表单后仍需要用户保存才会写入。

```js
echo.metadata.registerProvider('tags', { title: '标签补全' }, async ({ track }) => ({
  candidates: [{
    title: track.title,
    artist: track.artist,
    album: 'Album Name',
    genre: 'Rock',
    year: 2026,
    confidence: 0.8,
    source: 'My Provider'
  }]
}));
```

限制：

- 注册 provider 需要 `library:read`。
- 单插件最多注册 8 个 metadata provider。
- 单个 provider 最多返回 5 个候选。
- provider 超过 2.5 秒会记录 `plugin_metadata_provider_timeout`。
- 单次请求最大 32 KB，单个 provider 返回值最大 64 KB。
- 候选只允许文本和少量数字字段：`title`、`artist`、`album`、`albumArtist`、`genre`、`year`、`trackNo`、`discNo`、`bpm`、`confidence`、`source`、`sourceUrl`。
- 宿主可以传入 `provider: { pluginId, providerId }` 只查询一个来源；插件侧只需要处理 `track`。
- 不返回封面二进制、不写入源文件、不直接改 SQLite。

## 配额和保护

- 插件启动脚本同步执行最多 1 秒。
- 插件命令默认 2 秒超时。
- 插件命令 `args` 最大 64 KB。
- 插件命令返回值最大 256 KB。
- 异步事件 handler 超过 2 秒会记录 `plugin_event_handler_timeout`。同步死循环仍无法被 Promise 超时打断，插件代码必须避免重 CPU 同步任务。
- 单个事件类型最多注册 24 个 handler。
- 单插件最多注册 8 个 metadata provider，单 provider 每次最多返回 5 个候选。
- 单条日志最多保留 1000 个字符，宿主最多保留最近 160 条日志。
- 单个 storage value 最大 64 KB，单插件 storage 总量最大 256 KB。
- `settings.set(patch)` payload 最大 32 KB。

## 示例模板

插件页可以创建三类示例：

- 播放状态小面板：监听播放状态，并把最近状态写入插件存储。
- 命令工具：注册一个手动执行的命令。
- 曲库批量整理脚本：读取曲库摘要，作为整理脚本起点。

这些模板只使用公开 API。推荐先复制模板，再逐步改 `plugin.js`。

## 启用、重载和日志

1. 打开“插件”页。
2. 新建示例插件，或把插件文件夹放进 `plugins/`。
3. 点击“刷新”扫描 manifest。
4. 点击“启用”，确认权限。
5. 修改 `plugin.js` 或 `panel.html` 后点击“重载”。
6. 出错时查看插件日志；坏插件只会标红或禁用，不应影响主程序启动。

## 导入、导出和可见性

- 插件页可以导出 `.echo-plugin.json` 插件包。导出只包含 manifest 和根目录下允许的源码、面板、文档文件，不包含 `plugin-storage.json`、启停状态或用户运行数据。
- 导入插件包会创建新的插件目录；如果目标插件 id 已存在，会拒绝覆盖，避免误伤本地插件。
- 插件详情会展示“安全边界”和“这个插件干了什么”：已信任权限、高风险权限、预留权限、受限权限、面板是否沙盒隔离、命令数量、命令执行次数、事件接收次数、storage 写入次数、settings 写入次数和错误次数。
- metadata provider 只作为候选来源显示，不代表这些候选已经写入曲库。
- 插件连续启动失败会被宿主自动隔离，用户修复文件后可以手动重新启用。

## 面板状态

v1 的 `panel.html` 作为 sandbox iframe 运行，不接触主应用 DOM。面板可以通过受控 `postMessage` bridge 请求宿主做少量插件管理动作；宿主只处理当前 iframe、当前插件 id、白名单 action。

面板请求格式：

```js
parent.postMessage({
  channel: 'echo:plugin-panel',
  version: 1,
  type: 'request',
  requestId: 'unique-id',
  pluginId: 'echo.my-plugin',
  action: 'plugin:getSummary'
}, '*');
```

宿主响应格式：

```js
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.channel !== 'echo:plugin-panel' || message.type !== 'response') return;
  if (message.ok) {
    console.log(message.result);
  } else {
    console.error(message.error);
  }
});
```

当前面板 action：

- `plugin:getSummary`：返回当前插件摘要。
- `plugin:getLogs`：返回当前插件日志。
- `plugin:runCommand`：执行当前插件命令，payload 形如 `{ "commandId": "show-status", "args": [] }`。

面板 bridge 不开放播放、曲库、设置的直接 API；这些能力仍应通过 `plugin.js` 里注册命令，再由面板触发命令。

## 安全边界

- 插件不进入音频 DSP、解码、输出或 `audioCommandQueue` 热路径。
- 插件不能直接拿 SQLite 连接、Electron 模块、原生 host 或主应用 DOM。
- 播放状态事件会合并推送，避免高频事件拖慢播放。
- 插件命令和事件 handler 有超时保护，失败会记录日志。
- Metadata Provider 只返回候选，由宿主裁剪字段并决定是否采用；插件不直接写库。
- 曲库列表 API 有分页和字段裁剪，避免大曲库一次性跨进程传输。
- 插件 storage、命令 payload、命令返回值和 settings patch 都有大小限制，避免坏插件写出过大的 JSON。
- 只启用你信任的本地插件；高风险权限应保持最小化。

## 常见错误

- `plugin_permission_confirmation_required`：启用时没有确认全部请求权限。
- `plugin_permission_denied:*`：插件调用了未获信任的能力。
- `plugin_command_not_found`：manifest 或脚本里没有对应命令。
- `plugin_command_timeout`：插件命令超过 2 秒。
- `plugin_command_args_too_large`：命令参数超过 64 KB。
- `plugin_command_result_too_large`：命令返回值超过 256 KB。
- `plugin_metadata_provider_invalid`：metadata provider 注册参数不合法。
- `plugin_metadata_provider_limit`：同一插件注册了过多 metadata provider。
- `plugin_metadata_request_too_large`：metadata 查询请求超过 32 KB。
- `plugin_metadata_result_too_large`：metadata provider 返回值超过 64 KB。
- `plugin_metadata_provider_timeout`：metadata provider 超过 2.5 秒。
- `plugin_not_enabled`：插件未启用或已被禁用。
- `plugin_event_not_supported:*`：插件监听了未开放的事件。
- `plugin_event_handler_limit`：同一插件注册了过多事件 handler。
- `plugin_event_handler_timeout`：异步事件 handler 超过 2 秒。
- `plugin_storage_value_too_large`：单个 storage value 超过 64 KB。
- `plugin_storage_quota_exceeded`：这个插件的 storage 总量超过 256 KB。
- `plugin_settings_patch_too_large`：设置写入 payload 超过 32 KB。
- `plugin_package_invalid`：导入文件不是 ECHO Next 插件包。
- `plugin_package_too_large` / `plugin_package_file_too_large`：插件包或单个文件超过大小限制。
- `plugin_import_target_exists`：目标插件 id 已存在，导入不会覆盖本地插件。
- `plugin_disabled_after_repeated_errors`：插件连续启动失败，宿主已自动隔离。
- `apiVersion must be between 1 and 1`：插件 API 版本不兼容。
