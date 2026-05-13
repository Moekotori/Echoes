import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Music2 } from 'lucide-react';
import type { MvSettings, TrackVideo } from '../../../shared/types/mv';

type MvPanelProps = {
  trackId: string | null;
  title: string;
  artist: string;
  coverUrl: string | null;
  isAudioPlaying: boolean;
};

type BrowserShaka = {
  Player: new (video: HTMLVideoElement) => {
    load: (url: string) => Promise<void>;
    destroy: () => Promise<void>;
  };
};

type ShakaPlayerInstance = {
  load: (url: string) => Promise<void>;
  destroy: () => Promise<void>;
};

const fallbackMvSettings: MvSettings = {
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
  allow60fps: true,
};

const isAdaptiveStream = (video: TrackVideo | null): boolean =>
  Boolean(
    video?.mimeType &&
      (video.mimeType.includes('mpegurl') ||
        video.mimeType.includes('dash') ||
        video.mimeType.includes('application/vnd.apple.mpegurl')),
  );

const playVideo = (video: HTMLVideoElement): void => {
  const result = video.play();
  if (result && typeof result.catch === 'function') {
    void result.catch(() => undefined);
  }
};

const CoverFallback = ({
  artist,
  coverUrl,
  status,
  title,
}: {
  artist: string;
  coverUrl: string | null;
  status: string;
  title: string;
}): JSX.Element => (
  <div className="lyrics-mv-card" data-cover={Boolean(coverUrl)}>
    <div className="lyrics-mv-card-backdrop" aria-hidden="true">
      {coverUrl ? <img alt="" draggable={false} src={coverUrl} /> : null}
    </div>
    <div className="lyrics-mv-artwork">
      {coverUrl ? (
        <img alt="" draggable={false} src={coverUrl} />
      ) : (
        <div className="lyrics-mv-placeholder" aria-hidden="true">
          <Music2 size={46} />
        </div>
      )}
    </div>
    <div className="lyrics-mv-copy">
      <span>
        <Film size={15} />
        {status}
      </span>
      <strong>{title}</strong>
      <em>{artist}</em>
    </div>
  </div>
);

