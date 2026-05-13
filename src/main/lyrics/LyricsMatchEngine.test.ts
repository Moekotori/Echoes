import { describe, expect, it, vi } from 'vitest';
import type { LyricsProvider, LyricsProviderResult, LyricsProviderSearchRequest } from './LyricsProvider';
import { LyricsMatchEngine } from './LyricsMatchEngine';

const provider = (
  id: 'lrclib' | 'netease',
  results: LyricsProviderResult[],
  delayMs = 0,
): LyricsProvider => ({
  id,
  label: id === 'lrclib' ? 'LRCLIB' : 'NetEase Lyrics',
  priority: id === 'lrclib' ? 700 : 600,
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
