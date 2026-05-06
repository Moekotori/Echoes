import assert from 'node:assert/strict'
import test from 'node:test'

import { matchesSettingsSection } from '../../src/renderer/src/utils/settingsSearch.js'

test('matchesSettingsSection matches partial Chinese setting titles', () => {
  const keywords = ['\u5173\u95ed\u6309\u94ae\u884c\u4e3a']

  assert.equal(matchesSettingsSection('\u884c\u4e3a', keywords), true)
  assert.equal(matchesSettingsSection('\u5173\u95ed\u6309\u94ae', keywords), true)
})

test('matchesSettingsSection ignores punctuation and spacing for English labels', () => {
  const keywords = ['close button behavior']

  assert.equal(matchesSettingsSection('closebutton', keywords), true)
  assert.equal(matchesSettingsSection('button behavior', keywords), true)
})
