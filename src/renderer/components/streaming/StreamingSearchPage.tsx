import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Captions, Check, ChevronDown, Clock3, ListPlus, Loader2, MoreHorizontal, Play, Radio, Search, Sparkles, Video } from 'lucide-react';
import type { LibraryTrack } from '../../../shared/types/library';
import type {
  StreamingAudioQuality,
  StreamingLyricsResult,
  StreamingMediaType,
  StreamingProviderDescriptor,
  StreamingProviderName,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { streamingStableKey } from '../../../shared/types/streaming';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { getStreamingBridge } from '../../utils/echoBridge';
import {
  readStreamingSearchMemory,
  updateStreamingSearchMemory,
  type StreamingQualityPreference,
} from './streamingSearchMemory';

const pageSize = 30;
const tabs: Array<{ key: StreamingMediaType; label: string }> = [
  { key: 'track', label: '单曲' },
  { key: 'album', label: '专辑' },
  { key: 'artist', label: '歌手' },
  { key: 'playlist', label: '歌单' },
  { key: 'mv', label: 'MV' },
];
type QualityPreference = StreamingQualityPreference;

const qualities: Array<{ key: QualityPreference; label: string; description: string }> = [
  { key: 'max', label: 'Max', description: '默认最高音质' },
  { key: 'high', label: '高音质', description: '320kbps 优先' },
  { key: 'standard', label: '标准', description: '兼容更好' },
  { key: 'lossless', label: '无损', description: '优先 FLAC' },
  { key: 'hires', label: 'Hi-Res', description: '平台可用时启用' },
];

const defaultCover = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#eaf1f8"/><circle cx="31" cy="32" r="12" fill="#9fb6cc"/><path d="M28 67c11-19 25-25 42-9" fill="none" stroke="#5f7f9d" stroke-width="8" stroke-linecap="round"/></svg>',
)}`;

const providerPriority: StreamingProviderName[] = ['netease', 'qqmusic', 'mock'];

const formatDuration = (duration: number | null): string => {
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const statusText = (provider: StreamingProviderDescriptor): string => {
  if (!provider.enabled) {
    return '未启用';
  }
  if (provider.requiresAccount && !provider.accountConnected) {
    return '未登录';
  }
  return provider.accountDisplayName ? `已登录 ${provider.accountDisplayName}` : '可用';
};

const qualityToPlaybackQuality = (quality: QualityPreference): StreamingAudioQuality =>
  quality === 'max' ? 'hires' : quality;

const streamingTrackToLibraryTrack = (track: StreamingTrack, quality: QualityPreference): LibraryTrack => ({
  id: track.stableKey || streamingStableKey(track.provider, track.providerTrackId),
  mediaType: 'streaming',
  path: track.stableKey,
  provider: track.provider,
  providerTrackId: track.providerTrackId,
  streamingQuality: qualityToPlaybackQuality(quality),
  stableKey: track.stableKey,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist ?? track.artist,
  trackNo: null,
  discNo: null,
  year: null,
  genre: null,
  duration: track.duration ?? 0,
  codec: null,
  sampleRate: null,
  bitDepth: null,
  bitrate: null,
  coverId: null,
  coverThumb: track.coverThumb ?? defaultCover,
  fieldSources: {
    title: track.provider,
    artist: track.provider,
    album: track.provider,
  },
  unavailable: !track.playable,
});

export const StreamingSearchPage = (): JSX.Element => {
  const queue = usePlaybackQueue();
  const initialMemory = readStreamingSearchMemory();
  const [providers, setProviders] = useState<StreamingProviderDescriptor[]>([]);
  const [provider, setProvider] = useState<StreamingProviderName>(initialMemory.provider);
  const [quality, setQuality] = useState<QualityPreference>(initialMemory.quality);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StreamingMediaType>(initialMemory.activeTab);
  const [input, setInput] = useState(initialMemory.input);
  const [query, setQuery] = useState(initialMemory.query);
  const [result, setResult] = useState<StreamingSearchResult | null>(initialMemory.result);
  const [lyrics, setLyrics] = useState<StreamingLyricsResult | null>(null);
  const [lyricsTrackKey, setLyricsTrackKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingTrackKey, setResolvingTrackKey] = useState<string | null>(null);
  const [queuedTrackKey, setQueuedTrackKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>(initialMemory.failedCoverUrls);
  const requestIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const providerOptions = useMemo(
    () => (providers.length > 0 ? providers : [{ name: 'mock' as const, displayName: 'Mock', enabled: true, supportsSearch: true, supportsLyrics: true, supportsMv: true, requiresAccount: false }]),
    [providers],
  );
  const currentProvider = providerOptions.find((item) => item.name === provider) ?? providerOptions[0];
  const currentQuality = qualities.find((item) => item.key === quality) ?? qualities[0];
  const source = useMemo(() => ({ type: 'streaming' as const, label: `Streaming / ${currentProvider?.displayName ?? provider}`, provider }), [currentProvider?.displayName, provider]);
  const tracks = result?.tracks ?? [];
  const currentStableKey = queue.currentTrack?.mediaType === 'streaming' ? queue.currentTrack.stableKey ?? queue.currentTrack.id : null;
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 86,
    overscan: 8,
  });

  useEffect(() => {
    updateStreamingSearchMemory({
      provider,
      quality,
      activeTab,
      input,
      query,
      result,
      failedCoverUrls,
    });
  }, [activeTab, failedCoverUrls, input, provider, quality, query, result]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return undefined;
    }

    const memory = readStreamingSearchMemory();
    if (memory.scrollTop > 0) {
      element.scrollTop = memory.scrollTop;
    }

    const handleScroll = (): void => {
      updateStreamingSearchMemory({ scrollTop: element.scrollTop });
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [tracks.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const streaming = getStreamingBridge();
    if (!streaming?.getProviders) {
      return;
    }

    void streaming
      .getProviders()
      .then((items) => {
        setProviders(items);
        const currentEnabled = items.some((item) => item.name === provider && item.enabled);
        if (!currentEnabled) {
          setProvider(providerPriority.find((name) => items.some((item) => item.name === name && item.enabled)) ?? items.find((item) => item.enabled)?.name ?? 'mock');
        }
      })
      .catch(() => undefined);
  }, [provider]);

  const runSearch = useCallback(
    async (nextPage: number, mode: 'replace' | 'append'): Promise<void> => {
      const streaming = getStreamingBridge();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setActionError(null);
      setActionMessage(null);
      setLyrics(null);
      setLyricsTrackKey(null);

      if (!streaming) {
        setResult(null);
        setError('桌面桥接不可用，请在 ECHO Next 客户端中使用流媒体。');
        return;
      }

      if (!query) {
        setResult(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextResult = await streaming.search({
          provider,
          query,
          mediaTypes: [activeTab],
          page: nextPage,
          pageSize,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setResult((current) =>
          mode === 'append' && current
            ? {
                ...nextResult,
                tracks: [...current.tracks, ...nextResult.tracks],
              }
            : nextResult,
        );
      } catch (searchError) {
        if (requestIdRef.current === requestId) {
          setError(searchError instanceof Error ? searchError.message : '流媒体服务暂时不可用');
          setResult(null);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [activeTab, provider, query],
  );

  useEffect(() => {
    void runSearch(1, 'replace');
  }, [runSearch]);

  useEffect(() => {
    setFailedCoverUrls({});
  }, [provider, query]);

  const handleCoverError = useCallback((track: StreamingTrack, coverUrl: string): void => {
    if (coverUrl === defaultCover) {
      return;
    }

    setFailedCoverUrls((current) => (current[track.stableKey] === coverUrl ? current : { ...current, [track.stableKey]: coverUrl }));
  }, []);

  const handlePlay = useCallback(
    async (track: StreamingTrack): Promise<void> => {
      if (resolvingTrackKey === track.stableKey) {
        return;
      }

      if (!track.playable) {
      setActionError(track.unavailableReason ?? '这首歌暂时不可播放');
        setActionMessage(null);
        return;
      }

      setActionError(null);
      setActionMessage(null);
      setResolvingTrackKey(track.stableKey);
      try {
        await queue.playTrack(streamingTrackToLibraryTrack(track, quality), {
          source,
          forceNewQueueItem: true,
        });
      } catch (playError) {
        setActionError(playError instanceof Error ? playError.message : '流媒体服务暂时不可用');
      } finally {
        setResolvingTrackKey(null);
      }
    },
    [quality, queue, resolvingTrackKey, source],
  );

  const handleAddToQueue = useCallback(
    (track: StreamingTrack): void => {
      if (!track.playable) {
        setActionError(track.unavailableReason ?? '这首歌暂时不可播放');
        setActionMessage(null);
        return;
      }

      setActionError(null);
      setActionMessage('已加入队列');
      queue.appendToQueue(streamingTrackToLibraryTrack(track, quality), source);
      setQueuedTrackKey(track.stableKey);
      window.setTimeout(() => setQueuedTrackKey((current) => (current === track.stableKey ? null : current)), 1400);
    },
    [quality, queue, source],
  );

  const handlePlayNext = useCallback(
    (track: StreamingTrack): void => {
      if (!track.playable) {
        setActionError(track.unavailableReason ?? '这首歌暂时不可播放');
        setActionMessage(null);
        return;
      }

      setActionError(null);
      setActionMessage('已加入下一首');
      queue.playTrackNext(streamingTrackToLibraryTrack(track, quality), source);
      setQueuedTrackKey(track.stableKey);
      window.setTimeout(() => setQueuedTrackKey((current) => (current === track.stableKey ? null : current)), 1400);
    },
    [quality, queue, source],
  );

  const handleLyrics = useCallback(async (track: StreamingTrack): Promise<void> => {
    const streaming = getStreamingBridge();
    if (!streaming?.getLyrics) {
      setActionError('桌面桥接不可用，无法加载流媒体歌词。');
      setActionMessage(null);
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setLyricsTrackKey(track.stableKey);
    setLyrics(null);
    try {
      setLyrics(
        await streaming.getLyrics({
          provider: track.provider,
          providerTrackId: track.providerTrackId,
        }),
      );
    } catch (lyricsError) {
      setActionError(lyricsError instanceof Error ? lyricsError.message : '暂时找不到这首歌的歌词');
      setActionMessage(null);
    }
  }, []);

  const handleMv = useCallback(async (track: StreamingTrack): Promise<void> => {
    const streaming = getStreamingBridge();
    if (!streaming?.getMv) {
      setActionError('桌面桥接不可用，无法加载流媒体 MV。');
      setActionMessage(null);
      return;
    }

    setActionError(null);
    setActionMessage(null);
    try {
      const mv = await streaming.getMv({
        provider: track.provider,
        providerTrackId: track.providerTrackId,
      });
      setActionMessage(mv.items.length > 0 ? `已找到 ${mv.items.length} 个 MV 候选，MV 播放面板接入已预留。` : '这首歌暂时没有可用 MV。');
    } catch (mvError) {
      setActionError(mvError instanceof Error ? mvError.message : '暂时找不到这首歌的 MV');
      setActionMessage(null);
    }
  }, []);

  return (
    <div className="streaming-page streaming-hub">
      <header className="streaming-hero">
        <div className="streaming-hero-copy">
          <span className="streaming-kicker">
            <Radio size={16} />
            Streaming Hub
          </span>
          <h1>发现、排队、播放流媒体音乐</h1>
          <p>网易云音乐和 QQ 音乐通过主进程接入，播放地址只在播放前临时解析。</p>
        </div>
      </header>

      <section className="streaming-command-bar">
        <label className="search-box streaming-search-box">
          <Search size={19} />
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="搜索歌曲、歌手、专辑" />
        </label>
        <div className="streaming-provider-tabs" aria-label="流媒体平台">
          {providerOptions.map((item) => (
            <button key={item.name} type="button" data-active={item.name === provider} disabled={!item.enabled} onClick={() => setProvider(item.name)}>
              <span>{item.displayName}</span>
              <small>{statusText(item)}</small>
            </button>
          ))}
        </div>
        <div className="streaming-quality-select">
          <button type="button" aria-expanded={qualityMenuOpen} onClick={() => setQualityMenuOpen((open) => !open)}>
            <span>音质</span>
            <strong>{currentQuality.label}</strong>
            <ChevronDown size={15} />
          </button>
          {qualityMenuOpen ? (
            <div className="streaming-quality-menu" role="listbox" aria-label="音质">
              {qualities.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={item.key === quality}
                  onClick={() => {
                    setQuality(item.key);
                    setQualityMenuOpen(false);
                  }}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {item.key === quality ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <nav className="streaming-result-tabs" aria-label="结果类型">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" data-active={tab.key === activeTab} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <div className="streaming-state streaming-state--error">{error}</div> : null}
      {actionError ? <div className="streaming-state streaming-state--error">{actionError}</div> : null}
      {actionMessage ? <div className="streaming-state streaming-state--success">{actionMessage}</div> : null}
      {isLoading && tracks.length === 0 ? <div className="streaming-state">正在搜索...</div> : null}
      {!isLoading && query && tracks.length === 0 && !error ? <div className="streaming-state">没有找到匹配的流媒体歌曲。</div> : null}
      {!query ? <div className="streaming-state">输入关键词开始搜索。播放时才会解析真实地址，队列不会保存临时 URL。</div> : null}

      <div className="streaming-results-shell">
        {activeTab !== 'track' ? (
          <div className="streaming-state streaming-state--quiet">
            <Sparkles size={18} />
            {activeTab === 'mv' ? 'MV 搜索入口已预留，首版先稳定单曲播放链路。' : '这个分类的正式视图已预留，首版先稳定单曲播放链路。'}
          </div>
        ) : (
          <div ref={listRef} className="streaming-results" aria-busy={isLoading}>
            <div className="streaming-virtual-spacer" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const track = tracks[virtualItem.index];
                const isPlaying = currentStableKey === track.stableKey;
                const isResolving = resolvingTrackKey === track.stableKey;
                const isQueued = queuedTrackKey === track.stableKey;
                const disabled = !track.playable || Boolean(resolvingTrackKey);
                const rawCoverSrc = track.coverThumb ?? defaultCover;
                const coverSrc = failedCoverUrls[track.stableKey] === rawCoverSrc ? defaultCover : rawCoverSrc;

                return (
                  <div
                    key={track.stableKey}
                    ref={virtualizer.measureElement}
                    className="streaming-virtual-row"
                    data-index={virtualItem.index}
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <article className="streaming-row" data-playing={isPlaying} data-unavailable={!track.playable}>
                      <div className="streaming-cover" data-empty={coverSrc === defaultCover}>
                        <img
                          src={coverSrc}
                          alt=""
                          decoding="async"
                          draggable={false}
                          height={56}
                          loading="lazy"
                          width={56}
                          onError={() => handleCoverError(track, coverSrc)}
                        />
                      </div>
                      <div className="streaming-main">
                        <div className="streaming-title-line">
                          {isPlaying ? <span className="playing-dot" /> : null}
                          <strong>{track.title}</strong>
                          {isPlaying ? <em>正在播放</em> : null}
                        </div>
                        <span>
                          {track.artist} / {track.album}
                        </span>
                        <small>{track.playable ? `${track.provider} · ${track.qualities.join(' / ') || 'standard'}` : (track.unavailableReason ?? '这首歌暂时不可播放')}</small>
                      </div>
                      <span className="streaming-duration">{formatDuration(track.duration)}</span>
                      <div className="streaming-actions">
                        <button type="button" title="播放" onClick={() => void handlePlay(track)} disabled={disabled}>
                          {isResolving ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} />}
                        </button>
                        <button type="button" title="加入队列" onClick={() => handleAddToQueue(track)} disabled={!track.playable}>
                          {isQueued ? <Check size={16} /> : <ListPlus size={16} />}
                        </button>
                        <button type="button" title="下一首播放" onClick={() => handlePlayNext(track)} disabled={!track.playable}>
                          <Clock3 size={16} />
                        </button>
                        <button type="button" title="查看歌词" onClick={() => void handleLyrics(track)}>
                          <Captions size={16} />
                        </button>
                        <button type="button" title="查看 MV" onClick={() => void handleMv(track)} disabled={track.mvStatus === 'missing'}>
                          <Video size={16} />
                        </button>
                        <button type="button" title="更多" disabled>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                      {isResolving ? <div className="streaming-resolving">正在解析播放地址...</div> : null}
                      {lyricsTrackKey === track.stableKey && lyrics ? (
                        <pre className="streaming-lyrics">{lyrics.plainLyrics ?? lyrics.syncedLyrics ?? (lyrics.lines.map((line) => line.text).join('\n') || '暂时没有歌词。')}</pre>
                      ) : null}
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'track' && result?.hasMore ? (
        <button className="streaming-load-more" type="button" onClick={() => void runSearch((result.page ?? 1) + 1, 'append')} disabled={isLoading}>
          {isLoading ? '加载中...' : '加载更多'}
        </button>
      ) : null}
    </div>
  );
};
