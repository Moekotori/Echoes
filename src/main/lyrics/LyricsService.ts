import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import electron from 'electron';
import type { EchoDatabase } from '../database/createDatabase';
import { createDatabase } from '../database/createDatabase';
import { defaultSettings, getAppSettings } from '../app/appSettings';
import { getLibraryService } from '../library/LibraryService';
import type { LibraryTrack } from '../../shared/types/library';
import type { AppSettings } from '../../shared/types/appSettings';
import type { LyricsMatchRisk, LyricsProviderId, LyricsQuery, LyricsSearchCandidate, LyricsSource, TrackLyrics } from '../../shared/types/lyrics';
import { deserializeLyricLines, parseSyncedLyrics, serializeLyricLines } from './lyricsParser';
import { normalizeText, normalizeTextForIdentity } from './lyricsScoring';
import { LocalLyricsProvider } from './LocalLyricsProvider';
import { LrclibProvider, mapLrclibRecordToTrackLyrics, type LrclibRecord } from './LrclibProvider';
import { NeteaseLyricsProvider } from './NeteaseLyricsProvider';
import { QQMusicLyricsProvider } from './QQMusicLyricsProvider';
import { LyricsMatchEngine, type MatchedLyricsCandidate } from './LyricsMatchEngine';
import type { LyricsProvider, LyricsProviderResult } from './LyricsProvider';
import { providerResultToTrackLyrics, StubLyricsProvider } from './LyricsProvider';
import { extractLyricsVersionFlags, serializeLyricsVersionFlags } from './lyricsVersionFlags';
import { sortLyricsCandidates } from './lyricsCandidateDedup';
import { fillMissingRomanization, hasMissingRomanization } from './lyricsRomanization';

type LyricsSettings = Pick<
  AppSettings,
  | 'lyricsNetworkEnabled'
  | 'lyricsPreferredProvider'
  | 'lyricsEnabledProviders'
  | 'lyricsProviderOrder'
  | 'lyricsProviderTimeoutMs'
  | 'lyricsTotalMatchTimeoutMs'
  | 'lyricsAutoSearch'
  | 'lyricsDeepSearchEnabled'
  | 'lyricsAutoAcceptScore'
  | 'lyricsCoverAutoAcceptScore'
  | 'lyricsDefaultOffsetMs'
>;

type LibraryLookup = {
  getTrack: (trackId: string) => LibraryTrack | null;
};

type LocalProvider = Pick<LocalLyricsProvider, 'getLyrics' | 'searchCandidates' | 'getLyricsFromCandidate'> & Partial<LyricsProvider>;
type OnlineProvider = Pick<LrclibProvider, 'getLyrics' | 'searchCandidates'> & Partial<LyricsProvider>;

type LyricsCacheRow = {
  id: string;
  cache_key: string;
  track_id: string | null;
  provider: string;
  provider_lyrics_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  kind: string;
  plain_lyrics: string | null;
  synced_lyrics: string | null;
  lines_json: string;
  offset_ms: number;
  score: number | null;
  created_at: string;
  updated_at: string;
};

