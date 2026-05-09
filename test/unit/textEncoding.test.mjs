import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { decodeTextBytes } from '../../src/shared/textEncoding.mjs'

const require = createRequire(import.meta.url)
const iconv = require('iconv-lite')

test('decodeTextBytes keeps UTF-8 text intact', () => {
  const text = '导入播放列表\n[00:01.00]センチメンタル'
  assert.equal(decodeTextBytes(Buffer.from(text, 'utf8')), text)
})

test('decodeTextBytes handles UTF-8 BOM', () => {
  const text = '#EXTM3U\n鹿乃 - Stella-rium.flac'
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
  assert.equal(decodeTextBytes(bytes), text)
})

test('decodeTextBytes repairs GB18030 lyric files', () => {
  const text = '[00:12.00]当爱已成往事'
  assert.equal(decodeTextBytes(iconv.encode(text, 'gb18030')), text)
})

test('decodeTextBytes keeps UTF-8 JSON with CJK text intact', () => {
  const text = '{"title":"拷贝设置","artist":"鹿乃","note":"繁體中文"}'
  assert.equal(decodeTextBytes(Buffer.from(text, 'utf8')), text)
})

test('decodeTextBytes repairs Shift-JIS lyric files', () => {
  const text = '[00:08.00]センチメンタルライフ'
  assert.equal(decodeTextBytes(iconv.encode(text, 'shift_jis')), text)
})

test('decodeTextBytes repairs Big5 lyric files', () => {
  const text = '[00:04.00]當愛已成往事'
  assert.equal(decodeTextBytes(iconv.encode(text, 'big5')), text)
})

test('decodeTextBytes handles UTF-16LE BOM text', () => {
  const text = '[00:03.00]繁體歌詞'
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
  assert.equal(decodeTextBytes(bytes), text)
})

test('decodeTextBytes handles UTF-16BE BOM text', () => {
  const text = '[00:05.00]繁體歌詞'
  const le = Buffer.from(text, 'utf16le')
  const be = Buffer.alloc(le.length)
  for (let i = 0; i + 1 < le.length; i += 2) {
    be[i] = le[i + 1]
    be[i + 1] = le[i]
  }
  const bytes = Buffer.concat([Buffer.from([0xfe, 0xff]), be])
  assert.equal(decodeTextBytes(bytes), text)
})
