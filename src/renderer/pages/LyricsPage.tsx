import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  ArrowLeft,
  FastForward,
  Disc3,
  Music2,
  Rewind,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { LibraryTrack } from "../../shared/types/library";
import type {
  LyricsProviderId,
  LyricsSearchCandidate,
  LyricsTrackSnapshotRequest,
  TrackLyrics,
} from "../../shared/types/lyrics";
import type {
  StreamingLyricsResult,
  StreamingProviderName,
} from "../../shared/types/streaming";
import { streamingProviderNames } from "../../shared/types/streaming";
import type { PlaybackStatus } from "../../shared/types/playback";
import { decodeTextFileBytes } from "../../shared/utils/decodeTextFile";
import { LyricsView } from "../components/lyrics/LyricsView";
import { MvPanel, type MvAudioClock } from "../components/lyrics/MvPanel";
import {
  createReadableLyricsColorVars,
  sampleImageUrl,
  type ReadableColorSample,
  type ReadableLyricsCssVars,
} from "../components/lyrics/lyricsReadableColor";
import type { LyricLine, LyricsState } from "../components/lyrics/lyricsTypes";
import { PlayerStatusChips } from "../components/player/PlayerStatusChips";
import { titleFromPath } from "../components/player/playerFormat";
import { usePlaybackQueue } from "../stores/PlaybackQueueProvider";
import { refreshPlaybackStatus, setPlaybackStatusSnapshot, useSharedPlaybackStatus } from "../stores/playbackStatusStore";
import { openAlbumDetailForTrack } from "../utils/albumNavigation";

type LyricsPageProps = {
  initialLyrics?: LyricLine[];
};

type TrackWithLargeCover = LibraryTrack & {
  coverLarge?: string | null;
};

type CandidateSourceFilter = "all" | LyricsProviderId;

type LyricsDisplaySettings = Pick<
  AppSettings,
  | "lyricsEnabled"
  | "lyricsNetworkEnabled"
  | "lyricsEnabledProviders"
  | "lyricsProviderOrder"
  | "lyricsHeaderHidden"
  | "lyricsMvAutoShowTrackInfoDisabled"
  | "lyricsEmptyStateHidden"
  | "lyricsFontSizePx"
  | "lyricsColor"
  | "lyricsBackgroundMode"
  | "lyricsCustomWallpaperPath"
  | "lyricsRomanizationEnabled"
  | "lyricsTranslationEnabled"
  | "lyricsWordHighlightEnabled"
  | "lyricsAutoSearch"
  | "lyricsAutoAcceptScore"
  | "lyricsGlobalSyncOffsetMs"
  | "lyricsOffsetControlsEnabled"
  | "lyricsSecondaryFontSizePx"
  | "lyricsLineSpacingPercent"
  | "lyricsLineMaxChars"
  | "lyricsContextOpacityPercent"
  | "lyricsCoverOpacityPercent"
  | "lyricsSmartReadableColorsEnabled"
  | "lyricsHighResolutionNetworkCoverEnabled"
  | "lyricsCoverBlurPx"
  | "lyricsCoverBrightnessPercent"
  | "lyricsBackgroundScalePercent"
>;

const playbackSeekedEvent = "playback:seeked";
const lyricsCandidateSourceMemoryKey = "echo:lyrics:candidate-source";
const maxInterpolatedStatusGapSeconds = 1.6;
const maxStaleStatusRegressionSeconds = 2.5;
const seekAnchorMaxAgeSeconds = 3;
const playbackRateChangeDiscontinuitySeconds = 0.35;
const albumNavigationTransitionMs = 180;

