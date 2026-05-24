import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  FastForward,
  Disc3,
  Music2,
  Rewind,
  RotateCcw,
  TimerReset,
  Upload,
  X,
} from "lucide-react";
import type { AudioStatus } from "../../shared/types/audio";
import type { AppSettings } from "../../shared/types/appSettings";
import type { AirPlayReceiverStatus } from "../../shared/types/connect";
import type { LibraryTrack } from "../../shared/types/library";
import type {
  LyricsProviderId,
  LyricsSearchCandidate,
  LyricsTrackSnapshotRequest,
  TrackLyrics,
} from "../../shared/types/lyrics";
import type { MvSettings } from "../../shared/types/mv";
import type {
  StreamingLyricsResult,
  StreamingProviderName,
} from "../../shared/types/streaming";
import { streamingProviderNames } from "../../shared/types/streaming";
import type { PlaybackStatus } from "../../shared/types/playback";
import { decodeTextFileBytes } from "../../shared/utils/decodeTextFile";
import { shouldShowRomanizationForLyrics } from "../../shared/utils/lyricsLanguage";
import { LyricsView, getActiveLyricIndex } from "../components/lyrics/LyricsView";
import { MvPanel, type MvAudioClock } from "../components/lyrics/MvPanel";
import {
  suggestLyricsSmartAlignment,
  type LyricsSmartAlignmentAnchor,
  type LyricsSmartAlignmentOutputMode,
} from "../components/lyrics/lyricsSmartAlignment";
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
import { serializeFontList } from "../preferences/appearancePreferences";

type LyricsPageProps = {
  initialLyrics?: LyricLine[];
};

type LyricsMvPanelBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type LyricsMvPanelBoundaryState = {
  failed: boolean;
};

class LyricsMvPanelBoundary extends Component<LyricsMvPanelBoundaryProps, LyricsMvPanelBoundaryState> {
  state: LyricsMvPanelBoundaryState = { failed: false };

  static getDerivedStateFromError(): LyricsMvPanelBoundaryState {
    return { failed: true };
  }

