import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  ToggleLeft,
  ToggleRight,
  Link,
  Play,
  Minus,
  Plus,
  Search,
  ChevronDown,
  Check
} from 'lucide-react'
import {
  buildBilibiliAutoMvQueries,
  buildYoutubeAutoMvQueries
} from '../../../shared/mvSearchRank.mjs'
import { orderMvSearchItems } from '../utils/mvSearchCandidates'
import { extractVideoId } from '../utils/mvUrlParse'

const QUALITY_LABELS = {
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  hd1440: '1440p',
  hd2160: '4K',
  highres: '4K+'
}

function getMvQualityPresentation(mvId, mvPlaybackQuality, biliDirectStream, t) {
  if (!mvPlaybackQuality) return null
  const label = QUALITY_LABELS[mvPlaybackQuality] || mvPlaybackQuality
  if (mvId?.source === 'bilibili') {
    if (biliDirectStream?.ok) {
      return {
        badge: label,
        inline: label,
        hint: t('mvDrawer.hintBiliDirect', {
          format: biliDirectStream.format?.toUpperCase() || 'DASH'
        }),
        pillClass: 'mv-drawer-quality-live'
      }
    }
    return {
      badge: `~${label}`,
      inline: `~${label}`,
      hint: t('mvDrawer.hintBiliEmbed'),
      pillClass: 'mv-drawer-quality-estimate'
    }
  }
  return {
    badge: label,
    inline: label,
    hint: t('mvDrawer.hintYoutube'),
    pillClass: 'mv-drawer-quality-live'
  }
}

function buildDefaultMvQuery(title = '', artist = '') {
  const safeTitle = String(title || '').trim()
  const safeArtist = String(artist || '').trim()
  return [safeTitle, safeArtist].filter(Boolean).join(' ').trim()
}

function buildMvVideoUrl(mvId) {
  const id = String(mvId?.id || '').trim()
  if (!id) return ''
  if (mvId?.source === 'bilibili') return `https://www.bilibili.com/video/${id}`
  if (mvId?.source === 'youtube') return `https://www.youtube.com/watch?v=${id}`
  return ''
}

