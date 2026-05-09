import test from 'node:test'
import assert from 'node:assert/strict'

import { extractEmbeddedLyricsText } from '../../src/main/utils/embeddedLyrics.js'
import { parseLRC } from '../../src/renderer/src/utils/lyricsParse.js'

test('extractEmbeddedLyricsText preserves music-metadata syncText as LRC timestamps', () => {
  const text = extractEmbeddedLyricsText({
    format: { duration: 20, sampleRate: 44100 },
    common: {
      lyrics: [
        {
          timeStampFormat: 2,
          text: 'line one\nline two',
          syncText: [
            { timestamp: 12340, text: 'line one' },
            { timestamp: 15670, text: 'line two' }
          ]
        }
      ]
    }
  })

  assert.equal(text, '[00:12.34]line one\n[00:15.67]line two')
  assert.deepEqual(
    parseLRC(text).map((row) => ({ time: row.time, text: row.text })),
    [
      { time: 12.34, text: 'line one' },
      { time: 15.67, text: 'line two' }
    ]
  )
})

test('extractEmbeddedLyricsText converts SYLT MPEG frame timestamps using sample rate', () => {
  const text = extractEmbeddedLyricsText({
    format: { duration: 80, sampleRate: 44100 },
    common: {
      lyrics: [
        {
          timeStampFormat: 1,
          syncText: [{ timestamp: 2297, text: 'one minute line' }]
        }
      ]
    }
  })

  const rows = parseLRC(text)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'one minute line')
  assert.ok(Math.abs(rows[0].time - 60) < 0.1)
})

test('extractEmbeddedLyricsText falls back to unsynced text only when no syncText exists', () => {
  const text = extractEmbeddedLyricsText({
    common: {
      lyrics: [{ text: 'plain line one\nplain line two', syncText: [] }]
    }
  })

  assert.equal(text, 'plain line one\nplain line two')
})
