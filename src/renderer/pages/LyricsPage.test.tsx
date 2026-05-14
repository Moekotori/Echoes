// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { LibraryTrack } from "../../shared/types/library";
import type {
  LyricsSearchCandidate,
  TrackLyrics,
} from "../../shared/types/lyrics";
import type { MvSettings, TrackVideo } from "../../shared/types/mv";
import {
  PlaybackQueueProvider,
  usePlaybackQueue,
} from "../stores/PlaybackQueueProvider";
import { LyricsPage } from "./LyricsPage";
import type { LyricLine } from "../components/lyrics/lyricsTypes";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: "track-1",
  path: "D:\\Music\\song.flac",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  albumArtist: "Test Album Artist",
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: "flac",
  sampleRate: 96000,
  bitDepth: 24,
  bitrate: 2400000,
  coverId: null,
  coverThumb: "echo-cover://thumb/test",
  embeddedMetadataStatus: "present",
  embeddedCoverStatus: "present",
  networkMetadataStatus: "none",
  fieldSources: {},
  ...overrides,
});

const makeAudioStatus = (
  track: LibraryTrack | null,
  positionSeconds = 0,
): AudioStatus => ({
  host: "ready",
  state: track ? "playing" : "idle",
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: "wasapi-shared",
  outputMode: "shared",
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: "nightcore",
  currentFilePath: track?.path ?? null,
  currentTrackId: track?.id ?? null,
  durationSeconds: track?.duration ?? 0,
  positionSeconds,
  channels: 2,
  codec: track?.codec ?? null,
  bitDepth: track?.bitDepth ?? null,
  bitrate: track?.bitrate ?? null,
  fileSampleRate: track?.sampleRate ?? null,
  decoderOutputSampleRate: track?.sampleRate ?? null,
  requestedOutputSampleRate: track?.sampleRate ?? null,
  actualDeviceSampleRate: track?.sampleRate ?? null,
  sharedDeviceSampleRate: track?.sampleRate ?? null,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: "Flat",
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
});

const makeAppSettings = (
  overrides: Partial<AppSettings> = {},
): AppSettings => ({
  albumMergeStrategy: "standard",
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  appCustomWallpaperPath: null,
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperUnifiedOpacityEnabled: false,
  networkMetadataEnabled: false,
  networkMetadataProviders: ["netease-cloud-music", "qq-music"],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: "lrclib",
  lyricsEnabledProviders: ["local", "lrclib", "netease", "qqmusic"],
  lyricsProviderOrder: ["local", "lrclib", "netease", "qqmusic"],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsFontSizePx: 36,
  lyricsColor: "#314054",
  lyricsBackgroundMode: "theme",
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ["bilibili", "youtube"],
  mvProviderOrder: ["bilibili", "youtube"],
  mvAutoSearch: true,
  mvMaxQuality: "1080p",
  mvAllow60fps: true,
  channelBalance: {
    enabled: false,
    balance: 0,
    leftGainDb: 0,
    rightGainDb: 0,
    swapLeftRight: false,
    monoMode: "off",
    invertLeft: false,
    invertRight: false,
    constantPower: true,
  },
  playerVolume: 1,
  playbackSpeed: 1,
  playbackSpeedMode: "nightcore",
  scanPerformanceMode: "balanced",
  duplicateTracksEnabled: false,
  duplicateTracksMode: "strict",
  duplicateTracksAutoRebuildAfterScan: false,
  discordRichPresenceEnabled: false,
  lastFmEnabled: false,
  lastFmUsername: null,
  lastFmSessionKey: null,
  lastFmScrobbleEnabled: true,
  lastFmNowPlayingEnabled: true,
  lastFmMinScrobbleSeconds: 30,
  lastFmAuthToken: null,
  smtcEnabled: true,
  ...overrides,
});

const lyrics: LyricLine[] = [
  { timeMs: 0, text: "First line" },
  { timeMs: 10000, text: "Second line" },
  { timeMs: 20000, text: "Third line" },
];

const makeTrackLyrics = (
  overrides: Partial<TrackLyrics> = {},
): TrackLyrics => ({
  id: "lyrics-1",
  trackId: "track-1",
  provider: "lrclib",
  providerLyricsId: "lrclib-1",
  kind: "synced",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  durationSeconds: 180,
  lines: lyrics,
  plainText: "First line\nSecond line\nThird line",
  syncedText:
    "[00:00.00]First line\n[00:10.00]Second line\n[00:20.00]Third line",
  offsetMs: 0,
  score: 0.99,
  cachedAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides,
});