const fallbackLyricsDisplaySettings: LyricsDisplaySettings = {
  lyricsEnabled: true,
  lyricsNetworkEnabled: true,
  lyricsEnabledProviders: ["local", "lrclib", "netease", "qqmusic"],
  lyricsProviderOrder: ["local", "lrclib", "netease", "qqmusic"],
  lyricsHeaderHidden: false,
  lyricsMvAutoShowTrackInfoDisabled: true,
  lyricsEmptyStateHidden: true,
  lyricsFontSizePx: 40,
  lyricsColor: "#314054",
  lyricsBackgroundMode: "theme",
  lyricsCustomWallpaperPath: null,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsOffsetControlsEnabled: false,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsCoverOpacityPercent: 100,
  lyricsSmartReadableColorsEnabled: false,
  lyricsHighResolutionNetworkCoverEnabled: false,
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

const isSnapshotLyricsTrack = (track: LibraryTrack | null, trackId: string | null): track is LibraryTrack =>
  Boolean(track?.isTemporary || trackId?.startsWith("dlna-receiver:"));

const streamingLyricsToState = (
  result: StreamingLyricsResult,
  fallbackOffsetMs = 0,
): LyricsState => {
  const directLines = result.lines
    .map((line) => ({
      timeMs: line.timeMs ?? -1,
      text: line.text.trim(),
      ...(line.translation ? { translation: line.translation } : {}),
      ...(line.romanization ? { romanization: line.romanization } : {}),
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

  if (result.instrumental === true) {
    return {
      kind: "instrumental",
      source: result.provider === "netease" || result.provider === "qqmusic" ? result.provider : "online",
      lines: [],
      offsetMs: fallbackOffsetMs,
    };
  }

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

type PlaybackSeekedDetail = {
  positionSeconds?: number;
  trackId?: string | null;
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

const lyricsMatchAutoCloseMs = 10000;
const formatScore = (score: number): string => `${Math.round(score * 100)}%`;
const formatOffset = (offsetMs: number): string => {
  if (offsetMs === 0) {
    return "0ms";
  }

  return `${offsetMs > 0 ? "+" : ""}${offsetMs}ms`;
};

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
  version_conflict: "Version mismatch",
  synced_duration_safe: "同步歌词",
  embedded_tag_priority: "嵌入歌词",
  local_sidecar_priority: "本地歌词",
  netease_provider: "NetEase",
  qqmusic_provider: "QQ 音乐",
};

const visibleReasons = (candidate: LyricsSearchCandidate): string[] =>
  (candidate.reasons ?? [])
    .map((reason) => reasonLabels[reason])
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 3);

const sourceFilterKey = (candidate: LyricsSearchCandidate): LyricsProviderId =>
  candidate.provider;

const searchableLyricsProviderIds: LyricsProviderId[] = ["local", "lrclib", "netease", "qqmusic"];
const searchableLyricsProviderSet = new Set<string>(searchableLyricsProviderIds);
const isCandidateSourceFilter = (value: string | null): value is CandidateSourceFilter =>
  value === "all" || searchableLyricsProviderSet.has(value ?? "");
const lyricsProviderLabels: Partial<Record<LyricsProviderId, string>> = {
  local: "本地",
  lrclib: "LRCLIB",
  netease: "NetEase",
  qqmusic: "QQ 音乐",
  musixmatch: "Musixmatch",
  genius: "Genius",
};

const mergeLyricsCandidates = (
  current: LyricsSearchCandidate[],
  next: LyricsSearchCandidate[],
): LyricsSearchCandidate[] => {
  const merged = new Map<string, LyricsSearchCandidate>();
  for (const candidate of [...current, ...next]) {
    const key = `${candidate.provider}:${candidate.providerLyricsId ?? candidate.id}`;
    const existing = merged.get(key);
    if (!existing || candidate.score > existing.score) {
      merged.set(key, candidate);
    }
  }

  return Array.from(merged.values()).sort((left, right) => right.score - left.score);
};

const isAudioStatusForPlayback = (
  audioStatus: AudioStatus,
  playbackStatus: PlaybackStatus | null,
): boolean => {
  if (!playbackStatus?.currentTrackId && !playbackStatus?.filePath) {
    return true;
  }

  return (
    Boolean(playbackStatus.currentTrackId && audioStatus.currentTrackId === playbackStatus.currentTrackId) ||
    Boolean(playbackStatus.filePath && audioStatus.currentFilePath === playbackStatus.filePath)
  );
};

const firstLrcFile = (fileList: FileList | null): File | null => {
  if (!fileList) {
    return null;
  }

  return Array.from(fileList).find((file) => file.name.toLowerCase().endsWith(".lrc")) ?? null;
};

const hasFileDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes("Files");

const selectAutoApplyCandidate = (
  candidates: LyricsSearchCandidate[],
  settings: Pick<LyricsDisplaySettings, "lyricsAutoAcceptScore" | "lyricsAutoSearch">,
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
      isAutoApplyRiskAllowed(candidate) &&
      (candidate.hasSynced || candidate.hasPlain || candidate.instrumental),
  ) ?? null;
};

const isAutoApplyRiskAllowed = (candidate: LyricsSearchCandidate): boolean => {
  const risk = candidate.risk ?? "low";
  if (risk === "low") {
    return true;
  }

  const reasons = new Set(candidate.reasons ?? []);
  const titleScore = candidate.titleScore ?? (reasons.has("title_exact") ? 1 : 0);
  const artistScore = candidate.artistScore ?? (reasons.has("artist_exact") ? 1 : 0);
  const hasOnlyDurationMismatch =
    reasons.has("duration_mismatch") &&
    !reasons.has("artist_mismatch") &&
    !reasons.has("version_conflict") &&
    !reasons.has("rejected_by_user") &&
    !reasons.has("candidate_only_cover") &&
    !reasons.has("cover_intent");

  return hasOnlyDurationMismatch && titleScore >= 0.98 && artistScore >= 0.98;
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

const readRememberedCandidateSource = (): CandidateSourceFilter => {
  try {
    const value = window.localStorage.getItem(lyricsCandidateSourceMemoryKey);
    return isCandidateSourceFilter(value) ? value : "all";
  } catch {
    return "all";
  }
};

const rememberCandidateSource = (source: CandidateSourceFilter): void => {
  try {
    window.localStorage.setItem(lyricsCandidateSourceMemoryKey, source);
  } catch {
    // Best-effort UI preference only.
  }
};

const selectLyricsDisplaySettings = (
  settings: AppSettings,
): LyricsDisplaySettings => ({
  lyricsEnabled: settings.lyricsEnabled,
  lyricsNetworkEnabled: settings.lyricsNetworkEnabled !== false,
  lyricsEnabledProviders: settings.lyricsEnabledProviders?.length
    ? settings.lyricsEnabledProviders
    : fallbackLyricsDisplaySettings.lyricsEnabledProviders,
  lyricsProviderOrder: settings.lyricsProviderOrder?.length
    ? settings.lyricsProviderOrder
    : fallbackLyricsDisplaySettings.lyricsProviderOrder,
  lyricsHeaderHidden: settings.lyricsHeaderHidden,
  lyricsMvAutoShowTrackInfoDisabled: settings.lyricsMvAutoShowTrackInfoDisabled !== false,
  lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden,
  lyricsFontSizePx: settings.lyricsFontSizePx,
  lyricsColor: settings.lyricsColor,
  lyricsBackgroundMode: settings.lyricsBackgroundMode,
  lyricsCustomWallpaperPath: settings.lyricsCustomWallpaperPath,
  lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled,
  lyricsTranslationEnabled: settings.lyricsTranslationEnabled,
  lyricsWordHighlightEnabled: settings.lyricsWordHighlightEnabled !== false,
  lyricsAutoSearch: settings.lyricsAutoSearch,
  lyricsAutoAcceptScore: settings.lyricsAutoAcceptScore,
  lyricsGlobalSyncOffsetMs: settings.lyricsGlobalSyncOffsetMs,
  lyricsOffsetControlsEnabled: settings.lyricsOffsetControlsEnabled === true,
  lyricsSecondaryFontSizePx: settings.lyricsSecondaryFontSizePx ?? fallbackLyricsDisplaySettings.lyricsSecondaryFontSizePx,
  lyricsLineSpacingPercent: settings.lyricsLineSpacingPercent ?? fallbackLyricsDisplaySettings.lyricsLineSpacingPercent,
  lyricsLineMaxChars: settings.lyricsLineMaxChars ?? fallbackLyricsDisplaySettings.lyricsLineMaxChars,
  lyricsContextOpacityPercent: settings.lyricsContextOpacityPercent ?? fallbackLyricsDisplaySettings.lyricsContextOpacityPercent,
  lyricsCoverOpacityPercent: settings.lyricsCoverOpacityPercent,
  lyricsSmartReadableColorsEnabled: settings.lyricsSmartReadableColorsEnabled === true,
  lyricsHighResolutionNetworkCoverEnabled: settings.lyricsHighResolutionNetworkCoverEnabled === true,
  lyricsCoverBlurPx: settings.lyricsCoverBlurPx,
  lyricsCoverBrightnessPercent: settings.lyricsCoverBrightnessPercent,
  lyricsBackgroundScalePercent: settings.lyricsBackgroundScalePercent,
});

const cssUrl = (value: string): string =>
  `url("${value.replace(/["\\]/g, "\\$&")}")`;
const lyricsSmartReadableVideoSampleEvent = "lyrics:smart-readable-video-sample";

type LyricsSmartReadableVideoSampleDetail = {
  trackId?: string | null;
  sample?: ReadableColorSample | null;
};

const getCurrentDocumentThemeMode = (): "light" | "dark" =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";

const lyricsDisplaySettingsKeys = [
  "lyricsEnabled",
  "lyricsNetworkEnabled",
  "lyricsEnabledProviders",
  "lyricsProviderOrder",
  "lyricsHeaderHidden",
  "lyricsMvAutoShowTrackInfoDisabled",
  "lyricsEmptyStateHidden",
  "lyricsFontSizePx",
  "lyricsColor",
  "lyricsBackgroundMode",
  "lyricsCustomWallpaperPath",
  "lyricsRomanizationEnabled",
  "lyricsTranslationEnabled",
  "lyricsWordHighlightEnabled",
  "lyricsAutoSearch",
  "lyricsAutoAcceptScore",
  "lyricsGlobalSyncOffsetMs",
  "lyricsOffsetControlsEnabled",
  "lyricsSecondaryFontSizePx",
  "lyricsLineSpacingPercent",
  "lyricsLineMaxChars",
  "lyricsContextOpacityPercent",
  "lyricsCoverOpacityPercent",
  "lyricsSmartReadableColorsEnabled",
  "lyricsHighResolutionNetworkCoverEnabled",
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

const isExplicitObjectSettingsPatch = (event: Event): boolean =>
  event instanceof CustomEvent &&
  Boolean(event.detail && typeof event.detail === "object" && !Array.isArray(event.detail));

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
): { audioClock: MvAudioClock } => {
  const sourcePositionSeconds =
    audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const sourceDurationSeconds =
    audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const state = audioStatus?.state ?? playbackStatus?.state ?? "idle";
  const playbackRate = audioStatus?.playbackRate ?? 1;
  const currentTrackId =
    playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const currentFilePath =
    playbackStatus?.filePath ?? audioStatus?.currentFilePath ?? null;
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
    currentFilePath,
    currentTrackId,
    durationSeconds: sourceDurationSeconds,
    playbackRate,
    positionSeconds: clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    ),
    sourcePositionSeconds: clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    ),
    state,
    updatedAtMs: performance.now(),
  });
  const seekAnchorRef = useRef<{ positionSeconds: number; trackId: string | null; updatedAtMs: number } | null>(null);

  useEffect(() => {
    const now = performance.now();
    const previous = clockRef.current;
    const samePlayback =
      previous.currentTrackId === currentTrackId &&
      previous.currentFilePath === currentFilePath;
    const stateChanged = previous.state !== state;
    const durationLimit =
      sourceDurationSeconds && sourceDurationSeconds > 0
        ? sourceDurationSeconds
        : Number.POSITIVE_INFINITY;
    const boundedSourcePosition = Math.min(
      Math.max(0, sourcePositionSeconds),
      durationLimit,
    );
    let nextPositionSeconds = clampPlaybackPosition(
      sourcePositionSeconds,
      sourceDurationSeconds,
    );
    const updatedAtMs = now;
    const seekAnchor = seekAnchorRef.current;
    if (seekAnchor) {
      if (seekAnchor.trackId && currentTrackId && seekAnchor.trackId !== currentTrackId) {
        seekAnchorRef.current = null;
      } else {
        const elapsedSeconds = Math.max(0, (updatedAtMs - seekAnchor.updatedAtMs) / 1000);
        const expectedSeekPosition = clampPlaybackPosition(
          seekAnchor.positionSeconds + (state === "playing" ? elapsedSeconds * playbackRate : 0),
          sourceDurationSeconds,
        );
        const isStaleStatusAfterSeek =
          elapsedSeconds < seekAnchorMaxAgeSeconds &&
          Math.abs(nextPositionSeconds - expectedSeekPosition) > 2;

        if (isStaleStatusAfterSeek) {
          nextPositionSeconds = expectedSeekPosition;
        } else {
          seekAnchorRef.current = null;
        }
      }
    }

    if (!seekAnchorRef.current && samePlayback && !stateChanged && state === "playing") {
      const wallElapsedSeconds = Math.max(0, (now - previous.updatedAtMs) / 1000);
      const mediaElapsedSeconds = wallElapsedSeconds * previous.playbackRate;
      const estimatedPositionSeconds = Math.min(previous.positionSeconds + mediaElapsedSeconds, durationLimit);
      const sourceJumpedBackward = boundedSourcePosition + 1 < previous.sourcePositionSeconds;
      const sourceCaughtUp = boundedSourcePosition + 0.35 >= estimatedPositionSeconds;
      const sourceJumpedForward = boundedSourcePosition > estimatedPositionSeconds + 0.35;
      const canBridgeSourceLag = wallElapsedSeconds <= maxInterpolatedStatusGapSeconds;
      const playbackRateChanged = Math.abs(previous.playbackRate - playbackRate) > 0.001;
      const rateChangeSourceDiscontinuity =
        playbackRateChanged && Math.abs(boundedSourcePosition - estimatedPositionSeconds) > playbackRateChangeDiscontinuitySeconds;
      const staleRegressionSeconds = previous.positionSeconds - boundedSourcePosition;
      const canIgnoreStaleRegression =
        canBridgeSourceLag && staleRegressionSeconds > 0.35 && staleRegressionSeconds <= maxStaleStatusRegressionSeconds;

      if (rateChangeSourceDiscontinuity) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleRegression) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canBridgeSourceLag && !sourceJumpedBackward && !sourceCaughtUp && !sourceJumpedForward && estimatedPositionSeconds > boundedSourcePosition) {
        nextPositionSeconds = estimatedPositionSeconds;
      }
    }

    clockRef.current = {
      currentFilePath,
      currentTrackId,
      durationSeconds: sourceDurationSeconds,
      playbackRate,
      positionSeconds: nextPositionSeconds,
      sourcePositionSeconds: boundedSourcePosition,
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
  }, [
    currentFilePath,
    currentTrackId,
    playbackRate,
    sourceDurationSeconds,
    sourcePositionSeconds,
    state,
  ]);

  useEffect(() => {
    const handlePlaybackSeeked = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as PlaybackSeekedDetail | null) : null;
      const eventTrackId = typeof detail?.trackId === "string" && detail.trackId.trim() ? detail.trackId : null;
      if (eventTrackId && eventTrackId !== currentTrackId) {
        return;
      }

      const positionSeconds = Number(detail?.positionSeconds);
      if (!Number.isFinite(positionSeconds)) {
        return;
      }

      const nextPositionSeconds = clampPlaybackPosition(positionSeconds, sourceDurationSeconds);
      const updatedAtMs = performance.now();
      const nextClock = {
        currentFilePath,
        currentTrackId,
        durationSeconds: sourceDurationSeconds,
        playbackRate,
        positionSeconds: nextPositionSeconds,
        sourcePositionSeconds: nextPositionSeconds,
        state,
        updatedAtMs,
      };
      clockRef.current = nextClock;
      seekAnchorRef.current = {
        positionSeconds: nextPositionSeconds,
        trackId: eventTrackId ?? currentTrackId,
        updatedAtMs,
      };
      setAudioClock(nextClock);
    };

    window.addEventListener(playbackSeekedEvent, handlePlaybackSeeked);
    return () => window.removeEventListener(playbackSeekedEvent, handlePlaybackSeeked);
  }, [currentFilePath, currentTrackId, playbackRate, sourceDurationSeconds, state]);

  return { audioClock };
};

