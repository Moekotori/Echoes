import { describe, expect, it, vi } from 'vitest';
import type { LyricsProvider, LyricsProviderResult, LyricsProviderSearchRequest } from './LyricsProvider';
import { LyricsMatchEngine } from './LyricsMatchEngine';

const provider = (
  id: 'lrclib' | 'netease' | 'qqmusic' | 'kugou' | 'kuwo',
  results: LyricsProviderResult[],
  delayMs = 0,
  capabilities: Partial<LyricsProvider['capabilities']> = {},
): LyricsProvider => ({
  id,
  label: id === 'lrclib' ? 'LRCLIB' : id === 'netease' ? 'NetEase Lyrics' : id === 'qqmusic' ? 'QQ Music' : id === 'kugou' ? 'KuGou' : 'Kuwo',
  priority: id === 'lrclib' ? 700 : id === 'netease' ? 600 : id === 'qqmusic' ? 590 : id === 'kugou' ? 570 : 560,
  capabilities: {
    synced: true,
    plain: true,
    translation: false,
    romanization: false,
    byDuration: true,
    byIsrc: false,
    byMusicBrainzId: false,
    needsAccount: false,
    ...capabilities,
  },
  search: vi.fn(async (request: LyricsProviderSearchRequest) => {
    if (delayMs) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        request.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }

    return request.signal?.aborted ? [] : results;
  }),
});

const hangingProvider = (
  id: 'lrclib' | 'netease' | 'qqmusic' | 'kugou' | 'kuwo',
): LyricsProvider => ({
  id,
  label: id,
  priority: 600,
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
  search: vi.fn(() => new Promise<LyricsProviderResult[]>(() => {})),
});

const result = (overrides: Partial<LyricsProviderResult> = {}): LyricsProviderResult => ({
  provider: 'lrclib',
  providerLyricsId: 'same-id',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
  instrumental: false,
  plainLyrics: 'Line',
  syncedLyrics: '[00:01.00]Line',
  raw: { id: 'same-id', syncedLyrics: '[00:01.00]Line' },
  ...overrides,
});

const query = {
  trackId: 'track-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
};

