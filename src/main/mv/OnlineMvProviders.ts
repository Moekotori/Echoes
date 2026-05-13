import type { AccountCredentials } from '../../shared/types/accounts';
import type { LibraryTrack } from '../../shared/types/library';
import type {
  MvMatchCandidate,
  MvQualityTier,
  MvQualityVariant,
  MvSettings,
  NetworkMvProviderId,
  TrackVideo,
} from '../../shared/types/mv';
import { getAccountService } from '../accounts/AccountService';

export type ResolvedMvStreamVariant = MvQualityVariant & {
  url: string | null;
  headers: Record<string, string>;
  rawProviderJson: unknown | null;
};

export type MainMvOnlineProvider = {
  id: NetworkMvProviderId;
  search: (track: LibraryTrack, settings: MvSettings, queryOverride?: string) => Promise<MvMatchCandidate[]>;
  resolve: (video: TrackVideo, settings: MvSettings) => Promise<ResolvedMvStreamVariant[]>;
};

type FetchLike = typeof fetch;

type ProviderDependencies = {
  fetchImpl?: FetchLike;
  getCredentials?: (provider: NetworkMvProviderId) => AccountCredentials;
};

const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ECHO-Next/1.0 Safari/537.36';
const defaultExpiresMs = 45 * 60 * 1000;

const qualityHeight: Record<Exclude<MvQualityTier, 'auto'>, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

const maxQualityHeight = (quality: MvSettings['maxQuality']): number => (quality === 'max' ? Number.POSITIVE_INFINITY : qualityHeight[quality]);

const bilibiliQualityMap: Record<number, { tier: Exclude<MvQualityTier, 'auto'>; label: string }> = {
  64: { tier: '720p', label: '720p' },
  80: { tier: '1080p', label: '1080p' },
  112: { tier: '1080p', label: '1080p+' },
  116: { tier: '1080p', label: '1080p 60fps' },
  120: { tier: '2160p', label: '4K' },
  125: { tier: '2160p', label: 'HDR' },
  126: { tier: '2160p', label: 'Dolby Vision' },
  127: { tier: '2160p', label: '8K' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const metricNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const raw = text(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/,/g, '').replace(/\s+/g, '');
  const match = normalized.match(/^([\d.]+)(\u4e07|\u5104|\u4ebf|k|K|m|M)?$/);
  if (!match) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2];
  const multiplier = unit === '\u4e07' ? 10_000 : unit === '\u4ebf' || unit === '\u5104' ? 100_000_000 : unit === 'k' || unit === 'K' ? 1_000 : unit === 'm' || unit === 'M' ? 1_000_000 : 1;
  return Math.round(amount * multiplier);
};

const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\[\]【】「」『』()（）"'“”‘’]/g, ' ')
    .replace(/[_\-~|/\\:：·・.,，。!?！？]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const meaningfulTokens = (value: string): string[] =>
  normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !['mv', 'pv', 'official', 'music', 'video', 'full', 'ver', 'version'].includes(token));

const scoreSearchTitle = (query: string, title: string): number => {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedQuery || !normalizedTitle) {
    return 0.45;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return 0.96;
  }

  const tokens = meaningfulTokens(query);
  if (tokens.length === 0) {
    return 0.45;
  }

  const weightedTokens = tokens.map((token) => ({
    token,
    weight: token === 'cover' || token === 'remix' || token === 'live' ? 0.55 : 1,
  }));
  const totalWeight = weightedTokens.reduce((total, item) => total + item.weight, 0);
  const matchedWeight = weightedTokens.reduce((total, item) => total + (normalizedTitle.includes(item.token) ? item.weight : 0), 0);
  const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  return Number(Math.max(0.45, Math.min(0.94, 0.45 + coverage * 0.42)).toFixed(4));
};

const stripHtml = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) {
    return null;
  }

  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
};

const normalizeUrl = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) {
    return null;
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  return raw;
};

const makeQualityVariant = (
  id: string,
  label: string,
  qualityTier: MvQualityTier,
  overrides: Partial<MvQualityVariant> = {},
): MvQualityVariant => ({
  id,
  label,
  qualityTier,
  width: overrides.width ?? null,
  height: overrides.height ?? (qualityTier !== 'auto' ? qualityHeight[qualityTier] : null),
  fps: overrides.fps ?? null,
  codec: overrides.codec ?? null,
  container: overrides.container ?? null,
  mimeType: overrides.mimeType ?? null,
  protocol: overrides.protocol ?? 'direct',
  playableInApp: overrides.playableInApp ?? false,
  requiresAccount: overrides.requiresAccount ?? false,
  expiresAt: overrides.expiresAt ?? null,
});

