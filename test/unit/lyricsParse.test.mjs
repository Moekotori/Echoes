import test from 'node:test'
import assert from 'node:assert/strict'

import { parseLRC } from '../../src/renderer/src/utils/lyricsParse.js'

test('parseLRC preserves enhanced inline word timings', () => {
  const rows = parseLRC('[00:10.00]<00:10.00>hello <00:10.50>world')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'hello world')
  assert.deepEqual(rows[0].words, [
    { time: 10, text: 'hello ' },
    { time: 10.5, text: 'world' }
  ])
})

test('parseLRC prefers Japanese same-timestamp text even when translation appears first', () => {
  const rows = parseLRC(
    '[00:10.00]\u4f60\u7684\u540d\u5b57\n[00:10.00]\u541b\u306e\u540d\u306f'
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, '\u541b\u306e\u540d\u306f')
  assert.equal(rows[0].translation, '\u4f60\u7684\u540d\u5b57')
})

test('parseLRC keeps same-timestamp translation while timing main line', () => {
  const rows = parseLRC('[00:10.00]<00:10.00>君の名は\n[00:10.00]你的名字')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, '君の名は')
  assert.equal(rows[0].translation, '你的名字')
  assert.deepEqual(rows[0].words, [{ time: 10, text: '君の名は' }])
})
