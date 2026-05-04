export function getActiveLyricIndex(lyrics, positionSec, offsetMs = 0) {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return -1

  const position = Number(positionSec)
  if (!Number.isFinite(position)) return -1

  const offsetSec = Number.isFinite(Number(offsetMs)) ? Number(offsetMs) / 1000 : 0
  let activeIndex = -1

  for (let i = 0; i < lyrics.length; i += 1) {
    const lineTime = Number(lyrics[i]?.time)
    if (!Number.isFinite(lineTime)) continue

    if (position + 1e-9 >= lineTime + offsetSec) {
      activeIndex = i
      continue
    }
    break
  }

  return activeIndex
}
