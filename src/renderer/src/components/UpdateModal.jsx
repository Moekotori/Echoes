import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, CheckCircle, Package } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'

export default function UpdateModal({
  updateStatus,
  onClose,
  open
}) {
  const { t } = useTranslation()
  const [releaseNotesRaw, setReleaseNotesRaw] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Automatically fetch release notes specifically linked to this version or general latest
  useEffect(() => {
    if (open && updateStatus?.version && !releaseNotesRaw) {
      setIsLoading(true)
      fetch(`https://api.github.com/repos/Moekotori/Echoes/releases/tags/v${updateStatus.version}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.body) {
            setReleaseNotesRaw(data.body)
          } else {
            setReleaseNotesRaw(t('updateModal.noNotesFound'))
          }
        })
        .catch(() => {
          setReleaseNotesRaw(t('updateModal.fetchFailed'))
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [open, updateStatus?.version, releaseNotesRaw, t])

  if (!open || !updateStatus) return null

  const isDownloaded = updateStatus.event === 'update-downloaded'
  const isDownloading = updateStatus.event === 'download-progress'
  const isAvailable = updateStatus.event === 'update-available'
  const percent = updateStatus.percent || 0
  const version = updateStatus.version || '?'

  const handleInstall = () => {
    window.api?.installUpdate?.()
  }

  const renderContent = () => {
    const defaultText = isDownloaded ? t('updateModal.readyToInstall') : t('updateModal.discovering')

    return (
      <div className="update-modal-body">
        {isLoading ? (
          <div className="update-modal-loader">
            <RefreshCw className="spin" size={18} /> {t('updateModal.loadingNotes')}
          </div>
        ) : (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(marked(releaseNotesRaw || defaultText))
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-container">
        <div className="update-modal-header">
          <div className="update-modal-title">
            <Package size={20} strokeWidth={2} />
            <span>{t('updateModal.title')} v{version}</span>
          </div>
          {isDownloaded && (
            <button className="update-modal-close" onClick={onClose} title={t('aria.close')}>
              <X size={20} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {renderContent()}

        <div className="update-modal-footer">
          {isDownloading || isAvailable ? (
            <div className="update-modal-progress-wrapper">
              <div className="update-modal-progress-label">
                <Download size={14} /> 
                {isDownloading
                  ? `${t('updateModal.downloading')}... ${percent}%`
                  : t('updateModal.startingDownload')}
              </div>
              <div className="update-modal-progress-bar">
                <div 
                  className="update-modal-progress-fill" 
                  style={{ width: `${Math.max(percent, 2)}%` }} 
                />
              </div>
            </div>
          ) : isDownloaded ? (
            <div className="update-modal-actions">
              <button className="update-modal-btn-secondary" onClick={onClose}>
                {t('updateModal.installLater')}
              </button>
              <button className="update-modal-btn-primary" onClick={handleInstall}>
                <CheckCircle size={16} />
                {t('updateModal.installNow')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
