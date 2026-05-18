import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Check, ChevronDown, Image as ImageIcon, ListFilter, Play, RefreshCw, Search } from 'lucide-react';
import type { LibraryArtist, LibrarySort } from '../../shared/types/library';
import { ArtistDetailView } from '../components/artist/ArtistDetailView';
import { artistMark } from '../components/artist/artistVisual';
import { LibrarySourceSwitch } from '../components/library/LibrarySourceSwitch';
import { InfiniteScrollSentinel, readPageScrollTop, writePageScrollTop } from '../components/ui/InfiniteScrollSentinel';
import { MediaWallScrollSpacer, useMediaWallScrollSpacer } from '../components/ui/MediaWallScrollSpacer';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import type { DetailReturnTarget } from '../utils/albumNavigation';
import { artistDetailNavigationEvent, consumePendingArtistDetailNavigation } from '../utils/artistNavigation';
import { readStoredLibrarySourceMode, writeStoredLibrarySourceMode, type LibrarySourceMode } from '../utils/librarySourceMode';

const pageSize = 96;
const artistSortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'library.sort.default' },
  { value: 'titleAsc', labelKey: 'library.artists.sort.nameAsc' },
  { value: 'titleDesc', labelKey: 'library.artists.sort.nameDesc' },
  { value: 'frequent', labelKey: 'library.artists.sort.frequent' },
  { value: 'createdAsc', labelKey: 'library.sort.createdAsc' },
  { value: 'createdDesc', labelKey: 'library.sort.createdDesc' },
  { value: 'random', labelKey: 'library.sort.random' },
];

const hasArtistAvatar = (artist: LibraryArtist): boolean => Boolean(artist.avatarUrl || artist.avatarThumbUrl);

const prioritizeArtistsWithAvatars = (items: LibraryArtist[]): LibraryArtist[] =>
  [...items].sort((left, right) => Number(hasArtistAvatar(right)) - Number(hasArtistAvatar(left)));

const artistMeta = (artist: LibraryArtist, t: (key: TranslationKey, options?: Record<string, string | number>) => string): string => {
  const parts: string[] = [];

  if (artist.trackCount > 0) {
    parts.push(t('library.artists.meta.tracks', { count: artist.trackCount }));
  }

  if (artist.albumCount > 0) {
    parts.push(t('library.artists.meta.albums', { count: artist.albumCount }));
  }

  return parts.join(' / ') || t('library.artists.meta.noTracks');
};

