import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../database/createDatabase';
import type { AppSettings } from '../../shared/types/appSettings';
import type { LibraryTrack } from '../../shared/types/library';
import type { LyricsSearchCandidate, TrackLyrics } from '../../shared/types/lyrics';
import { defaultChannelBalanceSettings } from '../app/appSettings';
import { LyricsService } from './LyricsService';
import type { LyricsProvider, LyricsProviderResult } from './LyricsProvider';
import { LocalLyricsProvider } from './LocalLyricsProvider';

const tagWriterMock = vi.hoisted(() => ({
  writeEmbeddedLyricsTag: vi.fn(async () => undefined),
}));

const audioSessionMock = vi.hoisted(() => {
  const state = {
    status: {
      state: 'idle',
      currentFilePath: null as string | null,
    },
  };

  return {
    state,
    getStatus: vi.fn(() => state.status),
  };
});

vi.mock('../library/TagWriter', () => ({
  writeEmbeddedLyricsTag: tagWriterMock.writeEmbeddedLyricsTag,
}));

vi.mock('../audio/AudioSession', () => ({
  getAudioSession: () => ({
    getStatus: audioSessionMock.getStatus,
  }),
}));

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-lyrics-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  vi.useRealTimers();
  tagWriterMock.writeEmbeddedLyricsTag.mockReset();
  tagWriterMock.writeEmbeddedLyricsTag.mockResolvedValue(undefined);
  audioSessionMock.state.status = {
    state: 'idle',
    currentFilePath: null,
  };
  audioSessionMock.getStatus.mockClear();

  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  appearanceTheme: 'light',
  albumMergeStrategy: 'standard',
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
  networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.7,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsContextOpacityPercent: 49,
  lyricsColor: '#314054',
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvMaxQuality: '1080p',
  mvAllow60fps: true,
  channelBalance: defaultChannelBalanceSettings,
  playerVolume: 1,
  playbackSpeed: 1,
  playbackSpeedMode: 'nightcore',
  scanPerformanceMode: 'balanced',
  duplicateTracksEnabled: false,
  duplicateTracksMode: 'strict',
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
  ...patch,
  smtcLyricsEnabled: patch.smtcLyricsEnabled ?? false,
  taskbarPlaybackControlsEnabled: patch.taskbarPlaybackControlsEnabled ?? false,
});

const track = (path = 'D:\\Music\\Echo Song.flac'): LibraryTrack => ({
  id: 'track-1',
  path,
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  albumArtist: 'Echo Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 120,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
});

const trackLyrics = (overrides: Partial<TrackLyrics> = {}): TrackLyrics => ({
  id: 'lyrics-1',
  trackId: 'track-1',
  provider: 'lrclib',
  providerLyricsId: 'lrclib-1',
  kind: 'synced',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
  lines: [{ timeMs: 1000, text: 'Line' }],
  plainText: 'Line',
  syncedText: '[00:01.00]Line',
  offsetMs: 0,
  score: 0.99,
  cachedAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  ...overrides,
});

const candidate = (overrides: Partial<LyricsSearchCandidate> = {}): LyricsSearchCandidate => ({
  id: 'candidate-1',
  provider: 'lrclib',
  providerLyricsId: 'lrclib-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 0.99,
  sourceLabel: 'LRCLIB',
  ...overrides,
});

const createHarness = ({
  currentTrack = track(),
  localProvider,
  onlineProvider,
  appSettings,
  utatenKanaProvider,
}: {
  currentTrack?: LibraryTrack;
  localProvider?: ConstructorParameters<typeof LyricsService>[2];
  onlineProvider?: ConstructorParameters<typeof LyricsService>[3];
  appSettings?: AppSettings;
  utatenKanaProvider?: ConstructorParameters<typeof LyricsService>[6];
} = {}) => {
  const database = createDatabase(':memory:');
  const library = { getTrack: vi.fn(() => currentTrack) };
  const local = localProvider ?? {
    getLyrics: vi.fn(() => null),
    searchCandidates: vi.fn(() => []),
    getLyricsFromCandidate: vi.fn(() => null),
  };
  const online = onlineProvider ?? {
    getLyrics: vi.fn(async () => null),
    searchCandidates: vi.fn(async () => []),
  };
  const service = new LyricsService(database, library, local, online, () => appSettings ?? settings(), undefined, utatenKanaProvider);

  return { database, library, local, online, service };
};

