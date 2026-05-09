function normalizeSettingsSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function createSearchCandidates(value) {
  const text = normalizeSettingsSearchText(value)
  if (!text) return []
  const compact = text.replace(/[\s._:/\\|()[\]{}'"`~!@#$%^&*+=,;，。！？、：；（）【】《》「」『』-]+/g, '')
  return compact && compact !== text ? [text, compact] : [text]
}

export function matchesSettingsSection(query, keywords) {
  const queryCandidates = createSearchCandidates(query)
  if (!queryCandidates.length) return true
  const keywordCandidates = (keywords || []).flatMap(createSearchCandidates)
  return queryCandidates.some((queryText) =>
    keywordCandidates.some((keywordText) => {
      return keywordText.includes(queryText) || queryText.includes(keywordText)
    })
  )
}