function collectManualMvSearchQueries(query = '', source = 'bilibili', title = '', artist = '') {
  const safeQuery = String(query || '').trim()
  const safeTitle = String(title || '').trim()
  const safeArtist = String(artist || '').trim()
  const generated =
    String(source || '').toLowerCase() === 'youtube'
      ? buildYoutubeAutoMvQueries(safeTitle, safeArtist)
      : buildBilibiliAutoMvQueries(safeTitle, safeArtist)
  const candidates = [
    safeQuery,
    ...generated,
    safeTitle,
    buildDefaultMvQuery(safeTitle, safeArtist)
  ]
  const seen = new Set()
  return candidates
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => {
      const key = item.toLowerCase()
      if (!item || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function MvDrawerSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selectedOption = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`mv-drawer-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="mv-drawer-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="mv-drawer-select-menu" role="listbox">
          {options.map((option) => {
            const selected = option.value === selectedOption?.value
            return (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={selected}
                className={`mv-drawer-select-option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {selected && <Check size={14} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MvSettingsDrawer({
  open,
  onClose,
  config,
  setConfig,
  mvId,
  setMvId,
  mvPlaybackQuality,
  biliDirectStream,
  onPersistMvOverride,
  onRestartPlayback,
  onAutoSearchCurrentMv,
  autoSearchResults,
  currentTrackTitle,
  currentTrackArtist
}) {
  const { t } = useTranslation()
  const [customUrl, setCustomUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setUrlError('')
      setSearchError('')
      setSearchNotice('')
      setSearching(false)
      setSearchResults([])
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const nextQuery = buildDefaultMvQuery(currentTrackTitle, currentTrackArtist)
    setSearchQuery((prev) => (prev.trim() ? prev : nextQuery))
    setSearchError('')
    setSearchNotice('')
    setSearchResults([])
  }, [open, currentTrackArtist, currentTrackTitle])

  useEffect(() => {
    if (!open || !autoSearchResults) return
    const items = Array.isArray(autoSearchResults.items) ? autoSearchResults.items : []
    setSearchQuery(
      autoSearchResults.query || buildDefaultMvQuery(currentTrackTitle, currentTrackArtist)
    )
    setSearchResults(items)
    setSearchError(autoSearchResults.error || '')
    setSearchNotice(
      autoSearchResults.error
        ? ''
        : items.length > 0
          ? t('mvDrawer.autoSearchResultsReady')
          : autoSearchResults.status === 'empty'
            ? t('mvDrawer.searchNoCandidate')
            : ''
    )
  }, [autoSearchResults, currentTrackArtist, currentTrackTitle, open, t])

  const handleCustomMv = useCallback(() => {
    setUrlError('')
    const result = extractVideoId(customUrl)
    if (!result) {
      setUrlError(t('mvDrawer.urlError'))
      return
    }
    const next = { id: result.id, source: result.source }
    setMvId(next)
    if (onPersistMvOverride) onPersistMvOverride(next)
    setCustomUrl('')
    if (onRestartPlayback) onRestartPlayback()
  }, [customUrl, onPersistMvOverride, onRestartPlayback, setMvId, t])

  const handleSearchMv = useCallback(async () => {
    const query = searchQuery.trim() || buildDefaultMvQuery(currentTrackTitle, currentTrackArtist)
    if (!query) {
      setSearchError(t('mvDrawer.searchEmpty'))
      setSearchNotice('')
      setSearchResults([])
      return
    }
    if (!window.api?.searchMVHandler) {
      setSearchError(t('mvDrawer.searchUnavailable'))
      setSearchNotice('')
      setSearchResults([])
      return
    }
    setSearching(true)
    setSearchError('')
    setSearchNotice('')
    try {
      const source = config.mvSource || 'bilibili'
      const queries = collectManualMvSearchQueries(
        query,
        source,
        currentTrackTitle,
        currentTrackArtist
      )

      for (const mvQuery of queries) {
        const result = await window.api.searchMVHandler(mvQuery, source, {
          title: currentTrackTitle,
          artist: currentTrackArtist
        })
        const items = orderMvSearchItems(result, source)
        if (items.length === 0) continue

        setSearchQuery(mvQuery)
        setSearchResults(items)
        return
      }

      setSearchResults([])
      setSearchNotice(t('mvDrawer.searchNoCandidate'))
    } catch (error) {
      setSearchResults([])
      setSearchNotice('')
      setSearchError(error?.message || t('mvDrawer.searchFailed'))
    } finally {
      setSearching(false)
    }
  }, [config.mvSource, currentTrackArtist, currentTrackTitle, searchQuery, t])

  const handleApplySearchResult = useCallback(
    (item) => {
      if (!item?.id || !item?.source) return
      const next = {
        id: item.id,
        source: item.source,
        title: item.title || '',
        author: item.author || ''
      }
      setMvId(next)
      if (onPersistMvOverride) onPersistMvOverride(next)
      if (onRestartPlayback) onRestartPlayback()
    },
    [onPersistMvOverride, onRestartPlayback, setMvId]
  )

  const qualityPres = getMvQualityPresentation(mvId, mvPlaybackQuality, biliDirectStream, t)
  const mvOffsetMs = config.mvOffsetMs ?? 0
  const nowPlayingUrl = buildMvVideoUrl(mvId)
  const nowPlayingTitle = String(mvId?.title || '').trim()
  const nowPlayingAuthor = String(mvId?.author || '').trim()
  const nowPlayingText = [mvId?.source, mvId?.id].filter(Boolean).join(' - ')
  const mvSourceOptions = [
    { value: 'youtube', label: 'YouTube' },
    { value: 'bilibili', label: 'Bilibili' }
  ]
  const mvQualityOptions = [
    { value: 'ultra', label: t('mvDrawer.qualityUltra') },
    { value: 'highfps', label: t('mvDrawer.qualityHighFps') },
    { value: 'high', label: t('mvDrawer.qualityHigh') },
    { value: 'medium', label: t('mvDrawer.qualityMedium') },
    { value: 'low', label: t('mvDrawer.qualityLow') }
  ]

  return (
    <>
      <div
        className={`lyrics-drawer-backdrop ${open ? 'lyrics-drawer-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`lyrics-drawer-panel ${open ? 'lyrics-drawer-panel--open' : ''}`}
        role="dialog"
        aria-label={t('drawer.mvAria')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lyrics-drawer-header">
          <h2 className="lyrics-drawer-title">{t('drawer.mvTitle')}</h2>
          <button
            type="button"
            className="lyrics-drawer-close"
            onClick={onClose}
            aria-label={t('aria.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="lyrics-drawer-body">
          <div className="mv-drawer-shortcuts" aria-label={t('mvDrawer.shortcutsAria')}>
            <span className="mv-drawer-shortcut">
              <kbd>Esc</kbd>
              {t('mvDrawer.shortcutEsc')}
            </span>
            <span className="mv-drawer-shortcut">
              <kbd>F11</kbd>
              {t('mvDrawer.shortcutF11')}
            </span>
          </div>

          <section className="mv-drawer-section">
            <h3 className="mv-drawer-section-title">
              <Search size={16} />
              {t('mvDrawer.searchTitle')}
            </h3>
            <p className="mv-drawer-hint">{t('mvDrawer.searchHint')}</p>
            <div className="mv-drawer-url-row">
              <input
                type="text"
                className="mv-drawer-url-input"
                placeholder={t('mvDrawer.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchError('')
                  setSearchNotice('')
                  setSearchResults([])
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearchMv()
                }}
              />
              <button
                type="button"
                className="mv-drawer-url-btn"
                onClick={() => void handleSearchMv()}
                disabled={searching}
              >
                <Search size={16} />
              </button>
            </div>
            <div className="mv-drawer-search-actions">
              <button
                type="button"
                className="mv-drawer-action-btn"
                onClick={() => {
                  const nextQuery = buildDefaultMvQuery(currentTrackTitle, currentTrackArtist)
                  setSearchQuery(nextQuery)
                  setSearchError('')
                  setSearchNotice('')
                  setSearchResults([])
                }}
              >
                {t('mvDrawer.useSongName')}
              </button>
            </div>
            {searchError && <p className="mv-drawer-url-error">{searchError}</p>}
            {searchNotice && <p className="mv-drawer-search-status">{searchNotice}</p>}
            {searching && <p className="mv-drawer-search-status">{t('mvDrawer.searching')}</p>}
            {searchResults.length > 0 && (
              <div className="mv-drawer-search-list">
                {searchResults.map((item) => (
                  <div key={`${item.source}:${item.id}`} className="mv-drawer-search-result">
                    <div className="mv-drawer-search-result__meta">
                      <p className="mv-drawer-search-result__title" title={item.title || ''}>
                        {item.title || t('mvDrawer.searchUntitled')}
                      </p>
                      <p className="mv-drawer-search-result__sub">
                        {[item.source, item.author, item.resolution || item.duration]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mv-drawer-action-btn"
                      onClick={() => handleApplySearchResult(item)}
                    >
                      {t('mvDrawer.useSearchResult')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mv-drawer-section">
            <h3 className="mv-drawer-section-title">
              <Link size={16} />
              {t('mvDrawer.customMv')}
            </h3>
            <p className="mv-drawer-hint">{t('mvDrawer.customHint')}</p>
            <div className="mv-drawer-url-row">
              <input
                type="text"
                className="mv-drawer-url-input"
                placeholder={t('mvDrawer.urlPlaceholder')}
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value)
                  setUrlError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomMv()
                }}
              />
              <button
                type="button"
                className="mv-drawer-url-btn"
                onClick={handleCustomMv}
                disabled={!customUrl.trim()}
              >
                <Play size={16} />
              </button>
            </div>
            {urlError && <p className="mv-drawer-url-error">{urlError}</p>}
            {mvId && (
              <div
                className={`mv-drawer-now-playing-box ${qualityPres ? 'mv-drawer-now-playing-box--stack' : ''}`}
              >
                <p className="mv-drawer-now-playing">
                  <span>{t('mvDrawer.nowPlayingLabel')}</span>
                  {nowPlayingUrl ? (
                    <a
                      href={nowPlayingUrl}
                      title={nowPlayingUrl}
                      onClick={(e) => {
                        e.preventDefault()
                        window.api?.openExternal?.(nowPlayingUrl)
                      }}
                    >
                      {nowPlayingText}
                    </a>
                  ) : (
                    <span>{nowPlayingText}</span>
                  )}
                </p>
                {nowPlayingTitle && (
                  <p className="mv-drawer-now-playing-title" title={nowPlayingTitle}>
                    {t('mvDrawer.videoTitleLabel')}
                    {nowPlayingTitle}
                    {nowPlayingAuthor ? ` - ${nowPlayingAuthor}` : ''}
                  </p>
                )}
                {qualityPres && (
                  <>
                    <span className="mv-drawer-quality-badge">{qualityPres.badge}</span>
                    <span className="mv-drawer-quality-hint">{qualityPres.hint}</span>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="mv-drawer-section">
            <h3 className="mv-drawer-section-title">{t('mvDrawer.playback')}</h3>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.enableMv')}</span>
              </div>
              <button
                className={`toggle-btn ${config.enableMV ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.enableMV
                  setConfig((prev) => ({
                    ...prev,
                    enableMV: nextValue,
                    mvAsBackground: nextValue ? prev.mvAsBackground : false
                  }))
                  if (!nextValue && !config.mvAsBackgroundMain) setMvId(null)
                }}
              >
                {config.enableMV ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.autoSearchMv')}</span>
                <span className="mv-drawer-value">{t('mvDrawer.autoSearchMvHint')}</span>
              </div>
              <button
                type="button"
                className={`toggle-btn ${config.autoSearchMV ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.autoSearchMV
                  setConfig((prev) => ({
                    ...prev,
                    autoSearchMV: nextValue
                  }))
                  if (nextValue) onAutoSearchCurrentMv?.()
                }}
              >
                {config.autoSearchMV ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.preloadMv')}</span>
                <span className="mv-drawer-value">{t('mvDrawer.preloadMvHint')}</span>
              </div>
              <button
                type="button"
                className={`toggle-btn ${config.preloadMV ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.preloadMV
                  setConfig((prev) => ({
                    ...prev,
                    preloadMV: nextValue
                  }))
                  if (nextValue) onAutoSearchCurrentMv?.()
                }}
              >
                {config.preloadMV ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.restartMusicOnMvLoad')}</span>
                <span className="mv-drawer-value">{t('mvDrawer.restartMusicOnMvLoadHint')}</span>
              </div>
              <button
                type="button"
                className={`toggle-btn ${config.restartMusicOnMvLoad ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.restartMusicOnMvLoad
                  setConfig((prev) => ({
                    ...prev,
                    restartMusicOnMvLoad: nextValue
                  }))
                }}
              >
                {config.restartMusicOnMvLoad ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.mvAsBg')}</span>
              </div>
              <button
                className={`toggle-btn ${config.mvAsBackground ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.mvAsBackground
                  setConfig((prev) => ({
                    ...prev,
                    enableMV: nextValue ? true : prev.enableMV,
                    mvAsBackground: nextValue
                  }))
                  if (!nextValue && !config.enableMV && !config.mvAsBackgroundMain) setMvId(null)
                }}
              >
                {config.mvAsBackground ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.mvAsBgMain')}</span>
              </div>
              <button
                className={`toggle-btn ${config.mvAsBackgroundMain ? 'active' : ''}`}
                onClick={() => {
                  const nextValue = !config.mvAsBackgroundMain
                  setConfig((prev) => ({
                    ...prev,
                    mvAsBackgroundMain: nextValue
                  }))
                  if (!nextValue && !config.enableMV) setMvId(null)
                }}
              >
                {config.mvAsBackgroundMain ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.mvSource')}</span>
              </div>
              <MvDrawerSelect
                value={config.mvSource || 'bilibili'}
                options={mvSourceOptions}
                onChange={(value) => setConfig((prev) => ({ ...prev, mvSource: value }))}
              />
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">
                  {t('mvDrawer.videoQuality')}
                  {qualityPres && (
                    <span className={qualityPres.pillClass}>{qualityPres.inline}</span>
                  )}
                </span>
              </div>
              <MvDrawerSelect
                value={config.mvQuality || 'high'}
                options={mvQualityOptions}
                onChange={(value) => setConfig((prev) => ({ ...prev, mvQuality: value }))}
              />
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.muteMv')}</span>
              </div>
              <button
                className={`toggle-btn ${config.mvMuted ? 'active' : ''}`}
                onClick={() => setConfig((prev) => ({ ...prev, mvMuted: !prev.mvMuted }))}
              >
                {config.mvMuted ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            <div className="lyrics-drawer-offset" style={{ marginTop: 8 }}>
              <span className="lyrics-drawer-label">{t('mvDrawer.mvSyncOffset')}</span>
              <div className="lyrics-drawer-offset-controls">
                <button
                  type="button"
                  className="lyrics-drawer-icon-btn"
                  onClick={() =>
                    setConfig((p) => ({
                      ...p,
                      mvOffsetMs: (p.mvOffsetMs ?? 0) - 50
                    }))
                  }
                  aria-label={t('lyricsDrawer.decrease50')}
                >
                  <Minus size={18} />
                </button>
                <span className="lyrics-drawer-offset-value">
                  {mvOffsetMs > 0 ? '+' : ''}
                  {mvOffsetMs} ms
                </span>
                <button
                  type="button"
                  className="lyrics-drawer-icon-btn"
                  onClick={() =>
                    setConfig((p) => ({
                      ...p,
                      mvOffsetMs: (p.mvOffsetMs ?? 0) + 50
                    }))
                  }
                  aria-label={t('lyricsDrawer.increase50')}
                >
                  <Plus size={18} />
                </button>
              </div>
              <p className="lyrics-drawer-hint">{t('mvDrawer.mvSyncOffsetHint')}</p>
            </div>

            <div className="mv-drawer-row">
              <div className="mv-drawer-row-info">
                <span className="mv-drawer-label">{t('mvDrawer.autoFallback')}</span>
              </div>
              <button
                className={`toggle-btn ${config.autoFallbackToBilibili ? 'active' : ''}`}
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    autoFallbackToBilibili: !prev.autoFallbackToBilibili
                  }))
                }
              >
                {config.autoFallbackToBilibili ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} />
                )}
              </button>
            </div>
          </section>

          {(config.mvAsBackground || config.mvAsBackgroundMain) && (
            <section className="mv-drawer-section">
              <h3 className="mv-drawer-section-title">{t('mvDrawer.immersive')}</h3>

              <div className="mv-drawer-row">
                <div className="mv-drawer-row-info">
                  <span className="mv-drawer-label">{t('mvDrawer.bgOpacity')}</span>
                  <span className="mv-drawer-value">
                    {Math.round(
                      (config.mvBackgroundOpacity !== undefined
                        ? config.mvBackgroundOpacity
                        : 0.8) * 100
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    config.mvBackgroundOpacity !== undefined ? config.mvBackgroundOpacity : 0.8
                  }
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      mvBackgroundOpacity: parseFloat(e.target.value)
                    }))
                  }
                  style={{ flex: 1, maxWidth: 180 }}
                />
              </div>

              <div className="mv-drawer-row">
                <div className="mv-drawer-row-info">
                  <span className="mv-drawer-label">{t('mvDrawer.bgBlur')}</span>
                  <span className="mv-drawer-value">
                    {Math.round(
                      config.mvBackgroundBlur !== undefined ? config.mvBackgroundBlur : 0
                    )}
                    px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={config.mvBackgroundBlur !== undefined ? config.mvBackgroundBlur : 0}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      mvBackgroundBlur: parseInt(e.target.value, 10)
                    }))
                  }
                  style={{ flex: 1, maxWidth: 180 }}
                />
              </div>

              {config.mvAsBackground && (
                <>
                  <div className="mv-drawer-row">
                    <div className="mv-drawer-row-info">
                      <span className="mv-drawer-label">{t('mvDrawer.hideImmersiveChrome')}</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${config.mvHideImmersiveChrome ? 'active' : ''}`}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          mvHideImmersiveChrome: !prev.mvHideImmersiveChrome
                        }))
                      }
                    >
                      {config.mvHideImmersiveChrome ? (
                        <ToggleRight size={28} />
                      ) : (
                        <ToggleLeft size={28} />
                      )}
                    </button>
                  </div>
                  <p className="lyrics-drawer-hint">{t('mvDrawer.hideImmersiveChromeHint')}</p>
                </>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  )
}
