import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildParsedPlaylistWithCache,
  compareTrackFrequent,
  compareTrackRandom,
  getTrackAlbumGroupKey,
  getTrackAlbumName,
  normalizeAlbumNameKey,
  parseTrackInfo,
  resolveTrackIdentityFromMetadata
} from '../../src/renderer/src/utils/trackUtils.js'

const makeTrack = (path, fileName) => ({
  path,
  info: {
    fileName,
    title: fileName,
    trackNo: null,
    discNo: null
  }
})

test('parseTrackInfo strips embedded NUL control characters from FLAC tags', () => {
  const title = '\u516d\u7b49\u661f\u306e\u591c'
  const info = parseTrackInfo(
    {
      path: `D:/Music/Aimer/01.${title}.flac`,
      name: `01.${title}.flac`
    },
    {
      title: `${title}\u0000`,
      artist: 'Aimer\u0000',
      album: 'BEST SELECTION "blanc"\u0000',
      albumArtist: 'Aimer\u0000'
    }
  )

  assert.equal(info.title, title)
  assert.equal(info.artist, 'Aimer')
  assert.equal(info.album, 'BEST SELECTION "blanc"')
})

test('parseTrackInfo does not split audio quality suffixes as artist title separators', () => {
  const info = parseTrackInfo(
    {
      path: 'C:/Users/Moe/Downloads/10.13 Staff Credits [5.1ch 96kHz-24bit].flac',
      name: '10.13 Staff Credits [5.1ch 96kHz-24bit].flac'
    },
    {
      title: 'Staff Credits [5.1ch 96kHz/24bit]',
      artist: 'Nintendo',
      album: 'The Legend of Zelda: Tears of the Kingdom Original Soundtrack',
      trackNo: 13,
      discNo: 10
    }
  )

  assert.equal(info.title, 'Staff Credits')
  assert.equal(info.artist, 'Nintendo')
  assert.equal(info.trackNo, 13)
})

test('filename identity ignores separators inside bracketed technical suffixes', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '10.13 Staff Credits [5.1ch 96kHz-24bit].flac',
    title: '',
    artist: ''
  })

  assert.equal(identity.title, '10.13 Staff Credits')
  assert.equal(identity.artist, 'Unknown Artist')
})

test('cached audio quality title fragments are repaired from the file name', () => {
  const info = parseTrackInfo(
    {
      path: 'C:/Users/Moe/Downloads/10.13 Staff Credits [5.1ch 96kHz-24bit].flac',
      name: '10.13 Staff Credits [5.1ch 96kHz-24bit].flac'
    },
    {
      title: '24bit]',
      artist: 'Nintendo',
      trackNo: 13,
      discNo: 10
    }
  )

  assert.equal(info.title, 'Staff Credits')
  assert.equal(info.artist, 'Nintendo')
})

test('compareTrackFrequent sorts by play count then last played time', () => {
  const tracks = [
    makeTrack('D:/Music/a.flac', 'A'),
    makeTrack('D:/Music/b.flac', 'B'),
    makeTrack('D:/Music/c.flac', 'C')
  ]

  const trackStats = {
    'D:/Music/a.flac': { playCount: 2, lastPlayedAt: 100 },
    'D:/Music/b.flac': { playCount: 5, lastPlayedAt: 50 },
    'D:/Music/c.flac': { playCount: 2, lastPlayedAt: 200 }
  }

  const sorted = [...tracks].sort((a, b) => compareTrackFrequent(a, b, trackStats))

  assert.deepEqual(
    sorted.map((track) => track.path),
    ['D:/Music/b.flac', 'D:/Music/c.flac', 'D:/Music/a.flac']
  )
})

test('compareTrackFrequent falls back to album track order', () => {
  const tracks = [
    {
      path: 'D:/Music/02.flac',
      info: { fileName: '02', title: 'Second', trackNo: 2, discNo: 1 }
    },
    {
      path: 'D:/Music/01.flac',
      info: { fileName: '01', title: 'First', trackNo: 1, discNo: 1 }
    }
  ]

  const sorted = [...tracks].sort((a, b) => compareTrackFrequent(a, b, {}))

  assert.deepEqual(
    sorted.map((track) => track.path),
    ['D:/Music/01.flac', 'D:/Music/02.flac']
  )
})