describe('LyricsMatchEngine', () => {
  it('deduplicates candidates returned by multiple providers', async () => {
    const engine = new LyricsMatchEngine([
      provider('lrclib', [result()]),
      provider('netease', [result({ provider: 'netease', providerLyricsId: null })]),
    ]);

    const matched = await engine.match(query, { enabledProviders: ['lrclib', 'netease'] });

    expect(matched.candidates).toHaveLength(1);
  });

  it('returns and marks a high-confidence auto accept result', async () => {
    const engine = new LyricsMatchEngine([provider('lrclib', [result()])]);

    const matched = await engine.match(query, { enabledProviders: ['lrclib'] });

    expect(matched.accepted?.decision.autoAccept).toBe(true);
  });

  it('treats karaoke-only provider results as synced candidates', async () => {
    const engine = new LyricsMatchEngine([
      provider('netease', [
        result({
          provider: 'netease',
          syncedLyrics: null,
          plainLyrics: null,
          karaokeLyrics: '[00:01.00]<00:01.00>Hello <00:01.50>world',
        }),
      ]),
    ]);

    const matched = await engine.match(query, { enabledProviders: ['netease'] });

    expect(matched.candidates[0].hasSynced).toBe(true);
  });

  it('accepts exact cover matches instead of leaving them as candidates only', async () => {
    const engine = new LyricsMatchEngine([
      provider('lrclib', [result({ title: 'Echo Song Cover', album: null, durationSeconds: 121 })]),
    ]);

    const matched = await engine.match(
      { ...query, title: 'Echo Song Cover' },
      { enabledProviders: ['lrclib'], autoAcceptScore: 0.82, coverAutoAcceptScore: 0.97 },
    );

    expect(matched.accepted?.decision.autoAccept).toBe(true);
    expect(matched.accepted?.risk).toBe('low');
  });

  it('keeps rejected results as candidates only', async () => {
    const engine = new LyricsMatchEngine([provider('lrclib', [result({ durationSeconds: 180 })])]);

    const matched = await engine.match(query, { enabledProviders: ['lrclib'] });

    expect(matched.accepted).toBeNull();
    expect(matched.candidates[0].risk).toBe('high');
  });

  it('does not auto accept a user-rejected provider lyrics id', async () => {
    const engine = new LyricsMatchEngine([provider('lrclib', [result()])]);

    const matched = await engine.match(query, {
      enabledProviders: ['lrclib'],
      isRejected: () => true,
    });

    expect(matched.accepted).toBeNull();
    expect(matched.candidates[0].reasons).toContain('rejected_by_user');
  });

  it('provider timeout does not block other providers', async () => {
    const slow = provider('netease', [result({ provider: 'netease', providerLyricsId: 'slow' })], 80);
    const fast = provider('lrclib', [result({ providerLyricsId: 'fast' })], 0);
    const engine = new LyricsMatchEngine([slow, fast]);

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'lrclib'],
      providerTimeoutMs: 20,
      totalMatchTimeoutMs: 80,
    });

    expect(matched.accepted?.providerLyricsId).toBe('fast');
  });

  it('returns a lower-priority match when a higher-priority provider hangs', async () => {
    const hanging = hangingProvider('netease');
    const fast = provider('kugou', [result({ provider: 'kugou', providerLyricsId: 'kugou-fast' })], 0);
    const engine = new LyricsMatchEngine([hanging, fast]);
    const startedAt = Date.now();

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'kugou'],
      providerTimeoutMs: 20,
      totalMatchTimeoutMs: 60,
    });

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(matched.accepted?.provider).toBe('kugou');
    expect(matched.accepted?.providerLyricsId).toBe('kugou-fast');
  });


  it('uses provider order as priority when deep search is disabled', async () => {
    const first = provider('netease', [result({ provider: 'netease', providerLyricsId: 'first' })], 10);
    const second = provider('lrclib', [result({ providerLyricsId: 'second' })], 0);
    const engine = new LyricsMatchEngine([second, first]);

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'lrclib'],
      deepSearchEnabled: false,
      providerTimeoutMs: 100,
    });

    expect(matched.accepted?.provider).toBe('netease');
    expect(matched.accepted?.providerLyricsId).toBe('first');
    expect(second.search).not.toHaveBeenCalled();
  });

  it('keeps higher-priority providers eligible during deep search', async () => {
    const first = provider('netease', [result({ provider: 'netease', providerLyricsId: 'first' })], 20);
    const second = provider('lrclib', [result({ providerLyricsId: 'second' })], 0);
    const engine = new LyricsMatchEngine([second, first]);

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'lrclib'],
      deepSearchEnabled: true,
      providerTimeoutMs: 100,
      totalMatchTimeoutMs: 200,
    });

    expect(matched.accepted?.provider).toBe('netease');
    expect(matched.accepted?.providerLyricsId).toBe('first');
    expect(second.search).toHaveBeenCalled();
  });

  it('waits for translation-capable providers when translations are preferred', async () => {
    const lrclib = provider('lrclib', [result({ providerLyricsId: 'plain-hit' })], 0);
    const netease = provider(
      'netease',
      [
        result({
          provider: 'netease',
          providerLyricsId: 'translated-hit',
          translationLyrics: '[00:01.00]Translated line',
          raw: { id: 'translated-hit' },
        }),
      ],
      20,
      { translation: true },
    );
    const engine = new LyricsMatchEngine([lrclib, netease]);

    const matched = await engine.match(query, {
      enabledProviders: ['lrclib', 'netease'],
      deepSearchEnabled: true,
      preferredSecondaryFields: ['translation'],
      providerTimeoutMs: 100,
      totalMatchTimeoutMs: 200,
    });

    expect(matched.accepted?.provider).toBe('netease');
    expect(matched.accepted?.providerLyricsId).toBe('translated-hit');
    expect(lrclib.search).toHaveBeenCalled();
    expect(netease.search).toHaveBeenCalled();
  });

  it('collects all provider candidates when requested', async () => {
    const netease = provider('netease', [result({ provider: 'netease', providerLyricsId: 'netease-hit', raw: { id: 'netease-hit' } })], 0);
    const lrclib = provider('lrclib', [result({ providerLyricsId: 'lrclib-hit', raw: { id: 'lrclib-hit' } })], 30);
    const qqmusic = provider('qqmusic', [result({ provider: 'qqmusic', providerLyricsId: 'qq-hit', raw: { id: 'qq-hit' } })], 40);
    const engine = new LyricsMatchEngine([lrclib, netease, qqmusic]);

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'lrclib', 'qqmusic'],
      collectAllCandidates: true,
      providerTimeoutMs: 100,
      totalMatchTimeoutMs: 200,
    });

    expect(matched.candidates.map((candidate) => candidate.providerLyricsId)).toEqual(
      expect.arrayContaining(['netease-hit', 'lrclib-hit', 'qq-hit']),
    );
  });

  it('total deadline returns candidates already available', async () => {
    const slow = provider('netease', [result({ provider: 'netease', providerLyricsId: 'slow' })], 80);
    const fast = provider('lrclib', [result({ providerLyricsId: 'fast' })], 5);
    const engine = new LyricsMatchEngine([slow, fast]);

    const matched = await engine.match(query, {
      enabledProviders: ['netease', 'lrclib'],
      providerTimeoutMs: 100,
      totalMatchTimeoutMs: 30,
    });

    expect(matched.candidates.some((candidate) => candidate.providerLyricsId === 'fast')).toBe(true);
  });
});
