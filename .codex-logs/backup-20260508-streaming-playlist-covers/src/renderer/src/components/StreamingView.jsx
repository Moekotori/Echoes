import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CalendarDays,
  Download,
  ListMusic,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { formatRemoteDuration } from '../utils/remoteLibrary'
import { writeTrackMetaCache } from '../utils/trackMetaCache'
import StreamingSourceBadge from './StreamingSourceBadge'

const STREAMING_QUALITY_STORAGE_KEY = 'echo.streaming.audioQualityMode'
const STREAMING_SESSION_STORAGE_KEY = 'echo.streaming.searchSession'

const PROVIDERS = [
  { id: 'netease', labelKey: 'streaming.providers.netease', hintKey: 'streaming.providerHints.native' },
  { id: 'qqMusic', labelKey: 'streaming.providers.qqMusic', hintKey: 'streaming.providerHints.native' },
  { id: 'soundcloud', labelKey: 'streaming.providers.soundcloud', hintKey: 'streaming.providerHints.signInRequired' }
]
const PLAYLIST_PROVIDERS = [
  {
    id: 'netease',
    labelKey: 'streaming.playlists.netease',
    promptKey: 'streaming.playlists.neteasePrompt'
  },
  {
    id: 'qqMusic',
    labelKey: 'streaming.playlists.qqMusic',
    promptKey: 'streaming.playlists.qqMusicPrompt'
  }
]
const CATALOG_PROVIDER_IDS = new Set(['netease', 'qqMusic', 'soundcloud'])

const QUALITY_OPTIONS = [
  { id: 'lossless', labelKey: 'streaming.quality.lossless' },
  { id: 'lossy', labelKey: 'streaming.quality.lossy' }
]

function getDefaultProviders(signInStatus) {
  const enabled = []
  if (signInStatus?.netease) enabled.push('netease')
  if (signInStatus?.qqMusic) enabled.push('qqMusic')
  if (signInStatus?.soundcloud) enabled.push('soundcloud')
  return enabled.length > 0 ? enabled : ['netease', 'qqMusic']
}

function normalizeQualityMode(value) {
  return value === 'lossy' ? 'lossy' : 'lossless'
}

function getInitialQualityMode() {
  try {
    return normalizeQualityMode(window.localStorage?.getItem(STREAMING_QUALITY_STORAGE_KEY))
  } catch {
    return 'lossless'
  }
}

function getInitialStreamingSession() {
  try {
    const raw = window.sessionStorage?.getItem(STREAMING_SESSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      selectedProviders: Array.isArray(parsed.selectedProviders) ? parsed.selectedProviders.filter(Boolean) : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses : []
    }
  } catch {
    return {}
  }
}