type LyricsCandidateRow = {
  id: string;
  track_id: string | null;
  provider: LyricsProviderId;
  provider_lyrics_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  instrumental: number;
  has_synced: number;
  has_plain: number;
  score: number;
  risk: LyricsMatchRisk | null;
  reasons_json: string | null;
  title_score: number | null;
  artist_score: number | null;
  album_score: number | null;
  duration_score: number | null;
  version_score: number | null;
  source_label: string;
  raw_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type StoredCandidate = LyricsSearchCandidate & {
  raw: unknown;
  status: string;
};

const nowIso = (): string => new Date().toISOString();
const clampOffset = (value: number): number => Math.max(-10000, Math.min(10000, Math.round(value)));

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const hashJson = (value: unknown): string => createHash('sha1').update(JSON.stringify(value ?? {})).digest('hex');

const providerName = (value: string): LyricsSource => {
  if (
    value === 'none' ||
    value === 'local' ||
    value === 'lrclib' ||
    value === 'netease' ||
    value === 'qqmusic' ||
    value === 'musixmatch' ||
    value === 'genius' ||
    value === 'manual' ||
    value === 'cached'
  ) {
    return value;
  }

  return 'cached';
};

const lyricsKind = (value: string): TrackLyrics['kind'] => {
  if (value === 'plain' || value === 'synced' || value === 'instrumental') {
    return value;
  }

  return 'empty';
};

const toQuery = (track: LibraryTrack): LyricsQuery => ({
  trackId: track.id,
  title: track.title || '',
  artist: track.artist || track.albumArtist || '',
  album: track.album || null,
  durationSeconds: track.duration > 0 ? track.duration : null,
  filePath: track.path,
});

const toManualSearchQuery = (track: LibraryTrack, searchText?: string | null): LyricsQuery => {
  const normalizedSearchText = textOrNull(searchText);
  if (!normalizedSearchText) {
    return toQuery(track);
  }

  return {
    trackId: track.id,
    title: normalizedSearchText,
    artist: '',
    album: null,
    durationSeconds: null,
    filePath: null,
  };
};

const toNetworkQuery = (query: LyricsQuery): LyricsQuery => ({
  trackId: query.trackId,
  title: query.title,
  artist: query.artist,
  album: query.album ?? null,
  durationSeconds: query.durationSeconds ?? null,
  filePath: null,
});

const cacheKeyFor = (query: LyricsQuery, provider: LyricsSource): string =>
  [
    provider,
    normalizeTextForIdentity(query.title),
    normalizeTextForIdentity(query.artist),
    normalizeTextForIdentity(query.album),
    query.durationSeconds ? String(Math.round(query.durationSeconds)) : '',
    serializeLyricsVersionFlags(extractLyricsVersionFlags(query.title, query.artist, query.album, query.filePath)),
  ].join('|');

const legacyCacheKeyFor = (query: LyricsQuery, provider: LyricsSource): string =>
  [
    provider,
    normalizeText(query.title),
    normalizeText(query.artist),
    normalizeText(query.album),
    query.durationSeconds ? String(Math.round(query.durationSeconds)) : '',
  ].join('|');

const allCacheKeysFor = (query: LyricsQuery): string[] =>
  ['local', 'lrclib', 'manual', 'cached', 'netease', 'qqmusic', 'musixmatch', 'genius'].flatMap((provider) => [
    cacheKeyFor(query, provider as LyricsSource),
    legacyCacheKeyFor(query, provider as LyricsSource),
  ]);

const parseRawJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
};

const trackLyricsToProviderResult = (lyrics: TrackLyrics): LyricsProviderResult => ({
  provider: lyrics.provider === 'cached' || lyrics.provider === 'none' ? 'manual' : lyrics.provider,
  providerLyricsId: lyrics.providerLyricsId ?? null,
  title: lyrics.title,
  artist: lyrics.artist,
  album: lyrics.album ?? null,
  durationSeconds: lyrics.durationSeconds ?? null,
  instrumental: lyrics.kind === 'instrumental',
  plainLyrics: lyrics.plainText ?? null,
  syncedLyrics: lyrics.syncedText ?? null,
  raw: lyrics,
});

const lrclibRecordToProviderResult = (record: LrclibRecord, fallback: LyricsQuery): LyricsProviderResult => ({
  provider: 'lrclib',
  providerLyricsId: record.id == null ? null : String(record.id),
  title: record.trackName ?? fallback.title,
  artist: record.artistName ?? fallback.artist,
  album: record.albumName ?? fallback.album ?? null,
  durationSeconds: record.duration ?? fallback.durationSeconds ?? null,
  instrumental: record.instrumental === true,
  plainLyrics: record.plainLyrics ?? null,
  syncedLyrics: record.syncedLyrics ?? null,
  raw: record,
});

