import assert from 'node:assert/strict'
import test from 'node:test'

import { getUiFontStack, resolveThemeTone } from '../../src/renderer/src/utils/themeColors.js'

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

test('resolveThemeTone uses perceived brightness instead of the red channel alone', () => {
  assert.equal(
    resolveThemeTone({
      glassColor: '#00e6ff',
      bgColor: '#f6fbff',
      bgGradientEnd: '#ecf7ff'
    }),
    'light'
  )
  assert.equal(
    resolveThemeTone({
      glassColor: '#8a0000',
      bgColor: '#fff5f5',
      bgGradientEnd: '#ffe8e8'
    }),
    'dark'
  )
})

test('resolveThemeTone falls back to theme background when glass is neutral white', () => {
  assert.equal(
    resolveThemeTone({
      glassColor: '#ffffff',
      bgColor: '#101722',
      bgGradientEnd: '#172033'
    }),
    'dark'
  )
  assert.equal(
    resolveThemeTone({
      glassColor: '#ffffff',
      bgColor: '#f7fbff',
      bgGradientEnd: '#edf6ff'
    }),
    'light'
  )
})
