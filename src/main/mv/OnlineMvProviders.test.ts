import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrack } from '../../shared/types/library';
import type { MvSettings, TrackVideo } from '../../shared/types/mv';
import { BilibiliMvProvider, YouTubeMvProvider } from './OnlineMvProviders';

const track: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\Echo Song.flac',
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
};

const settings: MvSettings = {
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
  allow60fps: true,
};

const video: TrackVideo = {
  id: 'video-1',
  trackId: 'track-1',
  provider: 'bilibili',
  sourceType: 'search_candidate',
  sourceId: 'BV1echo',
  title: 'Echo Song MV',
  artist: 'Echo Artist',
  url: 'https://www.bilibili.com/video/BV1echo',
  providerUrl: 'https://www.bilibili.com/video/BV1echo',
  thumbnailUrl: null,
  filePath: null,
  mediaUrl: null,
  mimeType: null,
  durationSeconds: null,
  width: null,
  height: null,
  selectedQualityId: 'auto',
  qualityLabel: null,
  fps: null,
  score: 0.7,
  selected: true,
  playableInApp: false,
  rawProviderJson: null,
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
};

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BilibiliMvProvider', () => {
  it('maps search results and sends account cookie only from main dependencies', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          result: [
            {
              bvid: 'BV1echo',
              title: '<em class="keyword">Echo</em> Song MV',
              author: 'Echo Channel',
              pic: '//i.example/echo.jpg',
              play: '12.3万',
            },
          ],
        },
      }),
    ) as typeof fetch;
    const provider = new BilibiliMvProvider({
      fetchImpl,
      getCredentials: () => ({ provider: 'bilibili', cookie: 'SESSDATA=secret' }),
    });

    const candidates = await provider.search(track, settings);

    expect(candidates[0]).toMatchObject({
      provider: 'bilibili',
      sourceType: 'search_candidate',
      title: 'Echo Song MV',
      providerUrl: 'https://www.bilibili.com/video/BV1echo',
      thumbnailUrl: 'https://i.example/echo.jpg',
      uploader: 'Echo Channel',
      viewCount: 123000,
    });
    expect(candidates[0]?.reasons).toContain('播放 123000');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('api.bilibili.com/x/web-interface/search/type'),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'SESSDATA=secret' }),
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('order=click'), expect.anything());
  });

  it('sorts Bilibili search results by match score first and play count second', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          result: [
            {
              bvid: 'BV1popular',
              title: 'Popular unrelated video',
              author: 'Echo Channel',
              pic: '//i.example/popular.jpg',
              play: '99万',
            },
            {
              bvid: 'BV1low',
              title: 'Echo Song Low Play',
              author: 'Echo Channel',
              pic: '//i.example/low.jpg',
              play: '9000',
            },
            {
              bvid: 'BV1high',
              title: 'Echo Song High Play',
              author: 'Echo Channel',
              pic: '//i.example/high.jpg',
              play: '3.2万',
            },
          ],
        },
      }),
    ) as typeof fetch;
    const provider = new BilibiliMvProvider({
      fetchImpl,
      getCredentials: () => ({ provider: 'bilibili' }),
    });

    const candidates = await provider.search(track, settings);

    expect(candidates.map((candidate) => candidate.id)).toEqual(['bilibili:BV1high', 'bilibili:BV1low', 'bilibili:BV1popular']);
    expect(candidates.map((candidate) => candidate.viewCount)).toEqual([32000, 9000, 990000]);
    expect(candidates[0]?.score).toBe(candidates[1]?.score);
    expect(candidates[1]!.score).toBeGreaterThan(candidates[2]!.score);
  });

  it('resolves direct MP4 stream variants within the quality cap', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/x/web-interface/view')) {
        return jsonResponse({ data: { cid: 123 } });
      }

      if (url.includes('qn=80')) {
        return jsonResponse({ data: { durl: [{ url: 'https://cdn.example/1080.mp4' }] } });
      }

      if (url.includes('qn=64')) {
        return jsonResponse({ data: { durl: [{ url: 'https://cdn.example/720.mp4' }] } });
      }

      return jsonResponse({ code: -1 }, 403);
    }) as typeof fetch;
    const provider = new BilibiliMvProvider({
      fetchImpl,
      getCredentials: () => ({ provider: 'bilibili' }),
    });

    const variants = await provider.resolve(video, settings);

    expect(variants.map((variant) => variant.id)).toEqual(['bilibili-qn-80', 'bilibili-qn-64']);
    expect(variants[0]).toMatchObject({
      label: '1080p',
      qualityTier: '1080p',
      mimeType: 'video/mp4',
      playableInApp: true,
      url: 'https://cdn.example/1080.mp4',
      headers: { Referer: 'https://www.bilibili.com/video/BV1echo' },
    });
  });

  it('resolves unrestricted variants when max quality is selected and keeps 60fps variants', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/x/web-interface/view')) {
        return jsonResponse({ data: { cid: 123 } });
      }

      if (url.includes('qn=120')) {
        return jsonResponse({ data: { durl: [{ url: 'https://cdn.example/4k.mp4' }] } });
      }

      if (url.includes('qn=116')) {
        return jsonResponse({ data: { durl: [{ url: 'https://cdn.example/1080-60.mp4' }] } });
      }

      if (url.includes('qn=80')) {
        return jsonResponse({ data: { durl: [{ url: 'https://cdn.example/1080.mp4' }] } });
      }

      return jsonResponse({ code: -1 }, 403);
    }) as typeof fetch;
    const provider = new BilibiliMvProvider({
      fetchImpl,
      getCredentials: () => ({ provider: 'bilibili' }),
    });

    const variants = await provider.resolve(video, { ...settings, maxQuality: 'max', allow60fps: false });

    expect(variants.map((variant) => variant.id)).toEqual(['bilibili-qn-120', 'bilibili-qn-116', 'bilibili-qn-80']);
    expect(variants.find((variant) => variant.id === 'bilibili-qn-116')).toMatchObject({
      label: '1080p 60fps',
      fps: 60,
      url: 'https://cdn.example/1080-60.mp4',
    });
  });
});

