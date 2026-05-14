import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Database,
  ExternalLink,
  FileVideo,
  FolderOpen,
  Globe2,
  GripVertical,
  Link2,
  MonitorPlay,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { MvMatchCandidate, MvProviderId, MvSettings, NetworkMvProviderId, TrackVideo } from '../../../shared/types/mv';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';

type MvSettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

const drawerExitAnimationMs = 320;
const formatScore = (score: number): string => `${Math.round(score * 100)}%`;
const formatThreshold = (threshold: number | undefined): string => `${Math.round((threshold ?? 0.7) * 100)}%`;
const thresholdFromPercent = (value: string): number => Math.max(50, Math.min(100, Math.round(Number(value)))) / 100;
const immersiveBackgroundDefaults = {
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
  lyricsReadabilityEnhanced: false,
} satisfies Partial<MvSettings>;

const fallbackSettings: MvSettings = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  autoApplyThreshold: 0.7,
  immersiveBackground: true,
  ...immersiveBackgroundDefaults,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
  allow60fps: true,
};

const providerLabels: Record<NetworkMvProviderId, string> = {
  bilibili: 'Bilibili',
  youtube: 'YouTube',
};

const dispatchSettingsChanged = (patch: Partial<MvSettings>): void => {
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: patch }));
};

const qualityCaps: MvSettings['maxQuality'][] = ['720p', '1080p', '1440p', '2160p', 'max'];

const formatVideoTitle = (video: TrackVideo | null, emptyLabel: string): string => {
  if (!video) {
    return emptyLabel;
  }

  return video.title?.trim() || video.sourceId?.trim() || emptyLabel;
};

const formatVideoQuality = (video: TrackVideo | null, emptyLabel: string): string => {
  if (!video) {
    return emptyLabel;
  }

  const resolutionLabel = video.height
    ? video.height >= 4320
      ? '8K'
      : video.height >= 2160
        ? '4K'
        : `${video.height}p`
    : video.width
      ? `${video.width}px`
      : null;
  const baseLabel = video.qualityLabel ?? resolutionLabel;

  if (!baseLabel) {
    return emptyLabel;
  }

  return video.fps && video.fps >= 55 ? `${baseLabel} / 60fps` : baseLabel;
};

const videoToCandidate = (video: TrackVideo): MvMatchCandidate => ({
  id: video.id,
  provider: video.provider,
  sourceType: video.sourceType,
  title: video.title ?? video.sourceId ?? video.id,
  artist: video.artist,
  filePath: video.filePath,
  url: video.url,
  providerUrl: video.providerUrl,
  thumbnailUrl: video.thumbnailUrl,
  uploader: null,
  viewCount:
    video.rawProviderJson && typeof video.rawProviderJson === 'object' && !Array.isArray(video.rawProviderJson) && typeof (video.rawProviderJson as { viewCount?: unknown }).viewCount === 'number'
      ? (video.rawProviderJson as { viewCount: number }).viewCount
      : null,
  availableQualities: [],
  durationSeconds: video.durationSeconds,
  score: video.score,
  playableInApp: video.playableInApp,
  reasons: [],
});

