import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRomajiConversionPlan,
  rememberRomajiCacheValue,
  sanitizeRomajiSourceText,
  shouldRequestGeneratedRomaji
} from '../../src/shared/romajiText.mjs'

test('sanitizeRomajiSourceText removes enhanced LRC timing tags', () => {
  assert.equal(sanitizeRomajiSourceText('<00:12.34>君の <00:13.00>名は'), '君の 名は')
})

test('shouldRequestGeneratedRomaji targets Japanese lyric text', () => {
  assert.equal(shouldRequestGeneratedRomaji('君の名は'), true)
  assert.equal(shouldRequestGeneratedRomaji('ありがとう'), true)
  assert.equal(shouldRequestGeneratedRomaji('hello world'), false)
})

test('buildRomajiConversionPlan keeps existing and cached romaji', () => {
  const cache = new Map([['ありがとう', 'arigatou']])
  const plan = buildRomajiConversionPlan(
    [
      { text: '君の名は', romaji: 'kiminonawa' },
      { text: 'ありがとう' },
      { text: 'hello world' }
    ],
    { cache, focusIndex: 1 }
  )

  assert.deepEqual(plan.merged, ['kiminonawa', 'arigatou', ''])
  assert.deepEqual(plan.pending, [])
})

test('rememberRomajiCacheValue prunes oldest entries', () => {
  const cache = new Map()
  rememberRomajiCacheValue(cache, 'a', 'A', 2)
  rememberRomajiCacheValue(cache, 'b', 'B', 2)
  rememberRomajiCacheValue(cache, 'c', 'C', 2)

  assert.equal(cache.has('a'), false)
  assert.equal(cache.get('b'), 'B')
  assert.equal(cache.get('c'), 'C')
})
