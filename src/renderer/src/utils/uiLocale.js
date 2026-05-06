/** Supported UI locale codes persisted in config */
export const UI_LOCALES = ['en', 'zh', 'zh-TW', 'ja']

export function inferUiLocaleFromNavigator() {
  if (typeof navigator === 'undefined') return 'en'
  const lang = (navigator.language || 'en').toLowerCase()
  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant')) return 'zh-TW'
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('ja')) return 'ja'
  return 'en'
}

export function normalizeUiLocale(value) {
  if (value === 'zh' || value === 'zh-TW' || value === 'ja' || value === 'en') return value
  return 'en'
}

export function bcp47ForUiLocale(ui) {
  if (ui === 'zh') return 'zh-CN'
  if (ui === 'zh-TW') return 'zh-TW'
  if (ui === 'ja') return 'ja'
  return 'en'
}
