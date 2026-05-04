import crypto from 'node:crypto'
import axios from 'axios'

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/'
const MSG_MISSING_CREDENTIALS = '\u8bf7\u8f93\u5165\u7528\u6237\u540d\u548c\u5bc6\u7801'
const MSG_LOGIN_FAILED = '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7528\u6237\u540d\u548c\u5bc6\u7801'
const MSG_LOGIN_TIMEOUT = '\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5'
const MSG_NETWORK_FAILED = '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5'
const MSG_INVALID_API_KEY = 'Last.fm API Key \u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u5e94\u7528\u914d\u7f6e'
const MSG_OPEN_AUTH_FAILED = '\u65e0\u6cd5\u6253\u5f00 Last.fm \u6388\u6743\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5'
const MSG_AUTH_NOT_APPROVED =
  '\u5c1a\u672a\u5b8c\u6210 Last.fm \u6388\u6743\uff0c\u8bf7\u5728\u6d4f\u89c8\u5668\u70b9\u51fb Allow \u540e\u518d\u56de\u6765\u5b8c\u6210\u8fde\u63a5'
const MSG_WEB_AUTH_REQUIRED =
  '\u5f53\u524d Last.fm \u4e0d\u63a5\u53d7\u5e94\u7528\u5185\u5bc6\u7801\u767b\u5f55\uff0c\u8bf7\u4f7f\u7528\u6d4f\u89c8\u5668\u6388\u6743\u8fde\u63a5'

export class LastFmClient {
  constructor() {
    this.apiKey = 'c9badea6f4f4d280800653b9458d3dbd'
    this.apiSecret = '0f6494a849ea09829817963350eab8e7'
    this.sessionKey = null
    this.username = null
  }

  _sign(params) {
    const base = Object.keys(params)
      .filter((key) => key !== 'format' && params[key] != null && params[key] !== '')
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${key}${params[key]}`)
      .join('')
    return crypto.createHash('md5').update(`${base}${this.apiSecret}`, 'utf8').digest('hex')
  }

  async _post(params) {
    const body = new URLSearchParams({ ...params, format: 'json' })
    const response = await axios.post(LASTFM_BASE_URL, body.toString(), {
      timeout: 8000,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response?.data || {}
  }

  async authenticate(username, password) {
    try {
      const normalizedUsername = String(username || '').trim()
      const normalizedPassword = String(password || '')
      if (!normalizedUsername || !normalizedPassword) {
        return { ok: false, error: MSG_MISSING_CREDENTIALS }
      }

      const params = {
        method: 'auth.getMobileSession',
        username: normalizedUsername,
        password: normalizedPassword,
        api_key: this.apiKey
      }
      const data = await this._post({
        ...params,
        api_sig: this._sign(params)
      })

      if (data?.session?.key) {
        this.sessionKey = data.session.key
        this.username = data.session.name || normalizedUsername
        return {
          ok: true,
          username: this.username,
          sessionKey: this.sessionKey
        }
      }

      if (data?.error === 10 || String(data?.message || '').includes('Invalid API key')) {
        return { ok: false, error: MSG_INVALID_API_KEY }
      }
      const message = String(data?.message || '')
      if (/permission|access the service/i.test(message)) {
        return { ok: false, error: MSG_WEB_AUTH_REQUIRED }
      }
      return { ok: false, error: message || MSG_LOGIN_FAILED }
    } catch (error) {
      const timeoutMessage = error?.code === 'ECONNABORTED' ? MSG_LOGIN_TIMEOUT : ''
      return {
        ok: false,
        error: timeoutMessage || error?.response?.data?.message || MSG_NETWORK_FAILED
      }
    }
  }

  getAuthorizationUrl(token) {
    const normalizedToken = String(token || '').trim()
    const params = new URLSearchParams({
      api_key: this.apiKey,
      token: normalizedToken
    })
    return `https://www.last.fm/api/auth/?${params.toString()}`
  }