export const LyricsPage = ({ initialLyrics }: LyricsPageProps): JSX.Element => {
  const queue = usePlaybackQueue();
  const sharedPlaybackStatus = useSharedPlaybackStatus();
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
  const [imageReadableSample, setImageReadableSample] = useState<ReadableColorSample | null>(null);
  const [mvReadableSample, setMvReadableSample] = useState<ReadableColorSample | null>(null);
  const [documentThemeMode, setDocumentThemeMode] = useState<"light" | "dark">(getCurrentDocumentThemeMode);
  const [networkBackgroundCoverUrl, setNetworkBackgroundCoverUrl] = useState<string | null>(null);
  const lyricsAutoAcceptScoreRef = useRef(fallbackLyricsDisplaySettings.lyricsAutoAcceptScore);
  const lyricsDisplaySettingsLoadVersionRef = useRef(0);
  const [isWindowMaximized, setIsWindowMaximized] = useState(isWindowApproximatelyMaximized);
  const [lyricsStatus, setLyricsStatus] = useState<string | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [candidates, setCandidates] = useState<LyricsSearchCandidate[]>([]);
  const [activeCandidateSource, setActiveCandidateSource] =
    useState<CandidateSourceFilter>(() => readRememberedCandidateSource());
  const [isLyricsMatchPanelClosed, setIsLyricsMatchPanelClosed] = useState(false);
  const [isLyricsMatchPanelRevealed, setIsLyricsMatchPanelRevealed] = useState(false);
  const [lyricsMatchPanelActivityToken, setLyricsMatchPanelActivityToken] = useState(0);
  const [isCandidateLoading, setIsCandidateLoading] = useState(false);
  const [isAlbumNavigating, setIsAlbumNavigating] = useState(false);
  const [applyingCandidateId, setApplyingCandidateId] = useState<string | null>(
    null,
  );
  const [isLyricsOffsetSaving, setIsLyricsOffsetSaving] = useState(false);
  const [, setIsCustomLyricsApplying] = useState(false);
  const [isCustomLyricsDragging, setIsCustomLyricsDragging] = useState(false);
  const lyricsRequestRef = useRef(0);
  const albumNavigationTimeoutRef = useRef<number | null>(null);
  const state = audioStatus?.state ?? playbackStatus?.state ?? "idle";
  const statusTrackId =
    playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack =
    queue.currentTrack ??
    (trackId
      ? (queue.tracks.find((track) => track.id === trackId) ?? null)
      : null) ??
    (queue.lastPlayedTrack?.id === trackId
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
  const album = currentTrack?.album?.trim() || null;
  const coverUrl = safeCoverUrl(currentTrack);
  const headerCoverUrl = safeOriginalCoverUrl(currentTrack);
  const backgroundCoverUrl = safeOriginalCoverUrl(currentTrack);
  const lyricsSnapshotRequest = useMemo<LyricsTrackSnapshotRequest | null>(() => {
    if (!trackId || !isSnapshotLyricsTrack(currentTrack, trackId)) {
      return null;
    }

    return {
      trackId: currentTrack.id,
      title: currentTrack.title?.trim() || title || "DLNA stream",
      artist: currentTrack.artist?.trim() || currentTrack.albumArtist?.trim() || artist || "Unknown Artist",
      album: currentTrack.album?.trim() || null,
      albumArtist: currentTrack.albumArtist?.trim() || null,
      durationSeconds: currentTrack.duration > 0 ? currentTrack.duration : null,
      mediaType: currentTrack.mediaType ?? "remote",
      sourceId: currentTrack.sourceId ?? null,
      stableKey: currentTrack.stableKey ?? currentTrack.id,
    };
  }, [
    artist,
    currentTrack,
    title,
    trackId,
  ]);
  const effectiveLyricsBackgroundMode =
    lyricsDisplaySettings.lyricsBackgroundMode === "customWallpaper" &&
    !lyricsDisplaySettings.lyricsCustomWallpaperPath
      ? "theme"
      : lyricsDisplaySettings.lyricsBackgroundMode === "cover" && !backgroundCoverUrl
        ? "theme"
        : lyricsDisplaySettings.lyricsBackgroundMode;
  const effectiveLyricsBackgroundScalePercent =
    effectiveLyricsBackgroundMode === "cover"
      ? Math.max(100, lyricsDisplaySettings.lyricsBackgroundScalePercent)
      : lyricsDisplaySettings.lyricsBackgroundScalePercent;
  const lyricsWallpaperUrl = lyricsDisplaySettings.lyricsCustomWallpaperPath
    ? `echo-wallpaper://lyrics/custom?path=${encodeURIComponent(lyricsDisplaySettings.lyricsCustomWallpaperPath)}`
    : null;
  const lyricsBackgroundCoverUrl = networkBackgroundCoverUrl ?? backgroundCoverUrl;
  const lyricsSmartReadableEnabled = lyricsDisplaySettings.lyricsSmartReadableColorsEnabled === true;
  const lyricsSmartReadableImageUrl = lyricsSmartReadableEnabled
    ? effectiveLyricsBackgroundMode === "cover"
      ? lyricsBackgroundCoverUrl
      : effectiveLyricsBackgroundMode === "customWallpaper"
        ? lyricsWallpaperUrl
        : null
    : null;
  const smartReadableColors = useMemo<ReadableLyricsCssVars | null>(
    () => {
      if (!lyricsSmartReadableEnabled) {
        return null;
      }

      return createReadableLyricsColorVars({
        sample: mvReadableSample ?? imageReadableSample,
        userColor: lyricsDisplaySettings.lyricsColor,
        themeMode: documentThemeMode,
      });
    },
    [
      documentThemeMode,
      imageReadableSample,
      lyricsDisplaySettings.lyricsColor,
      lyricsSmartReadableEnabled,
      mvReadableSample,
    ],
  );
  const lyricsPageStyle = useMemo(
    () =>
      ({
        "--lyrics-cover": lyricsBackgroundCoverUrl ? cssUrl(lyricsBackgroundCoverUrl) : "none",
        "--lyrics-wallpaper": lyricsWallpaperUrl
          ? cssUrl(lyricsWallpaperUrl)
          : "none",
        "--lyrics-font-size": `${lyricsDisplaySettings.lyricsFontSizePx}px`,
        "--lyrics-secondary-font-size": `${lyricsDisplaySettings.lyricsSecondaryFontSizePx}px`,
        "--lyrics-line-max-width": lyricsDisplaySettings.lyricsLineMaxChars && lyricsDisplaySettings.lyricsLineMaxChars > 0
          ? `${lyricsDisplaySettings.lyricsLineMaxChars}em`
          : "100%",
        "--lyrics-line-spacing": (
          (lyricsDisplaySettings.lyricsLineSpacingPercent ?? fallbackLyricsDisplaySettings.lyricsLineSpacingPercent ?? 110) / 100
        ).toFixed(2),
        "--lyrics-context-opacity": (
          (lyricsDisplaySettings.lyricsContextOpacityPercent ?? fallbackLyricsDisplaySettings.lyricsContextOpacityPercent ?? 49) / 100
        ).toFixed(2),
        "--lyrics-color": lyricsDisplaySettings.lyricsColor,
        "--lyrics-cover-opacity": (
          lyricsDisplaySettings.lyricsCoverOpacityPercent / 100
        ).toFixed(2),
        "--lyrics-background-surface-alpha": (
          lyricsDisplaySettings.lyricsCoverOpacityPercent / 100
        ).toFixed(2),
        "--lyrics-cover-blur": `${lyricsDisplaySettings.lyricsCoverBlurPx}px`,
        "--lyrics-cover-brightness": `${lyricsDisplaySettings.lyricsCoverBrightnessPercent}%`,
        "--lyrics-background-scale": (effectiveLyricsBackgroundScalePercent / 100).toFixed(2),
        "--lyrics-background-bleed": `-${lyricsDisplaySettings.lyricsCoverBlurPx * 2}px`,
        ...(smartReadableColors ?? {}),
      }) as CSSProperties,
    [
      lyricsBackgroundCoverUrl,
      effectiveLyricsBackgroundScalePercent,
      lyricsDisplaySettings.lyricsColor,
      lyricsDisplaySettings.lyricsCoverBlurPx,
      lyricsDisplaySettings.lyricsCoverBrightnessPercent,
      lyricsDisplaySettings.lyricsCoverOpacityPercent,
      lyricsDisplaySettings.lyricsFontSizePx,
      lyricsDisplaySettings.lyricsLineMaxChars,
      lyricsDisplaySettings.lyricsSecondaryFontSizePx,
      lyricsDisplaySettings.lyricsLineSpacingPercent,
      lyricsDisplaySettings.lyricsContextOpacityPercent,
      lyricsWallpaperUrl,
      smartReadableColors,
    ],
  );

  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const syncThemeMode = (): void => setDocumentThemeMode(getCurrentDocumentThemeMode());
    const observer = new MutationObserver(syncThemeMode);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    syncThemeMode();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !lyricsDisplaySettings.lyricsHighResolutionNetworkCoverEnabled ||
      effectiveLyricsBackgroundMode !== "cover" ||
      !currentTrack?.id ||
      !backgroundCoverUrl
    ) {
      setNetworkBackgroundCoverUrl(null);
      return undefined;
    }

    const library = window.echo?.library;
    if (!library?.resolveLyricsBackgroundCover) {
      setNetworkBackgroundCoverUrl(null);
      return undefined;
    }

    let disposed = false;
    setNetworkBackgroundCoverUrl(null);
    void library
      .resolveLyricsBackgroundCover(currentTrack.id)
      .then((result) => {
        if (!disposed) {
          setNetworkBackgroundCoverUrl(result?.coverUrl ?? null);
        }
      })
      .catch(() => {
        if (!disposed) {
          setNetworkBackgroundCoverUrl(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, [
    backgroundCoverUrl,
    currentTrack?.id,
    effectiveLyricsBackgroundMode,
    lyricsDisplaySettings.lyricsHighResolutionNetworkCoverEnabled,
  ]);

  useEffect(() => {
    if (!lyricsSmartReadableEnabled || !lyricsSmartReadableImageUrl) {
      setImageReadableSample(null);
      return undefined;
    }

    let disposed = false;
    setImageReadableSample(null);
    void sampleImageUrl(lyricsSmartReadableImageUrl).then((sample) => {
      if (!disposed) {
        setImageReadableSample(sample);
      }
    });

    return () => {
      disposed = true;
    };
  }, [lyricsSmartReadableEnabled, lyricsSmartReadableImageUrl]);

  useEffect(() => {
    setMvReadableSample(null);
  }, [lyricsSmartReadableEnabled, trackId]);

  useEffect(() => {
    const handleVideoSample = (event: Event): void => {
      if (!lyricsSmartReadableEnabled || !(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as LyricsSmartReadableVideoSampleDetail | null;
      if (detail?.trackId && trackId && detail.trackId !== trackId) {
        return;
      }

      setMvReadableSample(detail?.sample ?? null);
    };

    window.addEventListener(lyricsSmartReadableVideoSampleEvent, handleVideoSample);
    return () => window.removeEventListener(lyricsSmartReadableVideoSampleEvent, handleVideoSample);
  }, [lyricsSmartReadableEnabled, trackId]);

  const handleOpenAlbumDetail = useCallback((): void => {
    if (!currentTrack || isAlbumNavigating) {
      return;
    }

    setIsAlbumNavigating(true);
    setError(null);

    if (albumNavigationTimeoutRef.current !== null) {
      window.clearTimeout(albumNavigationTimeoutRef.current);
    }

    albumNavigationTimeoutRef.current = window.setTimeout(() => {
      albumNavigationTimeoutRef.current = null;
      void openAlbumDetailForTrack(currentTrack)
        .then((locatedAlbum) => {
          if (!locatedAlbum) {
            setIsAlbumNavigating(false);
            setError("No album page found for this track.");
          }
        })
        .catch((albumError) => {
          setIsAlbumNavigating(false);
          setError(albumError instanceof Error ? albumError.message : String(albumError));
        });
    }, albumNavigationTransitionMs);
  }, [currentTrack, isAlbumNavigating]);

  useEffect(
    () => () => {
      if (albumNavigationTimeoutRef.current !== null) {
        window.clearTimeout(albumNavigationTimeoutRef.current);
      }
    },
    [],
  );

  const { audioClock: mvAudioClock } = useLyricsDisplayPosition(
    audioStatus,
    playbackStatus,
  );
  const lyricsPositionSeconds = seekPreviewSeconds ?? mvAudioClock.positionSeconds;
  const activeSearchProviders = useMemo<LyricsProviderId[]>(() => {
    const enabled = (lyricsDisplaySettings.lyricsEnabledProviders?.length
      ? lyricsDisplaySettings.lyricsEnabledProviders
      : fallbackLyricsDisplaySettings.lyricsEnabledProviders) ?? searchableLyricsProviderIds;
    const order = (lyricsDisplaySettings.lyricsProviderOrder?.length
      ? lyricsDisplaySettings.lyricsProviderOrder
      : fallbackLyricsDisplaySettings.lyricsProviderOrder) ?? searchableLyricsProviderIds;
    const ordered = [
      ...order.filter((provider) => enabled.includes(provider)),
      ...enabled.filter((provider) => !order.includes(provider)),
    ];

    return ordered.filter(
      (provider): provider is LyricsProviderId =>
        searchableLyricsProviderSet.has(provider) &&
        (provider === "local" || lyricsDisplaySettings.lyricsNetworkEnabled),
    );
  }, [
    lyricsDisplaySettings.lyricsEnabledProviders,
    lyricsDisplaySettings.lyricsNetworkEnabled,
    lyricsDisplaySettings.lyricsProviderOrder,
  ]);
  const candidateSourceOptions = useMemo<Array<{ key: CandidateSourceFilter; label: string; count: number; order: number }>>(() => {
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
      CandidateSourceFilter,
      { key: CandidateSourceFilter; label: string; count: number; order: number }
    >();

    activeSearchProviders.forEach((provider, index) => {
      sourceMap.set(provider, {
        key: provider,
        label: lyricsProviderLabels[provider] ?? provider,
        count: 0,
        order: index,
      });
    });

    for (const candidate of candidates) {
      const key = sourceFilterKey(candidate);
      const existing = sourceMap.get(key);
      if (existing) {
        existing.count += 1;
        if (!lyricsProviderLabels[candidate.provider] && candidate.sourceLabel) {
          existing.label = candidate.sourceLabel;
        }
      } else {
        sourceMap.set(key, {
          key,
          label: lyricsProviderLabels[candidate.provider] ?? candidate.sourceLabel,
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
  }, [activeSearchProviders, candidates]);
  const visibleCandidates = useMemo(
    () =>
      activeCandidateSource === "all"
        ? candidates
        : candidates.filter(
            (candidate) => sourceFilterKey(candidate) === activeCandidateSource,
          ),
    [activeCandidateSource, candidates],
  );
  const selectCandidateSource = useCallback((source: CandidateSourceFilter): void => {
    setActiveCandidateSource(source);
    rememberCandidateSource(source);
  }, []);

  useEffect(() => {
    if (activeCandidateSource === "all") {
      return;
    }

    if (!candidateSourceOptions.some((option) => option.key === activeCandidateSource)) {
      selectCandidateSource("all");
    }
  }, [activeCandidateSource, candidateSourceOptions, selectCandidateSource]);

  const applySharedPlaybackStatus = useCallback(
    (snapshot: { playbackStatus: PlaybackStatus | null; audioStatus: AudioStatus | null; error: string | null }): void => {
      if (snapshot.playbackStatus) {
        setPlaybackStatus(snapshot.playbackStatus);
      }

      const snapshotAudioStatus = snapshot.audioStatus;
      const shouldApplyAudioStatus = snapshotAudioStatus
        ? isAudioStatusForPlayback(snapshotAudioStatus, snapshot.playbackStatus)
        : false;
      if (shouldApplyAudioStatus) {
        setAudioStatus(snapshotAudioStatus);
      }

      const nextTrackId =
        snapshot.playbackStatus?.currentTrackId ??
        (snapshotAudioStatus && shouldApplyAudioStatus ? snapshotAudioStatus.currentTrackId : null) ??
        null;
      if (nextTrackId) {
        queue.setCurrentTrackId(nextTrackId);
      }
      setError(snapshot.error ?? snapshotAudioStatus?.error ?? null);
    },
    [queue],
  );

  const refreshStatus = useCallback(async (): Promise<void> => {
    applySharedPlaybackStatus(await refreshPlaybackStatus());
  }, [applySharedPlaybackStatus]);

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
    applySharedPlaybackStatus(sharedPlaybackStatus);
  }, [applySharedPlaybackStatus, sharedPlaybackStatus]);

  useEffect(() => {
    lyricsAutoAcceptScoreRef.current = lyricsDisplaySettings.lyricsAutoAcceptScore;
  }, [lyricsDisplaySettings.lyricsAutoAcceptScore]);

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

      if (isExplicitObjectSettingsPatch(event)) {
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

  useEffect(() => {
    setIsLyricsMatchPanelClosed(false);
    setIsLyricsMatchPanelRevealed(false);
    setLyricsMatchPanelActivityToken(0);
  }, [trackId]);

  const noteLyricsMatchPanelActivity = useCallback((): void => {
    setLyricsMatchPanelActivityToken((token) => (token + 1) % 1000000);
  }, []);

  const getLyricsForActiveTrack = useCallback(async (): Promise<TrackLyrics | null> => {
    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi || !trackId) {
      return null;
    }

    if (lyricsSnapshotRequest && lyricsApi.getForSnapshot) {
      return lyricsApi.getForSnapshot(lyricsSnapshotRequest);
    }

    return lyricsApi.getForTrack(trackId);
  }, [lyricsSnapshotRequest, trackId]);

  const searchLyricsCandidatesForProvider = useCallback(
    async (provider: LyricsProviderId, searchText?: string | null): Promise<LyricsSearchCandidate[]> => {
      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi || !trackId) {
        return [];
      }

      if (lyricsSnapshotRequest && lyricsApi.searchCandidatesForSnapshot) {
        return lyricsApi.searchCandidatesForSnapshot(lyricsSnapshotRequest, searchText ?? undefined, provider);
      }

      return searchText
        ? lyricsApi.searchCandidates(trackId, searchText, provider)
        : lyricsApi.searchCandidates(trackId, undefined, provider);
    },
    [lyricsSnapshotRequest, trackId],
  );

  const applyLyricsCandidateForActiveTrack = useCallback(
    async (candidateId: string): Promise<TrackLyrics> => {
      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi || !trackId) {
        throw new Error("Desktop bridge unavailable");
      }

      if (lyricsSnapshotRequest && lyricsApi.applyCandidateForSnapshot) {
        return lyricsApi.applyCandidateForSnapshot(lyricsSnapshotRequest, candidateId);
      }

      return lyricsApi.applyCandidate(trackId, candidateId);
    },
    [lyricsSnapshotRequest, trackId],
  );

  useEffect(() => {
    if (
      isLyricsMatchPanelClosed ||
      !isLyricsMatchPanelRevealed ||
      candidates.length === 0 ||
      applyingCandidateId
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsLyricsMatchPanelClosed(true);
    }, lyricsMatchAutoCloseMs);

    return () => window.clearTimeout(timer);
  }, [
    applyingCandidateId,
    candidates.length,
    isLyricsMatchPanelClosed,
    isLyricsMatchPanelRevealed,
    lyricsMatchPanelActivityToken,
  ]);

  const tryAutoApplyCandidate = useCallback(
    async (
      nextCandidates: LyricsSearchCandidate[],
      shouldApplyResult?: () => boolean,
    ): Promise<boolean> => {
      const autoCandidate = selectAutoApplyCandidate(
        nextCandidates,
        {
          lyricsAutoAcceptScore: lyricsAutoAcceptScoreRef.current,
          lyricsAutoSearch: lyricsDisplaySettings.lyricsAutoSearch,
        },
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
        const trackLyrics = await applyLyricsCandidateForActiveTrack(autoCandidate.id);
        if (shouldApplyResult && !shouldApplyResult()) {
          return true;
        }

        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setCandidates([]);
        setActiveCandidateSource(readRememberedCandidateSource());
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
      applyLyricsCandidateForActiveTrack,
      lyricsDisplaySettings.lyricsAutoSearch,
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
      setActiveCandidateSource(readRememberedCandidateSource());
      setIsLyricsMatchPanelRevealed(false);
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
      setActiveCandidateSource(readRememberedCandidateSource());
      setIsLyricsMatchPanelRevealed(false);
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
      setLyricsStatus("Loading streaming lyrics...");
      setCandidates([]);
      setActiveCandidateSource(readRememberedCandidateSource());
      setIsLyricsMatchPanelRevealed(false);

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
          setLyricsStatus(nextLyrics.lines.length > 0 ? null : "No lyrics found");
          setError(null);
        })
        .catch((lyricsError) => {
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          setLyrics(emptyLyrics(0));
          dispatchCurrentLyricsProviderChanged(null);
          setLyricsStatus("No lyrics found");
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
    setActiveCandidateSource(readRememberedCandidateSource());
    setIsLyricsMatchPanelRevealed(false);

    void getLyricsForActiveTrack()
      .then(async (trackLyrics) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        if (!trackLyrics && lyricsDisplaySettings.lyricsAutoSearch) {
          setIsCandidateLoading(true);
          let nextCandidates: LyricsSearchCandidate[] = [];
          const providers: LyricsProviderId[] = activeSearchProviders.length ? activeSearchProviders : ["local"];
          await Promise.allSettled(
            providers.map(async (provider) => {
              const providerCandidates = await searchLyricsCandidatesForProvider(provider);
              if (lyricsRequestRef.current !== requestId) {
                return;
              }

              nextCandidates = mergeLyricsCandidates(nextCandidates, providerCandidates);
              setCandidates(nextCandidates);
              setActiveCandidateSource(readRememberedCandidateSource());
            }),
          );
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
          setActiveCandidateSource(readRememberedCandidateSource());
          setIsLyricsMatchPanelRevealed(nextCandidates.length > 0);
          setLyricsStatus(nextCandidates.length ? null : "No lyrics found");
          return;
        }

        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setLyricsStatus(trackLyrics ? null : "No lyrics found");
      })
      .catch((lyricsError) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        setLyrics(emptyLyrics(0));
        dispatchCurrentLyricsProviderChanged(null);
        setLyricsStatus("No lyrics found");
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
    activeSearchProviders,
    getLyricsForActiveTrack,
    initialLyrics,
    isLyricsDisplaySettingsReady,
    lyricsDisplaySettings.lyricsAutoSearch,
    lyricsDisplaySettings.lyricsEnabled,
    searchLyricsCandidatesForProvider,
    streamingTarget,
    trackId,
    tryAutoApplyCandidate,
  ]);

  const handleSearchLyrics = useCallback(async (searchText?: string): Promise<void> => {
    if (!lyricsDisplaySettings.lyricsEnabled) {
      setLyricsStatus(null);
      return;
    }

    setIsLyricsMatchPanelClosed(false);
    setIsLyricsMatchPanelRevealed(true);

    if (streamingTarget) {
      const streamingApi = window.echo?.streaming;
      if (!streamingApi?.getLyrics) {
        setError("流媒体歌词服务不可用");
        return;
      }

      setIsCandidateLoading(false);
      setIsLyricsLoading(true);
      setLyricsStatus("Loading streaming lyrics...");
      try {
        const streamingLyrics = await streamingApi.getLyrics(streamingTarget);
        const nextLyrics = streamingLyricsToState(streamingLyrics, lyrics.offsetMs);
        setLyrics(nextLyrics);
        dispatchCurrentLyricsProviderChanged(null);
        setCandidates([]);
        setActiveCandidateSource(readRememberedCandidateSource());
        setLyricsStatus(nextLyrics.lines.length > 0 ? null : "No lyrics found");
        setError(null);
      } catch (lyricsError) {
        setLyricsStatus("No lyrics found");
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

    const lyricsApi = window.echo.lyrics;
    const requestId = lyricsRequestRef.current + 1;
    lyricsRequestRef.current = requestId;
    let collectedCandidates: LyricsSearchCandidate[] = [];
    const providers: LyricsProviderId[] = activeSearchProviders.length ? activeSearchProviders : ["local"];
    setIsCandidateLoading(true);
    setCandidates([]);
    setActiveCandidateSource(readRememberedCandidateSource());
    setLyricsStatus("Searching lyrics candidates...");
    try {
      await Promise.allSettled(
        providers.map(async (provider) => {
          const providerCandidates = await searchLyricsCandidatesForProvider(provider, searchText);
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          collectedCandidates = mergeLyricsCandidates(collectedCandidates, providerCandidates);
          setCandidates(collectedCandidates);
          setActiveCandidateSource(readRememberedCandidateSource());
          if (collectedCandidates.length > 0) {
            setLyricsStatus(null);
          }
        }),
      );

      if (lyricsRequestRef.current !== requestId) {
        return;
      }

      const shouldAutoApplySearchResult = lyrics.kind === "empty" || lyrics.lines.length === 0;
      if (shouldAutoApplySearchResult) {
        const autoApplied = await tryAutoApplyCandidate(
          collectedCandidates,
          () => lyricsRequestRef.current === requestId,
        );
        if (autoApplied) {
          return;
        }
      }
      setCandidates(collectedCandidates);
      setActiveCandidateSource(readRememberedCandidateSource());
      setLyricsStatus(collectedCandidates.length ? null : "No lyrics found");
      setError(null);
    } catch (candidateError) {
      setLyricsStatus("No lyrics found");
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : String(candidateError),
      );
    } finally {
      if (lyricsRequestRef.current === requestId) {
        setIsCandidateLoading(false);
      }
    }
  }, [
    activeSearchProviders,
    lyrics.kind,
    lyrics.lines.length,
    lyricsDisplaySettings.lyricsEnabled,
    lyrics.offsetMs,
    searchLyricsCandidatesForProvider,
    streamingTarget,
    trackId,
    tryAutoApplyCandidate,
  ]);

  const handleRematchLyrics = useCallback(async (): Promise<void> => {
    if (!lyricsDisplaySettings.lyricsEnabled) {
      setLyricsStatus(null);
      return;
    }

    setIsLyricsMatchPanelClosed(false);
    setIsLyricsMatchPanelRevealed(true);

    if (streamingTarget) {
      await handleSearchLyrics();
      return;
    }

    if (!trackId || !window.echo?.lyrics) {
      setError("Desktop bridge unavailable");
      return;
    }

    const lyricsApi = window.echo.lyrics;
    setLyrics(emptyLyrics(lyrics.offsetMs));
    setCandidates([]);
    setActiveCandidateSource(readRememberedCandidateSource());
    setIsCandidateLoading(true);
    setLyricsStatus("正在重新匹配歌词...");
    try {
      const requestId = lyricsRequestRef.current + 1;
      lyricsRequestRef.current = requestId;
      let collectedCandidates: LyricsSearchCandidate[] = [];
      const providers: LyricsProviderId[] = activeSearchProviders.length ? activeSearchProviders : ["local"];

      await lyricsApi.clearCache(trackId);
      await Promise.allSettled(
        providers.map(async (provider) => {
          const providerCandidates = await searchLyricsCandidatesForProvider(provider);
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          collectedCandidates = mergeLyricsCandidates(collectedCandidates, providerCandidates);
          setCandidates(collectedCandidates);
          setActiveCandidateSource(readRememberedCandidateSource());
          if (collectedCandidates.length > 0) {
            setLyricsStatus(null);
          }
        }),
      );

      if (lyricsRequestRef.current !== requestId) {
        return;
      }

      const autoApplied = await tryAutoApplyCandidate(
        collectedCandidates,
        () => lyricsRequestRef.current === requestId,
      );
      if (autoApplied) {
        return;
      }
      setCandidates(collectedCandidates);
      setActiveCandidateSource(readRememberedCandidateSource());
      setLyricsStatus(collectedCandidates.length ? null : "No lyrics found");
      setError(null);
    } catch (rematchError) {
      setLyricsStatus("No lyrics found");
      setError(
        rematchError instanceof Error
          ? rematchError.message
          : String(rematchError),
      );
    } finally {
      setIsCandidateLoading(false);
    }
  }, [
    activeSearchProviders,
    handleSearchLyrics,
    lyrics.offsetMs,
    lyricsDisplaySettings.lyricsEnabled,
    searchLyricsCandidatesForProvider,
    streamingTarget,
    trackId,
    tryAutoApplyCandidate,
  ]);

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
      setActiveCandidateSource(readRememberedCandidateSource());
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
        const trackLyrics = await applyLyricsCandidateForActiveTrack(candidateId);
        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setCandidates([]);
        setActiveCandidateSource(readRememberedCandidateSource());
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
    [applyLyricsCandidateForActiveTrack, lyricsDisplaySettings.lyricsEnabled, trackId],
  );

  const applyCustomLyricsFile = useCallback(
    async (file: File): Promise<void> => {
      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi?.applyCustomLrc || !trackId) {
        setError("Desktop bridge unavailable");
        return;
      }

      if (!file.name.toLowerCase().endsWith(".lrc")) {
        setError("Please choose an .lrc lyrics file");
        return;
      }

      setIsCustomLyricsApplying(true);
      setLyricsStatus("Applying custom LRC...");
      try {
        const lrcText = decodeTextFileBytes(new Uint8Array(await file.arrayBuffer()));
        const trackLyrics = await lyricsApi.applyCustomLrc(trackId, lrcText, file.name);
        lyricsRequestRef.current += 1;
        setLyrics(trackLyricsToState(trackLyrics));
        dispatchCurrentLyricsProviderChanged(trackLyrics);
        setCandidates([]);
        setActiveCandidateSource(readRememberedCandidateSource());
        setLyricsStatus(null);
        setError(null);
      } catch (customLyricsError) {
        setLyricsStatus(null);
        setError(
          customLyricsError instanceof Error
            ? customLyricsError.message
            : String(customLyricsError),
        );
      } finally {
        setIsCustomLyricsApplying(false);
      }
    },
    [trackId],
  );

  const handleLyricsDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (!firstLrcFile(event.dataTransfer.files) && !hasFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsCustomLyricsDragging(true);
  }, []);

  const handleLyricsDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsCustomLyricsDragging(false);
  }, []);

  const handleLyricsDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      const file = firstLrcFile(event.dataTransfer.files);
      if (!file) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsCustomLyricsDragging(false);
      void applyCustomLyricsFile(file);
    },
    [applyCustomLyricsFile],
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
        const nextStatus = {
          ...status,
          positionMs: Math.round(nextSeconds * 1000),
        };
        setPlaybackStatus(nextStatus);
        setAudioStatus((current) =>
          current
            ? {
                ...current,
                state: status.state,
                currentTrackId: status.currentTrackId,
                currentFilePath: status.filePath,
                positionSeconds: nextSeconds,
                durationSeconds: status.durationMs / 1000,
              }
            : current,
        );
        setPlaybackStatusSnapshot({ playbackStatus: nextStatus, error: null });
        dispatchPlaybackSeeked(nextSeconds, status.currentTrackId ?? trackId ?? null);
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

  const handleLyricsOffsetChange = useCallback(
    async (nextOffsetMs: number): Promise<void> => {
      const lyricsApi = window.echo?.lyrics;
      if (!lyricsApi || !trackId) {
        setError("Desktop bridge unavailable");
        return;
      }

      try {
        setIsLyricsOffsetSaving(true);
        const nextLyrics = await lyricsApi.setOffset(trackId, nextOffsetMs);
        if (!nextLyrics) {
          setError("Current lyrics cannot be adjusted until a matched lyric is cached");
          return;
        }

        setLyrics(trackLyricsToState(nextLyrics, lyrics.offsetMs));
        dispatchCurrentLyricsProviderChanged(nextLyrics);
        setError(null);
      } catch (offsetError) {
        setError(
          offsetError instanceof Error ? offsetError.message : String(offsetError),
        );
      } finally {
        setIsLyricsOffsetSaving(false);
      }
    },
    [lyrics.offsetMs, trackId],
  );

  const lyricsOffsetControls = useMemo(() => {
    if (!trackId || lyrics.kind !== "synced" || !lyricsDisplaySettings.lyricsOffsetControlsEnabled) {
      return null;
    }

    const currentOffsetMs = lyrics.offsetMs;
    const offsetSteps = [-500, -100, 100, 500];
    const clampNextOffset = (value: number): number =>
      Math.max(-10000, Math.min(10000, Math.round(value)));

    return (
      <section className="lyrics-offset-controls" aria-label="Lyrics sync">
        <span className="lyrics-offset-label">Lyrics offset</span>
        <span className="lyrics-offset-value">{formatOffset(currentOffsetMs)}</span>
        <div className="lyrics-offset-buttons">
          {offsetSteps.map((step) => {
            const nextOffsetMs = clampNextOffset(currentOffsetMs + step);
            const isForward = step > 0;
            return (
              <button
                type="button"
                key={step}
                disabled={isLyricsOffsetSaving || nextOffsetMs === currentOffsetMs}
                title={step > 0 ? `Lyrics earlier ${step}ms` : `Lyrics later ${Math.abs(step)}ms`}
                onClick={() => void handleLyricsOffsetChange(nextOffsetMs)}
              >
                {isForward ? <FastForward size={14} /> : <Rewind size={14} />}
                <span>{step > 0 ? "+" : ""}{step}ms</span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={isLyricsOffsetSaving || currentOffsetMs === 0}
            title="Reset lyrics offset"
            onClick={() => void handleLyricsOffsetChange(0)}
          >
            <RotateCcw size={14} />
            <span>0ms</span>
          </button>
        </div>
        <p>This offset is saved for the current track and reused next time.</p>
      </section>
    );
  }, [
    handleLyricsOffsetChange,
    isLyricsOffsetSaving,
    lyrics.kind,
    lyrics.offsetMs,
    lyricsDisplaySettings.lyricsOffsetControlsEnabled,
    trackId,
  ]);

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
        ? "Searching lyrics candidates..."
        : shouldFoldStatusIntoEmptyLyrics
          ? null
          : lyricsStatus;

    if (candidates.length === 0 && !statusText) {
      return null;
    }

    if (isLyricsMatchPanelClosed) {
      return null;
    }

    if (!isLyricsMatchPanelRevealed && candidates.length === 0) {
      return null;
    }

    return (
      <section
        className="lyrics-match-panel"
        aria-label="Lyrics matching"
        onFocusCapture={noteLyricsMatchPanelActivity}
        onKeyDown={noteLyricsMatchPanelActivity}
        onPointerDown={noteLyricsMatchPanelActivity}
        onPointerEnter={noteLyricsMatchPanelActivity}
        onWheel={noteLyricsMatchPanelActivity}
      >
        <div className="lyrics-match-panel__bar">
          {statusText ? <p className="lyrics-match-status">{statusText}</p> : <span />}
          <button
            className="lyrics-match-close"
            type="button"
            aria-label="Close lyrics candidates"
            title="Close lyrics candidates"
            onClick={() => setIsLyricsMatchPanelClosed(true)}
          >
            <X size={14} />
          </button>
        </div>
        {candidates.length ? (
          <>
            <div className="lyrics-source-filters" aria-label="Lyrics source filter">
              {candidateSourceOptions.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  data-active={activeCandidateSource === option.key}
                  onClick={() => selectCandidateSource(option.key)}
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
                      <small>Applying</small>
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
    isLyricsMatchPanelClosed,
    isLyricsMatchPanelRevealed,
    isCandidateLoading,
    isLyricsLoading,
    lyricsDisplaySettings.lyricsEnabled,
    lyrics.lines.length,
    lyricsStatus,
    noteLyricsMatchPanelActivity,
    selectCandidateSource,
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
      data-smart-readable={lyricsSmartReadableEnabled ? "true" : undefined}
      data-album-transition={isAlbumNavigating ? "true" : undefined}
      data-custom-lrc-dragging={isCustomLyricsDragging}
      data-window-maximized={isWindowMaximized}
      style={lyricsPageStyle}
      onDragLeave={handleLyricsDragLeave}
      onDragOver={handleLyricsDragOver}
      onDrop={handleLyricsDrop}
    >
      <div className="lyrics-backdrop" aria-hidden="true" />
      {isCustomLyricsDragging ? (
        <div className="lyrics-custom-lrc-drop" aria-hidden="true">
          <Upload size={28} />
          <strong>Drop LRC to apply</strong>
        </div>
      ) : null}

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
              {album ? (
                <button
                  className="lyrics-track-album"
                  type="button"
                  disabled={!currentTrack || isAlbumNavigating}
                  title={`Open ${album}`}
                  onClick={handleOpenAlbumDetail}
                >
                  {album}
                </button>
              ) : null}
              <p className="lyrics-track-artist">{artist}</p>
              <div className="lyrics-track-status">
                <PlayerStatusChips status={audioStatus} state={state} track={currentTrack} />
              </div>
            </div>
          </header>
        )}

        {lyricsControls}
        {lyricsOffsetControls}
        {lyricsDisplaySettings.lyricsEnabled ? (
          <LyricsView
            durationMs={(audioStatus?.durationSeconds ?? currentTrack?.duration ?? 0) * 1000}
            hideEmptyState={lyricsDisplaySettings.lyricsEmptyStateHidden}
            lyrics={lyrics}
            positionMs={lyricsPositionSeconds * 1000 + lyricsDisplaySettings.lyricsGlobalSyncOffsetMs}
            playbackRate={mvAudioClock.playbackRate}
            playbackState={seekPreviewSeconds === null ? mvAudioClock.state : "paused"}
            positionUpdatedAtMs={seekPreviewSeconds === null ? mvAudioClock.updatedAtMs : performance.now()}
            wordHighlightEnabled={lyricsDisplaySettings.lyricsWordHighlightEnabled !== false}
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
        hideFallbackTrackInfo={
          lyricsDisplaySettings.lyricsHeaderHidden &&
          lyricsDisplaySettings.lyricsMvAutoShowTrackInfoDisabled
        }
        smartReadableColorsEnabled={lyricsSmartReadableEnabled}
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
