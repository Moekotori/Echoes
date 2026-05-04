export const SETTINGS_BUNDLE_TYPE = 'echo-settings'
export const SETTINGS_BUNDLE_VERSION = 1

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

export function buildSettingsExportBundle(config, meta = {}) {
  return {
    type: SETTINGS_BUNDLE_TYPE,
    version: SETTINGS_BUNDLE_VERSION,
    appVersion: meta.appVersion || '',
    exportedAt: new Date().toISOString(),
    config: clonePlain(config)
  }
}

export function parseSettingsImportText(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    throw new Error('Invalid settings JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid settings file.')
  }

  if (parsed.type === SETTINGS_BUNDLE_TYPE) {
    if (!parsed.config || typeof parsed.config !== 'object' || Array.isArray(parsed.config)) {
      throw new Error('Settings file does not contain a config object.')
    }
    return parsed.config
  }

  if (parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config)) {
    return parsed.config
  }

  return parsed
}
