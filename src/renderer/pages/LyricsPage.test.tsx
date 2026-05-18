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
  waitFor,
} from "@testing-library/react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { LibraryAlbum, LibraryTrack } from "../../shared/types/library";
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
import { albumDetailNavigationEvent } from "../utils/albumNavigation";

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

const makeAlbum = (overrides: Partial<LibraryAlbum> = {}): LibraryAlbum => ({
  id: "album-1",
  albumKey: "test-artist/test-album",
  title: "Test Album",
  albumArtist: "Test Album Artist",
  year: 2026,
  trackCount: 1,
  duration: 180,
  coverId: null,
  coverThumb: "echo-cover://album/test",
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
  activeOutputBackendImpl: null,
  outputMode: "shared",
  useJuceOutputRequested: false,
  useJuceDecodeRequested: false,
  activeDecodeBackendImpl: null,
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
  appearanceTheme: "light",
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
  lyricsOffsetControlsEnabled: false,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsColor: "#314054",
  lyricsSmartReadableColorsEnabled: false,
  lyricsHighResolutionNetworkCoverEnabled: false,
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

const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

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
  offsetMs: 0,
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
      setOffset: vi.fn(),
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
    library: {
      resolveLyricsBackgroundCover: vi.fn().mockResolvedValue(null),
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LyricsPage", () => {
  it("keeps MV immersive lyrics readable over bright videos in dark mode", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toContain("--lyrics-word-accent-color: var(--lyrics-color);");
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line \{\s*color: var\(--lyrics-readable-color\);/);
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line\[data-active="true"\] \{\s*color: var\(--lyrics-readable-color\);/);
    expect(css).toContain('html[data-theme="dark"] .lyrics-page:has(.lyrics-mv-background)');
    expect(css).toContain("--lyrics-readable-color: color-mix(in srgb, var(--theme-heading-text) 86%, var(--lyrics-color) 14%);");
    expect(css).toContain("--lyrics-word-accent-color: color-mix(in srgb, var(--color-accent-strong) 72%, var(--theme-heading-text) 28%);");
    expect(css).toMatch(/html\[data-theme="dark"\] \.lyrics-mv-background::after \{\s*opacity: max\(var\(--mv-immersive-overlay-opacity\), 0\.42\);/);
    expect(css).toContain("--lyrics-word-fill-color: var(--lyrics-word-accent-color);");
    expect(css).toContain("var(--lyrics-word-fill-color) 0 calc((var(--lyrics-word-progress) * 100%) - 0.12em)");
    expect(css).toContain("color-mix(in srgb, var(--lyrics-word-fill-color) 72%, var(--lyrics-word-upcoming-color) 28%) calc(var(--lyrics-word-progress) * 100%)");
    expect(css).toContain('.lyrics-line[data-active="true"][data-word-highlight="true"] .lyrics-word[data-word-state="current"]');
    expect(css).not.toContain('scale(1.045)');
    expect(css).not.toContain('.lyrics-word[data-word-state="current"]::after');
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability="true"]) .lyrics-line span');
    expect(css).toContain('.lyrics-page:has(.lyrics-mv-panel[data-lyrics-readability="true"]) .lyrics-line[data-word-highlight="true"] .lyrics-word');
    expect(css).not.toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line(?:\[data-active="true"\])? \{\s*color: var\(--lyrics-color\);/);
  });

  it("keeps dark immersive track info and player tags readable", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");

    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) {");
    expect(css).toContain("--lyrics-mv-heading-color:");
    expect(css).toContain("--lyrics-mv-muted-color:");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-copy h1");
    expect(css).toContain("color: var(--lyrics-mv-heading-color);");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-copy p,");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-track-album,");
    expect(css).toContain("color: var(--lyrics-mv-muted-color);");
    expect(css).toContain(".lyrics-page:has(.lyrics-mv-background) .lyrics-back-button:hover");
    expect(polishCss).toContain('html[data-theme="dark"] .app-shell:has(.lyrics-page) .player-tags .hifi-tag');
    expect(polishCss).toContain("color: var(--theme-page-text);");
    expect(polishCss).toContain('html[data-theme="dark"] .app-shell:has(.lyrics-page) .player-tags .tag-hires');
    expect(polishCss).not.toMatch(/html\[data-theme="dark"\] \.app-shell:has\(\.lyrics-page\) \.player-tags \.hifi-tag \{[^}]*color: var\(--theme-button-text\);/);
  });

  it("keeps MV immersive lyrics on the normal lyrics size scale", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");

    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line span \{\s*max-width: min\(100%, 1120px, var\(--lyrics-line-max-width\)\);\s*font-size: calc\(var\(--lyrics-font-size\) \* 0\.9\);/);
    expect(css).toMatch(/\.lyrics-line span \{\s*display: inline-block;\s*max-width: min\(100%, var\(--lyrics-line-max-width\)\);/);
    expect(css).toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\) \.lyrics-line\[data-active="true"\] span \{\s*font-size: calc\(var\(--lyrics-font-size\) \* 1\.25\);/);
    expect(css).not.toMatch(/\.lyrics-page:has\(\.lyrics-mv-background\)[\s\S]*font-size: calc\(var\(--lyrics-font-size\) \* 1\.5\);/);
  });

  it("scopes smart readable colors to lyric text only", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");

    expect(css).toContain('.lyrics-page[data-smart-readable="true"] .lyrics-line,');
    expect(css).toContain('.lyrics-page[data-smart-readable="true"] .lyrics-line[data-active="true"] {');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"]::after');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-copy h1');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-copy p');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-album');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-track-status');
    expect(css).not.toContain('.lyrics-page[data-smart-readable="true"] .lyrics-back-button');
    expect(polishCss).not.toContain('data-lyrics-smart-readable');
  });

  it("keeps the optional lyrics mini player compact, setting gated, and clear of cover-only shelves", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const layoutCss = readFileSync("src/renderer/styles/layout.css", "utf8");
    const polishCss = readFileSync("src/renderer/styles/ui-polish.css", "utf8");
    const themePresetsCss = readFileSync("src/renderer/styles/theme-presets.css", "utf8");

    expect(layoutCss).toMatch(/\.app-shell--lyrics-player-drawer \{[\s\S]*?grid-template-rows: var\(--titlebar-height\) minmax\(0, 1fr\) 0;/);
    expect(layoutCss).toMatch(/\.lyrics-player-drawer-host \{[\s\S]*?position: fixed;[\s\S]*?width: min\(820px, calc\(100vw - 96px\)\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-bar \{[\s\S]*?grid-template-columns: auto auto;[\s\S]*?justify-content: center;[\s\S]*?min-height: 54px;[\s\S]*?border-radius: 999px;[\s\S]*?background: var\(--lyrics-mini-player-background, rgba\(35, 33, 32, 0\.78\)\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-center \{[\s\S]*?grid-template-columns: auto auto;[\s\S]*?justify-content: center;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.progress-row \{[\s\S]*?width: clamp\(230px, 21vw, 286px\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-left-panel \{\s*grid-template-rows: clamp\(54px, 8vh, 86px\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-scroll \{[\s\S]*?padding-bottom: clamp\(76px, 10vh, 112px\);/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?position: absolute;[\s\S]*?top: clamp\(72px, 8\.2vh, 104px\);[\s\S]*?left: clamp\(28px, 4vw, 72px\);[\s\S]*?width: min\(660px, calc\(100% - 56px\)\);[\s\S]*?grid-template-columns: clamp\(82px, 6\.2vw, 112px\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-backdrop::before \{\s*background: none;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-cover \{[\s\S]*?width: clamp\(82px, 6\.2vw, 112px\);[\s\S]*?margin-top: 0;/);
    expect(css).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-copy h1 \{[\s\S]*?font-size: clamp\(26px, 2\.15vw, 36px\);/);
    expect(css).not.toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-left-panel \{\s*grid-template-rows: 58px minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.app-shell--lyrics-player-drawer \.lyrics-page:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.lyrics-track-header \{[\s\S]*?top: 66px;[\s\S]*?grid-template-columns: 64px minmax\(0, 1fr\);/);
    expect(polishCss).toMatch(/\.app-shell--lyrics-player-drawer \.lyrics-player-drawer-host \.player-bar \{[\s\S]*?background: var\(--lyrics-mini-player-background, rgba\(35, 33, 32, 0\.78\)\);[\s\S]*?backdrop-filter: blur\(22px\) saturate\(1\.18\);/);
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .player-bar');
    expect(themePresetsCss).toContain('--lyrics-mini-readable-text: var(--theme-heading-text);');
    expect(themePresetsCss).toContain('--lyrics-mini-readable-muted: color-mix');
    expect(themePresetsCss).toContain('var(--lyrics-mini-player-background, rgb(var(--preset-panel-rgb) / 0.9))');
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .player-bar .icon-button');
    expect(themePresetsCss).toContain('.app-shell--lyrics-player-drawer .lyrics-player-drawer-host .progress-fill');
    expect(themePresetsCss).toContain('html[data-theme-preset="darkSideMoon"] .lyrics-page:has(.lyrics-mv-panel[data-mv-enabled="false"]) .lyrics-track-header');
    expect(themePresetsCss).toContain('html[data-theme-preset="darkSideMoon"] .track-subtitle');
    expect(css).not.toMatch(/\.app-shell:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.player-bar \{/);
    expect(polishCss).not.toMatch(/\.app-shell:has\(\.lyrics-mv-panel\[data-mv-enabled="false"\]\) \.player-bar \{/);
  });

  it("does not wash out the lyrics wallpaper when regular MV is visible", () => {
    const css = readFileSync("src/renderer/styles/lyrics.css", "utf8");
    const regularMvSelector = '.lyrics-page:has(.lyrics-mv-panel[data-mv-enabled="true"][data-immersive-active="false"]) .lyrics-backdrop::before';

    expect(css).toMatch(new RegExp(`${regularMvSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\s*background: none;`));
    expect(css).toContain('.lyrics-page[data-background="cover"]:has(.lyrics-mv-panel[data-mv-enabled="true"][data-immersive-active="false"]) .lyrics-backdrop::after');
    expect(css).toContain('brightness(var(--lyrics-cover-brightness)) saturate(1.04);');
    expect(css).toMatch(/\.lyrics-page\[data-background="customWallpaper"\]:has\(\.lyrics-mv-panel\[data-mv-enabled="true"\]\[data-immersive-active="false"\]\) \.lyrics-backdrop \{\s*background: transparent;/);
  });

  it("shows current song information when a track is playing", async () => {
    const track = makeTrack();
    mockEcho(track);

    render(
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

  it("opens the current track album detail from the lyrics header", async () => {
    const track = makeTrack();
    const album = makeAlbum();
    mockEcho(track);
    const getAlbumForTrack = vi.fn().mockResolvedValue(album);
    window.echo = {
      ...window.echo,
      library: {
        getAlbumForTrack,
      },
    } as unknown as Window["echo"];
    const navigationEvents: unknown[] = [];
    const handleAlbumNavigation = (event: Event): void => {
      navigationEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener(albumDetailNavigationEvent, handleAlbumNavigation);

    render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Test Album" }));

    await waitFor(() => expect(getAlbumForTrack).toHaveBeenCalledWith("track-1"));
    expect(navigationEvents).toEqual([{ album }]);
    window.removeEventListener(albumDetailNavigationEvent, handleAlbumNavigation);
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

  it("keeps active lyrics from jumping backward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
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

    performanceNow.mockReturnValue(250);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 8.9));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("keeps high-speed active lyrics from jumping backward on a brief same-track stale audio status", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);
    window.echo.audio.getStatus = vi
      .fn()
      .mockResolvedValue({ ...makeAudioStatus(track, 10.4), playbackRate: 2 });

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

    performanceNow.mockReturnValue(900);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 8.9), playbackRate: 2 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("rebases active lyrics smoothly when playback speed changes with a stale source position", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const { emitAudioStatus } = mockEcho(track, 10.4);

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

    performanceNow.mockReturnValue(2000);
    act(() => {
      emitAudioStatus({ ...makeAudioStatus(track, 8.9), playbackRate: 2 });
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Second line");
  });

  it("updates active lyrics immediately when playback seek commits from the progress bar", async () => {
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
      window.dispatchEvent(
        new CustomEvent("playback:seeked", {
          detail: { trackId: "track-1", positionSeconds: 21 },
        }),
      );
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Third line"),
    );

    act(() => {
      emitAudioStatus(makeAudioStatus(track, 0));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Third line");
  });

  it("keeps a committed seek anchored when delayed audio status is still stale", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
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
      window.dispatchEvent(
        new CustomEvent("playback:seeked", {
          detail: { trackId: "track-1", positionSeconds: 21 },
        }),
      );
    });

    await waitFor(() =>
      expect(
        container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
      ).toContain("Third line"),
    );

    performanceNow.mockReturnValue(2000);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 0));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Third line");
  });

  it("trusts real playback time after a missed pause instead of carrying old interpolation", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const track = makeTrack();
    const pauseSensitiveLyrics: LyricLine[] = [
      { timeMs: 0, text: "Before pause line" },
      { timeMs: 8000, text: "Should not be active yet" },
    ];
    const { emitAudioStatus } = mockEcho(track, 7);
    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={pauseSensitiveLyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByText("Before pause line");
    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Before pause line");

    performanceNow.mockReturnValue(5000);
    act(() => {
      emitAudioStatus(makeAudioStatus(track, 7.2));
    });

    expect(
      container.querySelector('.lyrics-line[data-active="true"]')?.textContent,
    ).toContain("Before pause line");
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

  it("switches between pure lyrics and MV mode from bottom navigation events", async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "lyrics");
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

    await screen.findByRole("heading", { name: "Test Song" });
    expect(container.querySelector('.lyrics-page[data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector('.lyrics-mv-panel[data-mv-enabled="false"][data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(window.echo.mv?.getSelected).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent("app:navigate:lyrics", { detail: { mode: "mv" } }));
    });

    const video = await waitFor(() => {
      const element = container.querySelector("video") as HTMLVideoElement | null;
      expect(element).toBeTruthy();
      return element!;
    });
    expect(video.getAttribute("src")).toBe("echo-video://mv/video-1");
    expect(container.querySelector('.lyrics-page[data-view-mode="mv"]')).toBeTruthy();

    expect(screen.queryByRole("button", { name: "回到纯净歌词" })).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("app:navigate:lyrics", { detail: { mode: "lyrics" } }));
    });

    await waitFor(() =>
      expect(container.querySelector('.lyrics-page[data-view-mode="lyrics"]')).toBeTruthy(),
    );
    expect(container.querySelector('.lyrics-mv-panel[data-mv-enabled="false"][data-view-mode="lyrics"]')).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(window.sessionStorage.getItem("echo:lyrics:view-mode")).toBe("lyrics");
  });

  it("keeps MV progress following on raw audio time when global lyrics offset shifts lyrics", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
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
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
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
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
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
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
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
    ).toBe("echo-cover://original/test");
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

  it("shows inline artwork for AirPlay snapshot tracks on the lyrics page", async () => {
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
    const inlineCover = "data:image/png;base64,QUlS";
    const track = makeTrack({
      id: "airplay-receiver:session-1",
      path: "airplay-receiver:session-1",
      mediaType: "remote",
      isTemporary: true,
      title: "Shelter",
      artist: "Porter Robinson / Madeon",
      album: "Shelter",
      coverId: null,
      coverThumb: inlineCover,
      codec: null,
      fieldSources: { title: "airplay", artist: "airplay", cover: "airplay" },
    });
    mockEcho(track);

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage initialLyrics={lyrics} />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await screen.findByRole("heading", { name: "Shelter" });
    expect(
      container.querySelector(".lyrics-track-cover img")?.getAttribute("src"),
    ).toBe(inlineCover);
    expect(
      container
        .querySelector('.lyrics-mv-card[data-cover="true"] img')
        ?.getAttribute("src"),
    ).toBe(inlineCover);
  });

  it("uses the original cover for the lyrics header and cover-following background", async () => {
    window.sessionStorage.setItem("echo:lyrics:view-mode", "mv");
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
    expect(window.echo.library.resolveLyricsBackgroundCover).not.toHaveBeenCalled();
  });

  it("does not fall back to compressed artwork for cover-following lyrics background", async () => {
    const track = makeTrack({
      coverId: null,
      coverThumb: "https://img.example/cover-160.jpg",
    });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsHighResolutionNetworkCoverEnabled: false,
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

    expect(page.dataset.background).toBe("theme");
    expect(page.style.getPropertyValue("--lyrics-cover")).toBe("none");
  });

  it("uses a high resolution network cover for cover-following lyrics background when available", async () => {
    const track = makeTrack({ coverId: "cover 1" });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsHighResolutionNetworkCoverEnabled: true,
    });
    let resolveNetworkCover!: (value: {
      coverUrl: string;
      provider: string;
      confidence: number;
    }) => void;
    window.echo.library.resolveLyricsBackgroundCover = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveNetworkCover = resolve;
      });
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

    expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
      'url("echo-cover://original/cover%201")',
    );
    resolveNetworkCover({
      coverUrl: "https://p.music.126.net/cover.jpg",
      provider: "netease-cloud-music",
      confidence: 0.96,
    });
    await waitFor(() =>
      expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
        'url("https://p.music.126.net/cover.jpg")',
      ),
    );
    expect(window.echo.library.resolveLyricsBackgroundCover).toHaveBeenCalledWith("track-1");
  });

  it("requests a network lyrics background cover even when the local track has no cover", async () => {
    const track = makeTrack({ coverId: null, coverThumb: null });
    mockEcho(track, 0, {
      lyricsBackgroundMode: "cover",
      lyricsHighResolutionNetworkCoverEnabled: true,
    });
    window.echo.library.resolveLyricsBackgroundCover = vi.fn().mockResolvedValue({
      coverUrl: "https://p.music.126.net/cover.jpg",
      provider: "netease-cloud-music",
      confidence: 0.96,
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

    await waitFor(() => expect(page.dataset.background).toBe("cover"));
    await waitFor(() =>
      expect(page.style.getPropertyValue("--lyrics-cover")).toBe(
        'url("https://p.music.126.net/cover.jpg")',
      ),
    );
    expect(window.echo.library.resolveLyricsBackgroundCover).toHaveBeenCalledWith("track-1");
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
      markInstrumental: vi.fn(),
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

    expect(await screen.findByText("Loaded from service")).toBeTruthy();
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1");
  });

  it("hides per-track lyrics offset controls by default", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 0,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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

    expect(await screen.findByText("First line")).toBeTruthy();
    expect(container.querySelector(".lyrics-offset-controls")).toBeNull();
  });

  it("saves per-track lyrics offset from the lyrics page controls when enabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsOffsetControlsEnabled: true });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 0,
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      rejectCandidate: vi.fn(),
      setOffset: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: lyrics,
          offsetMs: 100,
        }),
      ),
      clearCache: vi.fn(),
    };

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    expect(await screen.findByText("First line")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /\+100ms/ }));

    await waitFor(() =>
      expect(window.echo.lyrics.setOffset).toHaveBeenCalledWith("track-1", 100),
    );
    await waitFor(() =>
      expect(container.querySelector(".lyrics-offset-value")?.textContent).toBe("+100ms"),
    );
  });

  it("updates when the current track is marked as instrumental from lyrics settings", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEmptyStateHidden: false });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([makeLyricsCandidate({ id: "candidate-1", score: 0.12, risk: "high" })]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          kind: "instrumental",
          lines: [],
          plainText: null,
          syncedText: null,
        }),
      ),
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

    await waitFor(() => expect(container.querySelector(".lyrics-candidate-list")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "标记为纯音乐" })).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lyrics:candidate-applied", {
          detail: {
            trackId: "track-1",
            lyrics: makeTrackLyrics({
              kind: "instrumental",
              lines: [],
              plainText: null,
              syncedText: null,
            }),
          },
        }),
      );
    });

    expect(window.echo.lyrics.markInstrumental).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector(".lyrics-candidate-list")).toBeNull());
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
      markInstrumental: vi.fn(),
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

  it("keeps the initial automatic lyrics lookup panel hidden while it is loading", async () => {
    const track = makeTrack();
    const pendingLyrics = deferred<TrackLyrics | null>();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockReturnValue(pendingLyrics.promise),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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

    await waitFor(() => expect(window.echo.lyrics.getForTrack).toHaveBeenCalledWith("track-1"));
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();

    pendingLyrics.resolve(makeTrackLyrics());
  });

  it("does not auto-apply medium risk candidates", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-medium", score: 0.97, risk: "medium" }),
      ]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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
      expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "lrclib"),
    );
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();
    expect(container.querySelector(".lyrics-risk-badge--medium")).toBeTruthy();
  });

  it("auto-applies exact identity candidates above the threshold when only duration differs", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsAutoAcceptScore: 0.56 });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({
          id: "candidate-duration-mismatch",
          score: 0.7,
          risk: "high",
          reasons: ["title_exact", "artist_exact", "duration_mismatch"],
          titleScore: 1,
          artistScore: 1,
          durationScore: 0.04,
        }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Duration mismatch auto applied" }],
          syncedText: "[00:00.00]Duration mismatch auto applied",
          plainText: "Duration mismatch auto applied",
        }),
      ),
      markInstrumental: vi.fn(),
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

    expect(await screen.findByText("Duration mismatch auto applied")).toBeTruthy();
    expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
      "track-1",
      "candidate-duration-mismatch",
    );
  });

  it("allows manually applying candidates below the auto-apply threshold", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42 }),
      ]),
      applyCandidate: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Manually selected line" }],
          syncedText: "[00:00.00]Manually selected line",
          plainText: "Manually selected line",
        }),
      ),
      markInstrumental: vi.fn(),
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

    await waitFor(() => expect(container.querySelector(".lyrics-candidate")).toBeTruthy());
    expect(window.echo.lyrics.applyCandidate).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector<HTMLButtonElement>(".lyrics-candidate")!);

    await waitFor(() =>
      expect(window.echo.lyrics.applyCandidate).toHaveBeenCalledWith(
        "track-1",
        "candidate-low-score",
      ),
    );
    expect(await screen.findByText("Manually selected line")).toBeTruthy();
  });

  it("auto-closes the lyrics candidate panel after ten seconds without interaction", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(null),
      searchCandidates: vi.fn().mockResolvedValue([
        makeLyricsCandidate({ id: "candidate-low-score", score: 0.42 }),
      ]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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

    await waitFor(() => expect(container.querySelector(".lyrics-match-panel")).toBeTruthy());
    vi.useFakeTimers();
    fireEvent.pointerEnter(container.querySelector<HTMLElement>(".lyrics-match-panel")!);

    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(container.querySelector(".lyrics-match-panel")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector(".lyrics-match-panel")).toBeNull();
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
      markInstrumental: vi.fn(),
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
        markInstrumental: vi.fn(),
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
      markInstrumental: vi.fn(),
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
      markInstrumental: vi.fn(),
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
    expect(container.querySelector(".lyrics-empty")).toBeNull();
  });

  it("hides streaming provider pure-music placeholders when configured", async () => {
    const track = makeTrack({
      mediaType: "streaming",
      provider: "netease",
      providerTrackId: "netease-track-1",
    });
    mockEcho(track);
    window.echo.streaming = {
      getLyrics: vi.fn().mockResolvedValue({
        provider: "netease",
        providerTrackId: "netease-track-1",
        status: "available",
        plainLyrics: null,
        syncedLyrics: null,
        instrumental: true,
        lines: [
          {
            timeMs: 0,
            text: "\u6b64\u6b4c\u66f2\u4e3a\u6ca1\u6709\u586b\u8bcd\u7684\u7eaf\u97f3\u4e50\uff0c\u8bf7\u60a8\u6b23\u8d4f",
          },
        ],
        sourceLabel: "NetEase",
      }),
    } as unknown as Window["echo"]["streaming"];

    const { container } = render(
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <LyricsPage />
        </QueueSeed>
      </PlaybackQueueProvider>,
    );

    await waitFor(() =>
      expect(window.echo.streaming?.getLyrics).toHaveBeenCalledWith({
        provider: "netease",
        providerTrackId: "netease-track-1",
      }),
    );
    expect(container.querySelector(".lyrics-empty")).toBeNull();
    expect(container.textContent).not.toContain("\u6b64\u6b4c\u66f2\u4e3a\u6ca1\u6709\u586b\u8bcd\u7684\u7eaf\u97f3\u4e50");
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
      markInstrumental: vi.fn(),
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
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "lrclib");
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "qqmusic");

    const qqSourceButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-source-filters button"))
      .find((button) => button.textContent?.includes("QQ"));
    expect(qqSourceButton).toBeTruthy();
    fireEvent.click(qqSourceButton!);

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

  it("keeps enabled lyrics sources visible even when one source returns no candidates", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] })),
      searchCandidates: vi.fn().mockImplementation(
        (_trackId: string, _searchText?: string, provider?: string) =>
          Promise.resolve(
            provider === "lrclib"
              ? [
                  makeLyricsCandidate({
                    id: "lrclib-only",
                    provider: "lrclib",
                    sourceLabel: "LRCLIB",
                  }),
                ]
              : [],
          ),
      ),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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

    await waitFor(() => expect(container.querySelector(".lyrics-source-filters")).toBeTruthy());
    const qqSource = Array.from(container.querySelectorAll<HTMLButtonElement>(".lyrics-source-filters button"))
      .find((button) => button.textContent?.includes("QQ"));

    expect(qqSource?.textContent).toContain("0");
    expect(window.echo.lyrics.searchCandidates).toHaveBeenCalledWith("track-1", undefined, "qqmusic");
  });

  it("does not load lyrics while lyrics display is disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, { lyricsEnabled: false });
    const getForTrack = vi.fn().mockResolvedValue(makeTrackLyrics());
    window.echo.lyrics = {
      getForTrack,
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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
      lyricsLineSpacingPercent: 118,
      lyricsLineMaxChars: 32,
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
    expect(page.style.getPropertyValue("--lyrics-background-surface-alpha")).toBe("0.66");
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
    expect(page.style.getPropertyValue("--lyrics-line-spacing")).toBe("1.18");
    expect(page.style.getPropertyValue("--lyrics-line-max-width")).toBe("32em");
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.64",
    );
  });

  it("keeps manual lyrics color when smart readable colors are disabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#FF3366",
      lyricsSmartReadableColorsEnabled: false,
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

    expect(page.dataset.smartReadable).toBeUndefined();
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FF3366");
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toBe("");
  });

  it("applies smart readable colors immediately when enabled", async () => {
    const track = makeTrack();
    mockEcho(track, 0, {
      lyricsColor: "#FFFFFF",
      lyricsSmartReadableColorsEnabled: true,
      lyricsBackgroundMode: "cover",
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

    await waitFor(() => expect(page.dataset.smartReadable).toBe("true"));
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toMatch(/^rgb\(/);
    expect(page.style.getPropertyValue("--lyrics-smart-secondary-color")).toMatch(/^rgb\(/);
    expect(document.documentElement.dataset.lyricsSmartReadable).toBeUndefined();
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
          lyricsSmartReadableColorsEnabled: true,
          lyricsBackgroundMode: "cover",
          lyricsCoverOpacityPercent: 24,
          lyricsCoverBlurPx: 4,
          lyricsCoverBrightnessPercent: 72,
          lyricsBackgroundScalePercent: 86,
          lyricsSecondaryFontSizePx: 22,
          lyricsLineSpacingPercent: 74,
          lyricsLineMaxChars: 28,
          lyricsContextOpacityPercent: 24,
        },
      }),
    );

    await waitFor(() =>
      expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("52px"),
    );
    expect(page.dataset.background).toBe("cover");
    expect(page.dataset.smartReadable).toBe("true");
    expect(page.style.getPropertyValue("--lyrics-color")).toBe("#FFFFFF");
    expect(page.style.getPropertyValue("--lyrics-smart-primary-color")).toMatch(/^rgb\(/);
    expect(page.style.getPropertyValue("--lyrics-cover-opacity")).toBe("0.24");
    expect(page.style.getPropertyValue("--lyrics-background-surface-alpha")).toBe("0.24");
    expect(page.style.getPropertyValue("--lyrics-cover-blur")).toBe("4px");
    expect(page.style.getPropertyValue("--lyrics-cover-brightness")).toBe(
      "72%",
    );
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe(
      "1.00",
    );
    expect(page.style.getPropertyValue("--lyrics-secondary-font-size")).toBe(
      "22px",
    );
    expect(page.style.getPropertyValue("--lyrics-line-spacing")).toBe("0.74");
    expect(page.style.getPropertyValue("--lyrics-line-max-width")).toBe("28em");
    expect(page.style.getPropertyValue("--lyrics-context-opacity")).toBe(
      "0.24",
    );
  });

  it("ignores explicit non-lyrics settings change events", async () => {
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
    const getSettings = vi.mocked(window.echo.app.getSettings);
    const initialCallCount = getSettings.mock.calls.length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("settings:changed", {
          detail: {
            immersiveBackgroundScalePercent: 140,
            immersiveBackgroundBlurPx: 10,
            immersiveBackgroundBrightnessPercent: 118,
            immersiveBackgroundOverlayOpacityPercent: 35,
          },
        }),
      );
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(getSettings).toHaveBeenCalledTimes(initialCallCount);
    expect(page.style.getPropertyValue("--lyrics-font-size")).toBe("40px");
    expect(page.style.getPropertyValue("--lyrics-background-scale")).toBe("1.00");
  });

  it("does not reload or rematch lyrics when visual display settings change", async () => {
    const track = makeTrack();
    mockEcho(track);
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(
        makeTrackLyrics({
          lines: [{ timeMs: 0, text: "Stable current lyrics" }],
          syncedText: "[00:00.00]Stable current lyrics",
          plainText: "Stable current lyrics",
        }),
      ),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
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

    expect(await screen.findByText("Stable current lyrics")).toBeTruthy();
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new CustomEvent("lyrics:display-settings-changed", {
        detail: {
          lyricsAutoAcceptScore: 0.3,
          lyricsFontSizePx: 48,
          lyricsLineSpacingPercent: 116,
          lyricsContextOpacityPercent: 70,
        },
      }),
    );

    await waitFor(() => expect(screen.getByText("Stable current lyrics")).toBeTruthy());
    expect(window.echo.lyrics.getForTrack).toHaveBeenCalledTimes(1);
    expect(window.echo.lyrics.searchCandidates).not.toHaveBeenCalled();
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
      markInstrumental: vi.fn(),
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

  it("applies a custom LRC file dropped on the lyrics page", async () => {
    const track = makeTrack();
    mockEcho(track);
    const customLyrics = makeTrackLyrics({
      provider: "manual",
      providerLyricsId: "custom-lrc",
      lines: [{ timeMs: 1000, text: "Dropped custom line" }],
      syncedText: "[00:01.00]Dropped custom line",
      plainText: "Dropped custom line",
    });
    window.echo.lyrics = {
      getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics({ lines: [{ timeMs: 0, text: "Current lyrics" }] })),
      searchCandidates: vi.fn().mockResolvedValue([]),
      applyCandidate: vi.fn(),
      markInstrumental: vi.fn(),
      applyCustomLrc: vi.fn().mockResolvedValue(customLyrics),
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
    const page = container.querySelector(".lyrics-page") as HTMLElement;
    const file = new File(
      [
        new Uint8Array([
          0x5b, 0x30, 0x30, 0x3a, 0x30, 0x31, 0x2e, 0x30, 0x30, 0x5d,
          0xd0, 0xd2, 0xb4, 0xe6, 0xd5, 0xdf,
        ]),
      ],
      "custom.lrc",
      { type: "text/plain" },
    );

    fireEvent.drop(page, {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
    });

    await waitFor(() =>
      expect(window.echo.lyrics.applyCustomLrc).toHaveBeenCalledWith(
        "track-1",
        "[00:01.00]幸存者",
        "custom.lrc",
      ),
    );
    expect(await screen.findByText("Dropped custom line")).toBeTruthy();
  });
});
