// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RemoteSourcesPanel } from './RemoteSourcesPanel';
import type {
  RemoteBackgroundGlobalStatus,
  RemoteBackgroundJobKind,
  RemoteBackgroundJobStatus,
  RemoteSource,
  RemoteSyncStatus,
} from '../../../shared/types/remoteSources';

const remoteApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  test: vi.fn(),
  browse: vi.fn(),
  sync: vi.fn(),
  cancelSync: vi.fn(),
  getSyncStatus: vi.fn(),
  createStreamUrl: vi.fn(),
  startBackgroundJobs: vi.fn(),
  pauseBackgroundJobs: vi.fn(),
  resumeBackgroundJobs: vi.fn(),
  getJobStatus: vi.fn(),
  retryFailedJobs: vi.fn(),
  setBackgroundPaused: vi.fn(),
  getBackgroundGlobalStatus: vi.fn(),
  updateRuntimeLimits: vi.fn(),
}));

vi.mock('../../utils/echoBridge', () => ({
  getRemoteSourcesBridge: () => remoteApiMocks,
}));

const jobKinds: RemoteBackgroundJobKind[] = ['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill'];

const remoteSource = (overrides: Partial<RemoteSource> = {}): RemoteSource => ({
  id: 'source-1',
  provider: 'webdav',
  displayName: 'Mock AList',
  status: 'enabled',
  baseUrl: 'http://127.0.0.1:18080/dav',
  username: 'user',
  authType: 'basic',
  config: { rootPath: '/音乐 Space/', scanConcurrency: 2, metadataConcurrency: 1, coverConcurrency: 3 },
  syncMode: 'index',
  lastTestAt: null,
  lastSyncAt: null,
  lastError: null,
  indexedTrackCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const syncStatus = (sourceId = 'source-1'): RemoteSyncStatus => ({
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

const jobStatus = (sourceId = 'source-1'): RemoteBackgroundJobStatus => {
  const empty = Object.fromEntries(jobKinds.map((kind) => [kind, 0])) as Record<RemoteBackgroundJobKind, number>;
  return {
    sourceId,
    paused: false,
    concurrency: { metadata: 2, cover: 2, lyrics: 1, mv: 1, 'duration-backfill': 1 },
    pending: empty,
    running: empty,
    completed: empty,
    failed: empty,
    skipped: empty,
    current: [],
    lastError: null,
    updatedAt: null,
  };
};

const globalStatus = (): RemoteBackgroundGlobalStatus => ({
  paused: false,
  playbackActive: false,
  concurrency: { metadata: 2, cover: 2, lyrics: 1, mv: 1, 'duration-backfill': 1 },
  updatedAt: null,
});

describe('RemoteSourcesPanel', () => {
  let sources: RemoteSource[] = [];

  beforeEach(() => {
    sources = [];
    for (const mock of Object.values(remoteApiMocks)) {
      mock.mockReset();
    }
    remoteApiMocks.list.mockImplementation(() => Promise.resolve(sources));
    remoteApiMocks.create.mockImplementation(async (input) => {
      const source = remoteSource({
        id: 'created-source',
        displayName: input.displayName,
        baseUrl: input.baseUrl,
        username: input.username,
        authType: input.authType,
        config: input.config,
        syncMode: input.syncMode,
      });
      sources = [source];
      return source;
    });
    remoteApiMocks.update.mockImplementation(async (input) => {
      sources = sources.map((source) => (source.id === input.id ? { ...source, ...input } : source));
      return sources.find((source) => source.id === input.id) ?? remoteSource(input);
    });
    remoteApiMocks.delete.mockImplementation(async (sourceId) => {
      sources = sources.filter((source) => source.id !== sourceId);
    });
    remoteApiMocks.test.mockResolvedValue({
      ok: true,
      status: 'enabled',
      message: '连接成功。',
      testedAt: '2026-01-01T00:00:00.000Z',
    });
    remoteApiMocks.browse.mockResolvedValue([
      {
        sourceId: 'source-1',
        provider: 'webdav',
        path: '/音乐 Space/Echo Song.mp3',
        name: 'Echo Song.mp3',
        kind: 'file',
        sizeBytes: 16,
        modifiedAt: null,
        etag: null,
        contentType: 'audio/mpeg',
        audio: true,
      },
    ]);
    remoteApiMocks.sync.mockResolvedValue(syncStatus('created-source'));
    remoteApiMocks.cancelSync.mockResolvedValue(syncStatus());
    remoteApiMocks.getSyncStatus.mockImplementation((sourceId) => Promise.resolve(syncStatus(sourceId)));
    remoteApiMocks.getJobStatus.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.startBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.pauseBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.resumeBackgroundJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.retryFailedJobs.mockImplementation((sourceId) => Promise.resolve(jobStatus(sourceId)));
    remoteApiMocks.setBackgroundPaused.mockResolvedValue(globalStatus());
    remoteApiMocks.getBackgroundGlobalStatus.mockResolvedValue(globalStatus());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tests and saves a WebDAV source with the configured root path', async () => {
    const { container } = render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Mock AList' } });
    fireEvent.change(inputs[1], { target: { value: 'http://127.0.0.1:18080/dav' } });
    fireEvent.change(inputs[2], { target: { value: 'user' } });
    fireEvent.change(inputs[3], { target: { value: 'secret' } });
    fireEvent.change(inputs[4], { target: { value: '/音乐 Space/' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(screen.getAllByText(/连接成功/u).length).toBeGreaterThan(0));
    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      displayName: 'Mock AList',
      baseUrl: 'http://127.0.0.1:18080/dav',
      username: 'user',
      secret: 'secret',
      config: expect.objectContaining({ rootPath: '/音乐 Space/', coverConcurrency: 2 }),
    }));

    fireEvent.click(screen.getByRole('button', { name: /保存并同步/u }));
    await waitFor(() => expect(remoteApiMocks.create).toHaveBeenCalled());
    expect(remoteApiMocks.sync).toHaveBeenCalledWith('created-source');
  });

  it('submits unauthenticated WebDAV when credentials are blank', async () => {
    const { container } = render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Open WebDAV' } });
    fireEvent.change(inputs[1], { target: { value: 'http://127.0.0.1:18080/dav' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalled());

    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      displayName: 'Open WebDAV',
      baseUrl: 'http://127.0.0.1:18080/dav',
      username: null,
      secret: null,
      authType: 'none',
    }));
  });

  it('keeps Basic WebDAV auth when username has an empty password', async () => {
    const { container } = render(<RemoteSourcesPanel />);
    await waitFor(() => expect(remoteApiMocks.list).toHaveBeenCalled());

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Empty Password WebDAV' } });
    fireEvent.change(inputs[1], { target: { value: 'http://127.0.0.1:18080/dav' } });
    fireEvent.change(inputs[2], { target: { value: 'user-no-pass' } });
    fireEvent.change(inputs[3], { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /测试连接/u }));
    await waitFor(() => expect(remoteApiMocks.test).toHaveBeenCalled());

    expect(remoteApiMocks.test).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'webdav',
      username: 'user-no-pass',
      secret: '',
      authType: 'basic',
    }));
  });

  it('shows browse previews and confirms before deleting an existing source', async () => {
    sources = [remoteSource()];
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<RemoteSourcesPanel />);

    await screen.findByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /^浏览$/u }));
    await screen.findByText('/音乐 Space/Echo Song.mp3');
    expect(remoteApiMocks.browse).toHaveBeenCalledWith('source-1');

    fireEvent.click(screen.getByRole('button', { name: /删除/u }));
    expect(remoteApiMocks.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /删除/u }));
    await waitFor(() => expect(remoteApiMocks.delete).toHaveBeenCalledWith('source-1'));
  });

  it('starts a cover scan for missing remote covers', async () => {
    sources = [remoteSource()];
    render(<RemoteSourcesPanel />);

    await screen.findByText('Mock AList');
    expect(remoteApiMocks.list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /加载封面/u }));

    await waitFor(() => expect(remoteApiMocks.startBackgroundJobs).toHaveBeenCalledWith('source-1', ['cover']));
    await screen.findByText('\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u7f3a\u5931\u5c01\u9762\u626b\u63cf\u4efb\u52a1\u3002');
    expect(remoteApiMocks.list).toHaveBeenCalledTimes(1);
  });

  it('keeps remote matching and retry actions lightweight', async () => {
    sources = [remoteSource()];
    render(<RemoteSourcesPanel />);

    await screen.findByText('Mock AList');

    fireEvent.click(screen.getByRole('button', { name: /\u5339\u914d\u6b4c\u8bcd/u }));
    await waitFor(() => expect(remoteApiMocks.startBackgroundJobs).toHaveBeenCalledWith('source-1', ['lyrics']));
    await screen.findByText('\u5df2\u52a0\u5165\u4e00\u5c0f\u6279\u6b4c\u8bcd\u5339\u914d\u4efb\u52a1\uff1b\u7f51\u76d8\u6765\u6e90\u4e0d\u518d\u6279\u91cf\u5339\u914d MV\u3002');
    expect(remoteApiMocks.startBackgroundJobs).not.toHaveBeenCalledWith('source-1', ['lyrics', 'mv']);

    fireEvent.click(screen.getByRole('button', { name: /\u4ec5\u91cd\u8bd5\u5931\u8d25\u5143\u6570\u636e/u }));
    await waitFor(() => expect(remoteApiMocks.retryFailedJobs).toHaveBeenCalledWith('source-1', ['metadata', 'duration-backfill']));
    expect(remoteApiMocks.retryFailedJobs).not.toHaveBeenCalledWith('source-1', ['metadata', 'cover', 'lyrics', 'mv', 'duration-backfill']);
  });

  it('marks active, paused, and disabled remote controls visually', async () => {
    sources = [remoteSource({ status: 'disabled' })];
    const status = jobStatus();
    remoteApiMocks.getJobStatus.mockResolvedValue({
      ...status,
      paused: true,
      pending: { ...status.pending, cover: 2 },
    });
    remoteApiMocks.resumeBackgroundJobs.mockResolvedValue({ ...status, paused: false });
    render(<RemoteSourcesPanel />);

    await screen.findByText('Mock AList');
    const coverButton = screen.getByRole('button', { name: /加载封面/u });
    expect(coverButton.getAttribute('data-state')).toBe('active');
    expect(coverButton.getAttribute('aria-pressed')).toBe('true');

    const pauseButton = screen.getByRole('button', { name: /恢复后台任务/u });
    expect(pauseButton.getAttribute('data-state')).toBe('paused');
    fireEvent.click(pauseButton);
    await waitFor(() => expect(remoteApiMocks.resumeBackgroundJobs).toHaveBeenCalledWith('source-1'));

    const enableButton = screen.getByRole('button', { name: /启用/u });
    expect(enableButton.getAttribute('data-state')).toBe('off');
  });

  it('removes a deleted source from local state even if the refresh fails', async () => {
    sources = [remoteSource()];
    remoteApiMocks.list
      .mockImplementationOnce(() => Promise.resolve(sources))
      .mockImplementation(() => Promise.reject(new Error('refresh failed')));
    remoteApiMocks.delete.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RemoteSourcesPanel />);

    await screen.findByText('Mock AList');
    fireEvent.click(screen.getByRole('button', { name: /删除/u }));

    await waitFor(() => expect(remoteApiMocks.delete).toHaveBeenCalledWith('source-1'));
    await waitFor(() => expect(screen.queryByText('Mock AList')).toBeNull());
  });
});
