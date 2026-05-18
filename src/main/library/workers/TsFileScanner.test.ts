import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TsFileScanner } from './TsFileScanner';

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = join(tmpdir(), `echo-next-file-scanner-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
};

const collectNames = async (root: string): Promise<string[]> => {
  const scanner = new TsFileScanner();
  const files = [];

  for await (const file of scanner.scanFolder(root)) {
    files.push(file.path.split(/[\\/]/).pop() ?? file.path);
  }

  return files.sort();
};

describe('TsFileScanner', () => {
  it('discovers newly supported audio formats without importing cue sheets', async () => {
    const root = makeTempRoot();
    const nested = join(root, 'nested');
    mkdirSync(nested, { recursive: true });
    const supported = [
      'track.alac',
      'track.opus',
      'track.dsf',
      'track.dff',
      'track.aiff',
      'track.aif',
      'track.ape',
      'track.wv',
      'track.tta',
      'track.tak',
      'track.mka',
      'track.mkv',
      'track.mp4',
      'track.m4p',
    ];

    for (const fileName of ['album.cue', ...supported]) {
      writeFileSync(join(nested, fileName), 'audio');
    }

    expect(await collectNames(root)).toEqual(supported.sort());
  });

  it('ignores artwork, text, and lyric files', async () => {
    const root = makeTempRoot();
    const files = ['cover.jpg', 'cover.png', 'notes.txt', 'song.lrc', 'song.flac'];

    for (const fileName of files) {
      writeFileSync(join(root, fileName), 'file');
    }

    expect(await collectNames(root)).toEqual(['song.flac']);
  });
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
