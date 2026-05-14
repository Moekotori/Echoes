import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileAudio, FolderOpen, Link2, Search, Settings2, Square, Wrench, XCircle } from 'lucide-react';
import type { DownloadJob, DownloadJobStatus, DownloadSettings, DownloadToolsStatus } from '../../shared/types/downloads';
import { EmptyState } from '../components/ui/EmptyState';
import { getDownloadsBridge } from '../utils/echoBridge';

const terminalStatuses = new Set<DownloadJobStatus>(['completed', 'failed', 'cancelled']);
const runningStatuses = new Set<DownloadJobStatus>(['queued', 'probing', 'downloading', 'extracting_audio', 'importing', 'binding_mv']);

const defaultSettings: DownloadSettings = {
  audioStrategy: 'best_available',
  importToLibrary: true,
  bindMvAfterImport: true,
  outputDirectory: null,
};

const statusLabels: Record<DownloadJobStatus, string> = {
  queued: '排队中',
  probing: '解析链接',
  downloading: '下载中',
  extracting_audio: '提取音频',
  importing: '导入曲库',
  binding_mv: '绑定 MV',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const providerLabels: Record<DownloadJob['provider'], string> = {
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  unknown: 'URL',
};

const formatError = (error: unknown): string => (error instanceof Error ? error.message : String(error || '下载操作失败'));

const formatPath = (path: string | null): string => path || '请选择下载文件夹';

const formatDuration = (seconds: number | null): string | null => {
  if (!seconds || !Number.isFinite(seconds)) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
};

const formatBytes = (bytes: number | null): string | null => {
  if (bytes === null || !Number.isFinite(bytes)) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

const formatEta = (seconds: number | null): string | null => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
};

const ToolStatus = ({ label, ready, detail }: { label: string; ready: boolean; detail: string }): JSX.Element => (
  <span className="download-tool-pill" data-ready={ready}>
    {ready ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
    <strong>{label}</strong>
    <em>{detail}</em>
  </span>
);

const JobRow = ({ job, onCancel }: { job: DownloadJob; onCancel: (jobId: string) => void }): JSX.Element => {
  const canCancel = runningStatuses.has(job.status);
  const duration = formatDuration(job.durationSeconds);
  const downloaded = formatBytes(job.downloadedBytes);
  const total = formatBytes(job.totalBytes);
  const speed = formatBytes(job.speedBytesPerSecond);
  const eta = formatEta(job.etaSeconds);

  return (
    <article className="download-job-row" data-status={job.status}>
      <div className="download-job-main">
        <span className="download-job-icon">
          <FileAudio size={18} />
        </span>
        <div className="download-job-copy">
          <strong>{job.title ?? 'Untitled download'}</strong>
          <span title={job.sourceUrl}>{job.sourceUrl}</span>
          {job.outputPath ? <small title={job.outputPath}>保存到 {job.outputPath}</small> : null}
          {duration ? <small>{duration}</small> : null}
        </div>
        <span className="download-provider-chip">{providerLabels[job.provider]}</span>
      </div>

      <div className="download-job-progress">
        <div className="download-progress-track" aria-label={`${Math.round(job.progress)}%`}>
          <span style={{ width: `${job.progress}%` }} />
        </div>
        <div className="download-job-meta">
          <span>{statusLabels[job.status]}</span>
          <em>{Math.round(job.progress)}%</em>
        </div>
        <div className="download-job-meta">
          <span>{downloaded && total ? `${downloaded} / ${total}` : downloaded ?? '等待进度'}</span>
          <em>{speed ? `${speed}/s` : eta ? `ETA ${eta}` : ''}</em>
        </div>
        {job.importedTrackId ? <small>已导入曲库</small> : null}
        {job.error ? <p>{job.error}</p> : null}
      </div>

      <button className="download-icon-button" type="button" disabled={!canCancel} onClick={() => onCancel(job.id)} aria-label="取消任务" title="取消任务">
        <Square size={15} />
      </button>
    </article>
  );
};

export const DownloadsPage = (): JSX.Element => {
  const [url, setUrl] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [settings, setSettings] = useState<DownloadSettings>(defaultSettings);
  const [tools, setTools] = useState<DownloadToolsStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'create' | 'clear' | 'tools' | 'folder' | null>(null);
  const [needsFolder, setNeedsFolder] = useState(false);

  const bridge = getDownloadsBridge();
  const completedCount = useMemo(() => jobs.filter((job) => terminalStatuses.has(job.status)).length, [jobs]);

  const refreshJobs = useCallback(async (): Promise<void> => {
    if (!bridge?.getJobs) {
      setJobs([]);
      return;
    }

    try {
      setJobs(await bridge.getJobs());
    } catch (jobsError) {
      setError(formatError(jobsError));
    }
  }, [bridge]);

  const refreshTools = useCallback(async (): Promise<void> => {
    if (!bridge?.checkTools) {
      setTools({ ytDlpAvailable: false, ffmpegAvailable: false, ytDlpVersion: null, ytDlpPath: null, ffmpegPath: null });
      return;
    }

    setBusyAction('tools');
    try {
      setTools(await bridge.checkTools());
    } catch (toolsError) {
      setError(formatError(toolsError));
    } finally {
      setBusyAction(null);
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) {
      setError('当前运行环境未暴露下载 IPC。');
      return undefined;
    }

    void refreshJobs();
    void bridge.getSettings?.().then(setSettings).catch((settingsError) => setError(formatError(settingsError)));
    void refreshTools();

    return bridge.onJobsUpdated?.((nextJobs) => {
      setJobs(nextJobs);
    });
  }, [bridge, refreshJobs, refreshTools]);

  const handleCreate = useCallback(async (): Promise<void> => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !bridge?.createUrlJob) {
      return;
    }

    if (!settings.outputDirectory) {
      setNeedsFolder(true);
      setError('请选择下载文件夹');
      setMessage(null);
      return;
    }

    setBusyAction('create');
    setError(null);
    setMessage(null);
    setNeedsFolder(false);

    try {
      const job = await bridge.createUrlJob(trimmedUrl, {
        importToLibrary: settings.importToLibrary,
        bindMvAfterImport: settings.bindMvAfterImport,
      });
      setJobs((current) => (current.some((item) => item.id === job.id) ? current : [job, ...current]));
      setUrl('');
      setMessage('已加入下载队列。');
    } catch (createError) {
      const nextError = formatError(createError);
      setNeedsFolder(nextError.includes('请选择下载文件夹'));
      setError(nextError);
    } finally {
      setBusyAction(null);
    }
  }, [bridge, settings, url]);

  const handleChooseDirectory = useCallback(async (): Promise<void> => {
    if (!bridge?.chooseOutputDirectory) {
      return;
    }

    setBusyAction('folder');
    setError(null);
    try {
      const nextSettings = await bridge.chooseOutputDirectory();
      if (nextSettings) {
        setSettings(nextSettings);
        setNeedsFolder(false);
      }
    } catch (directoryError) {
      setError(formatError(directoryError));
    } finally {
      setBusyAction(null);
    }
  }, [bridge]);

  const handleCancel = useCallback(
    async (jobId: string): Promise<void> => {
      if (!bridge?.cancelJob) {
        return;
      }

      try {
        const job = await bridge.cancelJob(jobId);
        if (job) {
          setJobs((current) => current.map((item) => (item.id === job.id ? job : item)));
        }
      } catch (cancelError) {
        setError(formatError(cancelError));
      }
    },
    [bridge],
  );

  const handleClearCompleted = useCallback(async (): Promise<void> => {
    if (!bridge?.clearCompleted) {
      return;
    }

    setBusyAction('clear');
    setError(null);

    try {
      setJobs(await bridge.clearCompleted());
      setMessage('已清除完成、失败和取消的任务。');
    } catch (clearError) {
      setError(formatError(clearError));
    } finally {
      setBusyAction(null);
    }
  }, [bridge]);

  const patchSettings = useCallback(
    async (patch: Partial<DownloadSettings>): Promise<void> => {
      const nextSettings = { ...settings, ...patch };
      setSettings(nextSettings);

      if (!bridge?.setSettings) {
        return;
      }

      try {
        setSettings(await bridge.setSettings(patch));
      } catch (settingsError) {
        setError(formatError(settingsError));
      }
    },
    [bridge, settings],
  );

  return (
    <div className="downloads-page">
      <header className="downloads-header">
        <div>
          <span className="panel-kicker">Downloader</span>
          <h1>下载</h1>
          <p>使用内置 yt-dlp 下载最高可用音频，完成后可直接导入曲库并绑定源 URL 为 MV。</p>
        </div>
        <button className="downloads-action-button" type="button" onClick={() => void refreshTools()} disabled={busyAction === 'tools'}>
          <Wrench size={16} />
          检测环境
        </button>
      </header>

      <main className="downloads-grid">
        <section className="downloads-panel downloads-url-panel">
          <div className="downloads-section-title">
            <Link2 size={17} />
            <h2>粘贴链接下载</h2>
          </div>
          <div className="downloads-url-box">
            <input
              type="url"
              value={url}
              placeholder="https://www.youtube.com/watch?v=..."
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreate();
                }
              }}
            />
            <button className="primary-action" type="button" disabled={!url.trim() || busyAction === 'create'} onClick={() => void handleCreate()}>
              <Download size={16} />
              {busyAction === 'create' ? '创建中' : '加入队列'}
            </button>
          </div>
          {message ? <p className="downloads-note">{message}</p> : null}
          {error ? <p className="downloads-error">{error}</p> : null}
        </section>

        <section className="downloads-panel downloads-search-panel" aria-label="搜索下载">
          <div className="downloads-section-title">
            <Search size={17} />
            <h2>搜索下载</h2>
            <span>Coming soon</span>
          </div>
          <label className="downloads-search-box">
            <Search size={16} />
            <input disabled type="search" placeholder="搜索 YouTube / Bilibili" />
          </label>
        </section>

        <section className="downloads-panel downloads-queue-panel">
          <div className="downloads-section-title downloads-section-title--split">
            <div>
              <Download size={17} />
              <h2>下载队列</h2>
            </div>
            <button className="downloads-action-button" type="button" disabled={completedCount === 0 || busyAction === 'clear'} onClick={() => void handleClearCompleted()}>
              清除已完成
            </button>
          </div>

          <div className="download-job-list">
            {jobs.length === 0 ? (
              <EmptyState icon={Download} title="队列为空" description="粘贴链接后会在这里看到真实下载进度。" meta="Idle" />
            ) : (
              jobs.map((job) => <JobRow job={job} key={job.id} onCancel={(jobId) => void handleCancel(jobId)} />)
            )}
          </div>
        </section>

        <aside className="downloads-side">
          <section className="downloads-panel" data-attention={needsFolder}>
            <div className="downloads-section-title">
              <Settings2 size={17} />
              <h2>下载设置</h2>
            </div>
            <div className="download-output-path">
              <em>音频策略</em>
              <strong>最高可用音质</strong>
            </div>
            <div className="download-output-path">
              <em>下载文件夹</em>
              <strong title={formatPath(settings.outputDirectory)}>{formatPath(settings.outputDirectory)}</strong>
            </div>
            <button className="downloads-action-button" type="button" onClick={() => void handleChooseDirectory()} disabled={busyAction === 'folder'}>
              <FolderOpen size={16} />
              {settings.outputDirectory ? '更换文件夹' : '选择文件夹'}
            </button>
            <label className="download-toggle-row">
              <input type="checkbox" checked={settings.importToLibrary} onChange={(event) => void patchSettings({ importToLibrary: event.target.checked })} />
              <span>完成后导入曲库</span>
            </label>
            <label className="download-toggle-row">
              <input type="checkbox" checked={settings.bindMvAfterImport} onChange={(event) => void patchSettings({ bindMvAfterImport: event.target.checked })} />
              <span>导入后绑定源 URL 为 MV</span>
            </label>
          </section>

          <section className="downloads-panel">
            <div className="downloads-section-title">
              <Wrench size={17} />
              <h2>环境检测</h2>
            </div>
            <div className="download-tools-list">
              <ToolStatus label="yt-dlp" ready={tools?.ytDlpAvailable ?? false} detail={tools?.ytDlpVersion ?? '未随应用安装'} />
              <ToolStatus label="ffmpeg" ready={tools?.ffmpegAvailable ?? false} detail={tools?.ffmpegPath ?? '未检测到'} />
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
};
