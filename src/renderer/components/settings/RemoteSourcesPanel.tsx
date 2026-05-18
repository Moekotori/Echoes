import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderOpen, PauseCircle, Play, RefreshCw, RotateCcw, Save, Server, Trash2, Wifi } from 'lucide-react';
import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteDirectoryItem,
  RemoteSource,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceSyncMode,
  RemoteSyncStatus,
  TestRemoteSourceResult,
} from '../../../shared/types/remoteSources';
import { getRemoteSourcesBridge } from '../../utils/echoBridge';

type Tab = {
  provider: RemoteSourceProvider;
  label: string;
  supported: boolean;
};

const tabs: Tab[] = [
  { provider: 'webdav', label: '网盘 / WebDAV', supported: true },
  { provider: 'jellyfin', label: 'Jellyfin', supported: true },
  { provider: 'emby', label: 'Emby', supported: true },
  { provider: 'smb', label: 'NAS / SMB', supported: true },
  { provider: 'sshfs', label: 'SSHFS', supported: true },
  { provider: 'subsonic', label: 'Subsonic / Navidrome', supported: true },
];

const syncModeOptions: Array<{ value: RemoteSourceSyncMode; label: string }> = [
  { value: 'browse', label: '仅浏览' },
  { value: 'index', label: '建立索引，推荐' },
  { value: 'mirror', label: '镜像缓存，未来支持' },
];

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill'];

const jobLabels: Record<RemoteBackgroundJobKind, string> = {
  metadata: '元数据',
  cover: '封面',
  lyrics: '歌词',
  mv: 'MV',
  'duration-backfill': '时长回填',
};

const providerLabels: Record<RemoteSourceProvider, string> = {
  webdav: 'WebDAV / AList',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
  smb: 'NAS / SMB',
  sshfs: 'SSHFS',
  subsonic: 'Subsonic / Navidrome',
};

const emptyStatus = (sourceId: string): RemoteSyncStatus => ({
  sourceId,
  status: 'idle',
  phase: 'idle',
  discoveredCount: 0,
  parsedCount: 0,
  writtenCount: 0,
  skippedCount: 0,
  missingCount: 0,
  failedCount: 0,
  currentPath: null,
  errors: [],
  startedAt: null,
  finishedAt: null,
});

const emptyJobStatus = (sourceId: string): RemoteBackgroundJobStatus => ({
  sourceId,
  paused: false,
  concurrency: { metadata: 2, cover: 2, lyrics: 1, mv: 1, 'duration-backfill': 1 },
  pending: { metadata: 0, cover: 0, lyrics: 0, mv: 0, 'duration-backfill': 0 },
  running: { metadata: 0, cover: 0, lyrics: 0, mv: 0, 'duration-backfill': 0 },
  completed: { metadata: 0, cover: 0, lyrics: 0, mv: 0, 'duration-backfill': 0 },
  failed: { metadata: 0, cover: 0, lyrics: 0, mv: 0, 'duration-backfill': 0 },
  skipped: { metadata: 0, cover: 0, lyrics: 0, mv: 0, 'duration-backfill': 0 },
  current: [],
  lastError: null,
  updatedAt: null,
});

const emptyGlobalStatus = (): RemoteBackgroundGlobalStatus => ({
  paused: false,
  playbackActive: false,
  concurrency: { metadata: 2, cover: 2, lyrics: 1, mv: 1, 'duration-backfill': 1 },
  updatedAt: null,
});