const isLyricsProvider = (provider: Partial<LyricsProvider>): provider is LyricsProvider =>
  typeof provider.id === 'string' &&
  typeof provider.label === 'string' &&
  typeof provider.priority === 'number' &&
  typeof provider.search === 'function' &&
  Boolean(provider.capabilities);

const adaptLocalProvider = (provider: LocalProvider): LyricsProvider => {
  if (isLyricsProvider(provider)) {
    return provider;
  }

  return {
    id: 'local',
    label: 'Local',
    priority: 1000,
    capabilities: {
      synced: true,
      plain: true,
      translation: false,
      romanization: false,
      byDuration: false,
      byIsrc: false,
      byMusicBrainzId: false,
      needsAccount: false,
    },
    async search(request) {
      const lyrics = provider.getLyrics(request.query);
      return lyrics ? [trackLyricsToProviderResult(lyrics)] : [];
    },
  };
};

const adaptOnlineProvider = (provider: OnlineProvider): LyricsProvider => {
  if (isLyricsProvider(provider)) {
    return provider;
  }

  return {
    id: 'lrclib',
    label: 'LRCLIB',
    priority: 700,
    capabilities: {
      synced: true,
      plain: true,
      translation: false,
      romanization: false,
      byDuration: true,
      byIsrc: false,
      byMusicBrainzId: false,
      needsAccount: false,
    },
    async search(request) {
      const lyrics = await provider.getLyrics(request.query);
      if (lyrics) {
        return [trackLyricsToProviderResult(lyrics)];
      }

      const candidates = await provider.searchCandidates(request.query);
      return candidates
        .map((candidate) => {
          const raw = 'raw' in candidate ? candidate.raw : candidate;
          return raw && typeof raw === 'object' ? lrclibRecordToProviderResult(raw as LrclibRecord, request.query) : null;
        })
        .filter((result): result is LyricsProviderResult => Boolean(result));
    },
  };
};

const safeSettings = (readSettings: () => AppSettings): LyricsSettings => {
  try {
    const settings = readSettings();
    const enabledProviders = Array.isArray(settings.lyricsEnabledProviders) && settings.lyricsEnabledProviders.length
      ? settings.lyricsEnabledProviders
      : (defaultSettings.lyricsEnabledProviders ?? ['local', 'lrclib', 'netease', 'qqmusic']);
    const providerOrder = Array.isArray(settings.lyricsProviderOrder) && settings.lyricsProviderOrder.length
      ? settings.lyricsProviderOrder
      : enabledProviders;
    const orderedEnabledProviders = [
      ...providerOrder.filter((provider) => enabledProviders.includes(provider)),
      ...enabledProviders.filter((provider) => !providerOrder.includes(provider)),
    ];

    return {
      lyricsNetworkEnabled: settings.lyricsNetworkEnabled !== false,
      lyricsPreferredProvider: 'lrclib',
      lyricsEnabledProviders: orderedEnabledProviders,
      lyricsProviderOrder: providerOrder,
      lyricsProviderTimeoutMs: Number.isFinite(settings.lyricsProviderTimeoutMs)
        ? Math.max(1000, Math.min(10000, Math.round(Number(settings.lyricsProviderTimeoutMs))))
        : (defaultSettings.lyricsProviderTimeoutMs ?? 4500),
      lyricsTotalMatchTimeoutMs: Number.isFinite(settings.lyricsTotalMatchTimeoutMs)
        ? Math.max(1500, Math.min(15000, Math.round(Number(settings.lyricsTotalMatchTimeoutMs))))
        : (defaultSettings.lyricsTotalMatchTimeoutMs ?? 6000),
      lyricsAutoSearch: settings.lyricsAutoSearch !== false,
      lyricsDeepSearchEnabled: settings.lyricsDeepSearchEnabled !== false,
      lyricsAutoAcceptScore: Number.isFinite(settings.lyricsAutoAcceptScore)
        ? Math.max(0.5, Math.min(0.7, settings.lyricsAutoAcceptScore))
        : defaultSettings.lyricsAutoAcceptScore,
      lyricsCoverAutoAcceptScore: Number.isFinite(settings.lyricsCoverAutoAcceptScore)
        ? Math.max(0.5, Math.min(1, Number(settings.lyricsCoverAutoAcceptScore)))
        : (defaultSettings.lyricsCoverAutoAcceptScore ?? 0.97),
      lyricsDefaultOffsetMs: clampOffset(Number(settings.lyricsDefaultOffsetMs ?? 0)),
    };
  } catch {
    return {
      lyricsNetworkEnabled: defaultSettings.lyricsNetworkEnabled,
      lyricsPreferredProvider: defaultSettings.lyricsPreferredProvider,
      lyricsEnabledProviders: defaultSettings.lyricsEnabledProviders ?? ['local', 'lrclib', 'netease', 'qqmusic'],
      lyricsProviderOrder: defaultSettings.lyricsProviderOrder,
      lyricsProviderTimeoutMs: defaultSettings.lyricsProviderTimeoutMs ?? 4500,
      lyricsTotalMatchTimeoutMs: defaultSettings.lyricsTotalMatchTimeoutMs ?? 6000,
      lyricsAutoSearch: defaultSettings.lyricsAutoSearch,
      lyricsDeepSearchEnabled: defaultSettings.lyricsDeepSearchEnabled,
      lyricsAutoAcceptScore: defaultSettings.lyricsAutoAcceptScore,
      lyricsCoverAutoAcceptScore: defaultSettings.lyricsCoverAutoAcceptScore ?? 0.97,
      lyricsDefaultOffsetMs: defaultSettings.lyricsDefaultOffsetMs,
    };
  }
};

