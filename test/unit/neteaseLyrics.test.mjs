import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeTimedLyrics } from '../../src/main/neteaseLyrics.js'
import { parseLRC } from '../../src/renderer/src/utils/lyricsParse.js'

test('mergeTimedLyrics keeps translated lines with near-matching NetEase timestamps', () => {
  const merged = mergeTimedLyrics(
    '[00:10.00]君の名は\n[00:20.00]風になる',
    '',
    '[00:10.28]你的名字\n[00:20.31]化作风'
  )
  const rows = parseLRC(merged)

  assert.equal(rows.length, 2)
  assert.equal(rows[0].text, '君の名は')
  assert.equal(rows[0].translation, '你的名字')
  assert.equal(rows[1].text, '風になる')
  assert.equal(rows[1].translation, '化作风')
})