describe('YouTubeMvProvider', () => {
  it('requests YouTube results ordered by view count when an API key is configured', async () => {
    const originalEchoKey = process.env.ECHO_YOUTUBE_API_KEY;
    process.env.ECHO_YOUTUBE_API_KEY = 'test-key';
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] })) as typeof fetch;
    const provider = new YouTubeMvProvider({ fetchImpl });

    try {
      await provider.search(track, settings);

      expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('order=viewCount'), expect.anything());
    } finally {
      if (originalEchoKey === undefined) {
        delete process.env.ECHO_YOUTUBE_API_KEY;
      } else {
        process.env.ECHO_YOUTUBE_API_KEY = originalEchoKey;
      }
    }
  });

  it('does not scrape YouTube when no official API key is configured', async () => {
    const originalEchoKey = process.env.ECHO_YOUTUBE_API_KEY;
    const originalYouTubeKey = process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.ECHO_YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_DATA_API_KEY;
    const fetchImpl = vi.fn() as typeof fetch;
    const provider = new YouTubeMvProvider({ fetchImpl });

    try {
      const candidates = await provider.search(track, settings);

      expect(candidates).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (originalEchoKey === undefined) {
        delete process.env.ECHO_YOUTUBE_API_KEY;
      } else {
        process.env.ECHO_YOUTUBE_API_KEY = originalEchoKey;
      }
      if (originalYouTubeKey === undefined) {
        delete process.env.YOUTUBE_DATA_API_KEY;
      } else {
        process.env.YOUTUBE_DATA_API_KEY = originalYouTubeKey;
      }
    }
  });
});
