import test from 'node:test'
import assert from 'node:assert/strict'

import {
  JellyfinClient,
  createJellyfinTrackPath,
  mapJellyfinAudio,
  mapJellyfinAlbum,
  parseJellyfinTrackPath
} from '../../src/main/remote/JellyfinClient.js'

test('JellyfinClient normalizes pasted web URLs to the server root', () => {
  const client = new JellyfinClient({
    serverUrl: 'media.local:8096/web/index.html',
    username: 'moe',
    password: 'secret',
    type: 'jellyfin'
  })

  assert.equal(client.buildUrl('/Users/AuthenticateByName'), 'http://media.local:8096/Users/AuthenticateByName')
})

test('creates and parses Jellyfin and Emby remote track paths', () => {
  const jellyfinPath = createJellyfinTrackPath('source 1', 'item/42', 'media source', 'jellyfin')
  assert.deepEqual(parseJellyfinTrackPath(jellyfinPath), {
    type: 'jellyfin',
    sourceId: 'source 1',
    itemId: 'item/42',
    mediaSourceId: 'media source'
  })

  const embyPath = createJellyfinTrackPath('emby', 'song', '', 'emby')
  assert.equal(parseJellyfinTrackPath(embyPath).type, 'emby')
})

test('maps Jellyfin audio without leaking credentials into the track path', () => {
  const source = {
    id: 'jf-1',
    type: 'jellyfin',
    name: 'Home Jellyfin'
  }
  const client = new JellyfinClient({
    serverUrl: 'http://media.local:8096',
    username: 'moe',
    password: 'secret',
    type: 'jellyfin'
  })
  client.accessToken = 'token-secret'
  client.userId = 'user-1'

  const track = mapJellyfinAudio(
    source,
    {
      Id: 'audio-1',
      Name: 'I cannot wait',
      Artists: ['Miku'],
      Album: 'Single',
      AlbumId: 'album-1',
      Container: 'flac',
      RunTimeTicks: 2150000000,
      MediaSources: [{ Id: 'media-1', Bitrate: 1411000 }],
      MediaStreams: [{ Type: 'Audio', Codec: 'flac', SampleRate: 44100, BitDepth: 16, Channels: 2 }]
    },
    client
  )

  assert.equal(track.path, createJellyfinTrackPath('jf-1', 'audio-1', 'media-1', 'jellyfin'))
  assert.equal(track.remoteType, 'jellyfin')
  assert.equal(track.duration, 215)
  assert.equal(track.info.codec, 'FLAC')
  assert.equal(track.info.sampleRateHz, 44100)
  assert.equal(track.info.cover.includes('api_key=token-secret'), true)
  assert.equal(track.path.includes('token-secret'), false)
})

test('maps Jellyfin albums to the existing remote album card shape', () => {
  const album = mapJellyfinAlbum(
    { id: 'jf-1', type: 'jellyfin' },
    {
      Id: 'album-1',
      Name: 'Album Name',
      AlbumArtist: 'Artist Name',
      ChildCount: 12,
      RunTimeTicks: 36000000000,
      ProductionYear: 2025
    },
    null
  )

  assert.equal(album.title, 'Album Name')
  assert.equal(album.artist, 'Artist Name')
  assert.equal(album.songCount, 12)
  assert.equal(album.duration, 3600)
})
