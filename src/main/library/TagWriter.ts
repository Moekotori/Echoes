import { Worker } from 'node:worker_threads';

import type { EditableTrackTags } from './libraryTypes';

type EmbeddedCoverData = {
  data: Uint8Array;
  mimeType: string;
};

type TagWriteRequest = {
  filePath: string;
  tags: EditableTrackTags;
  coverData: EmbeddedCoverData | null;
};

const workerSource = String.raw`
const { parentPort, workerData } = module['require']('node:worker_threads');

(async () => {
  const [{ applyCoverArt, applyTagsToFile }, fs] = await Promise.all([
    import('taglib-wasm'),
    import('node:fs/promises'),
  ]);

  const { filePath, tags, coverData } = workerData;

  await applyTagsToFile(filePath, {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumArtist: tags.albumArtist,
    track: tags.trackNo ?? 0,
    discNumber: tags.discNo ?? 0,
    year: tags.year ?? 0,
    genre: tags.genre ?? '',
  });

  if (coverData) {
    const updatedAudio = await applyCoverArt(filePath, new Uint8Array(coverData.data), coverData.mimeType);
    await fs.writeFile(filePath, Buffer.from(updatedAudio));
  }

  parentPort.postMessage({ ok: true });
})().catch((error) => {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  });
});
`;

const tagWriteQueues = new Map<string, Promise<void>>();

export const writeEmbeddedTrackTags = async (request: TagWriteRequest): Promise<void> => {
  const previousWrite = tagWriteQueues.get(request.filePath) ?? Promise.resolve();
  const nextWrite = previousWrite.catch(() => undefined).then(() => runTagWriterWorker(request));
  const queuedWrite = nextWrite.finally(() => {
    if (tagWriteQueues.get(request.filePath) === queuedWrite) {
      tagWriteQueues.delete(request.filePath);
    }
  });

  tagWriteQueues.set(request.filePath, queuedWrite);
  void queuedWrite.catch(() => undefined);

  return nextWrite;
};

const runTagWriterWorker = (request: TagWriteRequest): Promise<void> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: request,
    });

    worker.once('message', (message: { ok: boolean; message?: string }) => {
      if (message.ok) {
        resolve();
      } else {
        reject(new Error(message.message ?? 'Unknown tag writer failure'));
      }
    });

    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Tag writer worker exited with code ${code}`));
      }
    });
  });
