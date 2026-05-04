export const LOCAL_LYRICS_PRIORITY_EMBEDDED = 'embedded'
export const LOCAL_LYRICS_PRIORITY_LRC = 'lrc'

export function normalizeLocalLyricsPriority(value) {
  return value === LOCAL_LYRICS_PRIORITY_LRC
    ? LOCAL_LYRICS_PRIORITY_LRC
    : LOCAL_LYRICS_PRIORITY_EMBEDDED
}

export function getLocalLyricsSourceOrder(value) {
  return normalizeLocalLyricsPriority(value) === LOCAL_LYRICS_PRIORITY_LRC
    ? [LOCAL_LYRICS_PRIORITY_LRC, LOCAL_LYRICS_PRIORITY_EMBEDDED]
    : [LOCAL_LYRICS_PRIORITY_EMBEDDED, LOCAL_LYRICS_PRIORITY_LRC]
}