test('compareTrackRandom is stable for a seed and changes with a new seed', () => {
  const tracks = [
    makeTrack('D:/Music/a.flac', 'A'),
    makeTrack('D:/Music/b.flac', 'B'),
    makeTrack('D:/Music/c.flac', 'C'),
    makeTrack('D:/Music/d.flac', 'D'),
    makeTrack('D:/Music/e.flac', 'E')
  ]

  const first = [...tracks].sort((a, b) => compareTrackRandom(a, b, 'seed-a')).map((t) => t.path)
  const second = [...tracks].sort((a, b) => compareTrackRandom(a, b, 'seed-a')).map((t) => t.path)
  const reshuffled = [...tracks]
    .sort((a, b) => compareTrackRandom(a, b, 'seed-b'))
    .map((t) => t.path)

  assert.deepEqual(second, first)
  assert.notDeepEqual(reshuffled, first)
})

test('buildParsedPlaylistWithCache reuses unchanged parsed track objects', () => {
  const playlist = [
    { path: 'D:/Music/a.flac', name: '01 - Alpha.flac' },
    { path: 'D:/Music/b.flac', name: '02 - Beta.flac' },
    { path: 'D:/Music/c.flac', name: '03 - Gamma.flac' }
  ]
  const metaA = { title: 'Alpha' }
  const metaB = { title: 'Beta' }
  const metaC = { title: 'Gamma' }
  const first = buildParsedPlaylistWithCache(null, playlist, {
    'D:/Music/a.flac': metaA,
    'D:/Music/b.flac': metaB,
    'D:/Music/c.flac': metaC
  })
  const second = buildParsedPlaylistWithCache(first.cache, playlist, {
    'D:/Music/a.flac': metaA,
    'D:/Music/b.flac': { title: 'Beta updated' },
    'D:/Music/c.flac': metaC
  })

  assert.equal(second.items[0], first.items[0])
  assert.notEqual(second.items[1], first.items[1])
  assert.equal(second.items[2], first.items[2])
  assert.equal(second.items[1].info.title, 'Beta updated')
})

test('embedded title with dash is not split as artist title text', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '09.\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-.flac',
    title: '\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-',
    artist: '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3'
  })

  assert.equal(identity.title, '\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-')
  assert.equal(identity.artist, '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3')
  assert.equal(identity.source, 'metadata')
})

test('embedded title with dash and missing artist is not split into artist', () => {
  const info = parseTrackInfo(
    {
      path: 'D:/Music/Sakanaction/09.\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-.flac',
      name: '09.\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-.flac'
    },
    {
      title: '\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-',
      artist: ''
    }
  )

  assert.equal(info.title, '\u30bb\u30d7\u30c6\u30f3\u30d0\u30fc -\u6771\u4eac version-')
  assert.equal(info.artist, 'Unknown Artist')
})

test('filename artist-title fallback still works when metadata title is missing', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3 - \u65b0\u5b9d\u5cf6.flac',
    title: '',
    artist: ''
  })

  assert.equal(identity.title, '\u65b0\u5b9d\u5cf6')
  assert.equal(identity.artist, '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3')
  assert.equal(identity.source, 'filename')
})

test('embedded title can safely borrow filename artist only when parsed title matches', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3 - \u65b0\u5b9d\u5cf6.flac',
    title: '\u65b0\u5b9d\u5cf6',
    artist: ''
  })

  assert.equal(identity.title, '\u65b0\u5b9d\u5cf6')
  assert.equal(identity.artist, '\u30b5\u30ab\u30ca\u30af\u30b7\u30e7\u30f3')
  assert.equal(identity.source, 'metadata')
})

