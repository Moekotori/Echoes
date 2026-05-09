import { getBestEffortMvSearchHit } from './mvAutoAccept.js'

export function getMvSearchItems(result, source = 'bilibili') {
  if (Array.isArray(result?.items)) {
    return result.items.filter((item) => item?.id && item?.source)
  }
  const hit = getBestEffortMvSearchHit(result, source)
  return hit?.result && typeof hit.result === 'object' ? [hit.result] : []
}

export function orderMvSearchItems(result, source = 'bilibili') {
  const items = getMvSearchItems(result, source)
  const bestEffort = getBestEffortMvSearchHit(result, source)
  if (!bestEffort?.id || items.some((item) => item.id === bestEffort.id)) return items
  return [bestEffort.result, ...items].filter((item) => item?.id)
}
