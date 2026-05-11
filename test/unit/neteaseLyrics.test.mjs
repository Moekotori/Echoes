import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { buildNeteaseErrorLogPayload, mergeTimedLyrics } from '../../src/main/neteaseLyrics.js'
import { parseLRC } from '../../src/renderer/src/utils/lyricsParse.js'

const require = createRequire(import.meta.url)
const iconv = require('iconv-lite')

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

test('buildNeteaseErrorLogPayload repairs mojibake rate-limit messages', () => {
  const message = '\u64cd\u4f5c\u9891\u7e41\uff0c\u8bf7\u7a0d\u5019\u518d\u8bd5'
  const mojibake = iconv.decode(Buffer.from(message, 'utf8'), 'gb18030')
  const payload = buildNeteaseErrorLogPayload({
    status: 405,
    body: {
      msg: mojibake,
      message: mojibake,
      code: 405
    },
    message: mojibake
  })

  assert.equal(payload.body.msg, message)
  assert.equal(payload.body.message, message)
  assert.equal(payload.message, message)
})

test('buildNeteaseErrorLogPayload repairs cp936-shaped rate-limit messages', () => {
  const message = '\u64cd\u4f5c\u9891\u7e41\uff0c\u8bf7\u7a0d\u5019\u518d\u8bd5'
  const mojibake = '\u93bf\u5d84\u7d94\u68f0\u6220\u68f1\u6220\u7b92\uff0c\u8a82\u7e5d\u5d84\u20ac\u6b12\u6b1d\u555a\u7490'
  const payload = buildNeteaseErrorLogPayload({
    status: 405,
    body: {
      msg: mojibake,
      message: mojibake,
      code: 405
    },
    message: mojibake
  })

  assert.equal(payload.body.msg, message)
  assert.equal(payload.body.message, message)
  assert.equal(payload.message, message)
})