export const ArtistsPage = (): JSX.Element => {
  const { t } = useI18n();
  const [artists, setArtists] = useState<LibraryArtist[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const [sourceMode, setSourceModeState] = useState<LibrarySourceMode>(() => readStoredLibrarySourceMode());
  const [prioritizeArtistAvatars, setPrioritizeArtistAvatars] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<LibraryArtist | null>(null);
  const [selectedArtistReturnTo, setSelectedArtistReturnTo] = useState<DetailReturnTarget | null>(null);
  const [artistWallAlbumArtwork, setArtistWallAlbumArtwork] = useState(false);
  const [artistWallAlbumFallbackForMissingAvatars, setArtistWallAlbumFallbackForMissingAvatars] = useState(false);
  const [artistImagesAutoFetch, setArtistImagesAutoFetch] = useState(false);
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Record<string, string>>({});
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const pageScrollTopRef = useRef(0);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const shouldRestorePageScrollRef = useRef(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const requestedArtistImageIdsRef = useRef(new Set<string>());
  const { wallRef: artistWallRef, spacerHeight } = useMediaWallScrollSpacer<HTMLElement>({
    itemCount: artists.length,
    totalCount: total,
    minColumnWidth: 128,
    columnGap: 22,
    rowGap: 30,
    estimatedItemHeight: 174,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!isSortOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isSortOpen]);

  const loadArtists = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      if (mode === 'append' && isLoadingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const library = window.echo?.library;

        if (!library?.getArtists) {
          setArtists([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError(t('library.artists.error.desktopBridge'));
          return;
        }

        const result = await library.getArtists({
          page: nextPage,
          pageSize,
          search,
          sort,
          sourceProvider: sourceMode,
          ...(prioritizeArtistAvatars ? { prioritizeArtistAvatars: true } : {}),
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setArtists((current) => {
          const next = mode === 'append' ? [...current, ...result.items] : result.items;
          return prioritizeArtistAvatars ? prioritizeArtistsWithAvatars(next) : next;
        });
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (requestIdRef.current === requestId) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [prioritizeArtistAvatars, search, sort, sourceMode, t],
  );

  const setSourceMode = useCallback((mode: LibrarySourceMode): void => {
    setSourceModeState(mode);
    writeStoredLibrarySourceMode(mode);
  }, []);

  useEffect(() => {
    void loadArtists(1, 'replace');
  }, [loadArtists]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      writePageScrollTop(pageRootRef.current, 0);
      void loadArtists(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadArtists]);

  useLayoutEffect(() => {
    writePageScrollTop(pageRootRef.current, 0);
  }, [prioritizeArtistAvatars, search, sort, sourceMode]);

  useLayoutEffect(() => {
    if (selectedArtist || !shouldRestorePageScrollRef.current) {
      return;
    }

    writePageScrollTop(pageRootRef.current, pageScrollTopRef.current);
    shouldRestorePageScrollRef.current = false;
  }, [selectedArtist]);

  useEffect(() => {
    const loadSettings = (): void => {
      const app = window.echo?.app;

      if (!app?.getSettings) {
        setArtistWallAlbumArtwork(false);
        setArtistWallAlbumFallbackForMissingAvatars(false);
        return;
      }

      void app
        .getSettings()
        .then((settings) => {
          setArtistWallAlbumArtwork(settings.artistWallAlbumArtwork === true);
          setArtistWallAlbumFallbackForMissingAvatars(settings.artistWallAlbumFallbackForMissingAvatars === true);
          setArtistImagesAutoFetch(settings.autoFetchArtistImages === true);
        })
        .catch(() => {
          setArtistWallAlbumArtwork(false);
          setArtistWallAlbumFallbackForMissingAvatars(false);
          setArtistImagesAutoFetch(false);
        });
    };

    loadSettings();
    window.addEventListener('settings:changed', loadSettings);
    return () => window.removeEventListener('settings:changed', loadSettings);
  }, []);

  const handleLoadMoreArtists = useCallback((): void => {
    if (isLoadingRef.current || !hasMore) {
      return;
    }

    void loadArtists(page + 1, 'append');
  }, [hasMore, loadArtists, page]);

  const handleRefresh = useCallback((): void => {
    writePageScrollTop(pageRootRef.current, 0);
    void loadArtists(1, 'replace');
  }, [loadArtists]);

  const applyUpdatedArtist = useCallback((updatedArtist: LibraryArtist): void => {
    setArtists((current) => {
      let changed = false;
      const next = current.map((artist) => {
        if (artist.id !== updatedArtist.id) {
          return artist;
        }

        changed = true;
        return updatedArtist;
      });

      return changed ? (prioritizeArtistAvatars ? prioritizeArtistsWithAvatars(next) : next) : current;
    });
    setSelectedArtist((current) => (current?.id === updatedArtist.id ? updatedArtist : current));
  }, [prioritizeArtistAvatars]);

  useEffect(() => {
    const library = window.echo?.library;

    if (!library?.onArtistImagesUpdated || !library?.getArtist) {
      return undefined;
    }

    return library.onArtistImagesUpdated((payload) => {
      if (!payload.artistId) {
        return;
      }

      void library
        .getArtist(payload.artistId)
        .then((updatedArtist) => {
          if (updatedArtist) {
            applyUpdatedArtist(updatedArtist);
          }
        })
        .catch(() => undefined);
    });
  }, [applyUpdatedArtist]);

  useEffect(() => {
    if (!artistImagesAutoFetch || artists.length === 0) {
      return;
    }

    const library = window.echo?.library;
    if (!library?.refreshVisibleArtistImages) {
      return;
    }

    const candidates = artists
      .filter((artist) => {
        if (artist.avatarThumbUrl || requestedArtistImageIdsRef.current.has(artist.id)) {
          return false;
        }

        return artist.avatarStatus !== 'not_found' && artist.avatarStatus !== 'error' && artist.avatarStatus !== 'rate_limited';
      })
      .slice(0, pageSize);

    if (candidates.length === 0) {
      return;
    }

    for (const artist of candidates) {
      requestedArtistImageIdsRef.current.add(artist.id);
    }

    void library.refreshVisibleArtistImages(candidates.map((artist) => ({ id: artist.id, name: artist.name }))).catch(() => undefined);
  }, [artistImagesAutoFetch, artists]);

  const handleArtistCoverError = useCallback((artist: LibraryArtist, failedUrl: string | null): void => {
    if (!failedUrl) {
      return;
    }

    setFailedCoverUrls((current) =>
      current[artist.id] === failedUrl
        ? current
        : {
            ...current,
            [artist.id]: failedUrl,
          },
    );
  }, []);

  const handleArtistAvatarError = useCallback((artist: LibraryArtist, failedUrl: string | null): void => {
    if (!failedUrl) {
      return;
    }

    setFailedAvatarUrls((current) =>
      current[artist.id] === failedUrl
        ? current
        : {
            ...current,
            [artist.id]: failedUrl,
          },
    );
  }, []);

  const handleRefreshArtistAvatar = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, artist: LibraryArtist): void => {
      event.preventDefault();
      event.stopPropagation();

      if (!artistImagesAutoFetch) {
        return;
      }

      const library = window.echo?.library;
      if (!library?.refreshArtistImage || !library?.getArtist) {
        return;
      }

      setFailedAvatarUrls((current) => {
        const next = { ...current };
        delete next[artist.id];
        return next;
      });

      void library
        .refreshArtistImage(artist.id, true)
        .then(() => library.getArtist(artist.id))
        .then((updatedArtist) => {
          if (updatedArtist) {
            applyUpdatedArtist(updatedArtist);
          }
        })
        .catch(() => undefined);
    },
    [applyUpdatedArtist, artistImagesAutoFetch],
  );

  const openArtistDetail = useCallback((artist: LibraryArtist, returnTo: DetailReturnTarget | null = null): void => {
    pageScrollTopRef.current = readPageScrollTop(pageRootRef.current);
    shouldRestorePageScrollRef.current = !returnTo;
    setSelectedArtistReturnTo(returnTo);
    setSelectedArtist(artist);
  }, []);

  useEffect(() => {
    const pendingRequest = consumePendingArtistDetailNavigation();
    if (pendingRequest) {
      openArtistDetail(pendingRequest.artist, pendingRequest.returnTo ?? null);
    }

    const handleNavigateArtistDetail = (event: Event): void => {
      const request = (event as CustomEvent<{ artist?: LibraryArtist; returnTo?: DetailReturnTarget }>).detail;
      if (request?.artist) {
        consumePendingArtistDetailNavigation();
        openArtistDetail(request.artist, request.returnTo ?? null);
      }
    };

    window.addEventListener(artistDetailNavigationEvent, handleNavigateArtistDetail);
    return () => window.removeEventListener(artistDetailNavigationEvent, handleNavigateArtistDetail);
  }, [openArtistDetail]);

  const handleBackFromArtistDetail = useCallback((): void => {
    if (selectedArtistReturnTo === 'songs') {
      window.dispatchEvent(new Event('app:navigate:songs'));
      return;
    }

    setSelectedArtistReturnTo(null);
    setSelectedArtist(null);
  }, [selectedArtistReturnTo]);

  const handleArtistKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, artist: LibraryArtist): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openArtistDetail(artist);
    }
  }, [openArtistDetail]);

  if (selectedArtist) {
    return <ArtistDetailView artist={selectedArtist} onBack={handleBackFromArtistDetail} />;
  }

  return (
    <div className="artists-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>{t('library.artists.title')}</h1>
          <span>{t('library.count.total', { count: total })}</span>
        </div>
        <button className="tool-button album-refresh" type="button" aria-label={t('library.action.refresh')} title={t('library.action.refresh')} onClick={handleRefresh}>
          <RefreshCw size={17} />
        </button>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={t('library.artists.searchPlaceholder')}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <div className="artist-control-actions">
          <LibrarySourceSwitch value={sourceMode} onChange={setSourceMode} />

          <button
            className="sort-button artist-avatar-priority-toggle"
            type="button"
            aria-pressed={prioritizeArtistAvatars}
            title={t('library.artists.avatarPriority')}
            onClick={() => setPrioritizeArtistAvatars((current) => !current)}
          >
            <ImageIcon className="sort-button-icon" size={16} aria-hidden="true" />
            <span className="sort-button-label">{t('library.artists.avatarPriority')}</span>
          </button>

          <div className="sort-select" ref={sortMenuRef}>
            <button
              className="sort-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isSortOpen}
              onClick={() => setIsSortOpen((current) => !current)}
            >
              <ListFilter className="sort-button-icon" size={16} aria-hidden="true" />
              <span className="sort-button-label">{t(artistSortOptions.find((option) => option.value === sort)?.labelKey ?? 'library.sort.default')}</span>
              <ChevronDown className="sort-button-chevron" size={15} aria-hidden="true" />
            </button>
            {isSortOpen ? (
              <div className="sort-menu" role="listbox" aria-label={t('library.artists.sort.aria')}>
                {artistSortOptions.map((option) => (
                  <button
                    key={option.value}
                    className="sort-option"
                    type="button"
                    role="option"
                    aria-selected={sort === option.value}
                    onClick={() => {
                      setSort(option.value);
                      setIsSortOpen(false);
                    }}
                  >
                    <span>{t(option.labelKey)}</span>
                    {sort === option.value ? <Check size={14} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={pageRootRef} className="media-wall-scroll-shell page-scroll-container">
        <section ref={artistWallRef} className="artist-wall" aria-label={t('library.artists.listAria')}>
          {artists.map((artist) => {
            const avatarImageUrl = artist.avatarUrl ?? artist.avatarThumbUrl ?? null;
            const shouldShowAvatar = Boolean(
              avatarImageUrl && failedAvatarUrls[artist.id] !== avatarImageUrl,
            );
            const shouldUseMissingAvatarFallback = artist.avatarStatus === 'not_found'
              || artist.avatarStatus === 'error'
              || artist.avatarStatus === 'rate_limited'
              || Boolean(avatarImageUrl && failedAvatarUrls[artist.id] === avatarImageUrl);
            const shouldShowCover = Boolean(
              !shouldShowAvatar
                && (artistWallAlbumArtwork || (artistWallAlbumFallbackForMissingAvatars && shouldUseMissingAvatarFallback))
                && artist.coverThumb
                && failedCoverUrls[artist.id] !== artist.coverThumb,
            );
            const imageUrl = shouldShowAvatar ? avatarImageUrl : shouldShowCover ? artist.coverThumb : null;
            const avatarSrcSet = shouldShowAvatar && artist.avatarThumbUrl && artist.avatarUrl && artist.avatarThumbUrl !== artist.avatarUrl
              ? `${artist.avatarThumbUrl} 192w, ${artist.avatarUrl} 1024w`
              : undefined;

            return (
              <article
                className="artist-card"
                data-cover={Boolean(imageUrl)}
                key={artist.id}
                role="button"
                tabIndex={0}
                onClick={() => openArtistDetail(artist)}
                onKeyDown={(event) => handleArtistKeyDown(event, artist)}
              >
                <div className="artist-avatar" data-cover={Boolean(imageUrl)} data-visual={shouldShowAvatar ? 'avatar' : shouldShowCover ? 'cover' : 'letter'} aria-hidden="true">
                  {imageUrl ? (
                    <img
                      alt=""
                      decoding="async"
                      draggable={false}
                      height={384}
                      loading="lazy"
                      sizes="124px"
                      src={imageUrl}
                      srcSet={avatarSrcSet}
                      width={384}
                      onError={() => {
                        if (shouldShowAvatar) {
                          handleArtistAvatarError(artist, imageUrl);
                        } else {
                          handleArtistCoverError(artist, imageUrl);
                        }
                      }}
                    />
                  ) : (
                    <span>{artistMark(artist.name)}</span>
                  )}
                </div>
                {artistImagesAutoFetch ? (
                  <button
                    className="artist-avatar-refresh"
                    type="button"
                    aria-label={`Refresh avatar for ${artist.name}`}
                    title="Refresh artist avatar"
                    onClick={(event) => handleRefreshArtistAvatar(event, artist)}
                  >
                    <RefreshCw size={13} />
                  </button>
                ) : null}
                <div className="artist-copy">
                  <strong>{artist.name}</strong>
                  <small>{artistMeta(artist, t)}</small>
                </div>
                <span className="artist-card-action" aria-hidden="true">
                  <Play size={14} fill="currentColor" />
                </span>
              </article>
            );
          })}
        </section>
        <InfiniteScrollSentinel canLoadMore={hasMore} isLoading={isLoading} onLoadMore={handleLoadMoreArtists} />

        {error || isLoading ? (
          <div className="list-footer">
            <span>{error ?? t('library.artists.loading')}</span>
          </div>
        ) : null}
        <MediaWallScrollSpacer height={spacerHeight} />
      </div>
    </div>
  );
};
