import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAutoMvSearchHit,
  getBestEffortMvSearchHit
} from '../../src/renderer/src/utils/mvAutoAccept.js'

test('auto MV acceptance rejects weak Bilibili results', () => {
  assert.equal(
    getAutoMvSearchHit({ id: 'BV1111111111', source: 'bilibili', autoAccepted: false }, 'bilibili'),
    null
  )
})

test('auto MV acceptance accepts verified Bilibili results', () => {
  assert.deepEqual(
    getAutoMvSearchHit({ id: 'BV1111111111', source: 'bilibili', autoAccepted: true }, 'bilibili'),
    {
      id: 'BV1111111111',
      source: 'bilibili',
      result: { id: 'BV1111111111', source: 'bilibili', autoAccepted: true }
    }
  )
})

test('auto MV acceptance keeps non-Bilibili legacy string results', () => {
  assert.deepEqual(getAutoMvSearchHit('abc123', 'youtube'), {
    id: 'abc123',
    source: 'youtube',
    result: 'abc123'
  })
})

test('auto MV acceptance rejects explicit weak YouTube rankings', () => {
  assert.equal(
    getAutoMvSearchHit({ id: 'badbadbad01', source: 'youtube', autoAccepted: false }, 'youtube'),
    null
  )
})

test('best effort MV search falls back to the strongest ranked candidate', () => {
  assert.deepEqual(
    getBestEffortMvSearchHit(
      {
        id: 'BVweak000001',
        source: 'bilibili',
        autoAccepted: false,
        items: [
          { id: 'BVweak000001', source: 'bilibili', autoAccepted: false, score: 4 },
          { id: 'BVbetter0002', source: 'bilibili', autoAccepted: false, score: 18 }
        ]
      },
      'bilibili'
    ),
    {
      id: 'BVbetter0002',
      source: 'bilibili',
      result: { id: 'BVbetter0002', source: 'bilibili', autoAccepted: false, score: 18 },
      score: 18,
      matchLevel: 'fallback'
    }
  )
})
