import assert from 'node:assert/strict'
import test from 'node:test'

import { getUiFontStack } from '../../src/renderer/src/utils/themeColors.js'

test('getUiFontStack inserts selected CJK fallback after the primary UI font', () => {
  const stack = getUiFontStack({ uiFontFamily: 'outfit', uiCjkFontFamily: 'yahei' })

  assert.match(stack, /^"Outfit"/)
  assert.match(stack, /"Microsoft YaHei"/)
  assert.match(stack, /sans-serif$/)
})

test('getUiFontStack keeps custom font primary while adding CJK fallback', () => {
  const stack = getUiFontStack({
    uiFontFamily: 'custom',
    uiCustomFontPath: 'D:/fonts/LatinOnly.ttf',
    uiCjkFontFamily: 'simsun'
  })

  assert.match(stack, /^"EchoesUserUiFont"/)
  assert.match(stack, /"SimSun"/)
})

test('getUiFontStack uses a custom CJK font as the first CJK fallback', () => {
  const stack = getUiFontStack({
    uiFontFamily: 'outfit',
    uiCjkFontFamily: 'custom',
    uiCjkCustomFontPath: 'D:/fonts/MyChineseFont.otf'
  })

  assert.match(stack, /^"Outfit"/)
  assert.match(stack, /"EchoesUserCjkFont"/)
  assert.match(stack, /"PingFang SC"/)
  assert.ok(stack.indexOf('"EchoesUserCjkFont"') < stack.indexOf('"PingFang SC"'))
})
