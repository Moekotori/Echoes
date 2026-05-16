import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { PlayerBar } from '../components/player/PlayerBar';
import { AudioSettingsDrawer } from '../components/player/AudioSettingsDrawer';
import { LyricsSettingsDrawer } from '../components/lyrics/LyricsSettingsDrawer';
import { MvSettingsDrawer } from '../components/lyrics/MvSettingsDrawer';
import { DragDropImportOverlay } from '../components/import/DragDropImportOverlay';
import { loadPersistedRememberedAudioOutput } from '../components/player/audioOutputMemory';
import { Sidebar } from '../components/layout/Sidebar';
import { AppTitleBar } from '../components/layout/AppTitleBar';
import { formatAudioHostError } from '../components/player/audioErrorFormat';
import type { AppRoute, AppRouteId } from './routes';
import type { AudioStatus } from '../../shared/types/audio';
import type { AccountProvider, AccountStatus } from '../../shared/types/accounts';
import type { AppSettings } from '../../shared/types/appSettings';
import type { DownloadJob } from '../../shared/types/downloads';
import { useI18n } from '../i18n/I18nProvider';
import { rememberLibraryScanStatus } from '../stores/libraryScanSession';
import { clearSongsFirstPageSnapshot } from '../stores/songsFirstPageSnapshot';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useSharedPlaybackStatus } from '../stores/playbackStatusStore';
import { albumDetailNavigationEvent } from '../utils/albumNavigation';

type AppLayoutProps = {
  routes: AppRoute[];
};

type AppWallpaperSettings = Pick<
  AppSettings,
  | 'appCustomWallpaperPath'
  | 'appWallpaperScalePercent'
  | 'appWallpaperBlurPx'
  | 'appWallpaperBrightnessPercent'
  | 'appWallpaperUiOpacityPercent'
  | 'appWallpaperVisualProtectionEnabled'
  | 'appWallpaperUnifiedOpacityEnabled'
>;

const defaultAppWallpaperSettings: AppWallpaperSettings = {
  appCustomWallpaperPath: null,
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperVisualProtectionEnabled: true,
  appWallpaperUnifiedOpacityEnabled: false,
};

const persistentRouteIds = new Set<AppRouteId>(['songs']);
const accountProviderLabels: Record<AccountProvider, string> = {
  netease: '网易云音乐',
  qqmusic: 'QQ 音乐',
  bilibili: 'Bilibili',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
};

const isSpotifyPlaybackSetupError = (message: string): boolean =>
  /spotify/iu.test(message) && /(SDK|DRM\/Widevine|keysystem|playback device|Connect device|official player)/iu.test(message);

const selectAppWallpaperSettings = (settings: AppSettings): AppWallpaperSettings => ({
  appCustomWallpaperPath: settings.appCustomWallpaperPath,
  appWallpaperScalePercent: settings.appWallpaperScalePercent,
  appWallpaperBlurPx: settings.appWallpaperBlurPx,
  appWallpaperBrightnessPercent: settings.appWallpaperBrightnessPercent,
  appWallpaperUiOpacityPercent: settings.appWallpaperUiOpacityPercent,
  appWallpaperVisualProtectionEnabled: settings.appWallpaperVisualProtectionEnabled !== false,
  appWallpaperUnifiedOpacityEnabled: settings.appWallpaperUnifiedOpacityEnabled,
});