function rememberStreamingSession(snapshot) {
  try {
    window.sessionStorage?.setItem(STREAMING_SESSION_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* ignore storage failures */
  }
}

function playbackModeLabel(track, t) {
  if (track?.playbackMode === 'nativeStream') return 'ECHO'
  if (track?.playbackMode === 'controlledPlayback') return t('streaming.mode.controlled', 'Controlled')
  return t('streaming.mode.pending', 'Pending')
}

function statusMessage(status, t) {
  if (!status || status.ok) return ''
  if (status.reason === 'controlled_playback_only') return status.message
  return status.message || t('streaming.notices.searchFailed', 'Search failed')
}

function sampleRateLabel(value, fallback = 0) {
  const rate = Number(value || fallback || 0) || 0
  if (!rate) return ''
  if (rate >= 1000) return `${Math.round(rate / 100) / 10}kHz`
  return `${rate}Hz`
}

function inferStreamingSampleRate(track, cleanLabel) {
  const quality = track?.raw?.quality || track?.quality || {}
  const file = quality.file || {}
  if (/hi-res/i.test(cleanLabel)) {
    return sampleRateLabel(quality.hr?.sr || file.hires_sample)
  }
  if (/^(flac|ape)/i.test(cleanLabel)) {
    return sampleRateLabel(quality.sq?.sr || 44100)
  }
  return ''
}

function qualityText(track, t) {
  const text = String(track?.qualityLabel || '').trim()
  if (!text) return playbackModeLabel(track, t)
  const cleaned = text
    .replace(/曲库最高\s*/gi, '')
    .replace(/账号最高\s*[0-9.]+\s*(?:k|kbps|Mbps)?/gi, '')
    .replace(/\bhi[\s_-]?res\b/gi, 'Hi-Res')
    .replace(/\s*[\/·]\s*$/g, '')
    .replace(/\s*[\/·]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!cleaned) return playbackModeLabel(track, t)
  if (/\d+(?:\.\d+)?kHz/i.test(cleaned) || /mp3/i.test(cleaned)) return cleaned
  const sample = inferStreamingSampleRate(track, cleaned)
  return sample ? `${cleaned} ${sample}` : cleaned
}

function sanitizeDownloadName(value, fallback = 'streaming-track') {
  const safe = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return safe || fallback
}

async function getDownloaderPreferences() {
  const [config, downloaderSettings] = await Promise.all([
    (window.api?.appStateGet?.('config') || Promise.resolve(null)).catch(() => null),
    (window.api?.appStateGet?.('downloaderSettings') || Promise.resolve(null)).catch(() => null)
  ])
  let localQuality = ''
  try {
    localQuality = window.localStorage?.getItem('echoes.downloaderAudioQuality') || ''
  } catch {
    localQuality = ''
  }
  return {
    folder: String(
      config?.downloadFolder ||
        config?.downloadPath ||
        downloaderSettings?.downloadFolder ||
        downloaderSettings?.downloadPath ||
        ''
    ).trim(),
    audioQualityPreset: downloaderSettings?.audioQualityPreset || localQuality || 'auto',
    quickMode: config?.downloaderQuickMode === true || downloaderSettings?.quickMode === true
  }
}

export default function StreamingView({ onPlayTrack }) {
  const { t } = useTranslation()
  const initialSession = useMemo(getInitialStreamingSession, [])
  const [query, setQuery] = useState(initialSession.query || '')
  const [selectedProviders, setSelectedProviders] = useState(initialSession.selectedProviders || [])
  const [qualityMode, setQualityMode] = useState(getInitialQualityMode)
  const [results, setResults] = useState(initialSession.results || [])
  const [statuses, setStatuses] = useState(initialSession.statuses || [])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [signInStatus, setSignInStatus] = useState({})
  const [downloadingId, setDownloadingId] = useState('')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyMode, setDailyMode] = useState(false)
  const [playlistLoadingProvider, setPlaylistLoadingProvider] = useState('')
  const [playlistLinkProvider, setPlaylistLinkProvider] = useState('')
  const [playlistLinkInput, setPlaylistLinkInput] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api?.checkSignInStatus?.().then((status) => {
      if (cancelled) return
      setSignInStatus(status || {})
      setSelectedProviders((prev) => (prev.length > 0 ? prev : getDefaultProviders(status || {})))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage?.setItem(STREAMING_QUALITY_STORAGE_KEY, qualityMode)
    } catch {
      /* ignore storage failures */
    }
  }, [qualityMode])

  useEffect(() => {
    rememberStreamingSession({
      query,
      selectedProviders,
      results,
      statuses
    })
  }, [query, selectedProviders, results, statuses])

  useEffect(() => {
    const unsubscribe = window.api?.media?.onProgress?.((data) => {
      const progress = Number(data?.progress)
      if (!Number.isFinite(progress)) return
      setDownloadProgress(Math.max(0, Math.min(100, progress)))
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  const selectedSet = useMemo(() => new Set(selectedProviders), [selectedProviders])
  const searchableCatalogProviders = useMemo(
    () => selectedProviders.filter((id) => CATALOG_PROVIDER_IDS.has(id)),
    [selectedProviders]
  )
  const visibleResults = useMemo(
    () => results.filter((track) => selectedSet.has(track?.provider)),
    [results, selectedSet]
  )
  const groupedStatuses = useMemo(
    () => statuses.filter((status) => selectedSet.has(status?.provider) && statusMessage(status, t)),
    [statuses, selectedSet, t]
  )
  const toggleProvider = (providerId) => {
    setDailyMode(false)
    setSelectedProviders((prev) => {
      if (prev.includes(providerId)) {
        const next = prev.filter((id) => id !== providerId)
        return next.length > 0 ? next : prev
      }
      return [...prev, providerId]
    })
  }

  const changeQualityMode = (nextMode) => {
    const normalized = normalizeQualityMode(nextMode)
    setQualityMode(normalized)
    if (results.length > 0) {
      setNotice(t('streaming.notices.qualityUpdated', 'Default quality updated. It will apply to the next search or new playback result.'))
    }
  }

  const loadDailyRecommendations = useCallback(async () => {
    if (!signInStatus.netease) {
      setDailyMode(true)
      setResults([])
      setStatuses([])
      setNotice(t('streaming.daily.signInRequired', 'Sign in to NetEase Cloud Music to see your daily recommendations.'))
      return
    }
    setDailyLoading(true)
    setNotice('')
    try {
      const payload = await window.api?.streaming?.neteaseDailyRecommendations?.({
        audioQualityMode: qualityMode
      })
      if (!payload?.ok) {
        if (payload?.error === 'auth_required') {
          throw new Error(t('streaming.daily.signInRequired', 'Sign in to NetEase Cloud Music to see your daily recommendations.'))
        }
        throw new Error(payload?.error || t('streaming.daily.loadFailed', 'Could not load daily recommendations.'))
      }
      const tracks = Array.isArray(payload.results) ? payload.results : []
      setDailyMode(true)
      setSelectedProviders((prev) => (prev.includes('netease') ? prev : ['netease', ...prev]))
      setResults(tracks)
      setStatuses([])
      if (tracks.length === 0) {
        setNotice(t('streaming.daily.empty', 'No daily recommendations were returned today.'))
      }
    } catch (error) {
      setDailyMode(true)
      setResults([])
      setStatuses([])
      setNotice(error?.message || String(error))
    } finally {
      setDailyLoading(false)
    }
  }, [qualityMode, signInStatus.netease, t])

  const openProviderPlaylistInput = useCallback((providerId) => {
    setPlaylistLinkProvider((prev) => (prev === providerId ? '' : providerId))
    setPlaylistLinkInput('')
    setNotice('')
  }, [])

  const loadProviderPlaylist = useCallback(async (providerId, playlistInput = playlistLinkInput) => {
    const raw = String(playlistInput || '').trim()
    if (!raw) return
    setDailyMode(false)
    setPlaylistLoadingProvider(providerId)
    setNotice('')
    try {
      const payload = await window.api?.streaming?.fetchPlaylist?.({
        provider: providerId,
        playlistInput: raw,
        audioQualityMode: qualityMode
      })
      if (!payload?.ok) {
        throw new Error(
          payload?.error === 'invalid_playlist_link'
            ? t('streaming.playlists.invalidLink', 'Invalid playlist link or ID.')
            : payload?.error || t('streaming.playlists.loadFailed', 'Could not open this playlist.')
        )
      }
      const tracks = Array.isArray(payload.results) ? payload.results : []
      setSelectedProviders((prev) => (prev.includes(providerId) ? prev : [providerId, ...prev]))
      setResults(tracks)
      setStatuses([])
      setPlaylistLinkProvider('')
      setPlaylistLinkInput('')
      setNotice(
        tracks.length > 0
          ? t('streaming.playlists.loaded', {
              name: payload.playlistName || t('streaming.playlists.fallbackName', 'Playlist'),
              count: tracks.length,
              defaultValue: 'Loaded {{count}} tracks from {{name}}.'
            })
          : t('streaming.playlists.empty', 'This playlist returned no playable tracks.')
      )
    } catch (error) {
      setResults([])
      setStatuses([])
      setNotice(error?.message || String(error))
    } finally {
      setPlaylistLoadingProvider('')
    }
  }, [playlistLinkInput, qualityMode, t])

  const submitProviderPlaylist = useCallback((event) => {
    event?.preventDefault?.()
    if (!playlistLinkProvider || playlistLoadingProvider) return
    loadProviderPlaylist(playlistLinkProvider, playlistLinkInput)
  }, [loadProviderPlaylist, playlistLinkInput, playlistLinkProvider, playlistLoadingProvider])

  const runSearch = async (event) => {
    event?.preventDefault?.()
    const text = query.trim()
    if (!text) {
      setNotice(t('streaming.notices.enterQuery', 'Enter a song, artist, or album before searching.'))
      return
    }
    setDailyMode(false)
    setLoading(true)
    setNotice('')
    try {
      const musicPayload = searchableCatalogProviders.length > 0
        ? await window.api?.streaming?.search?.({
            query: text,
            providers: searchableCatalogProviders,
            audioQualityMode: qualityMode
          })
        : { ok: true, results: [], statuses: [] }
      if (!musicPayload?.ok) throw new Error(musicPayload?.error || t('streaming.notices.searchFailed', 'Search failed'))
      const musicResults = Array.isArray(musicPayload.results) ? musicPayload.results : []
      setResults(musicResults)
      setStatuses(Array.isArray(musicPayload.statuses) ? musicPayload.statuses : [])
      if (musicResults.length === 0) {
        setNotice(t('streaming.notices.noResults', 'Enabled providers were searched, but no playable song results were found.'))
      }
    } catch (error) {
      setResults([])
      setStatuses([])
      setNotice(error?.message || String(error))
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = async (track) => {
    setNotice('')
    const result = await onPlayTrack?.(track, { contextTracks: visibleResults })
    if (result?.message) setNotice(result.message)
  }

  const handlePlayDaily = async () => {
    const first = visibleResults[0]
    if (!first) return
    setNotice('')
    const result = await onPlayTrack?.(first, { contextTracks: visibleResults })
    if (result?.message) setNotice(result.message)
  }

  const handleDownload = async (track) => {
    const actionId = track?.id || `${track?.provider || 'streaming'}-${track?.sourceId || ''}`
    setNotice('')
    setDownloadingId(actionId)
    setDownloadProgress(0)
    try {
      const prefs = await getDownloaderPreferences()
      if (!prefs.folder) {
        throw new Error(t('streaming.notices.downloadFolderRequired', 'Set a default download folder in Settings first.'))
      }

      if (track?.provider === 'netease') {
        const songId = track?.sourceId || track?.raw?.id
        if (!songId) throw new Error(t('streaming.notices.neteaseMissingId', 'NetEase track is missing a song ID and cannot be downloaded.'))
        await window.api?.media?.downloadAudio?.(
          `https://music.163.com/song?id=${encodeURIComponent(songId)}`,
          prefs.folder,
          {
            audioQualityPreset: prefs.audioQualityPreset,
            quickMode: prefs.quickMode
          }
        )
        setDownloadProgress(100)
        setNotice(t('streaming.notices.sentToDownloader', {
          title: track.title || t('streaming.providers.neteaseTrack', 'NetEase track'),
          defaultValue: 'Sent to media downloader: {{title}}'
        }))
        return
      }

      if (track?.provider === 'qqMusic') {
        const urlInfo = await window.api?.qqMusicGetSongUrl?.(
          track.raw || track,
          prefs.audioQualityPreset
        )
        if (!urlInfo?.url) {
          throw new Error(t('streaming.notices.qqDirectFailed', 'Could not get a QQ Music direct link. Membership, availability, or expired cookies may be the reason.'))
        }
        const artist = track.artist || ''
        const safeName = sanitizeDownloadName(
          artist ? `${artist} - ${track.title || track.raw?.name || 'QQ Music'}` : track.title,
          `qq-${track.sourceId || 'track'}`
        )
        const filePath = await window.api?.media?.downloadFromUrl?.({
          url: urlInfo.url,
          targetFolder: prefs.folder,
          filename: `${safeName}.${urlInfo.ext || urlInfo.type || 'mp3'}`,
          headers: urlInfo.headers || {}
        })
        setDownloadProgress(100)
        if (filePath && window.api?.media?.applyDownloadedMetadata) {
          await window.api.media.applyDownloadedMetadata({
            path: filePath,
            title: track.title || '',
            artist,
            album: track.album || '',
            albumArtist: artist,
            coverUrl: track.cover || ''
          }).catch(() => null)
          void writeTrackMetaCache({
            [filePath]: {
              title: track.title || null,
              artist: artist || null,
              album: track.album || null,
              albumArtist: artist || null,
              cover: track.cover || null,
              coverChecked: true
            }
          })
        }
        setNotice(t('streaming.notices.downloaded', {
          title: track.title || t('streaming.providers.qqMusicTrack', 'QQ Music track'),
          defaultValue: 'Downloaded: {{title}}'
        }))
        return
      }

      if (track?.provider === 'soundcloud') {
        const url = track.webpageUrl || track.raw?.webpageUrl || track.raw?.webpage_url || track.sourceId || ''
        if (!/^https?:\/\//i.test(url)) throw new Error(t('streaming.notices.soundcloudMissingUrl', 'SoundCloud track is missing a downloadable link.'))
        const result = await window.api?.downloadSoundCloud?.(url, prefs.folder)
        if (!result?.success) throw new Error(result?.error || t('streaming.notices.soundcloudDownloadFailed', 'SoundCloud download failed.'))
        setDownloadProgress(100)
        setNotice(t('streaming.notices.downloaded', {
          title: track.title || result.name || t('streaming.providers.soundcloudTrack', 'SoundCloud track'),
          defaultValue: 'Downloaded: {{title}}'
        }))
        return
      }

      throw new Error(t('streaming.notices.downloadUnsupported', 'Downloading this source is not supported yet.'))
    } catch (error) {
      setNotice(error?.message || String(error))
    } finally {
      setDownloadingId('')
      window.setTimeout(() => setDownloadProgress(0), 800)
    }
  }

  const handleDownloadDaily = async () => {
    if (visibleResults.length === 0 || dailyLoading) return
    setDailyLoading(true)
    for (const track of visibleResults) {
      await handleDownload(track)
    }
    setDailyLoading(false)
    setNotice(t('streaming.daily.downloadQueued', 'Daily recommendations were sent to the downloader.'))
  }

  return (
    <div className="streaming-view">
      <div className="streaming-hero">
        <div>
          <h2>{t('streaming.title', 'Streaming')}</h2>
          <p>{t('streaming.description', 'Independent online search. Native streams can use ECHO WASAPI Exclusive / EQ; controlled providers are bypassed automatically.')}</p>
        </div>
        <button
          type="button"
          className="streaming-refresh"
          onClick={() =>
            window.api?.checkSignInStatus?.().then((status) => {
              setSignInStatus(status || {})
              setSelectedProviders(getDefaultProviders(status || {}))
            })
          }
        >
          <RefreshCw size={15} />
          {t('streaming.refreshAccounts', 'Refresh accounts')}
        </button>
      </div>

      <div className="streaming-provider-bar" aria-label={t('streaming.providersAria', 'Streaming providers')}>
        <button
          type="button"
          className={`streaming-provider-chip streaming-provider-chip--daily${dailyMode ? ' active signed-in' : ''}`}
          onClick={loadDailyRecommendations}
          disabled={dailyLoading}
        >
          <span className="streaming-source-badge streaming-source-badge--daily">
            {dailyLoading ? <Loader2 size={12} className="spin" /> : <CalendarDays size={13} />}
          </span>
          <span>{t('streaming.daily.title', 'Daily Recommendations')}</span>
          <small>{t('streaming.daily.subtitleShort', 'Updated 6:00')}</small>
        </button>
        {PROVIDERS.map((provider) => {
          const active = selectedSet.has(provider.id)
          const signedIn =
            provider.id === 'netease'
              ? signInStatus.netease
              : provider.id === 'qqMusic'
                ? signInStatus.qqMusic
                : provider.id === 'soundcloud'
                  ? signInStatus.soundcloud
                  : false
          return (
            <button
              key={provider.id}
              type="button"
              className={`streaming-provider-chip${active ? ' active' : ''}${signedIn ? ' signed-in' : ''}`}
              onClick={() => toggleProvider(provider.id)}
            >
              <StreamingSourceBadge provider={provider.id} title={t(provider.labelKey)} />
              <span>{t(provider.labelKey)}</span>
              <small>{signedIn ? t('streaming.signedIn', 'Signed in') : t(provider.hintKey)}</small>
            </button>
          )
        })}
        {PLAYLIST_PROVIDERS.map((provider) => {
          const loadingPlaylist = playlistLoadingProvider === provider.id
          const inputActive = playlistLinkProvider === provider.id
          return (
            <button
              key={`${provider.id}-playlist`}
              type="button"
              className={`streaming-provider-chip streaming-provider-chip--playlist${
                loadingPlaylist || inputActive ? ' active' : ''
              }`}
              onClick={() => openProviderPlaylistInput(provider.id)}
              disabled={loadingPlaylist}
            >
              <span className="streaming-source-badge">
                {loadingPlaylist ? <Loader2 size={12} className="spin" /> : <ListMusic size={13} />}
              </span>
              <span>{t(provider.labelKey)}</span>
              <small>{t('streaming.playlists.hint', 'Paste link to open')}</small>
            </button>
          )
        })}
      </div>

      {playlistLinkProvider && (
        <form className="streaming-playlist-link" onSubmit={submitProviderPlaylist}>
          <ListMusic size={16} />
          <input
            value={playlistLinkInput}
            onChange={(event) => setPlaylistLinkInput(event.target.value)}
            autoFocus
            placeholder={t(
              PLAYLIST_PROVIDERS.find((provider) => provider.id === playlistLinkProvider)?.promptKey ||
                'streaming.playlists.prompt',
              'Paste a playlist link or ID'
            )}
            disabled={Boolean(playlistLoadingProvider)}
          />
          <button
            type="button"
            onClick={() => {
              setPlaylistLinkProvider('')
              setPlaylistLinkInput('')
            }}
            disabled={Boolean(playlistLoadingProvider)}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" disabled={Boolean(playlistLoadingProvider) || !playlistLinkInput.trim()}>
            {playlistLoadingProvider ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Search size={14} />
            )}
            {t('streaming.playlists.open', 'Open')}
          </button>
        </form>
      )}

      <form className="streaming-search" onSubmit={runSearch}>
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('streaming.searchPlaceholder', 'Search online songs, artists, or albums...')}
        />
        <div className="streaming-quality-toggle" role="group" aria-label={t('streaming.qualityAria', 'Default quality')}>
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={qualityMode === option.id ? 'active' : ''}
              onClick={() => changeQualityMode(option.id)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        <button type="submit" disabled={loading}>
          {loading ? <Loader2 size={17} className="spin" /> : <SlidersHorizontal size={17} />}
          {t('streaming.search', 'Search')}
        </button>
      </form>

      {groupedStatuses.length > 0 && (
        <div className="streaming-status-list">
          {groupedStatuses.map((status) => (
            <div key={status.provider} className="streaming-status">
              <AlertCircle size={14} />
              <span>{statusMessage(status, t)}</span>
            </div>
          ))}
        </div>
      )}

      {notice && <div className="streaming-notice">{notice}</div>}

      {dailyMode && visibleResults.length > 0 && (
        <div className="streaming-notice streaming-notice--daily">
          <Music size={14} />
          <span>
            {t('streaming.daily.loaded', {
              count: visibleResults.length,
              defaultValue: 'Loaded {{count}} daily recommendations.'
            })}
          </span>
          <button type="button" onClick={handlePlayDaily}>
            <Play size={14} /> {t('streaming.daily.playAll', 'Play All')}
          </button>
          <button type="button" onClick={handleDownloadDaily} disabled={dailyLoading}>
            {dailyLoading ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            {t('streaming.daily.download', 'Download')}
          </button>
        </div>
      )}

      <div className="streaming-result-list">
        {loading && (
          <div className="streaming-empty">
            <Loader2 size={24} className="spin" />
            <span>{t('streaming.loading', 'Searching enabled providers...')}</span>
          </div>
        )}
        {!loading &&
          visibleResults.map((track) => {
            const native = track.playbackMode === 'nativeStream'
            const actionId = track.id || `${track.provider}-${track.sourceId}`
            const isDownloading = downloadingId === actionId
            return (
              <div
                key={track.id || `${track.provider}-${track.sourceId}`}
                className="streaming-result-row"
                role="button"
                tabIndex={0}
                onDoubleClick={() => handlePlay(track)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void handlePlay(track)
                }}
                title={t('streaming.actions.doubleClickPlay', 'Double-click to play')}
              >
                <div className="streaming-cover">
                  {track.cover ? (
                    <img src={track.cover} alt="" loading="lazy" />
                  ) : (
                    <div className="streaming-cover-fallback">
                      <Music size={20} />
                    </div>
                  )}
                  <StreamingSourceBadge provider={track.provider} />
                </div>
                <div className="streaming-result-main">
                  <strong>{track.title || t('streaming.unknownTitle', 'Unknown Title')}</strong>
                  <span>{track.artist || t('common.unknownArtist', 'Unknown Artist')}{track.album ? ` / ${track.album}` : ''}</span>
                  <small>{track.providerLabel || track.provider}</small>
                </div>
                <span className="streaming-duration">{formatRemoteDuration(track.duration)}</span>
                <span className={`streaming-quality-pill rank-${track.qualityRank || 0}`}>
                  {qualityText(track, t)}
                </span>
                <span className={`streaming-mode-pill${native ? ' native' : ' controlled'}`}>
                  {native ? t('streaming.mode.native', 'Native') : t('streaming.mode.controlled', 'Controlled')}
                </span>
                <div className="streaming-action-group" onDoubleClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="streaming-action-button download"
                    onClick={() => handleDownload(track)}
                    disabled={isDownloading}
                    title={t('streaming.actions.downloadTitle', 'Download to the media download folder')}
                    aria-label={t('streaming.actions.download', 'Download')}
                  >
                    {isDownloading ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Download size={16} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="streaming-action-button primary"
                    onClick={() => handlePlay(track)}
                    title={t('streaming.actions.playTitle', 'Play with ECHO')}
                    aria-label={t('streaming.actions.play', 'Play')}
                  >
                    <Play size={16} />
                  </button>
                </div>
                {isDownloading ? (
                  <div
                    className="streaming-download-progress"
                    aria-label={t('streaming.downloadProgress', 'Download progress')}
                    style={{ '--streaming-download-progress': `${downloadProgress}%` }}
                  >
                    <span />
                    <small>{Math.round(downloadProgress)}%</small>
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}
