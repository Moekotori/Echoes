import React from 'react'
import { useTranslation } from 'react-i18next'
import StreamingSourceBadge from './StreamingSourceBadge'

function isStreamingTrack(track) {
  return (
    track?.remoteType === 'streaming' ||
    track?.info?.remoteType === 'streaming' ||
    /^streaming:\/\//i.test(String(track?.path || ''))
  )
}

export default function StreamingPlaybackTags({ track, variant = 'mini' }) {
  const { t } = useTranslation()
  if (!isStreamingTrack(track)) return null
  const provider = track?.streamingProvider || track?.info?.streamingProvider || track?.provider || ''
  const providerLabel =
    track?.providerLabel ||
    track?.info?.source ||
    track?.info?.providerLabel ||
    provider ||
    'Streaming'

  return (
    <>
      <span className={`streaming-playback-tag streaming-playback-tag--${variant}`}>
        {t('listMode.streaming', 'Streaming')}
      </span>
      <span
        className={`streaming-playback-source streaming-playback-source--${variant}`}
        title={providerLabel}
      >
        <StreamingSourceBadge provider={provider} className="streaming-source-badge--inline" />
        <span>{providerLabel}</span>
      </span>
    </>
  )
}
