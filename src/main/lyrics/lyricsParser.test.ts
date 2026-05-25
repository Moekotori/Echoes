import { describe, expect, it } from 'vitest';
import { detectLyricsKind, deserializeLyricLines, parsePlainLyrics, parseSyncedLyrics, serializeLyricLines } from './lyricsParser';
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
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1500 },
          { text: 'world', startMs: 1500, endMs: null },
        ],
      },
    ]);
  });

  it('collapses bracket-style enhanced word timestamps into one lyric line', () => {
    expect(parseSyncedLyrics("[00:05.340]I'm [00:05.760]a [00:05.940]big [00:06.660]big [00:07.320]girl[00:08.220]")).toEqual([
      {
        timeMs: 5340,
        text: "I'm a big big girl",
        words: [
          { text: "I'm ", startMs: 5340, endMs: 5760 },
          { text: 'a ', startMs: 5760, endMs: 5940 },
          { text: 'big ', startMs: 5940, endMs: 6660 },
          { text: 'big ', startMs: 6660, endMs: 7320 },
          { text: 'girl', startMs: 7320, endMs: 8220 },
        ],
      },
    ]);
  });

  it('parses NetEase YRC word timings', () => {
    expect(parseSyncedLyrics('[1000,1200](1000,300,0)Hello (1300,400,0)world')).toEqual([
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1300 },
          { text: 'world', startMs: 1300, endMs: 1700 },
        ],
      },
    ]);
  });

  it('parses provider YRC word timings relative to the line start', () => {
    expect(parseSyncedLyrics('[1000,1200](0,300,0)Hello (300,400,0)world')).toEqual([
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1300 },
          { text: 'world', startMs: 1300, endMs: 1700 },
        ],
      },
    ]);
  });

  it('drops word timings with non-increasing timestamps but keeps the lyric line', () => {
    expect(parseSyncedLyrics('[00:01.00]<00:01.50>Hello <00:01.20>world')).toEqual([
      { timeMs: 1000, text: 'Hello world' },
    ]);
  });

  it('does not add word timings to ordinary synced lyrics', () => {
    expect(parseSyncedLyrics('[00:01.00]Hello world')).toEqual([
      { timeMs: 1000, text: 'Hello world' },
    ]);
  });

  it('preserves word timings through line serialization', () => {
    const lines = [
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1500 },
          { text: 'world', startMs: 1500, endMs: null },
        ],
        kana: 'はろーわーるど',
      },
    ];

    expect(deserializeLyricLines(serializeLyricLines(lines))).toEqual(lines);
  });

  it('splits inline Chinese translations from synced lyrics', () => {
    expect(parseSyncedLyrics('[00:08.00]僕ら出会えたの / 才换来你我这一次相遇')).toEqual([
      { timeMs: 8000, text: '僕ら出会えたの', translation: '才换来你我这一次相遇' },
    ]);
  });

  it('keeps slash-delimited non-translation synced lyrics intact', () => {
    expect(parseSyncedLyrics('[00:08.00]唱おう na-na-na-! / Nanana!')).toEqual([
      { timeMs: 8000, text: '唱おう na-na-na-! / Nanana!' },
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

  it('splits inline Chinese translations from plain lyrics', () => {
    expect(parsePlainLyrics('幾千の時を巡って今 / 千载时光流转')).toEqual([
      { timeMs: -1, text: '幾千の時を巡って今', translation: '千载时光流转' },
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

  it('merges provider translation by timestamp', () => {
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
        syncedLyrics: '[00:01.00]Hello\n[00:02.00]World',
        translationLyrics: '[00:01.00]你好\n[00:02.00]世界',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 1000, text: 'Hello', translation: '你好' },
      { timeMs: 2000, text: 'World', translation: '世界' },
    ]);
  });

  it('merges synced secondary lyrics with small timestamp drift', () => {
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
        plainLyrics: null,
        syncedLyrics: '[00:01.00]Hello',
        romanizationLyrics: '[00:01.22]hello',
        translationLyrics: '[00:01.26]你好',
      },
      1,
    );

  expect(lyrics?.lines).toEqual([
      { timeMs: 1000, text: 'Hello', romanization: 'hello', translation: '你好' },
    ]);
  });

  it('keeps ordinary synced lyric spacing while borrowing karaoke word timings', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'netease',
        providerLyricsId: 'netease:karaoke',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: '[00:01.00]Hello world',
        karaokeLyrics: '[00:01.00]<00:01.00>Hello <00:01.50>world',
      },
      1,
    );

    expect(lyrics?.syncedText).toBe('[00:01.00]Hello world');
    expect(lyrics?.lines).toEqual([
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello ', startMs: 1000, endMs: 1500 },
          { text: 'world', startMs: 1500, endMs: null },
        ],
      },
    ]);
  });

  it('keeps ordinary synced lyric spacing while borrowing NetEase YRC word timings', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'netease',
        providerLyricsId: 'netease:yrc',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: '[00:01.00]Hello world',
        karaokeLyrics: '[1000,1200](1000,300,0)Hello(1300,400,0)world',
      },
      1,
    );

    expect(lyrics?.syncedText).toBe('[00:01.00]Hello world');
    expect(lyrics?.lines).toEqual([
      {
        timeMs: 1000,
        text: 'Hello world',
        words: [
          { text: 'Hello', startMs: 1000, endMs: 1300 },
          { text: 'world', startMs: 1300, endMs: 1700 },
        ],
      },
    ]);
  });

  it('folds same-timestamp romanization and translations into secondary fields', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'local',
        providerLyricsId: 'local:1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: [
          '[00:08.48]世界中のすべての人間に',
          '[00:08.48]se ka i ju u no su be te no ni n ge n ni',
          '[00:08.48]如果试着去取悦全世界的人',
          '[00:10.08]好かれるなんて気持ち悪いよ',
          '[00:10.08]su ka re ru na n te ki mo chi wa ru i yo',
          '[00:10.08]那一定很令人作呕吧',
        ].join('\n'),
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      {
        timeMs: 8480,
        text: '世界中のすべての人間に',
        romanization: 'se ka i ju u no su be te no ni n ge n ni',
        translation: '如果试着去取悦全世界的人',
      },
      {
        timeMs: 10080,
        text: '好かれるなんて気持ち悪いよ',
        romanization: 'su ka re ru na n te ki mo chi wa ru i yo',
        translation: '那一定很令人作呕吧',
      },
    ]);
  });

  it('keeps the Han lyric as primary when same-timestamp local romanization comes first', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'local',
        providerLyricsId: 'local:1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: [
          '[01:30.00]man sui yao nang zou dou',
          '[01:30.00]问谁又能做到',
          '[01:34.00]ho fao ba fan fu si di gai han',
          '[01:34.00]可否不分肤色的界限',
        ].join('\n'),
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 90000, text: '问谁又能做到', romanization: 'man sui yao nang zou dou' },
      { timeMs: 94000, text: '可否不分肤色的界限', romanization: 'ho fao ba fan fu si di gai han' },
    ]);
  });

  it('keeps English lyrics as primary when same-timestamp Chinese translations are present', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Song', artist: 'Artist' },
      {
        provider: 'local',
        providerLyricsId: 'local:1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        durationSeconds: null,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: [
          '[01:03.00]i cant wait',
          '[01:03.00]\u6211\u5df2\u7ecf\u8feb\u4e0d\u53ca\u5f85',
          "[01:05.00]I'm in love",
          '[01:05.00]\u6211\u9677\u5165\u4e86\u7231\u6cb3',
        ].join('\n'),
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 63000, text: 'i cant wait', translation: '\u6211\u5df2\u7ecf\u8feb\u4e0d\u53ca\u5f85' },
      { timeMs: 65000, text: "I'm in love", translation: '\u6211\u9677\u5165\u4e86\u7231\u6cb3' },
    ]);
  });

  it('does not merge synced provider romanization with larger provider timestamp drift', () => {
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
        syncedLyrics: '[00:10.00]First line\n[00:14.00]Second line',
        romanizationLyrics: '[00:11.10]kimi ga suki\n[00:15.20]yoru o koete',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 10000, text: 'First line' },
      { timeMs: 14000, text: 'Second line' },
    ]);
  });

  it('does not attach synced secondary lyrics by matching line index when timestamps disagree', () => {
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
        syncedLyrics: '[00:10.00]Hello\n[00:20.00]World',
        translationLyrics: '[00:01.00]你好\n[00:02.00]世界',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 10000, text: 'Hello' },
      { timeMs: 20000, text: 'World' },
    ]);
  });

  it('does not attach provider translation or romanization to leading credit lines', () => {
    const lyrics = providerResultToTrackLyrics(
      { title: 'Lemon', artist: 'Yonezu Kenshi' },
      {
        provider: 'netease',
        providerLyricsId: 'netease:536622304',
        title: 'Lemon',
        artist: 'Yonezu Kenshi',
        album: null,
        durationSeconds: 256,
        instrumental: false,
        plainLyrics: null,
        syncedLyrics: [
          '[00:00.000]Lyrics by Kenshi Yonezu',
          '[00:00.212]Composed by Kenshi Yonezu',
          '[00:00.851]yume naraba dorehodo yokatta deshou',
        ].join('\n'),
        translationLyrics: '[00:00.851]How good it would have been if this were all a dream',
        romanizationLyrics: '[00:00.851]yu me na ra ba do re ho do yo ka tta de syo u',
      },
      1,
    );

    expect(lyrics?.lines).toEqual([
      { timeMs: 0, text: 'Lyrics by Kenshi Yonezu' },
      { timeMs: 212, text: 'Composed by Kenshi Yonezu' },
      {
        timeMs: 851,
        text: 'yume naraba dorehodo yokatta deshou',
        romanization: 'yu me na ra ba do re ho do yo ka tta de syo u',
        translation: 'How good it would have been if this were all a dream',
      },
    ]);
  });
});
