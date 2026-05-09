import test from 'node:test'
import assert from 'node:assert/strict'

import { parseBilibiliSearchHtml } from '../../src/main/utils/bilibiliSearchHtml.js'

test('parseBilibiliSearchHtml extracts BV candidates from web search html payloads', () => {
  const html = `
    window.__pinia=(function(){
      return [
        "HoneyWorks Channel",
        "http:\\u002F\\u002Fwww.bilibili.com\\u002Fvideo\\u002Fav123456",
        "BV15P411B7FV",
        "\\u003Cem class=\\"keyword\\"\\u003E\\u53ef\\u611b\\u304f\\u3066\\u3054\\u3081\\u3093\\u003C\\u002Fem\\u003E HoneyWorks official MV",
        "desc",
        "\\u002F\\u002Fi2.hdslb.com\\u002Fbfs\\u002Farchive\\u002Fcover.png",
        "3:39"
      ]
    })()
  `

  assert.deepEqual(parseBilibiliSearchHtml(html, 5), [
    {
      bvid: 'BV15P411B7FV',
      title: '\u53ef\u611b\u304f\u3066\u3054\u3081\u3093 HoneyWorks official MV',
      author: 'HoneyWorks Channel',
      duration: '3:39',
      source: 'bilibili'
    }
  ])
})

test('parseBilibiliSearchHtml skips duplicate BV ids', () => {
  const html = `
    "up","http:\\u002F\\u002Fwww.bilibili.com\\u002Fvideo\\u002Fav1","BV1iy4y1Z7Ri","first title"
    "up","http:\\u002F\\u002Fwww.bilibili.com\\u002Fvideo\\u002Fav1","BV1iy4y1Z7Ri","duplicate title"
  `

  const items = parseBilibiliSearchHtml(html, 5)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'first title')
})

test('parseBilibiliSearchHtml reads play count near BV candidates', () => {
  const html = `
    "up","BV1aa4y1Z7Ri","Blue Planet official MV","play":123456,"3:39"
    "up","BV1bb4y1Z7Ri","Blue Planet fan edit MV","88.1\u4e07\u64ad\u653e","3:41"
  `

  const items = parseBilibiliSearchHtml(html, 5)
  assert.equal(items[0].playCount, 123456)
  assert.equal(items[1].playCount, 881000)
})
