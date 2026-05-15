import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const workerMockState = vi.hoisted(() => ({
  workers: [] as Array<{
    source: string;
    options: { eval?: boolean; workerData?: unknown };
    instance: EventEmitter;
  }>,
}));

vi.mock('node:worker_threads', () => ({
  Worker: class MockWorker extends EventEmitter {
    constructor(source: string, options: { eval?: boolean; workerData?: unknown }) {
      super();
      workerMockState.workers.push({ source, options, instance: this });
      queueMicrotask(() => {
        this.emit('message', { ok: true });
        this.emit('exit', 0);
      });
    }
  },
}));

describe('writeEmbeddedTrackTags', () => {
  it('runs embedded tag writes in a worker', async () => {
    const { writeEmbeddedTrackTags } = await import('./TagWriter');

    await writeEmbeddedTrackTags({
      filePath: 'D:/Music/song.wav',
      tags: {
        title: 'Title',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Album Artist',
        trackNo: 1,
        discNo: 1,
        year: 2026,
        genre: 'Pop',
      },
      coverData: { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    });

    expect(workerMockState.workers).toHaveLength(1);
    expect(workerMockState.workers[0].options.eval).toBe(true);
    expect(workerMockState.workers[0].options.workerData).toMatchObject({
      filePath: 'D:/Music/song.wav',
      tags: {
        title: 'Title',
        albumArtist: 'Album Artist',
      },
      coverData: {
        mimeType: 'image/png',
      },
    });
    expect(workerMockState.workers[0].source).toContain('applyTagsToFile');
    expect(workerMockState.workers[0].source).toContain('applyCoverArt');
  });
});
