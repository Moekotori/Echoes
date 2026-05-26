import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  Check,
  Database,
  File,
  FolderOpen,
  Gauge,
  HardDrive,
  ListPlus,
  Music2,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteDirectoryItem,
  RemoteSourceIssueItem,
  RemoteSourceIssueKind,
  RemoteSourceOverview,
  RemoteSourceOverviewItem,
  RemoteSource,
  RemoteSourceInput,
  RemoteSourceProvider,
  RemoteSourceSyncMode,
  RemoteSyncStatus,
  RemoteTrackLookupItem,
  RemoteTrackStatus,
  TestRemoteSourceResult,
} from '../../../shared/types/remoteSources';
import type { LibraryTrack } from '../../../shared/types/library';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
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

const syncModeLabels: Record<RemoteSourceSyncMode, string> = {
  browse: '仅浏览，不写入曲库索引',
  index: '建立索引，播放时按需取流',
  mirror: '镜像缓存尚未开放，不会静默复制整库音频',
};

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

const emptyStatusCounts = (): RemoteSourceOverviewItem['metadata'] => ({
  pending: 0,
  searching: 0,
  partial: 0,
  ok: 0,
  not_found: 0,
  error: 0,
});

const emptyOverview = (): RemoteSourceOverview => ({
  totalSources: 0,
  enabledSources: 0,
  disabledSources: 0,
  errorSources: 0,
  trackCount: 0,
  albumCount: 0,
  artistCount: 0,
  totalSizeBytes: 0,
  missingTrackCount: 0,
  metadata: emptyStatusCounts(),
  cover: emptyStatusCounts(),
  lyrics: emptyStatusCounts(),
  mv: emptyStatusCounts(),
  sources: [],
});

const emptyOverviewItem = (source: RemoteSource): RemoteSourceOverviewItem => ({
  sourceId: source.id,
  provider: source.provider,
  displayName: source.displayName,
  status: source.status,
  syncMode: source.syncMode,
  trackCount: source.indexedTrackCount,
  albumCount: 0,
  artistCount: 0,
  totalSizeBytes: 0,
  missingTrackCount: 0,
  metadata: emptyStatusCounts(),
  cover: emptyStatusCounts(),
  lyrics: emptyStatusCounts(),
  mv: emptyStatusCounts(),
  lastSyncAt: source.lastSyncAt,
  lastError: source.lastError,
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
const formatCount = (value: number): string => new Intl.NumberFormat().format(Math.max(0, value));
const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
};
const sumKinds = (values: Record<RemoteBackgroundJobKind, number>): number => jobKinds.reduce((total, kind) => total + values[kind], 0);
const isJobKindActive = (status: RemoteBackgroundJobStatus, kind: RemoteBackgroundJobKind): boolean => status.pending[kind] + status.running[kind] > 0;

const statusCompletionText = (counts: RemoteSourceOverviewItem['metadata']): string => {
  const done = counts.ok;
  const total = counts.pending + counts.searching + counts.partial + counts.ok + counts.not_found + counts.error;
  if (total <= 0) {
    return '暂无数据';
  }

  const percent = Math.round((done / total) * 100);
  return `${formatCount(done)}/${formatCount(total)} · ${percent}%`;
};

const sourceIssueTotal = (source: RemoteSourceOverviewItem): number =>
  source.missingTrackCount
  + source.metadata.error + source.metadata.partial + source.metadata.not_found
  + source.cover.error + source.cover.not_found
  + source.lyrics.error + source.lyrics.not_found
  + source.mv.error + source.mv.not_found;

const recommendedIssueKind = (source: RemoteSourceOverviewItem): RemoteSourceIssueKind | null => {
  if (source.metadata.error + source.metadata.partial + source.metadata.not_found > 0) {
    return 'metadata';
  }
  if (source.cover.error + source.cover.not_found > 0) {
    return 'cover';
  }
  if (source.lyrics.error + source.lyrics.not_found > 0) {
    return 'lyrics';
  }
  if (source.missingTrackCount > 0) {
    return 'missing';
  }
  if (source.mv.error + source.mv.not_found > 0) {
    return 'mv';
  }
  return null;
};

const issueKindLabels: Record<RemoteSourceIssueKind, string> = {
  metadata: '元数据',
  cover: '封面',
  lyrics: '歌词',
  mv: 'MV',
  missing: '缺失文件',
};

const sourceStatusLabels: Record<RemoteSource['status'], string> = {
  enabled: '已启用',
  disabled: '已禁用',
  error: '异常',
};

const statusKindTotal = (counts: RemoteSourceOverviewItem['metadata']): number =>
  counts.pending + counts.searching + counts.partial + counts.ok + counts.not_found + counts.error;

const statusIssueCount = (counts: RemoteSourceOverviewItem['metadata']): number =>
  counts.partial + counts.not_found + counts.error;

const completionPercent = (counts: RemoteSourceOverviewItem['metadata']): number | null => {
  const total = statusKindTotal(counts);
  return total <= 0 ? null : clampPercent(Math.round((counts.ok / total) * 100));
};

const completionPercentText = (counts: RemoteSourceOverviewItem['metadata']): string => {
  const percent = completionPercent(counts);
  return percent === null ? '暂无数据' : `${percent}%`;
};

const recommendationText = (source: RemoteSourceOverviewItem): string | null => {
  const metadataIssues = source.metadata.error + source.metadata.partial + source.metadata.not_found;
  const coverIssues = source.cover.error + source.cover.not_found;
  const lyricsIssues = source.lyrics.error + source.lyrics.not_found;
  const mvIssues = source.mv.error + source.mv.not_found;

  if (metadataIssues > 0) {
    return `有 ${formatCount(metadataIssues)} 首元数据异常，建议先只重试元数据/时长。`;
  }
  if (coverIssues > 0) {
    return `有 ${formatCount(coverIssues)} 首封面加载失败，可以空闲时小批量重试。`;
  }
  if (lyricsIssues > 0) {
    return `有 ${formatCount(lyricsIssues)} 首歌词匹配失败，建议后台低负载处理。`;
  }
  if (source.missingTrackCount > 0) {
    return `有 ${formatCount(source.missingTrackCount)} 首远程文件已缺失，建议确认网盘路径后重新同步。`;
  }
  if (mvIssues > 0) {
    return `有 ${formatCount(mvIssues)} 首 MV 匹配失败，建议先保持低优先级。`;
  }
  return null;
};

const removeOverviewSource = (overview: RemoteSourceOverview, sourceId: string): RemoteSourceOverview => {
  const nextSources = overview.sources.filter((source) => source.sourceId !== sourceId);
  if (nextSources.length === overview.sources.length) {
    return overview;
  }

  const sumStatusCounts = (key: 'metadata' | 'cover' | 'lyrics' | 'mv'): RemoteSourceOverviewItem['metadata'] =>
    nextSources.reduce((counts, source) => ({
      pending: counts.pending + source[key].pending,
      searching: counts.searching + source[key].searching,
      partial: counts.partial + source[key].partial,
      ok: counts.ok + source[key].ok,
      not_found: counts.not_found + source[key].not_found,
      error: counts.error + source[key].error,
    }), emptyStatusCounts());

  return {
    ...emptyOverview(),
    sources: nextSources,
    totalSources: nextSources.length,
    enabledSources: nextSources.filter((source) => source.status === 'enabled').length,
    disabledSources: nextSources.filter((source) => source.status === 'disabled').length,
    errorSources: nextSources.filter((source) => source.status === 'error').length,
    trackCount: nextSources.reduce((total, source) => total + source.trackCount, 0),
    albumCount: nextSources.reduce((total, source) => total + source.albumCount, 0),
    artistCount: nextSources.reduce((total, source) => total + source.artistCount, 0),
    totalSizeBytes: nextSources.reduce((total, source) => total + source.totalSizeBytes, 0),
    missingTrackCount: nextSources.reduce((total, source) => total + source.missingTrackCount, 0),
    metadata: sumStatusCounts('metadata'),
    cover: sumStatusCounts('cover'),
    lyrics: sumStatusCounts('lyrics'),
    mv: sumStatusCounts('mv'),
  };
};

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

type RemoteBrowserState = {
  path: string | null;
  items: RemoteDirectoryItem[];
  indexedTracks: Record<string, RemoteTrackLookupItem>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  lookupError: string | null;
};

const emptyBrowserState = (): RemoteBrowserState => ({
  path: null,
  items: [],
  indexedTracks: {},
  loading: false,
  loaded: false,
  error: null,
  lookupError: null,
});

type RemoteBrowserFilter = 'all' | 'audio' | 'unindexed' | 'indexed';

const browserFilterOptions: Array<{ value: RemoteBrowserFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'audio', label: '音频' },
  { value: 'unindexed', label: '未索引' },
  { value: 'indexed', label: '已入库' },
];

