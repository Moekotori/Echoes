import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Disc3, Folder, FolderOpen, ListPlus, RefreshCw, Search, UserRound } from 'lucide-react';
import type {
  LibraryInboxBatch,
  LibraryInboxFilterKind,
  LibraryInboxIssueReason,
  LibraryInboxScope,
  LibraryInboxTrackItem,
  LibraryInboxTrackPage,
} from '../../shared/types/library';
import { getLibraryBridge } from '../utils/echoBridge';

const pageSize = 60;

const emptyInboxPage = (scope: LibraryInboxScope, filter: LibraryInboxFilterKind): LibraryInboxTrackPage => ({
  items: [],
  page: 1,
  pageSize,
  total: 0,
  hasMore: false,
  batches: [],
  selectedBatch: null,
  scope,
  filter,
  facets: {
    folders: [],
    albums: [],
    artists: [],
  },
});

const filterOptions: Array<{ value: LibraryInboxFilterKind; label: string }> = [
  { value: 'all', label: '全部新增' },
  { value: 'missing_cover', label: '缺封面' },
  { value: 'metadata_issue', label: '资料异常' },
  { value: 'unknown_artist', label: '未知艺人' },
  { value: 'unknown_album', label: '未知专辑' },
];

const reasonLabels: Record<LibraryInboxIssueReason, string> = {
  missing_cover: '缺封面',
  missing_title: '缺标题',
  missing_artist: '缺艺人',
  missing_album: '缺专辑',
  missing_album_artist: '缺专辑艺人',
  missing_track_no: '缺音轨号',
  missing_disc_no: '缺碟号',
  missing_year: '缺年份',
  missing_genre: '缺流派',
  unknown_artist: '未知艺人',
  filename_fallback: '文件名回退',
  unknown_field: '未知字段',
  metadata_fallback: '元数据回退',
  unknown_album: '未知专辑',
  embedded_metadata_error: '内嵌标签读取失败',
  embedded_cover_error: '内嵌封面读取失败',
  network_metadata_candidate: '网络元数据候选',
  network_cover_candidate: '网络封面候选',
};

const formatReason = (reason: LibraryInboxIssueReason): string => reasonLabels[reason] ?? reason;

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return '尚无记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const folderLabel = (batch: LibraryInboxBatch | null): string => batch?.folderName ?? '最近新增';

const batchSelectValue = (scope: LibraryInboxScope, batchId: string | null): string =>
  scope === 'all' ? '__all__' : scope === 'latest' ? '__latest__' : batchId ?? '__latest__';

const readTrackPath = (item: LibraryInboxTrackItem): string => item.track.path;

