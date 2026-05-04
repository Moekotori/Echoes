import test from 'node:test'
import assert from 'node:assert/strict'

import {
  analyzeBilibiliAutoMvMatch,
  buildBilibiliAutoMvQueries,
  buildYoutubeAutoMvQueries,
  rankBilibiliVideoResults,
  rankYoutubeVideoResults
} from '../../src/shared/mvSearchRank.mjs'

test('Bilibili auto MV queries prefer plain song plus artist before MV-decorated searches', () => {
  assert.deepEqual(buildBilibiliAutoMvQueries('Blue Planet', 'Miku'), [
    'blue planet miku',
    'blue planet miku MV',
    'blue planet miku official MV',
    'blue planet MV',
    'blue planet official MV',
    'blue planet'
  ])
})

test('YouTube auto MV queries also start with song plus artist', () => {
  assert.deepEqual(buildYoutubeAutoMvQueries('Dream!', "Poppin'Party"), [
    'dream poppin party',
    'dream poppin party official MV',
    'dream poppin party music video',
    'dream official MV',
    'dream music video',
    'dream'
  ])
})

test('Auto MV queries ignore unknown artist placeholders', () => {
  assert.deepEqual(buildBilibiliAutoMvQueries('Blue Planet', 'unknown artist'), [
    'blue planet MV',
    'blue planet official MV',
    'blue planet'
  ])
  assert.deepEqual(buildYoutubeAutoMvQueries('Blue Planet', 'unknown artist'), [
    'blue planet official MV',
    'blue planet music video',
    'blue planet'
  ])
})

test('Bilibili ranking keeps an official title and artist match auto-acceptable', () => {
  const ranked = rankBilibiliVideoResults(
    [
      { bvid: 'BV1111111111', title: 'Blue Planet official MV', author: 'Miku' },
      { bvid: 'BV2222222222', title: 'Blue Planet piano cover official MV', author: 'cover' }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV1111111111')
  assert.equal(ranked[0].autoAccepted, true)
})

test('Bilibili ranking demotes obvious cover or tutorial results for auto matching', () => {
  const ranked = rankBilibiliVideoResults(
    [
      { bvid: 'BV1111111111', title: 'Blue Planet piano cover tutorial', author: 'cover' },
      { bvid: 'BV2222222222', title: 'Blue Planet official MV', author: 'Miku' }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili auto matching rejects short-title hits without artist evidence', () => {
  const match = analyzeBilibiliAutoMvMatch(
    { bvid: 'BV1111111111', title: "I Can't Wait official MV", author: 'Random Label' },
    "I Can't Wait Miku MV",
    { title: "I Can't Wait", artist: 'Miku' }
  )

  assert.equal(match.accepted, false)
  assert.equal(match.reason, 'artist_mismatch')
})

test('Bilibili ranking rejects gameplay videos even when they contain the song title', () => {
  const ranked = rankBilibiliVideoResults(
    [
      { bvid: 'BV1111111111', title: 'Dream! taxi driving simulator gameplay', author: 'Game Channel' },
      { bvid: 'BV2222222222', title: "Poppin'Party - Dream! official MV", author: "Poppin'Party" }
    ],
    "Dream Poppin'Party",
    { title: 'Dream!', artist: "Poppin'Party" }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili auto matching rejects unrelated vlog results for symbol-heavy titles', () => {
  const match = analyzeBilibiliAutoMvMatch(
    { bvid: 'BV1111111111', title: '得得地nn 日常分享', author: 'random uploader' },
    'δ for the delta かめりあ',
    { title: 'δ:for the DELTA', artist: 'かめりあ' }
  )

  assert.equal(match.accepted, false)
  assert.equal(match.reason, 'title_mismatch')
})

test('YouTube ranking uses the same title and artist gate for auto MV selection', () => {
  const ranked = rankYoutubeVideoResults(
    [
      { id: 'badbadbad01', title: 'Dream! taxi driving simulator gameplay', author: 'Game Channel' },
      { id: 'goodgoodg02', title: "Poppin'Party - Dream! official MV", author: "Poppin'Party" }
    ],
    "Dream Poppin'Party",
    { title: 'Dream!', artist: "Poppin'Party" }
  )

  assert.equal(ranked[0].id, 'goodgoodg02')
  assert.equal(ranked[0].autoAccepted, true)
  assert.equal(ranked.find((item) => item.id === 'badbadbad01')?.autoAccepted, false)
})
