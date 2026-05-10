import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import axios from 'axios'

import {
  getQqMusicPlaylistTracks,
  parseQqMusicPlaylistId,
  resolveQqMusicPlaylistId
} from '../../src/main/qqMusicProvider.js'

function makeQqSong(index) {
  return {
    mid: `mid${index}`,
    name: `Song ${index}`,
    singer: [{ name: 'Artist' }],
    album: { name: 'Album', mid: 'albumMid' },
    interval: 180,
    file: {
      media_mid: `media${index}`,
      size_128mp3: 1000
    }
  }
}

test('parseQqMusicPlaylistId handles common direct QQ Music playlist URLs', () => {
  assert.equal(parseQqMusicPlaylistId('9710316454'), '9710316454')
  assert.equal(
    parseQqMusicPlaylistId('https://i.y.qq.com/n2/m/share/details/taoge.html?id=9710316454'),
    '9710316454'
  )
  assert.equal(
    parseQqMusicPlaylistId('https://y.qq.com/n/ryqq/playlist/9710316454'),
    '9710316454'
  )
})

test('resolveQqMusicPlaylistId expands QQ Music c6 short links', async () => {
  mock.method(axios, 'get', async () => ({
    headers: {
      location:
        'https://i.y.qq.com/n2/m/share/details/taoge.html?ADTAG=pc_v17&channelId=10036163&id=9710316454&openinqqmusic=1'
    }
  }))

  try {
    const playlistId = await resolveQqMusicPlaylistId(
      'https://c6.y.qq.com/base/fcgi-bin/u?__=7Toz2QQtM99f'
    )
    assert.equal(playlistId, '9710316454')
  } finally {
    mock.restoreAll()
  }
})

test('getQqMusicPlaylistTracks paginates large playlists beyond 1000 songs concurrently', async () => {
  const total = 4501
  const pageStarts = []
  let activeRequests = 0
  let maxActiveRequests = 0

  mock.method(axios, 'post', async (_url, payload) => {
    const param = payload?.req_0?.param || {}
    const begin = Number(param.song_begin || 0)
    const count = Number(param.song_num || 0)
    pageStarts.push(begin)
    activeRequests += 1
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
    await new Promise((resolve) => setTimeout(resolve, 5))
    activeRequests -= 1

    const pageCount = Math.max(0, Math.min(count, total - begin))
    return {
      data: {
        req_0: {
          data: {
            dissname: 'Huge QQ Playlist',
            dirinfo: { songnum: total },
            songlist: Array.from({ length: pageCount }, (_, offset) =>
              makeQqSong(begin + offset + 1)
            )
          }
        }
      }
    }
  })

  try {
    const result = await getQqMusicPlaylistTracks({ playlistId: '123456' })

    assert.equal(result.name, 'Huge QQ Playlist')
    assert.equal(result.tracks.length, total)
    assert.equal(result.tracks[0].mid, 'mid1')
    assert.equal(result.tracks[1000].mid, 'mid1001')
    assert.equal(result.tracks[4500].mid, 'mid4501')
    assert.deepEqual(pageStarts, [0, 1000, 2000, 3000, 4000])
    assert.ok(maxActiveRequests > 1)
    assert.ok(maxActiveRequests <= 4)
  } finally {
    mock.restoreAll()
  }
})

test('getQqMusicPlaylistTracks honors an explicit finite limit without clamping to one page', async () => {
  const requestedPages = []

  mock.method(axios, 'post', async (_url, payload) => {
    const param = payload?.req_0?.param || {}
    const begin = Number(param.song_begin || 0)
    const count = Number(param.song_num || 0)
    requestedPages.push({ begin, count })
    return {
      data: {
        req_0: {
          data: {
            dissname: 'Limited QQ Playlist',
            total_song_num: 2500,
            songlist: Array.from({ length: count }, (_, offset) => makeQqSong(begin + offset + 1))
          }
        }
      }
    }
  })

  try {
    const result = await getQqMusicPlaylistTracks({ playlistId: '123456', limit: 1200 })

    assert.equal(result.tracks.length, 1200)
    assert.deepEqual(requestedPages, [
      { begin: 0, count: 1000 },
      { begin: 1000, count: 200 }
    ])
  } finally {
    mock.restoreAll()
  }
})
