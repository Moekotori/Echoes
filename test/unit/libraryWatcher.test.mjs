import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import { getCueAudioPath } from '../../src/shared/cueTracks.mjs'
import {
  collectAudioFilesRecursive,
  createLibraryWatchManager,
  rescanImportedFolders
} from '../../src/main/utils/libraryWatcher.js'

async function withTempLibrary(callback) {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'echo-library-watch-'))
  try {
    return await callback(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('collectAudioFilesRecursive defaults to fast FLAC scan without parsing embedded cues', async () => {
  await withTempLibrary(async (root) => {
    const flacPath = join(root, 'album.flac')
    await fs.writeFile(flacPath, 'not a real flac')
    let parserCalls = 0
    const entries = []

    await collectAudioFilesRecursive(flacPath, entries, {
      log: false,
      metadataParser: async () => {
        parserCalls += 1
        throw new Error('metadata parser should not run during fast scan')
      }
    })

    assert.equal(parserCalls, 0)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].path, flacPath)
  })
})

test('collectAudioFilesRecursive can expand embedded FLAC cues when explicitly requested', async () => {
  await withTempLibrary(async (root) => {
    const flacPath = join(root, 'album.flac')
    await fs.writeFile(flacPath, 'fake flac bytes')
    const cue = `
TITLE "Album"
PERFORMER "Artist"
TRACK 01 AUDIO
  TITLE "Intro"
  INDEX 01 00:00:00
TRACK 02 AUDIO
  TITLE "Main"
  INDEX 01 01:00:00
`
    let parserCalls = 0
    const entries = []

    await collectAudioFilesRecursive(flacPath, entries, {
      expandEmbeddedCue: true,
      log: false,
      metadataParser: async () => {
        parserCalls += 1
        return {
          native: {
            vorbis: [{ id: 'CUESHEET', value: cue }]
          },
          format: {
            duration: 150
          }
        }
      }
    })

    assert.equal(parserCalls, 1)
    assert.equal(entries.length, 2)
    assert.equal(getCueAudioPath(entries[0].path), flacPath)
    assert.equal(entries[0].info.title, 'Intro')
    assert.equal(entries[1].info.title, 'Main')
  })
})

test('rescanImportedFolders defaults to fast scan without parsing FLAC cues', async () => {
  await withTempLibrary(async (root) => {
    await fs.writeFile(join(root, 'song.flac'), 'fake flac bytes')
    let parserCalls = 0

    const entries = await rescanImportedFolders([root], [], {
      log: false,
      metadataParser: async () => {
        parserCalls += 1
        throw new Error('metadata parser should not run during default rescan')
      }
    })

    assert.equal(parserCalls, 0)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'song.flac')
  })
})

test('library watcher start seeds from existing tracks without a full scan', async () => {
  await withTempLibrary(async (root) => {
    const flacPath = join(root, 'seed.flac')
    await fs.writeFile(flacPath, 'fake flac bytes')
    let scanCalls = 0
    const manager = createLibraryWatchManager({
      onChange: () => {},
      scanFoldersImpl: async () => {
        scanCalls += 1
        throw new Error('watcher start should not scan')
      }
    })

    try {
      const result = await manager.start(
        [root],
        [
          {
            name: 'seed.flac',
            path: flacPath,
            folder: root,
            mtimeMs: 1,
            sizeBytes: 2
          }
        ]
      )

      assert.equal(result.ok, true)
      assert.equal(result.seededTracks, 1)
      assert.equal(scanCalls, 0)
    } finally {
      manager.stop()
    }
  })
})
