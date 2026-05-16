import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IAudioMetadata } from 'music-metadata';
import { parseFile } from 'music-metadata';
import { readMetadata, readPictures } from 'taglib-wasm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeWaveInfoText, repairMojibakeText, TsMetadataReader } from './TsMetadataReader';

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(),
}));

vi.mock('taglib-wasm', () => ({
  readMetadata: vi.fn(),
  readPictures: vi.fn(),
}));

const parseFileMock = vi.mocked(parseFile);
const readTagLibMetadataMock = vi.mocked(readMetadata);
const readTagLibPicturesMock = vi.mocked(readPictures);
const tempRoots: string[] = [];

type MetadataMockOverrides = {
  common?: Record<string, unknown>;
  format?: Record<string, unknown>;
  native?: IAudioMetadata['native'];
  quality?: IAudioMetadata['quality'];
};

const emptyMetadata = (overrides: MetadataMockOverrides = {}): IAudioMetadata => ({
  common: {
    track: { no: null, of: null },
    disk: { no: null, of: null },
    movementIndex: { no: null, of: null },
    ...overrides.common,
  },
  format: {
    trackInfo: [],
    tagTypes: [],
    ...overrides.format,
  },
  native: overrides.native ?? {},
  quality: overrides.quality ?? { warnings: [] },
} as IAudioMetadata);

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-metadata-reader-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const uint32Le = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

const riffChunk = (id: string, data: Buffer): Buffer => Buffer.concat([
  Buffer.from(id, 'ascii'),
  uint32Le(data.length),
  data,
  data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
]);

const writeWaveWithInfo = (filePath: string, tags: Record<string, string>): void => {
  const infoChunks = Object.entries(tags).map(([id, value]) => riffChunk(id, Buffer.from(`${value}\0`, 'utf8')));
  const listData = Buffer.concat([Buffer.from('INFO', 'ascii'), ...infoChunks]);
  const listChunk = riffChunk('LIST', listData);
  const riffSize = 4 + listChunk.length;
  writeFileSync(filePath, Buffer.concat([Buffer.from('RIFF', 'ascii'), uint32Le(riffSize), Buffer.from('WAVE', 'ascii'), listChunk]));
};

describe('TsMetadataReader WAV INFO text decoding', () => {
  it('recovers legacy GBK-encoded Japanese WAV INFO text', () => {
    const raw = Buffer.from(
      'd0c78644a4a2a4aba4ea2028b3e0ceb2a4d2a4aba4eb292c20bbcab3c7a5bba5c4a5ca2028b0cb8e86a5a2a5f3a5ca292c20b8df9e81c0e6be772028bec3b1a3a5e6a5eaa5ab292c20b0d8c4bec3c081842028bacd9ae2a4a2a4baceb4292c20967ceb85a4c4a4e0a4ae2028bacdc8aaef4cbba82900',
      'hex',
    );

    expect(decodeWaveInfoText(raw)).toBe(
      '\u661f\u54b2\u3042\u304b\u308a (\u8d64\u5c3e\u3072\u304b\u308b), \u7687\u57ce\u30bb\u30c4\u30ca (\u516b\u5dfb\u30a2\u30f3\u30ca), \u9ad8\u702c\u68a8\u7dd2 (\u4e45\u4fdd\u30e6\u30ea\u30ab), \u67cf\u6728\u7f8e\u4e9c (\u548c\u6c23\u3042\u305a\u672a), \u6771\u96f2\u3064\u3080\u304e (\u548c\u6cc9\u98a8\u82b1)',
    );
  });

  it('keeps ordinary UTF-8 and ASCII WAV INFO text unchanged', () => {
    expect(decodeWaveInfoText(Buffer.from('Transcend Lights\0', 'utf8'))).toBe('Transcend Lights');
    expect(decodeWaveInfoText(Buffer.from('ONGEKI Sound Collection 06\0', 'utf8'))).toBe('ONGEKI Sound Collection 06');
  });

  it('repairs common UTF-8 mojibake without changing normal CJK text', () => {
    expect(repairMojibakeText(Buffer.from('Fran\u00e7oise Hardy', 'utf8').toString('latin1'))).toBe('Fran\u00e7oise Hardy');
    expect(repairMojibakeText(Buffer.from('\u591c\u306b\u99c6\u3051\u308b', 'utf8').toString('latin1'))).toBe('\u591c\u306b\u99c6\u3051\u308b');
    expect(repairMojibakeText('\u9093\u7d2b\u68cb - \u540e\u4f1a\u65e0\u671f')).toBe('\u9093\u7d2b\u68cb - \u540e\u4f1a\u65e0\u671f');
  });
});