const phaseLabels: Record<RemoteSyncStatus['phase'], string> = {
  idle: '\u7a7a\u95f2',
  testing: '\u6d4b\u8bd5\u8fde\u63a5',
  scanning: '\u626b\u63cf\u6587\u4ef6',
  reading_metadata: '\u89e3\u6790\u5143\u6570\u636e',
  writing_database: '\u5199\u5165\u7d22\u5f15',
  marking_missing: '\u6807\u8bb0\u7f3a\u5931',
  finished: '\u5df2\u5b8c\u6210',
  cancelled: '\u5df2\u53d6\u6d88',
  failed: '\u5931\u8d25',
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const syncProgressFor = (status: RemoteSyncStatus): { processed: number; total: number; percent: number; active: boolean; label: string } => {
  const total = Math.max(0, status.discoveredCount);
  const processed = Math.min(total, Math.max(0, status.writtenCount + status.skippedCount + status.missingCount + status.failedCount));
  const active = status.status === 'running';
  const percent = total > 0 ? clampPercent(Math.round((processed / total) * 100)) : 0;
  const phase = phaseLabels[status.phase] ?? status.phase;
  const label = total > 0
    ? `${phase} · ${processed}/${total} · ${percent}%`
    : active
      ? `${phase} · \u6b63\u5728\u53d1\u73b0\u97f3\u4e50`
      : phase;

  return { processed, total, percent, active, label };
};

const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : '尚未执行');
const sumKinds = (values: Record<RemoteBackgroundJobKind, number>): number => jobKinds.reduce((total, kind) => total + values[kind], 0);

