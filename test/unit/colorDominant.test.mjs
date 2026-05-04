import test from 'node:test'
import assert from 'node:assert/strict'

import { pickDominantHexFromImageData } from '../../src/renderer/src/utils/color.js'

function imageDataFromPixels(pixels) {
  const data = []
  for (const [hex, count, alpha = 255] of pixels) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    for (let i = 0; i < count; i += 1) {
      data.push(r, g, b, alpha)
    }
  }
  return new Uint8ClampedArray(data)
}

test('dominant cover color prefers the visible repeated hue over a smaller saturated accent', () => {
  const data = imageDataFromPixels([
    ['#FF78C8', 72],
    ['#2DB96B', 12],
    ['#FFFFFF', 20],
    ['#000000', 8, 0]
  ])

  assert.equal(pickDominantHexFromImageData(data), '#ff78c8')
})

test('dominant cover color falls back to weighted average for neutral artwork', () => {
  const data = imageDataFromPixels([
    ['#EEEEEE', 4],
    ['#DDDDDD', 4],
    ['#111111', 2, 0]
  ])

  assert.equal(pickDominantHexFromImageData(data), '#e6e6e6')
})
