import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildArtistBucketsWithAvatars,
  getArtistAvatarRetryAfterMs,
  isNeteaseDefaultArtistAvatarUrl,
  isPlatformDefaultArtistAvatarUrl,
  isQqMusicDefaultArtistAvatarUrl,
  isTransientArtistAvatarFailure,
  normalizeArtistAvatarSearchResponse
} from '../../src/renderer/src/utils/artistAvatar.js'

const makeTrack = (path, artist, album, cover) => ({
  path,
  name: `${path}.flac`,
  info: {
    title: path,
    artist,
    album,
    cover
  }
})

test('artist avatar uses remote artist image before track cover', () => {
  const buckets = buildArtistBucketsWithAvatars(
    [makeTrack('song-a', 'Artist A', 'Album A', 'data:image/local-a')],
    {
      artistAvatarMap: {
        'Artist A': 'data:image/remote-a'
      }
    }
  )

  assert.equal(buckets[0].cover, 'data:image/remote-a')
  assert.equal(buckets[0].fallbackCover, 'data:image/local-a')
  assert.equal(buckets[0].coverSource, 'remote')
  assert.equal(buckets[0].hasLocalCover, true)
  assert.equal(buckets[0].hasRemoteAvatar, true)
})

test('artist avatar ignores platform default remote image and uses track cover', () => {
  const defaultAvatar =
    'http://p1.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg?param=600y600'
  const buckets = buildArtistBucketsWithAvatars(
    [makeTrack('song-a', 'Artist A', 'Album A', 'data:image/local-a')],
    {
      artistAvatarMap: {
        'Artist A': defaultAvatar
      }
    }
  )

  assert.equal(buckets[0].cover, 'data:image/local-a')
  assert.equal(buckets[0].fallbackCover, 'data:image/local-a')
  assert.equal(buckets[0].coverSource, 'track')
  assert.equal(buckets[0].hasRemoteAvatar, false)
})

test('artist avatar falls back to owned track cover when remote is missing', () => {
  const buckets = buildArtistBucketsWithAvatars([
    makeTrack('song-a', 'Artist A', 'Album A', 'data:image/local-a')
  ])

  assert.equal(buckets[0].cover, 'data:image/local-a')
  assert.equal(buckets[0].fallbackCover, 'data:image/local-a')
  assert.equal(buckets[0].coverSource, 'track')
  assert.equal(buckets[0].hasLocalCover, true)
  assert.equal(buckets[0].hasRemoteAvatar, false)
})

test('artist avatar does not reuse a shared compilation cover across artists', () => {
  const buckets = buildArtistBucketsWithAvatars([
    makeTrack('song-a', 'Artist A', 'Shared Album', 'data:image/shared'),
    makeTrack('song-b', 'Artist B', 'Shared Album', 'data:image/shared')
  ])

  const artistA = buckets.find((artist) => artist.name === 'Artist A')
  const artistB = buckets.find((artist) => artist.name === 'Artist B')

  assert.equal(artistA.cover, null)
  assert.equal(artistA.fallbackCover, null)
  assert.equal(artistA.coverSource, 'initials')
  assert.equal(artistA.hasLocalCover, false)
  assert.equal(artistB.cover, null)
})

test('artist avatar uses album cover cache before falling back to initials', () => {
  const buckets = buildArtistBucketsWithAvatars(
    [makeTrack('song-a', 'Artist A', 'Singles', '')],
    {
      albumCoverMap: {
        Singles: 'data:image/album-fallback'
      }
    }
  )

  assert.equal(buckets[0].cover, 'data:image/album-fallback')
  assert.equal(buckets[0].fallbackCover, 'data:image/album-fallback')
  assert.equal(buckets[0].coverSource, 'album')
  assert.equal(buckets[0].hasLocalCover, true)
})

test('detects NetEase default artist avatar urls', () => {
  assert.equal(
    isNeteaseDefaultArtistAvatarUrl(
      'http://p1.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg?param=600y600'
    ),
    true
  )
  assert.equal(
    isNeteaseDefaultArtistAvatarUrl(
      'https://p2.music.126.net/r6W-zCnV-aduVn_PLZYuYg==/109951168529049969.jpg'
    ),
    true
  )
  assert.equal(
    isNeteaseDefaultArtistAvatarUrl(
      'https://p1.music.126.net/realArtistImageToken/109951167579824884.jpg'
    ),
    false
  )
})

test('detects platform default artist avatar urls', () => {
  assert.equal(
    isQqMusicDefaultArtistAvatarUrl(
      'https://y.qq.com/music/photo_new/T001R500x500M00000000000000000.jpg'
    ),
    true
  )
  assert.equal(
    isPlatformDefaultArtistAvatarUrl(
      'https://y.qq.com/music/photo_new/T001R500x500M0000025NhlN2yWrP4.jpg'
    ),
    false
  )
})

test('artist avatar search response preserves transient provider failures', () => {
  const result = normalizeArtistAvatarSearchResponse({
    ok: false,
    artists: [],
    error: 'rate_limited_or_network',
    transient: true,
    retryAfterMs: 45000
  })

  assert.deepEqual(result.candidates, [])
  assert.equal(result.transient, true)
  assert.equal(result.retryAfterMs, 45000)
})

test('artist avatar search response accepts legacy array results', () => {
  const candidates = [{ name: 'Artist A', picUrl: 'https://example.test/a.jpg' }]
  const result = normalizeArtistAvatarSearchResponse(candidates)

  assert.equal(result.candidates, candidates)
  assert.equal(result.transient, false)
})

test('artist avatar transient detection includes HTTP rate-limit style failures', () => {
  assert.equal(isTransientArtistAvatarFailure({ status: 429 }), true)
  assert.equal(isTransientArtistAvatarFailure({ status: 403 }), true)
  assert.equal(isTransientArtistAvatarFailure({ error: 'timeout' }), true)
  assert.equal(isTransientArtistAvatarFailure({ error: 'not_image' }), false)
  assert.equal(getArtistAvatarRetryAfterMs({ retryAfterMs: 1200 }), 1200)
})
