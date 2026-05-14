import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Disc3,
  Music2,
} from "lucide-react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { LibraryTrack } from "../../shared/types/library";
import type {
  LyricsSearchCandidate,
  TrackLyrics,
} from "../../shared/types/lyrics";
import type {
  StreamingLyricsResult,
  StreamingProviderName,
} from "../../shared/types/streaming";
import { streamingProviderNames } from "../../shared/types/streaming";
import type { PlaybackStatus } from "../../shared/types/playback";
import { LyricsView } from "../components/lyrics/LyricsView";
import { MvPanel, type MvAudioClock } from "../components/lyrics/MvPanel";
import type { LyricLine, LyricsState } from "../components/lyrics/lyricsTypes";
import { titleFromPath } from "../components/player/playerFormat";
import { usePlaybackQueue } from "../stores/PlaybackQueueProvider";

type LyricsPageProps = {
  initialLyrics?: LyricLine[];
};

type TrackWithLargeCover = LibraryTrack & {
  coverLarge?: string | null;
};

type CandidateSourceFilter = "all" | string;

type LyricsDisplaySettings = Pick<
  AppSettings,
  | "lyricsEnabled"
  | "lyricsHeaderHidden"
  | "lyricsEmptyStateHidden"
  | "lyricsFontSizePx"
  | "lyricsColor"
  | "lyricsBackgroundMode"
  | "lyricsCustomWallpaperPath"
  | "lyricsRomanizationEnabled"
  | "lyricsTranslationEnabled"
  | "lyricsAutoSearch"
  | "lyricsAutoAcceptScore"
  | "lyricsGlobalSyncOffsetMs"
  | "lyricsSecondaryFontSizePx"
  | "lyricsContextOpacityPercent"
  | "lyricsCoverOpacityPercent"
  | "lyricsCoverBlurPx"
  | "lyricsCoverBrightnessPercent"
  | "lyricsBackgroundScalePercent"
>;

const idlePollingStates = new Set(["paused", "stopped", "idle", "error"]);
const playbackSeekedEvent = "playback:seeked";

const fallbackLyricsDisplaySettings: LyricsDisplaySettings = {
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsFontSizePx: 36,
  lyricsColor: "#314054",
  lyricsBackgroundMode: "theme",
  lyricsCustomWallpaperPath: null,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsSecondaryFontSizePx: 18,
  lyricsContextOpacityPercent: 38,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
};

const emptyLyrics = (offsetMs = 0): LyricsState => ({
  kind: "empty",
  source: "none",
  lines: [],
  offsetMs,
});

const syncedLyrics = (lines: LyricLine[], offsetMs: number): LyricsState => ({
  kind: "synced",
  source: "placeholder",
  lines,
  offsetMs,
});

const trackLyricsToState = (
  lyrics: TrackLyrics | null,
  fallbackOffsetMs = 0,
): LyricsState => {
  if (!lyrics) {
    return emptyLyrics(fallbackOffsetMs);
  }

  return {
    kind: lyrics.kind,
    source:
      lyrics.provider === "local"
        ? "local"
        : lyrics.provider === "lrclib"
          ? "online"
          : lyrics.provider,
    lines: lyrics.lines,
    offsetMs: lyrics.offsetMs,
  };
};

const isStreamingProviderName = (value: string | null | undefined): value is StreamingProviderName =>
  streamingProviderNames.includes(value as StreamingProviderName);

const isStreamingTrack = (
  track: LibraryTrack | null,
): track is LibraryTrack & { provider: StreamingProviderName; providerTrackId: string } =>
  track?.mediaType === "streaming" &&
  isStreamingProviderName(track.provider) &&
  typeof track.providerTrackId === "string" &&
  track.providerTrackId.trim().length > 0;

const streamingLyricsToState = (
  result: StreamingLyricsResult,
  fallbackOffsetMs = 0,
): LyricsState => {
  const directLines = result.lines
    .map((line) => ({
      timeMs: line.timeMs ?? -1,
      text: line.text.trim(),
    }))
    .filter((line) => line.text.length > 0);
  const fallbackText = result.plainLyrics ?? result.syncedLyrics ?? "";
  const fallbackLines = fallbackText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ timeMs: -1, text }));
  const lines = directLines.length > 0 ? directLines : fallbackLines;
  const hasTimedLines = lines.some((line) => line.timeMs >= 0);

  if (result.status === "missing" || lines.length === 0) {
    return emptyLyrics(fallbackOffsetMs);
  }

  return {
    kind: hasTimedLines || Boolean(result.syncedLyrics) ? "synced" : "plain",
    source: result.provider === "netease" || result.provider === "qqmusic" ? result.provider : "online",
    lines,
    offsetMs: fallbackOffsetMs,
  };
};

const dispatchCurrentLyricsProviderChanged = (lyrics: TrackLyrics | null): void => {
  window.dispatchEvent(new CustomEvent("lyrics:current-provider-changed", { detail: { provider: lyrics?.provider ?? null } }));
};

const dispatchPlaybackSeeked = (positionSeconds: number, trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(playbackSeekedEvent, { detail: { positionSeconds, trackId } }));
};

const isWindowApproximatelyMaximized = (): boolean => {
  const widthDelta = Math.abs(window.outerWidth - window.screen.availWidth);
  const heightDelta = Math.abs(window.outerHeight - window.screen.availHeight);
  return widthDelta <= 24 && heightDelta <= 24;
};