export const MvPanel = ({ artist, coverUrl, isAudioPlaying, title, trackId }: MvPanelProps): JSX.Element => {
  const [selectedVideo, setSelectedVideo] = useState<TrackVideo | null>(null);
  const [settings, setSettings] = useState<MvSettings>(fallbackMvSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const requestRef = useRef(0);
  const preloadAttemptRef = useRef<string | null>(null);
  const restartedForVideoRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isAudioPlayingRef = useRef(isAudioPlaying);
  const previousAudioPlayingRef = useRef(isAudioPlaying);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const loadSettings = useCallback(async (): Promise<MvSettings> => {
    if (!window.echo?.mv?.getSettings) {
      setSettings(fallbackMvSettings);
      return fallbackMvSettings;
    }

    try {
      const nextSettings = await window.echo.mv.getSettings();
      setSettings(nextSettings);
      return nextSettings;
    } catch {
      setSettings(fallbackMvSettings);
      return fallbackMvSettings;
    }
  }, []);

  const resolveNetworkVideo = useCallback(async (video: TrackVideo | null): Promise<TrackVideo | null> => {
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

  const loadSelected = useCallback(async (): Promise<void> => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSelectedVideo(null);
    setIsLoading(Boolean(trackId && window.echo?.mv));
    setError(null);
    setVideoError(false);

    if (!trackId || !window.echo?.mv) {
      setIsLoading(false);
      return;
    }

    try {
      const nextSettings = await loadSettings();
      let video = await window.echo.mv.getSelected(trackId);
      if (!video && nextSettings.autoPreload && isAudioPlayingRef.current && preloadAttemptRef.current !== trackId) {
        preloadAttemptRef.current = trackId;
        await window.echo.mv.searchNetworkCandidates?.(trackId);
        video = await window.echo.mv.getSelected(trackId);
      }
      const resolvedVideo = await resolveNetworkVideo(video);
      if (requestRef.current !== requestId) {
        return;
      }
      setSelectedVideo(resolvedVideo);
    } catch (loadError) {
      if (requestRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setSelectedVideo(null);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [loadSettings, resolveNetworkVideo, trackId]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  useEffect(() => {
    const wasAudioPlaying = previousAudioPlayingRef.current;
    previousAudioPlayingRef.current = isAudioPlaying;

    if (!isAudioPlaying || wasAudioPlaying || selectedVideo || !trackId || preloadAttemptRef.current === trackId) {
      return;
    }

    void loadSelected();
  }, [isAudioPlaying, loadSelected, selectedVideo, trackId]);

  useEffect(() => {
    const handleMvChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ trackId?: string | null }>).detail;
      if (!detail?.trackId || detail.trackId === trackId) {
        void loadSelected();
      }
    };

    window.addEventListener('mv:changed', handleMvChanged);
    return () => window.removeEventListener('mv:changed', handleMvChanged);
  }, [loadSelected, trackId]);

  useEffect(() => {
    const handleSettingsChanged = (): void => {
      void loadSettings();
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, [loadSettings]);

  const videoMediaUrl = selectedVideo?.playableInApp && selectedVideo.mediaUrl && !videoError ? selectedVideo.mediaUrl : null;
  const showVideo = Boolean(videoMediaUrl);
  const adaptiveStream = isAdaptiveStream(selectedVideo);

  useEffect(() => {
    isAudioPlayingRef.current = isAudioPlaying;
  }, [isAudioPlaying]);

  useEffect(() => {
    preloadAttemptRef.current = null;
    restartedForVideoRef.current = null;
  }, [trackId]);

  const restartAudioForMvSync = useCallback((videoId: string): void => {
    if (!settingsRef.current.restartAudioOnLoad || !isAudioPlayingRef.current || restartedForVideoRef.current === videoId) {
      return;
    }

    restartedForVideoRef.current = videoId;
    void window.echo?.playback?.seek?.(0)?.catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!showVideo || !videoRef.current) {
      return;
    }

    if (isAudioPlaying) {
      playVideo(videoRef.current);
      return;
    }

    videoRef.current.pause();
  }, [isAudioPlaying, showVideo, videoMediaUrl]);

  useEffect(() => {
    if (!showVideo || !adaptiveStream || !videoMediaUrl || !videoRef.current) {
      return undefined;
    }

    let disposed = false;
    let player: ShakaPlayerInstance | null = null;
    const videoElement = videoRef.current;

    void import('shaka-player')
      .then((module) => {
        const shaka = ((module as { default?: BrowserShaka }).default ?? module) as BrowserShaka;
        if (disposed || !shaka?.Player) {
          return;
        }

        player = new shaka.Player(videoElement);
        return player.load(videoMediaUrl).then(() => {
          if (selectedVideo) {
            restartAudioForMvSync(selectedVideo.id);
          }
          if (isAudioPlayingRef.current) {
            playVideo(videoElement);
            return undefined;
          }

          videoElement.pause();
          return undefined;
        });
      })
      .catch(() => setVideoError(true));

    return () => {
      disposed = true;
      if (player) {
        void player.destroy();
      }
    };
  }, [adaptiveStream, restartAudioForMvSync, selectedVideo, showVideo, videoMediaUrl]);

  return (
    <section className="lyrics-mv-panel" aria-label="MV">
      <div className="lyrics-mv-ambient" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />

      {showVideo ? (
        <div className="lyrics-mv-player">
          <video
            ref={videoRef}
            className="lyrics-mv-video"
            src={!adaptiveStream ? (videoMediaUrl ?? undefined) : undefined}
            autoPlay={isAudioPlaying}
            loop
            muted
            onError={() => setVideoError(true)}
            onLoadedMetadata={(event) => {
              if (selectedVideo) {
                restartAudioForMvSync(selectedVideo.id);
              }
              if (isAudioPlayingRef.current) {
                playVideo(event.currentTarget);
                return;
              }

              event.currentTarget.pause();
            }}
            playsInline
          />
        </div>
      ) : (
        <CoverFallback
          artist={artist}
          coverUrl={coverUrl}
          status={selectedVideo ? (videoError ? 'Playback failed' : 'External player required') : isLoading ? 'Loading MV' : 'MV unavailable'}
          title={selectedVideo?.title ?? title}
        />
      )}

      {error ? <p className="lyrics-mv-error">{error}</p> : null}
    </section>
  );
};