const remoteTrackStatusLabels: Record<RemoteTrackStatus, string> = {
  pending: '待处理',
  searching: '处理中',
  partial: '部分',
  ok: '完成',
  not_found: '未找到',
  error: '异常',
};

const normalizeBrowserPath = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;
};

const rootPathForSource = (source: RemoteSource): string => {
  const rootPath = source.config.rootPath;
  return normalizeBrowserPath(typeof rootPath === 'string' ? rootPath : '/');
};

const displayPathForBrowser = (source: RemoteSource, path: string | null): string =>
  path ? normalizeBrowserPath(path) : rootPathForSource(source);

const parentBrowserPath = (source: RemoteSource, path: string | null): string | null => {
  const rootPath = rootPathForSource(source);
  const currentPath = displayPathForBrowser(source, path);
  if (currentPath === rootPath) {
    return null;
  }

  const parent = currentPath.slice(0, currentPath.lastIndexOf('/')) || '/';
  return parent === rootPath ? null : parent;
};

const browserBreadcrumbs = (source: RemoteSource, path: string | null): Array<{ label: string; path: string | null }> => {
  const rootPath = rootPathForSource(source);
  const currentPath = displayPathForBrowser(source, path);
  const relativePath = rootPath === '/'
    ? currentPath.replace(/^\/+/u, '')
    : currentPath.startsWith(`${rootPath}/`)
      ? currentPath.slice(rootPath.length + 1)
      : '';
  const crumbs: Array<{ label: string; path: string | null }> = [{ label: '根目录', path: null }];
  if (!relativePath) {
    return crumbs;
  }

  let cursor = rootPath === '/' ? '' : rootPath;
  for (const segment of relativePath.split('/').filter(Boolean)) {
    cursor = normalizeBrowserPath(`${cursor}/${segment}`);
    crumbs.push({ label: segment, path: cursor });
  }
  return crumbs;
};

const nameForDirectoryItem = (item: RemoteDirectoryItem): string => {
  if (item.name.trim()) {
    return item.name;
  }
  const normalizedPath = normalizeBrowserPath(item.path);
  return normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
};

const audioFormatFor = (item: RemoteDirectoryItem): string => {
  const name = nameForDirectoryItem(item);
  const match = name.match(/\.([a-z0-9]+)$/iu);
  return match?.[1]?.toUpperCase() ?? (item.contentType?.split('/').at(-1)?.toUpperCase() || 'AUDIO');
};

const titleForAudioItem = (item: RemoteDirectoryItem): string =>
  nameForDirectoryItem(item).replace(/\.[^.]+$/u, '').replace(/[_-]+/gu, ' ').trim() || nameForDirectoryItem(item);

const sourceQueueLabel = (source: RemoteSource): string => `网盘：${source.displayName}`;

const remoteBrowserTrackId = (source: RemoteSource, item: RemoteDirectoryItem): string =>
  `remote-browser:${source.id}:${item.path}`;

const trackFromBrowserItem = (source: RemoteSource, item: RemoteDirectoryItem): LibraryTrack => ({
  id: remoteBrowserTrackId(source, item),
  mediaType: 'remote',
  isTemporary: true,
  path: `remote://${source.id}${item.path}`,
  sourceId: source.id,
  sourceDisplayName: source.displayName,
  provider: source.provider,
  remotePath: item.path,
  stableKey: `${source.id}:${item.path}:${item.etag ?? item.modifiedAt ?? item.sizeBytes ?? 'unknown'}`,
  title: titleForAudioItem(item),
  artist: 'Unknown Artist',
  album: source.displayName,
  albumArtist: 'Unknown Artist',
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: 0,
  codec: audioFormatFor(item).toLowerCase(),
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  metadataStatus: 'pending',
  embeddedMetadataStatus: 'pending',
  embeddedCoverStatus: 'pending',
  fieldSources: {
    title: 'remote-browser',
    artist: 'remote-browser',
    album: 'remote-source',
  },
});

