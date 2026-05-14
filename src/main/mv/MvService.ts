import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import electron, { shell } from 'electron';
import type { EchoDatabase } from '../database/createDatabase';
import { createDatabase } from '../database/createDatabase';
import { getAppSettings, setAppSettings } from '../app/appSettings';
import { getLibraryService } from '../library/LibraryService';
import type { LibraryTrack } from '../../shared/types/library';
import type {
  MvMatchCandidate,
  MvQualityTier,
  MvQualityVariant,
  MvResolvedStreams,
  MvSettings,
  NetworkMvProviderId,
  MvProviderId,
  MvSourceType,
  TrackVideo,
} from '../../shared/types/mv';
import { isBrowserPlayableVideo, isSupportedVideoExtension, mimeTypeForVideoPath } from '../../shared/constants/videoExtensions';
import { LocalMvProvider } from './LocalMvProvider';
import { createOnlineMvProviders, type MainMvOnlineProvider, type ResolvedMvStreamVariant } from './OnlineMvProviders';

type LibraryLookup = {
  getTrack: (trackId: string) => LibraryTrack | null;
};

type ShellOpener = Pick<typeof shell, 'openPath' | 'openExternal'>;

type TrackVideoRow = {
  id: string;
  track_id: string;
  provider: string;
  source_type: string;
  source_id: string | null;
  title: string | null;
  artist: string | null;
  url: string | null;
  provider_url: string | null;
  thumbnail_url: string | null;
  file_path: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  selected_quality_id: string | null;
  quality_label: string | null;
  fps: number | null;
  raw_provider_json: string | null;
  score: number;
  selected: number;
  created_at: string;
  updated_at: string;
};

type TrackVideoStreamRow = {
  id: string;
  video_id: string;
  provider: string;
  variant_id: string;
  label: string;
  quality_tier: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  container: string | null;
  mime_type: string | null;
  protocol: string;
  url: string | null;
  headers_json: string;
  playable_in_app: number;
  requires_account: number;
  expires_at: string | null;
  raw_json: string | null;
  created_at: string;
  updated_at: string;
};

type TrackVideoFile = {
  id: string;
  provider: MvProviderId;
  filePath: string | null;
  url: string | null;
  mimeType: string | null;
  playableInApp: boolean;
};

export type StreamVariantForProtocol = {
  videoId: string;
  variantId: string;
  url: string;
  headers: Record<string, string>;
  mimeType: string | null;
};

const nowIso = (): string => new Date().toISOString();

const fileHashId = (filePath: string): string => `local:${createHash('sha1').update(resolve(filePath)).digest('hex')}`;

const networkProviders: NetworkMvProviderId[] = ['bilibili', 'youtube'];
export const MV_AUTO_MATCH_THRESHOLD = 0.7;
const normalizeAutoApplyThreshold = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0.5, Math.min(1, value)) : MV_AUTO_MATCH_THRESHOLD;
const normalizePercent = (value: unknown, fallback: number, min: number, max: number): number => {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.round(Math.max(min, Math.min(max, percent))) : fallback;
};
const qualityHeight: Record<Exclude<MvQualityTier, 'auto'>, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

const maxQualityHeight = (quality: MvSettings['maxQuality']): number => (quality === 'max' ? Number.POSITIVE_INFINITY : qualityHeight[quality]);

const parseJson = (value: string | null): unknown | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const parseHeaders = (value: string | null): Record<string, string> => {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : [],
    ),
  );
};

const mediaUrlForLocal = (row: TrackVideoRow): string | null => {
  if (row.provider !== 'local' || !row.file_path || !isBrowserPlayableVideo(row.file_path) || !existsSync(row.file_path)) {
    return null;
  }

  return `echo-video://mv/${encodeURIComponent(row.id)}`;
};

const mediaUrlForStream = (row: TrackVideoRow, variant: TrackVideoStreamRow | null): string | null => {
  if (!variant?.url || variant.playable_in_app !== 1 || variant.protocol === 'external') {
    return null;
  }

  return `echo-mv://stream/${encodeURIComponent(row.id)}/${encodeURIComponent(variant.variant_id)}`;
};

const providerName = (value: string): MvProviderId => {
  if (value === 'local' || value === 'bilibili' || value === 'youtube' || value === 'netease' || value === 'qqmusic') {
    return value;
  }

  return 'local';
};

const sourceType = (value: string): MvSourceType => {
  if (value === 'sidecar' || value === 'manual' || value === 'search_candidate' || value === 'stream') {
    return value;
  }

  return 'sidecar';
};

const qualityTier = (value: string): MvQualityTier => {
  if (value === 'auto' || value === '720p' || value === '1080p' || value === '1440p' || value === '2160p') {
    return value;
  }

  return 'auto';
};

const candidateTitle = (filePath: string): string => basename(filePath, extname(filePath));

const sourceIdForCandidate = (candidate: MvMatchCandidate): string =>
  candidate.id.startsWith(`${candidate.provider}:`) ? candidate.id.slice(candidate.provider.length + 1) : candidate.id;