export const MvSettingsDrawer = ({ isOpen, onClose }: MvSettingsDrawerProps): JSX.Element | null => {
  const { t } = useI18n();
  const queue = usePlaybackQueue();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isMotionOpen, setIsMotionOpen] = useState(false);
  const [fallbackTrackId, setFallbackTrackId] = useState<string | null>(null);
  const [settings, setSettings] = useState<MvSettings>(fallbackSettings);
  const [selectedVideo, setSelectedVideo] = useState<TrackVideo | null>(null);
  const [candidates, setCandidates] = useState<MvMatchCandidate[]>([]);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMaxQualityMenuOpen, setIsMaxQualityMenuOpen] = useState(false);
  const [useCurrentSongName, setUseCurrentSongName] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [customMvUrl, setCustomMvUrl] = useState('');
  const [failedThumbnailIds, setFailedThumbnailIds] = useState<Set<string>>(() => new Set());
  const [draggedProvider, setDraggedProvider] = useState<NetworkMvProviderId | null>(null);
  const [dragOverProvider, setDragOverProvider] = useState<NetworkMvProviderId | null>(null);

  const activeTrackId = queue.currentTrackId ?? fallbackTrackId;
  const activeTrack =
    queue.currentTrack ??
    (activeTrackId ? queue.tracks.find((item) => item.id === activeTrackId) ?? null : null) ??
    (queue.lastPlayedTrack?.id === activeTrackId ? queue.lastPlayedTrack : null);
  const activeTrackSearchName = activeTrack ? [activeTrack.title, activeTrack.artist || activeTrack.albumArtist].filter(Boolean).join(' ') : '';
  const activeTrackTitle = useMemo(() => {
    return activeTrack ? `${activeTrack.title} - ${activeTrack.artist || activeTrack.albumArtist}` : activeTrackId ? activeTrackId : t('mvSettings.status.noActiveTrack');
  }, [activeTrack, activeTrackId, t]);

  const qualityLabels = useMemo<Record<MvSettings['maxQuality'], string>>(
    () => ({
      '720p': '720p',
      '1080p': '1080p',
      '1440p': '1440p',
      '2160p': '4K',
      max: t('mvSettings.quality.max'),
    }),
    [t],
  );

  const providerLabel = useCallback(
    (provider: MvProviderId): string => {
      if (provider === 'local') {
        return t('mvSettings.provider.local');
      }

      if (provider === 'bilibili' || provider === 'youtube') {
        return providerLabels[provider];
      }

      return provider;
    },
    [t],
  );

  const providerLabelForVideo = useCallback(
    (video: TrackVideo | null): string => {
      if (!video) {
        return t('mvSettings.status.none');
      }

      return providerLabel(video.provider);
    },
    [providerLabel, t],
  );

  const enabledProviders = new Set(settings.enabledProviders);
  const isMvEnabled = settings.enabled !== false;
  const followMusicProgress = settings.restartAudioOnLoad;
  const immersiveBackground = settings.immersiveBackground !== false;

  const notifyMvChanged = useCallback((trackId: string): void => {
    window.dispatchEvent(new CustomEvent('mv:changed', { detail: { trackId } }));
  }, []);

  const resolveSelectedStreams = useCallback(async (video: TrackVideo | null): Promise<TrackVideo | null> => {
    if (!video || video.provider === 'local' || !window.echo?.mv?.resolveStreams) {
      return video;
    }

    try {
      const resolved = await window.echo.mv.resolveStreams(video.id);
      return resolved.video;
    } catch {
      return video;
    }
  }, []);

  const loadSettings = useCallback(async (): Promise<void> => {
    if (!window.echo?.mv?.getSettings) {
      return;
    }

    try {
      setSettings(await window.echo.mv.getSettings());
    } catch {
      setSettings(fallbackSettings);
    }
  }, []);

  const loadCurrentMv = useCallback(
    async (trackId: string | null): Promise<void> => {
      if (!trackId || !window.echo?.mv) {
        setSelectedVideo(null);
        setCandidates([]);
        return;
      }

      try {
        setError(null);
        setCandidates([]);
        const video = await window.echo.mv.getSelected(trackId);
        setSelectedVideo(await resolveSelectedStreams(video));
        const savedCandidates = await window.echo.mv.getCandidates?.(trackId);
        if (savedCandidates) {
          setCandidates(savedCandidates.filter((candidate) => !candidate.selected).map(videoToCandidate));
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    },
    [resolveSelectedStreams],
  );

  const refreshActiveTrack = useCallback(async (): Promise<string | null> => {
    if (queue.currentTrackId) {
      return queue.currentTrackId;
    }

    try {
      const [playbackStatus, audioStatus] = await Promise.all([
        window.echo?.playback?.getStatus?.().catch(() => null),
        window.echo?.audio?.getStatus?.().catch(() => null),
      ]);
      const trackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
      setFallbackTrackId(trackId);
      return trackId;
    } catch {
      return null;
    }
  }, [queue.currentTrackId]);

  const patchSettings = useCallback(
    async (patch: Partial<MvSettings>): Promise<void> => {
      const optimistic = { ...settings, ...patch };
      setSettings(optimistic);

      try {
        if (window.echo?.mv?.setSettings) {
          setSettings(await window.echo.mv.setSettings(patch));
          dispatchSettingsChanged(patch);
        }
      } catch (settingsError) {
        setSettings(settings);
        setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
      }
    },
    [settings],
  );

  const toggleProvider = useCallback(
    (provider: NetworkMvProviderId): void => {
      const next = enabledProviders.has(provider)
        ? settings.enabledProviders.filter((item) => item !== provider)
        : [...settings.enabledProviders, provider];
      void patchSettings({ enabledProviders: next });
    },
    [enabledProviders, patchSettings, settings.enabledProviders],
  );

  const chooseMaxQuality = useCallback(
    (quality: MvSettings['maxQuality']): void => {
      setIsMaxQualityMenuOpen(false);
      void patchSettings({ maxQuality: quality });
    },
    [patchSettings],
  );

  const toggleAutoSearch = useCallback(async (): Promise<void> => {
    const nextAutoSearch = !settings.autoSearch;
    await patchSettings({ autoSearch: nextAutoSearch });
    if (nextAutoSearch) {
      const trackId = await refreshActiveTrack();
      if (trackId && window.echo?.mv?.searchNetworkCandidates) {
        setIsBusy(true);
        setError(null);
        try {
          const nextCandidates = await window.echo.mv.searchNetworkCandidates(trackId, searchQuery);
          setCandidates(nextCandidates);
          const selected = await resolveSelectedStreams(await window.echo.mv.getSelected(trackId));
          setSelectedVideo(selected);
          if (selected) {
            notifyMvChanged(trackId);
          }
          if (nextCandidates.length === 0) {
            setError(t('mvSettings.error.noNetworkCandidates'));
          }
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : String(searchError));
        } finally {
          setIsBusy(false);
        }
      }
    }
  }, [notifyMvChanged, patchSettings, refreshActiveTrack, resolveSelectedStreams, searchQuery, settings.autoSearch, t]);

  const reorderProvider = useCallback(
    (provider: NetworkMvProviderId, targetProvider: NetworkMvProviderId): void => {
      const index = settings.providerOrder.indexOf(provider);
      const targetIndex = settings.providerOrder.indexOf(targetProvider);
      if (index < 0 || targetIndex < 0 || index === targetIndex) {
        return;
      }

      const next = [...settings.providerOrder];
      const [item] = next.splice(index, 1);
      if (!item) {
        return;
      }
      next.splice(targetIndex, 0, item);
      void patchSettings({ providerOrder: next });
    },
    [patchSettings, settings.providerOrder],
  );

  const handleProviderDragStart = useCallback((event: DragEvent<HTMLElement>, provider: NetworkMvProviderId): void => {
    setDraggedProvider(provider);
    setDragOverProvider(provider);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', provider);
  }, []);

  const handleProviderDragOver = useCallback(
    (event: DragEvent<HTMLElement>, provider: NetworkMvProviderId): void => {
      if (!draggedProvider || draggedProvider === provider) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverProvider(provider);
    },
    [draggedProvider],
  );

  const handleProviderDrop = useCallback(
    (event: DragEvent<HTMLElement>, provider: NetworkMvProviderId): void => {
      event.preventDefault();
      const droppedProvider = draggedProvider ?? (event.dataTransfer.getData('text/plain') as NetworkMvProviderId);
      setDraggedProvider(null);
      setDragOverProvider(null);
      reorderProvider(droppedProvider, provider);
    },
    [draggedProvider, reorderProvider],
  );

  const handleProviderDragEnd = useCallback((): void => {
    setDraggedProvider(null);
    setDragOverProvider(null);
  }, []);

  const searchNetworkCandidates = useCallback(async (): Promise<void> => {
    const trackId = await refreshActiveTrack();
    if (!trackId || !window.echo?.mv?.searchNetworkCandidates) {
      setError(t('mvSettings.error.noActiveTrackNetworkSearch'));
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const nextCandidates = await window.echo.mv.searchNetworkCandidates(trackId, searchQuery);
      setCandidates(nextCandidates);
      const selected = await resolveSelectedStreams(await window.echo.mv.getSelected(trackId));
      setSelectedVideo(selected);
      if (selected) {
        notifyMvChanged(trackId);
      }
      if (nextCandidates.length === 0) {
        setError(t('mvSettings.error.noNetworkCandidates'));
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setIsBusy(false);
    }
  }, [notifyMvChanged, refreshActiveTrack, resolveSelectedStreams, searchQuery, t]);

  const chooseLocalVideo = useCallback(async (): Promise<void> => {
    const trackId = await refreshActiveTrack();
    if (!trackId || !window.echo?.mv) {
      setError(t('mvSettings.error.noActiveTrackBinding'));
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const video = await window.echo.mv.chooseLocalVideo(trackId);
      if (video) {
        setSelectedVideo(video);
        setCandidates([]);
        notifyMvChanged(trackId);
      }
    } catch (chooseError) {
      setError(chooseError instanceof Error ? chooseError.message : String(chooseError));
    } finally {
      setIsBusy(false);
    }
  }, [notifyMvChanged, refreshActiveTrack, t]);

  const bindCustomMvUrl = useCallback(async (): Promise<void> => {
    const trackId = await refreshActiveTrack();
    if (!trackId || !window.echo?.mv?.bindUrl) {
      setError(t('mvSettings.error.noActiveTrackBinding'));
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const video = await window.echo.mv.bindUrl(trackId, customMvUrl);
      setSelectedVideo(await resolveSelectedStreams(video));
      setCandidates([]);
      notifyMvChanged(trackId);
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : String(bindError));
    } finally {
      setIsBusy(false);
    }
  }, [customMvUrl, notifyMvChanged, refreshActiveTrack, resolveSelectedStreams, t]);

  const selectCandidate = useCallback(
    async (candidateId: string): Promise<void> => {
      const trackId = await refreshActiveTrack();
      if (!trackId || !window.echo?.mv) {
        setError(t('mvSettings.error.noActiveTrackBinding'));
        return;
      }

      setBusyCandidateId(candidateId);
      setError(null);
      try {
        const video = await window.echo.mv.selectVideo(trackId, candidateId);
        setSelectedVideo(await resolveSelectedStreams(video));
        setCandidates([]);
        notifyMvChanged(trackId);
      } catch (selectError) {
        setError(selectError instanceof Error ? selectError.message : String(selectError));
      } finally {
        setBusyCandidateId(null);
      }
    },
    [notifyMvChanged, refreshActiveTrack, resolveSelectedStreams, t],
  );

  const clearSelected = useCallback(async (): Promise<void> => {
    const trackId = await refreshActiveTrack();
    if (!trackId || !window.echo?.mv) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      await window.echo.mv.clearSelected(trackId);
      setSelectedVideo(null);
      notifyMvChanged(trackId);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setIsBusy(false);
    }
  }, [notifyMvChanged, refreshActiveTrack]);

  const openExternal = useCallback(async (): Promise<void> => {
    if (!selectedVideo || !window.echo?.mv) {
      return;
    }

    setError(null);
    try {
      await window.echo.mv.openExternal(selectedVideo.id);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }, [selectedVideo]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsMotionOpen(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setIsMotionOpen(false);
    setIsMaxQualityMenuOpen(false);
    if (!shouldRender) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShouldRender(false), drawerExitAnimationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (useCurrentSongName) {
      setSearchQuery(activeTrackSearchName);
    }
  }, [activeTrackSearchName, useCurrentSongName]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadSettings();
    void refreshActiveTrack().then((trackId) => loadCurrentMv(trackId));
  }, [isOpen, loadCurrentMv, loadSettings, refreshActiveTrack]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleCandidatesChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ trackId?: string; candidates?: MvMatchCandidate[] }>).detail;
      if (!detail?.trackId || detail.trackId !== activeTrackId || !Array.isArray(detail.candidates)) {
        return;
      }

      setCandidates(detail.candidates);
      setError(detail.candidates.length === 0 ? t('mvSettings.error.noNetworkCandidates') : null);
    };

    window.addEventListener('mv:candidatesChanged', handleCandidatesChanged);
    return () => window.removeEventListener('mv:candidatesChanged', handleCandidatesChanged);
  }, [activeTrackId, isOpen, t]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="audio-drawer-root mv-settings-drawer-root no-drag" role="presentation" data-open={isMotionOpen}>
      <button className="audio-drawer-scrim" type="button" aria-label={t('mvSettings.action.close')} onClick={onClose} />
      <aside className="audio-drawer mv-settings-drawer" aria-label={t('mvSettings.aria.drawer')}>
        <header className="audio-drawer-header">
          <div>
            <Clapperboard size={18} />
            <h2>{t('mvSettings.title')}</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label={t('mvSettings.action.close')} title={t('mvSettings.action.close')} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <section className="audio-engine-meter mv-engine-meter" aria-label={t('mvSettings.aria.engineStatus')}>
          <div className="audio-engine-meter__top">
            <span className="audio-engine-meter__icon">
              <MonitorPlay size={17} />
            </span>
            <div>
              <span>{t('mvSettings.engine.title')}</span>
              <strong>{activeTrackTitle}</strong>
            </div>
            <ShieldCheck size={15} />
          </div>
          <div className="audio-engine-meter__grid">
            <span>
              <em>{t('mvSettings.engine.mvTitle')}</em>
              <strong>{formatVideoTitle(selectedVideo, t('mvSettings.status.none'))}</strong>
            </span>
            <span>
              <em>{t('mvSettings.engine.quality')}</em>
              <strong>{formatVideoQuality(selectedVideo, t('mvSettings.status.none'))}</strong>
            </span>
          </div>
        </section>

        <button type="button" className="mv-source-toggle mv-master-toggle" aria-pressed={isMvEnabled} onClick={() => void patchSettings({ enabled: !isMvEnabled })}>
          <span className="mv-switch-track" aria-hidden="true">
            <span />
          </span>
          <span className="mv-toggle-copy">
            <strong>{t('mvSettings.general.enabled')}</strong>
            <em>{isMvEnabled ? t('mvSettings.status.on') : t('mvSettings.status.off')}</em>
          </span>
        </button>

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Database size={17} />
            <h3>{t('mvSettings.binding.title')}</h3>
          </div>
          <div className="mv-settings-actions">
            <button type="button" onClick={() => void searchNetworkCandidates()} disabled={isBusy || !isMvEnabled}>
              <Globe2 size={15} />
              {t('mvSettings.action.searchNetwork')}
            </button>
            <button type="button" onClick={() => void chooseLocalVideo()} disabled={isBusy}>
              <FolderOpen size={15} />
              {t('mvSettings.action.chooseFile')}
            </button>
            <button type="button" onClick={() => void loadCurrentMv(activeTrackId)} disabled={isBusy}>
              <RotateCcw size={15} />
              {t('mvSettings.action.refresh')}
            </button>
          </div>

          {selectedVideo ? (
            <div className="mv-selected-card">
              <span>
                <strong>{selectedVideo.title ?? t('mvSettings.binding.selectedMv')}</strong>
                <em>
                  {providerLabelForVideo(selectedVideo)}
                  {selectedVideo.qualityLabel ? ` / ${selectedVideo.qualityLabel}` : ''}
                  {selectedVideo.fps && selectedVideo.fps >= 55 ? ' / 60fps' : ''}
                </em>
              </span>
              <div>
                {!selectedVideo.playableInApp || selectedVideo.provider !== 'local' ? (
                  <button type="button" aria-label={t('mvSettings.action.openExternal')} title={t('mvSettings.action.openExternal')} onClick={() => void openExternal()}>
                    <ExternalLink size={15} />
                  </button>
                ) : null}
                <button type="button" aria-label={t('mvSettings.action.removeSelected')} title={t('mvSettings.action.removeSelected')} onClick={() => void clearSelected()}>
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : null}

          <form
            className="mv-custom-card"
            onSubmit={(event) => {
              event.preventDefault();
              void bindCustomMvUrl();
            }}
          >
            <div className="mv-custom-heading">
              <span>
                <Link2 size={15} />
                <strong>{t('mvSettings.custom.title')}</strong>
              </span>
              <em>{t('mvSettings.custom.description')}</em>
            </div>
            <div className="mv-custom-controls">
              <label className="mv-custom-input">
                <input
                  value={customMvUrl}
                  aria-label={t('mvSettings.custom.input')}
                  placeholder={t('mvSettings.custom.placeholder')}
                  onChange={(event) => setCustomMvUrl(event.currentTarget.value)}
                />
              </label>
              <button type="submit" aria-label={t('mvSettings.custom.apply')} title={t('mvSettings.custom.apply')} disabled={isBusy || customMvUrl.trim().length === 0}>
                <Play size={17} />
              </button>
            </div>
            {selectedVideo?.providerUrl ? (
              <div className="mv-custom-status">
                <a href={selectedVideo.providerUrl} target="_blank" rel="noreferrer">
                  {t('mvSettings.custom.playing', { provider: providerLabelForVideo(selectedVideo), sourceId: selectedVideo.sourceId ?? selectedVideo.id })}
                  <ExternalLink size={12} />
                </a>
                <span>{t('mvSettings.custom.videoTitle', { title: selectedVideo.title ?? t('mvSettings.binding.selectedMv') })}</span>
                <span className="mv-custom-badges">
                  <em>{selectedVideo.playableInApp ? t('mvSettings.custom.directDash') : t('mvSettings.candidate.external')}</em>
                  <strong>{formatVideoQuality(selectedVideo, t('mvSettings.status.none'))}</strong>
                </span>
              </div>
            ) : null}
          </form>

          <form
            className="mv-search-controls"
            onSubmit={(event) => {
              event.preventDefault();
              void searchNetworkCandidates();
            }}
          >
            <label className="mv-search-input">
              <Search size={15} />
              <input
                value={searchQuery}
                aria-label={t('mvSettings.search.input')}
                placeholder={t('mvSettings.search.placeholder')}
                onChange={(event) => {
                  setSearchQuery(event.currentTarget.value);
                  if (useCurrentSongName) {
                    setUseCurrentSongName(false);
                  }
                }}
              />
            </label>
            <button type="submit" disabled={isBusy || !isMvEnabled || searchQuery.trim().length === 0}>
              <Search size={15} />
              {t('mvSettings.action.searchNetwork')}
            </button>
            <button
              type="button"
              className="mv-source-toggle mv-current-song-toggle"
              aria-pressed={useCurrentSongName}
              onClick={() => {
                const next = !useCurrentSongName;
                setUseCurrentSongName(next);
                if (next) {
                  setSearchQuery(activeTrackSearchName);
                }
              }}
            >
              <span className="mv-switch-track" aria-hidden="true">
                <span />
              </span>
              <span className="mv-toggle-copy">
                <strong>{t('mvSettings.search.useCurrentSong')}</strong>
                <em>{useCurrentSongName ? t('mvSettings.status.on') : t('mvSettings.status.off')}</em>
              </span>
            </button>
          </form>

          {candidates.length > 0 ? (
            <div className="mv-settings-candidates" aria-label={t('mvSettings.aria.candidates')}>
              {candidates.map((candidate) => (
                <button type="button" key={candidate.id} className="mv-settings-candidate" disabled={busyCandidateId !== null} title={candidate.title} onClick={() => void selectCandidate(candidate.id)}>
                  <span className="mv-candidate-thumb">
                    {candidate.thumbnailUrl && !failedThumbnailIds.has(candidate.id) ? (
                      <img
                        alt={candidate.title}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        src={candidate.thumbnailUrl}
                        onError={() => setFailedThumbnailIds((current) => new Set(current).add(candidate.id))}
                      />
                    ) : (
                      <span className="mv-candidate-thumb-fallback" aria-label={candidate.title}>
                        <FileVideo size={15} />
                        <em>{candidate.title}</em>
                      </span>
                    )}
                  </span>
                  <span>
                    <strong>{candidate.title}</strong>
                    <em>{candidate.uploader ?? (candidate.reasons.slice(0, 3).join(' / ') || providerLabel(candidate.provider))}</em>
                  </span>
                  <small>{providerLabel(candidate.provider)}</small>
                  <small>{formatScore(candidate.score)}</small>
                  <small>{candidate.playableInApp ? t('mvSettings.candidate.inApp') : t('mvSettings.candidate.external')}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className={`audio-drawer-section audio-drawer-options audio-drawer-options--open${isMaxQualityMenuOpen ? ' mv-section-menu-open' : ''}`}>
          <div className="audio-drawer-section-title">
            <Globe2 size={17} />
            <h3>{t('mvSettings.network.title')}</h3>
          </div>
          <button type="button" className="mv-source-toggle mv-auto-apply-toggle" aria-pressed={settings.autoSearch} onClick={() => void toggleAutoSearch()}>
            <span className="mv-switch-track" aria-hidden="true">
              <span />
            </span>
            <span className="mv-toggle-copy">
              <strong>{t('mvSettings.network.autoApply')}</strong>
              <em>{settings.autoSearch ? t('mvSettings.status.on') : t('mvSettings.status.off')}</em>
            </span>
          </button>
          <label className="mv-threshold-control">
            <span className="mv-threshold-copy">
              <strong>{t('mvSettings.network.autoApplyThreshold')}</strong>
              <em>{t('mvSettings.network.autoApplyThresholdDescription', { threshold: formatThreshold(settings.autoApplyThreshold) })}</em>
            </span>
            <span className="mv-threshold-slider">
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={Math.round((settings.autoApplyThreshold ?? 0.7) * 100)}
                aria-label={t('mvSettings.network.autoApplyThreshold')}
                onChange={(event) => void patchSettings({ autoApplyThreshold: thresholdFromPercent(event.currentTarget.value) })}
              />
              <strong>{formatThreshold(settings.autoApplyThreshold)}</strong>
            </span>
          </label>
          <button type="button" className="mv-source-toggle mv-auto-apply-toggle" aria-pressed={settings.autoPreload} onClick={() => void patchSettings({ autoPreload: !settings.autoPreload })}>
            <span className="mv-switch-track" aria-hidden="true">
              <span />
            </span>
            <span className="mv-toggle-copy">
              <strong>{t('mvSettings.network.autoPreload')}</strong>
              <em>{t('mvSettings.network.autoPreloadDescription')}</em>
            </span>
          </button>
          <button type="button" className="mv-source-toggle mv-auto-apply-toggle" aria-pressed={followMusicProgress} onClick={() => void patchSettings({ restartAudioOnLoad: !followMusicProgress })}>
            <span className="mv-switch-track" aria-hidden="true">
              <span />
            </span>
            <span className="mv-toggle-copy">
              <strong>{t('mvSettings.network.restartAudioOnLoad')}</strong>
              <em>{t('mvSettings.network.restartAudioOnLoadDescription')}</em>
            </span>
          </button>
          <button type="button" className="mv-source-toggle mv-auto-apply-toggle" aria-pressed={immersiveBackground} onClick={() => void patchSettings({ immersiveBackground: !immersiveBackground })}>
            <span className="mv-switch-track" aria-hidden="true">
              <span />
            </span>
            <span className="mv-toggle-copy">
              <strong>{t('mvSettings.immersive.title')}</strong>
              <em>{t('mvSettings.immersive.description')}</em>
            </span>
          </button>
          {immersiveBackground ? (
            <div className="mv-immersive-controls">
              <button
                type="button"
                className="mv-immersive-reset"
                onClick={() => void patchSettings(immersiveBackgroundDefaults)}
              >
                <RotateCcw size={15} />
                {t('mvSettings.immersive.reset')}
              </button>
              <button
                type="button"
                className="mv-source-toggle mv-auto-apply-toggle"
                aria-pressed={settings.lyricsReadabilityEnhanced === true}
                onClick={() => void patchSettings({ lyricsReadabilityEnhanced: settings.lyricsReadabilityEnhanced !== true })}
              >
                <span className="mv-switch-track" aria-hidden="true">
                  <span />
                </span>
                <span className="mv-toggle-copy">
                  <strong>{t('mvSettings.immersive.lyricsReadability')}</strong>
                  <em>{t('mvSettings.immersive.lyricsReadabilityDescription')}</em>
                </span>
              </button>
              <label className="mv-threshold-control">
                <span className="mv-threshold-copy">
                  <strong>{t('mvSettings.immersive.zoom')}</strong>
                  <em>{settings.immersiveBackgroundScalePercent ?? 115}%</em>
                </span>
                <span className="mv-threshold-slider">
                  <input
                    type="range"
                    min="100"
                    max="220"
                    step="1"
                    value={settings.immersiveBackgroundScalePercent ?? 115}
                    aria-label={t('mvSettings.immersive.zoom')}
                    onChange={(event) => void patchSettings({ immersiveBackgroundScalePercent: Number(event.currentTarget.value) })}
                  />
                  <strong>{settings.immersiveBackgroundScalePercent ?? 115}%</strong>
                </span>
              </label>
              <label className="mv-threshold-control">
                <span className="mv-threshold-copy">
                  <strong>{t('mvSettings.immersive.blur')}</strong>
                  <em>{t('mvSettings.immersive.visualHint')}</em>
                </span>
                <span className="mv-threshold-slider">
                  <input
                    type="range"
                    min="0"
                    max="32"
                    step="1"
                    value={settings.immersiveBackgroundBlurPx ?? 0}
                    aria-label={t('mvSettings.immersive.blur')}
                    onChange={(event) => void patchSettings({ immersiveBackgroundBlurPx: Number(event.currentTarget.value) })}
                  />
                  <strong>{settings.immersiveBackgroundBlurPx ?? 0}px</strong>
                </span>
              </label>
              <label className="mv-threshold-control">
                <span className="mv-threshold-copy">
                  <strong>{t('mvSettings.immersive.brightness')}</strong>
                  <em>{t('mvSettings.immersive.visualHint')}</em>
                </span>
                <span className="mv-threshold-slider">
                  <input
                    type="range"
                    min="60"
                    max="140"
                    step="1"
                    value={settings.immersiveBackgroundBrightnessPercent ?? 100}
                    aria-label={t('mvSettings.immersive.brightness')}
                    onChange={(event) => void patchSettings({ immersiveBackgroundBrightnessPercent: Number(event.currentTarget.value) })}
                  />
                  <strong>{settings.immersiveBackgroundBrightnessPercent ?? 100}%</strong>
                </span>
              </label>
              <label className="mv-threshold-control">
                <span className="mv-threshold-copy">
                  <strong>{t('mvSettings.immersive.overlay')}</strong>
                  <em>{t('mvSettings.immersive.overlayHint')}</em>
                </span>
                <span className="mv-threshold-slider">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.immersiveBackgroundOverlayOpacityPercent ?? 0}
                    aria-label={t('mvSettings.immersive.overlay')}
                    onChange={(event) => void patchSettings({ immersiveBackgroundOverlayOpacityPercent: Number(event.currentTarget.value) })}
                  />
                  <strong>{settings.immersiveBackgroundOverlayOpacityPercent ?? 0}%</strong>
                </span>
              </label>
            </div>
          ) : null}
          <div className="mv-source-list" role="list" aria-label={t('mvSettings.aria.networkSources')}>
            {settings.providerOrder.map((provider, index) => (
              <div
                className="mv-source-row"
                key={provider}
                role="listitem"
                data-dragging={draggedProvider === provider}
                data-drop-target={draggedProvider !== provider && dragOverProvider === provider}
                onDragOver={(event) => handleProviderDragOver(event, provider)}
                onDrop={(event) => handleProviderDrop(event, provider)}
              >
                <span
                  className="mv-source-drag-handle"
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={t('mvSettings.action.dragSource', { provider: providerLabels[provider] })}
                  title={t('mvSettings.action.dragReorder')}
                  onDragStart={(event) => handleProviderDragStart(event, provider)}
                  onDragEnd={handleProviderDragEnd}
                >
                  <GripVertical size={16} />
                  <small>{index + 1}</small>
                </span>
                <button type="button" className="mv-source-toggle" aria-pressed={enabledProviders.has(provider)} onClick={() => toggleProvider(provider)}>
                  <span className="mv-switch-track" aria-hidden="true">
                    <span />
                  </span>
                  {providerLabels[provider]}
                </button>
              </div>
            ))}
          </div>
          <div className="mv-quality-controls">
            <div className="mv-quality-menu">
              <span className="mv-field-label">{t('mvSettings.network.maxQuality')}</span>
              <button
                type="button"
                className="mv-quality-trigger"
                aria-expanded={isMaxQualityMenuOpen}
                aria-label={t('mvSettings.aria.maxQuality', { quality: qualityLabels[settings.maxQuality] })}
                onClick={() => setIsMaxQualityMenuOpen((current) => !current)}
              >
                <span>{qualityLabels[settings.maxQuality]}</span>
                <ChevronDown size={15} />
              </button>
              {isMaxQualityMenuOpen ? (
                <div className="mv-quality-popover" role="menu" aria-label={t('mvSettings.aria.maxQualityOptions')}>
                  {qualityCaps.map((quality) => (
                    <button type="button" key={quality} role="menuitem" data-selected={settings.maxQuality === quality} onClick={() => chooseMaxQuality(quality)}>
                      <span>{qualityLabels[quality]}</span>
                      {settings.maxQuality === quality ? <Check size={13} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {error ? <p className="audio-drawer-error">{error}</p> : null}
      </aside>
    </div>
  );
};
