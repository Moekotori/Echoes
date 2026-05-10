import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, LoaderCircle, RefreshCcw, Save, Tag, X } from 'lucide-react'

function normalizeNumberDraft(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

async function readImageAsDataUrl(filePath) {
  const href = window.api?.pathToFileURL?.(filePath)
  if (!href) throw new Error('Failed to preview selected image')
  const response = await fetch(href)
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to preview selected image'))
    reader.readAsDataURL(blob)
  })
}

export default function MetadataEditorDrawer({
  open,
  onClose,
  track,
  initialMetadata,
  onSave,
  onLoadEmbeddedTags,
  onLoadNetworkTags
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [albumArtist, setAlbumArtist] = useState('')
  const [trackNo, setTrackNo] = useState('')
  const [year, setYear] = useState('')
  const [genre, setGenre] = useState('')
  const [coverPath, setCoverPath] = useState('')
  const [coverPreview, setCoverPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [embeddedLoading, setEmbeddedLoading] = useState(false)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const applyTagResponse = (response) => {
    setTitle(String(response.title || ''))
    setArtist(String(response.artist || ''))
    setAlbum(String(response.album || ''))
    setAlbumArtist(String(response.albumArtist || ''))
    setTrackNo(normalizeNumberDraft(response.trackNumber))
    setYear(normalizeNumberDraft(response.year))
    setGenre(String(response.genre || ''))
    setCoverPath('')
    setCoverPreview(String(response.coverDataUrl || ''))
  }

  useEffect(() => {
    if (!open) {
      setLoading(false)
      setEmbeddedLoading(false)
      setNetworkLoading(false)
      setBusy(false)
      setError('')
      setNotice('')
      return
    }

    setTitle(initialMetadata?.title || '')
    setArtist(initialMetadata?.artist || '')
    setAlbum(initialMetadata?.album || '')
    setAlbumArtist(initialMetadata?.albumArtist || '')
    setTrackNo(normalizeNumberDraft(initialMetadata?.trackNo))
    setYear(normalizeNumberDraft(initialMetadata?.year))
    setGenre(initialMetadata?.genre || '')
    setCoverPath('')
    setCoverPreview(initialMetadata?.cover || '')
    setEmbeddedLoading(false)
    setNetworkLoading(false)
    setError('')
    setNotice('')
  }, [open, track?.path])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose, open])

  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      if (!open || !track?.path || !window.api?.readTags) return
      setLoading(true)
      setError('')
      try {
        const response = await window.api.readTags(track.path)
        if (cancelled) return
        if (!response || response.error) {
          throw new Error(response?.error || 'Failed to read tags')
        }
        applyTagResponse({
          ...response,
          coverDataUrl: response.coverDataUrl || initialMetadata?.cover || ''
        })
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTags()
    return () => {
      cancelled = true
    }
  }, [open, track?.path])

  const handleLoadEmbeddedTags = async () => {
    if (!track?.path) return
    setEmbeddedLoading(true)
    setError('')
    setNotice('')
    try {
      const response = onLoadEmbeddedTags
        ? await onLoadEmbeddedTags(track.path)
        : await window.api?.readTags?.(track.path)
      if (!response || response.error) {
        throw new Error(response?.error || t('metadataEditor.loadEmbeddedFailed'))
      }
      applyTagResponse(response)
      setNotice(t('metadataEditor.loadEmbeddedDone'))
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setEmbeddedLoading(false)
    }
  }

  const handleLoadNetworkTags = async () => {
    if (!track?.path) return
    setNetworkLoading(true)
    setError('')
    setNotice('')
    try {
      const response = onLoadNetworkTags ? await onLoadNetworkTags(track.path) : null
      if (!response || response.error) {
        throw new Error(response?.error || t('metadataEditor.loadNetworkFailed'))
      }
      applyTagResponse(response)
      setNotice(t('metadataEditor.loadNetworkDone'))
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setNetworkLoading(false)
    }
  }

  const displayCover = useMemo(() => {
    if (coverPath) return window.api?.pathToFileURL?.(coverPath) || coverPreview || ''
    return coverPreview || initialMetadata?.cover || ''
  }, [coverPath, coverPreview, initialMetadata?.cover])

  const selectedCoverName = useMemo(() => {
    const source = coverPath || ''
    return source.split(/[/\\]/).pop() || ''
  }, [coverPath])

  const handleChooseCover = async () => {
    try {
      const picked = await window.api?.selectImageFile?.()
      if (picked) {
        setCoverPath(picked)
        setCoverPreview(await readImageAsDataUrl(picked))
        setError('')
      }
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  const handleSubmit = async () => {
    if (!track?.path || !onSave) return
    setBusy(true)
    setError('')
    try {
      await onSave({
        path: track.path,
        title,
        artist,
        album,
        albumArtist,
        trackNo,
        year,
        genre,
        coverPath: coverPath || null,
        cover: coverPreview || null
      })
      onClose()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className={`lyrics-drawer-backdrop ${open ? 'lyrics-drawer-backdrop--open' : ''}`}
        onClick={() => {
          if (!busy) onClose()
        }}
        aria-hidden={!open}
      />
      <aside
        className={`lyrics-drawer-panel ${open ? 'lyrics-drawer-panel--open' : ''}`}
        role="dialog"
        aria-label={t('drawer.metadataEditorAria', 'Metadata editor')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lyrics-drawer-header">
          <h2
            className="lyrics-drawer-title"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Tag size={18} />
            {t('drawer.metadataEditorTitle', 'Edit tags')}
          </h2>
          <button
            type="button"
            className="lyrics-drawer-close"
            onClick={onClose}
            aria-label={t('aria.close')}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="lyrics-drawer-body metadata-drawer-body">
          <div className="metadata-drawer-hero glass-panel">
            <div className="metadata-drawer-cover">
              {displayCover ? (
                <img
                  src={displayCover}
                  alt={t('metadataEditor.coverAlt', 'Cover preview')}
                  className="metadata-drawer-cover-image"
                />
              ) : (
                <div className="metadata-drawer-cover-empty">
                  {t('metadataEditor.noCover', 'No cover')}
                </div>
              )}
            </div>
            <div className="metadata-drawer-hero-copy">
              <div className="metadata-drawer-track-name">
                {track?.name || t('metadataEditor.unknownTrack', 'Unknown track')}
              </div>
              <div className="metadata-drawer-track-path">{track?.path || ''}</div>
              <button
                type="button"
                className="export-btn metadata-drawer-cover-btn"
                onClick={handleChooseCover}
                disabled={busy || loading}
              >
                <ImagePlus size={16} />
                {coverPath
                  ? t('metadataEditor.replaceCover', 'Replace cover')
                  : t('metadataEditor.chooseCover', 'Choose cover')}
              </button>
              {selectedCoverName ? (
                <div className="metadata-drawer-cover-note">
                  {t('metadataEditor.pendingCover', 'Pending cover')}: {selectedCoverName}
                </div>
              ) : (
                <div className="metadata-drawer-cover-note">
                  {t(
                    'metadataEditor.coverHint',
                    'Keep empty to preserve the current embedded artwork.'
                  )}
                </div>
              )}
              <button
                type="button"
                className="export-btn secondary metadata-drawer-cover-btn"
                onClick={handleLoadEmbeddedTags}
                disabled={busy || loading || embeddedLoading || networkLoading}
              >
                {embeddedLoading ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <RefreshCcw size={16} />
                )}
                {embeddedLoading
                  ? t('metadataEditor.loadingEmbedded')
                  : t('metadataEditor.loadEmbedded')}
              </button>
              <button
                type="button"
                className="export-btn secondary metadata-drawer-cover-btn"
                onClick={handleLoadNetworkTags}
                disabled={busy || loading || embeddedLoading || networkLoading || !onLoadNetworkTags}
              >
                {networkLoading ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <RefreshCcw size={16} />
                )}
                {networkLoading
                  ? t('metadataEditor.loadingNetwork')
                  : t('metadataEditor.loadNetwork')}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="metadata-drawer-cover-note">
              {t('metadataEditor.loading', 'Loading tags...')}
            </div>
          ) : null}
          {error ? <div className="metadata-drawer-error">{error}</div> : null}
          {notice ? <div className="metadata-drawer-cover-note">{notice}</div> : null}

          <div className="metadata-drawer-grid">
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.title', 'Title')}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.artist', 'Artist')}</span>
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.album', 'Album')}</span>
              <input
                value={album}
                onChange={(event) => setAlbum(event.target.value)}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.albumArtist', 'Album artist')}</span>
              <input
                value={albumArtist}
                onChange={(event) => setAlbumArtist(event.target.value)}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.trackNo', 'Track #')}</span>
              <input
                inputMode="numeric"
                value={trackNo}
                onChange={(event) => setTrackNo(event.target.value.replace(/[^\d]/g, ''))}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field">
              <span>{t('metadataEditor.fields.year', 'Year')}</span>
              <input
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value.replace(/[^\d]/g, ''))}
                disabled={busy || loading}
              />
            </label>
            <label className="metadata-drawer-field" style={{ gridColumn: '1 / -1' }}>
              <span>{t('metadataEditor.fields.genre', 'Genre')}</span>
              <input
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                disabled={busy || loading}
              />
            </label>
          </div>

          <p className="metadata-drawer-footnote">
            {t(
              'metadataEditor.saveHint',
              'Changes are written back to the source audio file and reflected in the library immediately.'
            )}
          </p>

          <div className="metadata-drawer-actions">
            <button
              type="button"
              className="export-btn secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t('metadataEditor.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={handleSubmit}
              disabled={busy || loading}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
              {busy
                ? t('metadataEditor.saving', 'Saving...')
                : t('metadataEditor.save', 'Save tags')}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
