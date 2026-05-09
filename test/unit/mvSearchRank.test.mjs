import test from 'node:test'
import assert from 'node:assert/strict'

import {
  analyzeBilibiliAutoMvMatch,
  buildBilibiliAutoMvQueries,
  buildYoutubeAutoMvQueries,
  parsePopularityCount,
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

test('Bilibili ranking uses play count to choose between acceptable MV matches', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: 'Blue Planet Miku official MV',
        author: 'fan mirror',
        play: 580
      },
      {
        bvid: 'BV2222222222',
        title: 'Blue Planet Miku official MV',
        author: 'Miku Official',
        play: '320.5\u4e07'
      }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked[0].playCount, 3205000)
  assert.equal(ranked[0].autoAccepted, true)
})

test('Bilibili ranking lets a very hot fan edit beat a weaker official candidate', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: 'Blue Planet Miku \u4e8c\u521b\u526a\u8f91 MV',
        author: 'fan edit',
        play: 9000000
      },
      { bvid: 'BV2222222222', title: 'Blue Planet Miku official MV', author: 'Miku', play: 1200000 }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV1111111111')
  assert.equal(ranked[0].autoAccepted, true)
})

test('Bilibili ranking still keeps low-heat fan edits below clear official matches', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: 'Blue Planet Miku \u4e8c\u521b\u526a\u8f91 MV',
        author: 'fan edit',
        play: 900
      },
      {
        bvid: 'BV2222222222',
        title: 'Blue Planet Miku official MV',
        author: 'Miku Official',
        play: 1200000
      }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, true)
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
      {
        bvid: 'BV1111111111',
        title: 'Dream! taxi driving simulator gameplay',
        author: 'Game Channel'
      },
      { bvid: 'BV2222222222', title: "Poppin'Party - Dream! official MV", author: "Poppin'Party" }
    ],
    "Dream Poppin'Party",
    { title: 'Dream!', artist: "Poppin'Party" }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili ranking rejects rhythm-game gameplay even when title and artist both match', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: '\u3010\u821e\u840cDX\u3011\u5929\u30ce\u5f31 (164 feat. GUMI) MASTER 13+ AP',
        author: 'maimai player'
      },
      {
        bvid: 'BV2222222222',
        title: '\u5929\u30ce\u5f31 / 164 feat. GUMI [Official MV]',
        author: '164'
      }
    ],
    '\u5929\u30ce\u5f31 164 GUMI',
    { title: '\u5929\u30ce\u5f31', artist: '164,GUMI' }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili ranking rejects taiko gameplay videos even with matching keywords', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: '\u3010\u592a\u9f13\u306e\u8fbe\u4eba\u3011Dream! Poppin\'Party \u5168\u826f',
        author: 'taiko ch'
      },
      {
        bvid: 'BV2222222222',
        title: 'Poppin\'Party - Dream! official MV',
        author: 'Poppin\'Party'
      }
    ],
    "Dream Poppin'Party",
    { title: 'Dream!', artist: "Poppin'Party" }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili ranking rejects dance-cover videos when an official MV is available', () => {
  const ranked = rankBilibiliVideoResults(
    [
      {
        bvid: 'BV1111111111',
        title: 'Blue Planet Miku \u7ffb\u8df3 dance cover',
        author: 'dance group'
      },
      {
        bvid: 'BV2222222222',
        title: 'Blue Planet Miku official MV',
        author: 'Miku Official'
      }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'BV2222222222')
  assert.equal(ranked.find((item) => item.id === 'BV1111111111')?.autoAccepted, false)
})

test('Bilibili auto matching rejects unrelated vlog results for symbol-heavy titles', () => {
  const match = analyzeBilibiliAutoMvMatch(
    {
      bvid: 'BV1111111111',
      title: '\u5f97\u5f97\u5730nn \u65e5\u5e38\u5206\u4eab',
      author: 'random uploader'
    },
    '\u03b4 for the delta \u304b\u3081\u308a\u3042',
    { title: '\u03b4:for the DELTA', artist: '\u304b\u3081\u308a\u3042' }
  )

  assert.equal(match.accepted, false)
  assert.equal(match.reason, 'title_mismatch')
})

test('YouTube ranking uses the same title and artist gate for auto MV selection', () => {
  const ranked = rankYoutubeVideoResults(
    [
      {
        id: 'badbadbad01',
        title: 'Dream! taxi driving simulator gameplay',
        author: 'Game Channel'
      },
      { id: 'goodgoodg02', title: "Poppin'Party - Dream! official MV", author: "Poppin'Party" }
    ],
    "Dream Poppin'Party",
    { title: 'Dream!', artist: "Poppin'Party" }
  )

  assert.equal(ranked[0].id, 'goodgoodg02')
  assert.equal(ranked[0].autoAccepted, true)
  assert.equal(ranked.find((item) => item.id === 'badbadbad01')?.autoAccepted, false)
})

test('YouTube ranking uses view count when otherwise acceptable matches compete', () => {
  const ranked = rankYoutubeVideoResults(
    [
      {
        id: 'lowviews001',
        title: 'Blue Planet Miku official MV',
        author: 'fan mirror',
        viewCountText: '824 views'
      },
      {
        id: 'highviews02',
        title: 'Blue Planet Miku official MV',
        author: 'Miku Official',
        viewCountText: '1.4M views'
      }
    ],
    'Blue Planet Miku MV',
    { title: 'Blue Planet', artist: 'Miku' }
  )

  assert.equal(ranked[0].id, 'highviews02')
  assert.equal(ranked[0].viewCount, 1400000)
})

test('parsePopularityCount supports localized and abbreviated counts', () => {
  assert.equal(parsePopularityCount('12.5\u4e07\u64ad\u653e'), 125000)
  assert.equal(parsePopularityCount('1.4M views'), 1400000)
  assert.equal(parsePopularityCount({ stat: { view: 98765 } }), 98765)
})