const formatDuration = (durationSeconds: number | null): string => {
  if (!durationSeconds) {
    return "--:--";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatScore = (score: number): string => `${Math.round(score * 100)}%`;

const riskLabel = (risk: LyricsSearchCandidate["risk"]): string => {
  if (risk === "low") return "精准匹配";
  if (risk === "medium") return "可能匹配";
  return "需确认";
};

const reasonLabels: Record<string, string> = {
  duration_exact: "时长精准",
  duration_close: "时长接近",
  duration_mismatch: "时长不同",
  artist_mismatch: "艺人不同",
  cover_intent: "可能翻唱",
  candidate_only_cover: "翻唱需确认",
  version_conflict: "版本不一致",
  synced_duration_safe: "同步歌词",
  embedded_tag_priority: "嵌入歌词",
  local_sidecar_priority: "本地歌词",
  netease_provider: "网易云",
  qqmusic_provider: "QQ 音乐",
};

const visibleReasons = (candidate: LyricsSearchCandidate): string[] =>
  (candidate.reasons ?? [])
    .map((reason) => reasonLabels[reason])
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 3);

const sourceFilterKey = (candidate: LyricsSearchCandidate): string =>
  `${candidate.provider}:${candidate.sourceLabel}`;

const selectAutoApplyCandidate = (
  candidates: LyricsSearchCandidate[],
  settings: LyricsDisplaySettings,
): LyricsSearchCandidate | null => {
  if (!settings.lyricsAutoSearch) {
    return null;
  }

  const threshold = Number.isFinite(settings.lyricsAutoAcceptScore)
    ? Math.max(0.3, Math.min(1, settings.lyricsAutoAcceptScore))
    : fallbackLyricsDisplaySettings.lyricsAutoAcceptScore;

  return candidates.find(
    (candidate) =>
      candidate.score >= threshold &&
      candidate.risk !== "high" &&
      (candidate.hasSynced || candidate.hasPlain || candidate.instrumental),
  ) ?? null;
};

const safeCoverUrl = (track: LibraryTrack | null): string | null => {
  const coverLarge = (track as TrackWithLargeCover | null)?.coverLarge ?? null;
  const coverUrl =
    coverLarge ??
    (track?.coverId
      ? `echo-cover://large/${encodeURIComponent(track.coverId)}`
      : (track?.coverThumb ?? null));

  return coverUrl && !coverUrl.startsWith("data:") ? coverUrl : null;
};

const safeOriginalCoverUrl = (track: LibraryTrack | null): string | null => {
  const coverUrl = track?.coverId
    ? `echo-cover://original/${encodeURIComponent(track.coverId)}`
    : safeCoverUrl(track);

  return coverUrl && !coverUrl.startsWith("data:") ? coverUrl : null;
};

const selectLyricsDisplaySettings = (
  settings: AppSettings,
): LyricsDisplaySettings => ({
  lyricsEnabled: settings.lyricsEnabled,
  lyricsHeaderHidden: settings.lyricsHeaderHidden,
  lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden,
  lyricsFontSizePx: settings.lyricsFontSizePx,
  lyricsColor: settings.lyricsColor,
  lyricsBackgroundMode: settings.lyricsBackgroundMode,
  lyricsCustomWallpaperPath: settings.lyricsCustomWallpaperPath,
  lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled,
  lyricsTranslationEnabled: settings.lyricsTranslationEnabled,
  lyricsAutoSearch: settings.lyricsAutoSearch,
  lyricsAutoAcceptScore: settings.lyricsAutoAcceptScore,
  lyricsGlobalSyncOffsetMs: settings.lyricsGlobalSyncOffsetMs,
  lyricsSecondaryFontSizePx: settings.lyricsSecondaryFontSizePx ?? fallbackLyricsDisplaySettings.lyricsSecondaryFontSizePx,
  lyricsContextOpacityPercent: settings.lyricsContextOpacityPercent ?? fallbackLyricsDisplaySettings.lyricsContextOpacityPercent,
  lyricsCoverOpacityPercent: settings.lyricsCoverOpacityPercent,
  lyricsCoverBlurPx: settings.lyricsCoverBlurPx,
  lyricsCoverBrightnessPercent: settings.lyricsCoverBrightnessPercent,
  lyricsBackgroundScalePercent: settings.lyricsBackgroundScalePercent,
});

const cssUrl = (value: string): string =>
  `url("${value.replace(/["\\]/g, "\\$&")}")`;
const lyricsDisplaySettingsKeys = [
  "lyricsEnabled",
  "lyricsHeaderHidden",
  "lyricsEmptyStateHidden",
  "lyricsFontSizePx",
  "lyricsColor",
  "lyricsBackgroundMode",
  "lyricsCustomWallpaperPath",
  "lyricsRomanizationEnabled",
  "lyricsTranslationEnabled",
  "lyricsAutoSearch",
  "lyricsAutoAcceptScore",
  "lyricsGlobalSyncOffsetMs",
  "lyricsSecondaryFontSizePx",
  "lyricsContextOpacityPercent",
  "lyricsCoverOpacityPercent",
  "lyricsCoverBlurPx",
  "lyricsCoverBrightnessPercent",
  "lyricsBackgroundScalePercent",
] as const;

const pickLyricsDisplaySettingsPatch = (
  value: unknown,
): Partial<LyricsDisplaySettings> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const input = value as Partial<AppSettings>;
  const patch: Partial<LyricsDisplaySettings> = {};
  for (const key of lyricsDisplaySettingsKeys) {
    if (input[key] !== undefined) {
      patch[key] = input[key] as never;
    }
  }

  return patch;
};

