const SELECTABLE_TEXT_SELECTOR = [
  '.main-player.lyrics-mode .lyrics-meta h2',
  '.main-player.lyrics-mode .lyrics-meta p',
  '.main-player.lyrics-mode .lyrics-meta .artist-link-lyrics'
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
