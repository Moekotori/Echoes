import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNeteaseErrorLogPayload,
  getNeteaseLyricsRateLimitCooldownMs,
  getNeteaseLyricsRateLimitRetryAfterMs,
  isNeteaseRateLimitPayload,
  withQuietNeteaseConsole
} from '../../src/main/neteaseLyrics.js'

test('detects NetEase 405 rate-limit payloads after mojibake repair', () => {
  const payload = buildNeteaseErrorLogPayload({
    status: 405,
    body: {
      code: 405,
      message: '鎿嶄綔棰戠箒锛岃绋嶅€欏啀璇?'
    },
    cookie: ['NMTID=private; Path=/;']
  })

  assert.equal(isNeteaseRateLimitPayload(payload), true)
  assert.equal(payload.body.message, '操作频繁，请稍候再试')
  assert.equal(Object.hasOwn(payload, 'cookie'), false)
})

test('quiet NetEase console suppresses upstream bracket-error spam', async () => {
  const originalError = console.error
  const captured = []
  console.error = (...args) => captured.push(args)
  try {
    await withQuietNeteaseConsole(async () => {
      console.error('[ERROR]', {
        status: 405,
        body: { code: 405, message: '操作频繁，请稍候再试' },
        cookie: ['NMTID=private; Path=/;']
      })
      console.error('keep this message')
    })
  } finally {
    console.error = originalError
  }

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0], ['keep this message'])
})

test('NetEase lyrics rate-limit cooldowns stay short and phase-specific', () => {
  assert.equal(getNeteaseLyricsRateLimitCooldownMs('search'), 30_000)
  assert.equal(getNeteaseLyricsRateLimitCooldownMs('lyric'), 45_000)
  assert.equal(getNeteaseLyricsRateLimitRetryAfterMs('search'), 0)
  assert.equal(getNeteaseLyricsRateLimitRetryAfterMs('lyric'), 0)
})