export class LyricsService {
  private readonly matchEngine: LyricsMatchEngine;

  constructor(
    private readonly database: EchoDatabase,
    private readonly library: LibraryLookup,
    private readonly localProvider: LocalProvider = new LocalLyricsProvider(),
    private readonly onlineProvider: OnlineProvider = new LrclibProvider(),
    private readonly readAppSettings: () => AppSettings = getAppSettings,
  ) {
    this.matchEngine = new LyricsMatchEngine([
      adaptLocalProvider(this.localProvider),
      adaptOnlineProvider(this.onlineProvider),
      new NeteaseLyricsProvider(),
      new QQMusicLyricsProvider(),
      new StubLyricsProvider('musixmatch', 'Musixmatch', 500),
      new StubLyricsProvider('genius', 'Genius', 450),
    ] satisfies LyricsProvider[]);
  }

  async getLyricsForTrack(trackId: string): Promise<TrackLyrics | null> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return null;
    }

    const query = toQuery(track);
    const cached = this.findCachedLyrics(query);
    if (cached) {
      return this.fillCachedRomanization(query, cached);
    }

    const settings = safeSettings(this.readAppSettings);

    try {
      const result = await this.matchEngine.match(query, {
        enabledProviders: settings.lyricsEnabledProviders,
        networkEnabled: settings.lyricsNetworkEnabled && settings.lyricsAutoSearch,
        providerTimeoutMs: settings.lyricsProviderTimeoutMs,
        totalMatchTimeoutMs: settings.lyricsTotalMatchTimeoutMs,
        autoAcceptScore: settings.lyricsAutoAcceptScore,
        coverAutoAcceptScore: settings.lyricsCoverAutoAcceptScore,
        deepSearchEnabled: settings.lyricsDeepSearchEnabled,
        isRejected: (provider, providerLyricsId) => this.hasRejectedProviderLyrics(trackId, provider, providerLyricsId),
      });

      if (result.accepted) {
        const lyrics = providerResultToTrackLyrics(query, result.accepted.providerResult, result.accepted.score);
        if (lyrics) {
          return this.writeLyricsCache(query, await this.fillLyricsRomanization(lyrics));
        }
      }

      for (const candidate of result.candidates) {
        this.upsertCandidate(trackId, candidate, this.matchedCandidateToRaw(candidate));
      }
    } catch {
      return null;
    }

    return null;
  }

  async searchLyricsCandidates(trackId: string, searchText?: string | null): Promise<LyricsSearchCandidate[]> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return [];
    }

    const settings = safeSettings(this.readAppSettings);
    const query = toManualSearchQuery(track, searchText);
    const storedCandidates: StoredCandidate[] = [];

    try {
      const result = await this.matchEngine.match(query, {
        enabledProviders: settings.lyricsEnabledProviders,
        networkEnabled: settings.lyricsNetworkEnabled,
        providerTimeoutMs: settings.lyricsProviderTimeoutMs,
        totalMatchTimeoutMs: settings.lyricsTotalMatchTimeoutMs,
        autoAcceptScore: settings.lyricsAutoAcceptScore,
        coverAutoAcceptScore: settings.lyricsCoverAutoAcceptScore,
        deepSearchEnabled: settings.lyricsDeepSearchEnabled,
        isRejected: (provider, providerLyricsId) => this.hasRejectedProviderLyrics(trackId, provider, providerLyricsId),
      });

      for (const candidate of result.candidates) {
        const stored = this.upsertCandidate(trackId, candidate, this.matchedCandidateToRaw(candidate));
        if (stored.status !== 'rejected') {
          storedCandidates.push(stored);
        }
      }
    } catch {
      // Candidate search is best-effort; failures should not affect playback.
    }

    return sortLyricsCandidates(
      query.durationSeconds,
      storedCandidates.map((candidate) => ({
        id: candidate.id,
        provider: candidate.provider,
        providerLyricsId: candidate.providerLyricsId,
        title: candidate.title,
        artist: candidate.artist,
        album: candidate.album,
        durationSeconds: candidate.durationSeconds,
        instrumental: candidate.instrumental,
        hasSynced: candidate.hasSynced,
        hasPlain: candidate.hasPlain,
        score: candidate.score,
        sourceLabel: candidate.sourceLabel,
        risk: candidate.risk,
        reasons: candidate.reasons,
        titleScore: candidate.titleScore,
        artistScore: candidate.artistScore,
        albumScore: candidate.albumScore,
        durationScore: candidate.durationScore,
        versionScore: candidate.versionScore,
      })),
    );
  }

  async applyLyricsCandidate(trackId: string, candidateId: string): Promise<TrackLyrics> {
    const track = this.library.getTrack(trackId);
    const row = this.getCandidateRow(candidateId);

    if (!track || !row || row.track_id !== trackId) {
      throw new Error(`Unknown lyrics candidate ${candidateId}`);
    }

    const query = toQuery(track);
    const raw = parseRawJson(row.raw_json);
    let lyrics: TrackLyrics | null = null;
    const rawRecord = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const providerResult = this.readProviderResult(rawRecord);

    if (providerResult) {
      lyrics = providerResultToTrackLyrics(query, providerResult, row.score);
    } else if (row.provider === 'local') {
      const filePath = textOrNull(rawRecord.filePath);
      const extension = rawRecord.extension === '.txt' ? '.txt' : '.lrc';
      if (filePath) {
        lyrics = this.localProvider.getLyricsFromCandidate(query, {
          ...this.mapCandidateRow(row),
          filePath,
          extension,
        });
      }
    } else if (row.provider === 'lrclib') {
      lyrics = mapLrclibRecordToTrackLyrics(toNetworkQuery(query), raw as LrclibRecord, row.score);
    }

    if (!lyrics) {
      throw new Error('Lyrics candidate is no longer available');
    }

    const cached = this.writeLyricsCache(query, await this.fillLyricsRomanization(lyrics));
    this.database
      .prepare('UPDATE lyrics_candidates SET status = ?, updated_at = ? WHERE id = ?')
      .run('accepted', nowIso(), candidateId);
    return cached;
  }

  async rejectLyricsCandidate(candidateId: string): Promise<void> {
    this.database
      .prepare('UPDATE lyrics_candidates SET status = ?, updated_at = ? WHERE id = ?')
      .run('rejected', nowIso(), candidateId);
  }

  async setLyricsOffset(trackId: string, offsetMs: number): Promise<TrackLyrics | null> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return null;
    }

    const clampedOffset = clampOffset(offsetMs);
    const timestamp = nowIso();
    const result = this.database
      .prepare('UPDATE lyrics_cache SET offset_ms = ?, updated_at = ? WHERE track_id = ?')
      .run(clampedOffset, timestamp, trackId);

    if (result.changes === 0) {
      return null;
    }

    return this.findCachedLyrics(toQuery(track));
  }

  async clearLyricsCache(trackId: string): Promise<void> {
    this.database.prepare('DELETE FROM lyrics_cache WHERE track_id = ?').run(trackId);
  }

  private findCachedLyrics(query: LyricsQuery): TrackLyrics | null {
    if (query.trackId) {
      const row = this.database
        .prepare<[string], LyricsCacheRow>(
          `SELECT * FROM lyrics_cache
           WHERE track_id = ?
           ORDER BY CASE provider
             WHEN 'manual' THEN 0
             WHEN 'local' THEN 1
             WHEN 'lrclib' THEN 2
             ELSE 3
           END, updated_at DESC
           LIMIT 1`,
        )
        .get(query.trackId);

      if (row) {
        return this.mapCacheRow(row);
      }
    }

    const keys = allCacheKeysFor(query);
    const placeholders = keys.map(() => '?').join(', ');
    const row = this.database
      .prepare<unknown[], LyricsCacheRow>(
        `SELECT * FROM lyrics_cache
         WHERE cache_key IN (${placeholders})
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(...keys);

    return row ? this.mapCacheRow(row) : null;
  }

  private writeLyricsCache(query: LyricsQuery, lyrics: TrackLyrics): TrackLyrics {
    const previous = query.trackId
      ? this.database
          .prepare<[string, string], { offset_ms: number }>('SELECT offset_ms FROM lyrics_cache WHERE track_id = ? AND provider = ? LIMIT 1')
          .get(query.trackId, lyrics.provider)
      : null;
    const settings = safeSettings(this.readAppSettings);
    const offsetMs = previous ? Number(previous.offset_ms) : lyrics.offsetMs === 0 ? settings.lyricsDefaultOffsetMs : lyrics.offsetMs;
    const timestamp = nowIso();
    const cacheKey = cacheKeyFor(query, lyrics.provider);
    const id = lyrics.id || randomUUID();

    this.database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms,
          score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          track_id = excluded.track_id,
          provider = excluded.provider,
          provider_lyrics_id = excluded.provider_lyrics_id,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          duration_seconds = excluded.duration_seconds,
          kind = excluded.kind,
          plain_lyrics = excluded.plain_lyrics,
          synced_lyrics = excluded.synced_lyrics,
          lines_json = excluded.lines_json,
          offset_ms = excluded.offset_ms,
          score = excluded.score,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        cacheKey,
        query.trackId ?? lyrics.trackId,
        lyrics.provider,
        lyrics.providerLyricsId ?? null,
        lyrics.title,
        lyrics.artist,
        lyrics.album ?? null,
        lyrics.durationSeconds ?? null,
        lyrics.kind,
        lyrics.plainText ?? null,
        lyrics.syncedText ?? null,
        serializeLyricLines(lyrics.lines),
        clampOffset(offsetMs),
        lyrics.score ?? null,
        lyrics.cachedAt || timestamp,
        timestamp,
      );

    const row = this.database.prepare<[string], LyricsCacheRow>('SELECT * FROM lyrics_cache WHERE cache_key = ?').get(cacheKey);
    return this.mapCacheRow(row!);
  }

  private upsertCandidate(trackId: string, candidate: LyricsSearchCandidate, raw: unknown): StoredCandidate {
    const providerLyricsId = candidate.providerLyricsId ?? `${candidate.provider}:${hashJson(raw)}`;
    const existing = this.database
      .prepare<[string, string, string], { id: string; status: string }>(
        `SELECT id, status FROM lyrics_candidates
         WHERE track_id = ? AND provider = ? AND provider_lyrics_id = ?
         LIMIT 1`,
      )
      .get(trackId, candidate.provider, providerLyricsId);
    const id = existing?.id ?? randomUUID();
    const timestamp = nowIso();
    const status = existing?.status === 'rejected' ? 'rejected' : existing?.status ?? 'pending';

    this.database
      .prepare(
        `INSERT INTO lyrics_candidates (
          id, track_id, provider, provider_lyrics_id, title, artist, album, duration_seconds,
          instrumental, has_synced, has_plain, score, risk, reasons_json, title_score,
          artist_score, album_score, duration_score, version_score, source_label, raw_json,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          duration_seconds = excluded.duration_seconds,
          instrumental = excluded.instrumental,
          has_synced = excluded.has_synced,
          has_plain = excluded.has_plain,
          score = excluded.score,
          risk = excluded.risk,
          reasons_json = excluded.reasons_json,
          title_score = excluded.title_score,
          artist_score = excluded.artist_score,
          album_score = excluded.album_score,
          duration_score = excluded.duration_score,
          version_score = excluded.version_score,
          source_label = excluded.source_label,
          raw_json = excluded.raw_json,
          status = CASE lyrics_candidates.status WHEN 'rejected' THEN lyrics_candidates.status ELSE excluded.status END,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        trackId,
        candidate.provider,
        providerLyricsId,
        candidate.title,
        candidate.artist,
        candidate.album ?? null,
        candidate.durationSeconds ?? null,
        candidate.instrumental ? 1 : 0,
        candidate.hasSynced ? 1 : 0,
        candidate.hasPlain ? 1 : 0,
        candidate.score,
        candidate.risk ?? null,
        JSON.stringify(candidate.reasons ?? []),
        candidate.titleScore ?? null,
        candidate.artistScore ?? null,
        candidate.albumScore ?? null,
        candidate.durationScore ?? null,
        candidate.versionScore ?? null,
        candidate.sourceLabel,
        JSON.stringify(raw ?? {}),
        status,
        timestamp,
        timestamp,
      );

    const row = this.getCandidateRow(id)!;
    return {
      ...this.mapCandidateRow(row),
      raw: parseRawJson(row.raw_json),
      status: row.status,
    };
  }

  private hasRejectedProviderLyrics(trackId: string, provider: LyricsProviderId, providerLyricsId?: string | null): boolean {
    if (!providerLyricsId) {
      return false;
    }

    const row = this.database
      .prepare<[string, string, string], { id: string }>(
        `SELECT id FROM lyrics_candidates
         WHERE track_id = ? AND provider = ? AND provider_lyrics_id = ? AND status = 'rejected'
         LIMIT 1`,
      )
      .get(trackId, provider, providerLyricsId);

    return Boolean(row);
  }

  private matchedCandidateToRaw(candidate: MatchedLyricsCandidate): unknown {
    return {
      providerResult: candidate.providerResult,
      decision: candidate.decision,
      raw: candidate.raw ?? {},
    };
  }

  private readProviderResult(rawRecord: Record<string, unknown>): LyricsProviderResult | null {
    const value = rawRecord.providerResult;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const provider = record.provider;
    if (
      provider !== 'local' &&
      provider !== 'lrclib' &&
      provider !== 'netease' &&
      provider !== 'qqmusic' &&
      provider !== 'musixmatch' &&
      provider !== 'genius' &&
      provider !== 'manual'
    ) {
      return null;
    }

    return {
      provider,
      providerLyricsId: textOrNull(record.providerLyricsId),
      title: textOrNull(record.title) ?? '',
      artist: textOrNull(record.artist) ?? '',
      album: textOrNull(record.album),
      durationSeconds: numberOrNull(record.durationSeconds),
      instrumental: record.instrumental === true,
      plainLyrics: textOrNull(record.plainLyrics),
      syncedLyrics: textOrNull(record.syncedLyrics),
      translationLyrics: textOrNull(record.translationLyrics),
      romanizationLyrics: textOrNull(record.romanizationLyrics),
      sourceUrl: textOrNull(record.sourceUrl),
      raw: record.raw,
    };
  }

  private getCandidateRow(candidateId: string): LyricsCandidateRow | null {
    return this.database.prepare<[string], LyricsCandidateRow>('SELECT * FROM lyrics_candidates WHERE id = ?').get(candidateId) ?? null;
  }

  private mapCandidateRow(row: LyricsCandidateRow): LyricsSearchCandidate {
    return {
      id: row.id,
      provider: row.provider,
      providerLyricsId: row.provider_lyrics_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationSeconds: numberOrNull(row.duration_seconds),
      instrumental: row.instrumental === 1,
      hasSynced: row.has_synced === 1,
      hasPlain: row.has_plain === 1,
      score: Number(row.score ?? 0),
      sourceLabel: row.source_label,
      risk: row.risk ?? undefined,
      reasons: this.parseReasons(row.reasons_json),
      titleScore: numberOrNull(row.title_score) ?? undefined,
      artistScore: numberOrNull(row.artist_score) ?? undefined,
      albumScore: numberOrNull(row.album_score) ?? undefined,
      durationScore: numberOrNull(row.duration_score) ?? undefined,
      versionScore: numberOrNull(row.version_score) ?? undefined,
    };
  }

  private parseReasons(value: string | null): string[] | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : undefined;
    } catch {
      return undefined;
    }
  }

  private mapCacheRow(row: LyricsCacheRow): TrackLyrics {
    const provider = providerName(row.provider);
    const kind = lyricsKind(row.kind);
    const lines =
      provider === 'local' && kind === 'synced' && row.synced_lyrics
        ? parseSyncedLyrics(row.synced_lyrics)
        : deserializeLyricLines(row.lines_json);

    return {
      id: row.id,
      trackId: row.track_id,
      provider,
      providerLyricsId: row.provider_lyrics_id,
      kind,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationSeconds: numberOrNull(row.duration_seconds),
      lines,
      plainText: row.plain_lyrics,
      syncedText: row.synced_lyrics,
      offsetMs: Number(row.offset_ms ?? 0),
      score: typeof row.score === 'number' ? row.score : null,
      cachedAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async fillLyricsRomanization(lyrics: TrackLyrics): Promise<TrackLyrics> {
    if (lyrics.lines.length === 0 || !hasMissingRomanization(lyrics.lines)) {
      return lyrics;
    }

    const lines = await fillMissingRomanization(lyrics.lines);
    return lines === lyrics.lines ? lyrics : { ...lyrics, lines };
  }

  private async fillCachedRomanization(query: LyricsQuery, lyrics: TrackLyrics): Promise<TrackLyrics> {
    const enriched = await this.fillLyricsRomanization(lyrics);
    if (enriched === lyrics) {
      return lyrics;
    }

    return this.writeLyricsCache(query, enriched);
  }
}

let defaultLyricsService: LyricsService | null = null;

export const getLyricsService = (): LyricsService => {
  if (!defaultLyricsService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;

    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultLyricsService = new LyricsService(
      createDatabase(join(electronApp.getPath('userData'), 'echo-library.sqlite')),
      {
        getTrack: (trackId) => getLibraryService().getTrack(trackId),
      },
    );
  }

  return defaultLyricsService;
};