const trackFromLookupItem = (source: RemoteSource, track: RemoteTrackLookupItem): LibraryTrack => ({
  id: track.trackId,
  mediaType: 'remote',
  path: `remote://${source.id}${track.remotePath}`,
  sourceId: source.id,
  sourceDisplayName: source.displayName,
  provider: source.provider,
  remotePath: track.remotePath,
  stableKey: null,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.artist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: track.duration ?? 0,
  codec: track.codec,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: track.coverThumb,
  metadataStatus: track.metadataStatus,
  embeddedMetadataStatus: 'pending',
  embeddedCoverStatus: track.coverStatus === 'ok' ? 'present' : 'pending',
  fieldSources: {
    title: 'remote-index',
    artist: 'remote-index',
    album: 'remote-index',
  },
  unavailable: track.availability === 'missing',
});

const sortDirectoryItems = (items: RemoteDirectoryItem[]): RemoteDirectoryItem[] =>
  [...items].sort((left, right) => {
    const kindRank = (item: RemoteDirectoryItem): number => item.kind === 'directory' ? 0 : item.audio ? 1 : 2;
    const rankDiff = kindRank(left) - kindRank(right);
    return rankDiff !== 0 ? rankDiff : nameForDirectoryItem(left).localeCompare(nameForDirectoryItem(right), 'zh-Hans-CN');
  });

const indexedTrackMap = (tracks: RemoteTrackLookupItem[]): Record<string, RemoteTrackLookupItem> =>
  Object.fromEntries(tracks.map((track) => [track.remotePath, track]));

const shouldShowBrowserItem = (item: RemoteDirectoryItem, indexedTrack: RemoteTrackLookupItem | undefined, filter: RemoteBrowserFilter): boolean => {
  if (filter === 'audio') {
    return item.audio;
  }
  if (filter === 'indexed') {
    return item.audio && Boolean(indexedTrack);
  }
  if (filter === 'unindexed') {
    return item.audio && !indexedTrack;
  }
  return true;
};

