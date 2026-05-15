// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MvSettings, TrackVideo } from '../../../shared/types/mv';
import { MvPanel, type MvAudioClock } from './MvPanel';

const makeVideo = (overrides: Partial<TrackVideo> = {}): TrackVideo => ({
  id: 'video-1',
  trackId: 'track-1',
  provider: 'local',
  sourceType: 'manual',
  sourceId: 'local:1',
  title: 'Test Song MV',
  artist: 'Test Artist',
  url: null,
  providerUrl: null,
  thumbnailUrl: null,
  filePath: null,
  mediaUrl: 'echo-video://mv/video-1',
  mimeType: 'video/mp4',
  durationSeconds: null,
  width: null,
  height: null,
  selectedQualityId: null,
  qualityLabel: null,
  fps: null,
  score: 1,
  selected: true,
  playableInApp: true,
  rawProviderJson: null,
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  ...overrides,
});

const defaultMvSettings: MvSettings = {
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
  allow60fps: true,
};

const makeAudioClock = (
  positionSeconds = 0,
  playbackRate = 1,
  overrides: Partial<MvAudioClock> = {},
): MvAudioClock => ({
  positionSeconds,
  updatedAtMs: performance.now(),
  playbackRate,
  durationSeconds: 180,
  state: 'playing',
  ...overrides,
});