describe('TsMetadataReader parser fallbacks', () => {
  beforeEach(() => {
    parseFileMock.mockReset();
    readTagLibMetadataMock.mockReset();
    readTagLibPicturesMock.mockReset();
    parseFileMock.mockResolvedValue(emptyMetadata());
    readTagLibMetadataMock.mockResolvedValue({ tags: {}, properties: undefined, hasCoverArt: false } as never);
    readTagLibPicturesMock.mockResolvedValue([] as never);
  });

  it('fills missing DSD tags, cover, and technical fields from TagLib', async () => {
    parseFileMock.mockResolvedValue(emptyMetadata());
    readTagLibMetadataMock.mockResolvedValue({
      tags: {
        title: ['TagLib Title'],
        artist: ['TagLib Artist'],
        album: ['TagLib Album'],
        albumArtist: ['TagLib Album Artist'],
        track: 7,
        discNumber: 2,
        year: 2024,
        genre: ['DSD'],
        bpm: 128,
      },
      properties: {
        duration: 245.5,
        sampleRate: 2822400,
        bitsPerSample: 1,
        bitrate: 5645,
        codec: 'DSD',
        containerFormat: 'DSF',
      },
      hasCoverArt: true,
    } as never);
    readTagLibPicturesMock.mockResolvedValue([
      { type: 'FrontCover', mimeType: 'image/jpeg', data: new Uint8Array([1, 2, 3]) },
    ] as never);

    const result = await new TsMetadataReader().read('D:\\Music\\Track.dsf');

    expect(result.fields).toMatchObject({
      title: 'TagLib Title',
      artist: 'TagLib Artist',
      album: 'TagLib Album',
      albumArtist: 'TagLib Album Artist',
      trackNo: 7,
      discNo: 2,
      year: 2024,
      genre: 'DSD',
      duration: 245.5,
      codec: 'DSD',
      sampleRate: 2822400,
      bitDepth: 1,
      bitrate: 5645000,
      bpm: 128,
    });
    expect(result.fieldSources.title).toBe('embedded');
    expect(result.fieldSources.duration).toBe('technical');
    expect(result.embeddedMetadataStatus).toBe('present');
    expect(result.embeddedCoverStatus).toBe('present');
    expect(Array.from(result.embeddedCover?.data ?? [])).toEqual([1, 2, 3]);
  });

  it('does not let TagLib overwrite metadata that music-metadata already read', async () => {
    parseFileMock.mockResolvedValue(emptyMetadata({
      common: {
        title: 'Music Metadata Title',
        artist: 'Music Metadata Artist',
        album: 'Music Metadata Album',
        track: { no: 4, of: null },
      },
      format: {
        duration: 180,
        codec: 'PCM',
        sampleRate: 96000,
        bitsPerSample: 24,
        bitrate: 4608000,
      },
    }));
    readTagLibMetadataMock.mockResolvedValue({
      tags: {
        title: ['TagLib Title'],
        artist: ['TagLib Artist'],
        album: ['TagLib Album'],
        track: 8,
      },
      properties: {
        duration: 240,
        sampleRate: 44100,
        bitsPerSample: 16,
        bitrate: 1411,
        codec: 'PCM',
        containerFormat: 'WAV',
      },
      hasCoverArt: false,
    } as never);

    const result = await new TsMetadataReader().read('D:\\Music\\Track.wav');

    expect(result.fields.title).toBe('Music Metadata Title');
    expect(result.fields.artist).toBe('Music Metadata Artist');
    expect(result.fields.album).toBe('Music Metadata Album');
    expect(result.fields.trackNo).toBe(4);
    expect(result.fields.duration).toBe(180);
    expect(result.fields.sampleRate).toBe(96000);
    expect(result.fields.bitDepth).toBe(24);
  });

  it('lets TagLib correct ALAC m4a technical fields misread from the MP4 container', async () => {
    parseFileMock.mockResolvedValue(emptyMetadata({
      format: {
        duration: 60,
        codec: 'ALAC',
        sampleRate: 48000,
        bitsPerSample: 16,
        bitrate: 1800000,
      },
    }));
    readTagLibMetadataMock.mockResolvedValue({
      tags: {},
      properties: {
        duration: 60,
        sampleRate: 192000,
        bitsPerSample: 24,
        bitrate: 9216,
        codec: 'ALAC',
        containerFormat: 'MP4',
      },
      hasCoverArt: false,
    } as never);

    const result = await new TsMetadataReader().read('D:\\Music\\Hi-Res ALAC.m4a');

    expect(result.fields.codec).toBe('ALAC');
    expect(result.fields.sampleRate).toBe(192000);
    expect(result.fields.bitDepth).toBe(24);
    expect(result.fields.bitrate).toBe(9216000);
    expect(result.fieldSources.sampleRate).toBe('technical');
    expect(result.fieldSources.bitDepth).toBe('technical');
  });

  it('repairs mojibake returned by embedded tag parsers', async () => {
    parseFileMock.mockResolvedValue(emptyMetadata({
      common: {
        title: Buffer.from('Fran\u00e7oise Hardy', 'utf8').toString('latin1'),
        artist: Buffer.from('\u591c\u306b\u99c6\u3051\u308b', 'utf8').toString('latin1'),
        album: '\u6b63\u5e38\u4e2d\u6587\u4e13\u8f91',
      },
      format: {
        duration: 180,
      },
    }));

    const result = await new TsMetadataReader().read('D:\\Music\\Mojibake.flac');

    expect(result.fields.title).toBe('Fran\u00e7oise Hardy');
    expect(result.fields.artist).toBe('\u591c\u306b\u99c6\u3051\u308b');
    expect(result.fields.album).toBe('\u6b63\u5e38\u4e2d\u6587\u4e13\u8f91');
  });

  it('uses native container tags when common metadata mapping is sparse', async () => {
    parseFileMock.mockResolvedValue(emptyMetadata({
      native: {
        vorbis: [
          { id: 'TITLE', value: '\u5982\u679c\u6709\u4e00\u5929\u6211\u53d8\u5f97\u5f88\u6709\u94b1' },
          { id: 'ARTIST', value: '\u6bdb\u4e0d\u6613' },
          { id: 'ALBUM', value: '\u5e73\u51e1\u7684\u4e00\u5929' },
          { id: 'DATE', value: '2018' },
          { id: 'TRACKNUMBER', value: '6/10' },
          { id: 'DISCNUMBER', value: '2' },
        ],
      },
      format: {
        duration: 170.88,
        codec: 'FLAC',
      },
    }));

    const result = await new TsMetadataReader().read('D:\\Music\\Sparse Common.flac');

    expect(result.fields).toMatchObject({
      title: '\u5982\u679c\u6709\u4e00\u5929\u6211\u53d8\u5f97\u5f88\u6709\u94b1',
      artist: '\u6bdb\u4e0d\u6613',
      album: '\u5e73\u51e1\u7684\u4e00\u5929',
      trackNo: 6,
      discNo: 2,
      year: 2018,
    });
    expect(result.fieldSources.title).toBe('embedded');
    expect(result.fieldSources.artist).toBe('embedded');
    expect(result.embeddedMetadataStatus).toBe('present');
  });

  it('keeps fallback metadata when TagLib cannot read a preferred odd format', async () => {
    readTagLibMetadataMock.mockRejectedValue(new Error('taglib boom'));

    const result = await new TsMetadataReader().read('D:\\Music\\Odd File.dff');

    expect(result.fields.title).toBe('Odd File');
    expect(result.status).toBe('ok');
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('taglib_metadata_unavailable: taglib boom')]));
    expect(result.errors).toEqual([]);
  });

  it('reads WAV INFO date and track number fields without TagLib help', async () => {
    const root = makeTempRoot();
    const wavePath = join(root, 'Info Track.wav');
    writeWaveWithInfo(wavePath, {
      INAM: 'WAV INFO Title',
      IART: 'WAV INFO Artist',
      IPRD: 'WAV INFO Album',
      IGNR: 'Soundtrack',
      ICRD: '2023-05-01',
      ITRK: '05',
    });

    const result = await new TsMetadataReader().read(wavePath);

    expect(result.fields).toMatchObject({
      title: 'WAV INFO Title',
      artist: 'WAV INFO Artist',
      album: 'WAV INFO Album',
      genre: 'Soundtrack',
      year: 2023,
      trackNo: 5,
    });
    expect(result.fieldSources.year).toBe('embedded');
    expect(result.fieldSources.trackNo).toBe('embedded');
  });

  it('keeps cue sheet track tags and cue duration over source-file fallbacks', async () => {
    const root = makeTempRoot();
    const audioPath = join(root, 'album.wav');
    const cuePath = join(root, 'album.cue');
    writeFileSync(audioPath, 'fake audio');
    writeFileSync(
      cuePath,
      [
        'PERFORMER "Album Artist"',
        'TITLE "Album Title"',
        'FILE "album.wav" WAVE',
        '  TRACK 01 AUDIO',
        '    TITLE "First Song"',
        '    INDEX 01 00:00:00',
        '  TRACK 02 AUDIO',
        '    TITLE "Second Song"',
        '    PERFORMER "Second Artist"',
        '    INDEX 01 03:00:00',
      ].join('\n'),
    );
    parseFileMock.mockResolvedValue(emptyMetadata({
      common: {
        title: 'Source Title',
        artist: 'Source Artist',
        album: 'Source Album',
      },
      format: {
        duration: 240,
        codec: 'PCM',
      },
    }));

    const result = await new TsMetadataReader().read(`${cuePath}#cueTrack=2`);

    expect(result.fields.title).toBe('Second Song');
    expect(result.fields.artist).toBe('Second Artist');
    expect(result.fields.album).toBe('Album Title');
    expect(result.fields.albumArtist).toBe('Album Artist');
    expect(result.fields.trackNo).toBe(2);
    expect(result.fields.duration).toBe(60);
    expect(result.fieldSources.title).toBe('sidecar');
    expect(result.fieldSources.duration).toBe('sidecar');
  });
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