test('embedded title beats mismatched filename identity', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: 'Wrong Artist - Wrong Title.flac',
    title: 'A - B',
    artist: 'Real Artist'
  })

  assert.equal(identity.title, 'A - B')
  assert.equal(identity.artist, 'Real Artist')
  assert.equal(identity.source, 'metadata')
})

test('keeps normal metadata when it is not a truncated filename suffix', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: 'Lyn - Beneath the Mask -rain-.flac',
    title: 'Beneath the Mask',
    artist: 'Lyn'
  })

  assert.equal(identity.title, 'Beneath the Mask')
  assert.equal(identity.artist, 'Lyn')
  assert.equal(identity.source, 'metadata')
})

test('keeps Latin hyphenated titles intact', () => {
  const artist = '\u9e7f\u4e43'
  const identity = resolveTrackIdentityFromMetadata({
    fileName: `${artist} - Stella-rium.flac`,
    title: 'Stella-rium',
    artist
  })

  assert.equal(identity.title, 'Stella-rium')
  assert.equal(identity.artist, artist)
  assert.equal(identity.source, 'metadata')
})

test('parseTrackInfo ignores numeric track ranges misread as artist names', () => {
  const info = parseTrackInfo(
    {
      path: 'D:/Music/King Crimson/In The Court/02 - Epitaph.flac',
      name: '02 - Epitaph.flac'
    },
    {
      title: 'Epitaph',
      artist: '2-4',
      albumArtist: 'King Crimson',
      album: '1969 - In The Court Of The Crimson King'
    }
  )

  assert.equal(info.artist, 'King Crimson')
  assert.equal(info.album, 'In The Court Of The Crimson King')
})

test('metadata title track numbers are not promoted to artist names', () => {
  const identity = resolveTrackIdentityFromMetadata({
    fileName: '02 - Epitaph.flac',
    title: '2-4 - Epitaph',
    artist: ''
  })

  assert.equal(identity.title, '2-4 - Epitaph')
  assert.equal(identity.artist, 'Unknown Artist')
})

test('album group key uses embedded album and album artist identity', () => {
  const track = {
    path: 'D:/Folder Name/Wrong Artist - Wrong Title.flac',
    name: 'Wrong Artist - Wrong Title.flac',
    info: {
      title: 'Right Title',
      artist: 'Guest Singer',
      album: 'Real Album',
      albumArtist: 'Band A',
      metadataSource: 'embedded',
      fieldSources: {
        title: 'embedded',
        artist: 'embedded',
        album: 'embedded',
        albumArtist: 'embedded'
      }
    }
  }

  assert.equal(getTrackAlbumGroupKey(track), 'real album\u0001artist:banda')
})

test('metadata editor initialization avoids parsed track info fallbacks', () => {
  const appSource = readFileSync(new URL('../../src/renderer/src/App.jsx', import.meta.url), 'utf8')
  const drawerSource = readFileSync(
    new URL('../../src/renderer/src/components/MetadataEditorDrawer.jsx', import.meta.url),
    'utf8'
  )
  const drawerMountStart = appSource.indexOf('<MetadataEditorDrawer')
  const drawerMount = appSource.slice(
    drawerMountStart,
    appSource.indexOf('<CastReceiveDrawer', drawerMountStart)
  )

  assert.ok(drawerMount.includes('initialMetadata='))
  assert.equal(drawerMount.includes('parseTrackInfo'), false)
  assert.equal(drawerMount.includes('stripExtension(metadataEditorTrack.name'), false)
  assert.equal(drawerSource.includes('setTitle(String(response.title || initialMetadata'), false)
  assert.equal(drawerSource.includes('setArtist(String(response.artist || initialMetadata'), false)
})

test('album names strip folder-style leading years for grouping', () => {
  assert.equal(
    getTrackAlbumName({ info: { album: '2004 - 在动物园散步才是正经事' } }),
    '在动物园散步才是正经事'
  )
  assert.equal(
    normalizeAlbumNameKey('2004 - 在动物园散步才是正经事'),
    normalizeAlbumNameKey('在动物园散步才是正经事')
  )
})
