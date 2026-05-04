import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SETTINGS_BUNDLE_TYPE,
  buildSettingsExportBundle,
  parseSettingsImportText
} from '../../src/renderer/src/utils/configBundle.js'

test('buildSettingsExportBundle wraps config with metadata', () => {
  const bundle = buildSettingsExportBundle({ uiLocale: 'zh', useEQ: true }, { appVersion: '1.2.3' })

  assert.equal(bundle.type, SETTINGS_BUNDLE_TYPE)
  assert.equal(bundle.appVersion, '1.2.3')
  assert.deepEqual(bundle.config, { uiLocale: 'zh', useEQ: true })
  assert.match(bundle.exportedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('parseSettingsImportText accepts wrapped and raw config JSON', () => {
  assert.deepEqual(
    parseSettingsImportText(
      JSON.stringify({
        type: SETTINGS_BUNDLE_TYPE,
        config: { theme: 'minimal' }
      })
    ),
    { theme: 'minimal' }
  )
  assert.deepEqual(parseSettingsImportText(JSON.stringify({ theme: 'custom' })), {
    theme: 'custom'
  })
})

test('parseSettingsImportText rejects invalid JSON', () => {
  assert.throws(() => parseSettingsImportText('{broken'), /Invalid settings JSON/)
})