export const AppLayout = ({ routes }: AppLayoutProps): JSX.Element => {
  const { t } = useI18n();
  const playbackQueue = usePlaybackQueue();
  const playbackStatusSnapshot = useSharedPlaybackStatus();
  const [activeRouteId, setActiveRouteId] = useState<AppRouteId>('songs');
  const [chromeNotice, setChromeNotice] = useState<string | null>(null);
  const [isChromeNoticeVisible, setIsChromeNoticeVisible] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [audioErrorNotice, setAudioErrorNotice] = useState<{ message: string } | null>(null);
  const [diagnosticsNotice, setDiagnosticsNotice] = useState(false);
  const [isAudioDrawerOpen, setIsAudioDrawerOpen] = useState(false);
  const [isLyricsDrawerOpen, setIsLyricsDrawerOpen] = useState(false);
  const [isMvDrawerOpen, setIsMvDrawerOpen] = useState(false);
  const [audioDrawerStatus, setAudioDrawerStatus] = useState<AudioStatus | null>(null);
  const [isLyricsPlayerDrawerEnabled, setIsLyricsPlayerDrawerEnabled] = useState(false);
  const [isLyricsPlayerDrawerOpen, setIsLyricsPlayerDrawerOpen] = useState(false);
  const [appWallpaperSettings, setAppWallpaperSettings] = useState<AppWallpaperSettings>(defaultAppWallpaperSettings);
  const [loadedAppWallpaperUrl, setLoadedAppWallpaperUrl] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastAudioErrorRef = useRef<string | null>(null);
  const previousRouteIdRef = useRef<AppRouteId>('songs');
  const downloadImportedTrackIdsRef = useRef<Map<string, string | null>>(new Map());
  const activeRoute = useMemo(
    () => routes.find((route) => route.id === activeRouteId) ?? routes[0],
    [activeRouteId, routes],
  );
  const [mountedPersistentRouteIds, setMountedPersistentRouteIds] = useState<AppRouteId[]>(() =>
    persistentRouteIds.has(activeRouteId) ? [activeRouteId] : ['songs'],
  );
  const renderedRoutes = useMemo(() => {
    const activeRouteIds = new Set<AppRouteId>();
    const nextRoutes: AppRoute[] = [];

    for (const route of routes) {
      if (!mountedPersistentRouteIds.includes(route.id)) {
        continue;
      }

      nextRoutes.push(route);
      activeRouteIds.add(route.id);
    }

    if (activeRoute && !activeRouteIds.has(activeRoute.id)) {
      nextRoutes.push(activeRoute);
    }

    return nextRoutes;
  }, [activeRoute, mountedPersistentRouteIds, routes]);
  const isStandaloneRoute = activeRoute.chrome === 'standalone';
  const isLyricsRoute = activeRouteId === 'lyrics';
  const shouldUseLyricsPlayerDrawer = isLyricsRoute && isLyricsPlayerDrawerEnabled;
  const shouldRenderPlayerBar = !isStandaloneRoute || isLyricsRoute;
  const appWallpaperUrl = appWallpaperSettings.appCustomWallpaperPath
    ? `echo-wallpaper://app/custom?path=${encodeURIComponent(appWallpaperSettings.appCustomWallpaperPath)}`
    : null;
  const visibleAppWallpaperUrl = appWallpaperUrl && !isLyricsRoute ? appWallpaperUrl : null;
  const isAppWallpaperReady = Boolean(visibleAppWallpaperUrl && loadedAppWallpaperUrl === visibleAppWallpaperUrl);
  const appWallpaperRawUiAlpha = isAppWallpaperReady
    ? Math.max(0, Math.min(1, appWallpaperSettings.appWallpaperUiOpacityPercent / 100))
    : 1;
  const isAppWallpaperUiTransparent =
    isAppWallpaperReady &&
    !appWallpaperSettings.appWallpaperVisualProtectionEnabled &&
    appWallpaperRawUiAlpha <= 0;
  const appWallpaperStyle = useMemo<CSSProperties>(() => {
    const blurPx = appWallpaperSettings.appWallpaperBlurPx;
    const brightnessPercent = appWallpaperSettings.appWallpaperBrightnessPercent;
    const filterParts = [
      blurPx > 0 ? `blur(${blurPx}px)` : null,
      brightnessPercent !== 100 ? `brightness(${brightnessPercent}%)` : null,
    ].filter(Boolean);

    return {
      filter: filterParts.length ? filterParts.join(' ') : 'none',
      transform: `scale(${(appWallpaperSettings.appWallpaperScalePercent / 100).toFixed(2)})`,
    };
  }, [
    appWallpaperSettings.appWallpaperBlurPx,
    appWallpaperSettings.appWallpaperBrightnessPercent,
    appWallpaperSettings.appWallpaperScalePercent,
  ]);
  const appShellStyle = useMemo(() => {
    const uiAlpha =
      isAppWallpaperReady && appWallpaperSettings.appWallpaperVisualProtectionEnabled
        ? Math.max(appWallpaperRawUiAlpha, 0.36)
        : appWallpaperRawUiAlpha;
    const isUnified = isAppWallpaperReady && appWallpaperSettings.appWallpaperUnifiedOpacityEnabled;
    const scaledAlpha = (value: number): string => (uiAlpha * value).toFixed(3);
    const unifiedAlpha = uiAlpha.toFixed(3);

    return {
      '--app-wallpaper-ui-unified-alpha': unifiedAlpha,
      '--app-wallpaper-ui-border-alpha': isUnified ? '0' : scaledAlpha(0.2),
      '--app-wallpaper-ui-titlebar-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.74),
      '--app-wallpaper-ui-sidebar-top-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.58),
      '--app-wallpaper-ui-sidebar-mid-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.62),
      '--app-wallpaper-ui-sidebar-bottom-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.72),
      '--app-wallpaper-ui-sidebar-base-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.68),
      '--app-wallpaper-ui-page-top-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.28),
      '--app-wallpaper-ui-page-bottom-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.74),
      '--app-wallpaper-ui-page-base-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.62),
      '--app-wallpaper-ui-player-alpha': isUnified ? unifiedAlpha : scaledAlpha(0.78),
      '--app-wallpaper-ui-soft-shadow-alpha': isUnified ? '0' : scaledAlpha(0.08),
      '--app-wallpaper-ui-player-shadow-alpha': isUnified ? '0' : scaledAlpha(0.045),
      '--app-wallpaper-ui-inset-alpha': isUnified ? '0' : scaledAlpha(0.82),
      '--app-wallpaper-ui-titlebar-blur': `${(uiAlpha * 18).toFixed(1)}px`,
      '--app-wallpaper-ui-sidebar-blur': `${(uiAlpha * (isUnified ? 18 : 24)).toFixed(1)}px`,
      '--app-wallpaper-ui-surface-blur': `${(uiAlpha * 18).toFixed(1)}px`,
    } as CSSProperties;
  }, [
    appWallpaperRawUiAlpha,
    appWallpaperSettings.appWallpaperUiOpacityPercent,
    appWallpaperSettings.appWallpaperVisualProtectionEnabled,
    appWallpaperSettings.appWallpaperUnifiedOpacityEnabled,
    isAppWallpaperReady,
  ]);

  useEffect(() => {
    if (!visibleAppWallpaperUrl) {
      return;
    }

    setLoadedAppWallpaperUrl((current) => (current === visibleAppWallpaperUrl ? current : null));
  }, [visibleAppWallpaperUrl]);

  const navigateRoute = useCallback(
    (routeId: AppRouteId): void => {
      if (routeId === 'lyrics' && activeRouteId !== 'lyrics') {
        previousRouteIdRef.current = activeRouteId;
      }

      setActiveRouteId(routeId);
    },
    [activeRouteId],
  );

  const dismissChromeNotice = useCallback((): void => {
    setIsChromeNoticeVisible(false);
  }, []);

  useEffect(() => {
    if (!persistentRouteIds.has(activeRouteId)) {
      return;
    }

    setMountedPersistentRouteIds((current) => (current.includes(activeRouteId) ? current : [...current, activeRouteId]));
  }, [activeRouteId]);

  useEffect(() => {
    const folderInput = folderInputRef.current;

    if (!folderInput) {
      return;
    }

    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    void window.echo?.diagnostics
      ?.getLastCrashSummary()
      .then((summary) => setDiagnosticsNotice(Boolean(summary)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!chromeNotice) {
      return undefined;
    }

    setIsChromeNoticeVisible(true);

    const timer = window.setTimeout(() => {
      setIsChromeNoticeVisible(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [chromeNotice]);

  useEffect(() => {
    if (!chromeNotice || isChromeNoticeVisible) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setChromeNotice(null);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [chromeNotice, isChromeNoticeVisible]);

  useEffect(() => {
    if (!accountNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAccountNotice(null);
    }, 6200);

    return () => window.clearTimeout(timer);
  }, [accountNotice]);

  useEffect(() => {
    const unsubscribe = window.echo?.accounts?.onStatusesChanged?.((statuses: AccountStatus[]) => {
      const disconnected = statuses.filter((status) => !status.connected && Boolean(status.error));

      if (disconnected.length === 0) {
        return;
      }

      const names = disconnected.map((status) => accountProviderLabels[status.provider] ?? status.provider);
      setAccountNotice(`账号登录状态可能已失效：${names.join('、')}。请到设置 > 集成重新登录。`);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const rawError = playbackStatusSnapshot.audioStatus?.error ?? playbackStatusSnapshot.error;

    if (!rawError || rawError === 'Desktop bridge unavailable') {
      return;
    }

    if (isSpotifyPlaybackSetupError(rawError)) {
      return;
    }

    if (lastAudioErrorRef.current === rawError) {
      return;
    }

    lastAudioErrorRef.current = rawError;
    setAudioErrorNotice({
      message: formatAudioHostError(rawError) ?? rawError,
    });
  }, [playbackStatusSnapshot.audioStatus?.error, playbackStatusSnapshot.error]);

  useEffect(() => {
    if (!audioErrorNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAudioErrorNotice(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [audioErrorNotice]);

  useEffect(() => {
    let cancelled = false;

    const refreshLyricsPlayerDrawerSetting = (event?: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>> | undefined)?.detail;
      if (typeof patch?.lyricsPlayerBarDrawerEnabled === 'boolean') {
        setIsLyricsPlayerDrawerEnabled(patch.lyricsPlayerBarDrawerEnabled);
        return;
      }

      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            setIsLyricsPlayerDrawerEnabled(settings.lyricsPlayerBarDrawerEnabled === true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsLyricsPlayerDrawerEnabled(false);
          }
        });
    };

    refreshLyricsPlayerDrawerSetting();
    window.addEventListener('settings:changed', refreshLyricsPlayerDrawerSetting);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshLyricsPlayerDrawerSetting);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshAppWallpaperSetting = (event?: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>> | undefined)?.detail;
      if (
        patch &&
        ('appCustomWallpaperPath' in patch ||
          'appWallpaperScalePercent' in patch ||
          'appWallpaperBlurPx' in patch ||
          'appWallpaperBrightnessPercent' in patch ||
          'appWallpaperUiOpacityPercent' in patch ||
          'appWallpaperVisualProtectionEnabled' in patch ||
          'appWallpaperUnifiedOpacityEnabled' in patch)
      ) {
        setAppWallpaperSettings((current) => ({
          appCustomWallpaperPath: 'appCustomWallpaperPath' in patch ? (patch.appCustomWallpaperPath ?? null) : current.appCustomWallpaperPath,
          appWallpaperScalePercent: 'appWallpaperScalePercent' in patch
            ? (patch.appWallpaperScalePercent ?? defaultAppWallpaperSettings.appWallpaperScalePercent)
            : current.appWallpaperScalePercent,
          appWallpaperBlurPx: 'appWallpaperBlurPx' in patch
            ? (patch.appWallpaperBlurPx ?? defaultAppWallpaperSettings.appWallpaperBlurPx)
            : current.appWallpaperBlurPx,
          appWallpaperBrightnessPercent: 'appWallpaperBrightnessPercent' in patch
            ? (patch.appWallpaperBrightnessPercent ?? defaultAppWallpaperSettings.appWallpaperBrightnessPercent)
            : current.appWallpaperBrightnessPercent,
          appWallpaperUiOpacityPercent: 'appWallpaperUiOpacityPercent' in patch
            ? (patch.appWallpaperUiOpacityPercent ?? defaultAppWallpaperSettings.appWallpaperUiOpacityPercent)
            : current.appWallpaperUiOpacityPercent,
          appWallpaperVisualProtectionEnabled: 'appWallpaperVisualProtectionEnabled' in patch
            ? (patch.appWallpaperVisualProtectionEnabled !== false)
            : current.appWallpaperVisualProtectionEnabled,
          appWallpaperUnifiedOpacityEnabled: 'appWallpaperUnifiedOpacityEnabled' in patch
            ? (patch.appWallpaperUnifiedOpacityEnabled === true)
            : current.appWallpaperUnifiedOpacityEnabled,
        }));
        return;
      }

      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            setAppWallpaperSettings(selectAppWallpaperSettings(settings));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAppWallpaperSettings(defaultAppWallpaperSettings);
          }
        });
    };

    refreshAppWallpaperSetting();
    window.addEventListener('settings:changed', refreshAppWallpaperSetting);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshAppWallpaperSetting);
    };
  }, []);

  useEffect(() => {
    const handleNavigateImportFolder = (): void => {
      navigateRoute('import-folder');
    };
    const handleNavigateQueue = (): void => {
      navigateRoute('queue');
    };
    const handleNavigateNowPlaying = (): void => {
      navigateRoute('queue');
    };
    const handleNavigateLyrics = (): void => {
      if (activeRouteId === 'lyrics') {
        setActiveRouteId(previousRouteIdRef.current);
        return;
      }

      navigateRoute('lyrics');
    };
    const handleNavigateLyricsBack = (): void => {
      setActiveRouteId(previousRouteIdRef.current);
    };
    const handleNavigateAlbumDetail = (): void => {
      navigateRoute('albums');
    };

    window.addEventListener('app:navigate:import-folder', handleNavigateImportFolder);
    window.addEventListener('app:navigate:queue', handleNavigateQueue);
    window.addEventListener('app:navigate:now-playing', handleNavigateNowPlaying);
    window.addEventListener('app:navigate:lyrics', handleNavigateLyrics);
    window.addEventListener('app:navigate:lyrics-back', handleNavigateLyricsBack);
    window.addEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
    return () => {
      window.removeEventListener('app:navigate:import-folder', handleNavigateImportFolder);
      window.removeEventListener('app:navigate:queue', handleNavigateQueue);
      window.removeEventListener('app:navigate:now-playing', handleNavigateNowPlaying);
      window.removeEventListener('app:navigate:lyrics', handleNavigateLyrics);
      window.removeEventListener('app:navigate:lyrics-back', handleNavigateLyricsBack);
      window.removeEventListener(albumDetailNavigationEvent, handleNavigateAlbumDetail);
    };
  }, [activeRouteId, navigateRoute]);

  useEffect(() => {
    const audio = window.echo?.audio;

    if (!audio) {
      return;
    }

    void Promise.all([
      loadPersistedRememberedAudioOutput(),
      window.echo?.app?.getSettings?.().catch(() => null) ?? Promise.resolve(null),
    ])
      .then(([remembered, settings]) => {
        const useJuceOutput = settings?.audioUseJuceOutput === true;
        const asioUnavailableFallbackEnabled = settings?.audioAsioUnavailableFallbackEnabled === true;
        const soxrFallbackEnabled = settings?.audioSoxrFallbackEnabled !== false;
        if (!remembered.enabled) {
          return audio
            .setOutput({ useJuceOutput, asioUnavailableFallbackEnabled, soxrFallbackEnabled })
            .then(setAudioDrawerStatus);
        }

        return audio
          .setOutput({
            outputMode: remembered.outputMode,
            sharedBackend: remembered.sharedBackend,
            latencyProfile: remembered.latencyProfile,
            deviceIndex: remembered.deviceIndex,
            deviceName: remembered.deviceName,
            useJuceOutput,
            asioUnavailableFallbackEnabled,
            soxrFallbackEnabled,
          })
          .then(setAudioDrawerStatus);
      })
      .catch((error) => {
        console.error('Failed to restore remembered audio output', error);
      });
  }, []);

  const notifyLibraryChanged = useCallback(async (): Promise<void> => {
    try {
      await window.echo?.library.getSummary();
    } catch {
      // Summary warmup is best-effort for direct chrome actions.
    }

    window.dispatchEvent(new Event('library:changed'));
  }, []);

  useEffect(() => {
    const downloads = window.echo?.downloads;

    if (!downloads?.onJobsUpdated) {
      return undefined;
    }

    const importedTrackIds = downloadImportedTrackIdsRef.current;
    return downloads.onJobsUpdated((jobs: DownloadJob[]) => {
      let importedNewTrack = false;
      const nextJobIds = new Set<string>();

      for (const job of jobs) {
        nextJobIds.add(job.id);
        const previousTrackId = importedTrackIds.get(job.id) ?? null;
        const nextTrackId = job.importedTrackId ?? null;

        if (nextTrackId && previousTrackId !== nextTrackId) {
          importedNewTrack = true;
        }

        importedTrackIds.set(job.id, nextTrackId);
      }

      for (const jobId of Array.from(importedTrackIds.keys())) {
        if (!nextJobIds.has(jobId)) {
          importedTrackIds.delete(jobId);
        }
      }

      if (importedNewTrack) {
        clearSongsFirstPageSnapshot();
        window.dispatchEvent(new Event('library:changed'));
      }
    });
  }, []);

  const handleImportFolder = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      folderInputRef.current?.click();
      setChromeNotice(t('notice.browserFolderPicker'));
      return;
    }

    try {
      const chosenPath = await library.chooseFolder();

      if (!chosenPath) {
        return;
      }

      const folder = await library.addFolder(chosenPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      await notifyLibraryChanged();
    } catch (error) {
      console.error('Failed to import folder from app chrome', error);
    }
  }, [notifyLibraryChanged, t]);

  const handleImportFile = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;

    if (!playback) {
      fileInputRef.current?.click();
      setChromeNotice(t('notice.browserFolderPicker'));
      return;
    }

    try {
      const filePaths = playback.openLocalAudioFiles ? await playback.openLocalAudioFiles() : await playback.openLocalAudioFile().then((path) => (path ? [path] : null));

      if (!filePaths?.length) {
        return;
      }

      const result = await playbackQueue.openTemporaryLocalFiles(filePaths);
      navigateRoute('queue');
      if (result.rejected.length > 0) {
        setChromeNotice(`已打开 ${result.tracks.length} 个文件，忽略 ${result.rejected.length} 个不支持或不可用文件。`);
      }
    } catch (error) {
      console.error('Failed to open local audio file from app chrome', error);
    }
  }, [navigateRoute, playbackQueue, t]);

  useEffect(() => {
    const unsubscribe = window.echo?.playback?.onLocalAudioFilesOpened?.((paths) => {
      if (paths.length === 0) {
        return;
      }

      void playbackQueue
        .openTemporaryLocalFiles(paths)
        .then((result) => {
          navigateRoute('queue');
          if (result.rejected.length > 0) {
            setChromeNotice(`已打开 ${result.tracks.length} 个文件，忽略 ${result.rejected.length} 个不支持或不可用文件。`);
          }
        })
        .catch((error) => {
          console.error('Failed to open local audio files from system', error);
        });
    });

    return () => unsubscribe?.();
  }, [navigateRoute, playbackQueue]);

  const handleWindowAction = useCallback(
    async (action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> => {
      const appApi = window.echo?.app;

      if (!appApi) {
        setChromeNotice(t('notice.windowControlsDesktop'));
        return;
      }

      await appApi[action]();
    },
    [t],
  );

  const handleExportDiagnostics = useCallback(async (): Promise<void> => {
    try {
      const exportedPath = await window.echo?.diagnostics.exportDiagnostics();
      setDiagnosticsNotice(false);
      setChromeNotice(exportedPath ? `Diagnostics exported: ${exportedPath}` : 'Diagnostics export finished.');
    } catch (error) {
      setChromeNotice(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleDismissDiagnosticsNotice = useCallback(async (): Promise<void> => {
    setDiagnosticsNotice(false);
    await window.echo?.diagnostics.clearLastCrashSummary().catch(() => undefined);
  }, []);

  const handleOpenAudioCrashReport = useCallback(async (): Promise<void> => {
    try {
      await window.echo?.diagnostics.openAudioCrashReport();
    } catch (error) {
      setChromeNotice(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleBrowserFolderPicked = (files: FileList | null): void => {
    if (!files?.length) {
      return;
    }

    setChromeNotice(t('notice.browserFilePicker', { name: `${files.length} file(s)` }));
  };

  const handleBrowserFilePicked = (files: FileList | null): void => {
    const file = files?.[0];

    if (!file) {
      return;
    }

    setChromeNotice(t('notice.browserFilePicker', { name: `"${file.name}"` }));
  };

  return (
    <div
      className={`app-shell ${isStandaloneRoute ? 'app-shell--standalone' : ''} ${isLyricsRoute ? 'app-shell--lyrics' : ''} ${
        shouldUseLyricsPlayerDrawer ? 'app-shell--lyrics-player-drawer' : ''
      } ${shouldUseLyricsPlayerDrawer && isLyricsPlayerDrawerOpen ? 'app-shell--lyrics-player-drawer-open' : ''} ${
        visibleAppWallpaperUrl ? 'app-shell--wallpaper' : ''
      } ${
        isAppWallpaperReady ? 'app-shell--wallpaper-ready' : ''
      }`}
      data-wallpaper-unified-opacity={isAppWallpaperReady && appWallpaperSettings.appWallpaperUnifiedOpacityEnabled ? 'true' : undefined}
      data-wallpaper-visual-protection={
        isAppWallpaperReady ? (appWallpaperSettings.appWallpaperVisualProtectionEnabled ? 'true' : 'false') : undefined
      }
      data-wallpaper-ui-transparent={isAppWallpaperUiTransparent ? 'true' : undefined}
      style={appShellStyle}
    >
      {visibleAppWallpaperUrl ? (
        <div className="app-wallpaper-layer" aria-hidden="true" data-loaded={isAppWallpaperReady}>
          <img
            src={visibleAppWallpaperUrl}
            alt=""
            style={appWallpaperStyle}
            onLoad={() => setLoadedAppWallpaperUrl(visibleAppWallpaperUrl)}
          />
        </div>
      ) : null}

      <AppTitleBar
        activeRouteId={activeRouteId}
        isAudioSettingsOpen={isAudioDrawerOpen}
        isLyricsSettingsOpen={isLyricsDrawerOpen}
        isMvSettingsOpen={isMvDrawerOpen}
        onRouteChange={navigateRoute}
        onOpenAudioSettings={() => setIsAudioDrawerOpen(true)}
        onOpenLyricsSettings={() => setIsLyricsDrawerOpen(true)}
        onOpenMvSettings={() => setIsMvDrawerOpen(true)}
        onMinimize={() => void handleWindowAction('minimize')}
        onToggleMaximize={() => void handleWindowAction('toggleMaximize')}
        onClose={() => void handleWindowAction('close')}
      />

      {isStandaloneRoute ? null : (
        <Sidebar
          routes={routes}
          activeRouteId={activeRouteId}
          onRouteChange={navigateRoute}
          onOpenAudioSettings={() => setIsAudioDrawerOpen(true)}
          onOpenLyricsSettings={() => setIsLyricsDrawerOpen(true)}
          onImportFolder={() => void handleImportFolder()}
          onImportFile={() => void handleImportFile()}
        />
      )}

      {renderedRoutes.map((route) => {
        const isActive = route.id === activeRoute.id;
        const routeIsStandalone = route.chrome === 'standalone';

        return (
          <main
            aria-hidden={isActive ? undefined : true}
            className={`page-surface ${routeIsStandalone ? 'page-surface--standalone' : ''}`}
            data-route-id={route.id}
            hidden={!isActive}
            key={route.id}
          >
            {route.element}
          </main>
        );
      })}

      {isStandaloneRoute ? null : <DragDropImportOverlay onNotice={setChromeNotice} />}

      <input
        ref={folderInputRef}
        className="browser-preview-picker"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleBrowserFolderPicked(event.target.files)}
      />
      <input
        ref={fileInputRef}
        className="browser-preview-picker"
        type="file"
        accept=".flac,.mp3,.wav,.m4a,.aac,.ogg,.opus,.wma,.alac,.aiff,.aif,.ape,.wv,.tta,.tak,.caf,.dsf,.dff,.mka,.mkv,.mp4,.mov,.webm,.mp2,.mp1,.mpc,.ofr,.ofs,.spx,.amr,.ac3,.dts,audio/*"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleBrowserFilePicked(event.target.files)}
      />

      {chromeNotice ? (
        <div className={`chrome-notice ${isChromeNoticeVisible ? 'is-visible' : 'is-hiding'}`} role="status">
          <span className="chrome-notice-message">{chromeNotice}</span>
          <button className="chrome-notice-close" type="button" aria-label="关闭提示" title="关闭提示" onClick={dismissChromeNotice}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      {diagnosticsNotice ? (
        <div className="chrome-notice chrome-notice--diagnostics" role="status">
          <span>ECHO did not close normally last time. Export diagnostics to help locate the issue.</span>
          <div className="chrome-notice-actions">
            <button type="button" onClick={() => void handleExportDiagnostics()}>
              Export diagnostics
            </button>
            <button type="button" onClick={() => void handleDismissDiagnosticsNotice()}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {accountNotice ? (
        <div className="chrome-notice chrome-notice--account" role="alert">
          <strong>账号登录失效</strong>
          <span>{accountNotice}</span>
        </div>
      ) : null}

      {audioErrorNotice ? (
        <div className="chrome-notice chrome-notice--audio-error" role="alert">
          <strong>音频错误</strong>
          <span>{audioErrorNotice.message}</span>
          <small>已生成 Markdown 诊断报告，里面有详细原因和排查线索。</small>
          <div className="chrome-notice-actions">
            <button type="button" onClick={() => void handleOpenAudioCrashReport()}>
              打开报告
            </button>
            <button type="button" onClick={() => setAudioErrorNotice(null)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <AudioSettingsDrawer
        isOpen={isAudioDrawerOpen}
        status={audioDrawerStatus}
        onClose={() => setIsAudioDrawerOpen(false)}
        onStatusChange={setAudioDrawerStatus}
      />
      <LyricsSettingsDrawer isOpen={isLyricsDrawerOpen} onClose={() => setIsLyricsDrawerOpen(false)} />
      <MvSettingsDrawer isOpen={isMvDrawerOpen} onClose={() => setIsMvDrawerOpen(false)} />

      {shouldUseLyricsPlayerDrawer ? (
        <div
          className="lyrics-player-drawer-zone"
          aria-hidden="true"
          onPointerEnter={() => setIsLyricsPlayerDrawerOpen(true)}
        />
      ) : null}
      {shouldRenderPlayerBar ? (
        <div
          className={`player-bar-host ${shouldUseLyricsPlayerDrawer ? 'lyrics-player-drawer-host' : ''}`}
          onPointerEnter={shouldUseLyricsPlayerDrawer ? () => setIsLyricsPlayerDrawerOpen(true) : undefined}
          onPointerLeave={shouldUseLyricsPlayerDrawer ? () => setIsLyricsPlayerDrawerOpen(false) : undefined}
        >
          <PlayerBar onOpenAudioSettings={() => setIsAudioDrawerOpen(true)} />
        </div>
      ) : null}
    </div>
  );
};
