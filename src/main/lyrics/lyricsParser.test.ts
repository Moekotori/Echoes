import { describe, expect, it } from 'vitest';
import { detectLyricsKind, parsePlainLyrics, parseSyncedLyrics } from './lyricsParser';
import { providerResultToTrackLyrics } from './LyricsProvider';

describe('lyricsParser', () => {
  it('parses centisecond timestamps', () => {
    expect(parseSyncedLyrics('[00:12.34]Hello')).toEqual([{ timeMs: 12340, text: 'Hello' }]);
  });

  it('parses millisecond timestamps', () => {
    expect(parseSyncedLyrics('[00:12.345]Hello')).toEqual([{ timeMs: 12345, text: 'Hello' }]);
  });

  it('parses multiple timestamps on one line', () => {
    expect(parseSyncedLyrics('[00:01.00][00:02.00]Echo')).toEqual([
      { timeMs: 1000, text: 'Echo' },
      { timeMs: 2000, text: 'Echo' },
    ]);
  });

  it('splits inline timestamped text into separate lyric lines', () => {
    expect(parseSyncedLyrics('[00:01.00]First phrase [00:02.00]second phrase')).toEqual([
      { timeMs: 1000, text: 'First phrase' },
      { timeMs: 2000, text: 'second phrase' },
    ]);
  });

  it('removes enhanced word timestamps from local LRC text', () => {
    expect(parseSyncedLyrics('[00:01.00]<00:01.00>Hello <00:01.50>world')).toEqual([
      { timeMs: 1000, text: 'Hello world' },
    ]);
  });

  it('ignores metadata tags', () => {
    expect(parseSyncedLyrics('[ar:Artist]\n[ti:Title]\n[00:01.00]Line')).toEqual([{ timeMs: 1000, text: 'Line' }]);
  });

  it('parses plain lyrics with timeMs=-1', () => {
    expect(parsePlainLyrics('First\n\nSecond')).toEqual([
      { timeMs: -1, text: 'First' },
      { timeMs: -1, text: 'Second' },
    ]);
  });

  it('detects instrumental before text lyrics', () => {
    expect(detectLyricsKind({ instrumental: true, plainLyrics: 'Text' })).toBe('instrumental');
  });

  it('merges synced provider romanization by timestamp', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'qqmusic',
        providerLyricsId: 'qqmusic:1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: '[00:01.00]君が好き\n[00:02.00]夜を越えて',
        romanizationLyrics: '[00:01.00]kimi ga suki\n[00:02.00]yoru o koete',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' },
      { timeMs: 2000, text: '夜を越えて', romanization: 'yoru o koete' },
    ]);
  });

  it('merges plain provider romanization by line index', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'netease',
        providerLyricsId: 'netease:1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: '君が好き\n夜を越えて',
        syncedLyrics: null,
        romanizationLyrics: 'kimi ga suki\nyoru o koete',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: -1, text: '君が好き', romanization: 'kimi ga suki' },
      { timeMs: -1, text: '夜を越えて', romanization: 'yoru o koete' },
    ]);
  });
});
