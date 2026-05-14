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
import { LocalLyricsProvider } from './LocalLyricsProvider';

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-lyrics-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({
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
  lyricsFontSizePx: 36,
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
}: {
  currentTrack?: LibraryTrack;
  localProvider?: ConstructorParameters<typeof LyricsService>[2];
  onlineProvider?: ConstructorParameters<typeof LyricsService>[3];
  appSettings?: AppSettings;
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
  const service = new LyricsService(database, library, local, online, () => appSettings ?? settings());

  return { database, library, local, online, service };
};

describe('LyricsService', () => {
  it('returns cached lyrics without requesting providers', async () => {
    const { database, local, online, service } = createHarness();
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

  it('returns provider synced lyrics and caches them', async () => {
    const { service } = createHarness({
      onlineProvider: { getLyrics: vi.fn(async () => trackLyrics()), searchCandidates: vi.fn(async () => []) },
    });

    const lyrics = await service.getLyricsForTrack('track-1');

    expect(lyrics?.kind).toBe('synced');
    expect(lyrics?.lines).toEqual([{ timeMs: 1000, text: 'Line' }]);
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
});
