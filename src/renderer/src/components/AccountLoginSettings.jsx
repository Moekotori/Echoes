import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw
} from 'lucide-react'

function normalizeYoutubeCookieBrowser(value) {
  const browser = String(value || 'edge').trim().toLowerCase()
  if (browser === 'chrome' || browser === 'edge' || browser === 'firefox') return browser
  if (browser === 'none') return 'none'
  return 'edge'
}

function emptyAuthState() {
  return {
    checking: true,
    valid: false,
    signedIn: false,
    isVip: false,
    error: ''
  }
}

function formatSavedAt(value, isZh) {
  const time = Number(value || 0)
  if (!Number.isFinite(time) || time <= 0) return ''
  try {
    return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(time))
  } catch {
    return ''
  }
}

export default function AccountLoginSettings({
  config,
  setConfig,
  signInStatus = {},
  onRefreshSignInStatus
}) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const [neteaseCookieInput, setNeteaseCookieInput] = useState('')
  const [neteaseCookieSaved, setNeteaseCookieSaved] = useState('')
  const [neteaseAuth, setNeteaseAuth] = useState(() => emptyAuthState())
  const [qqMusicCookieInput, setQqMusicCookieInput] = useState('')
  const [qqMusicCookieSaved, setQqMusicCookieSaved] = useState('')
  const [qqMusicAuth, setQqMusicAuth] = useState(() => emptyAuthState())
  const [neteaseSigningIn, setNeteaseSigningIn] = useState(false)
  const [qqMusicSigningIn, setQqMusicSigningIn] = useState(false)
  const [bilibiliSigningIn, setBilibiliSigningIn] = useState(false)
  const [soundCloudSigningIn, setSoundCloudSigningIn] = useState(false)
  const [soundCloudLoginStatus, setSoundCloudLoginStatus] = useState('')
  const [youtubeLoginSaving, setYoutubeLoginSaving] = useState(false)
  const [youtubeLoginStatus, setYoutubeLoginStatus] = useState('')
  const [youtubeCookieUpdatedAt, setYoutubeCookieUpdatedAt] = useState(0)

  const youtubeCookieBrowser = normalizeYoutubeCookieBrowser(config.youtubeCookieBrowser)

  const accountCopy = useMemo(
    () => ({
      title: isZh ? '账号登录' : 'Account sign-ins',
      desc: isZh
        ? '网易云、QQ 音乐、SoundCloud、YouTube、Bilibili 的登录状态统一放在这里管理。下载器、流媒体和 MV 会自动使用这些状态。'
        : 'Manage NetEase Cloud Music, QQ Music, SoundCloud, YouTube, and Bilibili sign-ins here. Downloader, streaming, and MV features reuse these states automatically.',
      shortDownloadHint: isZh
        ? '如果下载的音乐仅有 30s，请尝试重新登录并检查会员状态。'
        : 'If downloaded music is only 30s long, try signing in again and checking membership status.',
      cookiePlaceholder: isZh ? '粘贴 Cookie 后保存' : 'Paste cookie, then save',
      saveCookie: isZh ? '保存 Cookie' : 'Save cookie',
      oneClick: isZh ? '打开登录页' : 'Open sign-in',
      reSignIn: isZh ? '重新登录' : 'Sign in again',
      logout: isZh ? '退出登录' : 'Sign out',
      checking: isZh ? '正在检查登录状态...' : 'Checking sign-in status...',
      signedIn: isZh ? '已登录' : 'Signed in',
      notSignedIn: isZh ? '未登录' : 'Not signed in',
      savedCookieInvalid: isZh ? '已保存的 Cookie 可能已失效，请重新登录。' : 'Saved cookie may be expired. Please sign in again.',
      neteaseHint: isZh ? '无损/高音质下载和歌词匹配会优先使用此账号。' : 'Lossless downloads and lyric matching prefer this account.',
      qqHint: isZh ? '无损/高音质下载会优先使用此账号。' : 'Lossless/high quality downloads prefer this account.',
      soundCloudHint: isZh ? 'SoundCloud 流媒体搜索和播放需要先登录账号。' : 'SoundCloud streaming search and playback require a signed-in account.',
      soundCloudOpenSaved: isZh
        ? '已用系统浏览器打开 SoundCloud，登录完成后 ECHO 会自动保存状态。'
        : 'SoundCloud opened in the system browser. ECHO will save the sign-in automatically after login.',
      youtubeHint: isZh
        ? '沿用媒体下载里的系统浏览器登录逻辑，保存后自动用于 YouTube 解析/下载。'
        : 'Uses the media downloader system-browser sign-in flow and then reuses it for YouTube parsing/downloads.',
      bilibiliHint: isZh ? '用于 Bilibili MV 直连解析和更高画质。' : 'Used for Bilibili direct MV streams and higher quality.',
      unsupportedBrowser: isZh ? 'Firefox 暂不支持自动保存，请选择 Edge 或 Chrome。' : 'Firefox auto-save is not available yet. Use Edge or Chrome.',
      browserNone: isZh ? '当前设置为不使用浏览器 Cookie。' : 'Browser cookies are currently disabled.',
      openSaved: isZh ? '已打开浏览器，登录完成后点“已登录，保存”。' : 'Browser opened. After signing in, click Saved.',
      saveYoutube: isZh ? '已登录，保存' : 'Saved',
      refresh: isZh ? '刷新状态' : 'Refresh status'
    }),
    [isZh]
  )

  const notifyDownloaderAuthUpdated = useCallback((settings = {}) => {
    window.dispatchEvent(new CustomEvent('echoes:downloader-auth-updated', { detail: settings }))
  }, [])

  const persistDownloaderAuth = useCallback(
    async (patch) => {
      let nextSettings = patch
      try {
        const previous = await window.api?.appStateGet?.('downloaderSettings')
        nextSettings = {
          ...(previous && typeof previous === 'object' ? previous : {}),
          ...patch
        }
        await window.api?.appStateSet?.('downloaderSettings', nextSettings)
      } catch (_) {}
      notifyDownloaderAuthUpdated(nextSettings)
    },
    [notifyDownloaderAuthUpdated]
  )

  const applyNeteaseCookie = useCallback(
    (cookie) => {
      const next = String(cookie || '').trim()
      setNeteaseCookieSaved(next)
      try {
        if (next) localStorage.setItem('echoes.neteaseCookie', next)
        else localStorage.removeItem('echoes.neteaseCookie')
      } catch (_) {}
      void persistDownloaderAuth({ neteaseCookie: next })
    },
    [persistDownloaderAuth]
  )

  const applyQqMusicCookie = useCallback(
    (cookie) => {
      const next = String(cookie || '').trim()
      setQqMusicCookieSaved(next)
      try {
        if (next) localStorage.setItem('echoes.qqMusicCookie', next)
        else localStorage.removeItem('echoes.qqMusicCookie')
      } catch (_) {}
      void persistDownloaderAuth({ qqMusicCookie: next })
    },
    [persistDownloaderAuth]
  )

  const refreshNeteaseCookieFromSession = useCallback(
    async (preferredCookie = '') => {
      if (!window.api?.getNeteaseCookie) return
      setNeteaseAuth((prev) => ({ ...prev, checking: true, error: '' }))
      try {
        const out = await window.api.getNeteaseCookie(preferredCookie || neteaseCookieSaved)
        if (out?.ok && out?.valid && out?.cookie) {
          applyNeteaseCookie(out.cookie)
        } else if (out?.checked) {
          applyNeteaseCookie('')
        }
        setNeteaseAuth({
          checking: false,
          valid: out?.valid === true,
          signedIn: out?.signedIn === true,
          isVip: out?.isVip === true,
          error: out?.error || ''
        })
      } catch (error) {
        setNeteaseAuth({
          checking: false,
          valid: false,
          signedIn: false,
          isVip: false,
          error: error?.message || String(error)
        })
      }
    },
    [applyNeteaseCookie, neteaseCookieSaved]
  )

  const refreshQqMusicCookieFromSession = useCallback(
    async (preferredCookie = '') => {
      if (!window.api?.getQqMusicCookie) return
      setQqMusicAuth((prev) => ({ ...prev, checking: true, error: '' }))
      try {
        const out = await window.api.getQqMusicCookie(preferredCookie || qqMusicCookieSaved)
        if (out?.ok && out?.valid && out?.cookie) {
          applyQqMusicCookie(out.cookie)
        } else if (out?.checked) {
          applyQqMusicCookie('')
        }
        setQqMusicAuth({
          checking: false,
          valid: out?.valid === true,
          signedIn: out?.signedIn === true,
          isVip: out?.isVip === true,
          error: out?.error || ''
        })
      } catch (error) {
        setQqMusicAuth({
          checking: false,
          valid: false,
          signedIn: false,
          isVip: false,
          error: error?.message || String(error)
        })
      }
    },
    [applyQqMusicCookie, qqMusicCookieSaved]
  )

  const refreshYoutubeCookieStatus = useCallback(async () => {
    try {
      const status = await window.api?.getYoutubeSystemCookieStatus?.()
      if (status?.available) {
        setYoutubeCookieUpdatedAt(status.updatedAt || 0)
        setYoutubeLoginStatus(
          isZh
            ? `已保存 YouTube 登录状态${formatSavedAt(status.updatedAt, isZh) ? `（${formatSavedAt(status.updatedAt, isZh)}）` : ''}`
            : `YouTube sign-in saved${formatSavedAt(status.updatedAt, isZh) ? ` (${formatSavedAt(status.updatedAt, isZh)})` : ''}`
        )
      } else {
        setYoutubeCookieUpdatedAt(0)
        setYoutubeLoginStatus('')
      }
    } catch (_) {}
  }, [isZh])

  const refreshAll = useCallback(() => {
    void refreshNeteaseCookieFromSession()
    void refreshQqMusicCookieFromSession()
    void refreshYoutubeCookieStatus()
    onRefreshSignInStatus?.()
  }, [])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      let nextNeteaseCookie = ''
      let nextQqMusicCookie = ''
      try {
        nextNeteaseCookie = localStorage.getItem('echoes.neteaseCookie') || ''
        nextQqMusicCookie = localStorage.getItem('echoes.qqMusicCookie') || ''
        if (!cancelled) {
          setNeteaseCookieSaved(nextNeteaseCookie)
          setQqMusicCookieSaved(nextQqMusicCookie)
        }
      } catch (_) {}
      try {
        const prefs = await window.api?.appStateGet?.('downloaderSettings')
        if (!cancelled && prefs && typeof prefs === 'object') {
          if (typeof prefs.neteaseCookie === 'string') {
            nextNeteaseCookie = prefs.neteaseCookie
            setNeteaseCookieSaved(prefs.neteaseCookie)
          }
          if (typeof prefs.qqMusicCookie === 'string') {
            nextQqMusicCookie = prefs.qqMusicCookie
            setQqMusicCookieSaved(prefs.qqMusicCookie)
          }
        }
      } catch (_) {}
      if (!cancelled) {
        void refreshNeteaseCookieFromSession(nextNeteaseCookie)
        void refreshQqMusicCookieFromSession(nextQqMusicCookie)
        void refreshYoutubeCookieStatus()
        onRefreshSignInStatus?.()
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [
    onRefreshSignInStatus,
    refreshNeteaseCookieFromSession,
    refreshQqMusicCookieFromSession,
    refreshYoutubeCookieStatus
  ])

  useEffect(() => {
    if (!window.api?.onSignInStatusChanged) return
    const unsub = window.api.onSignInStatusChanged(refreshAll)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [refreshAll])

  const openNeteaseSignIn = useCallback(async () => {
    setNeteaseSigningIn(true)
    try {
      const result = await window.api?.openNeteaseSignInWindow?.()
      if (!result?.ok) throw new Error(result?.error || 'open_failed')
      void refreshNeteaseCookieFromSession()
    } catch (error) {
      setNeteaseAuth((prev) => ({ ...prev, error: error?.message || String(error) }))
    } finally {
      setNeteaseSigningIn(false)
    }
  }, [refreshNeteaseCookieFromSession])

  const openQqMusicSignIn = useCallback(async () => {
    setQqMusicSigningIn(true)
    try {
      const result = await window.api?.openQqMusicSignInWindow?.()
      if (!result?.ok) throw new Error(result?.error || 'open_failed')
      void refreshQqMusicCookieFromSession()
    } catch (error) {
      setQqMusicAuth((prev) => ({ ...prev, error: error?.message || String(error) }))
    } finally {
      setQqMusicSigningIn(false)
    }
  }, [refreshQqMusicCookieFromSession])

  const openYoutubeSystemSignIn = useCallback(async () => {
    const browser = youtubeCookieBrowser === 'chrome' ? 'chrome' : 'edge'
    try {
      const result = await window.api?.openYoutubeSystemSignIn?.(browser)
      if (result?.ok) {
        setYoutubeLoginStatus(
          `${accountCopy.openSaved} ${browser === 'chrome' ? 'Chrome' : 'Edge'}`
        )
      } else {
        setYoutubeLoginStatus(result?.error || 'open_failed')
      }
    } catch (error) {
      setYoutubeLoginStatus(error?.message || String(error))
    }
  }, [accountCopy.openSaved, youtubeCookieBrowser])

  const saveYoutubeSystemCookies = useCallback(async () => {
    setYoutubeLoginSaving(true)
    setYoutubeLoginStatus(isZh ? '正在保存 YouTube 登录状态...' : 'Saving YouTube sign-in...')
    try {
      const result = await window.api?.saveYoutubeSystemCookies?.()
      if (result?.ok) {
        setYoutubeLoginStatus(
          result.signedIn
            ? isZh
              ? '已保存 YouTube 登录状态，之后会自动用于解析/下载。'
              : 'YouTube sign-in saved. ECHO will use it automatically.'
            : isZh
              ? '已保存浏览器 Cookie，但没有检测到完整登录状态。'
              : 'Browser cookies saved, but full sign-in was not detected.'
        )
        await refreshYoutubeCookieStatus()
        onRefreshSignInStatus?.()
      } else {
        setYoutubeLoginStatus(result?.error || 'save_failed')
      }
    } catch (error) {
      setYoutubeLoginStatus(error?.message || String(error))
    } finally {
      setYoutubeLoginSaving(false)
    }
  }, [isZh, onRefreshSignInStatus, refreshYoutubeCookieStatus])

  const openBilibiliSignIn = useCallback(async () => {
    setBilibiliSigningIn(true)
    try {
      const result = await window.api?.openBilibiliSignInWindow?.()
      if (!result?.ok) throw new Error(result?.error || 'open_failed')
      onRefreshSignInStatus?.()
    } catch (_) {
    } finally {
      setBilibiliSigningIn(false)
    }
  }, [onRefreshSignInStatus])

  const openSoundCloudSignIn = useCallback(async () => {
    setSoundCloudSigningIn(true)
    const browser = youtubeCookieBrowser === 'chrome' ? 'chrome' : 'edge'
    try {
      const result = await window.api?.openSoundCloudSignInWindow?.(browser)
      if (!result?.ok) throw new Error(result?.error || 'open_failed')
      setSoundCloudLoginStatus(
        `${accountCopy.soundCloudOpenSaved} ${browser === 'chrome' ? 'Chrome' : 'Edge'}`
      )
      onRefreshSignInStatus?.()
    } catch (error) {
      setSoundCloudLoginStatus(error?.message || String(error))
    } finally {
      setSoundCloudSigningIn(false)
    }
  }, [accountCopy.soundCloudOpenSaved, onRefreshSignInStatus, youtubeCookieBrowser])

  const logoutNetease = useCallback(async () => {
    try {
      await window.api?.logoutNetease?.()
    } catch (_) {}
    applyNeteaseCookie('')
    setNeteaseCookieInput('')
    setNeteaseAuth({ ...emptyAuthState(), checking: false })
    notifyDownloaderAuthUpdated({ neteaseCookie: '' })
    onRefreshSignInStatus?.()
  }, [applyNeteaseCookie, notifyDownloaderAuthUpdated, onRefreshSignInStatus])

  const logoutQqMusic = useCallback(async () => {
    try {
      await window.api?.logoutQqMusic?.()
    } catch (_) {}
    applyQqMusicCookie('')
    setQqMusicCookieInput('')
    setQqMusicAuth({ ...emptyAuthState(), checking: false })
    notifyDownloaderAuthUpdated({ qqMusicCookie: '' })
    onRefreshSignInStatus?.()
  }, [applyQqMusicCookie, notifyDownloaderAuthUpdated, onRefreshSignInStatus])

  const logoutYoutube = useCallback(async () => {
    try {
      await window.api?.logoutYoutube?.()
    } catch (_) {}
    setYoutubeCookieUpdatedAt(0)
    setYoutubeLoginStatus(isZh ? '已退出 YouTube 登录。' : 'YouTube signed out.')
    onRefreshSignInStatus?.()
  }, [isZh, onRefreshSignInStatus])

  const logoutBilibili = useCallback(async () => {
    try {
      await window.api?.logoutBilibili?.()
    } catch (_) {}
    onRefreshSignInStatus?.()
  }, [onRefreshSignInStatus])

  const logoutSoundCloud = useCallback(async () => {
    try {
      await window.api?.logoutSoundCloud?.()
    } catch (_) {}
    setSoundCloudLoginStatus('')
    onRefreshSignInStatus?.()
  }, [onRefreshSignInStatus])

  const renderStatus = (auth, hasSavedCookie = false) => {
    if (auth.checking) {
      return (
        <span className="account-login-status is-checking">
          <Loader2 size={14} className="spin" />
          {accountCopy.checking}
        </span>
      )
    }
    if (auth.valid) {
      return (
        <span className="account-login-status is-signed-in">
          <CheckCircle2 size={14} />
          {auth.isVip ? (isZh ? '已登录会员账号' : 'VIP signed in') : accountCopy.signedIn}
        </span>
      )
    }
    return (
      <span className={`account-login-status ${hasSavedCookie ? 'is-warning' : 'is-muted'}`}>
        <AlertCircle size={14} />
        {hasSavedCookie ? accountCopy.savedCookieInvalid : accountCopy.notSignedIn}
      </span>
    )
  }

  return (
    <div className="account-login-settings">
      <div className="setting-row account-login-settings__header">
        <div className="setting-info">
          <h3>{t('settings.accountLoginTitle', accountCopy.title)}</h3>
          <p>
            {t('settings.accountLoginDesc', accountCopy.desc)}
            <br />
            {t('settings.accountLoginShortDownloadHint', accountCopy.shortDownloadHint)}
            {isZh ? (
              <>
                <br />
                网易云音乐/QQ 音乐很可能无法退出登录（因为 Cookie 登录导致）。
                <br />
                ECHO 不会保存您的任何账户凭据，也不会提供任何绕过会员、影响平台利益的内容。
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="account-login-refresh" onClick={refreshAll}>
          <RefreshCw size={15} />
          {accountCopy.refresh}
        </button>
      </div>

      <div className="account-login-grid">
        <section className="account-login-card">
          <div className="account-login-card__top">
            <div>
              <h4>网易云音乐</h4>
              <p>{accountCopy.neteaseHint}</p>
            </div>
            {renderStatus(neteaseAuth, Boolean(neteaseCookieSaved))}
          </div>
          <div className="account-login-cookie-row">
            <input
              type="text"
              className="settings-text-input account-login-cookie-input"
              placeholder={accountCopy.cookiePlaceholder}
              value={neteaseCookieInput}
              onChange={(event) => setNeteaseCookieInput(event.target.value)}
            />
            <button
              type="button"
              className="account-login-action"
              disabled={!neteaseCookieInput.trim()}
              onClick={() => {
                const next = neteaseCookieInput.trim()
                applyNeteaseCookie(next)
                setNeteaseCookieInput('')
                void refreshNeteaseCookieFromSession(next)
              }}
            >
              <KeyRound size={15} />
              {accountCopy.saveCookie}
            </button>
          </div>
          <div className="account-login-actions">
            <button type="button" className="account-login-action primary" onClick={openNeteaseSignIn}>
              {neteaseSigningIn ? <Loader2 size={15} className="spin" /> : <ExternalLink size={15} />}
              {neteaseAuth.valid ? accountCopy.reSignIn : accountCopy.oneClick}
            </button>
            {neteaseCookieSaved || neteaseAuth.valid ? (
              <button
                type="button"
                className="account-login-action danger"
                onClick={logoutNetease}
              >
                <LogOut size={15} />
                {accountCopy.logout}
              </button>
            ) : null}
          </div>
          {neteaseAuth.error ? <p className="account-login-error">{neteaseAuth.error}</p> : null}
        </section>

        <section className="account-login-card">
          <div className="account-login-card__top">
            <div>
              <h4>QQ 音乐</h4>
              <p>{accountCopy.qqHint}</p>
            </div>
            {renderStatus(qqMusicAuth, Boolean(qqMusicCookieSaved))}
          </div>
          <div className="account-login-cookie-row">
            <input
              type="text"
              className="settings-text-input account-login-cookie-input"
              placeholder={accountCopy.cookiePlaceholder}
              value={qqMusicCookieInput}
              onChange={(event) => setQqMusicCookieInput(event.target.value)}
            />
            <button
              type="button"
              className="account-login-action"
              disabled={!qqMusicCookieInput.trim()}
              onClick={() => {
                const next = qqMusicCookieInput.trim()
                applyQqMusicCookie(next)
                setQqMusicCookieInput('')
                void refreshQqMusicCookieFromSession(next)
              }}
            >
              <KeyRound size={15} />
              {accountCopy.saveCookie}
            </button>
          </div>
          <div className="account-login-actions">
            <button type="button" className="account-login-action primary" onClick={openQqMusicSignIn}>
              {qqMusicSigningIn ? <Loader2 size={15} className="spin" /> : <ExternalLink size={15} />}
              {qqMusicAuth.valid ? accountCopy.reSignIn : accountCopy.oneClick}
            </button>
            {qqMusicCookieSaved || qqMusicAuth.valid ? (
              <button
                type="button"
                className="account-login-action danger"
                onClick={logoutQqMusic}
              >
                <LogOut size={15} />
                {accountCopy.logout}
              </button>
            ) : null}
          </div>
          {qqMusicAuth.error ? <p className="account-login-error">{qqMusicAuth.error}</p> : null}
        </section>

        <section className="account-login-card">
          <div className="account-login-card__top">
            <div>
              <h4>SoundCloud</h4>
              <p>{accountCopy.soundCloudHint}</p>
            </div>
            <span className={`account-login-status ${signInStatus.soundcloud ? 'is-signed-in' : 'is-muted'}`}>
              {signInStatus.soundcloud ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {signInStatus.soundcloud ? accountCopy.signedIn : accountCopy.notSignedIn}
            </span>
          </div>
          <div className="account-login-actions">
            <button type="button" className="account-login-action primary" onClick={openSoundCloudSignIn}>
              {soundCloudSigningIn ? <Loader2 size={15} className="spin" /> : <ExternalLink size={15} />}
              {signInStatus.soundcloud ? accountCopy.reSignIn : accountCopy.oneClick}
            </button>
            {signInStatus.soundcloud ? (
              <button type="button" className="account-login-action danger" onClick={logoutSoundCloud}>
                <LogOut size={15} />
                {accountCopy.logout}
              </button>
            ) : null}
          </div>
          {soundCloudLoginStatus ? <p className="account-login-note">{soundCloudLoginStatus}</p> : null}
        </section>

        <section className="account-login-card">
          <div className="account-login-card__top">
            <div>
              <h4>YouTube</h4>
              <p>{accountCopy.youtubeHint}</p>
            </div>
            <span
              className={`account-login-status ${signInStatus.youtube || youtubeCookieUpdatedAt ? 'is-signed-in' : 'is-muted'}`}
            >
              {signInStatus.youtube || youtubeCookieUpdatedAt ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              {signInStatus.youtube || youtubeCookieUpdatedAt ? accountCopy.signedIn : accountCopy.notSignedIn}
            </span>
          </div>
          <div className="account-login-browser-row">
            {[
              ['edge', 'Edge'],
              ['chrome', 'Chrome'],
              ['firefox', 'Firefox'],
              ['none', isZh ? '不使用' : 'None']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`account-login-browser-btn ${youtubeCookieBrowser === key ? 'active' : ''}`}
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    youtubeCookieBrowser: key
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
          {youtubeCookieBrowser === 'firefox' || youtubeCookieBrowser === 'none' ? (
            <p className="account-login-note">
              {youtubeCookieBrowser === 'firefox' ? accountCopy.unsupportedBrowser : accountCopy.browserNone}
            </p>
          ) : null}
          <div className="account-login-actions">
            <button
              type="button"
              className="account-login-action primary"
              disabled={youtubeCookieBrowser === 'firefox' || youtubeCookieBrowser === 'none'}
              onClick={openYoutubeSystemSignIn}
            >
              <ExternalLink size={15} />
              {isZh
                ? `用 ${youtubeCookieBrowser === 'chrome' ? 'Chrome' : 'Edge'} 登录`
                : `Sign in with ${youtubeCookieBrowser === 'chrome' ? 'Chrome' : 'Edge'}`}
            </button>
            <button
              type="button"
              className="account-login-action"
              disabled={youtubeLoginSaving || youtubeCookieBrowser === 'none'}
              onClick={saveYoutubeSystemCookies}
            >
              {youtubeLoginSaving ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
              {accountCopy.saveYoutube}
            </button>
            {signInStatus.youtube || youtubeCookieUpdatedAt ? (
              <button type="button" className="account-login-action danger" onClick={logoutYoutube}>
                <LogOut size={15} />
                {accountCopy.logout}
              </button>
            ) : null}
          </div>
          {youtubeLoginStatus ? <p className="account-login-note">{youtubeLoginStatus}</p> : null}
        </section>

        <section className="account-login-card">
          <div className="account-login-card__top">
            <div>
              <h4>Bilibili</h4>
              <p>{accountCopy.bilibiliHint}</p>
            </div>
            <span className={`account-login-status ${signInStatus.bilibili ? 'is-signed-in' : 'is-muted'}`}>
              {signInStatus.bilibili ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {signInStatus.bilibili ? accountCopy.signedIn : accountCopy.notSignedIn}
            </span>
          </div>
          <div className="account-login-actions">
            <button type="button" className="account-login-action primary" onClick={openBilibiliSignIn}>
              {bilibiliSigningIn ? <Loader2 size={15} className="spin" /> : <ExternalLink size={15} />}
              {signInStatus.bilibili ? accountCopy.reSignIn : accountCopy.oneClick}
            </button>
            {signInStatus.bilibili ? (
              <button type="button" className="account-login-action danger" onClick={logoutBilibili}>
                <LogOut size={15} />
                {accountCopy.logout}
              </button>
            ) : null}
          </div>
        </section>

      </div>
    </div>
  )
}
