import test from 'node:test'
import assert from 'node:assert/strict'

import { orderMvSearchItems } from '../../src/renderer/src/utils/mvSearchCandidates.js'

test('orderMvSearchItems returns ranked result items without applying a single hit', () => {
  const items = orderMvSearchItems(
    {
      id: 'BVbest000001',
      source: 'bilibili',
      autoAccepted: true,
      score: 32,
      items: [
        { id: 'BVbest000001', source: 'bilibili', title: 'best', score: 32 },
        { id: 'BVnext000002', source: 'bilibili', title: 'next', score: 20 }
      ]
    },
    'bilibili'
  )

  assert.deepEqual(
    items.map((item) => item.id),
    ['BVbest000001', 'BVnext000002']
  )
})

test('orderMvSearchItems keeps best-effort fallback at the front when needed', () => {
  const items = orderMvSearchItems(
    {
      id: 'BVfallback01',
      source: 'bilibili',
      autoAccepted: false,
      score: 50
    },
    'bilibili'
  )

  assert.equal(items[0].id, 'BVfallback01')
})
