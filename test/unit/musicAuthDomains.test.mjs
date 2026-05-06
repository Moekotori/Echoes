import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NETEASE_COOKIE_DOMAINS,
  getNeteaseCookieFromSession
} from '../../src/main/neteaseAuth.js'
import {
  QQ_MUSIC_COOKIE_DOMAINS,
  getQqMusicCookieFromSession
} from '../../src/main/qqMusicAuth.js'

test('NetEase auth scans base and login cookie domains', async () => {
  assert.ok(NETEASE_COOKIE_DOMAINS.includes('.163.com'))
  assert.ok(NETEASE_COOKIE_DOMAINS.includes('.passport.163.com'))
  assert.ok(NETEASE_COOKIE_DOMAINS.includes('.music.126.net'))

  const scanned = []
  await getNeteaseCookieFromSession({
    cookies: {
      get: async (filter) => {
        scanned.push(filter.domain)
        return []
      }
    }
  })

  assert.deepEqual(scanned, NETEASE_COOKIE_DOMAINS)
})

test('QQ Music auth scans QQ login and payment cookie domains', async () => {
  assert.ok(QQ_MUSIC_COOKIE_DOMAINS.includes('.qq.com'))
  assert.ok(QQ_MUSIC_COOKIE_DOMAINS.includes('.ptlogin2.qq.com'))
  assert.ok(QQ_MUSIC_COOKIE_DOMAINS.includes('.tenpay.com'))

  const scanned = []
  await getQqMusicCookieFromSession({
    cookies: {
      get: async (filter) => {
        scanned.push(filter.domain)
        return []
      }
    }
  })

  assert.deepEqual(scanned, QQ_MUSIC_COOKIE_DOMAINS)
})
