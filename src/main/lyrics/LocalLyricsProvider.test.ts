import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFile } from 'music-metadata';
import { LocalLyricsProvider } from './LocalLyricsProvider';
import { buildNormalizedLyricsQuery } from './lyricsQueryBuilder';
import type { LyricsQuery } from '../../shared/types/lyrics';

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(),
}));

const parseFileMock = vi.mocked(parseFile);
const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-local-lyrics-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  vi.clearAllMocks();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

const query = (filePath: string): LyricsQuery => ({
  trackId: 'track-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
  filePath,
});

const request = (lyricsQuery: LyricsQuery) => ({
  query: lyricsQuery,
  normalized: buildNormalizedLyricsQuery(lyricsQuery),
  timeoutMs: 4500,
});

describe('LocalLyricsProvider', () => {
  it('prefers embedded synced lyrics over sidecar lyrics', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'Echo Song.flac');
    writeFileSync(filePath, 'audio');
    writeFileSync(join(root, 'Echo Song.lrc'), '[00:01.00]Sidecar');
    parseFileMock.mockResolvedValue({
      common: {
        lyrics: [
          {
            contentType: 1,
            timeStampFormat: 2,
            syncText: [{ timestamp: 1000, text: 'Embedded' }],
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof parseFile>>);

    const [candidate] = await new LocalLyricsProvider().search(request(query(filePath)));

    expect(candidate.sourceLabel).toBe('Embedded tag');
    expect(candidate.matchReasons).toContain('embedded_tag_priority');
    expect(candidate.syncedLyrics).toBe('[00:01.00]Embedded');
  });

  it('uses embedded plain lyrics', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'Echo Song.flac');
    writeFileSync(filePath, 'audio');
    parseFileMock.mockResolvedValue({
      common: {
        lyrics: [
          {
            contentType: 1,
            timeStampFormat: 2,
            text: 'Plain embedded line',
            syncText: [],
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof parseFile>>);

    const [candidate] = await new LocalLyricsProvider().search(request(query(filePath)));

    expect(candidate.sourceLabel).toBe('Embedded tag');
    expect(candidate.plainLyrics).toBe('Plain embedded line');
  });

  it('detects embedded LRC text as synced lyrics', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'Echo Song.flac');
    writeFileSync(filePath, 'audio');
    parseFileMock.mockResolvedValue({
      common: {
        lyrics: [
          {
            contentType: 1,
            timeStampFormat: 2,
            text: '[00:01.00]Embedded LRC',
            syncText: [],
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof parseFile>>);

    const [candidate] = await new LocalLyricsProvider().search(request(query(filePath)));

    expect(candidate.syncedLyrics).toBe('[00:01.00]Embedded LRC');
    expect(candidate.plainLyrics).toBeNull();
  });

  it('falls back to sidecar lyrics when embedded lyrics are empty', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'Echo Song.flac');
    writeFileSync(filePath, 'audio');
    writeFileSync(join(root, 'Echo Song.lrc'), '[00:01.00]Sidecar');
    parseFileMock.mockResolvedValue({
      common: {
        lyrics: [
          {
            contentType: 1,
            timeStampFormat: 2,
            text: '   ',
            syncText: [],
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof parseFile>>);

    const [candidate] = await new LocalLyricsProvider().search(request(query(filePath)));

    expect(candidate.sourceLabel).toBe('Local LRC');
    expect(candidate.syncedLyrics).toBe('[00:01.00]Sidecar');
  });

  it('decodes GBK sidecar LRC files without rewriting the source file', async () => {
    const root = makeTempRoot();
    const filePath = join(root, 'Echo Song.flac');
    const lrcPath = join(root, 'Echo Song.lrc');
    writeFileSync(filePath, 'audio');
    writeFileSync(lrcPath, Buffer.from([
      0x5b, 0x30, 0x30, 0x3a, 0x30, 0x31, 0x2e, 0x30, 0x30, 0x5d,
      0xd0, 0xd2, 0xb4, 0xe6, 0xd5, 0xdf,
    ]));
    parseFileMock.mockResolvedValue({ common: { lyrics: [] } } as unknown as Awaited<ReturnType<typeof parseFile>>);

    const lyrics = new LocalLyricsProvider().getLyrics(query(filePath));

    expect(lyrics?.syncedText).toBe('[00:01.00]幸存者');
    expect(lyrics?.lines).toEqual([{ timeMs: 1000, text: '幸存者' }]);
  });
});