  componentDidUpdate(previousProps: LyricsMvPanelBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <section
          className="lyrics-mv-panel lyrics-mv-panel--fallback"
          aria-label="MV"
          data-mv-enabled="false"
          data-view-mode="mv"
          data-mv-crashed="true"
        >
          <div className="lyrics-mv-fallback">
            <strong>MV temporarily unavailable</strong>
            <span>Lyrics remain available for the current playback.</span>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

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
  | "lyricsCandidatePanelAutoOpenEnabled"
  | "lyricsEmptyStateHidden"
  | "lyricsFontSizePx"
  | "lyricsFontFamily"
  | "lyricsFontFilePath"
  | "lyricsColor"
  | "lyricsBackgroundMode"
  | "lyricsCustomWallpaperPath"
  | "lyricsRomanizationEnabled"
  | "lyricsUtatenKanaEnabled"
  | "lyricsTranslationEnabled"
  | "lyricsWordHighlightEnabled"
  | "lyricsWordHighlightClarityPercent"
  | "lyricsAutoSearch"
  | "lyricsAutoAcceptScore"
  | "lyricsGlobalSyncOffsetMs"
  | "lyricsTimelineCorrectionEnabled"
  | "lyricsOffsetControlsEnabled"
  | "lyricsSmartAlignmentEnabled"
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
const lyricsNavigationEvent = "app:navigate:lyrics";
const lyricsViewModeMemoryKey = "echo:lyrics:view-mode";
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
  lyricsCandidatePanelAutoOpenEnabled: true,
  lyricsEmptyStateHidden: true,
  lyricsFontSizePx: 40,
  lyricsFontFamily: "Microsoft YaHei",
  lyricsFontFilePath: null,
  lyricsColor: "#314054",
  lyricsBackgroundMode: "theme",
  lyricsCustomWallpaperPath: null,
  lyricsRomanizationEnabled: true,
  lyricsUtatenKanaEnabled: false,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsWordHighlightClarityPercent: 70,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsTimelineCorrectionEnabled: true,
  lyricsOffsetControlsEnabled: false,
  lyricsSmartAlignmentEnabled: false,
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

const isSnapshotTrackId = (trackId: string | null | undefined): boolean =>
  Boolean(trackId?.startsWith("dlna-receiver:") || trackId?.startsWith("airplay-receiver:"));

const snapshotProtocol = (trackId: string | null | undefined): "dlna" | "airplay" | null => {
  if (trackId?.startsWith("dlna-receiver:")) {
    return "dlna";
  }
  if (trackId?.startsWith("airplay-receiver:")) {
    return "airplay";
  }
  return null;
};

const isSnapshotLyricsTrack = (track: LibraryTrack | null, trackId: string | null): track is LibraryTrack =>
  Boolean(track?.isTemporary || isSnapshotTrackId(trackId) || isSnapshotTrackId(track?.id));

const airPlaySingleLineLyrics = (line: string | null): LyricsState | null => {
  const text = line?.trim();
  if (!text) {
    return null;
  }

  return {
    kind: "plain",
    source: "placeholder",
    lines: [{ timeMs: -1, text }],
    offsetMs: 0,
  };
};

const airPlayReceiverSourceId = (status: AirPlayReceiverStatus | null): string | null => {
  const sourceId = status?.currentSourceId?.trim();
  return sourceId && status?.enabled ? sourceId : null;
};

const airPlayReceiverPlaybackState = (status: AirPlayReceiverStatus | null): "playing" | "paused" | "idle" | null => {
  if (!airPlayReceiverSourceId(status)) {
    return null;
  }

  return status?.state === "playing" || status?.state === "paused" ? status.state : "idle";
};

const airPlayReceiverDurationSeconds = (status: AirPlayReceiverStatus | null): number | null => {
  const duration = Number(status?.durationSeconds ?? status?.metadata?.durationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const airPlayReceiverPositionSeconds = (status: AirPlayReceiverStatus | null): number => {
  const position = Number(status?.positionSeconds);
  return Number.isFinite(position) && position > 0 ? position : 0;
};

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

type LyricsViewMode = "lyrics" | "mv";

type LyricsNavigationDetail = {
  mode?: LyricsViewMode;
};

const isLyricsViewMode = (value: unknown): value is LyricsViewMode =>
  value === "lyrics" || value === "mv";

const readRememberedLyricsViewMode = (): LyricsViewMode => {
  try {
    const value = window.sessionStorage.getItem(lyricsViewModeMemoryKey);
    return isLyricsViewMode(value) ? value : "lyrics";
  } catch {
    return "lyrics";
  }
};

const rememberLyricsViewMode = (mode: LyricsViewMode): void => {
  try {
    window.sessionStorage.setItem(lyricsViewModeMemoryKey, mode);
  } catch {
    // Best-effort page mode only.
  }
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

const shouldUseAudioStatusForCurrentPlayback = (
  audioStatus: AudioStatus | null,
  playbackStatus: PlaybackStatus | null,
): audioStatus is AudioStatus => {
  if (!audioStatus) {
    return false;
  }

  if (isAudioStatusForPlayback(audioStatus, playbackStatus)) {
    return true;
  }

  const playbackSnapshotProtocol = snapshotProtocol(playbackStatus?.currentTrackId ?? playbackStatus?.filePath);
  if (playbackSnapshotProtocol) {
    const audioSnapshotProtocol = snapshotProtocol(audioStatus.currentTrackId ?? audioStatus.currentFilePath);
    return audioSnapshotProtocol === playbackSnapshotProtocol;
  }

  if (isSnapshotTrackId(playbackStatus?.currentTrackId)) {
    return false;
  }

  if (!audioStatus.currentTrackId && !audioStatus.currentFilePath) {
    return false;
  }

  return (
    audioStatus.state === "loading" ||
    audioStatus.state === "playing" ||
    audioStatus.state === "paused"
  );
};

const smartAlignmentOutputModes = new Set(["shared", "exclusive", "asio"]);

const isSmartAlignmentOutputMode = (
  outputMode: AudioStatus["outputMode"] | null | undefined,
): outputMode is LyricsSmartAlignmentOutputMode =>
  Boolean(outputMode && smartAlignmentOutputModes.has(outputMode));

const smartAlignmentModeLabel = (outputMode: LyricsSmartAlignmentOutputMode): string => {
  if (outputMode === "asio") {
    return "ASIO";
  }
  if (outputMode === "exclusive") {
    return "WASAPI 独占";
  }
  return "WASAPI 共享";
};

const smartAlignmentConfidenceLabel = (confidence: "low" | "medium" | "high"): string => {
  if (confidence === "high") {
    return "高置信度";
  }
  if (confidence === "medium") {
    return "中置信度";
  }
  return "低置信度";
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
  const allowInlineCover = isSnapshotLyricsTrack(track, track?.id ?? null);

  return coverUrl && (allowInlineCover || !coverUrl.startsWith("data:")) ? coverUrl : null;
};

const originalCoverUrlFromCachedVariant = (coverUrl: string | null | undefined): string | null => {
  const originalUrl = coverUrl?.replace(
    /^echo-cover:\/\/(?:thumb|album|large)\//u,
    "echo-cover://original/",
  ) ?? null;

  return originalUrl?.startsWith("echo-cover://original/") ? originalUrl : null;
};

const isRemoteArtworkUrl = (coverUrl: string | null | undefined): coverUrl is string =>
  Boolean(coverUrl && !coverUrl.startsWith("data:") && !coverUrl.startsWith("echo-cover://"));

const isStreamBackedTrack = (track: LibraryTrack | null): boolean =>
  track?.mediaType === "streaming" || track?.mediaType === "remote";

const safeOriginalCoverUrl = (track: LibraryTrack | null): string | null => {
  const allowInlineCover = isSnapshotLyricsTrack(track, track?.id ?? null);
  const coverLarge = (track as TrackWithLargeCover | null)?.coverLarge ?? null;
  const coverThumb = track?.coverThumb ?? null;
  const inlineCover = allowInlineCover
    ? (coverLarge ?? coverThumb)
    : null;
  const streamCover = isStreamBackedTrack(track) && isRemoteArtworkUrl(coverLarge)
    ? coverLarge
    : isStreamBackedTrack(track) && isRemoteArtworkUrl(coverThumb)
      ? coverThumb
      : null;
  const coverUrl = track?.coverId
    ? `echo-cover://original/${encodeURIComponent(track.coverId)}`
    : originalCoverUrlFromCachedVariant(coverLarge)
      ?? originalCoverUrlFromCachedVariant(coverThumb)
      ?? streamCover
      ?? inlineCover;

  return coverUrl && (allowInlineCover || !coverUrl.startsWith("data:")) ? coverUrl : null;
};

const normalizeClipboardLine = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const formatTrackInfoForClipboard = (title: string, album: string | null, artist: string): string =>
  [title, album, artist]
    .map(normalizeClipboardLine)
    .filter((line): line is string => Boolean(line))
    .join("\n");

const formatLyricsForClipboard = (
  lyricsState: LyricsState,
  showRomanization: boolean,
  preferKanaPronunciation: boolean,
  showTranslation: boolean,
): string => {
  const canShowRomanization = showRomanization && shouldShowRomanizationForLyrics(lyricsState.lines);
  return lyricsState.lines
    .map((line) =>
      [
        normalizeClipboardLine(line.text),
        canShowRomanization
          ? normalizeClipboardLine(
            preferKanaPronunciation && line.kana?.trim() ? line.kana : line.romanization,
          )
          : null,
        showTranslation ? normalizeClipboardLine(line.translation) : null,
      ]
        .filter((text): text is string => Boolean(text))
        .join("\n"),
    )
    .filter((text) => text.length > 0)
    .join("\n");
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
  lyricsCandidatePanelAutoOpenEnabled: settings.lyricsCandidatePanelAutoOpenEnabled !== false,
  lyricsEmptyStateHidden: settings.lyricsEmptyStateHidden,
  lyricsFontSizePx: settings.lyricsFontSizePx,
  lyricsFontFamily: settings.lyricsFontFamily ?? fallbackLyricsDisplaySettings.lyricsFontFamily,
  lyricsFontFilePath: settings.lyricsFontFilePath ?? fallbackLyricsDisplaySettings.lyricsFontFilePath,
  lyricsColor: settings.lyricsColor,
  lyricsBackgroundMode: settings.lyricsBackgroundMode,
  lyricsCustomWallpaperPath: settings.lyricsCustomWallpaperPath,
  lyricsRomanizationEnabled: settings.lyricsRomanizationEnabled,
  lyricsUtatenKanaEnabled: settings.lyricsUtatenKanaEnabled === true,
  lyricsTranslationEnabled: settings.lyricsTranslationEnabled,
  lyricsWordHighlightEnabled: settings.lyricsWordHighlightEnabled !== false,
  lyricsWordHighlightClarityPercent:
    settings.lyricsWordHighlightClarityPercent ?? fallbackLyricsDisplaySettings.lyricsWordHighlightClarityPercent,
  lyricsAutoSearch: settings.lyricsAutoSearch,
  lyricsAutoAcceptScore: settings.lyricsAutoAcceptScore,
  lyricsGlobalSyncOffsetMs: settings.lyricsGlobalSyncOffsetMs,
  lyricsTimelineCorrectionEnabled: settings.lyricsTimelineCorrectionEnabled !== false,
  lyricsOffsetControlsEnabled: settings.lyricsOffsetControlsEnabled === true,
  lyricsSmartAlignmentEnabled: settings.lyricsSmartAlignmentEnabled === true,
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

const pickLyricsReadabilityEnhanced = (value: unknown): boolean | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const patch = value as Partial<MvSettings>;
  return typeof patch.lyricsReadabilityEnhanced === "boolean"
    ? patch.lyricsReadabilityEnhanced
    : null;
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
  "lyricsCandidatePanelAutoOpenEnabled",
  "lyricsEmptyStateHidden",
  "lyricsFontSizePx",
  "lyricsFontFamily",
  "lyricsFontFilePath",
  "lyricsColor",
  "lyricsBackgroundMode",
  "lyricsCustomWallpaperPath",
  "lyricsRomanizationEnabled",
  "lyricsUtatenKanaEnabled",
  "lyricsTranslationEnabled",
  "lyricsWordHighlightEnabled",
  "lyricsWordHighlightClarityPercent",
  "lyricsAutoSearch",
  "lyricsAutoAcceptScore",
  "lyricsGlobalSyncOffsetMs",
  "lyricsTimelineCorrectionEnabled",
  "lyricsOffsetControlsEnabled",
  "lyricsSmartAlignmentEnabled",
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

const getSettingsEventDetailObject = (event: Event): Record<string, unknown> | null => {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail && typeof detail === "object" && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : null;
};

const isExplicitObjectSettingsPatch = (event: Event): boolean =>
  getSettingsEventDetailObject(event) !== null;

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
    shouldUseAudioStatusForCurrentPlayback(audioStatus, playbackStatus)
      ? audioStatus.positionSeconds
      : (playbackStatus?.positionMs ?? 0) / 1000;
  const sourceDurationSeconds =
    shouldUseAudioStatusForCurrentPlayback(audioStatus, playbackStatus)
      ? audioStatus.durationSeconds
      : (playbackStatus?.durationMs ?? 0) / 1000;
  const activeAudioStatus = shouldUseAudioStatusForCurrentPlayback(
    audioStatus,
    playbackStatus,
  )
    ? audioStatus
    : null;
  const state = activeAudioStatus?.state ?? playbackStatus?.state ?? "idle";
  const playbackRate = activeAudioStatus?.playbackRate ?? 1;
  const currentTrackId =
    activeAudioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? null;
  const currentFilePath =
    activeAudioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
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
      const canIgnoreStaleForwardJump = canBridgeSourceLag && sourceJumpedForward && Math.abs(previous.playbackRate - 1) > 0.001;

      if (rateChangeSourceDiscontinuity) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleRegression) {
        nextPositionSeconds = estimatedPositionSeconds;
      } else if (canIgnoreStaleForwardJump) {
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
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsState>(() =>
    initialLyrics && initialLyrics.length > 0
      ? syncedLyrics(initialLyrics, 0)
      : emptyLyrics(0),
  );
  const [airPlayReceiverStatus, setAirPlayReceiverStatus] =
    useState<AirPlayReceiverStatus | null>(null);
  const [lyricsDisplaySettings, setLyricsDisplaySettings] =
    useState<LyricsDisplaySettings>(fallbackLyricsDisplaySettings);
  const [isLyricsDisplaySettingsReady, setIsLyricsDisplaySettingsReady] =
    useState(false);
  const [lyricsViewMode, setLyricsViewModeState] =
    useState<LyricsViewMode>(() => readRememberedLyricsViewMode());
  const [lyricsReadabilityEnhanced, setLyricsReadabilityEnhanced] = useState(false);
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
  const [isSmartAlignmentSessionActive, setIsSmartAlignmentSessionActive] = useState(false);
  const [smartAlignmentAnchors, setSmartAlignmentAnchors] = useState<LyricsSmartAlignmentAnchor[]>([]);
  const [, setIsCustomLyricsApplying] = useState(false);
  const [isCustomLyricsDragging, setIsCustomLyricsDragging] = useState(false);
  const lyricsRequestRef = useRef(0);
  const albumNavigationTimeoutRef = useRef<number | null>(null);
  const copyNoticeTimerRef = useRef<number | null>(null);
  const setLyricsViewMode = useCallback((mode: LyricsViewMode): void => {
    rememberLyricsViewMode(mode);
    setLyricsViewModeState(mode);
  }, []);
  const clearCopyNotice = useCallback((): void => {
    if (copyNoticeTimerRef.current !== null) {
      window.clearTimeout(copyNoticeTimerRef.current);
      copyNoticeTimerRef.current = null;
    }

    setCopyNotice(null);
  }, []);
  const showCopyNotice = useCallback((message: string): void => {
    if (copyNoticeTimerRef.current !== null) {
      window.clearTimeout(copyNoticeTimerRef.current);
    }

    setError(null);
    setCopyNotice(message);
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice(null);
      copyNoticeTimerRef.current = null;
    }, 1600);
  }, []);
  const showCopyError = useCallback(
    (message: string): void => {
      clearCopyNotice();
      setError(message);
    },
    [clearCopyNotice],
  );
  const writeClipboardText = useCallback(
    async (text: string, successMessage: string): Promise<void> => {
      if (!navigator.clipboard?.writeText) {
        showCopyError("当前环境不支持写入剪贴板。");
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        showCopyNotice(successMessage);
      } catch (copyError) {
        showCopyError(copyError instanceof Error ? copyError.message : "复制失败。");
      }
    },
    [showCopyError, showCopyNotice],
  );
  useEffect(
    () => () => {
      if (copyNoticeTimerRef.current !== null) {
        window.clearTimeout(copyNoticeTimerRef.current);
      }
    },
    [],
  );
  const activeAudioStatus = shouldUseAudioStatusForCurrentPlayback(
    audioStatus,
    playbackStatus,
  )
    ? audioStatus
    : null;
  const airPlaySourceId = airPlayReceiverSourceId(airPlayReceiverStatus);
  const airPlayPlaybackState = airPlayReceiverPlaybackState(airPlayReceiverStatus);
  const state = airPlayPlaybackState ?? activeAudioStatus?.state ?? playbackStatus?.state ?? "idle";
  const statusTrackId =
    activeAudioStatus?.currentTrackId ?? playbackStatus?.currentTrackId ?? null;
  const shouldPreferAudioTrackId =
    Boolean(activeAudioStatus?.currentTrackId) &&
    (!queue.currentTrackId ||
      queue.currentTrackId === playbackStatus?.currentTrackId ||
      queue.currentTrackId === activeAudioStatus?.currentTrackId);
  const trackId =
    shouldPreferAudioTrackId
      ? statusTrackId
      : queue.currentTrackId ?? statusTrackId ?? airPlaySourceId;
  const queuedCurrentTrack =
    !trackId || queue.currentTrack?.id === trackId ? queue.currentTrack : null;
  const currentTrack =
    queuedCurrentTrack ??
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
    airPlaySourceId ??
    null;
  const airPlayMetadata = airPlayReceiverStatus?.metadata ?? null;
  const airPlayDurationSeconds = airPlayReceiverDurationSeconds(airPlayReceiverStatus);
  const airPlayArtworkUrl =
    airPlayReceiverStatus?.artworkUrl ||
    airPlayMetadata?.coverHttpUrl ||
    null;
  const title =
    currentTrack?.title ??
    airPlayMetadata?.title?.trim() ??
    titleFromPath(filePath);
  const artist =
    currentTrack?.artist ||
    currentTrack?.albumArtist ||
    airPlayMetadata?.artist?.trim() ||
    airPlayMetadata?.albumArtist?.trim() ||
    (filePath ? "Local file" : "Ready");
  const album = currentTrack?.album?.trim() || airPlayMetadata?.album?.trim() || null;
  const coverUrl = safeCoverUrl(currentTrack) ?? airPlayArtworkUrl;
  const headerCoverUrl = safeOriginalCoverUrl(currentTrack) ?? airPlayArtworkUrl;
  const backgroundCoverUrl = safeOriginalCoverUrl(currentTrack) ?? airPlayArtworkUrl;
  const trackCoverCopyTrackId = currentTrack?.id ?? null;
  const canCopyTrackOriginalCover =
    Boolean(trackCoverCopyTrackId) &&
    currentTrack?.isTemporary !== true &&
    !isSnapshotTrackId(trackCoverCopyTrackId);
  const lyricsSnapshotRequest = useMemo<LyricsTrackSnapshotRequest | null>(() => {
    const shouldUseSnapshot =
      Boolean(currentTrack?.mediaType === "streaming") ||
      isSnapshotLyricsTrack(currentTrack, trackId);
    if (!trackId || !shouldUseSnapshot) {
      return null;
    }

    const snapshotTrackId = currentTrack?.id ?? trackId;
    return {
      trackId: snapshotTrackId,
      title: currentTrack?.title?.trim() || title || "AirPlay stream",
      artist: currentTrack?.artist?.trim() || currentTrack?.albumArtist?.trim() || artist || "Unknown Artist",
      album: currentTrack?.album?.trim() || album,
      albumArtist: currentTrack?.albumArtist?.trim() || airPlayMetadata?.albumArtist?.trim() || null,
      durationSeconds: currentTrack?.duration && currentTrack.duration > 0 ? currentTrack.duration : airPlayDurationSeconds,
      mediaType: currentTrack?.mediaType ?? "remote",
      sourceId: currentTrack?.sourceId ?? (isStreamingTrack(currentTrack) ? currentTrack.providerTrackId : airPlaySourceId),
      stableKey: currentTrack?.stableKey ?? snapshotTrackId,
    };
  }, [
    airPlayDurationSeconds,
    airPlayMetadata?.albumArtist,
    airPlaySourceId,
    album,
    artist,
    currentTrack,
    title,
    trackId,
  ]);
  const isCurrentAirPlayReceiverTrack =
    Boolean(airPlaySourceId) ||
    snapshotProtocol(trackId) === "airplay" ||
    snapshotProtocol(currentTrack?.id) === "airplay" ||
    snapshotProtocol(currentTrack?.path) === "airplay" ||
    snapshotProtocol(playbackStatus?.filePath) === "airplay";
  const liveAirPlayLyrics = useMemo(
    () => (isCurrentAirPlayReceiverTrack ? airPlaySingleLineLyrics(airPlayReceiverStatus?.currentLyricLine ?? null) : null),
    [airPlayReceiverStatus?.currentLyricLine, isCurrentAirPlayReceiverTrack],
  );
  const displayedLyrics = liveAirPlayLyrics ?? lyrics;
  useEffect(() => {
    setIsSmartAlignmentSessionActive(false);
    setSmartAlignmentAnchors([]);
  }, [lyrics.lines, lyrics.source, trackId]);
  const effectiveDisplayedLyrics = useMemo(
    () =>
      lyricsDisplaySettings.lyricsTimelineCorrectionEnabled !== false
        ? displayedLyrics
        : { ...displayedLyrics, offsetMs: 0 },
    [displayedLyrics, lyricsDisplaySettings.lyricsTimelineCorrectionEnabled],
  );
  const handleTrackInfoContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      const text = formatTrackInfoForClipboard(title, album, artist);
      if (!text) {
        showCopyError("没有可复制的歌曲信息。");
        return;
      }

      void writeClipboardText(text, "已复制歌曲信息");
    },
    [album, artist, showCopyError, title, writeClipboardText],
  );
  const handleTrackCoverContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      if (!trackCoverCopyTrackId || !canCopyTrackOriginalCover) {
        showCopyError("这首歌没有可复制的封面原图。");
        return;
      }

      void (async () => {
        try {
          const copied = await window.echo.library.copyTrackOriginalCover(trackCoverCopyTrackId);
          if (!copied) {
            showCopyError("这首歌没有可复制的封面原图。");
            return;
          }

          showCopyNotice("已复制封面原图");
        } catch (copyError) {
          showCopyError(copyError instanceof Error ? copyError.message : "复制封面失败。");
        }
      })();
    },
    [canCopyTrackOriginalCover, showCopyError, showCopyNotice, trackCoverCopyTrackId],
  );
  const handleLyricsContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      const text = formatLyricsForClipboard(
        effectiveDisplayedLyrics,
        lyricsDisplaySettings.lyricsRomanizationEnabled,
        lyricsDisplaySettings.lyricsUtatenKanaEnabled === true,
        lyricsDisplaySettings.lyricsTranslationEnabled,
      );
      if (!text) {
        showCopyError("没有可复制的歌词。");
        return;
      }

      void writeClipboardText(text, "已复制歌词");
    },
    [
      effectiveDisplayedLyrics,
      lyricsDisplaySettings.lyricsRomanizationEnabled,
      lyricsDisplaySettings.lyricsUtatenKanaEnabled,
      lyricsDisplaySettings.lyricsTranslationEnabled,
      showCopyError,
      writeClipboardText,
    ],
  );
  const shouldRequestNetworkBackgroundCover =
    lyricsDisplaySettings.lyricsHighResolutionNetworkCoverEnabled === true &&
    lyricsDisplaySettings.lyricsBackgroundMode === "cover" &&
    Boolean(currentTrack?.id) &&
    currentTrack?.isTemporary !== true &&
    !isSnapshotTrackId(trackId) &&
    !isSnapshotTrackId(currentTrack?.id);
  const effectiveLyricsBackgroundMode =
    lyricsDisplaySettings.lyricsBackgroundMode === "customWallpaper" &&
    !lyricsDisplaySettings.lyricsCustomWallpaperPath
      ? "theme"
      : lyricsDisplaySettings.lyricsBackgroundMode === "cover" && !backgroundCoverUrl && !shouldRequestNetworkBackgroundCover
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
  const lyricsUsesManualColor =
    lyricsDisplaySettings.lyricsColor.toUpperCase() !== fallbackLyricsDisplaySettings.lyricsColor.toUpperCase();
  const shouldEnhanceLyricsReadability = lyricsReadabilityEnhanced || lyricsSmartReadableEnabled;
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
        "--lyrics-font-family": [
          serializeFontList(lyricsDisplaySettings.lyricsFontFamily ?? fallbackLyricsDisplaySettings.lyricsFontFamily ?? "Microsoft YaHei"),
          "var(--echo-font-family)",
        ].join(", "),
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
        "--lyrics-current-word-clarity": `${lyricsDisplaySettings.lyricsWordHighlightClarityPercent ?? fallbackLyricsDisplaySettings.lyricsWordHighlightClarityPercent ?? 70}%`,
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
      lyricsDisplaySettings.lyricsFontFamily,
      lyricsDisplaySettings.lyricsFontSizePx,
      lyricsDisplaySettings.lyricsLineMaxChars,
      lyricsDisplaySettings.lyricsSecondaryFontSizePx,
      lyricsDisplaySettings.lyricsLineSpacingPercent,
      lyricsDisplaySettings.lyricsContextOpacityPercent,
      lyricsDisplaySettings.lyricsWordHighlightClarityPercent,
      lyricsWallpaperUrl,
      smartReadableColors,
    ],
  );

  useEffect(() => {
    const handleLyricsNavigation = (event: Event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as LyricsNavigationDetail | null) : null;
      if (isLyricsViewMode(detail?.mode)) {
        setLyricsViewMode(detail.mode);
      }
    };

    window.addEventListener(lyricsNavigationEvent, handleLyricsNavigation);
    return () => window.removeEventListener(lyricsNavigationEvent, handleLyricsNavigation);
  }, [setLyricsViewMode]);

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
      !shouldRequestNetworkBackgroundCover ||
      effectiveLyricsBackgroundMode !== "cover" ||
      !currentTrack?.id
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
    shouldRequestNetworkBackgroundCover,
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

  const { audioClock: baseMvAudioClock } = useLyricsDisplayPosition(
    audioStatus,
    playbackStatus,
  );
  const displayDurationSeconds =
    airPlayDurationSeconds ??
    audioStatus?.durationSeconds ??
    currentTrack?.duration ??
    0;
  const mvAudioClock = useMemo<MvAudioClock>(() => {
    if (!airPlaySourceId) {
      return baseMvAudioClock;
    }

    return {
      durationSeconds: airPlayDurationSeconds,
      playbackRate: 1,
      positionSeconds: airPlayReceiverPositionSeconds(airPlayReceiverStatus),
      state: airPlayPlaybackState ?? "idle",
      updatedAtMs: performance.now(),
    };
  }, [
    airPlayDurationSeconds,
    airPlayPlaybackState,
    airPlayReceiverStatus,
    airPlaySourceId,
    baseMvAudioClock,
  ]);
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
        ? isAudioStatusForPlayback(snapshotAudioStatus, snapshot.playbackStatus) ||
          Boolean(snapshotAudioStatus.currentTrackId || snapshotAudioStatus.currentFilePath)
        : false;
      if (shouldApplyAudioStatus) {
        setAudioStatus(snapshotAudioStatus);
      } else if (snapshot.playbackStatus) {
        const nextPlaybackStatus = snapshot.playbackStatus;
        setAudioStatus((current) =>
          current && !isAudioStatusForPlayback(current, nextPlaybackStatus)
            ? null
            : current,
        );
      }

      const nextTrackId =
        (snapshotAudioStatus && shouldApplyAudioStatus ? snapshotAudioStatus.currentTrackId : null) ??
        snapshot.playbackStatus?.currentTrackId ??
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

  useEffect(() => {
    let disposed = false;
    const connect = window.echo?.connect;
    void connect?.getAirPlayReceiverStatus?.()
      .then((status) => {
        if (!disposed) {
          setAirPlayReceiverStatus(status);
        }
      })
      .catch(() => undefined);

    const unsubscribe = connect?.onAirPlayReceiverStatus?.((status) => {
      setAirPlayReceiverStatus(status);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

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
      const patch = pickLyricsDisplaySettingsPatch(getSettingsEventDetailObject(event));
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
    let isCancelled = false;

    const loadLyricsReadabilityEnhanced = async (): Promise<void> => {
      try {
        const nextSettings = await window.echo?.mv?.getSettings?.();
        if (!isCancelled && nextSettings) {
          setLyricsReadabilityEnhanced(nextSettings.lyricsReadabilityEnhanced === true);
        }
      } catch {
        // Keep the last known value when the MV bridge is unavailable.
      }
    };

    const handleSettingsChanged = (event: Event): void => {
      const nextValue = pickLyricsReadabilityEnhanced(getSettingsEventDetailObject(event));
      if (nextValue !== null) {
        setLyricsReadabilityEnhanced(nextValue);
        return;
      }

      if (!isExplicitObjectSettingsPatch(event)) {
        void loadLyricsReadabilityEnhanced();
      }
    };

    void loadLyricsReadabilityEnhanced();
    window.addEventListener("settings:changed", handleSettingsChanged);
    return () => {
      isCancelled = true;
      window.removeEventListener("settings:changed", handleSettingsChanged);
    };
  }, []);

  const setLyricsCandidatePanelAutoOpenEnabled = useCallback(
    (enabled: boolean): void => {
      const patch: Partial<AppSettings> = {
        lyricsCandidatePanelAutoOpenEnabled: enabled,
      };
      const app = window.echo?.app;

      setLyricsDisplaySettings((current) => ({
        ...current,
        lyricsCandidatePanelAutoOpenEnabled: enabled,
      }));
      window.dispatchEvent(new CustomEvent("lyrics:display-settings-changed", { detail: patch }));

      if (!app?.setSettings) {
        setError("Desktop bridge unavailable");
        return;
      }

      void app
        .setSettings(patch)
        .then((nextSettings) => {
          const savedValue = selectLyricsDisplaySettings(nextSettings)
            .lyricsCandidatePanelAutoOpenEnabled !== false;
          const savedPatch: Partial<AppSettings> = {
            lyricsCandidatePanelAutoOpenEnabled: savedValue,
          };
          setLyricsDisplaySettings((current) => ({
            ...current,
            lyricsCandidatePanelAutoOpenEnabled: savedValue,
          }));
          window.dispatchEvent(new CustomEvent("settings:changed", { detail: savedPatch }));
          window.dispatchEvent(new CustomEvent("lyrics:display-settings-changed", { detail: savedPatch }));
          setError(null);
        })
        .catch((settingsError) => {
          setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
          void loadLyricsDisplaySettings();
        });
    },
    [loadLyricsDisplaySettings],
  );

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

      // Prefer the streaming provider's exact lookup, then fall back to the regular lyrics matcher.
      void streamingApi
        .getLyrics(streamingTarget)
        .then(async (streamingLyrics) => {
          if (lyricsRequestRef.current !== requestId) {
            return;
          }

          const nextLyrics = streamingLyricsToState(streamingLyrics);
          setLyrics(nextLyrics);
          dispatchCurrentLyricsProviderChanged(null);
          setError(null);

          if (nextLyrics.kind !== "empty" || !lyricsDisplaySettings.lyricsAutoSearch) {
            setLyricsStatus(nextLyrics.lines.length > 0 ? null : "No lyrics found");
            return;
          }

          setIsCandidateLoading(true);
          setLyricsStatus("Searching lyrics candidates...");
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
          setIsLyricsMatchPanelRevealed(
            nextCandidates.length > 0 &&
              lyricsDisplaySettings.lyricsCandidatePanelAutoOpenEnabled !== false,
          );
          setLyricsStatus(nextCandidates.length ? null : "No lyrics found");
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
          setIsLyricsMatchPanelRevealed(
            nextCandidates.length > 0 &&
              lyricsDisplaySettings.lyricsCandidatePanelAutoOpenEnabled !== false,
          );
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
    lyricsDisplaySettings.lyricsCandidatePanelAutoOpenEnabled,
    lyricsDisplaySettings.lyricsEnabled,
    lyricsDisplaySettings.lyricsRomanizationEnabled,
    lyricsDisplaySettings.lyricsUtatenKanaEnabled,
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

    if (streamingTarget && !searchText?.trim()) {
      const streamingApi = window.echo?.streaming;
      if (streamingApi?.getLyrics) {
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

          if (nextLyrics.kind === "instrumental" || nextLyrics.lines.length > 0) {
            return;
          }
        } catch {
          setLyrics(emptyLyrics(lyrics.offsetMs));
          dispatchCurrentLyricsProviderChanged(null);
          setLyricsStatus("No lyrics found");
        } finally {
          setIsLyricsLoading(false);
        }
      }
    }

    if (!trackId || !window.echo?.lyrics) {
      setError("Desktop bridge unavailable");
      return;
    }

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
    const correctionEnabled = lyricsDisplaySettings.lyricsTimelineCorrectionEnabled !== false;
    const currentPlaybackMs = Math.max(0, lyricsPositionSeconds * 1000);
    const displayPositionMs = currentPlaybackMs + (correctionEnabled ? lyricsDisplaySettings.lyricsGlobalSyncOffsetMs : 0);
    const activeLineIndex = getActiveLyricIndex(
      displayedLyrics.lines,
      displayPositionMs,
      correctionEnabled ? lyrics.offsetMs : 0,
    );
    const activeLine = activeLineIndex >= 0 ? displayedLyrics.lines[activeLineIndex] : null;
    const alignedOffsetMs = activeLine
      ? clampNextOffset(activeLine.timeMs - (currentPlaybackMs + lyricsDisplaySettings.lyricsGlobalSyncOffsetMs))
      : currentOffsetMs;

    return (
      <section className="lyrics-offset-controls" aria-label="Lyrics sync">
        <span className="lyrics-offset-label">Lyrics offset</span>
        <span className="lyrics-offset-value">{formatOffset(currentOffsetMs)}</span>
        <div className="lyrics-offset-buttons">
          <button
            type="button"
            disabled={isLyricsOffsetSaving || !activeLine || alignedOffsetMs === currentOffsetMs}
            title={activeLine ? "对齐当前句到当前播放位置" : "当前没有可对齐的同步歌词行"}
            onClick={() => void handleLyricsOffsetChange(alignedOffsetMs)}
          >
            <TimerReset size={14} />
            <span>对齐当前句</span>
          </button>
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
    displayedLyrics.lines,
    lyrics.kind,
    lyrics.offsetMs,
    lyricsDisplaySettings.lyricsGlobalSyncOffsetMs,
    lyricsDisplaySettings.lyricsOffsetControlsEnabled,
    lyricsDisplaySettings.lyricsTimelineCorrectionEnabled,
    lyricsPositionSeconds,
    trackId,
  ]);

  const lyricsSmartAlignmentControls = useMemo(() => {
    if (!lyricsDisplaySettings.lyricsSmartAlignmentEnabled) {
      return null;
    }

    const outputMode = isSmartAlignmentOutputMode(audioStatus?.outputMode)
      ? audioStatus.outputMode
      : null;
    const hasCachedSyncedLyrics =
      lyrics.kind === "synced" &&
      lyrics.source !== "placeholder" &&
      lyrics.lines.length > 0;
    const hasCurrentAudioClock =
      Boolean(
        audioStatus &&
          trackId &&
          audioStatus.currentTrackId === trackId &&
          Number.isFinite(audioStatus.positionSeconds),
      );
    const correctionEnabled = lyricsDisplaySettings.lyricsTimelineCorrectionEnabled !== false;
    const canUseSmartAlignment =
      Boolean(trackId) &&
      hasCachedSyncedLyrics &&
      correctionEnabled &&
      hasCurrentAudioClock &&
      Boolean(outputMode) &&
      Boolean(window.echo?.lyrics?.setOffset);
    const unavailableReason =
      !trackId
        ? "等待当前歌曲"
        : !hasCachedSyncedLyrics
          ? "需要已缓存的同步歌词"
          : !correctionEnabled
            ? "时间轴校准总开关已关闭"
            : !hasCurrentAudioClock
              ? "等待当前播放时钟"
              : !outputMode
                ? "当前输出模式暂不支持智能校准"
                : !window.echo?.lyrics?.setOffset
                  ? "歌词校准接口不可用"
                  : null;
    const audioPlaybackMs = audioStatus ? Math.max(0, audioStatus.positionSeconds * 1000) : 0;
    const displayPositionMs = audioPlaybackMs + lyricsDisplaySettings.lyricsGlobalSyncOffsetMs;
    const activeLineIndex = canUseSmartAlignment
      ? getActiveLyricIndex(
          lyrics.lines,
          displayPositionMs,
          lyrics.offsetMs,
        )
      : -1;
    const activeLine = activeLineIndex >= 0 ? lyrics.lines[activeLineIndex] : null;
    const suggestion = suggestLyricsSmartAlignment(smartAlignmentAnchors);
    const hasSuggestion = Boolean(suggestion);
    const canApplySuggestion =
      Boolean(suggestion) &&
      suggestion?.canApply === true &&
      !isLyricsOffsetSaving &&
      canUseSmartAlignment &&
      suggestion?.offsetMs !== lyrics.offsetMs;
    const suggestionMessage = suggestion
      ? suggestion.driftDetected
        ? `可能存在时间轴漂移（前后差 ${formatOffset(suggestion.driftMs)}），本版只建议整体 offset，低置信度不应用。`
        : !suggestion.canApply
          ? suggestion.rejectedAnchors.length > 0
            ? `低置信度：已排除 ${suggestion.rejectedAnchors.length} 个离群锚点，建议多标记几句后再应用。`
            : `低置信度：锚点分散 ${suggestion.spreadMs}ms，建议多标记几句后再应用。`
          : `建议来自 ${suggestion.anchorCount} 个有效锚点。`
      : null;

    const handleStartSession = (): void => {
      setSmartAlignmentAnchors([]);
      setIsSmartAlignmentSessionActive(true);
    };

    const handleMarkAnchor = (): void => {
      if (!activeLine || !outputMode || !canUseSmartAlignment) {
        return;
      }

      setSmartAlignmentAnchors((current) =>
        [
          ...current,
          {
            lyricLineTimeMs: activeLine.timeMs,
            playbackMs: audioPlaybackMs,
            globalOffsetMs: lyricsDisplaySettings.lyricsGlobalSyncOffsetMs,
            outputMode,
          },
        ].slice(-5),
      );
    };

    const handleApplySuggestion = (): void => {
      if (!suggestion || !canApplySuggestion) {
        return;
      }
      void handleLyricsOffsetChange(suggestion.offsetMs);
    };

    return (
      <section className="lyrics-smart-alignment" aria-label="Smart lyrics alignment">
        <span className="lyrics-smart-alignment-label">智能校准建议</span>
        <div className="lyrics-smart-alignment-buttons">
          <button
            type="button"
            disabled={!canUseSmartAlignment || isSmartAlignmentSessionActive}
            onClick={handleStartSession}
          >
            <TimerReset size={14} />
            <span>开始智能校准</span>
          </button>
          <button
            type="button"
            disabled={!isSmartAlignmentSessionActive || !canUseSmartAlignment || !activeLine}
            title={activeLine ? `标记：${activeLine.text}` : "当前没有可标记的同步歌词行"}
            onClick={handleMarkAnchor}
          >
            <Disc3 size={14} />
            <span>标记当前句</span>
          </button>
          <button
            type="button"
            disabled={!canApplySuggestion}
            onClick={handleApplySuggestion}
          >
            <Check size={14} />
            <span>应用建议</span>
          </button>
        </div>
        {hasSuggestion && suggestion ? (
          <span className="lyrics-smart-alignment-suggestion">
            建议 {formatOffset(suggestion.offsetMs)} · {smartAlignmentConfidenceLabel(suggestion.confidence)} · {smartAlignmentModeLabel(suggestion.outputMode)} 时钟 · 有效 {suggestion.anchorCount} 点
          </span>
        ) : null}
        <p>
          {unavailableReason ??
            suggestionMessage ??
            (isSmartAlignmentSessionActive
              ? `已标记 ${smartAlignmentAnchors.length} 个锚点，听到当前句时继续标记。`
              : "开启会话后，听到当前句时点标记，ECHO 会计算建议 offset。")}
        </p>
      </section>
    );
  }, [
    audioStatus,
    handleLyricsOffsetChange,
    isLyricsOffsetSaving,
    isSmartAlignmentSessionActive,
    lyrics.kind,
    lyrics.lines,
    lyrics.offsetMs,
    lyrics.source,
    lyricsDisplaySettings.lyricsGlobalSyncOffsetMs,
    lyricsDisplaySettings.lyricsSmartAlignmentEnabled,
    lyricsDisplaySettings.lyricsTimelineCorrectionEnabled,
    smartAlignmentAnchors,
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

    if (!isLyricsMatchPanelRevealed) {
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
          <div className="lyrics-match-panel__actions">
            <label className="lyrics-match-auto-open">
              <input
                type="checkbox"
                checked={lyricsDisplaySettings.lyricsCandidatePanelAutoOpenEnabled !== false}
                onChange={(event) => setLyricsCandidatePanelAutoOpenEnabled(event.currentTarget.checked)}
              />
              <span>自动弹出</span>
            </label>
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
    lyricsDisplaySettings.lyricsCandidatePanelAutoOpenEnabled,
    lyricsDisplaySettings.lyricsEnabled,
    lyrics.lines.length,
    lyricsStatus,
    noteLyricsMatchPanelActivity,
    selectCandidateSource,
    setLyricsCandidatePanelAutoOpenEnabled,
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
      data-lyrics-color-mode={lyricsUsesManualColor ? "manual" : "theme"}
      data-smart-readable={lyricsSmartReadableEnabled ? "true" : undefined}
      data-album-transition={isAlbumNavigating ? "true" : undefined}
      data-custom-lrc-dragging={isCustomLyricsDragging}
      data-view-mode={lyricsViewMode}
      data-airplay-receiver={isCurrentAirPlayReceiverTrack ? "true" : undefined}
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
            <div
              className="lyrics-track-cover"
              data-empty={!headerCoverUrl}
              title="右键复制封面原图"
              onContextMenu={handleTrackCoverContextMenu}
            >
              {headerCoverUrl ? (
                <img alt="" draggable={false} src={headerCoverUrl} />
              ) : (
                <Disc3 size={26} />
              )}
            </div>
            <div
              className="lyrics-track-copy"
              title="右键复制歌曲信息"
              onContextMenu={handleTrackInfoContextMenu}
            >
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
        {lyricsSmartAlignmentControls}
        {lyricsDisplaySettings.lyricsEnabled ? (
          <LyricsView
            durationMs={displayDurationSeconds * 1000}
            hideEmptyState={lyricsDisplaySettings.lyricsEmptyStateHidden && !isCurrentAirPlayReceiverTrack}
            lyrics={effectiveDisplayedLyrics}
            positionMs={
              lyricsPositionSeconds * 1000 +
              (lyricsDisplaySettings.lyricsTimelineCorrectionEnabled !== false ? lyricsDisplaySettings.lyricsGlobalSyncOffsetMs : 0)
            }
            playbackRate={mvAudioClock.playbackRate}
            playbackState={seekPreviewSeconds === null ? mvAudioClock.state : "paused"}
            positionUpdatedAtMs={seekPreviewSeconds === null ? mvAudioClock.updatedAtMs : performance.now()}
            wordHighlightEnabled={lyricsDisplaySettings.lyricsWordHighlightEnabled !== false}
            showRomanization={lyricsDisplaySettings.lyricsRomanizationEnabled}
            preferKanaPronunciation={lyricsDisplaySettings.lyricsUtatenKanaEnabled === true}
            showTranslation={lyricsDisplaySettings.lyricsTranslationEnabled}
            onContextMenu={handleLyricsContextMenu}
            onSeek={(timeMs) => void handleLyricSeek(timeMs)}
          />
        ) : null}
      </section>

      {lyricsViewMode === "mv" ? (
        <LyricsMvPanelBoundary resetKey={`${trackId ?? "none"}:${title}:${artist}`}>
          <MvPanel
            trackId={trackId ?? null}
            currentTrack={currentTrack}
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
        </LyricsMvPanelBoundary>
      ) : (
        <section
          className="lyrics-mv-panel"
          aria-label="MV"
          data-lyrics-readability={shouldEnhanceLyricsReadability ? "true" : undefined}
          data-mv-enabled="false"
          data-view-mode="lyrics"
        />
      )}

      {error ? (
        <div className="lyrics-error" role="status">
          {error}
        </div>
      ) : null}
      {copyNotice ? (
        <div className="lyrics-copy-notice" role="status" aria-live="polite">
          <span className="lyrics-copy-notice-mark" aria-hidden="true">
            <Check size={13} strokeWidth={2.5} />
          </span>
          <span className="lyrics-copy-notice-text">{copyNotice}</span>
        </div>
      ) : null}
    </div>
  );
};