  async createWebAuthToken() {
    try {
      const params = {
        method: 'auth.getToken',
        api_key: this.apiKey
      }
      const data = await this._post({
        ...params,
        api_sig: this._sign(params)
      })

      if (data?.token) {
        const token = String(data.token)
        return {
          ok: true,
          token,
          url: this.getAuthorizationUrl(token)
        }
      }

      if (data?.error === 10 || String(data?.message || '').includes('Invalid API key')) {
        return { ok: false, error: MSG_INVALID_API_KEY }
      }
      return { ok: false, error: data?.message || MSG_OPEN_AUTH_FAILED }
    } catch (error) {
      const timeoutMessage = error?.code === 'ECONNABORTED' ? MSG_LOGIN_TIMEOUT : ''
      return {
        ok: false,
        error: timeoutMessage || error?.response?.data?.message || MSG_OPEN_AUTH_FAILED
      }
    }
  }

  async completeWebAuth(token) {
    try {
      const normalizedToken = String(token || '').trim()
      if (!normalizedToken) {
        return { ok: false, error: MSG_AUTH_NOT_APPROVED }
      }

      const params = {
        method: 'auth.getSession',
        api_key: this.apiKey,
        token: normalizedToken
      }
      const data = await this._post({
        ...params,
        api_sig: this._sign(params)
      })

      if (data?.session?.key) {
        this.sessionKey = data.session.key
        this.username = data.session.name || null
        return {
          ok: true,
          username: this.username,
          sessionKey: this.sessionKey
        }
      }

      const message = String(data?.message || '')
      if (data?.error === 10 || message.includes('Invalid API key')) {
        return { ok: false, error: MSG_INVALID_API_KEY }
      }
      if (data?.error === 14 || /token|authorized|permission/i.test(message)) {
        return { ok: false, error: MSG_AUTH_NOT_APPROVED }
      }
      return { ok: false, error: message || MSG_AUTH_NOT_APPROVED }
    } catch (error) {
      const timeoutMessage = error?.code === 'ECONNABORTED' ? MSG_LOGIN_TIMEOUT : ''
      return {
        ok: false,
        error: timeoutMessage || error?.response?.data?.message || MSG_NETWORK_FAILED
      }
    }
  }

  async nowPlaying(artist, track, album, durationSec) {
    if (!this.sessionKey) return { ok: false, skipped: true }
    try {
      const params = {
        method: 'track.updateNowPlaying',
        artist: String(artist || '').trim(),
        track: String(track || '').trim(),
        api_key: this.apiKey,
        sk: this.sessionKey
      }
      if (album) params.album = String(album).trim()
      if (Number(durationSec) > 0) params.duration = String(Math.round(Number(durationSec)))
      if (!params.artist || !params.track) return { ok: false, skipped: true }
      await this._post({
        ...params,
        api_sig: this._sign(params)
      })
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  async scrobble(artist, track, album, startedAt, durationSec) {
    if (!this.sessionKey) return { ok: false, skipped: true }
    try {
      const timestampSec = Math.max(1, Math.floor(Number(startedAt || Date.now()) / 1000))
      const params = {
        method: 'track.scrobble',
        artist: String(artist || '').trim(),
        track: String(track || '').trim(),
        timestamp: String(timestampSec),
        api_key: this.apiKey,
        sk: this.sessionKey
      }
      if (album) params.album = String(album).trim()
      if (Number(durationSec) > 0) params.duration = String(Math.round(Number(durationSec)))
      if (!params.artist || !params.track) return { ok: false, skipped: true }
      await this._post({
        ...params,
        api_sig: this._sign(params)
      })
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  setSession(sessionKey, username) {
    this.sessionKey = sessionKey || null
    this.username = username || null
  }

  clearSession() {
    this.sessionKey = null
    this.username = null
  }
}

export const lastFmClient = new LastFmClient()
