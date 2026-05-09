import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildFolderHierarchy,
  filterFolderHierarchy,
  flattenFolderHierarchy
} from '../../src/renderer/src/utils/folderHierarchy.js'

const tracks = [
  {
    path: 'D:/Music/Rock/Artist A/Album One/Song 1.flac',
    birthtimeMs: 100
  },
  {
    path: 'D:/Music/Rock/Artist A/Album One/Song 2.flac',
    birthtimeMs: 200
  },
  {
    path: 'D:/Music/Jazz/Artist B/Album Two/Song 3.flac',
    birthtimeMs: 300
  }
]

test('buildFolderHierarchy preserves imported folder levels', () => {
  const tree = buildFolderHierarchy(tracks, ['D:/Music'])
  const flat = flattenFolderHierarchy(tree)

  assert.deepEqual(
    flat.map((folder) => folder.folderPath),
    [
      'D:/Music',
      'D:/Music/Jazz',
      'D:/Music/Jazz/Artist B',
      'D:/Music/Jazz/Artist B/Album Two',
      'D:/Music/Rock',
      'D:/Music/Rock/Artist A',
      'D:/Music/Rock/Artist A/Album One'
    ]
  )
  assert.equal(flat.find((folder) => folder.folderPath === 'D:/Music/Rock')?.tracks.length, 2)
  assert.equal(
    flat.find((folder) => folder.folderPath === 'D:/Music/Rock/Artist A/Album One')?.tracks
      .length,
    2
  )
})

test('filterFolderHierarchy keeps parents for matching descendants', () => {
  const tree = buildFolderHierarchy(tracks, ['D:/Music'])
  const filtered = filterFolderHierarchy(tree, (track) => track.path.includes('Song 3'))
  const flat = flattenFolderHierarchy(filtered)

  assert.deepEqual(
    flat.map((folder) => folder.folderPath),
    [
      'D:/Music',
      'D:/Music/Jazz',
      'D:/Music/Jazz/Artist B',
      'D:/Music/Jazz/Artist B/Album Two'
    ]
  )
  assert.equal(flat[0].tracks.length, 1)
})

test('buildFolderHierarchy falls back to path roots when imported roots are missing', () => {
  const tree = buildFolderHierarchy(tracks, [])
  const flat = flattenFolderHierarchy(tree)

  assert.equal(flat[0].folderPath, 'D:/Music')
  assert.ok(flat.some((folder) => folder.folderPath === 'D:/Music/Rock/Artist A/Album One'))
})