const makeTrackVideo = (
  overrides: Partial<TrackVideo> = {},
): TrackVideo => ({
  id: "video-1",
  trackId: "track-1",
  provider: "local",
  sourceType: "manual",
  sourceId: "local:1",
  title: "Test Song MV",
  artist: "Test Artist",
  url: null,
  providerUrl: null,
  thumbnailUrl: null,
  filePath: null,
  mediaUrl: "echo-video://mv/video-1",
  mimeType: "video/mp4",
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
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides,
});

const defaultMvSettings: MvSettings = {
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: true,
  enabledProviders: ["bilibili", "youtube"],
  providerOrder: ["bilibili", "youtube"],
  maxQuality: "1080p",
  allow60fps: true,
};

const attachMvBridge = (
  selected: TrackVideo | null,
  settings: MvSettings = defaultMvSettings,
): void => {
  window.echo = {
    ...window.echo,
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
  } as unknown as Window["echo"];
};

const makeLyricsCandidate = (
  overrides: Partial<LyricsSearchCandidate> = {},
): LyricsSearchCandidate => ({
  id: "candidate-1",
  provider: "lrclib",
  providerLyricsId: "provider-lyrics-1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  durationSeconds: 180,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 0.96,
  sourceLabel: "LRCLIB",
  risk: "low",
  reasons: ["duration_close", "synced_duration_safe"],
  ...overrides,
});

const QueueSeed = ({
  children,
  track,
}: {
  children: JSX.Element;
  track: LibraryTrack;
}): JSX.Element => {
  const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

  useEffect(() => {
    replaceQueue([track]);
    setCurrentTrackId(track.id);
  }, [replaceQueue, setCurrentTrackId, track]);

  return children;
};