const clampPlaybackPosition = (
  positionSeconds: number,
  durationSeconds: number | null,
): number => {
  const safePositionSeconds = Number.isFinite(positionSeconds)
    ? Math.max(0, positionSeconds)
    : 0;

  return durationSeconds && durationSeconds > 0
    ? Math.min(safePositionSeconds, durationSeconds)
    : safePositionSeconds;
};

const useLyricsDisplayPosition = (
  audioStatus: AudioStatus | null,
  playbackStatus: PlaybackStatus | null,
): { audioClock: MvAudioClock; displayPositionSeconds: number } => {
  const sourcePositionSeconds =
    audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const sourceDurationSeconds =
    audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const state = audioStatus?.state ?? playbackStatus?.state ?? "idle";
  const playbackRate = audioStatus?.playbackRate ?? 1;
  const currentTrackId =
    audioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? null;
  const currentFilePath =
    audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
  const [positionSeconds, setPositionSeconds] = useState(() =>
    clampPlaybackPosition(sourcePositionSeconds, sourceDurationSeconds),
  );
  const [audioClock, setAudioClock] = useState<MvAudioClock>(() => ({
    durationSeconds: sourceDurationSeconds,
    playbackRate,
    positionSeconds: clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    ),
    state,
    updatedAtMs: performance.now(),
  }));
  const clockRef = useRef({
    durationSeconds: sourceDurationSeconds,
    playbackRate,
    positionSeconds: clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    ),
    state,
    updatedAtMs: performance.now(),
  });

  useEffect(() => {
    const nextPositionSeconds = clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    );
    const updatedAtMs = performance.now();
    clockRef.current = {
      durationSeconds: sourceDurationSeconds,
      playbackRate,
      positionSeconds: nextPositionSeconds,
      state,
      updatedAtMs,
    };
    setAudioClock({
      durationSeconds: sourceDurationSeconds,
      playbackRate,
      positionSeconds: nextPositionSeconds,
      state,
      updatedAtMs,
    });
    setPositionSeconds(nextPositionSeconds);
  }, [
    currentFilePath,
    currentTrackId,
    playbackRate,
    sourceDurationSeconds,
    sourcePositionSeconds,
    state,
  ]);

  useEffect(() => {
    if (state !== "playing") {
      return undefined;
    }

    let frame = 0;
    const tick = (): void => {
      const clock = clockRef.current;
      const elapsedSeconds = Math.max(
        0,
        (performance.now() - clock.updatedAtMs) / 1000,
      );
      const nextPositionSeconds = clampPlaybackPosition(
        clock.positionSeconds + elapsedSeconds * clock.playbackRate,
        clock.durationSeconds,
      );
      setPositionSeconds(nextPositionSeconds);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  return { audioClock, displayPositionSeconds: positionSeconds };
};

export const LyricsPage = ({ initialLyrics }: LyricsPageProps): JSX.Element => {
  const queue = usePlaybackQueue();
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(
    null,
  );
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsState>(() =>
    initialLyrics && initialLyrics.length > 0
      ? syncedLyrics(initialLyrics, 0)
      : emptyLyrics(0),
  );
  const [lyricsDisplaySettings, setLyricsDisplaySettings] =
    useState<LyricsDisplaySettings>(fallbackLyricsDisplaySettings);
  const [isLyricsDisplaySettingsReady, setIsLyricsDisplaySettingsReady] =
    useState(false);
  const lyricsDisplaySettingsLoadVersionRef = useRef(0);
  const [isWindowMaximized, setIsWindowMaximized] = useState(isWindowApproximatelyMaximized);
  const [lyricsStatus, setLyricsStatus] = useState<string | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [candidates, setCandidates] = useState<LyricsSearchCandidate[]>([]);
  const [activeCandidateSource, setActiveCandidateSource] =
    useState<CandidateSourceFilter>("all");
  const [isCandidateLoading, setIsCandidateLoading] = useState(false);
  const [applyingCandidateId, setApplyingCandidateId] = useState<string | null>(
    null,
  );
  const lyricsRequestRef = useRef(0);
  const state = audioStatus?.state ?? playbackStatus?.state ?? "idle";
  const pollIntervalMs =
    idlePollingStates.has(state) && seekPreviewSeconds === null ? 1800 : 1000;
  const statusTrackId =
    playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack =
    queue.currentTrack ??
    (statusTrackId
      ? (queue.tracks.find((track) => track.id === statusTrackId) ?? null)
      : null) ??
    (queue.lastPlayedTrack?.id === statusTrackId
      ? queue.lastPlayedTrack
      : null);
  const streamingTarget = useMemo(
    () =>
      isStreamingTrack(currentTrack)
        ? {
            provider: currentTrack.provider,
            providerTrackId: currentTrack.providerTrackId,
          }
        : null,
    [currentTrack],
  );
  const filePath =
    currentTrack?.path ??
    audioStatus?.currentFilePath ??
    playbackStatus?.filePath ??
    null;
  const title = currentTrack?.title ?? titleFromPath(filePath);
  const artist =
    currentTrack?.artist ||
    currentTrack?.albumArtist ||
    (filePath ? "Local file" : "Ready");
  const coverUrl = safeCoverUrl(currentTrack);
  const headerCoverUrl = safeOriginalCoverUrl(currentTrack);
  const backgroundCoverUrl = safeOriginalCoverUrl(currentTrack);
  const effectiveLyricsBackgroundMode =
    lyricsDisplaySettings.lyricsBackgroundMode === "customWallpaper" &&
    !lyricsDisplaySettings.lyricsCustomWallpaperPath
      ? "theme"
      : lyricsDisplaySettings.lyricsBackgroundMode === "cover" && !backgroundCoverUrl
        ? "theme"
        : lyricsDisplaySettings.lyricsBackgroundMode;
  const lyricsWallpaperUrl = lyricsDisplaySettings.lyricsCustomWallpaperPath
    ? `echo-wallpaper://lyrics/custom?path=${encodeURIComponent(lyricsDisplaySettings.lyricsCustomWallpaperPath)}`
    : null;
  const lyricsPageStyle = useMemo(
    () =>
      ({
        "--lyrics-cover": backgroundCoverUrl ? cssUrl(backgroundCoverUrl) : "none",
        "--lyrics-wallpaper": lyricsWallpaperUrl
          ? cssUrl(lyricsWallpaperUrl)
          : "none",
        "--lyrics-font-size": `${lyricsDisplaySettings.lyricsFontSizePx}px`,
        "--lyrics-secondary-font-size": `${lyricsDisplaySettings.lyricsSecondaryFontSizePx}px`,
        "--lyrics-context-opacity": (
          (lyricsDisplaySettings.lyricsContextOpacityPercent ?? fallbackLyricsDisplaySettings.lyricsContextOpacityPercent ?? 38) / 100
        ).toFixed(2),
        "--lyrics-color": lyricsDisplaySettings.lyricsColor,
        "--lyrics-cover-opacity": (
          lyricsDisplaySettings.lyricsCoverOpacityPercent / 100
        ).toFixed(2),
        "--lyrics-cover-blur": `${lyricsDisplaySettings.lyricsCoverBlurPx}px`,
        "--lyrics-cover-brightness": `${lyricsDisplaySettings.lyricsCoverBrightnessPercent}%`,
        "--lyrics-background-scale": (lyricsDisplaySettings.lyricsBackgroundScalePercent / 100).toFixed(2),
        "--lyrics-background-bleed": `-${lyricsDisplaySettings.lyricsCoverBlurPx * 2}px`,
      }) as CSSProperties,
    [
      backgroundCoverUrl,
      lyricsDisplaySettings.lyricsColor,
      lyricsDisplaySettings.lyricsCoverBlurPx,
      lyricsDisplaySettings.lyricsCoverBrightnessPercent,
      lyricsDisplaySettings.lyricsCoverOpacityPercent,
      lyricsDisplaySettings.lyricsBackgroundScalePercent,
      lyricsDisplaySettings.lyricsFontSizePx,
      lyricsDisplaySettings.lyricsSecondaryFontSizePx,
      lyricsDisplaySettings.lyricsContextOpacityPercent,
      lyricsWallpaperUrl,
    ],
  );
  const { audioClock: mvAudioClock, displayPositionSeconds } = useLyricsDisplayPosition(
    audioStatus,
    playbackStatus,
  );
  const lyricsPositionSeconds = seekPreviewSeconds ?? displayPositionSeconds;
  const candidateSourceOptions = useMemo(() => {
    const order = new Map<LyricsSearchCandidate["provider"], number>([
      ["local", 0],
      ["lrclib", 1],
      ["netease", 2],
      ["qqmusic", 3],
      ["musixmatch", 4],
      ["genius", 5],
      ["manual", 6],
    ]);
    const sourceMap = new Map<
      string,
      { key: string; label: string; count: number; order: number }
    >();

    for (const candidate of candidates) {
      const key = sourceFilterKey(candidate);
      const existing = sourceMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        sourceMap.set(key, {
          key,
          label: candidate.sourceLabel,
          count: 1,
          order: order.get(candidate.provider) ?? 99,
        });
      }
    }

    return [
      { key: "all", label: "全部来源", count: candidates.length, order: -1 },
      ...Array.from(sourceMap.values()).sort(
        (left, right) =>
          left.order - right.order || left.label.localeCompare(right.label),
      ),
    ];
  }, [candidates]);
  const visibleCandidates = useMemo(
    () =>
      activeCandidateSource === "all"
        ? candidates
        : candidates.filter(
            (candidate) => sourceFilterKey(candidate) === activeCandidateSource,
          ),
    [activeCandidateSource, candidates],
  );

  const refreshStatus = useCallback(async (): Promise<void> => {
    const echo = window.echo;

    if (!echo) {
      setError("Desktop bridge unavailable");
      return;
    }

    try {
      const [nextPlaybackStatus, nextAudioStatus] = await Promise.all([
        echo.playback.getStatus(),
        echo.audio.getStatus(),
      ]);

      setPlaybackStatus(nextPlaybackStatus);
      setAudioStatus(nextAudioStatus);
      const nextTrackId =
        nextPlaybackStatus.currentTrackId ??
        nextAudioStatus.currentTrackId ??
        null;
      if (nextTrackId) {
        queue.setCurrentTrackId(nextTrackId);
      }
      setError(nextAudioStatus.error);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : String(statusError),
      );
    }
  }, [queue]);

  const loadLyricsDisplaySettings = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    const loadVersion = lyricsDisplaySettingsLoadVersionRef.current;

    if (!app?.getSettings) {
      if (loadVersion !== lyricsDisplaySettingsLoadVersionRef.current) {
        return;
      }
      setLyricsDisplaySettings(fallbackLyricsDisplaySettings);
      setIsLyricsDisplaySettingsReady(true);
      return;
    }

    try {
      const nextSettings = await app.getSettings();
      if (loadVersion !== lyricsDisplaySettingsLoadVersionRef.current) {
        return;
      }
      setLyricsDisplaySettings(selectLyricsDisplaySettings(nextSettings));
    } catch {
      if (loadVersion !== lyricsDisplaySettingsLoadVersionRef.current) {
        return;
      }
      setLyricsDisplaySettings(fallbackLyricsDisplaySettings);
    } finally {
      if (loadVersion === lyricsDisplaySettingsLoadVersionRef.current) {
        setIsLyricsDisplaySettingsReady(true);
      }
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refreshStatus]);

  useEffect(() => {
    const audio = window.echo?.audio;
    if (!audio?.onStatus) {
      return undefined;
    }

    return audio.onStatus((nextAudioStatus) => {
      setAudioStatus(nextAudioStatus);
      if (nextAudioStatus.currentTrackId) {
        queue.setCurrentTrackId(nextAudioStatus.currentTrackId);
      }
      setError(nextAudioStatus.error);
    });
  }, [queue]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event): void => {
      const patch = pickLyricsDisplaySettingsPatch(
        event instanceof CustomEvent ? event.detail : null,
      );
      if (Object.keys(patch).length > 0) {
        lyricsDisplaySettingsLoadVersionRef.current += 1;
        setLyricsDisplaySettings((current) => ({ ...current, ...patch }));
        setIsLyricsDisplaySettingsReady(true);
        return;
      }

      lyricsDisplaySettingsLoadVersionRef.current += 1;
      void loadLyricsDisplaySettings();
    };

    void loadLyricsDisplaySettings();
    window.addEventListener("settings:changed", handleSettingsChanged);
    window.addEventListener("lyrics:display-settings-changed", handleSettingsChanged);
    return () =>
      {
        window.removeEventListener("settings:changed", handleSettingsChanged);
        window.removeEventListener("lyrics:display-settings-changed", handleSettingsChanged);
      };
  }, [loadLyricsDisplaySettings]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        window.dispatchEvent(new Event("app:navigate:lyrics-back"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const updateWindowState = (): void => setIsWindowMaximized(isWindowApproximatelyMaximized());

    updateWindowState();
    window.addEventListener("resize", updateWindowState);
    return () => window.removeEventListener("resize", updateWindowState);
  }, []);

  const tryAutoApplyCandidate = useCallback(
    async (
      nextCandidates: LyricsSearchCandidate[],
      shouldApplyResult?: () => boolean,
    ): Promise<boolean> => {
      const autoCandidate = selectAutoApplyCandidate(
        nextCandidates,
        lyricsDisplaySettings,
      );
      const lyricsApi = window.echo?.lyrics;
      if (!autoCandidate || !trackId || !lyricsApi) {
        return false;
      }

      if (shouldApplyResult && !shouldApplyResult()) {
        return false;
      }

      setApplyingCandidateId(autoCandidate.id);
      try {
        const trackLyrics = await lyricsApi.applyCandidate(
          trackId,
          autoCandidate.id,
        );
        if (shouldApplyResult && !shouldApplyResult()) {
          return true;
        }

        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setCandidates([]);
        setActiveCandidateSource("all");
        setLyricsStatus(null);
        setError(null);
        return true;
      } catch (applyError) {
        setError(
          applyError instanceof Error ? applyError.message : String(applyError),
        );
        return false;
      } finally {
        if (!shouldApplyResult || shouldApplyResult()) {
          setApplyingCandidateId(null);
        }
      }
    },
    [
      lyricsDisplaySettings,
      trackId,
    ],
  );

  useEffect(() => {
    if (!isLyricsDisplaySettingsReady) {
      return;
    }

    if (!lyricsDisplaySettings.lyricsEnabled) {
      lyricsRequestRef.current += 1;
      setLyrics(emptyLyrics(0));
      dispatchCurrentLyricsProviderChanged(null);
      setLyricsStatus(null);
      setCandidates([]);
      setActiveCandidateSource("all");
      setIsLyricsLoading(false);
      setIsCandidateLoading(false);
      return;
    }

    if (!trackId) {
      lyricsRequestRef.current += 1;
      setLyrics(
        initialLyrics && initialLyrics.length > 0
          ? syncedLyrics(initialLyrics, 0)
          : emptyLyrics(0),
      );
      dispatchCurrentLyricsProviderChanged(null);
      setLyricsStatus(null);
      setCandidates([]);
      setActiveCandidateSource("all");
      return;
    }

    if (streamingTarget) {
      const streamingApi = window.echo?.streaming;
      if (!streamingApi?.getLyrics) {
        lyricsRequestRef.current += 1;
        setLyrics(emptyLyrics(0));
        dispatchCurrentLyricsProviderChanged(null);
        setLyricsStatus("流媒体歌词服务不可用");
        return;
      }

      const requestId = lyricsRequestRef.current + 1;
      lyricsRequestRef.current = requestId;
      setIsLyricsLoading(true);
      setIsCandidateLoading(false);
      setLyrics(emptyLyrics(0));
      dispatchCurrentLyricsProviderChanged(null);
      setLyricsStatus("正在加载流媒体歌词...");
      setCandidates([]);
      setActiveCandidateSource("all");

      // Streaming lyrics are exact-provider lookups: provider + providerTrackId, no local candidate matching.
      void streamingApi
        .getLyrics(streamingTarget)
        .then((streamingLyrics) => {
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          const nextLyrics = streamingLyricsToState(streamingLyrics);
          setLyrics(nextLyrics);
          dispatchCurrentLyricsProviderChanged(null);
          setLyricsStatus(nextLyrics.lines.length > 0 ? null : "未找到歌词");
          setError(null);
        })
        .catch((lyricsError) => {
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          setLyrics(emptyLyrics(0));
          dispatchCurrentLyricsProviderChanged(null);
          setLyricsStatus("未找到歌词");
          setError(
            lyricsError instanceof Error
              ? lyricsError.message
              : String(lyricsError),
          );
        })
        .finally(() => {
          if (lyricsRequestRef.current === requestId) {
            setIsLyricsLoading(false);
            setIsCandidateLoading(false);
          }
        });
      return;
    }

    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi) {
      lyricsRequestRef.current += 1;
      setLyrics(
        initialLyrics && initialLyrics.length > 0
          ? syncedLyrics(initialLyrics, 0)
          : emptyLyrics(0),
      );
      dispatchCurrentLyricsProviderChanged(null);
      return;
    }

    const requestId = lyricsRequestRef.current + 1;
    lyricsRequestRef.current = requestId;
    setIsLyricsLoading(true);
    setLyrics(emptyLyrics(0));
    dispatchCurrentLyricsProviderChanged(null);
    setLyricsStatus("正在匹配歌词...");
    setCandidates([]);
    setActiveCandidateSource("all");

    void lyricsApi
      .getForTrack(trackId)
      .then(async (trackLyrics) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        if (!trackLyrics && lyricsDisplaySettings.lyricsAutoSearch) {
          setIsCandidateLoading(true);
          const nextCandidates = await lyricsApi.searchCandidates(trackId);
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          const autoApplied = await tryAutoApplyCandidate(
            nextCandidates,
            () => lyricsRequestRef.current === requestId,
          );
          if (lyricsRequestRef.current !== requestId || autoApplied) {
            return;
          }

          setCandidates(nextCandidates);
          setActiveCandidateSource("all");
          setLyricsStatus(nextCandidates.length ? null : "未找到歌词");
          return;
        }

        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setLyricsStatus(trackLyrics ? null : "未找到歌词");
      })
      .catch((lyricsError) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        setLyrics(emptyLyrics(0));
        dispatchCurrentLyricsProviderChanged(null);
        setLyricsStatus("未找到歌词");
        setError(
          lyricsError instanceof Error
            ? lyricsError.message
            : String(lyricsError),
        );
      })
      .finally(() => {
        if (lyricsRequestRef.current === requestId) {
          setIsLyricsLoading(false);
          setIsCandidateLoading(false);
        }
      });
  }, [
    initialLyrics,
    isLyricsDisplaySettingsReady,
    lyricsDisplaySettings.lyricsAutoSearch,
    lyricsDisplaySettings.lyricsEnabled,
    streamingTarget,
    trackId,
    tryAutoApplyCandidate,
  ]);

  const handleSearchLyrics = useCallback(async (searchText?: string): Promise<void> => {
    if (!lyricsDisplaySettings.lyricsEnabled) {
      setLyricsStatus(null);
      return;
    }

    if (streamingTarget) {
      const streamingApi = window.echo?.streaming;
      if (!streamingApi?.getLyrics) {
        setError("流媒体歌词服务不可用");
        return;
      }

      setIsCandidateLoading(false);
      setIsLyricsLoading(true);
      setLyricsStatus("正在加载流媒体歌词...");
      try {
        const streamingLyrics = await streamingApi.getLyrics(streamingTarget);
        const nextLyrics = streamingLyricsToState(streamingLyrics, lyrics.offsetMs);
        setLyrics(nextLyrics);
        dispatchCurrentLyricsProviderChanged(null);
        setCandidates([]);
        setActiveCandidateSource("all");
        setLyricsStatus(nextLyrics.lines.length > 0 ? null : "未找到歌词");
        setError(null);
      } catch (lyricsError) {
        setLyricsStatus("未找到歌词");
        setError(
          lyricsError instanceof Error
            ? lyricsError.message
            : String(lyricsError),
        );
      } finally {
        setIsLyricsLoading(false);
      }
      return;
    }

    if (!trackId || !window.echo?.lyrics) {
      setError("Desktop bridge unavailable");
      return;
    }

    setIsCandidateLoading(true);
    setLyricsStatus("正在搜索歌词候选...");
    try {
      const nextCandidates = searchText
        ? await window.echo.lyrics.searchCandidates(trackId, searchText)
        : await window.echo.lyrics.searchCandidates(trackId);
      const shouldAutoApplySearchResult = lyrics.kind === "empty" || lyrics.lines.length === 0;
      if (shouldAutoApplySearchResult) {
        const autoApplied = await tryAutoApplyCandidate(nextCandidates);
        if (autoApplied) {
          return;
        }
      }
      setCandidates(nextCandidates);
      setActiveCandidateSource("all");
      setLyricsStatus(nextCandidates.length ? null : "未找到歌词");
      setError(null);
    } catch (candidateError) {
      setLyricsStatus("未找到歌词");
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : String(candidateError),
      );
    } finally {
      setIsCandidateLoading(false);
    }
  }, [
    lyrics.kind,
    lyrics.lines.length,
    lyricsDisplaySettings.lyricsEnabled,
    lyrics.offsetMs,
    streamingTarget,
    trackId,
    tryAutoApplyCandidate,
  ]);

  const handleRematchLyrics = useCallback(async (): Promise<void> => {
    if (!lyricsDisplaySettings.lyricsEnabled) {
      setLyricsStatus(null);
      return;
    }

    if (streamingTarget) {
      await handleSearchLyrics();
      return;
    }

    if (!trackId || !window.echo?.lyrics) {
      setError("Desktop bridge unavailable");
      return;
    }

    setLyrics(emptyLyrics(lyrics.offsetMs));
    setCandidates([]);
    setActiveCandidateSource("all");
    setIsCandidateLoading(true);
    setLyricsStatus("正在重新匹配歌词...");
    try {
      await window.echo.lyrics.clearCache(trackId);
      const nextCandidates = await window.echo.lyrics.searchCandidates(trackId);
      const autoApplied = await tryAutoApplyCandidate(nextCandidates);
      if (autoApplied) {
        return;
      }
      setCandidates(nextCandidates);
      setActiveCandidateSource("all");
      setLyricsStatus(nextCandidates.length ? null : "未找到歌词");
      setError(null);
    } catch (rematchError) {
      setLyricsStatus("未找到歌词");
      setError(
        rematchError instanceof Error
          ? rematchError.message
          : String(rematchError),
      );
    } finally {
      setIsCandidateLoading(false);
    }
  }, [handleSearchLyrics, lyrics.offsetMs, lyricsDisplaySettings.lyricsEnabled, streamingTarget, trackId, tryAutoApplyCandidate]);

  useEffect(() => {
    const handleSearchRequested = (event: Event): void => {
      const query = event instanceof CustomEvent && typeof event.detail?.query === "string" ? event.detail.query : undefined;
      void handleSearchLyrics(query);
    };
    const handleRematchRequested = (): void => {
      void handleRematchLyrics();
    };
    const handleCandidateApplied = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail as { trackId?: string | null; lyrics?: TrackLyrics | null } : null;
      if (!detail?.lyrics || !detail.trackId || detail.trackId !== trackId) {
        return;
      }

      setLyrics(trackLyricsToState(detail.lyrics));
      dispatchCurrentLyricsProviderChanged(detail.lyrics);
      setCandidates([]);
      setActiveCandidateSource("all");
      setLyricsStatus(null);
      setError(null);
    };

    window.addEventListener("lyrics:search-requested", handleSearchRequested);
    window.addEventListener("lyrics:rematch-requested", handleRematchRequested);
    window.addEventListener("lyrics:candidate-applied", handleCandidateApplied);
    return () => {
      window.removeEventListener("lyrics:search-requested", handleSearchRequested);
      window.removeEventListener("lyrics:rematch-requested", handleRematchRequested);
      window.removeEventListener("lyrics:candidate-applied", handleCandidateApplied);
    };
  }, [handleRematchLyrics, handleSearchLyrics, trackId]);

  const handleApplyCandidate = useCallback(
    async (candidateId: string): Promise<void> => {
      if (!lyricsDisplaySettings.lyricsEnabled) {
        setLyricsStatus(null);
        return;
      }

      if (!trackId || !window.echo?.lyrics) {
        setError("Desktop bridge unavailable");
        return;
      }

      setApplyingCandidateId(candidateId);
      try {
        const trackLyrics = await window.echo.lyrics.applyCandidate(
          trackId,
          candidateId,
        );
        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setCandidates([]);
        setActiveCandidateSource("all");
        setLyricsStatus(null);
        setError(null);
      } catch (applyError) {
        setError(
          applyError instanceof Error ? applyError.message : String(applyError),
        );
      } finally {
        setApplyingCandidateId(null);
      }
    },
    [lyricsDisplaySettings.lyricsEnabled, trackId],
  );

  const handleLyricSeek = useCallback(
    async (timeMs: number): Promise<void> => {
      const playback = window.echo?.playback;

      if (!playback) {
        setError("Desktop bridge unavailable");
        return;
      }

      const nextSeconds = Math.max(0, timeMs / 1000);
      try {
        setSeekPreviewSeconds(nextSeconds);
        const status = await playback.seek(nextSeconds);
        setPlaybackStatus(status);
        dispatchPlaybackSeeked(status.positionMs / 1000, status.currentTrackId ?? trackId ?? null);
        await refreshStatus();
      } catch (seekError) {
        setError(
          seekError instanceof Error ? seekError.message : String(seekError),
        );
      } finally {
        setSeekPreviewSeconds(null);
      }
    },
    [refreshStatus, trackId],
  );

  const lyricsControls = useMemo(() => {
    if (!trackId) {
      return null;
    }

    if (!lyricsDisplaySettings.lyricsEnabled) {
      return null;
    }

    const shouldFoldStatusIntoEmptyLyrics =
      lyrics.lines.length === 0 &&
      candidates.length === 0 &&
      !isLyricsLoading &&
      !isCandidateLoading;
    const statusText = isLyricsLoading
      ? "正在匹配歌词..."
      : isCandidateLoading
        ? "正在搜索歌词候选..."
        : shouldFoldStatusIntoEmptyLyrics
          ? null
          : lyricsStatus;

    if (candidates.length === 0 && !statusText) {
      return null;
    }

    return (
      <section className="lyrics-match-panel" aria-label="Lyrics matching">
        {statusText ? <p className="lyrics-match-status">{statusText}</p> : null}
        {candidates.length ? (
          <>
            <div className="lyrics-source-filters" aria-label="歌词来源筛选">
              {candidateSourceOptions.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  data-active={activeCandidateSource === option.key}
                  onClick={() => setActiveCandidateSource(option.key)}
                >
                  {option.label}
                  <small>{option.count}</small>
                </button>
              ))}
            </div>
            <div className="lyrics-candidate-list">
              {visibleCandidates.map((candidate) => (
                <button
                  className="lyrics-candidate"
                  type="button"
                  key={candidate.id}
                  disabled={Boolean(applyingCandidateId)}
                  onClick={() => void handleApplyCandidate(candidate.id)}
                >
                  <span>
                    <strong>{candidate.title}</strong>
                    <em>
                      {candidate.artist}
                      {candidate.album ? ` / ${candidate.album}` : ""} /{" "}
                      {formatDuration(candidate.durationSeconds)}
                    </em>
                  </span>
                  <span className="lyrics-candidate-badges">
                    <small
                      className={`lyrics-risk-badge lyrics-risk-badge--${candidate.risk ?? "high"}`}
                    >
                      {riskLabel(candidate.risk)}
                    </small>
                    <small>
                      {candidate.hasSynced
                        ? "Synced"
                        : candidate.hasPlain
                          ? "Plain"
                          : candidate.instrumental
                            ? "Instrumental"
                            : "Lyrics"}
                    </small>
                    <small>{candidate.sourceLabel}</small>
                    <small>{formatScore(candidate.score)}</small>
                    {visibleReasons(candidate).map((reason) => (
                      <small className="lyrics-reason-badge" key={reason}>
                        {reason}
                      </small>
                    ))}
                    {applyingCandidateId === candidate.id ? (
                      <small>应用中</small>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }, [
    activeCandidateSource,
    applyingCandidateId,
    candidates,
    candidateSourceOptions,
    handleApplyCandidate,
    isCandidateLoading,
    isLyricsLoading,
    lyricsDisplaySettings.lyricsEnabled,
    lyrics.lines.length,
    lyricsStatus,
    trackId,
    visibleCandidates,
  ]);

  if (!currentTrack && !filePath && !trackId) {
    return (
      <div className="lyrics-page lyrics-page--empty">
        <button
          className="lyrics-back-button"
          type="button"
          aria-label="Back"
          title="Back"
          onClick={() =>
            window.dispatchEvent(new Event("app:navigate:lyrics-back"))
          }
        >
          <ArrowLeft size={17} />
        </button>
        <section className="lyrics-no-track">
          <Music2 size={34} />
          <h1>Nothing is playing</h1>
          <p>
            Start a song from the library, then return here for lyrics and
            immersive playback.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div
      className="lyrics-page"
      data-background={effectiveLyricsBackgroundMode}
      data-window-maximized={isWindowMaximized}
      style={lyricsPageStyle}
    >
      <div className="lyrics-backdrop" aria-hidden="true" />

      <section className="lyrics-left-panel">
        <button
          className="lyrics-back-button"
          type="button"
          aria-label="Back"
          title="Back"
          onClick={() =>
            window.dispatchEvent(new Event("app:navigate:lyrics-back"))
          }
        >
          <ArrowLeft size={17} />
        </button>

        {lyricsDisplaySettings.lyricsHeaderHidden ? null : (
          <header className="lyrics-track-header">
            <div className="lyrics-track-cover" data-empty={!headerCoverUrl}>
              {headerCoverUrl ? (
                <img alt="" draggable={false} src={headerCoverUrl} />
              ) : (
                <Disc3 size={26} />
              )}
            </div>
            <div className="lyrics-track-copy">
              <span className="lyrics-kicker">Now Playing</span>
              <h1>{title}</h1>
              <p>{artist}</p>
            </div>
          </header>
        )}

        {lyricsControls}
        {lyricsDisplaySettings.lyricsEnabled ? (
          <LyricsView
            durationMs={(audioStatus?.durationSeconds ?? currentTrack?.duration ?? 0) * 1000}
            hideEmptyState={lyricsDisplaySettings.lyricsEmptyStateHidden}
            lyrics={lyrics}
            positionMs={lyricsPositionSeconds * 1000 + lyricsDisplaySettings.lyricsGlobalSyncOffsetMs}
            showRomanization={lyricsDisplaySettings.lyricsRomanizationEnabled}
            showTranslation={lyricsDisplaySettings.lyricsTranslationEnabled}
            onSeek={(timeMs) => void handleLyricSeek(timeMs)}
          />
        ) : null}
      </section>

      <MvPanel
        trackId={trackId ?? null}
        streamingTarget={streamingTarget}
        title={title}
        artist={artist}
        coverUrl={coverUrl}
        isAudioPlaying={state === "playing"}
        audioClock={mvAudioClock}
      />

      {error ? (
        <div className="lyrics-error" role="status">
          {error}
        </div>
      ) : null}
    </div>
  );
};