const renderPanel = (
  selected: TrackVideo | null,
  isAudioPlaying = true,
  settings: MvSettings = defaultMvSettings,
  clockPositionSeconds = 0,
  clockPlaybackRate = 1,
  hideFallbackTrackInfo = false,
) => {
  window.echo = {
    playback: {
      seek: vi.fn(),
    },
    mv: {
      getSelected: vi.fn().mockResolvedValue(selected),
      getSettings: vi.fn().mockResolvedValue(settings),
      setSettings: vi.fn(),
      findLocalCandidates: vi.fn().mockResolvedValue([]),
      searchNetworkCandidates: vi.fn().mockResolvedValue([]),
      getCandidates: vi.fn().mockResolvedValue([]),
      resolveStreams: vi.fn().mockResolvedValue({ video: selected, variants: [] }),
      setQuality: vi.fn(),
      chooseLocalVideo: vi.fn().mockResolvedValue(null),
      bindLocalVideo: vi.fn(),
      selectVideo: vi.fn(),
      clearSelected: vi.fn(),
      openExternal: vi.fn(),
    },
  } as unknown as Window['echo'];

  return render(
    <MvPanel
      trackId="track-1"
      title="Test Song"
      artist="Test Artist"
      coverUrl="echo-cover://thumb/test"
      hideFallbackTrackInfo={hideFallbackTrackInfo}
      isAudioPlaying={isAudioPlaying}
      audioClock={makeAudioClock(clockPositionSeconds, clockPlaybackRate, {
        state: isAudioPlaying ? 'playing' : 'paused',
      })}
    />,
  );
};

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MvPanel', () => {
  it('shows cover fallback when no MV is selected', async () => {
    const { container } = renderPanel(null);

    await waitFor(() => expect(window.echo.mv.getSelected).toHaveBeenCalledWith('track-1'));
    expect(container.querySelector('.lyrics-mv-card[data-cover="true"] .lyrics-mv-artwork img')?.getAttribute('src')).toBe(
      'echo-cover://thumb/test',
    );
    expect(screen.getByText('MV unavailable')).toBeTruthy();
    expect(screen.queryByText('Find local')).toBeNull();
    expect(screen.queryByText('Choose file')).toBeNull();
  });

  it('can hide track info on the cover fallback card', async () => {
    renderPanel(null, true, defaultMvSettings, 0, 1, true);

    await waitFor(() => expect(window.echo.mv.getSelected).toHaveBeenCalledWith('track-1'));
    expect(screen.getByText('MV unavailable')).toBeTruthy();
    expect(screen.queryByText('Test Song')).toBeNull();
    expect(screen.queryByText('Test Artist')).toBeNull();
  });

  it('does not load or render MV when MV is disabled', async () => {
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, enabled: false });

    await waitFor(() => expect(container.querySelector('.lyrics-mv-panel')?.getAttribute('data-mv-enabled')).toBe('false'));
    expect(screen.queryByText('MV disabled')).toBeNull();
    expect(container.querySelector('.lyrics-mv-card')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(window.echo.mv.getSelected).not.toHaveBeenCalled();
    expect(window.echo.mv.searchNetworkCandidates).not.toHaveBeenCalled();
  });

  it('keeps the MV surface empty while disabled settings are still loading', async () => {
    let resolveSettings: (settings: MvSettings) => void = () => undefined;
    window.echo = {
      playback: {
        seek: vi.fn(),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(makeVideo()),
        getSettings: vi.fn().mockReturnValue(
          new Promise<MvSettings>((resolve) => {
            resolveSettings = resolve;
          }),
        ),
        setSettings: vi.fn(),
        findLocalCandidates: vi.fn().mockResolvedValue([]),
        searchNetworkCandidates: vi.fn().mockResolvedValue([]),
        getCandidates: vi.fn().mockResolvedValue([]),
        resolveStreams: vi.fn().mockResolvedValue({ video: makeVideo(), variants: [] }),
        setQuality: vi.fn(),
        chooseLocalVideo: vi.fn().mockResolvedValue(null),
        bindLocalVideo: vi.fn(),
        selectVideo: vi.fn(),
        clearSelected: vi.fn(),
        openExternal: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(0)}
      />,
    );

    expect(container.querySelector('.lyrics-mv-panel')?.getAttribute('data-mv-enabled')).toBe('false');
    expect(container.querySelector('.lyrics-mv-card')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(window.echo.mv.getSelected).not.toHaveBeenCalled();

    await act(async () => {
      resolveSettings({ ...defaultMvSettings, enabled: false });
    });

    await waitFor(() => expect(window.echo.mv.getSettings).toHaveBeenCalled());
    expect(container.querySelector('.lyrics-mv-card')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(window.echo.mv.getSelected).not.toHaveBeenCalled();
  });

  it('preloads MV candidates while audio is playing', async () => {
    const selectedAfterSearch = makeVideo({ provider: 'bilibili' });
    const getSelected = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(selectedAfterSearch);
    window.echo = {
      playback: {
        seek: vi.fn(),
      },
      mv: {
        getSelected,
        getSettings: vi.fn().mockResolvedValue(defaultMvSettings),
        setSettings: vi.fn(),
        findLocalCandidates: vi.fn().mockResolvedValue([]),
        searchNetworkCandidates: vi.fn().mockResolvedValue([]),
        getCandidates: vi.fn().mockResolvedValue([]),
        resolveStreams: vi.fn().mockResolvedValue({ video: selectedAfterSearch, variants: [] }),
        setQuality: vi.fn(),
        chooseLocalVideo: vi.fn().mockResolvedValue(null),
        bindLocalVideo: vi.fn(),
        selectVideo: vi.fn(),
        clearSelected: vi.fn(),
        openExternal: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(0)}
      />,
    );

    await waitFor(() => expect(window.echo.mv.searchNetworkCandidates).toHaveBeenCalledWith('track-1'));
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));
  });

  it('shows a video for playable selected MV', async () => {
    const { container } = renderPanel(makeVideo());

    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));
    const video = container.querySelector('video') as HTMLVideoElement | null;
    expect(video?.muted).toBe(true);
    expect(video?.autoplay).toBe(true);
    expect(video?.controls).toBe(false);
    expect(container.querySelector('.lyrics-mv-toolbar')).toBeNull();
  });

  it('uses streaming provider MV metadata to search when no library track id is available', async () => {
    const selectedAfterSearch = makeVideo({ id: 'streaming-video-1', trackId: 'streaming:qqmusic:song-mid', provider: 'bilibili' });
    window.echo = {
      playback: {
        seek: vi.fn(),
      },
      streaming: {
        getMv: vi.fn().mockResolvedValue({
          provider: 'qqmusic',
          providerTrackId: 'song-mid',
          status: 'available',
          items: [
            {
              id: 'streaming:qqmusic:mv:mv-1',
              provider: 'qqmusic',
              providerMvId: 'mv-1',
              providerTrackId: 'song-mid',
              title: 'Provider Exact MV',
              artist: 'Provider Artist',
              duration: 180,
              thumbnailUrl: 'https://example.test/mv.jpg',
            },
          ],
        }),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(null),
        getSettings: vi.fn().mockResolvedValue(defaultMvSettings),
        setSettings: vi.fn(),
        findLocalCandidates: vi.fn().mockResolvedValue([]),
        searchNetworkCandidates: vi.fn().mockResolvedValue([]),
        searchNetworkCandidatesForSnapshot: vi.fn().mockResolvedValue([
          {
            id: 'bilibili:BVstreaming',
            provider: 'bilibili',
            sourceType: 'search_candidate',
            title: 'Provider Exact MV',
            artist: 'Provider Artist',
            filePath: null,
            url: 'https://www.bilibili.com/video/BVstreaming',
            providerUrl: 'https://www.bilibili.com/video/BVstreaming',
            thumbnailUrl: 'https://example.test/mv.jpg',
            uploader: 'Provider Channel',
            availableQualities: [],
            durationSeconds: 180,
            score: 0.92,
            playableInApp: true,
            reasons: ['Bilibili search'],
          },
        ]),
        getCandidates: vi.fn().mockResolvedValue([]),
        resolveStreams: vi.fn().mockResolvedValue({ video: selectedAfterSearch, variants: [] }),
        setQuality: vi.fn(),
        chooseLocalVideo: vi.fn().mockResolvedValue(null),
        bindLocalVideo: vi.fn(),
        selectVideo: vi.fn().mockResolvedValue(selectedAfterSearch),
        clearSelected: vi.fn(),
        openExternal: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <MvPanel
        trackId={null}
        streamingTarget={{ provider: 'qqmusic', providerTrackId: 'song-mid' }}
        title="Search Title"
        artist="Search Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(0)}
      />,
    );

    await waitFor(() =>
      expect(window.echo.mv.searchNetworkCandidatesForSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          trackId: 'streaming:qqmusic:song-mid',
          title: 'Provider Exact MV',
          artist: 'Provider Artist',
          query: 'Provider Exact MV Provider Artist',
        }),
      ),
    );
    await waitFor(() => expect(window.echo.mv.selectVideo).toHaveBeenCalledWith('streaming:qqmusic:song-mid', 'bilibili:BVstreaming'));
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));
  });

  it('applies immersive MV visual tuning variables', async () => {
    const { container } = renderPanel(makeVideo(), true, {
      ...defaultMvSettings,
      immersiveBackground: true,
      immersiveBackgroundBlurPx: 10,
      immersiveBackgroundBrightnessPercent: 118,
      immersiveBackgroundOverlayOpacityPercent: 35,
    });

    const background = await waitFor(() => {
      const element = container.querySelector('.lyrics-mv-background') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    expect(background.style.getPropertyValue('--mv-immersive-blur')).toBe('10px');
    expect(background.style.getPropertyValue('--mv-immersive-brightness')).toBe('118%');
    expect(background.style.getPropertyValue('--mv-immersive-overlay-opacity')).toBe('0.35');
  });

  it('marks the immersive MV background when lyrics readability enhancement is enabled', async () => {
    const { container } = renderPanel(makeVideo(), true, {
      ...defaultMvSettings,
      immersiveBackground: true,
      lyricsReadabilityEnhanced: true,
    });

    const background = await waitFor(() => {
      const element = container.querySelector('.lyrics-mv-background') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    expect(background.dataset.lyricsReadability).toBe('true');
  });

  it('leaves the immersive MV readability marker absent by default', async () => {
    const { container } = renderPanel(makeVideo(), true, {
      ...defaultMvSettings,
      immersiveBackground: true,
    });

    const background = await waitFor(() => {
      const element = container.querySelector('.lyrics-mv-background') as HTMLElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    expect(background.dataset.lyricsReadability).toBeUndefined();
  });

  it('clears the previous MV as soon as the track changes', async () => {
    let resolveSecond: (value: TrackVideo | null) => void = () => undefined;
    const getSelected = vi
      .fn()
      .mockResolvedValueOnce(makeVideo())
      .mockReturnValueOnce(new Promise<TrackVideo | null>((resolve) => {
        resolveSecond = resolve;
      }));

    window.echo = {
      mv: {
        getSelected,
        getSettings: vi.fn().mockResolvedValue(defaultMvSettings),
        setSettings: vi.fn(),
        findLocalCandidates: vi.fn().mockResolvedValue([]),
        searchNetworkCandidates: vi.fn().mockResolvedValue([]),
        getCandidates: vi.fn().mockResolvedValue([]),
        resolveStreams: vi.fn(),
        setQuality: vi.fn(),
        chooseLocalVideo: vi.fn().mockResolvedValue(null),
        bindLocalVideo: vi.fn(),
        selectVideo: vi.fn(),
        clearSelected: vi.fn(),
        openExternal: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container, rerender } = render(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(0)}
      />,
    );

    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));

    rerender(
      <MvPanel
        trackId="track-2"
        title="Next Song"
        artist="Next Artist"
        coverUrl="echo-cover://thumb/next"
        isAudioPlaying
        audioClock={makeAudioClock(0)}
      />,
    );

    await waitFor(() => expect(container.querySelector('video')).toBeNull());
    expect(screen.getByText('Loading MV')).toBeTruthy();
    expect(screen.queryByText('Test Song MV')).toBeNull();

    resolveSecond(null);
  });

  it('pauses the MV when audio playback pauses', async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container, rerender } = renderPanel(makeVideo(), true);

    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));

    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying={false}
        audioClock={makeAudioClock(0, 1, { state: 'paused' })}
      />,
    );

    await waitFor(() => expect(pauseSpy).toHaveBeenCalled());
    expect(playSpy).toHaveBeenCalled();
  });

  it('syncs MV video to the audio position when metadata loads without restarting audio', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 42);

    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(42, 3));
    expect(window.echo.playback.seek).not.toHaveBeenCalled();
  });

  it('corrects drift conservatively while allowing obvious audio position jumps through', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { container, rerender } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 10);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(10, 3));

    video.currentTime = 10.4;
    nowSpy.mockReturnValue(1500);
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(10.9)}
      />,
    );

    expect(video.currentTime).toBeCloseTo(10.4, 3);

    video.currentTime = 20;
    nowSpy.mockReturnValue(1600);
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(10.9)}
      />,
    );

    expect(video.currentTime).toBeCloseTo(20, 3);

    video.currentTime = 10.4;
    nowSpy.mockReturnValue(1700);
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(45)}
      />,
    );

    await waitFor(() => expect(video.currentTime).toBeCloseTo(45, 3));
  });

  it('does not write video time for frequent clock anchors within the drift threshold', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { container, rerender } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 10);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(10, 3));

    video.currentTime = 10.2;
    performanceNow.mockReturnValue(100);
    nowSpy.mockReturnValue(1100);
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(10.25, 1, { updatedAtMs: 100 })}
      />,
    );

    expect(video.currentTime).toBeCloseTo(10.2, 3);
  });

  it('force-syncs MV when audio resumes from pause', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container, rerender } = renderPanel(makeVideo(), false, { ...defaultMvSettings, restartAudioOnLoad: true }, 12);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(12, 3));

    video.currentTime = 0;
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(40)}
      />,
    );

    await waitFor(() => expect(video.currentTime).toBeCloseTo(40, 3));
  });

  it('does not adjust video time when MV progress following is disabled', async () => {
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: false }, 30);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.currentTime = 0;
    video.dispatchEvent(new Event('loadedmetadata'));

    expect(video.currentTime).toBe(0);
    expect(window.echo.playback.seek).not.toHaveBeenCalled();
  });

  it('force-syncs MV when playback seek commits from the progress bar', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 8);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(8, 3));

    video.currentTime = 8.2;
    window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { trackId: 'track-1', positionSeconds: 64 } }));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(64, 3));
  });

  it('ignores playback seek sync events for other tracks', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 8);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(8, 3));

    video.currentTime = 8.2;
    window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { trackId: 'track-2', positionSeconds: 64 } }));

    expect(video.currentTime).toBeCloseTo(8.2, 3);
  });

  it('syncs MV playback rate to the audio playback rate', async () => {
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 0, 1.25);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    video.dispatchEvent(new Event('loadedmetadata'));

    expect(video.playbackRate).toBeCloseTo(1.25, 3);
  });

  it('wraps the target time for shorter looping MV videos', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 125);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(5, 3));
  });

  it('uses loop-aware drift around MV loop boundaries', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { container, rerender } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 29.7);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
    video.dispatchEvent(new Event('loadedmetadata'));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(29.7, 3));

    video.currentTime = 29.8;
    nowSpy.mockReturnValue(2500);
    rerender(
      <MvPanel
        trackId="track-1"
        title="Test Song"
        artist="Test Artist"
        coverUrl="echo-cover://thumb/test"
        isAudioPlaying
        audioClock={makeAudioClock(30.2, 1, { state: 'paused' })}
      />,
    );

    expect(video.currentTime).toBeCloseTo(29.8, 3);
  });

  it('advances the MV sync target from the audio clock anchor and playback rate', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { container } = renderPanel(makeVideo(), true, { ...defaultMvSettings, restartAudioOnLoad: true }, 10, 1.5);
    const video = await waitFor(() => {
      const element = container.querySelector('video') as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    performanceNow.mockReturnValue(2000);
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(11.5, 3));
  });

  it('shows fallback for selected MV that cannot play in app', async () => {
    renderPanel(makeVideo({ playableInApp: false, mediaUrl: null, mimeType: 'video/x-matroska' }));

    expect(await screen.findByText('External player required')).toBeTruthy();
  });

  it('does not surface auto-selected external network candidates in the lyrics MV panel', async () => {
    const { container } = renderPanel(
      makeVideo({
        sourceType: 'search_candidate',
        provider: 'youtube',
        playableInApp: false,
        mediaUrl: null,
        thumbnailUrl: 'https://i.example/external-thumb.jpg',
        title: 'External Search Result',
      }),
    );

    expect(await screen.findByText('MV unavailable')).toBeTruthy();
    expect(screen.queryByText('External player required')).toBeNull();
    expect(screen.queryByText('External Search Result')).toBeNull();
    expect(container.querySelector('.lyrics-mv-artwork img')?.getAttribute('src')).toBe('echo-cover://thumb/test');
  });

  it('falls back to the track cover when the selected MV thumbnail fails to load', async () => {
    const { container } = renderPanel(
      makeVideo({
        playableInApp: false,
        mediaUrl: null,
        thumbnailUrl: 'https://i.example/broken-mv-thumb.jpg',
      }),
    );

    const artwork = await waitFor(() => {
      const image = container.querySelector('.lyrics-mv-artwork img') as HTMLImageElement | null;
      expect(image?.getAttribute('src')).toBe('https://i.example/broken-mv-thumb.jpg');
      return image!;
    });

    fireEvent.error(artwork);

    await waitFor(() =>
      expect(container.querySelector('.lyrics-mv-artwork img')?.getAttribute('src')).toBe('echo-cover://thumb/test'),
    );
  });

  it('refreshes when the MV binding changes elsewhere', async () => {
    renderPanel(null);

    await waitFor(() => expect(window.echo.mv.getSelected).toHaveBeenCalled());
    const initialCallCount = vi.mocked(window.echo.mv.getSelected).mock.calls.length;
    window.dispatchEvent(new CustomEvent('mv:changed', { detail: { trackId: 'track-1' } }));

    await waitFor(() => expect(window.echo.mv.getSelected).toHaveBeenCalledTimes(initialCallCount + 1));
  });

  it('does not reload the selected MV for lyrics display setting changes', async () => {
    const { container } = renderPanel(makeVideo());

    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1'));
    const initialCallCount = vi.mocked(window.echo.mv.getSelected).mock.calls.length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('settings:changed', {
          detail: {
            lyricsFontSizePx: 44,
            lyricsSecondaryFontSizePx: 24,
            lyricsContextOpacityPercent: 64,
          },
        }),
      );
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(window.echo.mv.getSelected).toHaveBeenCalledTimes(initialCallCount);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('echo-video://mv/video-1');
  });
});