const mockEcho = (
  track: LibraryTrack | null,
  positionSeconds = 0,
  settingsOverrides: Partial<AppSettings> = {},
): { emitAudioStatus: (status: AudioStatus) => void; seek: ReturnType<typeof vi.fn> } => {
  let audioStatusHandler: ((status: AudioStatus) => void) | null = null;
  const seek = vi.fn().mockResolvedValue({
    state: "playing",
    currentTrackId: track?.id ?? null,
    positionMs: positionSeconds * 1000,
    durationMs: (track?.duration ?? 0) * 1000,
    filePath: track?.path ?? null,
  });

  window.echo = {
    app: {
      getSettings: vi
        .fn()
        .mockResolvedValue(makeAppSettings(settingsOverrides)),
      setSettings: vi.fn(),
      chooseLyricsWallpaper: vi.fn(),
    },
    playback: {
      getStatus: vi.fn().mockResolvedValue({
        state: track ? "playing" : "idle",
        currentTrackId: track?.id ?? null,
        positionMs: positionSeconds * 1000,
        durationMs: (track?.duration ?? 0) * 1000,
        filePath: track?.path ?? null,
      }),
      playLocalFile: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek,
      openLocalAudioFile: vi.fn(),
    },
    audio: {
      getStatus: vi
        .fn()
        .mockResolvedValue(makeAudioStatus(track, positionSeconds)),
      listDevices: vi.fn(),
      setOutput: vi
        .fn()
        .mockResolvedValue(makeAudioStatus(track, positionSeconds)),
      onStatus: vi.fn((handler: (status: AudioStatus) => void) => {
        audioStatusHandler = handler;
        return () => {
          if (audioStatusHandler === handler) {
            audioStatusHandler = null;
          }
        };
      }),
    },
  } as unknown as Window["echo"];

  return {
    emitAudioStatus: (status: AudioStatus): void => {
      audioStatusHandler?.(status);
    },
    seek,
  };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LyricsPage", () => {
  it("keeps MV immersive lyrics color driven by the lyrics color variable", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-line {\n  color: var(--lyrics-color);");
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-background) .lyrics-line[data-active="true"] {\n  color: var(--lyrics-color);');
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-background[data-lyrics-readability="true"]) .lyrics-line span');
    expect(css).not.toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line(?:\[data-active="true"\])? \{\s*color: #fff;/);
  });

  it("shows current song information when a track is playing", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Test Song" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Test Artist").length).toBeGreaterThan(0);
    expect(screen.queryByText(/FLAC \/ 2400 kbps \/ 96 kHz/)).toBeNull();
  });

  it("hides the lyrics page song header when configured", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsHeaderHidden: true });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");

    expect(container.querySelector(".lyrics-track-header")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Test Song" })).toBeNull();
  });

  it("shows an empty state when no song is playing", async () => {
    mockEcho(null);

    render(
      <PlaybackQueueProvider>
        <LyricsPage />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Nothing is playing")).toBeTruthy();
  });

  it("highlights the current lyric line from playback position", async () => {
    const track = makeTrack();
    mockEcho(track, 12);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Second line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("updates active lyrics from audio status pushes", async () => {
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 0);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 12));
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("advances active lyrics with RAF interpolation between status updates", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const track = makeTrack();
    mockEcho(track, 9.2);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("First line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("First line");

    performanceNow.mockReturnValue(900);
    act(() => {
      rafCallback?.(900);
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
  });

  it("applies global lyrics sync offset without changing lyric files", async () => {
    const track = makeTrack();
    mockEcho(track, 9.2, { lyricsGlobalSyncOffsetMs: 1000 });
    const { container, unmount } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    unmount();
    mockEcho(track, 10.2, { lyricsGlobalSyncOffsetMs: -1000 });
    const secondRender = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        secondRender.container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );
  });

  it("keeps MV progress following on raw audio time when global lyrics offset shifts lyrics", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const track = makeTrack();
    mockEcho(track, 9.2, { lyricsGlobalSyncOffsetMs: 1000 });
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(9.2, 3));
  });

  it("updates the MV audio clock anchor from audio status pushes", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 8);
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(8, 3));

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 30));
    });

    await waitFor(() => expect(video.currentTime).toBeCloseTo(30, 3));
  });

  it("does not feed lyrics RAF interpolation into the MV sync clock", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const track = makeTrack();
    mockEcho(track, 9.2);
    attachMvBridge(makeTrackVideo());
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("First line"),
    );

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));
    await waitFor(() => expect(video.currentTime).toBeCloseTo(9.2, 3));

    performanceNow.mockReturnValue(900);
    act(() => {
      rafCallback?.(900);
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Second line"),
    );
    expect(video.currentTime).toBeCloseTo(9.2, 3);
  });

  it("seeks when a synced lyric line is clicked", async () => {
    const track = makeTrack();
    const { seek } = mockEcho(track, 0);
    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByText("Second line"));

    await waitFor(() => expect(seek).toHaveBeenCalledWith(10));
  });

  it("uses album artwork as the MV fallback and shows a default visual without cover art", async () => {
    const track = makeTrack();
    mockEcho(track);
    const { container, rerender } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe("echo-cover://thumb/test");
    expect(
      container
        .querySelector('.lyrics-mv-card[data-cover="true"] img')
        ?.getAttribute("src"),
    ).toBe("echo-cover://thumb/test");

    const noCoverTrack = makeTrack({ coverThumb: null });
    mockEcho(noCoverTrack);
    rerender(
      <PlaybackQueueProvider>
        <QueueSeed track={noCoverTrack}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(container.querySelector(".lyrics-mv-placeholder")).toBeTruthy();
  });

  it("uses the original cover for the lyrics header and cover-following background", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe("echo-cover://original/cover%201");
    expect(
      container
        .querySelector('.lyrics-mv-card[data-cover="true"] img')
        ?.getAttribute("src"),
    ).toBe("echo-cover://large/cover%201");

    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsBackgroundMode: "cover",
        },
      }),
    );

    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() => expect(page.dataset.background).toBe("cover"));
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://original/cover%201")',
    );
  });

  it("loads lyrics through the lyrics bridge when trackId changes", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 5000, text: "Loaded from service" }],
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Loaded from service")).toBeTruthy();
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1");
  });

  it("auto-applies a high scoring candidate when the initial lyrics lookup misses", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-97", score: 0.97 }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Auto applied line" }],
          syncedText: "[00:00.00]Auto applied line",
          plainText: "Auto applied line",
        }),
      ),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Auto applied line")).toBeTruthy();
    expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
      "track-1",
      "candidate-97",
    );
  });

  it("auto-applies a high scoring candidate after rematching lyrics", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Current line" }],
          syncedText: "[00:00.00]Current line",
          plainText: "Current line",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-94", score: 0.94 }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Rematched applied line" }],
          syncedText: "[00:00.00]Rematched applied line",
          plainText: "Rematched applied line",
        }),
      ),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current line")).toBeTruthy();
    window.dispatchEvent(new Event("lyrics:rematch-requested"));

    expect(await screen.findByText("Rematched applied line")).toBeTruthy();
    expect(window.echo.lyrics.clearCache).toHaveBeenCalledWith("track-1");
    expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
      "track-1",
      "candidate-94",
    );
  });

  it("clears the previous lyrics immediately when the track changes", async () => {
    const firstTrack = makeTrack({
      id: "track-1",
      title: "First Song",
      path: "D:\\Music\\first.flac",
    });
    const secondTrack = makeTrack({
      id: "track-2",
      title: "Second Song",
      path: "D:\\Music\\second.flac",
    });
    let activeTrack = firstTrack;
    let resolveSecondLyrics: (value: TrackLyrics | null) => void = () => undefined;

    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeAppSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockImplementation(() =>
          Promise.resolve({
            state: "playing",
            currentTrackId: activeTrack.id,
            positionMs: 0,
            durationMs: activeTrack.duration * 1000,
            filePath: activeTrack.path,
          }),
        ),
        playLocalFile: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        openLocalAudioFile: vi.fn(),
      },
      audio: {
        getStatus: vi.fn().mockImplementation(() => Promise.resolve(makeAudioStatus(activeTrack))),
        listDevices: vi.fn(),
        setOutput: vi.fn(),
        onStatus: vi.fn(() => vi.fn()),
      },
      lyrics: {
        getForTrack: vi.fn().mockImplementation((trackId: string) => {
          if (trackId === firstTrack.id) {
            return Promise.resolve(
              makeTrackLyrics({
                trackId,
                lines: [{ timeMs: 0, text: "First track lyric" }],
              }),
            );
          }

          return new Promise<TrackLyrics | null>((resolve) => {
            resolveSecondLyrics = resolve;
          });
        }),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      mv: {
        getSelected: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Window["echo"];

    const SwitchTrack = (): JSX.Element => {
      const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

      useEffect(() => {
        replaceQueue([firstTrack, secondTrack]);
        setCurrentTrackId(firstTrack.id);
      }, [replaceQueue, setCurrentTrackId]);

      return (
        <>
          <button
            type="button"
            onClick={() => {
              activeTrack = secondTrack;
              setCurrentTrackId(secondTrack.id);
            }}
          >
            switch
          </button>
          <LyricsPage />
        </>
      );
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <SwitchTrack />
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First track lyric")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.queryByText("First track lyric")).toBeNull());
    expect(container.querySelector(".lyrics-empty")).toBeNull();

    resolveSecondLyrics(null);
  });

  it("uses only the centered empty lyrics state when no lyrics are found", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"),
    );
    await waitFor(() =>
      expect(container.querySelector(".lyrics-empty")).toBeTruthy(),
    );
    expect(screen.getByText("暂无歌词")).toBeTruthy();
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
  });

  it("hides the instrumental empty-state prompt when configured", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "instrumental",
          lines: [],
          syncedText: null,
          plainText: null,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"),
    );
    expect(screen.queryByText("纯音乐，请欣赏")).toBeNull();
    expect(container.querySelector(".lyrics-empty")).toBeNull();
  });

  it("lets users switch lyrics source without clearing the current lyrics first", async () => {
    const track = makeTrack();
    mockEcho(track);
    const qqLyrics = makeTrackLyrics({
      provider: "qqmusic",
      providerLyricsId: "qq-1",
      lines: [{ timeMs: 0, text: "QQ applied line" }],
      syncedText: "[00:00.00]QQ applied line",
    });
    window.echo.lyrics = {
      getForTrack: vi
        .fn()
        .mockResolvedValue(
          makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] }),
        ),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "lrclib-candidate",
          title: "LRCLIB Song",
          sourceLabel: "LRCLIB",
        }),
        makeLyricsCandidate({
          id: "qq-candidate",
          provider: "qqmusic",
          providerLyricsId: "qq-1",
          title: "QQ Song",
          sourceLabel: "QQ Music",
          reasons: ["qqmusic_provider", "duration_close"],
        }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(qqLyrics),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Current lyrics")).toBeTruthy();

    window.dispatchEvent(new Event("lyrics:search-requested"));

    expect(await screen.findByText("LRCLIB Song")).toBeTruthy();
    expect(screen.getByText("QQ Song")).toBeTruthy();
    expect(window.echo.lyrics.clearCache).not.toHaveBeenCalled();
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1");

    const sourceFilters = screen.getByLabelText("歌词来源筛选");
    fireEvent.click(
      within(sourceFilters).getByRole("button", { name: /QQ Music/ }),
    );

    expect(screen.queryByText("LRCLIB Song")).toBeNull();
    fireEvent.click(screen.getByText("QQ Song"));

    await waitFor(() =>
      expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
        "track-1",
        "qq-candidate",
      ),
    );
    expect(await screen.findByText("QQ applied line")).toBeTruthy();
  });

  it("does not load lyrics while lyrics display is disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEnabled: false });
    const getForTrack = vi.fn().mockResolvedValue(makeTrackLyrics());
    window.echo.lyrics = {
      getForTrack,
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() => expect(getForTrack).not.toHaveBeenCalled());
    expect(screen.queryByText("歌词已关闭")).toBeNull();
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
    expect(container.querySelector(".lyrics-view")).toBeNull();
  });

  it("applies lyrics font, color, and custom wallpaper settings to the page surface", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsFontSizePx: 44,
      lyricsColor: "#FF3366",
      lyricsBackgroundMode: "customWallpaper",
      lyricsCustomWallpaperPath: "D:\\Echo\\lyrics-wallpapers\\custom.png",
      lyricsCoverOpacityPercent: 66,
      lyricsCoverBlurPx: 18,
      lyricsCoverBrightnessPercent: 120,
      lyricsBackgroundScalePercent: 132,
      lyricsSecondaryFontSizePx: 24,
      lyricsContextOpacityPercent: 64,
    });

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    await waitFor(() =>
      expect(page.dataset.background).toBe("customWallpaper"),
    );
    expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("44px");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FF3366");
    expect(page.style.getPropertyValue("--lyrics-wallpaper")).toContain(
      "echo-wallpaper://lyrics/custom",
    );
    expect(page.style.getPropertyValue("--lyrics-cover-opacity")).toBe("0.66");
    expect(page.style.getPropertyValue("--lyrics-cover-blur")).toBe("18px");
    expect(page.style.getPropertyValue("--lyrics-cover-brightness")).toBe(
      "120%",
    );
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe(
      "1.32",
    );
    expect(page.style.getPropertyValue("--lyrics-secondary-font-size")).toBe(
      "24px",
    );
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.64",
    );
  });

  it("applies lyrics display settings from settings change events immediately", async () => {
    const track = makeTrack();
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Test Song" });
    const page = container.querySelector(".lyrics-page") as HTMLElement;

    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsFontSizePx: 52,
          lyricsColor: "#FFFFFF",
          lyricsBackgroundMode: "cover",
          lyricsCoverOpacityPercent: 24,
          lyricsCoverBlurPx: 4,
          lyricsCoverBrightnessPercent: 72,
          lyricsBackgroundScalePercent: 86,
          lyricsSecondaryFontSizePx: 22,
          lyricsContextOpacityPercent: 24,
        },
      }),
    );

    await waitFor(() =>
      expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("52px"),
    );
    expect(page.dataset.background).toBe("cover");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FFFFFF");
    expect(page.style.getPropertyValue("--lyrics-cover-opacity")).toBe("0.24");
    expect(page.style.getPropertyValue("--lyrics-cover-blur")).toBe("4px");
    expect(page.style.getPropertyValue("--lyrics-cover-brightness")).toBe(
      "72%",
    );
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe(
      "0.86",
    );
    expect(page.style.getPropertyValue("--lyrics-secondary-font-size")).toBe(
      "22px",
    );
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.24",
    );
  });

  it("hides romanization and translations immediately from settings change events", async () => {
    const track = makeTrack();
    mockEcho(track);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              {
                timeMs: 0,
                text: "Original line",
                romanization: "Romanized line",
                translation: "Translated line",
              },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("Romanized line")).toBeTruthy();
    expect(screen.getByText("Translated line")).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("settings:changed", {
        detail: {
          lyricsRomanizationEnabled: false,
          lyricsTranslationEnabled: false,
        },
      }),
    );

    await waitFor(() => expect(screen.queryByText("Romanized line")).toBeNull());
    expect(screen.queryByText("Translated line")).toBeNull();
  });

  it("hides line translations when configured", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsTranslationEnabled: false });

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage
            initialLyrics={[
              { timeMs: 0, text: "Original line", translation: "Translated line" },
            ]}
          />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Original line");
    expect(screen.queryByText("Translated line")).toBeNull();
  });

  it("shows plain lyrics in the centered karaoke layout", async () => {
    const track = makeTrack();
    mockEcho(track, 120);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "plain",
          lines: [
            { timeMs: -1, text: "Plain first" },
            { timeMs: -1, text: "Plain second" },
          ],
          syncedText: null,
          plainText: "Plain first\nPlain second",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn(),
      clearCache: vi.fn(),
    };
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Plain second");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Plain second");
  });
});
