import test from 'node:test'
import assert from 'node:assert/strict'

import { repairPossiblyMojibakeSearchQuery } from '../../src/main/utils/mojibakeRepair.js'

const cp = (...points) => String.fromCodePoint(...points)

test('repairs Japanese UTF-8 text that was decoded as CP936 before MV search', () => {
  const mojibakeTitle = cp(
    0x9288,
    0x6c47,
    0x5142,
    0x9289,
    0x20ac,
    0x9289,
    0x70bd,
    0x5135,
    0x9288,
    0x3083,
    0x5120
  )
  const title = cp(0x30bb, 0x30f3, 0x30c0, 0x30f3, 0x30e9, 0x30a4, 0x30d5)

  assert.equal(repairPossiblyMojibakeSearchQuery(mojibakeTitle), title)
  assert.equal(repairPossiblyMojibakeSearchQuery(`${mojibakeTitle} unknown artist`), `${title} unknown artist`)
})

test('cleans partial replacement characters from repaired artist text', () => {
  const mojibakeArtist = cp(0x947a, 0x535e, 0x7567, 0x9288, 0x55d0, 0x4f29, 0x9288, 0xfffd)
  const artistPrefix = cp(0x82b1, 0x5b88, 0x3086, 0x307f)

  assert.equal(repairPossiblyMojibakeSearchQuery(mojibakeArtist), artistPrefix)
})

test('keeps normal search text unchanged', () => {
  const normal = `${cp(0x82b1, 0x5b88, 0x3086, 0x307f, 0x308a)} Dream Poppin'Party`

  assert.equal(repairPossiblyMojibakeSearchQuery(normal), normal)
})