export const InboxPage = (): JSX.Element => {
  const [scope, setScope] = useState<LibraryInboxScope>('latest');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryInboxFilterKind>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [album, setAlbum] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pageData, setPageData] = useState<LibraryInboxTrackPage>(() => emptyInboxPage('latest', 'all'));
  const [items, setItems] = useState<LibraryInboxTrackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadInbox = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      const library = getLibraryBridge();
      if (!library?.getLibraryInboxTracks) {
        setPageData(emptyInboxPage(scope, filter));
        setItems([]);
        setError('桌面桥接暂不可用，无法读取新歌收件箱。');
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const result = await library.getLibraryInboxTracks({
          scope,
          batchId: scope === 'batch' ? batchId : null,
          filter,
          folderId,
          album,
          artist,
          page: nextPage,
          pageSize,
          search,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setPageData(result);
        setItems((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setPageData(emptyInboxPage(scope, filter));
          setItems([]);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [album, artist, batchId, filter, folderId, scope, search],
  );

  useEffect(() => {
    void loadInbox(1, 'replace');
  }, [loadInbox]);

  useEffect(() => {
    const unsubscribe = getLibraryBridge()?.onLibraryChanged?.(() => {
      void loadInbox(1, 'replace');
    });

    return () => unsubscribe?.();
  }, [loadInbox]);

  const selectedBatch = pageData.selectedBatch;
  const hasFilters = filter !== 'all' || Boolean(folderId || album || artist || search);
  const visibleCount = items.length;

  const selectedScopeLabel = useMemo(() => {
    if (scope === 'all') {
      return '最近全部扫描';
    }
    if (scope === 'latest') {
      return '最新扫描';
    }
    return selectedBatch ? folderLabel(selectedBatch) : '指定扫描';
  }, [scope, selectedBatch]);

  const handleSelectBatch = (value: string): void => {
    setMessage(null);
    setFolderId(null);
    setAlbum(null);
    setArtist(null);

    if (value === '__all__') {
      setScope('all');
      setBatchId(null);
      return;
    }
    if (value === '__latest__') {
      setScope('latest');
      setBatchId(null);
      return;
    }

    setScope('batch');
    setBatchId(value);
  };

  const handleCreatePlaylist = useCallback(async (): Promise<void> => {
    const library = getLibraryBridge();
    if (!library?.createPlaylistFromLibraryInbox) {
      setError('桌面桥接暂不可用，无法生成歌单。');
      return;
    }

    setIsCreatingPlaylist(true);
    setMessage(null);
    setError(null);

    try {
      const result = await library.createPlaylistFromLibraryInbox({
        scope,
        batchId: scope === 'batch' ? batchId : null,
        filter,
        folderId,
        album,
        artist,
        search,
      });
      const suffix = result.truncated ? `，已按性能保护加入前 ${result.limit} 首` : '';
      setMessage(`已生成歌单「${result.playlist.name}」，加入 ${result.addedCount} 首${suffix}。`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [album, artist, batchId, filter, folderId, scope, search]);

  const handleOpenTrack = useCallback(async (trackId: string): Promise<void> => {
    const library = getLibraryBridge();
    if (!library?.openTrackInFolder) {
      setError('桌面桥接暂不可用，无法定位歌曲。');
      return;
    }

    try {
      await library.openTrackInFolder(trackId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }, []);

  const clearFilters = (): void => {
    setFilter('all');
    setFolderId(null);
    setAlbum(null);
    setArtist(null);
    setSearchInput('');
    setSearch('');
    setMessage(null);
  };

  return (
    <div className="inbox-page">
      <header className="inbox-hero">
        <div className="inbox-hero-copy">
          <span className="panel-kicker">Library Inbox</span>
          <h1>新歌收件箱</h1>
          <div className="inbox-hero-meta">
            <span>{selectedScopeLabel}</span>
            <span>{formatDateTime(selectedBatch?.finishedAt ?? pageData.batches[0]?.finishedAt)}</span>
          </div>
        </div>
        <div className="inbox-stats" aria-label="新歌收件箱摘要">
          <span>
            <strong>{pageData.total}</strong>
            <em>当前结果</em>
          </span>
          <span>
            <strong>{selectedBatch?.addedCount ?? pageData.batches.reduce((sum, batch) => sum + batch.addedCount, 0)}</strong>
            <em>新增歌曲</em>
          </span>
          <span>
            <strong>{selectedBatch?.missingCoverCount ?? pageData.batches.reduce((sum, batch) => sum + batch.missingCoverCount, 0)}</strong>
            <em>缺封面</em>
          </span>
        </div>
      </header>

      <section className="inbox-toolbar" aria-label="新歌收件箱筛选">
        <label className="inbox-select-field">
          <span>批次</span>
          <select value={batchSelectValue(scope, batchId)} onChange={(event) => handleSelectBatch(event.target.value)}>
            <option value="__latest__">最新扫描</option>
            <option value="__all__">最近全部扫描</option>
            {pageData.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.folderName} · {batch.addedCount}
              </option>
            ))}
          </select>
        </label>

        <label className="inbox-search-field">
          <Search size={16} />
          <input
            aria-label="搜索新歌收件箱"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索标题、艺人、专辑、路径"
            type="search"
            value={searchInput}
          />
        </label>

        <button className="inbox-icon-button" disabled={isLoading} onClick={() => void loadInbox(1, 'replace')} title="刷新收件箱" type="button">
          <RefreshCw size={17} />
        </button>
        <button
          className="inbox-command-button"
          disabled={isCreatingPlaylist || pageData.total === 0}
          onClick={() => void handleCreatePlaylist()}
          type="button"
        >
          <ListPlus size={17} />
          <span>生成歌单</span>
        </button>
      </section>

      <section className="inbox-filter-row" aria-label="问题分类筛选">
        {filterOptions.map((option) => (
          <button
            className="list-filter-chip"
            data-active={filter === option.value ? 'true' : undefined}
            key={option.value}
            onClick={() => {
              setMessage(null);
              setFilter(option.value);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
        {hasFilters ? (
          <button className="list-filter-chip" onClick={clearFilters} type="button">
            清空筛选
          </button>
        ) : null}
      </section>

      <section className="inbox-facet-row" aria-label="新歌收件箱维度筛选">
        <label>
          <Folder size={15} />
          <select value={folderId ?? ''} onChange={(event) => setFolderId(event.target.value || null)}>
            <option value="">全部文件夹</option>
            {pageData.facets.folders.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} · {facet.count}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Disc3 size={15} />
          <select value={album ?? ''} onChange={(event) => setAlbum(event.target.value || null)}>
            <option value="">全部专辑</option>
            {pageData.facets.albums.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} · {facet.count}
              </option>
            ))}
          </select>
        </label>
        <label>
          <UserRound size={15} />
          <select value={artist ?? ''} onChange={(event) => setArtist(event.target.value || null)}>
            <option value="">全部艺人</option>
            {pageData.facets.artists.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.label} · {facet.count}
              </option>
            ))}
          </select>
        </label>
      </section>

      {message ? <div className="inbox-notice">{message}</div> : null}
      {error ? (
        <div className="inbox-notice inbox-notice--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="inbox-list" aria-label="新歌列表" data-loading={isLoading ? 'true' : undefined}>
        {items.length === 0 ? (
          <div className="inbox-empty-state">
            <strong>{isLoading ? '正在读取收件箱...' : pageData.batches.length === 0 ? '还没有新增记录' : '没有匹配的新歌'}</strong>
            <span>{pageData.batches.length === 0 ? '完成一次曲库扫描后，这里会出现新增歌曲。' : '换个筛选条件再看看。'}</span>
          </div>
        ) : (
          items.map((item) => (
            <article className="inbox-track-row" key={`${item.batchId}:${item.track.id}`}>
              <div className="inbox-track-cover" data-empty={!item.track.coverThumb ? 'true' : undefined}>
                {item.track.coverThumb ? <img alt="" loading="lazy" src={item.track.coverThumb} /> : <Disc3 size={20} />}
              </div>
              <div className="inbox-track-main">
                <div className="inbox-track-title">
                  <strong>{item.track.title}</strong>
                  <span>{formatDateTime(item.addedAt)}</span>
                </div>
                <div className="inbox-track-meta">
                  <span>{item.track.artist || 'Unknown Artist'}</span>
                  <span>{item.track.album || 'Unknown Album'}</span>
                </div>
                <div className="inbox-track-path">{readTrackPath(item)}</div>
                {item.reasons.length > 0 ? (
                  <div className="inbox-reason-row">
                    {item.reasons.slice(0, 4).map((reason) => (
                      <span key={reason}>{formatReason(reason)}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="inbox-icon-button" onClick={() => void handleOpenTrack(item.track.id)} title="定位歌曲" type="button">
                <FolderOpen size={17} />
              </button>
            </article>
          ))
        )}
      </section>

      {pageData.hasMore ? (
        <button className="inbox-load-more" disabled={isLoading} onClick={() => void loadInbox(pageData.page + 1, 'append')} type="button">
          {isLoading ? '正在读取...' : `继续加载 ${visibleCount}/${pageData.total}`}
        </button>
      ) : null}
    </div>
  );
};