describe('LyricsService', () => {
  it('returns cached lyrics without requesting providers', async () => {
    const { database, local, online, service } = createHarness({
      appSettings: settings({ lyricsRomanizationEnabled: false, lyricsTranslationEnabled: false }),
    });
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-1',
        'lrclib|echo song|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        'Line',
        '[00:01.00]Line',
        JSON.stringify([{ timeMs: 1000, text: 'Cached' }]),
        0,
        0.99,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0].text).toBe('Cached');
    expect(local.getLyrics).not.toHaveBeenCalled();
    expect(online.getLyrics).not.toHaveBeenCalled();
  });

  it('does not request UtaTen kana while the setting is disabled', async () => {
    const utatenKanaProvider = { enrichLines: vi.fn(async (_query, lines) => lines) };
    const { database, service } = createHarness({ utatenKanaProvider });
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-kana-off',
        'lrclib|echo song|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        '君が好き',
        '[00:01.00]君が好き',
        JSON.stringify([{ timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' }]),
        0,
        0.99,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0].romanization).toBe('kimi ga suki');
    expect(utatenKanaProvider.enrichLines).not.toHaveBeenCalled();
  });

  it('enriches cached Japanese lyrics with UtaTen kana and stores the result', async () => {
    const utatenKanaProvider = {
      enrichLines: vi.fn(async (_query, lines: TrackLyrics['lines']) =>
        lines.map((line) => (line.text === '君が好き' ? { ...line, kana: 'きみがすき' } : line)),
      ),
    };
    const { database, service } = createHarness({
      appSettings: settings({ lyricsUtatenKanaEnabled: true }),
      utatenKanaProvider,
    });
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-kana-on',
        'lrclib|echo song|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        '君が好き',
        '[00:01.00]君が好き',
        JSON.stringify([{ timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' }]),
        0,
        0.99,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');
    const cached = database
      .prepare<[string], { lines_json: string }>('SELECT lines_json FROM lyrics_cache WHERE id = ? LIMIT 1')
      .get('cached-kana-on');

    expect(utatenKanaProvider.enrichLines).toHaveBeenCalledOnce();
    expect(lyrics?.lines[0]).toMatchObject({ text: '君が好き', romanization: 'kimi ga suki', kana: 'きみがすき' });
    expect(JSON.parse(cached?.lines_json ?? '[]')[0].kana).toBe('きみがすき');
  });

  it('keeps cached romanization when UtaTen kana cannot be aligned', async () => {
    const utatenKanaProvider = { enrichLines: vi.fn(async (_query, lines) => lines) };
    const { database, service } = createHarness({
      appSettings: settings({ lyricsUtatenKanaEnabled: true }),
      utatenKanaProvider,
    });
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-kana-miss',
        'lrclib|echo song|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        '君が好き',
        '[00:01.00]君が好き',
        JSON.stringify([{ timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' }]),
        0,
        0.99,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(utatenKanaProvider.enrichLines).toHaveBeenCalledOnce();
    expect(lyrics?.lines[0]).toEqual({ timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' });
  });

  it('re-parses cached local synced lyrics from source text', async () => {
    const { database, service } = createHarness();
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-local-1',
        'local|echo song|echo artist|echo album|120',
        'track-1',
        'local',
        'local-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        null,
        '[00:01.00]First phrase [00:02.00]second phrase',
        JSON.stringify([{ timeMs: 1000, text: 'First phrase second phrase' }]),
        0,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines).toEqual([
      { timeMs: 1000, text: 'First phrase' },
      { timeMs: 2000, text: 'second phrase' },
    ]);
  });

  it('keeps cached local line romanization and translation', async () => {
    const { database, service } = createHarness();
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-local-secondary-1',
        'local|echo song|echo artist|echo album|120',
        'track-1',
        'local',
        'local-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        null,
        '[00:01.00]Original',
        JSON.stringify([{ timeMs: 1000, text: 'Original', romanization: 'orijinaru', translation: '原文' }]),
        0,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines).toEqual([
      { timeMs: 1000, text: 'Original', romanization: 'orijinaru', translation: '原文' },
    ]);
  });

  it('restores cached word timings from synced source text without replacing secondary fields', async () => {
    const { database, service } = createHarness();
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-word-restore-1',
        'lrclib|echo song|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-word-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        null,
        '[00:01.00]<00:01.00>Hello <00:01.50>world',
        JSON.stringify([{ timeMs: 1000, text: 'Hello world', romanization: 'hello world' }]),
        0,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines).toEqual([
      {
        timeMs: 1000,
        text: 'Hello world',
        romanization: 'hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1500 },
          { text: 'world', startMs: 1500, endMs: null },
        ],
      },
    ]);
  });

  it('rebuilds old cached bracket-style word lyrics from synced source text', async () => {
    const { database, service } = createHarness({
      appSettings: settings({ lyricsRomanizationEnabled: false, lyricsTranslationEnabled: false }),
    });
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cached-word-rebuild-1',
        'qqmusic|echo song|echo artist|echo album|120',
        'track-1',
        'qqmusic',
        'qq-word-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        null,
        "[00:05.340]I'm [00:05.760]a [00:05.940]big [00:06.660]girl[00:07.320]",
        JSON.stringify([
          { timeMs: 5340, text: "I'm" },
          { timeMs: 5760, text: 'a' },
          { timeMs: 5940, text: 'big' },
          { timeMs: 6660, text: 'girl' },
        ]),
        0,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines).toEqual([
      {
        timeMs: 5340,
        text: "I'm a big girl",
        words: [
          { text: "I'm ", startMs: 5340, endMs: 5760 },
          { text: 'a ', startMs: 5760, endMs: 5940 },
          { text: 'big ', startMs: 5940, endMs: 6660 },
          { text: 'girl', startMs: 6660, endMs: 7320 },
        ],
      },
    ]);
  });

  it('prefers local lrc over network', async () => {
    const root = makeTempRoot();
    const audioPath = join(root, 'Echo Song.flac');
    writeFileSync(audioPath, 'audio');
    writeFileSync(join(root, 'Echo Song.lrc'), '[00:01.00]Local line');
    const { online, service } = createHarness({
      currentTrack: track(audioPath),
      localProvider: new LocalLyricsProvider(),
      onlineProvider: { getLyrics: vi.fn(async () => trackLyrics()), searchCandidates: vi.fn(async () => []) },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.provider).toBe('local');
    expect(lyrics?.kind).toBe('synced');
    expect(lyrics?.lines[0].text).toBe('Local line');
    expect(online.getLyrics).not.toHaveBeenCalled();
  });

  it('keeps network candidates searchable when local lrc exists', async () => {
    const root = makeTempRoot();
    const audioPath = join(root, 'Echo Song.flac');
    writeFileSync(audioPath, 'audio');
    writeFileSync(join(root, 'Echo Song.lrc'), '[00:01.00]Local line');
    const { online, service } = createHarness({
      currentTrack: track(audioPath),
      localProvider: new LocalLyricsProvider(),
      onlineProvider: {
        getLyrics: vi.fn(async () => trackLyrics({ providerLyricsId: 'lrclib-network' })),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const candidates = await service.searchLyricsCandidates('track-1');

    expect(online.getLyrics).toHaveBeenCalled();
    expect(candidates.map((item) => item.provider)).toEqual(expect.arrayContaining(['local', 'lrclib']));
  });

  it('gives manual LRCLIB candidate search enough time for slow public responses', async () => {
    vi.useFakeTimers();
    const lrclibResult: LyricsProviderResult = {
      provider: 'lrclib',
      providerLyricsId: 'lrclib-slow',
      title: 'Echo Song',
      artist: 'Echo Artist',
      album: 'Echo Album',
      durationSeconds: 120,
      instrumental: false,
      plainLyrics: 'Slow LRCLIB line',
      syncedLyrics: null,
      sourceLabel: 'LRCLIB',
      raw: { id: 'lrclib-slow' },
    };
    const slowLrclibProvider: LyricsProvider = {
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
      search: vi.fn(
        (request) =>
          new Promise<LyricsProviderResult[]>((resolve) => {
            request.signal?.addEventListener('abort', () => resolve([]), { once: true });
            setTimeout(() => resolve([lrclibResult]), 1200);
          }),
      ),
    };
    const { service } = createHarness({
      appSettings: settings({
        lyricsEnabledProviders: ['lrclib'],
        lyricsProviderOrder: ['lrclib'],
        lyricsProviderTimeoutMs: 1000,
        lyricsTotalMatchTimeoutMs: 1500,
      }),
      onlineProvider: slowLrclibProvider as never,
    });

    const candidatesPromise = service.searchLyricsCandidates('track-1', undefined, 'lrclib');
    await vi.advanceTimersByTimeAsync(1200);
    const candidates = await candidatesPromise;

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      provider: 'lrclib',
      providerLyricsId: 'lrclib-slow',
      sourceLabel: 'LRCLIB',
    });
  });

  it('returns provider synced lyrics and caches them', async () => {
    const { service } = createHarness({
      onlineProvider: { getLyrics: vi.fn(async () => trackLyrics()), searchCandidates: vi.fn(async () => []) },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.kind).toBe('synced');
    expect(lyrics?.lines).toEqual([{ timeMs: 1000, text: 'Line' }]);
  });

  it('keeps provider word timings after cache write and read', async () => {
    const { online, service } = createHarness({
      appSettings: settings({ lyricsRomanizationEnabled: false, lyricsTranslationEnabled: false }),
      onlineProvider: {
        getLyrics: vi.fn(async () =>
          trackLyrics({
            lines: [
              {
                timeMs: 1000,
                text: 'Hello world',
                words: [
                  { text: 'Hello ', startMs: 1000, endMs: 1500 },
                  { text: 'world', startMs: 1500, endMs: null },
                ],
              },
            ],
            plainText: 'Hello world',
            syncedText: '[00:01.00]<00:01.00>Hello <00:01.50>world',
          }),
        ),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const first = await service.getLyricsForTrack('track-1');
    const second = await service.getLyricsForTrack('track-1');

    expect(first?.lines[0].words).toEqual([
      { text: 'Hello ', startMs: 1000, endMs: 1500 },
      { text: 'world', startMs: 1500, endMs: null },
    ]);
    expect(second?.lines[0].words).toEqual(first?.lines[0].words);
    expect(online.getLyrics).toHaveBeenCalledTimes(1);
  });

  it('resets corrupt lyrics cache tables and retries provider lyrics caching', async () => {
    const { database, service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () =>
          trackLyrics({
            id: 'lyrics-repair',
            lines: [{ timeMs: 1000, text: 'Recovered' }],
            plainText: 'Recovered',
            syncedText: '[00:01.00]Recovered',
          }),
        ),
        searchCandidates: vi.fn(async () => []),
      },
    });
    const originalPrepare = database.prepare.bind(database);
    let failOnce = true;

    vi.spyOn(database, 'prepare').mockImplementation(((source: string) => {
      if (failOnce && source.includes('FROM lyrics_cache') && source.includes('WHERE track_id = ?')) {
        failOnce = false;
        const error = new Error('SqliteError: database disk image is malformed') as Error & { code: string };
        error.code = 'SQLITE_CORRUPT';
        throw error;
      }

      return originalPrepare(source);
    }) as never);

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0].text).toBe('Recovered');
    const cached = database.prepare('SELECT id FROM lyrics_cache WHERE track_id = ?').get('track-1');
    expect(cached).toBeTruthy();
  });

  it('auto-applies a high scoring provider candidate during track lookup', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => null),
        searchCandidates: vi.fn(async () => [{
          ...candidate({ score: 0.97 }),
          raw: {
            id: 'lrclib-97',
            trackName: 'Echo Song',
            artistName: 'Echo Artist',
            albumName: 'Echo Album',
            duration: 120,
            syncedLyrics: '[00:01.00]Auto applied',
            plainLyrics: 'Auto applied',
            instrumental: false,
          },
        }]),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.kind).toBe('synced');
    expect(lyrics?.lines[0].text).toBe('Auto applied');
  });

  it('fills missing romanization for Japanese provider lyrics before caching', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () =>
          trackLyrics({
            lines: [{ timeMs: 1000, text: 'さくら' }],
            plainText: 'さくら',
            syncedText: '[00:01.00]さくら',
          }),
        ),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');
    const cached = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0].romanization).toBe('sakura');
    expect(cached?.lines[0].romanization).toBe('sakura');
  });

  it('updates stale cached lyrics by id when romanization changes the cache key', async () => {
    const { database, service } = createHarness();
    const japaneseLine = '\u3055\u304f\u3089';
    database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms, score,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'stale-romanization-cache',
        'lrclib|stale title|echo artist|echo album|120',
        'track-1',
        'lrclib',
        'lrclib-1',
        'Echo Song',
        'Echo Artist',
        'Echo Album',
        120,
        'synced',
        japaneseLine,
        `[00:01.00]${japaneseLine}`,
        JSON.stringify([{ timeMs: 1000, text: japaneseLine }]),
        0,
        0.99,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const lyrics = await service.getLyricsForTrack('track-1');
    const cachedRow = database
      .prepare<[string], { cache_key: string; lines_json: string }>(
        'SELECT cache_key, lines_json FROM lyrics_cache WHERE id = ? LIMIT 1',
      )
      .get('stale-romanization-cache');
    const cacheCount = database.prepare('SELECT COUNT(*) AS count FROM lyrics_cache').get() as { count: number };

    expect(lyrics?.lines[0].romanization).toBe('sakura');
    expect(cachedRow?.cache_key).toBe('lrclib|echo song|echo artist|echo album|120|');
    expect(JSON.parse(cachedRow?.lines_json ?? '[]')[0].romanization).toBe('sakura');
    expect(cacheCount.count).toBe(1);
  });

  it('does not romanize non-Japanese provider lyrics', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () =>
          trackLyrics({
            lines: [{ timeMs: 1000, text: 'Hello world' }],
            plainText: 'Hello world',
            syncedText: '[00:01.00]Hello world',
          }),
        ),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0]).toEqual({ timeMs: 1000, text: 'Hello world' });
  });

  it('does not auto-romanize Chinese provider lyrics', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () =>
          trackLyrics({
            lines: [{ timeMs: 1000, text: '还为分手前那句抱歉在感动' }],
            plainText: '还为分手前那句抱歉在感动',
            syncedText: '[00:01.00]还为分手前那句抱歉在感动',
          }),
        ),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.lines[0]).toEqual({ timeMs: 1000, text: '还为分手前那句抱歉在感动' });
  });

  it('returns provider plain lyrics', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => trackLyrics({ kind: 'plain', lines: [{ timeMs: -1, text: 'Plain' }], syncedText: null, plainText: 'Plain' })),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.kind).toBe('plain');
    expect(lyrics?.lines[0].timeMs).toBe(-1);
  });

  it('returns instrumental lyrics state', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => trackLyrics({ kind: 'instrumental', lines: [], syncedText: null, plainText: null })),
        searchCandidates: vi.fn(async () => []),
      },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.kind).toBe('instrumental');
    expect(lyrics?.lines).toEqual([]);
  });

  it('saves offset and returns updated lyrics', async () => {
    const { service } = createHarness({
      onlineProvider: { getLyrics: vi.fn(async () => trackLyrics()), searchCandidates: vi.fn(async () => []) },
    });

    await service.getLyricsForTrack('track-1');
    const updated = await service.setLyricsOffset('track-1', 750);

    expect(updated?.offsetMs).toBe(750);
    await expect(service.setLyricsOffset('missing', 750)).resolves.toBeNull();
  });

  it('marks a track as instrumental and returns the cached state without auto matching later', async () => {
    const onlineProvider = {
      getLyrics: vi.fn(async () => trackLyrics()),
      searchCandidates: vi.fn(async () => []),
    };
    const { service } = createHarness({ onlineProvider });

    const marked = await service.markTrackInstrumental('track-1');
    const cached = await service.getLyricsForTrack('track-1');

    expect(marked.kind).toBe('instrumental');
    expect(marked.provider).toBe('manual');
    expect(cached?.kind).toBe('instrumental');
    expect(onlineProvider.getLyrics).not.toHaveBeenCalled();
  });

  it('does not throw when network provider fails', async () => {
    const { service } = createHarness({
      onlineProvider: { getLyrics: vi.fn(async () => { throw new Error('offline'); }), searchCandidates: vi.fn(async () => []) },
    });

    await expect(service.getLyricsForTrack('track-1')).resolves.toBeNull();
  });

  it('does not auto apply a rejected provider candidate', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => trackLyrics()),
        searchCandidates: vi.fn(async () => [{ ...candidate(), raw: {} }]),
      },
    });
    const [found] = await service.searchLyricsCandidates('track-1');
    await service.rejectLyricsCandidate(found.id);

    await expect(service.getLyricsForTrack('track-1')).resolves.toBeNull();
  });

  it('applies candidate from stored raw json', async () => {
    const { service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => null),
        searchCandidates: vi.fn(async () => [{
          ...candidate(),
          raw: {
            id: 'lrclib-1',
            trackName: 'Echo Song',
            artistName: 'Echo Artist',
            albumName: 'Echo Album',
            duration: 120,
            syncedLyrics: '[00:01.00]Applied',
            plainLyrics: 'Applied',
            instrumental: false,
          },
        }]),
      },
    });
    const [found] = await service.searchLyricsCandidates('track-1');

    const lyrics = await service.applyLyricsCandidate('track-1', found.id);

    expect(lyrics.kind).toBe('synced');
    expect(lyrics.lines[0].text).toBe('Applied');
  });

  it('previews a candidate without caching or accepting it', async () => {
    const { database, service } = createHarness({
      onlineProvider: {
        getLyrics: vi.fn(async () => null),
        searchCandidates: vi.fn(async () => [{
          ...candidate(),
          raw: {
            id: 'lrclib-preview',
            trackName: 'Echo Song',
            artistName: 'Echo Artist',
            albumName: 'Echo Album',
            duration: 120,
            syncedLyrics: '[00:01.00]Preview only',
            plainLyrics: 'Preview only',
            instrumental: false,
          },
        }]),
      },
    });
    const [found] = await service.searchLyricsCandidates('track-1');

    const lyrics = await service.previewLyricsCandidate('track-1', found.id);
    const candidateRow = database.prepare<[string], { status: string }>('SELECT status FROM lyrics_candidates WHERE id = ?').get(found.id);
    const cacheCount = database.prepare('SELECT COUNT(*) AS count FROM lyrics_cache').get() as { count: number };

    expect(lyrics.kind).toBe('synced');
    expect(lyrics.lines[0].text).toBe('Preview only');
    expect(candidateRow?.status).toBe('pending');
    expect(cacheCount.count).toBe(0);
  });

  it('applies custom LRC text as manual cached lyrics', async () => {
    const { service } = createHarness();

    const lyrics = await service.applyCustomLrc(
      'track-1',
      '[00:01.00]Custom first\n[00:02.50]Custom second',
      'custom.lrc',
    );
    const cached = await service.getLyricsForTrack('track-1');

    expect(lyrics.provider).toBe('manual');
    expect(lyrics.kind).toBe('synced');
    expect(lyrics.lines).toEqual([
      { timeMs: 1000, text: 'Custom first' },
      { timeMs: 2500, text: 'Custom second' },
    ]);
    expect(cached?.provider).toBe('manual');
    expect(cached?.lines[0].text).toBe('Custom first');
  });

  it('queues cached synced lyrics for worker embedding', async () => {
    vi.useFakeTimers();
    const root = makeTempRoot();
    const filePath = join(root, 'song.flac');
    writeFileSync(filePath, 'audio');
    const { service } = createHarness({ currentTrack: track(filePath) });

    await service.applyCustomLrc('track-1', '[00:01.00]Line', 'custom.lrc');
    const result = await service.embedLyricsToTrack('track-1');

    expect(result).toMatchObject({
      trackId: 'track-1',
      queued: true,
      textKind: 'synced',
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(tagWriterMock.writeEmbeddedLyricsTag).toHaveBeenCalledWith(filePath, '[00:01.00]Line');
  });

  it('delays lyrics embedding while the edited track is playing', async () => {
    vi.useFakeTimers();
    const root = makeTempRoot();
    const filePath = join(root, 'playing.flac');
    writeFileSync(filePath, 'audio');
    const { service } = createHarness({ currentTrack: track(filePath) });

    audioSessionMock.state.status = {
      state: 'playing',
      currentFilePath: filePath,
    };
    await service.applyCustomLrc('track-1', '[00:01.00]Playing', 'custom.lrc');
    await service.embedLyricsToTrack('track-1');
    await vi.advanceTimersByTimeAsync(300);

    expect(tagWriterMock.writeEmbeddedLyricsTag).not.toHaveBeenCalled();

    audioSessionMock.state.status = {
      state: 'idle',
      currentFilePath: null,
    };
    await vi.advanceTimersByTimeAsync(5000);

    expect(tagWriterMock.writeEmbeddedLyricsTag).toHaveBeenCalledWith(filePath, '[00:01.00]Playing');
  });

  it('rejects lyrics embedding for remote tracks', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'remote.flac');
    writeFileSync(filePath, 'audio');
    const { service } = createHarness({ currentTrack: { ...track(filePath), mediaType: 'remote' } });

    await service.applyCustomLrc('track-1', '[00:01.00]Remote', 'custom.lrc');

    await expect(service.embedLyricsToTrack('track-1')).rejects.toThrow('远程、流媒体或临时曲目不能写入源文件');
    expect(tagWriterMock.writeEmbeddedLyricsTag).not.toHaveBeenCalled();
  });

  it('folds same-timestamp romanization when applying custom LRC text', async () => {
    const { service } = createHarness();

    const lyrics = await service.applyCustomLrc(
      'track-1',
      [
        '[01:30.00]man sui yao nang zou dou',
        '[01:30.00]问谁又能做到',
        '[01:34.00]ho fao ba fan fu si di gai han',
        '[01:34.00]可否不分肤色的界限',
      ].join('\n'),
      'custom.lrc',
    );

    expect(lyrics.lines).toEqual([
      { timeMs: 90000, text: '问谁又能做到', romanization: 'man sui yao nang zou dou' },
      { timeMs: 94000, text: '可否不分肤色的界限', romanization: 'ho fao ba fan fu si di gai han' },
    ]);
  });
});