const readConfigNumber = (source: RemoteSource, key: string, fallback: number): number => {
  const value = source.config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const defaultNameFor = (provider: RemoteSourceProvider): string => providerLabels[provider];
const withoutSourceKey = <T,>(sourceId: string, values: Record<string, T>): Record<string, T> => {
  const next = { ...values };
  delete next[sourceId];
  return next;
};

export const RemoteSourcesPanel = (): JSX.Element => {
  const remoteApi = getRemoteSourcesBridge();
  const [activeProvider, setActiveProvider] = useState<RemoteSourceProvider>('webdav');
  const [sources, setSources] = useState<RemoteSource[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, RemoteSyncStatus>>({});
  const [jobStatuses, setJobStatuses] = useState<Record<string, RemoteBackgroundJobStatus>>({});
  const [browsePreviews, setBrowsePreviews] = useState<Record<string, RemoteDirectoryItem[]>>({});
  const [globalJobStatus, setGlobalJobStatus] = useState<RemoteBackgroundGlobalStatus>(emptyGlobalStatus);
  const [form, setForm] = useState({
    displayName: '',
    baseUrl: '',
    username: '',
    secret: '',
    authType: 'basic' as RemoteSourceInput['authType'],
    rootPath: '/',
    syncMode: 'index' as RemoteSourceSyncMode,
    scanConcurrency: 3,
    metadataConcurrency: 2,
    coverConcurrency: 2,
    apiVersion: '1.16.1',
    authMode: 'token',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestRemoteSourceResult | null>(null);
  const terminalSyncEventsRef = useRef<Record<string, string>>({});

  const activeTab = useMemo(() => tabs.find((tab) => tab.provider === activeProvider) ?? tabs[0], [activeProvider]);
  const visibleSources = useMemo(() => sources.filter((source) => source.provider === activeProvider), [activeProvider, sources]);
  const visibleSourceIds = useMemo(() => visibleSources.map((source) => source.id), [visibleSources]);

  const refreshStatuses = useCallback(async (sourceIds: string[], replace = false): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const uniqueIds = Array.from(new Set(sourceIds.filter(Boolean)));
    const [statuses, jobs, globalStatus] = await Promise.all([
      Promise.all(uniqueIds.map((sourceId) => remoteApi.getSyncStatus(sourceId).catch(() => emptyStatus(sourceId)))),
      Promise.all(uniqueIds.map((sourceId) => remoteApi.getJobStatus(sourceId).catch(() => emptyJobStatus(sourceId)))),
      remoteApi.getBackgroundGlobalStatus().catch(() => emptyGlobalStatus()),
    ]);

    const nextStatuses = Object.fromEntries(statuses.map((status) => [status.sourceId, status]));
    const nextJobs = Object.fromEntries(jobs.map((status) => [status.sourceId, status]));
    setSyncStatuses((current) => (replace ? nextStatuses : { ...current, ...nextStatuses }));
    setJobStatuses((current) => (replace ? nextJobs : { ...current, ...nextJobs }));
    setGlobalJobStatus(globalStatus);
  }, [remoteApi]);

  const refreshSources = useCallback(async (): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const nextSources = await remoteApi.list();
    setSources(nextSources);
    await refreshStatuses(nextSources.map((source) => source.id), true);
  }, [refreshStatuses, remoteApi]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    const hasRunningSync = visibleSourceIds.some((sourceId) => syncStatuses[sourceId]?.status === 'running');
    const hasRunningJobs = visibleSourceIds.some((sourceId) => {
      const status = jobStatuses[sourceId];
      return status ? sumKinds(status.pending) + sumKinds(status.running) > 0 : false;
    });
    if ((!hasRunningSync && !hasRunningJobs) || !remoteApi) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshStatuses(visibleSourceIds);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [jobStatuses, refreshStatuses, remoteApi, syncStatuses, visibleSourceIds]);

  useEffect(() => {
    let shouldRefreshSources = false;
    let shouldRefreshLibrary = false;

    for (const status of Object.values(syncStatuses)) {
      if (status.status !== 'completed' && status.status !== 'failed' && status.status !== 'cancelled') {
        continue;
      }
      if (!status.finishedAt) {
        continue;
      }

      const eventKey = `${status.status}:${status.finishedAt}`;
      if (terminalSyncEventsRef.current[status.sourceId] === eventKey) {
        continue;
      }

      terminalSyncEventsRef.current[status.sourceId] = eventKey;
      shouldRefreshSources = true;
      shouldRefreshLibrary = true;
    }

    if (shouldRefreshLibrary) {
      window.dispatchEvent(new Event('library:changed'));
    }
    if (shouldRefreshSources) {
      void refreshSources();
    }
  }, [refreshSources, syncStatuses]);

  const updateForm = (patch: Partial<typeof form>): void => {
    setForm((current) => ({ ...current, ...patch }));
    setTestResult(null);
    setMessage(null);
  };

  const toInput = useCallback(
    (provider: RemoteSourceProvider): RemoteSourceInput => {
      const config: Record<string, unknown> = {
        scanConcurrency: form.scanConcurrency,
        metadataConcurrency: form.metadataConcurrency,
        coverConcurrency: form.coverConcurrency,
      };

      if (provider === 'webdav' || provider === 'smb' || provider === 'sshfs') {
        config.rootPath = form.rootPath.trim() || '/';
      }
      if (provider === 'smb' || provider === 'sshfs') {
        config.accessMode = 'mounted';
        config.pathStyle = provider === 'smb' ? 'unc' : 'posix';
      }
      if (provider === 'subsonic') {
        config.apiVersion = form.apiVersion.trim() || '1.16.1';
        config.clientName = 'ECHO-Next';
        config.authMode = form.authMode;
      }

      const webDavAuthType =
        provider === 'webdav' && form.authType === 'basic' && !form.username.trim() && !form.secret
          ? 'none'
          : form.authType;

      return {
        provider,
        displayName: form.displayName.trim() || defaultNameFor(provider),
        baseUrl: form.baseUrl.trim(),
        username: webDavAuthType === 'basic' ? form.username.trim() || null : null,
        secret: webDavAuthType === 'none' ? null : form.secret,
        authType: webDavAuthType,
        config,
        syncMode: form.syncMode,
      };
    },
    [form],
  );

  const runFormAction = async (action: 'test' | 'save' | 'saveSync'): Promise<void> => {
    if (!remoteApi || !activeTab.supported) {
      return;
    }

    setBusy(action);
    setMessage(null);
    try {
      const input = toInput(activeProvider);
      if (action === 'test') {
        const result = await remoteApi.test(input);
        setTestResult(result);
        setMessage(result.message);
        return;
      }

      const saved = await remoteApi.create(input);
      setMessage(action === 'saveSync' ? '来源已保存，正在开始同步。' : '来源已保存。');
      if (action === 'saveSync') {
        await remoteApi.sync(saved.id);
      }
      setForm((current) => ({ ...current, displayName: '', baseUrl: '', username: '', secret: '' }));
      await refreshSources();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(null);
    }
  };

  const runSourceAction = async (
    source: RemoteSource,
    action: 'test' | 'sync' | 'metadata' | 'cover' | 'match' | 'retryFailed' | 'pauseJobs' | 'toggle' | 'delete' | 'cancel' | 'browse',
  ): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const key = `${action}:${source.id}`;
    setBusy(key);
    setMessage(null);
    try {
      if (action === 'test') {
        const result = await remoteApi.test(source.id);
        setMessage(result.message);
      } else if (action === 'sync') {
        await remoteApi.sync(source.id);
        setMessage('已开始同步。');
      } else if (action === 'metadata') {
        await remoteApi.startBackgroundJobs(source.id, ['metadata', 'duration-backfill']);
        setMessage('已加入元数据补齐任务。');
      } else if (action === 'cover') {
        setMessage('\u5c01\u9762\u5df2\u6539\u4e3a\u6309\u9700\u52a0\u8f7d\uff1a\u56de\u5230\u7f51\u76d8\u6b4c\u66f2\u5217\u8868\uff0c\u6eda\u5230\u54ea\u91cc\u5c31\u4f4e\u8d1f\u8f7d\u8865\u54ea\u91cc\u3002');
        await refreshStatuses([source.id]);
        return;
      } else if (action === 'match') {
        await remoteApi.startBackgroundJobs(source.id, ['lyrics']);
        setMessage('\u5df2\u52a0\u5165\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\uff1b\u7f51\u76d8\u6765\u6e90\u4e0d\u518d\u6279\u91cf\u5339\u914d MV\u3002');
      } else if (action === 'retryFailed') {
        await remoteApi.retryFailedJobs(source.id, ['metadata', 'duration-backfill']);
        setMessage('\u5df2\u91cd\u8bd5\u5931\u8d25\u7684\u5143\u6570\u636e\u4efb\u52a1\uff1b\u4e0d\u518d\u91cd\u8bd5\u7f51\u76d8\u5c01\u9762\u6216 MV \u6279\u91cf\u5339\u914d\u3002');
      } else if (action === 'pauseJobs') {
        await remoteApi.pauseBackgroundJobs(source.id);
        setMessage('已暂停该来源后台任务。');
      } else if (action === 'toggle') {
        await remoteApi.update({ id: source.id, status: source.status === 'disabled' ? 'enabled' : 'disabled' });
      } else if (action === 'delete') {
        if (!window.confirm(`删除远程来源“${source.displayName}”？本地远程索引也会一并移除。`)) {
          return;
        }
        await remoteApi.delete(source.id);
        setSources((current) => current.filter((item) => item.id !== source.id));
        setSyncStatuses((current) => withoutSourceKey(source.id, current));
        setJobStatuses((current) => withoutSourceKey(source.id, current));
        setBrowsePreviews((current) => withoutSourceKey(source.id, current));
        window.dispatchEvent(new Event('library:changed'));
        setMessage('来源已删除，相关远程索引已移除。');
      } else if (action === 'cancel') {
        await remoteApi.cancelSync(source.id);
      } else if (action === 'browse') {
        const items = await remoteApi.browse(source.id);
        setBrowsePreviews((current) => ({ ...current, [source.id]: items.slice(0, 8) }));
        setMessage(`浏览成功：发现 ${items.length} 个项目。`);
      }
      await refreshSources();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(null);
    }
  };

  const renderForm = (): JSX.Element => (
    <section className="remote-source-form">
      <label>
        显示名称
        <input value={form.displayName} placeholder={defaultNameFor(activeProvider)} onChange={(event) => updateForm({ displayName: event.target.value })} />
      </label>
      <label>
        服务器 URL
        <input value={form.baseUrl} placeholder={activeProvider === 'webdav' ? 'https://example.com/dav' : 'https://music.example.com'} onChange={(event) => updateForm({ baseUrl: event.target.value })} />
      </label>
      <label>
        用户名
        <input value={form.username} onChange={(event) => updateForm({ username: event.target.value })} />
      </label>
      <label>
        {activeProvider === 'webdav' ? '密码' : activeProvider === 'subsonic' ? '密码 / API token' : '密码 / API Key'}
        <input type="password" value={form.secret} onChange={(event) => updateForm({ secret: event.target.value })} />
      </label>
      <label>
        认证方式
        <select value={form.authType} onChange={(event) => updateForm({ authType: event.target.value as RemoteSourceInput['authType'] })}>
          <option value="basic">用户名密码</option>
          <option value="apiKey">API Key</option>
          <option value="token">Token</option>
          <option value="none">无需认证</option>
        </select>
      </label>
      {activeProvider === 'webdav' || activeProvider === 'smb' || activeProvider === 'sshfs' ? (
        <label>
          {activeProvider === 'webdav' ? '根目录' : '挂载子目录'}
          <input value={form.rootPath} onChange={(event) => updateForm({ rootPath: event.target.value })} />
        </label>
      ) : null}
      {activeProvider === 'smb' || activeProvider === 'sshfs' ? (
        <p className="settings-inline-note">
          第一阶段使用系统已挂载或可直接访问的路径。Windows 可填写 UNC 路径或映射盘，例如 \\NAS\Music 或 Z:\Music；SSHFS 请先在系统中挂载后填写挂载目录。
        </p>
      ) : null}
      {activeProvider === 'subsonic' ? (
        <>
          <label>
            API 版本
            <input value={form.apiVersion} onChange={(event) => updateForm({ apiVersion: event.target.value })} />
          </label>
          <label>
            Subsonic 认证
            <select value={form.authMode} onChange={(event) => updateForm({ authMode: event.target.value })}>
              <option value="token">Token salt，推荐</option>
              <option value="password">明文兼容模式</option>
            </select>
          </label>
        </>
      ) : null}
      <label>
        同步模式
        <select value={form.syncMode} onChange={(event) => updateForm({ syncMode: event.target.value as RemoteSourceSyncMode })}>
          {syncModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        扫描并发
        <input type="number" min={1} max={8} value={form.scanConcurrency} onChange={(event) => updateForm({ scanConcurrency: Number(event.target.value) })} />
      </label>
      <label>
        元数据并发
        <input type="number" min={1} max={8} value={form.metadataConcurrency} onChange={(event) => updateForm({ metadataConcurrency: Number(event.target.value) })} />
      </label>
      <label>
        封面并发
        <input type="number" min={1} max={8} value={form.coverConcurrency} onChange={(event) => updateForm({ coverConcurrency: Number(event.target.value) })} />
      </label>
      <div className="remote-source-actions">
        <button type="button" disabled={busy === 'test'} onClick={() => void runFormAction('test')}>
          <Wifi size={15} />测试连接
        </button>
        <button type="button" disabled={busy === 'save'} onClick={() => void runFormAction('save')}>
          <Save size={15} />保存
        </button>
        <button type="button" disabled={busy === 'saveSync'} onClick={() => void runFormAction('saveSync')}>
          <RefreshCw size={15} />保存并同步
        </button>
      </div>
      {testResult ? <p className="settings-inline-note">{testResult.ok ? '测试通过：' : '测试失败：'}{testResult.message}</p> : null}
    </section>
  );

  return (
    <div className="remote-sources-panel">
      <section className="remote-sources-hero">
        <div>
          <h3>网盘 / 远程音乐库</h3>
          <strong>网盘 / WebDAV / AList / NAS / Subsonic / Jellyfin / Emby</strong>
          <p>
            连接 AList、坚果云、Nextcloud 等 WebDAV 网盘，也可以把 Jellyfin、Emby、Navidrome、NAS 或 SSHFS
            作为独立音乐来源浏览。ECHO 会为远程歌曲建立本地索引，使歌词、MV、播放进度、收藏和历史记录正常工作。
          </p>
        </div>
        <Server size={28} />
      </section>

      <nav className="remote-source-tabs" aria-label="远程音乐库类型">
        {tabs.map((tab) => (
          <button key={tab.provider} type="button" className={tab.provider === activeProvider ? 'active' : ''} onClick={() => setActiveProvider(tab.provider)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab.supported ? renderForm() : (
        <section className="remote-source-coming-soon">
          <Play size={18} />
          <strong>{activeTab.label} 即将支持</strong>
          <span>这类来源需要处理系统挂载、凭据和跨平台文件访问，会在媒体服务器类来源稳定后接入。</span>
        </section>
      )}

      <section className="remote-source-list">
        {visibleSources.map((source) => {
          const syncStatus = syncStatuses[source.id] ?? emptyStatus(source.id);
          const jobStatus = jobStatuses[source.id] ?? emptyJobStatus(source.id);
          const browsePreview = browsePreviews[source.id] ?? [];
          const running = syncStatus.status === 'running';
          const syncProgress = syncProgressFor(syncStatus);

          return (
            <article className="remote-source-card" key={source.id}>
              <div className="remote-source-card-head">
                <div>
                  <h3>{source.displayName}</h3>
                  <p>{providerLabels[source.provider]} · {source.baseUrl ?? '无服务器地址'}</p>
                </div>
                <span className={`remote-source-status remote-source-status--${source.status}`}>{source.status}</span>
              </div>
              <div className="remote-source-grid">
                <span><em>已索引歌曲</em><strong>{source.indexedTrackCount}</strong></span>
                <span><em>上次测试</em><strong>{formatDate(source.lastTestAt)}</strong></span>
                <span><em>上次同步</em><strong>{formatDate(source.lastSyncAt)}</strong></span>
                <span><em>后台并发</em><strong>scan {readConfigNumber(source, 'scanConcurrency', 3)} / metadata {readConfigNumber(source, 'metadataConcurrency', 2)} / cover {readConfigNumber(source, 'coverConcurrency', readConfigNumber(source, 'metadataConcurrency', 2))}</strong></span>
              </div>
              {source.lastError ? <p className="settings-inline-note">错误：{source.lastError}</p> : null}
              <div className="remote-sync-status">
                <span>阶段：<strong>{syncStatus.phase}</strong></span>
                <span>发现：<strong>{syncStatus.discoveredCount}</strong></span>
                <span>成功写入：<strong>{syncStatus.writtenCount}</strong></span>
                <span>跳过：<strong>{syncStatus.skippedCount}</strong></span>
                <span>失败：<strong>{syncStatus.failedCount}</strong></span>
              </div>
              <div
                className={`remote-scan-progress${syncProgress.active ? ' remote-scan-progress--active' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={syncProgress.total || 100}
                aria-valuenow={syncProgress.total > 0 ? syncProgress.processed : undefined}
                aria-label={`${source.displayName} \u626b\u63cf\u8fdb\u5ea6`}
              >
                <div className="remote-scan-progress-head">
                  <span>{'\u626b\u63cf\u8fdb\u5ea6'}</span>
                  <strong>{syncProgress.label}</strong>
                </div>
                <div className="remote-scan-progress-track">
                  <span style={{ width: `${syncProgress.total > 0 ? syncProgress.percent : syncProgress.active ? 18 : 0}%` }} />
                </div>
              </div>
              <div className="remote-job-grid">
                {jobKinds.map((kind) => (
                  <span key={kind}>
                    <em>{jobLabels[kind]}</em>
                    <strong>{jobStatus.completed[kind]} 完成 / {jobStatus.pending[kind]} 待处理 / {jobStatus.running[kind]} 运行 / {jobStatus.failed[kind]} 失败</strong>
                  </span>
                ))}
              </div>
              {syncStatus.currentPath ? <p className="settings-inline-note">当前文件：{syncStatus.currentPath}</p> : null}
              {browsePreview.length > 0 ? (
                <div className="remote-sync-status" aria-label={`${source.displayName} 浏览结果`}>
                  {browsePreview.map((item) => (
                    <span key={item.path}>
                      <em>{item.kind === 'directory' ? '目录' : item.audio ? '音频' : '文件'}</em>
                      <strong>{item.path}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="remote-source-actions">
                <button type="button" disabled={busy === `test:${source.id}`} onClick={() => void runSourceAction(source, 'test')}>
                  <Wifi size={15} />测试
                </button>
                <button type="button" disabled={busy === `sync:${source.id}`} onClick={() => void runSourceAction(source, 'sync')}>
                  <RefreshCw size={15} />同步
                </button>
                <button type="button" disabled={busy === `metadata:${source.id}`} onClick={() => void runSourceAction(source, 'metadata')}>
                  <RefreshCw size={15} />补齐元数据
                </button>
                <button type="button" disabled={busy === `cover:${source.id}`} onClick={() => void runSourceAction(source, 'cover')}>
                  <RefreshCw size={15} />加载封面
                </button>
                <button type="button" disabled={busy === `match:${source.id}`} onClick={() => void runSourceAction(source, 'match')}>
                  <Play size={15} />{'\u5339\u914d\u6b4c\u8bcd'}
                </button>
                <button type="button" disabled={busy === `retryFailed:${source.id}`} onClick={() => void runSourceAction(source, 'retryFailed')}>
                  <RotateCcw size={15} />{'\u4ec5\u91cd\u8bd5\u5931\u8d25\u5143\u6570\u636e'}
                </button>
                <button type="button" disabled={busy === `pauseJobs:${source.id}`} onClick={() => void runSourceAction(source, 'pauseJobs')}>
                  <PauseCircle size={15} />暂停后台任务
                </button>
                <button type="button" disabled={busy === `browse:${source.id}`} onClick={() => void runSourceAction(source, 'browse')}>
                  <FolderOpen size={15} />浏览
                </button>
                <button type="button" onClick={() => void runSourceAction(source, 'toggle')}>
                  <Check size={15} />{source.status === 'disabled' ? '启用' : '禁用'}
                </button>
                {running ? <button type="button" onClick={() => void runSourceAction(source, 'cancel')}>取消</button> : null}
                <button type="button" onClick={() => void runSourceAction(source, 'delete')}>
                  <Trash2 size={15} />删除
                </button>
              </div>
            </article>
          );
        })}
        {activeTab.supported && visibleSources.length === 0 ? <p className="settings-inline-note">还没有 {activeTab.label} 来源。</p> : null}
      </section>

      <section className="remote-source-card">
        <div className="remote-source-card-head">
          <div>
            <h3>后台任务</h3>
            <p>播放时会自动降低后台元数据和封面任务并发，优先保证播放稳定。</p>
          </div>
          <span className="remote-source-status">{globalJobStatus.paused ? '已暂停' : '运行中'}</span>
        </div>
        <div className="remote-job-grid">
          {jobKinds.map((kind) => (
            <span key={kind}>
              <em>{jobLabels[kind]}</em>
              <strong>并发 {globalJobStatus.concurrency[kind]}</strong>
            </span>
          ))}
        </div>
        <div className="remote-source-actions">
          <button type="button" onClick={() => remoteApi?.setBackgroundPaused(!globalJobStatus.paused).then(setGlobalJobStatus)}>
            {globalJobStatus.paused ? '恢复后台任务' : '全局暂停后台任务'}
          </button>
        </div>
      </section>

      {message ? <p className="settings-inline-note">{message}</p> : null}
    </div>
  );
};