const externalVariant = (
  provider: NetworkMvProviderId,
  providerUrl: string | null,
  label = 'External player',
): ResolvedMvStreamVariant => ({
  ...makeQualityVariant(`${provider}:external`, label, 'auto', {
    protocol: 'external',
    playableInApp: false,
  }),
  url: providerUrl,
  headers: {},
  rawProviderJson: null,
});

const qualityTierFromHeight = (height: number | null): MvQualityTier => {
  if (!height) {
    return 'auto';
  }

  if (height >= 2160) {
    return '2160p';
  }

  if (height >= 1440) {
    return '1440p';
  }

  if (height >= 1080) {
    return '1080p';
  }

  return '720p';
};

const withTimeout = async (fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': userAgent,
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`request_failed:${response.status}`);
    }

    const body = await response.text();
    return JSON.parse(body.trim().replace(/^[^(]*\((.*)\);?$/s, '$1')) as unknown;
  } finally {
    clearTimeout(timer);
  }
};

class ProviderBase {
  protected readonly fetchImpl: FetchLike;
  private readonly credentialsReader: (provider: NetworkMvProviderId) => AccountCredentials;

  constructor(dependencies: ProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.credentialsReader = dependencies.getCredentials ?? ((provider) => getAccountService().getCredentials(provider));
  }

  protected credentials(provider: NetworkMvProviderId): AccountCredentials {
    return this.credentialsReader(provider);
  }

  protected cookieHeaders(provider: NetworkMvProviderId): Record<string, string> {
    const cookie = this.credentials(provider).cookie;
    return cookie ? { Cookie: cookie } : {};
  }
}

export class BilibiliMvProvider extends ProviderBase implements MainMvOnlineProvider {
  readonly id = 'bilibili' as const;

  async search(track: LibraryTrack, _settings: MvSettings, queryOverride?: string): Promise<MvMatchCandidate[]> {
    const query = queryOverride?.trim() || [track.title, track.artist || track.albumArtist, 'MV'].filter(Boolean).join(' ');
    const url = new URL('https://api.bilibili.com/x/web-interface/search/type');
    url.searchParams.set('search_type', 'video');
    url.searchParams.set('keyword', query);
    url.searchParams.set('page', '1');
    url.searchParams.set('order', 'click');

    const payload = await withTimeout(this.fetchImpl, url.toString(), this.cookieHeaders(this.id));
    const data = isRecord(payload) ? payload.data : null;
    const results = isRecord(data) ? asArray(data.result) : [];

    return results
      .flatMap((item): (MvMatchCandidate & { viewCount: number | null })[] => {
      if (!isRecord(item)) {
        return [];
      }

      const bvid = text(item.bvid);
      const title = stripHtml(item.title);
      const viewCount = metricNumber(item.play);
      if (!bvid || !title) {
        return [];
      }
      const score = scoreSearchTitle(query, title);

      const providerUrl = `https://www.bilibili.com/video/${bvid}`;
      return [
        {
          id: `bilibili:${bvid}`,
          provider: this.id,
          sourceType: 'search_candidate',
          title,
          artist: track.artist || track.albumArtist || null,
          filePath: null,
          url: providerUrl,
          providerUrl,
          thumbnailUrl: normalizeUrl(item.pic),
          uploader: stripHtml(item.author) ?? null,
          viewCount,
          availableQualities: [],
          durationSeconds: null,
          score,
          playableInApp: true,
          reasons: ['Bilibili search', viewCount !== null ? `播放 ${viewCount}` : '播放量未知'],
        },
      ];
    })
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return (right.viewCount ?? -1) - (left.viewCount ?? -1);
      })
      .slice(0, 8)
      .map((candidate) => candidate);
  }

  async resolve(video: TrackVideo, settings: MvSettings): Promise<ResolvedMvStreamVariant[]> {
    const bvid = video.sourceId ?? (video.id.startsWith('bilibili:') ? video.id.slice('bilibili:'.length) : null);
    if (!bvid) {
      return [externalVariant(this.id, video.providerUrl ?? video.url, 'Bilibili')];
    }

    const headers = this.cookieHeaders(this.id);
    const viewPayload = await withTimeout(this.fetchImpl, `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, headers);
    const viewData = isRecord(viewPayload) ? viewPayload.data : null;
    const cid = number(isRecord(viewData) ? viewData.cid : null);
    if (!cid) {
      return [externalVariant(this.id, video.providerUrl ?? video.url, 'Bilibili')];
    }

    const qualities = [127, 120, 116, 112, 80, 64];
    const variants: ResolvedMvStreamVariant[] = [];
    const expiresAt = new Date(Date.now() + defaultExpiresMs).toISOString();

    for (const qn of qualities) {
      const quality = bilibiliQualityMap[qn];
      if (!quality) {
        continue;
      }

      if (qualityHeight[quality.tier] > maxQualityHeight(settings.maxQuality)) {
        continue;
      }

      const playUrl = new URL('https://api.bilibili.com/x/player/playurl');
      playUrl.searchParams.set('bvid', bvid);
      playUrl.searchParams.set('cid', String(cid));
      playUrl.searchParams.set('qn', String(qn));
      playUrl.searchParams.set('fnval', '0');
      playUrl.searchParams.set('fourk', '1');

      try {
        const playPayload = await withTimeout(this.fetchImpl, playUrl.toString(), headers);
        const playData = isRecord(playPayload) ? playPayload.data : null;
        const durl = asArray(isRecord(playData) ? playData.durl : null).find(isRecord);
        const streamUrl = normalizeUrl(durl?.url);

        if (!streamUrl || variants.some((variant) => variant.url === streamUrl)) {
          continue;
        }

        const variantFps = quality.label.includes('60fps') ? 60 : null;

        variants.push({
          ...makeQualityVariant(`bilibili-qn-${qn}`, quality.label, quality.tier, {
            fps: variantFps,
            container: 'mp4',
            mimeType: 'video/mp4',
            protocol: 'direct',
            playableInApp: true,
            requiresAccount: qn >= 112 && !this.credentials(this.id).cookie,
            expiresAt,
          }),
          url: streamUrl,
          headers: {
            Referer: video.providerUrl ?? `https://www.bilibili.com/video/${bvid}`,
            'User-Agent': userAgent,
          },
          rawProviderJson: {
            provider: this.id,
            qn,
            cid,
          },
        });
      } catch {
        // Lower qualities may still resolve even when a higher one is account gated.
      }
    }

    return variants.length > 0 ? variants : [externalVariant(this.id, video.providerUrl ?? video.url, 'Bilibili')];
  }
}