const customMvFromUrl = (value: string): { provider: NetworkMvProviderId; sourceId: string; providerUrl: string; title: string } => {
  const trimmed = value.trim();
  if (/^BV[0-9A-Za-z]+$/.test(trimmed)) {
    return {
      provider: 'bilibili',
      sourceId: trimmed,
      providerUrl: `https://www.bilibili.com/video/${trimmed}`,
      title: `Bilibili - ${trimmed}`,
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Unsupported MV link. Paste a YouTube or Bilibili video URL.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;

  if (hostname === 'youtu.be') {
    const videoId = path.split('/').filter(Boolean)[0];
    if (videoId) {
      return {
        provider: 'youtube',
        sourceId: videoId,
        providerUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: `YouTube - ${videoId}`,
      };
    }
  }

  if (hostname.endsWith('youtube.com')) {
    const videoId = url.searchParams.get('v') ?? (path.startsWith('/shorts/') ? path.split('/').filter(Boolean)[1] : null);
    if (videoId) {
      return {
        provider: 'youtube',
        sourceId: videoId,
        providerUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: `YouTube - ${videoId}`,
      };
    }
  }

  if (hostname.endsWith('bilibili.com')) {
    const bvid = path
      .split('/')
      .map((part) => part.trim())
      .find((part) => /^BV[0-9A-Za-z]+$/.test(part));
    if (bvid) {
      return {
        provider: 'bilibili',
        sourceId: bvid,
        providerUrl: `https://www.bilibili.com/video/${bvid}`,
        title: `Bilibili - ${bvid}`,
      };
    }
  }

  throw new Error('Unsupported MV link. Paste a YouTube or Bilibili video URL.');
};

const normalizeSettingsPatch = (patch: Partial<MvSettings>): Partial<MvSettings> => {
  const normalized: Partial<MvSettings> = {};

  if (typeof patch.enabled === 'boolean') {
    normalized.enabled = patch.enabled;
  }

  if (Array.isArray(patch.enabledProviders)) {
    normalized.enabledProviders = patch.enabledProviders.filter((provider): provider is NetworkMvProviderId =>
      networkProviders.includes(provider as NetworkMvProviderId),
    );
  }

  if (Array.isArray(patch.providerOrder)) {
    normalized.providerOrder = patch.providerOrder.filter((provider): provider is NetworkMvProviderId =>
      networkProviders.includes(provider as NetworkMvProviderId),
    );
  }

  if (patch.maxQuality === '720p' || patch.maxQuality === '1080p' || patch.maxQuality === '1440p' || patch.maxQuality === '2160p' || patch.maxQuality === 'max') {
    normalized.maxQuality = patch.maxQuality;
  }

  if (typeof patch.allow60fps === 'boolean') {
    normalized.allow60fps = patch.allow60fps;
  }

  if (typeof patch.autoSearch === 'boolean') {
    normalized.autoSearch = patch.autoSearch;
  }

  if (typeof patch.autoPreload === 'boolean') {
    normalized.autoPreload = patch.autoPreload;
  }

  if (typeof patch.autoApplyThreshold === 'number' && Number.isFinite(patch.autoApplyThreshold)) {
    normalized.autoApplyThreshold = normalizeAutoApplyThreshold(patch.autoApplyThreshold);
  }

  if (typeof patch.immersiveBackground === 'boolean') {
    normalized.immersiveBackground = patch.immersiveBackground;
  }

  if (typeof patch.immersiveBackgroundScalePercent === 'number' && Number.isFinite(patch.immersiveBackgroundScalePercent)) {
    normalized.immersiveBackgroundScalePercent = normalizePercent(patch.immersiveBackgroundScalePercent, 115, 100, 220);
  }

  if (typeof patch.immersiveBackgroundOffsetXPercent === 'number' && Number.isFinite(patch.immersiveBackgroundOffsetXPercent)) {
    normalized.immersiveBackgroundOffsetXPercent = normalizePercent(patch.immersiveBackgroundOffsetXPercent, 50, 0, 100);
  }

  if (typeof patch.immersiveBackgroundOffsetYPercent === 'number' && Number.isFinite(patch.immersiveBackgroundOffsetYPercent)) {
    normalized.immersiveBackgroundOffsetYPercent = normalizePercent(patch.immersiveBackgroundOffsetYPercent, 50, 0, 100);
  }

  if (typeof patch.immersiveBackgroundBlurPx === 'number' && Number.isFinite(patch.immersiveBackgroundBlurPx)) {
    normalized.immersiveBackgroundBlurPx = normalizePercent(patch.immersiveBackgroundBlurPx, 0, 0, 32);
  }

  if (typeof patch.immersiveBackgroundBrightnessPercent === 'number' && Number.isFinite(patch.immersiveBackgroundBrightnessPercent)) {
    normalized.immersiveBackgroundBrightnessPercent = normalizePercent(patch.immersiveBackgroundBrightnessPercent, 100, 60, 140);
  }

  if (typeof patch.immersiveBackgroundOverlayOpacityPercent === 'number' && Number.isFinite(patch.immersiveBackgroundOverlayOpacityPercent)) {
    normalized.immersiveBackgroundOverlayOpacityPercent = normalizePercent(patch.immersiveBackgroundOverlayOpacityPercent, 0, 0, 100);
  }

  if (typeof patch.lyricsReadabilityEnhanced === 'boolean') {
    normalized.lyricsReadabilityEnhanced = patch.lyricsReadabilityEnhanced;
  }

  if (typeof patch.restartAudioOnLoad === 'boolean') {
    normalized.restartAudioOnLoad = patch.restartAudioOnLoad;
  }

  return normalized;
};

const appSettingsToMvSettings = (): MvSettings => {
  const settings = getAppSettings();
  return {
    enabled: settings.mvEnabled !== false,
    autoSearch: settings.mvAutoSearch,
    autoPreload: settings.mvAutoPreload !== false,
    autoApplyThreshold: normalizeAutoApplyThreshold(settings.mvAutoApplyThreshold),
    immersiveBackground: settings.mvImmersiveBackground !== false,
    immersiveBackgroundScalePercent: normalizePercent(settings.mvImmersiveBackgroundScalePercent, 115, 100, 220),
    immersiveBackgroundOffsetXPercent: normalizePercent(settings.mvImmersiveBackgroundOffsetXPercent, 50, 0, 100),
    immersiveBackgroundOffsetYPercent: normalizePercent(settings.mvImmersiveBackgroundOffsetYPercent, 50, 0, 100),
    immersiveBackgroundBlurPx: normalizePercent(settings.mvImmersiveBackgroundBlurPx, 0, 0, 32),
    immersiveBackgroundBrightnessPercent: normalizePercent(settings.mvImmersiveBackgroundBrightnessPercent, 100, 60, 140),
    immersiveBackgroundOverlayOpacityPercent: normalizePercent(settings.mvImmersiveBackgroundOverlayOpacityPercent, 0, 0, 100),
    lyricsReadabilityEnhanced: settings.mvLyricsReadabilityEnhanced === true,
    restartAudioOnLoad: settings.mvRestartAudioOnLoad === true,
    enabledProviders: settings.mvEnabledProviders,
    providerOrder: settings.mvProviderOrder,
    maxQuality: settings.mvMaxQuality,
    allow60fps: settings.mvAllow60fps,
  };
};

const sanitizeVariant = (variant: TrackVideoStreamRow): MvQualityVariant => ({
  id: variant.variant_id,
  label: variant.label,
  qualityTier: qualityTier(variant.quality_tier),
  width: variant.width,
  height: variant.height,
  fps: variant.fps,
  codec: variant.codec,
  container: variant.container,
  mimeType: variant.mime_type,
  protocol:
    variant.protocol === 'dash' || variant.protocol === 'hls' || variant.protocol === 'external' ? variant.protocol : 'direct',
  playableInApp: variant.playable_in_app === 1,
  requiresAccount: variant.requires_account === 1,
  expiresAt: variant.expires_at,
});

export class MvService {
  private readonly onlineProviderMap: Map<NetworkMvProviderId, MainMvOnlineProvider>;

  constructor(
    private readonly database: EchoDatabase,
    private readonly library: LibraryLookup,
    private readonly localProvider: LocalMvProvider = new LocalMvProvider(),
    private readonly shellOpener: ShellOpener = shell,
    onlineProviders: MainMvOnlineProvider[] = createOnlineMvProviders(),
  ) {
    this.onlineProviderMap = new Map(onlineProviders.map((provider) => [provider.id, provider]));
  }

  getSettings(): MvSettings {
    return appSettingsToMvSettings();
  }

  setSettings(patch: Partial<MvSettings>): MvSettings {
    const normalized = normalizeSettingsPatch(patch);
    const appSettingsPatch: Parameters<typeof setAppSettings>[0] = {};

    if (typeof normalized.enabled === 'boolean') {
      appSettingsPatch.mvEnabled = normalized.enabled;
    }
    if (normalized.enabledProviders) {
      appSettingsPatch.mvEnabledProviders = normalized.enabledProviders;
    }
    if (normalized.providerOrder) {
      appSettingsPatch.mvProviderOrder = normalized.providerOrder;
    }
    if (normalized.maxQuality) {
      appSettingsPatch.mvMaxQuality = normalized.maxQuality;
    }
    if (typeof normalized.allow60fps === 'boolean') {
      appSettingsPatch.mvAllow60fps = normalized.allow60fps;
    }
    if (typeof normalized.autoSearch === 'boolean') {
      appSettingsPatch.mvAutoSearch = normalized.autoSearch;
    }
    if (typeof normalized.autoPreload === 'boolean') {
      appSettingsPatch.mvAutoPreload = normalized.autoPreload;
    }
    if (typeof normalized.autoApplyThreshold === 'number') {
      appSettingsPatch.mvAutoApplyThreshold = normalized.autoApplyThreshold;
    }
    if (typeof normalized.immersiveBackground === 'boolean') {
      appSettingsPatch.mvImmersiveBackground = normalized.immersiveBackground;
    }
    if (typeof normalized.immersiveBackgroundScalePercent === 'number') {
      appSettingsPatch.mvImmersiveBackgroundScalePercent = normalized.immersiveBackgroundScalePercent;
    }
    if (typeof normalized.immersiveBackgroundOffsetXPercent === 'number') {
      appSettingsPatch.mvImmersiveBackgroundOffsetXPercent = normalized.immersiveBackgroundOffsetXPercent;
    }
    if (typeof normalized.immersiveBackgroundOffsetYPercent === 'number') {
      appSettingsPatch.mvImmersiveBackgroundOffsetYPercent = normalized.immersiveBackgroundOffsetYPercent;
    }
    if (typeof normalized.immersiveBackgroundBlurPx === 'number') {
      appSettingsPatch.mvImmersiveBackgroundBlurPx = normalized.immersiveBackgroundBlurPx;
    }
    if (typeof normalized.immersiveBackgroundBrightnessPercent === 'number') {
      appSettingsPatch.mvImmersiveBackgroundBrightnessPercent = normalized.immersiveBackgroundBrightnessPercent;
    }
    if (typeof normalized.immersiveBackgroundOverlayOpacityPercent === 'number') {
      appSettingsPatch.mvImmersiveBackgroundOverlayOpacityPercent = normalized.immersiveBackgroundOverlayOpacityPercent;
    }
    if (typeof normalized.lyricsReadabilityEnhanced === 'boolean') {
      appSettingsPatch.mvLyricsReadabilityEnhanced = normalized.lyricsReadabilityEnhanced;
    }
    if (typeof normalized.restartAudioOnLoad === 'boolean') {
      appSettingsPatch.mvRestartAudioOnLoad = normalized.restartAudioOnLoad;
    }

    setAppSettings(appSettingsPatch);
    return this.getSettings();
  }

  getSelectedVideo(trackId: string): TrackVideo | null {
    const row = this.database
      .prepare<[string], TrackVideoRow>(
        `SELECT * FROM track_videos
         WHERE track_id = ? AND selected = 1
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(trackId);

    return row ? this.mapRow(row) : null;
  }

  async getSelectedOrAutoApplyVideo(trackId: string): Promise<TrackVideo | null> {
    const selected = this.getSelectedVideo(trackId);
    const settings = this.getSettings();
    if (selected || settings.enabled === false || !settings.autoSearch) {
      return selected;
    }

    await this.searchNetworkCandidates(trackId);
    return this.getSelectedVideo(trackId);
  }

  findLocalMvCandidates(trackId: string): MvMatchCandidate[] {
    const track = this.getExistingTrack(trackId);
    if (track.mediaType === 'remote') {
      return [];
    }
    const candidates = this.localProvider.searchCandidates(track);

    return this.database.transaction(() => candidates.map((candidate) => this.upsertLocalCandidate(track, candidate)))();
  }

  async searchNetworkCandidates(trackId: string, query?: string): Promise<MvMatchCandidate[]> {
    const track = this.getExistingTrack(trackId);
    const settings = this.getSettings();
    if (settings.enabled === false) {
      return [];
    }

    const queryOverride = query?.trim() || undefined;
    const enabled = new Set(settings.enabledProviders);
    const orderedProviders = settings.providerOrder.filter((provider) => enabled.has(provider));
    const providerResults = await Promise.all(
      orderedProviders.map(async (providerId) => {
        const provider = this.onlineProviderMap.get(providerId);
        if (!provider) {
          return [];
        }

        try {
          return await provider.search(track, settings, queryOverride);
        } catch {
          return [];
        }
      }),
    );
    const candidates = providerResults
      .flat()
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return (right.viewCount ?? -1) - (left.viewCount ?? -1);
      });
    const normalizedCandidates =
      track.mediaType === 'remote'
        ? candidates.map((candidate) => ({
        ...candidate,
        filePath: null,
        reasons: [...(candidate.reasons ?? []), `remote:${track.sourceId ?? 'unknown'}:${track.stableKey ?? track.id}`],
      }))
        : candidates;
    const upsertedCandidates = this.database.transaction(() => normalizedCandidates.map((candidate) => this.upsertNetworkCandidate(track, candidate)))();
    const selectedCandidate = settings.autoSearch ? this.chooseAutoCandidate(upsertedCandidates, settings) : null;

    if (selectedCandidate) {
      this.selectVideo(trackId, selectedCandidate.id);
    }

    return upsertedCandidates;
  }

  getVideoCandidates(trackId: string): TrackVideo[] {
    return this.database
      .prepare<[string], TrackVideoRow>(
        `SELECT * FROM track_videos
         WHERE track_id = ?
         ORDER BY selected DESC, score DESC, updated_at DESC`,
      )
      .all(trackId)
      .map((row) => this.mapRow(row));
  }

  bindLocalVideo(trackId: string, filePath: string): TrackVideo {
    const track = this.getExistingTrack(trackId);
    const normalizedPath = resolve(filePath);

    if (!existsSync(normalizedPath)) {
      throw new Error(`MV file does not exist: ${normalizedPath}`);
    }

    if (!isSupportedVideoExtension(normalizedPath)) {
      throw new Error(`Unsupported MV video type: ${normalizedPath}`);
    }

    const timestamp = nowIso();
    const id = randomUUID();
    const sourceId = fileHashId(normalizedPath);
    const mimeType = mimeTypeForVideoPath(normalizedPath);

    return this.database.transaction(() => {
      this.database.prepare('UPDATE track_videos SET selected = 0, updated_at = ? WHERE track_id = ?').run(timestamp, trackId);
      this.database
        .prepare(
          `INSERT INTO track_videos (
            id, track_id, provider, source_type, source_id, title, artist, url, provider_url, thumbnail_url, file_path,
            mime_type, duration_seconds, width, height, selected_quality_id, quality_label, fps, raw_provider_json,
            score, selected, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          track.id,
          'local',
          'manual',
          sourceId,
          candidateTitle(normalizedPath),
          track.artist || track.albumArtist || null,
          null,
          null,
          null,
          normalizedPath,
          mimeType,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          1,
          1,
          timestamp,
          timestamp,
        );

      return this.mapRow(this.getRow(id)!);
    })();
  }

  bindUrl(trackId: string, url: string): TrackVideo {
    const track = this.getExistingTrack(trackId);
    const custom = customMvFromUrl(url);
    const existing = this.database
      .prepare<[string, string, string], TrackVideoRow>(
        `SELECT * FROM track_videos
         WHERE track_id = ? AND provider = ? AND source_id = ?
         LIMIT 1`,
      )
      .get(track.id, custom.provider, custom.sourceId);
    const timestamp = nowIso();
    const id = existing?.id ?? randomUUID();

    return this.database.transaction(() => {
      this.database.prepare('UPDATE track_videos SET selected = 0, updated_at = ? WHERE track_id = ?').run(timestamp, track.id);
      this.database
        .prepare(
          `INSERT INTO track_videos (
            id, track_id, provider, source_type, source_id, title, artist, url, provider_url, thumbnail_url, file_path,
            mime_type, duration_seconds, width, height, selected_quality_id, quality_label, fps, raw_provider_json,
            score, selected, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            url = excluded.url,
            provider_url = excluded.provider_url,
            source_type = excluded.source_type,
            selected_quality_id = COALESCE(track_videos.selected_quality_id, excluded.selected_quality_id),
            selected = excluded.selected,
            score = excluded.score,
            updated_at = excluded.updated_at`,
        )
        .run(
          id,
          track.id,
          custom.provider,
          'manual',
          custom.sourceId,
          custom.title,
          track.artist || track.albumArtist || null,
          custom.providerUrl,
          custom.providerUrl,
          null,
          null,
          null,
          null,
          null,
          null,
          existing?.selected_quality_id ?? 'auto',
          null,
          null,
          JSON.stringify({ reasons: ['Custom MV link'] }),
          1,
          1,
          existing?.created_at ?? timestamp,
          timestamp,
        );

      return this.mapRow(this.getRow(id)!);
    })();
  }

  selectVideo(trackId: string, videoId: string): TrackVideo {
    const row = this.getRow(videoId);
    if (!row || row.track_id !== trackId) {
      throw new Error(`Unknown MV candidate ${videoId}`);
    }

    const timestamp = nowIso();
    return this.database.transaction(() => {
      this.database.prepare('UPDATE track_videos SET selected = 0, updated_at = ? WHERE track_id = ?').run(timestamp, trackId);
      this.database.prepare('UPDATE track_videos SET selected = 1, updated_at = ? WHERE id = ?').run(timestamp, videoId);
      return this.mapRow(this.getRow(videoId)!);
    })();
  }

  clearSelectedVideo(trackId: string): void {
    this.database.prepare('UPDATE track_videos SET selected = 0, updated_at = ? WHERE track_id = ?').run(nowIso(), trackId);
  }

  async openVideoExternal(videoId: string): Promise<void> {
    const row = this.getRow(videoId);
    if (!row) {
      throw new Error(`Unknown MV video ${videoId}`);
    }

    if (row.provider === 'local' && row.file_path) {
      const result = await this.shellOpener.openPath(row.file_path);
      if (result) {
        throw new Error(result);
      }
      return;
    }

    const externalUrl = row.provider_url ?? row.url;
    if (externalUrl) {
      await this.shellOpener.openExternal(externalUrl);
      return;
    }

    throw new Error('MV video has no external target');
  }

  getVideoFileForProtocol(videoId: string): TrackVideoFile | null {
    const row = this.getRow(videoId);
    if (!row || row.provider !== 'local' || !row.file_path || !existsSync(row.file_path)) {
      return null;
    }

    return {
      id: row.id,
      provider: 'local',
      filePath: row.file_path,
      url: null,
      mimeType: row.mime_type ?? mimeTypeForVideoPath(row.file_path),
      playableInApp: isBrowserPlayableVideo(row.file_path),
    };
  }

  async resolveStreams(videoId: string): Promise<MvResolvedStreams> {
    const row = this.requireRow(videoId);
    if (row.provider === 'local') {
      return { video: this.mapRow(row), variants: [] };
    }

    const providerId = providerName(row.provider);
    if (providerId !== 'bilibili' && providerId !== 'youtube') {
      return { video: this.mapRow(row), variants: [] };
    }

    const settings = this.getSettings();
    let variants = this.getValidStreamRows(row.id);

    if (variants.length === 0) {
      const provider = this.onlineProviderMap.get(providerId);
      if (!provider) {
        throw new Error(`MV provider ${providerId} is unavailable`);
      }

      const resolvedVariants = await provider.resolve(this.mapRow(row), settings);
      this.cacheResolvedStreams(row, resolvedVariants);
      variants = this.getValidStreamRows(row.id);
    }

    this.applySelectedStreamSnapshot(row.id);
    return {
      video: this.mapRow(this.requireRow(row.id)),
      variants: this.getStreamRows(row.id).map(sanitizeVariant),
    };
  }

  async setQuality(videoId: string, qualityId: string): Promise<TrackVideo> {
    const row = this.requireRow(videoId);
    if (row.provider === 'local') {
      return this.mapRow(row);
    }

    if (qualityId !== 'auto' && !qualityId.trim()) {
      throw new Error('qualityId must be auto or a variant id');
    }

    await this.resolveStreams(videoId);
    const variants = this.getValidStreamRows(videoId);
    if (qualityId !== 'auto' && !variants.some((variant) => variant.variant_id === qualityId)) {
      throw new Error(`Unknown MV quality ${qualityId}`);
    }

    const timestamp = nowIso();
    this.database
      .prepare('UPDATE track_videos SET selected_quality_id = ?, updated_at = ? WHERE id = ?')
      .run(qualityId, timestamp, videoId);
    this.applySelectedStreamSnapshot(videoId);

    return this.mapRow(this.requireRow(videoId));
  }

  async getStreamVariantForProtocol(videoId: string, variantId: string): Promise<StreamVariantForProtocol | null> {
    const row = this.getRow(videoId);
    if (!row || row.provider === 'local') {
      return null;
    }

    let variant = this.getStreamRow(videoId, variantId);
    if (!variant || this.isExpired(variant)) {
      await this.resolveStreams(videoId);
      variant = this.getStreamRow(videoId, variantId);
    }

    if (!variant?.url || variant.playable_in_app !== 1 || variant.protocol === 'external') {
      return null;
    }

    return {
      videoId,
      variantId,
      url: variant.url,
      headers: parseHeaders(variant.headers_json),
      mimeType: variant.mime_type,
    };
  }

  private getExistingTrack(trackId: string): LibraryTrack {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new Error(`Unknown track ${trackId}`);
    }

    return track;
  }

  private upsertLocalCandidate(track: LibraryTrack, candidate: MvMatchCandidate): MvMatchCandidate {
    if (!candidate.filePath) {
      return { ...candidate, filePath: null };
    }

    const normalizedPath = resolve(candidate.filePath);
    const sourceId = fileHashId(normalizedPath);
    const existing = this.database
      .prepare<[string, string, string], TrackVideoRow>(
        `SELECT * FROM track_videos
         WHERE track_id = ? AND provider = ? AND source_id = ?
         LIMIT 1`,
      )
      .get(track.id, 'local', sourceId);
    const id = existing?.id ?? randomUUID();
    const timestamp = nowIso();

    this.database
      .prepare(
        `INSERT INTO track_videos (
          id, track_id, provider, source_type, source_id, title, artist, url, provider_url, thumbnail_url, file_path,
          mime_type, duration_seconds, width, height, selected_quality_id, quality_label, fps, raw_provider_json,
          score, selected, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          url = excluded.url,
          provider_url = excluded.provider_url,
          thumbnail_url = excluded.thumbnail_url,
          file_path = excluded.file_path,
          mime_type = excluded.mime_type,
          duration_seconds = excluded.duration_seconds,
          width = excluded.width,
          height = excluded.height,
          selected_quality_id = excluded.selected_quality_id,
          quality_label = excluded.quality_label,
          fps = excluded.fps,
          raw_provider_json = excluded.raw_provider_json,
          score = excluded.score,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        track.id,
        'local',
        candidate.sourceType,
        sourceId,
        candidate.title,
        candidate.artist,
        null,
        null,
        null,
        normalizedPath,
        mimeTypeForVideoPath(normalizedPath),
        candidate.durationSeconds,
        null,
        null,
        null,
        null,
        null,
        null,
        candidate.score,
        0,
        existing?.created_at ?? timestamp,
        timestamp,
      );

    return {
      ...candidate,
      id,
      filePath: null,
      playableInApp: isBrowserPlayableVideo(normalizedPath) && existsSync(normalizedPath),
    };
  }

  private upsertNetworkCandidate(track: LibraryTrack, candidate: MvMatchCandidate): MvMatchCandidate {
    const sourceId = sourceIdForCandidate(candidate);
    const existing = this.database
      .prepare<[string, string, string], TrackVideoRow>(
        `SELECT * FROM track_videos
         WHERE track_id = ? AND provider = ? AND source_id = ?
         LIMIT 1`,
      )
      .get(track.id, candidate.provider, sourceId);
    const id = existing?.id ?? randomUUID();
    const timestamp = nowIso();
    const providerUrl = candidate.providerUrl ?? candidate.url;

    this.database
      .prepare(
        `INSERT INTO track_videos (
          id, track_id, provider, source_type, source_id, title, artist, url, provider_url, thumbnail_url, file_path,
          mime_type, duration_seconds, width, height, selected_quality_id, quality_label, fps, raw_provider_json,
          score, selected, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          url = excluded.url,
          provider_url = excluded.provider_url,
          thumbnail_url = excluded.thumbnail_url,
          duration_seconds = excluded.duration_seconds,
          raw_provider_json = excluded.raw_provider_json,
          score = excluded.score,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        track.id,
        candidate.provider,
        'search_candidate',
        sourceId,
        candidate.title,
        candidate.artist,
        providerUrl,
        providerUrl,
        candidate.thumbnailUrl,
        null,
        null,
        candidate.durationSeconds,
        null,
        null,
        existing?.selected_quality_id ?? 'auto',
        null,
        null,
        JSON.stringify({
          uploader: candidate.uploader,
          reasons: candidate.reasons,
          viewCount: candidate.viewCount ?? null,
        }),
        candidate.score,
        existing?.selected ?? 0,
        existing?.created_at ?? timestamp,
        timestamp,
      );

    return {
      ...candidate,
      id,
      filePath: null,
      providerUrl,
      url: providerUrl,
    };
  }

  private cacheResolvedStreams(row: TrackVideoRow, variants: ResolvedMvStreamVariant[]): void {
    const timestamp = nowIso();
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM track_video_streams WHERE video_id = ?').run(row.id);

      for (const variant of variants) {
        this.database
          .prepare(
            `INSERT INTO track_video_streams (
              id, video_id, provider, variant_id, label, quality_tier, width, height, fps, codec, container,
              mime_type, protocol, url, headers_json, playable_in_app, requires_account, expires_at, raw_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            row.id,
            row.provider,
            variant.id,
            variant.label,
            variant.qualityTier,
            variant.width,
            variant.height,
            variant.fps,
            variant.codec,
            variant.container,
            variant.mimeType,
            variant.protocol,
            variant.url,
            JSON.stringify(variant.headers ?? {}),
            variant.playableInApp ? 1 : 0,
            variant.requiresAccount ? 1 : 0,
            variant.expiresAt,
            variant.rawProviderJson ? JSON.stringify(variant.rawProviderJson) : null,
            timestamp,
            timestamp,
          );
      }
    })();
  }

  private applySelectedStreamSnapshot(videoId: string): void {
    const row = this.requireRow(videoId);
    const variants = this.getValidStreamRows(videoId);
    const selected = this.chooseStreamVariant(row, variants);
    const timestamp = nowIso();

    this.database
      .prepare(
        `UPDATE track_videos
         SET width = ?, height = ?, fps = ?, mime_type = ?, quality_label = ?, selected_quality_id = COALESCE(selected_quality_id, 'auto'), updated_at = ?
         WHERE id = ?`,
      )
      .run(
        selected?.width ?? null,
        selected?.height ?? null,
        selected?.fps ?? null,
        selected?.mime_type ?? null,
        selected?.label ?? null,
        timestamp,
        videoId,
      );
  }

  private chooseStreamVariant(row: TrackVideoRow, variants: TrackVideoStreamRow[]): TrackVideoStreamRow | null {
    const selectedQualityId = row.selected_quality_id ?? 'auto';
    if (selectedQualityId !== 'auto') {
      return variants.find((variant) => variant.variant_id === selectedQualityId) ?? null;
    }

    const settings = this.getSettings();
    return (
      [...variants]
        .filter((variant) => variant.protocol !== 'external')
        .filter((variant) => variant.playable_in_app === 1)
        .filter((variant) => !variant.height || variant.height <= maxQualityHeight(settings.maxQuality))
        .sort((left, right) => {
          const heightDelta = (right.height ?? 0) - (left.height ?? 0);
          if (heightDelta !== 0) {
            return heightDelta;
          }
          return (right.fps ?? 0) - (left.fps ?? 0);
        })[0] ?? null
    );
  }

  private getRow(videoId: string): TrackVideoRow | null {
    return this.database.prepare<[string], TrackVideoRow>('SELECT * FROM track_videos WHERE id = ?').get(videoId) ?? null;
  }

  private requireRow(videoId: string): TrackVideoRow {
    const row = this.getRow(videoId);
    if (!row) {
      throw new Error(`Unknown MV video ${videoId}`);
    }

    return row;
  }

  private getStreamRows(videoId: string): TrackVideoStreamRow[] {
    return this.database
      .prepare<[string], TrackVideoStreamRow>(
        `SELECT * FROM track_video_streams
         WHERE video_id = ?
         ORDER BY playable_in_app DESC, height DESC, fps DESC, updated_at DESC`,
      )
      .all(videoId);
  }

  private getValidStreamRows(videoId: string): TrackVideoStreamRow[] {
    return this.getStreamRows(videoId).filter((variant) => !this.isExpired(variant));
  }

  private getStreamRow(videoId: string, variantId: string): TrackVideoStreamRow | null {
    return (
      this.database
        .prepare<[string, string], TrackVideoStreamRow>(
          `SELECT * FROM track_video_streams
           WHERE video_id = ? AND variant_id = ?
           LIMIT 1`,
        )
        .get(videoId, variantId) ?? null
    );
  }

  private isExpired(variant: TrackVideoStreamRow): boolean {
    return Boolean(variant.expires_at && Date.parse(variant.expires_at) <= Date.now());
  }

  private chooseAutoCandidate<T extends Pick<TrackVideo | MvMatchCandidate, 'id' | 'provider' | 'playableInApp' | 'score'> & { viewCount?: number | null }>(
    candidates: T[],
    settings: MvSettings,
  ): T | null {
    const enabledProviders = new Set(settings.enabledProviders);
    const providerRank = (provider: MvProviderId): number => {
      if (provider === 'local') {
        return -1;
      }

      const index = settings.providerOrder.indexOf(provider as NetworkMvProviderId);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    };

    return (
      [...candidates]
        .filter((candidate) => candidate.provider === 'local' || enabledProviders.has(candidate.provider as NetworkMvProviderId))
        .filter((candidate) => candidate.score >= normalizeAutoApplyThreshold(settings.autoApplyThreshold))
        .sort((left, right) => {
          const scoreDelta = right.score - left.score;
          if (scoreDelta !== 0) {
            return scoreDelta;
          }

          const viewDelta = (right.viewCount ?? -1) - (left.viewCount ?? -1);
          if (viewDelta !== 0) {
            return viewDelta;
          }

          const playableDelta = Number(right.playableInApp) - Number(left.playableInApp);
          if (playableDelta !== 0) {
            return playableDelta;
          }

          return providerRank(left.provider) - providerRank(right.provider);
        })[0] ?? null
    );
  }

  private mapRow(row: TrackVideoRow): TrackVideo {
    const fileExists = row.provider !== 'local' || !row.file_path || existsSync(row.file_path);
    const localPlayable = row.provider === 'local' && Boolean(row.file_path) && fileExists && isBrowserPlayableVideo(row.file_path ?? '');
    const selectedStream = row.provider === 'local' ? null : this.chooseStreamVariant(row, this.getValidStreamRows(row.id));
    const streamPlayable = Boolean(selectedStream?.url && selectedStream.playable_in_app === 1 && selectedStream.protocol !== 'external');
    const provider = providerName(row.provider);

    return {
      id: row.id,
      trackId: row.track_id,
      provider,
      sourceType: sourceType(row.source_type),
      sourceId: row.source_id,
      title: row.title,
      artist: row.artist,
      url: row.url,
      providerUrl: row.provider_url ?? row.url,
      thumbnailUrl: row.thumbnail_url,
      filePath: null,
      mediaUrl: localPlayable ? mediaUrlForLocal(row) : mediaUrlForStream(row, selectedStream),
      mimeType: selectedStream?.mime_type ?? row.mime_type,
      durationSeconds: row.duration_seconds,
      width: selectedStream?.width ?? row.width,
      height: selectedStream?.height ?? row.height,
      selectedQualityId: provider === 'local' ? null : (row.selected_quality_id ?? 'auto'),
      qualityLabel: selectedStream?.label ?? row.quality_label,
      fps: selectedStream?.fps ?? row.fps,
      score: Number(row.score ?? 0),
      selected: row.selected === 1,
      playableInApp: localPlayable || streamPlayable,
      rawProviderJson: parseJson(row.raw_provider_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

let defaultMvService: MvService | null = null;

export const getMvService = (): MvService => {
  if (!defaultMvService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;

    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultMvService = new MvService(
      createDatabase(join(electronApp.getPath('userData'), 'echo-library.sqlite')),
      {
        getTrack: (trackId) => getLibraryService().getTrack(trackId),
      },
    );
  }

  return defaultMvService;
};
