import { useTranslation } from 'react-i18next'

const BADGE_META = {
  netease: { label: 'NE', titleKey: 'streaming.providers.netease' },
  qqMusic: { label: 'QQ', titleKey: 'streaming.providers.qqMusic' },
  soundcloud: { label: 'SC', titleKey: 'streaming.providers.soundcloud' }
}

export default function StreamingSourceBadge({ provider, label, title, className = '' }) {
  const { t } = useTranslation()
  const meta = BADGE_META[provider] || {}
  const text = label || meta.label || String(provider || '?').slice(0, 2).toUpperCase()
  const fullTitle = title || (meta.titleKey ? t(meta.titleKey) : '') || provider || t('streaming.sourceFallback', 'Streaming source')
  const cls = ['streaming-source-badge', `streaming-source-badge--${provider || 'unknown'}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={cls} title={fullTitle}>
      {text}
    </span>
  )
}
