import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WebDavClient,
  createWebDavTrackPath,
  mapWebDavFile,
  parseWebDavTrackPath
} from '../../src/main/remote/WebDavClient.js'

test('WebDavClient defaults bare server addresses to HTTPS', () => {
  const client = new WebDavClient({
    serverUrl: 'alist.example.com/dav/music',
    username: '',
    password: ''
  })

  assert.equal(
    client.buildUrl('/Album/I cannot wait.flac'),
    'https://alist.example.com/dav/music/Album/I%20cannot%20wait.flac'
  )
})

test('mapWebDavFile creates a stable remote track without leaking credentials', () => {
  const source = {
    id: 'cloud-1',
    name: '网盘音乐'
  }
  const track = mapWebDavFile(source, {
    path: '/Album/I cannot wait.flac',
    size: 1024,
    mtimeMs: 123
  })

  assert.equal(track.path, createWebDavTrackPath('cloud-1', '/Album/I cannot wait.flac'))
  assert.deepEqual(parseWebDavTrackPath(track.path), {
    sourceId: 'cloud-1',
    itemPath: '/Album/I cannot wait.flac'
  })
  assert.equal(track.remoteType, 'webdav')
  assert.equal(track.info.source, '网盘音乐')
  assert.equal(track.info.streamUrl, undefined)
})