export const RemoteSourcesPanel = (): JSX.Element => {
  const remoteApi = getRemoteSourcesBridge();
  const { appendToQueue, playTrack } = usePlaybackQueue();
  const [activeProvider, setActiveProvider] = useState<RemoteSourceProvider>('webdav');
  const [sources, setSources] = useState<RemoteSource[]>([]);
  const [overview, setOverview] = useState<RemoteSourceOverview>(() => emptyOverview());
  const [syncStatuses, setSyncStatuses] = useState<Record<string, RemoteSyncStatus>>({});
  const [jobStatuses, setJobStatuses] = useState<Record<string, RemoteBackgroundJobStatus>>({});
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [browserStates, setBrowserStates] = useState<Record<string, RemoteBrowserState>>({});
  const [browserFilter, setBrowserFilter] = useState<RemoteBrowserFilter>('all');
  const [issuePreviews, setIssuePreviews] = useState<Record<string, RemoteSourceIssueItem[]>>({});
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
  const selectedSource = useMemo(
    () => visibleSources.find((source) => source.id === selectedSourceId) ?? visibleSources[0] ?? null,
    [selectedSourceId, visibleSources],
  );
  const selectedBrowser = selectedSource ? browserStates[selectedSource.id] ?? emptyBrowserState() : null;
  const overviewBySourceId = useMemo(() => new Map(overview.sources.map((source) => [source.sourceId, source])), [overview.sources]);
  const playbackLoadReduced = globalJobStatus.playbackActive && !globalJobStatus.paused;
  const providerSummaries = useMemo(() => tabs.map((tab) => {
    const overviewSources = overview.sources.filter((source) => source.provider === tab.provider);
    const listedSources = sources.filter((source) => source.provider === tab.provider);
    const countBase = overviewSources.length > 0 ? overviewSources : listedSources.map(emptyOverviewItem);
    return {
      provider: tab.provider,
      sourceCount: Math.max(overviewSources.length, listedSources.length),
      enabledCount: listedSources.length > 0
        ? listedSources.filter((source) => source.status === 'enabled').length
        : overviewSources.filter((source) => source.status === 'enabled').length,
      errorCount: listedSources.length > 0
        ? listedSources.filter((source) => source.status === 'error').length
        : overviewSources.filter((source) => source.status === 'error').length,
      trackCount: countBase.reduce((total, source) => total + source.trackCount, 0),
      issueCount: countBase.reduce((total, source) => total + sourceIssueTotal(source), 0),
    };
  }), [overview.sources, sources]);
  const activeProviderSummary = providerSummaries.find((summary) => summary.provider === activeProvider);
  const overviewIssueCount = useMemo(() => overview.sources.reduce((total, source) => total + sourceIssueTotal(source), 0), [overview.sources]);
  const runningSyncCount = useMemo(() => Object.values(syncStatuses).filter((status) => status.status === 'running').length, [syncStatuses]);
  const queuedJobCount = useMemo(() => Object.values(jobStatuses).reduce((total, status) => total + sumKinds(status.pending) + sumKinds(status.running), 0), [jobStatuses]);
  const commandStatusLabel = globalJobStatus.paused
    ? '后台已暂停'
    : playbackLoadReduced
      ? '播放中低负载'
      : queuedJobCount > 0 || runningSyncCount > 0
        ? '正在处理'
        : '空闲待命';

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

    const [nextSources, nextOverview] = await Promise.all([
      remoteApi.list(),
      remoteApi.getOverview().catch(() => emptyOverview()),
    ]);
    setSources(nextSources);
    setOverview(nextOverview);
    await refreshStatuses(nextSources.map((source) => source.id), true);
  }, [refreshStatuses, remoteApi]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    if (visibleSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSourceId && visibleSources.some((source) => source.id === selectedSourceId)) {
      return;
    }
    setSelectedSourceId(visibleSources[0].id);
  }, [selectedSourceId, visibleSources]);

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

  const loadBrowserDirectory = useCallback(async (source: RemoteSource, path: string | null = null): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    setSelectedSourceId(source.id);
    setBrowserStates((current) => ({
      ...current,
      [source.id]: {
        ...(current[source.id] ?? emptyBrowserState()),
        path,
        items: [],
        indexedTracks: {},
        loading: true,
        error: null,
        lookupError: null,
      },
    }));

    try {
      const items = sortDirectoryItems(await remoteApi.browse(source.id, path));
      const audioPaths = items.filter((item) => item.audio).map((item) => item.path);
      let indexedTracks: Record<string, RemoteTrackLookupItem> = {};
      let lookupError: string | null = null;
      if (audioPaths.length > 0) {
        try {
          indexedTracks = indexedTrackMap(await remoteApi.lookupTracks(source.id, audioPaths));
        } catch (error) {
          lookupError = error instanceof Error ? error.message : '读取入库状态失败。';
        }
      }
      setBrowserStates((current) => ({
        ...current,
        [source.id]: {
          path,
          items,
          indexedTracks,
          loading: false,
          loaded: true,
          error: null,
          lookupError,
        },
      }));
      setMessage(lookupError
        ? `已打开 ${source.displayName}：${formatCount(items.length)} 个项目，入库状态暂未读取。`
        : `已打开 ${source.displayName}：${formatCount(items.length)} 个项目。`);
    } catch (error) {
      setBrowserStates((current) => ({
        ...current,
        [source.id]: {
          ...(current[source.id] ?? emptyBrowserState()),
          path,
          loading: false,
          loaded: true,
          error: error instanceof Error ? error.message : '读取目录失败。',
          lookupError: null,
        },
      }));
      setMessage(error instanceof Error ? error.message : '读取目录失败。');
    }
  }, [remoteApi]);

  const playBrowserItem = useCallback(async (source: RemoteSource, item: RemoteDirectoryItem, indexedTrack?: RemoteTrackLookupItem): Promise<void> => {
    const track = indexedTrack ? trackFromLookupItem(source, indexedTrack) : trackFromBrowserItem(source, item);
    setBusy(`play:${source.id}:${item.path}`);
    setMessage(null);
    try {
      await playTrack(track, {
        source: { type: 'manual', label: sourceQueueLabel(source) },
        forceNewQueueItem: true,
      });
      setMessage(`正在播放：${track.title}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '播放失败。');
    } finally {
      setBusy(null);
    }
  }, [playTrack]);

  const queueBrowserItem = useCallback((source: RemoteSource, item: RemoteDirectoryItem, indexedTrack?: RemoteTrackLookupItem): void => {
    const track = indexedTrack ? trackFromLookupItem(source, indexedTrack) : trackFromBrowserItem(source, item);
    appendToQueue(track, { type: 'manual', label: sourceQueueLabel(source) });
    setMessage(`已加入队列：${track.title}`);
  }, [appendToQueue]);

  const showSourceInSongs = useCallback((source: RemoteSource): void => {
    window.dispatchEvent(new CustomEvent('app:navigate:songs', { detail: { remoteSourceId: source.id } }));
    setMessage(`已切换到歌曲列表：${source.displayName}`);
  }, []);

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

  const runSourceAction = useCallback(async (
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
        await remoteApi.startBackgroundJobs(source.id, ['cover']);
        const latestGlobalStatus = await remoteApi.getBackgroundGlobalStatus().catch(() => globalJobStatus);
        setGlobalJobStatus(latestGlobalStatus);
        setMessage(latestGlobalStatus.playbackActive
          ? '\u5df2\u52a0\u5165\u7f3a\u5931\u5c01\u9762\u4efb\u52a1\uff1b\u64ad\u653e\u4e2d\u4f1a\u4fdd\u6301\u4f4e\u8d1f\u8f7d\uff0c\u7a7a\u95f2\u540e\u7ee7\u7eed\u5904\u7406\u3002'
          : '\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u7f3a\u5931\u5c01\u9762\u626b\u63cf\u4efb\u52a1\u3002');
        await refreshStatuses([source.id]);
        return;
      } else if (action === 'match') {
        await remoteApi.startBackgroundJobs(source.id, ['lyrics']);
        const latestGlobalStatus = await remoteApi.getBackgroundGlobalStatus().catch(() => globalJobStatus);
        setGlobalJobStatus(latestGlobalStatus);
        setMessage(latestGlobalStatus.playbackActive
          ? '\u5df2\u52a0\u5165\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\uff1b\u64ad\u653e\u4e2d\u4f1a\u4fdd\u6301\u4f4e\u8d1f\u8f7d\uff0c\u7a7a\u95f2\u540e\u7ee7\u7eed\u5904\u7406\u3002'
          : '\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\uff1b\u7f51\u76d8\u6765\u6e90\u4e0d\u518d\u6279\u91cf\u5339\u914d MV\u3002');
        await refreshStatuses([source.id]);
        return;
      } else if (action === 'retryFailed') {
        await remoteApi.retryFailedJobs(source.id, ['metadata', 'duration-backfill']);
        setMessage('\u5df2\u91cd\u8bd5\u5931\u8d25\u7684\u5143\u6570\u636e\u4efb\u52a1\uff1b\u4e0d\u518d\u91cd\u8bd5\u7f51\u76d8\u5c01\u9762\u6216 MV \u6279\u91cf\u5339\u914d\u3002');
      } else if (action === 'pauseJobs') {
        const paused = jobStatuses[source.id]?.paused === true;
        const nextStatus = paused
          ? await remoteApi.resumeBackgroundJobs(source.id)
          : await remoteApi.pauseBackgroundJobs(source.id);
        setJobStatuses((current) => ({ ...current, [source.id]: nextStatus }));
        setMessage(paused ? '\u5df2\u6062\u590d\u8be5\u6765\u6e90\u540e\u53f0\u4efb\u52a1\u3002' : '\u5df2\u6682\u505c\u8be5\u6765\u6e90\u540e\u53f0\u4efb\u52a1\u3002');
        return;
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
        setBrowserStates((current) => withoutSourceKey(source.id, current));
        setSelectedSourceId((current) => current === source.id ? null : current);
        setIssuePreviews((current) => withoutSourceKey(source.id, current));
        setOverview((current) => removeOverviewSource(current, source.id));
        window.dispatchEvent(new Event('library:changed'));
        setMessage('来源已删除，相关远程索引已移除。');
      } else if (action === 'cancel') {
        await remoteApi.cancelSync(source.id);
      } else if (action === 'browse') {
        await loadBrowserDirectory(source, null);
        return;
      }
      await refreshSources();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(null);
    }
  }, [globalJobStatus, jobStatuses, loadBrowserDirectory, refreshSources, refreshStatuses, remoteApi]);

  const showSourceIssues = async (source: RemoteSource, kind: RemoteSourceIssueKind): Promise<void> => {
    if (!remoteApi) {
      return;
    }

    const key = `issues:${kind}:${source.id}`;
    setBusy(key);
    setMessage(null);
    try {
      const items = await remoteApi.listIssues(source.id, kind, 6);
      setIssuePreviews((current) => ({ ...current, [source.id]: items }));
      setMessage(items.length > 0
        ? `已列出 ${source.displayName} 的 ${issueKindLabels[kind]} 问题。`
        : `${source.displayName} 暂时没有 ${issueKindLabels[kind]} 问题。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取问题列表失败。');
    } finally {
      setBusy(null);
    }
  };

  const renderOverview = (): JSX.Element => (
    <section className="remote-command-center" aria-label="网盘中心总览">
      <div className="remote-command-panel">
        <div className="remote-command-eyebrow">
          <ShieldCheck size={16} />
          <span>本地播放优先</span>
        </div>
        <div>
          <h3>远程库控制台</h3>
          <p>集中查看网盘索引、同步队列、异常项目和后台负载状态。</p>
        </div>
        <div className="remote-command-status-row">
          <span data-tone={globalJobStatus.paused ? 'paused' : playbackLoadReduced ? 'warning' : 'ready'}>
            <Activity size={15} />
            {commandStatusLabel}
          </span>
          <span>
            <RefreshCw size={15} />
            同步 {formatCount(runningSyncCount)}
          </span>
          <span>
            <Gauge size={15} />
            队列 {formatCount(queuedJobCount)}
          </span>
          <span data-tone={overviewIssueCount > 0 ? 'warning' : 'ready'}>
            <AlertTriangle size={15} />
            问题 {formatCount(overviewIssueCount)}
          </span>
        </div>
      </div>
      <div className="remote-overview-grid">
        <span>
          <Server size={17} />
          <em>来源</em>
          <strong>{formatCount(overview.totalSources)}</strong>
          <small>启用 {formatCount(overview.enabledSources)} / 错误 {formatCount(overview.errorSources)}</small>
        </span>
        <span>
          <Music2 size={17} />
          <em>已索引歌曲</em>
          <strong>{formatCount(overview.trackCount)}</strong>
          <small>{formatCount(overview.albumCount)} 张专辑 / {formatCount(overview.artistCount)} 位艺人</small>
        </span>
        <span>
          <HardDrive size={17} />
          <em>已知容量</em>
          <strong>{formatBytes(overview.totalSizeBytes)}</strong>
          <small>缺失 {formatCount(overview.missingTrackCount)} 首</small>
        </span>
        <span>
          <Database size={17} />
          <em>元数据完成度</em>
          <strong>{statusCompletionText(overview.metadata)}</strong>
          <small>异常 {formatCount(statusIssueCount(overview.metadata))} 首</small>
        </span>
        <span>
          <FolderOpen size={17} />
          <em>封面完成度</em>
          <strong>{statusCompletionText(overview.cover)}</strong>
          <small>失败 {formatCount(statusIssueCount(overview.cover))} 首</small>
        </span>
        <span>
          <Gauge size={17} />
          <em>后台状态</em>
          <strong>{commandStatusLabel}</strong>
          <small>{globalJobStatus.updatedAt ? formatDate(globalJobStatus.updatedAt) : '按来源任务队列执行'}</small>
        </span>
      </div>
    </section>
  );

  const renderBrowserWorkbench = (): JSX.Element | null => {
    if (!activeTab.supported || visibleSources.length === 0 || !selectedSource || !selectedBrowser) {
      return null;
    }

    const sourceOverview = overviewBySourceId.get(selectedSource.id) ?? emptyOverviewItem(selectedSource);
    const currentPath = displayPathForBrowser(selectedSource, selectedBrowser.path);
    const parentPath = parentBrowserPath(selectedSource, selectedBrowser.path);
    const canGoUp = currentPath !== rootPathForSource(selectedSource);
    const breadcrumbs = browserBreadcrumbs(selectedSource, selectedBrowser.path);
    const directoryCount = selectedBrowser.items.filter((item) => item.kind === 'directory').length;
    const audioItems = selectedBrowser.items.filter((item) => item.audio);
    const indexedAudioCount = audioItems.filter((item) => selectedBrowser.indexedTracks[item.path]).length;
    const unindexedAudioCount = Math.max(0, audioItems.length - indexedAudioCount);
    const filteredItems = selectedBrowser.items.filter((item) => shouldShowBrowserItem(item, selectedBrowser.indexedTracks[item.path], browserFilter));

    return (
      <section className="remote-browser-workbench" aria-label="网盘文件浏览器">
        <aside className="remote-browser-sources" aria-label="远程来源">
          <div className="remote-browser-panel-head">
            <strong>来源</strong>
            <span>{formatCount(visibleSources.length)} 个</span>
          </div>
          <div className="remote-browser-source-list">
            {visibleSources.map((source) => {
              const itemOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
              const state = browserStates[source.id];
              const selected = source.id === selectedSource.id;
              return (
                <button
                  key={source.id}
                  type="button"
                  className={selected ? 'active' : ''}
                  onClick={() => {
                    setSelectedSourceId(source.id);
                    if (!state?.loaded && !state?.loading) {
                      void loadBrowserDirectory(source, null);
                    }
                  }}
                >
                  <span>
                    <strong>{source.displayName}</strong>
                    <small>{providerLabels[source.provider]} · {sourceStatusLabels[source.status]}</small>
                  </span>
                  <em>{formatCount(itemOverview.trackCount)} 首</em>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="remote-file-browser">
          <div className="remote-file-browser-head">
            <div>
              <span className="remote-file-browser-eyebrow">
                <FolderOpen size={15} />
                {providerLabels[selectedSource.provider]}
              </span>
              <h3>{selectedSource.displayName}</h3>
              <p>{currentPath}</p>
            </div>
            <div className="remote-file-browser-actions">
              <button type="button" disabled={!canGoUp || selectedBrowser.loading} onClick={() => void loadBrowserDirectory(selectedSource, parentPath)}>
                <ChevronLeft size={15} />上级
              </button>
              <button type="button" disabled={selectedBrowser.loading} onClick={() => void loadBrowserDirectory(selectedSource, selectedBrowser.path)}>
                <RefreshCw size={15} />刷新目录
              </button>
              <button type="button" disabled={busy === `sync:${selectedSource.id}`} onClick={() => void runSourceAction(selectedSource, 'sync')}>
                <Database size={15} />同步索引
              </button>
            </div>
          </div>

          <div className="remote-browser-breadcrumbs" aria-label="当前目录">
            {breadcrumbs.map((crumb, index) => {
              const isCurrent = (selectedBrowser.path === null && crumb.path === null) || selectedBrowser.path === crumb.path;
              return (
                <button
                  key={`${crumb.path ?? 'root'}:${index}`}
                  type="button"
                  disabled={isCurrent || selectedBrowser.loading}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => void loadBrowserDirectory(selectedSource, crumb.path)}
                >
                  {crumb.label}
                </button>
              );
            })}
          </div>

          <div className="remote-browser-summary" aria-label={`${selectedSource.displayName} 浏览摘要`}>
            <span><Music2 size={15} />已索引 {formatCount(sourceOverview.trackCount)} 首</span>
            <span><HardDrive size={15} />容量 {formatBytes(sourceOverview.totalSizeBytes)}</span>
            <span><Gauge size={15} />{selectedSource.syncMode === 'browse' ? '仅浏览' : '可同步索引'}</span>
          </div>

          {selectedBrowser.loaded ? (
            <div className="remote-browser-toolbar" aria-label="当前目录统计和筛选">
              <div className="remote-browser-directory-stats">
                <span>文件夹 {formatCount(directoryCount)}</span>
                <span>音频 {formatCount(audioItems.length)}</span>
                <span>已入库 {formatCount(indexedAudioCount)}</span>
                <span>未索引 {formatCount(unindexedAudioCount)}</span>
              </div>
              <div className="remote-browser-filter" role="group" aria-label="文件筛选">
                {browserFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={browserFilter === option.value ? 'active' : ''}
                    onClick={() => setBrowserFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedBrowser.loading ? <p className="settings-inline-note">正在读取目录...</p> : null}
          {selectedBrowser.lookupError ? <p className="settings-inline-note">入库状态暂未读取：{selectedBrowser.lookupError}</p> : null}
          {selectedBrowser.error ? (
            <div className="remote-browser-error">
              <AlertTriangle size={16} />
              <span>{selectedBrowser.error}</span>
              <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, selectedBrowser.path)}>重试</button>
            </div>
          ) : null}
          {!selectedBrowser.loaded && !selectedBrowser.loading ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>打开文件夹浏览这个来源</strong>
                <span>这里只按需读取当前目录，不会开始全盘扫描或下载。</span>
              </div>
              <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, null)}>打开根目录</button>
            </div>
          ) : null}
          {selectedBrowser.loaded && !selectedBrowser.loading && !selectedBrowser.error && selectedBrowser.items.length === 0 ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>这个目录没有可显示项目</strong>
                <span>可以返回上级目录，或检查远程来源的根目录设置。</span>
              </div>
            </div>
          ) : null}
          {!selectedBrowser.error && selectedBrowser.loaded && selectedBrowser.items.length > 0 && filteredItems.length === 0 ? (
            <div className="remote-browser-empty">
              <FolderOpen size={22} />
              <div>
                <strong>当前筛选没有匹配项目</strong>
                <span>可以切回全部，或进入其它目录查看。</span>
              </div>
            </div>
          ) : null}
          {!selectedBrowser.error && filteredItems.length > 0 ? (
            <div className="remote-file-list" aria-label={`${selectedSource.displayName} 文件列表`}>
              {filteredItems.map((item) => {
                const itemName = nameForDirectoryItem(item);
                const isDirectory = item.kind === 'directory';
                const indexedTrack = selectedBrowser.indexedTracks[item.path];
                const playKey = `play:${selectedSource.id}:${item.path}`;
                return (
                  <div className="remote-file-row" key={item.path} data-kind={isDirectory ? 'directory' : item.audio ? 'audio' : 'file'}>
                    <div className="remote-file-row-main">
                      <span className="remote-file-kind">
                        {isDirectory ? <FolderOpen size={16} /> : item.audio ? <Music2 size={16} /> : <File size={16} />}
                      </span>
                      <div>
                        {isDirectory ? (
                          <button type="button" className="remote-file-name-button" onClick={() => void loadBrowserDirectory(selectedSource, item.path)}>
                            {itemName}
                          </button>
                        ) : indexedTrack ? (
                          <strong>{indexedTrack.title}</strong>
                        ) : (
                          <strong>{itemName}</strong>
                        )}
                        <small>
                          {isDirectory
                            ? '文件夹'
                            : indexedTrack
                              ? `${itemName} · ${indexedTrack.artist} · ${indexedTrack.album}`
                              : item.audio
                                ? `${audioFormatFor(item)} · 未索引 / 可直接播放`
                                : item.contentType ?? '普通文件'}
                          {' · '}
                          {formatBytes(item.sizeBytes ?? 0)}
                          {item.modifiedAt ? ` · ${formatDate(item.modifiedAt)}` : ''}
                        </small>
                        {indexedTrack ? (
                          <div className="remote-file-meta-strip">
                            <span data-tone="ready">已入库</span>
                            <span>元数据 {remoteTrackStatusLabels[indexedTrack.metadataStatus]}</span>
                            <span>封面 {remoteTrackStatusLabels[indexedTrack.coverStatus]}</span>
                            <span>歌词 {remoteTrackStatusLabels[indexedTrack.lyricsStatus]}</span>
                          </div>
                        ) : item.audio ? (
                          <div className="remote-file-meta-strip">
                            <span data-tone="warning">未索引</span>
                            <span>可直接播放</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="remote-file-row-actions">
                      {isDirectory ? (
                        <button type="button" onClick={() => void loadBrowserDirectory(selectedSource, item.path)}>
                          打开
                        </button>
                      ) : item.audio ? (
                        <>
                          <button type="button" disabled={busy === playKey} onClick={() => void playBrowserItem(selectedSource, item, indexedTrack)}>
                            <Play size={14} />播放
                          </button>
                          <button type="button" onClick={() => queueBrowserItem(selectedSource, item, indexedTrack)}>
                            <ListPlus size={14} />加入队列
                          </button>
                          {indexedTrack ? (
                            <button type="button" onClick={() => showSourceInSongs(selectedSource)}>
                              歌曲列表
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span>不可播放</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    );
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

      <section className="remote-source-guardrail" aria-label="远程库同步边界">
        <strong>本地播放优先</strong>
        <span>
          远程同步和封面/元数据补齐都在后台限速执行；播放活跃时会降并发。当前离线边界是索引、封面和小型元数据缓存，不会静默镜像整库音乐文件。
        </span>
      </section>

      {renderOverview()}

      <nav className="remote-source-tabs" aria-label="远程音乐库类型">
        {tabs.map((tab) => {
          const summary = providerSummaries.find((item) => item.provider === tab.provider);
          const statusText = summary && summary.sourceCount > 0
            ? `${formatCount(summary.sourceCount)} 个 · ${formatCount(summary.trackCount)} 首`
            : '未连接';
          return (
            <button key={tab.provider} type="button" className={tab.provider === activeProvider ? 'active' : ''} onClick={() => setActiveProvider(tab.provider)}>
              <span>{tab.label}</span>
              <small>{statusText}</small>
            </button>
          );
        })}
      </nav>

      {activeProviderSummary && activeProviderSummary.sourceCount > 0 ? (
        <section className="remote-provider-summary" aria-label={`${activeTab.label} 来源摘要`}>
          <span>
            <Server size={15} />
            {activeTab.label}
          </span>
          <strong>{formatCount(activeProviderSummary.sourceCount)} 个来源</strong>
          <span>启用 {formatCount(activeProviderSummary.enabledCount)}</span>
          <span>歌曲 {formatCount(activeProviderSummary.trackCount)}</span>
          <span data-tone={activeProviderSummary.issueCount > 0 || activeProviderSummary.errorCount > 0 ? 'warning' : 'ready'}>
            问题 {formatCount(activeProviderSummary.issueCount + activeProviderSummary.errorCount)}
          </span>
        </section>
      ) : null}

      {renderBrowserWorkbench()}

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
          const issuePreview = issuePreviews[source.id] ?? [];
          const sourceOverview = overviewBySourceId.get(source.id) ?? emptyOverviewItem(source);
          const running = syncStatus.status === 'running';
          const syncProgress = syncProgressFor(syncStatus);
          const metadataActive = isJobKindActive(jobStatus, 'metadata') || isJobKindActive(jobStatus, 'duration-backfill');
          const coverActive = isJobKindActive(jobStatus, 'cover');
          const lyricsActive = isJobKindActive(jobStatus, 'lyrics');
          const hasFailedMetadata = jobStatus.failed.metadata + jobStatus.failed['duration-backfill'] > 0;
          const sourcePaused = jobStatus.paused;
          const sourceDisabled = source.status === 'disabled';
          const hasDeferredPlaybackJobs = globalJobStatus.playbackActive && (jobStatus.pending.cover + jobStatus.pending.lyrics + jobStatus.pending.mv > 0);
          const recommendation = recommendationText(sourceOverview);
          const recommendedKind = recommendedIssueKind(sourceOverview);
          const metadataPercent = completionPercent(sourceOverview.metadata);
          const coverPercent = completionPercent(sourceOverview.cover);
          const lyricsPercent = completionPercent(sourceOverview.lyrics);
          const mvPercent = completionPercent(sourceOverview.mv);
          const sourceIssues = sourceIssueTotal(sourceOverview);

          return (
            <article className="remote-source-card" key={source.id}>
              <div className="remote-source-card-head">
                <div>
                  <div className="remote-source-title-line">
                    <h3>{source.displayName}</h3>
                    <span>{providerLabels[source.provider]}</span>
                  </div>
                  <p>{source.baseUrl ?? '无服务器地址'}</p>
                </div>
                <div className="remote-source-state-stack">
                  <span className={`remote-source-status remote-source-status--${source.status}`}>{sourceStatusLabels[source.status]}</span>
                  {running ? <span className="remote-source-status remote-source-status--syncing">同步中</span> : null}
                </div>
              </div>
              <div className="remote-source-health-strip" aria-label={`${source.displayName} 补齐进度`}>
                <span>
                  <em>元数据</em>
                  <strong>{completionPercentText(sourceOverview.metadata)}</strong>
                  <i style={{ width: `${metadataPercent ?? 0}%` }} />
                </span>
                <span>
                  <em>封面</em>
                  <strong>{completionPercentText(sourceOverview.cover)}</strong>
                  <i style={{ width: `${coverPercent ?? 0}%` }} />
                </span>
                <span>
                  <em>歌词</em>
                  <strong>{completionPercentText(sourceOverview.lyrics)}</strong>
                  <i style={{ width: `${lyricsPercent ?? 0}%` }} />
                </span>
                <span>
                  <em>MV</em>
                  <strong>{completionPercentText(sourceOverview.mv)}</strong>
                  <i style={{ width: `${mvPercent ?? 0}%` }} />
                </span>
                <span data-tone={sourceIssues > 0 ? 'warning' : 'ready'}>
                  <em>问题</em>
                  <strong>{sourceIssues > 0 ? `${formatCount(sourceIssues)} 项` : '干净'}</strong>
                  <i style={{ width: `${sourceIssues > 0 ? 100 : 0}%` }} />
                </span>
              </div>
              <div className="remote-source-grid">
                <span><em>已索引歌曲</em><strong>{formatCount(sourceOverview.trackCount)}</strong></span>
                <span><em>专辑 / 艺人</em><strong>{formatCount(sourceOverview.albumCount)} / {formatCount(sourceOverview.artistCount)}</strong></span>
                <span><em>已知容量</em><strong>{formatBytes(sourceOverview.totalSizeBytes)}</strong></span>
                <span><em>缺失文件</em><strong>{formatCount(sourceOverview.missingTrackCount)}</strong></span>
                <span><em>上次测试</em><strong>{formatDate(source.lastTestAt)}</strong></span>
                <span><em>上次同步</em><strong>{formatDate(source.lastSyncAt)}</strong></span>
                <span><em>同步模式</em><strong>{syncModeLabels[source.syncMode]}</strong></span>
                <span><em>问题项</em><strong>{formatCount(sourceIssueTotal(sourceOverview))}</strong></span>
                <span><em>后台并发</em><strong>scan {readConfigNumber(source, 'scanConcurrency', 3)} / metadata {readConfigNumber(source, 'metadataConcurrency', 2)} / cover {readConfigNumber(source, 'coverConcurrency', readConfigNumber(source, 'metadataConcurrency', 2))}</strong></span>
              </div>
              {source.lastError ? <p className="settings-inline-note">错误：{source.lastError}</p> : null}
              <div className="remote-sync-status">
                <span>阶段：<strong>{phaseLabels[syncStatus.phase] ?? syncStatus.phase}</strong></span>
                <span>发现：<strong>{syncStatus.discoveredCount}</strong></span>
                <span>成功写入：<strong>{syncStatus.writtenCount}</strong></span>
                <span>跳过：<strong>{syncStatus.skippedCount}</strong></span>
                <span>失败：<strong>{syncStatus.failedCount}</strong></span>
              </div>
              <div className="remote-sync-status">
                <span>元数据：<strong>{statusCompletionText(sourceOverview.metadata)}</strong></span>
                <span>封面：<strong>{statusCompletionText(sourceOverview.cover)}</strong></span>
                <span>歌词：<strong>{statusCompletionText(sourceOverview.lyrics)}</strong></span>
                <span>MV：<strong>{statusCompletionText(sourceOverview.mv)}</strong></span>
              </div>
              {recommendation ? (
                <div className="remote-source-recommendation">
                  <span>{recommendation}</span>
                  {recommendedKind ? (
                    <button type="button" disabled={busy === `issues:${recommendedKind}:${source.id}`} onClick={() => void showSourceIssues(source, recommendedKind)}>
                      查看{issueKindLabels[recommendedKind]}问题
                    </button>
                  ) : null}
                </div>
              ) : null}
              {(syncStatus.failedCount > 0 || hasFailedMetadata) ? (
                <p className="settings-inline-note">
                  有失败项时优先重试元数据/时长任务；封面、歌词和 MV 仍按小批量后台任务处理，避免拖慢本地播放。
                </p>
              ) : null}
              {hasDeferredPlaybackJobs ? (
                <p className="settings-inline-note">
                  播放中，封面和歌词等后台任务已低负载等待，空闲后会继续处理。
                </p>
              ) : null}
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
              {issuePreview.length > 0 ? (
                <div className="remote-issue-list" aria-label={`${source.displayName} 问题预览`}>
                  {issuePreview.map((item) => (
                    <span key={`${item.kind}:${item.id}`}>
                      <em>{issueKindLabels[item.kind]} · {item.status}</em>
                      <strong>{item.title || item.remotePath}</strong>
                      <small>{item.artist || '未知艺人'} · {item.remotePath}</small>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="remote-source-actions">
                <div className="remote-source-action-group" aria-label="连接和同步">
                  <button type="button" disabled={busy === `test:${source.id}`} onClick={() => void runSourceAction(source, 'test')}>
                    <Wifi size={15} />测试
                  </button>
                  <button type="button" disabled={busy === `sync:${source.id}`} data-state={running ? 'active' : undefined} aria-pressed={running} onClick={() => void runSourceAction(source, 'sync')}>
                    <RefreshCw size={15} />同步
                  </button>
                  <button type="button" disabled={busy === `browse:${source.id}`} onClick={() => void runSourceAction(source, 'browse')}>
                    <FolderOpen size={15} />浏览文件夹
                  </button>
                  {running ? <button type="button" onClick={() => void runSourceAction(source, 'cancel')}>取消</button> : null}
                </div>
                <div className="remote-source-action-group" aria-label="后台补齐">
                  <button type="button" disabled={busy === `metadata:${source.id}`} data-state={metadataActive ? 'active' : undefined} aria-pressed={metadataActive} onClick={() => void runSourceAction(source, 'metadata')}>
                    <RefreshCw size={15} />补齐元数据
                  </button>
                  <button type="button" disabled={busy === `cover:${source.id}`} data-state={coverActive ? 'active' : undefined} aria-pressed={coverActive} onClick={() => void runSourceAction(source, 'cover')}>
                    <RefreshCw size={15} />加载封面
                  </button>
                  <button type="button" disabled={busy === `match:${source.id}`} data-state={lyricsActive ? 'active' : undefined} aria-pressed={lyricsActive} onClick={() => void runSourceAction(source, 'match')}>
                    <Play size={15} />匹配歌词
                  </button>
                  <button type="button" disabled={busy === `retryFailed:${source.id}`} data-state={hasFailedMetadata ? 'active' : undefined} aria-pressed={hasFailedMetadata} onClick={() => void runSourceAction(source, 'retryFailed')}>
                    <RotateCcw size={15} />仅重试失败元数据
                  </button>
                  <button type="button" disabled={busy === `pauseJobs:${source.id}`} data-state={sourcePaused ? 'paused' : undefined} aria-pressed={sourcePaused} onClick={() => void runSourceAction(source, 'pauseJobs')}>
                    <PauseCircle size={15} />{sourcePaused ? '恢复后台任务' : '暂停后台任务'}
                  </button>
                </div>
                <div className="remote-source-action-group" aria-label="来源管理">
                  <button type="button" data-state={sourceDisabled ? 'off' : undefined} aria-pressed={sourceDisabled} onClick={() => void runSourceAction(source, 'toggle')}>
                    <Check size={15} />{source.status === 'disabled' ? '启用' : '禁用'}
                  </button>
                  <button type="button" onClick={() => void runSourceAction(source, 'delete')}>
                    <Trash2 size={15} />删除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {activeTab.supported && visibleSources.length === 0 ? (
          <section className="remote-source-empty" aria-label={`${activeTab.label} 空状态`}>
            <HardDrive size={22} />
            <div>
              <strong>还没有 {activeTab.label} 来源</strong>
              <span>添加后会出现在这里，并显示索引、问题、同步和后台补齐状态。</span>
            </div>
          </section>
        ) : null}
      </section>

      <section className="remote-source-card">
        <div className="remote-source-card-head">
          <div>
            <h3>后台任务</h3>
            <p>播放时会自动降低远程后台负载，优先保证播放稳定；空闲后会自动恢复。</p>
            {playbackLoadReduced ? (
              <p className="settings-inline-note">
                播放中，后台任务已降低负载：元数据和时长保留单并发，封面和歌词会在空闲后继续。
              </p>
            ) : null}
          </div>
          <span className="remote-source-status">{globalJobStatus.paused ? '已暂停' : playbackLoadReduced ? '低负载运行' : '运行中'}</span>
        </div>
        <div className="remote-background-summary" aria-label="远程后台任务摘要">
          <span><Activity size={15} />同步 {formatCount(runningSyncCount)}</span>
          <span><Gauge size={15} />队列 {formatCount(queuedJobCount)}</span>
          <span><ShieldCheck size={15} />{playbackLoadReduced ? '播放保护中' : '常规限速'}</span>
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
          <button type="button" data-state={globalJobStatus.paused ? 'paused' : undefined} aria-pressed={globalJobStatus.paused} onClick={() => remoteApi?.setBackgroundPaused(!globalJobStatus.paused).then(setGlobalJobStatus)}>
            {globalJobStatus.paused ? '恢复后台任务' : '全局暂停后台任务'}
          </button>
        </div>
      </section>

      {message ? <p className="settings-inline-note">{message}</p> : null}
    </div>
  );
};
