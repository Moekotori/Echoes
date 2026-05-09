const SELECTABLE_TEXT_SELECTOR = [
  '.track-name',
  '.track-subtitle',
  '.artist-link',
  '.album-title',
  '.album-subtitle-artist',
  '.artist-card-title',
  '.bottom-bar-title',
  '.bottom-bar-artist',
  '.track-info h1',
  '.artist-text',
  '.history-sidebar-item-title',
  '.history-sidebar-item-subtitle',
  '.streaming-result-main strong',
  '.streaming-result-main span',
  '.metadata-drawer-track-name'
].join(', ')

export function getSelectedText() {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return ''
  return String(window.getSelection() || '').trim()
}

export function hasSelectedText() {
  return getSelectedText().length > 0
}

export function isSelectableTextTarget(target) {
  return Boolean(target?.closest?.(SELECTABLE_TEXT_SELECTOR))
}