export class YouTubeMvProvider extends ProviderBase implements MainMvOnlineProvider {
  readonly id = 'youtube' as const;

  async search(track: LibraryTrack, _settings: MvSettings, queryOverride?: string): Promise<MvMatchCandidate[]> {
    const apiKey = process.env.ECHO_YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
    if (!apiKey) {
      return [];
    }

    const query = queryOverride?.trim() || [track.title, track.artist || track.albumArtist, 'MV'].filter(Boolean).join(' ');
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('maxResults', '8');
    url.searchParams.set('order', 'viewCount');
    url.searchParams.set('q', query);
    url.searchParams.set('key', apiKey);

    const payload = await withTimeout(this.fetchImpl, url.toString(), {});
    const items = asArray(isRecord(payload) ? payload.items : null);

    return items.slice(0, 8).flatMap((item, index): MvMatchCandidate[] => {
      if (!isRecord(item) || !isRecord(item.id) || !isRecord(item.snippet)) {
        return [];
      }

      const videoId = text(item.id.videoId);
      const title = text(item.snippet.title);
      if (!videoId || !title) {
        return [];
      }

      const thumbnails = isRecord(item.snippet.thumbnails) ? item.snippet.thumbnails : {};
      const thumbnail = isRecord(thumbnails.high) ? normalizeUrl(thumbnails.high.url) : null;
      const providerUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const score = scoreSearchTitle(query, title);

      return [
        {
          id: `youtube:${videoId}`,
          provider: this.id,
          sourceType: 'search_candidate',
          title,
          artist: track.artist || track.albumArtist || null,
          filePath: null,
          url: providerUrl,
          providerUrl,
          thumbnailUrl: thumbnail,
          uploader: text(item.snippet.channelTitle),
          availableQualities: [],
          durationSeconds: null,
          score,
          playableInApp: false,
          reasons: ['YouTube Data API'],
        },
      ];
    });
  }

  async resolve(video: TrackVideo): Promise<ResolvedMvStreamVariant[]> {
    return [externalVariant(this.id, video.providerUrl ?? video.url, 'YouTube')];
  }
}

export const createOnlineMvProviders = (dependencies: ProviderDependencies = {}): MainMvOnlineProvider[] => [
  new BilibiliMvProvider(dependencies),
  new YouTubeMvProvider(dependencies),
];
