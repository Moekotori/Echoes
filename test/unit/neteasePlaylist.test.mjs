import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchNeteaseSongsByTrackIds, parseNeteasePlaylistId } from '../../src/main/neteasePlaylist.js'

test('parseNeteasePlaylistId handles ids and common playlist URLs', () => {
  assert.equal(parseNeteasePlaylistId('123456789'), '123456789')
  assert.equal(
    parseNeteasePlaylistId('https://music.163.com/#/playlist?id=123456789'),
    '123456789'
  )
  assert.equal(parseNeteasePlaylistId('https://music.163.com/playlist/123456789'), '123456789')
})

test('fetchNeteaseSongsByTrackIds batches song detail requests beyond 1000 tracks', async () => {
  const requestedBatches = []
  const ncm = {
    async song_detail(params) {
      const ids = String(params.ids || '').split(',')
      requestedBatches.push(ids)
      return {
        body: {
          songs: ids.map((id) => ({
            id: Number(id),
            name: `Song ${id}`,
            ar: [{ name: 'Artist' }],
            al: { name: 'Album' }
          }))
        }
      }
    }
  }
  const ids = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }))
  const songs = await fetchNeteaseSongsByTrackIds(ncm, ids, { cookie: 'MUSIC_U=x' })

  assert.equal(songs.length, 1001)
  assert.deepEqual(
    requestedBatches.map((batch) => batch.length),
    [500, 500, 1]
  )
  assert.equal(songs[0].id, 1)
  assert.equal(songs[999].id, 1000)
  assert.equal(songs[1000].id, 1001)
})

test('fetchNeteaseSongsByTrackIds preserves playlist order and duplicate track ids', async () => {
  const ncm = {
    async song_detail(params) {
      const ids = String(params.ids || '').split(',')
      return {
        body: {
          songs: ids.map((id) => ({ id: Number(id), name: `Song ${id}` }))
        }
      }
    }
  }

  const songs = await fetchNeteaseSongsByTrackIds(ncm, [{ id: 9 }, { id: 3 }, { id: 9 }])
  assert.deepEqual(
    songs.map((song) => song.id),
    [9, 3, 9]
  )
})
